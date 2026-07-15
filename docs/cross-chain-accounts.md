# Cross-Chain Account Portability

---

## TL;DR

EIP-8130 defines two portability primitives. First, the same CREATE2 inputs can produce the same account address on each chain where the Account Configuration infrastructure is deployed consistently. The account still has to be deployed separately on every chain where it will execute. Second, `chain_id = 0` makes one signed actor change valid for replay against each deployment's multichain sequence counter. A wallet or relayer must submit that payload on every chain; the protocol does not broadcast or synchronize it.

Both ideas trace back to the original submission, PR [#11186](https://github.com/ethereum/EIPs/pull/11186). “Portable” means *address-deterministic and replayable*, not globally deployed or automatically synchronized. Account Lock is local-only and can block an update on one chain, while multichain actor-change messages carry no message-level expiry by design.

## 1. The Problem Being Solved

A plain EOA is already cross-chain portable by accident: the address is a function of a public key, not of any per-chain contract state, so the same secp256k1 key authenticates identically everywhere (aside from `chain_id` domain separation). Smart accounts break this. Their owner/signer configuration lives in per-chain contract storage, so rotating a key or adding a new signer means resending a separately signed, separately paid transaction to every chain the account has ever been deployed on, and it is easy to miss one.

EIP-8130's own Abstract frames the design goal directly: "the contract infrastructure is designed to be shared across chains as a common base layer for account management" (per the spec's Abstract section). The two mechanisms below are how that claim is actually implemented.

## 2. Primitive 1: Deterministic CREATE2 Addressing

Account addresses are derived as:

```
actors_commitment = keccak256(actorId_0 || authenticator_0 || scope_0 || policyData_0 || ... )
effective_salt    = keccak256(user_salt || actors_commitment)
deployment_code   = DEPLOYMENT_HEADER(len(code)) || code
address = keccak256(0xff || ACCOUNT_CONFIG_ADDRESS || effective_salt || keccak256(deployment_code))[12:]
```

The user-controlled inputs, `user_salt`, the sorted `initial_actors` commitment, and bytecode, are chain-independent. If `ACCOUNT_CONFIG_ADDRESS` is also identical, computing the formula on ten chains yields the same address on all ten. That supports one counterfactual address across chains, but code and storage remain chain-local. The account must still be created on each chain where it is used. On EIP-8130-native chains, `code` is placed directly at the derived address; on chains without native support, `createAccount()` uses the identical `deployment_code` as ordinary CREATE2 init code.

This guarantee rests on one assumption the sourced spec text does not fully spell out: `ACCOUNT_CONFIG_ADDRESS` itself has to be deployed at the same address on every chain for the formula to agree. The spec calls it "CREATE2-derived, resolved at deployment" without giving a fixed value or describing the cross-chain deployment process, so treat "same address everywhere" as conditioned on that deployer being rolled out consistently, not as a protocol-enforced invariant.

Freshness matters too: a create entry only applies against a CREATE2-fresh address (`code_size(sender) == 0 && nonce(sender) == 0`), a check tightened by community contributor pochenai's PR [#11609](https://github.com/ethereum/EIPs/pull/11609) (merged June 2, 2026) to match CREATE2 semantics exactly, closing a path where a create entry could otherwise be replayed against a counterfactual address that already had transaction history.

## 3. Primitive 2: The `chain_id = 0` Config-Change Channel

Every account tracks two independent sequence counters, packed into one 32-byte account-state slot alongside the lock flags:

```solidity
struct ChangeSequences {
    uint64 multichain; // chain_id 0
    uint64 local;      // chain_id == block.chainid
}
```

Config changes are applied through:

```solidity
function applySignedActorChanges(address account, uint256 chainId, ActorChange[] calldata actorChanges, bytes calldata auth) external;
```

`chainId == 0` targets the multichain channel and binds against `multichain_sequence`; any other value must equal `block.chainid` and binds against `local_sequence` instead. The signed digest itself commits to both the `chainId` and the current `sequence` value:

```
TYPEHASH = keccak256("SignedActorChanges(address account,uint256 chainId,uint64 sequence,ActorChange[] actorChanges)ActorChange(uint8 changeType,bytes32 actorId,bytes data)")
```

