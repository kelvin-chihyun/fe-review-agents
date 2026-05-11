---
description: 여러 reviewer subagent를 한꺼번에 호출해 단일 파일을 리뷰하고 synthesizer로 중요도순 종합 리포트를 만듭니다. 사용법 — /fe-review-agents:file-review <파일 경로> [lang=ko|en] [severity_min=LOW|MED|HIGH|CRITICAL]
argument-hint: "<file-path> [lang=ko|en] [severity_min=LOW|MED|HIGH|CRITICAL]"
---

단일 파일 다각도 리뷰. 여러 reviewer + synthesizer.

## 단계 0 — 인자 파싱

`$ARGUMENTS`에서 다음 두 옵션 토큰을 먼저 추출:

- `lang=ko|en` (기본 `ko`)
- `severity_min=LOW|MED|HIGH|CRITICAL` (기본 `LOW`. 대소문자 무시 — 내부적으로 대문자로 정규화)

각 토큰의 값이 위 허용 목록에 없으면 default로 fallback하고 사용자에게 한 줄 경고를 그대로 출력 (예: ``severity_min=foo`는 무효 — `LOW`로 진행``). 두 토큰을 제거한 나머지를 파일 경로로 사용.

만약 파일 경로가 비어있다면, 사용자에게 어떤 파일을 리뷰할지 먼저 물어본 뒤 진행하세요.

리뷰 대상 파일을 `<FILE_PATH>`로 지칭합니다.

## 단계 1 — 모든 reviewer를 **병렬로** 호출

**반드시 하나의 어시스턴트 메시지 안에, reviewer 6개를 한꺼번에 병렬 호출하세요.** (순차 호출 금지)

Codex와 Claude Code의 child-agent 표면이 다를 수 있으므로, 다음 원칙으로 실행합니다:

- reviewer별 기준 프롬프트는 `../../agents/reviewer-react-perf.md`, `../../agents/reviewer-quality.md`, `../../agents/reviewer-bugs.md`, `../../agents/reviewer-ts.md`, `../../agents/reviewer-a11y.md`, `../../agents/reviewer-security.md`에서 읽어 사용합니다.
- **Codex에서는 custom `agent_type` 이름(`reviewer-react-perf` 등)을 가정하지 말고**, native child agent를 spawn한 뒤 reviewer 파일의 지침 + 아래 task 문장을 합친 prompt를 전달하세요.
- **Claude Code에서 plugin agent type dispatch가 실제로 지원되는 경우에만** `reviewer-react-perf` 같은 이름 dispatch를 사용하세요.
- 핵심은 “6개 독립 reviewer를 병렬 실행하고, 각 reviewer가 자기 카테고리 출력 형식을 지키게 하는 것”이지, 특정 런타임의 agent registration 방식에 하드코딩되는 것이 아닙니다.

각 reviewer에 전달할 task 문장 (`<LANG>`은 단계 0에서 결정한 언어):

```
파일 `<FILE_PATH>`를 [관점] 관점에서 리뷰하세요. (파일 모드 — Read 도구로 파일을 직접 읽으세요)

lang=<LANG>
```

6개 reviewer 관점:

1. 성능
2. 코드 품질
3. 잠재 버그
4. TypeScript 타입 안전성
5. 웹 접근성
6. 보안

## 단계 2 — synthesizer 호출

모든 reviewer 결과가 돌아오면, **synthesizer를 띄우기 전에 완료된 reviewer agent들을 정리해 슬롯을 비우세요.**

- reviewer fan-out이 끝나면 reviewer별 출력 전문은 로컬에 보존한 뒤 completed reviewer agent를 닫아도 됩니다.
- 런타임이 동시 child-agent 수를 제한하는 경우, 이 정리 단계 없이 `synthesizer` spawn이 한 번 실패했다가 재시도될 수 있습니다.
- 따라서 reviewer 출력 수집 → reviewer agent 정리 → `synthesizer` spawn 순서를 따르세요.

그 다음 마지막으로 `../../agents/synthesizer.md`의 지침을 기준으로 child agent 하나를 띄워 synthesizer 역할을 수행하게 합니다.

- synthesizer prompt는 다음 형식으로 모든 reviewer 결과를 포함 (`<LANG>`은 단계 0에서 결정한 언어, `<SEVERITY_MIN>`은 단계 0에서 결정한 최소 심각도):
  ```
  파일 경로: <FILE_PATH>
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

## 단계 3 — 사용자에게 출력

synthesizer가 반환한 마크다운 리포트를 **그대로** 사용자에게 보여주세요. 추가 설명/요약/메타 코멘트 금지.
