---
name: diff-review
description: Triages a git diff to pick relevant review lenses (from React performance, bugs, code quality, accessibility, security, TypeScript rigor, plus any additional `lens-*` agents the user has registered in the roster below), then runs each enabled lens in an isolated sub-agent context and merges findings into one prioritized report. Use when the user asks to review a diff, review a PR, run code review on staged or unstaged changes, audit frontend changes, or perform a multi-perspective code review on git output.
argument-hint: "[scope] [lang=en|ko] [severity_min=critical|high|medium|low] [lenses=...] [triage=on|off]"
---

# diff-review

Triage a git diff to identify which review categories are relevant, then run each enabled lens in an isolated sub-agent and merge findings.

## How it works (and what it doesn't do)

The value here is **isolated per-lens context** — each enabled lens reviews the diff in its own sub-agent with a fresh context window, so findings stay independent (no reasoning contamination across categories).

Sub-agents run **sequentially** because Claude Code's runtime serializes Task dispatch even when issued in a single assistant message — a runtime design (GitHub Issue #3013, closed-not-planned), not a prompting failure. We don't fight this: instead, **triage** picks 2–3 relevant lenses out of 6 so a typical run takes ~1–1.5 min instead of ~3 min. The "fast and parallel" promise from other multi-agent kits is largely aspirational; we trade it for honest, focused, isolated review.

## When to use

Trigger on user requests like "review my diff", "review staged changes", "review this PR", "audit the changes on this branch", or "run code review on what I've changed". Targets frontend repos (React, Next.js, Vue, Svelte, plain HTML/CSS).

If the user asks for a single perspective (e.g. "just check for a11y"), defer to the matching lens agent directly (`@lens-a11y`) instead of running this orchestrator.

## Inputs

| Option         | Default       | Values                                                                                                          |
| -------------- | ------------- | --------------------------------------------------------------------------------------------------------------- |
| `scope`        | `auto`        | `auto`, `staged`, `unstaged`, `branch:<name>`, `range:<rev>..<rev>`                                             |
| `lang`         | `en`          | `en`, `ko`                                                                                                      |
| `lenses`       | (triaged)     | comma-list of short names. Setting this **disables triage** and forces exactly the listed lenses                |
| `severity_min` | `low`         | `critical`, `high`, `medium`, `low`                                                                             |
| `triage`       | `on`          | `on`, `off` (= run all roster lenses without triage)                                                            |

`auto` (default with no scope arg) prefers `staged`; if there are no staged frontend changes, it falls back to `unstaged`. An explicit `staged` or `unstaged` is respected and never falls back.

Example: `review my diff with lang=ko severity_min=medium triage=off`

## Lens roster

The roster is the **dispatch list**. Each entry maps a lens `subagent_type` to its `input-mode`. **To add a new lens** (`lens-i18n`, `lens-tests`, etc.): create `agents/lens-<name>.md` and append a row to this table plus a triage rule in Step 1.5 below. See [docs/adding-a-lens.md](../../docs/adding-a-lens.md).

| `subagent_type`     | `input-mode`     |
| ------------------- | ---------------- |
| `lens-a11y`         | `diff`           |
| `lens-bugs`         | `diff`           |
| `lens-code-quality` | `changed-files`  |
| `lens-react-perf`   | `diff`           |
| `lens-security`     | `diff`           |
| `lens-ts`           | `diff`           |

## Workflow

### Step 1 — Collect the diff and (when needed) file contents

**1a. Get the diff** for the resolved scope:

- `auto` → run `staged` first; if its filtered diff (after 1b) is empty, switch to `unstaged`. Note the resolved mode in the report header (e.g. `**Scope:** auto → unstaged`). If both produce empty filtered diffs, stop with the no-changes message.
- `staged` → `git diff --cached --unified=3`
- `unstaged` → `git diff --unified=3`
- `branch:<name>` → `git diff <name>...HEAD --unified=3`
- `range:<a>..<b>` → `git diff <a>..<b> --unified=3`

Capture the diff output **directly into your context** by running the bash command. Do NOT redirect to a temp file — Step 2 inlines the diff text into each sub-agent prompt, and a `/tmp` round-trip just forces every sub-agent to do an extra Read.

**1b. Filter** to frontend files only:

