# Mempool Safety and Validation

---

## TL;DR

EIP-8130's central pitch is that mempool validation never executes wallet bytecode. A node checks a transaction by reading one `actor_config` slot and calling the declared authenticator via STATICCALL, or, for the canonical set (k1, p256, passkey, delegate), running a native implementation at a fixed gas cost instead of the contract at all. There is no tracing, no arbitrary-EVM gas cap, no banned-opcode list, and no reputation-based DoS mitigation, because the shape of what can run during validation is fixed by the protocol rather than bounded by convention. Account Lock extends this to mempool tiering: a locked account has a frozen actor set, so nonce consumption is the only thing left that can invalidate an already-validated transaction, letting nodes safely raise its rate limit. The cost is coordination: only authenticators in a small, protocol-recognized canonical set get the fast path, and anything else is confined to ordinary EVM execution, unusable for direct AA authentication. EIP-8141 solves the same problem from the opposite direction, allowing arbitrary EVM in its VERIFY frames but constraining it after the fact with a validation-prefix shape, a 100,000 gas cap (`MAX_VERIFY_GAS`), and a banned-opcode list.

---

## 1. What "No Wallet Code Execution" Actually Means

The EIP-8130 abstract states the design goal directly: transactions "declare which authenticator to use, enabling nodes to filter transactions without executing arbitrary wallet code." The motivation section is more pointed about the alternative it is reacting to: "Account abstraction proposals that delegate validation to wallet code force nodes to simulate arbitrary EVM before accepting a transaction. This requires full state access, tracing infrastructure, and reputation systems to bound the cost of invalid submissions."

The mechanism behind this claim is the authenticator interface:

```solidity
interface IAuthenticator {
    function authenticate(bytes32 hash, bytes calldata data) external view returns (bytes32 actorId);
}
```

A transaction's `sender_auth` field is `authenticator || data`. To validate it, a node does not execute the sender's own account bytecode at all. It reads the `actor_config` slot for the resolved sender (one SLOAD), extracts the registered `authenticator` address, and calls `authenticator.authenticate(hash, data)` as a STATICCALL, or, if that authenticator is `K1_AUTHENTICATOR` (`address(1)`), skips the call entirely and runs `ecrecover` directly. Authenticator addresses must not be delegated accounts (code starting with the `0xef0100` EIP-7702 indicator is rejected), which keeps the authenticator from becoming an indirection point back into arbitrary logic.

This is a structurally different bet than executing an account's own validation code (the ERC-4337 / EIP-7702-account pattern): the code that runs is not the sender's own, it is a pre-registered, shared authenticator, addressed by identity rather than discovered by tracing the sender.

## 2. The Canonical Authenticator Set and Native Implementations

Any contract implementing `IAuthenticator` can be permissionlessly deployed and registered against an actor, but registering an arbitrary one does not make it usable on "the 8130 path" for block-level authentication. Only authenticators in the node's allowlist qualify; a non-canonical authenticator remains usable inside ordinary EVM execution (for example a wallet-defined recovery flow invoked through a config-change call), but an actor pointed at one cannot authenticate transactions directly through mempool validation.

The initial canonical set has four members:

| Name | Algorithm | Authenticator | `actorId` Derivation |
|---|---|---|---|
| k1 | secp256k1 | `K1_AUTHENTICATOR` (native sentinel) | `bytes32(bytes20(recovered_address))` |
| p256 | P-256 | Onchain contract | `keccak256(x, y)` |
| passkey | WebAuthn/FIDO2 | Onchain contract | `keccak256(x, y)` |
| delegate | Signature delegation | Onchain contract | `bytes32(bytes20(delegated_address))` |

Gas pricing for authenticator execution is a chain's choice: metered as ordinary EVM execution, or the chain "may enshrine canonical authenticators and charge a fixed standard gas cost per enshrined authenticator," provided the native path produces identical results to the contract. This is the second half of the "no tracing infrastructure" claim: for the canonical set, a node can call a native implementation at a known, fixed cost, no EVM bytecode required. The set is maintained in a companion ERC (number not yet assigned) at deterministic CREATE2 addresses across chains, expected to grow over time, for example for post-quantum schemes, through that ERC process rather than the base EIP.

## 3. Fragmentation Risk: What Happens Outside the Canonical Set

The mempool-safety property is conditional on the canonical set staying small and universally recognized. The spec says nodes "MUST include all canonical authenticators in their allowlist and SHOULD NOT extend it with non-canonical ones," a coordination norm, not a protocol-enforced constraint. Two failure modes follow:

- **A wallet wanting a non-canonical signature scheme or custom recovery logic loses the fast validation path entirely.** Its actor is confined to ordinary EVM execution for anything beyond registering it, so it cannot authenticate directly through mempool validation. It must route through the canonical set, for example wrapping the desired logic behind a `delegate` authenticator pointing at an account whose admin actor is itself canonical, or accept unpredictable, non-relayable inclusion.
- **A node that unilaterally extends its own allowlist reintroduces the problem the canonical set exists to avoid.** If different nodes accept different non-canonical authenticators as fast-path-eligible, the mempool fragments along node-specific allowlists rather than a shared standard. The guidance against this is normative language, not a consensus rule, so its durability depends on the companion ERC process being the real channel through which the set grows, and on operators not treating "SHOULD NOT" as optional.

