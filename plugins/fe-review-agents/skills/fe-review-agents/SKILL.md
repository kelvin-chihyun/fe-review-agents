---
name: fe-review-agents
description: Use for Codex-native multi-reviewer frontend review on either a git diff or a single file. Routes to the canonical diff-review or file-review workflow in this plugin.
---

# FE Review Agents

Use this skill when the user wants a frontend-focused review from multiple independent reviewers rather than a single generic pass.

## Codex-first examples

- `$fe-review-agents:fe-review-agents Review my staged frontend changes`
- `$fe-review-agents:fe-review-agents Review src/components/Header.tsx severity_min=HIGH`
- `$fe-review-agents:fe-review-agents Audit branch:main lang=en`

## Routing

- If the request includes an explicit file path, use the file-review workflow.
- Otherwise use the diff-review workflow.
- Default language is `ko`.
- Supported language option: `lang=ko|en`
- Supported severity filter: `severity_min=LOW|MED|HIGH|CRITICAL`
- Supported diff scopes: `staged`, `unstaged`, `branch:<name>`, `range:<a>..<b>`

## Execution

- For file review, follow `../../commands/file-review.md` exactly.
- For diff review, follow `../../commands/diff-review.md` exactly.
- Preserve the six-reviewer fan-out and the final `synthesizer` pass.
- Do not fall back to a generic review when the workflow matches this plugin.

## Output

Return only the synthesized review report unless the selected workflow explicitly requires a warning or an early-exit message.
