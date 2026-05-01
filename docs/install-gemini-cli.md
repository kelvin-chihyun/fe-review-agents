# Installing fe-review-skills for Gemini CLI

> **Best-effort parity.** Claude Code is the primary target — its skill discovery system maps `/diff-review` to a fully orchestrated workflow with input-mode routing, size guards, and merge logic. Gemini CLI doesn't expose an equivalent skill system, so `fe-review-skills` installs only the **6 lens agents** for Gemini and you compose the orchestration via natural language.

## Recommended: CLI install

```bash
# Project-level
npx fe-review-skills install gemini-cli

# Globally
npx fe-review-skills install gemini-cli --global

# Preview without writing
npx fe-review-skills install gemini-cli --dry-run
```

What the CLI does:

- Flattens each `skills/lens-*/SKILL.md` from the package to `.gemini/agents/lens-<name>.md` (or `~/.gemini/agents/` with `--global`).
- 6 lens agents: `lens-react-perf.md`, `lens-bugs.md`, `lens-ts.md`, `lens-code-quality.md`, `lens-a11y.md`, `lens-security.md`.
- The `diff-review` orchestrator is **intentionally not installed** — Gemini doesn't have skill discovery, so a parallel orchestrator skill wouldn't be triggered automatically.

## Manual install (no Node required)

```bash
git clone https://github.com/huurray/fe-review-skills.git /tmp/fe-review-skills

mkdir -p .gemini/agents
for d in /tmp/fe-review-skills/skills/lens-*; do
  cp "$d/SKILL.md" ".gemini/agents/$(basename "$d").md"
done
```

For a global install, swap `.gemini` for `~/.gemini`.

## Verify installation

```bash
ls .gemini/agents/
# lens-a11y.md  lens-bugs.md  lens-code-quality.md  lens-react-perf.md  lens-security.md  lens-ts.md
```

## Usage

Gemini doesn't auto-orchestrate parallel lens calls — you compose them in your prompt:

```
> Review my staged changes with every installed lens (perf, bugs, ts, code quality, a11y, security)
  in parallel. Each lens returns JSON findings; deduplicate by file:line range and sort by severity
  (critical → high → medium → low). Print one report.
```

For a single lens:

```
> @lens-a11y review src/components/Header.tsx for accessibility issues.
```

## Why no orchestrator?

The orchestrator (`diff-review`) is a Claude Code skill that uses Claude's `Task` tool to spawn sub-agents in parallel. Gemini's agent invocation model is different — without a verified skill-discovery path that maps a slash command to a sub-agent fan-out, installing the orchestrator file would just be dead weight.

If Gemini CLI gains skill-discovery support that mirrors Claude Code's, this install will add the orchestrator. Until then: compose by prompt, or use Claude Code for the full experience.

## Customize

The 6 lens agents are plain markdown — edit, replace, add your own. Drop a new `lens-<name>.md` in `.gemini/agents/` and reference it in your prompt. There's no auto-discovery on Gemini, so you'll need to mention the new lens name explicitly when invoking.

Lens authoring contract: [docs/adding-a-lens.md](adding-a-lens.md).

## Updating

```bash
npx fe-review-skills install gemini-cli
npx fe-review-skills install gemini-cli --global
```

For manual installs, `git pull` your clone and recopy.
