# Mempool Safety and Validation

---

## TL;DR

EIP-8130 does not execute the **sender account's** bytecode to decide whether a transaction is valid. It selects a declared authenticator from a canonical allowlist, then either runs native `ecrecover` for `K1_AUTHENTICATOR` or calls the authenticator contract through `STATICCALL`.

That is a narrower and more accurate claim than “no EVM during validation.” `STATICCALL` prevents writes, but an authenticator can still execute EVM code, read storage, and make further static calls. A chain may enshrine a canonical authenticator at a fixed cost, but the draft also permits ordinary metered EVM execution. The model makes the validation surface enumerable by authenticator identity; statelessness depends on the authenticator implementation.

::: info Reading the proposal precisely
This page distinguishes rules in the current draft from stronger properties that hold only under extra conditions. EIP-8130 is not deployed on Ethereum mainnet.
:::

## 1. What the proposal removes from validation

The sender account does not expose a `validateUserOp`-style program that a node must discover and simulate. Instead, `sender_auth` names an authenticator directly:

```solidity
interface IAuthenticator {
    function authenticate(bytes32 hash, bytes calldata data)
        external view returns (bytes32 actorId);
}
```

The protocol checks the returned `actorId` against the account's stored configuration and then applies scope rules. This separation gives a node advance knowledge of which canonical authenticator address it will execute.

| Claim | What the draft actually guarantees |
|---|---|
| Sender wallet code does not run during authentication | Yes. Authentication uses the declared canonical authenticator instead |
| No EVM code runs during authentication | No. Non-k1 authenticators are contracts unless the chain enshrines them |
| The authenticator cannot change state | Yes. `STATICCALL` forbids writes and logs |
| The authenticator cannot read state or call other contracts | No. Static execution may read state and make further static calls |
| Authentication always has a fixed gas cost | No. Fixed pricing is optional; ordinary EVM metering is also allowed |

Authenticator addresses may not themselves contain an EIP-7702 delegation indicator. That removes one form of code indirection, but it does not restrict the authenticator's internal call graph.

## 2. What a node validates

The draft's nine-step mempool flow includes more than a single storage read:

1. Parse the transaction and bound the shape of `account_changes`.
2. Resolve the sender, using the explicit field or native `ecrecover`.
3. Resolve effective actor state, including any proposed create/config entries.
4. Check Account Lock and simulate config changes when present.
5. Authenticate the sender and enforce sender and nonce scope.
6. Resolve and authenticate the payer when sponsored.
7. Check nonce or `replay_id`, transaction expiry, actor expiry, payer balance, and fee rules.
8. Apply node-configured pending-transaction limits.
9. Apply replacement rules.

The minimum state footprint varies by transaction and authenticator. It can include the packed account-state slot or `actor_config`, nonce state, payer balance, payer configuration, lock state, and any state read by a contract authenticator. Policy-manager and policy-commitment slots are not read for transaction validity; the policy gate is enforced later during call execution.

## 3. Canonical authenticators

The current draft lists four canonical entries:

| Name | Mechanism | Direct-path execution |
|---|---|---|
| k1 | secp256k1 | Native `ecrecover` through `K1_AUTHENTICATOR` |
| p256 | P-256 | Onchain authenticator contract, optionally enshrined by a chain |
| passkey | WebAuthn / FIDO2 | Onchain authenticator contract, optionally enshrined by a chain |
| delegate | One account vouches for another | Authenticator contract that also resolves nested account state |

Nodes MUST include the canonical set and SHOULD NOT add non-canonical authenticators. A non-canonical authenticator can still be used from ordinary EVM execution, such as a wallet-specific recovery flow, but it cannot authenticate a direct EIP-8130 transaction.

The canonical set narrows the universe of code that nodes accept. It does not, by itself, make every entry stateless. The delegate authenticator is the clearest counterexample because its result depends on another account's actor configuration. The draft also does not yet specify the companion ERC, code-hash pinning rules, or how a canonical-set update activates consistently across clients.

## 4. Account Lock and higher-rate tiers

