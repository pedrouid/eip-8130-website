# Current Spec

EIP-8130, "Account Abstraction by Account Configuration," is a Core, Standards Track proposal by Chris Hunter (@chunter-cb, Coinbase/Base), created 2025-10-14, with 43 merged PRs against the spec file as of 2026-08-20. Its frontmatter now requires EIPs 155, 170, 712, 1271, 1559, 2028, 2718, 2929, 4337, 6780, 7702, 7708, and 7819.

::: warning Proposal status
This page summarizes the canonical **Draft**. EIP-8130 is not finalized, scheduled for an Ethereum L1 hard fork, or active on Ethereum mainnet. Base lists EIP-8130 in the [Cobalt upgrade](https://chain.base.org/upgrades/upgrade/cobalt), with both Sepolia and mainnet in planning for September 2026. Present-tense wording below describes the proposal's rules, not a deployed Ethereum feature. Open PRs are called out explicitly.
:::

The central design separates authentication from account logic. A node can admit a transaction by checking the identity of its authenticator against a small canonical set, instead of executing arbitrary wallet bytecode to discover whether the transaction is valid.

Spec source: [github.com/ethereum/EIPs/blob/master/EIPS/eip-8130.md](https://github.com/ethereum/EIPs/blob/master/EIPS/eip-8130.md). Discussion: [ethereum-magicians.org/t/eip-8130-account-abstraction-by-account-configurations/25952](https://ethereum-magicians.org/t/eip-8130-account-abstraction-by-account-configurations/25952).

---

## Keystore, actorId, and scope

PR [#12135](https://github.com/ethereum/EIPs/pull/12135) renamed the Account Configuration Contract to the **Keystore** and aligned the specification with the audited reference contracts. The system contract at `KEYSTORE_ADDRESS` stores actor authorization, account state, local and multichain change sequencing, and lock state. Detailed storage and function behavior now lives in the canonical [Base implementation](https://github.com/base/eip-8130); the EIP defines the consensus requirements around it.

An **actor** is an authority-holder on an account, such as an owner, session key, or payer-only key. Each actor is identified by a 32-byte `actorId` derived by its authenticator.

### `actor_config` packing

An actor configuration occupies one 32-byte word:

```
authenticator (20 bytes) || expiry (6 bytes) || scope (2 bytes) || reserved (4 bytes)
```

`expiry` is a `uint48` Unix-seconds timestamp. Zero means no expiry. `scope` is now a `uint16`; the upper 11 bits remain reserved. The four reserved bytes must be zero so future layouts fail closed on older deployments. A `POLICY` actor also has a policy manager and commitment stored separately.

### Address-derived actorIds

PR [#12173](https://github.com/ethereum/EIPs/pull/12173) standardized address-derived actor IDs as right-aligned addresses:

```
actorId = bytes32(uint256(uint160(address_value)))
```

The high 12 bytes are zero and the address occupies the low 20 bytes. This applies to native secp256k1 recovery, the implicit self actor, and delegate actors.

### Scope grants

Scope is a `uint16` bitmask of grants. Zero is the admin predicate, not a separate bit.

| Bit | Value | Name | Grants |
|---|---|---|---|
| 0 | `0x0001` | `SENDER` | Initiate calls without a policy gate; also operational for ERC-1271 unless combined with `POLICY` |
| 1 | `0x0002` | `POLICY` | Initiate calls only through the actor's policy manager |
| 2 | `0x0004` | `NONCE` | Use sequenced nonce channels rather than only nonce-free mode |
| 3 | `0x0008` | `SELF_PAYER` | Pay gas when payer and sender are the same account |
| 4 | `0x0010` | `SPONSOR_PAYER` | Pay gas for a different sender |
| 5-15 | | spare | Reserved for future pure grants |

Admin authority is required to authorize or revoke actors, increment the local epoch, lock or unlock an account, and apply multichain changes. Operational ERC-1271 authority is `admin || (SENDER && !POLICY)`.

An actor is live when `expiry == 0 || block.timestamp <= expiry`. An expiring sole admin can brick an account, so the specification recommends expiry only for non-admin actors.

### Signed account changes

The Keystore exposes one `applySignedAccountChanges` path. A signed change selects a channel and one of five operations:

- `AuthorizeActor` — install or replace an actor configuration.
- `RevokeActor` — remove an actor. Revoking the self actor disables both the explicit and implicit path.
- `IncrementLocalEpoch` — invalidate unlanded local signatures from the current epoch. It may ride either channel but always changes local epoch state.
- `Lock` — freeze configuration changes and start the lock lifecycle.
- `Unlock` — initiate the delayed unlock.

The **local channel** packs `local_epoch` and `local_sequence` as two `uint32` values inside a signed `uint64`. `UNSEQUENCED` changes may be applied in any order within the current epoch; `IncrementLocalEpoch` invalidates any that have not landed. The **multichain channel** remains a monotonic `uint64` sequence and can authorize a change signed for `chain_id = 0` across chains.

PR [#12148](https://github.com/ethereum/EIPs/pull/12148) clarified batch behavior. An already-expired unsequenced `AuthorizeActor` entry is skipped while live sibling entries still apply. A sequenced local or multichain grant may be installed already expired and is simply inert.

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

Authenticators execute through `STATICCALL`. They cannot write state, but they can read state and make further static calls. The canonical allowlist, rather than a per-call delegated-code check, determines which authenticators may validate native transactions. PR #12148 removed the redundant delegated-authenticator bytecode check from the transaction path.

### Canonical authenticator set

| Name | Algorithm | `actorId` derivation |
|---|---|---|
| k1 | secp256k1, native sentinel | Right-aligned recovered address |
| p256 | P-256 contract | `keccak256(x || y)` |
| passkey | WebAuthn/FIDO2 contract | `keccak256(x || y)` |
| delegate | Nested account authentication | Right-aligned delegated account address |

Only canonical authenticators may resolve `sender_auth` or `payer_auth` on the native path. Other `IAuthenticator` contracts can still be used through ordinary EVM execution, including wallet-defined recovery. The EIP expects a companion ERC to maintain deterministic canonical addresses, but that ERC has not been assigned a number and the client activation process remains unspecified.

The delegate authenticator lets account A trust account B's current admin authentication, subject to the scope A granted the delegate. Delegation cannot nest, and the nested authenticator must be canonical.

---

## Signature Verification

PR #12135 split the signature surface into two layers:

- `authenticateActor(hash, auth)` is the raw authentication primitive. It resolves an `actorId` without applying account or chain domain separation.
- `validateSignature(account, hash, auth)` consumes a typed signature envelope, verifies the actor against the account, and returns the actor's scope. Its signed digest is an account- and chain-scoped `replaySafeHash`.

The envelope begins with a signature type. `Local (0x01)` binds the signature to the current chain and local Keystore state. `Multichain (0x02)` uses the multichain channel for portable authorization. The remainder supplies the authenticator and its data. ERC-1271 remains a compatibility wrapper around this account-scoped validation path.

This makes the account-scoped replay protection first prototyped in Base implementation PR [#45](https://github.com/base/eip-8130/pull/45) part of the canonical model, in an evolved typed-envelope form.

---

## Transaction Format

### `AA_TX_TYPE = 0x79`

```
AA_TX_TYPE || rlp([
  chain_id,
  sender,
  nonce_key,
  nonce_sequence,
  valid_after,
  valid_before,
  max_priority_fee_per_gas,
  max_fee_per_gas,
  gas_limit,
  account_changes,
  calls,
  metadata,
  payer,
  sender_auth,
  payer_auth
])
```

`valid_after` and `valid_before` are `uint64` Unix timestamps in **milliseconds**. Zero `valid_after` means immediately valid; zero `valid_before` means no upper bound except that nonce-free transactions require a finite `valid_before`. The canonical EIP accepts milliseconds only. Open PR [#12204](https://github.com/ethereum/EIPs/pull/12204) proposes accepting either seconds or milliseconds by magnitude, but that is not merged behavior.

| Field | Description |
|---|---|
| `chain_id` | Chain ID per EIP-155 |
| `sender` | Account address, or empty on the implicit EOA path |
| `nonce_key` | Standard channel `0`, parallel channels `1..NONCE_KEY_MAX-1`, or nonce-free `NONCE_KEY_MAX` |
| `nonce_sequence` | Expected `uint64` sequence; must be zero in nonce-free mode |
| `valid_after` / `valid_before` | Millisecond transaction-validity window |
| fee fields | EIP-1559 priority and maximum fee |
| `gas_limit` | Sender-side intrinsic and execution budget |
| `account_changes` | Create, signed Keystore changes, or delegation entries |
| `calls` | Ordered atomic phases |
| `metadata` | Opaque attribution or annotation bytes |
| `payer` | Empty for sender-paid, otherwise the payer address |
| auth fields | Sender and payer authenticator envelopes |

`AA_PAYER_TYPE = 0x7A` is a signature-domain byte, not a second transaction type.

---

## Nonce and Replay Protection

The precompile at `NONCE_MANAGER_ADDRESS` (`0x813000000000000000000000000000000000aa01`) stores independent `uint64` sequences by `(account, nonce_key)`.

Nonce-free transactions use `NONCE_KEY_MAX`, require `nonce_sequence == 0`, and rely on a finite `valid_before` plus a consensus-state `replay_id` circular buffer:

```
replay_id = keccak256(REPLAY_ID_TYPE || rlp([
  chain_id, resolved_sender, valid_after, valid_before,
  account_changes, calls, metadata, payer
]))
```

The identifier excludes fees and both auth blobs so a fee bump or fresh signature remains the same logical transaction. It includes the payer so a payer change is a new transaction. The buffer capacity and accepted validity window are protocol constants or chain parameters.

---

## Account Lock and Account State

The packed account state includes:

- `multichain_sequence` (`uint64`)
- `local_epoch` (`uint32`) and `local_sequence` (`uint32`)
- `lock_union` (`uint48`)
- the inline self-actor scope and expiry
- flags for `CONTRACT_ESTABLISHED`, `DEFAULT_EOA_REVOKED`, `LOCKED`, and unlock state

`CONTRACT_ESTABLISHED`, added in PR #12135, records that a code-less address has been established as a contract account. The flag survives EIP-6780-era code removal and prevents the address from later being treated as an unconfigured EOA with an implicit key.

Lock and unlock are standalone signed local Keystore changes, not a separate entry point. Locking freezes authority changes and delegation; `Unlock` and `IncrementLocalEpoch` remain permitted. Unlock starts a configured delay bounded to `uint16` seconds; once the timestamp is reached, configuration can resume. Nodes may give higher pending-transaction limits to accounts whose actor set is provably frozen for a sufficient window.

---

## Account Creation and Import

Three account paths remain:

| Account type | Mechanism |
|---|---|
| EOA | Native secp256k1 authentication; a code-less sender may receive the default delegation |
| Existing contract | Import actor state after ERC-1271 authorization |
| New account | CREATE2-derived address with initial actors and same-transaction initialization calls |

The initial-actor commitment now hashes every actor leaf first, then hashes the ordered leaf list. Actors must be strictly sorted by `actorId`, which also rejects duplicates.

```
leaf_i            = keccak256(encode(initial_actor_i))
actors_commitment = keccak256(leaf_0 || leaf_1 || ...)
effective_salt    = keccak256(user_salt || actors_commitment)
address           = CREATE2(KEYSTORE_ADDRESS, effective_salt, deployment_code)
```

PR #12173 removed the protocol-level create-entry code-size check from the EIP because deployment validation belongs to the implementation contract. The canonical Base contracts remain the source for those lower-level checks.

`createAccount` and `importAccount` set `DEFAULT_EOA_REVOKED` by default. A user who wants to retain the implicit secp256k1 key must include the right-aligned self actor explicitly. Open PR [#11919](https://github.com/ethereum/EIPs/pull/11919) still proposes optional actor expiry at creation and import; the merged interface does not expose it.

---

## Gas Sponsorship

| Relationship | Required grant |
|---|---|
| Sender pays itself | `SELF_PAYER` on the sender actor |
| Dedicated key pays its own account | `SELF_PAYER` on the payer-auth actor |
| Different account sponsors sender | `SPONSOR_PAYER` on the payer-auth actor |

Sender and payer sign the same transaction field list with `AA_TX_TYPE` and `AA_PAYER_TYPE` domain prefixes respectively. Both validity-window fields are included. The payer digest also binds the resolved sender and payer.

Payer authentication is charged outside `gas_limit`, while sender authentication is inside it. This prevents a payer-selected authenticator from starving the sender's calls. The merged EIP still uses its recommended reference schedule. Open PR #12204 proposes two adoption profiles, bounded authenticator gas, and explicit transaction-context access during authentication; those rules are not canonical yet.

---

## Call Phases and Atomic Batching

Calls run directly from `sender`, with `tx.origin == sender`, `msg.sender == sender`, and zero protocol-supplied value. ETH movement must happen inside account code.

`calls` is a two-level list. Calls within one phase are atomic; completed phases remain committed if a later phase fails. Policy actors may only target their recorded policy manager. A target mismatch is an execution failure rather than transaction invalidity, so the nonce and earlier phases remain consumed.

---

## Mempool Validation Model

At admission, a node:

1. Parses the transaction and typed auth envelopes.
2. Resolves the sender and effective Keystore state.
3. Simulates ordered account changes, rejecting prohibited changes while locked.
4. Authenticates sender and payer only through canonical authenticators.
5. Checks actor scope, nonce or `replay_id`, payer balance, actor expiry, and the millisecond validity window.
6. Applies pending-count and replacement policy.

The fixed authenticator boundary removes arbitrary wallet-code execution from the canonical public-mempool path, but authenticators may still perform bounded state reads through `STATICCALL`. Open PR #12204 would formalize separate L1 and L2 adoption profiles: a permissive L1 path capped by `MAX_AUTHENTICATION_GAS`, and a canonical-only L2 path with configurable pricing. Until it merges, this is design work rather than current EIP text.

---

## Related Proposals

| Proposal | Relation | Description |
|---|---|---|
| [ERC-8168](https://github.com/ethereum/ERCs/pull/1555) | Application layer, open draft | Payer service capability with `payer_sendTransaction` and `payer_signTransaction`; offers must support at least one method |
| [ERC-8340](https://github.com/ethereum/ERCs/pull/1883) | Application layer, open draft | Structured metadata for EIP-8130 transactions |
| [EIP-8141](/eip-8141) | Alternative | Frame Transaction with programmable VERIFY frames and explicit execution/state gas limits |
| [EIP-8175](/eip-8175) | Alternative | Composable Transaction with a programmable fee-authorization prelude |
| [EIP-8202](/eip-8202) | Alternative | Scheme-Agile Transaction with typed authorizations and extensions |
| [EIP-8223](/eip-8223) | Complementary | Static contract-payer transaction through a canonical registry |
| [EIP-8224](/eip-8224) | Complementary | Counterfactual transaction with shielded gas funding |
| [EIP-XXXX](/eip-xxxx) | Alternative | Tempo-like transaction draft with a fixed wallet primitive set |
