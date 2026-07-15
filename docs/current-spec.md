# Current Spec

EIP-8130, "Account Abstraction by Account Configuration," is a Core, Standards Track proposal by Chris Hunter (@chunter-cb, Coinbase/Base), draft-created 2025-10-14, with 40 merged PRs against the spec file as of 2026-07-15. It requires only EIP-170 (max code size) and EIP-2718 (typed transactions) in its frontmatter, though it depends heavily on EIP-7702's delegation-indicator mechanism (`0xef0100`) in body text without listing 7702 in `requires`.

The problem it solves in one sentence: authentication is separated from account logic, so a node can decide whether to accept a transaction by checking the *identity* of the authenticator contract a transaction declares against a small canonical allowlist, instead of executing arbitrary wallet bytecode to figure out whether the transaction is valid.

Spec source: [github.com/ethereum/EIPs/blob/master/EIPS/eip-8130.md](https://github.com/ethereum/EIPs/blob/master/EIPS/eip-8130.md). Discussion: [ethereum-magicians.org/t/eip-8130-account-abstraction-by-account-configurations/25952](https://ethereum-magicians.org/t/eip-8130-account-abstraction-by-account-configurations/25952).

---

## Account Configuration Contract, actorId, and scope

A system contract at `ACCOUNT_CONFIG_ADDRESS` (a CREATE2-derived address, not a fixed hex value) is the single point of actor authorization, account creation, and change sequencing for every account. It delegates signature verification to authenticator contracts and stores one `actor_config` slot per registered actor.

An **actor** is any authority-holder on an account: a full owner, a session key, a payer-only key. Actors are identified by `actorId`, a 32-byte identifier the authenticator derives from public key material (not necessarily an address).

### `actor_config` slot layout

| Bytes | Field | Description |
|---|---|---|
| 0-19 | `authenticator` | Authenticator contract address |
| 20 | `scope` | Permission bitmask; `0x00` = unrestricted (admin) |
| 21-26 | `expiry` | `uint48` Unix seconds; actor invalid once `block.timestamp > expiry`. `0` = no expiry |
| 27-31 | reserved | MUST be zero on write; a nonzero value is an implicit version discriminator so new-format configs fail closed on legacy deployments rather than silently dropping restrictions |

When `scope & POLICY != 0`, two more slots exist: `policy_commitment(account, actorId)` and `policy_manager(account, actorId)`, written verbatim from `policyData` at authorization time and read only during call execution, not during mempool validation.

Actors are revoked by deleting their `actor_config` slot, with one exception: the self-actor.

### Self-actor (`actorId == bytes32(bytes20(account))`)

Every account has an implicit self-actor slot with two mutually exclusive forms (registering one clears the other):

1. **Inline secp256k1 self**, held in the packed account-state slot (`default_eoa_scope`/`default_eoa_expiry` plus the `DEFAULT_EOA_REVOKED` flag), resolved in a single SLOAD. Authenticated via native ecrecover only. Moved inline in PR #11816 (Jun 18) specifically so the account's own key resolves without a second SLOAD.
2. **Non-secp256k1 self authenticator**, held in the ordinary `actor_config(self)` slot. Registering one sets `DEFAULT_EOA_REVOKED`, disabling the inline k1 path.

A fresh account's inline config is all-zero (`scope == 0x00`, `expiry == 0`), which is what lets any EOA send AA transactions with zero prior registration. `createAccount` and `importAccount` both set `DEFAULT_EOA_REVOKED` by default, which the spec calls a "quantum-safe default" (added by PR #11815, Jun 18, "fold default-EOA revocation into a state flag"): a newly created or imported account does not leave a live secp256k1 owner unless one is explicitly listed in `initial_actors`. That same PR also replaced an earlier `REVOKED_AUTHENTICATOR` sentinel-address trick with the `DEFAULT_EOA_REVOKED` flag bit, and renamed `ECRECOVER_AUTHENTICATOR` to `K1_AUTHENTICATOR`.

### Scope byte, bit by bit

The scope byte is a bitmask of **grants**; `0x00` (no bits set) is the admin predicate, not a bit itself. This redefinition, and the full grant set below, landed in PR #11918 (Jul 13), the largest structural rewrite since the original submission (+277/-153).

| Bit | Value | Name | Grants |
|---|---|---|---|
| 0 | `0x01` | `SENDER` | Ungated initiation as `sender_auth`; may call any `call.to`. Also satisfies operational authority for ERC-1271 signing unless combined with `POLICY` |
| 1 | `0x02` | `POLICY` | Gated initiation as `sender_auth`; may only originate calls to the actor's `policy_manager` |
| 2 | `0x04` | `NONCE` | Permits a restricted actor to use non-nonceless `nonce_key`s |
| 3 | `0x08` | `SELF_PAYER` | Self-pay gas when `payer == sender` |
| 4 | `0x10` | `SPONSOR_PAYER` | Act as `payer_auth` for a different sender (`payer != sender`) |
| 5-7 | | (spare) | Reserved for future pure grants |

Admin (`scope == 0x00`) is required for every config-change authorization (`authorizeActor`, `revokeActor`, `applySignedActorChanges`, delegation). The spec's own rationale for defining admin as an absence of restriction rather than a dedicated bit: a "config-only" grant bit would be indistinguishable from full access, since any key that can rewrite `actor_config` can grant itself `scope == 0x00` anyway, so naming admin as scope-zero makes self-escalation explicit instead of hiding it.

`SENDER` and `POLICY` compose (whenever `POLICY` is set, the call is gated regardless of `SENDER`, so setting both conveys no extra authority). `POLICY | SPONSOR_PAYER` composes meaningfully: initiation is gated to `manager`, but sponsor authority is not gated by the policy target.

**Operational authority**, the predicate governing ERC-1271 signing, is `operational := admin || (SENDER && !POLICY)`. There is no standalone signing bit; PR #11918 removed the earlier `SIGNER` bit entirely on the reasoning that "an operational key can already call approve/transfer directly, so letting it produce a Permit or order signature grants nothing it did not already have." A `POLICY` actor is never operational and must not sign raw hashes.

**Actor nonce scope**: admin actors may use any `nonce_key` freely; a restricted actor without `NONCE` may only use `NONCE_KEY_MAX` (nonceless); a restricted actor with `NONCE` gets the full 2D key space. Nonceless is therefore the default for every restricted actor.

**Actor expiry**: an actor is live at inclusion time iff `expiry == 0 || now <= expiry`, checking only the acting key's own expiry, never authorizer lineage. The spec's wallet guidance is to place `expiry` only on non-admin actors, since an expiring sole admin bricks the account.

**Actor policies (`POLICY` mechanics)**: gates a key to a single `manager` contract that enforces app-defined limits (e.g. a spend-capped session key). `policyData` at authorization must be exactly `manager (20 bytes) || commitment (32 bytes)`; the manager reads the commitment via `getPolicy`, validates presented parameters, and enforces what the call may do. This feature landed in PR #11766 (Jun 4), a rebased replacement for the closed draft PR #11648, and was substantially reworked (an Authorize/Install/Use/Retire reference flow, a concrete session-key example) in PR #11847 (Jul 2) without a normative behavior change.

---

## Authenticator Interface

```solidity
interface IAuthenticator {
    function authenticate(
        bytes32 hash,
        bytes calldata data
    ) external view returns (bytes32 actorId);
}
```

Authenticators are called via **STATICCALL**. An authenticator address must not itself be a delegated account (code starting with the `0xef0100` delegation indicator is rejected). Gas pricing for authenticator execution is a chain's choice: ordinary metered EVM execution, or a fixed standard gas cost per enshrined canonical authenticator provided it produces identical results.

This interface and its rename history: `IAuthVerifier` (original) → `IVerifier` (PR #11388, Mar 9) → `IAuthenticator` (PR #11785, Jun 9, "rename verifier to authenticator"). The spec frames the final name as disambiguating two separate steps: the authenticator *authenticates* an actor (resolves an `actorId`), while scope and policy then *authorize* what that actor may do.

### `K1_AUTHENTICATOR` special case

`K1_AUTHENTICATOR = address(1)` is a protocol-reserved sentinel for native secp256k1 authentication. When it appears as the authenticator in an auth blob, the protocol performs **ecrecover directly** instead of a STATICCALL. `data` is interpreted as raw `(r || s || v)`, and the returned `actorId = bytes32(bytes20(recovered_address))`. The same identity underlies both the implicit default EOA and any explicitly registered k1 actor; only the `actor_config` slot content distinguishes a full-owner EOA from a scoped k1 key. `address(0)` is never a valid authenticator selector; it is the empty-slot sentinel.

### Canonical vs. non-canonical authenticators

Any contract implementing `IAuthenticator` can be permissionlessly deployed and registered as an actor's authenticator, but registration alone does not make it usable for direct transaction authentication on the network. Only **canonical authenticators in the node allowlist** are accepted for authenticating `sender_auth`/`payer_auth` at the network level. Non-canonical authenticators remain usable inside ordinary EVM execution (for example, a config change authorized by an arbitrary `IAuthenticator` for wallet-defined recovery), but such actors cannot authenticate transactions over the direct path. This allowlist concept was introduced in PR #11647 (May 11, "Add canonical verifier set") and tightened in PR #11651 (May 12).

### Canonical Authenticator Set (initial)

| Name | Algorithm | Authenticator | `actorId` derivation |
|---|---|---|---|
| k1 | secp256k1 | `K1_AUTHENTICATOR` (native sentinel) | `bytes32(bytes20(recovered_address))` |
| p256 | P-256 | Onchain contract | `keccak256(x \|\| y)` |
| passkey | WebAuthn / FIDO2 | Onchain contract | `keccak256(x \|\| y)` |
| delegate | Signature delegation | `DELEGATE_AUTHENTICATOR` | `bytes32(bytes20(delegated_address))` |

The canonical set and its contract addresses are maintained in a companion ERC (number not yet assigned), deployed at deterministic CREATE2 addresses across chains, and expected to grow (for example, post-quantum schemes) through the companion ERC process rather than a hard fork. Nodes must include every canonical authenticator in their allowlist and should not extend it with non-canonical ones. The original submission (PR #11186) shipped a five-entry set (K1, P256, WebAuthn P256, BLS, DELEGATE); BLS is not present in the current canonical set table.

### Delegate authenticator

Account **A** registers an actor with `authenticator = DELEGATE_AUTHENTICATOR`, `actorId = bytes32(bytes20(B))`. The wire format for auth data is `delegated_account (20 bytes) || nested_auth`, where `nested_auth` is an ordinary `authenticator || data` blob authenticating against **B**. Any key that authenticates as B can then authenticate as A, bounded by whatever scope A granted the delegate actor. Three constraints apply: no nesting (the nested authenticator must not itself be the delegate authenticator), the nested authenticator must be canonical, and the nested actor resolved on B must be admin (`scope == 0x00`): B's signature is vouching, and vouching authority is the admin predicate. A cross-account replay hole in this mechanism, where the payer signature hash did not bind the `payer` field, was fixed in PR #11808 (Jun 16, "bind payer field into payer signature hash").

---

## Transaction Format

### `AA_TX_TYPE = 0x79`

```
AA_TX_TYPE || rlp([
  chain_id,
  sender,             // 20 bytes, or empty for an EOA signature
  nonce_key,          // uint256: nonce channel selector
  nonce_sequence,     // uint64: expected sequence number
  expiry,             // Unix timestamp (seconds); 0 = no expiry
  max_priority_fee_per_gas,
  max_fee_per_gas,
  gas_limit,
  account_changes,    // create / config-change / delegation entries, or empty
  calls,              // [[call, ...], ...] phases, or empty
  metadata,           // opaque attribution/annotation bytes, or empty
  payer,              // empty = sender-paid, or a 20-byte payer address
  sender_auth,        // raw ECDSA r||s||v, or authenticator || data
  payer_auth          // empty = self-pay, or authenticator || data
])

call = rlp([to, data])
```

`AA_TX_TYPE` was a `TBD` placeholder from the original submission until PR #11757 (Jun 2) assigned `0x7B`; it was renumbered to its current `0x79` by PR #11903 (Jul 8), which also added the `eth_call`/`eth_estimateGas` RPC extension covered below.

### Field reference

| Field | Description |
|---|---|
| `chain_id` | Chain ID per EIP-155 |
| `sender` | Sending account address. Required for configured-actor signatures; empty for EOA signatures, in which case the sender is recovered via ecrecover. Presence or absence is the sole distinguisher between the two signature paths |
| `nonce_key` | `uint256` nonce channel selector: `0` standard sequential, `1..NONCE_KEY_MAX-1` parallel channels, `NONCE_KEY_MAX` nonce-free |
| `nonce_sequence` | `uint64` expected sequence within `nonce_key`. Incremented after inclusion regardless of execution outcome. Must be `0` when `nonce_key == NONCE_KEY_MAX` |
| `expiry` | `uint64` Unix timestamp; transaction invalid once `block.timestamp > expiry`. `0` = no expiry, but must be non-zero when `nonce_key == NONCE_KEY_MAX` |
| `max_priority_fee_per_gas` / `max_fee_per_gas` | EIP-1559 fee fields |
| `gas_limit` | Budget for sender-intrinsic gas plus call execution. Payer authentication is metered separately and does not draw from `gas_limit` |
| `account_changes` | Empty, or typed entries: create (`0x00`), config change (`0x01`), delegation (`0x02`) |
| `calls` | Empty, or an ordered array of call phases |
| `metadata` | Empty, or opaque attribution/annotation bytes |
| `payer` | Empty = sender pays; 20-byte address = a specific payer is required |
| `sender_auth` | Raw ECDSA (EOA path) or `authenticator \|\| data` (configured-actor path) |
| `payer_auth` | Empty = self-pay; otherwise `authenticator \|\| data`, same shape as `sender_auth` |

### `AA_PAYER_TYPE = 0x7A` is not a transaction type

`AA_PAYER_TYPE` is a magic byte used only inside the payer's signature-hash preimage, for domain separation from the sender's signature. EIP-8130 has exactly one EIP-2718 transaction envelope (`AA_TX_TYPE`); sender and payer roles are distinguished by which magic byte prefixes their respective signed digest, not by two different envelopes. `AA_PAYER_TYPE` moved `0x7C` → `0x7A` in the same PR #11903 renumbering.

The field-name arc behind this format: the sender field was `from` until PR #11526 (May 11, "move from to sender") renamed it to disambiguate from the EVM/RPC notion of `from`. The entities themselves were "keys" (original submission) → "owners" (PR #11380, Mar 6) → "actors" (PR #11764, Jun 4, "rename owners to actors"), on the stated rationale that many of these entities are scoped credentials (payer-only, session-style keys) for which "owner" overstated their authority.

---

## Nonce System

A precompile at `NONCE_MANAGER_ADDRESS` (`0x813000000000000000000000000000000000aa01`) holds nonce state; the protocol reads and increments slots directly during AA transaction processing, and exposes a read-only `getNonce(address account, uint256 nonceKey) external view returns (uint64)` to the EVM.

| `nonce_key` range | Name | Behavior |
|---|---|---|
| `0` | Standard | Sequential ordering, mempool default |
| `1` to `NONCE_KEY_MAX - 1` | User-defined | Parallel, independently-ordered channels |
| `NONCE_KEY_MAX` (`2^256 - 1`) | Nonce-free | No nonce state read or incremented |

The 2D `nonce_key`/`nonce_sequence` scheme predates the current spec (it was present in the original submission); PR #11478 (Apr 2, "nonce and EOA delegation changes") added the nonce-free `NONCE_KEY_MAX` sentinel and briefly packed the two fields into one `uint256`, later un-packed back into the two separate RLP fields shown above with `nonce_key` widened to `uint256`.

### Nonce-free mode and `replay_id`

When `nonce_key == NONCE_KEY_MAX`, the protocol does not touch the nonce counter; `nonce_sequence` must be `0`, and replay protection instead relies on `expiry` (which must be non-zero) plus deduplication of a `replay_id` in a fixed-capacity circular buffer, which is **consensus state**, not per-node bookkeeping:

```
REPLAY_ID_TYPE = 0x7901

replay_id = keccak256(REPLAY_ID_TYPE || rlp([
  chain_id, resolved_sender, expiry,
  account_changes, calls, metadata,
  payer
]))
```

`resolved_sender` is the ecrecover result on the EOA path or the `sender` field directly on the configured-actor path, binding identity per sender since two EOAs could otherwise sign identical bodies. `replay_id` deliberately excludes fee fields (a fee bump does not change the logical transaction) and both auth blobs (`sender_auth`/`payer_auth` are non-deterministic and re-signable without changing the logical transaction), but it does include `payer`, since retargeting to a different payer is a different logical transaction.

Buffer capacity (`REPLAY_BUFFER_CAPACITY`) and the accepted expiry window (`NONCE_FREE_EXPIRY_WINDOW`) are protocol constants or explicit chain parameters, identical across nodes; capacity must be at least peak accepted nonce-free throughput times the expiry window. Because ring entries are ephemeral and the buffer is fixed-size, nonce-free mode adds no permanent state growth.

Standard/2D transactions never use `replay_id`; they are deduplicated and replaced purely by `(sender, nonce_key, nonce_sequence)`. The `replay_id` mechanism itself was defined in PR #11752 (Jun 2, "define signature-invariant nonce-free replay identifier"). The full transaction hash must never be used for nonce-free dedup or replacement, since it commits to fee fields and auth blobs that `replay_id` intentionally excludes.

### Mempool replacement

Both nonce modes require a replacement to raise `max_priority_fee_per_gas` by at least the node's configured minimum bump, and to be independently fully valid, including a fresh `payer_auth` when sponsored (since `payer_auth` commits to fee fields). Standard/2D replacement candidates share `(sender, nonce_key, nonce_sequence)`; nonce-free candidates share `(sender, replay_id)`, and a block builder must not include two transactions with the same `(sender, replay_id)` in one block. Changing `payer` produces a new `replay_id` and therefore a new logical transaction rather than a replacement.

---

## Account Lock

Lock state is packed into the same 32-byte account-state slot that holds the change-sequence counters and the inline self-actor fields, so reading it costs no extra SLOAD beyond what account-state access already requires.

| Field | Description |
|---|---|
| `multichain_sequence` | Change-sequence counter for `chain_id 0` (`uint64`) |
| `local_sequence` | Change-sequence counter for the local chain (`uint64`); `> 0` doubles as an initialized flag |
| `flags` | Bit 0 `DEFAULT_EOA_REVOKED`; bit 1 `LOCKED`; bit 2 `UNLOCK_INITIATED` (selects `lock_union` interpretation) |
| `lock_union` | `uint40` union: `unlock_delay` (seconds, `uint16` range) when `UNLOCK_INITIATED` is clear, or `unlocks_at` (timestamp) when set |
| `default_eoa_scope` / `default_eoa_expiry` | Inline self-actor fields (see Self-actor above) |

When `LOCKED`, all actor-config changes and delegations are rejected on both the `account_changes` path and `applySignedActorChanges()`. The only permitted operation while locked is unlock.

```solidity
LOCK_CHANGE_TYPEHASH = keccak256(
  "SignedLockChange(address account,uint256 chainId,uint8 op,"
  "uint16 unlockDelay,uint64 sequence)")
// op: 1 = lock, 2 = unlock

function applySignedLockChanges(address account, uint8 op, uint16 unlockDelay, bytes calldata auth) external;
```

`applySignedLockChanges` is a dedicated, EVM-only admin-authorized entry point (not an `account_changes` entry type), operating on the local account channel: the digest binds `chainId = block.chainid` and the current `local_sequence`, incrementing it on success. `auth` must resolve to an admin actor (`scope == 0x00`). Anyone may relay the call; authorization comes from the signature.

**Lifecycle**: lock (`op=1`) only from an unlocked state, setting `LOCKED` and storing `unlock_delay`; unlock (`op=2`) only from `LOCKED` with no pending unlock, `unlockDelay` must be `0`, setting `UNLOCK_INITIATED` and `unlocks_at = block.timestamp + unlock_delay`; once `block.timestamp >= unlocks_at`, the account is effectively unlocked and config changes resume. `unlock_delay` is bounded to the `uint16` range (about 18.2 hours max) to limit self-bricking risk. PR #11918 (Jul 13) simplified this to a strict lock-then-unlock cycle with no re-lock or cancel-while-locked path.

The reason the mechanism exists: nodes may grant higher pending-transaction rate limits to accounts whose actor set is provably frozen for a minimum window (for example, `LOCKED`, no pending unlock, and `unlock_delay` above a node's threshold such as six hours), since a locked account's primary source of invalidation risk becomes nonce consumption rather than a config change. A locked payer whose bytecode is recognized to restrict ETH movement while locked lets a node extend the same higher tier to sponsor services.

---

## Account Creation and Import

Three account paths exist:

| Account type | Mechanism |
|---|---|
| EOA | Sends AA transactions with an existing secp256k1 key via native ecrecover; a code-less account auto-delegates to `DEFAULT_ACCOUNT_ADDRESS` |
| Existing smart contract | Already-deployed accounts (for example ERC-4337 wallets) register actors via `importAccount()` |
| New account, no prior EOA | Created via a `create` entry in `account_changes`, CREATE2-derived address, `calls` in the same transaction handle initialization |

### Create entry (`account_changes` type `0x00`)

```
rlp([
  0x00,               // type: create
  user_salt,          // bytes32
  code,                // runtime bytecode placed directly at the account address
  initial_actors       // [actorId, authenticator, scope, policyData] tuples, sorted ascending by actorId
])
```

`code` is placed directly at the account address; it is not executed during deployment (initialization runs via `calls` afterward). `initial_actors` cannot express `expiry`, and cannot self-reference `manager = account` (the address is not yet known at commitment time); both are addable via an accompanying config-change entry in the same `account_changes` array. `initial_actors` must already be sorted by `actorId` strictly ascending, which also rejects duplicates.

Address derivation:

```
actors_commitment = keccak256(actorId_0 || authenticator_0 || scope_0 || policyData_0 || ... )
effective_salt    = keccak256(user_salt || actors_commitment)
deployment_code   = DEPLOYMENT_HEADER(len(code)) || code
address           = keccak256(0xff || ACCOUNT_CONFIG_ADDRESS || effective_salt || keccak256(deployment_code))[12:]
```

`DEPLOYMENT_HEADER(n)` is a fixed 14-byte EVM loader that copies `code` into memory and returns it, used so the same `deployment_code` bytes can serve as CREATE2 `init_code` on non-8130 chains while an 8130 chain places `code` directly. Validation requires that the sender address matches this derivation, that `code_size(sender) == 0 && nonce(sender) == 0` (CREATE2 freshness), and that `code` is non-empty and no larger than `MAX_CODE_SIZE` (24576 bytes, via EIP-170). The EIP-170 size guard and the exact freshness check were added by community PR #11609 (Jun 2), after review converged with chunter-cb on matching CREATE2 semantics precisely rather than an additional `owner_config`-emptiness check.

### Import (`importAccount`)

```solidity
function importAccount(address account, uint256 chainId, InitialActor[] calldata initialActors, bytes calldata signature) external;

struct InitialActor {
    bytes32 actorId;
    address authenticator;
    uint8 scope;
    bytes policyData;
}
```

`InitialActor` has no `expiry` field, so imported actors are always non-expiring (addable later via a config change). `chainId == 0` makes the import signature valid on any chain; otherwise it must equal `block.chainid`. Import is rejected if the account already has any 8130 state, meaning either change-sequence channel is non-zero; a locked account is always caught here, since a lock is itself a signed local config change that has already advanced `local_sequence`.

`signature` is validated against the account via ERC-1271's `isValidSignature(digest, signature)`, over a typed struct hash that deliberately omits the EIP-712 domain separator (to avoid phishing via standard wallet signing flows):

```
ACTORCONFIG_TYPEHASH = keccak256("ActorConfig(address authenticator,uint8 scope,uint48 expiry)")
ACTOR_TYPEHASH = keccak256("Actor(bytes32 actorId,ActorConfig config,bytes policyData)ActorConfig(address authenticator,uint8 scope,uint48 expiry)")
ACTOR_INITIALIZATION_TYPEHASH = keccak256("ActorInitialization(bytes32 salt,uint256 chainId,Actor[] initialActors)Actor(bytes32 actorId,ActorConfig config,bytes policyData)ActorConfig(address authenticator,uint8 scope,uint48 expiry)")
```

Implementations must hash `expiry = 0` for every actor at import time and must not accept an actor-supplied expiry. On success, `importAccount` sets `DEFAULT_EOA_REVOKED`, the same quantum-safe default `createAccount` applies; an owner who wants to keep the implicit EOA key includes a self-actorId entry with `K1_AUTHENTICATOR` in `initialActors`.

A currently open PR, **#11919** (opened Jul 13 by chunter-cb, same day PR #11918 merged), proposes adding an optional `uint48 expiry` to each initial actor at both `createAccount` and `importAccount` time, committed into the per-actor derivation preimage so a front-runner cannot alter it. In the merged spec, expiry remains inexpressible at create or import time.

---

## Gas Sponsorship

| `payer` | `payer_auth` | Payer address | Validation |
|---|---|---|---|
| empty | empty | `sender` | Self-pay: resolved sender actor must hold `SELF_PAYER` |
| `sender`'s own address | `authenticator \|\| data` | `sender` | Self-pay via a dedicated gas key: the `payer_auth`-resolved actor must hold `SELF_PAYER`, letting a `SELF_PAYER`-only key fund another key's transactions on the same account |
| a different address | `authenticator \|\| data` | the `payer` field | Sponsored: reads the payer's `actor_config`, must hold `SPONSOR_PAYER` |

`SELF_PAYER` and `SPONSOR_PAYER` replaced a single `PAYER` bit in PR #11918, defined relationally (whether `payer account == sender account`) rather than as an absolute mode, so a dedicated gas key can fund a sibling key on the same account while a paymaster hot key can be sponsor-only over a locked treasury.

### Signature domain separation

Sender and payer sign the same field list, distinguished only by the leading magic byte:

```
keccak256(AA_TX_TYPE || rlp([chain_id, sender, nonce_key, nonce_sequence, expiry,
  max_priority_fee_per_gas, max_fee_per_gas, gas_limit,
  account_changes, calls, metadata, payer]))          // sender hash

keccak256(AA_PAYER_TYPE || rlp([... same fields ...])) // payer hash
```

In the payer hash, the EOA path's `sender` field must be substituted with the resolved (recovered) address rather than encoded empty, preventing two different EOAs producing otherwise-identical bodies from reusing one payer signature. `payer` is included in the payer hash too, binding the payer's signature to the specific account being charged; without it, a payer authorization could be redirected to a different account via the delegate authenticator (the bug fixed in PR #11808). This cross-sender payer replay issue was first flagged and fixed by community PR #11591 (merged May 4).

### Gas metering isolation

```
sender_intrinsic_gas = AA_BASE_COST + tx_payload_cost + nonce_key_cost + bytecode_cost
                      + account_changes_cost + auto_delegation_cost + sender_auth_cost

execution_gas_available = gas_limit - sender_intrinsic_gas
```

`payer_auth_cost` is metered outside `gas_limit` and charged to the payer on top, since `payer_auth` is excluded from both signature hashes and chosen unilaterally by the payer; if it drew from `gas_limit`, a payer could pick an expensive authenticator to starve `calls`. Gas used can therefore exceed `gas_limit` on a sponsored transaction. `sender_auth_cost` is included in `gas_limit`, since both sender and payer sign over it.

| Component | Recommended value |
|---|---|
| `AA_BASE_COST` | 15,000 gas, fixed per-transaction overhead |
| `tx_payload_cost` | 16 gas/non-zero byte, 4 gas/zero byte (EIP-2028) |
| `nonce_key_cost` | 13,000 gas for `NONCE_KEY_MAX`; 22,100 gas first use of a standard key, 5,000 gas on existing keys |
| `bytecode_cost` | 0 without a create entry; otherwise 32,000 plus 200 gas/deployed byte |
| `account_changes_cost` | 22,100 gas per initial actor at create (about 66,300 for a `POLICY` actor's three slot writes); per config-change entry, its auth cost plus per-mutated-slot storage cost; 4,600 gas per delegation entry; 2,100 gas per already-applied (skipped) config change |
| `auto_delegation_cost` | 4,600 gas when a code-less sender is auto-delegated to `DEFAULT_ACCOUNT_ADDRESS`, 0 otherwise |

These values are explicitly a recommended reference schedule, not protocol constants; PR #11813 (Jun 17) clarified the spec text on exactly this point, leaving room for future EVM repricing.

---

## Call Phases and Atomic Batching

The protocol dispatches each call directly from `sender`:

| Parameter | Value |
|---|---|
| `from` (caller) | `sender` |
| `to` | `call.to` |
| `tx.origin` | `sender` |
| `msg.sender` at target | `sender` |
| `msg.value` | `0` |
| `data` | `call.data` |

Calls carry no ETH value; ETH transfers must route through the wallet's own CALL opcode inside a call, since the protocol never moves ETH on the sender's behalf.

`calls` is a two-level structure, `[[call, ...], [call, ...]]`: calls within one phase are atomic (all-or-nothing), while phases commit independently in sequence. If any call in a phase reverts, that phase's state changes are discarded and all remaining phases are skipped, but already-completed phases persist through the later revert. A common pattern is `[[sponsor_payment], [user_action_a, user_action_b]]`: the sponsor-payment phase commits even if the user-action phase later reverts.

When the authenticating actor has `POLICY` set, each call is gated before dispatch. The protocol resolves the actor's allowed target (`policy_manager`) once, at the start of `calls` execution, and that snapshot gates every call in every phase; a config change made by an earlier call does not retarget the gate for later calls. A mismatched `call.to` is not dispatched and fails deterministically with `error ActorPolicyViolation(bytes32 actorId, address target)`. This is a consensus-level execution result, not a validity error: the enclosing phase rolls back, later phases are skipped, the transaction is still included, and the nonce is still consumed; only the intrinsic cost plus one `policy_manager` SLOAD is charged for the undispatched call.

---

## Mempool Validation Model

Nodes maintain a canonical authenticator allowlist (per the Canonical Authenticator Set above); this is the specific mechanism by which "no wallet code execution" is achieved for mempool acceptance, since a node checks authenticator identity rather than running arbitrary wallet logic. Mempool acceptance, in order:

1. Parse and structurally validate `sender_auth`. Verify `account_changes` contains at most one create entry (must be first, type `0x00`) and at most one delegation entry (type `0x02`); nodes should enforce a configurable limit on config-change entries.
2. Resolve `sender`: use the field if set, otherwise ecrecover from `sender_auth`.
3. Determine effective actor state, either from a present create entry's `initial_actors` (after verifying address derivation and `code_size(sender) == 0`) or from existing Account Config storage.
4. If config-change or delegation entries are present, reject if the account is locked; simulate applying config changes in sequence, skipping already-applied entries.
5. Validate `sender_auth` against the resulting actor state, checking `SENDER`/`POLICY` for sender context and admin or `NONCE` when `nonce_key != NONCE_KEY_MAX`.
6. Resolve the payer from `payer`/`payer_auth` per the three-case table above.
7. Verify nonce, payer ETH balance, and both expiry fields (transaction `expiry` and the resolved actor's own `expiry` must both be satisfied). Nonce-free transactions skip the nonce check, require `nonce_sequence == 0` and a non-zero `expiry` within `NONCE_FREE_EXPIRY_WINDOW`, and dedup by `replay_id` rather than nonce.
8. Check the gas payer's pending-transaction count against node-configured mempool thresholds.
9. Apply the mempool replacement rules described under Nonce System above.

Nodes may apply higher pending-transaction rate limits based on account lock state, per the Account Lock section.

Block execution (post-mempool, at inclusion time) re-checks lock state for any config-change/delegation entries, deducts gas from the payer, increments the nonce (skipped in nonce-free mode), auto-delegates a still-code-less sender to `DEFAULT_ACCOUNT_ADDRESS` if no create/delegation entry applies, processes `account_changes` in order, sets sender/payer/actorId on the Transaction Context precompile, and then executes `calls`. `eth_getTransactionReceipt` for an AA transaction includes a `status` field where `0x00` (a reverted phase) does **not** imply no state change: earlier committed phases, auto-delegation, applied `account_changes`, nonce consumption, and gas payment all persist through a later phase revert, and a `phaseStatuses` array reports per-phase outcome. `eth_call`/`eth_estimateGas` accept AA transaction fields and price the transaction from an unsigned representative auth blob, since gas cost is determined by the auth blob's shape, not a verified signature; this RPC extension was added by PR #11903 (Jul 8).

---

## Related Proposals

| Proposal | Relation | Description |
|---|---|---|
| [EIP-8141](/eip-8141) | Alternative | Frame Transaction: arbitrary EVM inside VERIFY frames for validation, targeting both general native AA and a post-quantum off-ramp via account code |
| [EIP-8175](/eip-8175) | Alternative | Composable Transaction: flat, non-recursive `capabilities` list plus a programmable `fee_auth` prelude for sponsorship |
| [EIP-8202](/eip-8202) | Alternative | Scheme-Agile (Schemed) Transaction: single flat execution payload plus typed `authorizations`/`extensions` lists, with Falcon-512 as a first-class protocol scheme |
| [EIP-8223](/eip-8223) | Complementary | Contract Payer Transaction: static gas sponsorship gated by a canonical payer-registry predeploy at `0x13`, no EVM execution |
| [EIP-8224](/eip-8224) | Complementary | Counterfactual Transaction: protocol-native shielded gas funding via fflonk ZK proofs against canonical fee-note contracts |
| [EIP-XXXX](/eip-xxxx) | Alternative | Tempo-like Transactions (gakonst, pre-draft gist): a constrained, fixed set of wallet UX primitives with no new opcodes and no programmable validation |
