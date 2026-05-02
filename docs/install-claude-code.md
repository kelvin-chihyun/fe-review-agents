# Installing fe-review-skills for Claude Code

`fe-review-skills` is a Claude Code plugin: a `diff-review` slash command (orchestrator skill) plus 6 lens agents and a `review-orchestrator` agent. After install, `/fe-review-skills:diff-review` triages your diff, picks 2–3 relevant lenses out of 6, and runs each in an isolated sub-agent with no reasoning contamination across categories.

## Recommended: CLI install

```bash
# Project-level (this repo only)
npx fe-review-skills install claude-code

# Globally (all projects)
npx fe-review-skills install claude-code --global

# Preview without writing
npx fe-review-skills install claude-code --dry-run
```

What the CLI does:

- Copies the plugin tree (`.claude-plugin/plugin.json`, `agents/lens-*.md`, `agents/review-orchestrator.md`, `skills/diff-review/SKILL.md`) to `.claude/plugins/fe-review-skills/` (or `~/.claude/plugins/fe-review-skills/` with `--global`).
- Claude Code auto-registers each agent as `subagent_type=fe-review-skills:<agent-name>` and the orchestrator skill as the `/fe-review-skills:diff-review` slash command.

Re-running the CLI overwrites the installed files with the latest published version. If you've edited a lens locally, that's a cue to stop re-running install for that file — agents and skills are markdown, you own them.

## Manual install (no Node required)

```bash
git clone https://github.com/huurray/fe-review-skills.git /tmp/fe-review-skills

mkdir -p .claude/plugins/fe-review-skills
cp -R /tmp/fe-review-skills/.claude-plugin .claude/plugins/fe-review-skills/
cp -R /tmp/fe-review-skills/agents .claude/plugins/fe-review-skills/
mkdir -p .claude/plugins/fe-review-skills/skills
cp -R /tmp/fe-review-skills/skills/diff-review .claude/plugins/fe-review-skills/skills/
```

For a global install, swap `.claude` for `~/.claude`.

## Verify installation

Open Claude Code in any project and type:

```
/fe-review-skills:diff-review
```

You should see the orchestrator activate. It runs Step 1 (collect diff) → Step 1.5 (triage) → Step 2 (dispatch enabled lenses) → Step 3/4 (merge + render).

To verify a single lens loaded correctly, dispatch it directly:

```
@lens-a11y
```

For local plugin development without re-installing each time:

```bash
claude --plugin-dir /path/to/fe-review-skills
```

After edits to plugin files: `/reload-plugins` (no restart needed).

## Usage

### Slash command

```
/fe-review-skills:diff-review
```

The orchestrator triages your staged diff and runs only the relevant lenses. No arguments by default.

With options:

```
review my diff with lang=ko severity_min=medium triage=off
```

Available options:

| Option         | Default       | Values                                                              |
| -------------- | ------------- | ------------------------------------------------------------------- |
| `scope`        | `auto`        | `auto`, `staged`, `unstaged`, `branch:<name>`, `range:<a>..<b>`    |
| `lang`         | `en`          | `en`, `ko`                                                          |
| `lenses`       | (triaged)     | comma-list of short names (disables triage and forces these lenses) |
| `severity_min` | `low`         | `critical`, `high`, `medium`, `low`                                 |
| `triage`       | `on`          | `on`, `off` (= run all 6 roster lenses without triage)             |

`auto` prefers `staged`; falls back to `unstaged` if no staged frontend changes.

### Natural language

```
Review my staged changes.
Audit this PR.
Run code review on what I've changed on this branch.
```

### Single lens

```
@lens-a11y
@lens-react-perf
```

Or:

```
Just check this for accessibility issues.
```

## How long does it take?

A typical run with triage on takes ~1–1.5 min: triage picks 2–3 lenses out of 6, each lens runs as a sub-agent with ~20–30s of work. The `lens-code-quality` lens runs in `changed-files` mode (full file content) and is the longest single sub-agent — typically 1–2 min on its own.

If you set `triage=off` to force all 6 lenses, expect ~3 min wall time. We recommend keeping triage on; you can always re-run with `lenses=...` to add lenses you suspect were skipped.

## Customize

The 6 starter lenses are markdown files with rule catalogs. Edit them, replace them, add a 7th, remove one you don't need.

Adding a lens requires three steps (the orchestrator uses a static roster, so you tell it your lens exists): create `agents/lens-<name>.md`, append a row to the roster table in `skills/diff-review/SKILL.md`, and add a triage rule. Full guide: [docs/adding-a-lens.md](adding-a-lens.md).

## Troubleshooting

**`/fe-review-skills:diff-review` not autocompleting.** Check `ls ~/.claude/plugins/fe-review-skills/` (or the project equivalent) — you should see `.claude-plugin/`, `agents/`, `skills/`. If not, re-run the CLI install. If yes, run `/reload-plugins` in Claude Code.

**A lens shows up in the report footer as "skipped: malformed JSON."** The lens returned non-JSON output. Re-run; if it persists, dispatch the lens directly (`@lens-<name>`) on a small diff to see what it's emitting.

**Sub-agents run sequentially, taking ~3 min for 6 lenses.** That's expected — Claude Code's runtime serializes sub-agent dispatch (GitHub Issue #3013, closed-not-planned). The plugin's value is per-lens context isolation, not parallelism. Use `triage=on` (default) so only relevant lenses run.

## Updating

Re-run the CLI:

```bash
npx fe-review-skills install claude-code
npx fe-review-skills install claude-code --global
```

For manual installs, `git pull` your clone and recopy.

## Upgrading from 0.5.x

Pre-0.6 versions installed lenses as `.claude/skills/lens-*/`. The new path is `.claude/plugins/fe-review-skills/agents/lens-*.md`. Before re-installing:

```bash
# Project install
rm -rf .claude/skills/lens-* .claude/skills/diff-review
# or global
rm -rf ~/.claude/skills/lens-* ~/.claude/skills/diff-review
```

Then `npx fe-review-skills install claude-code` (or `--global`).
