---
layout: home
hero:
  name: EIP-8130 + EIP-8430
  text: Keystore Accounts and the AA Transaction Type
  tagline: Research and implementation tracking for two sibling native account-abstraction drafts. Each works on its own; together they form one design.
  actions:
    - theme: brand
      text: Read the Overview
      link: /overview
    - theme: alt
      text: Try the Demo
      link: https://vibes.base.org/
features:
  - title: Two Sibling Standards
    details: EIP-8130 decides who may act; EIP-8430 carries the action. Neither requires the other
  - title: EIP-8430 Works for Today's EOAs
    details: Batching, sponsorship, 2D nonces, and in-band delegation with just a secp256k1 key
  - title: EIP-8130 Works Anywhere
    details: One Keystore for native transactions, ERC-4337, EIP-8141 frame accounts, and app signatures
  - title: Better Together
    details: The Keystore fills EIP-8430's hooks with scoped actors, passkeys, and in-tx account creation
  - title: Declarative Validation
    details: Nodes select known authenticators by address instead of running the account's own code
  - title: Cross-Chain Accounts
    details: One chain_id 0 signature can be relayed to each deployment; synchronization is not automatic
---

## What to read first?

Pick the route that matches why you're here.

- **New to both** → [Overview](/overview) for how EIP-8130 and EIP-8430 fit together, then [FAQ](/faq).
- **The Keystore** → [EIP-8130 Spec](/current-spec) for actors, scopes, signed changes, and its integration rules.
- **The transaction** → [EIP-8430 Spec](/eip-8430) for the `0x79` format, payer modes, nonces, and gas.
- **Building a wallet or app** → [Developer Tooling](/developer-tooling) for the adoption calculus, then [Authenticator Model](/authenticator-model) for how validation works.
- **Following the discussion** → [Feedback Evolution](/feedback-evolution) for the phase-by-phase debate, [Merged Changes](/merged-changes) for PR history, [Original vs Latest](/original-vs-latest) for the diff.
- **Comparing alternatives** → [Competing Standards](/competing-standards), or jump straight to [EIP-8141](/eip-8141), the approach scheduled for L1.
- **Cross-chain wallets** → [Cross-Chain Accounts](/cross-chain-accounts) for how Keystore changes replay across chains via `chain_id 0`.
- **Mempool safety and statelessness** → [Mempool Safety](/mempool-safety) for why validation never executes wallet code.
- **Post-quantum readiness** → [PQ Scheme Agility](/pq-scheme-agility) for how new signature schemes join the canonical authenticator set.

## How do they fit together?

Until October 2026 these were one proposal. They are now two drafts by the same author, designed to compose but deployable independently:

| | EIP-8130: Keystore Accounts | EIP-8430: AA Transaction Type |
|---|---|---|
| Role | Authority: who may act for an account, and what each actor may do | Transport: how an action reaches the chain, who pays, how it is ordered |
| Works alone? | Yes, as contracts called by ERC-4337 accounts, EIP-8141 frame accounts, or apps | Yes, for any EOA with a secp256k1 key |
| Status | Draft, 49 merged PRs | Draft, merged November 23, 2026 |

When a chain runs both, EIP-8130 fills EIP-8430's extension points: non-secp256k1 authenticators, scope-gated authorization, account creation (`0x02`) and signed config changes (`0x03`) inside the transaction, and extra transaction-context getters. Accounts with no Keystore state behave identically either way. See the [Overview](/overview) for the full mapping.

### The Keystore (EIP-8130)

Every Keystore account is governed by actors, each bound to an **authenticator contract**:

```solidity
interface IAuthenticator {
    function authenticate(bytes32 hash, bytes calldata data) external view returns (bytes32 actorId);
}
```

Any consumer authenticates an actor exactly as `authenticateActor` does: `K1_AUTHENTICATOR` runs native `ecrecover`, other authenticators run through `STATICCALL`, and the result is checked against the actor's stored configuration. Each actor carries a `uint16 scope` grant mask:

| Grant | Value | Meaning |
|---|---|---|
| `OPERATOR` | `0x01` | Ungated call initiation and ERC-1271 signing |
| `SELF_PAYER` | `0x02` | Pay gas for the account's own transactions |
| `SPONSOR_PAYER` | `0x04` | Pay gas on behalf of a different sender |
| `POLICY` | `0x08` | Call initiation gated to a designated policy manager |
| `NONCE` | `0x10` | Use sequenced nonce channels, not only nonce-free mode |

`scope == 0x00` is the admin predicate: unrestricted authority over config changes and delegation. Draft PR #12462 would cut the mask to `OPERATOR` and `POLICY`.

### The transaction (EIP-8430, `AA_TX_TYPE = 0x79`)

```
AA_TX_TYPE || rlp([
  chain_id, sender, nonce_key, nonce_sequence,
  valid_after, valid_before,
  max_priority_fee_per_gas, max_fee_per_gas, gas_limit,
  account_changes, calls, metadata,
  payer, sender_auth, payer_auth
])
```

`calls` is a list of phases of `[to, value, data]` calls that commit independently in sequence: if a call in a phase reverts, that phase rolls back and later phases are skipped, but completed phases persist.

| `payer` | Who pays | EIP-8430 alone | With the Keystore |
|---|---|---|---|
| empty | `sender` | The account's own key | Admin or `SELF_PAYER` actor |
| `0x00` | Whoever signed `payer_auth` (open payer) | Any secp256k1 key | `SELF_PAYER` if it is the sender, else `SPONSOR_PAYER` |
| sender's own address | `sender` | Redundant form | A dedicated gas key with `SELF_PAYER` |
| a different address | The named payer | That address's own key | Admin or `SPONSOR_PAYER` actor |

No bundler or EntryPoint contract is required on the native path.