Account Lock freezes actor changes and delegations for an account. Nodes may use a sufficiently long lock delay as a signal for higher pending-transaction limits.

The exact condition matters. The draft says a locked sender has a stable signature **when combined with a stateless authenticator**. A lock freezes the actor set; it does not freeze external state an authenticator may read. Nonce consumption remains a primary invalidator, but payer balance, expiry, and authenticator dependencies can still matter.

For a payer, the proposed higher tier has another condition: the account must run recognized bytecode that restricts ETH movement while locked. Lock alone does not prove the payer balance can decrease only through gas.

| Tiering signal | What it establishes | What it does not establish |
|---|---|---|
| Locked sender | Actor configuration cannot change during the notice window | A stateful authenticator's dependencies are unchanged |
| Locked payer | Payer actors cannot change | Payer ETH cannot move through account code |
| Locked payer plus trusted bytecode | Actor set is frozen and recognized code restricts ETH movement | The node's rate-limit policy is standardized |

Rate limits and minimum lock delays remain node policy. The draft gives six hours only as an example, not a protocol constant.

## 5. Statelessness and witness costs

EIP-8130 can have a smaller and more predictable witness footprint than arbitrary sender-account validation, but the size is implementation-dependent:

- The k1 path needs native signature verification plus account, nonce, balance, and expiry state.
- An enshrined stateless authenticator can have a similarly fixed dependency set.
- An ordinarily metered contract authenticator requires its bytecode and every account or storage proof it reads, including downstream static calls.
- The delegate authenticator adds nested account-configuration dependencies.
- Nonce-free mode adds the fixed-capacity `replay_id` ring buffer as consensus state. The buffer does not grow without bound, but a stateless client must still witness the relevant entries.

The useful claim is “known implementation and enumerable dependencies,” not “one SLOAD regardless of authenticator.” This distinction also determines how well the proposal composes with asynchronous or partially stateless execution designs.

## 6. Comparison with EIP-8141

| Dimension | EIP-8130 | EIP-8141 |
|---|---|---|
| Validation program | Canonical authenticator selected by address | Account-selected VERIFY-frame program |
| Public relay boundary | Canonical authenticator set plus EIP-8130 validity checks | Four recognized validation-prefix shapes plus trace and opcode rules |
| EVM during validation | Contract `STATICCALL`, unless k1 or enshrined | VERIFY-frame EVM simulation |
| Gas bound | Authenticator-specific metering or optional fixed enshrined cost | `MAX_VERIFY_GAS = 100,000` for the public validation prefix |
| State dependencies | Defined by account config and the selected authenticator | Recorded sender slots, paymaster state, and allowed validation-prefix dependencies |
| Outside the main path | Non-canonical authenticators cannot directly authenticate AA transactions | Nonconforming frame transactions may remain consensus-valid but are not publicly relayed |

EIP-8141 also defines special handling for canonical paymasters and a limited public-mempool path for non-canonical paymasters. Earlier text on this site incorrectly described all non-canonical paymasters as private-channel only.

## 7. Open specification questions

The source audit leaves several questions that should not be papered over with stronger marketing language:

- How is a companion-ERC change to the canonical set activated without client disagreement?
- Are canonical authenticator runtime code hashes immutable or otherwise pinned?
- What state-dependency rules, if any, must a canonical authenticator satisfy?
- How should nodes meter a contract authenticator with downstream static calls?
- Does the “invalidators are `actor_config` changes and nonce consumption” security claim need to be qualified for stateful and delegated authenticators?

These are specification gaps, not proof that the model is unsafe. They determine how strong its mempool and statelessness guarantees can be in an implementation.

## Summary

EIP-8130 replaces open-ended sender-account validation with a canonical authenticator selected by identity. That is a meaningful reduction in validation uncertainty. It does not eliminate EVM execution, state reads, or all revalidation dependencies. The strongest fast-path properties require a stateless or enshrined authenticator, and the draft itself uses that qualification when discussing locked-account rate limits. Account Lock, canonical identity, and optional enshrinement are useful building blocks; claims of “no tracing,” “one SLOAD,” or “nonce is the only invalidator” need those conditions stated explicitly.
