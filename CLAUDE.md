# EIP-8130 Research - Project Instructions

This repo tracks the evolution of EIP-8130 (Account Abstraction by Account Configuration). It is a VitePress documentation site with research documents, a landing page, and supporting infrastructure. These instructions ensure any contributor (human or agent) can update and maintain the repo consistently.

This site is the mirror image of a sibling repo, `eip-8141-website`, which tracks EIP-8141 (Frame Transaction) as its home EIP. Here, EIP-8130 is the featured proposal and EIP-8141 is one of the alternatives. When in doubt about a methodology question this file doesn't cover, the sibling repo's `CLAUDE.md` uses the same conventions and can be consulted, but always retarget "the home EIP" to EIP-8130 when doing so.

---

## Repository Structure

```
├── CLAUDE.md                          # This file - project instructions
├── README.md                          # GitHub landing page with document index
├── package.json                       # VitePress dev dependency
├── vercel.json                        # .html redirects for URL stability
├── docs/
│   ├── index.md                       # VitePress home page (hero, audience routes, examples)
│   ├── current-spec.md                # Current spec overview (Account Configuration, authenticators, tx format, mempool)
│   ├── feedback-evolution.md          # Community feedback organized by chronological phase
│   ├── original-spec.md               # Original Oct 2025 submission and what it lacked
│   ├── merged-changes.md              # Every PR (merged, closed, open) with rationale
│   ├── original-vs-latest.md          # Side-by-side diff of structural changes
│   ├── authenticator-model.md         # Declarative authenticator contracts vs code-execution validation
│   ├── cross-chain-accounts.md        # chain_id 0 config replay and multi-chain account portability
│   ├── mempool-safety.md              # No-wallet-code-execution validation, statelessness, async compatibility
│   ├── pq-scheme-agility.md           # Canonical-authenticator-set scheme adoption vs protocol-level PQ approaches
│   ├── developer-tooling.md           # Bear/bull cases for wallet/app dev adoption
│   ├── competing-standards.md         # Comparative analysis across all alternative proposals
│   ├── eip-8141.md                    # Alternative: Frame Transaction (lightclient et al.) - EIP-8130's most direct competitor
│   ├── eip-8175.md                    # Alternative: Composable Transaction (rakita)
│   ├── eip-8202.md                    # Alternative: Scheme-Agile Transactions (Giulio2002)
│   ├── eip-8223.md                    # Complementary: Contract Payer Transaction (static sponsorship)
│   ├── eip-8224.md                    # Complementary: Counterfactual Transaction (shielded gas funding)
│   ├── eip-xxxx.md                    # Alternative: Tempo-like Transactions (gakonst, pre-draft gist)
│   ├── faq.md                         # Indexed Q&A (section.question format, e.g. 2.3)
│   ├── glossary.md                    # Comprehensive glossary of jargon used across the site, grouped by category
│   ├── appendix.md                    # Sources, PR timeline, contributors, external resources, competing standards
│   └── .vitepress/
│       ├── config.ts                  # Nav, sidebar, social links
│       └── theme/
│           ├── index.ts               # Theme entry, imports custom.css
│           ├── Layout.vue              # Wraps default layout, adds Footer
│           ├── Footer.vue             # 4-column footer (site title, Spec, Topics, Resources)
│           └── custom.css             # Red brand palette + global table styles
```

---

## Document Ordering and Categories

- Docs use slug filenames without numeric prefixes (e.g. `current-spec.md`)
- Order is defined manually in `config.ts` (nav + sidebar), `Footer.vue`, and `README.md`, not by filename
- Docs are grouped into four categories. The same categories apply across the header nav dropdowns, sidebar groups, footer columns, and README tables:

