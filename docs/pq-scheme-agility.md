# Post-Quantum Scheme Agility

---

## TL;DR

EIP-8130's current canonical set has no post-quantum authenticator. Its extensibility story is architectural: anyone can deploy an `IAuthenticator`, and since PR [#12204](https://github.com/ethereum/EIPs/pull/12204) (Aug 19) the activation question has an answer. On a base layer the enshrined canonical set changes only through a hard fork; other chains may extend it through the companion ERC; and a permissive chain can accept a non-canonical PQ authenticator on the transaction path within `MAX_AUTHENTICATION_GAS`, at metered rather than enshrined cost. "No hard fork required" is therefore false for L1 canonical status. Its sibling EIP-8430 is secp256k1-only on its own; a PQ signature reaches it only through the EIP-8130 integration, and open draft EIP-8388 would extend the same Keystore authentication to EIP-1559 and EIP-2930 transactions.

The most important comparison correction is EIP-8202. Its current canonical draft does **not** contain P-256 or Falcon-512. It defines secp256k1 plus `SCHEME_EPHEMERAL_K1`, a Merkle-committed sequence of single-use secp256k1 keys that the proposal describes as quantum-safe against retrospective key recovery. EIP-8141 takes another path: arbitrary witness bytes can be verified by account code, EIP-8397 adds permissionless pure authenticators at a fixed gas cost, and the merged EIP-8288 sibling specifies in-mempool signature and proof aggregation.

## 1. EIP-8130: an extension point, not a PQ scheme

EIP-8130 separates authentication from authorization through one interface:

```solidity
interface IAuthenticator {
    function authenticate(bytes32 hash, bytes calldata data)
        external view returns (bytes32 actorId);
}
```

The base transaction does not need a new field for every signature algorithm. A new verifier can use the same `authenticator || data` encoding and return its own `actorId` derivation.

There are two adoption tiers:

1. **Deploy and register.** Contract deployment is permissionless, and an account admin can register the authenticator. It is always usable from EVM execution, such as a recovery flow, through any Keystore consumer.
2. **Permissive transaction path.** On a chain with a permissive acceptance policy, the authenticator can authenticate EIP-8430 transactions directly if its `STATICCALL` returns within `MAX_AUTHENTICATION_GAS` (suggested 100,000). That cap matters for PQ schemes with large keys and expensive verification.
3. **Canonical status.** Enshrined at constant cost on every native consumer: by hard fork on L1, by companion ERC elsewhere.

Because actors reference authenticators by address, an account adopts a newly canonical scheme by authorizing a new actor, with no migration or address change. The companion ERC is still not numbered.

## 2. What EIP-8130 does not yet provide

- **No canonical PQ algorithm.** The set contains k1, p256, passkey, and delegate.
- **No PQ wire format or `actorId` rule.** A future authenticator specification must define both.
- **No aggregation primitive.** Each transaction is authenticated independently.
- **No committed PQ gas schedule.** A non-canonical PQ authenticator must fit under `MAX_AUTHENTICATION_GAS`; a canonical one would need its own enshrined constant.
- **No fast L1 path to canonical PQ.** The process is now defined, but it is a hard fork.

Open extension EIP-8388 would let EIP-1559 and EIP-2930 transactions authenticate through the Keystore, so a future PQ actor could sign ordinary transaction types too. The first public experiment pairing the Keystore with PQ aggregation came from outside the EIP: sm-stack's November 2 [OP Stack proof of concept](https://ethresear.ch/t/its-time-to-scale-the-trust-eip-8288-on-op-stack/26208) for EIP-8288 runs on EIP-8130 and EIP-8430 and adds a "statement authenticator" whose actors bind a proving program's verifying key, a key, and a format tag, so the PQ signature stays out of the transaction and only aggregated statements reach the chain. It is a prototype, not a canonical authenticator.

`DEFAULT_EOA_REVOKED` is useful preparation, not cryptography. New and imported accounts do not retain an implicit secp256k1 self-actor unless they explicitly add one, which avoids accidentally leaving a classical fallback after a wallet chooses another authenticator.

## 3. EIP-8202: ephemeral secp256k1 in the current draft

EIP-8202's current `master` text defines two schemes:

| ID | Scheme | Mechanism |
|---|---|---|
| `0x00` | `SCHEME_SECP256K1` | Standard ECDSA with legacy address derivation |
| `0x01` | `SCHEME_EPHEMERAL_K1` | A Merkle root commits to single-use secp256k1 public keys; the account nonce selects the next leaf |

