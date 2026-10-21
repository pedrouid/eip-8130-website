# Current Spec

EIP-8130, now titled **"Keystore Accounts,"** is a Core, Standards Track proposal by Chris Hunter (@chunter-cb, Coinbase/Base), created 2025-10-14, with 49 merged PRs against the spec file as of 2026-10-21. PR [#12295](https://github.com/ethereum/EIPs/pull/12295) (Sep 3) replaced the original title, "Account Abstraction by Account Configuration." PR [#12386](https://github.com/ethereum/EIPs/pull/12386) (Oct 8) then scoped the EIP to the Keystore alone and moved the transaction type into a separate proposal, [EIP-8430](https://github.com/ethereum/EIPs/pull/12385) ("AA Transaction Type"). The frontmatter now requires only EIPs 170 and 1014.

::: warning Proposal status
This page summarizes the canonical **Draft**. EIP-8130 is not finalized, scheduled for an Ethereum L1 hard fork, or active on Ethereum mainnet. EIP-8430, which now carries the transaction format, exists only as open PR #12385 and has no merged text in the EIPs repository. Base's [Cobalt upgrade](https://docs.base.org/upgrades/cobalt/overview) went live on Sepolia (Sep 23) and mainnet (Sep 30) **without** EIP-8130. Its [Everest upgrade](https://docs.base.org/upgrades/everest/overview) now plans "Base Transactions (EIP-8430)" with no date, and Base's client gates the Keystore behind a test-only fork that is never scheduled on Base mainnet or Sepolia. Present-tense wording below describes the proposal's rules, not a deployed Ethereum feature. Open PRs are called out explicitly.
:::

The central design still separates authentication from account logic: an authenticator answers "who signed," and the Keystore answers "what may that actor do." What changed in October is where that separation lives. The Keystore is now specified as **transport-neutral** infrastructure usable through ordinary EVM calls, ERC-4337 accounts, EIP-8141 frame accounts, and natively by EIP-8430. Neither EIP requires the other.

Spec source: [github.com/ethereum/EIPs/blob/master/EIPS/eip-8130.md](https://github.com/ethereum/EIPs/blob/master/EIPS/eip-8130.md). Discussion: [ethereum-magicians.org/t/eip-8130-account-abstraction-by-account-configurations/25952](https://ethereum-magicians.org/t/eip-8130-account-abstraction-by-account-configurations/25952).

---

## What the EIP Covers After the Split

| Lives in EIP-8130 (merged) | Lives in EIP-8430 (open PR #12385) |
|---|---|
| Keystore state, actors, scope, expiry, policies | `AA_TX_TYPE = 0x79` wire format and `AA_PAYER_TYPE = 0x7A` payer domain |
| Signed account changes, local and multichain channels, epochs | 2D nonces (`nonce_key 0` is the account nonce), nonce-free mode, `replay_id` |
| Account lock, creation, import | Phased `calls` with native value, bound and open payer modes |
| `authenticateActor` / `validateSignature`, canonical authenticator set | Delegation entry (`0x01`), intrinsic gas, fees, receipts, RPC |
| The integration rules a consumer must follow, including EIP-8430's native path | Extension points: authenticator selector, authorization-rules hook, reserved account-change types |

Without the Keystore, EIP-8430 is a secp256k1-only batching and sponsorship transaction for today's EOAs. EIP-8130's "AA Transaction Type Integration" section fills its extension points with Keystore authentication, scopes, and two account-change entries.

---

## Keystore, Actors, and actorId

The Keystore is a contract at `KEYSTORE_ADDRESS` that maps each account to its configured **actors** and handles actor authorization, account creation, change sequencing, and account lock. Its storage packing, typehashes, events, and function bodies live in the canonical [`base/eip-8130`](https://github.com/base/eip-8130) repository (`src/Keystore.sol`), which the EIP names as authoritative for contract internals.

An **actor** is an authority-holder on an account, such as an owner, session key, or payer-only key, identified by a 32-byte `actorId` that its authenticator derives from key material. Address-derived actorIds are right-aligned, `bytes32(uint256(uint160(address)))`, standardized by PR [#12173](https://github.com/ethereum/EIPs/pull/12173).

### `actor_config` packing

Consumers read one slot per actor directly, so its packing is normative:

```
authenticator (20 bytes) || expiry (6 bytes) || scope (2 bytes) || reserved (4 bytes)
```

`expiry` is a `uint48` Unix-seconds timestamp (zero means none). `scope` is a `uint16` grant mask. Reserved bytes must be zero, which acts as a version gate. Revocation deletes the slot. The **self-actor** (the account's own address as `actorId`) is held inline in the packed account-state slot instead. Actor enumeration is done off-chain through `ActorAuthorized` and `ActorRevoked` logs.

### Scope grants

PR [#12333](https://github.com/ethereum/EIPs/pull/12333) (Sep 14) reordered the bits to match the canonical `Scopes.sol` and renamed `SENDER` to `OPERATOR`:

| Bit | Value | Name | Grants |
|---|---|---|---|
| 0 | `0x01` | `OPERATOR` | Ungated initiation to any target; also **operational** authority for ERC-1271 signing |
| 1 | `0x02` | `SELF_PAYER` | Pay the account's own gas |
| 2 | `0x04` | `SPONSOR_PAYER` | Pay gas for a different sender |
| 3 | `0x08` | `POLICY` | Gated initiation only to the actor's `policy_manager` (optional grant) |
| 4 | `0x10` | `NONCE` | Use a consumer's sequenced nonce channels (optional grant) |
| 5-15 | | spare | Reserved for future pure grants |

`scope == 0x00` is the **admin** predicate: required for `AuthorizeActor`, `RevokeActor`, every signed batch, and code delegation. Reads fail closed, and unknown bits grant nothing. `OPERATOR` is not suppressed by `POLICY`: an `OPERATOR | POLICY` actor is an ungated operator, so wallets should not set both. The spec summarizes it as: "length decides what gets stored; `POLICY` decides whether the sender is gated; `OPERATOR` overrides `POLICY`." Operational authority for ERC-1271 is now admin or any scope carrying `OPERATOR`.

| Actor | Nonce channels allowed |
|---|---|
| Admin | Any, including unsequenced (nonce-free) |
| Restricted, `NONCE` unset | Unsequenced (nonce-free) only |
| Restricted, `NONCE` set | Any |

An actor is live when `expiry == 0 || now <= expiry`. Only the acting key's own expiry is checked; authorizer lineage is never walked. Initial actors are always non-expiring (open PR #11919 would change that), and the spec warns that an expiring sole admin can brick an account and break cross-chain reconstruction.

### Actor policies

Two decisions are separate. Whether policy slots are **written** depends only on the length of `policyData` on the authorizing change: empty clears them; exactly 52 bytes (`manager (20) || commitment (32)`) writes `policy_manager` and `policy_commitment`; anything else is rejected. Whether the sender is **gated** depends on the consumer seeing `POLICY` without `OPERATOR`. A gated actor may only target its manager, cannot carry top-level value, and a `POLICY` actor with no stored manager is gated to `address(0)`. The manager reads the commitment, validates presented parameters, and is fully trusted to enforce limits.

---

## Signed Account Changes

All actor and lock changes travel in one `SignedAccountChanges` batch, applied through `applySignedAccountChanges(account, batch)` or a consumer's native path carrying the same bytes:

```
SignedAccountChanges = (channel, sequence, changes, signature)
// channel 0 = Local (binds block.chainid), 1 = Multichain (binds chain_id 0)
// Local sequence = local_epoch (high 32) || local_sequence (low 32)
// Multichain sequence = plain monotonic uint64 counter
```

| Type | Change | Notes |
|---|---|---|
| `0` | `AuthorizeActor` | Upserts `actor_config`; `policyData` empty or 52 bytes |
| `1` | `RevokeActor` | Deletes the actor and its policy slots; a k1 self-actor is revoked by setting `DEFAULT_EOA_REVOKED` |
| `2` | `IncrementLocalEpoch` | Either channel; bumps `local_epoch` and resets `local_sequence` |
| `3` | `Lock` | Local only, sole change in its batch |
| `4` | `Unlock` | Local only, sole change in its batch |

Each batch carries one admin signature over an EIP-712-style digest binding account, resolved chain ID, sequence word, and the ordered changes. On the local channel a sequence whose low half equals `UNSEQUENCED` (`2^32 - 1`) is a just-in-time batch that consumes no counter and stays replayable until the epoch moves. Expiry on `AuthorizeActor` never reverts: an already-lapsed grant is skipped on the unsequenced path and installed inert on single-consume paths, so catching-up chains never strand a counter. The multichain channel has no epoch or unsequenced mode in the merged text; open PRs [#12334](https://github.com/ethereum/EIPs/pull/12334) and [#12462](https://github.com/ethereum/EIPs/pull/12462) would add both.

### Account lock

Lock state shares one packed account-state slot with the change channels, a flags byte, and the inline self-actor config; consumers may read it directly. While `LOCKED`, every authority change and code delegation is rejected; only `Unlock` and `IncrementLocalEpoch` remain. `unlock_delay` is bounded to `uint16` seconds (about 18.2 hours). Unlock starts the delay, and the account is unlocked once `block.timestamp >= unlocks_at`. Open PR #12462 would remove account lock entirely.

PR [#12250](https://github.com/ethereum/EIPs/pull/12250) (Aug 27) removed the `CONTRACT_ESTABLISHED` flag and shifted the remaining flags down one bit: `DEFAULT_EOA_REVOKED = 0x01`, `LOCKED = 0x02`, `UNLOCK_INITIATED = 0x04`.

---

## Account Creation and Import

| Account type | Mechanism |
|---|---|
| EOA | The secp256k1 key is an implicit admin self-actor with no Keystore write |
| Existing contract | The account calls `importAccount()` itself; its own code returns the actor set |
| New account | `createAccount(userSalt, bytecode, initialActors)` or a consumer's native create path |

Creation uses EIP-1014 CREATE2 with `KEYSTORE_ADDRESS` as deployer and initial actors sorted strictly by `actorId`:

```
leaf_i            = keccak256(actorId_i || authenticator_i || scope_i || policyData_i)
actors_commitment = keccak256(leaf_0 || leaf_1 || ... || leaf_n)
effective_salt    = keccak256(user_salt || actors_commitment)
deployment_code   = DEPLOYMENT_HEADER(len(code)) || code
address = keccak256(0xff || KEYSTORE_ADDRESS || effective_salt || keccak256(deployment_code))[12:]
```

The address must be CREATE2-fresh (`code_size == 0`, `nonce == 0`). Code is placed, not executed. Creation sets `local_sequence = 1` and `DEFAULT_EOA_REVOKED` unless the self-actor is listed.

PR #12333 replaced the signature-relayable import with a parameterless `importAccount()`. The account must be `msg.sender`; the Keystore `STATICCALL`s `confirmKeystoreImport()` on it and installs the returned actor set only when the returned digest matches `computeImportDigest(account, initialActors)`. Import carries no chain ID, rejects accounts with any existing Keystore state, and also sets `DEFAULT_EOA_REVOKED`. A wallet should gate that callback on its own owner-controlled entry point, since anyone who can drive the wallet's `execute()` could otherwise finalize the import.

---

## Signature Verification

- `authenticateActor(account, hash, auth)` is the raw primitive. With `auth = authenticator || data`, it authenticates (native `ecrecover` for `K1_AUTHENTICATOR`, otherwise a `STATICCALL`), resolves the actor (the inline self-actor only on the native secp256k1 path), and checks liveness. It returns `(actorId, scope)`.
- `validateSignature(account, hash, auth)` wraps it for application signatures (Sign-In with Ethereum, `Permit`, orders) with `replaySafeHash(account, chainId, hash)`. `auth` is `sigType (1) || authenticator (20) || data`, where `Local (0x01)` binds the current chain and `Multichain (0x02)` binds all chains.

ERC-1271 is implemented on top of `validateSignature`, returning the magic value only for operational actors. Because the canonical set is small and authority lives in a flat slot, the spec notes that `validateSignature` can run in native code and be exposed as a precompile.

---

## Authenticators

```solidity
interface IAuthenticator {
    function authenticate(
        bytes32 hash,
        bytes calldata data
    ) external view returns (bytes32 actorId);
}
```

| Name | Algorithm | `actorId` derivation |
|---|---|---|
| k1 | secp256k1, native sentinel `address(1)` | Right-aligned recovered address |
| p256 | P-256 contract | `keccak256(x \|\| y)` |
| passkey | WebAuthn/FIDO2 contract | `keccak256(x \|\| y)` |
| delegate | Signature delegation contract | Right-aligned delegated account address |

The canonical set is what every **native** consumer must accept at a constant enshrined cost. It is catalogued in a companion ERC that still has no number. PR [#12204](https://github.com/ethereum/EIPs/pull/12204) (Aug 19) added the crypto-agility language: on a base layer the enshrined set changes only through a hard fork, other chains may extend it through the companion-ERC process, and accounts adopt a new canonical scheme by authorizing a new actor with no migration. Any `IAuthenticator` can be deployed and registered permissionlessly and is always usable inside EVM execution. The delegate authenticator cannot chain, and its nested authenticator must be canonical.

---

## Consumers and Native Integration

A **consumer** is anything that authorizes actions against the Keystore: a native transaction type, an EIP-8141 frame account whose code calls it, an ERC-4337 account, or an application verifying signatures. A consumer may integrate natively, either fully enshrined or as a mempool optimization over EVM execution, but its authentication must be equivalent to `authenticateActor`, and scope, expiry, policy, and lock apply unchanged.

### EIP-8430 integration

EIP-8130 specifies one native consumer in full. On a chain running both proposals:

- **Actor resolution.** A named sender or payer (`authenticator || data`) resolves exactly as `authenticateActor`, with non-native authenticators bounded by `MAX_AUTHENTICATION_GAS` (suggested 100,000). A recovered sender or open payer resolves to its inline self-actor.
- **Acceptance policy.** Every chain accepts the canonical set. A **permissive** chain (typically L1) also accepts any authenticator that returns within the gas cap and must track the state it reads; a **canonical-only** chain (typically L2) accepts only the canonical set. Open PR [#12210](https://github.com/ethereum/EIPs/pull/12210) would split this into four mempool tiers.
- **Authorization.** The sender needs admin, `OPERATOR`, or `POLICY`. Non-zero `nonce_key` channels below `NONCE_KEY_MAX` need admin or `NONCE`. A payer resolving to the sender needs `SELF_PAYER`; any other payer needs `SPONSOR_PAYER`. Delegation entries need an admin sender on an unlocked account.
- **Account-change entries.** EIP-8130 assigns create (`0x02`: `user_salt`, `code`, `initial_actors`) and config change (`0x03`: one signed batch) from EIP-8430's reserved range. Entries apply before `calls`, and `sender_auth` is checked against the resulting state.
- **Policy gate and value rules.** A gated sender's calls to anything but its manager fail as an execution result (`ActorPolicyViolation`), not a validity error. Gated actors and accounts running canonical account bytecode must carry zero `call.value`.
- **Intrinsic gas.** Canonical authenticators cost their enshrined constant; others pay metered `STATICCALL` gas plus one `actor_config` read. Create entries add 32,000 plus 200 per byte and 22,100 per initial actor slot. PR [#12320](https://github.com/ethereum/EIPs/pull/12320) (Sep 16) applied the EIP-7623 calldata floor, which EIP-8430 now carries.
- **Transaction Context.** Adds `getTransactionSender()`, `getTransactionCalls()`, and `getTransactionGasLimit()` beside EIP-8430's `getTransactionPayer()`, readable during authentication so a payer authenticator can decide sponsorship onchain.
- **RPC.** `eth_estimateGas` and `eth_call` accept `senderActorId`/`payerActorId` or dummy auth blobs to simulate a specific actor.
- **Empty-Keystore equivalence.** For an account with no Keystore state, validity, execution, and gas are identical with or without the integration.

### EIP-8430 at a glance

```
AA_TX_TYPE || rlp([
  chain_id, sender, nonce_key, nonce_sequence,
  valid_after, valid_before,
  max_priority_fee_per_gas, max_fee_per_gas, gas_limit,
  account_changes, calls, metadata,
  payer, sender_auth, payer_auth
])
call = rlp([to, value, data])
```

The open draft keeps the 15-field layout but changes several behaviors relative to the August EIP-8130 text: calls now carry native `value`; `payer = 0x00` selects an **open payer** recovered from `payer_auth`; `nonce_key 0` is the ordinary account nonce shared with other transaction types; receipts commit a `committed_phases` count; and no account is auto-delegated. Validity timestamps accept seconds or milliseconds by magnitude against `TIMESTAMP_MS_THRESHOLD = 10^11`, a rule PR #12204 introduced. Nonce-free transactions must have a `valid_before` within `NONCE_FREE_EXPIRY_WINDOW` and are deduplicated through the `replay_id` ring buffer.

---

## High-Rate Payers

A node may give a payer a higher pending-transaction limit when its balance can only fall through gas: the account is `LOCKED` with no pending unlock and a long enough `unlock_delay`, and its placed runtime code hash is in the **canonical account set** catalogued beside the canonical authenticators. An EIP-7702 delegation to a canonical implementation does not qualify, because the delegated EOA's key can still move ETH with a legacy transaction.

---

## Constants

| Name | Value |
|---|---|
| `KEYSTORE_ADDRESS` | CREATE2-derived at deployment |
| `K1_AUTHENTICATOR` | `address(1)` |
| `DEFAULT_EOA_REVOKED` | `0x01` |
| `LOCKED` | `0x02` |
| `UNLOCK_INITIATED` | `0x04` |
| `UNSEQUENCED` | `2^32 - 1` |

Transaction constants (`AA_TX_TYPE`, `AA_PAYER_TYPE`, `NONCE_MANAGER_ADDRESS`, `TX_CONTEXT_ADDRESS`, `NONCE_KEY_MAX`, `K1_AUTH_COST`, `MAX_AUTHENTICATION_GAS`, `TIMESTAMP_MS_THRESHOLD`) now live in EIP-8430.

---

## Related Proposals

| Proposal | Relation | Description |
|---|---|---|
| [EIP-8430](https://github.com/ethereum/EIPs/pull/12385) | Companion, open PR | AA Transaction Type split out of EIP-8130; works for plain EOAs and exposes the extension points EIP-8130 fills |
| [EIP-8386](https://github.com/ethereum/EIPs/pull/12218) | Extension, open PR | Transaction Events View: read-only views over logs emitted so far, for in-phase outcome assertions |
| [EIP-8387](https://github.com/ethereum/EIPs/pull/12221) | Extension, open PR (`requires: 8130`) | Stateless Accounts: transaction-scoped accounts with no Keystore write |
| [EIP-8388](https://github.com/ethereum/EIPs/pull/12222) | Extension, open PR (`requires: 8130`) | Keystore Signatures for Execution Txs: EIP-1559 and EIP-2930 transactions authenticated through the Keystore |
| [Expired Actor Pruning](https://github.com/ethereum/EIPs/pull/12240) | Extension, unnumbered draft | Consensus-driven garbage collection of expired actors |
| [ERC-8168](https://github.com/ethereum/ERCs/pull/1555) | Application layer, open | Payer service capability (`payer_sendTransaction`, `payer_signTransaction`) |
| [ERC-8340](https://github.com/ethereum/ERCs/pull/1883) | Application layer, open | Deterministic CBOR encoding for the `metadata` field |
| [ERC-8403](https://github.com/ethereum/ERCs/pull/1979) | Application layer, open | Account Authority Lifecycle binding one actor lifecycle to both EIP-8130 and EIP-8141 |
| [EIP-8141](/eip-8141) | Alternative and named consumer | Frame Transaction; the Keystore names EIP-8141 frame accounts as one of its consumers |
| [EIP-8175](/eip-8175) | Alternative | Composable Transaction with a programmable fee-authorization prelude |
| [EIP-8202](/eip-8202) | Alternative | Scheme-Agile Transaction with typed authorizations and extensions |
| [EIP-8223](/eip-8223) | Complementary | Static contract-payer transaction through a canonical registry |
| [EIP-8224](/eip-8224) | Complementary | Counterfactual transaction with shielded gas funding |
| [EIP-XXXX](/eip-xxxx) | Alternative | Tempo-like transaction draft with a fixed wallet primitive set |
