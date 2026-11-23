# Cross-Chain Account Portability

---

## TL;DR

EIP-8130 defines two portability primitives. First, the same CREATE2 inputs can produce the same account address on each chain where the Keystore infrastructure is deployed consistently. The account still has to be deployed separately on every chain where it will execute. Second, `chain_id = 0` makes one signed account change valid for replay against each deployment's multichain sequence counter. A wallet or relayer must submit that payload on every chain; the protocol does not broadcast or synchronize it.

Both ideas trace back to the original submission, PR [#11186](https://github.com/ethereum/EIPs/pull/11186). “Portable” means *address-deterministic and replayable*, not globally deployed or automatically synchronized. Account Lock is local-only and can block an update on one chain, multichain messages carry no message-level expiry by design, and a revoked admin stays valid on any chain nobody relays the revocation to. Since PR [#12386](https://github.com/ethereum/EIPs/pull/12386) (Oct 8) portability also spans transports: the same Keystore change applies whether a chain runs EIP-8430 natively or only ordinary EVM calls. Several open proposals target the stale-admin gap; none has merged. Portability belongs to EIP-8130: its sibling EIP-8430 is chain-local by design (signatures bind `chain_id`, and nonces and `replay_id`s live on each chain), so a wallet using EIP-8430 alone gets the same per-chain behavior as any EOA.

## 1. The Problem Being Solved

A plain EOA is already cross-chain portable by accident: the address is a function of a public key, not of any per-chain contract state, so the same secp256k1 key authenticates identically everywhere (aside from `chain_id` domain separation). Smart accounts break this. Their owner/signer configuration lives in per-chain contract storage, so rotating a key or adding a new signer means resending a separately signed, separately paid transaction to every chain the account has ever been deployed on, and it is easy to miss one.

EIP-8130's Motivation frames the design goal directly: "Portability is also a top concern," with one set of contracts and one signed change format "across chains and transports." The two mechanisms below are how that claim is implemented.

## 2. Primitive 1: Deterministic CREATE2 Addressing

Account addresses are derived as:

```
leaf_i            = keccak256(encode(initial_actor_i))
actors_commitment = keccak256(leaf_0 || leaf_1 || ...)
effective_salt    = keccak256(user_salt || actors_commitment)
deployment_code   = DEPLOYMENT_HEADER(len(code)) || code
address = keccak256(0xff || KEYSTORE_ADDRESS || effective_salt || keccak256(deployment_code))[12:]
```

The per-actor leaf hashing landed in PR [#12135](https://github.com/ethereum/EIPs/pull/12135). The user-controlled salt, sorted initial-actor commitment, and bytecode are chain-independent. If `KEYSTORE_ADDRESS` is also identical, the same inputs produce the same address on every chain. Code and storage remain chain-local, and the account must still be created where it will execute.

The guarantee remains conditional on deploying the Keystore at the same address everywhere. PR #12135 makes the canonical Base contracts authoritative for deployment mechanics, but the cross-chain address claim still depends on coordinated deployment rather than a global protocol invariant.

Freshness matters too: a create entry only applies against a CREATE2-fresh address (`code_size(sender) == 0 && nonce(sender) == 0`), a check tightened by community contributor pochenai's PR [#11609](https://github.com/ethereum/EIPs/pull/11609) (merged June 2, 2026) to match CREATE2 semantics exactly, closing a path where a create entry could otherwise be replayed against a counterfactual address that already had transaction history.

## 3. Primitive 2: The `chain_id = 0` Config-Change Channel

Every account tracks a monotonic multichain sequence plus a local epoch and sequence, packed into account state:

```solidity
struct ChangeSequences {
    uint64 multichain; // chain_id 0
    uint32 localEpoch;
    uint32 localSequence;
}
```

PR [#12135](https://github.com/ethereum/EIPs/pull/12135) replaced the actor-only function with one signed-change entry point:

```solidity
function applySignedAccountChanges(address account, SignedAccountChanges calldata changes) external;
```

The admin signature travels inside the batch. The `Multichain` channel targets `chain_id = 0` and binds against `multichain_sequence`. The `Local` channel binds to the current chain and packs its epoch and sequence into a signed `uint64`. Local `UNSEQUENCED` changes can land in any order within an epoch, while `IncrementLocalEpoch` invalidates any that remain unlanded. The multichain channel stays strictly ordered.

The mechanism is deliberately simple: nothing bridges or broadcasts the message. An owner signs one multichain update, and a relayer or wallet submits that payload to each Keystore deployment. Each chain checks its own sequence and applies the change independently. Because the Keystore is callable during ordinary EVM execution, propagation does not require native EIP-8130 transaction support, only compatible contracts.

Config-change authority remains the admin predicate (`scope == 0x00`). Lock and Unlock now share `applySignedAccountChanges` with actor changes, but they are local-channel operations. Lock state is therefore still per chain and cannot be set or cleared by a multichain message.

This cross-chain intent is not a late addition. The first merged submission, PR #11186, already carried portable `key_changes`. PR #11367 unified mutation under `account_changes`; PR #11764 renamed owners to actors and introduced `applySignedActorChanges`; PR #12135 replaced that function with `applySignedAccountChanges` and the local epoch. The multichain sequence remained ordered throughout.

### Degrading gracefully on non-8130 chains

Since PR #12386 this is the spec's central framing rather than a side comparison: the Keystore is usable through ordinary EVM calls on any chain, and a chain may integrate it natively, fully enshrined or only as a mempool optimization.

| Component | Chain with EIP-8430 and Keystore integration | EVM-only chain |
|---|---|---|
| Keystore | Same contract; nodes may enshrine reads and canonical authenticators | Same contract, address, and bytecode, called as ordinary EVM |
| Consumers | EIP-8430 transactions, plus EVM consumers | ERC-4337 accounts, EIP-8141 frame accounts, applications |
| Nonce tracking | EIP-8430 nonces | The consumer's own system, such as an ERC-4337 EntryPoint |
| Multichain config changes | Config-change entry `0x03` or `applySignedAccountChanges` | `applySignedAccountChanges` |

## 4. What This Enables

- **One address, deployed lazily per chain.** A wallet can hand out one counterfactual address and place code only on the chains a user actually uses.
- **One signature, multiple submissions.** Rotating an admin actor, adding a session key, or revoking a compromised key needs one `chain_id = 0` signature, but still requires a transaction or relayed call on each deployment.
- **Existing multi-chain smart accounts can opt in.** Since PR [#12333](https://github.com/ethereum/EIPs/pull/12333) (Sep 14), an already-deployed account calls the parameterless `importAccount()` itself, and the Keystore installs the actor set its `confirmKeystoreImport()` callback returns. Import carries no chain ID; it is a live call on each chain where it lands, and a wallet wanting a chain binding checks `block.chainid` inside the callback. It is one-time per address and rejects any account with existing Keystore state, so it does not link accounts deployed at different addresses before EIP-8130 existed.

A related but distinct discussion on the EthMagicians thread is worth noting for context. Starting at post [#12](https://ethereum-magicians.org/t/eip-8130-account-abstraction-by-account-configurations/25952) (karlb, June 5, 2026), karlb and chunter-cb worked through how a chain could set a default authenticator at the protocol level to let existing Celo CIP-64 accounts adopt EIP-8130 semantics "without modifying the state of all user accounts" (post #12), eventually converging (posts #19-#22, June 29-July 8, 2026) on an RPC-shim migration path and a transaction-type renumbering (`0x7b`/`0x7c` to `0x79`/`0x7a`) to avoid colliding with CIP-64's existing OP Stack allocation. That is a migration-continuity problem, not the `chain_id = 0` replay mechanism described above, but it reflects the same underlying design pressure: making an account's identity and configuration survive a system transition without touching every account individually.

Base's July 17 [Native Account Abstraction announcement](https://x.com/buildonbase/status/2078132881017245881) turned that portability claim into an adoption commitment for September. That changed: [Cobalt](https://docs.base.org/upgrades/cobalt/overview) shipped on September 30 without EIP-8130, [Everest](https://docs.base.org/upgrades/everest/overview) plans EIP-8430 with no date, and Base's client first gated the Keystore, the component that carries cross-chain configuration, behind a never-scheduled test fork, then deleted it on November 17. No cross-chain Keystore configuration operates in production, and no client currently implements it.

## 5. Contrast: The Alternatives Don't Address This

| Proposal | Cross-chain account portability |
|---|---|
| EIP-8141 | Frame Transaction — Frame modes, `APPROVE`, and the default-code EOA are chain-local; no propagation mechanism in its spec, though an EIP-8141 account could consume the EIP-8130 Keystore and open ERC-8403 proposes home-chain sync |
| EIP-8175 | Composable Transaction — Ed25519 EOAs derive new addresses under its own scheme, but nothing propagates an account's signer configuration across chains |
| EIP-8202 | Scheme-Agile Transactions — scheme-agility applies to sender authentication at the transaction layer, not to account-configuration continuity across chains |
| EIP-8223 | Contract Payer Transaction — a single-chain payer-registry predeploy; not an account-portability proposal at all |
| EIP-8224 | Counterfactual Transaction — a ZK shielded-funding mechanism for gas privacy; not an account-portability proposal |
| EIP-XXXX (Tempo-like) | Fixed UX primitives (batching, validity windows, 2D nonces, passkeys); no cross-chain propagation feature is documented |

This is an absence, not a rebuttal. EIP-8130's spec now mentions EIP-8141 only to name frame accounts as Keystore consumers, so the table reflects what each proposal's own spec describes. Among these six proposals, EIP-8130 is the only one whose base spec defines a mechanism for propagating an account's actor configuration across chains without a bridge.

## 6. Limits and Risks

**No message-level expiry on multichain changes, by design.** Community contributor pochenai's PR [#11612](https://github.com/ethereum/EIPs/pull/11612) flagged this as concern C3. Author chunter-cb rejected the proposed expiry as intentional: multichain changes are meant for full owners, while local changes cover per-chain policy. A `chain_id = 0` update can therefore remain replayable on a future deployment if its expected sequence matches. Nothing applies it automatically, and an actor's own `expiry` is a separate liveness field rather than an expiry for the signed change message.

**Lock is local, so propagation can silently stop at one chain.** The following is editorial analysis built on the sourced mechanics above. Because Lock and Unlock use the local channel, a multichain update can succeed everywhere the account is unlocked and fail on a separately locked deployment. The owner may only discover the gap operationally.

**Sequence counters require ordered catch-up.** This is editorial analysis. A signature commits to one sequence value. If one deployment misses an update, a later signature for the advanced sequence is rejected there until the missing earlier update is submitted. If the older payload is unavailable or blocked by local lock state, the protocol provides no automatic reconciliation mechanism.

**A revoked admin stays valid where the revocation was not relayed.** Agusx1211 made this point on the forum (post #30, Aug 28): a revoked key, including an admin, keeps working on any chain nobody relays the batch to. He proposed an opt-in freshness check whose interface "can only block, never authorize," plus snapshot batches carrying the full actor set. chunter replied (post #31) with expiring non-admin operators re-authorized by an admin authenticator that requires a home-chain proof, "still in design." Open proposals approach the gap differently: checkpointed non-admin actors co-approved by onchain admins ([#12293](https://github.com/ethereum/EIPs/pull/12293), [#12313](https://github.com/ethereum/EIPs/pull/12313)), multichain epochs that let one signature retire all outstanding multichain signatures (drafts [#12334](https://github.com/ethereum/EIPs/pull/12334), [#12462](https://github.com/ethereum/EIPs/pull/12462)), an optional model-neutral change digest ([#12341](https://github.com/ethereum/EIPs/pull/12341)), and ERC-8403's current-root check. Agusx1211's review of #12293 notes none of the checkpointing designs yet makes admins fresh.

**Propagation is relay, not push.** Nothing in the sourced spec text describes a bridge, keeper network, or broadcast mechanism for `chain_id = 0` messages. That is a real strength, no cross-chain messaging trust assumption is introduced, but it also means the entire portability guarantee depends on some party, the owner or a relayer, actually submitting the same payload to every chain the account exists on. A relayer that simply fails to reach one chain looks, from the account holder's perspective, identical to no problem at all until that chain is checked.

## Summary

EIP-8130 treats cross-chain account portability as a first-class design goal, now across transports as well as chains. Deterministic CREATE2 inputs can preserve an address across consistently deployed infrastructure, and `chain_id = 0` lets one signature authorize the same ordered actor change on multiple deployments. Neither feature creates global state: deployment, relaying, fees, sequence catch-up, lock state, and revocation are all per chain. “Portable” describes reproducible addresses and replayable authorization, not automatic synchronization or fresh revocation.

---

*See [Authenticator Model](/authenticator-model) for how actors and authenticators work within a single chain, or [EIP-8141: Frame Transaction](/eip-8141) for the comparison point this doc leans on most.*
