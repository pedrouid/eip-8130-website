# Overview: EIP-8130 and EIP-8430

EIP-8130 and EIP-8430 are sibling standards by the same author, Chris Hunter (@chunter-cb, Coinbase/Base). Until October 2026 they were one proposal. PR [#12386](https://github.com/ethereum/EIPs/pull/12386) (Oct 8) split it in two: **EIP-8130, "Keystore Accounts,"** defines who may act for an account and what each actor may do, and **EIP-8430, "AA Transaction Type,"** defines a transaction that carries those actions onchain. They are designed to work together, but neither requires the other. This site covers both.

::: warning Proposal status
Both are merged Drafts: EIP-8130 has 49 merged PRs, and EIP-8430 merged via PR [#12385](https://github.com/ethereum/EIPs/pull/12385) on November 23, 2026. Neither is scheduled for an Ethereum L1 hard fork. On Base, the [Everest upgrade](https://docs.base.org/upgrades/everest/overview) plans EIP-8430 with no date, and on November 17 Base deleted the EIP-8130 Keystore from its client entirely.
:::

---

## Two Standards, One Design

| | EIP-8130: Keystore Accounts | EIP-8430: AA Transaction Type |
|---|---|---|
| Question it answers | Who may act for an account, and with what authority | How an action reaches the chain, who pays, and how it is ordered |
| What it defines | An onchain Keystore: actors, authenticators, scopes, policies, signed changes, epochs, lock, creation and import, signature verification | An EIP-2718 transaction (`0x79`): phased calls with value, bound and open payers, 2D nonces, nonce-free mode, in-band delegation, metadata, receipts, RPC |
| Who can use it | Any consumer: a native transaction type, an ERC-4337 account, an EIP-8141 frame account, an application checking signatures | Any EOA with a secp256k1 key |
| Validation model | `authenticate(hash, data) -> actorId`, then scope checks | Fixed-cost: one secp256k1 signature per role, nonce, balance, validity window |
| Frontmatter `requires` | 170, 1014 | 1559, 2718, 2929, 7623, 7702 |
| Status | Draft, merged | Draft, merged Nov 23, 2026 |
| Detail on this site | [EIP-8130 Spec](/current-spec) | [EIP-8430 Spec](/eip-8430) |

The split follows the line the original design already drew between authentication and execution. EIP-8130's new rationale puts it directly: authority over an account "should not depend on which transaction format carries an action." EIP-8430's motivation makes the mirror-image point: its wire format "is designed so that richer authentication can be added later without a new transaction type."

---

## Not Mutually Exclusive: Three Ways to Deploy

### EIP-8430 alone

A chain can ship the transaction type with no Keystore. Every EOA then gets call batching with phased atomicity, native value in calls, gas sponsorship (a named payer or an open payer recovered from its signature), parallel nonce lanes and a nonce-free mode, and EIP-7702-style delegation set in the same transaction that uses it. Authentication is secp256k1 only, and an account's own key authorizes everything.

This is Base's production plan, and since November 17 its only plan: Everest lists "Base Transactions (EIP-8430)," and base/base PR #6635 removed the Keystore from Base's client, stating that the client's `0x79` support "is now what EIP-8430 specifies for Everest: delegation-only account changes and the native secp256k1 authenticator." A follow-up (#6642) renamed the code "Base transactions." Base's client does diverge from the merged spec in one place: since November 10 it signs under `0x7900`, `0x7901`, and `0x7902` domains where EIP-8430 still uses `0x79`, `0x7A`, and `0x7901`.

### EIP-8130 alone

The Keystore is an ordinary contract, so any EVM chain can deploy it with no protocol change. Accounts then get scoped actors, session keys, policy managers, local and multichain signed changes, and account-scoped signature verification, consumed through:

- **ERC-4337 accounts**, which call the Keystore from their own validation and can import into it with `importAccount()`;
- **EIP-8141 frame accounts**, which the Keystore names as consumers;
- **applications**, which call `validateSignature` instead of ERC-1271;
- **other transaction types**, such as open extension draft EIP-8388, which authenticates ordinary EIP-1559 and EIP-2930 transactions through the Keystore without EIP-8430.

A chain may also enshrine the Keystore natively, or use native reads only as a mempool optimization, without adopting EIP-8430.

### Both together

On a chain running both, EIP-8130 fills EIP-8430's extension points (next section). As of November 23 no chain plans this configuration: Base, the only announced adopter, removed its Keystore implementation. The one public build of the combination is a research prototype: sm-stack's [EIP-8288 on OP Stack](https://ethresear.ch/t/its-time-to-scale-the-trust-eip-8288-on-op-stack/26208) (November 2) uses the Keystore and the `0x79` transaction because the pair "looks likely to reach L2s first," adding a statement authenticator that keeps post-quantum signatures out of the transaction. The result is the full design the single EIP used to describe: one native transaction whose sender and payer can be any Keystore actor, gated by scope, with account creation and signed configuration changes carried in the same transaction. Accounts with no Keystore state see no difference: EIP-8130 guarantees identical validity, execution, and gas for them, and EIP-8430 prices every authentication, including plain secp256k1, as a signature check plus one cold authorization read so that an extension storing authorizations "need not reprice secp256k1 transactions."

---

## How EIP-8130 Plugs Into EIP-8430

| EIP-8430 extension point | EIP-8430 alone | With EIP-8130 |
|---|---|---|
| Authenticator selector in `sender_auth` / `payer_auth` | Only `K1_AUTHENTICATOR`; the recovered address must equal the named account | Any authenticator the chain accepts: the canonical set everywhere, plus gas-capped contracts on permissive chains |
| Authorization-rules hook | The account's own key may originate, pay, and delegate | Scope grants decide: initiation (admin, `OPERATOR`, `POLICY`), `NONCE` lanes, `SELF_PAYER` or `SPONSOR_PAYER`, admin for delegation |
| Account-change types | `0x01` delegation; others reserved | Adds `0x02` create (counterfactual account with initial actors) and `0x03` config change (one signed Keystore batch) |
| Explicit self-pay form | Redundant | A dedicated gas key on the same account, gated by `SELF_PAYER` |
| Transaction Context precompile | `getTransactionPayer()` | Adds sender, calls, and gas-limit getters, readable during authentication so a payer authenticator can decide sponsorship onchain. Merged EIP-8430 instead lists sender and sender-actor-ID getters; the texts disagree |
| Execution rules | Plain calls | Policy gate to the actor's manager; zero value for policy-gated actors and canonical account bytecode |
| `eth_estimateGas` / `eth_call` | Simulates the account's own key | Accepts `senderActorId` / `payerActorId` to simulate a specific actor |
| Authentication gas | Flat `K1_AUTH_COST`; signatures are not metered as bytes | Non-k1 authentication data must be metered: `sender_auth` bytes as payload, `payer_auth` bytes at 10 gas per token |
| Mempool | Signature, nonce, balance, window | Also `actor_config` invalidation, acceptance policy, and a high-rate tier for locked canonical payers |

Everything in the right-hand column is specified in EIP-8130's "AA Transaction Type Integration" section, except the authentication-gas rule, which merged EIP-8430 imposes on any extension. Since EIP-8130's integration text was last edited on October 8, before EIP-8430's final gas rework, the two texts are not yet fully reconciled.

---

## Why They Were Split

For ten months the transaction type and the account-configuration contract lived in one file. The split came after three developments; the link between them is this site's reading, since the PRs themselves state only the transport-neutral rationale:

- **L1 debate.** The forum's summary of the August 25 Frame Transaction breakout records an outcome that L1 should not enshrine opinionated account models, while EIP-8130's authenticator model benefits L2s. A transaction type for plain EOAs takes no position on the account model.
- **Staged rollout.** Base's client moved activation out of Cobalt on September 8 and, in late September, staged the transaction type (Everest) and the Keystore (a never-scheduled test fork) separately. In November it deleted the Keystore code altogether.
- **Composition.** A Keystore usable by EIP-8141 frame accounts and ERC-4337 accounts is easier to adopt if it is not tied to one transaction format. Open ERC-8403 and ERC-8168 already span both native-AA families.

pedrouid's closed PR #12248 had proposed a similar decomposition in August. See [Feedback Evolution](/feedback-evolution) for the full sequence.

---

## The Wider Family

| Proposal | Builds on | Note |
|---|---|---|
| [EIP-8386](https://github.com/ethereum/EIPs/pull/12218) Transaction Events View | Transaction Context precompile | Drafted before the split; the precompile now lives in EIP-8430, but it still declares `requires: 8130`, which editor jochem-brouwer flagged on November 3 |
| [EIP-8387](https://github.com/ethereum/EIPs/pull/12221) Stateless Accounts | Keystore actor model and an account-change entry | Drafted before the split; its entry numbering does not match the merged texts, also flagged on November 3 |
| [EIP-8388](https://github.com/ethereum/EIPs/pull/12222) Keystore Signatures for Execution Txs | EIP-8130 only | Keystore authentication for existing transaction types, no EIP-8430 needed |
| [Expired Actor Pruning](https://github.com/ethereum/EIPs/pull/12240) | EIP-8130 only | Consensus cleanup of expired actors |
| [ERC-8168](https://github.com/ethereum/ERCs/pull/1555) Payer Service Capability | EIP-8430, EIP-8130, EIP-8141 | Payer RPC spanning both native-AA families |
| [ERC-8340](https://github.com/ethereum/ERCs/pull/1883) Transaction Metadata Encoding | `metadata` field | Written for EIP-8130; the field now lives in EIP-8430 |
| [ERC-8403](https://github.com/ethereum/ERCs/pull/1979) Account Authority Lifecycle | EIP-8141, mapped onto EIP-8130 | One actor lifecycle across both account models |

---

## Where to Go Next

- [EIP-8130 Spec](/current-spec) — the Keystore and its integration rules.
- [EIP-8430 Spec](/eip-8430) — the transaction type on its own.
- [Merged Changes](/merged-changes) and [Feedback Evolution](/feedback-evolution) — how the single proposal evolved and split.
- [Competing Standards](/competing-standards) — how the pair compares to EIP-8141 and the other alternatives.
- [FAQ](/faq) — short answers, including how the two standards relate.
