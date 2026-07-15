# EIP-XXXX: Tempo-like Transactions

| | |
|---|---|
| **Author** | Georgios Konstantopoulos ([@gakonst](https://github.com/gakonst), Paradigm/Reth) |
| **Status/category** | Pre-draft gist; no EIP number or PR |
| **Created** | Not specified; the gist has no `created` frontmatter |
| **Requires** | EIP-1559, EIP-2718, EIP-2930, EIP-7702, EIP-2, EIP-2929 |
| **Source** | [Tempo-like transaction gist](https://gist.github.com/gakonst/00117aa2a1cd327f515bc08fb807102e) |

::: info Research artifact
This is a design gist, not a numbered proposal or an active transaction type.
:::

---

## At a Glance

**What it is.** A pre-draft gist for a new EIP-2718 transaction type (`0x76`) that bundles a fixed, constrained set of wallet UX primitives directly into the transaction envelope: atomic call batching, `valid_after`/`valid_before` validity windows, optional gas sponsorship, parallelizable 2D nonces, and passkey signatures (P-256 and WebAuthn) alongside standard secp256k1.

**Problem it solves.** It targets the same UX pain points as general account-abstraction proposals (batching, sponsorship, expiring transactions, non-ECDSA signing) but without introducing programmable validation logic, new opcodes, or an account-configuration contract. The stated philosophy is "constrained scope over general framework."

**Why an EIP-8130 reader should care.** EIP-8130 also avoids arbitrary wallet-code execution at validation time, but does so by routing authentication through registered authenticator contracts checked against a canonical allowlist. Tempo-like Transactions go a step further and drop the account-configuration layer entirely: the signature schemes and UX primitives are hardcoded into the envelope itself, with no per-account registration, no scopes, and no authenticator contracts at all. It is the most constrained point on the design spectrum and a useful foil for evaluating how much of EIP-8130's contract-based configuration model a reader actually needs.

---

## Overview

Tempo-like Transactions do not attempt to replace ERC-4337, support arbitrary validation logic, or add new EVM opcodes. The gist bundles six specific primitives that recur across wallet UX requests, and stops there:

- Atomic multi-call batching
- Native time-bounded validity windows
- Optional third-party gas sponsorship
- Parallel (2D) nonces
- Passkey (P-256 / WebAuthn) signing alongside secp256k1
- A deferred hook for access/session keys (the "Keychain" wrapper)

Everything is checked cryptographically or against fixed-size fields. There is no equivalent of EIP-8130's Account Configuration Contract, no authenticator registration, and no scope/permission bitmask.

---

## Core Design

**Calls.** `calls` is a flat list of `[to, value, input]` tuples, executed sequentially. Execution is all-or-nothing: any revert in any call reverts the entire transaction. There is no phase structure and no per-call gas isolation.

**Validity window.** `valid_after` / `valid_before` fields give the transaction a native, protocol-enforced expiry window, letting wallets schedule or expire transactions without relying on application-level tricks.

**Gas sponsorship.** An optional `fee_payer_signature` field, when present, designates a recovered address as the gas payer for the whole transaction. The fee payer signs a domain-separated hash (`0x78` prefix) covering the full transaction, including the sender's address. Fee payer signatures must be secp256k1; there is no native ERC-20 fee-reimbursement mechanism, so a sponsor wanting token repayment has to co-sign a transaction that includes explicit compensating calls.

**2D nonces.** `nonce_key` selects a nonce stream and `nonce` is the sequence number within it. `nonce_key == 0` is the standard sequential channel; nonzero keys allow independent parallel channels, similar in spirit to EIP-8130's `nonce_key`/`nonce_sequence` pair.

**Signature encodings.** `sender_signature` supports four encodings distinguished by length and a leading byte: secp256k1 (65 bytes, 0 extra gas), P-256 (leading byte `0x01`, 130 bytes, +5,000 gas, optional SHA-256 pre-hash), WebAuthn (leading byte `0x02`, up to `MAX_WEBAUTHN_SIG_SIZE = 2,049` bytes, +5,000 gas, full passkey flow), and a Keychain wrapper (leading byte `0x03`) that wraps an inner signature with a `user_address` for access-key delegation. P-256/WebAuthn addresses are derived as `keccak256(pub_key_x || pub_key_y)[12:]`, meaning passkey accounts get new addresses rather than reusing an existing EOA.

**Authorization list.** An optional `authorization_list` field carries standard EIP-7702 semantics and is not reverted if call execution reverts, mirroring EIP-7702's own persistence rule.

**Access keys.** Deferred to a companion EIP. The Keychain signature wrapper is the only defined hook; expiry, spending-limit, and revocation rules for access keys are not yet specified anywhere in the gist.

**Per-call receipts.** Each call in the batch produces its own `success`, `gas_used`, and `logs`, giving callers visibility into which step of the batch did what.

---

## Mempool Strategy

Validation is purely cryptographic; no EVM execution is required to check a signature, in contrast to EIP-8130's authenticator STATICCALL or EIP-8141's arbitrary VERIFY frames. The mempool rules are well specified for a pre-draft: reject malformed signatures, reject expired transactions, reject transactions with insufficient balance, defer transactions whose `valid_after` is still in the future, maintain per-nonce-stream readiness independently across `nonce_key` channels, apply replace-by-fee rules keyed on `(root, nonce_key, nonce)`, re-check fee-payer balance on a new chain head, and apply an anti-DoS policy specifically for transactions carrying an `authorization_list`.

Signature sizes are bounded (`MAX_WEBAUTHN_SIG_SIZE = 2,049` bytes) and verification costs are deterministic per encoding, so nodes can reason about validation cost statically without simulation. This is the same design goal EIP-8130 pursues through its authenticator allowlist, but Tempo-like Transactions get there without any contract call at all: there is nothing to allowlist because there is no authenticator contract, only a closed set of encodings baked into the transaction format itself.

---

## Key Differences from EIP-8130

| Aspect | EIP-XXXX (Tempo-like) | EIP-8130 |
|---|---|---|
| Formal status | Pre-draft gist, no EIP number, no PR, no discussion thread | Draft, Core/Standards Track, `requires: 170, 2718`, 40+ merged PRs |
| Transaction type | `0x76` | `AA_TX_TYPE = 0x79` (plus `AA_PAYER_TYPE = 0x7A` as a signature-domain byte, not a separate envelope) |
| Validation model | Fixed signature encodings checked inline against the envelope; no contract call | Authenticator contracts invoked via STATICCALL, checked against a canonical allowlist; native `K1_AUTHENTICATOR` sentinel for secp256k1 |
| Account configuration | None; sender is an existing EOA or a new address derived from a passkey public key | Onchain Account Configuration Contract; actors registered per account via `actor_config`, existing EOAs and existing smart-contract wallets supported without new addresses |
| Extending the signature set | Would require changing and activating the protocol definition | A contract can be deployed freely, but direct AA authentication requires canonical-set adoption; activation is unspecified |
| Permission scoping | None; a valid signature authorizes the entire call batch | Scope bitmask (`SENDER`, `POLICY`, `NONCE`, `SELF_PAYER`, `SPONSOR_PAYER`); `POLICY` gates a key to a single target contract |
| Batching model | Flat `calls` list, single all-or-nothing atomicity level | Two-level Call Phases: phases commit independently in sequence, calls within a phase are atomic |
| Nonces | 2D (`nonce_key`, `nonce`); `nonce_key == 0` is standard | 2D (`nonce_key`, `nonce_sequence`) plus a dedicated nonce-free mode (`NONCE_KEY_MAX`) with `replay_id` dedup via a fixed-capacity circular buffer |
| Validity window | Native `valid_after` / `valid_before` window | Single transaction-level `expiry`, plus an independent actor-level `expiry` for key liveness; no `valid_after` equivalent |
| Gas sponsorship | Optional `fee_payer_signature`, secp256k1 only, no native ERC-20 reimbursement | `payer` / `payer_auth` fields, any authenticator, gated by `SELF_PAYER`/`SPONSOR_PAYER` scope bits |
| Session/access keys | Deferred to a companion EIP; only a Keychain wrapper stub defined | The EIP-8130 draft defines `POLICY` plus `policy_manager`/`policy_commitment` |
| New EVM primitives | None (no opcodes, no precompiles) | No opcodes; adds a Nonce Manager precompile and a Transaction Context precompile |
| PQ / signature-scheme story | Fixed set (secp256k1, P-256, WebAuthn); none quantum-safe | No PQ scheme defined; a future authenticator would still need canonical-set adoption |
| Mempool validation cost | Purely cryptographic; deterministic per signature encoding | One `actor_config` SLOAD plus an authenticator STATICCALL checked against a node allowlist |

---

## Activity

The proposal exists only as a gist authored by Georgios Konstantopoulos (Paradigm/Reth). There is no PR against `ethereum/EIPs`, no assigned EIP number, and no EthMagicians discussion thread. It is referenced in community discussion of the account-abstraction design space but has not been formally submitted for review as of July 15, 2026. No participant list, review comments, or merge history exist to report beyond the gist itself.

---

## Strengths

- Deterministic, bounded validation cost for every signature encoding, with no EVM execution required at all, not even a single contract call.
- Concrete, already-specified mempool rules covering replacement, nonce-stream independence, and anti-DoS handling for `authorization_list` transactions.
- Native validity windows (`valid_after`/`valid_before`) solve a real wallet UX need (scheduled and expiring transactions) that most competing proposals handle only indirectly through nonce or expiry fields repurposed for the same effect.
- Per-call receipts (`success`, `gas_used`, `logs` per call) give callers fine-grained batch visibility without needing a separate trace.
- Simplicity of the security model: since there is no account-configuration contract and no authenticator registration, there is no equivalent of EIP-8130's policy-target trust anchor, delegate-authenticator replay surface, or scope-composition edge cases to reason about.

## Weaknesses

- No PQ story. The signature set is fixed and none of secp256k1, P-256, or WebAuthn is quantum-safe; extending it would require a protocol change, while EIP-8130 moves extension into canonical-set coordination.
- No account-side extensibility. There is no way to register a custom authenticator, delegate authority to another account, or express a scoped/policy-gated key the way EIP-8130's `POLICY` bit and `policy_manager` allow; access keys are explicitly deferred to an unspecified companion EIP.
- Gas sponsorship is narrower than EIP-8130's model: `fee_payer_signature` is secp256k1-only, and ERC-20 fee reimbursement is not natively defined, requiring sponsors to co-sign compensating calls out of band.
- No formal standing. With no EIP number, no PR, and no discussion thread, it has not entered the review process that EIP-8130 and every other proposal in this comparison have gone through, making it hard to assess how the design would hold up against adversarial review or a real implementation.
- Batching is single-level (all-or-nothing), lacking EIP-8130's phase-level distinction between calls that must persist despite a later revert (e.g. sponsor payment) and calls that should roll back together (e.g. the user's own action sequence).

---

*Continue with [Competing Standards](/competing-standards) for the comparative analysis, or return to the [Home page](/).*
