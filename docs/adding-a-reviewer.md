# Adding a reviewer

`fe-review-agents` ships 6 starter reviewers (perf, bugs, ts, code quality, a11y, security). When you spot a perspective that's missing for your team — i18n, performance budgets, motion-reduce, dependency hygiene, anything — you can add a reviewer.

## How this works

This is a maintainer/dev guide. It assumes you are working from a fork or local clone, not from an already-installed plugin.

In Claude Code, the marketplace install lands under `~/.claude/plugins/cache/...`, which is **read-only territory** — Claude Code manages it. In Codex, the canonical package you edit lives at `plugins/fe-review-agents/`, while `.agents/plugins/marketplace.json` is the repo marketplace used for GitHub marketplace-source installs and local packaging verification. Repository-root `agents/` and `commands/` are synchronized compatibility mirrors for Claude Code. To add your own reviewer, you fork the repo and iterate on that fork. There are two common ways to iterate:

- **Claude Code local dev** (fast loop, just for you) — `claude --plugin-dir <your-fork-clone>` loads your fork into a session. Hot-reload edits with `/reload-plugins`.
- **Codex local dev** — follow [docs/codex-dev.md](./codex-dev.md) to register your fork as a local marketplace source, restart Codex, then install or enable `fe-review-agents` from the repo-scoped entry.
- **Team distribution** — push your fork, then your teammates install it through the tool-specific marketplace flow they use.

The content edits (agent file + register in both slash commands) are the same either way; only the distribution step differs.

## 1. Pick a question the existing 6 don't answer

Each reviewer answers _one_ question and only that one:

- `reviewer-react-perf` — _Is it fast?_
- `reviewer-bugs` — _Is it correct?_
- `reviewer-ts` — _Does it work with the type system, or against it?_
- `reviewer-quality` — _Is it easy to change?_
- `reviewer-a11y` — _Does it reach everyone?_
- `reviewer-security` — _Does data leak?_

If your idea folds cleanly into one of those, edit that reviewer's rule catalog instead. A new reviewer earns its keep when the question is _orthogonal_ to all six.

Examples that pass the bar: i18n / l10n correctness, motion / `prefers-reduced-motion`, dependency / supply-chain hygiene, dead-code, observability (logging / telemetry), bundle-size budgets, design-token adherence.

## 2. Fork and clone

GitHub UI: open `https://github.com/huurray/fe-review-agents` → **Fork** → fork lands at `<your-username>/fe-review-agents`.

```bash
git clone https://github.com/<your-username>/fe-review-agents.git
cd fe-review-agents
```

You'll edit files inside this clone. Refer to its absolute path as `<your-fork>` below.

## 3. Create the agent file

Add a single markdown file under the canonical plugin root:

```
<your-fork>/plugins/fe-review-agents/agents/reviewer-<name>.md
```

The `reviewer-` prefix is required — that's how the slash-command orchestrator dispatches the agent. After editing the canonical plugin files, run `node scripts/sync-claude-surface.mjs` from `<your-fork>` so Claude's root-level mirrors stay in sync.

## 4. Frontmatter contract

Every reviewer's agent file must start with this YAML block:

```yaml
---
name: reviewer-<your-name>
description: "One sentence on what this reviewer reviews. Include trigger keywords the model should match against. Quote the whole string to be safe with colons."
tools: Read
---
```

| Key           | Required | Notes                                                                                                                                                  |
| ------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `name`        | yes      | Must match the filename (`reviewer-<your-name>`, no extension). Becomes the `subagent_type` the slash command dispatches.                              |
| `description` | yes      | One sentence. Drives AI auto-invocation when the user mentions the topic. **Wrap in double quotes** if it contains colons or other YAML metacharacters.|
| `tools`       | yes      | `Read` only. Reviewers don't write, edit, or run code.                                                                                                  |

## 5. Body contract — output format

Every reviewer **emits the same one-line markdown format** so the synthesizer can sort, dedupe, and present findings consistently. Copy this into your reviewer body:

```markdown
### <emoji> <Category>
- **[<axis>/<rule-id>]** [SEVERITY] Line N: <one-line issue> — <one-line fix>
```

