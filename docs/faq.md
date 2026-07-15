# FAQ

Indexed as `section.question`. Answers are 1-2 lines; follow the linked doc for depth.

---

## 1. What EIP-8130 Is

**1.1 What is EIP-8130?**
A Core, Standards Track proposal by Chris Hunter (@chunter-cb, Coinbase/Base) that separates authentication (resolving a signature to an `actorId`) from account logic, so nodes can filter transactions on authenticator identity instead of executing arbitrary wallet code. See [Current Spec](/current-spec).

**1.2 Who authored it, and when?**
Chris Hunter, first floated on EthMagicians October 24, 2025 (post #1), formally submitted as PR #11186 (merged February 28, 2026). See [Original Spec](/original-spec).

**1.3 What problem does it solve in one sentence?**
It lets a node decide whether to accept a transaction by checking the identity of the declared authenticator contract against a small canonical allowlist, rather than simulating arbitrary account bytecode to determine validity.

**1.4 What does EIP-8130 require in its frontmatter?**
`requires: 170, 2718` as of the current spec; the original submission required `1153, 2718`, and `7702` was briefly required (PR #11367) then dropped (PR #11492). See [Original vs Latest](/original-vs-latest).

**1.5 How mature is the spec?**
40 merged PRs against the spec file as of July 15, 2026, spanning three complete terminology overhauls and one transaction-type renumbering. See [Merged Changes](/merged-changes).

**1.6 Does EIP-8130 replace ERC-4337?**
No. The spec frames coexistence, not replacement: an already-deployed ERC-4337 account can register actors via `importAccount()` without redeploying. See [Current Spec](/current-spec).

---

## 2. The Authenticator and Validation Model

**2.1 What is an "actor" in EIP-8130?**
Any authority-holder on an account (a full owner, a session key, a payer-only key), identified by a 32-byte `actorId` and stored in an `actor_config` slot. See [Authenticator Model](/authenticator-model).

**2.2 What does an authenticator actually check?**
A fixed interface, `authenticate(hash, data) -> actorId`, called via STATICCALL so the authenticator can read but never write state. See [Authenticator Model](/authenticator-model).

**2.3 What is `K1_AUTHENTICATOR`?**
A protocol-reserved sentinel at `address(1)` that triggers native `ecrecover` instead of a STATICCALL, so plain secp256k1 accounts pay no external-call overhead. See [Authenticator Model](/authenticator-model).

**2.4 What's the difference between a canonical and a non-canonical authenticator?**
Only authenticators in the node-maintained canonical set can authenticate a transaction directly; a non-canonical authenticator still works inside ordinary EVM execution but not on the fast validation path. See [Authenticator Model](/authenticator-model).

**2.5 What's in the initial canonical authenticator set?**
Four entries: k1 (native sentinel), p256, passkey (WebAuthn/FIDO2), and delegate. The original submission had a fifth, BLS, which is not in the current set. See [Current Spec](/current-spec).

**2.6 How does the canonical set grow over time?**
Through a companion ERC (number not yet assigned) at deterministic CREATE2 addresses, not a hard fork, though canonical-set membership is still a coordination process rather than a per-wallet choice. See [Authenticator Model](/authenticator-model).

**2.7 What is the `delegate` authenticator for?**
It lets account A register an actor pointing at account B, so any key authenticating as B can authenticate as A; nesting is capped at depth 1 and the nested actor on B must be admin. See [Authenticator Model](/authenticator-model).

**2.8 What is "operational authority," and why did the SIGNER bit disappear?**
`operational := admin || (SENDER && !POLICY)`; PR #11918 (Jul 13) removed the standalone SIGNER bit on the reasoning that an operational key can already call `approve`/`transfer` directly, so a separate signing grant conferred nothing new. See [Authenticator Model](/authenticator-model).

**2.9 Does authentication also decide fee logic or state-dependent policy?**
No. `authenticate()` only resolves identity; scope bits and `POLICY`-gated call managers, checked after authentication, decide what an actor may do. See [Authenticator Model](/authenticator-model).

---

## 3. Transaction Format and Gas Sponsorship

**3.1 What transaction type does EIP-8130 use?**
`AA_TX_TYPE = 0x79`, assigned `0x7B` in PR #11757 (Jun 2) and renumbered to `0x79` in PR #11903 (Jul 8) after an OP Stack CIP-64 collision was flagged on the forum. See [Merged Changes](/merged-changes).

**3.2 What is `AA_PAYER_TYPE`?**
Not a separate transaction envelope; it's a magic byte (`0x7A`) prefixing the payer's signature-hash preimage, domain-separating the payer's signature from the sender's. See [Current Spec](/current-spec).

**3.3 How does gas sponsorship work?**
Three cases gated by `payer`/`payer_auth`: self-pay (actor holds `SELF_PAYER`), self-pay via a dedicated gas key, or sponsored (a different payer holding `SPONSOR_PAYER`). See [Current Spec](/current-spec).

**3.4 Why did the `PAYER` scope bit split into two bits?**
PR #11918 (Jul 13) split it into `SELF_PAYER` and `SPONSOR_PAYER`, defined relationally by whether `payer == sender`, so a dedicated gas key can fund a sibling key on the same account while a paymaster hot key stays sponsor-only over a locked treasury. See [Original vs Latest](/original-vs-latest).

**3.5 Is `payer_auth` gas metered inside the transaction's `gas_limit`?**
No. `payer_auth_cost` is charged to the payer on top of `gas_limit`, since the payer chooses their own authenticator unilaterally and it's excluded from both signature hashes. See [Current Spec](/current-spec).

**3.6 How are calls batched?**
`calls` is a two-level structure: calls within one phase are atomic, phases commit independently in sequence, so an earlier sponsor-payment phase can persist even if a later user-action phase reverts. See [Current Spec](/current-spec).

**3.7 What happened to the terms "keys," "owners," and "verifiers"?**
"Keys" became "owners" (PR #11380, Mar 6), then "actors" (PR #11764, Jun 4); "verifiers" became "authenticators" (PR #11785, Jun 9). See [Original vs Latest](/original-vs-latest).

**3.8 What is the `metadata` field for?**
An opaque, signed transaction field restoring the tx-level annotation role legacy `input` played (e.g. ERC-8021 attribution), resolved in PR #11805 (Jun 15) after a month-long design debate between a closed draft (#11655) and a still-open one (#11578). See [Merged Changes](/merged-changes).

---

## 4. Nonces and Account Lock

**4.1 What nonce modes does EIP-8130 support?**
Standard sequential (`nonce_key = 0`), parallel user-defined channels (`1` to `NONCE_KEY_MAX - 1`), and nonce-free (`NONCE_KEY_MAX`), which skips nonce reads and relies on `expiry` plus `replay_id` dedup. See [Current Spec](/current-spec).

**4.2 What is `replay_id`?**
A signature-invariant dedup identifier for nonce-free transactions, deliberately excluding fee fields and auth blobs so a fee-bumped or re-signed retransmission of the same logical transaction collapses to one mempool slot. Introduced in PR #11752 (Jun 2). See [Current Spec](/current-spec).

**4.3 What is Account Lock?**
A mechanism, introduced in PR #11367 (Mar 3), that lets an account freeze its own actor configuration; while `LOCKED`, all config-change and delegation entries are rejected. See [Mempool Safety](/mempool-safety).

**4.4 Why would a wallet lock its own account?**
A locked account's actor set can't change, so nonce consumption becomes the only thing that can invalidate an already-validated transaction, letting nodes safely grant it a higher mempool rate limit. See [Mempool Safety](/mempool-safety).

**4.5 Can a locked account re-lock or cancel an unlock in progress?**
No. PR #11918 (Jul 13) simplified the lifecycle to a strict lock-then-unlock cycle with no re-lock or cancel-while-locked path. See [Current Spec](/current-spec).

**4.6 Is there an expiry field on individual actors?**
Yes, a `uint48 expiry` per actor, added alongside actor call policies in PR #11766 (Jun 4); an expiring sole admin actor is a self-bricking risk the spec explicitly warns against.

**4.7 Can expiry be set at account creation or import time?**
Not yet in the merged spec. PR #11919 (opened Jul 13, still open) proposes adding it, committed into the per-actor address-derivation preimage so a front-runner can't alter it. See [Merged Changes](/merged-changes).

---

## 5. Cross-Chain Accounts

**5.1 What makes EIP-8130 accounts cross-chain portable?**
Two primitives: a CREATE2 address that computes identically on every chain, and a `chain_id = 0` config-change channel that lets one signed update propagate to every deployment without a bridge. See [Cross-Chain Accounts](/cross-chain-accounts).

**5.2 Does the multichain config-change channel expire?**
No, by design. Community contributor pochenai flagged the lack of expiry (closed PR #11612); chunter-cb rejected the fix as intentional, since multi-chain changes are meant for full owners while a per-chain local change "give[s] an instant expiration when applied." See [Cross-Chain Accounts](/cross-chain-accounts).

**5.3 Does Account Lock apply across all chains at once?**
No, `applySignedLockChanges` operates on the local channel only, so a `chain_id = 0` config update can succeed everywhere except a chain where the account happens to be separately locked. See [Cross-Chain Accounts](/cross-chain-accounts).

**5.4 Do any of the other alternatives covered on this site offer comparable cross-chain portability?**
No; the sourced material for EIP-8141, EIP-8175, EIP-8202, EIP-8223, and EIP-8224 describes no comparable account-portability mechanism. See [Cross-Chain Accounts](/cross-chain-accounts).

**5.5 What was the Celo CIP-64 migration discussion about?**
karlb (forum posts #12-22, Jun 5 - Jul 8, 2026) explored letting a chain set a default authenticator so existing Celo accounts could adopt EIP-8130 without individually writing config; it resolved with the `0x79`/`0x7A` transaction-type renumbering, not a merged default-authenticator mechanism. See [Feedback Evolution](/feedback-evolution).

---

## 6. Mempool Safety and Statelessness

**6.1 What does "no wallet code execution" mean in practice?**
A node validates by reading one `actor_config` slot and calling the declared authenticator via STATICCALL (or running a native implementation for canonical authenticators), never executing the sender's own account bytecode. See [Mempool Safety](/mempool-safety).

**6.2 Does this eliminate the need for tracing or reputation-based DoS mitigation?**
Yes, for the canonical path: the shape of what can run during validation is fixed by protocol rather than bounded by convention, so no tracing infrastructure or reputation system is needed. See [Mempool Safety](/mempool-safety).

**6.3 What happens to a non-canonical authenticator at the mempool level?**
It remains usable inside ordinary EVM execution but cannot authenticate a transaction directly through mempool validation, confining it to a slower adoption path. See [Mempool Safety](/mempool-safety).

**6.4 What state does a node need to validate an EIP-8130 transaction?**
The resolved sender's `actor_config` slot, nonce state for `(sender, nonce_key)`, and the payer's balance and (if sponsored) `actor_config`; policy-gate state is excluded from validation and only read at execution time. See [Mempool Safety](/mempool-safety).

**6.5 Does nonce-free mode add permanent state growth?**
No. Replay protection uses a fixed-capacity circular buffer of `replay_id`s that is consensus state but ephemeral, not a permanently growing trie entry. See [Current Spec](/current-spec).

**6.6 How does EIP-8130's mempool model compare to EIP-8141's?**
EIP-8130 fixes the validation interface (only recognized authenticators run, at known cost); EIP-8141 fixes the validation envelope (arbitrary code may run, but only within a shape, gas cap, and banned-opcode list). See [Mempool Safety](/mempool-safety).

---

## 7. Post-Quantum and Scheme Agility

**7.1 Does EIP-8130 ship a post-quantum signature scheme today?**
No. The canonical set is k1, p256, passkey, and delegate; there is no Falcon, Dilithium, SPHINCS+, or other PQ scheme as of the July 15, 2026 research snapshot. See [PQ Scheme Agility](/pq-scheme-agility).

**7.2 How would a PQ scheme get added?**
By deploying a new `IAuthenticator` contract and getting it into the canonical set via the companion ERC process, no protocol upgrade needed for deployment, but coordinated node-allowlist adoption is still required for the fast path. See [PQ Scheme Agility](/pq-scheme-agility).

**7.3 What is the "quantum-safe default"?**
`createAccount`/`importAccount` now revoke the implicit secp256k1 owner by default (PR #11815, Jun 18), so a freshly created or imported account doesn't leave a live k1 key unless one is explicitly listed in `initial_actors`. See [Current Spec](/current-spec).

**7.4 Does EIP-8130 have a block-level proof-aggregation mechanism for PQ signatures?**
No. Unlike EIP-8141's sibling EIP-8288 (open, pursuing native PQ/STARK aggregation via a new frame mode and block-header field), EIP-8130 verifies each authenticator-checked signature independently with no aggregation primitive. See [PQ Scheme Agility](/pq-scheme-agility).

**7.5 How does EIP-8130's PQ posture compare to EIP-8202's?**
EIP-8202 ships Falcon-512 natively in its merged spec today; EIP-8130 has an extensible allowlist slot for a future PQ authenticator but no PQ scheme shipped yet. See [PQ Scheme Agility](/pq-scheme-agility).

---

## 8. Comparison to EIP-8141 and Other Alternatives

**8.1 What is EIP-8130's closest direct competitor?**
EIP-8141 (Frame Transaction), which takes the opposite bet: arbitrary EVM inside VERIFY frames, constrained after the fact by a gas cap and banned-opcode list, versus EIP-8130's fixed authenticator identity check. See [EIP-8141](/eip-8141).

**8.2 Where does EIP-8130 sit on the declarative-to-programmable spectrum?**
Between EIP-8202/EIP-XXXX (purely cryptographic, no contract call at all) and EIP-8175/EIP-8141 (programmable sponsorship or fully programmable validation). See [Competing Standards](/competing-standards).

**8.3 How does EIP-8130 differ from EIP-8175?**
EIP-8175 fixes signature schemes in the protocol and lets an EVM prelude (`fee_auth`) decide sponsorship; EIP-8130 fixes nothing about signature logic in the protocol but gates everything, including sponsorship, through the same canonical authenticator allowlist. See [EIP-8175](/eip-8175).

**8.4 How does EIP-8130 differ from EIP-8202?**
Both avoid arbitrary EVM in validation, but EIP-8202 registers new schemes as protocol `scheme_id` values (a hard fork per scheme, no contract layer), while EIP-8130 registers new schemes as authenticator contracts via a companion ERC (no hard fork, but node-allowlist coordination). See [EIP-8202](/eip-8202).

**8.5 Are EIP-8223 and EIP-8224 competitors to EIP-8130?**
No, both are narrow, complementary infrastructure, static gas sponsorship (EIP-8223) and shielded gas-funding bootstrap (EIP-8224), that can compose with EIP-8130's own payer/sponsor model rather than replace it. See [EIP-8223](/eip-8223) and [EIP-8224](/eip-8224).

**8.6 How does EIP-8130 compare to EIP-XXXX (Tempo-like)?**
EIP-XXXX shares three of EIP-8130's cryptographic primitives (secp256k1, P-256, WebAuthn) but hardcodes them at the protocol layer with no authenticator contracts or per-account registration, requiring a hard fork for any new scheme. See [EIP-XXXX](/eip-xxxx).

**8.7 Does EIP-8130's spec text compare itself to any of these alternatives?**
No. A full-text search of the spec turns up no mention of EIP-8141 or the other proposals; all comparisons on this site are editorial analysis built on the sourced material for each proposal. See [Competing Standards](/competing-standards).

**8.8 Which proposal adds the most new EVM opcodes?**
EIP-8141, with six (`APPROVE`, `TXPARAM`, `FRAMEDATALOAD`, `FRAMEDATACOPY`, `FRAMEPARAM`, `SIGPARAM`); EIP-8130 adds zero opcodes, relying on precompiles and a system contract instead. See [Developer Tooling](/developer-tooling).

---

## 9. Adoption and Implementation Status

**9.1 What is EIP-8130's current status?**
Draft, Core, Standards Track, with 40 merged PRs (#11186 through #11918, Feb 28 - Jul 13, 2026) and 2 open PRs (#11578, #11919) as of July 15, 2026. See [Merged Changes](/merged-changes).

**9.2 Is the canonical authenticator set's companion ERC finalized?**
No, its number is not yet assigned; the coordination mechanism exists in the base spec's text before it exists as a deployed artifact. See [PQ Scheme Agility](/pq-scheme-agility).

**9.3 Has any real chain integration surfaced adoption friction?**
Yes. The Celo CIP-64 migration discussion forced a transaction-type renumbering (`0x7B`/`0x7C` to `0x79`/`0x7A`) after karlb flagged a collision with an existing OP Stack allocation. See [Feedback Evolution](/feedback-evolution).

**9.4 Has EIP-8130 been added to a hard-fork "Considered for Inclusion" list?**
No; that milestone is documented for EIP-8141 (Hegotá CFI list, PR #11537), not for EIP-8130. See [Competing Standards](/competing-standards).

**9.5 What are the two currently open PRs?**
#11578 (pochenai's `opaque_input` field, superseded in spirit by the shipped `metadata` field but not formally reconciled) and #11919 (chunter-cb's expiry-at-create/import proposal). See [Merged Changes](/merged-changes).

**9.6 What is the largest structural rewrite in the spec's history?**
PR #11918 (Jul 13, +277/-153), which redefined admin as a predicate, split the PAYER bit into `SELF_PAYER`/`SPONSOR_PAYER`, removed the SIGNER bit, and simplified Account Lock's lifecycle, larger than even the original account-changes unification in PR #11367. See [Merged Changes](/merged-changes).
