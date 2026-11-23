# Competing and Complementary Standards

---

## TL;DR

This site's subject is a pair of sibling standards: EIP-8130, a transport-neutral Keystore that narrows validation by selecting an authenticator by address instead of executing the account's own code, and EIP-8430, the transaction type split out of it in October. Compared as a pair, they span the same ground as the alternatives below; compared separately, EIP-8430 competes with other transaction formats while the EIP-8130 Keystore can also serve them, and it names EIP-8141 frame accounts as consumers. EIP-8141 is the programmable counterpoint, using VERIFY frames plus restrictive public-mempool rules, and it is now Scheduled for Inclusion in Hegotá with its AA implementation still open to change. EIP-8175 keeps sender signatures fixed but runs a programmable sponsorship prelude. EIP-8202 uses direct scheme dispatch and currently defines standard and single-use ephemeral secp256k1. The Tempo-like gist hardcodes a broader wallet-UX bundle. EIP-8223 and EIP-8224 are unmerged, narrow sponsorship and gas-bootstrap drafts rather than complete account models.

---

## 1. The Declarative-Programmable Spectrum

The proposals below differ mainly in how much EVM execution gates whether a node accepts a transaction into its mempool. At one end, validity is a pure cryptographic check (or a lookup against a small, protocol/ERC-fixed contract set); at the other, validity depends on running arbitrary account code subject to gas caps and opcode restrictions.

| Position | Proposal | What gates validity |
|---|---|---|
| Most programmable | EIP-8141 | Arbitrary EVM in VERIFY frames, constrained to four validation-prefix shapes for public relay |
| | EIP-8175 | Cryptographic sender auth (ecrecover/Ed25519); programmable `fee_auth` prelude for sponsorship |
| Declarative (this site) | **EIP-8130 + EIP-8430** | Native `ecrecover` or a constant-cost canonical authenticator; capped STATICCALL to other authenticators on permissive chains; account logic runs only post-inclusion |
| | EIP-8202 | Direct verification of secp256k1 or Merkle-committed ephemeral secp256k1, no contract call |
| Most declarative | EIP-XXXX (Tempo-like) | Purely cryptographic (secp256k1 / P-256 / WebAuthn), fixed protocol-level set, no contract call |

**Off-axis, complementary proposals** (compose with any of the above rather than competing on the generality axis):
- EIP-8223 — static gas sponsorship via a canonical payer registry
- EIP-8224 — shielded gas funding via a ZK proof over fee notes

The distinction that separates EIP-8130 from EIP-8202 and EIP-XXXX is subtle but real: EIP-8130's canonical authenticators are contracts that a chain enshrines at constant cost, and permissive chains also run other authenticators via `STATICCALL`. What EIP-8130 fixes is which implementations may gate validity and at what cost, not whether EVM executes at all. EIP-8202 and the Tempo-like gist skip the authenticator-contract step for protocol-defined schemes. EIP-8430 deployed without the Keystore sits further toward the declarative end, next to the Tempo-like gist: secp256k1 only, with batching, sponsorship, and 2D nonces.

The October split also blurs the spectrum. EIP-8130 is no longer a rival transaction format to EIP-8141; it is an authority layer an EIP-8141 account could call, and EIP-8141's new EIP-8397 adopts the same `authenticate(hash, data) -> id` shape for pure, fixed-gas authenticators. Open ERC-8403 proposes one actor lifecycle bound to both.

---

## 2. EIP-8141 — Frame Transaction

Authored by Felix Lange, Vitalik Buterin, lightclient, and others, EIP-8141 introduces transaction type `0x06` with purpose-labeled frames and arbitrary account-code validation through VERIFY frames. It moved to **Scheduled for Inclusion** in Hegotá on August 27, on the understanding that AA ships in Hegotá while "the specific implementation may change, including EIP number." Devcon (November 3) passed without a new decision, and at ACDE #249 (November 19) the only scope option without frames drew no support. A Frame Transaction breakout on August 25 debated EIP-8130 directly; the forum's summary records an outcome that L1 should not enshrine opinionated account models. Since August 20 it added EIP-7778 refund accounting, moved its calldata floor to EIP-7976, made the expiry verifier an ordinary deployed contract, replaced its fee caps with one `max_fee` budget (October 22), and merged sibling EIPs 8288 (aggregation), 8397 (authenticator signatures), and 8455 (RESERVOIR opcode). See [/eip-8141](/eip-8141).

## 3. EIP-8175 — Composable Transaction