| Category | Purpose | Current docs |
|---|---|---|
| **Spec** | How EIP-8130 works and how it got here | Current Spec, Feedback Evolution, Original Spec, Merged Changes, Original vs Latest |
| **Topics** | Analytical deep-dives beyond the spec itself | Authenticator Model, Cross-Chain Accounts, Mempool Safety, PQ Scheme Agility, Developer Tooling, Competing Standards |
| **Alternatives** | Per-proposal pages for each alternative/complementary EIP | EIP-8141, EIP-8175, EIP-8202, EIP-8223, EIP-8224, EIP-XXXX (Tempo-like) |
| **Resources** | Reference material, index, Q&A | FAQ, Glossary, Appendix |

- `appendix.md` is always **last** in the Resources group
- The FAQ (`faq.md`) uses indexed questions: sections are numbered, questions are `section.question` (e.g., 1.1, 2.3, 8.5)
- When adding a new document, decide which category it belongs to, then create `docs/<slug>.md` and update: `config.ts` (nav + sidebar), `Footer.vue`, and `README.md` in the matching category
- **Alternatives never appear in the top nav header, and no longer have a footer column.** The header is reserved for Home, Spec, Topics, FAQ. Alternatives live in the sidebar only (as a fourth group). Reason: the top nav is a reader's primary path through the site, and leading with Alternatives (including EIP-8141) would foreground competing proposals before EIP-8130 itself; the footer was likewise trimmed to keep the same emphasis. When adding or renaming an alternative proposal page, update `config.ts` sidebar only, do **not** add it to `nav` or `Footer.vue`.

### URL stability and Vercel redirects

`vercel.json` at the repo root maintains `.html` redirects for every doc, since `cleanUrls: true` is set in `config.ts` and canonical URLs have no `.html`. This repo has no rename history yet (all docs have used their current slugs since inception), so redirects are the simple one-line form: `/<slug>.html` → `/<slug>`. If a doc is ever renamed later, follow the pattern in the sibling `eip-8141-website` repo: keep the old slug's redirects (extensionless and `.html`) alongside the new slug's, never remove a redirect once added, since external backlinks must keep working.

---

## Website Configuration

### VitePress (docs/.vitepress/)

- **config.ts**: Defines nav header and sidebar. Nav has: Home, Spec (dropdown), Topics (dropdown), FAQ. **Alternatives is intentionally not in the nav** (see the Alternatives-never-in-nav rule above). Sidebar has four groups (Spec, Topics, Alternatives, Resources) with Appendix last in Resources. Keep these in sync when adding/removing docs.
- **Footer.vue**: 4-column grid (site title, Spec, Topics, Resources with external links). **No Alternatives column** — Alternatives pages are sidebar-only. Does NOT include FAQ or Appendix as standalone footer links beyond the Resources column.
- **Layout.vue**: Wraps VitePress default layout, injects Footer via `#layout-bottom` slot.
- **custom.css**: Defines the red brand palette (`--vp-c-brand-1/2/3`, `--vp-c-brand-soft`, button variables, hero gradient) for both light and dark mode, plus the global `white-space: nowrap` rule on first-column table cells. Do not remove either block. **This is the one deliberate visual difference from the sibling EIP-8141 site**, which uses the VitePress default purple; keep this site red.
- **theme/index.ts**: Imports DefaultTheme, Layout, and custom.css. Keep imports here when adding new CSS.

### Landing Page (docs/index.md)

- Uses VitePress `layout: home` with hero, actions, and features in YAML frontmatter
- Hero buttons: "Read the Overview" (brand, links `/current-spec`) and "Try the Demo" (alt, links the live demo at `https://vibes.base.org/`). The demo is also linked in the header nav ("Demo") and the footer Resources column ("Live Demo"), mirroring the sibling EIP-8141 site
- Below frontmatter: markdown sections routing readers by intent, then a mechanism walkthrough (Account Configuration Contract, authenticator interface, transaction format, gas sponsorship)
- Feature card `details` strings in the YAML frontmatter must be 100 characters or fewer to keep the grid visually balanced

### Formatting Rules

