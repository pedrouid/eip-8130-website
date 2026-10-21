# Authenticator Model

---

## TL;DR

EIP-8130 authenticates an actor by calling a fixed interface, `authenticate(hash, data) -> actorId`, on an onchain authenticator via `STATICCALL`, rather than executing the account's own code. `K1_AUTHENTICATOR` (`address(1)`) is a protocol sentinel resolved natively via `ecrecover`. Since PR [#12386](https://github.com/ethereum/EIPs/pull/12386) (Oct 8, 2026), this model belongs to a transport-neutral Keystore: any consumer, whether an EIP-8430 transaction, an EIP-8141 frame account, an ERC-4337 account, or an application, must authenticate equivalently to `authenticateActor`.

Which authenticators a native transaction path accepts is now a chain's **acceptance policy**. Every chain accepts the canonical set at a constant enshrined cost. A permissive chain (typically L1) also accepts any authenticator that returns within `MAX_AUTHENTICATION_GAS`; a canonical-only chain (typically L2) does not. `STATICCALL` prevents writes, not control flow, storage reads, or nested static calls, so predictability still comes from selecting known implementations rather than from the interface itself.

---

## 1. The Core Mechanism

Every Keystore signature check calls the same interface:

```solidity
interface IAuthenticator {
    function authenticate(
        bytes32 hash,
        bytes calldata data
    ) external view returns (bytes32 actorId);
}
```

An authorization is `authenticator (20 bytes) || data`. The Keystore's `authenticateActor(account, hash, auth)` calls `authenticator.authenticate(hash, data)`, requires a non-zero `actorId`, and checks that `actor_config(account, actorId)` names the same authenticator, so an authenticator cannot claim an actor registered against another one. It then checks liveness and returns `(actorId, scope)`. Scope and policy authorize what that actor may do; the authenticator only answers "who signed."

### K1_AUTHENTICATOR: the native special case

