# Installing fe-review-skills for Codex CLI

`fe-review-skills` ships 6 lens agents plus a `review-orchestrator` agent for Codex CLI as TOML files. The orchestrator agent triages your diff, picks 2–3 relevant lenses, and dispatches each — equivalent to `/diff-review` on Claude Code.

> ⚠️ **Codex caveat (Issue #15250):** Custom `.codex/agents/*.toml` agents load reliably in interactive Codex CLI/TUI sessions, but **not in tool-backed/API sessions** where `spawn_agent` only takes generic agent types. Use the interactive CLI for full functionality.

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

- Copies pre-built `codex/lens-*.toml` and `codex/review-orchestrator.toml` to `.codex/agents/` (or `~/.codex/agents/` with `--global`).
- 7 TOML agents total: 6 lenses + 1 orchestrator. Each contains the agent's full instructions inside `developer_instructions` and is registered as a Codex subagent.

## Manual install (no Node required)

The TOML files are pre-built and shipped in the published package. If you cloned the repo instead of using `npx`:

```bash
git clone https://github.com/huurray/fe-review-skills.git /tmp/fe-review-skills
cd /tmp/fe-review-skills
npm install      # for build deps (gray-matter, smol-toml)
npm run build    # generates codex/*.toml from agents/*.md

mkdir -p .codex/agents
cp /tmp/fe-review-skills/codex/*.toml .codex/agents/
```

For a global install, swap `.codex` for `~/.codex`.

## Verify installation

```bash
ls .codex/agents/
# lens-a11y.toml  lens-bugs.toml  lens-code-quality.toml  lens-react-perf.toml
# lens-security.toml  lens-ts.toml  review-orchestrator.toml
```

## Usage

### Orchestrated review (recommended)

In an interactive Codex session:

```
> @review-orchestrator review my staged changes
```

The orchestrator triages your diff, picks 2–3 relevant lenses, dispatches each as a sub-agent, and merges findings into one prioritized report. Same workflow as Claude Code's `/diff-review`, just invoked via agent instead of slash command.

With options (described in natural language):

```
> @review-orchestrator review my unstaged changes in Korean. Use only the bugs and ts lenses.
```

### Single lens

```
> @lens-a11y review src/components/Header.tsx for accessibility issues.
```

## How long does it take?

A typical run with triage on takes ~1–1.5 min: triage picks 2–3 lenses out of 6, each lens runs as a sub-agent with ~20–30s of work. The `lens-code-quality` lens runs in `changed-files` mode (full file content) and is the longest single sub-agent — typically 1–2 min on its own.

> ℹ️ **About parallelism:** Codex defaults to `agents.max_threads=6`, so up to 6 sub-agents *could* run in parallel, but in practice sub-agent dispatch (across multi-agent kits including ours and NeoLab's) is serialized by the model's behavior. We don't promise parallel execution; the value of multi-lens review is the **isolated context per lens**, not the wall time.

## Customize

The 7 TOML agents are auto-generated from the markdown source (`agents/*.md`). To customize:

1. Edit the markdown source in your clone of the repo.
2. Run `npm run build` to regenerate the TOML.
3. Re-install (`npx fe-review-skills install codex-cli`) or copy the rebuilt TOML by hand.

Lens authoring contract: [docs/adding-a-lens.md](adding-a-lens.md). For Codex specifically, after step 5b in that guide you'll need to also edit `agents/review-orchestrator.md`'s roster table and triage rules (these get rebuilt into `codex/review-orchestrator.toml`).

## Updating

```bash
npx fe-review-skills install codex-cli
npx fe-review-skills install codex-cli --global
```

For manual installs, `git pull`, `npm run build`, and recopy.

## Upgrading from 0.5.x

Pre-0.6 versions installed only the 6 lens TOMLs. The new layout adds `review-orchestrator.toml`. Before re-installing:

```bash
rm -f .codex/agents/lens-*.toml
# or global
rm -f ~/.codex/agents/lens-*.toml
```

Then `npx fe-review-skills install codex-cli` (or `--global`).