Growth is deliberately narrow: new entries need consensus in a companion ERC at deterministic addresses, not a per-chain or per-client decision. That is the intended defense against fragmentation, but the set's practical usefulness for a given scheme depends on that ERC shipping and being adopted uniformly. As of the research date its number is still unassigned, so the coordination mechanism exists on paper before it exists as a deployed artifact.

## 4. Account Lock and Mempool Rate-Limit Tiering

Account Lock adds a second, orthogonal mempool-safety lever: once an account's actor set is frozen, the only thing left that can invalidate an already-accepted transaction is nonce consumption. The spec's own rationale: "Locked accounts have a frozen actor set, so the primary state that can invalidate a validated transaction is nonce consumption."

The lock state lives in the packed account-state slot alongside change-sequence counters, so reading it costs nothing beyond the account-state access already performed:

| Field | Description |
|---|---|
| `flags` bit 1 (`LOCKED`) | Freezes actor config; config-change and delegation entries rejected while set |
| `flags` bit 2 (`UNLOCK_INITIATED`) | Selects whether `lock_union` holds `unlock_delay` or `unlocks_at` |
| `lock_union` | `uint40`: pending `unlock_delay` (max ~18.2 hours) or computed `unlocks_at` |

Locking and unlocking go through a dedicated `applySignedLockChanges` entry point (admin-authorized, EVM-only, not part of the typed `account_changes` array), with a strict lock-then-unlock lifecycle: an account can only unlock from a locked, no-pending-unlock state, and unlocking starts a notice period rather than taking effect immediately.

Nodes may use this to grant higher rate limits in two roles:

- **Locked sender**: a stable signature path combined with a frozen actor set lets a node safely allow a higher per-sender rate, since the set of keys able to produce a valid signature cannot change mid-flight.
- **Locked payer with trusted bytecode**: a locked payer whose bytecode is recognized (for example, one that restricts ETH movement while locked) has a balance that only decreases via gas fees, letting nodes allow a higher payer rate. This targets high-throughput sponsor services, where one payer backs many senders and a per-sender limit alone would bottleneck it.

The tiering threshold is left to node policy (the spec gives "≥ 6 hours" as an illustrative `unlock_delay` floor, not a protocol constant). Account Lock is a mempool-policy primitive, not a consensus rule: it makes a cheaply-checkable fact, frozen actor set, bounded notice period, available to nodes, leaving the actual rate-limit tiers to node configuration and informal convergence.

## 5. Statelessness and Witness-Cost Implications

The validation model's state-access footprint is narrow and enumerable. Per the spec's Mempool Acceptance flow, a node needs at minimum: the resolved sender's `actor_config` slot (or the packed account-state slot for the inline self-actor and lock fields), the nonce state for `(sender, nonce_key)` from the `NONCE_MANAGER_ADDRESS` precompile, and the payer's balance and, if sponsored, its `actor_config` slot. Policy-gate state (`policy_commitment`, `policy_manager`) is excluded from the validation path and only read during execution, keeping the pre-inclusion witness set smaller than the full surface a policy-bearing actor might eventually touch.

This is narrower than a model where validation runs arbitrary account code, since the code itself is not part of the state a witness needs to prove, only the fixed-shape configuration slots are. A witness-generation node does not need to reason about what an arbitrary contract's bytecode might read, since only canonical authenticators run, and their code is presumed already known rather than fetched per transaction.

The one exception is the nonce-free replay path (`nonce_key == NONCE_KEY_MAX`): replay protection relies on a fixed-capacity circular buffer of `replay_id`s that is explicitly consensus state, not per-node bookkeeping, sized to cover peak nonce-free throughput times the expiry window. The buffer is ephemeral and does not grow the state trie permanently, but it is additional protocol state a stateless client must track that a purely nonce-sequenced design would not need.

## 6. Async-Execution Compatibility

A validation path with no EVM execution and a bounded, enumerable state footprint has a specific advantage for asynchronous-execution designs, of the kind proposed for high-throughput chains such as Monad or discussed under EIP-7886-style async execution: it does not require the executor to have resolved execution-time state before a node can decide whether a transaction is even eligible for inclusion. Validating an EIP-8130 transaction never depends on running the target contract's logic or knowing the outcome of prior calls in the block, since only the fixed authenticator step runs during validation and `calls` execution is a separate, later phase.

This matters because the premise of decoupling consensus/inclusion from execution is that a node must answer "is this transaction admissible" without running its execution payload. A model where admissibility depends on executing arbitrary account bytecode, to determine whether a signature check would pass or a paymaster would approve, forces validation and execution back together, defeating the separation async designs are built around. EIP-8130 keeps that separation clean: the authenticator call is small, fixed, and STATICCALL-bounded (or natively implemented), and runs at admission time independent of what the execution layer does afterward.

