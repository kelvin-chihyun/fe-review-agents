# CLAUDE.md

Project-specific guidance for Claude Code.

## What this is

`fe-review-skills` is a CLI-distributed skill pack: an orchestrator (`diff-review`) plus six starter lens skills (`lens-{a11y,bugs,code-quality,react-perf,security,ts}`) that run as parallel sub-agents on a git diff and merge findings into one prioritized report. Distributed via npm; install through `npx fe-review-skills install <claude-code|codex-cli|gemini-cli>`. CLI runtime is zero-dep (Node stdlib only); `gray-matter` and `smol-toml` are devDependencies used only by the Codex TOML build at publish time. Lenses are markdown + YAML frontmatter and are auto-discovered by the orchestrator at dispatch time — adding a lens is dropping a folder in.

## Architecture invariants — don't break

**Parallel fan-out, not sequential.** The orchestrator MUST spawn lenses via the Task tool in parallel. Three structural reasons (see README "왜 이렇게 설계했나" / "Why this design"): no reasoning contamination, no mode collapse, isolated context budgets. Never collapse to "have one model apply all six lenses sequentially" — that defeats the entire architecture.

**Per-lens input routing.** Each lens declares `input-mode: diff | changed-files` in its SKILL.md frontmatter. Five lenses (`bugs`, `a11y`, `security`, `react-perf`, `ts`) take diff hunks only; `lens-code-quality` takes diff + full file content for structural rules (cohesion, coupling, predictability). The orchestrator reads frontmatter and prepares per-lens contexts. **The token-cost story in both READMEs ("diff × N + α") depends on this routing — don't change it casually.**

**Lens auto-discovery.** The orchestrator's Step 0 (in `skills/diff-review/SKILL.md`) globs `lens-*/SKILL.md` from the user's skills directory at dispatch time. The dispatch list is *not* hardcoded. The CLI mirrors this at install time — `bin/fe-review-skills.mjs` enumerates `skills/<name>/` subdirectories and copies each `SKILL.md` to the tool's destination. Don't reintroduce a static lens list anywhere; if a 7th lens is added, both the install and dispatch paths should pick it up without code changes.

**Size guards in the orchestrator workflow:**
- Filtered diff > 2,000 lines → ask user to narrow scope
- Single file > 1,000 lines → exclude from changed-files bundle (that file falls back to diff-only)
- Total file content > 50KB → switch to per-file mode (one sub-agent per file × per changed-files lens; cross-file rules explicitly skipped)

## File layout

```
skills/
  diff-review/SKILL.md          orchestrator (no input-mode; Step 0 discovers + dispatches)
  lens-<name>/SKILL.md          one per lens; declares input-mode and rule catalog
bin/
  fe-review-skills.mjs          CLI entry. Three install modes: claude-skills,
                                gemini-agents, codex-agents (TOML)
scripts/
  build-codex.mjs               markdown→TOML build for Codex; runs on prepublishOnly
codex/                          generated TOML (lens-*.toml). Committed; rebuilt by `npm run build`
docs/
  install-{claude-code,codex-cli,gemini-cli}.md   per-tool install/usage guides
  adding-a-lens.md              user-facing lens authoring guide
README.md                       한국어, primary
README.en.md                    English; must stay in sync with README.md
package.json                    bin entry, files array, devDeps, scripts. NO `skills` array
                                (the static list is gone — discovery handles it)
```

## CLI / build

- `npm run build` — runs `scripts/build-codex.mjs`, rebuilds `codex/lens-*.toml` from the markdown sources. Round-trip parses each emitted TOML to catch escape bugs.
- `prepublishOnly` runs the build automatically; an inconsistent TOML aborts publish (good).
- `node bin/fe-review-skills.mjs --help` / `--version` for smoke tests.
- `node bin/fe-review-skills.mjs install <tool> --dry-run` previews install paths without writes. Run for all three tools after editing the CLI.
- `npm pack` then install the resulting tarball into `/tmp/<test-dir>` to catch `files` array misses before publishing.

## Conventions

