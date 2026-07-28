# Glossary

A comprehensive index of jargon used across this site: EIP-8130 itself, the account/actor/authenticator model it defines, and the terminology of the alternative and complementary proposals it is compared against (EIP-8141, EIP-8175, EIP-8202, EIP-8223, EIP-8224, EIP-XXXX). Entries are grouped by category and alphabetical within each group.

---

## 1. Core Concepts

- **Account Abstraction (AA)** — The general goal of decoupling transaction validation and payment from a fixed secp256k1-EOA model, letting session keys, multisig logic, or sponsorship govern who may act on an account. EIP-8130 pursues this via a canonical authenticator allowlist rather than arbitrary wallet-code execution; see [/competing-standards](/competing-standards) for how the alternative proposals position themselves on this axis.
- **Actor** — Any authority-holder on an EIP-8130 account: a full owner, a session key, a payer-only key. Actors are identified by a 32-byte `actorId` and governed by a `scope` bitmask stored in `actor_config`.
- **actorId** — A 32-byte identifier an authenticator derives from public key material (not necessarily an address) naming a specific actor on an account. Renamed from `keyId` (PR #11380, "ownerId") to `actorId` in PR #11764 (Jun 4, 2026).
- **Authentication** — The step of resolving a signature or credential to an `actorId`, performed by an authenticator contract's `authenticate()` call or, for `K1_AUTHENTICATOR`, a native `ecrecover`. Deliberately separated from authorization; see [/authenticator-model](/authenticator-model).
- **Authorization** — The step of checking what an already-authenticated actor may do, governed by its `scope` bitmask and, if `POLICY` is set, its policy manager.
- **Mempool Validation Algorithm** — The nine-step sequence a node runs to decide whether to accept an EIP-8130 transaction into its mempool: parsing `sender_auth`, resolving `sender`, determining actor state, simulating pending config changes, validating `sender_auth`, resolving the payer, checking nonce/expiry, checking payer rate limits, and applying replacement rules. See [/current-spec](/current-spec) and [/mempool-safety](/mempool-safety).
- **No Wallet Code Execution** — EIP-8130's core mempool-safety claim: a node accepts a transaction by checking authenticator *identity* against a canonical allowlist rather than simulating the sender's own arbitrary account bytecode. See [/mempool-safety](/mempool-safety) for the argument and its contrast with EIP-8141.
- **Operational Authority** — The predicate governing ERC-1271 signing, defined as `admin || (SENDER && !POLICY)`. Introduced in PR #11918 (Jul 13, 2026), replacing a standalone SIGNER scope bit; a POLICY-gated actor is never operational and must not sign raw hashes.
- **STATICCALL** — The EVM call type used to invoke an authenticator's `authenticate()` function; it cannot write storage, emit events, or otherwise change chain state, keeping authentication read-only and auditable.
- **Statelessness / Witness Cost** — Shorthand for the state a stateless client must prove to validate a transaction. EIP-8130's validation footprint is narrow (one `actor_config` slot, nonce state, payer balance), excluding policy-gate state from the pre-inclusion witness set; see [/mempool-safety](/mempool-safety) §5.
- **VOPS (Validity-Only Partial Statelessness)** — A statelessness design under which a node validates transactions using only a bounded witness rather than full state. EIP-8223's static payer-registry model is strictly VOPS-compatible, needing only the `0x13` predeploy's storage trie as additional witness data.

---

## 2. Account Configuration and Actors

- **ACCOUNT_CONFIG_ADDRESS** — The CREATE2-derived address of the Account Configuration Contract, the single point of actor authorization, account creation, and change sequencing for every EIP-8130 account.
- **Account Configuration Contract** — The system contract at `ACCOUNT_CONFIG_ADDRESS` that stores each account's actors, processes `account_changes`, and enforces Account Lock. See [/current-spec](/current-spec).
- **actor_config** — The per-actor storage slot on an account, holding `authenticator` (bytes 0-19), `scope` (byte 20), `expiry` (`uint48`, bytes 21-26), and reserved bytes 27-31. Actors are revoked by deleting this slot, except the self-actor.
- **ActorChange (struct)** — `{changeType, actorId, data}`, an entry inside a signed config-change message; `changeType` is `0x01` (`authorizeActor`) or `0x02` (`revokeActor`).
- **ActorConfig (struct)** — `{authenticator, scope, expiry}`, the typed shape of an `actor_config` slot's payload, used in signature typehashes (`ACTORCONFIG_TYPEHASH`).
- **Actor Policies** — The `POLICY`-scope mechanism gating a restricted actor to calling a single designated `policy_manager` contract, enforced during call execution rather than mempool validation. Landed in PR #11766 (Jun 4, 2026), after an earlier unmergeable draft (PR #11648).
- **admin** — The predicate `scope == 0x00` (no grant bits set), required for every config-change authorization. Redefined from a dedicated CONFIG bit to this absence-of-restriction predicate in PR #11918 (Jul 13, 2026), on the reasoning that a config-only bit is indistinguishable from full access.
- **applySignedActorChanges** — The entry point applying a signed batch of `ActorChange` entries against either the local (`chain_id == block.chainid`) or multichain (`chain_id == 0`) change-sequence channel. See [/cross-chain-accounts](/cross-chain-accounts).
- **authorizeActor / revokeActor** — The functions (and `ActorChange` change-types) that register or delete an actor's `actor_config` slot. Renamed from `authorizeOwner`/`revokeOwner` in PR #11764 (Jun 4, 2026).
- **change sequence (multichain_sequence / local_sequence)** — Two independent `uint64` counters per account, packed into the account-state slot, gating replay of signed actor-change messages; `chain_id = 0` binds against `multichain_sequence`, any other value against `local_sequence`.
- **ChangeSequences (struct)** — `{multichain, local}`, the two-counter struct returned by `getChangeSequences`.
- **expiry (actor-level)** — A per-actor `uint48` Unix-seconds liveness bound; an actor is live only if `expiry == 0` or `block.timestamp <= expiry`. Not expressible at account-create or import time as of Jul 28, 2026 (see open PR #11919).
- **InitialActor (struct)** — `{actorId, authenticator, scope, policyData}`, the tuple shape used to seed actors at `createAccount` or `importAccount` time; has no `expiry` field in the merged spec.
- **policy_commitment / policy_manager** — Two extra storage slots present only when an actor's `scope & POLICY != 0`, written verbatim from `policyData` at authorization time and read only during call execution, never during mempool validation.
- **policyData** — The authorization-time payload for a `POLICY`-scoped actor, exactly `manager (20 bytes) || commitment (32 bytes)`.
- **reserved bits (actor_config)** — Bytes 27-31 of the `actor_config` slot, which MUST be zero on write; a nonzero value acts as an implicit version discriminator so new-format configs fail closed on legacy deployments.
- **scope (byte)** — The per-actor permission bitmask; `0x00` denotes admin (unrestricted), and any set bit denotes a specific grant (`SENDER`, `POLICY`, `NONCE`, `SELF_PAYER`, `SPONSOR_PAYER`). Redefined from a flat SIGNATURE/SENDER/PAYER/CONFIG model to the current five-grant model in PR #11918 (Jul 13, 2026).
- **Self-actor** — The implicit actor at `actorId == bytes32(bytes20(account))`, representing the account's own key. Has two mutually exclusive forms: an inline secp256k1 self held in the packed account-state slot, or a non-secp256k1 self authenticator held in the ordinary `actor_config` slot.

---

## 3. Scope Grants and Authorization

- **ERC-1271** — The standard `isValidSignature(hash, signature)` interface EIP-8130 uses both as a migration fallback for already-deployed contract accounts (`importAccount`) and as the off-chain-signing predicate (`verifySignature`), gated by operational authority.
- **NONCE (grant, 0x04)** — Permits a restricted actor to use non-nonceless `nonce_key`s; without it, a restricted actor may only use `NONCE_KEY_MAX` (nonceless).
- **POLICY (grant, 0x02)** — Gates initiation as `sender_auth` to calls targeting only the actor's `policy_manager`. Composes with SENDER (POLICY always gates regardless).
- **SELF_PAYER (grant, 0x08)** — Permits self-pay when `payer == sender`, including via a dedicated gas key distinct from the signing key. Split from a single PAYER bit in PR #11918 (Jul 13, 2026).
- **SENDER (grant, 0x01)** — Permits ungated initiation as `sender_auth`, allowing the actor to call any `call.to`. Also satisfies operational authority for ERC-1271 signing unless combined with POLICY.
- **SPONSOR_PAYER (grant, 0x10)** — Permits acting as `payer_auth` for a different sender (`payer != sender`), i.e. sponsoring another account's gas. Split from a single PAYER bit in PR #11918 (Jul 13, 2026).

---

## 4. Authenticators and Signing

- **authenticate()** — The single function every `IAuthenticator` implements: `authenticate(bytes32 hash, bytes calldata data) external view returns (bytes32 actorId)`. Renamed from `verify()` in PR #11785 (Jun 9, 2026).
- **Authenticator** — A contract implementing `IAuthenticator`, resolving a signature or credential to an `actorId`. Any such contract can be permissionlessly deployed, but only canonical authenticators authenticate transactions directly on the mempool path.
- **Canonical Authenticator Set** — The small allowlist of authenticators (k1, p256, passkey, delegate as of Jul 28, 2026) accepted for direct transaction authentication. The draft points to a companion ERC (number TBD) for deterministic deployments, but does not yet define how clients activate membership changes. Formalized as a node-conformance baseline in PR #11647 (May 11, 2026).
- **Companion ERC (authenticator set)** — The not-yet-numbered ERC intended to define canonical deployment addresses across chains. EIP-8130 leaves its contents and the client-activation process unresolved.
- **DELEGATE_AUTHENTICATOR** — The canonical authenticator letting one account (A) register an actor pointing at another account (B); any key authenticating as B may then authenticate as A. Nesting is capped at depth 1, and the nested actor on B must be admin.
- **IAuthenticator** — The Solidity interface every authenticator contract implements: a single `authenticate(hash, data) -> actorId` method, called via STATICCALL.
- **K1_AUTHENTICATOR** — The protocol-reserved sentinel `address(1)` for native secp256k1 authentication; when it appears in an auth blob, the protocol performs `ecrecover` directly instead of a STATICCALL. Renamed from `ECRECOVER_AUTHENTICATOR` in PR #11815 (Jun 18, 2026).
- **Non-canonical authenticator** — Any `IAuthenticator` contract not in the canonical set. Permissionlessly deployable and registerable, usable inside ordinary EVM execution (e.g. a wallet-defined recovery call), but not usable to authenticate a transaction directly over the mempool path.
- **p256 / passkey** — Two canonical authenticator entries: P-256 (secp256r1) raw signatures and WebAuthn/FIDO2 passkey signatures, both deriving `actorId = keccak256(x || y)`.
- **replaySafeHash** — The account- and chain-scoped EIP-712 digest Base's reference implementation uses before `verifySignature` authentication to prevent cross-account signature replay. Added in implementation PR #45; the canonical EIP still authenticates the supplied hash directly.
- **verifySignature** — The ERC-1271-style boolean predicate (`verifySignature(account, hash, signature)`) used for off-chain signing (Permit-style approvals, order signatures), gated by operational authority rather than a dedicated signing scope bit. The canonical draft passes `hash` directly.

---

## 5. Transaction Format and Fields

- **AA_PAYER_TYPE** — The magic byte (`0x7A`) prefixing the payer's signature-hash preimage, used only for domain separation from the sender's signature; not a registered EIP-2718 transaction type. Renumbered from `0x7C` in PR #11903 (Jul 8, 2026).
- **AA_TX_TYPE** — The EIP-2718 transaction type byte for EIP-8130 AA transactions, `0x79` as of Jul 28, 2026. Assigned `0x7B` in PR #11757 (Jun 2, 2026), then renumbered to `0x79` in PR #11903 (Jul 8) to avoid an OP Stack CIP-64 collision.
- **account_changes** — The transaction field carrying typed entries mutating account state: create (`0x00`), config change (`0x01`), delegation (`0x02`). Unified from two separate fields (`account_initialization`, `key_changes`) in PR #11367 (Mar 3, 2026).
- **call phase** — One atomic group of calls within `calls`; if any call in a phase reverts, that phase's state is discarded and remaining phases are skipped, but earlier committed phases persist.
- **calls** — The transaction field carrying a two-level array of call phases (`[[call,...],[call,...]]`); calls within a phase are atomic, phases commit independently in sequence.
- **CBOR** — Concise Binary Object Representation. Open ERC-8340 uses its deterministic encoding rules to structure EIP-8130 metadata without changing the field's opaque consensus treatment.
- **metadata** — An opaque, signed transaction field for wallet attribution and annotation data, shipped in PR #11805 (Jun 15, 2026). Open ERC-8340 proposes deterministic CBOR records for attribution, memos, call scope, and offchain commitments.
- **payer / payer_auth** — See Gas Sponsorship and Payer Model below.
- **REPLAY_ID_TYPE** — The magic prefix (`0x7901`) domain-separating the `replay_id` hash used for nonce-free-mode deduplication.
- **sender / sender_auth** — `sender` is the sending account address (empty for an EOA signature, in which case it is recovered via ecrecover); `sender_auth` is the raw ECDSA signature or `authenticator || data` blob authenticating it. `sender` was renamed from `from` in PR #11526 (May 11, 2026).

---

## 6. Nonces and Replay Protection

- **Mempool replacement** — The rule that a replacement transaction must raise `max_priority_fee_per_gas` by at least the node's minimum bump and be independently fully valid; standard/2D replacements share `(sender, nonce_key, nonce_sequence)`, nonce-free replacements share `(sender, replay_id)`.
- **nonce_key / nonce_sequence** — The packed two-dimensional nonce fields: `nonce_key` selects a channel (`0` standard, `1..NONCE_KEY_MAX-1` parallel, `NONCE_KEY_MAX` nonce-free), `nonce_sequence` is the expected sequence number within that channel.
- **NONCE_FREE_EXPIRY_WINDOW** — The chain parameter bounding how far in the future a nonce-free transaction's `expiry` may be set.
- **NONCE_KEY_MAX** — The sentinel value (`2^256 - 1`) for `nonce_key` selecting nonce-free mode, in which the protocol never reads or increments nonce state.
- **Nonce-free mode** — The replay-protection mode selected via `nonce_key == NONCE_KEY_MAX`, relying on a non-zero `expiry` plus `replay_id` deduplication in a fixed-capacity consensus ring buffer instead of a sequential nonce. Introduced in PR #11478 (Apr 2, 2026), hardened by `replay_id` in PR #11752 (Jun 2, 2026).
- **replay_id** — A `keccak256`-derived deduplication identifier for nonce-free transactions, deliberately excluding fee fields and both auth blobs so fee-bumped or re-signed variants of the same logical transaction collapse to one mempool slot. Defined in PR #11752 (Jun 2, 2026).
- **REPLAY_BUFFER_CAPACITY** — The protocol constant or chain parameter sizing the fixed-capacity consensus ring buffer of `replay_id`s used for nonce-free dedup; consensus state, not per-node bookkeeping.

---

## 7. Gas Sponsorship and Payer Model

- **AA_BASE_COST** — The recommended fixed per-transaction intrinsic-gas overhead (15,000 gas), explicitly a reference value rather than a protocol constant (clarified in PR #11813, Jun 17, 2026).
- **Gas metering isolation** — The design under which `payer_auth_cost` is metered outside `gas_limit` and charged separately to the payer, since the payer chooses their own authenticator unilaterally and it is excluded from both signature hashes; `sender_auth_cost` is included in `gas_limit` since both parties sign over it.
- **payer** — The transaction field naming the gas-paying address; empty means the sender self-pays.
- **payer_auth** — The signature/authenticator blob authorizing the payer, structurally identical to `sender_auth`; empty means self-pay.
- **Self-pay** — The mode where `payer` is empty (or equals the sender's own address) and the resolved actor must hold `SELF_PAYER`; includes the sub-case of a dedicated gas key funding another key's transactions on the same account.
- **Sponsored transaction** — The mode where `payer` names a different address whose `actor_config` must grant `SPONSOR_PAYER`, letting one account fund gas for another.

---

## 8. Account Lock and Mempool Safety

- **Account Lock** — A per-account mechanism freezing actor-config changes and delegations while set. The draft grants a higher mempool tier when this is combined with a stateless authenticator; stateful and delegated authenticators can retain other invalidation dependencies. Introduced in PR #11367 (Mar 3, 2026), lifecycle simplified in PR #11918 (Jul 13, 2026).
- **applySignedLockChanges** — The dedicated, EVM-only, admin-authorized entry point for locking or unlocking an account, operating on the local (per-chain) change channel only.
- **LOCK_CHANGE_TYPEHASH** — The EIP-712-style typehash for a signed lock/unlock message, binding `account`, `chainId`, `op`, `unlockDelay`, and `sequence`.
- **DEFAULT_EOA_REVOKED (flag)** — Bit 0 of the packed account-state flags field; when set, disables the implicit secp256k1 self-actor (the default EOA). `createAccount` and `importAccount` set it by default, which the spec calls a quantum-safe default. Introduced in PR #11815 (Jun 18, 2026), replacing an earlier `REVOKED_AUTHENTICATOR` sentinel address.
- **LOCKED (flag)** — Bit 1 of the packed account-state flags field; while set, all actor-config changes and delegations are rejected except unlock.
- **UNLOCK_INITIATED (flag)** — Bit 2 of the packed account-state flags field, selecting whether `lock_union` holds a pending `unlock_delay` or a computed `unlocks_at` timestamp.
- **unlock_delay / unlocks_at** — The two interpretations of the packed `lock_union` field: a pending notice period (`unlock_delay`, bounded to the `uint16` range, about 18.2 hours max) before `UNLOCK_INITIATED` is set, or the computed unlock timestamp (`unlocks_at`) after.

---

## 9. Account Creation, Import, and Cross-Chain Portability

- **actors_commitment** — The `keccak256` commitment over all `initial_actors` entries, folded into the CREATE2 `effective_salt` so an account's address depends on its initial actor set.
- **chain_id = 0 channel** — The actor-config-change convention where `chain_id == 0` targets the multichain change-sequence counter. The same signature may be submitted separately to compatible deployments on multiple chains; lock changes are local-only. See [/cross-chain-accounts](/cross-chain-accounts).
- **computeAddress** — The view function returning an account's CREATE2-derived address for a given `userSalt`, `bytecode`, and `initialActors`, without deploying it.
- **createAccount** — The function creating a new account via a `create` entry, deriving its address from `user_salt` and the `initial_actors` commitment.
- **CREATE2 address derivation** — The formula computing an account's address from `ACCOUNT_CONFIG_ADDRESS`, an `effective_salt` (itself derived from `user_salt` and `actors_commitment`), and the deployment bytecode hash. It reproduces an address only where those inputs and deployment infrastructure are identical.
- **DEPLOYMENT_HEADER** — A fixed 14-byte EVM loader prefixing `code` in `deployment_code`, letting the same bytes serve as ordinary CREATE2 init code on non-8130 chains while an 8130-native chain places `code` directly.
- **effective_salt** — `keccak256(user_salt || actors_commitment)`, the salt actually used in the CREATE2 formula, binding the account's address to its initial actor set.
- **Existing Smart Contract (account type)** — One of three account-creation paths: an already-deployed account (e.g. an ERC-4337 wallet) registers actors via `importAccount()` rather than being created fresh.
- **importAccount** — The function letting an already-deployed contract account bootstrap into EIP-8130's actor model via an ERC-1271 signature, without redeploying; rejected if the account already has any 8130 state.
- **MAX_CODE_SIZE** — The 24,576-byte limit (via EIP-170) enforced on a create entry's `code`. Added by community PR #11609 (Jun 2, 2026).
- **user_salt** — The caller-chosen `bytes32` salt input to CREATE2 address derivation, folded with `actors_commitment` into `effective_salt`.

---

## 10. System Contracts, Precompiles, and Constants

- **0xef0100** — The EIP-7702 delegation-indicator prefix, reused verbatim by EIP-8130's own delegation account-change entries; an authenticator address whose code starts with this prefix is rejected (it must not itself be a delegated account).
- **DEFAULT_ACCOUNT_ADDRESS** — The CREATE2-derived address a code-less EOA sender auto-delegates to when no create or delegation entry applies, giving every EOA a default wallet implementation.
- **getNonce** — The read-only function on the Nonce Manager precompile, `getNonce(address account, uint256 nonceKey) returns (uint64)`.
- **INonceManager** — The interface for the Nonce Manager precompile, exposing `getNonce` to ordinary EVM execution.
- **ITransactionContext** — The interface for the Transaction Context precompile, exposing `getTransactionSender()`, `getTransactionPayer()`, and `getTransactionSenderActorId()` during `calls` execution.
- **MAX_ACCOUNT_CHANGES** — The named per-transaction cap on config-change entries introduced with the unified `account_changes` schema in PR #11367 (Mar 3, 2026). The current spec no longer names the constant, expressing it instead as a configurable per-transaction limit on config-change entries enforced as a mempool rule.
- **Nonce Manager** — The precompile at `NONCE_MANAGER_ADDRESS` holding two-dimensional nonce state, read and incremented directly by the protocol during AA transaction processing.
- **NONCE_MANAGER_ADDRESS** — The fixed address (`0x813000000000000000000000000000000000aa01`) of the Nonce Manager precompile.
- **Transaction Context (precompile)** — The precompile at `TX_CONTEXT_ADDRESS` exposing the resolved sender, payer, and sender actorId to in-flight EVM execution; replaced an earlier EIP-1153-transient-storage-based design in PR #11388 (Mar 9, 2026).
- **TX_CONTEXT_ADDRESS** — The fixed address (`0x813000000000000000000000000000000000aa02`) of the Transaction Context precompile.

---

## 11. Related EIPs

- **EIP-170** — The EVM max-contract-code-size limit (24,576 bytes); added to EIP-8130's `requires` header in PR #11609 (Jun 2, 2026) to bound `create`-entry code size.
- **EIP-1153** — Transient storage (`TSTORE`/`TLOAD`); EIP-8130's original `requires` dependency for its first Transaction Context design, dropped once a dedicated precompile replaced it (PR #11388, Mar 9, 2026).
- **EIP-2542** — An unrelated, pre-existing EIP formally withdrawn on June 30, 2026 citing EIP-8141 as its superseder, the first EIP-8141-related formal supersession noted in this site's research.
- **EIP-2718** — The typed-transaction envelope standard; EIP-8130's `AA_TX_TYPE` is registered under this scheme, as are every other proposal covered on this site.
- **EIP-7702** — Set-code delegation for EOAs (`0xef0100` indicator). EIP-8130's body text depends on this mechanism for its own delegation entries without listing 7702 in `requires` (it was added, then dropped from the frontmatter in PR #11492, Apr 14, 2026).
- **EIP-8130** — "Account Abstraction by Account Configuration," this site's subject: a native-AA transaction type authenticating senders through a small canonical authenticator allowlist rather than arbitrary wallet-code execution. See [/current-spec](/current-spec).
- **EIP-8141** — "Frame Transaction," EIP-8130's most direct competitor: a fully programmable native-AA transaction type built from purpose-labeled "frames," restricting public mempool relay to four validation-prefix shapes rather than fixing an authenticator interface. See [/eip-8141](/eip-8141).
- **EIP-8175** — "Composable Transaction," a flat, non-recursive alternative bundling typed `capabilities` with a separate `signatures` list and a programmable `fee_auth` prelude for sponsorship. See [/eip-8175](/eip-8175).
- **EIP-8202** — "Scheme-Agile Transaction" (also "Schemed Transaction"), a single flat execution payload plus typed `authorizations`/`extensions` lists. Its current draft defines ordinary and Merkle-committed ephemeral secp256k1 schemes; earlier P-256 and Falcon text was removed before merge. See [/eip-8202](/eip-8202).
- **EIP-8223** — "Contract Payer Transaction," a complementary, narrow-scope static gas-sponsorship mechanism gated by a canonical payer-registry predeploy at `address(0x13)`, no EVM execution. See [/eip-8223](/eip-8223).
- **EIP-8224** — "Counterfactual Transaction," a complementary shielded gas-funding mechanism using an fflonk ZK proof against canonical fee-note contracts, solving the "bootstrap problem" for fresh EOAs. See [/eip-8224](/eip-8224).
- **EIP-8250 / EIP-8266 / EIP-8272 / EIP-8288** — EIP-8141's `requires`-linked sibling EIPs (keyed nonces, expiring nonces, recent roots, and PQ/STARK signature aggregation, respectively): EIP-8141's growth model of composing via separate proposals rather than absorbing every feature into its own spec text.
- **EIP-XXXX (Tempo-like Transactions)** — A pre-draft gist (no EIP number, no PR) by Georgios Konstantopoulos bundling a fixed set of wallet UX primitives (batching, validity windows, sponsorship, 2D nonces, passkeys) with no programmable validation and no opcodes. See [/eip-xxxx](/eip-xxxx).

---

## 12. EIP-8141 (Frame Transaction) Terminology

- **APPROVE (0xaa)** — EIP-8141's central new opcode; terminates the calling frame successfully and sets transaction-scoped approval flags for payment and/or execution. It charges only memory expansion, with no separate base cost (PR #12003, Jul 23, 2026).
- **ARBITRARY (scheme 0x0)** — An EIP-8141 outer-signature scheme performing no protocol-level crypto check; `SIGPARAM` exposes its raw bytes so custom verification can run inside a frame. Each entry adds 100 intrinsic gas (PR #11976, Jul 20, 2026).
- **DEFAULT (frame mode 0)** — An EIP-8141 frame called from `ENTRY_POINT`, used for general execution and post-op logic such as sponsor refunds.
- **DEP_VERIFY_FRAME_MODE (= 3)** — A new frame mode proposed by EIP-8141's sibling EIP-8288 to support native post-quantum signature and STARK proof aggregation at the block level.
- **direct evaluation (EIP-8141)** — The PR #12001 fast path letting clients evaluate the default-code, expiry-verifier, and canonical-paymaster validation prefixes without tracing EVM execution, under the same gas and dependency rules.
- **EXPIRY_VERIFIER** — The sole sanctioned path in EIP-8141 for reading `TIMESTAMP`-derived expiry inside a validation prefix: a VERIFY frame targeting `address(0x8141)` that enforces an 8-byte Unix-seconds deadline, since `TIMESTAMP` itself is a banned opcode there.
- **frame** — EIP-8141's core structural primitive: one of up to 64 purpose-labeled sub-calls (`DEFAULT`, `VERIFY`, `SENDER`) composing a transaction, each independently gas-metered.
- **MAX_FRAMES** — The cap on frames per EIP-8141 transaction, reduced from an original 1,000 to 64 via PR #11521 (Apr 14, 2026).
- **MAX_VERIFY_GAS** — The 100,000-gas cap EIP-8141 imposes on its restrictive mempool tier's validation-prefix execution.
- **SENDER (frame mode 2)** — An EIP-8141 frame called from `tx.sender`, requiring an approval already granted by a prior VERIFY frame.
- **signatures list** — EIP-8141's dedicated outer transaction field, a typed list of `[scheme, signer, msg, signature]` tuples (schemes `ARBITRARY`, `SECP256K1`, `P256`) built as a forward-compat hook for future PQ aggregation. secp256k1 and P-256 now require canonical low-s signatures; the merged draft has no explicit list bound.
- **TXPARAM / FRAMEDATALOAD / FRAMEDATACOPY / FRAMEPARAM / SIGPARAM** — The remaining five of EIP-8141's six new opcodes, reading transaction-, frame-, and signature-scoped data during frame execution; `SIGPARAM` specifically exposes the raw bytes of an `ARBITRARY`-scheme signature for custom or PQ verification logic.
- **VERIFY (frame mode 1)** — An EIP-8141 frame dispatched with STATICCALL semantics; a frame carrying approval authority must call `APPROVE` to succeed.

---

## 13. EIP-8175 (Composable Transaction) Terminology

- **capabilities** — EIP-8175's flat, typed list of execution entries (`CALL`, `CREATE`), replacing EIP-8141's nested frame structure with sequential, non-recursive composition.
- **fee_auth** — EIP-8175's optional sponsorship field; naming an address there triggers a protocol-run "prelude call" to that contract, which credits ETH via the `RETURNETH` opcode.
- **RETURNETH** — An EIP-8175 opcode debiting/crediting ETH between a contract and its parent or an escrow, used by the `fee_auth` prelude.
- **ROLE_SENDER / ROLE_PAYER** — The two roles an EIP-8175 `signatures` entry can carry, distinguishing sender authentication from payer authentication.

---

## 14. EIP-8202 (Scheme-Agile Transaction) Terminology

- **authorizations (EIP-8202)** — EIP-8202's typed list of `[role_id, scheme_id, witness]` tuples carrying scheme-agile sender proofs; only `ROLE_SENDER` is currently defined.
- **EXT_BLOB / EXT_SET_CODE** — Two typed entries in EIP-8202's `extensions` list, carrying EIP-4844 blob fields and EIP-7702-style scheme-agile set-code delegations respectively.
- **extensions (EIP-8202)** — EIP-8202's typed list of `[extension_id, extension_payload]` entries carrying orthogonal protocol features (blobs, set-code delegation) alongside the single execution payload.
- **scheme_id** — The protocol-registered enum value identifying a signature scheme in EIP-8202's `authorizations` list; adding a scheme means registering a new `scheme_id`, not changing the envelope.
- **SCHEME_EPHEMERAL_K1 (0x01)** — EIP-8202's Merkle-committed one-time secp256k1 scheme. A seed derives `2^20` ephemeral keys offchain; each transaction carries a recoverable signature, Merkle root, and proof for the nonce-selected key.
- **SCHEME_SECP256K1 (0x00)** — EIP-8202's ordinary recoverable secp256k1 authorization scheme.

---

## 15. EIP-8223 and EIP-8224 (Contract Payer / Counterfactual) Terminology

- **authorize(sender)** — The EIP-8223 call a payer contract makes on the `0x13` predeploy to register the single EOA it will sponsor gas for.
- **fee-note contract** — An EIP-8224 canonical contract instance (identified by `EXTCODEHASH`, not a fixed address) holding shielded ETH deposits as private Poseidon commitments redeemable for gas.
- **fflonk** — The ZK proof system (over BN254) EIP-8224 uses to prove ownership of an unspent fee-note commitment without revealing which one, reusing existing powers-of-tau trusted-setup infrastructure.
- **nullifier** — The value consumed on spending an EIP-8224 fee note, preventing the same shielded deposit from being spent twice.
- **Payer Registry Predeploy (0x13)** — EIP-8223's single canonical contract address holding a one-sender-per-payer authorization mapping, read via one SLOAD with no EVM execution.
- **Poseidon commitment** — The private cryptographic commitment representing an unspent EIP-8224 fee note.

---

## 16. EIP-XXXX (Tempo-like Transactions) Terminology

- **Keychain (wrapper)** — EIP-XXXX's deferred hook for access/session keys, wrapping an inner signature with a `user_address` for delegation; expiry, spending-limit, and revocation rules are not yet specified.
- **MAX_WEBAUTHN_SIG_SIZE** — EIP-XXXX's bound on WebAuthn signature size (2,049 bytes), keeping validation cost deterministic.
- **valid_after / valid_before** — EIP-XXXX's native, protocol-enforced transaction validity window fields, letting wallets schedule or expire transactions without application-level tricks.

---

## 17. Related ERCs

- **ERC-4337** — The widely-deployed account-abstraction standard using a `validateUserOp` entry point that executes arbitrary wallet code during validation; the paradigm case EIP-8130's motivation section critiques (without naming it) for forcing nodes to simulate arbitrary EVM. Existing ERC-4337 wallets can migrate onto EIP-8130 via `importAccount()`.
- **ERC-7562** — The ERC-4337-derived mempool-simulation ruleset; EIP-8141 references an ERC-7562-based permissive second mempool tier for use cases exceeding its restrictive validation-prefix policy.
- **ERC-7579** — A modular-account standard for ERC-4337 wallets; ERC-8286 requires it alongside EIP-8141.
- **ERC-8168** — "8130 Payer Service Capability," proposed in open ERC PR #1555. It defines `payer_*` JSON-RPC methods over `paymasterService` and token-offer `paymentMode` choices; as of Jul 28 it still uses EIP-8130's superseded `PAYER` scope term and is not the canonical-authenticator-set companion ERC.
- **ERC-8286** — "Modular Accounts for Frame Transactions" (ERC PR #1794, open as of Jul 28, 2026), an application-layer standard building modular-account composability on top of EIP-8141, contrasted in [/developer-tooling](/developer-tooling) with EIP-8130's protocol-layer canonical authenticator set.
- **ERC-8340** — "Transaction Metadata Encoding," proposed in open draft ERC PR #1883. It defines deterministic CBOR metadata for attribution, memos, transaction/phase/call scope, and salted offchain commitments, plus an ERC-5792 wallet capability; it does not change EIP-8130 consensus rules.

---

## 18. Governance and Process Terms

- **Base Cobalt** — The Base network upgrade in which Base announced it plans to activate EIP-8130 in September 2026. This is a chain rollout commitment, not Ethereum L1 inclusion or current production activation.
- **Base reference implementation** — Base's public `base/eip-8130` contract implementation and tests. Its PRs #44 and #45 add ERC-4337 fallback execution and account-scoped signature replay protection that are not merged into the canonical EIP text.
- **Base Vibenet** — Base's ephemeral devnet at `vibes.base.org` for testing EIP-8130 before activation.
- **Celo CIP-64** — An existing production account-abstraction system on Celo whose migration onto EIP-8130 was discussed at length on the EthMagicians thread (posts #12-23), ultimately forcing the `AA_TX_TYPE`/`AA_PAYER_TYPE` renumbering to avoid an OP Stack transaction-type collision. See [/cross-chain-accounts](/cross-chain-accounts) and [/developer-tooling](/developer-tooling).
- **Draft (EIP status)** — EIP-8130's current formal status as of Jul 28, 2026: not finalized as an EIP. Base's announced Cobalt rollout does not change that formal status.
- **EthMagicians thread** — The community discussion forum thread for EIP-8130 (ethereum-magicians.org/t/eip-8130-account-abstraction-by-account-configurations/25952), the primary venue for design debate outside the PR review process.
- **Hegotá (hard fork)** — The Ethereum hard-fork "Considered for Inclusion" list EIP-8141 joined via PR #11537 (merged Apr 30, 2026). EIP-8130 has no equivalent Ethereum L1 listing; Base's Cobalt plan is separate.
- **Significant PR** — This site's own classification for a merged PR meeting size or scope thresholds (large diff, cross-cutting spec changes, opcode/constant changes) warranting a full why/what/why-it-matters treatment in [/merged-changes](/merged-changes) rather than a one-line entry.
