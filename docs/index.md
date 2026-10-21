---
layout: home
hero:
  name: EIP-8130
  text: Keystore Accounts
  tagline: Research and implementation tracking for a draft native account-abstraction proposal. A transport-neutral Keystore, canonical authenticators, and bounded validation.
  actions:
    - theme: brand
      text: Read the Overview
      link: /current-spec
    - theme: alt
      text: Try the Demo
      link: https://vibes.base.org/
features:
  - title: Declarative Validation
    details: Nodes select known authenticators by address instead of running the account's own code
  - title: Cross-Chain Accounts
    details: One chain_id 0 signature can be relayed to each deployment; synchronization is not automatic
  - title: Predictable Mempool Safety
    details: Canonical authenticator identity narrows the code and state a node must validate
  - title: Scheme Agility
    details: Contracts deploy freely; permissive chains accept them, L1 canonical status needs a fork
  - title: Account Lock
    details: Freeze actor configuration so locked canonical payers can earn higher mempool limits
  - title: Transport-Neutral
    details: One Keystore for EIP-8430 transactions, frame accounts, ERC-4337, and app signatures
---

## What to read first?

Pick the route that matches why you're here.

- **Just want the overview** → [Current Spec](/current-spec) for the mechanism, then [FAQ](/faq) for common questions.
- **Building a wallet or app** → [Developer Tooling](/developer-tooling) for the adoption calculus, then [Authenticator Model](/authenticator-model) for how validation actually works.
- **Following the discussion** → [Feedback Evolution](/feedback-evolution) for the phase-by-phase debate, [Merged Changes](/merged-changes) for PR history, [Original vs Latest](/original-vs-latest) for the diff.
- **Comparing alternatives** → [Competing Standards](/competing-standards) for the comparative analysis, or jump straight to [EIP-8141](/eip-8141), EIP-8130's most direct competitor.
- **Cross-chain wallets** → [Cross-Chain Accounts](/cross-chain-accounts) for how config changes replay across chains via `chain_id 0`.
- **Mempool safety and statelessness** → [Mempool Safety](/mempool-safety) for why validation never executes wallet code.
- **Post-quantum readiness** → [PQ Scheme Agility](/pq-scheme-agility) for how new signature schemes join the canonical authenticator set.

## How does it work?

Every EIP-8130 account is governed by the **Keystore** at `KEYSTORE_ADDRESS`, which stores actor and account state and delegates credential checks to an **authenticator contract**:

```solidity
interface IAuthenticator {
    function authenticate(bytes32 hash, bytes calldata data) external view returns (bytes32 actorId);
}
```

Since October the Keystore is the whole proposal. Any consumer (the split-out EIP-8430 transaction type, an EIP-8141 frame account, an ERC-4337 account, or an application) authenticates an actor exactly as `authenticateActor` does: `K1_AUTHENTICATOR` runs native `ecrecover`, other authenticators run through `STATICCALL`, and the result is checked against the actor's stored configuration. Every native consumer accepts the canonical set at a constant cost; permissive chains also accept other authenticators within `MAX_AUTHENTICATION_GAS`.

Each actor carries a `uint16 scope` grant mask rather than one all-or-nothing permission:

| Grant | Value | Meaning |
|---|---|---|
| `OPERATOR` | `0x01` | Ungated call initiation and ERC-1271 signing |
| `SELF_PAYER` | `0x02` | Pay gas for the account's own transactions |
| `SPONSOR_PAYER` | `0x04` | Pay gas on behalf of a different sender |
| `POLICY` | `0x08` | Call initiation gated to a designated policy manager |
| `NONCE` | `0x10` | Use sequenced nonce channels, not only nonce-free mode |

`scope == 0x00` is the admin predicate: unrestricted authority over config changes and delegation. There is no separate "config" grant, since any actor able to rewrite `actor_config` can already grant itself full access. Draft PR #12462 would cut the mask to `OPERATOR` and `POLICY`.

### Transaction format (EIP-8430, `AA_TX_TYPE = 0x79`)

```
AA_TX_TYPE || rlp([
  chain_id, sender, nonce_key, nonce_sequence,
  valid_after, valid_before,
  max_priority_fee_per_gas, max_fee_per_gas, gas_limit,
  account_changes, calls, metadata,
  payer, sender_auth, payer_auth
])
```

EIP-8430 works for plain EOAs on its own. `calls` is a list of phases of `[to, value, data]` calls that commit independently in sequence: if a call in a phase reverts, that phase rolls back and later phases are skipped, but completed phases persist. EIP-8130 adds create (`0x02`) and config-change (`0x03`) account-change entries, non-secp256k1 authenticators, and scope checks.

### Gas sponsorship

| `payer` | `payer_auth` | Who pays | Required grant with the Keystore |
|---|---|---|---|
| empty | empty | `sender` | Admin or `SELF_PAYER` on the sender's actor |
| `0x00` | secp256k1 signature | Whoever signed (open payer) | `SELF_PAYER` if it is the sender, otherwise `SPONSOR_PAYER` |
| sender's own address | set | `sender` | Admin or `SELF_PAYER` on a dedicated gas key |
| a different address | set | the `payer` field | Admin or `SPONSOR_PAYER` on the payer's actor |

No bundler or EntryPoint contract is required on the native path. See [Current Spec](/current-spec) for signed changes, local epochs, multichain changes, account lock, and account creation and import.
