# AGENTS.md

Project-specific guidance for Codex.

## What this is

`fe-review-agents` is a frontend review plugin that supports Claude Code and Codex. End users install it through each product's own plugin surface. Inside this repository, the Claude marketplace files are distribution artifacts, while `.agents/plugins/marketplace.json` is the Codex repo marketplace used by both GitHub marketplace-source installs and local packaging verification. The packaged Codex plugin lives at `plugins/fe-review-agents/`. It ships:

- Two slash commands (`commands/diff-review.md`, `commands/file-review.md`) that orchestrate a multi-reviewer review.
- Six reviewer agents (`agents/reviewer-{react-perf,quality,bugs,ts,a11y,security}.md`).
- A synthesizer agent (`agents/synthesizer.md`) that merges 6 reviewer outputs into a single prioritized markdown report.
- A Claude plugin manifest (`.claude-plugin/plugin.json`) + a single-plugin marketplace manifest (`.claude-plugin/marketplace.json`).
- A Codex plugin manifest (`plugins/fe-review-agents/.codex-plugin/plugin.json`) inside the packaged plugin root.

Distribution: GitHub repo as marketplace for Claude Code (`/plugin marketplace add huurray/fe-review-agents` → `/plugin install fe-review-agents@fe-review-agents`) and as a Codex GitHub marketplace source (`codex plugin marketplace add huurray/fe-review-agents`, then install from `/plugins`). For Codex, the execution contract is the packaged plugin plus its namespaced skills.

## Architecture invariants — don't break

**Always dispatch all 6 reviewers in a single assistant message.** The slash commands instruct the main session to issue 6 `Agent` tool_use blocks together. This is the parallel-dispatch pattern from [`huurray/parallel-test`](https://github.com/huurray/parallel-test). Do NOT add triage, do NOT dispatch one-by-one. The main session is the orchestrator; sub-agents cannot spawn sub-agents, so all 6 fire from the top-level message.

**Per-reviewer context isolation is the load-bearing value.** Each reviewer runs in its own sub-agent with a fresh context, so findings stay independent (no cross-axis reasoning contamination, no mode collapse toward the loudest signal). This matters regardless of whether dispatch ends up wall-clock parallel or serialized at runtime — the isolation is what makes the merged report better than a single-context "review for everything" pass.

**Synthesizer is markdown-in, markdown-out.** Reviewers emit one-line findings: `- **[axis/rule-id]** [SEVERITY] Line N: <issue> — <fix>`. Synthesizer takes 6 such markdown blocks (concatenated under `## 1. Performance` / `## 2. Code Quality` / etc. headers) and produces a single prioritized report. No JSON merging, no overlap dedup logic — the synthesizer just sorts by severity and dedups identical rule IDs at the same line.

**Two entry points, same fan-out.** `/fe-review-agents:diff-review [scope]` (git diff) and `/fe-review-agents:file-review <path>` (single file) both dispatch the same 6 reviewers + synthesizer. Reviewer prompts differ only in the input mode signal: file mode → reviewer uses `Read`; diff mode → reviewer analyzes inlined diff text without `Read`.

**Two optional flags: `lang` and `severity_min`.** `lang=ko|en` (default `ko`) drives output language and is passed to every reviewer prompt and the synthesizer prompt; reviewers and synthesizer both support both languages internally. `severity_min=LOW|MED|HIGH|CRITICAL` (default `LOW` — same as current behavior) is parsed by the slash commands and passed **only to the synthesizer**, which excludes findings below the threshold from both the priority list and the at-a-glance counts. **Reviewers stay severity-agnostic** (always emit all severities) — don't push the filter down into reviewer prompts. Invalid values for either flag fall back to default with a one-line warning. Don't add other flags (no `lenses=`, no `triage`) — the `parallel-test` design is intentionally tight.

**Static reviewer roster.** The 6 reviewers are listed by name in `commands/diff-review.md` and `commands/file-review.md` (Step 2) and in the synthesizer input section. To add a 7th: add `agents/reviewer-<name>.md`, append a dispatch row in both command files, and append an input section in both command files' synthesizer prompt. See `docs/adding-a-reviewer.md`.

**Size guards in `diff-review`:**

- Filtered diff > 2,000 lines → ask user to narrow scope. (No per-file mode, no automatic chunking — the user picks a tighter scope.)

## File layout

```
.claude-plugin/
  plugin.json                   plugin manifest ({name, version, description})
  marketplace.json              single-plugin marketplace manifest ({name, owner, plugins[].source: "./"})
.agents/plugins/
  marketplace.json              Codex repo marketplace for GitHub installs and local verification
plugins/fe-review-agents/
  .codex-plugin/plugin.json     Codex plugin manifest + UI metadata
  ...                           Actual Codex plugin root
agents/
  reviewer-{react-perf,quality,bugs,ts,a11y,security}.md   six reviewers (frontmatter: name + description + tools)
  synthesizer.md                                     merger (frontmatter: name + description)
commands/
  diff-review.md                git-diff orchestrator (frontmatter: description + argument-hint)
  file-review.md                single-file orchestrator
docs/
  adding-a-reviewer.md          maintainer/dev reviewer authoring guide
  codex-dev.md                  maintainer/dev Codex packaging + local verification guide
  assets/                       README header + architecture image
README.md                       한국어, primary
README.en.md                    English; must stay in sync with README.md
```

## Release

No build step — everything is markdown. Cut a release by pushing to `main`. Users pull updates with `/plugin marketplace update`. If `plugin.json` sets a `version`, Codex uses it for change detection; otherwise it falls back to the latest commit SHA on the default branch.

## Conventions

**Reviewer frontmatter contract** (per `agents/reviewer-<name>.md`):

- `name` — kebab-case, matches the filename without extension. Becomes the `subagent_type` the slash command dispatches.
- `description` — write the trigger phrases plainly; this drives auto-invocation. **Wrap in double-quoted YAML if it contains colons or other YAML metacharacters** (e.g. `description: "...javascript: URLs..."`).
- `tools: Read` — reviewers use only `Read`. Don't grant write tools.

**Synthesizer frontmatter**:

- `name: synthesizer`
- `description` — names what it does. No `tools` field; it works on text-only input from the orchestrator.

**Command frontmatter contract** (per `commands/<name>.md`):

- `description` — what the command does + how to invoke. Drives slash-command discoverability.
- `argument-hint` — the inline hint shown in the slash-command UI.

**Reviewer output format** — one-line findings:

```
### <emoji> <Category>
- **[axis/rule-id]** [SEVERITY] Line N: <one-line issue> — <one-line fix>
```

If no issues: `### <emoji> <Category>\n- 발견된 이슈 없음` (lang=ko) or `- No issues found` (lang=en).

Severity values: `CRITICAL`, `HIGH`, `MED`, `LOW`. These are textual labels (not enum values for tooling) — synthesizer matches on them. Don't add new severities.

`category` (the `axis` part of `[axis/rule-id]`) is the reviewer's domain key: `perf`, `bugs`, `ts`, `a11y`, `security`, plus the four code-quality axes (`readability`, `predictability`, `cohesion`, `coupling`). Stable rule IDs help users grep their report history; don't rename without reason.

**Bilingual README parity.** `README.md` (한국어, primary) and `README.en.md` (English) are structurally identical — same headers, tables, diagrams, content. **Always edit both in the same change.** Drift between them is a bug.

**Commits.** Korean primary, conventional-commit prefixes (`feat:`, `chore:`, etc.).

## Adding a reviewer

User-facing version: [docs/adding-a-reviewer.md](docs/adding-a-reviewer.md). Maintainer short form:

1. Create `agents/reviewer-<name>.md` with frontmatter (`name`, `description`, `tools: Read`) + rule catalog matching the one-line output format.
2. Append a dispatch row in **Step 2** of both `commands/diff-review.md` and `commands/file-review.md`.
3. Append an input section in the synthesizer prompt of both command files — under a new `## N+1. <Category>` heading.

That's it. **Don't** edit either README's reviewer table for user-added reviewers (the table documents the 6 starters; user reviewers don't need README entries).

