# EIP-8130: Account Configuration

Comprehensive analysis of [EIP-8130](https://eips.ethereum.org/EIPS/eip-8130) (Account Abstraction by Account Configuration) - tracking its origin, evolution through community feedback, competing proposals, and open concerns.

Last updated: July 15, 2026. Tracks EIP-8130 through PR #11918, with PR #11919 open.

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
| [PQ Scheme Agility](./docs/pq-scheme-agility.md) | How new signature schemes join the canonical authenticator set without a protocol upgrade |
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
