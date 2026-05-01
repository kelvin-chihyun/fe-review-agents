---
name: lens-security
input-mode: diff
description: Reviews frontend code diffs for security issues including XSS vectors (dangerouslySetInnerHTML, innerHTML, javascript: URLs), secret and PII leakage (env vars in client code, tokens in localStorage, hardcoded keys), unsafe link and iframe patterns, and dangerous JS APIs (eval, new Function). Returns structured JSON findings. Use when reviewing diffs for frontend security, or when invoked as a sub-agent by the diff-review orchestrator.
user-invocable: true
---

# lens-security

Security review lens for frontend code. Focused on patterns that can be detected from a diff alone — no SAST tooling, no dependency CVE scanning. The aim is to catch the high-leverage frontend-specific risks.

## When to use

- Triggered by `diff-review` as a sub-agent
- Or directly: "review this diff for security"

## Output

Return ONLY a JSON array of findings — no prose. Same schema as `lens-react-perf`. Return `[]` if no issues.

## Rules

### XSS vectors

- **security/dangerously-set-inner-html** — `dangerouslySetInnerHTML={{ __html: x }}` where `x` is anything other than a literal string constant. Severity: **critical** if the value clearly traces to props, network, or user input; **medium** if the source is unclear (require explicit review).

- **security/innerhtml-assignment** — Direct `el.innerHTML = …` or `outerHTML = …` with non-static content. Severity: **critical** for non-static, **medium** for unclear.

- **security/href-user-input** — `<a href={x}>` or `window.location = x` where `x` could resolve to a `javascript:` URL. Validate the scheme is `http(s):` or use a URL allowlist. Severity: **high**.

- **security/eval-or-function** — Use of `eval()`, `new Function(...)`, or `setTimeout`/`setInterval` with a string first argument. Severity: **critical**.

- **security/document-write** — `document.write` or `document.writeln`. Severity: **high**.

### Secrets and data leakage

- **security/hardcoded-secret** — Strings matching common API key patterns (e.g. `sk_live_…`, `AIza…`, `xox[bp]-…`, AWS access keys, stripe keys, raw JWT structure with three base64 segments) in committed code. Severity: **critical**.

- **security/server-env-in-client** — `process.env.X` (where X is NOT prefixed `NEXT_PUBLIC_`, `VITE_`, `REACT_APP_`, `PUBLIC_`, or otherwise marked public for the framework) referenced in a file that is clearly client-side (uses `"use client"`, hooks, browser APIs, or sits in a routes/components folder). The variable will be `undefined` at runtime AND signals confusion about the boundary. Severity: **high**.

- **security/public-env-secret-name** — `NEXT_PUBLIC_*` or other public-prefixed env var with a name containing `SECRET`, `PRIVATE`, `KEY`, `TOKEN`, `PASSWORD` — these get bundled into client JS. Severity: **critical**.

- **security/console-log-sensitive** — `console.log`/`console.error` of variables with names suggesting auth or PII (`token`, `password`, `creditCard`, `ssn`, `authHeader`, `Authorization`, `cookie`). Severity: **high**.

### Auth storage

- **security/token-in-localstorage** — `localStorage.setItem(k, …)` or `sessionStorage.setItem(k, …)` where `k` or the value variable name suggests an auth token (`token`, `accessToken`, `idToken`, `jwt`, `auth`, `session`, `apiKey`, `bearer`). Vulnerable to XSS exfiltration; prefer httpOnly cookies. Severity: **high**.

- **security/token-in-url** — Tokens passed as URL query params (e.g. `?token=…`, `?access_token=…`) constructed from a variable. Tokens leak via referrer headers, server logs, browser history. Severity: **high**.

### External links and embeds

- **security/target-blank-no-noopener** — `<a target="_blank">` without `rel="noopener noreferrer"` (or at minimum `rel="noopener"`). Modern browsers (Chrome 88+, Firefox 79+) auto-apply `noopener` for `target="_blank"`, so this is largely defensive. Severity: **low**.

- **security/iframe-no-sandbox** — `<iframe src={x}>` for non-same-origin content without a `sandbox` attribute. Severity: **medium**.

- **security/postmessage-no-origin-check** — `window.addEventListener('message', handler)` where the handler body doesn't reference `event.origin` or `e.origin`. Severity: **high**.

### Resources and dependencies

- **security/script-cdn-no-sri** — `<script src="https://…">` (third-party CDN, not a same-origin path) without `integrity=…` and `crossOrigin="anonymous"`. Severity: **medium**.

- **security/cors-credentials-wildcard** — `fetch(…, { credentials: 'include' })` paired with a request to a domain that serves `Access-Control-Allow-Origin: *` would fail; flag mixed `credentials: 'include'` with non-allowlisted origins where detectable. Severity: **medium**.

### Crypto and randomness

- **security/math-random-for-security** — `Math.random()` used to generate something with `id`, `token`, `nonce`, `secret`, `key`, `password` in the name or context. Use `crypto.getRandomValues` or `crypto.randomUUID`. Severity: **high**.

## Severity guide

- **critical**: directly exploitable XSS, exposed secret in code, secret-name in public env, dangerous JS API
- **high**: likely exploitable depending on upstream validation, broken auth storage pattern, missing origin check
- **medium**: hardening recommendations, defense in depth
- **low**: nits

## Important

- For `dangerouslySetInnerHTML`: even if the value looks safe in the diff, flag at **medium** to require explicit reviewer attention. If the value clearly traces to user/network input without sanitization, escalate to **critical**.
- Don't flag `process.env.NODE_ENV` or other build-time-only values.
- Skip findings in test files (`*.test.*`, `*.spec.*`, `__tests__/**`, `e2e/**`) UNLESS the issue is `hardcoded-secret` (which is severe regardless of file type).
- Skip findings in storybook files (`*.stories.*`).
- `category` field MUST be one of the rule ids above.
