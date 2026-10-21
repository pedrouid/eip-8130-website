# Mempool Safety and Validation

---

## TL;DR

EIP-8130 does not execute the **account's** bytecode to decide whether an action is authorized. It selects a declared authenticator, then either runs native `ecrecover` for `K1_AUTHENTICATOR` or calls the authenticator contract through `STATICCALL`. Since October the transaction-level mempool rules live in the open EIP-8430 draft, while EIP-8130 states what a node adds when it integrates the Keystore.

That is still narrower than "no EVM during validation." `STATICCALL` prevents writes, but an authenticator can execute EVM code, read storage, and make further static calls. The merged text now draws the line explicitly: canonical authenticators are enshrined at constant cost and are pure functions of the signature and actor configuration, while a chain with a **permissive** acceptance policy also admits gas-capped contract authenticators and must track whatever state they read.

::: info Reading the proposal precisely
This page distinguishes rules in the current draft from stronger properties that hold only under extra conditions. Neither EIP-8130 nor EIP-8430 is deployed on Ethereum mainnet.
:::

## 1. What the proposal removes from validation

The account does not expose a `validateUserOp`-style program that a node must discover and simulate. Instead, `sender_auth` names an authenticator directly:

```solidity
interface IAuthenticator {
    function authenticate(bytes32 hash, bytes calldata data)
        external view returns (bytes32 actorId);
}
```

The node checks the returned `actorId` against the account's `actor_config` and then applies scope rules. This gives a node advance knowledge of which implementation it will execute.

| Claim | What the draft actually guarantees |
|---|---|
| Account code does not run during authentication | Yes. Authentication uses the declared authenticator instead |
| No EVM code runs during authentication | Only for k1 and enshrined canonical authenticators. Accepted non-canonical authenticators run as metered EVM |
| The authenticator cannot change state | Yes. `STATICCALL` forbids writes and logs |
| The authenticator cannot read state or call other contracts | No. Static execution may read state and make further static calls |
| Authentication has a bounded gas cost | Yes on the transaction path: canonical authenticators cost a constant, others are capped by `MAX_AUTHENTICATION_GAS` |

