# PQ Scheme Agility

---

## TL;DR

EIP-8130 adds new signature schemes by deploying a new authenticator contract and adding it to the node-side canonical allowlist, not by changing the transaction format or adding opcodes. This makes per-scheme rollout fast and permissionless at the contract layer, but the *canonical* (block-level, mempool-recognized) path still requires coordinated allowlist adoption via a companion ERC, per the spec's own "Canonical Authenticator Set" section. As of the research date (2026-07-15) the canonical set is four entries (k1, p256, passkey, delegate); no post-quantum authenticator is defined yet, and the spec has no block-level proof-aggregation mechanism comparable to what EIP-8288 is pursuing as a sibling to EIP-8141. The tradeoff against EIP-8141's outer-signatures-list approach and EIP-8202's fixed scheme-registry approach is architectural, not just cosmetic: EIP-8130 keeps new schemes out of the transaction envelope entirely, at the cost of not (yet) offering a native aggregation primitive for PQ signature bloat.

---

## 1. The mechanism: authenticator contracts, not opcodes

EIP-8130's core separation is between *authentication* (resolving a signature to an `actorId`) and *authorization* (checking that actor's `scope`/`policy`). Authentication is delegated entirely to an external contract implementing `IAuthenticator`:

```solidity
interface IAuthenticator {
    function authenticate(bytes32 hash, bytes calldata data) external view returns (bytes32 actorId);
}
```

An account registers an actor against a chosen authenticator address in its `actor_config` slot (`authenticator`, `scope`, `expiry`). At validation time the protocol resolves `sender_auth` as `authenticator || data`, calls `authenticator.authenticate(hash, data)` (via `STATICCALL`, unless the authenticator is the reserved `K1_AUTHENTICATOR` sentinel `address(1)`, in which case the protocol does native `ecrecover` directly), and checks the returned `actorId` against the account's stored config.

The spec's own framing of why this buys scheme agility: "New signature algorithms are introduced through authenticator contracts and standardized through the canonical authenticator set." Adding a scheme like Falcon or Dilithium, in principle, means writing a contract that does the verification and registering it as an actor's authenticator, exactly like registering any other verifier, with no new transaction fields, no new opcode, and no protocol upgrade for the deploy-and-register step itself.

## 2. Two authenticator tiers: registered vs. canonical

This is the load-bearing distinction the mechanism depends on, and it is easy to overstate the "no protocol upgrade" claim without it.

Any contract implementing `IAuthenticator` can be permissionlessly deployed and registered against an account's actor. But registration alone does **not** make it usable on the "8130 path" (the protocol-recognized, mempool-relayable transaction flow). Only authenticators in the **node allowlist** are accepted for block-level AA authentication. A non-canonical authenticator remains usable inside ordinary EVM execution (for example, a config-change call authenticating against an arbitrary `IAuthenticator` for wallet-defined recovery), but an actor authenticated by a non-canonical authenticator cannot authenticate an AA transaction directly.

The canonical set today, per the spec's "Canonical Authenticator Set" table:

| Name | Algorithm | Authenticator | actorId derivation |
|---|---|---|---|
| k1 | secp256k1 | `K1_AUTHENTICATOR` (native sentinel) | `bytes32(bytes20(recovered_address))` |
| p256 | P-256 | Onchain contract | `keccak256(x, y)` |
| passkey | WebAuthn / FIDO2 | Onchain contract | `keccak256(x, y)` |
| delegate | Signature delegation | Onchain contract | `bytes32(bytes20(delegated_address))` |

The spec states the set "is maintained in a companion ERC (number TBD), deployed at deterministic CREATE2 addresses across chains," and that it is "expected to grow (e.g. post-quantum) via the companion ERC process." Nodes "MUST include all canonical authenticators in their allowlist and SHOULD NOT extend it with non-canonical ones."

So the accurate claim is narrower than "PQ schemes need no protocol upgrade": *deploying* a PQ authenticator contract needs no protocol upgrade, but making that authenticator part of the block-level, mempool-safe canonical path is gated on the companion-ERC process and coordinated node-allowlist adoption, which is a governance and coordination cost even though it is not a hard-fork cost. This is a real distinction from a hard-fork-gated scheme change (the coordination is lighter and can proceed at ERC cadence rather than fork cadence), but it is not the same as "wallets and nodes independently add PQ support with zero coordination."

## 3. What EIP-8130 does not yet specify for PQ

Reading the canonical set and the spec's own forward-looking language precisely:

