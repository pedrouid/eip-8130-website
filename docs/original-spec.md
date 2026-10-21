# Original Spec

This page describes EIP-8130 as it was first merged into `ethereum/EIPs`, before any of the renames, structural rewrites, or new mechanisms covered in [Merged Changes](/merged-changes) and [Original vs Latest](/original-vs-latest). It is a historical snapshot, not a description of the spec as it stands today. For the current mechanics, see [Current Spec](/current-spec).

---

## Provenance

EIP-8130, "Account Abstraction by Account Configuration," is authored by Chris Hunter (`@chunter-cb`) of Coinbase/Base. The EIP frontmatter lists `created: 2025-10-14`, which per EIP process convention records the concept-inception date rather than when the file entered the `ethereum/EIPs` repository. The public EthMagicians discussion thread opened about ten days later, on October 24, 2025. There is roughly a four-and-a-half month gap between the created date and the file's first merge.

Two near-identical submission PRs were opened in late January 2026:

- PR #11144 (opened January 21, 2026), a duplicate initial submission, closed January 29, 2026 without merging once maintainer abcoathup asked the author to consolidate on the other PR.
- PR #11186 (opened January 27, 2026), merged February 28, 2026. This is the PR that actually became EIP-8130. The author had to fix a bad rebase along the way after abcoathup flagged that unrelated EIP edits had been bundled into the same PR.

PR #11186's merged diff (+722/-0 lines) is the true baseline for "the original spec." Everything below describes that baseline as merged on February 28, 2026.

