# Competing and Complementary Standards

---

## TL;DR

EIP-8130 sits at the declarative end of the account-abstraction design space: sender authentication resolves to a small canonical, allowlisted set of authenticator contracts (or native `ecrecover`), and node validity depends on authenticator *identity*, not on simulating arbitrary wallet bytecode. EIP-8141 (Frame Transaction) is the fully programmable counterpoint, allowing arbitrary EVM inside VERIFY frames subject to a restrictive mempool tier. EIP-8175 and EIP-8202 sit between the two poles with progressively less validation-time EVM execution, and EIP-XXXX (Tempo-like) is purely cryptographic like EIP-8130's k1/P256/WebAuthn paths but fixes its primitive set at the protocol layer rather than through a companion-ERC canonical set. EIP-8223 and EIP-8224 are complementary, narrow-scope proposals (static sponsorship, shielded gas funding) that compose with any of the general-purpose formats above, including EIP-8130's own payer/sponsor model.

---

## 1. The Declarative-Programmable Spectrum

The proposals below differ mainly in how much EVM execution gates whether a node accepts a transaction into its mempool. At one end, validity is a pure cryptographic check (or a lookup against a small, protocol/ERC-fixed contract set); at the other, validity depends on running arbitrary account code subject to gas caps and opcode restrictions.

| Position | Proposal | What gates validity |
|---|---|---|
| Most programmable | EIP-8141 | Arbitrary EVM in VERIFY frames, constrained to four validation-prefix shapes for public relay |
| | EIP-8175 | Cryptographic sender auth (ecrecover/Ed25519); programmable `fee_auth` prelude for sponsorship |
| Declarative (this site) | **EIP-8130** | STATICCALL to a canonical/allowlisted authenticator, or native `ecrecover`; account logic itself runs only post-inclusion |
| | EIP-8202 | Purely cryptographic scheme verification (secp256k1 / P256 / Falcon-512), no contract call at all |
| Most declarative | EIP-XXXX (Tempo-like) | Purely cryptographic (secp256k1 / P-256 / WebAuthn), fixed protocol-level set, no contract call |

**Off-axis, complementary proposals** (compose with any of the above rather than competing on the generality axis):
- EIP-8223 — static gas sponsorship via a canonical payer registry
- EIP-8224 — shielded gas funding via a ZK proof over fee notes

The distinction that separates EIP-8130 from EIP-8202 and EIP-XXXX is subtle but real: EIP-8130's canonical authenticators are still contracts, invoked via STATICCALL, so *some* EVM execution happens on the authentication path. What EIP-8130 fixes is which contracts are eligible to gate validity at all: "nodes can see exactly what computation a transaction requires before executing it. Instead of simulating arbitrary code, nodes filter on authenticator identity, accepting transactions whose authenticator belongs to a small, standard canonical set and rejecting the rest." EIP-8202 and EIP-XXXX skip the contract-call step entirely for a fixed set of hardcoded schemes.

---

## 2. EIP-8141 — Frame Transaction

Authored by Felix Lange, Vitalik Buterin, lightclient, and others, submitted as PR #11202 (Jan 29, 2026). It introduces a new EIP-2718 type (`0x06`) built from up to 64 purpose-labeled "frames" (DEFAULT, VERIFY, SENDER), with an `APPROVE` opcode as the core validation primitive and arbitrary account code able to verify any signature scheme. Its two-tier model keeps execution fully general while restricting *public mempool relay* to a small set of validation-prefix shapes with a 100,000-gas cap and banned-opcode list. That is the opposite of EIP-8130's fixed-authenticator gate, since any code that fits the prefix shape can still authenticate a relayable transaction. See [/eip-8141](/eip-8141).

## 3. EIP-8175 — Composable Transaction

