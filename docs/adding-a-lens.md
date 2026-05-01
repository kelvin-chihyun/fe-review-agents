# Adding a lens

`fe-review-skills` ships 6 starter lenses (perf, bugs, ts, code quality, a11y, security). When you spot a perspective that's missing for your team — i18n, performance budgets, motion-reduce, dependency hygiene, anything — you add a lens by **dropping a folder in**. No edits to the orchestrator, no edits to `package.json`, no edits to either README. The orchestrator's Step 0 discovers your new lens at next call.

## 1. Pick a question the existing 6 don't answer

Each lens answers _one_ question and only that one:

- `lens-react-perf` — _Is it fast?_
- `lens-bugs` — _Is it correct?_
- `lens-ts` — _Does it work with the type system, or against it?_
- `lens-code-quality` — _Is it easy to change?_
- `lens-a11y` — _Does it reach everyone?_
- `lens-security` — _Does data leak?_

If your idea folds cleanly into one of those, edit that lens's rule catalog instead. A new lens earns its keep when the question is _orthogonal_ to all six.

Examples that pass the bar: i18n / l10n correctness, motion / `prefers-reduced-motion`, dependency / supply-chain hygiene, dead-code, observability (logging / telemetry), bundle-size budgets, design-token adherence.

## 2. Create the directory

For a project-local lens (only this repo):

```
skills/lens-<name>/SKILL.md
```

For a personal global lens (every project on your machine):

```
~/.claude/skills/lens-<name>/SKILL.md
```

The `lens-` prefix is required — that's how the orchestrator's Step 0 finds it.

## 3. Frontmatter contract

Every lens's `SKILL.md` must start with this YAML block:

```yaml
---
name: lens-<your-name>
input-mode: diff           # or: changed-files
user-invocable: true
description: "One sentence on what this lens reviews. Include trigger keywords the model should match against. Quote the whole string to be safe with colons."
---
```

| Key | Required | Notes |
|---|---|---|
| `name` | yes | Must match the directory name (`lens-<your-name>`). |
| `input-mode` | yes | `diff` for line-level rules (cheaper). `changed-files` for structural rules that need full file context (cohesion, coupling). 5 of the 6 starter lenses use `diff`; only `lens-code-quality` uses `changed-files`. |
| `user-invocable` | yes | `true`. Lets the orchestrator dispatch the skill, and lets users invoke `/lens-<your-name>` directly in Claude Code. |
| `description` | yes | One sentence. Drives AI-dispatch trigger matching. **Wrap in double quotes** if it contains colons or other YAML metacharacters. |

## 4. Body contract — output schema

Every lens **returns the same JSON shape** so the orchestrator can dedupe and merge findings across lenses. Copy this into your lens body:

```json
{
  "file": "src/components/Header.tsx",
  "line_start": 23,
  "line_end": 41,
  "severity": "high",
  "category": "<lens-name>/<rule-id>",
  "title": "≤8 words",
  "rationale": "why it's a problem",
  "suggestion": "what to do instead"
}
```

| Field | Required | Notes |
|---|---|---|
| `file` | yes | Path as it appears in the diff. |
| `line_start`, `line_end` | yes | Lines in the post-change file. The orchestrator dedupes findings across lenses by `file + overlapping line range`. |
| `severity` | yes | One of: `critical`, `high`, `medium`, `low`. **Don't add new levels** — the orchestrator's sort and `severity_min` filter rely on these four. |
| `category` | yes | Stable rule ID. **Prefix with your lens name**, e.g. `i18n/missing-translation-key`. The orchestrator doesn't validate it, but consistent IDs make report grouping cleaner. |
| `title` | yes | ≤8 words. Long explanations belong in `rationale`. |
| `rationale` | yes | Why this is a problem in this codebase. |
| `suggestion` | yes | What to change. Concrete, not abstract. |

Return ONLY a JSON array — no prose, no markdown fence, no explanation. Empty findings → `[]`.

