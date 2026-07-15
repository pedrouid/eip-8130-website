# Post-Quantum Scheme Agility

---

## TL;DR

EIP-8130's current canonical set has no post-quantum authenticator. Its extensibility story is architectural: anyone can deploy an `IAuthenticator`, but only the future companion-ERC process and coordinated client allowlists can make it usable for direct EIP-8130 transactions. The draft does not specify how such an allowlist change activates, so “no hard fork required” is not a fact established by the text.

The most important comparison correction is EIP-8202. Its current canonical draft does **not** contain P-256 or Falcon-512. It defines secp256k1 plus `SCHEME_EPHEMERAL_K1`, a Merkle-committed sequence of single-use secp256k1 keys that the proposal describes as quantum-safe against retrospective key recovery. EIP-8141 takes another path: arbitrary witness bytes can be verified by account code, while the open EIP-8288 sibling explores block-level PQ/STARK aggregation.

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

1. **Deploy and register.** Contract deployment is permissionless, and an account admin can register the authenticator. A non-canonical authenticator can be used from ordinary EVM execution, such as a recovery flow.
2. **Direct AA authentication.** The authenticator must join the canonical set that compliant nodes accept for block-level EIP-8130 authentication.

The draft says a companion ERC will maintain the canonical set and expects it to grow with new algorithms, including post-quantum ones. The companion ERC is not yet numbered, and the draft does not define client activation or code-upgrade rules for a changed set.

## 2. What EIP-8130 does not yet provide

- **No canonical PQ algorithm.** The set contains k1, p256, passkey, and delegate.
- **No PQ wire format or `actorId` rule.** A future authenticator specification must define both.
- **No aggregation primitive.** Each transaction is authenticated independently.
- **No committed PQ gas schedule.** Contract authenticators may be metered as ordinary EVM, or a chain may enshrine a canonical implementation at a fixed cost.
- **No automatic canonical-set activation.** A companion ERC can document the set, but consistent node adoption still needs a defined process.

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

The open EIP-8288 sibling targets a different problem: aggregating PQ signatures and STARK proofs at block level through a new frame mode and a `recursive_stark` header field. It remains an unmerged proposal under active review, not a capability in the current EIP-8141 draft or a deployed Ethereum feature.

EIP-8175's current draft defines secp256k1 and Ed25519. Draft PR #11431 proposes Falcon-512, but it is not merged.

## 5. Comparison

| Proposal | Current draft's PQ mechanism | Adding another scheme | Aggregation |
|---|---|---|---|
| EIP-8130 | None in the canonical set | Deploying is permissionless; direct AA use needs canonical-set specification and coordinated client adoption | None specified |
| EIP-8141 | Custom verifier through `ARBITRARY` witness bytes and account code | Account code can implement another verifier within the frame rules | Open sibling EIP-8288 proposes block-level aggregation |
| EIP-8175 | None; secp256k1 and Ed25519 only | New protocol signature type; Falcon-512 is an open draft PR | None specified |
| EIP-8202 | `SCHEME_EPHEMERAL_K1`, based on single-use Merkle-committed ECDSA keys | A distinct EIP registers another `scheme_id`; no envelope redesign | None specified |
| Tempo-like gist | None; secp256k1, P-256, and WebAuthn | Transaction-format change and client activation | None specified |

This table describes draft specifications, not deployed support.

## 6. What would change the assessment

The EIP-8130 analysis would materially change if any of the following lands:

- a numbered companion ERC with immutable canonical authenticator definitions;
- a concrete PQ authenticator with wire format, `actorId` derivation, test vectors, and gas analysis;
- a defined client-activation process for canonical-set changes;
- a signature aggregation or proof-compression proposal.

Until then, the accurate summary is: EIP-8130 has an interface and governance slot for a future PQ authenticator, not a PQ scheme or an aggregation system.

## Summary

EIP-8130 avoids baking algorithm-specific fields into its transaction envelope, which is useful scheme agility. The direct AA path is not permissionless, however; canonical membership and client adoption remain coordinated and underspecified. EIP-8202 currently offers a concrete but unusual hash-based migration strategy through single-use secp256k1 keys, not Falcon-512. EIP-8141 offers programmable verification and an unmerged aggregation direction. None of these proposals is active on Ethereum mainnet, and their different uses of “post-quantum” should not be treated as equivalent.