**SKILL.md frontmatter contract:**
- `name` matches the directory name
- `description` — write the trigger phrases plainly; this drives agent dispatch. **Wrap in double-quoted YAML if it contains colons or other YAML metacharacters** (e.g. `description: "...javascript: URLs..."`). The Codex build uses `gray-matter` and will fail loudly on YAML errors.
- `user-invocable: true` on every skill (orchestrator and lenses)
- `input-mode: diff | changed-files` on every lens (NOT on the orchestrator)

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

**Orchestrator description preservation.** `skills/diff-review/SKILL.md`'s frontmatter description names the 6 default lens domains literally (`React performance, bugs, code quality, accessibility, security, TypeScript rigor`) plus an additive _"and any additional `lens-*` skills the user has installed"_ clause. **Do not over-generify.** Removing the literal domain words breaks AI dispatch on phrases like "review for accessibility" or "audit perf." The extension clause is _additive_, never _substitutive_.

**Bilingual README parity.** `README.md` (한국어, primary) and `README.en.md` are structurally identical — same headers, tables, diagrams, content. **Always edit both in the same change.** Drift between them is a bug.

**Commits.** Korean primary, conventional-commit prefixes (`feat:`, `chore:`, etc.).

## Adding a lens

The user-facing version of this lives in [docs/adding-a-lens.md](docs/adding-a-lens.md). For maintainers, the short form:

1. Create `skills/lens-<name>/SKILL.md` with frontmatter + rule catalog (one rule id per pattern)
2. Match the finding JSON schema above
3. Run `npm run build` to regenerate the Codex TOML

That's it. **Don't** edit `package.json`, **don't** edit the orchestrator's lens list (there isn't one anymore — Step 0 discovers it), **don't** edit either README's lens table for user-added lenses (the README table documents the 6 starters; user lenses don't need README entries).

If you're adding to the **shipped 6 starter set** (rare — the 6 are intentionally a stable opinionated baseline), then yes update both READMEs' lens tables and the architecture diagram in lockstep, and refresh the "5/6 lens가 diff만" framing in the cost section.

Bar for a rule: "reliably detectable from the lens's input-mode without runtime data" AND "would a senior frontend reviewer flag this on a PR." Both yes → add. One no → skip.

## Claude Code skill auto-registration (load-bearing assumption)

The CLI's Claude Code install path relies on Claude Code automatically registering `/<name>` slash commands when a `SKILL.md` lives at `.claude/skills/<name>/SKILL.md`. This is an Anthropic-side implementation detail. If the path convention changes upstream, the CLI's `installClaudeCode` function in `bin/fe-review-skills.mjs` is the single point to update.

## Gotchas

- **GitHub push protection blocks real-looking secret patterns** — Stripe (`sk_live_…`, `sk_test_…<24 alnum>`), AWS (`AKIA…`), JWTs, etc. — regardless of whether the value is intentionally fake. The regex matchers don't care about intent. If a fixture needs a hardcoded-secret demo, use a clearly broken placeholder like `sk_live_<YOUR_KEY>` (angle brackets defeat the alnum regex) or describe the pattern in prose. **Do not commit any string that could be mistaken for a real provider key.**
- **`examples/` was deliberately removed** during a push-protection cleanup (sample.diff contained Stripe-format keys that GitHub blocked). If you re-add example fixtures, follow the rule above — no real-looking secret patterns.
- **Lenses are LLM-based pattern review, not static analysis.** No SAST, no SCA, no runtime profiling, no auto-fix. Suggestions only — the user is the editor.
- **Conservative is a feature.** Lenses are tuned to skip uncertain patterns rather than guess. Don't loosen rules to "catch more" — false positives erode trust faster than missed issues.
- **Codex/Gemini parity is best-effort.** Claude Code is the primary target — its skill-discovery system maps `/diff-review` to a fully orchestrated workflow. Codex and Gemini install lenses only; users compose orchestration via natural language. If parity becomes important, verify each tool's skill mechanism *before* claiming support; do not assume `.gemini/AGENTS.md` or similar conventions.