The ephemeral witness includes the Merkle root, one recoverable ECDSA signature, and a 20-level Merkle proof. The public key is recovered from the signature. The draft gives a 737-byte witness, a 43,008-gas calldata overhead relative to ordinary ECDSA under its uniform calldata floor, and a 5,000-gas scheme surcharge. A depth-20 tree supports `2^20` transactions before migration to a new account or scheme.

The security claim is specific. Once transaction `i` lands, learning its private key does not authorize nonce `i + 1`; an attacker would have to recover the unrevealed next public key from its Keccak-256 leaf. The draft still acknowledges a mempool exposure window: an attacker capable of breaking ECDSA within one block time could race the pending transaction.

P-256 and Falcon-512 appeared during PR #11438's development and in its original PR description, but the final merged commit removed both. They are listed only as possible future `scheme_id` additions. New IDs require a distinct EIP and protocol implementation, even though the outer envelope need not change.

## 4. EIP-8141 and EIP-8288

EIP-8141's outer `signatures` list includes `ARBITRARY (0x0)`. The protocol does not verify those bytes cryptographically; account code reads them through `SIGPARAM` and performs custom verification in a VERIFY frame. Under the proposal, that can express a PQ verifier without adding a protocol-native scheme.

[PR #12011](https://github.com/ethereum/EIPs/pull/12011) proposed formalizing EIP-8141's protocol-validated scheme table as a consensus registry, with `ARBITRARY` retained for account-code experimentation. It closed without merging on July 29, so the current EIP-8141 draft still has no standalone scheme-registry process.

EIP-8288 targets a different problem: aggregating PQ signatures and STARK proofs. It merged as a Draft on September 9 (PR #11772) and was renamed "In-mempool signature and proof aggregation"; its `DEP_VERIFY_FRAME_MODE` moved to `4` in PR #12309. EIP-8397 (merged October 14) adds an `AUTHENTICATOR` scheme: a permissionless contract returns a `key_id` from `authenticate(digest, proof)` in an enforced pure context at a fixed 52,600 gas. That is EIP-8130's interface without a canonical set, and a direct route for PQ verifiers. Neither is deployed.

EIP-8175's current draft defines secp256k1 and Ed25519. Draft PR #11431 proposes Falcon-512, but it is not merged.

## 5. Comparison

| Proposal | Current draft's PQ mechanism | Adding another scheme | Aggregation |
|---|---|---|---|
| EIP-8130 | None in the canonical set | Deploying is permissionless; permissive chains accept it within a gas cap; canonical status takes a hard fork on L1 | None specified |
| EIP-8141 | Custom verifier through `ARBITRARY` witness bytes, account code, or an EIP-8397 authenticator | Permissionless; registry PR #12011 closed without merge | Merged sibling EIP-8288 specifies in-mempool aggregation |
| EIP-8175 | None; secp256k1 and Ed25519 only | New protocol signature type; Falcon-512 is an open draft PR | None specified |
| EIP-8202 | `SCHEME_EPHEMERAL_K1`, based on single-use Merkle-committed ECDSA keys | A distinct EIP registers another `scheme_id`; no envelope redesign | None specified |
| Tempo-like gist | None; secp256k1, P-256, and WebAuthn | Transaction-format change and client activation | None specified |

This table describes draft specifications, not deployed support.

## 6. What would change the assessment

The EIP-8130 analysis would materially change if any of the following lands:

- a numbered companion ERC with immutable canonical authenticator definitions;
- a concrete PQ authenticator with wire format, `actorId` derivation, test vectors, and gas analysis showing it fits `MAX_AUTHENTICATION_GAS`;
- a hard-fork proposal adding a PQ scheme to an L1 canonical set;
- a signature aggregation or proof-compression proposal for the Keystore path.

Until then, the accurate summary is: EIP-8130 has an interface and a defined governance path for a future PQ authenticator, not a PQ scheme or an aggregation system.

## Summary

EIP-8130 avoids baking algorithm-specific fields into any transaction envelope, which is useful scheme agility. Its direct path is permissionless only on permissive chains and only within a gas cap; canonical membership on L1 is fork-paced. EIP-8202 currently offers a concrete but unusual hash-based migration strategy through single-use secp256k1 keys, not Falcon-512. EIP-8141 offers programmable verification, permissionless EIP-8397 authenticators, and a merged aggregation draft. None of these proposals is active on Ethereum mainnet, and their different uses of “post-quantum” should not be treated as equivalent.