If you're adding to the **shipped 6 starter set** (rare — the 6 are intentionally a stable opinionated baseline), update both READMEs' reviewer tables and the architecture diagram in lockstep.

Bar for a rule: "reliably detectable from the reviewer's input (file content or diff hunks) without runtime data" AND "would a senior frontend reviewer flag this on a PR." Both yes → add. One no → skip.

## Codex plugin discovery

Codex does **not** auto-register plugins by arbitrary filesystem presence — files copied under `~/.codex/plugins/<name>/` alone are not the normal install contract. Plugins enter the runtime through marketplace sources and are materialized into Codex's plugin cache.

1. **GitHub marketplace source** (the user path) — `codex plugin marketplace add <gh-owner>/<repo>` registers the repository marketplace. Users then open `/plugins`, select the marketplace tab, and install the plugin entry.
2. **Local dev** — `codex plugin marketplace add "$(pwd)"` registers the current checkout as a local marketplace source. Restart Codex, then install or enable the repo-scoped entry from `/plugins`.

The marketplace name is the top-level `name` field in `.agents/plugins/marketplace.json` (here: `fe-review-agents`), and the plugin name is the `name` field in `plugins/fe-review-agents/.codex-plugin/plugin.json`. Codex installs plugins under `~/.codex/plugins/cache/$MARKETPLACE_NAME/$PLUGIN_NAME/$VERSION/` and stores enabled state in `~/.codex/config.toml`.

## Gotchas

- **No arbitrary filesystem auto-discovery.** Do not assume putting files at `~/.codex/plugins/<name>/` registers them. Use a marketplace source and let Codex materialize the installed cache copy.
- **GitHub push protection blocks real-looking secret patterns** — Stripe (`sk_live_…`, `sk_test_…<24 alnum>`), AWS (`AKIA…`), JWTs, etc. — regardless of whether the value is intentionally fake. The regex matchers don't care about intent. If a fixture needs a hardcoded-secret demo, use a clearly broken placeholder like `sk_live_<YOUR_KEY>` (angle brackets defeat the alnum regex) or describe the pattern in prose. **Do not commit any string that could be mistaken for a real provider key.**
- **Reviewers are LLM-based pattern review, not static analysis.** No SAST, no SCA, no runtime profiling, no auto-fix. Suggestions only — the user is the editor.
- **Conservative is a feature.** Reviewers are tuned to skip uncertain patterns rather than guess. Don't loosen rules to "catch more" — false positives erode trust faster than missed issues.
- **Parallel dispatch is best-effort.** The slash commands tell the main session to fire 6 Agent calls in one message. Whether they wall-clock-parallel or serialize is up to the runtime — we don't promise either way. The value is per-reviewer context isolation; that holds regardless.
- **Codex support is package-first.** Keep `plugins/fe-review-agents/` aligned with the root `agents/` and `commands/` compatibility mirrors. The repo-scoped `.agents/plugins/marketplace.json` is the Codex marketplace entry for both GitHub marketplace-source installs and maintainer local verification.
- **Forbidden vocabulary in code/docs** — "lens" (use "reviewer"), "triage" (no triage step), "JSON merge" (synthesizer takes markdown), "input-mode" (no roster table). These all describe pre-0.6.0 architecture.
