---
name: lens-a11y
input-mode: diff
description: Reviews frontend code diffs for accessibility issues based on WCAG 2.2 and ARIA Authoring Practices. Detects missing alt text, unnamed icon buttons, broken keyboard navigation, ARIA misuse, focus management bugs, and inaccessible form patterns. Returns structured JSON findings. Use when reviewing diffs for accessibility (a11y), or when invoked as a sub-agent by the diff-review orchestrator.
user-invocable: true
---

# lens-a11y

Accessibility review lens. Based on WCAG 2.2 success criteria and the W3C ARIA Authoring Practices Guide, narrowed to issues that are detectable from a diff alone (without runtime DOM or screen-reader testing).

## When to use

- Triggered by `diff-review` as a sub-agent
- Or directly: "review this diff for a11y / accessibility"

## Output

Return ONLY a JSON array of findings — no prose. Same schema as `lens-react-perf`. Return `[]` if no issues.

## Rules

### Semantic HTML

- **a11y/semantic-button** — `<div onClick={…}>` or `<span onClick={…}>` used as an interactive button. Loses keyboard activation (Enter/Space), focus, and the implicit `role="button"`. Use `<button type="button">`. Severity: **high**.

- **a11y/semantic-link** — `<div onClick={() => router.push(…)}>` or similar used as a link. Use `<a>` or the framework's `<Link>` so it gets keyboard, right-click, and middle-click for free. Severity: **high**.

- **a11y/heading-skip** — Heading levels jumping (e.g. `<h1>` followed directly by `<h3>` with no `<h2>` between in the same section). Severity: **low**. **Skip** if the diff doesn't show the parent section's heading hierarchy — false positives are common when only one component is visible (the missing `<h2>` may live in a parent component).

- **a11y/list-without-list** — A series of repeated items rendered with `<div>`s that should be `<ul>` or `<ol>`. Severity: **low**.

### Names and labels

- **a11y/img-alt-missing** — `<img src=…>` without an `alt` attribute. (Decorative images should explicitly use `alt=""`, not omit the attribute.) Severity: **critical** if the image clearly conveys information, **high** otherwise.

- **a11y/icon-button-name** — A `<button>` whose only child is an icon (SVG, icon component) and which has no `aria-label`, no `aria-labelledby`, and no visually hidden text. Severity: **critical**.

- **a11y/input-label-missing** — `<input>` (other than `type="hidden"`, `"submit"`, `"button"`) without an associated `<label htmlFor>`, `aria-label`, or `aria-labelledby`. Severity: **critical**.

- **a11y/dialog-name-missing** — A modal/dialog component without `aria-labelledby` pointing to its title. Severity: **high**.

### Keyboard and focus

- **a11y/positive-tabindex** — `tabIndex={1}` (or any positive number) on any element. Breaks the natural tab order. Use `0` for "in tab order" and `-1` for "programmatically focusable but not in tab order". Severity: **high**.

- **a11y/click-without-key-handler** — A non-button element with `onClick` but no `onKeyDown` handling Enter and Space. (If you can't use `<button>`, you must replicate keyboard activation.) Severity: **high**.

- **a11y/autofocus-form** — `autoFocus` on inputs in regular forms (acceptable in modals, but disorienting on page load). Severity: **medium**.

- **a11y/focus-visible-removed** — CSS that removes `:focus` outline globally without providing a `:focus-visible` replacement (`outline: none` on `*`, `button { outline: none }` etc.). Severity: **high**.

### ARIA misuse

- **a11y/aria-redundant** — `role="button"` on an actual `<button>`, `role="navigation"` on a `<nav>`, etc. ARIA must not duplicate native semantics. Severity: **medium**.

- **a11y/aria-hidden-on-focusable** — `aria-hidden="true"` on an element that is focusable (button, link, input, or contains one). Creates "ghost focus" where keyboard users land on something invisible to AT. Severity: **high**.

- **a11y/aria-invalid-relationship** — `aria-labelledby="x"`, `aria-describedby="x"`, or `aria-controls="x"` referencing an id that doesn't exist anywhere visible in the diff. Severity: **medium** (best-effort; full check needs whole codebase).

- **a11y/aria-attr-on-wrong-element** — `aria-checked` on a non-checkable element, `aria-expanded` on a non-disclosing element, etc. Severity: **medium**.

### Forms

- **a11y/form-error-not-associated** — A visible error message rendered for an invalid input without being linked via `aria-describedby` or `aria-errormessage`. Severity: **high**.

- **a11y/required-asterisk-only** — Required field marked only with a `*` glyph, no `aria-required`, no `required`, and no "required" text. Screen readers won't announce it. Severity: **medium**.

### Media

- **a11y/video-no-captions** — `<video>` element without a `<track kind="captions">` child. Severity: **high**.

- **a11y/contenteditable-no-name** — `contentEditable` element without a label/name. Severity: **high**.

## Severity guide

- **critical**: completely blocks AT users (button or input with no name, modal that traps invisible focus, important image with no alt)
- **high**: significant barrier (broken keyboard nav, hidden focus on focusable elements, removed focus indicator)
- **medium**: degraded experience (autofocus on form, redundant ARIA, missing required announcement)
- **low**: minor structural issues

## Important

- `<img alt="">` (empty alt) is CORRECT for purely decorative images. Don't flag it.
- Don't flag `<input type="hidden">` for missing label.
- If the codebase uses Headless UI, Radix UI, React Aria, or similar accessible primitives, assume they handle ARIA and focus correctly UNLESS the diff visibly disables it (`aria-hidden`, removed focus styles, replaced root element).
- `category` field MUST be one of the rule ids above.
- For images, if you can't tell whether it's decorative or informative from the diff, flag at **high** with rationale "alt missing — verify whether image is decorative".