A companion proposal, "Token Gas Payments for EIP-8130" (PR #11194), was opened the following day, proposing an `extensions` field carrying ERC-20 gas payment support. It was closed without merging in March 2026, and neither the extensions field nor token gas payments are part of the original or current spec; see [Merged Changes](/merged-changes) for more on proposals that were explored and set aside.

---

## What the Original Submission Proposed

The core shape of the original submission is still recognizable, though it is now split across two proposals: a new EIP-2718 transaction type (since October carried by EIP-8430) paired with an onchain "Account Configuration" system contract (now the Keystore, the whole of EIP-8130) that separates authentication (resolving a signature to an authorized entity) from account logic (what that entity may do). That separation, and the pitch that nodes can filter transactions on authenticator identity rather than simulating arbitrary wallet code, was present from the first merged draft.

**Frontmatter**: `eip: 8130`, `requires: 1153, 2718`. The original submission required EIP-1153 (transient storage) in addition to EIP-2718 (typed transactions). EIP-1153 was dropped later once the Transaction Context mechanism moved off transient storage (see below). EIP-7702 and EIP-170 were added and removed at different points afterward; neither was in the original `requires:` line.

**Terminology used in the original submission (all later renamed)**:

| Original term | Meaning | Renamed to | When |
|---|---|---|---|
| `keys` | The generic authorized-entity concept | `owners`, then `actors` | PR #11380 (March 6), then PR #11764 (June 4) |
| `keyId` | Identifier for a key | `ownerId`, then `actorId` | Same as above |
| `key_config` | Per-key storage record | `owner_config`, then `actor_config` | Same as above |
| `verifiers` | Contracts resolving signatures to identities | `IVerifier`, then `authenticators`/`IAuthenticator` | PR #11388 (March 9), then PR #11785 (June 9) |
| `IAuthVerifier` | Verifier interface | `IVerifier` -> `IAuthenticator` | PR #11388, then PR #11785 |
| `from` | Transaction sender field | `sender` | PR #11526 (May 11) |
| `authorizeKey()` / `revokeKey()` | Key management functions | `authorizeActor()` / `revokeActor()` | Tracked the owner -> actor rename, PR #11764 |

Each of these went through two rename cycles (a first pass to a "generic authority-holder" framing, then a second pass distinguishing scoped authority from full ownership). See [Merged Changes](/merged-changes) for the full narrative of why each rename happened.

**Well-known verifiers**: the original submission specified five: K1 (secp256k1/ECDSA), P256 (secp256r1 raw), WebAuthn P256, BLS (BLS12-381), and DELEGATE (delegated validation to another account, limited to a single hop). Today's canonical authenticator set is narrower, comprising k1, p256, passkey, and delegate; BLS is not part of the current canonical set described in [Current Spec](/current-spec).

**Account mutation**: the original submission used two separate transaction fields for changing an account's state: `account_initialization` (CREATE2-based new-account creation carrying an `initial_keys` list) and `key_changes` (a separate array of portable, cross-chain key-change operations). These were two independent mechanisms with no shared entry-type schema.

**Nonce handling**: a "Nonce Manager" precompile at `NONCE_MANAGER_ADDRESS` provided 2D nonce storage keyed by `nonce_key`/`nonce_sequence`. There was no nonce-free mode; every transaction consumed a sequenced nonce.

**Payer modes**: four were specified: self-pay, delegate payer (standing on-chain authorization), K1 sponsor, and "verifier sponsor." There was no scope-gating on who could act as payer; any authorized key could pay.

**Transaction Context**: delivered via EIP-1153 transient storage written directly onto the Account Configuration Contract, with `getCurrentPayer()`/`getCurrentSigner()` getters. This is the mechanism that drove the original `requires: 1153`.

**Transaction type values**: both `AA_TX_TYPE` and `AA_PAYER_TYPE` were `TBD <!-- TODO -->` placeholders. Neither had a concrete byte value assigned.

**Gas formula**: the intrinsic-cost formula was already present in roughly its current shape, summing a base cost, payload cost, sender-key cost, payer cost, nonce-key cost, bytecode cost, and a key-changes cost. Component names changed over time (`key_changes_cost` eventually became `account_changes_cost`), but the overall additive structure has survived essentially unchanged since the original submission.

**Reference interfaces**: `IAccountConfig` and `IAuthVerifier` were both present from the start. `IAuthVerifier` went through two renames (`IVerifier`, then `IAuthenticator`); the account-configuration interface eventually became `IAccountConfiguration`.

---

## What the Original Submission Lacked

Compared to the spec as it stands today (see [Current Spec](/current-spec) and [Original vs Latest](/original-vs-latest) for the full detail), the original merged submission (PR #11186) did not have:

- **No scope-bit permission model.** The only permission primitive was a `key_policy` bitfield (`revoked`, `requireSponsor`); a `requireSponsor` key could authenticate but not draw the account's ETH for gas. Beyond that, every authorized key had equal authority. There was no SENDER/PAYER/SIGNATURE/CONFIG bit distinction, let alone the current five-bit SENDER/POLICY/NONCE/SELF_PAYER/SPONSOR_PAYER grant model. The first scope-bit model arrived in PR #11388 (March 9); it was substantially redesigned again in PR #11918 (July 13).
- **No Account Lock mechanism.** Nothing let an account freeze its own configuration against further changes. This arrived in the very next merged PR, #11367 (March 3), and was itself simplified later in PR #11918.
- **No unified account-mutation schema.** Account creation (`account_initialization`) and key changes (`key_changes`) were two separate fields rather than a single typed `account_changes` array with create/config-change/delegation entry types. The unification happened in PR #11367.
- **No ERC-1271 fallback authorization path.** The original submission had no way for an already-deployed contract account (one that hadn't yet registered explicit keys) to authorize a change via `isValidSignature`. This migration path for existing wallets was added in PR #11367.
- **No nonce-free mode.** Every transaction consumed a sequenced nonce; there was no `NONCE_KEY_MAX` sentinel, no `replay_id` mechanism, and no expiry-based replay protection. Nonce-free mode arrived in PR #11478 (April 2) and was hardened by the `replay_id` design in PR #11752 (June 2).
- **No canonical or allowlisted authenticator set.** The original five well-known verifiers were described but not formalized as a node-conformance baseline. That formalization, including the companion-ERC-maintained deployment addresses, arrived in PR #11647 (May 11).
- **No actor call policies.** There was no `policyType`/`policyTarget`/`manager`-gated call initiation, and therefore no session-key-style restricted actor. This arrived in PR #11766 (June 4), after an earlier draft attempt (PR #11648) was closed and rebased.
- **No per-actor `expiry` field.** Individual actors could not be given a liveness window; expiry as a concept did not exist in the original submission.
- **No `eth_call`/`eth_estimateGas` RPC extension** for AA transactions. This is a recent addition, arriving in PR #11903 (July 8), well over four months after the original merge.
- **No concrete transaction-type byte values.** `AA_TX_TYPE` and `AA_PAYER_TYPE` were placeholders until PR #11757 (June 2) assigned `0x7B`/`0x7C`; those values were renumbered again to `0x79`/`0x7A` in PR #11903 (July 8).
- **No `requires: 170` (EIP-170 max code size).** This was added in PR #11609 after a review comment converging on matching CREATE2 freshness semantics.
- **No metadata field.** The opaque, signed `metadata` transaction field used today for attribution and annotation purposes did not exist; it was the result of a monthslong design debate (draft PRs #11578 and #11655) resolved in PR #11805 (June 15).
- **No delegate-authenticator payer-hash binding.** The original submission's delegate verifier had no protection against a cross-account replay of a payer's vouching signature; this gap was closed in PR #11808 (June 16), after real exploitability was identified.
- **No "operational authority" framing for signing.** Signing was originally just "any key with SIGNATURE scope." By PR #11918, the standalone SIGNER bit was removed entirely and ERC-1271 signing was reframed as a derived property (`operational := admin || (SENDER && !POLICY)`) rather than its own grant; PR #12333 later simplified it to admin or any `OPERATOR` scope.

---

## A Note on Recoverability

The original-submission baseline above is drawn directly from the file as merged in PR #11186 (`ethereum/EIPs`, merge commit `2a17745e2e84c3d02a9a9e7a71f03914eaee07fd`, 722 lines). The full text of that file is recoverable in the `ethereum/EIPs` git history, so the claims above reflect what was actually merged rather than an inferred reconstruction. Anything not listed here as present or absent in the original submission (for example, exact storage-slot layouts, which PR #11378 later removed from the spec text entirely and deferred to the reference implementation) should be treated as out of scope for this page. See [Merged Changes](/merged-changes) for the PR-by-PR account of how each mechanism above arrived.