| Field        | Notes                                                                                                                                                                                                |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `emoji`      | Pick a distinctive emoji (existing ones: ⚡ ✨ 🐛 📘 ♿ 🔒). Helps the synthesizer's grouping pass.                                                                                                       |
| `Category`   | The display name (e.g. "Performance", "Internationalization").                                                                                                                                       |
| `axis`       | Stable lowercase ID, prefixes every rule (e.g. `i18n`, `motion`, `deps`). Use one axis per reviewer unless the domain has natural sub-axes (code-quality uses `readability/`, `predictability/`, …). |
| `rule-id`    | Stable short ID for the specific rule (`missing-translation-key`, `unscoped-locale-load`).                                                                                                            |
| `SEVERITY`   | One of: `CRITICAL`, `HIGH`, `MED`, `LOW`. **Don't add new levels** — synthesizer's sort relies on these four.                                                                                          |
| `Line N`     | Line number in the post-change file (diff mode → use the `+new` from `@@ -old +new @@`).                                                                                                              |
| issue / fix  | One short sentence each, separated by `—`.                                                                                                                                                            |

If no issues: `### <emoji> <Category>\n- 발견된 이슈 없음` (lang=ko) or `- No issues found` (lang=en).

## 6. Body contract — language branching

Add this snippet to the "할 일" / "Tasks" section near the top:

> **언어 분기**: 호출자가 `lang=en`을 전달하면 영어로, `lang=ko`이거나 미지정이면 한국어로 출력하세요. 룰 ID는 언어와 무관하게 그대로.

Reviewer outputs are merged by the synthesizer in whichever language the user asked for. Rule IDs (`[axis/rule-id]`) stay constant across languages — only the issue/fix prose translates.

## 7. Body contract — rule catalog

Below the output spec, list the rules your reviewer applies:

```markdown
## 룰 카탈로그

### <Group name>
- **[<axis>/<rule-id-1>]** [SEVERITY] — <pattern in one line. what to look for.>
- **[<axis>/<rule-id-2>]** [SEVERITY] — <pattern>
```

Conservative is a feature: false positives erode trust faster than missed issues. If you're not sure whether a pattern is a bug, skip it.

## 8. Register with both slash commands

This is the step that makes your reviewer actually run. Edit the canonical command files under `plugins/fe-review-agents/commands/` in your fork.

**(a) Append a dispatch row in Step 2.** Each command has a numbered list of `Agent` calls (1–6 currently). Add yours as #7:

```markdown
7. `Agent` — `subagent_type: reviewer-<your-name>`, `description: "<Short> review"`, [관점]="<Korean perspective name>"
```

(For `plugins/fe-review-agents/commands/file-review.md` the prompt template is the file-mode one; for `plugins/fe-review-agents/commands/diff-review.md` it's the diff-mode one. The template is identical for all reviewers within a command — you're just adding a new dispatch line.)

**(b) Append an input section in the synthesizer prompt.** Each command's Step 3 (diff-review) / Step 2 (file-review) has the synthesizer prompt body with `## 1. Performance` through `## 6. Security`. Add:

```markdown
## 7. <Your Category>
<reviewer-<your-name> 출력 전문>
```

When the canonical edits are done, run `node scripts/sync-claude-surface.mjs` once to refresh root `agents/` and `commands/` for Claude Code. If you skip step 8, your agent file exists but no slash command dispatches it. Direct invocation (`@reviewer-<your-name>`) still works.

## 9. Boundary discipline

The 6 starter reviewers overlap minimally because each one stays inside its own question. Some easy traps and how the existing reviewers handle them:

- **`reviewer-bugs` vs `reviewer-ts`** — A `!` non-null assertion on something that can actually be null is `bugs/non-null-assert-on-external`. A `!` used to silence a type checker on something that's _not_ null at runtime is `ts/non-null-assertion`. Same syntax, different question; both reviewers can fire and the synthesizer keeps both since the rule IDs differ.
- **`reviewer-react-perf` vs `reviewer-quality`** — Heavy memoization on values that don't change is `perf/rendering-memo-empty-deps`. Drilling state through 5 components is `cohesion/pass-through-prop`. Don't try to make one reviewer cover both.
- **`reviewer-a11y` vs `reviewer-security`** — `dangerouslySetInnerHTML` from user input is `security/dangerously-set-inner-html`. From trusted CMS content with screen-reader implications is an `a11y/...` finding. Different question, possibly both fire.

