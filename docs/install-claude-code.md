# Installing fe-review-agents for Claude Code

`fe-review-agents` is a Claude Code plugin: two slash commands (`/fe-review-agents:diff-review`, `/fe-review-agents:file-review`) that dispatch 6 frontend reviewers in a single message + a synthesizer that merges the results into one prioritized report.

## Recommended: CLI install

```bash
# Project-level (this repo only)
npx fe-review-agents install

# Globally (all projects)
npx fe-review-agents install --global

# Preview without writing
npx fe-review-agents install --dry-run
```

What the CLI does:

- Copies the plugin tree (`.claude-plugin/plugin.json`, `agents/reviewer-*.md`, `agents/synthesizer.md`, `commands/diff-review.md`, `commands/file-review.md`) to `.claude/plugins/fe-review-agents/` (or `~/.claude/plugins/fe-review-agents/` with `--global`).
- Claude Code auto-registers each agent as `subagent_type=fe-review-agents:<agent-name>` and each command as a `/fe-review-agents:<name>` slash command.

Re-running the CLI overwrites the installed files with the latest published version. If you've edited a reviewer locally, that's a cue to stop re-running install for that file — agents and commands are markdown, you own them.

## Manual install (no Node required)

```bash
git clone https://github.com/huurray/fe-review-agents.git /tmp/fe-review-agents

mkdir -p .claude/plugins/fe-review-agents
cp -R /tmp/fe-review-agents/.claude-plugin .claude/plugins/fe-review-agents/
cp -R /tmp/fe-review-agents/agents .claude/plugins/fe-review-agents/
cp -R /tmp/fe-review-agents/commands .claude/plugins/fe-review-agents/
```

For a global install, swap `.claude` for `~/.claude`.

## Verify installation

Open Claude Code in any project and type:

```
/fe-review-agents:diff-review
```

You should see the orchestrator activate. It runs Step 0 (parse args) → Step 1 (collect diff, filter frontend files) → Step 2 (dispatch 6 reviewers in one message) → Step 3 (synthesizer) → Step 4 (output).

For a single-file review:

```
/fe-review-agents:file-review src/components/Header.tsx
```

To verify a reviewer agent loaded directly, dispatch it:

```
@reviewer-a11y
```

For local plugin development without re-installing each time:

```bash
claude --plugin-dir /path/to/fe-review-agents
```

After edits to plugin files: `/reload-plugins` (no restart needed).

## Usage

### Slash commands

Diff-based review (review what changed):

```
/fe-review-agents:diff-review                       # staged (default)
/fe-review-agents:diff-review unstaged
/fe-review-agents:diff-review branch:main
/fe-review-agents:diff-review range:HEAD~3..HEAD
/fe-review-agents:diff-review lang=en               # English output
/fe-review-agents:diff-review unstaged lang=en      # combined
```

File-based review (review one file):

```
/fe-review-agents:file-review src/components/Header.tsx
/fe-review-agents:file-review src/components/Header.tsx lang=en
```

Available options:

| Option   | Default  | Values                                                          | Applies to    |
| -------- | -------- | --------------------------------------------------------------- | ------------- |
| `scope`  | `staged` | `staged`, `unstaged`, `branch:<name>`, `range:<a>..<b>`         | `diff-review` |
| `lang`   | `ko`     | `ko`, `en`                                                      | both          |

### Natural language

```
Review my staged changes.
Audit this PR.
Run code review on src/components/Header.tsx.
```

### Single reviewer

```
@reviewer-a11y
@reviewer-react-perf
```

Or:

```
Just check this for accessibility issues.
```

## How long does it take?

The slash commands fire all 6 reviewer `Agent` calls in a single message, then the synthesizer afterward. Whether they wall-clock-parallel or serialize is up to the runtime; we don't promise either way. A run typically takes 1–3 minutes depending on diff size and runtime behavior.

The value of multi-reviewer review is the **isolated context per reviewer** — each reviewer sees the diff/file in its own sub-agent without reasoning contamination from other axes. That holds regardless of dispatch order.

## Customize

The 6 starter reviewers are markdown files with rule catalogs. Edit them, replace them, add a 7th, remove one you don't need.

Adding a reviewer requires three steps (the slash commands have a static dispatch list, so you tell them your reviewer exists): create `agents/reviewer-<name>.md`, append a dispatch row in both `commands/diff-review.md` and `commands/file-review.md`, and append a synthesizer input section in both. Full guide: [docs/adding-a-reviewer.md](adding-a-reviewer.md).

## Troubleshooting

**`/fe-review-agents:diff-review` not autocompleting.** Check `ls ~/.claude/plugins/fe-review-agents/` (or the project equivalent) — you should see `.claude-plugin/`, `agents/`, `commands/`. If not, re-run the CLI install. If yes, run `/reload-plugins` in Claude Code.

**Only some reviewers ran.** The slash command issues 6 `Agent` calls in one message; if the orchestrator dispatched fewer, ask it to re-run. The runtime should fire all 6, but sub-agent dispatch behavior can vary.

**Output came back in the wrong language.** Pass `lang=en` (or `lang=ko`) explicitly. Default is `ko`.

## Updating

Re-run the CLI:

```bash
npx fe-review-agents install
npx fe-review-agents install --global
```

For manual installs, `git pull` your clone and recopy.

## Upgrading from 0.5.x

v0.6.0 is a major architecture rewrite. Pre-0.6 versions installed `lens-*` agents + a `diff-review` skill. The new layout uses `reviewer-*` agents + `synthesizer` + two slash commands.

Before re-installing, clean up old install paths:

```bash
# Project install
rm -rf .claude/plugins/fe-review-agents
rm -rf .claude/skills/lens-* .claude/skills/diff-review     # very old versions

# Global install
rm -rf ~/.claude/plugins/fe-review-agents
rm -rf ~/.claude/skills/lens-* ~/.claude/skills/diff-review
```

Then `npx fe-review-agents install` (or `--global`).

Breaking changes since 0.5.x:

- `@lens-*` agents removed → use `@reviewer-*` (e.g. `@lens-a11y` → `@reviewer-a11y`, `@lens-react-perf` → `@reviewer-react-perf`).
- JSON output schema removed → reviewers now emit one-line markdown findings.
- Options removed: `severity_min`, `lenses=`, `triage`. The slash commands always run all 6 reviewers; only `scope` (diff-review) and `lang` remain.
- New slash command: `/fe-review-agents:file-review <path>` for single-file review.
- Codex CLI / Gemini CLI support dropped. Plugin is Claude Code only.
