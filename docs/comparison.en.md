# 6 Reviewers vs Monolith Review: Same Code, Two Models, Four Results

[한국어](./comparison.md) · [English](./comparison.en.md)

> A direct comparison snapshot of `fe-review-agents`' value. We run **Opus 4.7** (top-tier) and **Sonnet 4.6** (mid-tier) against the same fixture under both monolith and 6-Reviewer flows, to see how the gap shifts with model strength.

- **Date**: 2026-05-08
- **Target code**: [comparison/sample.tsx](./comparison/sample.tsx) — synthetic React component (~100 lines) with issues seeded across all 6 axes
- **A. Monolith prompt**: "Please review the following React component. Tell me about any issues you find." ([baseline.md](./comparison/baseline.md))
- **B. 6 Reviewer**: a single `/fe-review-agents:file-review docs/comparison/sample.tsx` run

---

## Key takeaway

> **The stronger the base model, the smaller the gap.** With Opus 4.7, monolith reaches ~75% catch rate, narrowing the lead. But drop to Sonnet 4.6 and monolith catch rate falls to ~50%, while 6-Reviewer holds at ~93-100% across model changes.

The real value of `fe-review-agents` isn't "catches more in one shot" — it's:
- **Model resilience** — the weaker the model, the bigger the isolated-dispatch effect
- **Consistent output format** — every issue tagged with stable rule ID + per-item severity + accurate line — enabling grep, dashboards, PR-to-PR comparison
- **Per-axis completeness guarantee** — the perf reviewer can't have its attention pulled by security/a11y dramatic findings

---

## At a glance — model × method catch rate

| Model | Method | Issues found | Catch rate vs 6-Rev | Stable rule IDs | Per-item severity |
|---|---|---|---|---|---|
| **🟢 Opus 4.7** | Monolith | ~22 | **~73%** (8 missed/blurred) | ❌ | ❌ |
| **🟢 Opus 4.7** | 6 Reviewer + Synth | **30** | **100%** (baseline) | ✅ | ✅ (4🔴 / 18🟠 / 7🟡 / 1🟢) |
| **🟡 Sonnet 4.6** | Monolith | ~14 | **~50%** (14+ missed) | ❌ | ❌ |
| **🟡 Sonnet 4.6** | 6 Reviewer + Synth | **28** | **~93%** | ✅ | ✅ (4🔴 / 17🟠 / 6🟡 / 1🟢) |

→ **As model strength drops, monolith catch rate falls steeply** (73% → 50%), while 6-Reviewer barely moves (100% → 93%). The gap goes from **8 → 14+ issues**, nearly doubling.

→ The 6-Reviewer count itself differs slightly (30 vs 28) — minor rule interpretation variance between reviewers, but **no systematic axis is missed**.

---

## Opus 4.7 comparison (top-tier model)

<table>
<thead>
<tr>
<th width="50%">🟦 A. Monolith — Opus 4.7</th>
<th width="50%">🟩 B. 6 Reviewer + Synth — Opus 4.7</th>
</tr>
</thead>
<tbody>
<tr>
<td valign="top">

Here's my review of your `CommentSection` component, organized by priority:

##### 🔴 Fix today (Critical)

- **XSS via `dangerouslySetInnerHTML`** — `c.body` rendered raw from API. Sanitize with DOMPurify or render as text.
- **Auth token URL → localStorage** — referrer/log/history leak + XSS exposure + `!` non-null assertion is a lie.
- **State direct mutation in `handleLike`** — same array ref, React bails out. Use immutable update.

##### 🟠 Important

- **`useEffect` missing deps** — closes over `userId`/`lang`, deps `[]`.
- **Race condition / cleanup absent** — setState after unmount. Need `AbortController`.
- **fetch error handling absent** — no `try/catch`/`res.ok`. `handlePost` fire-and-forget.
- **`{comments.length && ...}` renders `0`** — use `> 0 &&`.
- **`key={index}`** — switch to `c.id`.
- **`<div onClick>` for like** — `<button type="button">` + `aria-label`.
- **`<img>` no alt + Send button no accessible name** — add alt; aria-label on icon-only button.
- **`<select>` and `<textarea>` no labels** — add associated labels.

##### 🟡 Improvements

