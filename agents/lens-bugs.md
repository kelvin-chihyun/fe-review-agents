---
name: lens-bugs
description: Reviews frontend code diffs for correctness bugs across React/Next.js (rules-of-hooks, stale closures, effect deps, JSX traps), JavaScript/TypeScript (floating promises, empty catches, loose equality, JSON.parse without try), and HTML/CSS (button missing type, 100vh on mobile). Returns structured JSON findings. Use when reviewing diffs for frontend correctness bugs, or when invoked as a sub-agent by the diff-review orchestrator.
---

# lens-bugs

Frontend correctness lens. Adapted from React official docs + the `react-hooks` ESLint catalog + ESLint/TypeScript-ESLint core rules + common HTML/CSS traps, narrowed to bugs that are reliably detectable from a diff alone. The aim is to catch "this code is just wrong" — bugs perf, quality, a11y, and security lenses leave on the table.

## When to use

- Triggered by `diff-review` as a sub-agent
- Or directly: "review this diff for bugs / correctness"

## Output

Return ONLY a JSON array of findings — no prose. Same schema as `lens-react-perf`. Return `[]` if no issues.

Every `category` MUST start with `bugs/`.

## Rules

### Hooks: rules-of-hooks violations

- **bugs/conditional-hook** — A hook called inside `if`, ternary, `&&`, loop, or `try/catch`. Breaks React's hook ordering invariant. Severity: **critical**.

  ```tsx
  // bad
  if (open) {
    const [x, setX] = useState(0);
  }
  // good
  const [x, setX] = useState(0);
  if (open) {
    /* use x */
  }
  ```

- **bugs/hook-in-non-component** — `useState` / `useEffect` / etc. called in a regular function (name doesn't start with `use` and isn't a component starting with uppercase). Severity: **critical**.

- **bugs/hook-after-conditional-return** — Any `return null` / `if (...) return ...` _before_ a hook call in the same function body. The hook is skipped on early-return paths, breaking ordering. Severity: **critical**.

### Effect dependencies

- **bugs/effect-missing-dep** — `useEffect` / `useMemo` / `useCallback` whose body references a prop, state, or closed-over variable that is not in the deps array. Severity: **high**.

- **bugs/effect-stale-closure** — `setInterval`, `setTimeout`, an event listener, or an async chain inside `useEffect` with empty `[]` deps that references state. The closure captures the initial value forever. Severity: **high**.

- **bugs/effect-function-dep** — A function defined in component scope passed as a `useEffect` dep without `useCallback`. New reference every render → effect re-fires every render. Severity: **medium**. **Skip** if the function is wrapped in `useCallback`, imported from another module, or is a known stable reference (e.g. a `useState` setter, `useRef.current`). Conservative bias — only flag when the function is clearly inline-defined and the effect body has visible side effects (network, DOM, subscription).

- **bugs/effect-object-array-dep** — An object or array literal (`{...}`, `[...]`) inlined **as an element** in a `useEffect`/`useMemo`/`useCallback` deps array (e.g. `useEffect(() => {}, [{a: 1}])`). New reference every render → effect re-fires every render. Severity: **medium**. (The empty deps `[]` pattern itself is fine — this rule is about literals nested inside deps.)

- **bugs/effect-async-fn-direct** — `useEffect(async () => {...})`. The effect callback must not be async — it implicitly returns a Promise that React mistakes for a cleanup function. Severity: **high**.
  ```tsx
  // bad
  useEffect(async () => {
    await load();
  }, []);
  // good
  useEffect(() => {
    (async () => {
      await load();
    })();
  }, []);
  ```

### State updates

- **bugs/state-mutation** — Direct mutation of state followed by `setX(state)`: `state.foo = 1; setState(state)` or `arr.push(...); setArr(arr)`. React bails via `Object.is`, the UI doesn't update. Severity: **high**.

