# Authenticator Model

---

## TL;DR

EIP-8130 authenticates transactions by calling a fixed interface, `authenticate(hash, data) -> actorId`, on an onchain authenticator contract via `STATICCALL`, instead of executing the account's own arbitrary code. `K1_AUTHENTICATOR` (`address(1)`) is a protocol-reserved sentinel resolved natively via `ecrecover`, so plain secp256k1 accounts pay no external-call overhead. Any `IAuthenticator` contract can be permissionlessly deployed, but only contracts in a small node-maintained **canonical authenticator set** are accepted on the direct validation path; everything else remains usable inside ordinary EVM execution but cannot authenticate a transaction directly. This buys nodes a bounded, enumerable validation surface at the cost of expressiveness: an authenticator can only decide who signed, not what to do about it (no fee logic, no state-dependent policy, no control flow). That split separates EIP-8130 from EIP-8141's frames, EIP-7702's delegated account code, and ERC-4337's `validateUserOp`, all of which let arbitrary code run during validation.

---

## 1. The Core Mechanism

Every EIP-8130 signature check calls the same interface:

```solidity
interface IAuthenticator {
    function authenticate(
        bytes32 hash,
        bytes calldata data
    ) external view returns (bytes32 actorId);
}
```

A transaction's `sender_auth` (and, if sponsored, `payer_auth`) field is `authenticator (20 bytes) || data`. The protocol resolves the acting key by calling `authenticator.authenticate(hash, data)` and comparing the returned `actorId` against the account's stored `actor_config`. The call is a `STATICCALL`: the authenticator cannot write storage, emit events, or otherwise change chain state, only read and return an identifier.

Two constraints keep this bounded and auditable. Authenticator addresses must not be delegated accounts (code starting with the EIP-7702 delegation indicator `0xef0100` is rejected), so an authenticator's logic must be what is actually deployed there. And the protocol checks that a returned `actorId` maps back to that same authenticator in `actor_config`, so a malicious or buggy authenticator cannot claim an `actorId` it was never registered against.

### K1_AUTHENTICATOR: the native special case

`K1_AUTHENTICATOR` is the constant `address(1)`. When it appears as the authenticator in an auth blob, the protocol performs `ecrecover` directly against `data` (raw `r || s || v`) rather than issuing a `STATICCALL`, returning `actorId = bytes32(bytes20(recovered_address))`. This gives plain secp256k1 accounts a zero-external-call validation path: the "authenticator" is a protocol sentinel, not a deployed contract, so no STATICCALL gas sits on top of the signature check.

The same identity space serves two registration states. A fresh, never-configured account implicitly authenticates as its own self-actor via this native path whenever a secp256k1 signature recovers to the account address and `DEFAULT_EOA_REVOKED` is unset. This is the spec's **Implicit EOA Authorization**, and it is why this document folds in what would otherwise be a separate "EOA support" page: an implicit-default EOA is not a distinct code path, it is `K1_AUTHENTICATOR` with an empty `actor_config` entry and default, unrestricted scope. Registering the self-actor explicitly with `K1_AUTHENTICATOR` lets a wallet attach a custom scope or expiry to the same key while keeping native `ecrecover`; only `actor_config` distinguishes an unrestricted owner key from a scoped one.

`address(0)` is never a valid authenticator selector; it is reserved as the sentinel for an empty `actor_config` slot, distinct from `K1_AUTHENTICATOR` at `address(1)`.

### Canonical vs. non-canonical authenticators

Anyone can permissionlessly deploy a contract implementing `IAuthenticator` and register it against an actor, but registration alone does not make it usable for direct block-level authentication. Nodes maintain an allowlist, the **canonical authenticator set**, and only transactions whose authenticator is on it are accepted on the standard validation path. A non-canonical authenticator remains callable from ordinary EVM execution (a config-change call for wallet-defined recovery, say), but an actor registered against it cannot authenticate a transaction directly.

The initial canonical set, per the current spec:

| Name | Algorithm | Authenticator | `actorId` derivation |
|---|---|---|---|
| k1 | secp256k1 | `K1_AUTHENTICATOR` (native sentinel) | `bytes32(bytes20(recovered_address))` |
| p256 | P-256 | Onchain contract | `keccak256(x \|\| y)` |
| passkey | WebAuthn / FIDO2 | Onchain contract | `keccak256(x \|\| y)` |
| delegate | Signature delegation | Onchain contract | `bytes32(bytes20(delegated_address))` |

The set and its contract addresses live in a **companion ERC (number TBD)**, deployed at deterministic CREATE2 addresses across chains, expected to grow over time (post-quantum schemes are the explicit motivating case). Nodes MUST include every canonical authenticator in their allowlist and SHOULD NOT extend it with non-canonical ones. This mirrors EIP-8202's scheme registry (a new `scheme_id` registered without touching the envelope), unlike EIP-XXXX's fixed, hard-fork-only scheme set: a new authenticator is a companion-ERC coordination problem, not a protocol upgrade, but still not something a wallet vendor can unilaterally add to the fast path. Execution can be metered as ordinary EVM execution, or, for enshrined authenticators, at a fixed gas cost matching actually running the contract, the same tradeoff EIP-8202 makes with `scheme_id`-dispatched verification.

### The delegate authenticator

`DELEGATE_AUTHENTICATOR` lets account A register an actor pointing at account B; any key authenticating as B may then authenticate as A, bounded by whatever scope A grants. Nesting is capped at depth 1, the nested authenticator must itself be canonical, and the nested actor in B must be admin (`scope == 0x00`), since B is vouching via a full-authority signature. This underlies multisig- and social-recovery-style setups without a second verification model: it is one `authenticate` call, recursively defined one level deep.

---

## 2. What Nodes Actually Check, and Why That's the Point

The Mempool Validation Algorithm resolves the acting actor's state, then validates `sender_auth` against it: for the canonical path, one `STATICCALL` (or a native `ecrecover`) plus one `actor_config` SLOAD. The spec states the validation surface plainly: "For canonical authenticators, invalidators are `actor_config` changes and nonce consumption." A node need not simulate the account's code path or bound worst-case gas for arbitrary logic; it needs only to know whether the authenticator identity is allowlisted, then run one call of fixed, boundable cost.

This is the "no wallet code execution" claim in the abstract, and the structural choice that most sharply separates EIP-8130 from the other native-AA proposals tracked by the sibling site covering EIP-8141:

- **EIP-8141's VERIFY frames** run arbitrary EVM inside the validation prefix. Its restrictive mempool tier bounds this with a gas cap (`MAX_VERIFY_GAS`, 100,000), a banned-opcode list (no `ORIGIN`, `TIMESTAMP`, `BLOCKHASH`, no `SSTORE` outside `tx.sender`), a no-storage-reads-outside-`tx.sender` rule, and four fixed validation-prefix shapes; anything else must reach a builder through a private channel. EIP-8130's authenticator call needs none of this scaffolding, since the executable surface is fixed by construction: the authenticator's own bytecode, reachable only via `STATICCALL`.
- **EIP-7702 delegation** points an EOA's code at an implementation contract and executes that logic during ordinary validation. The delegated code can be arbitrary, so a node reasoning about validation cost must reason about that code, not a fixed interface. EIP-8130 reuses the same `0xef0100` indicator for its own Delegation account-change entry, but for account code, not authentication: an account can delegate its runtime code and still authenticate through the fixed `authenticate()` interface regardless.
- **ERC-4337's `validateUserOp`** is the paradigm case of arbitrary code running during validation, which EIP-8130's motivation section critiques without naming ERC-4337: "Account abstraction proposals that delegate validation to wallet code force nodes to simulate arbitrary EVM before accepting a transaction. This requires full state access, tracing infrastructure, and reputation systems to bound the cost of invalid submissions." EIP-8130's own text frames ERC-4337 as coexistence, not replacement (existing wallets register actors via `importAccount()`), but its own path never calls into `validateUserOp`-style logic.