- **No PQ authenticator is defined today.** The canonical set is k1, p256, passkey, delegate. There is no Falcon, Dilithium, SPHINCS+, or other PQ scheme in the spec as of the 2026-07-15 research snapshot. The "post-quantum" mention is a one-line forward reference to how the set is expected to grow, not a spec section.
- **No block-level proof-aggregation mechanism.** EIP-8130's authenticator model verifies signatures per-transaction, per-actor, via ordinary contract execution (or native ecrecover for k1). There is nothing in the spec analogous to a block-header field for aggregated proofs or a dedicated frame mode for recursive STARK verification.
- **No fixed gas-cost floor for PQ verification.** Authenticator gas is either metered as ordinary EVM execution, or a chain may choose to enshrine a canonical authenticator and charge a fixed standard gas cost matching what the contract would produce. Either way, a large PQ signature (Falcon-512 witnesses run several hundred bytes; lattice schemes larger still) is verified as ordinary calldata-priced, contract-executed work unless a future canonical entry enshrines a cheaper native precompile path for it. The spec does not commit to that happening.
- **No PQ-specific `actorId` derivation guidance.** Each canonical entry defines its own `actorId` derivation (raw address recovery for k1/delegate, `keccak256(x, y)` for the two public-key schemes). A PQ authenticator would need an equivalent derivation rule defined in whatever companion ERC introduces it; the base spec gives no template for this beyond the existing four.

The honest framing: EIP-8130 gives PQ schemes a slot to grow into (an extensible allowlist, a stated intent to grow it "via the companion ERC process"), not a PQ-ready mechanism today.

## 4. Comparison: EIP-8141's outer signatures list plus EIP-8288

EIP-8141 (Frame Transaction) takes a different architectural position. Its transaction envelope carries a dedicated `signatures` field, a typed list of `[scheme, signer, msg, signature]` tuples, added by PR #11481 (merged May 22, per the sibling site's research packet) explicitly as "a forward-compat hook for future PQ signature aggregation." The base spec defines three schemes at the protocol level: `ARBITRARY (0x0)` (no protocol crypto check; raw bytes introspectable via the `SIGPARAM` opcode, the escape hatch used for custom/PQ verifiers today), `SECP256K1 (0x1)`, and `P256 (0x2)`. Any PQ scheme can already be validated today through account code plus an `ARBITRARY`-typed witness signature, without a protocol change, structurally similar to how EIP-8130 lets an authenticator contract validate an arbitrary scheme, but the two proposals diverge sharply on what happens next.

EIP-8141 has a sibling EIP, **EIP-8288**, that goes further than a contract-level verification hook: it adds a new `DEP_VERIFY_FRAME_MODE = 3` and a block-header `recursive_stark` field to support native PQ signature and STARK proof aggregation, authored by vbuterin and Thomas Coratger, still open with proof-security review ongoing as of 2026-07-15. This is a genuinely different tier of ambition than anything in EIP-8130's current text: EIP-8288 is reaching for block-level aggregation, where many individual PQ signatures (which are large, hundreds to thousands of bytes each) get folded into a single recursive proof that the block itself carries, rather than each transaction paying full linear PQ-signature calldata and verification cost. EIP-8130 has no analogous proposal on the table; its authenticator model verifies each PQ signature independently, per transaction, with no aggregation primitive.

Whether that gap matters depends on what a reader means by "PQ scheme agility." If the goal is "can wallets and nodes add a new signature scheme without a hard fork," both EIP-8130's authenticator model and EIP-8141's `ARBITRARY`-scheme-plus-account-code path already clear that bar today, agnostic of any future aggregation work. If the goal is "can the network absorb the *cost* of PQ signatures at scale without every transaction independently eating full PQ verification and calldata overhead," EIP-8288 is actively building toward that on the EIP-8141 side, and EIP-8130 has nothing comparable specified.

## 5. Comparison: EIP-8202's Scheme-Agile approach

