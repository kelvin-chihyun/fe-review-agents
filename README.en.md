<p align="center">
  <img src="docs/assets/header.jpg" width="260" alt="fe-review-agents" />
</p>

<div align="center">

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Works with](https://img.shields.io/badge/works%20with-Claude%20Code-orange.svg)](#quick-start)

**N frontend guidelines review the same change at the same time.**

[Quick Start](#quick-start) · [Reviewers](#reviewers) · [Why this design](#why-this-design) · [Architecture](#architecture) · [Customizing](docs/adding-a-reviewer.md)

[한국어](./README.md) · English

</div>

A **multi-reviewer code-review plugin** for Claude Code. Reviews a git diff or a single file from 6 perspectives. Each **reviewer** is a single-purpose agent, dispatched in parallel with the other reviewers. A synthesizer agent merges the 6 outputs into a single report.

The default preset follows _well-established frontend guidelines_ directly. To add your own reviewer, create an agent file and register it in both slash commands.

## Key Features

- **Expert reviewers** — Vercel React Best Practices · Toss Frontend Fundamentals · Effective TypeScript · WCAG 2.2 · OWASP-style frontend security.
- **Single-message dispatch** — All 6 reviewers fire from one assistant message at once.
- **Isolated context** — Each reviewer runs in its own sub-agent context. No cross-axis reasoning contamination, no mode collapse.
- **Two entry points** — `/fe-review-agents:diff-review [scope]` (git diff), `/fe-review-agents:file-review <path>` (single-file deep dive).
- **Simple setup** — Two lines through Claude Code's marketplace. No extra dependencies.
- **Language option** — `lang=ko` (default) or `lang=en`.
- **Severity filter** — `severity_min=LOW` (default), `MED`, `HIGH`, `CRITICAL`. Findings below the threshold are excluded.

## Quick Start

### Install

In Claude Code:

```
/plugin marketplace add huurray/fe-review-agents
/plugin install fe-review-agents@fe-review-agents
```

Verify with `/plugins`. If slash-command autocomplete doesn't pick up the new commands, run `/reload-plugins` (or restart your Claude Code session). To pull updates: `/plugin marketplace update`.

### Use

Diff-based review (review what changed):

```
/fe-review-agents:diff-review                       # staged (default)
/fe-review-agents:diff-review unstaged
/fe-review-agents:diff-review branch:main
/fe-review-agents:diff-review range:HEAD~3..HEAD
/fe-review-agents:diff-review unstaged lang=en
/fe-review-agents:diff-review staged severity_min=HIGH
```

Single-file review (deep dive):

```
/fe-review-agents:file-review src/components/Header.tsx
/fe-review-agents:file-review src/components/Header.tsx lang=en
/fe-review-agents:file-review src/components/Header.tsx severity_min=HIGH
```

Or in natural language:

```
Review my staged changes.
Audit src/components/Header.tsx.
```

| Option         | Default  | Values                                                  | Applies to    |
| -------------- | -------- | ------------------------------------------------------- | ------------- |
| `scope`        | `staged` | `staged`, `unstaged`, `branch:<name>`, `range:<a>..<b>` | `diff-review` |
| `lang`         | `ko`     | `ko`, `en`                                              | both          |
| `severity_min` | `LOW`    | `LOW`, `MED`, `HIGH`, `CRITICAL`                        | both          |

## Reviewers

> _reviewer_ = a single-purpose agent. The 6 in the table are the default preset; you can add your own. Agent names follow the form `reviewer-<name>`.

| Reviewer     | Source                                                                                                           | Asks                                        | What it catches                                                                                                               |
| ------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `react-perf` | [Vercel React Best Practices](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices) | Is it fast?                                 | Waterfalls, RSC serialization bloat, bundle size, rendering anti-patterns                                                     |
| `quality`    | [Toss Frontend Fundamentals](https://github.com/toss/frontend-fundamentals)                                      | Is it easy to change?                       | Readability, predictability, cohesion, coupling                                                                               |
| `bugs`       | React rules-of-hooks + ESLint/TS-ESLint + JS/TS/HTML/CSS correctness rules                                       | Are there bugs?                             | Stale closures, missing deps, hook order, race conditions, floating promises, empty catches, == coercion, missing button type |
| `ts`         | Google TypeScript Style Guide + Effective TypeScript                                                             | Working with the type system, or around it? | `any`, careless casts, `!` assertions, `@ts-ignore`, weak types, mutable exports                                              |
| `a11y`       | WCAG 2.2 + ARIA APG                                                                                              | Can everyone reach it?                      | Missing alt, unnamed icon buttons, broken keyboard nav, ARIA misuse, focus indicator removal                                  |
| `security`   | Frontend security patterns (XSS, secret leakage, unsafe storage)                                                 | Is data leaking?                            | XSS, secret leakage, unsafe storage, dangerous JS APIs                                                                        |

## Why this design

### Why isn't one perspective enough?

Each guideline answers a _different question_. perf asks _is it fast_, a11y asks _can everyone reach it_, security asks _is data leaking_. The perspectives barely overlap, so running just one entirely misses the issues the others would catch. It's the multiple perspectives a senior reviewer juggles in their head when looking at a PR, lifted directly into a tool.

### Why not have one model do all of it?

There are 2 structural reasons to split the guidelines into independent sub-agents instead of asking one model to handle them all at once:

1. **No reasoning contamination** — In a single context, the framing of a perf finding colors the framing of an a11y finding. Split into sub-agents, each reviewer does its job _without knowing_ what the others caught.
2. **No mode collapse** — A single "review for everything" context tends to gravitate toward whichever axis is loudest in the diff. With contexts physically separated, that gravitation can't happen.

By analogy: instead of asking one person to "review it from every angle," it's **a panel of specialist reviewers in isolated rooms reviewing the same change, gathered afterward to reconcile conflicts and overlap**.

> For a side-by-side snapshot of both approaches against the same code, see [docs/comparison.en.md](docs/comparison.en.md).

### Is the N× worth it?

Honestly, tokens scale roughly N× compared to a single-context pass. What that cost buys is **maximum review quality, higher reliability, and as few missed issues as possible** — multi-perspective coverage with no reasoning contamination and no mode collapse, something a single-context pass structurally cannot produce no matter how the prompt is written. This isn't a tool for teams optimizing for token spend; it's open source built for **teams that put absolute reliability above cost**.

### Single-message dispatch (parallel intent)

The slash command tells the main session to send all 6 `Agent` calls in one assistant message. But if that message is heavy, the model splits it into two or three sends and the calls fall back to serial. So the main session writes the filtered diff to a temp file once, and each reviewer prompt only carries the file path. Each sub-agent then reads the file with `Read` from its own context. **The disk acts as a shared channel, keeping the dispatch message light.** The synthesizer runs once after all 6 reviewers return.

## Architecture

<p align="center">
  <img src="docs/assets/architecture-en.png" width="640" alt="Architecture diagram" />
</p>

## Sample output

A single change can fire multiple reviewers on the same line.

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

The single prioritized report `/fe-review-agents:diff-review` returns:

---

#### 🔍 Code Review: git diff (scope: staged)

##### At a glance

- **Total issues**: 4
- 🔴 CRITICAL: 2 | 🟠 HIGH: 2 | 🟡 MED: 0 | 🟢 LOW: 0

##### Priority issues (by severity)

###### 🔴 CRITICAL

- **[security/hardcoded-secret]** Line 6: API key (`sk_live_*`) committed in source — Move to a server-side env var; never ship to the client bundle.
- **[security/dangerously-set-inner-html]** Line 11: HTML from a network response rendered raw — Sanitize server-side or render as text.

###### 🟠 HIGH

- **[perf/server-fetch-in-effect]** Line 4: useEffect for initial data fetch — Move to a Server Component, pass via props.
- **[bugs/effect-missing-dep]** Line 4: useEffect references `userId` but the deps array is `[]` — Add `userId` to deps (after addressing the perf issue first).

---

One pass, three reviewers firing on the same line range. The reviewers don't see each other's results; the merge happens after they all return.

## Adding a reviewer

If the default 6 don't cover a perspective you need (i18n, motion, dependency hygiene, design tokens, etc.), drop in `agents/reviewer-<name>.md` and register it in both slash commands' dispatch lists and synthesizer prompts.

Full guide: [docs/adding-a-reviewer.md](docs/adding-a-reviewer.md)

## Inspiration

This project draws inspiration from the Compounding Engineering pattern Toss uses internally (multiple LLMs reviewing a PR in parallel).

## License

MIT — see [LICENSE](./LICENSE).
