# Codex Runtime Repro

This document captures the current reproducible state of `fe-review-agents` in Codex.

## Goal

Verify whether `fe-review-agents` can be made discoverable and executable in current Codex Desktop/CLI runtime while keeping Claude Code compatibility intact.

## Repository State

The repository now exposes the Codex-oriented surfaces from a real plugin package root:

- repo-scoped marketplace: `.agents/plugins/marketplace.json`
- canonical plugin root: `plugins/fe-review-agents/`
- plugin manifest: `plugins/fe-review-agents/.codex-plugin/plugin.json`
- plugin lock: `plugins/fe-review-agents/plugin.lock.json`
- skill surfaces: `plugins/fe-review-agents/skills/`

The plugin root contains:

- `agents/`
- `commands/`
- `skills/`
- `.codex-plugin/`
- `plugin.lock.json`
- `README.md`

Claude Code compatibility remains intact via:

- `.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`
- synced root mirrors: `agents/`, `commands/`

## Tested Codex Install Paths

### 1. Repo marketplace registration

Command:

```bash
codex plugin marketplace add /Users/nohchihyun/Desktop/study/ai/fe-review-agents
```

Observed result:

- `~/.codex/config.toml` gains `[marketplaces.fe-review-agents]`
- Codex sessions still do not expose `fe-review-agents` in `/plugins`

### 2. Home-local marketplace registration

Command:

```bash
codex plugin marketplace add /Users/nohchihyun
```

Home-local marketplace file:

- `~/.agents/plugins/marketplace.json`

Home-local plugin directory:

- `~/plugins/fe-review-agents/`

Observed result:

- `~/.codex/config.toml` gains `[marketplaces.local]`
- `~/.agents/plugins/marketplace.json` resolves `./plugins/fe-review-agents` to `~/plugins/fe-review-agents`
- Codex sessions still do not expose `fe-review-agents` in `/plugins`

### 3. Manual enabled-plugin config

Added:

```toml
[plugins."fe-review-agents@fe-review-agents"]
enabled = true

[plugins."fe-review-agents@local"]
enabled = true
```

Observed result:

- entries persist in `~/.codex/config.toml`
- Codex sessions still do not expose `fe-review-agents` in `/plugins`

## Runtime Checks

### 2026-05-11 post-materialization check

Additional step taken after the plugin package was restructured:

- synced the canonical package root `plugins/fe-review-agents/` directly into the installed plugin directory:
  - source: `/Users/nohchihyun/Desktop/study/ai/fe-review-agents/plugins/fe-review-agents/`
  - installed path: `~/.codex/plugins/fe-review-agents/`
- verified the installed copy now contains:
  - `.codex-plugin/plugin.json` at version `0.7.0`
  - `plugin.lock.json`
  - `agents/`
  - `commands/`
  - `skills/fe-review-agents`
  - `skills/fe-review-diff-review`
  - `skills/fe-review-file-review`

Observed result after the first sync:

- `codex exec --json -C /Users/nohchihyun/Desktop/study/ai/fe-review-agents '$fe-review-file-review README.md'`
  - first agent message: ``$fe-review-file-review` is not an available skill in this session`
  - runtime fell back to generic repository review behavior
- `codex exec --json -C /Users/nohchihyun/Desktop/study/ai/fe-review-agents '/fe-review-agents:file-review README.md'`
  - first agent message: `Using $code-review workflow on README.md`
  - runtime did not dispatch `reviewer-react-perf`, `reviewer-quality`, `reviewer-bugs`, `reviewer-ts`, `reviewer-a11y`, `reviewer-security`, or `synthesizer`

### 2026-05-12 interactive and namespaced check

Additional findings after checking the interactive CLI and the plugin details screen:

- interactive `codex --no-alt-screen -C /Users/nohchihyun/Desktop/study/ai/fe-review-agents`
  - `/plugins` shows `FE Review Agents` as `Installed`
  - Plugin Details exposes these skill ids:
    - `fe-review-agents:fe-review-agents`
    - `fe-review-agents:fe-review-diff-review`
    - `fe-review-agents:fe-review-file-review`
- `/skills` search with unnamespaced `$fe-review...` returns `no matches`
- therefore the correct Codex invocation contract is **plugin-namespaced skill ids**, not bare `$fe-review-file-review`

Observed result with namespaced invocation:

- `codex exec --json -C /Users/nohchihyun/Desktop/study/ai/fe-review-agents '$fe-review-agents:fe-review-file-review docs/comparison/sample.tsx'`
  - first agent message: `파일 리뷰 워크플로를 그대로 따르겠습니다`
  - runtime reads the installed plugin workflow from:
    - `/Users/nohchihyun/.codex/plugins/cache/fe-review-agents/fe-review-agents/0.7.0/commands/file-review.md`
  - runtime spawns six reviewer subagents:
    - `reviewer-react-perf`
    - `reviewer-quality`
    - `reviewer-bugs`
    - `reviewer-ts`
    - `reviewer-a11y`
    - `reviewer-security`
  - runtime collects all six reviewer outputs successfully
  - runtime then attempts one final `synthesizer` spawn
  - the first synthesizer attempt is interrupted while all six reviewer agents are still open
  - runtime closes completed reviewer agents, retries synthesizer, and receives a completed synthesized report
  - final output is emitted as a single merged review report