EIP-8202 ("Schemed Transactions," Giulio Rebuffo and Ben Adams) takes a third position: a fixed, protocol-registered `authorizations` list with typed `[role_id, scheme_id, witness]` tuples. Three schemes ship in the merged spec: `SCHEME_SECP256K1 (0x00)`, `SCHEME_P256 (0x01)`, and `SCHEME_FALCON512 (0x02)`, the latter making EIP-8202 the only one of the three general-purpose alternatives with a *native, protocol-defined* PQ scheme in its base spec today (per the merged PR #11438). New schemes are added by registering a new `scheme_id`; there is no arbitrary account-code path and no frame-based validation, which the spec's authors argue keeps mempool validation deterministic and cheap (rated "Low" complexity in the sibling site's comparison work, versus EIP-8130's own authenticator-execution cost, which is either ordinary metered EVM or a chain-enshrined fixed cost).

The tradeoff is the mirror image of EIP-8130's: EIP-8202 gets a real, shipped PQ scheme (Falcon-512) into the base spec immediately, at the cost of requiring a protocol-level EIP for every future scheme addition, even though that EIP does not require touching the transaction envelope itself (a new `scheme_id` slots into the existing `authorizations` list). EIP-8130 gets a permissionless, no-fork path to *deploying* a PQ verifier contract, but has not shipped a PQ scheme, canonical or otherwise, and the canonical path for using one still runs through the companion-ERC coordination process described in Section 2.

A gas-cost dispute between the two camps is directly relevant here, per the "Frame Transactions vs. SchemedTransactions" comparison thread cited in the sibling site's research: Giulio2002 claims frame-based (EIP-8141) PQ verification costs roughly 63,000 gas due to a "smart wallet tax" of contract dispatch, storage access, and EVM context overhead, versus roughly 29,500 gas for EIP-8202's direct Falcon verification path, a claim EIP-8141 defenders (ch4r10t33r) dispute as conflating ERC-4337 EntryPoint overhead with frame overhead. EIP-8130's authenticator-contract path is structurally the same shape as the frame/account-code path being criticized here (an EVM call into a contract that does the verification, unless the chain has enshrined a fixed-cost canonical authenticator), so the same category of "contract dispatch overhead vs. direct precompile verification" argument would likely apply to an eventual EIP-8130 PQ authenticator versus a native scheme-registry entry, though no comparison thread has made that specific comparison as of the research date.

## 6. Summary table

| Proposal | Mechanism for new schemes | Protocol change needed | Native PQ scheme shipped today | Block-level aggregation |
|---|---|---|---|---|
| EIP-8130 | Deploy + register a new `IAuthenticator` contract | No (deploy); canonical/mempool-recognized path needs companion-ERC allowlist coordination | No (canonical set: k1, p256, passkey, delegate) | None specified |
| EIP-8141 | Account code + `ARBITRARY`-scheme witness signature in outer `signatures` list | No (validated via account code today) | No (hook only; PQ verification runs through account code) | Pursued via sibling EIP-8288 (open, `DEP_VERIFY_FRAME_MODE = 3`, block-header `recursive_stark` field) |
| EIP-8202 | Register a new `scheme_id` in `authorizations` | Yes, a protocol EIP per scheme (no envelope change) | Yes, Falcon-512 (`0x02`) shipped in the merged spec | None specified |

## 7. What would change this analysis

Three concrete developments would materially change EIP-8130's PQ posture, none of which have happened as of 2026-07-15: (1) a companion ERC proposing a specific PQ authenticator contract and requesting canonical-set inclusion, (2) any spec text addressing aggregation of multiple authenticator-verified signatures at the block or mempool level, or (3) explicit gas-cost or calldata-size analysis for a PQ authenticator comparable to the Falcon-cost figures already circulating in the EIP-8141/EIP-8202 comparison thread. Until one of these appears, the accurate summary is that EIP-8130 has an extensible slot for PQ schemes, not a PQ scheme, and no aggregation story at all.

---

## Summary

EIP-8130's authenticator-contract model gives it a genuinely fast, no-fork path for *deploying* new signature-verification logic, including PQ schemes, at the individual wallet/account level; this is a real structural advantage over EIP-8202's protocol-EIP-per-scheme requirement. But the mechanism's "no protocol upgrade" pitch applies most cleanly to non-canonical, EVM-execution-only usage; the canonical, mempool-recognized path still depends on companion-ERC coordination and node-allowlist adoption, and as of this research date no PQ authenticator exists in that canonical set. Compared to EIP-8141's sibling EIP-8288, which is building toward native block-level PQ/STARK aggregation, EIP-8130 currently has no aggregation primitive at all; each authenticator-verified signature is checked independently, at whatever gas cost ordinary contract execution (or a chain-enshrined fixed cost) assigns it. The near-term overlap between EIP-8130 and EIP-8202 is closer than it might first appear: both ultimately price a PQ signature as either metered EVM/authenticator execution or an explicit registered scheme, and the "smart wallet tax" critique raised against frame-based verification in the EIP-8141/EIP-8202 thread would apply with similar force to an eventual EIP-8130 PQ authenticator that runs through ordinary contract dispatch rather than a chain-enshrined precompile.
