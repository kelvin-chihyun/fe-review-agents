---
name: fe-review-file-review
description: Use for the single-file workflow of fe-review-agents. Reviews one frontend file with six isolated reviewers and one synthesizer.
---

# FE Review File Review

Use this skill when the user provides a specific file path and wants a deep file audit.

## Codex-first examples

- `$fe-review-agents:fe-review-file-review src/components/Header.tsx`
- `$fe-review-agents:fe-review-file-review src/components/Header.tsx severity_min=HIGH`
- `$fe-review-agents:fe-review-file-review apps/web/src/App.tsx lang=en`

## Options

- Supported language option: `lang=ko|en`
- Supported severity filter: `severity_min=LOW|MED|HIGH|CRITICAL`

## Execution

Follow `../../commands/file-review.md` exactly.

- Keep the six-reviewer fan-out in one assistant message.
- Keep the final `synthesizer` pass.
- Return the synthesized report verbatim unless the workflow itself requires an early clarification.
