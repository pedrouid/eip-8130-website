# Competing and Complementary Standards

---

## TL;DR

EIP-8130 narrows validation by selecting a canonical authenticator by address instead of executing the sender account's own code. Non-k1 authenticators still execute through `STATICCALL` unless a chain enshrines them. EIP-8141 is the programmable counterpoint, using VERIFY frames plus restrictive public-mempool rules. EIP-8175 keeps sender signatures fixed but runs a programmable sponsorship prelude. EIP-8202 uses direct scheme dispatch and currently defines standard and single-use ephemeral secp256k1. The Tempo-like gist hardcodes a broader wallet-UX bundle. EIP-8223 and EIP-8224 are unmerged, narrow sponsorship and gas-bootstrap drafts rather than complete account models.

---

## 1. The Declarative-Programmable Spectrum

The proposals below differ mainly in how much EVM execution gates whether a node accepts a transaction into its mempool. At one end, validity is a pure cryptographic check (or a lookup against a small, protocol/ERC-fixed contract set); at the other, validity depends on running arbitrary account code subject to gas caps and opcode restrictions.

| Position | Proposal | What gates validity |
|---|---|---|
| Most programmable | EIP-8141 | Arbitrary EVM in VERIFY frames, constrained to four validation-prefix shapes for public relay |
| | EIP-8175 | Cryptographic sender auth (ecrecover/Ed25519); programmable `fee_auth` prelude for sponsorship |
| Declarative (this site) | **EIP-8130** | STATICCALL to a canonical/allowlisted authenticator, or native `ecrecover`; account logic itself runs only post-inclusion |
| | EIP-8202 | Direct verification of secp256k1 or Merkle-committed ephemeral secp256k1, no contract call |
| Most declarative | EIP-XXXX (Tempo-like) | Purely cryptographic (secp256k1 / P-256 / WebAuthn), fixed protocol-level set, no contract call |

**Off-axis, complementary proposals** (compose with any of the above rather than competing on the generality axis):
- EIP-8223 — static gas sponsorship via a canonical payer registry
- EIP-8224 — shielded gas funding via a ZK proof over fee notes

The distinction that separates EIP-8130 from EIP-8202 and EIP-XXXX is subtle but real: EIP-8130's non-k1 canonical authenticators are contracts invoked via `STATICCALL`. What EIP-8130 fixes is which implementations may gate validity, not whether EVM executes at all. EIP-8202 and the Tempo-like gist skip the authenticator-contract step for protocol-defined schemes.

---

## 2. EIP-8141 — Frame Transaction

Authored by Felix Lange, Vitalik Buterin, lightclient, and others, submitted as PR #11202 (Jan 29, 2026). It introduces a new EIP-2718 type (`0x06`) built from up to 64 purpose-labeled "frames" (DEFAULT, VERIFY, SENDER), with an `APPROVE` opcode as the core validation primitive and arbitrary account code able to verify any signature scheme. Its two-tier model keeps execution fully general while restricting *public mempool relay* to a small set of validation-prefix shapes with a 100,000-gas cap and banned-opcode list. That is the opposite of EIP-8130's fixed-authenticator gate, since any code that fits the prefix shape can still authenticate a relayable transaction. See [/eip-8141](/eip-8141).

## 3. EIP-8175 — Composable Transaction