### 2026-05-12 cross-repo child-agent check

To verify that the packaged workflow is not limited to this repository, the same namespaced skill contract was exercised against other frontend repositories in the same local environment:

- `toss-consumptions`
  - command:
    - `codex exec --json -C /Users/nohchihyun/Desktop/study/toss/toss-consumptions '$fe-review-agents:fe-review-file-review src/App.tsx'`
  - observed result:
    - runtime loads the installed plugin workflow from the local plugin cache
    - runtime retries fan-out without explicit custom `agent_type` assumptions
    - runtime successfully spawns reviewer child agents for the packaged workflow
- `toss-fe-desktop-job-application`
  - command:
    - `codex exec --json -C /Users/nohchihyun/Desktop/study/toss/toss-fe-desktop-job-application '$fe-review-agents:fe-review-file-review src/applyjob/formsections.tsx'`
  - observed result:
    - runtime enters the same namespaced packaged workflow outside this repository
    - workflow loading succeeds against the external repo target, confirming the package surface is reusable across repos

This matters because it narrows the remaining question from "does the plugin package execute at all?" to "which child-agent orchestration constraints still require cleanup/retry in some local runs?"

### `/plugins`

Interactive `/plugins` now shows `FE Review Agents` as installed after cache materialization.

The earlier "never appears" result was true before the cache install paths were populated, but is no longer accurate once the plugin is materialized into the loader paths.

### `/skills`

Observed available skills remain built-in/system and user-installed skills already known to the runtime.

Bare `$fe-review-agents` / `$fe-review-file-review` do not appear as direct matches.

The plugin details screen shows that Codex namespaces the exposed skills under the plugin id, so the relevant ids are:

- `$fe-review-agents:fe-review-agents`
- `$fe-review-agents:fe-review-diff-review`
- `$fe-review-agents:fe-review-file-review`

### Explicit skill invocation

Prompt tested:

```text
$fe-review-file-review docs/comparison/sample.tsx
```

Observed result:

- runtime says the skill name is not available in the session
- Codex falls back to generic review logic

Re-tested with the plugin-namespaced skill id:

```text
$fe-review-agents:fe-review-file-review docs/comparison/sample.tsx
```

Observed result:

- runtime enters the packaged file-review workflow
- reviewer fan-out succeeds
- initial synthesizer attempt is retried after reviewer cleanup
- final synthesized report is produced successfully

### Slash-command invocation

Prompt tested:

```text
/fe-review-agents:file-review src/App.tsx
```

Observed result:

- input is accepted as plain user text
- Codex falls back to generic repo exploration or generic code review
- no reviewer fan-out markers appear

Missing markers that would indicate real plugin execution:

- `reviewer-react-perf`
- `reviewer-quality`
- `reviewer-bugs`
- `reviewer-ts`
- `reviewer-a11y`
- `reviewer-security`
- `synthesizer`

## Narrowed Conclusion

This is no longer a basic repository-shape problem, and it is no longer a basic "plugin not installed" problem either.

What is now established:

- interactive `/plugins` can show `FE Review Agents` as installed after the plugin is materialized into Codex loader paths
- the correct Codex invocation contract is the plugin-namespaced skill ids:
  - `$fe-review-agents:fe-review-agents`
  - `$fe-review-agents:fe-review-diff-review`
  - `$fe-review-agents:fe-review-file-review`
- reviewer child-agent execution has been validated against local external repositories including:
  - `toss-consumptions`
  - `toss-fe-desktop-job-application`

The following repository-shape and install-shape issues have been addressed:

- missing plugin manifest under the actual plugin root
- missing marketplace entry
- missing plugin root under `plugins/<name>/`
- missing `skills/` surface
- symlink-only plugin root
- home-local marketplace path mismatch
- ambiguous root-vs-plugin source of truth
- stale installed plugin copy under `~/.codex/plugins/fe-review-agents`
- missing loader cache installs under `~/.codex/plugins/cache/<marketplace>/<plugin>`
- wrong assumption that the skill ids would be bare rather than plugin-namespaced

What still remains is understanding why the first synthesizer attempt needs cleanup-and-retry in this local setup, even though the end-to-end workflow completes.

The remaining likely causes are:

1. Codex requires plugin-namespaced skill invocation even when docs/examples often show bare `$skill` forms.
2. Current Codex runtime can materialize, expose, and execute the plugin when called through plugin-namespaced skill ids.
3. There may still be an undocumented runtime constraint around concurrent plugin-defined subagent orchestration, because synthesizer execution appears to work only after reviewer cleanup/retry.

## External Signals

Relevant upstream reports that match the current symptoms:

- Codex local skills not injected into runtime skill list:
  - `openai/codex` issue `#15136`
- Codex plugin visibility problems in app:
  - `openai/codex` issue `#19701`
- Codex Electron local plugin UI/runtime mismatch:
  - `openai/codex` issue `#16663`
- Codex symlinked `.agents/skills` discovery bug:
  - `openai/codex` issue `#11314`

## Recommended Next Step

Treat this as a Codex runtime compatibility bug unless a successful App-side install flow can be demonstrated that:

1. shows `FE Review Agents` as installed in `/plugins`
2. documents or confirms the plugin-namespaced skill ids
3. documents whether the initial synthesizer interruption is expected runtime behavior or an avoidable plugin-side orchestration issue