- Tables: first column never wraps (enforced by CSS). Keep first-column text concise.
- Links between docs: use root-relative paths (`/current-spec`, not `./current-spec.md`)
- Links to external sites: use full URLs with `target="_blank"` in Vue templates
- No emojis in any file
- **Em dashes (`—`) are restricted to four use cases only**. Any other use is a violation and must be rewritten. The four allowed contexts:
  1. **Titles** with a subtitle or descriptor, including markdown link titles: `## Scope Grants Redesign — July 13, 2026`, `[Frame vs Configuration — Two clashing philosophies of native AA](...)`.
  2. **Dates** attached to a topic in a header or attribution line: `*chunter-cb — PR #11918, Jul 13*`.
  3. **Number ranges**: `posts #12-20` (note: number ranges use a hyphen `-`, not an em dash, but a date range like `(Mar 10 – Mar 25)` uses an en dash `–`; do not use em dashes for ranges at all).
  4. **Lists and table cells** to separate a topic from its description: `- EIP-8141 — Frame Transaction` or `| Jul 13 | #11918 — Scope grants redesign |`. This includes "Read Next" list items and bold-labeled definition paragraphs that function as a definition list (`**actorId** — a 32-byte identifier an authenticator derives from public key material. ...`). Do **not** chain multiple em dashes on one line as generic field separators (e.g. `**PR #X** — author — stats — status`); pick one bold-label-then-description em dash and separate any further fields with commas or parentheses instead.
- **Forbidden uses** (these are the common mistakes to avoid):
  - As parenthetical brackets in a sentence (`Stages 2–7 are future research — separate EIPs, separate forks — and therefore...`). Rewrite with parentheses, commas, or two sentences.
  - As a colon substitute in a sentence (`Not for AA transactions — they enter the mempool...`). Rewrite with a period, a semicolon, or a colon.
  - Inside FAQ answers, topic-doc prose, narrative phase summaries, or "Why this mattered" lines. These are all prose and must use commas, periods, semicolons, colons, or parentheses.
- **Test before using**: ask "is this a title, a date attached to a label, a range, or a list/table cell?" If no, do not use an em dash. When in doubt, rewrite without one.
- Keep answers in FAQ to 1-2 lines, always with question and answer on separate lines

---

## Research Data Sources

