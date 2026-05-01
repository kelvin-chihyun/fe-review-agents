# Installing fe-review-skills for Codex CLI

> **Best-effort parity.** Claude Code is the primary target — its skill discovery system maps `/diff-review` to a fully orchestrated workflow with input-mode routing, size guards, and merge logic. Codex CLI uses TOML subagents and doesn't expose an equivalent skill system, so `fe-review-skills` installs only the **6 lens agents** as TOML and you compose the orchestration via natural language.

## Recommended: CLI install

```bash
# Project-level
npx fe-review-skills install codex-cli

# Globally
npx fe-review-skills install codex-cli --global

# Preview without writing
npx fe-review-skills install codex-cli --dry-run
```

What the CLI does:

- Copies pre-built `codex/lens-*.toml` files from the package to `.codex/agents/` (or `~/.codex/agents/` with `--global`).
- 6 TOML lens agents: `lens-react-perf.toml`, `lens-bugs.toml`, etc. Each contains the lens's full instructions inside `developer_instructions` and is registered as a Codex subagent.
- The `diff-review` orchestrator is **intentionally not installed** for the same reason as Gemini CLI — see [Why no orchestrator?](#why-no-orchestrator) below.

## Manual install (no Node required)

The TOML files are pre-built and shipped in the published package. If you cloned the repo instead of using `npx`:

```bash
git clone https://github.com/huurray/fe-review-skills.git /tmp/fe-review-skills
cd /tmp/fe-review-skills
npm install      # for build deps
npm run build    # generates codex/*.toml from skills/lens-*/SKILL.md

mkdir -p .codex/agents
cp /tmp/fe-review-skills/codex/lens-*.toml .codex/agents/
```

For a global install, swap `.codex` for `~/.codex`.

## Verify installation

```bash
ls .codex/agents/
# lens-a11y.toml  lens-bugs.toml  lens-code-quality.toml  lens-react-perf.toml  lens-security.toml  lens-ts.toml
```

## Usage

Codex registers each TOML file as an explicitly invokable subagent. To run all lenses in parallel:

```
> Use every lens-* subagent in parallel to review my uncommitted changes.
  Each subagent returns JSON findings — collect them, dedupe by file:line range,
  sort by severity (critical → high → medium → low), and print one consolidated report.
```

For a single lens:

```
> Use the lens-a11y subagent to review src/components/Header.tsx.
```

## Why no orchestrator?

The orchestrator (`diff-review`) is a Claude Code skill that uses Claude's `Task` tool to spawn sub-agents in parallel with structured frontmatter discovery. Codex's subagent model is different — without a verified path that maps a single command to a parallel fan-out across all installed lenses, installing the orchestrator file would just be dead weight.

If Codex CLI gains skill-discovery support that mirrors Claude Code's, this install will add the orchestrator. Until then: compose by prompt, or use Claude Code for the full experience.

## Customize

The 6 TOML lens agents are auto-generated from the markdown source (`skills/lens-*/SKILL.md`). To customize:

1. Edit the markdown source in your clone of the repo.
2. Run `npm run build` to regenerate the TOML.
3. Re-install (`npx fe-review-skills install codex-cli`) or copy the rebuilt TOML by hand.

Lens authoring contract: [docs/adding-a-lens.md](adding-a-lens.md).

## Updating

```bash
npx fe-review-skills install codex-cli
npx fe-review-skills install codex-cli --global
```

For manual installs, `git pull`, `npm run build`, and recopy.
