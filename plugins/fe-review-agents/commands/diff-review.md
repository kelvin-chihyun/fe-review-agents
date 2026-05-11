---
description: 여러 reviewer subagent를 한꺼번에 호출해 git diff를 리뷰하고 synthesizer로 중요도순 종합 리포트를 만듭니다. 사용법 — /fe-review-agents:diff-review [scope] [lang=ko|en] [severity_min=LOW|MED|HIGH|CRITICAL]. scope=staged(기본)/unstaged/branch:<name>/range:<a>..<b>
argument-hint: "[scope] [lang=ko|en] [severity_min=LOW|MED|HIGH|CRITICAL]"
---

git diff 기반 리뷰 워크플로우. 여러 reviewer + synthesizer.

## 단계 0 — Git 확인 + 인자 파싱 + diff 추출

먼저 `Bash`로 `git rev-parse --is-inside-work-tree`를 실행해 git 레포인지 확인. 아니면 "git 레포가 아닙니다" 알리고 종료.

`$ARGUMENTS`에서 다음 두 옵션 토큰을 먼저 추출:

- `lang=ko|en` (기본 `ko`)
- `severity_min=LOW|MED|HIGH|CRITICAL` (기본 `LOW`. 대소문자 무시 — 내부적으로 대문자로 정규화)

