<p align="center">
  <img src="docs/assets/header.png" width="280" alt="fe-review-skills" />
</p>

<div align="center">

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Works with](https://img.shields.io/badge/works%20with-Claude%20Code%20·%20Codex%20·%20Gemini%20CLI-orange.svg)](#quick-start)

**N specialized frontend guidelines review the same changes in parallel.**

[Quick Start](#quick-start) · [Lenses](#lenses) · [Why this design](#why-this-design) · [Architecture](#architecture) · [Adding a lens](docs/adding-a-lens.md)

English · [한국어](./README.ko.md)

</div>

A **skill pack** for AI coding agents (Claude Code · Codex · Gemini CLI). It reviews a git diff or changed files from 6 perspectives (perf · code quality · bugs · types · a11y · security). Each perspective is defined as a **lens**. A lens is a single-perspective reviewer with its own ruleset and isolated context, running in parallel. The results merge into one prioritized report.

The default preset follows _well-known, established frontend guidelines_ directly. To add a new lens, just create a folder. The orchestrator auto-discovers installed `lens-*`.

## Key Features

- **Expert lenses** — Vercel React Best Practices · Toss Frontend Fundamentals · Effective TypeScript · WCAG 2.2 · OWASP, etc.
- **Parallel sub-agents** — Each lens runs in an isolated context, so no reasoning contamination, mode collapse, or context contention
- **Smart input routing** — Diff only for line-level rules, full files for structural rules. Cost stays at _"diff × N + α", not "full codebase × N"_
- **Perspective-preserving merge** — When multiple lenses catch the same code, all perspectives are preserved side-by-side in one issue
- **Simple setup** — Start instantly in a fresh repo with one command (Claude Code · Codex · Gemini CLI)
- **Add lenses freely** — Drop in a `skills/lens-<name>/` folder and it joins on the next call without any orchestrator edits
- **Conservative by design** — Skip uncertain patterns deliberately. The judgment: one false positive erodes trust more than one missed issue

## Quick Start

### Install

```bash
# Claude Code (primary — orchestrator + 6 lenses)
npx fe-review-skills install claude-code

# Codex CLI (lenses only, TOML)
npx fe-review-skills install codex-cli

# Gemini CLI (lenses only, markdown)
npx fe-review-skills install gemini-cli
```

Options:

- `--global` — install under `~/<tool-dir>` (use across every project)
- `--dry-run` — preview destination paths without writing

Per-tool guides: [Claude Code](docs/install-claude-code.md) · [Codex](docs/install-codex-cli.md) · [Gemini CLI](docs/install-gemini-cli.md).

### Use

After install, invoke from Claude Code via slash command or natural language:

```
/diff-review
```

Or:

```
review my staged changes
```

With options:

```
review my diff with lang=ko severity_min=high lenses=perf,a11y
```

| Option         | Default       | Values                                                                                                   |
| -------------- | ------------- | -------------------------------------------------------------------------------------------------------- |
| `scope`        | `staged`      | `staged`, `unstaged`, `branch:<name>`, `range:<a>..<b>`                                                  |
| `lang`         | `en`          | `en`, `ko`                                                                                               |
| `lenses`       | all installed | comma list (`perf` → `lens-react-perf`, `quality` → `lens-code-quality`, otherwise the lens-name suffix) |
| `severity_min` | `high`        | `critical`, `high`, `medium`, `low`                                                                      |

Each lens can be invoked standalone:

```
/lens-a11y
```

Or:

```
run only lens-a11y on my unstaged changes
```

## Lenses

> _lens_ = a single-perspective reviewer. The 6 in the table are the default preset; add your own freely. Skill names follow the form `lens-<name>` (e.g. `lens-a11y`).

| Lens           | Source                                                                                                           | Asks                                            | Input            | What it catches                                                                                                               |
| -------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `react-perf`   | [Vercel React Best Practices](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices) | Is it fast?                                     | diff             | Waterfalls, RSC serialization bloat, bundle size, rendering anti-patterns                                                     |
| `code-quality` | [Toss Frontend Fundamentals](https://github.com/toss/frontend-fundamentals)                                      | Is it easy to change?                           | **diff + files** | Readability, predictability, cohesion, coupling                                                                               |
| `bugs`         | React rules-of-hooks + ESLint/TS-ESLint + JS/TS/HTML/CSS correctness rules                                       | Are there bugs?                                 | diff             | Stale closures, missing deps, hook order, race conditions, floating promises, empty catches, == coercion, missing button type |
| `ts`           | Google TypeScript Style Guide + Effective TypeScript                                                             | Is the type system being worked with or around? | diff             | `any`, careless casts, `!` assertions, `@ts-ignore`, weak types, mutable exports                                              |
| `a11y`         | WCAG 2.2 + ARIA APG                                                                                              | Can everyone reach it?                          | diff             | Missing alt, unnamed icon buttons, broken keyboard nav, ARIA misuse, focus indicator removal                                  |
| `security`     | OWASP + frontend-specific                                                                                        | Is data leaking?                                | diff             | XSS, secret leakage, unsafe storage, dangerous JS APIs                                                                        |

## Why this design

### Why isn't one perspective enough?

Each guideline answers a _different question_ — perf asks _is it fast_, a11y asks _can everyone reach it_, security asks _is data leaking_. The perspectives barely overlap, so running just one will entirely miss the issues the others would catch. It's like taking the multiple viewpoints a senior reviewer simultaneously juggles in their head when looking at a PR, and lifting them directly into a tool.

### Why not run them all in one model?

Rather than asking one model to handle multiple guidelines at once, **launching each as an independent sub-agent has 3 structural reasons**:

1. **Preventing reasoning contamination** — Running perf → a11y → security sequentially in the same context lets the earlier lens's findings and severity calls color the later lens's tone. Split into sub-agents, the perf lens does its own job _without knowing_ what a11y caught.
2. **Avoiding mode collapse** — Tell one context "review this PR for perf, quality, a11y, and security" and the model gets pulled into whichever axis is loudest. Physically separating contexts makes that collapse structurally impossible.
3. **Context budget + parallelism** — Each child's full reasoning is spent in the child's context, and only structured finding JSON returns to the parent. The children run wall-clock in parallel, so adding lenses barely adds time.

By analogy: instead of asking one person to "review it from every angle," it's **a panel review where multiple specialist reviewers are placed in isolated rooms with the same change in hand, then gather afterward to reconcile conflicts and overlap**.

### Why doesn't cost scale at N×?

We don't burn tokens in proportion to lens count — each lens has a different _unit of judgment_, so the input differs too. The 5 lenses checking line- or function-level rules (bugs / a11y / security / perf / ts) get **only the diff**, while just one — `lens-code-quality`, which checks structural rules like cohesion and coupling — additionally gets the **full content of changed files**.

**Since 5 of 6 lenses only see the diff, total token usage drops sharply** — the real cost stays at _"diff × N + α", not "full codebase × N"_. And what that cost buys — _consistent coverage from multiple perspectives_ — is something _no single-model pass can structurally achieve, no matter how the prompt is written_. That's this project's bet.

## Architecture

<p align="center">
  <img src="docs/assets/architecture.png" alt="Architecture diagram" />
</p>

## How findings merge

Each lens returns a JSON array of findings:

```json
{
  "file": "src/components/Header.tsx",
  "line_start": 23,
  "line_end": 41,
  "severity": "high",
  "category": "server-fetch-in-effect",
  "title": "useEffect for data fetching",
  "rationale": "Initial data is fetched on the client, causing waterfall and bundle cost.",
  "suggestion": "Move to a Server Component and pass via props"
}
```

Merging groups findings by `file` + overlapping line ranges. When multiple lenses fire on the same code at once, the merged issue preserves all perspectives — for example, a `useEffect` that fetches data can be caught simultaneously in three places: `lens-react-perf` (waterfall), `lens-code-quality` (hidden side effect), and `lens-bugs` (setState race after unmount). The reviewer sees one issue with three perspectives, not three duplicate alerts.

Final severity is the max across perspectives. Sort: severity descending → file path → line number.

## Sample output

A single change can fire multiple lenses on the same lines. Here's a hunk that hits three:

```diff
+ export default function Profile({ userId }) {
+   const [bio, setBio] = useState('');
+
+   useEffect(() => {
+     fetch('/api/user/' + userId, {
+       headers: { 'X-API-Key': 'sk_live_<YOUR_KEY>' },
+     })
+       .then(r => r.json())
+       .then(d => setBio(d.bio));
+   }, []);
+
+   return <div dangerouslySetInnerHTML={{ __html: bio }} />;
+ }
```

`/diff-review` returns a single prioritized report. Findings on overlapping lines merge into one issue with each lens's view preserved:

---

#### Code Review

> **staged** · 1 file · 2 issues · 🔴 1 · 🟠 1

##### 🔴 Critical

###### 1. Client useEffect fetch with hardcoded API key

`src/components/Profile.tsx:4-10` · 3 perspectives

- **security** — Live-key pattern (`sk_live_*`) committed in source. Push protection assumes the key is already revoked.
  → Move to a server-side env var; never ship to the client bundle.
- **react-perf** — Client `useEffect` fetch creates a render → fetch → render waterfall.
  → Hoist to a Server Component and pass `bio` via props.
- **bugs** — `userId` is in the URL but missing from the deps array — stale when the prop changes.
  → Add `userId` to the deps (and address the perf issue first).

##### 🟠 High

###### 2. Network HTML rendered via dangerouslySetInnerHTML

`src/components/Profile.tsx:11`

- **security** — HTML from a network response rendered raw. XSS if `/api/user` is ever influenced by user input.
  → Sanitize server-side or render as text.

---

One pass, three angles on the same line range. The lenses don't see each other — the merge happens after they return.

## Adding a lens

If the default 6 don't cover a perspective you need (i18n, motion, dependency hygiene, design tokens, etc.), just drop in a `skills/lens-<name>/SKILL.md` folder. The orchestrator auto-discovers installed `lens-*`, so no edits to README, `package.json`, or the orchestrator are needed.

Full guide: [docs/adding-a-lens.md](docs/adding-a-lens.md) — frontmatter contract, finding JSON schema, rule-catalog format, boundary discipline (don't overlap with other lenses), and a copy-paste-ready SKILL.md skeleton.

## Inspiration

This project is inspired by the Compounding Engineering pattern Toss uses internally (multiple LLMs reviewing a PR in parallel).

## License

MIT — see [LICENSE](./LICENSE).
