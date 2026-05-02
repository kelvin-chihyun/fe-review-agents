---
name: lens-react-perf
description: Reviews React and Next.js code diffs for runtime performance issues including request waterfalls, RSC serialization bloat, bundle size, missing memoization, and rendering anti-patterns. Based on Vercel React Best Practices. Returns structured JSON findings. Use when reviewing a diff for React or Next.js performance, or when invoked as a sub-agent by the diff-review orchestrator.
---

# lens-react-perf

Performance review lens for React and Next.js diffs. Adapted from [Vercel React Best Practices](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices), focused on rules that are reliably detectable from a diff alone.

## When to use

- Triggered by `diff-review` as a sub-agent
- Or directly: "review this diff for React performance"

## Output

Return ONLY a JSON array of findings — no prose, no markdown, no preamble. If no issues, return `[]`.

Schema per finding:

```json
{
  "file": "string (path from diff header)",
  "line_start": "number (line in the new file)",
  "line_end": "number (line in the new file)",
  "severity": "critical | high | medium | low",
  "category": "string (rule id from list below)",
  "title": "short title, ≤8 words",
  "rationale": "1–2 sentences on why this is a problem",
  "suggestion": "concrete fix"
}
```

## Rules

### Async / waterfalls (high impact)

- **async-parallel** — Two or more independent `await` statements that don't depend on each other. They should run via `Promise.all`. Severity: **high**.

  ```ts
  // bad
  const user = await fetchUser();
  const posts = await fetchPosts();
  // good
  const [user, posts] = await Promise.all([fetchUser(), fetchPosts()]);
  ```

### Server Components / data fetching

- **server-fetch-in-effect** — `useEffect(() => { fetch(...) })` for initial data on a Next.js app-router page. Move to a Server Component and pass via props to eliminate client waterfall. Severity: **high**.

- **server-serialization** — A Server Component passes a large object (full DB row, full API response) to a Client Component when only a few fields are used. Severity: **high**.

- **server-parallel-fetching** — Sequential `await`s in a Server Component for independent data; restructure with composition or `Promise.all`. Severity: **high**.

- **server-no-shared-module-state** — Module-level mutable state (e.g. a `let` counter) inside a Server Component file. Severity: **critical** (causes cross-request leakage).

### Rendering

- **rendering-key-index** — `.map((item, i) => <X key={i} />)` for a list that can reorder, filter, or insert. Severity: **medium**.

- **rendering-key-missing** — `.map(...)` returning JSX without `key`. Severity: **high**.

- **rendering-memo-empty-deps** — `useMemo(() => …, [])` or `useCallback(…, [])` where the body references closure variables from props/state. Severity: **medium** (stale-value bug).

### Client-side

- **client-event-listener-leak** — `window.addEventListener` or `document.addEventListener` inside `useEffect` without cleanup in the return. Severity: **high**.

- **client-passive-listener** — `addEventListener('scroll', …)`, `'wheel'`, `'touchstart'`, `'touchmove'` without `{ passive: true }`. Severity: **medium**.

- **client-localstorage-unbounded** — Writing to `localStorage` inside a render or per-keystroke handler with no size cap or version key. Severity: **medium**.

### Bundle

- **bundle-barrel-import** — `import { x } from 'large-lib'` from a top-level barrel known to be non-tree-shakable (`lodash`, `@mui/material`, `date-fns` legacy). Use deep import. Severity: **medium**.

- **bundle-dynamic-import-missed** — A heavy component (chart lib, editor, markdown renderer) imported statically but used only conditionally (modal, tab). Should be `dynamic(() => import(...))` or `React.lazy`. Severity: **medium**.

- **bundle-server-only-leak** — A library marked server-only (e.g. `fs`, `pg`, large server SDKs) imported at the top of a Client Component file. Causes a Next.js build error. Severity: **critical**.

## Severity guide

- **critical**: causes correctness failure (cross-request state leak, hydration mismatch, infinite render)
- **high**: measurable user-facing regression (TTFB, INP, large bundle add, broken React invariant)
- **medium**: re-render churn, missing optimization where it clearly matters
- **low**: minor patterns, hints

## Important

- Only flag patterns clearly visible in the diff. If a fix would require knowing how the function is called elsewhere, skip it.
- Do NOT flag general "consider memoizing" advice — only flag concrete violations of the rules above.
- The `category` field MUST be one of the rule ids above. Don't invent new ones.
- If two rules apply to the same line, emit two findings — the merger handles dedup.