각 토큰의 값이 위 허용 목록에 없으면 default로 fallback하고 사용자에게 한 줄 경고를 그대로 출력 (예: ``severity_min=foo`는 무효 — `LOW`로 진행``). 두 토큰을 제거한 나머지를 scope로 해석:

| scope 토큰 | 실행 명령 |
|--------------|-----------|
| 비어있음 또는 `staged` | `git diff --cached --unified=3` |
| `unstaged` | `git diff --unified=3` |
| `branch:<name>` | `git diff <name>...HEAD --unified=3` |
| `range:<a>..<b>` | `git diff <a>..<b> --unified=3` |

위 형식에 안 맞으면 사용자에게 사용법 알리고 종료.

`auto` 모드 보강: 만약 사용자가 scope 인자 없이 호출했고 staged diff가 비어있으면, unstaged로 한 번 더 시도.

## 단계 1 — 프론트엔드 파일만 필터링

diff에서 다음 확장자만 남기고 나머지 파일 hunk는 제거:
`.ts .tsx .js .jsx .mjs .cjs .vue .svelte .html .css .scss`

다음은 제외: `.d.ts`, `dist/**`, `build/**`, `.next/**`, `node_modules/**`, `*.test.*`, `*.spec.*`, `__tests__/**`, `*.stories.*`

- 필터 후 비어있으면: "리뷰할 프론트엔드 변경 없음" 알리고 종료.
- 필터 후 라인 수 2,000 초과면: "diff가 너무 큽니다. scope를 좁혀주세요 (예: branch:main, range:HEAD~1..HEAD)" 안내하고 종료.

## 단계 1.5 — 필터된 diff를 임시 파일에 저장

병렬 dispatch를 위해 필터된 diff 텍스트를 `/tmp/fe-review-diff.txt`에 저장합니다. **두 단계로**:

1. **먼저 `Bash`로 `rm -f /tmp/fe-review-diff.txt` 실행.** 기존 파일이 있으면 (이전 세션 잔존물 등) 삭제, 없으면 no-op (`-f` 플래그가 에러 억제). 이 단계로 `Write` 도구의 "exists → Read first" 요건 회피 + stale 파일 권한 충돌 방지.
2. **그 다음 `Write` 도구로** 필터된 diff 내용을 `/tmp/fe-review-diff.txt`에 저장.

이렇게 하면 단계 2의 dispatch prompt가 작아져서 (path만 전달) 모든 Agent 호출이 하나의 어시스턴트 메시지에 한꺼번에 담겨 실제로 병렬 실행됩니다. (diff 텍스트를 prompt에 인라인하면 출력이 거대해져 모델이 dispatch를 스스로 나눠 → 직렬 실행으로 바뀝니다.)

각 reviewer는 자기 sub-agent 컨텍스트에서 `Read`로 이 파일을 한 번씩 읽습니다 (병렬이라 wall-time에 영향 미미).

## 단계 2 — 모든 reviewer를 **병렬로** 호출

**반드시 하나의 어시스턴트 메시지 안에, reviewer 6개를 한꺼번에 병렬 호출하세요.** (순차 호출 금지)

Codex와 Claude Code의 child-agent 표면이 다를 수 있으므로, 다음 원칙으로 실행합니다:

- reviewer별 기준 프롬프트는 `../../agents/reviewer-react-perf.md`, `../../agents/reviewer-quality.md`, `../../agents/reviewer-bugs.md`, `../../agents/reviewer-ts.md`, `../../agents/reviewer-a11y.md`, `../../agents/reviewer-security.md`에서 읽어 사용합니다.
- **Codex에서는 custom `agent_type` 이름(`reviewer-react-perf` 등)을 가정하지 말고**, native child agent를 spawn한 뒤 reviewer 파일의 지침 + 아래 task 문장을 합친 prompt를 전달하세요.
- **Claude Code에서 plugin agent type dispatch가 실제로 지원되는 경우에만** `reviewer-react-perf` 같은 이름 dispatch를 사용하세요.
- 핵심은 “6개 독립 reviewer를 병렬 실행하고, 각 reviewer가 자기 카테고리 출력 형식을 지키게 하는 것”이지, 특정 런타임의 agent registration 방식에 하드코딩되는 것이 아닙니다.

각 reviewer에 전달할 task 문장 (`<LANG>`은 단계 0에서 결정한 언어):

```
다음 경로의 git diff 파일을 [관점] 관점에서 리뷰하세요.
(diff 모드 — Read로 파일을 읽고 그 안의 diff 텍스트만 분석. 일반 source code 리뷰가 아님)

lang=<LANG>

DIFF 파일 경로: /tmp/fe-review-diff.txt
```

6개 reviewer 관점:

1. 성능
2. 코드 품질
3. 잠재 버그
4. TypeScript 타입 안전성
5. 웹 접근성
6. 보안

## 단계 3 — synthesizer 호출

모든 reviewer 결과가 돌아오면, **synthesizer를 띄우기 전에 완료된 reviewer agent들을 정리해 슬롯을 비우세요.**

- reviewer fan-out이 끝나면 reviewer별 출력 전문은 로컬에 보존한 뒤 completed reviewer agent를 닫아도 됩니다.
- 런타임이 동시 child-agent 수를 제한하는 경우, 이 정리 단계 없이 `synthesizer` spawn이 한 번 실패했다가 재시도될 수 있습니다.
- 따라서 reviewer 출력 수집 → reviewer agent 정리 → `synthesizer` spawn 순서를 따르세요.

그 다음 마지막으로 `../../agents/synthesizer.md`의 지침을 기준으로 child agent 하나를 띄워 synthesizer 역할을 수행하게 합니다.

- synthesizer prompt는 다음 형식으로 모든 reviewer 결과를 포함 (`<resolved-scope>` 자리에는 단계 0에서 해석된 scope를 적음, `<LANG>`은 단계 0에서 결정한 언어, `<SEVERITY_MIN>`은 단계 0에서 결정한 최소 심각도):
  ```
  대상: git diff (scope: <resolved-scope>)
  lang=<LANG>
  severity_min=<SEVERITY_MIN>

  모든 reviewer의 결과를 종합해 중요도순 리포트를 작성해주세요.

  ## 1. Performance
  <reviewer-react-perf 출력 전문>

  ## 2. Code Quality
  <reviewer-quality 출력 전문>

  ## 3. Bugs
  <reviewer-bugs 출력 전문>

  ## 4. TypeScript
  <reviewer-ts 출력 전문>

  ## 5. Accessibility
  <reviewer-a11y 출력 전문>

  ## 6. Security
  <reviewer-security 출력 전문>
  ```

## 단계 4 — 사용자에게 출력

synthesizer가 반환한 마크다운 리포트를 **그대로** 사용자에게 보여주세요. 추가 설명/요약/메타 코멘트 금지.
