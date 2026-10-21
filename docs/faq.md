# FAQ

Indexed as `section.question`. Answers are 1-2 lines; follow the linked doc for depth.

---

## 1. What EIP-8130 Is

**1.1 What is EIP-8130?**
"Keystore Accounts," a Core, Standards Track proposal by Chris Hunter (@chunter-cb, Coinbase/Base) for an onchain Keystore that authorizes account actors through authenticator contracts, usable by any transaction transport. See [Current Spec](/current-spec).

**1.2 Who authored it, and when?**
Chris Hunter, first floated on EthMagicians October 24, 2025 (post #1), formally submitted as PR #11186 (merged February 28, 2026). See [Original Spec](/original-spec).

**1.3 What problem does it solve in one sentence?**
It lets a node decide whether to accept a transaction by checking the identity of the declared authenticator contract against a small canonical allowlist, rather than simulating arbitrary account bytecode to determine validity.

**1.4 What does EIP-8130 require in its frontmatter?**
Only EIPs 170 and 1014, after PR #12320 trimmed a thirteen-EIP list and PR #12386 moved the transaction type out. See [Original vs Latest](/original-vs-latest).

**1.5 How mature is the spec?**
49 merged PRs as of October 21, 2026, but it remains a Draft with no Ethereum L1 activation scheduled, and its transaction format now sits in an unmerged companion draft. See [Merged Changes](/merged-changes).

**1.6 Does EIP-8130 replace ERC-4337?**
No. The spec frames coexistence, not replacement: an already-deployed ERC-4337 account can register actors via `importAccount()` without redeploying. See [Current Spec](/current-spec).

**1.7 What is the Keystore?**
The contract formerly called Account Configuration; PR #12135 renamed it, PR #12295 renamed the EIP after it, and PR #12386 made it the EIP's entire scope. See [Current Spec](/current-spec).

**1.8 Does EIP-8130 still define a transaction type?**
No. PR #12386 (Oct 8) moved it into EIP-8430, "AA Transaction Type" (open PR #12385); EIP-8130 now specifies only how that type integrates with the Keystore. See [Current Spec](/current-spec).

**1.9 Why was it renamed "Keystore Accounts"?**
PR #12295 (Sep 3) renamed it with no protocol change, a month before the split made the Keystore the proposal's whole scope. See [Merged Changes](/merged-changes).

**1.10 Which systems can use the Keystore?**
Any consumer: EIP-8430 transactions, EIP-8141 frame accounts, ERC-4337 accounts, and applications verifying signatures, provided authentication is equivalent to `authenticateActor`. See [Current Spec](/current-spec).

---

## 2. The Authenticator and Validation Model

**2.1 What is an "actor" in EIP-8130?**
Any authority-holder on an account (a full owner, a session key, a payer-only key), identified by a 32-byte `actorId` and stored in an `actor_config` slot. See [Authenticator Model](/authenticator-model).

**2.2 What does an authenticator actually check?**
A fixed interface, `authenticate(hash, data) -> actorId`, called via `STATICCALL`: it may read state, branch, and make downstream static calls, but cannot write state or emit logs. See [Authenticator Model](/authenticator-model).

**2.3 What is `K1_AUTHENTICATOR`?**
A protocol-reserved sentinel at `address(1)` that triggers native `ecrecover` instead of a STATICCALL, so plain secp256k1 accounts pay no external-call overhead. See [Authenticator Model](/authenticator-model).

**2.4 What's the difference between a canonical and a non-canonical authenticator?**
Every native consumer accepts the canonical set at a fixed cost; non-canonical authenticators always work in EVM execution and reach the transaction path only on permissive chains, capped by `MAX_AUTHENTICATION_GAS`. See [Authenticator Model](/authenticator-model).

**2.5 What's in the initial canonical authenticator set?**
Four entries: k1 (native sentinel), p256, passkey (WebAuthn/FIDO2), and delegate. The original submission had a fifth, BLS, which is not in the current set. See [Current Spec](/current-spec).

**2.6 How does the canonical set grow over time?**
On a base layer only through a hard fork; other chains may extend it via the still-unnumbered companion ERC. Accounts adopt a new scheme by authorizing a new actor, with no migration. See [Authenticator Model](/authenticator-model).

**2.7 What is the `delegate` authenticator for?**
It lets account A register an actor pointing at account B, so any key authenticating as B can authenticate as A within A's grant; delegation cannot chain and the nested authenticator must be canonical. See [Authenticator Model](/authenticator-model).

**2.8 What is "operational authority," and why did the SIGNER bit disappear?**
Admin or any scope carrying `OPERATOR`; PR #11918 (Jul 13) removed SIGNER because an operational key can already call `approve`/`transfer` directly, so a signing grant conferred nothing new. See [Authenticator Model](/authenticator-model).

**2.9 Does authentication also decide fee logic or state-dependent policy?**
It returns only an identity, but an authenticator may itself read state and branch; scope bits and `POLICY`-gated call managers then decide what that actor may do. See [Authenticator Model](/authenticator-model).

**2.10 Can a non-admin actor originate transactions for an account?**
Yes. A restricted actor can combine `OPERATOR` (formerly `SENDER`) with `SELF_PAYER`, `SPONSOR_PAYER`, and `NONCE` while retaining no admin authority; forum posts #24-25 clarified this distinction.

**2.11 Can account code grant or revoke actors without an admin signature?**
No. Anyone may relay an actor-change call, but every authorization must resolve to an existing admin (`scope == 0x00`); forum post #26 asks this directly and remains unanswered on-thread.

**2.12 Does `validateSignature` protect signatures from cross-account replay?**
Yes. PR #12135 made `validateSignature` use a typed local or multichain envelope and an account- and chain-scoped `replaySafeHash`; ERC-1271 wraps that path.

**2.13 How are address-derived actorIds encoded?**
Right-aligned in the low 20 bytes as `bytes32(uint256(uint160(address)))`, standardized by PR #12173 for k1, self, and delegate actors.

**2.15 Why did the scope bit values change in September?**
PR #12333 (Sep 14) reordered them to match the canonical `Scopes.sol`: `OPERATOR 0x01`, `SELF_PAYER 0x02`, `SPONSOR_PAYER 0x04`, `POLICY 0x08`, `NONCE 0x10`. See [Merged Changes](/merged-changes).

**2.16 What happens to an actor holding both `OPERATOR` and `POLICY`?**
It is an ungated operator: `OPERATOR` overrides `POLICY`, so a policy-gated key must not carry `OPERATOR`. See [Current Spec](/current-spec).

**2.17 Is the scope model settled?**
No. Draft PR #12462 (Oct 8) would cut scope to `OPERATOR` and `POLICY`, arguing finer gas or nonce grants "protected nothing." See [Merged Changes](/merged-changes).

**2.14 Can anyone originate a policy-confined transaction without registration?**
Not with the canonical set. chunter answered forum post #27 (posts #28-29) that a public `POLICY` actor is effectively an `AlwaysValidAuthenticator`, outside the canonical set but "a very simple add."

---

## 3. Transaction Format and Gas Sponsorship

**3.1 What transaction type does EIP-8130 use?**
`AA_TX_TYPE = 0x79`, now defined by EIP-8430. It was assigned `0x7B` in PR #11757 (Jun 2) and renumbered in PR #11903 (Jul 8) after an OP Stack CIP-64 collision. See [Merged Changes](/merged-changes).

**3.2 What is `AA_PAYER_TYPE`?**
Not a separate transaction envelope; it's a magic byte (`0x7A`) prefixing the payer's signature-hash preimage, domain-separating the payer's signature from the sender's. See [Current Spec](/current-spec).

**3.3 How does gas sponsorship work?**
A payer resolving to the sender needs `SELF_PAYER` (or admin); any other payer needs `SPONSOR_PAYER`. EIP-8430 also adds an open payer (`payer = 0x00`) recovered from its signature. See [Current Spec](/current-spec).

**3.4 Why did the `PAYER` scope bit split into two bits?**
PR #11918 (Jul 13) split it into `SELF_PAYER` and `SPONSOR_PAYER`, defined relationally by whether `payer == sender`, so a dedicated gas key can fund a sibling key on the same account while a paymaster hot key stays sponsor-only over a locked treasury. See [Original vs Latest](/original-vs-latest).

**3.5 Is `payer_auth` gas metered inside the transaction's `gas_limit`?**
No. It is charged to the payer on top of `gas_limit`, bounded by `MAX_AUTHENTICATION_GAS` since PR #12204, because the payer picks its authenticator unilaterally. See [Current Spec](/current-spec).

**3.6 How are calls batched?**
`calls` is a list of phases: calls within a phase are atomic, phases commit independently, and EIP-8430 receipts record a `committed_phases` count. See [Current Spec](/current-spec).

**3.7 What happened to the terms "keys," "owners," and "verifiers"?**
"Keys" became "owners" (PR #11380, Mar 6), then "actors" (PR #11764, Jun 4); "verifiers" became "authenticators" (PR #11785, Jun 9). See [Original vs Latest](/original-vs-latest).

**3.8 What is the `metadata` field for?**
An opaque, signed transaction field restoring the tx-level annotation role legacy `input` played (e.g. attribution). The core EIP does not interpret it; open ERC-8340 proposes a deterministic CBOR format. See [Current Spec](/current-spec).

**3.9 Is ERC-8340 part of EIP-8130 consensus?**
No. [Open ERC PR #1883](https://github.com/ethereum/ERCs/pull/1883) proposes an application-layer encoding for attribution, memos, scope, and offchain commitments; the protocol still treats `metadata` as opaque bytes.

**3.10 How is transaction validity expressed?**
With `uint64 valid_after` and `valid_before` in seconds or milliseconds, read by magnitude against `10^11` since PR #12204 (Aug 19); EIP-8430 now carries the rule.

**3.11 Can calls carry ETH value?**
In EIP-8430, yes: each call is `[to, value, data]`. EIP-8130 forbids value for policy-gated actors and for accounts running canonical account bytecode. See [Current Spec](/current-spec).

**3.12 Why did PR #12320 add a calldata floor?**
EIP-7623's floor never applied because the transaction has no `data` field; the PR measured data-heavy transactions posting data about 40% cheaper than a type-2 transaction. See [Merged Changes](/merged-changes).

---

## 4. Nonces and Account Lock

**4.1 What nonce modes does EIP-8130 support?**
EIP-8430 defines them: `nonce_key 0` is the ordinary account nonce, other keys are parallel lanes, and `NONCE_KEY_MAX` is nonce-free with `replay_id` dedup. EIP-8130's `NONCE` grant gates restricted actors' access. See [Current Spec](/current-spec).

**4.2 What is `replay_id`?**
A signature-invariant dedup identifier for nonce-free transactions, deliberately excluding fee fields and auth blobs so a fee-bumped or re-signed retransmission of the same logical transaction collapses to one mempool slot. Introduced in PR #11752 (Jun 2). See [Current Spec](/current-spec).

**4.3 What is Account Lock?**
A mechanism that freezes authority changes and delegation; only Unlock and IncrementLocalEpoch remain permitted while locked. Draft PR #12462 would remove it. See [Mempool Safety](/mempool-safety).

**4.4 Why would a wallet lock its own account?**
A lock removes actor-configuration invalidation and can justify a higher rate tier when the authenticator is also stateless; stateful or delegated authentication can retain other dependencies. See [Mempool Safety](/mempool-safety).

**4.5 Can a locked account re-lock or cancel an unlock in progress?**
No. PR #11918 (Jul 13) simplified the lifecycle to a strict lock-then-unlock cycle with no re-lock or cancel-while-locked path. See [Current Spec](/current-spec).

**4.6 Is there an expiry field on individual actors?**
Yes, a `uint48 expiry` per actor, added alongside actor call policies in PR #11766 (Jun 4); an expiring sole admin actor is a self-bricking risk the spec explicitly warns against.

**4.7 Can expiry be set at account creation or import time?**
Not yet in the merged spec. PR #11919 (opened Jul 13, still open) proposes adding it, committed into the per-actor address-derivation preimage so a front-runner can't alter it. See [Merged Changes](/merged-changes).

**4.8 What are local epochs and `UNSEQUENCED` changes?**
PR #12135 split local state into `local_epoch` and `local_sequence`; unsequenced changes can land in any order within an epoch, then `IncrementLocalEpoch` invalidates the rest. Draft PRs #12334 and #12462 would give the multichain channel epochs too.

**4.9 How does an existing contract account import into the Keystore now?**
It calls the parameterless `importAccount()` itself, and the Keystore installs whatever actor set its `confirmKeystoreImport()` callback returns with a matching digest (PR #12333). See [Current Spec](/current-spec).

---

## 5. Cross-Chain Accounts

**5.1 What makes EIP-8130 accounts cross-chain portable?**
With identical deployment inputs and infrastructure, CREATE2 can reproduce the address; a `chain_id = 0` update can then be submitted separately to each deployment without a bridge. See [Cross-Chain Accounts](/cross-chain-accounts).

**5.2 Does the multichain config-change channel expire?**
No, by design. Community contributor pochenai flagged the lack of expiry (closed PR #11612); chunter-cb rejected the fix as intentional, since multi-chain changes are meant for full owners while a per-chain local change "give[s] an instant expiration when applied." See [Cross-Chain Accounts](/cross-chain-accounts).

**5.3 Does Account Lock apply across all chains at once?**
No. Lock and Unlock are operations in `applySignedAccountChanges`, but only on the local channel, so a multichain update can fail on one separately locked deployment. See [Cross-Chain Accounts](/cross-chain-accounts).

**5.4 Do any of the other alternatives covered on this site offer comparable cross-chain portability?**
Not in their base specs, though an EIP-8141 account could consume the EIP-8130 Keystore and open ERC-8403 proposes home-chain sync for frame accounts. See [Cross-Chain Accounts](/cross-chain-accounts).

**5.5 What was the Celo CIP-64 migration discussion about?**
karlb (forum posts #12-22, Jun 5 - Jul 8, 2026) explored letting a chain set a default authenticator so existing Celo accounts could adopt EIP-8130 without individually writing config; it resolved with the `0x79`/`0x7A` transaction-type renumbering, not a merged default-authenticator mechanism. See [Feedback Evolution](/feedback-evolution).

**5.6 Does revoking a key on one chain revoke it everywhere?**
No. A revoked admin stays valid on any chain the revocation was not relayed to (forum post #30); freshness checks and checkpointed actor sets are proposed but not merged. See [Cross-Chain Accounts](/cross-chain-accounts).

---

## 6. Mempool Safety and Statelessness

**6.1 What does "no wallet code execution" mean in practice?**
A node does not execute the sender account's transaction-validation entry point; it reads account configuration and runs the declared authenticator via `STATICCALL` or a native canonical implementation. See [Mempool Safety](/mempool-safety).

**6.2 Does this eliminate the need for tracing or reputation-based DoS mitigation?**
On canonical-only chains largely yes; permissive chains admit gas-capped contract authenticators and must track the state they read. See [Mempool Safety](/mempool-safety).

**6.3 What happens to a non-canonical authenticator at the mempool level?**
A canonical-only chain rejects it on the transaction path; a permissive chain accepts it if it returns within `MAX_AUTHENTICATION_GAS`. Draft PR #12210 would add four tiers. See [Mempool Safety](/mempool-safety).

**6.4 What state does a node need to validate an EIP-8130 transaction?**
At minimum: account configuration, nonce/replay state, payer configuration and balance, plus any state read by sender or payer authenticators, including delegated-account state. See [Mempool Safety](/mempool-safety).

**6.5 Does nonce-free mode add permanent state growth?**
No. Replay protection uses a fixed-capacity circular buffer of `replay_id`s that is consensus state but ephemeral, not a permanently growing trie entry. See [Current Spec](/current-spec).

**6.6 How does EIP-8130's mempool model compare to EIP-8141's?**
EIP-8130 fixes authenticator identity and interface, while EIP-8141 fixes a validation envelope and directly evaluates three common prefixes; custom paths in both models can still execute metered EVM code. See [Mempool Safety](/mempool-safety).

**6.7 What is a high-rate payer?**
A locked payer running canonical account bytecode, whose balance can fall only through gas, so nodes may allow it more pending transactions. Draft PR #12462 would drop the lock requirement. See [Mempool Safety](/mempool-safety).

---

## 7. Post-Quantum and Scheme Agility

**7.1 Does EIP-8130 ship a post-quantum signature scheme today?**
No. The canonical set is k1, p256, passkey, and delegate; there is no Falcon, Dilithium, SPHINCS+, or other PQ scheme as of October 21, 2026. See [PQ Scheme Agility](/pq-scheme-agility).

**7.2 How would a PQ scheme get added?**
Deploy it freely; permissive chains accept it within `MAX_AUTHENTICATION_GAS`, while canonical status takes a hard fork on L1 or the companion-ERC process elsewhere. See [PQ Scheme Agility](/pq-scheme-agility).

**7.3 What is the "quantum-safe default"?**
`createAccount`/`importAccount` now revoke the implicit secp256k1 owner by default (PR #11815, Jun 18), so a freshly created or imported account doesn't leave a live k1 key unless one is explicitly listed in `initial_actors`. See [Current Spec](/current-spec).

**7.4 Does EIP-8130 have a block-level proof-aggregation mechanism for PQ signatures?**
No. Unlike EIP-8141's sibling EIP-8288 (merged as a Draft on September 9, specifying in-mempool signature and proof aggregation), EIP-8130 verifies each signature independently. See [PQ Scheme Agility](/pq-scheme-agility).

**7.5 How does EIP-8130's PQ posture compare to EIP-8202's?**
Neither current draft defines a PQ scheme: EIP-8202 currently defines secp256k1 plus Merkle-committed ephemeral secp256k1 keys, while EIP-8130 leaves room for a future canonical authenticator. See [PQ Scheme Agility](/pq-scheme-agility).

---

## 8. Comparison to EIP-8141 and Other Alternatives

**8.1 What is EIP-8130's closest direct competitor?**
EIP-8141 (Frame Transaction), now Scheduled for Inclusion in Hegotá. Since the split, EIP-8430 is the transaction format competing with it, while the EIP-8130 Keystore names EIP-8141 frame accounts as consumers. See [EIP-8141](/eip-8141).

**8.2 Where does EIP-8130 sit on the declarative-to-programmable spectrum?**
Between EIP-8202/EIP-XXXX's protocol-registered crypto and EIP-8175/EIP-8141's broader programmable transaction hooks: EIP-8130 uses a fixed authenticator interface that may still execute EVM code. See [Competing Standards](/competing-standards).

**8.3 How does EIP-8130 differ from EIP-8175?**
EIP-8175 defines protocol signature schemes and lets an EVM prelude (`fee_auth`) decide sponsorship; EIP-8130 reserves native k1 and gates other direct authentication through a canonical set. See [EIP-8175](/eip-8175).

**8.4 How does EIP-8130 differ from EIP-8202?**
EIP-8202 registers authentication as protocol `scheme_id` values with no contract call; EIP-8130 uses authenticator contracts, but its draft does not yet define how clients activate additions to the canonical set. See [EIP-8202](/eip-8202).

**8.5 Are EIP-8223 and EIP-8224 competitors to EIP-8130?**
They are narrower open-PR proposals for static gas sponsorship and shielded gas bootstrap. Their composition with EIP-8130 is this site's inference, not a claim in either proposal. See [EIP-8223](/eip-8223) and [EIP-8224](/eip-8224).

**8.6 How does EIP-8130 compare to EIP-XXXX (Tempo-like)?**
EIP-XXXX shares three of EIP-8130's cryptographic primitives (secp256k1, P-256, WebAuthn) but hardcodes them at the protocol layer; another scheme would require a spec change and network activation. See [EIP-XXXX](/eip-xxxx).

**8.7 Does EIP-8130's spec text compare itself to any of these alternatives?**
No. Since PR #12386 it names EIP-8141 frame accounts as Keystore consumers, but it draws no comparison; this site's comparisons are editorial analysis. See [Competing Standards](/competing-standards).

**8.9 What is EIP-8397, and how does it relate to EIP-8130?**
An EIP-8141 companion (merged Oct 14) adding permissionless, fixed-gas, pure `authenticate(digest, proof) -> key_id` authenticators: EIP-8130's interface without a canonical set or Keystore. See [EIP-8141](/eip-8141).

**8.10 Did L1 developers choose between EIP-8130 and EIP-8141?**
EIP-8141 was Scheduled for Inclusion in Hegotá on Aug 27, with implementation and EIP number still open; a Frame Transaction breakout summary records that L1 should not enshrine opinionated account models. See [Feedback Evolution](/feedback-evolution).

**8.8 Which proposal adds the most new EVM opcodes?**
EIP-8141, with seven after `SIGDATACOPY` joined `APPROVE`, `TXPARAM`, frame-data, frame-parameter, and signature-parameter operations; EIP-8130 adds zero. See [Developer Tooling](/developer-tooling).

---

## 9. Adoption and Implementation Status

**9.1 What is EIP-8130's current status?**
Draft, Core, Standards Track, with 49 merged PRs through #12386 and 8 open PRs as of October 21, 2026. See [Merged Changes](/merged-changes).

**9.2 Is the canonical authenticator set's companion ERC finalized?**
No. The EIP still says its number is TBD. The open ERC-8168 payer-service and ERC-8340 metadata drafts are related application-layer work, not that canonical-set companion. See [PQ Scheme Agility](/pq-scheme-agility).

**9.3 Has any real chain integration surfaced adoption friction?**
Yes. The Celo CIP-64 migration discussion forced a transaction-type renumbering (`0x7B`/`0x7C` to `0x79`/`0x7A`) after karlb flagged a collision with an existing OP Stack allocation. See [Feedback Evolution](/feedback-evolution).

**9.4 Has EIP-8130 been added to a hard-fork "Considered for Inclusion" list?**
Not for Ethereum L1; it has never appeared in the Hegotá meta EIP. Base's own plan also changed: Cobalt shipped on September 30 without it. See [Feedback Evolution](/feedback-evolution).

**9.5 What are the currently open PRs?**
#11578, #11919, #12210, #12293, #12313, #12334, #12341, and #12462, plus EIP-8430 (#12385) and four extension drafts. See [Merged Changes](/merged-changes).

**9.6 What is the largest structural rewrite in the spec's history?**
PR #12386 (Oct 8, +259/-718), which scoped EIP-8130 to the Keystore and moved the transaction type to EIP-8430. PR #12135 (Aug 11) is the largest before it. See [Merged Changes](/merged-changes).

**9.7 Is there an application-layer RPC proposal for EIP-8130 payers?**
Yes. [Open ERC PR #1555](https://github.com/ethereum/ERCs/pull/1555) proposes ERC-8168, now targeting EIP-8430, the EIP-8130 Keystore, and EIP-8141 frame transactions. See [Developer Tooling](/developer-tooling).

**9.8 Is EIP-8130 scheduled to launch anywhere?**
No. Base's [Everest](https://docs.base.org/upgrades/everest/overview) plans EIP-8430 with no date, and Base gates the Keystore to a test fork it never schedules on mainnet or Sepolia. See [Developer Tooling](/developer-tooling).

**9.9 Where can builders test the current implementation?**
On Base Vibenet, with Base's [builder guide](https://www.eip8130.com/guide) and [reference contracts](https://github.com/base/eip-8130). The guide predates the split, uses a viem fork, and says the audit is incomplete.

**9.10 What are EIP-8386, EIP-8387, and EIP-8388?**
Open extension drafts by chunter-cb: transaction log views, transaction-scoped stateless accounts, and Keystore-authenticated EIP-1559/2930 transactions. See [Current Spec](/current-spec).
