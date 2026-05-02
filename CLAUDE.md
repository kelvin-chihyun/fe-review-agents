# CLAUDE.md

Project-specific guidance for Claude Code.

## What this is

`fe-review-skills` is a CLI-distributed Claude Code plugin (with cross-tool coverage for Codex CLI and Gemini CLI). It ships:

- An orchestrator skill (`skills/diff-review/SKILL.md`) that triages a git diff to pick relevant lenses, dispatches each as an isolated sub-agent, and merges findings.
- Six starter lens agents (`agents/lens-{a11y,bugs,code-quality,react-perf,security,ts}.md`).
- A tool-neutral orchestrator agent (`agents/review-orchestrator.md`) for hosts without slash-command skills (Codex CLI, Gemini CLI).
- A plugin manifest (`.claude-plugin/plugin.json`) so Claude Code recognizes the directory as a plugin.

Distributed via npm; install through `npx fe-review-skills install <claude-code|codex-cli|gemini-cli>`. CLI runtime is zero-dep (Node stdlib only); `gray-matter` and `smol-toml` are devDependencies used only by the Codex TOML build at publish time.

## Architecture invariants — don't break

**Sub-agent dispatch is serial, by Claude Code runtime design.** We tested this exhaustively (see commit history): even with explicit "single message N tool_use blocks" prompting, Claude Code's runtime queues sub-agent Task calls one at a time. NeoLab's `do-in-parallel` (2208-line skill) hits the same wall. GitHub Issue #3013 (parallel agent execution) is closed-not-planned. **Do not write code or docs that promise parallel execution.** The value of this plugin is **per-lens context isolation** (no reasoning contamination across categories), achieved regardless of dispatch order.

**Triage cuts cost in half.** The orchestrator's Step 1.5 picks 2–3 relevant lenses out of the 6-lens roster based on heuristics (JSX → a11y, useEffect → react-perf, `any` cast → ts, etc.). A typical run takes ~1–1.5 min instead of ~3 min. Triage is **inclusive by default** — false negatives erode trust; false positives just cost a sub-agent run. Do not tighten triage rules without evidence.

**Static lens roster.** The orchestrator's "Lens roster" section in `skills/diff-review/SKILL.md` (and the equivalent in `agents/review-orchestrator.md`) is a fixed table mapping lens name → input-mode. Adding a lens requires editing this table AND adding a triage rule in Step 1.5 — see `docs/adding-a-lens.md`. The previous Glob-based dynamic discovery was removed; static roster ensures predictable dispatch.

**Per-lens input routing.** Five lenses (`bugs`, `a11y`, `security`, `react-perf`, `ts`) take diff hunks only; `lens-code-quality` takes diff + full file content for structural rules (cohesion, coupling, predictability). The orchestrator's roster table encodes this. The token-cost story in both READMEs ("diff × N + α") depends on this routing — don't change it casually.

**Size guards in the orchestrator workflow:**

- Filtered diff > 2,000 lines → ask user to narrow scope
- Single file > 1,000 lines → exclude from changed-files bundle (that file falls back to diff-only)
- Total file content ≥ 100KB → switch to per-file mode (one sub-agent per file × per changed-files lens; cross-file rules explicitly skipped)

## File layout

```
.claude-plugin/
  plugin.json                   plugin manifest ({name, version, description})
agents/
  lens-<name>.md                six starter lens agents (frontmatter: name + description)
  review-orchestrator.md        tool-neutral orchestrator for Codex/Gemini
skills/
  diff-review/SKILL.md          Claude Code orchestrator (slash command: /<plugin-name>:diff-review)
bin/
  fe-review-skills.mjs          CLI entry. Three install modes: claude-plugin,
                                gemini-agents, codex-agents (TOML)
scripts/
  build-codex.mjs               markdown→TOML build for Codex; runs on prepublishOnly
codex/                          generated TOML (lens-*.toml + review-orchestrator.toml).
                                Committed; rebuilt by `npm run build`
docs/
  install-{claude-code,codex-cli,gemini-cli}.md   per-tool install/usage guides
  adding-a-lens.md              user-facing lens authoring guide
README.md                       English, primary
README.ko.md                    한국어; must stay in sync with README.md
package.json                    bin entry, files array, devDeps, scripts
```

## CLI / build

- `npm run build` — runs `scripts/build-codex.mjs`, rebuilds `codex/lens-*.toml` and `codex/review-orchestrator.toml` from the markdown sources in `agents/`. Uses TOML literal multiline strings (`'''...'''`) so any backslash/backtick content passes through unchanged. Round-trip parses each emitted TOML to catch escape bugs.
- `prepublishOnly` runs the build automatically; an inconsistent TOML aborts publish (good).
- `node bin/fe-review-skills.mjs --help` / `--version` for smoke tests.
- `node bin/fe-review-skills.mjs install <tool> --dry-run` previews install paths without writes. Run for all three tools after editing the CLI.
- `npm pack` then install the resulting tarball into `/tmp/<test-dir>` to catch `files` array misses before publishing.

## Conventions

**Agent frontmatter contract** (per `agents/<name>.md`):