The gas bound is new since August. PR [#12204](https://github.com/ethereum/EIPs/pull/12204) introduced `MAX_AUTHENTICATION_GAS` (suggested 100,000) as the `STATICCALL` cap for non-canonical authenticators and as the ceiling on payer authentication metered outside `gas_limit`. A transaction whose reserved payer-authentication gas exceeds it is rejected rather than metered.

## 2. What a node validates

EIP-8430's mempool acceptance runs seven steps: structural parsing, sender authentication, delegation checks, payer authentication with the gas-cap check, validity window and fee and balance checks including the calldata floor, nonce or `replay_id` checks, and pending limits with replacement. The EIP-8130 integration adds, in order:

1. Apply `account_changes` (create `0x02`, config change `0x03`) before authentication, rejecting prohibited changes on locked accounts.
2. Resolve sender and payer actors exactly as `authenticateActor`, under the chain's acceptance policy.
3. Check scope: initiation grant for the sender, `NONCE` for restricted actors on sequenced lanes, `SELF_PAYER` or `SPONSOR_PAYER` for the payer, admin for delegation.
4. Apply value rules: policy-gated senders and canonical account bytecode must carry zero `call.value`.

The minimum state footprint varies by transaction and authenticator: the packed account-state slot or `actor_config`, nonce or replay state, payer balance, lock state, and any state a contract authenticator reads. Policy-manager and commitment slots are not read for validity; the policy gate is an execution result.

PR [#12250](https://github.com/ethereum/EIPs/pull/12250) removed the `CONTRACT_ESTABLISHED` flag that PR #12135 had added, so that piece of identity state is gone again.

## 3. Canonical authenticators and acceptance policy

The current draft lists four canonical entries:

| Name | Mechanism | Transaction-path execution |
|---|---|---|
| k1 | secp256k1 | Native `ecrecover` through `K1_AUTHENTICATOR` |
| p256 | P-256 | Enshrined at a constant cost |
| passkey | WebAuthn / FIDO2 | Enshrined at a constant cost |
| delegate | One account vouches for another | Enshrined, but resolves nested account state |

Every chain accepts the canonical set. Beyond it, the chain picks a policy:

| Policy | Typical chain | Extra authenticators | Revalidation burden |
|---|---|---|---|
| Canonical-only | L2 | None on the transaction path | Invalidators limited to `actor_config`, lock, nonce, and payer balance |
| Permissive | L1 | Any that return within `MAX_AUTHENTICATION_GAS` | Nodes must track every state read and revalidate on change |

The Security Considerations now say this directly: canonical authenticators are pure functions of `(hash, data)` and the resolved configuration, so their invalidator set is small, enumerable, and keyed by account, while non-canonical authenticators that read mutable state widen it. The delegate authenticator remains the canonical entry with a cross-account dependency. Draft PR [#12210](https://github.com/ethereum/EIPs/pull/12210) would split permissive admission into CANONICAL, PURE, BOUNDED, and ARBITRARY tiers that govern propagation and rate limits without changing consensus validity.

## 4. Account Lock and higher-rate payers

Account Lock freezes actor changes and delegations. The merged text no longer grants a sender-side rate tier for a lock alone; it defines a **high-rate payer** instead. A node may grant higher pending limits to a payer that is `LOCKED` with no pending unlock and a long enough `unlock_delay`, and whose placed runtime code hash is in a **canonical account set**. Such accounts have no secp256k1 key to sign legacy transactions, their code blocks ETH movement while locked, and EIP-8130 forbids any consumer from moving top-level value out of them. An EIP-7702 delegation to a canonical implementation does not qualify.

| Tiering signal | What it establishes | What it does not establish |
|---|---|---|
| Locked account | Actor configuration cannot change during the notice window | That a non-canonical authenticator's dependencies are unchanged |
| Locked account plus canonical account bytecode | Actor set is frozen and ETH can leave only as gas | The node's rate-limit policy, which remains local |

Rate limits and minimum lock delays remain node policy. Draft PR [#12462](https://github.com/ethereum/EIPs/pull/12462) would remove account lock entirely and restate high-rate payers as canonical bytecode plus an immutable contract-backed admin.

## 5. Statelessness and witness costs

EIP-8130 can have a smaller and more predictable witness footprint than arbitrary account validation, but the size depends on the authenticator:

- The k1 path needs signature verification plus Keystore, nonce, balance, validity-window, and expiry state.
- An enshrined canonical authenticator has a similarly fixed dependency set.
- An accepted non-canonical authenticator requires its bytecode and every account or storage proof it reads.
- The delegate authenticator adds nested account-configuration dependencies.
- Nonce-free mode adds the fixed-capacity `replay_id` ring buffer as consensus state.

Two open extension drafts target state growth directly. EIP-8387 ("Stateless Accounts") would let a transaction carry a transaction-scoped account image with no Keystore write. An unnumbered pruning draft would let consensus delete expired actors, since validation already treats expired and missing actors identically; it enables reclamation only on state trees that group adjacent slots.

## 6. Comparison with EIP-8141

| Dimension | EIP-8130 Keystore on EIP-8430 | EIP-8141 |
|---|---|---|
| Validation program | Authenticator selected by address under an acceptance policy | Account-selected VERIFY-frame program |
| Public relay boundary | Canonical set, plus capped contract authenticators on permissive chains | Recognized validation-prefix shapes plus trace and opcode rules |
| EVM during validation | None for k1 or enshrined canonical authenticators; metered `STATICCALL` otherwise | Generic VERIFY prefixes are simulated; protocol-defined prefixes may be evaluated directly |
| Gas bound | Constant canonical cost, or `MAX_AUTHENTICATION_GAS` | `MAX_VERIFY_GAS = 100,000` for the public validation prefix |
| State dependencies | Account config plus the selected authenticator | Recorded sender slots, paymaster state, and allowed prefix dependencies |

The two models are converging at the edges. EIP-8130 now names EIP-8141 frame accounts as Keystore consumers, and EIP-8141's companion EIP-8397 adds a fixed-gas, state-independent `AUTHENTICATOR` scheme whose returned `key_id` is checked before a VERIFY frame runs.

## 7. Open specification questions

An August 4 [state-roadmap analysis](https://ethresear.ch/t/why-decentralized-state-is-important-for-ethereum/25622) argues that native account abstraction increases witness pressure whenever validation depends on state beyond nonce and balance. Applied here, a canonical-only chain keeps dependencies enumerable, while a permissive chain accepts the same pressure the article warns about. This is an inference from the article's general criterion, not a claim it makes about EIP-8130.

Questions the merged text still leaves open:

- What tracking or rate-limit rules should a permissive node apply to stateful authenticators, if #12210 does not merge?
- Are canonical authenticator and canonical account code hashes pinned, and where is the canonical account set catalogued?
- How should a node treat a Keystore integration when EIP-8430 itself is not yet merged?

These are specification gaps, not proof that the model is unsafe.

## Summary

EIP-8130 replaces open-ended account validation with an authenticator selected by identity, now with an explicit gas cap and a chain-level choice between canonical-only and permissive admission. That is a meaningful reduction in validation uncertainty, and the merged security text now concedes what earlier drafts left implicit: only the canonical path keeps the invalidator set small. High-rate payers rely on lock plus canonical account bytecode, not lock alone. Claims of "no tracing," "one SLOAD," or "nonce is the only invalidator" still need those conditions stated explicitly.