The mechanism is deliberately simple: nothing bridges or broadcasts the message. An owner signs one `chain_id = 0` update, and a relayer, or the owner's own wallet, submits that identical signed payload to the Account Configuration Contract deployment on each chain in turn. Each deployment independently checks the signature and its own `multichain_sequence` counter; if the counter matches what the digest committed to, the change applies and the counter increments. Because `applySignedActorChanges` is an ordinary EVM call, it works "during EVM execution on any chain, including non-8130 chains and ERC-4337 deployments" per the spec text, so propagation does not require the target chain to have adopted EIP-8130 at the protocol level at all, only to have the same contract deployed.

Config-change authority for this channel is exactly the admin predicate (`scope == 0x00`), the same predicate used for `authorizeActor`/`revokeActor` and delegation. Account Lock is explicitly excluded from this channel: `applySignedLockChanges` "operates on the **local account channel only**," binding against `local_sequence`, never `multichain_sequence`, so lock/unlock state is inherently a per-chain fact, not something a `chain_id = 0` message can set or clear.

This cross-chain intent is not a late addition. The very first merged submission, PR #11186, already carried a `key_changes` field described as "a separate array of portable cross-chain key-change operations," distinct from same-chain `account_initialization`. PR [#11367](https://github.com/ethereum/EIPs/pull/11367) (merged March 3, 2026) unified that field with `account_initialization` into the single typed `account_changes` array (create/config-change/delegation) while introducing Account Lock for the first time. The terminology since went through two more full renames, "keys" to "owners" (PR #11380) and "owners" to "actors" (PR [#11764](https://github.com/ethereum/EIPs/pull/11764), merged June 4, 2026, which also produced the current `applySignedActorChanges` name), but the underlying `chain_id`-gated dual-counter mechanic has been continuously present since the original design.

### Degrading gracefully on non-8130 chains

The same portability story extends to chains that have not adopted EIP-8130 as a native protocol feature, per the spec's own Portability comparisons:

| Component | EIP-8130-native chain | Non-8130 chain (EVM only) |
|---|---|---|
| Account Configuration Contract | Same contract, also recognized by node-level mempool/validation rules | "Standard contract (ERC-4337 compatible factory)," same address, same bytecode |
| Nonce tracking | Nonce Manager precompile | "Existing systems (e.g., ERC-4337 EntryPoint)" |
| Code delegation | Delegation entry in `account_changes`, EOA-only authorization in this version | "Standard EIP-7702 transactions (ECDSA authority)" |
| Multichain config changes | `applySignedActorChanges` | Same function, callable as ordinary EVM execution, no `AA_TX_TYPE` support required |

## 4. What This Enables

- **One address, deployed lazily per chain.** A wallet can hand out one counterfactual address and place code only on the chains a user actually uses.
- **One signature, multiple submissions.** Rotating an admin actor, adding a session key, or revoking a compromised key needs one `chain_id = 0` signature, but still requires a transaction or relayed call on each deployment.
- **Existing multi-chain smart accounts can opt in.** `importAccount()` lets an already-deployed account (e.g. an ERC-4337 wallet) bootstrap into the same actor/authenticator model via an ERC-1271 signature over a digest that itself carries `chainId` (0 or local), joining the same multichain channel going forward. Import is a one-time hook, though: it requires both sequence channels to be zero, so it only applies once per address and does not itself link accounts that were deployed at different addresses on different chains before EIP-8130 existed.