EIP-8202 and EIP-XXXX also avoid arbitrary EVM during signature verification (fixed `scheme_id` and signature-encoding dispatch); EIP-8223 and EIP-8224 avoid EVM execution entirely given their narrower sponsorship-only scope. EIP-8130 sits between these fixed-scheme designs and EIP-8141/EIP-8175's programmable-validation designs: not a closed enumeration of algorithms (new authenticators are ordinary contracts, no hard fork needed), but also not "run whatever code the account has." Every authenticator, however novel, is constrained to the same one-argument-in, one-`actorId`-out interface, checked against an allowlist rather than trusted by construction.

---

## 3. What Expressiveness This Model Gains and Loses

**Gained**: a bounded, enumerable validation surface. A node's job on the fast path is checking whether an authenticator is allowlisted and whether `authenticate()` returns the expected `actorId`, with no tracing, gas-cap reasoning, or reputation system needed to bound spam from expensive-to-detect submissions (the motivation section's explicit target). It also means cheap handling of the dominant case: `K1_AUTHENTICATOR` lets plain secp256k1 accounts pay no contract-call overhead, identical to a legacy signature check. And it gives new schemes a stable base without redefining the transaction format: a new algorithm is a new `IAuthenticator` contract plus a companion-ERC listing, unlike EIP-XXXX's fixed four-encoding dispatch, which needs a hard fork to add a fifth. Portability follows too: the authenticator interface and Account Configuration Contract deploy at matching CREATE2 addresses across chains, so an account's authenticator set travels with it.