Authored by Dragan Rakita, created Feb 26, 2026 (spec PR #11355, merged Mar 10). A new type (`0x05`) bundling flat, typed "capabilities" (CALL, CREATE) with a separated `signatures` list (SECP256K1, ED25519) and an optional `fee_auth` field for programmable sponsorship. Sender authentication is purely cryptographic; `fee_auth` executes EVM code. EIP-8130 instead gives sender and payer the same fixed authenticator interface, which can also execute EVM code when the authenticator is a contract. See [/eip-8175](/eip-8175).

## 4. EIP-8202 — Scheme-Agile Transaction

Authored by Giulio Rebuffo and Ben Adams, created Mar 22, 2026, and merged as a Draft via PR #11438 (Apr 22). It defines one execution payload plus typed `authorizations` and `extensions`. The current scheme set is secp256k1 and `SCHEME_EPHEMERAL_K1`, a depth-20 Merkle commitment to single-use ECDSA keys. P-256 and Falcon-512 were removed before merge despite appearing in the PR's initial summary. Future schemes use new protocol `scheme_id` values specified by distinct EIPs. See [/eip-8202](/eip-8202).

## 5. EIP-8223 — Contract Payer Transaction

Authored by Ben Adams and still only in open PR #11509. It would charge gas to `tx.to` via a canonical payer-registry predeploy at `address(0x13)`, using static reads rather than EVM execution for validation. The PR explicitly positions the registry as infrastructure for future general solutions, naming EIP-8141 and EIP-8175. Composition with EIP-8130 is this site's architectural inference, not a relationship claimed in the source. See [/eip-8223](/eip-8223).

## 6. EIP-8224 — Counterfactual Transaction

Also authored by Ben Adams and still only in open PR #11518. It proposes a shielded gas-funding bootstrap using an fflonk proof over BN254 and canonical fee-note contracts. The source describes a one-shot path into EIP-8223 sponsorship. Using it to seed an EIP-8130 account is plausible but remains this site's inference; no direct EIP-8130 integration is specified. See [/eip-8224](/eip-8224).

## 7. EIP-XXXX — Tempo-like Transactions (gakonst)

A pre-draft gist by Georgios Konstantopoulos (Paradigm/Reth), with no EIP number, no PR to `ethereum/EIPs`, and no EthMagicians thread. It bundles a fixed set of wallet UX primitives (atomic batching, validity windows, gas sponsorship via `fee_payer_signature`, 2D nonces, and passkey signatures for P-256 and WebAuthn), with explicitly "constrained scope over general framework" as its philosophy. Its schemes are hardcoded into the proposed protocol. EIP-8130 moves extensions into a canonical set that changes on L1 only by hard fork, plus per-chain acceptance of other authenticators. See [/eip-xxxx](/eip-xxxx).

---

## 8. Post-Quantum / Signature-Scheme Agility

| Proposal | PQ capability in the current draft | Path to add a new scheme |
|---|---|---|
| EIP-8130 | None. Canonical set is k1, P256, WebAuthn, delegate | Hard fork on L1, companion ERC elsewhere; permissive chains can accept a capped PQ contract authenticator without either. PR #12204 added the crypto-agility language |
| EIP-8430 alone | None; secp256k1 only | Through EIP-8130 integration, or a new transaction-level extension |
| EIP-8141 | No native PQ scheme. `ARBITRARY (0x0)` witnesses checked by account code, or EIP-8397 pure authenticators; merged EIP-8288 specifies in-mempool aggregation | Account code or a permissionless EIP-8397 authenticator; consensus-registry PR #12011 closed without merge |
| EIP-8175 | None merged. SECP256K1 and ED25519 are defined; Falcon-512 is an open draft PR | New scheme requires a protocol-spec change and activation |
| EIP-8202 | `SCHEME_EPHEMERAL_K1` (`0x01`), using Merkle-committed single-use ECDSA keys; no native PQ signature algorithm | A distinct EIP registers a new `scheme_id`; the envelope stays stable but consensus verification and clients change |
| EIP-8223 | secp256k1 sender only; not a signature-decoupling proposal | n/a |
| EIP-8224 | Not a signature-scheme proposal (fflonk ZK proof system for privacy, not sender authentication) | n/a |
| EIP-XXXX | None. Fixed set: secp256k1, P-256, WebAuthn | New scheme would require a protocol-spec change and activation |

EIP-8130's PQ story is architectural rather than cryptographic: no PQ authenticator is defined. The process is now specified rather than open, but on L1 it is fork-paced, while EIP-8141's EIP-8397 route is permissionless.

## 9. Mempool / Validation Model

| Proposal | What executes during validation | Complexity characterization |
|---|---|---|
| EIP-8130 + EIP-8430 | Native `ecrecover` for k1, constant-cost canonical authenticators, and on permissive chains a capped `STATICCALL`; account code itself does not validate the transaction | Canonical path keeps invalidators to actor config, lock, and nonce; permissive admission adds state tracking, bounded by `MAX_AUTHENTICATION_GAS` |
| EIP-8430 alone | One native secp256k1 recovery per role, plus nonce or `replay_id`, balance, and validity window | Fixed cost with no contract call, comparable to the Tempo-like gist |
| EIP-8141 | Arbitrary EVM in VERIFY frames, restricted for public relay by `MAX_VERIFY_GAS`, opcode and state-access rules; three protocol-defined prefixes can be evaluated directly | Common paths avoid tracing; custom prefixes use metered EVM plus separate execution- and state-gas limits |
| EIP-8175 | Sender auth purely cryptographic; `fee_auth` prelude executes EVM for sponsorship decisions | Rated "Medium" (stateless sigs, `fee_auth` simulation needed) in EIP-8141's own comparative framing |
| EIP-8202 | ecrecover, plus 20 Keccak-256 Merkle steps for ephemeral k1; no contract call | Deterministic cryptographic validation, with a large ephemeral witness |
| EIP-8223 | One SLOAD from the `0x13` payer registry plus a balance check, no EVM | Rated "Minimal" (static reads only) |
| EIP-8224 | Bounded fflonk proof verification plus a code-hash check and fixed storage reads, no EVM | Rated "Minimal" (bounded crypto and static reads, no EVM) |
| EIP-XXXX | Purely cryptographic, deterministic verification costs, bounded signature sizes (`MAX_WEBAUTHN_SIG_SIZE` = 2,049 bytes) | Rated "Low" (deterministic crypto, bounded sig sizes) |

The "Rated" characterizations for EIP-8141/8175/8202/8223/8224 come from a cross-proposal reading of each spec; EIP-8130's row above is a direct reading of its mempool validation algorithm.

## 10. Adoption and Implementation Status

| Proposal | Status | PR activity | Notable adoption signal |
|---|---|---|---|
| EIP-8130 | Draft, retitled "Keystore Accounts" | 49 merged PRs through #12386; 8 open, plus four extension drafts | Not on any Ethereum fork list or ACDE #249 scope option. Base deleted its Keystore implementation on November 17; an OP Stack research prototype uses it |
| EIP-8430 | Draft, merged November 23 via PR #12385 | 20 commits on its creation PR; no open PRs | Not on any Ethereum fork list. Base Everest plans it with no date; Base's client diverges from it on signing domains |
| EIP-8141 | Draft, Core | 81 canonical-file commits; 17 direct open PRs as of Nov 23; ten `requires` siblings including merged EIP-8288, EIP-8397, and EIP-8455 | Scheduled for Inclusion in Hegotá and in every remaining scope option after ACDE #249; three siblings CFI; merged ERC-8286 and ERC-7902 build on it |
| EIP-8175 | Draft | 3 merged PRs and 1 open Falcon-512 draft PR | No fork-inclusion or dependent-ERC activity found in current research |
| EIP-8202 | Draft, merged to master | 1 PR (#11438, merged Apr 22, 2026) | No fork-inclusion activity found in current research |
| EIP-8223 | Open PR only | 1 PR (#11509, opened Apr 11, 2026), no merge or review cycle yet | Very early stage |
| EIP-8224 | Open PR only | 1 PR (#11518, opened Apr 12, 2026), no merge or review cycle yet | Very early stage |
| EIP-XXXX | Pre-draft gist | No PR, no EIP number, no EthMagicians thread | Authored by a Paradigm/Reth-affiliated researcher; referenced in community discussion but not formally submitted for review |

---

## Summary

EIP-8130 narrows validation by authenticator identity and, since October, offers that model as a transport-neutral Keystore rather than a competing transaction type. EIP-8141 keeps validation programmable, recovers public-relay safety through structural and trace rules, and holds the L1 fork slot. EIP-8175 makes sender signatures static but sponsorship programmable. EIP-8202 removes the contract layer and currently offers standard or single-use ephemeral secp256k1 under one flat envelope. EIP-8223 and EIP-8224 are narrower, unmerged drafts whose composition with EIP-8130 is possible but not specified. EIP-8130's clearest cryptographic gap remains unchanged: no PQ authenticator is canonical, and on L1 adding one now takes a hard fork.
