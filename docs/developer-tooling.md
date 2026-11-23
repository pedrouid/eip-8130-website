# Developer Tooling

---

## TL;DR

EIP-8130's developer bet is structural: replace arbitrary account validation with a small canonical authenticator set, and standardize account authority around a shared Keystore at `KEYSTORE_ADDRESS`. Since October that Keystore is its own proposal, "Keystore Accounts," while the transaction type lives in its sibling EIP-8430, merged as a Draft on November 23. The split gives wallets a clearer staging path (adopt the transaction for EOAs first, the Keystore later) and that is exactly how Base's production plans now read: Cobalt shipped on September 30 without EIP-8130, Everest plans EIP-8430 with no date, and on November 17 Base deleted its Keystore implementation. "No new opcodes" remains narrower than "no new protocol surface." ERC-8168 now spans both EIP-8430 and EIP-8141, while ERC-8340 has gone stale.

---

## 1. The Coordination Bottleneck: Canonical Authenticator Set

EIP-8130's core adoption pitch is that nodes filter transactions by **authenticator identity** rather than executing arbitrary wallet code: "nodes can see exactly what computation a transaction requires before executing it... accepting transactions whose authenticator belongs to a small, standard canonical set and rejecting the rest" (spec Motivation). Any contract implementing `IAuthenticator` can be permissionlessly deployed, but only authenticators in the **canonical set** are usable to authenticate transactions directly over the "8130 path"; non-canonical authenticators remain usable only inside ordinary EVM execution (e.g., a wallet-defined recovery call), not for direct AA-transaction authentication.

The original submission named five well-known verifiers: K1, P256, WebAuthn P256, BLS, and DELEGATE. PR #11647 made a canonical baseline explicit; the current four-entry set drops BLS. PR [#12204](https://github.com/ethereum/EIPs/pull/12204) (merged Aug 19) replaced the old "SHOULD NOT extend the allowlist" rule with an acceptance policy: permissive chains (typically L1) also accept any authenticator within `MAX_AUTHENTICATION_GAS`, canonical-only chains (typically L2) do not. On a base layer the canonical set changes only by hard fork. Wallet SDKs therefore need to know a chain's policy rather than assume one admission model.

**Position (Bear Case)**: growing the canonical authenticator set requires a companion-ERC-and-node-allowlist coordination cycle, which is slower than shipping a new validator/module in a permissionless smart-account ecosystem.

This is editorial analysis, not a sourced external position; no public PR comment or forum post argues this explicitly. But it follows from the mechanics above: a new signature scheme (say, a post-quantum scheme a wallet wants to ship next quarter) is not something that wallet can add unilaterally by deploying a contract and pointing users at it, the way an ERC-4337 account can adopt a new validator module or an ERC-7579 account can install a new module today. On a canonical-only chain it has to go through the companion-ERC process first; on L1 canonical status takes a hard fork. A permissive chain softens this by accepting the new authenticator within the gas cap, but at metered rather than enshrined cost. No single client or wallet vendor can widen the canonical set on its own schedule.

**Position (Bull Case)**: a small, canonical, protocol-recognized authenticator set is exactly what removes the current multi-standard integration burden from wallet and app developers.

Also editorial analysis (no directly attributed forum/PR quote makes this exact adoption argument), but it is grounded in the spec's own stated motivation: "Account abstraction proposals that delegate validation to wallet code force nodes to simulate arbitrary EVM before accepting a transaction. This requires full state access, tracing infrastructure, and reputation systems to bound the cost of invalid submissions" (Motivation). Today, a wallet or app developer targeting broad AA support has to reason about ERC-4337's bundler/paymaster reputation rules, EIP-7702's per-chain delegation semantics, and often a bespoke mempool policy for any custom validation scheme, each with different simulation and gas-accounting assumptions. A canonical authenticator set, once populated, is something a wallet SDK can target with a single code path: "does this account's actor resolve to K1, P256, WebAuthn, or DELEGATE" is a bounded, enumerable check, not an open-ended "simulate this account's arbitrary bytecode" problem. The tradeoff is fewer knobs for a smaller, more predictable integration surface, the same tradeoff Post #10 on the EthMagicians thread (chunter, Jan 29, 2026) frames explicitly: "swapping arbitrary validation-code execution for fixed account configurations eliminates wasted/unpaid computation and keeps inclusion checks performant, at the cost of custom recovery logic," justified because "the large majority of wallets rely on single-key verification (secp256k1, P-256, WebAuthn, BLS), covering EOAs, hardware wallets, and passkeys." Existing ERC-4337 smart accounts are not stranded either; they can migrate by registering actors via `importAccount()` without redeploying, which softens the "locked out until the ERC catches up" framing for anyone already on a canonical scheme.

