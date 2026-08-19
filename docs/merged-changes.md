# Merged Changes

Every pull request touching `EIPS/eip-8130.md`, in commit order, from the original submission (PR [#11186](https://github.com/ethereum/EIPs/pull/11186), merged February 28, 2026) through the most recent merge (PR [#12173](https://github.com/ethereum/EIPs/pull/12173), merged August 14, 2026). Sections below group same-day or same-theme merges; structurally significant PRs get a full why/what/why-it-matters treatment, and smaller changes get a one-line entry. Currently open and closed-without-merge PRs are listed separately at the end of this page. See [Original Spec](/original-spec) for the pre-#11367 baseline and [Original vs Latest](/original-vs-latest) for a structural diff against today's spec.

---

## Original Submission — February 28, 2026

**PR [#11186](https://github.com/ethereum/EIPs/pull/11186)** — chunter-cb, +722/-0

- **Why**: Formalize the Account Configuration concept (EIP frontmatter created October 14, 2025; EthMagicians thread opened October 24) as a numbered Core EIP after a false-start duplicate submission ([#11144](https://github.com/ethereum/EIPs/pull/11144)) had to be closed and refiled clean.
- **What**: Establishes the original model entirely in terms later renamed away: "keys" identified by "keyId", "key_config" storage, "verifiers" performing signature checks via `IAuthVerifier.verify()`. Two separate account-mutation fields, `account_initialization` (CREATE2 new-account creation) and `key_changes` (portable key-change operations). No scope-bit model; the only permission primitive was a `key_policy` bitfield (`revoked`, `requireSponsor`), where a `requireSponsor` key could authenticate but not draw the account's ETH for gas. No Account Lock. Transaction Context delivered via EIP-1153 transient storage directly on the Account Configuration Contract. Five well-known verifiers (K1, P256, WebAuthn P256, BLS, DELEGATE). `AA_TX_TYPE`/`AA_PAYER_TYPE` both `TBD` placeholders. `requires: 1153, 2718`.
- **Why it matters**: This is the baseline every later PR reshapes. Every major rename in the spec's history (keys to owners, owners to actors, verifiers to authenticators) and every structural addition (scope bits, Account Lock, nonce-free mode, canonical authenticator set) starts from this file.

The duplicate PR #11144 (opened January 21, closed January 29) is tracked under Rejected/Closed PRs below, not here, since it never merged.

---

## Account Changes Unification and First Account Lock — March 3, 2026

**PR [#11367](https://github.com/ethereum/EIPs/pull/11367)** — chunter-cb, +471/-292

- **Why**: The original two-field split (`account_initialization` vs. `key_changes`) didn't generalize to config changes that weren't key rotations, and existing smart-contract wallets migrating onto the spec had no way to authorize a first key change without already holding one.
- **What**: Collapses `account_initialization` and `key_changes` into a single typed `account_changes` array with entry types create (`0x00`), account/policy change (`0x01`), key change (`0x02`). Introduces **Account Lock** for the first time, an account can freeze its own key configuration; all modification paths reject while locked. Adds an **ERC-1271 `isValidSignature` fallback authorization path** for accounts that haven't yet registered explicit keys, a migration path for existing wallets. Adds `MAX_ACCOUNT_CHANGES` and `requires: 7702`.
- **Why it matters**: Establishes the "unified typed entry list" pattern for account mutation that every later PR touching account changes builds on, and introduces Account Lock, which by PR #11918 (July 13) becomes a core mempool-tiering primitive.

**PR [#11372](https://github.com/ethereum/EIPs/pull/11372)** — chunter-cb, +5/-7. Motivation section wording update, same day as #11367.

---

## Gas Tweaks and Slot-Derivation Cleanup — March 4 – March 5, 2026

**PR [#11374](https://github.com/ethereum/EIPs/pull/11374)** — chunter-cb, +33/-53. Verifier gas accounting and cross-chain signature tweaks.

**PR [#11378](https://github.com/ethereum/EIPs/pull/11378)** — chunter-cb, +179/-321

- **Why**: The original spec hardcoded storage-slot derivation formulas directly in the normative text, coupling the EIP to implementation details that belonged in a reference contract instead.
- **What**: "Slot derivations left to final contract" removes the hardcoded storage-slot derivation formulas from the spec body, deferring them to the reference implementation, alongside a large prose reorganization.
- **Why it matters**: Sets a precedent, later echoed in PR #11813 (June 17), that mechanical/implementation-level detail (slot layout, gas schedule values) is non-normative and can evolve without a spec change, while the formula *structure* stays normative.

---

## Keys Renamed to Owners — March 6 – March 7, 2026

**PR [#11380](https://github.com/ethereum/EIPs/pull/11380)** — chunter-cb, +91/-121

- **Why**: "Keys" and "keyId" implied every authorized entity held a raw cryptographic key, which didn't fit delegate/verifier-routed authorization paths, and on-chain public-key storage added complexity the MVP didn't need.
- **What**: "Simplify for initial EIP" renames `key_config`→`owner_config`, `keyId`→`ownerId`, and all associated function/struct/event names. Simultaneously drops on-chain public-key storage, verifiers now resolve the public key from calldata at signing time rather than storage.
- **Why it matters**: First of three major terminology overhauls (keys to owners here, owners to actors in #11764 on June 4, verifier to authenticator in #11785 on June 9). Each rename tracks a shift in how the spec frames what an authorized entity actually is.

**PR [#11382](https://github.com/ethereum/EIPs/pull/11382)** — chunter-cb, +95/-93. "Clear up naming and k1 behaviour," post-rename K1/ECDSA behavior clarifications.

---

## Scope Model and Transaction Context Precompile — March 9, 2026

**PR [#11388](https://github.com/ethereum/EIPs/pull/11388)** — chunter-cb, +143/-115

- **Why**: Quoted directly from the diff: "Without scope, all owners have equal authority... This is insufficient when accounts have owners serving different roles, like for example running a payer for ERC-20 tokens."
- **What**: "Enable permissionless payer" introduces the **first scope/permission bit model**: `0x01` SIGNATURE, `0x02` SENDER, `0x04` PAYER, `0x08` CONFIG (`scope == 0x00` = unrestricted/admin). Renames `IAuthVerifier`→`IVerifier`. Replaces the EIP-1153-transient-storage-based Transaction Context with a dedicated **Transaction Context precompile** at `TX_CONTEXT_ADDRESS`, dropping `requires: 1153` from the frontmatter.
- **Why it matters**: The first scope model here (SIGNATURE/SENDER/PAYER/CONFIG) is the direct ancestor of the five-bit grant model (SENDER/POLICY/NONCE/SELF_PAYER/SPONSOR_PAYER) that PR #11918 lands four months later. Dropping the EIP-1153 dependency also means the spec no longer needs transient storage to expose per-transaction context to executing code.

---

## Interface Cleanup — March 20, 2026

**PR [#11428](https://github.com/ethereum/EIPs/pull/11428)** — chunter-cb, +31/-28. "Adjust account config interface, small clean up."

---

## Nonce-Free Mode and EOA Delegation — April 2 – April 4, 2026

**PR [#11478](https://github.com/ethereum/EIPs/pull/11478)** — chunter-cb, +163/-112

- **Why**: The original implicit-EOA-owner revocation check ("empty slot = authorized, non-empty with verifier=0 = revoked") was ambiguous between "revoked" and "never touched," and every transaction needed a sequential nonce read even when replay protection could be handled more cheaply.
- **What**: "Eip 8130 nonce and EOA delegation changes" reworks implicit-EOA revocation to use an explicit revocation marker instead of a slot-emptiness check. Packs the existing 2D nonce (`nonce_key` high bits / `nonce_sequence` low bits, both present since the original) into a single `uint256` `nonce` field, and adds a brand-new **nonce-free mode** via the `NONCE_KEY_MAX` sentinel, transactions in this mode skip nonce reads entirely and rely on `expiry` alone (later hardened by the `replay_id` mechanism in PR #11752, June 2). Adds the `ECRECOVER_VERIFIER` sentinel constant. A later cleanup un-packed the nonce back into two RLP fields and widened `nonce_key` to `uint256`, the shape in today's spec.
- **Why it matters**: Nonce-free mode becomes a first-class replay-protection path alongside sequential nonces, and the `ECRECOVER_VERIFIER` sentinel formalizes native ecrecover as an explicit, registrable verifier type distinct from the implicit-EOA default.

**PR [#11483](https://github.com/ethereum/EIPs/pull/11483)** — chunter-cb, +85/-82. "Contract updates," Account Configuration Contract interface refinements.

---

## Sentinel Address Fix — April 14, 2026

**PR [#11492](https://github.com/ethereum/EIPs/pull/11492)** — chunter-cb, +26/-19. "Fix sentinel addresses"; also drops `requires: 7702` from the frontmatter (EOA-delegation interop with EIP-7702 remains discussed informally but is no longer a formal dependency).

---

## Replay Hardening and Canonical Verifier Allowlist — May 4 – May 12, 2026

**PR [#11591](https://github.com/ethereum/EIPs/pull/11591)** — pochenai (community), +4/-0, security-relevant: "Prevent cross-sender payer signature replay," closes a real replay hole flagged by an external contributor.

**PR [#11526](https://github.com/ethereum/EIPs/pull/11526)** — chunter-cb, +43/-43. "Move from to sender," renames the top-level transaction field `from`→`sender` throughout, disambiguating from EVM/JSON-RPC `from` semantics. Cascades through Validation, Signature Payload, and gas-cost prose.

**PR [#11647](https://github.com/ethereum/EIPs/pull/11647)** — chunter-cb, +24/-3

- **What**: "Add canonical verifier set" introduces the **canonical verifier allowlist** concept, nodes MUST accept a baseline set of well-known verifiers, extensible via a companion ERC. First appearance of the `eth_getAcceptedVerifiers` `canonical` flag.
- **Why it matters**: Formalizes a node-conformance baseline distinct from "whatever the node feels like allowlisting," directly ancestral to the Canonical Authenticator Set section in today's spec (see [Current Spec](/current-spec)).

**PR [#11651](https://github.com/ethereum/EIPs/pull/11651)** — chunter-cb, +9/-11. Normative MUST/MAY tightening on verifier-allowlist language following #11647.

**PR [#11654](https://github.com/ethereum/EIPs/pull/11654)** — chunter-cb, +12/-9. "Update EIP-8130 gas and verifier validation."

---

## Concrete Type Bytes and Replay Identifier — June 2, 2026

**PR [#11757](https://github.com/ethereum/EIPs/pull/11757)** — chunter-cb, +17/-13

- **Why**: After more than four months as `TBD <!-- TODO -->` placeholders, the transaction-type constants needed concrete values before implementers could write conforming clients.
- **What**: "Resolve constants, gas accounting, and interface cleanups" assigns `AA_TX_TYPE = 0x7B` and `AA_PAYER_TYPE = 0x7C` for the first time.
- **Why it matters**: These values get renumbered again a month later (PR #11903, July 8, to `0x79`/`0x7A`), but this PR is the first time the spec has concrete byte values at all rather than open placeholders.

**PR [#11752](https://github.com/ethereum/EIPs/pull/11752)** — chunter-cb, +21/-4

- **Why**: Nonce-free mode (introduced PR #11478, April 2) needed a replay-dedup mechanism beyond `expiry` alone, particularly one that collapsed re-signed and fee-bumped variants of the same logical transaction to a single mempool slot.
- **What**: "Define signature-invariant nonce-free replay identifier" introduces `replay_id = keccak256(REPLAY_ID_TYPE || rlp([chain_id, resolved_sender, expiry, account_changes, calls, metadata, payer]))` for nonce-free-mode dedup. It commits to the logical transaction but excludes the fee fields and both auth blobs.
- **Why it matters**: Because the fee fields and `sender_auth`/`payer_auth` are excluded, fee-bumped or re-signed retransmissions of the identical logical transaction hash to the same `replay_id`, letting the mempool treat them as replacements rather than distinct entries. See [Mempool Safety](/mempool-safety) for the full replacement-rule treatment.

**PR [#11609](https://github.com/ethereum/EIPs/pull/11609)** — pochenai (community), +4/-4, security-relevant: "Add create entry existing-account and code-size guards," adds `requires: 170` (EIP-170 max code size). Merged after review converged with chunter-cb on matching CREATE2 freshness semantics exactly (`code_size(from)==0 && nonce(from)==0`), dropping a separate owner_config-emptiness check chunter-cb argued was redundant.

---

## Owners Renamed to Actors, Call Policies Added — June 4, 2026

**PR [#11764](https://github.com/ethereum/EIPs/pull/11764)** — chunter-cb, +142/-142

- **Why**: Quoted directly from the PR body: "Many of these entities are scoped credentials (PAYER-only, SIGNATURE-only, session-style keys), so 'owner' overstated their authority; 'actor' describes a scoped signing entity more accurately."
- **What**: "Rename owners to actors and finalize Transaction Context naming" renames `ownerId`→`actorId`, `owner_config`→`actor_config`, `OwnerConfig`/`Owner`/`OwnerChange` structs, `authorizeOwner`/`revokeOwner`→`authorizeActor`/`revokeActor`, `applySignedOwnerChanges`→`applySignedActorChanges`, `isOwner`→`isActor`. Finalizes the Transaction Context precompile getter naming (`getSender()`→`getTransactionSender()`, `ITxContext`→`ITransactionContext`).
- **Why it matters**: Second of the three major terminology overhauls (see PR #11380, March 6). "Actor" is the term that survives to the current spec.

**PR [#11765](https://github.com/ethereum/EIPs/pull/11765)** — chunter-cb, +3/-3. `IAccountConfiguration.verify`→`verifyActor`, disambiguating from `IVerifier.verify` (one returns an actorId, the other a scope); same-day follow-on to #11764.

**PR [#11766](https://github.com/ethereum/EIPs/pull/11766)** — chunter-cb, +125/-45

- **Why**: Rebased replacement for the closed draft [#11648](https://github.com/ethereum/EIPs/pull/11648) (closed because it "had become unmergeable due to some eth-bot bug," per its own PR description), carrying forward the first attempt at scoped-call restriction.
- **What**: "Add actor call policies and per-actor expiry" adds `policyType`/`policyTarget`(`manager`)-gated call initiation, enforced at execution time rather than validation to keep the mempool validity surface to a single `actor_config` SLOAD, plus a `uint48` per-actor `expiry`.
- **Why it matters**: Introduces the POLICY mechanic (a key gated to a single manager contract, e.g. a spend-capped session key) that persists through today's spec's Actor Policies section.

**PR [#11767](https://github.com/ethereum/EIPs/pull/11767)** — chunter-cb, +182/-223. "Clean up, reorganize and finalize pass," a large prose/structure reorganization consolidating the actor rename (#11764) and policy addition (#11766) into a coherent spec body.

---

## Fixes and Clarifications — June 5 – June 9, 2026

**PR [#11769](https://github.com/ethereum/EIPs/pull/11769)** — chunter-cb, +62/-24. "Fixes and clarifications."

**PR [#11782](https://github.com/ethereum/EIPs/pull/11782)** — chunter-cb, +52/-30. "Clarifications and clean up."

---

## Verifier Renamed to Authenticator — June 9 – June 10, 2026

**PR [#11785](https://github.com/ethereum/EIPs/pull/11785)** — chunter-cb, +101/-101

- **Why**: Quoted from the diff's own prose: "the [authenticator] *authenticates* the actor (it returns the actor's `actorId`); scope and policy then *authorize* what that authenticated actor may do," disambiguating an authentication step (identity resolution) from an authorization step (permission checking) that "verify" conflated.
- **What**: "Rename verifier to authenticator" renames `IVerifier`→`IAuthenticator`, `verify()`→`authenticate()`, "Canonical Verifier Set"→"Canonical Authenticator Set," and folds in `verifyActor`→`authenticateActor` (the #11765 rename target).
- **Why it matters**: Third and final major terminology overhaul (see #11380, #11764). "Authenticator" is the term used throughout today's spec.

**PR [#11791](https://github.com/ethereum/EIPs/pull/11791)** — chunter-cb, +5/-3. "Rlp abi correction."

**PR [#11794](https://github.com/ethereum/EIPs/pull/11794)** — chunter-cb, +2/-3. `authenticateActor` return value expands from `returns (uint8 scope)` to `returns (uint8 scope, uint8 policyType, address policyTarget)`, letting a single call surface the full authorization gate.

---

## Metadata Field and Policy Follow-Up — June 15, 2026

**PR [#11805](https://github.com/ethereum/EIPs/pull/11805)** — chunter-cb, +17/-3. Adds a transaction-level `metadata` field, resolving a month-long design debate between two competing drafts: the still-open [#11578](https://github.com/ethereum/EIPs/pull/11578) ("add opaque_input bytes field") and the closed [#11655](https://github.com/ethereum/EIPs/pull/11655) ("Add metadata sink"). Lands a dedicated, opaque, signed field rather than either a sink-call convention or a top-level `opaque_input` rename, restoring the tx-level annotation role legacy `input` played (for example ERC-8021 attribution suffixes) without polluting EVM calldata dispatch. #11578 remains open (see Active/Open PRs below).

**PR [#11806](https://github.com/ethereum/EIPs/pull/11806)** — chunter-cb, +18/-4. Policy clarification follow-up to #11766/#11794.

---

## Payer-Hash Binding and Gas-Accounting Fixes — June 16 – June 17, 2026

**PR [#11808](https://github.com/ethereum/EIPs/pull/11808)** — chunter-cb, +4/-3, security-relevant: "Bind payer field into payer signature hash," closes a cross-account replay hole specific to the delegate authenticator: the payer signature hash didn't previously bind the `payer` field itself, so a delegate authenticator (which authorizes one key across many accounts) could have its vouching signature redirected across accounts by swapping the `payer` field. Fixed by mirroring the existing sender-side binding.

**PR [#11809](https://github.com/ethereum/EIPs/pull/11809)** — chunter-cb, +0/-1. "Relax delegate import restriction."

**PR [#11812](https://github.com/ethereum/EIPs/pull/11812)** — chunter-cb, +2/-2, gas-accounting fix: "Charge initial-actor slot writes on account creation," fixes an intrinsic-gas under-accounting bug where create-entry actor registration was previously free.

**PR [#11813](https://github.com/ethereum/EIPs/pull/11813)** — chunter-cb, +2/-0, doc-only: clarifies the intrinsic-gas schedule is a recommended reference, not a protocol constant, leaving room for future EVM repricing (for example EIP-7623).

---

## Default-EOA Revocation Refactor — June 18, 2026

**PR [#11815](https://github.com/ethereum/EIPs/pull/11815)** — chunter-cb, +22/-15

- **Why**: The `REVOKED_AUTHENTICATOR` sentinel-address trick (writing `type(uint160).max`) was a workaround rather than an explicit state field, and freshly created accounts left a live secp256k1 owner unless one was deliberately revoked.
- **What**: "Fold default-EOA revocation into a state flag" removes the sentinel-address trick, replacing it with a `DEFAULT_EOA_REVOKED` bit packed into the account-state slot. Renames `ECRECOVER_AUTHENTICATOR`→`K1_AUTHENTICATOR`. Flips the default so `createAccount`/`importAccount` revoke the implicit EOA owner by default.
- **Why it matters**: Framed explicitly as a quantum-safe default: a freshly created or imported account no longer leaves a live secp256k1 owner unless one is explicitly included in `initial_actors`. See [PQ Scheme Agility](/pq-scheme-agility) for the broader post-quantum posture this default supports.

**PR [#11816](https://github.com/ethereum/EIPs/pull/11816)** — chunter-cb, +19/-13. "Store self-actor secp256k1 config inline in account-state slot," moves the default-EOA's k1 config inline into the packed account-state slot for single-SLOAD resolution; `getPolicy()` now returns `(policyType, target, commitment)`. Reserves `actor_config(self)` for a future non-secp256k1 self-authenticator.

---

## Actor Policies Clarified — July 2, 2026

**PR [#11847](https://github.com/ethereum/EIPs/pull/11847)** — chunter-cb, +71/-67. "Clarify actor policies and simplify metadata field." No normative behavior change, but a substantial rewrite of the Actor Policies section, adding an Authorize/Install/Use/Retire reference flow plus a concrete session-key example, and dropping a recommended-metadata-encoding pointer.

---

## Transaction-Type Renumbering and RPC Extension — July 8, 2026

**PR [#11903](https://github.com/ethereum/EIPs/pull/11903)** — chunter-cb, +5/-3

- **What**: "Renumber AA transaction types and add eth_call/eth_estimateGas RPC extension" moves `AA_TX_TYPE` from `0x7B`→`0x79` and `AA_PAYER_TYPE` from `0x7C`→`0x7A`, avoiding a collision with the `0x7b` transaction type already used for Celo CIP-64 fee-currency transactions on the OP Stack (raised by karlb on the EthMagicians thread, posts #20-22). Adds an `eth_call`/`eth_estimateGas` RPC extension priced from an unsigned representative auth blob, since auth gas is determined by the blob's shape rather than a valid signature.
- **Why it matters**: The transaction-type bytes had only been assigned five weeks earlier (PR #11757, June 2); this is the second and, as of the current spec, final renumbering.

---

## Scope Grants Redesign — July 13, 2026

**PR [#11918](https://github.com/ethereum/EIPs/pull/11918)** — chunter-cb, +277/-153

- **Why**: The four-bit scope model from PR #11388 (March 9, SIGNATURE/SENDER/PAYER/CONFIG) conflated a full-authority CONFIG bit with escalation risk (any key that could rewrite `actor_config` could just grant itself CONFIG), bundled self-pay and sponsorship under one PAYER bit despite being materially different security boundaries, and gave signing its own SIGNER bit despite signing conferring no authority a key didn't already have.
- **What**: "Scope grants, PAYER split, operational ERC-1271, account lock" is the biggest structural rewrite since PR #11367 (March 3). Redefines admin as the predicate `scope == 0x00` rather than a separate CONFIG bit. Redefines scope as five independent grant bits: SENDER (0x01), POLICY (0x02), NONCE (0x04), SELF_PAYER (0x08), SPONSOR_PAYER (0x10). Splits PAYER into SELF_PAYER and SPONSOR_PAYER, defined relationally (self-pay vs. sponsorship depends on whether `payer account == sender account`, not an absolute mode). Removes the standalone SIGNER bit, reframing ERC-1271 signing as "operational authority," `operational := admin || (SENDER && !POLICY)`. Simplifies the Account Lock lifecycle to strict lock-then-unlock (no re-lock or cancel-while-locked) via a new `applySignedLockChanges` entry point.
- **Why it matters**: Naming admin as absence-of-restriction rather than a grantable bit makes self-escalation explicit rather than hiding it. The SELF_PAYER/SPONSOR_PAYER split is a materially different security boundary from the original single PAYER bit: it lets a dedicated gas key fund a sibling key on the same account (SELF_PAYER) while a paymaster hot key can be sponsor-only over a locked treasury (SPONSOR_PAYER). This is the scope model documented in [Current Spec](/current-spec) today.

---

## Keystore Alignment, Validity Windows, and Local Epochs — August 11, 2026

**PR [#12135](https://github.com/ethereum/EIPs/pull/12135)** — chunter-cb, +214/-312

- **Why**: Contract work had moved ahead of the prose specification. The EIP still described separate actor-change and lock paths, one transaction expiry, and implementation details that no longer matched the reference contracts. The PR aligned the EIP with the Keystore research and made the contracts authoritative for internal mechanics.
- **What**: Renames the Account Configuration Contract to the **Keystore** and `ACCOUNT_CONFIG_ADDRESS` to `KEYSTORE_ADDRESS`; expands the formal `requires` list; replaces transaction `expiry` with millisecond `valid_after` and `valid_before`; expands scope from `uint8` to `uint16`; introduces a packed local epoch and sequence plus `UNSEQUENCED` changes; unifies actor, epoch, lock, and unlock operations under `applySignedAccountChanges`; adds `CONTRACT_ESTABLISHED`; hashes each initial-actor leaf before the list commitment; and replaces raw signature verification with typed local or multichain `validateSignature` envelopes using an account- and chain-scoped `replaySafeHash`.
- **Why it matters**: This is the broadest rewrite since the March 3 account-change unification. It changes transaction validity, replay domains, local recovery semantics, account-state packing, and the canonical contract boundary in one merge.

**Key review discussion**: No substantive human review objection or approval was posted in the PR thread. The recorded checks were automated eth-bot and CI approvals, and the PR merged the day after it opened. The rationale is therefore carried by the PR description and diff rather than a reviewer exchange.

---

## Audit Reconciliation — August 12, 2026

**PR [#12148](https://github.com/ethereum/EIPs/pull/12148)** — chunter-cb, +4/-4. Reconciles the EIP with the contract audit: self-revocation disables the implicit and explicit actor paths, canonical allowlisting makes a separate delegated-authenticator code check redundant, expired unsequenced authorizations are skipped within a batch, and sequenced authorizations may land already inert.

---

## Address-Derived actorId Encoding — August 14, 2026

**PR [#12173](https://github.com/ethereum/EIPs/pull/12173)** — chunter-cb, +21/-22. Standardizes every address-derived `actorId` as `bytes32(uint256(uint160(address)))`, with the address right-aligned in the low 20 bytes. It also clarifies self-revocation and removes the protocol-level create-entry code-size check, leaving deployment validation to the implementation contract.

---

## Active/Open PRs

*As of August 20, 2026.*

### PR #11578 — "Add opaque_input bytes field"

- **Author**: pochenai (community)
- **Opened**: April 29, 2026 — +26/-6
- **Why**: Restore a tx-level metadata role mirroring the legacy `input` field, for use cases like ERC-8021 attribution suffixes, bound into both sender and payer signature hashes and charged via standard `tx_payload_cost`.
- **Proposed change**: Adds a top-level `opaque_input` field, distinct from the calls-model approach ultimately shipped.
- **Status**: Still open. Superseded in spirit by the merged metadata field (PR #11805, June 15), which took a different approach. chunter-cb responded favorably to the general idea but pointed at his own alternative draft (#11655, since closed). It now overlaps the shipped metadata field and would need reconciliation before it could merge.

### PR #11919 — "Allow expiry in initial actors at create and import"

- **Author**: chunter-cb
- **Opened**: July 13, 2026 — +18/-18
- **Why**: Expiry was previously only settable via a post-deployment config change; wallets creating an account with a session-style initial actor had no way to bound its lifetime at creation time.
- **Proposed change**: Adds an optional `uint48 expiry` to each initial actor at `createAccount`/`importAccount` time, committing `expiry` into the per-actor address-derivation preimage (`actorId || authenticator || scope || expiry || policyData`) so a front-runner cannot alter it.
- **Status**: Still open as a draft with no review comments. It directly extends PR #11918's `policyData`-at-create work.

### PR #12204 — "Add adoption profiles, bounded authenticator gas, and timestamp normalization"

- **Author**: chunter-cb
- **Opened**: August 19, 2026, +103/-26
- **Why**: Give L1 and L2 adopters explicit deployment profiles while bounding public-mempool authentication work and making payer-selected authentication cost predictable.
- **Proposed change**: Defines a permissive L1 profile with a `MAX_AUTHENTICATION_GAS` cap and a canonical-only L2 profile with configurable pricing; moves payer-auth bytes outside `gas_limit`; exposes sender, payer, calls, and gas limit during authentication; describes full-EVM metering phases; and accepts second or millisecond timestamps by magnitude.
- **Status**: Open and not a draft. No review comments or submitted reviews were present at the August 20 snapshot. It supersedes closed drafts #12185 and #12192. None of its rules are current EIP behavior.

---

## Rejected/Closed PRs

**PR [#11144](https://github.com/ethereum/EIPs/pull/11144)** — chunter-cb, opened January 21, closed January 29, 2026, +605/-0. Duplicate initial EIP-8130 submission. Closed in favor of #11186 per maintainer abcoathup's request: "Can you close #11144 if this is going to be the PR for EIP-8130 moving forward?" Not a rejection on substance, a duplicate-PR cleanup after chunter-cb's rebase had accidentally bundled edits to other EIPs.

**PR [#11194](https://github.com/ethereum/EIPs/pull/11194)** — chunter-cb, opened January 28, closed March 2, 2026, +428/-0. "Token Gas Payments for EIP-8130," a companion proposal to extend the `extensions` field with ERC-20 gas payment support (a Token Payment Registry precompile, permissionless payer configs, oracle-based pricing, an optional native-payer precompile). Closed without a stated inline rejection comment in the PR thread. Consistent with EIP-8130's broader pattern of pushing extensibility (authenticators, canonical sets) to companion ERCs, token gas payments were not pursued as part of the core spec, plausibly deferred to a future ERC layered on top instead.

**PR [#11612](https://github.com/ethereum/EIPs/pull/11612)** — pochenai (community), opened May 7, closed May 14, 2026, +21/-9. "Fix four critical authorization and replay issues": (C1) implicit-EOA-rule scoping too loose, (C2) payer hash not binding sender's verifier choice, (C3) missing expiry on multichain owner changes, (C4) no auto-revocation of the implicit EOA owner on first delegation. Partially accepted, partially rejected. chunter-cb folded C1 and C2 into #11654. C3 was rejected: "It is intentional that there is no expiration. Multi-chain changes are meant for full owners, local changes can be used for any per chain policies and give an instant expiration when applied." C4 was rejected: "We do not want to auto revoke the EOA key when the account is delegated to as it would disable using the EOA. The account code is decoupled from its accepted verifier list, it shouldn't matter if its delegated to or not." pochenai closed the PR after acknowledging: "3 and 4 make sense. Closed as 1 and 2 is well addressed [elsewhere]."

**PR [#11648](https://github.com/ethereum/EIPs/pull/11648)** — chunter-cb, opened May 11, closed June 4, 2026, +125/-45. "Add owner call policies," the first draft attempt at the policy/policyType/policyTarget gated-call-initiation feature. Not a substantive rejection, a mechanical rebase-and-resubmit: the original PR "had become unmergeable due to some eth-bot bug" (per #11766's own PR description) and was closed in favor of a clean rebase, PR #11766.

**PR [#11655](https://github.com/ethereum/EIPs/pull/11655)** — chunter-cb, opened May 12, closed June 15, 2026, +16/-0. "Add metadata sink," explicitly marked "DO NOT MERGE (just for discussion)." Proposed representing wallet `dataSuffix`/attribution metadata as a protocol-recognized no-op call to a `METADATA_SINK_ADDRESS`, composing with the existing `calls` array rather than adding a new top-level field. Never intended to merge, the author's own discussion draft against #11578's competing top-level-field approach. Closed once the actual metadata field (PR #11805) shipped with a simpler, standalone opaque-field design.

**PR [#11751](https://github.com/ethereum/EIPs/pull/11751)** — chunter-cb, opened June 1, closed June 18, 2026, +52/-34. "Add delegated account creation," explicitly marked "JUST A DRAFT FOR DISCUSSION." Proposed extending the create entry so a new account could be created as an EIP-7702 delegation (a 23-byte `0xef0100 || target` indicator) instead of placed bytecode, with EIP-7819-style address derivation and gas accounting (`EMPTY_ACCOUNT_COST` = 25,000). Draft-only, closed without merging into the base spec. No successor PR has revived this feature; delegated account creation at create time is not present in the current spec.

**PR [#11758](https://github.com/ethereum/EIPs/pull/11758)** — chunter-cb, opened June 2, closed June 4, 2026, +22/-28. "Minimize Transaction Context precompile to identity," proposed trimming `ITxContext` down to three identity-only getters (`getTransactionSender`/`getTransactionPayer`/`getTransactionSenderOwnerId`), dropping `getCalls()`/`getMaxCost()`/`getGasLimit()` and the `Call` struct, on the grounds that the only historical consumers of the batch-inspection fields were stateful payer verifiers superseded by policy managers. Closed and partially superseded, partially reversed by PR #11764 (merged the same week): #11764's own description states it "keeps the renames from #11758 but drops its removals," the naming convention was kept, but the decision to remove `getCalls`/`getMaxCost`/`getGasLimit` was reversed and the full interface retained.

**PR [#12185](https://github.com/ethereum/EIPs/pull/12185)** — chunter-cb, opened August 18 and closed August 19, 2026, +84/-20. First draft of the L1/L2 adoption-profile and bounded-authentication-gas work. Closed in favor of the consolidated #12204.

**PR [#12192](https://github.com/ethereum/EIPs/pull/12192)** — chunter-cb, opened August 18 and closed August 19, 2026, +103/-26. Follow-up draft adding transaction context and timestamp normalization. Closed in favor of #12204.