**Lost**: no fee logic, state-dependent policy, or control flow inside authentication itself. `authenticate()` takes a hash and opaque data and returns an identifier; it cannot decide to sponsor a transaction conditionally, rate-limit itself, or read cross-account state. That is pushed to a separate layer: actor scope bits (SENDER, POLICY, NONCE, SELF_PAYER, SPONSOR_PAYER) checked after authentication resolves an actor, and policy managers (a `POLICY`-scoped actor's calls are gated to a single `manager` enforcing whatever application logic it wants) checked during execution, not validation. Authentication answers who; authorization and policy answer what they may do, and that split keeps the authentication call cheap and STATICCALL-safe. EIP-8141's VERIFY frames, by contrast, let one execution context decide identity and policy together, which is also why they need the banned-opcode list and gas cap.

Custom recovery logic depending on execution-time state is also not directly expressible as an authenticator. A social-recovery scheme needing a live guardian-approval count at authentication time cannot do it through `authenticate()`'s pure read-and-return contract; it has to be built as a registered actor scoped through `POLICY` and a manager instead. The EthMagicians thread's own framing is explicit (chunter, post #10, Jan 29 2026): swapping arbitrary validation-code execution for fixed configurations "eliminates wasted/unpaid computation and keeps inclusion checks performant, at the cost of custom recovery logic," offset by three fallbacks: ERC-4337 EntryPoint modules, relayer-assisted guardian-signature recovery off-chain, or a future protocol-level recovery mechanism.

New-scheme adoption also still requires an allowlist update, not just a deployment: a non-canonical authenticator is real, working code, but cannot authenticate on the direct path until it is in the canonical set, a companion-ERC process rather than a bilateral agreement, a real coordination cost even if smaller than a hard fork.

---

## 4. The ERC-1271 / Operational-Signing Angle

EIP-8130 exposes a second, distinct check alongside transaction authentication: `verifySignature(account, hash, signature)`, an ERC-1271-style boolean predicate for off-chain signing (Permit-style approvals, order signatures). As of the scope-grant redesign in PR #11918 (merged Jul 13, 2026), ERC-1271 signing is not a separate grant bit; it is authorized for any actor with **operational authority**, defined as `operational := admin (scope == 0x00) || (SENDER && !POLICY)`.

The rationale, quoted directly from the spec: "Signing is an encoding of authority, not a separate capability: an operational key can already call approve/transfer directly, so letting it produce a Permit or order signature grants nothing it did not already have (approve ≡ permit)." A `POLICY`-scoped actor is never operational and must not sign raw hashes, since a signature acts off the policy gate, and a gated key that could freely sign would escape the single-target restriction its `manager` enforces. The spec forecloses a narrower "sign-only" grant too: "A sign-only restriction would be illusory anyway (a hash-blind signer can still sign a Permit2 drain), so signing gets no bit; scoped signing is expressed at the account layer via an approved-hash / approve-typed-data pattern," citing the Safe `approveHash` precedent.

This is itself a case study in the tradeoff above. The original scope model (PR #11388, Mar 9 2026) had a standalone `SIGNATURE` bit among four grants (SIGNATURE/SENDER/PAYER/CONFIG). The `operational` predicate replaced it in the Jul 13 rewrite because a bit-based signing grant was a false boundary: anything an operational key can already do by calling a contract directly, it can also do by signing off-chain, so gating "may sign" independently of "may call" added a second bit to track rather than real security.

`authenticateActor` (transaction validation) and `verifySignature` (off-chain signing) are deliberately different entry points: the former reverts on failure and returns the actor's raw authorization surface; the latter returns a plain boolean. Both route through the same authenticator resolution, with the operational-authority check layered on top only for signing.

---

## 5. How New Authenticators Get Deployed and Adopted

Three thresholds govern whether a new authenticator can actually authenticate transactions. Deployment is permissionless, with no governance gate. Registration against an account is also permissionless, subject to the account's admin authority: an admin actor (`scope == 0x00`) can call `authorizeActor` to register any deployed authenticator, usable immediately for non-8130-path authentication (a config-change call for wallet-defined recovery, say). Direct block-inclusion authentication, though, requires canonical-set membership, a gate tied to a companion ERC rather than per-account choice, expected to grow "via the companion ERC process" as the ecosystem matures: the same cross-client coordination that governs precompile or opcode additions elsewhere, minus the hard fork.

The practical effect is a two-speed adoption model: a wallet can experiment with a novel authenticator immediately for anything not needing mempool-path inclusion, but getting it onto the fast path nodes actually allowlist is a slower, ecosystem-level process. This mirrors, at a smaller scale, a tension the EthMagicians thread surfaced early: rmeissner's post #5 (Jan 22, 2026) worried bundling authentication and gas-payment logic into one EIP would "lower the chances of adoption by the core team due to complexity," prompting chunter to split the proposal's scope. The same instinct, a narrow fast path with broader functionality behind slower registration, recurs in the canonical-set design.

The `Existing Smart Contracts` account type in the spec's own Account Types table gives the concrete migration path for wallets predating EIP-8130: an already-deployed ERC-4337 account registers actors via `importAccount()`, authorized by a signature checked against its existing ERC-1271 implementation, without redeploying.

---

## Summary

EIP-8130 authenticates by calling a fixed `authenticate(hash, data) -> actorId` interface via `STATICCALL`, with `K1_AUTHENTICATOR` as a zero-external-call native special case and a canonical authenticator set (contracts plus the native sentinel, tracked in a companion ERC) gating what nodes accept for direct authentication. This is the structural opposite of models that run arbitrary account code to decide identity: EIP-8141's gas-capped VERIFY frames, EIP-7702's delegated implementation code, and ERC-4337's `validateUserOp` all put more logic inside validation at the cost of a harder-to-bound mempool acceptance problem. EIP-8130 trades that expressiveness away deliberately, pushing fee logic, state-dependent policy, and control flow into a separate scope/policy layer checked after authentication resolves an actor. Implicit EOA Authorization is not a special code path bolted onto this model; it is `K1_AUTHENTICATOR` applied to an unregistered account, which is why this document, not a dedicated EOA-support page, is where that mechanism belongs. The open question is less about the mechanism than its adoption pipeline: deployment and account-level registration are both permissionless, but canonical-set membership is a slower, companion-ERC-gated process.
