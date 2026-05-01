# fe-review-skills

> An open-source skill pack that **fuses several industry-grade frontend review philosophies** — Vercel React Best Practices, Toss Frontend Fundamentals, WCAG 2.2, OWASP, React rules-of-hooks + ESLint/TS-ESLint, Google TypeScript Style Guide + Effective TypeScript — by running each as a **parallel sub-agent** against your git diff and merging the results into one report.
> Instead of asking one model to wear six hats, six clean contexts each apply their own lens — and when they hit the same line, the perspectives are kept side-by-side.

🇰🇷 [한국어 문서](./README.md)

---

## What it does

When you ask the agent to review a diff, this skill pack:

1. **Collects** the relevant `git diff` (staged, unstaged, branch, or revision range) — plus the full contents of changed files when a structural lens is enabled
2. **Fans out** to each lens with the input it declares (`diff` or `diff + changed files`), running every lens as a parallel sub-agent
3. **Merges** findings — issues that hit the same line range from multiple angles get deduplicated and the perspectives kept side-by-side
4. **Ranks** by severity and prints one actionable report

## Why these six sources

Each upstream is a great guideline on its own, but each one **asks a different question**:

- **Vercel React Best Practices** — *"Is this fast?"* (waterfalls, RSC serialization, bundle)
- **React rules-of-hooks + ESLint/TS-ESLint + common HTML/CSS traps** — *"Are there bugs?"* (stale closures, missing deps, hook order, race conditions, floating promises, empty catches, ==, accidental form submits)
- **Google TypeScript Style Guide + Effective TypeScript** — *"Is the type system being worked with or around?"* (`any`, casual casts, `!` assertions, `@ts-ignore`, weak types, mutable exports)
- **Toss Frontend Fundamentals** — *"Is this easy to change?"* (readability, predictability, cohesion, coupling)
- **WCAG 2.2 + ARIA APG** — *"Can everyone reach this?"* (keyboard, screen readers, focus)
- **OWASP + frontend-specific** — *"Is user data leaking?"* (XSS, secrets, unsafe storage)

The six angles are nearly orthogonal. Pick any one and you systematically miss what the others would have caught. It's the six heads a senior reviewer juggles on a single PR, lifted directly into the tool.

## Why parallel sub-agents

We don't ask one model to apply all six lenses at once. Each lens runs as its own sub-agent — and there are **three structural reasons** for that:

1. **No reasoning contamination.** Run perf → a11y → security sequentially in one context and the earlier lens's findings, framing, and severity calls color the later one's tone and priorities. Split into sub-agents and the perf reviewer does its job *without knowing* what a11y caught.
2. **No mode collapse.** Tell one model "review this PR for perf, quality, a11y, and security" and it consistently collapses toward whichever angle is loudest or most familiar (one obvious security issue and the whole tone tilts security). Physically separating contexts makes that collapse structurally impossible.
3. **Context budget + parallelism.** Each child's full reasoning is spent in its own window; only the structured finding JSON returns to the parent. The parent stays clean for merge/sort logic, and the six children run wall-clock in parallel — adding lenses barely adds time.

Think of it as **a panel review**: instead of asking one reviewer to wear six hats, six specialist reviewers sit in isolated rooms with the same diff, finish independently, and only then meet to reconcile overlap.

## Why the cost isn't N×

The token cost doesn't scale at full N×. Each lens declares the input it actually needs: the five line- or function-level lenses (bugs / a11y / security / perf / ts) take **only the diff**, while `lens-code-quality` — the only one checking structural properties like cohesion and coupling — additionally takes the **full content of changed files**. **With 5 of 6 lenses seeing only the diff, the total token usage drops sharply** — the real shape is _"diff × N + α"_, not _"full codebase × N"_. That's the deliberate trade — the bet is that *consistent multi-angle coverage* is something a single 1× model pass cannot structurally buy, no matter how the prompt is written.

## The six lenses

| Lens | Source | Asks | Input | What it catches |
|---|---|---|---|---|
| `lens-react-perf` | [Vercel React Best Practices](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices) | Is it fast? | diff | Request waterfalls, RSC serialization bloat, bundle size, missing memoization, rendering anti-patterns |
| `lens-bugs` | React rules-of-hooks + ESLint/TS-ESLint + JS/TS/HTML/CSS correctness rules | Are there bugs? | diff | Stale closures, missing deps, hook order, race conditions, floating promises, empty catches, == coercion, missing button type |
| `lens-ts` | Google TypeScript Style Guide + Effective TypeScript | Is the type system being worked with or around? | diff | `any`, casual casts, `!` assertions, `@ts-ignore`, weak types, mutable exports |
| `lens-code-quality` | [Toss Frontend Fundamentals](https://github.com/toss/frontend-fundamentals) | Is it easy to change? | **diff + files** | Readability, predictability, cohesion, coupling |
| `lens-a11y` | WCAG 2.2 + ARIA APG | Can everyone reach it? | diff | Missing alt, unnamed icon buttons, broken keyboard nav, ARIA misuse, focus indicator removal |
| `lens-security` | OWASP + frontend-specific | Is data leaking? | diff | XSS vectors, secret leakage, unsafe storage, dangerous JS APIs |

## Install

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

The skill pack follows the [open Agent Skills standard](https://skills.sh), so it works with any compatible agent — Claude Code, Cursor, Cline, opencode, GitHub Copilot, and others.

## Use

After installing, just ask:

```
review my staged changes
```

Or with options:

```
review my diff with lang=ko severity_min=high lenses=perf,a11y
```

### Options

| Option | Default | Values |
|---|---|---|
| `scope` | `staged` | `staged`, `unstaged`, `branch:<name>`, `range:<a>..<b>` |
| `lang` | `en` | `en`, `ko` |
| `lenses` | all six | comma list of `perf`, `bugs`, `ts`, `quality`, `a11y`, `security` |
| `severity_min` | `high` | `critical`, `high`, `medium`, `low` |

### Run a single lens

Each lens is also a standalone, user-invocable skill, so you can run just one:

```
run lens-a11y on my unstaged changes
```

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

The orchestrator (`diff-review`) fans out to six sub-agents via the Task tool and does merge/sort only in its own context. The reasoning behind that split lives in [Why parallel sub-agents](#why-parallel-sub-agents) above.

## How findings get merged

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

## Design notes

- **Diff-only.** All rules are tuned to fire from a unified diff alone. Rules requiring whole-codebase analysis, runtime data, or DOM inspection are intentionally out of scope.
- **Parallel by construction.** Reasoning isolation, mode-collapse avoidance, and context budgeting all fall out of the same design. Full rationale in [Why parallel sub-agents](#why-parallel-sub-agents).
- **Conservative.** Lenses are instructed to skip patterns they can't be sure about, rather than flag speculative issues. False positives erode trust faster than missed issues.
- **Catalog-bound.** Each lens lists its rule ids and only emits findings under those categories. This keeps the output reviewable and the rule set evolvable.

## License

MIT — see [LICENSE](./LICENSE).

## Credits

- [Vercel React Best Practices](https://github.com/vercel-labs/agent-skills) by Vercel Labs (MIT)
- [Frontend Fundamentals](https://github.com/toss/frontend-fundamentals) by Toss (MIT)
- WCAG 2.2 by W3C