No EIP-8130-authored discussion of EIP-7886 or Monad-style async execution has appeared on the EthMagicians thread; this section is structural analysis.

## 7. Direct Contrast with EIP-8141's Validation Model

EIP-8141 solves the same problem from the opposite starting position. Its execution model is fully general: "any account code can verify any signature scheme and approve any payer, with arbitrary logic," with no fixed authenticator interface. Mempool safety is recovered after the fact, through a restrictive validation-prefix tier layered on top of that generality, rather than a fixed interface that constrains what can run in the first place.

| Dimension | EIP-8130 | EIP-8141 |
|---|---|---|
| What runs during validation | A declared authenticator via STATICCALL, or a native implementation for canonical authenticators | Arbitrary account bytecode, constrained to one of four validation-prefix shapes (`[self_verify]`, `[deploy]→[self_verify]`, `[only_verify]→[pay]`, `[deploy]→[only_verify]→[pay]`) |
| How the fast path is defined | Authenticator identity check against a small canonical allowlist (k1, p256, passkey, delegate) | Gas cap (`MAX_VERIFY_GAS` = 100,000) plus a banned-opcode list (ORIGIN, TIMESTAMP, BLOCKHASH, SSTORE outside `tx.sender`) plus a no-storage-reads-outside-sender rule |
| Node infrastructure needed | No tracing; one SLOAD plus a STATICCALL (or native call) at a known, fixed-or-metered cost | No general tracing for prefix-conformant transactions, but the node still executes and gas-meters arbitrary EVM up to the cap and checks the path against the banned-opcode and storage rules |
| Outside the fast path | Actor confined to ordinary EVM execution; cannot authenticate directly through mempool validation | Still consensus-valid, but must reach a builder through a private channel, not the public mempool |
| Coordination mechanism | Canonical authenticator set via companion ERC, extensible for post-quantum schemes | Fixed opcode/gas-cap rules in the EIP itself; a separate, permissive ERC-7562-based tier is intended for use cases exceeding the restrictive policy |
| New signature schemes | New canonical authenticator, added via the companion ERC | Account code using `ARBITRARY (0x0)` plus `SIGPARAM`, validated inside a conforming VERIFY frame; no protocol change needed |

EIP-8130 buys predictability by fixing the validation *interface*: only recognized authenticators run, at known cost. EIP-8141 fixes the validation *envelope*: arbitrary code may run, but only within a shape, gas cap, and opcode list. EIP-8130 never gas-meters or traces EVM for a canonical-path transaction; EIP-8141 always does, bounded to a known-shape cost. The tradeoff mirrors one raised against EIP-8130 in its own EthMagicians thread: rmeissner questioned the self-call entrypoint model and Helkomine questioned baking payment semantics into the transaction format; chunter's post 10 names it directly: "swapping arbitrary validation-code execution for fixed account configurations eliminates wasted/unpaid computation and keeps inclusion checks performant, at the cost of custom recovery logic."

A related gas-cost dispute in the "Frame Transactions vs. SchemedTransactions" thread compares EIP-8141 to EIP-8202: Giulio2002 claims EIP-8141's VERIFY-frame post-quantum verification costs roughly 63,000 gas, citing a "smart wallet tax" of 30,000-48,000 gas for contract dispatch and EVM context, against roughly 29,500 gas for direct Falcon verification under EIP-8202; ch4r10t33r counters that this conflates ERC-4337 EntryPoint overhead with the frame model's own. EIP-8130 sidesteps that dispute for canonical schemes: a chain implementing an authenticator natively pays a fixed protocol-defined cost, closer in spirit to EIP-8202's flat verification cost, but arrived at through a registered-contract-with-native-fallback path rather than a protocol-level scheme registry.

---

## Summary

EIP-8130's mempool-safety pitch rests on one design decision: validation calls a declared authenticator by identity, either via STATICCALL or a native implementation for the canonical set, rather than executing the sender's own account code. That eliminates tracing infrastructure and reputation-based DoS mitigation on the canonical path, and it composes with Account Lock, which tightens the invalidation surface to nonce consumption alone for accounts willing to freeze their actor set, letting nodes raise rate limits for locked senders and payers. The narrower state footprint this implies (one `actor_config` slot, nonce state, payer balance) is also structurally favorable for async-execution designs that need to decide admissibility without running execution logic, though the authors have not published such an analysis. The cost is coordination risk: the canonical authenticator set is a companion-ERC-governed allowlist, not a consensus-enforced one, so its usefulness depends on nodes converging on it, and any wallet or scheme outside that set loses the fast path entirely. Against EIP-8141's approach of allowing arbitrary EVM in VERIFY frames but bounding it with a gas cap and banned-opcode list, EIP-8130 trades flexibility for a stronger predictability guarantee whose growth path runs through a not-yet-finalized companion ERC.