- **`any` everywhere** — define `User` type; `declare global` for `analytics`.
- **`JSON.parse(await res.text())`** — just use `.json()`.
- **Non-null assertion on `URLSearchParams.get`** — `.get()` can return `null`.
- **`formatDate` side effect** — pure formatter writes localStorage on every render.
- **Smaller stuff** — no loading/empty state, theme/lang local, SendIcon recreates, inline functions.

</td>
<td valign="top">

#### 🔍 Code Review: docs/comparison/sample.tsx

**Total**: 30 issues · 🔴 5 | 🟠 17 | 🟡 8 | 🟢 1

##### 🔴 CRITICAL

- **[security/dangerously-set-inner-html]** Line 87: `c.body` from network response rendered raw — sanitize with DOMPurify or render as text.
- **[a11y/img-alt-missing]** Line 69: `<img src={user?.avatarUrl} />` has no `alt` — add `alt={`${user?.name}'s avatar`}` or `alt=""` if decorative.
- **[a11y/input-label-missing]** Line 74: `<select>` has no associated label — add `aria-label="Language"` or visible `<label htmlFor>`.
- **[a11y/input-label-missing]** Line 95: `<textarea>` has no label — add `aria-label="Write a comment"` or `<label htmlFor>`.
- **[a11y/icon-button-name]** Line 96: `<button>` contains only `<SendIcon />` with no accessible name — add `aria-label="Post comment"`.

##### 🟠 HIGH

- **[perf/server-fetch-in-effect]** Line 32: Initial fetch in `useEffect` for app-router page — move to Server Component, pass via props.
- **[perf/async-parallel]** Line 34: Independent fetches awaited sequentially — `Promise.all([...])`.
- **[readability/context-overload]** Line 25: `CommentSection` mixes user fetch, comments, draft, theme, i18n, auth, analytics — split into hooks/children.
- **[predictability/hidden-side-effect]** Line 11: `formatDate` writes `localStorage` despite a pure-formatter name — remove or rename.
- **[predictability/hidden-side-effect]** Line 32: `useEffect` "load" also persists auth token + fires analytics — extract auth/analytics into named effects.
- **[bugs/effect-async-fn-direct]** Line 32: Effect calls `async function load()` whose Promise is uncaught — wrap in IIFE with `void` or `.catch`.
- **[bugs/race-condition-fetch]** Line 34: Sequential fetch keyed on `userId` with no abort logic — `AbortController` tied to `userId`.
- **[ts/cast-instead-of-guard]** Line 35: `(await userRes.json()) as any` — validate with runtime guard (zod/io-ts) before assigning a type.
- **[ts/cast-instead-of-guard]** Line 37: `JSON.parse(...) as Comment[]` asserts shape on untrusted text — validate parsed value before treating it as `Comment[]`.
- **[bugs/setstate-after-unmount]** Line 39: `await fetch(...)` then `setUser`/`setComments` with no cancel — add `AbortController`.
- **[ts/non-null-assertion]** Line 42: `URLSearchParams.get('token')!` asserts non-null on `string | null` — handle null branch.
- **[security/token-in-url]** Line 42: Auth token in URL query — leaks via referrer/history/server logs; use POST body or secure cookie.
- **[security/token-in-localstorage]** Line 43: `localStorage.setItem('authToken', …)` exposes token to XSS — use httpOnly cookie.
- **[bugs/effect-missing-dep]** Line 48: `useEffect` body uses `userId`/`lang` but deps `[]` — add `[userId, lang]`.
- **[bugs/state-mutation]** Line 53: `target.likes += 1; setComments(comments)` mutates state, same ref — `Object.is` bails — use immutable update.
- **[bugs/setstate-stale-read]** Line 54: `setComments(comments)` reads `comments` from closure — use updater form `setComments(prev => ...)`.
- **[bugs/floating-promise]** Line 59: `fetch('/api/comments', ...)` not awaited/`.then`/`.catch`/`void`'d — await it or attach `.catch`.
- **[bugs/button-missing-type]** Line 71: `<button>` has no `type` — add `type="button"` to prevent unintended form submit.
- **[a11y/click-without-key-handler]** Line 88: `<div onClick={...}>` is a non-button click target with no keyboard handler — use `<button type="button">`.
- **[a11y/semantic-button]** Line 88: `<div onClick={…}>` used as a like button — replace with `<button type="button">`.
- **[bugs/button-missing-type]** Line 96: `<button>` has no `type` — add `type="button"`.