| Input | Source | Purpose |
|---|---|---|
| Latest spec | `https://github.com/ethereum/EIPs/blob/master/EIPS/eip-8130.md` | Ground truth for current state |
| Closed/merged PRs | `gh pr list --repo ethereum/EIPs --search "8130" --state all` | Chronological record of spec changes; cross-check against `gh api repos/ethereum/EIPs/commits --paginate -f path=EIPS/eip-8130.md` for anything the text search misses |
| Open PRs | `gh pr list --repo ethereum/EIPs --search "8130" --state open` | Pending proposals and context |
| ERC-layer proposals | `gh pr list --repo ethereum/ERCs --search "8130" --state all` | Application-layer standards that build on or reference EIP-8130. The `ethereum/ERCs` repo is separate from `ethereum/EIPs` and is easy to miss (this bit the sibling EIP-8141 site's early syncs, which found ERC-8286 only after a manual nudge; check every sync even if a search has come up empty before) |
| PR comments | `gh pr view --repo ethereum/EIPs <number> --comments` (or `--repo ethereum/ERCs`) | Design rationale not in the spec |
| EthMagicians thread | `https://ethereum-magicians.org/t/eip-8130-account-abstraction-by-account-configurations/25952` | Community feedback and debates. Note: fetching a post-number URL past the thread's real end can silently return a different, earlier post instead of a 404 (observed WebFetch behavior on this Discourse instance); verify a "new" post by checking its date is chronologically consistent with its neighbors, not just that a response came back |
| ethresear.ch | Search `ethresear.ch` for "8130" or "account configuration" each sync | No confirmed thread as of the initial build of this site; check every sync since EIP-8141's sibling site has active ethresear.ch threads and 8130 may grow one |
| Competing standards | See `eip-8141.md`, `eip-8175.md`, `eip-8202.md`, `eip-8223.md`, `eip-8224.md`, `eip-xxxx.md` for canonical sources per proposal, and the sibling `eip-8141-website` repo for a second, independently-maintained source of truth on EIP-8141 specifically | Cross-check EIP-8141 facts against the sibling site rather than re-deriving them from scratch when possible |

**No compose-by-requires sibling EIPs.** Unlike EIP-8141, which grew a family of sibling EIPs that `requires: 8141` (EIP-8250, EIP-8266, EIP-8272, EIP-8288), EIP-8130 has evolved entirely within its own spec file: every feature (scope grants, account lock, nonce system, cross-chain replay) has landed as a direct PR to `eip-8130.md`. Don't go looking for an 8130-requires sibling-EIP ecosystem; the recurring pattern to watch for instead is **terminology churn** (the spec has been through complete renames: keys → owners → actors, `IAuthVerifier` → `IVerifier` → `IAuthenticator`) and **structural rewrites of existing sections** (e.g. the scope/grant model has been redesigned at least twice). Track these the same way `merged-changes.md` and `feedback-evolution.md` track any other significant PR.

---

## Update Process

When updating the repo to capture new developments, follow this checklist in order:

### 1. Gather New Data

- **Fetch latest spec** from `master` branch, compare against `current-spec.md`
- **Search for new PRs** since the last documented PR (check `appendix.md` for the most recent), using both the `gh pr list --search "8130"` text search and the `gh api .../commits?path=EIPS/eip-8130.md` commit-history cross-check
- **Search the `ethereum/ERCs` repo too**, not just `ethereum/EIPs`, every sync regardless of past results
- **Read all comments** on new and updated PRs, PR comments often contain critical design rationale (chunter-cb's review threads in particular; several rejected PRs in `merged-changes.md` were resolved entirely through comment discussion, not a follow-up diff)
- **Read new EthMagicians posts** beyond the last documented post number (check `appendix.md`), verifying real posts per the WebFetch caveat in Research Data Sources above
- **Check competing proposals** for new PRs or discussion threads (EIP-8141, EIP-8175, EIP-8202, EIP-8223, EIP-8224). The sibling `eip-8141-website` repo is a fast way to check EIP-8141 activity specifically; its own sync memory tracks EIP-8141's PR/thread baselines independently
- **Check ethresear.ch** for new posts in relevant threads
- **Classify every new merged PR by significance.** A PR is **significant** if any of the following holds: merged diff >100 lines, touches more than one spec area (Account Configuration / scope-grant model / authenticator interface / nonce system / account lock / gas sponsorship / tx format / RPC surface), renames a core term, changes a numeric constant or type byte, or triggers a substantive review debate. Significant PRs require the mandatory fan-out in step 2; do not just append a one-line entry.

### 2. Update Documents

Each document has a specific scope. Update only the relevant ones:

| Document | When to update |
|---|---|
| `current-spec.md` | Any merged PR that changes spec text or constants. Pending and open proposals are tracked in `merged-changes.md` under `## Active/Open PRs`, not here. |
| `feedback-evolution.md` | New EthMagicians posts, new ethresear.ch posts, AND every significant merged PR (see criteria in step 1), add a named entry in the current phase capturing the rationale and review debate, not just the diff. Audit phase length and thematic coherence per §2b; split, rename, or renumber phases when they drift. |
| `original-spec.md` | Rarely, only if new context about the original submission surfaces |
| `merged-changes.md` | Every new PR (merged, closed, opened) and every status change on existing open PRs. Significant merged PRs get their own dated section with per-area bullets and a review-discussion paragraph, not a one-liner. Document structure is enforced per §2c: chronological merged sections first, then `## Active/Open PRs`, then `## Rejected/Closed PRs`. The two status buckets always sit at the end. |
| `original-vs-latest.md` | Any merged PR that changes structural behavior, constants, scope/grant model, or account/nonce/lock mechanics |
| `competing-standards.md` | New competing EIPs, new PRs on existing competitors, new comparison threads |
| `mempool-safety.md` | New statelessness/witness-cost developments, canonical-authenticator-set coordination developments, async-execution compatibility updates |
| `developer-tooling.md` | New bear/bull arguments emerge from wallet/app developers, or canonical-authenticator-set adoption signals |
| `authenticator-model.md` | Authenticator interface changes, canonical-set additions, ERC-1271/operational-signing changes |
| `cross-chain-accounts.md` | Cross-chain replay mechanism changes, new multi-chain wallet adoption signals |
| `pq-scheme-agility.md` | New PQ-capable authenticator proposals, canonical-set PQ additions, comparisons to sibling-EIP-based PQ approaches on competing sites |
| `faq.md` | New questions arise from community, or answers change due to spec updates. Also add or refresh a `section.question` Q&A whenever a Spec/Topics/Alternatives change alters a reader-facing answer; see §2e. |
| `glossary.md` | Any change that introduces a new term, grant/scope bit, system contract, transaction field, constant, sibling/related EIP, ERC, or named concept, or renames/changes an existing one. The glossary indexes jargon from every other doc; audit it whenever Spec/Topics/Alternatives change (see §2e). |
| `appendix.md` | Always, update PR timeline (Merged / Open / Related / Closed), contributor list, external resources, competing standards. Structure and link-formatting rules in §2d. Evergreen: no sync-snapshot counters in appendix link text. |

### 2a. Mandatory Fan-Out for Significant Merged PRs

When a PR is classified as significant (step 1 criteria), a partial update is a bug. Work through this fan-out in order for each such PR before moving on:

1. **`merged-changes.md`** — add a dedicated section titled by theme and date (e.g. `## Scope Grants Redesign — July 13, 2026`). Include: author + merge date, diff stats, why/what/why-it-matters bullets, a **Key review discussion** note quoting or naming the reviewers and their objections/approvals if any exist, and a one-line significance note comparing it to past structural changes.
2. **`feedback-evolution.md`** — add a named entry inside the current phase's subsection for the PR. Cite `PR #<num>, opened <date>, merged <date>`. Summarize the rationale and the review debate, not the diff.
3. **`current-spec.md`** — update the spec body to match the new behavior. (Pending-proposals tracking lives in `merged-changes.md` under `## Active/Open PRs`.)
4. **`original-vs-latest.md`** — refresh the Latest column for every structural change the PR introduced.
5. **Topic docs** — for every area the PR touched, update the matching topic doc: authenticator interface / canonical set → `authenticator-model.md`; cross-chain replay → `cross-chain-accounts.md`; mempool/statelessness/async-execution → `mempool-safety.md`; PQ-relevant authenticator or scheme changes → `pq-scheme-agility.md`; wallet/app surface changes → `developer-tooling.md`; interactions with competing EIPs → `competing-standards.md` and the relevant per-EIP page.
6. **`faq.md`** — add or update any question whose answer the PR changed.
7. **`appendix.md`** — always add the PR to the timeline with correct merge date and author.
8. **`README.md`** — update the "Last updated" date and any coverage counters (PR count).

Skipping a step because "it's probably still accurate" is the failure mode this fan-out exists to prevent. If a step truly doesn't apply, confirm by reading the target doc before moving on.

### 2b. Managing Phases in `feedback-evolution.md`

Same methodology as the sibling EIP-8141 site: `feedback-evolution.md` is organized into chronological + thematic phases, each with a date range and a named theme (the character of what happened in that window, not a PR number or author).

**Hard 600-word cap per phase, enforced by tightening, not splitting.** The first remedy for an over-cap phase is always tightening the prose, never splitting. This doc is "why it moved," not "what moved", mechanics (diffs, constants, field renames, struct layouts) live in `merged-changes.md`; a phase entry states the rationale and the review debate, then cites the PR/post.

**When to split a phase (last resort).** Only split at a genuine chronological pivot that changes the character of the thread (a major rename, a structural rewrite, a load-bearing external analysis) AND tightening to 600 words would force unrelated themes into one container.

**Sub-section order within a phase.** Sub-sections (`### ` headings) inside a phase must be in chronological order by primary event date, earliest first.

**How to run the word-count check.** From the repo root:

```
awk '/^## Phase/ { if (name != "") print name ": " wc; name=$0; wc=0; next } /^## / { if (name != "") print name ": " wc; name=""; wc=0; next } name != "" { wc += NF } END { if (name != "") print name ": " wc }' docs/feedback-evolution.md
```

Any phase over 600 words must be tightened back under the cap before committing (split only per the last-resort rule above).

### 2c. Structure of `merged-changes.md`

`merged-changes.md` is primarily **chronological** for merged PRs, but the two status buckets are always pinned to the end. Required top-level structure:

1. **Chronological merged sections**, in ascending date order. Each section is titled `## <Theme> — <Month> <Day>, <Year>` and groups one or more related merges. New merges go into a new dated section, or into the most-recent section if they extend its theme.
2. **`## Active/Open PRs`** — a single section listing every currently-open PR with author, rationale, proposed change, and status line. The heading itself carries no date; immediately under the heading, put a one-line italic sync-snapshot note (e.g. `*As of July 15, 2026.*`). Refresh that note each sync per §4.
3. **`## Rejected/Closed PRs`** — a single section, always last. Lists closed-without-merge PRs with the rejection reason (quoted from the reviewer when possible).

**Placement rule, stated as a hard invariant**: the last two `## `-level sections in the file must be `## Active/Open PRs` followed by `## Rejected/Closed PRs`, in that order. No merged chronological section ever appears after them.

**Per-PR line format**: when listing a PR inline (not as its own `### ` subsection), use at most one em dash, in the form `**PR [#N](url)** — author, stats, classification-or-summary`, with every field after the first em dash separated by commas, not chained em dashes.

**When a PR changes status this sync**:
- Newly merged → move its entry from `## Active/Open PRs` into a chronological section (new or existing) at the correct date position. Do not leave a stub in the Open list.
- Newly opened → add to `## Active/Open PRs`.
- Newly closed without merge → move from `## Active/Open PRs` to `## Rejected/Closed PRs` with a one-line rejection reason.

**Verification**: the `## `-level headings in order must read as *N chronological sections (ascending date)* + `## Active/Open PRs` + `## Rejected/Closed PRs`. Grep `^## ` to confirm before committing.

### 2d. Structure of `appendix.md`

`appendix.md` is the index, not a place to restate content. Keep it terse and non-duplicative.

**Section set and order** (all present, in this order):
1. `## Sources` — authoritative upstream sources (spec, PR list, discussion thread).
2. `## Complete PR Timeline` — four subsections: `### Merged`, `### Open`, `### Related`, `### Closed (not merged)`.
3. `## Key Contributors` — table.
4. `## External Resources` — link list.
5. `## Competing Standards` — link list.

Do not add ad-hoc sections. If something looks like it wants a new section, ask whether it actually belongs in a topic doc or an existing list.

**External Resources formatting rule**: every entry is **bare-title-link only**, in the form `- [Exact Title](URL)`. No descriptions, no author/date suffixes after the link, no parenthetical counters in the link text.

**Competing Standards formatting rule**: one line per alternative proposal, linking the canonical source. For EIP-numbered proposals, link the GitHub EIP file and append the Magicians thread if one exists: `- [EIP-NNNN: Title](github-url) — [Magicians thread](forum-url)`. For non-EIP proposals (gists, HackMD drafts), link the authoritative source directly and identify the author in the title. Every alternative mentioned anywhere in `competing-standards.md` or the per-EIP pages must have a corresponding link here.

**Competing Standards is proposals, not commentary.** Comparison threads, analyses, and "X vs Y" posts go in `## External Resources`, never in `## Competing Standards`.

**De-duplication rule**: a URL appears in at most one section of `appendix.md`.

**Post-count and sync-snapshot tracking**: do not embed sync-snapshot counters inside appendix link text. The global sync date lives in memory and in `README.md`; `appendix.md` is evergreen.

### 2e. Keeping the reference docs (`appendix.md`, `glossary.md`, `faq.md`) in sync

The Appendix, Glossary, and FAQ are **downstream of every other section**. They do not generate new facts; they index what the Spec, Topics, and Alternatives docs already say. Treat updating them as a required closing step of every sync, not an optional one.

After editing any Spec, Topics, or Alternatives doc, propagate as follows:

- **Appendix** — for every PR, contributor, external link, or competing/complementary proposal newly referenced in another doc, confirm it has a corresponding entry.
- **Glossary** — for every new term a change introduces (grant/scope bit, constant, system contract, transaction field, sibling/related EIP, ERC, or named concept), add a glossary entry in the correct category, alphabetical within the category. When a merged PR changes a constant or renames a term, update the existing entry rather than leaving it stale.
- **FAQ** — when a change answers, or changes the answer to, a question a reader would plausibly ask, add or update a `section.question`-indexed Q&A.

The significant-PR fan-out (§2a) routes structural merges into the relevant Spec and Topics docs; this step ensures the same change also lands in the three indexes.

### 3. Update Infrastructure

- **README.md**: Update "Last updated" date and coverage numbers. Update document table if docs added.
- **config.ts**: Update nav/sidebar if docs added or renamed
- **Footer.vue**: Update if docs added to Spec or Topics column, or new external links added to Resources

### 4. Verify Consistency

After updates, check:
- All internal links between docs are valid (root-relative paths match filenames)
- PR numbers, post numbers, and dates are consistent across documents
- The appendix PR timeline matches what's described in `merged-changes.md`
- **Significant-PR fan-out audit.** For every PR classified as significant this sync, grep the PR number across `docs/` and confirm it appears in at least: `merged-changes.md`, `feedback-evolution.md`, `current-spec.md`, `original-vs-latest.md`, and `appendix.md`. If a PR is missing from any of these, the sync is incomplete: do not commit.
- **Phase balance audit.** Run the per-phase word-count check from §2b on `feedback-evolution.md`. Every phase must be ≤600 words.
- **Sub-section chronology audit.** For every phase, confirm each sub-section's primary event date is greater than or equal to the previous.
- **`merged-changes.md` structure audit.** Grep `^## ` on the file. The last two headings must be `## Active/Open PRs` (no date in the title; italic `*As of <date>.*` sits under it) and `## Rejected/Closed PRs`, in that order.
- **`appendix.md` structure audit.** Confirm per §2d: fixed section order, no ad-hoc sections, bare-title External Resources links, every competing proposal linked under Competing Standards.
- **Em-dash audit.** Grep `—` across `docs/` and classify every hit against the four allowed contexts. Watch specifically for chained multi-em-dash lines (e.g. `**PR #X** — author — stats — status`), which read as generic field separators and are a violation even though each individual dash could be locally rationalized; collapse to one em dash plus commas.
- **Topic-doc TL;DR audit.** For every file in the Topics category, grep `^## ` and confirm the first match is `## TL;DR`.
- **Reference-doc completeness audit (§2e).** Confirm the three index docs absorbed this sync's changes.

**Distinguish event-timestamp dates from sync-snapshot dates:**

| Date type | Examples | Action |
|---|---|---|
| **Event timestamp** | "PR #11918 merged Jul 13", "post #22 (Jul 8)" | Never change. These are real events. |
| **Sync-snapshot date** | "Latest (Jul 15)" header in `original-vs-latest.md`, the italic `*As of Jul 15.*` line under `## Active/Open PRs` in `merged-changes.md`, phase-range headers in `feedback-evolution.md` | Refresh on every sync to reflect what is actually current as of the new sync date. |

A common stale-date trap: phase-range headers in `feedback-evolution.md` get extended when the latest sync adds entries to that phase, but the header end-date isn't updated.

---

## Writing Principles

- **Traceability**: Every claim links to a specific PR number, EthMagicians post number, or commit
- **Direct quotes**: Use author/reviewer quotes to capture rationale, paraphrasing loses nuance
- **Rejected PRs matter**: Closed PRs reveal the design space the authors explored and chose against
- **Comments over descriptions**: PR review threads often contain more insight than the PR description
- **Chronological + thematic**: `merged-changes.md` is chronological; `feedback-evolution.md` groups by thematic phase
- **What's absent**: Document what the spec does NOT have, gaps explain future direction
- **FAQ brevity**: Answers are 1-2 lines max. Link to docs or external sources for detail.

### Topic-doc structure

Topic docs (the Topics category) have a **2,500-word maximum**. If a topic doc exceeds this limit, tighten the prose before adding new content.

Topic docs follow a fixed shape, enforced in this order:

1. **`## TL;DR` is always the first `##`-level section, with no other section above it.** This is a hard invariant: the only allowed content between the `#` page title and `## TL;DR` is the initial `---` horizontal rule.
2. **Numbered or named sections** in the middle. These carry the analysis, tables, and position statements.
3. **Summary at the end** that mirrors the TL;DR with any additional nuance.

**Verification**: for every file in the Topics category, the first `##`-level heading must be `## TL;DR`. Grep `^## ` on the file and confirm the first match is `## TL;DR`.

### Source attribution

Attribution rules vary by document, set deliberately:

| Document | Attribution policy |
|---|---|
| `mempool-safety.md` | **Never attribute** to named individuals. Present tradeoffs, not people. |
| `developer-tooling.md` | **Always attribute** Bear and Bull positions via a `[source](URL)` link next to the position header when a real external source exists; mark clearly as editorial analysis when it does not, never fabricate an attributed quote. |
| All other docs | Cite PR numbers, post numbers, commits per the **Traceability** principle. |

---

## Style Rules

- Be pragmatic and direct. No filler, no trailing summaries.
- Don't add features, refactor code, or clean up code that wasn't part of the ask
- No docstrings, comments, or type annotations on code you didn't touch
- Keep commit messages concise (1-2 lines)
- Don't create new files unless explicitly needed, prefer editing existing ones
- **Never invent PR numbers, post numbers, dates, diff stats, or author handles.** If a sync can't confirm a fact, write around it qualitatively rather than fabricating a specific.

---

## Common Tasks

### Adding a new document

1. Decide the category (Spec, Topics, or Resources)
2. Create `docs/<slug>.md`
3. Add to `config.ts` nav (inside the matching dropdown, Spec or Topics) and sidebar (inside the matching group)
4. Add to `Footer.vue` under the matching column (Spec or Topics); Resources are sidebar-only
5. Add to `README.md` under the matching category table
6. Update this file's repository structure section

### Adding a new competing standard

1. Create a dedicated per-EIP page at `docs/eip-<N>.md` (or `docs/eip-xxxx.md` for pre-draft/gist proposals without an EIP number). Open with a metadata block, then the three-move pattern: **At a Glance** (what it is, problem it solves, why an EIP-8130 reader should care), then Overview, Core Design, Mempool Strategy, Key Differences from EIP-8130, Activity, Strengths, Weaknesses. Close with a pointer back to `competing-standards.md`.
2. Update `config.ts` sidebar under the Alternatives group. Do **not** add Alternatives entries to `config.ts` nav or `Footer.vue`.
3. Update the comparative analysis in `competing-standards.md` (spectrum framing, PQ table, Mempool table, Adoption table) to include the new proposal. Do **not** paste the full per-EIP content into `competing-standards.md`; that doc is the comparative hub, the per-EIP page is the canonical source.
4. Add a link in `appendix.md` under `## Competing Standards` following the link-formatting rule in §2d.
5. Add the proposal's author to `## Key Contributors` in `appendix.md` if they are not already listed.
6. If the new proposal reframes or resolves concerns on other topic docs (`mempool-safety.md`, `developer-tooling.md`), add a brief cross-reference.
7. Update `README.md` Alternatives table if the README mirrors sidebar structure.

### Updating PR status

1. Update `merged-changes.md`, move PR between Open/Merged/Closed sections as needed, add review comment summaries
2. Update `appendix.md` PR timeline table
3. If a merged PR changes the spec: update `current-spec.md` and `original-vs-latest.md`
