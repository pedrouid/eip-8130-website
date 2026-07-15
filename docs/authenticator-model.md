# Authenticator Model

---

## TL;DR

EIP-8130 authenticates transactions by calling a fixed interface, `authenticate(hash, data) -> actorId`, on an onchain authenticator via `STATICCALL`, rather than executing the sender account's own code. `K1_AUTHENTICATOR` (`address(1)`) is a protocol-reserved sentinel resolved natively via `ecrecover`, so plain secp256k1 accounts pay no external-call overhead. Any `IAuthenticator` can be deployed, but only a small **canonical authenticator set** is accepted on the direct AA path.

The important boundary is narrower than earlier versions of this page claimed. `STATICCALL` prevents writes; it does not prevent EVM control flow, storage reads, or calls to other contracts under static semantics. Predictability comes primarily from selecting a known implementation by address, not from the interface making the implementation stateless. The current draft does not define code-hash pinning, trace restrictions, or an activation mechanism for canonical-set updates.

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

A transaction's `sender_auth` (and, if sponsored, `payer_auth`) field is `authenticator (20 bytes) || data`. The protocol resolves the acting key by calling `authenticator.authenticate(hash, data)` and comparing the returned `actorId` against the account's stored `actor_config`. The call is a `STATICCALL`: the authenticator cannot write storage or emit logs, but it can read chain state, branch, and make further calls that remain in the static context.

Two constraints narrow the surface. Authenticator addresses must not be delegated accounts (code starting with the EIP-7702 delegation indicator `0xef0100` is rejected), removing that specific code-indirection mechanism. The protocol also checks that a returned `actorId` maps back to the same authenticator in `actor_config`, so an authenticator cannot claim an actor it was not registered against. Neither rule by itself limits the authenticator's internal reads or call graph.

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

The set and its contract addresses are intended to live in a **companion ERC (number TBD)** and use deterministic CREATE2 deployment across chains. The draft expects the set to grow over time, with post-quantum schemes as an explicit example. Nodes MUST include every canonical authenticator and SHOULD NOT extend the allowlist with non-canonical ones. Deploying a contract is permissionless; making it canonical is a coordinated specification and client-adoption step. The draft does not say whether that update can activate without a network upgrade. Execution can be metered as ordinary EVM execution or, if a chain enshrines an authenticator, charged at a fixed cost while producing identical results.

### The delegate authenticator

`DELEGATE_AUTHENTICATOR` lets account A register an actor pointing at account B; any key authenticating as B may then authenticate as A, bounded by whatever scope A grants. Nesting is capped at depth 1, the nested authenticator must itself be canonical, and the nested actor in B must be admin (`scope == 0x00`), since B is vouching via a full-authority signature. This underlies multisig- and social-recovery-style setups without a second verification model: it is one `authenticate` call, recursively defined one level deep.

---

## 2. What Nodes Actually Check, and Why That's the Point

The Mempool Validation Algorithm resolves the acting actor's state, then validates `sender_auth`: for a non-k1 canonical authenticator, this includes a `STATICCALL` plus account-configuration reads; for k1, the protocol uses native `ecrecover`. A node does not need to discover or execute the sender account's validation path. It does still execute authenticator code unless the chain has enshrined that authenticator, and ordinary EVM metering remains an explicitly permitted pricing model.

The draft's Security Considerations says that canonical-authenticator invalidators are `actor_config` changes and nonce consumption. Read literally, that is stronger than the interface guarantees: an `external view` authenticator may depend on other state, and the canonical delegate authenticator necessarily resolves state on another account. The lock-based higher-rate tier acknowledges this by conditioning a stable signature on a **stateless authenticator**. The defensible claim is therefore that canonical identity makes the validation surface enumerable; statelessness and single-slot invalidation depend on the selected authenticator.

This is the "no wallet code execution" claim in the abstract, and the structural choice that most sharply separates EIP-8130 from the other native-AA proposals compared on this site:

- **EIP-8141's VERIFY frames** run arbitrary EVM inside the validation prefix. Its restrictive mempool tier bounds this with a gas cap (`MAX_VERIFY_GAS`, 100,000), a banned-opcode list (no `ORIGIN`, `TIMESTAMP`, `BLOCKHASH`, no `SSTORE` outside `tx.sender`), a no-storage-reads-outside-`tx.sender` rule, and four fixed validation-prefix shapes; anything else must reach a builder through a private channel. EIP-8130's authenticator call needs none of this scaffolding, since the executable surface is fixed by construction: the authenticator's own bytecode, reachable only via `STATICCALL`.
- **EIP-7702 delegation** points an EOA's code at an implementation contract and executes that logic during ordinary validation. The delegated code can be arbitrary, so a node reasoning about validation cost must reason about that code, not a fixed interface. EIP-8130 reuses the same `0xef0100` indicator for its own Delegation account-change entry, but for account code, not authentication: an account can delegate its runtime code and still authenticate through the fixed `authenticate()` interface regardless.
- **ERC-4337's `validateUserOp`** is the paradigm case of arbitrary code running during validation, which EIP-8130's motivation section critiques without naming ERC-4337: "Account abstraction proposals that delegate validation to wallet code force nodes to simulate arbitrary EVM before accepting a transaction. This requires full state access, tracing infrastructure, and reputation systems to bound the cost of invalid submissions." EIP-8130's own text frames ERC-4337 as coexistence, not replacement (existing wallets register actors via `importAccount()`), but its own path never calls into `validateUserOp`-style logic.