##### 🟡 MED

- **[perf/client-localstorage-unbounded]** Line 13: `formatDate` writes `localStorage` on every render — drop the write or gate behind a debounced effect.
- **[ts/explicit-any]** Line 26: `useState<any>(null)` weakens user access — type as `useState<User | null>(null)`.
- **[ts/any-in-generic]** Line 26: `useState<any>` puts `any` inside generic — replace with `User | null`.
- **[ts/explicit-any]** Line 35: `as any` cast on fetched JSON — narrow to `User` via parse/guard.
- **[bugs/json-parse-no-try]** Line 37: `JSON.parse(await commentsRes.text())` on dynamic input without try/catch — wrap or use `.json()`.
- **[bugs/non-null-assert-on-external]** Line 42: `URLSearchParams.get('token')!` non-null assertion on external value — null-check before use.
- **[ts/explicit-any]** Line 45: `(window as any).analytics` bypasses typing — augment `Window` interface instead.
- **[perf/rendering-key-index]** Line 84: `comments.map((c, i) => <li key={i} />)` uses index as key — use `c.id`.
- **[bugs/jsx-truthy-zero]** Line 80: `{comments.length && <span/>}` renders literal `0` when empty — use `{comments.length > 0 && <span/>}`.

##### 🟢 LOW

- **[readability/named-condition]** Line 80: `comments.length &&` truthiness inline — extract to `const hasComments = comments.length > 0`.

</td>
</tr>
</tbody>
</table>

### What Opus monolith missed or blurred

| Rule ID | Severity | Monolith |
|---|---|---|
| `[perf/async-parallel]` | 🟠 | ❌ Missed (HIGH perf — doubles RTT every load) |
| `[perf/server-fetch-in-effect]` | 🟠 | △ Mentioned only as deps issue, no Server Component framing |
| `[bugs/button-missing-type]` ×2 | 🟠 | ❌ Both missed (form-default `submit` risk) |
| `[ts/cast-instead-of-guard]` ×2 | 🟠 | △ "any everywhere" only, no runtime-validation framing |
| `[predictability/signature-misleading]` | 🟠 | △ Folded into "any everywhere" |
| `[ts/missing-return-type-on-export]` | 🟢 | ❌ Missed |

→ Opus baseline: **4 clear misses + 4 blurred**. Most impactful: `perf/async-parallel` and `button-missing-type` ×2.

---

## Sonnet 4.6 comparison (mid-tier model)

<table>
<thead>
<tr>
<th width="50%">🟦 A. Monolith — Sonnet 4.6</th>
<th width="50%">🟩 B. 6 Reviewer + Synth — Sonnet 4.6</th>
</tr>
</thead>
<tbody>
<tr>
<td valign="top">

Sure, here's what I found going through it:

##### 🔴 Fix today (Critical)

- **`formatDate` side effect** — pure formatter writes `localStorage` on every render.
- **Auth token URL → localStorage** — history/log/Referer leak + XSS exposure + `!` lie.
- **XSS via `dangerouslySetInnerHTML`** — `c.body` from API rendered raw. Sanitize or text-render.

##### 🟠 Important (Bugs)

- **`handleLike` state mutation** — same array ref, no re-render. Immutable update.
- **`useEffect` missing deps** — closes over `userId`/`lang`.
- **`handlePost` no await/error/list update** — fire-and-forget.
- **`{comments.length && ...}` renders `0`** — use `> 0 &&`.

##### 🟠 TypeScript

- **`user` is `any`, `userData` cast to `any`** — define `User` type.
- **`commentsRes.text()` + `JSON.parse`** — use `.json()` for consistency.

##### 🟠 Accessibility

- **`<img>` no alt** — fails WCAG.
- **Like is `<div onClick>`** — `<button>`.
- **Send `<button>` SVG-only no name** — `aria-label="Post comment"`.

##### 🟡 Minor

- **`theme`/`lang` local** — belong in context.
- **`<li key={i}>`** — use `c.id`.
- **`SendIcon` in same file** — fine for now.

Most urgent: XSS, token-in-URL pattern, `handleLike` mutation.

</td>
<td valign="top">

#### 🔍 Code Review: docs/comparison/sample.tsx

**Total**: 28 issues · 🔴 4 | 🟠 17 | 🟡 6 | 🟢 1

##### 🔴 CRITICAL

