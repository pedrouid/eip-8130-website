# Appendix

---

## Sources

- Spec: https://github.com/ethereum/EIPs/blob/master/EIPS/eip-8130.md
- All PRs: https://github.com/ethereum/EIPs/pulls?q=is%3Apr+8130
- EthMagicians thread: https://ethereum-magicians.org/t/eip-8130-account-abstraction-by-account-configurations/25952

---

## Complete PR Timeline

### Merged

| Date | PR | Author | Description |
|---|---|---|---|
| 2026-02-28 | #11186 | chunter-cb | Original submission: keys/verifiers model, no scope, no lock, TBD transaction-type constants |
| 2026-03-03 | #11367 | chunter-cb | "Revisions" - unifies `account_initialization`/`key_changes` into a single typed `account_changes` array, introduces Account Lock, adds an ERC-1271 `isValidSignature` fallback authorization path, adds `MAX_ACCOUNT_CHANGES` |
| 2026-03-03 | #11372 | chunter-cb | Motivation section wording update |
| 2026-03-04 | #11374 | chunter-cb | Verifier gas and cross-chain signature tweaks |
| 2026-03-05 | #11378 | chunter-cb | "Slot derivations left to final contract" - removes hardcoded storage-slot derivation formulas from the spec |
| 2026-03-06 | #11380 | chunter-cb | "Simplify for initial EIP" - renames keys to owners, drops on-chain public-key storage |
| 2026-03-07 | #11382 | chunter-cb | "Clear up naming and k1 behaviour" |
| 2026-03-09 | #11388 | chunter-cb | "Enable permissionless payer" - introduces the scope byte model, renames `IAuthVerifier` to `IVerifier`, replaces the EIP-1153 transient-storage Transaction Context with a dedicated precompile |
| 2026-03-20 | #11428 | chunter-cb | "Adjust account config interface, small clean up" |
| 2026-04-02 | #11478 | chunter-cb | "Eip 8130 nonce and EOA delegation changes" - packed `nonce` field, nonce-free mode via `NONCE_KEY_MAX`, explicit EOA revocation marker, `ECRECOVER_VERIFIER` sentinel |
| 2026-04-04 | #11483 | chunter-cb | "Contract updates" - Account Configuration Contract interface refinements |
| 2026-04-14 | #11492 | chunter-cb | "Fix sentinel addresses" - drops `requires: 7702` |
| 2026-05-04 | #11591 | pochenai | "Prevent cross-sender payer signature replay" |
| 2026-05-11 | #11526 | chunter-cb | "Move from to sender" - renames the transaction field `from` to `sender` |
| 2026-05-11 | #11647 | chunter-cb | "Add canonical verifier set" - introduces the canonical/allowlisted verifier concept and `eth_getAcceptedVerifiers` |
| 2026-05-12 | #11651 | chunter-cb | "Tighten verifier allowlist language" |
| 2026-05-12 | #11654 | chunter-cb | "Update EIP-8130 gas and verifier validation" |
| 2026-06-02 | #11757 | chunter-cb | "Resolve constants, gas accounting, and interface cleanups" - assigns `AA_TX_TYPE = 0x7B`, `AA_PAYER_TYPE = 0x7C` |
| 2026-06-02 | #11752 | chunter-cb | "Define signature-invariant nonce-free replay identifier" - introduces `replay_id` |
| 2026-06-02 | #11609 | pochenai | "Add create entry existing-account and code-size guards" - adds `requires: 170` |
| 2026-06-04 | #11764 | chunter-cb | "Rename owners to actors and finalize Transaction Context naming" |
| 2026-06-04 | #11765 | chunter-cb | Renames `IAccountConfiguration.verify` to `verifyActor` |
| 2026-06-04 | #11766 | chunter-cb | "Add actor call policies and per-actor expiry" |
| 2026-06-04 | #11767 | chunter-cb | "Clean up, reorganize and finalize pass" |
| 2026-06-05 | #11769 | chunter-cb | "Fixes and clarifications" |
| 2026-06-09 | #11782 | chunter-cb | "Clarifications and clean up" |
| 2026-06-09 | #11785 | chunter-cb | "Rename verifier to authenticator" |
| 2026-06-10 | #11791 | chunter-cb | "Rlp abi correction" |
| 2026-06-10 | #11794 | chunter-cb | `authenticateActor` now returns `(scope, policyType, policyTarget)` |
| 2026-06-15 | #11805 | chunter-cb | Adds a transaction-level `metadata` field |
| 2026-06-15 | #11806 | chunter-cb | Policy clarification follow-up to #11766/#11794 |
| 2026-06-16 | #11808 | chunter-cb | "Bind payer field into payer signature hash" |
| 2026-06-16 | #11809 | chunter-cb | "Relax delegate import restriction" |
| 2026-06-17 | #11812 | chunter-cb | "Charge initial-actor slot writes on account creation" |
| 2026-06-17 | #11813 | chunter-cb | Clarifies the intrinsic-gas schedule is a recommended reference, not a protocol constant |
| 2026-06-18 | #11815 | chunter-cb | "Fold default-EOA revocation into a state flag" - `DEFAULT_EOA_REVOKED`, renames `ECRECOVER_AUTHENTICATOR` to `K1_AUTHENTICATOR` |
| 2026-06-18 | #11816 | chunter-cb | "Store self-actor secp256k1 config inline in account-state slot" |
| 2026-07-02 | #11847 | chunter-cb | "Clarify actor policies and simplify metadata field" |
| 2026-07-08 | #11903 | chunter-cb | "Renumber AA transaction types and add eth_call/eth_estimateGas RPC extension" - `0x7B`/`0x7C` renumbered to `0x79`/`0x7A` |
| 2026-07-13 | #11918 | chunter-cb | "Scope grants, PAYER split, operational ERC-1271, account lock" - largest structural rewrite since #11367 |
| 2026-08-11 | #12135 | chunter-cb | Keystore alignment, millisecond validity window, local epochs, unified signed changes, typed signature envelopes, and expanded dependency list |
| 2026-08-12 | #12148 | chunter-cb | Contract-audit reconciliation for self-revocation, canonical checks, and expired actor grants |
| 2026-08-14 | #12173 | chunter-cb | Right-aligns address-derived actorIds and removes create-code validation detail from the EIP |
| 2026-08-19 | #12204 | chunter-cb | L1/L2 adoption profiles, `MAX_AUTHENTICATION_GAS`, transaction context during authentication, and second-or-millisecond timestamps |
| 2026-08-27 | #12250 | chunter-cb | Removes `CONTRACT_ESTABLISHED` and renumbers the account-state flags |
| 2026-09-03 | #12295 | chunter-cb | Renames EIP-8130 to "Keystore Accounts" |
| 2026-09-14 | #12333 | chunter-cb | Aligns scope bits (SENDER renamed OPERATOR), policy storage by length, and parameterless `importAccount()` with the canonical repository |
| 2026-09-16 | #12320 | chunter-cb | Applies the EIP-7623 calldata floor and trims `requires` |
| 2026-10-08 | #12386 | chunter-cb | Scopes EIP-8130 to the Keystore and moves the transaction type to EIP-8430 |

