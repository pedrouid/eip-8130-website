# Feedback Evolution

This page traces how community feedback and PR review shaped EIP-8130 (originally "Account Abstraction by Account Configuration," now "Keystore Accounts") from its October 2025 forum origin through the October 2026 split of its transaction type into EIP-8430. It is organized into chronological, thematic phases. Each phase cites the PR or forum post that drove a change and explains the reasoning behind it, not just the mechanical diff (mechanics live on [Merged Changes](/merged-changes)).

---

## Phase 1: Concept to Submission (October 2025 – February 2026)

Chris Hunter (chunter, Coinbase/Base) opened the EthMagicians thread on October 24, 2025 (post #1), describing "an account abstraction protocol that is designed performant, flexible, arbitrary account abstraction by enabling nodes to add native implementations of validation logic (ie k1, p256, webauth)" while keeping custom validation code permissionless to deploy. The core bet from day one was separating cheap, node-native signature schemes from arbitrary smart-contract logic, so mempool inclusion checks would never require simulating wallet bytecode.

The proposal sat as a forum draft for three months. On January 21, 2026 (post #2), chunter announced the move to a formal EIP submission, opening PR #11144 as the first draft. A duplicate PR, #11186, was opened six days later; maintainer abcoathup asked chunter to consolidate ("Can you close #11144 if this is going to be the PR for EIP-8130 moving forward?"), and #11144 closed January 29 in favor of #11186, which merged February 28, 2026 and established the baseline spec.

Early forum review (posts #5-10, January 22-29) shaped two decisions before the spec even merged. First, rmeissner (post #5) questioned bundling authentication and gas-payment logic into a single EIP, arguing from past experience that combined scope "lowers the chances of adoption by the core team due to complexity" and suggesting a split. chunter agreed (post #6) to separate the concerns, and defended the self-call execution model on the grounds that it keeps `tx.origin` equal to the wallet address and lets wallets detect the AA entry pattern via `msg.sender == tx.origin == address(this)` without a dedicated entrypoint contract. Second, Helkomine (post #7) argued that token-based gas payment should stay ordinary ERC-20 storage rather than becoming a first-class transaction-format attribute, warning that baking payment semantics into the tx format increases protocol complexity; this concern anticipated the later closure of the separate "Token Gas Payments for EIP-8130" companion PR (#11194, opened January 28, closed March 2 without a stated inline rejection, consistent with deferring token-gas-payment mechanics out of the core EIP).

Safe's rmeissner and chunter also worked through a concrete compatibility question (posts #8-9): whether Safe's existing self-call config-change detection would remain compatible with the AA entrypoint pattern, and how to disambiguate the initial AA invocation from a later self-call triggered by contract code. They converged on a transient-storage flag set on the initial frame, reasoning that a later call "to another address... caller can't be msg.sender," though chunter noted he "haven't thought too deeply on it" beyond the common case. In post #10 (January 29), chunter laid out the proposal's central tradeoff explicitly: swapping arbitrary validation-code execution for fixed account configurations means, in his words, "no wasted/unpaid computation and performant inclusion checks." He argued this was acceptable because the vast majority of wallets verify a single key (secp256k1, P-256, WebAuthn), with BLS available for aggregation, and existing ERC-4337 accounts could migrate by registering keys with a precompile rather than being locked out.

The original PR #11186 submission used terminology and structure that would not survive the next month of review: "keys" (not actors) identified by "keyId," "verifiers" (not authenticators) performing checks via `IAuthVerifier.verify()`, two separate transaction fields for account mutation (`account_initialization` and `key_changes`), no scope/permission model at all (any authorized key had full authority), and a Transaction Context delivered through EIP-1153 transient storage directly on the Account Configuration contract. `AA_TX_TYPE` and `AA_PAYER_TYPE` were both `TBD` placeholders. Every one of these choices was revised within the next several PRs, covered in Phase 2.

---

## Phase 2: The First Structural Rewrite — Scope, Owners, and the Payer Precompile (March 2026)

March 2026 saw the single densest run of structural change in the spec's history, all authored by chunter within an eleven-day window.

**Unifying account mutation and introducing Account Lock (PR #11367, merged March 3).** The original submission's two separate mutation fields, `account_initialization` for new accounts and `key_changes` for portable key-change operations, collapsed into one typed `account_changes` array with entry types for create, account/policy change, and key change. This PR also introduced **Account Lock** for the first time: an account could freeze its own key configuration, rejecting all modification paths while locked, and added an ERC-1271 `isValidSignature` fallback authorization path so already-deployed wallets without registered keys could still authorize account changes during migration. This is the largest restructuring PR before the terminology renames began, and it established the "unified typed entry list" pattern that every later account-mutation section builds on.

**"Keys" become "owners" (PR #11380, merged March 6, "Simplify for initial EIP").** `key_config` became `owner_config`, `keyId` became `ownerId`, and on-chain public-key storage was dropped entirely: verifiers began resolving the public key from calldata at signing time rather than reading it from storage. The stated motivation was simplifying the MVP and reframing these entities as generic authority-holders rather than raw cryptographic keys, since a delegate- or verifier-routed entry doesn't literally hold "a key" the way a secp256k1 owner does.

**The first scope model and the payer precompile (PR #11388, merged March 9, "Enable permissionless payer").** This PR did two things at once: it renamed `IAuthVerifier` to `IVerifier` (dropping a redundant prefix), and, more consequentially, introduced the first permission bitmask: `0x01 SIGNATURE`, `0x02 SENDER`, `0x04 PAYER`, `0x08 CONFIG`, with `scope == 0x00` meaning unrestricted. The rationale quoted directly in the spec diff makes the motivation explicit: "Without scope, all owners have equal authority... This is insufficient when accounts have owners serving different roles, like for example running a payer for ERC-20 tokens." The same PR replaced the EIP-1153-transient-storage-based Transaction Context with a dedicated Transaction Context precompile, dropping the EIP-1153 requirement from the frontmatter. Both changes came from the same underlying pressure: a single flat authority model couldn't support a permissionless-payer use case where a payer key should be able to fund gas without also being able to rewrite the account's configuration.

Smaller PRs in the same window (#11372 motivation wording, #11374 verifier gas and cross-chain signature tweaks, #11378 removing hardcoded storage-slot derivation formulas from the normative text, #11382 K1/ECDSA behavior clarifications, #11428 account-config interface cleanup) rounded out the month, mostly following on from the owners rename and scope model rather than introducing new debate.

---

## Phase 3: Nonce Rework and the First Security Fix (April 2026)

**Nonce-free mode and EOA revocation cleanup (PR #11478, merged April 2, "Eip 8130 nonce and EOA delegation changes").** The original two-dimensional nonce design (a separate `nonce_key`/`nonce_sequence` pair) was repacked into a single `nonce` field, and a genuinely new capability was added: **nonce-free mode**, selected via the `NONCE_KEY_MAX` sentinel, letting a transaction skip nonce reads entirely and rely on `expiry` alone for replay protection. This PR also tightened the implicit-EOA-owner revocation model, moving from an ambiguous "empty slot = authorized" convention toward an explicit revocation marker that distinguishes "revoked" from "never touched," and added the `ECRECOVER_VERIFIER` sentinel constant to formalize native ecrecover as a registrable verifier type in its own right. The nonce-free mode introduced here would not get hardened replay protection until `replay_id` shipped two months later (PR #11752, Phase 4).

`requires: 7702` was dropped in PR #11492 (April 14, "Fix sentinel addresses"), meaning EIP-8130 no longer formally depended on EIP-7702, though EOA-delegation interoperability with 7702 remained part of the informal design discussion.

**First externally-reported security fix (PR #11591, merged May 4).** Community contributor pochenai flagged and fixed a real cross-sender payer signature replay issue: a payer authorization was not properly bound to the resolved sender, meaning the same payer signature could potentially be reused across different senders. This is the first PR in the spec's history authored by someone other than chunter, and it set a pattern, followed twice more later in the year (PRs #11609 and #11612), of external contributors surfacing concrete authorization and replay gaps that chunter's own review cycle had not caught.

---

## Phase 4: Canonical Sets, Field Renames, and a Contested Security PR (May – Early June 2026)

**Canonical verifier set (PR #11647, merged May 11).** For the first time, the spec formalized a node-conformance baseline: nodes MUST accept a baseline set of well-known verifiers deployed at deterministic CREATE2 addresses, maintained in a companion ERC, and MAY extend with non-canonical ones. This moved the spec away from an implicit "whatever the node feels like allowlisting" model toward an explicit, extensible baseline, and directly set up the later verifier-to-authenticator terminology fight (Phase 5), since a canonical *set* needed a settled name for the thing being canonicalized. PR #11651 (May 12) tightened the MUST/MAY language immediately following, and #11654 (May 12) updated gas and verifier validation details in the same vein.

**`from` becomes `sender` (PR #11526, merged May 11).** The top-level transaction field `from` was renamed `sender` throughout, disambiguating it from the EVM/JSON-RPC notion of `from`, which for an AA transaction is not necessarily the literal envelope signer in the way it is for a legacy transaction. The rename cascaded through every field reference in the validation, signature-payload, and gas-cost sections.

**A partially-accepted, partially-rejected security PR (PR #11612, opened May 7, closed May 14).** pochenai raised four claimed authorization and replay vulnerabilities in a single PR: (C1) the implicit-EOA rule was scoped too loosely, since any verifier returning `bytes32(bytes20(from))` could pass; (C2) the payer hash didn't bind the sender's verifier choice; (C3) multichain owner changes had no expiry, making them replayable on any future chain that deploys the Account Configuration contract; (C4) there was no auto-revocation of the implicit EOA owner on first delegation, leaving a permanent backdoor around delegated-wallet logic. chunter's response split cleanly: C1 and C2 were agreed and folded into PR #11654. C3 and C4 were explicitly rejected with stated reasoning. On C3: "It is intentional that there is no expiration. Multi-chain changes are meant for full owners, local changes can be used for any per chain policies and give an instant expiration when applied." On C4: "We do not want to auto revoke the EOA key when the account is delegated to as it would disable using the EOA." pochenai closed the PR after acknowledging the two rejections made sense, noting the accepted half was "well addressed" elsewhere. It is the clearest case in the spec's history of the author distinguishing a real bug from an intentional tradeoff being second-guessed.

**Constants finally pinned, and a nonce-free dedup mechanism (PRs #11757 and #11752, both merged June 2).** After more than three months of `TBD` placeholders, `AA_TX_TYPE` and `AA_PAYER_TYPE` were assigned concrete byte values, `0x7B` and `0x7C`. The same day, PR #11752 defined `replay_id = keccak256(REPLAY_ID_TYPE || rlp([chain_id, resolved_sender, expiry, account_changes, calls, metadata, payer]))` for nonce-free-mode deduplication, deliberately excluding the fee fields and both authentication blobs so that fee-bumped or re-signed variants of the same logical transaction collapse to a single mempool slot rather than being treated as distinct transactions. This directly hardened the nonce-free mode introduced back in PR #11478 (Phase 3), closing the gap between "nonce-free mode exists" and "nonce-free mode has real replay protection."

**EIP-170 code-size guard (PR #11609, merged June 2 after roughly four weeks of review).** pochenai's create-entry guard PR converged, through review exchange with chunter, on matching CREATE2 freshness semantics exactly (`code_size(from)==0 && nonce(from)==0`), with chunter arguing a separate "owner_config emptiness" check the PR originally proposed was unnecessary once the code-size and nonce checks were in place. `requires: 170` (EIP-170 max code size) was added as a result, closing out the review with chunter's own comment: "Agree on enforcing the EIP-170 max code size."

---

## Phase 5: The Actor Rename and the Policy Model (June 4 – June 10, 2026)

**"Owners" become "actors" (PR #11764, merged June 4, "rename owners to actors and finalize Transaction Context naming").** The spec's second major terminology overhaul renamed `ownerId` to `actorId`, `owner_config` to `actor_config`, and the associated structs and functions (`authorizeOwner`/`revokeOwner` to `authorizeActor`/`revokeActor`, `applySignedOwnerChanges` to `applySignedActorChanges`). The PR body gives the rationale directly: "Many of these entities are scoped credentials (PAYER-only, SIGNATURE-only, session-style keys), so 'owner' overstated their authority; 'actor' describes a scoped signing entity more accurately." The rename was a direct consequence of the scope model introduced back in PR #11388: once an authorized entry could hold a narrow permission like PAYER-only, calling it an "owner" was misleading. The same PR finalized the Transaction Context precompile's getter naming (`ITxContext` to `ITransactionContext`), and a same-day follow-up (PR #11765) renamed `IAccountConfiguration.verify` to `verifyActor` to disambiguate it from `IVerifier.verify`, which returns a different kind of value.

**Actor call policies, landed on the second attempt (PR #11766, merged June 4).** The `policyType`/`policyTarget`/`manager`-gated call-initiation feature, which restricts a scoped actor to calling a single designated contract, first appeared as draft PR #11648 (opened May 11). That PR was closed June 4 after becoming, per its own successor's description, "unmergeable due to some eth-bot bug," and was replaced by a clean rebase in #11766 the same day. This was a mechanical rebase-and-resubmit rather than a substantive rejection; the design itself carried over unchanged. A related PR, #11758 (opened June 2, closed June 4), had separately proposed trimming the Transaction Context precompile down to three identity-only getters, arguing the removed getters' only historical consumers, stateful payer verifiers, were superseded by the new policy managers. PR #11764 (merged the same week) kept #11758's naming conventions but explicitly reversed its removals, retaining the full interface.

**"Verifier" becomes "authenticator" (PR #11785, merged June 9, "Rename verifier -> authenticator").** The third and final major terminology overhaul renamed `IVerifier` to `IAuthenticator`, `verify()` to `authenticate()`, and the "Canonical Verifier Set" (introduced in PR #11647, Phase 4) to the "Canonical Authenticator Set." The diff's own prose captures the semantic distinction driving the change: the authenticator "*authenticates* the actor (it returns the actor's `actorId`); scope and policy then *authorize* what that authenticated actor may do," disambiguating the identity-resolution step from the permission-checking step, which the word "verify" had conflated. A one-day-later follow-up (PR #11794, June 10) expanded `authenticateActor`'s return signature from a bare scope byte to `(scope, policyType, policyTarget)`, letting a single call surface the full authorization gate to callers like ERC-4337 UserOp validators.

By the end of Phase 5, the spec had gone through three complete renaming passes in roughly three months: keys to owners (March), owners to actors (June), and verifiers to authenticators (June). Each rename tracked a real semantic shift, from unscoped key-holders, to scoped-but-uniformly-authorized actors, to actors whose authentication and authorization were now cleanly separated concerns.

---

## Phase 6: Metadata, Replay Hardening, and the Quantum-Safe Default (June 15 – June 18, 2026)

**Metadata field resolution (PR #11805, merged June 15).** This closed out a month-long design debate between two competing drafts: PR #11578 ("add opaque_input bytes field," opened April 29 by pochenai, never merged) proposed a dedicated top-level field mirroring the legacy `input` field's attribution role; PR #11655 ("Add metadata sink," opened May 12 by chunter, explicitly marked "DO NOT MERGE (just for discussion)") proposed instead representing wallet attribution data as a protocol-recognized no-op call composing with the existing `calls` array. PR #11805 shipped a third design: a standalone opaque, signed `metadata` transaction field, restoring the tx-level annotation role that legacy `input` played (for example ERC-8021-style attribution suffixes) without polluting EVM calldata dispatch. #11655 was closed once this shipped; #11578 remains open as of this writing, effectively superseded in spirit but not formally reconciled with the shipped design (see Active/Open PRs in [Merged Changes](/merged-changes)).

**Delegate-authenticator payer-hash binding (PR #11808, merged June 16).** This closed a genuine cross-account replay hole: the payer signature hash did not previously bind the `payer` field itself, so a delegate authenticator, which authorizes one key across many accounts, could have its vouching signature redirected across accounts by swapping the `payer` field. The fix mirrored the existing sender-side binding that already protected against the analogous sender-side issue.

**Folding EOA revocation into a state flag, and a quantum-safe default (PR #11815, merged June 18, "fold default-EOA revocation into a state flag").** The `REVOKED_AUTHENTICATOR` magic-address sentinel trick was removed entirely and replaced with a single `DEFAULT_EOA_REVOKED` bit packed into the existing account-state slot. `ECRECOVER_AUTHENTICATOR` was renamed `K1_AUTHENTICATOR`, unifying the implicit-default and explicitly-registered secp256k1 paths under one identity. The most consequential change in this PR, though, was a default flip: `createAccount` and `importAccount` now revoke the implicit EOA owner by default, framed explicitly as a "quantum-safe default," meaning a freshly created or imported account no longer leaves a live secp256k1 owner in place unless one is explicitly listed in `initial_actors`. A same-arc follow-up (PR #11816, also June 18) moved the default-EOA's secp256k1 scope and expiry inline into the packed account-state slot itself, so the account's own key resolves in a single storage read instead of two.

Rounding out this window: PR #11809 (June 16) relaxed a delegate-import restriction, PR #11812 (June 17) fixed an intrinsic-gas under-accounting bug where create-entry actor registration had previously been free, and PR #11813 (June 17) clarified that the intrinsic-gas schedule is a recommended reference rather than a protocol constant, leaving room for future EVM repricing.

---

## Phase 7: The Celo Migration Question and the Transaction-Type Collision (June – July 2026)

This phase runs two threads in parallel: a forum discussion about migrating an existing production account-abstraction system onto EIP-8130, and the spec-side scope-grant redesign that was landing at the same time.

**The Celo CIP-64 migration discussion (posts #12-22, June 5 – July 8).** karlb opened the thread (post #12, June 5) proposing that letting a chain set a default verifier at the protocol level "could make it easier to migrate from a previous account abstraction system (e.g. Celo's CIP-64) without modifying the state of all user accounts." chunter (post #13) probed what CIP-64 signs over and whether its native `feeCurrency` payment should move onto EIP-8130. karlb laid out two options (posts #15-18): a backward-compatible RPC shim that repackages CIP-64 transactions behind a `CIP64Verifier` authenticator, needing a chain-level default verifier so existing accounts don't each write config, versus wallets signing native EIP-8130 transactions with a two-phase fee-abstraction pattern and the sequencer as payer. karlb called the native path "the cleaner option in the long run" but slower to roll out. chunter proposed a middle path (post #19, June 29): keep signing CIP-64 unchanged, verify against its preimage, and convert losslessly at the RPC layer until a future hardfork makes the type native.

**The collision that forced a renumbering (post #20, June 30).** karlb flagged a concrete conflict: EIP-8130's assigned `0x7b` (set in PR #11757, Phase 4) collided with the transaction type already used for Celo's CIP-64 on the OP Stack, which "will prevent us from adding EIP-8130 support before we phased out CIP-64." He asked for a different `AA_TX_TYPE` so both could deploy in parallel. chunter agreed (post #21, July 6) to explore alternatives, noting a CIP-64 fork already sat at the OP-Stack execution layer until deprecation.

**Resolution (PR #11903, merged July 8; post #22).** `AA_TX_TYPE` moved `0x7B` → `0x79` and `AA_PAYER_TYPE` `0x7C` → `0x7A`; chunter announced it on the forum the same day. This is a real deployment conflict from a downstream integrator, not a design-review objection, changing a constant a month after it was "finalized" in PR #11757. The same PR added an `eth_call`/`eth_estimateGas` extension priced from an unsigned representative auth blob.

**The scope-grant redesign (PR #11918, merged July 13).** Landing five days later, this is the largest structural rewrite since the original unification in PR #11367. It redefines admin as the predicate `scope == 0x00` rather than a grantable CONFIG bit, turns scope into five independent grant bits, splits the single PAYER bit into SELF_PAYER and SPONSOR_PAYER (defined relationally by whether payer equals sender), and removes the standalone SIGNER bit in favor of an operational-authority predicate for ERC-1271 signing. The stated reasoning throughout is that a permission a key can already grant itself, or exercise by other means, should not masquerade as a separate bit. It also simplified Account Lock to a strict lock-then-unlock lifecycle via `applySignedLockChanges`. The per-area mechanics are in [Merged Changes](/merged-changes).

A same-day follow-up, PR #11919 (opened July 13, still open), adds an optional `expiry` to initial actors at create and import time, committed into the per-actor address-derivation preimage so a front-runner cannot alter it before inclusion.

**The opaque metadata field gains an application-layer format (ERC-8340 / ERC PR #1883, opened July 15).** The core EIP deliberately leaves `metadata` uninterpreted. ERC-8340 proposes deterministic CBOR records for attribution, memos, phase/call scope, and salted offchain commitments, plus an ERC-5792 wallet capability. The rationale is interoperability: without a shared layout, each producer invents framing and indexers cannot decode across wallets. It remains a draft ERC and does not alter consensus treatment of the field.

---

## Phase 8: From Draft Design to Public Implementation (July 17 – July 24, 2026)

**Base names an activation window.** In [Native Account Abstraction](https://x.com/buildonbase/status/2078132881017245881), Base announced a partnership with Optimism, Coinbase, and WalletConnect to ship EIP-8130 first in Base's Cobalt upgrade in September 2026, then across OP Stack chains later in the year. This is the first concrete chain-rollout commitment documented by this site. It does not finalize the EIP or activate it on Ethereum L1.

**Vibenet turns implementation into a public test surface.** The announcement identifies [Base Vibenet](https://vibes.base.org/) as an ephemeral pre-activation devnet and asks chain, wallet, and application developers to integrate early. It says existing application flows such as `wallet_sendCalls` should continue working, while wallets can add native-AA support for payer services, session keys, sub-accounts, and metadata.

**Base publishes comparative cost claims.** Against its ERC-4337 smart-account baseline, Base reports a USDC transfer falling from 125,000 to 46,000 gas and from 1,090 to 180 bytes. Its passkey example falls from 173,000 to 68,700 gas and from 1,940 to 890 bytes. The post provides no benchmark harness or reproducibility details, so these are vendor-reported adoption evidence, not independently verified protocol measurements.

**Scoped actors get a concrete "remote control" test (posts #23-26, July 21-22).** After karlb confirmed the transaction-type renumbering resolved Celo's collision (post #23), cyrus asked whether an EOA could originate transactions for a smart account without gaining actor-management authority (post #24). chunter answered that a non-admin actor can combine `SENDER | SELF_PAYER | NONCE`, optionally adding `SPONSOR_PAYER`, while only `scope == 0x00` remains admin (post #25). Cyrus then asked whether account code itself can add or remove a `SENDER` actor (post #26). That question remains unanswered on the thread; the canonical text says anyone may relay an actor change, but its signed authorization must resolve to an existing admin.

**The reference implementation exposes portability and signing boundaries.** Base's implementation [PR #44](https://github.com/base/eip-8130/pull/44) (merged July 22) added `executeAttested` for ERC-4337-only chains with no transaction-context precompile, explicitly moving actor authenticity and confinement into the account. [PR #45](https://github.com/base/eip-8130/pull/45) (merged July 24) wrapped ERC-1271 checks in an account-scoped EIP-712 `replaySafeHash` to prevent a credential shared by multiple accounts from replaying one signature across all of them. The signing boundary became canonical in evolved form in Phase 9; the attested ERC-4337 path remains implementation behavior.

---

## Phase 9: Public Policy and Keystore Convergence (July 30 – August 20, 2026)

### Permissionless policy actors remain an open question (post #27, July 30)

Cyrus proposed a wildcard or public `POLICY` actor that anyone could authenticate as, provided every top-level call remained confined to one policy manager. The motivating cases were permissionless legacy-asset unwraps and keeper-style actions. The question tests whether policy confinement can replace actor allowlisting without reopening denial-of-service risk during validation. No answer appears after post #27, and the merged EIP still requires every native transaction actor to authenticate through the Keystore.

### The contracts become the source for mechanics (Base PRs #46, #55, #63, #64, August 6-7)

Base's implementation moved through a large research alignment: [PR #46](https://github.com/base/eip-8130/pull/46) consolidated the contract model; [#55](https://github.com/base/eip-8130/pull/55) widened scope and revised slot packing; [#63](https://github.com/base/eip-8130/pull/63) introduced typed signature envelopes; and [#64](https://github.com/base/eip-8130/pull/64) added the local-epoch system. The common rationale was to make account recovery, unsequenced changes, and cross-account signing boundaries explicit before the EIP repeated lower-level contract details.

### Keystore alignment (PR #12135, opened August 10, merged August 11)

PR #12135 pulled that contract work into the EIP and deliberately slimmed the prose. It renamed Account Configuration to Keystore, replaced one transaction expiry with a millisecond validity window, introduced local epochs, unified signed actor and lock operations, added `CONTRACT_ESTABLISHED`, and made `validateSignature` account- and chain-scoped. The change was +214/-312 and touched nearly every major area. No substantive human review exchange was posted; automated approvals and CI were the only recorded reviews before the next-day merge.

### Audit reconciliation and actorId encoding (PRs #12148 and #12173, August 12-14)

PR #12148 reconciled edge cases found during contract review: self-revocation disables both actor paths, redundant delegated-code checking is removed, and expired unsequenced grants are skipped without blocking live siblings. PR #12173 then fixed address-derived `actorId` values to right-aligned addresses and removed create-bytecode validation detail from the protocol prose. Together they show the new operating model: the EIP specifies consensus boundaries while the audited Keystore contracts carry internal mechanics.

### Adoption profiles and bounded authentication (PR #12204, opened and merged August 19)

PR #12204 answered a question the audit work had exposed: on a base layer, "chain MAY choose" pricing and acceptance rules would let two compliant clients disagree on block validity. It split adoption into an L1 profile with a normative gas schedule and permissive, gas-capped authenticator acceptance, and an L2 profile with configurable pricing and a canonical-only path. It also exposed transaction context during authentication so payer authenticators can decide sponsorship onchain, and accepted second or millisecond timestamps by magnitude. lightclient's only involvement was rerunning CI; it merged the day it opened, superseding two drafts from the previous day.

---

## Phase 10: Sibling EIPs and the Account-Model Debate (August 21 – September 3, 2026)

### The Keystore grows extension EIPs (PRs #12218, #12221, #12222, #12240, August 21-25)

Breaking EIP-8130's habit of landing every feature in its own spec file, chunter-cb opened four separate drafts: EIP-8386 (read-only views over the transaction's log journal, pitched on its thread as a replacement for EIP-7906 transaction assertions), EIP-8387 (transaction-scoped stateless accounts "to support privacy flows and statelessness goals"), EIP-8388 (EIP-1559 and EIP-2930 transactions authenticated through the Keystore), and an unnumbered expired-actor pruning draft. On EIP-8387, AnkushinDaniil asked how revocation could be enforced without stored state; chunter-cb answered that stateless is "the default, not a restriction," and accounts needing durable revoke can write real Keystore state. All four drew change requests from jochem-brouwer and none has merged.

### Public policy actors and cross-chain freshness (posts #28-31, August 23-30)

chunter answered post #27 a month late: a public `POLICY` actor is essentially an `AlwaysValidAuthenticator`, outside the canonical set but "a very simple add" (posts #28-29). Agusx1211 (post #30) then argued that a revoked admin stays valid on any chain nobody relays to, and proposed an opt-in freshness check whose interface "can only block, never authorize," plus snapshot batches. chunter (post #31) suggested expiring non-admin operators re-authorized by an admin authenticator that requires proof from a home chain, "still in design."

### Should L1 enshrine an account model? (Frame Transaction breakout #2, August 25; ACDE #244, August 27)

The forum's meeting summary of [breakout #2](https://ethereum-magicians.org/t/29419) records Chris presenting EIP-8130 against EIP-8141 and Base offering to delay its fork. Its recorded outcome was that L1 should not enshrine opinionated account models, while EIP-8130's authenticator validation benefits L2s, with a companion keystore EIP as a next step. The [ACDE #244](https://ethereum-magicians.org/t/29468) summary added weekly AA calls with a DevCon (November 3) decision deadline. It is the backdrop for the rest of this phase and the next.

### An identity flag reversed (PR #12250, August 27)

PR #12250 removed `CONTRACT_ESTABLISHED` two weeks after PR #12135 added it, following Base implementation PR #92, and shifted the remaining flags down one bit. No rationale was posted beyond the diff; it is the first time an August alignment addition was rolled back.

### A competing decomposition and the rename (PR #12248, August 27 – September 3; PR #12295, September 3)

pedrouid's PR #12248 proposed splitting EIP-8130 into separate transaction, Keystore, and advanced-controls EIPs while leaving 8130 unchanged. abcoathup suggested a new Keystore EIP might be easier "depending how Chris wants to approach this," and the PR closed on September 3. Hours later chunter-cb's PR #12295 renamed EIP-8130 "Keystore Accounts" with no protocol change. AnkushinDaniil's ERC-8403 (opened August 29) meanwhile set out to define one actor lifecycle for both EIP-8130 and EIP-8141.

---

## Phase 11: Contract Realignment and the Transaction-Type Split (September 3 – October 21, 2026)

### Checkpointed actors and admin freshness (PRs #12293 and #12313, September 3-11)

pedrouid opened two alternative designs letting non-admin actors live in a checkpointed, offchain-maintained set that an onchain admin must co-approve, so a compromised checkpointer cannot grant authority alone. Agusx1211 accepted that fix but said the stale-admin problem from post #30 remained: "a lagging chain refuses stale-owner authorization" only if admins also get freshness checks. Neither PR has an author review.

### Base moves the activation out of Cobalt (base/base PRs, September 8-30)

Base's client moved EIP-8130 from Cobalt to an unscheduled upgrade on September 8, then to a new Everest upgrade on September 25. On September 29 it gated the Keystore to Zenith, a test-only fork never scheduled on mainnet or Sepolia, because "Everest has no concept of the Keystore." Cobalt shipped on September 30 without EIP-8130.

### The EIP catches up with the contracts (PR #12333, September 14; PR #12320, September 16)

PR #12333 adopted the repository's scope-bit order, renamed SENDER to OPERATOR, made OPERATOR override POLICY, and replaced signed import with a callback import, all to stop drifts "a node implementer reading only the EIP would get wrong." Separately, karlb's post #33 (September 2) showed that EIP-7623's floor never bound on `0x79`; chunter replied "will update things" (post #35) and PR #12320 added the floor.

### The transaction type splits out (PRs #12385 and #12386, September 28 – October 8)

chunter-cb's paired PRs mirrored Base's staging: EIP-8430 carries a secp256k1-only transaction for today's EOAs, and EIP-8130 becomes a transport-neutral Keystore naming EIP-8141 frame accounts among its consumers. "Neither EIP requires the other," the [EIP-8430 thread](https://ethereum-magicians.org/t/eip-8430-aa-transaction-type-split-out-from-8130/29810) opened. There, chugarchugarr noted the config-change auth blob leaks into `replay_id`, and AnkushinDaniil proposed sharing EIP-8250's nonce manager; chunter was open to both.

### Simplification proposed (PR #12462, October 8)

The day #12386 merged, chunter-cb opened a draft cutting scope to OPERATOR and POLICY and removing the policy manager and account lock, because finer gas or nonce grants "protected nothing." On the EIP-8141 side, EIP-8397 merged on October 14 with a registry-free `AUTHENTICATOR` scheme, a parallel convergence on authenticate-then-authorize.

---

## Where Things Stand

As of October 21, 2026, EIP-8130 is a Draft titled "Keystore Accounts" with 49 merged spec PRs, the latest being #12386's transaction-type split. Its transaction format lives in open EIP-8430 (PR #12385), and eight EIP-8130 PRs are open, including draft #12462's proposal to cut scope to two bits and remove account lock. Four extension EIPs (8386, 8387, 8388, and the unnumbered pruning draft) await editor fixes. The forum thread reaches post #35. Base's Cobalt shipped without EIP-8130; Everest plans EIP-8430 with no date, and Base keeps the Keystore behind a fork it does not schedule in production.

For the mechanical PR-by-PR record, see [Merged Changes](/merged-changes). For the spec as it stands today, see [Current Spec](/current-spec).