- **bugs/setstate-stale-read** — `setX(x + 1)` (or any `setX(<expr involving x>)`) inside an async callback, batched event handler, or loop. Use the updater form. Severity: **high**.

  ```tsx
  // bad
  setCount(count + 1);
  setCount(count + 1);
  // good
  setCount((c) => c + 1);
  setCount((c) => c + 1);
  ```

- **bugs/derived-state-in-state** — A `useState` initialized from props that's then never reconciled when the prop changes (no `useEffect` syncing, no `key` reset). The internal value silently drifts. Severity: **medium**.

- **bugs/setstate-in-render** — `setX(...)` called unconditionally in the render body (not inside an effect, handler, or guarded by an equality check). Causes infinite render loop. Severity: **critical**.

### Async / lifecycle race conditions

- **bugs/setstate-after-unmount** — An `await` inside `useEffect` followed by `setState` with no cleanup flag (`let cancelled = false; return () => { cancelled = true }`) or `AbortController`. The component may unmount before the promise resolves. Severity: **high**.

- **bugs/effect-no-cleanup-subscription** — Subscriptions inside `useEffect` (event listener, observer, websocket, interval, timeout, RxJS subscription) without a return cleanup. Severity: **high**.

- **bugs/race-condition-fetch** — Sequential dependent fetches inside `useEffect` driven by a fast-changing input (search query, route param) without abort/cancel logic. An older response can overwrite a newer one. Severity: **high**.

### JSX correctness

- **bugs/jsx-truthy-zero** — `{count && <X/>}` where `count` is a number. Renders literal `0` when count is 0. Use `{count > 0 && <X/>}` or `{!!count && ...}`. Severity: **medium**.

- **bugs/jsx-nested-component** — A component defined inside another component's body. Re-creates the type identity every render → entire subtree unmounts/remounts on every parent render, losing local state and effects. Severity: **high**.

- **bugs/jsx-controlled-uncontrolled-switch** — `<input value={x ?? undefined}>` or `value={x || ''}` where `x` flips between `undefined` and a string. React warns about switching between controlled and uncontrolled. Severity: **medium**.

- **bugs/jsx-onclick-call** — `onClick={handler()}` instead of `onClick={handler}`. The handler is called during render and its return value is bound. Severity: **high**.

- **bugs/jsx-spread-key** — `<X key={i} {...props} />` where `props` may contain its own `key`. The spread can override the explicit key. Severity: **medium**.

### Next.js specific

- **bugs/next-use-client-async** — A file with `"use client"` that exports an async component. Async components must be Server Components. Severity: **high**.

- **bugs/next-server-action-no-revalidate** — A function with `"use server"` that mutates data (`db.update`, `fetch` with POST/PUT/DELETE) without calling `revalidatePath` or `revalidateTag`. UI shows stale data. Severity: **medium**.

- **bugs/next-route-handler-no-return** — An app-router `route.ts` handler that doesn't return a `Response` / `NextResponse` on all code paths. Severity: **high**.

### JavaScript / TypeScript correctness

- **bugs/floating-promise** — An `async` function or known-promise-returning call (`fetch`, `axios.*`) invoked without `await`, `return`, `.then`, `.catch`, or an explicit `void`. Rejections vanish into `unhandledrejection` and the caller has no idea it failed. Severity: **high**.

- **bugs/empty-catch** — `catch {}` or `catch (e) {}` with no body. Errors are silently swallowed; if the swallow is intentional, leave a comment explaining why. Severity: **high**.

- **bugs/loose-equality** — `==` or `!=` used. Coercion produces unintuitive results (`'' == 0`, `[] == false`). Use `===` / `!==`. Severity: **low**. (Modern codebases typically have ESLint catching this — flag only when present in the diff.)

  ```ts
  // bad
  if (count == 0) {
  }
  // good
  if (count === 0) {
  }
  ```

- **bugs/typeof-null-object** — `typeof x === 'object'` used as an "is object" check without a separate null guard. `typeof null === 'object'`, so null passes. Severity: **medium**.

