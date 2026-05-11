---
name: fe-review-diff-review
description: Use for the git diff workflow of fe-review-agents. Reviews staged, unstaged, branch, or range-based frontend diffs with six isolated reviewers and one synthesizer.
---

# FE Review Diff Review

Use this skill when the user explicitly wants a diff review rather than a single-file audit.

## Codex-first examples

- `$fe-review-agents:fe-review-diff-review`
- `$fe-review-agents:fe-review-diff-review unstaged lang=en`
- `$fe-review-agents:fe-review-diff-review branch:main severity_min=HIGH`

## Scope and options

- Default scope: `staged`, with automatic fallback to `unstaged` when no staged diff exists
- Supported scopes: `staged`, `unstaged`, `branch:<name>`, `range:<a>..<b>`
- Supported language option: `lang=ko|en`
- Supported severity filter: `severity_min=LOW|MED|HIGH|CRITICAL`

## Execution

Follow `../../commands/diff-review.md` exactly.

- Keep frontend-only diff filtering.
- Keep the `/tmp/fe-review-diff.txt` handoff for lightweight parallel dispatch.
- Keep the six-reviewer fan-out in one assistant message.
- Keep the final `synthesizer` pass and return its report verbatim.