## 5. Body contract — rule catalog

Below the schema, list the rules your lens applies. Existing lenses use this shape:

```markdown
## Rules

### <category>/<rule-id>

**Severity:** high

**Pattern:** ...what to look for in the diff...

**Rationale:** ...why it's a problem...

**Suggestion:** ...what to do instead...

**Skip when:** ...false-positive guard...
```

The "Skip when" clause matters. Conservative is a feature: false positives erode trust faster than missed issues. If you're not sure whether a pattern is a bug, _skip_.

## 6. Boundary discipline

The 6 starter lenses overlap minimally because each one stays inside its own question. Some easy traps and how the existing lenses handle them:

- **`lens-bugs` vs `lens-ts`** — A `!` non-null assertion on something that can actually be null is `bugs/ts-unsafe-assertion`. A `!` used to silence a type checker on something that's _not_ null at runtime is `ts/non-null-assertion`. Same syntax, different question; both lenses can fire and the orchestrator merges them with both perspectives preserved.
- **`lens-react-perf` vs `lens-code-quality`** — Heavy memoization on values that don't change is `perf/over-memoization`. Drilling state through 5 components is `quality/coupling/prop-drill`. Don't try to make one lens cover both.
- **`lens-a11y` vs `lens-security`** — `dangerouslySetInnerHTML` from user input is `security/xss`. From trusted CMS content with screen-reader implications is `a11y/inaccessible-html-injection`. Different question, possibly both fire.

Pattern: when in doubt, _which question is the user really asking when they hit this issue?_ That's the lens that should fire.

## 7. Trigger

Once your lens directory is in place:

- **Project-local install** (`./.claude/skills/lens-<name>/SKILL.md`): the orchestrator's Step 0 finds it on the next `/diff-review` call. Project installs win over global ones.
- **Global install** (`~/.claude/skills/lens-<name>/SKILL.md`): same, but applies to every project on your machine (until a project install shadows it).

The orchestrator's frontmatter description names the 6 default lenses literally so AI dispatch keeps matching them strongly. Your custom lens won't appear in that description, but Step 0's filesystem scan will pick it up regardless. Verify it loaded:

```
/lens-<your-name>
```

…in Claude Code; it should activate standalone. Then `/diff-review` should list your lens in the "installed lens set" log line at the top of its run.

If your lens doesn't appear in the report after `/diff-review`:

- Check it shows up in the report footer's "Skipped" list — that means the frontmatter is malformed (most often: an unquoted colon in `description`).
- Run `/lens-<your-name>` directly to confirm Claude Code itself is registering the skill.

## Skeleton

Copy this into a fresh `skills/lens-<name>/SKILL.md` to start:

```markdown
---
name: lens-<name>
input-mode: diff
user-invocable: true
description: "One sentence on what this lens reviews. Include keywords like 'review for X', 'audit Y', so the AI dispatcher knows when to fire it."
---

# lens-<name>

One paragraph: what question this lens answers, where the rules come from, what's deliberately out of scope (= "another lens covers that").

## When to use

- Triggered by `diff-review` as a sub-agent
- Or directly: "review this diff for <thing>"

## Output

Return ONLY a JSON array of findings matching the shared schema:

```json
{
  "file": "src/...",
  "line_start": 0,
  "line_end": 0,
  "severity": "critical | high | medium | low",
  "category": "<name>/<rule-id>",
  "title": "≤8 words",
  "rationale": "why",
  "suggestion": "what to do"
}
```

Every `category` MUST start with `<name>/`. Return `[]` if no issues.

## Rules

### <name>/<rule-id-1>

**Severity:** ...

**Pattern:** ...

**Rationale:** ...

**Suggestion:** ...

**Skip when:** ...

### <name>/<rule-id-2>

...
```

That's it. Drop it in, run `/diff-review`, watch your perspective ship alongside the defaults.
