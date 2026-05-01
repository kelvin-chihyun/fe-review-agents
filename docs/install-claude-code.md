# Installing fe-review-skills for Claude Code

`fe-review-skills` ships 6 starter lenses plus a `diff-review` orchestrator as Claude Code skills. After install, `/diff-review` runs all installed lenses in parallel and merges findings into one prioritized report.

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

- Copies each `skills/<name>/SKILL.md` from the package to `.claude/skills/<name>/SKILL.md` (or under `~/.claude/skills/` with `--global`).
- 7 directories total: `diff-review` (the orchestrator) and 6 lenses (`lens-react-perf`, `lens-bugs`, `lens-ts`, `lens-code-quality`, `lens-a11y`, `lens-security`).
- Each becomes a slash command Claude Code auto-registers from the skill's `name` field: `/diff-review`, `/lens-a11y`, etc.

Re-running the CLI overwrites the installed files with the latest published version. If you've edited a lens locally, that's a cue to stop re-running install for that file — the lenses are markdown, you own them.

## Manual install (no Node required)

```bash
git clone https://github.com/huurray/fe-review-skills.git /tmp/fe-review-skills

mkdir -p .claude/skills
cp -R /tmp/fe-review-skills/skills/* .claude/skills/
```

For a global install, swap `.claude` for `~/.claude`.

## Verify installation

Open Claude Code in any project and type:

```
/diff-review
```

You should see the orchestrator activate. It runs Step 0 (lens discovery) first — it'll list the 6 default lenses (or whichever set you have installed).

To verify a single lens loaded correctly:

```
/lens-a11y
```

## Usage

### Slash command

```
/diff-review
```

The orchestrator discovers every `lens-*` skill in your skills directory and calls them all in parallel against your staged diff. No arguments by default.

With options:

```
review my diff with lang=ko severity_min=medium lenses=perf,bugs,a11y
```

Available options:

| Option | Default | Values |
|---|---|---|
| `scope` | `staged` | `staged`, `unstaged`, `branch:<name>`, `range:<a>..<b>` |
| `lang` | `en` | `en`, `ko` |
| `lenses` | all installed | comma-list of short names matching installed lenses |
| `severity_min` | `high` | `critical`, `high`, `medium`, `low` |

### Natural language

```
Review my staged changes.
Audit this PR.
Run code review on what I've changed on this branch.
```

### Single lens

```
/lens-a11y
/lens-react-perf
```

Or:

```
Just check this for accessibility issues.
```

## Customize

The 6 starter lenses are markdown files with rule catalogs. Edit them, replace them, add a 7th, remove one you don't need. The orchestrator auto-discovers whatever lens-* skills are installed.

Full guide: [docs/adding-a-lens.md](adding-a-lens.md).

## Troubleshooting

**`/diff-review` says "no lens skills are installed."** Step 0 didn't find any `lens-*` directories. Check `ls .claude/skills/` (or `~/.claude/skills/`) — you should see `lens-react-perf`, `lens-bugs`, etc. If not, re-run `npx fe-review-skills install claude-code`.

**Lenses run sequentially instead of in parallel.** Tell Claude Code explicitly:

> Invoke all enabled lenses in parallel using the Task tool, in a single message.

If it still serializes, paste the relevant section of `skills/diff-review/SKILL.md` and ask Claude to follow it.

**A lens shows up in the report footer as "skipped: missing/invalid frontmatter."** Open that lens's SKILL.md and verify the frontmatter has `name` and `input-mode` keys (and that any colons in `description` are inside double-quoted strings).

## Updating

Re-run the CLI:

```bash
npx fe-review-skills install claude-code
npx fe-review-skills install claude-code --global
```

For manual installs, `git pull` your clone and recopy.