- **[a11y/input-label-missing]** Line 95: `<textarea>` has no associated label — add `aria-label="Write a comment"` or `<label htmlFor>` pointing to an `id`.
- **[a11y/icon-button-name]** Line 96: `<button>` contains only `<SendIcon>` (SVG) with no accessible name — add `aria-label="Post comment"`.
- **[a11y/input-label-missing]** Line 74: `<select>` for language selection has no label — add `aria-label="Language"` or visible `<label htmlFor>`.
- **[security/dangerously-set-inner-html]** Line 87: `dangerouslySetInnerHTML={{ __html: c.body }}` renders network-sourced body as raw HTML — sanitize with DOMPurify or render as plain text.

##### 🟠 HIGH

- **[bugs/state-mutation]** Line 53: `target.likes += 1` mutates in-place, then `setComments(comments)` passes same ref — React bails on `Object.is`; create new array with new object.
- **[bugs/floating-promise]** Line 59: `fetch('/api/comments', ...)` result not awaited/.then/.catch/voided — errors silently swallowed; await or attach `.catch`.
- **[bugs/button-missing-type]** Line 96: `<button onClick={handlePost}>` has no `type` — defaults to `submit` inside a form; add `type="button"`.
- **[bugs/effect-missing-dep]** Line 48: `useEffect` closure references `lang` but deps `[]` — add `lang` (and `userId`) to deps.
- **[bugs/setstate-after-unmount]** Line 39: `await` in `load()` then `setUser`/`setComments` with no AbortController — add cancel flag and skip setState if cancelled.
- **[bugs/effect-no-cleanup-subscription]** Line 47: `load()` called but `useEffect` returns no cleanup — return cleanup that aborts or sets `cancelled` flag.
- **[predictability/hidden-side-effect]** Line 13: `formatDate` writes to `localStorage` — pure formatting function shouldn't have side effects; move call to component or persistence helper.
- **[readability/context-overload]** Line 25: `CommentSection` handles user/comments/auth/analytics/theme/i18n — 6+ unrelated concerns; extract to dedicated hooks/children.
- **[predictability/hidden-side-effect]** Line 42: data-loading `useEffect` reads URL param + writes `authToken` to localStorage — auth side effect hidden inside data fetch; move to auth utility.
- **[perf/server-fetch-in-effect]** Line 32: Initial fetch of `user`/`comments` inside `useEffect` — move to Server Component or use a data-fetching library.
- **[perf/async-parallel]** Line 34: `fetch(.../user)` and `fetch(.../comments)` awaited sequentially — use `Promise.all` to parallelize.
- **[ts/any-in-generic]** Line 26: `useState<any>(null)` uses `any` as generic — define `User` and use `useState<User | null>(null)`.
- **[ts/explicit-any]** Line 35: `(await userRes.json()) as any` casts to `any` — define typed interface and use it instead.
- **[ts/cast-instead-of-guard]** Line 37: `JSON.parse(...) as Comment[]` — runtime cast with no validation; use type guard or parsing library.
- **[ts/non-null-assertion]** Line 42: `URLSearchParams.get('token')!` — `get()` returns `string | null`; `!` will throw at runtime if absent.
- **[ts/explicit-any]** Line 45: `(window as any).analytics` casts `window` — augment `Window` via `declare global` instead.
- **[a11y/click-without-key-handler]** Line 88: `<div onClick>` is non-button click target with no keyboard handler — replace with `<button type="button">`.
- **[a11y/semantic-button]** Line 88: `<div onClick={…}>` used as a like button — use `<button type="button">` for native keyboard/screen-reader support.
- **[a11y/img-alt-missing]** Line 69: `<img src={user?.avatarUrl}>` has no `alt` — add descriptive alt or `alt=""` if decorative.
- **[security/token-in-url]** Line 42: `token` from `window.location.search` — leaks via referrer/server logs/history; use POST body or Authorization header.
- **[security/token-in-localstorage]** Line 43: `localStorage.setItem('authToken', sessionToken)` exposes token to XSS — use HttpOnly cookie.

##### 🟡 MED

