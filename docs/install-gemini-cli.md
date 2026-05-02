# Installing fe-review-skills for Gemini CLI

`fe-review-skills` ships 6 lens agents plus a `review-orchestrator` agent for Gemini CLI as markdown files. The orchestrator agent triages your diff, picks 2–3 relevant lenses, and dispatches each — equivalent to `/diff-review` on Claude Code.

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

- Copies each `agents/lens-*.md` and `agents/review-orchestrator.md` to `.gemini/agents/` (or `~/.gemini/agents/` with `--global`).
- 7 markdown agents total: 6 lenses + 1 orchestrator. Gemini CLI auto-registers them as subagents with `@<name>` invocation.

> Note: `.gemini/agents/*.md` (subagent definitions) is a different thing from `.gemini/AGENTS.md` (the agents.md open-standard convention file). This install only writes to the former.

## Manual install (no Node required)

```bash
git clone https://github.com/huurray/fe-review-skills.git /tmp/fe-review-skills

mkdir -p .gemini/agents
cp /tmp/fe-review-skills/agents/*.md .gemini/agents/
```

For a global install, swap `.gemini` for `~/.gemini`.

## Verify installation

```bash
ls .gemini/agents/
# lens-a11y.md  lens-bugs.md  lens-code-quality.md  lens-react-perf.md
# lens-security.md  lens-ts.md  review-orchestrator.md
```

## Usage

### Orchestrated review (recommended)

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

> ℹ️ **About parallelism:** Google's announcement says Gemini CLI "supports parallel subagents" since April 2026, but in practice sub-agent dispatch (across multi-agent kits including ours and NeoLab's) is serialized by the model's behavior. We don't promise parallel execution; the value of multi-lens review is the **isolated context per lens**, not the wall time.

## Customize

The 7 markdown agents are plain markdown — edit, replace, add your own.

Adding a lens requires three steps (the orchestrator uses a static roster, so you tell it your lens exists): create `agents/lens-<name>.md`, append a row to the roster table in `agents/review-orchestrator.md`, and add a triage rule. Full guide: [docs/adding-a-lens.md](adding-a-lens.md).

## Updating

```bash
npx fe-review-skills install gemini-cli
npx fe-review-skills install gemini-cli --global
```

For manual installs, `git pull` your clone and recopy.

## Upgrading from 0.5.x

Pre-0.6 versions installed only the 6 lens markdowns. The new layout adds `review-orchestrator.md`. Before re-installing:

```bash
rm -f .gemini/agents/lens-*.md
# or global
rm -f ~/.gemini/agents/lens-*.md
```

Then `npx fe-review-skills install gemini-cli` (or `--global`).