Authored by Dragan Rakita, created Feb 26, 2026 (spec PR #11355, merged Mar 10). A new type (`0x05`) bundling flat, typed "capabilities" (CALL, CREATE) with a separated `signatures` list (SECP256K1, ED25519) and an optional `fee_auth` field for programmable sponsorship. Sender authentication is purely cryptographic, similar in spirit to EIP-8130's native-`ecrecover` path, but the `fee_auth` prelude executes arbitrary EVM code to decide sponsorship, a validation-time execution surface EIP-8130 avoids entirely by gating sponsor authority (`SPONSOR_PAYER`) through the same fixed authenticator model as sender authentication. See [/eip-8175](/eip-8175).

## 4. EIP-8202 — Scheme-Agile Transaction

Authored by Giulio Rebuffo and Ben Adams, created Mar 22, 2026, merged to master via PR #11438 (Apr 22). A single flat envelope with one execution payload plus typed `authorizations` and `extensions` lists; ships Falcon-512 as a first-class scheme (`scheme_id 0x02`) alongside secp256k1 and P256. It is EIP-8130's closest declarative sibling, but where EIP-8130 routes authentication through onchain canonical-authenticator contracts extensible via a companion ERC, EIP-8202 registers new schemes directly as protocol `scheme_id` values with no contract layer at all: a difference in *where* the canonical set lives (companion-ERC contracts vs. protocol registration) rather than in how much EVM runs. See [/eip-8202](/eip-8202).

## 5. EIP-8223 — Contract Payer Transaction

Authored by Ben Adams, created Apr 11, 2026 (PR #11509, opened, no review cycle yet as of this sync). Charges gas to `tx.to` via a canonical payer-registry predeploy at `address(0x13)`, gated by a single SLOAD plus a balance check, no EVM execution at all. Explicitly positioned as complementary: "the payer registry predeploy is infrastructure consumed by any future general solution, not deprecated by it." This composes cleanly with EIP-8130's own `SELF_PAYER`/`SPONSOR_PAYER` scope bits as an alternative static-sponsorship rail rather than a competing account model. See [/eip-8223](/eip-8223).

## 6. EIP-8224 — Counterfactual Transaction

Also authored by Ben Adams, created Apr 12, 2026 (PR #11518, opened, no review cycle yet as of this sync). Solves the "bootstrap problem" (a fresh EOA with no ETH cannot pay gas privately) via an fflonk ZK proof (BN254) against canonical fee-note contracts, with no EVM execution during validation. Positioned as complementary to general-purpose formats including EIP-8141, EIP-8175, and EIP-8223; nothing in the current research indicates a direct integration with EIP-8130, but its one-shot bootstrap pattern (fund a smart account, then switch to cheap sponsored transactions) is architecture-agnostic and could equally seed an EIP-8130 account. See [/eip-8224](/eip-8224).

## 7. EIP-XXXX — Tempo-like Transactions (gakonst)

A pre-draft gist by Georgios Konstantopoulos (Paradigm/Reth), with no EIP number, no PR to `ethereum/EIPs`, and no EthMagicians thread as of this sync. It bundles a fixed set of wallet UX primitives (atomic batching, validity windows, gas sponsorship via `fee_payer_signature`, 2D nonces, and passkey signatures for P-256 and WebAuthn), with explicitly "constrained scope over general framework" as its philosophy. Its signature set (secp256k1, P-256, WebAuthn) mirrors three of EIP-8130's four canonical authenticators, but as protocol-native, hardcoded logic rather than authenticator contracts extensible via a companion ERC. New schemes would require a hard fork either way, but EIP-8130 at least has a defined extension path. See [/eip-xxxx](/eip-xxxx).

---

## 8. Post-Quantum / Signature-Scheme Agility

| Proposal | PQ scheme shipped today | Path to add a new scheme |
|---|---|---|
| EIP-8130 | None. Canonical set is k1, P256, WebAuthn, delegate | Companion ERC (number TBD) registers new canonical authenticators; explicitly "expected to grow (e.g. post-quantum)" via that process. New accounts already default to revoking the implicit secp256k1 self-actor (`DEFAULT_EOA_REVOKED` set on `createAccount`/`importAccount`, PR #11815), described as a "quantum-resistant default" |
| EIP-8141 | None shipped natively, but `ARBITRARY (0x0)` scheme lets any account-code verifier (including PQ) authenticate today with no protocol change; dedicated outer `signatures` list built for future aggregation; EIP-8288 (open) adds a PQ+STARK aggregation frame mode | Account code plus `ARBITRARY` witness signatures, no hard fork needed for a new scheme; protocol-level aggregation needs a sibling EIP (EIP-8288) |
| EIP-8175 | None merged. SECP256K1 and ED25519 defined; a Falcon-512 addition is an open PR (Giulio2002) | New scheme requires a hard fork; fixed set at the protocol level |
| EIP-8202 | Falcon-512 (`scheme_id 0x02`), shipped in the initial merged spec, alongside P256 for passkeys | Register a new `scheme_id`; no envelope/hard-fork restructuring, though the verification logic itself is still a protocol change |
| EIP-8223 | secp256k1 sender only; not a signature-decoupling proposal | n/a |
| EIP-8224 | Not a signature-scheme proposal (fflonk ZK proof system for privacy, not sender authentication) | n/a |
| EIP-XXXX | None. Fixed set: secp256k1, P-256, WebAuthn | New scheme requires a hard fork |

EIP-8130's own PQ story is architectural rather than cryptographic so far: nothing in the canonical set is quantum-safe today, but the companion-ERC extension path plus the default-revoked-EOA posture are both explicitly framed around eventually adding a PQ authenticator without reworking the transaction envelope itself.

## 9. Mempool / Validation Model

| Proposal | What executes during validation | Complexity characterization |
|---|---|---|
| EIP-8130 | STATICCALL to a canonical/allowlisted authenticator, or native `ecrecover` for k1; account logic beyond authentication only runs post-inclusion during Call Execution, never gating validity | Editorial reading of the spec, not an external rating: bounded to a fixed authenticator set plus a small number of storage reads (`actor_config`, lock/nonce state) |
| EIP-8141 | Arbitrary EVM in VERIFY frames, restricted for public relay to four validation-prefix shapes, `MAX_VERIFY_GAS` = 100,000, banned-opcode list | "High mempool complexity," per competing-proposal commentary on the frame model |
| EIP-8175 | Sender auth purely cryptographic; `fee_auth` prelude executes EVM for sponsorship decisions | Rated "Medium" (stateless sigs, `fee_auth` simulation needed) in EIP-8141's own comparative framing |
| EIP-8202 | ecrecover / P256VERIFY / Falcon verification only, no contract call | Rated "Low" (purely cryptographic, no EVM) in the same framing |
| EIP-8223 | One SLOAD from the `0x13` payer registry plus a balance check, no EVM | Rated "Minimal" (static reads only) |
| EIP-8224 | Bounded fflonk proof verification plus a code-hash check and fixed storage reads, no EVM | Rated "Minimal" (bounded crypto and static reads, no EVM) |
| EIP-XXXX | Purely cryptographic, deterministic verification costs, bounded signature sizes (`MAX_WEBAUTHN_SIG_SIZE` = 2,049 bytes) | Rated "Low" (deterministic crypto, bounded sig sizes) |

The "Rated" characterizations for EIP-8141/8175/8202/8223/8224 come from that sibling proposal's own comparative table; EIP-8130's row above is a direct reading of its mempool validation algorithm rather than an externally sourced rating, since EIP-8130 was not itself scored in that source table.

## 10. Adoption and Implementation Status

| Proposal | Status | PR activity | Notable adoption signal |
|---|---|---|---|
| EIP-8130 | Draft | 40 merged PRs (#11186 through #11918, Feb 28 - Jul 13, 2026); 2 open (#11578, #11919) | Companion ERC for the canonical authenticator set not yet numbered; Celo CIP-64 migration path under active discussion for OP Stack deployment, including a transaction-type renumbering to `0x79`/`0x7a` specifically to avoid a CIP-64 collision (forum posts #12-22, Jun 5 - Jul 8, 2026) |
| EIP-8141 | Draft, Core | Roughly 25+ merged PRs since Jan 29, 2026; 5 open | Added to the Hegotá hard-fork "Considered for Inclusion" list (PR #11537, merged Apr 30); ERC-8286 (Modular Accounts) builds on it, open; EIP-2542 withdrawn Jun 30 as "Superseded by EIP-8141"; live demo at demo.eip-8141.ethrex.xyz |
| EIP-8175 | Draft | 4 merged PRs, 1 open, active Feb-Apr 2026 | No fork-inclusion or dependent-ERC activity found in current research |
| EIP-8202 | Draft, merged to master | 1 PR (#11438, merged Apr 22, 2026) | No fork-inclusion activity found in current research |
| EIP-8223 | Draft | 1 PR (#11509, opened Apr 11, 2026), no review cycle yet | Very early stage |
| EIP-8224 | Draft | 1 PR (#11518, opened Apr 12, 2026), no review cycle yet | Very early stage |
| EIP-XXXX | Pre-draft gist | No PR, no EIP number, no EthMagicians thread | Authored by a Paradigm/Reth-affiliated researcher; referenced in community discussion but not formally submitted for review |

---

## Summary

EIP-8130 is the declarative anchor of this comparison: authentication resolves to a small canonical, allowlisted authenticator set (or native `ecrecover`), and mempool validity checks authenticator *identity* rather than simulating account code. EIP-8141 sits at the opposite, fully programmable pole; EIP-8175 and EIP-8202 occupy intermediate positions, with EIP-8175 keeping a programmable sponsorship path and EIP-8202 matching EIP-8130's low mempool-execution profile while dropping the authenticator-contract layer in favor of direct protocol scheme registration. EIP-XXXX shares EIP-8130's cryptographic primitives but hardcodes them at the protocol layer instead of routing them through extensible, ERC-governed contracts. EIP-8223 and EIP-8224 do not compete on this axis at all: both are narrow-scope, complementary infrastructure that can sit underneath EIP-8130's own payer/sponsor model as readily as under any of the general-purpose alternatives. The clearest open gap on EIP-8130's own side of the comparison is PQ: the canonical authenticator set has no post-quantum scheme yet, and its growth path runs through a companion ERC that has not yet been numbered.
