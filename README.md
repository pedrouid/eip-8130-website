# EIP-8130: Account Configuration

Source-driven analysis of [EIP-8130](https://eips.ethereum.org/EIPS/eip-8130) (Account Abstraction by Account Configuration), tracking its design, review history, alternatives, and unresolved questions.

Last updated: July 20, 2026. Tracks the unchanged canonical spec through PR #11918, with EIP PRs #11578 and #11919 open. Also tracks ERC-8168, ERC-8340, and Base's announced September Cobalt rollout with broader OP Stack deployment later in 2026.

> [!IMPORTANT]
> EIP-8130 is a Draft proposal. It is not finalized, scheduled for an Ethereum hard fork, or available on Ethereum mainnet. Unless a paragraph is explicitly labeled as analysis, protocol behavior described here summarizes the current draft rather than a deployed system.

## Research Method

Factual claims are checked against the canonical EIP file, PR diffs and review threads, the EthMagicians discussion, and the primary source for each competing proposal. The site distinguishes three kinds of statements:

- **Current draft**: text merged into the canonical proposal.
- **Open proposal**: unmerged PR text that may still change.
- **Analysis**: an inference or comparison made by this site, not a claim from an EIP author.

## Documents

### Spec

| Document | Description |
|---|---|
| [Current Spec Overview](./docs/current-spec.md) | What EIP-8130 can do today - Account Configuration Contract, authenticators, transaction format, nonces, account lock, gas sponsorship |
| [Feedback Evolution](./docs/feedback-evolution.md) | How community feedback shaped the spec across its phased history |
| [Original Spec](./docs/original-spec.md) | The October 2025 submission - original design and what it lacked |
| [Merged Changes](./docs/merged-changes.md) | Every PR (merged, rejected, open) in chronological order with rationale |
| [Original vs Latest](./docs/original-vs-latest.md) | Side-by-side comparison of structural changes and philosophical shifts |

### Topics

| Document | Description |
|---|---|
| [Authenticator Model](./docs/authenticator-model.md) | Declarative validation via authenticator contracts, versus code-execution validation models |
| [Cross-Chain Accounts](./docs/cross-chain-accounts.md) | How config changes replay deterministically across chains via `chain_id 0` |
| [Mempool Safety](./docs/mempool-safety.md) | Why validation never executes wallet code, and what that means for statelessness and async execution |
| [PQ Scheme Agility](./docs/pq-scheme-agility.md) | What canonical-set growth would require, and what the draft leaves unresolved |
| [Developer Tooling](./docs/developer-tooling.md) | Bear and bull cases for wallet/app developer adoption |
| [Competing Standards](./docs/competing-standards.md) | EIP-8141, EIP-8175, EIP-8202, EIP-8223, EIP-8224, Tempo-like - design, tradeoffs, comparative analysis |

### Resources

| Document | Description |
|---|---|
| [FAQ](./docs/faq.md) | Common questions with short answers and cross-references |
| [Glossary](./docs/glossary.md) | Comprehensive glossary of jargon used across the site, grouped by category |
| [Appendix](./docs/appendix.md) | PR timeline, key contributors, external resources |

## Updating

To sync the repo with the latest spec changes, PRs, discussions, and competing standards, paste this prompt into a Claude Code session inside the repo:

```
Run the Update Process in CLAUDE.md.
```

The agent will check master spec, new PRs since the last documented one, EthMagicians and ethresear.ch posts, competing standards activity, then update the relevant docs and refresh sync-snapshot dates per the methodology.

## Website

Browse the research at [eip8130.io](https://eip8130.io).

## License

This project is licensed under the [MIT License](./LICENSE.md).