```
*.ts *.tsx *.js *.jsx *.mjs *.cjs *.vue *.svelte *.html *.css *.scss *.sass
```

Skip generated files (`*.d.ts`, `dist/**`, `build/**`, `.next/**`, `node_modules/**`).

If the filtered diff is empty: when `scope=auto` and the current attempt was `staged`, switch to `unstaged` and redo 1a/1b once. Otherwise stop with the no-changes message.

If the filtered diff exceeds 2,000 lines, ask the user to narrow the scope before proceeding.

**1c. Collect file contents** — only required if at least one **enabled** lens (per Step 1.5 / 2a) has `input-mode: changed-files` (today: only `lens-code-quality`). Skip otherwise. Defer this step until after Step 1.5 so you don't read files for a lens that triage rules out.

When needed: get the changed-file list with `--name-only` (matching the scope command), apply the same frontend-file filter and generated-file skip as 1b, then for each remaining file read its **post-change** content (`Read` for `staged`/`unstaged`; `git show HEAD:<path>` for `branch:`; `git show <b>:<path>` for `range:`). Skip files **deleted** in this diff.

**Size guards** affecting Step 2 strategy:

- Single file > 1,000 lines → exclude from the changed-files bundle. `lens-code-quality` falls back to diff-only for that file. Note in the report footer.
- Total file content ≥ 100KB → switch to **per-file mode** in Step 2 (one Task per file × per changed-files lens).

### Step 1.5 — Triage (skip if `lenses=` is set or `triage=off`)

Decide which roster lenses are worth running on this diff. Apply these heuristics; mark a lens **enabled** if at least one of its triggers fires.

| Lens                | Enable when…                                                                                                                                                                                                                                                |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lens-bugs`         | Any logic change. Skip only for pure styling/CSS-only diffs or pure rename/move diffs                                                                                                                                                                       |
| `lens-a11y`         | JSX/HTML with a11y-relevant elements or attributes: `<img>`, `<button>`, `<input>`, `<label>`, `<a>`, `<dialog>`, `<video>`, `aria-*`, `role=`, `tabIndex=`, `onClick`, `onKeyDown`, focus styles, `aria-hidden`, contentEditable                            |
| `lens-react-perf`   | React/Next.js patterns: `useEffect`, `useMemo`, `useCallback`, `useState`, `fetch`/`axios` in client code, RSC server-only files, `.map(...)` returning JSX, `addEventListener`, dynamic `import()`, barrel imports from large libs                          |
| `lens-code-quality` | Structural change: new/changed exported function signatures or hook signatures; prop chains spanning 3+ component layers; 4+ files changed; queryKey/cache-key changes; new abstraction extracted into a shared module                                       |
| `lens-security`     | Risk patterns: `dangerouslySetInnerHTML`, `innerHTML`/`outerHTML` assignment, `eval`, `new Function`, `document.write`, `href={...}` from variables, `postMessage`, `target="_blank"`, token-like names in `localStorage`/`sessionStorage`, `process.env.*` outside public prefix, hardcoded long alphanumeric strings, `credentials: 'include'`, `<iframe>`, `<script src=>`, `Math.random()` for IDs/tokens |
| `lens-ts`           | TypeScript files (`.ts`/`.tsx`) with `: any`, `as ` casts, `!` non-null assertion, `// @ts-ignore`, `// @ts-expect-error`, `enum`, exported declarations, generic type parameters                                                                            |

