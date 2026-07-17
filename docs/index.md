---
layout: home
hero:
  name: EIP-8130
  text: Account Configuration
  tagline: Research and implementation tracking for a draft native account-abstraction proposal. Canonical authenticators, portable account configuration, and bounded validation.
  actions:
    - theme: brand
      text: Read the Overview
      link: /current-spec
    - theme: alt
      text: Compare to EIP-8141
      link: /eip-8141
features:
  - title: Declarative Validation
    details: Nodes select known authenticators by address instead of running the sender account's code
  - title: Cross-Chain Accounts
    details: One chain_id 0 signature can be relayed to each deployment; synchronization is not automatic
  - title: Predictable Mempool Safety
    details: Canonical authenticator identity narrows the code and state a node must validate
  - title: Scheme Agility
    details: Contracts deploy freely; direct AA use requires coordinated canonical-set adoption
  - title: Account Lock
    details: Freeze actor configuration to unlock higher mempool rate limits for stable accounts
  - title: Gas Sponsorship
    details: payer and payer_auth fields cover third-party gas. No bundlers or relayers needed
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

Every EIP-8130 account is governed by a single system contract, the **Account Configuration Contract**, which stores one `actor_config` slot per registered actor and delegates signature checking to an **authenticator contract**:

```solidity
interface IAuthenticator {
    function authenticate(bytes32 hash, bytes calldata data) external view returns (bytes32 actorId);
}
```

A node accepts a transaction into its mempool by checking the *identity* of the declared authenticator against a small canonical allowlist and calling it via `STATICCALL`, rather than executing the sender account's own code to discover its validation rules. `STATICCALL` prevents state writes, but it does not make authenticator code stateless or non-programmable. `K1_AUTHENTICATOR` is the native secp256k1 case: the protocol runs `ecrecover` directly instead of a contract call, which lets any existing EOA send AA transactions with no prior registration.

Each actor carries a `scope` byte of grants rather than a single all-or-nothing permission:

| Grant | Value | Meaning |
|---|---|---|
| `SENDER` | `0x01` | Ungated call initiation |
| `POLICY` | `0x02` | Call initiation gated to a designated policy manager |
| `NONCE` | `0x04` | Permission to use non-nonceless nonce channels |
| `SELF_PAYER` | `0x08` | Pay gas for the account's own transactions |
| `SPONSOR_PAYER` | `0x10` | Pay gas on behalf of a different sender |

`scope == 0x00` is the admin predicate: unrestricted authority over config changes and delegation. There is no separate "config" grant, since any actor able to rewrite `actor_config` can already grant itself full access.

### Transaction format (`AA_TX_TYPE = 0x79`)

```
AA_TX_TYPE || rlp([
  chain_id, sender, nonce_key, nonce_sequence, expiry,
  max_priority_fee_per_gas, max_fee_per_gas, gas_limit,
  account_changes, calls, metadata,
  payer, sender_auth, payer_auth
])
```

`calls` is a two-level structure, phases of atomic calls that commit independently in sequence: if a call in a phase reverts, that phase rolls back and later phases are skipped, but already-completed phases persist. A common pattern is `[[sponsor_payment], [user_action_a, user_action_b]]`, where the sponsor's payment phase survives even if the user's action phase later reverts.

### Gas sponsorship

| `payer` | `payer_auth` | Who pays | Required grant |
|---|---|---|---|
| empty | empty | `sender` | Admin or `SELF_PAYER` on the sender's resolved actor |
| sender's own address | set | `sender` | Admin or `SELF_PAYER` on a dedicated gas key funding a sibling key |
| a different address | set | the `payer` field | Admin or `SPONSOR_PAYER` on the payer's resolved actor |

No bundler, no EntryPoint contract, no off-chain relayer. Validation, gas payment, and execution are all native protocol behavior. See [Current Spec](/current-spec) for the full mechanism, including nonces, Account Lock, and account creation and import.
