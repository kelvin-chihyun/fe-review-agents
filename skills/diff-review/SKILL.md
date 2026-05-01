---
name: diff-review
description: Orchestrates parallel frontend code review across the six default lenses (React performance, bugs, code quality, accessibility, security, TypeScript rigor) plus any additional `lens-*` skills the user has installed. Use when the user asks to review a diff, review a PR, run code review on staged or unstaged changes, audit frontend changes, or perform a multi-perspective code review on git output. Spawns sub-agents for each installed lens in parallel, then deduplicates and prioritizes findings.
user-invocable: true
---

# diff-review

Run every installed frontend review lens in parallel against a git diff and merge the results into one prioritized report.

## When to use

Trigger on user requests like "review my diff", "review staged changes", "review this PR", "audit the changes on this branch", or "run code review on what I've changed". Targets frontend repos (React, Next.js, Vue, Svelte, plain HTML/CSS).

If the user asks for a single perspective (e.g. "just check for a11y"), defer to whichever installed `lens-*` skill matches the request instead of running this orchestrator.

## Inputs

The user can pass options inline. Parse them out of the request:

| Option         | Default      | Values                                                                                |
| -------------- | ------------ | ------------------------------------------------------------------------------------- |
| `scope`        | `staged`     | `staged`, `unstaged`, `branch:<name>`, `range:<rev>..<rev>`                           |
| `lang`         | `en`         | `en`, `ko`                                                                            |
| `lenses`       | all installed | comma-list of short names; each token matches an installed `lens-<name>` skill (see Step 0 for resolution rules) |
| `severity_min` | `high`       | `critical`, `high`, `medium`, `low`                                                   |

Example: "review my diff with lang=ko severity_min=medium lenses=perf,bugs,ts,a11y"

## Workflow

### Step 0 — Discover installed lenses

List the lens skills available to dispatch. Use the `Glob` tool with these patterns (in order; first non-empty wins):