A related but distinct discussion on the EthMagicians thread is worth noting for context. Starting at post [#12](https://ethereum-magicians.org/t/eip-8130-account-abstraction-by-account-configurations/25952) (karlb, June 5, 2026), karlb and chunter-cb worked through how a chain could set a default authenticator at the protocol level to let existing Celo CIP-64 accounts adopt EIP-8130 semantics "without modifying the state of all user accounts" (post #12), eventually converging (posts #19-#22, June 29-July 8, 2026) on an RPC-shim migration path and a transaction-type renumbering (`0x7b`/`0x7c` to `0x79`/`0x7a`) to avoid colliding with CIP-64's existing OP Stack allocation. That is a migration-continuity problem, not the `chain_id = 0` replay mechanism described above, but it reflects the same underlying design pressure: making an account's identity and configuration survive a system transition without touching every account individually.

## 5. Contrast: The Alternatives Don't Address This

| Proposal | Cross-chain account portability |
|---|---|
| EIP-8141 | Frame Transaction — Frame modes, `APPROVE`, and the default-code EOA are all chain-local concepts; no config-propagation or address-portability mechanism appears in its spec |
| EIP-8175 | Composable Transaction — Ed25519 EOAs derive new addresses under its own scheme, but nothing propagates an account's signer configuration across chains |
| EIP-8202 | Scheme-Agile Transactions — scheme-agility applies to sender authentication at the transaction layer, not to account-configuration continuity across chains |
| EIP-8223 | Contract Payer Transaction — a single-chain payer-registry predeploy; not an account-portability proposal at all |
| EIP-8224 | Counterfactual Transaction — a ZK shielded-funding mechanism for gas privacy; not an account-portability proposal |
| EIP-XXXX (Tempo-like) | Fixed UX primitives (batching, validity windows, 2D nonces, passkeys); no cross-chain propagation feature is documented |

This is an absence, not a rebuttal: EIP-8130's own spec text draws zero explicit comparison to any of these six proposals (a full-text search of the spec turns up no mention of "8141" or the others), so this table reflects what each proposal's own spec does and does not describe, not a claim made by any of the proposals about each other. Among these six proposals, EIP-8130 is the only one whose base spec defines a mechanism for propagating an account's owner/actor configuration across chains without a bridge.

## 6. Limits and Risks

**No message-level expiry on multichain changes, by design.** Community contributor pochenai's PR [#11612](https://github.com/ethereum/EIPs/pull/11612) flagged this as concern C3. Author chunter-cb rejected the proposed expiry as intentional: multichain changes are meant for full owners, while local changes cover per-chain policy. A `chain_id = 0` update can therefore remain replayable on a future deployment if its expected sequence matches. Nothing applies it automatically, and an actor's own `expiry` is a separate liveness field rather than an expiry for the signed change message.

**Lock is local, so propagation can silently stop at one chain.** The following is editorial analysis built on the sourced mechanics above, not a position raised in a specific PR or forum post. Because `applySignedLockChanges` only ever touches `local_sequence`, and a `LOCKED` account rejects all actor-config changes on that chain, a `chain_id = 0` update can succeed everywhere the account happens to be unlocked and be rejected, with no automatic notification, on any single chain where the account was separately locked for an unrelated, local reason. The owner would only discover the gap operationally, for instance by finding a revoked key still authorized on one deployment.

**Sequence counters require ordered catch-up.** This is editorial analysis. A signature commits to one sequence value. If one deployment misses an update, a later signature for the advanced sequence is rejected there until the missing earlier update is submitted. If the older payload is unavailable or blocked by local lock state, the protocol provides no automatic reconciliation mechanism.

**Propagation is relay, not push.** Nothing in the sourced spec text describes a bridge, keeper network, or broadcast mechanism for `chain_id = 0` messages. That is a real strength, no cross-chain messaging trust assumption is introduced, but it also means the entire portability guarantee depends on some party, the owner or a relayer, actually submitting the same payload to every chain the account exists on. A relayer that simply fails to reach one chain looks, from the account holder's perspective, identical to no problem at all until that chain is checked.

## Summary

EIP-8130 treats cross-chain account portability as a first-class design goal. Deterministic CREATE2 inputs can preserve an address across consistently deployed infrastructure, and `chain_id = 0` lets one signature authorize the same ordered actor change on multiple deployments. Neither feature creates global state: deployment, relaying, fees, sequence catch-up, and lock state are all per chain. “Portable” describes reproducible addresses and replayable authorization, not automatic synchronization.

---

*See [Authenticator Model](/authenticator-model) for how actors and authenticators work within a single chain, or [EIP-8141: Frame Transaction](/eip-8141) for the comparison point this doc leans on most.*