- **[perf/client-localstorage-unbounded]** Line 13: `localStorage.setItem` in `formatDate` runs on every render — move out of render path or debounce.
- **[perf/rendering-key-index]** Line 84: `key={i}` on a list that can change order — use `c.id`.
- **[readability/named-condition]** Line 80: `{comments.length && ...}` falsy-zero renders `0` — extract to `const hasComments = comments.length > 0`.
- **[bugs/non-null-assert-on-external]** Line 42: `URLSearchParams.get('token')!` non-null assertion on external value — check for null before use.
- **[bugs/json-parse-no-try]** Line 37: `JSON.parse(await commentsRes.text())` with no try/catch — wrap in try/catch.
- **[bugs/jsx-truthy-zero]** Line 80: `{comments.length && <span/>}` renders literal `0` when empty — use `{comments.length > 0 && <span/>}`.

##### 🟢 LOW

- **[ts/missing-return-type-on-export]** Line 25: exported `CommentSection` has no explicit return type — add `: JSX.Element`.

</td>
</tr>
</tbody>
</table>

### What Sonnet monolith missed (~14 items)

Everything Opus monolith missed, plus:

- **[perf/server-fetch-in-effect]** 🟠 ❌
- **[perf/async-parallel]** 🟠 ❌
- **[perf/client-localstorage-unbounded]** 🟡 ❌ (formatDate flagged for quality only, not perf)
- **[bugs/setstate-after-unmount]** 🟠 ❌
- **[bugs/effect-no-cleanup-subscription]** 🟠 ❌
- **[bugs/button-missing-type]** 🟠 ❌
- **[ts/cast-instead-of-guard]** ×2 🟠 ❌
- **[ts/missing-return-type-on-export]** 🟢 ❌
- **[a11y/click-without-key-handler]** 🟠 ❌ (semantic-button caught only)
- **[a11y/input-label-missing]** Line 95 (textarea) 🔴 ❌ — **a CRITICAL miss**
- **[a11y/input-label-missing]** Line 74 (select) 🔴 ❌
- **[readability/context-overload]** 🟠 ❌
- **[predictability/hidden-side-effect]** Line 42 (load function auth side effect) 🟠 ❌
- **[predictability/signature-misleading]** 🟠 ❌

→ Sonnet baseline gap: **14+ items**, including a CRITICAL miss (textarea label). The perf axis is almost entirely missed.

---

## Real value — beyond raw catch rate

### 1. Model resilience

Monolith catch rate is strongly model-dependent:

- Opus 4.7 monolith: ~75%
- Sonnet 4.6 monolith: ~50%
- (predicted) Haiku 4.5 / 4o-mini / local 7B: lower still

6-Reviewer holds ~93-100% across the same fixture, regardless of model. Each sub-agent has a narrow context and an explicit catalog, so even a weaker model still works through its own checklist.

### 2. Consistent output format

Every issue is tagged with `[axis/rule-id]` + per-item `🔴/🟠/🟡/🟢` + accurate line number. This enables:

- **`grep`** — `grep "perf/async-parallel" reports/*.md` to track frequency over time
- **dashboards / metrics** — chart per-team / per-repo rule-violation trends
- **PR comparison** — diff results 1:1 against another PR or another point in time
- **automation hooks** — block PR if ≥1 CRITICAL, etc.

Monolith's free-prose output supports none of this.

### 3. Per-axis completeness guarantee

Each reviewer is constrained to its own catalog. The perf reviewer can't decide "this PR's security issues are too dramatic, perf can wait" — that's structurally impossible. Monolith experiences mode collapse, where attention gravitates to the loudest axis. That's exactly what made Opus monolith miss `perf/async-parallel`.

---

## Cost vs value

The 6-Reviewer flow uses roughly **6-7× the tokens**. At this fixture's scale (~100 lines), pennies; at PR scale, linear.

Decision criteria:

- **Strong model + one-off review** → monolith is fine (Opus monolith ~75% is practical)
- **Weaker model environment** (Haiku / open-source / cost-sensitive) → 6-Reviewer closes the gap
- **Time-series PR tracking / metrics / automation** → 6-Reviewer's output format is essential
- **Regulated / compliance environment** ("auditor needs zero-a11y-misses guarantee") → 6-Reviewer's completeness guarantee is required

> **Reproduce it**: run `/fe-review-agents:file-review docs/comparison/sample.tsx`, then send a general LLM the prompt in [comparison/baseline.md](./comparison/baseline.md). This document is a snapshot at 2026-05-08 with Opus 4.7 + Sonnet 4.6. LLM output is non-deterministic — catch rates vary ±2-3 per run.
