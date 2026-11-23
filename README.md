# EIP-8130 + EIP-8430: Keystore Accounts and the AA Transaction Type

Source-driven analysis of two sibling native account-abstraction standards: [EIP-8130](https://eips.ethereum.org/EIPS/eip-8130) (Keystore Accounts, originally "Account Abstraction by Account Configuration") and [EIP-8430](https://github.com/ethereum/EIPs/pull/12385) (AA Transaction Type), which was split out of EIP-8130 in October 2026. The site explains each standard, how they complement each other, and how each works on its own, along with their review history, alternatives, and unresolved questions.

Last updated: November 23, 2026. Tracks 49 merged EIP-8130 PRs through #12386, EIP-8430 from its merge (PR #12385, November 23), eight open EIP-8130 PRs and four extension drafts, and the forums through EIP-8130 post #35 and EIP-8430 post #6. Also tracks ERC-8168, ERC-8340, ERC-8403, Base's client (which removed the Keystore on November 17) and Everest planning, and EIP-8141 through 81 canonical-file commits and the Hegotá scope debate.

> [!IMPORTANT]
> EIP-8130 and EIP-8430 are Draft proposals. Neither is finalized, scheduled for an Ethereum hard fork, or available on Ethereum mainnet, and both are merged Drafts that can still change. Unless a paragraph is explicitly labeled as analysis, protocol behavior described here summarizes the current draft rather than a deployed system.

## Research Method

Factual claims are checked against the canonical EIP file, PR diffs and review threads, the EthMagicians discussion, and the primary source for each competing proposal. The site distinguishes three kinds of statements:

- **Current draft**: text merged into the canonical proposal.
- **Open proposal**: unmerged PR text that may still change.
- **Analysis**: an inference or comparison made by this site, not a claim from an EIP author.

## Documents

### Spec

| Document | Description |
|---|---|
| [Overview: 8130 + 8430](./docs/overview.md) | How the two sibling standards fit together, what each does alone, and how the Keystore fills EIP-8430's extension points |
| [EIP-8130 Spec](./docs/current-spec.md) | The Keystore - actors, scopes, authenticators, signed changes, account lock, and its integration with EIP-8430 |
| [EIP-8430 Spec](./docs/eip-8430.md) | The AA Transaction Type - wire format, payer modes, nonces, phased calls with value, delegation, gas |
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