Pattern: when in doubt, _which question is the user really asking when they hit this issue?_ That's the reviewer that should fire.

## 10. Test locally (no push needed)

Before pushing your fork, iterate using a local plugin load:

```bash
claude --plugin-dir <your-fork>
```

In that Claude Code session your fork is loaded as a plugin. After edits to `plugins/fe-review-agents/agents/` or `plugins/fe-review-agents/commands/`, run `node scripts/sync-claude-surface.mjs`, then `/reload-plugins` (no restart needed).

For Codex, use the local packaging loop in [docs/codex-dev.md](./codex-dev.md) against the same fork, then restart Codex and install or enable the repo-scoped `fe-review-agents` entry exposed by that fork.

Verify:

- `@reviewer-<your-name>` — direct invocation should work standalone. If not, check the agent file's frontmatter (most common issue: unquoted colon in `description`).
- `/fe-review-agents:diff-review` on a diff that should trigger your rules — your reviewer's `### <emoji> <Category>` section should appear in the synthesizer's output.

This is the right loop for development. Push only when you're done.

## 11. (Optional) Distribute to your team

Once the reviewer works, push your fork:

```bash
git add \
  plugins/fe-review-agents/agents/reviewer-<your-name>.md \
  plugins/fe-review-agents/commands/diff-review.md \
  plugins/fe-review-agents/commands/file-review.md \
  agents/reviewer-<your-name>.md \
  commands/diff-review.md \
  commands/file-review.md
git commit -m "feat: add reviewer-<your-name>"
git push origin main
```

For Claude Code, teammates can install from your fork:

```
/plugin marketplace add <your-username>/fe-review-agents
/plugin install fe-review-agents@fe-review-agents
```

If they had the upstream `huurray/fe-review-agents` marketplace registered, they'll need to swap. Either remove the old one (`/plugin marketplace remove fe-review-agents`) and add yours, or keep both registered — Claude Code uses the marketplace name to disambiguate, so install from the one you want explicitly.

For Codex, teammates can add your fork as a GitHub marketplace source with `codex plugin marketplace add <your-username>/fe-review-agents`, then install it from `/plugins`. That is separate from publishing to OpenAI's official public Plugin Directory, whose self-serve process is still documented as coming soon.

## Skeleton

Copy this into a fresh `agents/reviewer-<name>.md` to start:

````markdown
---
name: reviewer-<name>
description: "One sentence on what this reviewer covers. Include keywords like 'review for X', 'audit Y', so the AI dispatcher knows when to fire it."
tools: Read
---

당신은 **<관점> 전문 리뷰어**입니다. <기준 출처> 기반.

## 할 일

입력 모드를 판단해 적절히 처리:
1. **파일 모드** — 파일 경로가 주어지면 `Read`로 읽습니다.
2. **diff 모드** — 프롬프트에 diff 텍스트가 포함되어 있으면 그 텍스트만 직접 분석합니다 (`Read` 사용 안 함).
3. 아래 카탈로그의 룰만 적용해 이슈를 찾습니다.
4. 출력 형식대로 보고합니다.

**라인 번호**: diff 모드에서는 hunk 헤더(`@@ -old +new @@`)의 `+new`를 기준으로 산출.

**언어 분기**: 호출자가 `lang=en`을 전달하면 영어로, `lang=ko`이거나 미지정이면 한국어로 출력하세요. 룰 ID는 언어와 무관하게 그대로.

## 룰 카탈로그

### <그룹 이름>
- **[<axis>/<rule-id-1>]** [HIGH] — <한 줄 패턴 설명>
- **[<axis>/<rule-id-2>]** [MED] — <한 줄 패턴 설명>

## 출력 형식

```markdown
### <emoji> <Category>
- **[<axis>/rule-id]** [SEVERITY] Line N: <한 줄 이슈> — <한 줄 수정안>
```

이슈 없으면: `### <emoji> <Category>\n- 발견된 이슈 없음` (영어 모드: `- No issues found`)

## 규칙
- 위 카탈로그 rule ID만 사용. 새로 만들지 마세요.
- <당신 관점>만. 다른 카테고리는 무시.
- 라인 번호 정확히. 짧게.
````

That's the file. Then do step 8 (register in both slash commands), test with `--plugin-dir` (step 10), and optionally push to your fork to share (step 11).