1. `.claude/skills/lens-*/SKILL.md` — project-level installs
2. `~/.claude/skills/lens-*/SKILL.md` — global installs (expand `~` to the user's home dir)

For each match, read the file's YAML frontmatter and extract `name` and `input-mode`. Skip entries with missing `name` or unparseable frontmatter and note the skip in the report footer (`⚠️ Skipped <path>: missing/invalid frontmatter`).

The result is a list of `{ name, input-mode }` records — call it the **installed lens set**.

If the installed lens set is empty:

> No lens skills are installed. Run `npx fe-review-skills install <claude-code|gemini-cli|codex-cli>` from your project root to install the default 6 lenses (or `--global` to install for all projects).

…and stop.

#### Resolving the `lenses` option

If the user passed `lenses=<comma-list>`, resolve each short-name token against the installed lens set:

- Exact match (`lens-bugs` matches the lens whose `name` is `lens-bugs`) → use it.
- Suffix match — token without `lens-` prefix matches a lens whose `name` ends with that suffix:
  - `perf` → `lens-react-perf`
  - `quality` → `lens-code-quality`
  - `bugs` → `lens-bugs`, `ts` → `lens-ts`, `a11y` → `lens-a11y`, `security` → `lens-security`
  - For user-added lenses, the token equals the suffix after `lens-` (e.g. `i18n` matches `lens-i18n`).
- Ambiguous token (matches >1 installed lens) → ask the user to disambiguate by giving the full `lens-<name>` form, then stop.
- Unmatched token → tell the user the lens isn't installed and list installed lenses, then stop.

If `lenses` is unset, use the entire installed lens set.

### Step 1 — Collect the diff and (when needed) file contents

**1a. Get the diff** for the scope:

- `staged` → `git diff --cached --unified=3`
- `unstaged` → `git diff --unified=3`
- `branch:<name>` → `git diff <name>...HEAD --unified=3`
- `range:<a>..<b>` → `git diff <a>..<b> --unified=3`

**1b. Filter** to frontend files only:

```
*.ts *.tsx *.js *.jsx *.mjs *.cjs *.vue *.svelte *.html *.css *.scss *.sass
```

Skip generated files (`*.d.ts`, `dist/**`, `build/**`, `.next/**`, `node_modules/**`).

If the filtered diff is empty, tell the user there are no frontend changes in scope and stop.

If the filtered diff exceeds 2,000 lines, ask the user to narrow the scope before proceeding.

**1c. Collect file contents** — only required if at least one enabled lens declares `input-mode: changed-files` in its SKILL.md frontmatter. Skip this step otherwise.

Get the list of changed file paths (same scope, with `--name-only`):

- `staged` → `git diff --cached --name-only`
- `unstaged` → `git diff --name-only`
- `branch:<name>` → `git diff <name>...HEAD --name-only`
- `range:<a>..<b>` → `git diff <a>..<b> --name-only`

Apply the same frontend-file filter and generated-file skip as 1b.

For each remaining file, read its **post-change** content:

- `staged` or `unstaged` → use the `Read` tool on the working tree path
- `branch:<name>` → `git show HEAD:<path>`
- `range:<a>..<b>` → `git show <b>:<path>`

Skip files **deleted** in this diff (no post-change content exists).

**Size guards** (these affect Step 2 strategy):

- If a single file exceeds 1,000 lines, exclude it from the changed-files bundle. Lenses with `input-mode: changed-files` will fall back to diff-only for that file. Note this in the report footer.
- If the total content of all included files exceeds 50KB, switch to **per-file mode** in Step 2.

### Step 2 — Fan out to lenses (parallel)

For each enabled lens, read its `input-mode` from its SKILL.md frontmatter. Default to `diff` if not specified. Different lenses may receive different inputs in the same review run — that's intentional (see "Why per-lens input" in the README).

#### Diff-mode lenses (`input-mode: diff`)

Spawn a sub-agent (Task tool) with this exact instruction:

> Use the `<lens-name>` skill. Review the diff below and return ONLY a JSON array of findings matching the schema in that skill's SKILL.md. Do not include any prose, markdown, or explanation outside the JSON. If there are no issues, return `[]`.
>
> ```diff
> <full diff content>
> ```

#### Changed-files-mode lenses (`input-mode: changed-files`)

Pick the strategy based on the size guards from Step 1c.

**Single-call strategy** — when total file content < 50KB. Spawn one sub-agent with the diff plus all file contents:

> Use the `<lens-name>` skill. The following files were modified. The diff shows what changed; the full file contents are provided so you can analyze structural properties (cohesion, coupling, full function context).
>
> CRITICAL: Only emit findings for code that appears in the diff hunks. Do NOT flag pre-existing code that wasn't part of this change.
>
> Return ONLY a JSON array of findings matching the schema in the SKILL.md. Return `[]` if no issues.
>
> DIFF:
>
> ```diff
> <full filtered diff>
> ```
>
> CHANGED FILES (post-change content):
>
> === <file1 path> ===
>
> ```
> <file1 full content>
> ```
>
> === <file2 path> ===
>
> ```
> <file2 full content>
> ```
>
> ...

**Per-file strategy** — when total file content ≥ 50KB. For each changed file in scope, spawn a separate sub-agent:

> Use the `<lens-name>` skill. The following file was modified. The diff hunks for this file are below; the full file content is provided for structural analysis.
>
> CRITICAL: Only emit findings for code that appears in the diff hunks. Do NOT flag pre-existing untouched code. Cross-file rules (e.g., `coupling/circular-domain`, `predictability/same-name-divergent-behavior`) may not fire reliably in this mode — skip rather than guess.
>
> Return ONLY a JSON array of findings. Return `[]` if no issues.
>
> DIFF (this file only):
>
> ```diff
> <hunks for this single file>
> ```
>
> FILE CONTENT (post-change):
>
> ```
> <full file content>
> ```

#### Parallelism

Run all sub-agents in parallel — do not chain them, regardless of mode. In per-file mode that means N (files) × M (changed-files lenses) calls all run concurrently alongside the diff-mode lenses. If a sub-agent returns malformed JSON, treat it as `[]` and note the failure in the report footer.

### Step 3 — Merge and deduplicate

Each finding has shape:

```json
{
  "file": "src/components/Header.tsx",
  "line_start": 42,
  "line_end": 48,
  "severity": "critical | high | medium | low",
  "category": "<rule-id>",
  "title": "Sequential awaits create waterfall",
  "rationale": "Two independent awaits run sequentially, doubling TTFB.",
  "suggestion": "Wrap in Promise.all"
}
```

**Dedupe key:** `file` + overlapping `line_start..line_end` (overlap = ranges intersect). Findings with the same key from different lenses get merged into one issue with a `perspectives[]` array preserving each lens's title, rationale, and suggestion. The merged severity is the maximum across perspectives.

**Filter:** drop anything below `severity_min`.

**Sort:** by severity desc → file path asc → line_start asc.

### Step 4 — Render

Use the report template (English or Korean per `lang`).

## Report template (en)

```markdown
# Code Review

**Scope:** <scope description> · **Files reviewed:** <N> · **Issues:** <total> (Critical: <C> / High: <H> / Medium: <M> / Low: <L>)

---

## 🔴 Critical

### 1. <title>

**File:** `<path>:<line_start>-<line_end>` · **Severity:** Critical
**Lenses:** <comma-list of lens names>

<For each perspective:>
- **<lens-name>** — <rationale>
  Suggestion: <suggestion>

---

## 🟠 High

... (same shape)

## 🟡 Medium

... (same shape)

## ⚪ Low

... (same shape)

---

<If any sub-agent failed:>
> ⚠️ Lens `<name>` failed to return parseable findings and was skipped.
```

## Report template (ko)

```markdown
# 코드 리뷰

**범위:** <scope 설명> · **파일 수:** <N> · **이슈:** 총 <total>개 (Critical: <C> / High: <H> / Medium: <M> / Low: <L>)

---

## 🔴 Critical

### 1. <title>

**파일:** `<path>:<line_start>-<line_end>` · **심각도:** Critical
**적용 lens:** <comma-list>

<각 perspective:>

- **<lens-name>** — <rationale>
  권장: <suggestion>

---

## 🟠 High

... (동일 구조)

## 🟡 Medium

... (동일 구조)

## ⚪ Low

... (동일 구조)

---

<sub-agent 실패 시:>

> ⚠️ `<name>` lens가 결과를 반환하지 못해 건너뛰었습니다.
```

## Important

- Do NOT fall back to running lenses sequentially in your own context. The point of this skill is parallel sub-agents.
- Do NOT add findings of your own — your job is orchestration and merging only.
- Keep `title` short (≤8 words). Long explanations go in `rationale`.
- If the same lens reports two findings for overlapping line ranges with different categories, keep both — they're different issues that happen to share location.
