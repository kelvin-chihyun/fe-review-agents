# Adding a lens

`fe-review-skills` ships 6 starter lenses (perf, bugs, ts, code quality, a11y, security). When you spot a perspective that's missing for your team — i18n, performance budgets, motion-reduce, dependency hygiene, anything — you can add a lens.

Adding a lens is **three small edits**: drop a new agent file, register it in the orchestrator's roster, and add a triage rule. The previous version of this guide promised "drop a folder in and you're done"; that became unreliable so we switched to an explicit roster. Predictable beats convenient.

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

## 2. Create the agent file

Add a single markdown file to your installed plugin's `agents/` directory:

| Install scope | Path                                                          |
| ------------- | ------------------------------------------------------------- |
| Project       | `.claude/plugins/fe-review-skills/agents/lens-<name>.md`      |
| Global        | `~/.claude/plugins/fe-review-skills/agents/lens-<name>.md`    |

The `lens-` prefix is required — that's how the orchestrator's roster picks up the agent.

For Codex CLI / Gemini CLI users, the equivalent path is `.codex/agents/lens-<name>.toml` / `.gemini/agents/lens-<name>.md`.

## 3. Frontmatter contract

Every lens's agent file must start with this YAML block:

```yaml
---
name: lens-<your-name>
description: "One sentence on what this lens reviews. Include trigger keywords the model should match against. Quote the whole string to be safe with colons."
---
```

| Key           | Required | Notes                                                                                                                                                  |
| ------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `name`        | yes      | Must match the filename (`lens-<your-name>`, no extension). Becomes the `subagent_type` the orchestrator dispatches.                                  |
| `description` | yes      | One sentence. Drives AI auto-invocation when the user mentions the topic. **Wrap in double quotes** if it contains colons or other YAML metacharacters. |

That's all the frontmatter fields. No `input-mode` (encoded in the orchestrator's roster table). No `user-invocable` (not a recognized Claude Code field).

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

| Field                    | Required | Notes                                                                                                                                                                       |
| ------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `file`                   | yes      | Path as it appears in the diff.                                                                                                                                             |
| `line_start`, `line_end` | yes      | Lines in the post-change file. The orchestrator dedupes findings across lenses by `file + overlapping line range`.                                                          |
| `severity`               | yes      | One of: `critical`, `high`, `medium`, `low`. **Don't add new levels** — the orchestrator's sort and `severity_min` filter rely on these four.                               |
| `category`               | yes      | Stable rule ID. **Prefix with your lens name**, e.g. `i18n/missing-translation-key`. The orchestrator doesn't validate it, but consistent IDs make report grouping cleaner. |
| `title`                  | yes      | ≤8 words. Long explanations belong in `rationale`.                                                                                                                          |
| `rationale`              | yes      | Why this is a problem in this codebase.                                                                                                                                     |
| `suggestion`             | yes      | What to change. Concrete, not abstract.                                                                                                                                     |

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

## 5b. Register with the orchestrator

This is the step that's new compared to the previous version. The orchestrator uses a static roster — you tell it your lens exists.

In your installed plugin's `skills/diff-review/SKILL.md` (or `agents/review-orchestrator.md` for Codex/Gemini), make two edits:

**(a) Append a row to the Lens roster table:**

```markdown
| `subagent_type`     | `input-mode`     |
| ------------------- | ---------------- |
| ... existing rows ...
| `lens-<your-name>`  | `diff`           |  ← add this
```

`input-mode` is `diff` for line-level rules, `changed-files` for structural rules that need full file context. Default to `diff` unless your rules truly need full files.

**(b) Append a row to the Step 1.5 Triage table:**

```markdown
| Lens               | Enable when…                                                                            |
| ------------------ | --------------------------------------------------------------------------------------- |
| ... existing rows ...
| `lens-<your-name>` | <patterns or file-path globs that signal your lens is relevant to a diff>               |  ← add this
```

The triage rule decides when your lens runs. Be **inclusive** — list every clear signal that this lens *might* be relevant. False negatives in triage erode trust; false positives just cost a sub-agent run.

If you skip step 5b, your agent file exists but the orchestrator never dispatches it. Direct invocation (`@lens-<your-name>`) still works.

## 6. Boundary discipline

The 6 starter lenses overlap minimally because each one stays inside its own question. Some easy traps and how the existing lenses handle them:

- **`lens-bugs` vs `lens-ts`** — A `!` non-null assertion on something that can actually be null is `bugs/non-null-assert-on-external`. A `!` used to silence a type checker on something that's _not_ null at runtime is `ts/non-null-assertion`. Same syntax, different question; both lenses can fire and the orchestrator merges them with both perspectives preserved.
- **`lens-react-perf` vs `lens-code-quality`** — Heavy memoization on values that don't change is `perf/rendering-memo-empty-deps`. Drilling state through 5 components is `cohesion/pass-through-prop`. Don't try to make one lens cover both.
- **`lens-a11y` vs `lens-security`** — `dangerouslySetInnerHTML` from user input is `security/dangerously-set-inner-html`. From trusted CMS content with screen-reader implications is an `a11y/...` finding. Different question, possibly both fire.

Pattern: when in doubt, _which question is the user really asking when they hit this issue?_ That's the lens that should fire.

## 7. Trigger

Once steps 2–5b are done, the next `/fe-review-skills:diff-review` (Claude Code) or `@review-orchestrator` (Codex/Gemini) call will dispatch your lens when triage fires its rule. Verify it loaded:

- In Claude Code: `@lens-<your-name>` should be a valid agent invocation. Run it standalone to confirm registration.
- After running `/fe-review-skills:diff-review`, the report header lists enabled lenses. Your new lens should appear there when triage rules fire.

If your lens doesn't appear in the report:

- Run `@lens-<your-name>` directly to confirm the agent file is well-formed (most common issue: unquoted colon in `description`).
- Check the orchestrator's Step 1.5 — is your triage rule firing on the kind of diff you tested with?
- Check the orchestrator's Lens roster — did you add the row?

## Skeleton

Copy this into a fresh `agents/lens-<name>.md` to start:

````markdown
---
name: lens-<name>
description: "One sentence on what this lens reviews. Include keywords like 'review for X', 'audit Y', so the AI dispatcher knows when to fire it."
---

# lens-<name>

One paragraph: what question this lens answers, where the rules come from, what's deliberately out of scope (= "another lens covers that").

## When to use

- Triggered by the orchestrator (when its triage rule for this lens fires)
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
````

That's the file. Then do step 5b (roster + triage rule) and your lens ships alongside the defaults.
