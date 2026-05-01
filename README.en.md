<p align="center">
  <img src="docs/assets/header.png" width="512" alt="fe-review-skills" />
</p>

<div align="center">

# fe-review-skills

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![agentskills.io](https://img.shields.io/badge/format-agentskills.io-purple.svg)](https://agentskills.io)
[![Works with](https://img.shields.io/badge/works%20with-Claude%20Code%20·%20Codex%20·%20Gemini%20CLI-orange.svg)](#quick-start)

**Six specialist lenses review your PR in parallel and merge into one prioritized report.**

[Quick Start](#quick-start) · [Lenses](#lenses) · [Architecture](#architecture)

🇰🇷 [한국어](./README.md) · 🇺🇸 English

</div>

---

fe-review-skills is an [agentskills.io](https://agentskills.io) skill pack that reviews a git diff through six concerns (perf · code quality · bugs · types · a11y · security) _simultaneously_. Each concern is a **lens** — an isolated sub-agent focused on a single perspective — and the six run in parallel, then merge into one prioritized report. Rules are taken straight from established frontend guidelines: Vercel React Best Practices, Toss Frontend Fundamentals, Effective TypeScript, WCAG 2.2, OWASP.

## Key Features

- **Six expert lenses** — Vercel React Best Practices · Toss Frontend Fundamentals · Effective TypeScript · WCAG 2.2 · OWASP · React rules-of-hooks
- **Parallel sub-agents** — Each lens in an isolated context: no reasoning contamination, no mode collapse, no contention for the same window
- **Smart input routing** — Diff for line-level rules, full file content for structural rules; cost stays close to *"diff × N + α"* not *"full codebase × N"*
- **Perspective-preserving merge** — Same code flagged by multiple lenses becomes one issue with all viewpoints kept side-by-side
- **Open standard** — Built on [agentskills.io](https://agentskills.io); works with Claude Code, Codex, Gemini CLI
- **Conservative by design** — Skip uncertain patterns rather than emit speculation; false positives erode trust faster than missed issues

## Quick Start

### Install

```bash
# Install everything
npx skills add YOUR_USERNAME/fe-review-skills --all

# Or pick what you need
npx skills add YOUR_USERNAME/fe-review-skills \
  --skill diff-review \
  --skill lens-react-perf \
  --skill lens-a11y
```

> Replace `YOUR_USERNAME` with your GitHub user/org once you fork or publish.

### Use

After installing, just ask:

```
review my staged changes
```

Or with options:

```
review my diff with lang=ko severity_min=high lenses=perf,a11y
```

| Option | Default | Values |
|---|---|---|
| `scope` | `staged` | `staged`, `unstaged`, `branch:<name>`, `range:<a>..<b>` |
| `lang` | `en` | `en`, `ko` |
| `lenses` | all six | comma list of `perf`, `bugs`, `ts`, `quality`, `a11y`, `security` |
| `severity_min` | `high` | `critical`, `high`, `medium`, `low` |

Each lens is also a standalone, user-invocable skill, so you can run just one:

```
run lens-a11y on my unstaged changes
```

## Lenses

| Lens | Source | Asks | Input | What it catches |
|---|---|---|---|---|
| `lens-react-perf` | [Vercel React Best Practices](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices) | Is it fast? | diff | Request waterfalls, RSC serialization bloat, bundle size, missing memoization, rendering anti-patterns |
| `lens-bugs` | React rules-of-hooks + ESLint/TS-ESLint + JS/TS/HTML/CSS correctness rules | Are there bugs? | diff | Stale closures, missing deps, hook order, race conditions, floating promises, empty catches, == coercion, missing button type |
| `lens-ts` | Google TypeScript Style Guide + Effective TypeScript | Is the type system being worked with or around? | diff | `any`, casual casts, `!` assertions, `@ts-ignore`, weak types, mutable exports |
| `lens-code-quality` | [Toss Frontend Fundamentals](https://github.com/toss/frontend-fundamentals) | Is it easy to change? | **diff + files** | Readability, predictability, cohesion, coupling |
| `lens-a11y` | WCAG 2.2 + ARIA APG | Can everyone reach it? | diff | Missing alt, unnamed icon buttons, broken keyboard nav, ARIA misuse, focus indicator removal |
| `lens-security` | OWASP + frontend-specific | Is data leaking? | diff | XSS vectors, secret leakage, unsafe storage, dangerous JS APIs |

## Why this design

### Six different questions

Each upstream guideline asks a *different question* — perf asks *is it fast*, a11y asks *can everyone reach it*, security asks *is data leaking*. The angles are nearly orthogonal: pick any one and you systematically miss what the others would have caught. It's the six heads a senior reviewer juggles on a single PR, lifted directly into the tool.

### Six isolated rooms

We don't ask one model to apply all six lenses at once. Each lens runs as its own sub-agent — and there are **three structural reasons** for that:

1. **No reasoning contamination** — Run perf → a11y → security sequentially in one context and the earlier lens's findings, framing, and severity calls color the later one's tone and priorities. Split into sub-agents and the perf lens does its job *without knowing* what a11y caught.
2. **No mode collapse** — Tell one model "review this PR for perf, quality, a11y, and security" and it consistently collapses toward whichever angle is loudest or most familiar (one obvious security issue and the whole tone tilts security). Physically separating contexts makes that collapse structurally impossible.
3. **Context budget + parallelism** — Each child's full reasoning is spent in its own window; only the structured finding JSON returns to the parent. The six children run wall-clock in parallel — adding lenses barely adds time.

Think of it as **a panel review**: instead of asking one reviewer to wear six hats, six specialist reviewers sit in isolated rooms with the same change, finish independently, and only then meet to reconcile overlap.

### Per-lens input routing

The token cost doesn't scale at full N×. Each lens declares the input it actually needs: the five line- or function-level lenses (bugs / a11y / security / perf / ts) take **only the diff**, while `lens-code-quality` — the only one checking structural properties like cohesion and coupling — additionally takes the **full content of changed files**.

**With 5 of 6 lenses seeing only the diff, the total token usage drops sharply** — the real shape is *"diff × N + α"*, not *"full codebase × N"*. That's the deliberate trade — the bet is that *consistent multi-angle coverage* is something a single 1× model pass cannot structurally buy, no matter how the prompt is written.

## Architecture

```
                ┌──────────────────────────┐
                │ Git diff                 │
                │ (+ changed files when    │
                │  a structural lens runs) │
                └────────────┬─────────────┘
                             │
       ┌────────┬────────┬───┴────┬────────┬─────────┐
       ▼        ▼        ▼        ▼        ▼         ▼
   ┌──────┐┌──────┐┌──────┐┌──────┐┌─────────┐┌──────────┐
   │ perf ││ bugs ││  ts  ││ a11y ││ quality ││ security │   ← parallel sub-agents
   └──┬───┘└──┬───┘└──┬───┘└──┬───┘└────┬────┘└────┬─────┘
      └───────┴───────┴───┬───┴─────────┴──────────┘
                          ▼
                ┌─────────────────────┐
                │  Dedupe + merge     │   ← key: file:line + severity max
                │  (same line, many   │
                │   perspectives)     │
                └──────────┬──────────┘
                           ▼
                ┌─────────────────────┐
                │ Prioritized report  │
                │ Critical → Low      │
                └─────────────────────┘
```

The orchestrator (`diff-review`) fans out to six sub-agents via the Task tool and does merge/sort only in its own context.

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

The merger groups findings by `file` + overlapping line ranges. When multiple lenses fire on the same code, the merged issue preserves every perspective — for example, a `useEffect` fetching data may produce a `lens-react-perf` finding (waterfall), a `lens-code-quality` finding (hidden side effect), and a `lens-bugs` finding (setState-after-unmount race) on the same lines. The reviewer sees one issue with three angles, not three duplicate alerts.

Final severity is the max across perspectives. Sort is by severity desc, then file path, then line number.

## Contributing

PRs welcome. Adding a new lens:

1. Create `skills/lens-<name>/SKILL.md` with the YAML frontmatter (`name`, `input-mode`, `description`, `user-invocable: true`). Set `input-mode` to `diff` (line/function-level rules) or `changed-files` (structural rules requiring full file context)
2. Document the rule catalog using one rule id per pattern
3. Match the JSON output schema (see any existing lens)
4. Add the lens to `package.json` `skills` and to the orchestrator's lens list

The benchmark for "is this rule worth adding": can it be reliably detected from a diff (or full file, depending on the lens's input-mode) without runtime data, and would a senior frontend reviewer flag it on a PR? If both yes, add it.

## Inspiration

Inspired by the Compounding Engineering pattern Toss uses internally — running multiple LLMs in parallel against a single PR.

## License & Credits

MIT — see [LICENSE](./LICENSE).

- [Vercel React Best Practices](https://github.com/vercel-labs/agent-skills) by Vercel Labs (MIT)
- [Frontend Fundamentals](https://github.com/toss/frontend-fundamentals) by Toss (MIT)
- WCAG 2.2 by W3C