Authored by Dragan Rakita, created Feb 26, 2026 (spec PR #11355, merged Mar 10). A new type (`0x05`) bundling flat, typed "capabilities" (CALL, CREATE) with a separated `signatures` list (SECP256K1, ED25519) and an optional `fee_auth` field for programmable sponsorship. Sender authentication is purely cryptographic; `fee_auth` executes EVM code. EIP-8130 instead gives sender and payer the same fixed authenticator interface, which can also execute EVM code when the authenticator is a contract. See [/eip-8175](/eip-8175).

## 4. EIP-8202 — Scheme-Agile Transaction

Authored by Giulio Rebuffo and Ben Adams, created Mar 22, 2026, and merged as a Draft via PR #11438 (Apr 22). It defines one execution payload plus typed `authorizations` and `extensions`. The current scheme set is secp256k1 and `SCHEME_EPHEMERAL_K1`, a depth-20 Merkle commitment to single-use ECDSA keys. P-256 and Falcon-512 were removed before merge despite appearing in the PR's initial summary. Future schemes use new protocol `scheme_id` values specified by distinct EIPs. See [/eip-8202](/eip-8202).

## 5. EIP-8223 — Contract Payer Transaction

Authored by Ben Adams and still only in open PR #11509. It would charge gas to `tx.to` via a canonical payer-registry predeploy at `address(0x13)`, using static reads rather than EVM execution for validation. The PR explicitly positions the registry as infrastructure for future general solutions, naming EIP-8141 and EIP-8175. Composition with EIP-8130 is this site's architectural inference, not a relationship claimed in the source. See [/eip-8223](/eip-8223).

## 6. EIP-8224 — Counterfactual Transaction

Also authored by Ben Adams and still only in open PR #11518. It proposes a shielded gas-funding bootstrap using an fflonk proof over BN254 and canonical fee-note contracts. The source describes a one-shot path into EIP-8223 sponsorship. Using it to seed an EIP-8130 account is plausible but remains this site's inference; no direct EIP-8130 integration is specified. See [/eip-8224](/eip-8224).

## 7. EIP-XXXX — Tempo-like Transactions (gakonst)

A pre-draft gist by Georgios Konstantopoulos (Paradigm/Reth), with no EIP number, no PR to `ethereum/EIPs`, and no EthMagicians thread. It bundles a fixed set of wallet UX primitives (atomic batching, validity windows, gas sponsorship via `fee_payer_signature`, 2D nonces, and passkey signatures for P-256 and WebAuthn), with explicitly "constrained scope over general framework" as its philosophy. Its schemes are hardcoded into the proposed protocol. EIP-8130 moves extensions into a companion-ERC and canonical-set process, but has not yet defined how clients activate those changes. See [/eip-xxxx](/eip-xxxx).

---

## 8. Post-Quantum / Signature-Scheme Agility

| Proposal | PQ capability in the current draft | Path to add a new scheme |
|---|---|---|
| EIP-8130 | None. Canonical set is k1, P256, WebAuthn, delegate | Companion ERC (number TBD) is intended to define new canonical authenticators; client activation remains unspecified. New accounts default to revoking the implicit secp256k1 self-actor |
| EIP-8141 | No native PQ scheme. If activated, `ARBITRARY (0x0)` could carry a witness checked by PQ-verifier account code; open EIP-8288 proposes PQ/STARK aggregation | Account code can add verification logic without a new protocol scheme; protocol aggregation needs a sibling EIP |
| EIP-8175 | None merged. SECP256K1 and ED25519 are defined; Falcon-512 is an open draft PR | New scheme requires a protocol-spec change and activation |
| EIP-8202 | `SCHEME_EPHEMERAL_K1` (`0x01`), using Merkle-committed single-use ECDSA keys; no native PQ signature algorithm | A distinct EIP registers a new `scheme_id`; the envelope stays stable but consensus verification and clients change |
| EIP-8223 | secp256k1 sender only; not a signature-decoupling proposal | n/a |
| EIP-8224 | Not a signature-scheme proposal (fflonk ZK proof system for privacy, not sender authentication) | n/a |
| EIP-XXXX | None. Fixed set: secp256k1, P-256, WebAuthn | New scheme would require a protocol-spec change and activation |

EIP-8130's PQ story is architectural rather than cryptographic: no PQ authenticator is defined. The envelope can carry another authenticator, but direct transaction authentication still depends on unresolved canonical-set coordination.

## 9. Mempool / Validation Model

| Proposal | What executes during validation | Complexity characterization |
|---|---|---|
| EIP-8130 | `STATICCALL` to a canonical authenticator, or native `ecrecover` for k1; sender account code itself does not validate the transaction | Fixed identity and interface, but contract authenticators may read state, branch, and make downstream static calls; strongest bounds require a stateless or enshrined authenticator |
| EIP-8141 | Arbitrary EVM in VERIFY frames, restricted for public relay to four validation-prefix shapes, `MAX_VERIFY_GAS` = 100,000, banned-opcode list | "High mempool complexity," per competing-proposal commentary on the frame model |
| EIP-8175 | Sender auth purely cryptographic; `fee_auth` prelude executes EVM for sponsorship decisions | Rated "Medium" (stateless sigs, `fee_auth` simulation needed) in EIP-8141's own comparative framing |
| EIP-8202 | ecrecover, plus 20 Keccak-256 Merkle steps for ephemeral k1; no contract call | Deterministic cryptographic validation, with a large ephemeral witness |
| EIP-8223 | One SLOAD from the `0x13` payer registry plus a balance check, no EVM | Rated "Minimal" (static reads only) |
| EIP-8224 | Bounded fflonk proof verification plus a code-hash check and fixed storage reads, no EVM | Rated "Minimal" (bounded crypto and static reads, no EVM) |
| EIP-XXXX | Purely cryptographic, deterministic verification costs, bounded signature sizes (`MAX_WEBAUTHN_SIG_SIZE` = 2,049 bytes) | Rated "Low" (deterministic crypto, bounded sig sizes) |

The "Rated" characterizations for EIP-8141/8175/8202/8223/8224 come from a cross-proposal reading of each spec; EIP-8130's row above is a direct reading of its mempool validation algorithm.

## 10. Adoption and Implementation Status

| Proposal | Status | PR activity | Notable adoption signal |
|---|---|---|---|
| EIP-8130 | Draft | 40 merged PRs (#11186 through #11918); 2 open (#11578, #11919) | Related open ERC-8168 defines payer-service RPCs but still uses the old `PAYER` term; no fork-inclusion listing |
| EIP-8141 | Draft, Core | 32 commits to its canonical file; 5 direct open PRs after #11932 opened Jul 15, plus open sibling EIP-8288 | On the Hegotá "Considered for Inclusion" list; open ERC-8286 builds on it; this is not final inclusion or activation |
| EIP-8175 | Draft | 3 merged PRs and 1 open Falcon-512 draft PR | No fork-inclusion or dependent-ERC activity found in current research |
| EIP-8202 | Draft, merged to master | 1 PR (#11438, merged Apr 22, 2026) | No fork-inclusion activity found in current research |
| EIP-8223 | Open PR only | 1 PR (#11509, opened Apr 11, 2026), no merge or review cycle yet | Very early stage |
| EIP-8224 | Open PR only | 1 PR (#11518, opened Apr 12, 2026), no merge or review cycle yet | Very early stage |
| EIP-XXXX | Pre-draft gist | No PR, no EIP number, no EthMagicians thread | Authored by a Paradigm/Reth-affiliated researcher; referenced in community discussion but not formally submitted for review |

---

## Summary

EIP-8130 narrows validation by canonical authenticator identity while preserving a broad account model. EIP-8141 keeps validation programmable and recovers public-relay safety through structural and trace rules. EIP-8175 makes sender signatures static but sponsorship programmable. EIP-8202 removes the contract layer and currently offers standard or single-use ephemeral secp256k1 under one flat envelope. EIP-8223 and EIP-8224 are narrower, unmerged drafts whose composition with EIP-8130 is possible but not specified. EIP-8130's clearest cryptographic gap remains unchanged: no PQ authenticator is canonical, and the companion-ERC activation path is not yet defined.