EIP-8202 and EIP-XXXX also avoid account-code execution during signature verification through fixed scheme or encoding dispatch; EIP-8223 and EIP-8224 avoid EVM execution given their narrower scope. EIP-8130 sits between those fixed-scheme designs and EIP-8141/EIP-8175's programmable paths: it runs contract code, but only at canonical addresses and through one return shape. Adding an authenticator does not change the transaction envelope, while canonical activation still needs cross-client coordination.

---

## 3. What Expressiveness This Model Gains and Loses

**Gained**: an enumerable validation surface. A node knows which canonical implementation will run before executing it, rather than discovering arbitrary sender-account validation code. `K1_AUTHENTICATOR` also gives plain secp256k1 accounts a native path with no contract-call overhead. New schemes fit the existing transaction envelope and interface, though direct AA use still depends on canonical-set adoption. Deterministic deployment and replayable actor changes can make the same configuration portable across chains when the required contracts are deployed consistently.

**Lost**: the sender account cannot place arbitrary account-specific validation logic directly on the AA path. The protocol consumes only the returned `actorId`; scope bits and policy managers decide what that actor may do. An authenticator can still contain control flow or read state, but it cannot write state during authentication, change the transaction's fee fields, or bypass the later scope checks. EIP-8141's VERIFY frames combine more account-specific authorization logic into validation and therefore need trace rules, recognized prefix shapes, and a gas cap for public relay.

Custom recovery illustrates the two-tier model. A non-canonical `IAuthenticator` can implement wallet-specific recovery and read state, but it cannot authenticate a direct AA transaction. A wallet must invoke it from ordinary EVM execution or route normal transactions through a canonical actor and a `POLICY` manager. The EthMagicians thread frames this as a deliberate loss of direct-path custom recovery, with ERC-4337 modules, relayer-assisted recovery, or a future protocol mechanism as fallbacks.

New-scheme adoption also requires an allowlist update, not just a deployment. A non-canonical authenticator is working code, but cannot authenticate on the direct path until it joins the canonical set. The draft leaves the cost and activation mechanics of that coordination unresolved.

---

## 4. The ERC-1271 / Operational-Signing Angle

EIP-8130 exposes a second, distinct check alongside transaction authentication: `verifySignature(account, hash, signature)`, an ERC-1271-style boolean predicate for off-chain signing (Permit-style approvals, order signatures). As of the scope-grant redesign in PR #11918 (merged Jul 13, 2026), ERC-1271 signing is not a separate grant bit; it is authorized for any actor with **operational authority**, defined as `operational := admin (scope == 0x00) || (SENDER && !POLICY)`.

The rationale, quoted directly from the spec: "Signing is an encoding of authority, not a separate capability: an operational key can already call approve/transfer directly, so letting it produce a Permit or order signature grants nothing it did not already have (approve ≡ permit)." A `POLICY`-scoped actor is never operational and must not sign raw hashes, since a signature acts off the policy gate, and a gated key that could freely sign would escape the single-target restriction its `manager` enforces. The spec forecloses a narrower "sign-only" grant too: "A sign-only restriction would be illusory anyway (a hash-blind signer can still sign a Permit2 drain), so signing gets no bit; scoped signing is expressed at the account layer via an approved-hash / approve-typed-data pattern," citing the Safe `approveHash` precedent.

This is itself a case study in the tradeoff above. The original scope model (PR #11388, Mar 9 2026) had a standalone `SIGNATURE` bit among four grants (SIGNATURE/SENDER/PAYER/CONFIG). The `operational` predicate replaced it in the Jul 13 rewrite because a bit-based signing grant was a false boundary: anything an operational key can already do by calling a contract directly, it can also do by signing off-chain, so gating "may sign" independently of "may call" added a second bit to track rather than real security.

`authenticateActor` (transaction validation) and `verifySignature` (off-chain signing) are deliberately different entry points: the former reverts on failure and returns the actor's raw authorization surface; the latter returns a plain boolean. Both route through the same authenticator resolution, with the operational-authority check layered on top only for signing.

---

## 5. How New Authenticators Get Deployed and Adopted

Three thresholds govern whether a new authenticator can authenticate transactions. Deployment is permissionless. Account registration requires that account's admin authority. Direct block-level AA authentication additionally requires canonical-set membership, which the draft delegates to a future companion ERC and node allowlists. The text does not define the activation process for a changed set, so its operational cost should be described as unresolved cross-client coordination rather than assumed to be lighter than a hard fork.

The practical effect is a two-speed adoption model: a wallet can experiment with a novel authenticator immediately for anything not needing mempool-path inclusion, but getting it onto the fast path nodes actually allowlist is a slower, ecosystem-level process. This mirrors, at a smaller scale, a tension the EthMagicians thread surfaced early: rmeissner's post #5 (Jan 22, 2026) worried bundling authentication and gas-payment logic into one EIP would "lower the chances of adoption by the core team due to complexity," prompting chunter to split the proposal's scope. The same instinct, a narrow fast path with broader functionality behind slower registration, recurs in the canonical-set design.

The `Existing Smart Contracts` account type in the spec's own Account Types table gives the concrete migration path for wallets predating EIP-8130: an already-deployed ERC-4337 account registers actors via `importAccount()`, authorized by a signature checked against its existing ERC-1271 implementation, without redeploying.

---

## Summary

EIP-8130 calls `authenticate(hash, data) -> actorId` via `STATICCALL`, with `K1_AUTHENTICATOR` as the native secp256k1 special case and a canonical set gating direct authentication. This avoids executing the sender account's own validation code, but it does not eliminate EVM execution or state dependencies for contract authenticators. Its predictability rests on canonical identity and audited implementations, with stronger statelessness properties available only for authenticators that actually have them. Deployment and account registration are permissionless; canonical-set membership and activation remain coordinated and underspecified. Implicit EOA authorization is the k1 path applied to the inline self-actor configuration, not a separate validation system.
