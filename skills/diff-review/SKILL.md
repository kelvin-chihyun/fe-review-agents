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

| Option         | Default       | Values                                                                                                           |
| -------------- | ------------- | ---------------------------------------------------------------------------------------------------------------- |
| `scope`        | `staged`      | `staged`, `unstaged`, `branch:<name>`, `range:<rev>..<rev>`                                                      |
| `lang`         | `en`          | `en`, `ko`                                                                                                       |
| `lenses`       | all installed | comma-list of short names; each token matches an installed `lens-<name>` skill (see Step 0 for resolution rules) |
| `severity_min` | `high`        | `critical`, `high`, `medium`, `low`                                                                              |

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

Capture the diff output **directly into your context** by running the bash command and reading the result. Do NOT redirect to a temp file (`> /tmp/...`) — Step 2 dispatches must inline the diff text into each sub-agent prompt, and a `/tmp` round-trip just forces every sub-agent to do an extra Read. Same rule for the file contents collected in 1c.

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
- If the total content of all included files exceeds 100KB, switch to **per-file mode** in Step 2.

### Step 2 — Fan out to lenses (parallel)

For each enabled lens, read its `input-mode` from its SKILL.md frontmatter. Default to `diff` if not specified. Different lenses may receive different inputs in the same review run — that's intentional (see "Why per-lens input" in the README).

**Dispatch prompt discipline.** Use the templates below verbatim, filling `<full diff content>`, `<file content>`, etc. with the actual text from your context. Three rules — all of them load-bearing:

1. **Inline content, never reference paths.** Place the actual diff bytes under the ` ```diff ` fence; place actual file contents under each `=== <path> ===` block. Do NOT save the diff to `/tmp/diff-review-diff.patch` and tell the sub-agent to "Read it with the Read tool." Do NOT list absolute file paths and ask the sub-agent to Read them. Inlining costs the same tokens but skips a per-sub-agent tool round-trip and keeps every dispatch consistent (mid-run inconsistency — half inlined, half referenced — is a known failure mode).
2. **No SKILL.md path references.** The Skill tool auto-loads the lens's SKILL.md content when the sub-agent invokes `Use the <lens-name> skill`; pointing to the file forces a redundant Read tool call.
3. **No restated finding-schema fields.** The lens's SKILL.md already documents the schema; restating it bloats the prompt and risks divergence.

#### Diff-mode lenses (`input-mode: diff`)

Spawn a sub-agent (Task tool) with this exact instruction:

> Use the `<lens-name>` skill — invoking it loads its rule catalog and finding schema, so do not Read SKILL.md. Review the diff below and return ONLY a JSON array of findings. Do not include any prose, markdown, or explanation outside the JSON. If there are no issues, return `[]`.
>
> ```diff
> <full diff content>
> ```

#### Changed-files-mode lenses (`input-mode: changed-files`)

Pick the strategy based on the size guards from Step 1c.

**Single-call strategy** — when total file content < 100KB. Spawn one sub-agent with the diff plus all file contents:

> Use the `<lens-name>` skill — invoking it loads its rule catalog and finding schema, so do not Read SKILL.md. The following files were modified. The diff shows what changed; the full file contents are provided so you can analyze structural properties (cohesion, coupling, full function context).
>
> CRITICAL: Only emit findings for code that appears in the diff hunks. Do NOT flag pre-existing code that wasn't part of this change.
>
> Return ONLY a JSON array of findings. Return `[]` if no issues.
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

**Per-file strategy** — when total file content ≥ 100KB. For each changed file in scope, spawn a separate sub-agent:

> Use the `<lens-name>` skill — invoking it loads its rule catalog and finding schema, so do not Read SKILL.md. The following file was modified. The diff hunks for this file are below; the full file content is provided for structural analysis.
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

#### Parallelism (load-bearing)

**Issue ALL Agent tool_use blocks in a single assistant message.** This is the only thing that makes them run concurrently. If you dispatch lens A, observe its result, then dispatch lens B in a follow-up message, the runtime executes them sequentially regardless of any "parallel" intent — and the entire architecture (no reasoning contamination, isolated context budgets, faster wall time) collapses.

Concretely: when you reach the dispatch step, your next assistant message must contain N Agent tool_use blocks where N = (diff-mode lenses) + (changed-files single-call lenses) + (per-file mode: files × changed-files lenses). Do NOT dispatch one, await its result, then dispatch the next. Do NOT split dispatches across multiple assistant messages "to be safe" or "to verify" — the merge step in Step 3 is your verification.

If a sub-agent returns malformed JSON, treat it as `[]` and note the failure in the report footer.

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

> **<scope>** · <N> files · <total> issues · 🔴 <C> · 🟠 <H> · 🟡 <M> · ⚪ <L>

---

## 🔴 Critical

### <n>. <title>

`<path>:<line_start>-<line_end>` · <K> perspectives

- **<lens>** — <rationale>
  → <suggestion>

## 🟠 High

### <n>. <title>

`<path>:<line_start>-<line_end>`

- **<lens>** — <rationale>
  → <suggestion>
```