`K1_AUTHENTICATOR` is `address(1)`. When it appears, the protocol performs `ecrecover` directly. PR [#12173](https://github.com/ethereum/EIPs/pull/12173) standardized the result as `actorId = bytes32(uint256(uint160(recovered_address)))`.

The same identity space serves two registration states. An account's own secp256k1 key is its implicit admin **self-actor**, resolved from inline fields in the packed account-state slot whenever the native path recovers the account address and `DEFAULT_EOA_REVOKED` is unset. This is why an EOA needs no Keystore write to be a Keystore account. Registering the self-actor explicitly lets a wallet attach a scope or expiry to the same key. Generic authenticator contracts never satisfy the self-actor branch, even if they return the account's own `actorId`; otherwise an arbitrary authenticator could authenticate as any EOA. `address(0)` is never valid.

### Canonical authenticators and acceptance policy

The initial canonical set, per the current spec:

| Name | Algorithm | Authenticator | `actorId` derivation |
|---|---|---|---|
| k1 | secp256k1 | `K1_AUTHENTICATOR` (native sentinel) | Right-aligned recovered address |
| p256 | P-256 | Onchain contract | `keccak256(x \|\| y)` |
| passkey | WebAuthn / FIDO2 | Onchain contract | `keccak256(x \|\| y)` |
| delegate | Signature delegation | Onchain contract | Right-aligned delegated address |

The canonical set is the baseline every **native** consumer must accept, at a constant enshrined cost whose execution must match the contract exactly. It is catalogued at deterministic CREATE2 addresses in a companion ERC that still has no number. PR [#12204](https://github.com/ethereum/EIPs/pull/12204) (Aug 19) settled two questions this page previously listed as open: on a base layer the enshrined set changes only through a hard fork, and other chains may extend it through the companion-ERC process. Because actors reference authenticators by address, an account adopts a newly canonical scheme by authorizing a new actor, with no migration or address change.

Beyond the canonical set, PR #12204 replaced the old "nodes SHOULD NOT extend the allowlist" rule with an explicit acceptance policy, now stated in EIP-8130's EIP-8430 integration section:

| Policy | Typical chain | Non-canonical authenticators on the transaction path |
|---|---|---|
| Permissive | L1 | Accepted if the `STATICCALL` returns within `MAX_AUTHENTICATION_GAS` (suggested 100,000), metered as EVM; nodes must track the state it reads |
| Canonical-only | L2 | Not accepted; still usable through EVM paths such as recovery calls |

Draft PR [#12210](https://github.com/ethereum/EIPs/pull/12210) would refine the permissive case into four tiers by code hash (CANONICAL, PURE, BOUNDED, ARBITRARY) that govern mempool propagation and rate limits without changing consensus validity.

### The delegate authenticator

The delegate authenticator lets account A register an actor with `actorId` equal to account B's address; any key that can authenticate as B may then authenticate as A, bounded by the scope A grants. Delegation cannot chain (the nested authenticator cannot itself be the delegate authenticator), and the nested authenticator must be canonical, which keeps total validation work bounded. The remaining details now live in the canonical repository rather than the EIP. This underlies multisig- and recovery-style setups without a second verification model.

---

## 2. What Nodes Actually Check, and Why That's the Point

On EIP-8430 with the Keystore integration, a node resolves the sender and payer actors exactly as `authenticateActor` does, over the transaction's signature hashes. For k1 that is native `ecrecover`; for another canonical authenticator, an enshrined constant-cost check; for an accepted non-canonical one, a metered `STATICCALL` plus one `actor_config` read. A node never discovers or executes the sender account's own validation path.

The Security Considerations now state the qualification this page previously had to add: canonical authenticators are pure functions of `(hash, data)` and the resolved `actor_config`, so their invalidators are `actor_config` changes, lock changes, and nonce consumption. Accepting non-canonical authenticators that read mutable state widens that set and obliges the consumer to track it. The delegate authenticator remains the canonical entry with a cross-account dependency.

This is the structural choice that most sharply separates EIP-8130 from the other native-AA designs compared on this site:

- **EIP-8141's VERIFY frames** run arbitrary EVM inside the validation prefix, bounded for public relay by `MAX_VERIFY_GAS` (100,000), banned opcodes, storage-access rules, and recognized prefix shapes. Its companion EIP-8397 ("Frame Authenticator Signatures," merged October 14 via PR [#12244](https://github.com/ethereum/EIPs/pull/12244) by leekt) adds an `AUTHENTICATOR` signature scheme in which `authenticator.authenticate(digest, proof)` returns a `key_id` under a fixed `AUTHENTICATOR_GAS_LIMIT`, with no registry or allowlist, leaving account authorization to the VERIFY frame. It converges on the same authenticate-then-authorize split, with permissionless authenticators in place of a canonical set.
- **EIP-7702 delegation** points an EOA's code at an implementation that runs during execution. EIP-8430 keeps a delegation entry, authorized only by the native secp256k1 path, and the EIP-8130 integration additionally requires an admin sender on an unlocked account.
- **ERC-4337's `validateUserOp`** is the paradigm of arbitrary validation code. EIP-8130's motivation critiques it without naming it, and now lists ERC-4337 accounts as Keystore consumers rather than only as import sources.

EIP-8202 and the Tempo-like gist avoid contract calls through fixed scheme dispatch; EIP-8223 and EIP-8224 avoid EVM execution through narrower scope. EIP-8130 sits between those and EIP-8141's programmable path: it may run contract code, but only through one return shape and under each chain's acceptance policy.

---

## 3. What Expressiveness This Model Gains and Loses

**Gained**: an enumerable validation surface on canonical-only chains and a bounded one on permissive chains. `K1_AUTHENTICATOR` gives plain secp256k1 accounts a native path. New schemes fit the existing interface without a new transaction type, and the transport-neutral framing means the same actor means the same thing on every consumer.

**Lost**: the account cannot place arbitrary account-specific validation logic on the transaction path. The protocol consumes only `(actorId, scope)`; an authenticator can branch or read state, but cannot write state, change fee fields, or bypass scope checks. EIP-8141's VERIFY frames fold more account-specific logic into validation and therefore need trace rules and a gas cap for public relay.

Custom recovery illustrates the two-tier model. A non-canonical authenticator can implement wallet-specific recovery and be used from EVM execution anywhere. On a permissive chain it may also authenticate a transaction directly within the gas cap; on a canonical-only chain it may not. The EthMagicians thread frames losing direct-path custom recovery on such chains as deliberate, with ERC-4337 modules, relayer-assisted recovery, or a policy manager as fallbacks.

---

## 4. The ERC-1271 / Operational-Signing Angle

PR [#12135](https://github.com/ethereum/EIPs/pull/12135) separated raw authentication from account-aware signature validation. `authenticateActor` resolves an actor over a raw digest. `validateSignature(account, hash, auth)` takes `sigType (1) || authenticator (20) || data`, authenticates an account- and chain-scoped `replaySafeHash` under a `Local (0x01)` or `Multichain (0x02)` domain, and returns `(actorId, scope)` so a caller can attribute a signature to a specific key. ERC-1271 is a compatibility wrapper on top, and the spec now notes that, because the canonical set is small and authority lives in one flat slot, `validateSignature` can run natively and be exposed as a precompile, something ERC-1271's callback into account code cannot do.

ERC-1271 signing is not a separate grant bit. It is authorized for any actor with **operational authority**: admin, or any scope carrying `OPERATOR`. PR #11918 (Jul 13) introduced this as `admin || (SENDER && !POLICY)` when it removed the standalone SIGNER bit, reasoning in that version of the text that an operational key can already call `approve` or `transfer` directly, so a signing grant conferred nothing new. PR [#12333](https://github.com/ethereum/EIPs/pull/12333) (Sep 14) renamed SENDER to OPERATOR and made it override POLICY, so the carve-out disappeared: an `OPERATOR | POLICY` actor is an ungated operator, and wallets are told not to set both.

The original scope model (PR #11388, Mar 9) had a standalone `SIGNATURE` bit among four grants. Its removal is a case study in the tradeoff above: gating "may sign" separately from "may call" added a bit to track without adding security. Draft PR [#12462](https://github.com/ethereum/EIPs/pull/12462) applies the same logic to payment and nonce grants, arguing an operator "can already move all of the account's ETH through its calls."

The account-scoped replay protection first appeared in Base implementation [PR #45](https://github.com/base/eip-8130/pull/45) and became canonical in typed-envelope form with PR #12135.

---

## 5. How New Authenticators Get Deployed and Adopted

Deployment is permissionless. Registering an authenticator against an actor needs that account's admin. Direct transaction authentication then depends on the chain: a permissive chain accepts it within the gas cap, a canonical-only chain needs canonical membership, and on a base layer canonical membership changes only through a hard fork. That resolves the activation question earlier versions of this page left open, at the price of making L1 canonical-set growth fork-paced.

The practical effect is a two-speed adoption model with a third lane. A wallet can use a novel authenticator immediately in EVM execution everywhere, directly on permissive chains, and at enshrined cost only after canonical adoption. The same instinct, a narrow fast path with broader functionality behind slower registration, traces back to rmeissner's post #5 (Jan 22, 2026), which worried that bundling too much into one EIP would hurt adoption.

EIP-8141 explored a contrasting consensus registry in [PR #12011](https://github.com/ethereum/EIPs/pull/12011), closed without merging on July 29; EIP-8397's registry-free `AUTHENTICATOR` scheme is the model that has since merged on that side.

The `Existing Smart Contracts` path changed with PR #12333: an already-deployed ERC-4337 account now calls the parameterless `importAccount()` itself, and the Keystore installs the actor set returned by the account's own `confirmKeystoreImport()` callback, replacing the earlier ERC-1271-signed import.

---

## Summary

EIP-8130 calls `authenticate(hash, data) -> actorId` via `STATICCALL`, with `K1_AUTHENTICATOR` as the native secp256k1 case and the canonical set as the baseline every native consumer accepts. Since August, a chain's acceptance policy decides whether other authenticators reach the transaction path, bounded by `MAX_AUTHENTICATION_GAS`; since October, the whole model is a transport-neutral Keystore that other transaction formats, including EIP-8141 frame accounts, can consume. The interface avoids executing account validation code but not EVM execution or state reads for contract authenticators. Canonical-set growth is now specified (hard fork on L1, companion ERC elsewhere) rather than open.
