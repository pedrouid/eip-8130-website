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

### Open

| Date | PR | Author | Description |
|---|---|---|---|
| 2026-04-29 | #11578 | pochenai | "Add opaque_input bytes field" - restores a tx-level metadata role, in tension with the shipped `metadata` field from #11805 |
| 2026-07-13 | #11919 | chunter-cb | "Allow expiry in initial actors at create and import" - direct extension of #11918's `policyData`-at-create work |

### Related

No companion or adjacent EIP/ERC has been formally opened as of this sync. The canonical authenticator set is designed to grow through a companion ERC that has not yet been numbered. The Celo CIP-64 migration compatibility discussion (EthMagicians posts #12-22, June 5 - July 8, 2026) is the closest adjacent-standard activity, and it already drove one concrete spec change: the `AA_TX_TYPE`/`AA_PAYER_TYPE` renumbering in #11903 to avoid an OP Stack CIP-64 transaction-type collision.

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

---

## Key Contributors

| Name | Role |
|---|---|
| Chris Hunter (chunter-cb) | EIP-8130 author (Coinbase/Base); authored the original submission, nearly all merged and open PRs, and the EthMagicians thread |
| abcoathup | EIP editor; reviewed the original submission PRs (#11144, #11186), flagged a bad rebase and duplicate-PR cleanup |
| pochenai | Community contributor; submitted security-relevant PRs (#11591, #11609, #11612) |
| rmeissner | Reviewer (Safe wallet); raised the self-call-versus-entrypoint design question and Safe-compatibility considerations on the EthMagicians thread |
| Helkomine | Community participant; argued against baking payment semantics into the transaction format, proposed a `nonceBitmap` simplification |
| karlb | Community participant; proposed the Celo CIP-64 migration compatibility path and drove the transaction-type renumbering discussion |

---

## External Resources

No external resources beyond the canonical sources above were surfaced by this sync. A search of ethresear.ch for EIP-8130-related discussion returned zero results as of the research date.

---

## Competing Standards

- [EIP-8141: Frame Transaction](https://github.com/ethereum/EIPs/blob/master/EIPS/eip-8141.md) — [Magicians thread](https://ethereum-magicians.org/t/frame-transaction/27617)
- [EIP-8175: Composable Transaction](https://github.com/ethereum/EIPs/pull/11355) — [Magicians thread](https://ethereum-magicians.org/t/eip-8175-composable-transaction/27850)
- [EIP-8202: Scheme-Agile Transaction](https://github.com/ethereum/EIPs/pull/11438) — [Magicians thread](https://ethereum-magicians.org/t/eip-8202-schemed-transaction/28044)
- [EIP-8223: Contract Payer Transaction](https://github.com/ethereum/EIPs/pull/11509) — [Magicians thread](https://ethereum-magicians.org/t/eip-8223-contract-payer-transactions/28202)
- [EIP-8224: Counterfactual Transaction](https://github.com/ethereum/EIPs/pull/11518) — [Magicians thread](https://ethereum-magicians.org/t/eip-8224-counterfactual-transaction/28205)
- [Tempo-like Transaction (gakonst)](https://gist.github.com/gakonst/00117aa2a1cd327f515bc08fb807102e)