**Rendering rules:**

- Issue numbering is global across all severity sections (1, 2, 3, ...).
- Drop the `lens-` prefix from `<lens>` (emit `security`, not `lens-security`).
- Omit any severity section entirely (heading + body) if it has zero issues, and also omit that severity from the summary header.
- Drop the `· <K> perspectives` suffix when an issue has only one perspective.
- Multiple issues within the same severity render under the same `## <severity>` heading sequentially, with no separator between them.
- Severity icon legend: `🔴 Critical · 🟠 High · 🟡 Medium · ⚪ Low`.
- If `<total>` is 0, emit only the H1 plus one line: `No issues found.`
- If any sub-agent failed to return parseable JSON, append at the very end after a `---`: `> ⚠️ Lens \`<name>\` failed to return parseable findings and was skipped.`

## Report template (ko)

```markdown
# 코드 리뷰

> **<scope>** · <N> 파일 · <total> 이슈 · 🔴 <C> · 🟠 <H> · 🟡 <M> · ⚪ <L>

---

## 🔴 Critical

### <n>. <title>

`<path>:<line_start>-<line_end>` · <K> 관점

- **<lens>** — <rationale>
  → <suggestion>

## 🟠 High

### <n>. <title>

`<path>:<line_start>-<line_end>`

- **<lens>** — <rationale>
  → <suggestion>
```

**렌더링 규칙:**

- 이슈 번호는 전체 리포트에 걸쳐 글로벌로 매김 (1, 2, 3, ...).
- `<lens>` 에서 `lens-` 접두사 제거 (`security`, `react-perf` 등).
- 이슈가 0개인 severity 섹션은 헤딩 포함 전체 생략. summary 헤더에서도 해당 항목 생략.
- 관점이 1개뿐인 이슈에서는 `· <K> 관점` 부분 생략.
- 같은 severity 내 여러 이슈는 같은 `## <severity>` 헤딩 아래 연속으로 렌더 (이슈 간 구분선 없음).
- severity 아이콘 범례: `🔴 Critical · 🟠 High · 🟡 Medium · ⚪ Low`.
- `<total>` 이 0이면 H1만 출력하고 한 줄: `이슈를 찾지 못했습니다.`
- sub-agent가 파싱 불가능한 응답을 리턴한 경우, 맨 끝 `---` 뒤에 추가: `> ⚠️ \`<name>\` lens가 결과를 반환하지 못해 건너뛰었습니다.`

## Important

- Do NOT fall back to running lenses sequentially in your own context. The point of this skill is parallel sub-agents.
- Do NOT add findings of your own — your job is orchestration and merging only.
- Keep `title` short (≤8 words). Long explanations go in `rationale`.
- If the same lens reports two findings for overlapping line ranges with different categories, keep both — they're different issues that happen to share location.