---

## 2. Cross-Chain Portability as an Adoption Driver

A second pillar is architectural: the Keystore is deployed at a shared `KEYSTORE_ADDRESS`, and the spec's motivation names portability "a top concern," with one set of contracts and one signed change format across chains and transports. PR [#12135](https://github.com/ethereum/EIPs/pull/12135) made the Base implementation authoritative for internal mechanics. Concretely:

- **CREATE2 addresses derive from an `actors_commitment`**, not a factory nonce. Matching infrastructure, salt, actors, and bytecode can reproduce the same address, but the account still has to be deployed on each chain.
- **Actor changes have a multichain signature domain**: `chainId = 0` lets the same signed message be submitted on multiple chains. It does not broadcast the change; a relayer must submit it separately to each deployment and respect each chain's sequence state.
- **Delegate authenticators compose across accounts**, letting one signing key vouch for many accounts (`DELEGATE_AUTHENTICATOR`), which is a natural primitive for a multi-chain wallet that wants one hardware key to control the same logical identity everywhere.

The Celo CIP-64 thread (EthMagicians posts #12-22, June-July 2026) is the closest adoption case study. It compared an RPC shim using a chain-level default authenticator with wallets signing native EIP-8130 transactions through a two-phase fee flow. The native path avoided a default authenticator but required wallet upgrades and would be slower to roll out (post #18). The discussion forced `AA_TX_TYPE`/`AA_PAYER_TYPE` to move from `0x7B`/`0x7C` to `0x79`/`0x7A` (post #22, July 8) so EIP-8130 could coexist with Celo's existing OP Stack allocation.

**Position (Bull Case)**: shared cross-chain account infrastructure is a meaningful adoption driver for multi-chain wallets, evidenced by real migration engineering interest from an existing L2/sidechain team (Celo/CIP-64), not just theoretical design goals.

Attributed to the karlb/chunter thread (EthMagicians posts #12-22, cited above): https://ethereum-magicians.org/t/eip-8130-account-abstraction-by-account-configurations/25952

**Position (Bear Case)**: portability is only as strong as the coordination needed to deploy `KEYSTORE_ADDRESS`, canonical authenticators, and transaction-type numbers consistently. The CIP-64 thread shows that one migration required weeks of discussion and a protocol-constant renumbering to avoid a collision.

This is editorial analysis extending the sourced thread above, not a separately attributed bear-case quote; no participant in the thread frames the outcome as a negative, but the mechanics of the resolution (a full transaction-type renumbering driven by one adopting chain's prior allocation) are a direct, sourced illustration of the coordination cost the bear case in section 1 predicts in the abstract.

---

## 3. Does "No New Opcodes" Lower or Raise the Bar for Client Implementers?

EIP-8130 requires no new EVM opcodes. This contrasts with EIP-8141, which now adds seven (`APPROVE`, `TXPARAM`, `FRAMEDATALOAD`, `FRAMEDATACOPY`, `FRAMEPARAM`, `SIGPARAM`, `SIGDATACOPY`) plus frame dispatch, and EIP-8175, which adds four (`RETURNETH`, `SIG`, `SIGHASH`, `TX_GAS_LIMIT`).

But "no new opcodes" understates the new consensus-critical surface EIP-8130 introduces:

- A new EIP-2718 transaction type (`AA_TX_TYPE = 0x79`), now specified by EIP-8430, with domain-separated sender and payer hashes, phased calls with native value, open and bound payer modes, and a receipt phase count.
- A **Nonce Manager precompile** at `NONCE_MANAGER_ADDRESS` for parallel nonce lanes plus a consensus nonce-free mode with a fixed-capacity `replay_id` ring buffer.
- A **Transaction Context precompile** (`TX_CONTEXT_ADDRESS`): EIP-8430 defines `getTransactionPayer()` for every transaction type, and the Keystore integration adds sender, calls, and gas-limit getters readable during authentication.
- A **Keystore** at `KEYSTORE_ADDRESS` handling actor authorization, account creation and import, local epochs, multichain sequencing, and lock state, which a chain may enshrine natively or leave as EVM execution.
- A native `ecrecover` path for `K1_AUTHENTICATOR` (`address(1)`), an EIP-7623-style calldata floor, and `MAX_AUTHENTICATION_GAS` accounting outside `gas_limit`.

**Position**: "no new opcodes" lowers the bar specifically for EVM-interpreter maintainers, but not for full node implementers. The precompiles, Keystore, new transaction validation, local epochs, and consensus replay buffer are new state-transition surface regardless of whether they are expressed as opcodes.

This is editorial analysis; no public forum post or PR comment frames the tradeoff in these terms. The gas schedule's status also moved: PR #11813 (June 17) called it "a reference, not protocol constants," but PR #12204 (Aug 19) made it protocol constants under the L1 profile, and PR #12320 (Sep 16) showed what the flexibility had missed, an absent EIP-7623 floor that let data-heavy transactions post data about 40% cheaper than type-2 transactions.

The October split changes the implementer's bar in a useful way. A client can ship EIP-8430 alone, secp256k1-only and with no Keystore reads, and add the Keystore integration later; EIP-8430 prices every authentication as a signature check plus one cold authorization read, so a later Keystore integration "need not reprice secp256k1 transactions." Base's client went further than staging: it shipped the first half and, on November 17, deleted the second.

A narrower reading of "lowers the bar" is about audit surface rather than raw implementation effort: fixed precompiles with bounded input/output shapes (Nonce Manager, Transaction Context) are more tractable to audit and fuzz than an opcode whose semantics interact with the EVM's stack/memory/gas model in less enumerable ways. On that framing, "no new opcodes" is closer to true.

---

## 4. Contrast with the Modular-Account (ERC-7579-style) Ecosystem Question

EIP-8141's ecosystem pursues a different path to the same integration problem: modular-account composability at the **application layer** via ERC-8286 ("Modular Accounts for Frame Transactions," ERC PR #1794).

The difference is worth stating precisely, since "canonical set" and "modular account" are easy to conflate as solving the same problem when they sit at different layers:

| | EIP-8130 | EIP-8141 + ERC-8286 |
|---|---|---|
| Where authentication logic lives | A small, protocol-recognized set of authenticator contracts (`IAuthenticator`), extended via a companion ERC that node operators allowlist | Arbitrary account code inside a VERIFY frame; no protocol-level allowlist of validation logic at all |
| Where module composability lives | Not modeled explicitly at the base-EIP layer; accounts register actors, not "modules" in an ERC-7579 sense | ERC-8286, an application-layer ERC (`requires: 7579, 8141`) building modular-account composability on top of the frame-transaction primitive |
| Who gates what "counts" | Node operators, via the canonical authenticator allowlist enforced at the mempool/consensus layer | Nobody at the protocol layer; the mempool's restrictive tier gates which VERIFY-frame *shapes* are relayable, not which account modules exist |
| Growth mechanism | Companion ERC changes the canonical set nodes must accept | Application-layer ERCs (ERC-8286 and others) can proliferate independently of the base EIP, no node-side allowlist update required |

The practical consequence: under EIP-8130, a new authentication scheme needs canonical-set coordination before it can authenticate an AA transaction directly. Under EIP-8141, a new account pattern can live in account code, subject to the relay policy for its validation shape. The former gives nodes a smaller trust surface; the latter gives wallet developers more unilateral freedom.

No public EIP-8130-vs-ERC-8286 comparison thread exists; this contrast is constructed from the two ecosystems' documented designs. The layers have begun to converge, though. EIP-8130 now names EIP-8141 frame accounts as Keystore consumers, and open [ERC-8403](https://github.com/ethereum/ERCs/pull/1979) (AnkushinDaniil) defines one add, rotate, and revoke lifecycle with a normative EIP-8141 binding and an informative mapping onto the EIP-8130 Keystore, backed by a [proof of concept](https://github.com/AnkushinDaniil/erc-8403-poc) that runs against the Base Keystore's `authenticateActor`.

---

## 5. Payer-Service Tooling: ERC-8168

[Open ERC PR #1555](https://github.com/ethereum/ERCs/pull/1555) proposes ERC-8168, now titled **Payer Service Capability**. It reuses the ERC-7677 `paymasterService` capability while defining `payer_*` JSON-RPC methods; offers must support `payer_sendTransaction`, `payer_signTransaction`, or both. October 5 commits retargeted it at the split: the transaction type is EIP-8430, the Keystore is EIP-8130, and EIP-8141 frame transactions are a second target, with `requires: 5792, 7677, 8130, 8141, 8430`. A Keystore Integration section now uses the current grants: a named payer co-signs with a `SPONSOR_PAYER` actor, and a self-paying open payer needs `SELF_PAYER`. Later commits added rate-based token quotes (September 28), dropped endpoint versioning (October 19), and on October 26 renamed the request field to `sender` to match EIP-8430 and EIP-8141 and removed `payer_getSponsorshipBalance`.

It is the first payer-tooling proposal spanning both native-AA families, but not the canonical-set companion ERC, and has no editor review yet.

## 6. Metadata Tooling: ERC-8340

[Open draft ERC PR #1883](https://github.com/ethereum/ERCs/pull/1883) proposes ERC-8340, **Transaction Metadata Encoding**: deterministic CBOR forms for attribution, memos, phase and call scoping, and salted commitments to offchain data, plus an ERC-5792 `metadata` capability superseding `dataSuffix`. It has had no commits since July 16 and still targets "EIP-8130's metadata field," which now lives in EIP-8430. Treat it as dormant until retargeted.

## 7. Base Rollout, Guide, and Reference Implementation

Base's July 17 [Native Account Abstraction announcement](https://x.com/buildonbase/status/2078132881017245881) named September 2026 for Cobalt. That plan changed in Base's own client repository:

| Date | base/base PR | Change |
|---|---|---|
| Sep 8 | #4924 | Moved EIP-8130 activation from Cobalt to Zenith |
| Sep 25 | #5247, #5250 | Added the Everest upgrade and moved activation to it |
| Sep 29 | #5366 | Gated the Keystore to Zenith: "Everest has no concept of the Keystore" |
| Nov 10 | #6552 | Moved signing domains to `0x7900`/`0x7901`/`0x7902`, diverging from EIP-8430's `0x79`/`0x7A`/`0x7901` |
| Nov 17 | #6635, #6642 | Deleted the Keystore as "dead code on every live chain" and renamed the implementation "Base transactions" |

[Cobalt](https://docs.base.org/upgrades/cobalt/overview) went live on September 30 without EIP-8130. The [Everest page](https://docs.base.org/upgrades/everest/overview) still lists "Base Transactions (EIP-8430)" with no date, and Base's client sets no Everest timestamp for any network. Since November 17 no Base build contains the Keystore, so the EIP-8130 integration has no client implementation. Base PR #5664 (Oct 12) fixes "audit finding H-01 in the EIP-8130 audit"; no public audit report was found. Base's new [Base Transactions specification](https://docs.base.org/specifications/base-transactions) page already lags the merged EIP, still showing a 15,000 base cost.

The [builder guide](https://www.eip8130.com/guide) still presents the Keystore model as live on [Base Vibenet](https://vibes.base.org/), never mentions EIP-8430, and installs chunter-cb's viem fork. Upstream viem has no module: jxom opened a combined EIP-8130 and ERC-8168 PR (wevm/viem #5618) on November 19 and closed it unmerged 22 minutes later with no stated reason.

Base's [reference implementation](https://github.com/base/eip-8130) last merged on September 2. Its late-August PRs drove the September EIP edits; its open drafts have not moved since September 24.

---

## Summary

EIP-8130 trades permissionless validation growth for a smaller direct-authentication surface, now with an explicit permissive lane on L1. The split into a Keystore EIP and EIP-8430 lets clients and wallets adopt the transaction first, and Base's production plan does exactly that: Cobalt shipped without EIP-8130, Everest plans EIP-8430 with no date, and Base has removed the Keystore from its client. ERC-8168 and ERC-8403 now bridge EIP-8130 and EIP-8141 at the application layer.