- `name` — kebab-case, matches the filename without extension
- `description` — write the trigger phrases plainly; this drives auto-invocation. **Wrap in double-quoted YAML if it contains colons or other YAML metacharacters** (e.g. `description: "...javascript: URLs..."`). The Codex build uses `gray-matter` and will fail loudly on YAML errors.
- That's all. No `input-mode` (encoded in the orchestrator's roster table), no `user-invocable` (not a recognized field).

**Skill frontmatter contract** (`skills/diff-review/SKILL.md`):

- `name` matches the directory name
- `description` — names the 6 default lens domains literally (`React performance, bugs, code quality, accessibility, security, TypeScript rigor`) plus an additive _"and any additional `lens-*` agents the user has registered in the roster below"_ clause. **Do not over-generify.** Removing the literal domain words breaks AI dispatch on phrases like "review for accessibility" or "audit perf." The extension clause is _additive_, never _substitutive_.
- `argument-hint` — for slash command UX

**Finding JSON schema** — every lens returns an array of:

```json
{
  "file": "...",
  "line_start": 0,
  "line_end": 0,
  "severity": "critical | high | medium | low",
  "category": "<rule-id>",
  "title": "≤8 words",
  "rationale": "why it's a problem",
  "suggestion": "what to do instead"
}
```

Severity levels are hard-coded in the orchestrator's merge/sort logic — don't add new ones. `category` is the lens's rule id; the orchestrator does NOT validate it, but consistent ids help downstream tooling.

**Bilingual README parity.** `README.md` (English, primary) and `README.ko.md` (한국어) are structurally identical — same headers, tables, diagrams, content. **Always edit both in the same change.** Drift between them is a bug.

**Commits.** Korean primary, conventional-commit prefixes (`feat:`, `chore:`, etc.).

## Adding a lens

The user-facing version of this lives in [docs/adding-a-lens.md](docs/adding-a-lens.md). For maintainers, the short form:

1. Create `agents/lens-<name>.md` with frontmatter (`name`, `description`) + rule catalog matching the finding JSON schema.
2. Add a row to the **Lens roster** table in `skills/diff-review/SKILL.md` (and `agents/review-orchestrator.md`) — `subagent_type` + `input-mode`.
3. Add a triage rule in **Step 1.5** of both files — when this lens is relevant.
4. Run `npm run build` to regenerate `codex/lens-<name>.toml`.

That's it. **Don't** edit `package.json` (the `agents/` directory is included via `files` array), **don't** edit either README's lens table for user-added lenses (the README table documents the 6 starters; user lenses don't need README entries).

If you're adding to the **shipped 6 starter set** (rare — the 6 are intentionally a stable opinionated baseline), then yes update both READMEs' lens tables and the architecture diagram in lockstep, and refresh the "5/6 lens가 diff만" framing in the cost section.

Bar for a rule: "reliably detectable from the lens's input-mode without runtime data" AND "would a senior frontend reviewer flag this on a PR." Both yes → add. One no → skip.

## Claude Code plugin discovery (load-bearing assumption)

The CLI's Claude Code install path relies on Claude Code automatically registering plugin contents — `agents/<name>.md` as `subagent_type=<plugin-name>:<name>`, and `skills/<name>/SKILL.md` as the `/<plugin-name>:<name>` slash command — when a plugin tree lives at `.claude/plugins/<plugin-name>/` (project) or `~/.claude/plugins/<plugin-name>/` (with `--global`). This is an Anthropic-side implementation detail. If the path convention changes upstream, the `installClaudeCode` function in `bin/fe-review-skills.mjs` is the single point to update.

For local plugin testing without going through marketplace install: `claude --plugin-dir <path>` loads the plugin from an arbitrary path. After edits to `SKILL.md` / agents: `/reload-plugins`.

## Gotchas

- **GitHub push protection blocks real-looking secret patterns** — Stripe (`sk_live_…`, `sk_test_…<24 alnum>`), AWS (`AKIA…`), JWTs, etc. — regardless of whether the value is intentionally fake. The regex matchers don't care about intent. If a fixture needs a hardcoded-secret demo, use a clearly broken placeholder like `sk_live_<YOUR_KEY>` (angle brackets defeat the alnum regex) or describe the pattern in prose. **Do not commit any string that could be mistaken for a real provider key.**
- **`examples/` was deliberately removed** during a push-protection cleanup (sample.diff contained Stripe-format keys that GitHub blocked). If you re-add example fixtures, follow the rule above — no real-looking secret patterns.
- **Lenses are LLM-based pattern review, not static analysis.** No SAST, no SCA, no runtime profiling, no auto-fix. Suggestions only — the user is the editor.
- **Conservative is a feature.** Lenses are tuned to skip uncertain patterns rather than guess. Don't loosen rules to "catch more" — false positives erode trust faster than missed issues.
- **Don't promise parallel execution.** The marketing temptation is real because every other multi-agent kit makes that claim. They're all aspirational. We tested. We don't.
- **Codex/Gemini parity is real but limited.** Lens definitions and the `review-orchestrator` agent install on all three tools. Slash command (`/diff-review`) is Claude Code only; Codex/Gemini users invoke `@review-orchestrator` or use natural language. Sub-agent dispatch is serial on all three (it's the same model-side limitation, not Claude-Code-specific).