- **bugs/json-parse-no-try** — `JSON.parse(x)` with no surrounding `try/catch` where `x` is dynamic input (network response, `localStorage`, URL/query param, message event). One malformed byte throws. Severity: **medium**.

- **bugs/non-null-assert-on-external** — `!` non-null assertion applied to an external boundary value: `await fetch(...).json()` result, `JSON.parse` result, `URLSearchParams.get(...)`, `document.querySelector(...)`, `event.target` cast. If null/undefined at runtime, it throws immediately. Severity: **medium**.

### HTML correctness

- **bugs/button-missing-type** — `<button>` without an explicit `type` attribute. Inside a `<form>` the default is `submit`, causing accidental form submissions / page reloads. Always specify `type="button"`, `"submit"`, or `"reset"`. Severity: **high**.
  ```tsx
  // bad
  <button onClick={openModal}>Open</button>
  // good
  <button type="button" onClick={openModal}>Open</button>
  ```

### CSS correctness

- **bugs/css-100vh-mobile** — `height: 100vh` or `min-height: 100vh` ignores the mobile browser address-bar area, so the element extends below the visible viewport. Use `100dvh` (dynamic viewport), `100svh` (small viewport), or a JS-based `--vh` fallback. Severity: **medium**.

## Severity guide

- **critical**: breaks a React invariant (hook ordering, infinite render) — the component is structurally broken
- **high**: silent runtime bug (stale state, race, swallowed error, accidental form submit, leaked subscription)
- **medium**: common trap that bites under specific conditions (coercion, mobile viewport, type assertion on external data)
- **low**: minor patterns (rarely used here — most correctness bugs justify medium or above)

## Important

- This lens is about **correctness**, not performance, maintainability, accessibility, or security. Cross-lens boundaries:
  - Performance-only issues (waterfalls, bundle, rendering churn from missing memo) → `lens-react-perf`
  - Maintainability / naming / cohesion / FF four-axes → `lens-code-quality`
  - Accessibility (alt text, ARIA, keyboard, focus) → `lens-a11y`. Note: `<button>` missing `type` lives here, not in a11y, because the bug is _runtime form submission_, not screen-reader output.
  - XSS, secrets, unsafe storage → `lens-security`
- "Missing `key` on `.map`" is owned by `lens-react-perf` (`rendering-key-missing`). Do NOT emit it here.
- "useEffect for initial fetch" is owned by `lens-react-perf` (`server-fetch-in-effect`). Do NOT emit it here.
- `bugs/setstate-after-unmount` and `lens-code-quality`'s `predictability/hidden-side-effect` may both fire on the same effect block — that's fine. Different perspectives on the same code; the merger preserves both.
- `bugs/non-null-assert-on-external` is adjacent to `predictability/signature-misleading` but the focus is different (runtime throw vs. lying signature). Both can emit.
- `bugs/non-null-assert-on-external` and `lens-ts`'s `ts/non-null-assertion` may both fire on the same `!` — the former sees a runtime throw risk, the latter sees a lie to the type system. Both can emit; the merger preserves the perspectives. Same applies to `bugs/json-parse-no-try` and `ts/cast-instead-of-guard` on a `JSON.parse(...) as Foo` line.
- Skip findings in test files (`*.test.*`, `*.spec.*`, `__tests__/**`, `e2e/**`) and storybook files (`*.stories.*`).
- Don't speculate beyond the diff. If determining whether a hook is conditional requires reasoning about a function called from elsewhere, skip it.
- For `bugs/effect-missing-dep`: if the missing variable is `ref.current` or a setter from `useState` (which is stable by guarantee), do NOT flag.
- For `bugs/floating-promise`: if the call is explicitly prefixed with `void` (`void fetch(...)`), it's intentional fire-and-forget — skip.
- The `category` field MUST be one of the rule ids above. Don't invent new ones.
- If two rules apply to the same line, emit two findings — the merger handles dedup.
