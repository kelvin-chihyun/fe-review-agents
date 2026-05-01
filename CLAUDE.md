# CLAUDE.md

Project-specific guidance for Claude Code.

## What this is

`fe-review-skills` is an [agentskills.io](https://agentskills.io) skill pack: an orchestrator (`diff-review`) plus six lens skills (`lens-{a11y,bugs,code-quality,react-perf,security,ts}`) that run as parallel sub-agents on a git diff and merge findings into one prioritized report. No build, no tests, no CI — markdown + YAML frontmatter only.

## Architecture invariants — don't break

**Parallel fan-out, not sequential.** The orchestrator MUST spawn lenses via the Task tool in parallel. Three structural reasons (see README "왜 이렇게 설계했나" / "Why this design"): no reasoning contamination, no mode collapse, isolated context budgets. Never collapse to "have one model apply all six lenses sequentially" — that defeats the entire architecture.

**Per-lens input routing.** Each lens declares `input-mode: diff | changed-files` in its SKILL.md frontmatter. Five lenses (`bugs`, `a11y`, `security`, `react-perf`, `ts`) take diff hunks only; `lens-code-quality` takes diff + full file content for structural rules (cohesion, coupling, predictability). The orchestrator reads frontmatter and prepares per-lens contexts. **The token-cost story in both READMEs ("diff × N + α") depends on this routing — don't change it casually.**

**Size guards in the orchestrator workflow:**
- Filtered diff > 2,000 lines → ask user to narrow scope
- Single file > 1,000 lines → exclude from changed-files bundle (that file falls back to diff-only)
- Total file content > 50KB → switch to per-file mode (one sub-agent per file × per changed-files lens; cross-file rules explicitly skipped)

## File layout

```
skills/
  diff-review/SKILL.md          orchestrator (no input-mode; collects diff + dispatches)
  lens-<name>/SKILL.md          one per lens; declares input-mode and rule catalog
README.md                        한국어, primary
README.en.md                     English; must stay in sync with README.md
package.json                     skills array — update when adding/removing skills
```

## Conventions

**SKILL.md frontmatter contract:**
- `name` matches the directory name
- `description` — write the trigger phrases plainly; this drives agent dispatch
- `user-invocable: true` on every skill (orchestrator and lenses)
- `input-mode: diff | changed-files` on every lens (NOT on the orchestrator)

**Finding JSON schema** — every lens returns an array of:
```json
{
  "file": "...",
  "line_start": 0,
  "line_end": 0,
  "severity": "critical | high | medium | low",
  "category": "<rule-id>",
  "title": "≤8 words",
  "rationale": "why it's a problem",
  "suggestion": "what to do instead"
}
```
Severity levels are hard-coded in the orchestrator's merge/sort logic — don't add new ones. `category` is the lens's rule id; the orchestrator does NOT validate it, but consistent ids help downstream tooling.

**Bilingual README parity.** `README.md` (한국어, primary) and `README.en.md` are structurally identical — same headers, tables, diagrams, content. **Always edit both in the same change.** Drift between them is a bug.

**Commits.** Korean primary, conventional-commit prefixes (`feat:`, `chore:`, etc.).

## Adding a lens

1. Create `skills/lens-<name>/SKILL.md` with frontmatter + rule catalog (one rule id per pattern)
2. Match the finding JSON schema above
3. Add the lens to `package.json` `skills` array
4. Add it to the orchestrator's lens list in `skills/diff-review/SKILL.md`
5. Add a row to the **Lenses / 렌즈** table in both READMEs (including `Input` column)
6. If the lens count changes, update the architecture diagram in both READMEs and the "5/6 lens가 diff만" / "5 of 6 lenses" framing in the cost section

Bar for a rule: "reliably detectable from the lens's input-mode without runtime data" AND "would a senior frontend reviewer flag this on a PR." Both yes → add. One no → skip.

## Gotchas

- **GitHub push protection blocks real-looking secret patterns** — Stripe (`sk_live_…`, `sk_test_…<24 alnum>`), AWS (`AKIA…`), JWTs, etc. — regardless of whether the value is intentionally fake. The regex matchers don't care about intent. If a fixture needs a hardcoded-secret demo, use a clearly broken placeholder like `sk_live_<YOUR_KEY>` (angle brackets defeat the alnum regex) or describe the pattern in prose. **Do not commit any string that could be mistaken for a real provider key.**
- **`examples/` was deliberately removed** during a push-protection cleanup (sample.diff contained Stripe-format keys that GitHub blocked). If you re-add example fixtures, follow the rule above — no real-looking secret patterns. Don't reintroduce the link in the README header without restoring the file.
- **Lenses are LLM-based pattern review, not static analysis.** No SAST, no SCA, no runtime profiling, no auto-fix. Suggestions only — the user is the editor.
- **Conservative is a feature.** Lenses are tuned to skip uncertain patterns rather than guess. Don't loosen rules to "catch more" — false positives erode trust faster than missed issues.