### Open

| Date | PR | Author | Description |
|---|---|---|---|
| 2026-04-29 | #11578 | pochenai | "Add opaque_input bytes field" - restores a tx-level metadata role, in tension with the shipped `metadata` field from #11805 |
| 2026-07-13 | #11919 | chunter-cb | "Allow expiry in initial actors at create and import" - direct extension of #11918's `policyData`-at-create work |
| 2026-08-19 | #12210 | chunter-cb | Draft four-tier authenticator classification (CANONICAL, PURE, BOUNDED, ARBITRARY) for mempool policy |
| 2026-09-03 | #12293 | pedrouid | Optional checkpointed Keystore for non-admin actors with admin co-approval |
| 2026-09-10 | #12313 | pedrouid | Optional checkpointed actor source, an alternative to #12293 |
| 2026-09-14 | #12334 | chunter-cb | Draft symmetric two-track epochs, `IncrementEpoch`, and transient actors |
| 2026-09-15 | #12341 | AnkushinDaniil | Optional model-neutral change digest for portable actor changes |
| 2026-10-08 | #12462 | chunter-cb | Draft Keystore simplification: two scope bits, no policy manager, no account lock |

### Related

| Date | Proposal | Status | Relationship |
|---|---|---|---|
| 2026-02-20 | [ERC-8168 / ERC PR #1555](https://github.com/ethereum/ERCs/pull/1555) | Open | Payer service capability; October updates retargeted it at EIP-8430, the EIP-8130 Keystore, and EIP-8141 |
| 2026-07-15 | [ERC-8340 / ERC PR #1883](https://github.com/ethereum/ERCs/pull/1883) | Open draft | Deterministic CBOR encoding for the opaque `metadata` field; dormant since July 16 |
| 2026-07-22 | [Base implementation PR #44](https://github.com/base/eip-8130/pull/44) | Merged | Adds an ERC-4337-compatible `executeAttested` path for chains without the transaction-context precompile; implementation only |
| 2026-07-24 | [Base implementation PR #45](https://github.com/base/eip-8130/pull/45) | Merged | Adds an account-scoped EIP-712 digest for ERC-1271 replay protection; implementation only |
| 2026-08-06 | [Base implementation PR #46](https://github.com/base/eip-8130/pull/46), [#55](https://github.com/base/eip-8130/pull/55) | Merged | Research alignment, widened scope, and revised Keystore packing |
| 2026-08-07 | [Base implementation PR #63](https://github.com/base/eip-8130/pull/63), [#64](https://github.com/base/eip-8130/pull/64) | Merged | Typed signature envelopes and local-epoch sequencing |
| 2026-08-10 – 2026-08-18 | [Base implementation PR #76](https://github.com/base/eip-8130/pull/76), [#79](https://github.com/base/eip-8130/pull/79), [#82](https://github.com/base/eip-8130/pull/82) | Merged | Established-contract flag, expired-grant behavior, and final contract-review pass |
| 2026-08-21 | [EIP-8386 / PR #12218](https://github.com/ethereum/EIPs/pull/12218) | Open | Transaction Events View extension of the Transaction Context precompile |
| 2026-08-21 | [EIP-8387 / PR #12221](https://github.com/ethereum/EIPs/pull/12221) | Open | Stateless Accounts, `requires: 8130` |
| 2026-08-21 | [EIP-8388 / PR #12222](https://github.com/ethereum/EIPs/pull/12222) | Open | Keystore Signatures for Execution Txs, `requires: 8130` |
| 2026-08-25 | [Expired Actor Pruning / PR #12240](https://github.com/ethereum/EIPs/pull/12240) | Open draft | Consensus garbage collection of expired Keystore actors |
| 2026-08-26 – 2026-09-02 | [Base implementation PR #92](https://github.com/base/eip-8130/pull/92), [#95](https://github.com/base/eip-8130/pull/95), [#100](https://github.com/base/eip-8130/pull/100) | Merged | Flag removal, scope-bit reorder, and callback import that EIP PRs #12250 and #12333 then adopted |
| 2026-08-26 | [EIP-8397 / PR #12244](https://github.com/ethereum/EIPs/pull/12244) | Merged Oct 14 | EIP-8141 companion adding pure, fixed-gas authenticator signatures with an `IAuthenticator`-shaped interface |
| 2026-08-29 | [ERC-8403 / ERC PR #1979](https://github.com/ethereum/ERCs/pull/1979) | Open | Account Authority Lifecycle, bound to EIP-8141 and mapped onto the EIP-8130 Keystore |
| 2026-09-08 – 2026-09-29 | [base/base PR #4924](https://github.com/base/base/pull/4924), [#5250](https://github.com/base/base/pull/5250), [#5366](https://github.com/base/base/pull/5366) | Merged | Moves activation out of Cobalt to Everest and gates the Keystore to the never-scheduled Zenith fork |
| 2026-09-28 | [EIP-8430 / PR #12385](https://github.com/ethereum/EIPs/pull/12385) | Open | AA Transaction Type split out of EIP-8130 |

The canonical authenticator set's companion ERC still has no assigned number. The Celo CIP-64 discussion (posts #12-23) drove the transaction-type renumbering. Posts #24-26 explored non-admin initiation and actor management. Post #27 (July 30) proposed a permissionless public `POLICY` actor, answered in posts #28-29 (August 23) as an `AlwaysValidAuthenticator`. Posts #30-31 (August 28-30) raised cross-chain admin freshness, posts #32 and #34 discussed phase-skipping refunds, and posts #33 and #35 (September 2-11) led to PR #12320's calldata floor.

### Closed (not merged)

| PR | Opened -> Closed | Author | Reason |
|---|---|---|---|
| #11144 | 2026-01-21 -> 2026-01-29 | chunter-cb | Duplicate initial submission, closed in favor of #11186 at maintainer abcoathup's request |
| #11194 | 2026-01-28 -> 2026-03-02 | chunter-cb | Companion "Token Gas Payments for EIP-8130" proposal; closed without a stated inline reason, functionality not pursued in the core EIP |
| #11612 | 2026-05-07 -> 2026-05-14 | pochenai | Partially accepted: two of four claimed vulnerabilities (C1, C2) folded into #11654; the other two (C3 multichain-change expiry, C4 auto-revocation on delegation) explicitly rejected by chunter-cb as intentional design choices |
| #11648 | 2026-05-11 -> 2026-06-04 | chunter-cb | Superseded by a clean rebase, #11766, after becoming unmergeable due to an eth-bot bug |
| #11655 | 2026-05-12 -> 2026-06-15 | chunter-cb | Discussion-only draft marked "DO NOT MERGE"; superseded by the shipped `metadata` field design in #11805 |
| #11751 | 2026-06-01 -> 2026-06-18 | chunter-cb | Draft-only proposal for delegated account creation at create time; no successor merged as of research date |
| #11758 | 2026-06-02 -> 2026-06-04 | chunter-cb | Partially superseded and partially reversed by #11764, which kept the interface renames but dropped the proposed getter removals |
| #12185 | 2026-08-18 -> 2026-08-19 | chunter-cb | First adoption-profile and bounded-authentication-gas draft, superseded by #12204 |
| #12192 | 2026-08-18 -> 2026-08-19 | chunter-cb | Follow-up transaction-context and timestamp draft, superseded by #12204 |
| #12248 | 2026-08-27 -> 2026-09-03 | pedrouid | Proposed separate transaction, Keystore, and advanced-controls EIPs (8398/8401/8402); editors asked for one EIP per PR and abcoathup suggested a separate Keystore EIP |

---

## Key Contributors

| Name | Role |
|---|---|
| Chris Hunter (chunter-cb) | EIP-8130 author (Coinbase/Base); authored the original submission, nearly all merged and open PRs, and the EthMagicians thread |
| abcoathup | EIP editor; reviewed the original submission PRs (#11144, #11186), flagged a bad rebase and duplicate-PR cleanup |
| pochenai | Community contributor; submitted security-relevant PRs (#11591, #11609, #11612) |
| rmeissner | Reviewer (Safe wallet); raised the self-call-versus-entrypoint design question and Safe-compatibility considerations on the EthMagicians thread |
| Helkomine | Community participant; argued against baking payment semantics into the transaction format, proposed a `nonceBitmap` simplification |
| karlb | Community participant; proposed the Celo CIP-64 migration compatibility path, drove the transaction-type renumbering, and flagged the missing EIP-7623 floor (post #33) |
| cyrus | Community participant; prompted the forum clarification separating transaction-sender grants from admin configuration authority |
| amiecorso | Base implementation contributor; added account-scoped ERC-1271 replay protection in implementation PR #45 and opened the wallet-agnostic policy series |
| Agusx1211 | Community participant; raised cross-chain admin freshness (post #30) and reviewed the checkpointed Keystore PR #12293 |
| AnkushinDaniil | Community contributor; authored ERC-8403 and PR #12341, and reviewed the EIP-8387, EIP-8388, and EIP-8430 drafts |
| chugarchugarr | Community participant; flagged the config-change auth blob leaking into `replay_id` on the EIP-8430 thread |
| jochem-brouwer | EIP editor; requested changes on the EIP-8386, EIP-8387, EIP-8388, and pruning drafts |
| leekt (taek.eth) | Author of EIP-8397, the EIP-8141 companion with an `IAuthenticator`-shaped authenticator scheme |
| pedrouid | Proposed the closed three-EIP decomposition (#12248) and the open checkpointed Keystore PRs (#12293, #12313) |

---

## External Resources

- [Native Account Abstraction](https://x.com/buildonbase/status/2078132881017245881)
- [Cobalt](https://docs.base.org/upgrades/cobalt/overview)
- [Everest](https://docs.base.org/upgrades/everest/overview)
- [Base Vibenet](https://vibes.base.org/)
- [EIP-8130 Builder Guide](https://www.eip8130.com/guide)
- [Base EIP-8130 Reference Implementation](https://github.com/base/eip-8130)
- [ERC-8340: Transaction Metadata Encoding](https://ethereum-magicians.org/t/erc-8340-transaction-metadata-encoding/29022)
- [Frame Transactions vs. SchemedTransactions for Post-Quantum Ethereum](https://ethereum-magicians.org/t/frame-transactions-vs-schemedtransactions-for-post-quantum-ethereum/28056)
- [EIP-8141 Demo](https://demo.eip-8141.ethrex.xyz/)
- [EIP-8430: AA Transaction Type (Split out from 8130)](https://ethereum-magicians.org/t/eip-8430-aa-transaction-type-split-out-from-8130/29810)
- [EIP-8386: Transaction Events View](https://ethereum-magicians.org/t/eip-8386-transaction-events-view/29472)
- [EIP-8387: Stateless Accounts](https://ethereum-magicians.org/t/eip-8387-stateless-accounts/29473)
- [Composable Native Account Abstraction](https://ethereum-magicians.org/t/composable-native-account-abstraction/29526)
- [ERC-8403: Account Authority Lifecycle](https://ethereum-magicians.org/t/erc-8403-account-authority-lifecycle/29570)
- [erc-8403-poc](https://github.com/AnkushinDaniil/erc-8403-poc)
- [ERC-8403: an account as one hash, and post-quantum keys](https://ethresear.ch/t/erc-8403-an-account-as-one-hash-and-post-quantum-keys/26147)
- [EIP-8397: Frame Authenticator Signatures](https://ethereum-magicians.org/t/eip-8397-frame-authenticator-signatures/29517)
- [Frame Transaction Breakout #2, August 25, 2026](https://ethereum-magicians.org/t/frame-transaction-breakout-2-august-25-2026/29419)
- [All Core Devs - Execution (ACDE) #244, August 27, 2026](https://ethereum-magicians.org/t/all-core-devs-execution-acde-244-august-27-2026/29468)
- [Why Decentralized State is Important for Ethereum](https://ethresear.ch/t/why-decentralized-state-is-important-for-ethereum/25622)

---

## Competing Standards

- [EIP-8141: Frame Transaction](https://github.com/ethereum/EIPs/blob/master/EIPS/eip-8141.md) — [Magicians thread](https://ethereum-magicians.org/t/frame-transaction/27617)
- [EIP-8175: Composable Transaction](https://github.com/ethereum/EIPs/blob/master/EIPS/eip-8175.md) — [Magicians thread](https://ethereum-magicians.org/t/eip-8175-composable-transaction/27850)
- [EIP-8202: Scheme-Agile Transaction](https://github.com/ethereum/EIPs/blob/master/EIPS/eip-8202.md) — [Magicians thread](https://ethereum-magicians.org/t/eip-8202-schemed-transaction/28044)
- [EIP-8223: Contract Payer Transaction](https://github.com/ethereum/EIPs/pull/11509) — [Magicians thread](https://ethereum-magicians.org/t/eip-8223-contract-payer-transactions/28202)
- [EIP-8224: Counterfactual Transaction](https://github.com/ethereum/EIPs/pull/11518) — [Magicians thread](https://ethereum-magicians.org/t/eip-8224-counterfactual-transaction/28205)
- [Tempo-like Transaction (gakonst)](https://gist.github.com/gakonst/00117aa2a1cd327f515bc08fb807102e)
