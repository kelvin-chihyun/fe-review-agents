# FE Review Agents

Skill-first frontend code review plugin for Codex, with Claude Code slash-command compatibility preserved.

## Primary interfaces

- Codex skill router: `$fe-review-agents:fe-review-agents`
- Codex diff workflow: `$fe-review-agents:fe-review-diff-review`
- Codex file workflow: `$fe-review-agents:fe-review-file-review`
- Claude Code diff workflow: `/fe-review-agents:diff-review`
- Claude Code file workflow: `/fe-review-agents:file-review`

## What ships in this plugin root

- `.codex-plugin/plugin.json`
- `plugin.lock.json`
- `skills/`
- `agents/`
- `commands/`

This directory is the canonical Codex plugin package. Repository-root `agents/` and `commands/` are synchronized compatibility mirrors for Claude Code.

## Codex usage

```text
$fe-review-agents:fe-review-agents Review my staged frontend changes
$fe-review-agents:fe-review-diff-review branch:main severity_min=HIGH
$fe-review-agents:fe-review-file-review src/components/Header.tsx lang=en
```

The router skill chooses file-review when the request includes an explicit file path. Otherwise it chooses diff-review.

## Claude Code usage

```text
/fe-review-agents:diff-review staged
/fe-review-agents:file-review src/components/Header.tsx
```

## Development notes

- Edit plugin workflows in this directory first.
- Run `node scripts/sync-claude-surface.mjs` from the repo root after changing `agents/` or `commands/`.
- Run `node tests/validate-plugin-structure.mjs` before claiming the package layout is valid.