**Be inclusive — when in doubt, enable.** Triage exists to skip *clearly* irrelevant lenses (e.g. don't run `lens-react-perf` on a TypeScript-only utility module change), not to be conservative. False negatives in triage erode trust; false positives just cost a sub-agent run.

The result is your `enabled` set. Compute the **triaged-out** count = `roster size - enabled size` for the report header.

### Step 2 — Dispatch each enabled lens

**2a. Resolve `lenses=`** if the user passed it. Each token matches the roster:

- Exact match (`lens-bugs`) → use it.
- Suffix match: `perf` → `lens-react-perf`, `quality` → `lens-code-quality`, `bugs` → `lens-bugs`, `ts` → `lens-ts`, `a11y` → `lens-a11y`, `security` → `lens-security`
- Ambiguous → ask the user for the full `lens-<name>` form, then stop.
- Unmatched → tell the user the lens isn't in the roster and list the roster, then stop.

If `lenses=` is set, that resolved set **replaces** the triage result.

**2b. Dispatch.** For each enabled lens, issue one `Task` (Agent) tool_use with `subagent_type` = the lens name and the inlined prompt template below. Submitting them as separate calls or as multiple blocks in one message both result in serial execution due to runtime design — don't worry about it, just dispatch them all. The skill's value is in isolation, not concurrency.

For the changed-files lens in per-file mode, issue one Task per (file × lens) pair.

**Inline content, never reference paths.** Place the actual diff text under the ` ```diff ` fence and any file contents under each `=== <path> ===` block. Don't save the diff to `/tmp/...` and tell the sub-agent to Read it.

#### Diff-mode template (`input-mode: diff`)

> Review the diff below and return ONLY a JSON array of findings using your rule catalog and finding schema. No prose, no markdown outside the JSON. Return `[]` if no issues.
>
> ```diff
> <full filtered diff>
> ```

#### Changed-files single-call template (total < 100KB)

> The following files were modified. The diff shows what changed; the full file contents are provided so you can analyze structural properties (cohesion, coupling, full function context).
>
> CRITICAL: Only emit findings for code that appears in the diff hunks. Do NOT flag pre-existing untouched code.
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

#### Changed-files per-file template (total ≥ 100KB; one Task per file)

> The following file was modified. The diff hunks for this file are below; the full file content is provided for structural analysis.
>
> CRITICAL: Only emit findings for code that appears in the diff hunks. Cross-file rules (e.g. `coupling/circular-domain`, `predictability/same-name-divergent-behavior`) may not fire reliably in this mode — skip rather than guess.
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

**Dedupe key:** `file` + overlapping `line_start..line_end` (overlap = ranges intersect). Findings sharing the key from different lenses merge into one issue with a `perspectives[]` array preserving each lens's title, rationale, and suggestion. Merged severity = max across perspectives.

**Filter:** drop anything below `severity_min`.

**Sort:** severity desc → file path asc → line_start asc.

### Step 4 — Render

Use the report template (English or Korean per `lang`). Include triage info in the header.

## Report template (en)

```markdown
# Code Review

> **<scope>** · <N> files · <total> issues · 🔴 <C> · 🟠 <H> · 🟡 <M> · ⚪ <L>
> Lenses: <enabled list>  · <K> triaged out

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
- The `Lenses:` line in the header lists enabled lens short names (without `lens-` prefix). If `K` (triaged out) is 0, omit the `· <K> triaged out` suffix. If user passed `lenses=` or `triage=off`, replace the line with `Lenses: <enabled list>` (no triage count).
- If `<total>` is 0, emit only the H1 + scope/lens header lines + one line: `No issues found.`
- If any sub-agent failed to return parseable JSON, append at the very end after a `---`: `> ⚠️ Lens \`<name>\` failed to return parseable findings and was skipped.`

## Report template (ko)

```markdown
# 코드 리뷰

> **<scope>** · <N> 파일 · <total> 이슈 · 🔴 <C> · 🟠 <H> · 🟡 <M> · ⚪ <L>
> 렌즈: <enabled list> · <K>개 triaged out

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
- `렌즈:` 줄은 활성화된 lens 짧은 이름 나열. `K`(triaged out)가 0이면 `· <K>개 triaged out` 부분 생략. 사용자가 `lenses=` 또는 `triage=off` 명시한 경우는 `렌즈: <list>`만 (triage 카운트 없음).
- `<total>` 이 0이면 H1 + scope/렌즈 헤더 + 한 줄: `이슈를 찾지 못했습니다.`
- sub-agent가 파싱 불가능한 응답을 리턴한 경우, 맨 끝 `---` 뒤에 추가: `> ⚠️ \`<name>\` lens가 결과를 반환하지 못해 건너뛰었습니다.`

## Important

- Do NOT add findings of your own — your job is triage, orchestration, and merging only.
- Triage is **inclusive by default** — when in doubt, enable. The cost of an extra sub-agent run is much smaller than the cost of missing an issue category.
- Keep `title` short (≤8 words). Long explanations go in `rationale`.
- If the same lens reports two findings for overlapping line ranges with different categories, keep both — they're different issues that happen to share location.
