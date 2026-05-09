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

**반드시 하나의 어시스턴트 메시지 안에, 아래 나열된 모든 Agent 도구 호출을 한꺼번에 보내야 합니다.** (순차 호출 금지)

각 reviewer에 다음 형식의 prompt를 전달 (`<LANG>`은 단계 0에서 결정한 언어):

```
파일 `<FILE_PATH>`를 [관점] 관점에서 리뷰하세요. (파일 모드 — Read 도구로 파일을 직접 읽으세요)

lang=<LANG>
```

각 호출의 정확한 파라미터:

1. `Agent` — `subagent_type: reviewer-react-perf`, `description: "Perf review"`, [관점]="성능"
2. `Agent` — `subagent_type: reviewer-quality`, `description: "Quality review"`, [관점]="코드 품질"
3. `Agent` — `subagent_type: reviewer-bugs`, `description: "Bugs review"`, [관점]="잠재 버그"
4. `Agent` — `subagent_type: reviewer-ts`, `description: "TS review"`, [관점]="TypeScript 타입 안전성"
5. `Agent` — `subagent_type: reviewer-a11y`, `description: "A11y review"`, [관점]="웹 접근성"
6. `Agent` — `subagent_type: reviewer-security`, `description: "Security review"`, [관점]="보안"

**중요**: 위 `subagent_type` 이름을 정확히 그대로 사용하세요. `general-purpose`로 폴백하지 마세요.

## 단계 2 — synthesizer 호출

모든 reviewer 결과가 돌아오면 마지막으로 `synthesizer`를 한 번 더 `Agent`로 호출:

- `subagent_type`: `synthesizer`
- `description`: "Synthesize review"
- `prompt`: 다음 형식으로 모든 reviewer 결과를 포함 (`<LANG>`은 단계 0에서 결정한 언어, `<SEVERITY_MIN>`은 단계 0에서 결정한 최소 심각도):
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
