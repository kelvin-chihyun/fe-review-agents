# 병렬 sub-agent dispatch가 직렬화되던 이유와 해결

> Engineering note · `fe-review-agents` v0.6.0 작업 중 발견·해결한 이슈 정리.

## 컨텍스트

`fe-review-agents`는 Claude Code 플러그인. 슬래시 커맨드 1개 실행으로 6개 전문 reviewer 에이전트(perf / quality / bugs / ts / a11y / security)가 코드를 다각도 리뷰하고 synthesizer가 단일 우선순위 리포트로 합치는 구조다.

핵심 설계 원칙은 **per-reviewer context isolation** — 각 reviewer가 독립된 sub-agent 컨텍스트에서 자기 관점만 평가하면 reasoning contamination · mode collapse가 사라져 단일-프롬프트 "전부 다 리뷰" 대비 품질이 좋다. 여기에 **하나의 어시스턴트 메시지에 6개 Agent tool_use를 한꺼번에 호출** = 런타임이 동시 실행 → wall-time 단축이라는 두 번째 효과까지 같이 의도했다.

## 문제

진입점이 두 개다.

- `/fe-review-agents:file-review <path>` — 단일 파일 리뷰
- `/fe-review-agents:diff-review [scope]` — git diff 리뷰

같은 6-reviewer + synthesizer 파이프라인을 거치는데, 실제 실행해 보니 **file-review는 6개가 동시에 실행되는데 diff-review는 1개씩 순서대로** 실행됐다. wall-time도 약 5~6배 차이.

두 커맨드 본문은 거의 동일. dispatch 부분도 똑같이 "**반드시 하나의 어시스턴트 메시지 안에 Agent 도구 호출 6개를 동시에 넣어야 합니다.**"라는 지시문이 들어 있었다. 그런데 한쪽만 지켜진다.

## 가설 도출

다른 점이 뭔지 좁혀 봤다.

| | file-review | diff-review |
|---|---|---|
| dispatch prompt 길이 | 약 50토큰 (`파일 X를 [관점] 관점에서 리뷰`) | 수만 토큰 (DIFF_TEXT 통째 인라인) |
| reviewer당 입력 | 파일 경로 1개 | 같은 큰 diff를 6번 반복 인라인 |
| orchestrator 출력량 | 작음 | 6 × 수만 토큰 = 매우 큼 |

`Claude Code 런타임이 6개 Task를 직렬화한다`는 일반화된 가정으로는 file-review의 병렬 동작을 설명할 수 없다. 런타임은 동시 실행 능력이 있다.

남는 후보는 모델의 **자율적 dispatch 분할 행동**.

> 가설 — orchestrator(메인 세션)가 6개 reviewer 각각에 거대한 prompt를 emit해야 할 때, 한 어시스턴트 응답에 그 양을 한꺼번에 출력하기엔 비용이 너무 크다고 판단해 **"우선 1개 보내고 결과 받자"** 식으로 스스로 dispatch를 나눈다. 결과적으로 어시스턴트 응답이 6개로 분할돼 각 응답에 1개 tool_use만 들어가고 → 직렬 실행.

`single message N tool_use → 동시 실행`은 런타임 보장이지만, **N개 tool_use를 한 메시지에 emit할지는 모델이 결정**한다. prompt가 작으면 모델은 부담 없이 6개를 한 번에 적는다. 거대한 prompt를 6번 적어야 하면 출력 토큰 cap · 응답 latency 부담이 달라져 행동이 갈린다.

## 해결

dispatch prompt를 작게 만들면 된다. 진단이 맞다면 file-review처럼 path만 넘기고 reviewer가 직접 읽도록 바꾸면 된다.

### 변경

**`commands/diff-review.md`**

단계 1.5 추가 — 필터된 diff를 `Write` 도구로 임시 파일에 저장:

```
## 단계 1.5 — 필터된 diff를 임시 파일에 저장

병렬 dispatch를 위해 필터된 diff 텍스트를 Write 도구로 /tmp/fe-review-diff.txt에 저장합니다.
이렇게 하면 단계 2에서 dispatch prompt가 작아져 (path만 전달) 6개 Agent 호출이 한 어시스턴트
메시지에 묶여 진짜 병렬로 실행됩니다.
```

단계 2 dispatch prompt 변경:

```diff
- 다음 git diff를 [관점] 관점에서 리뷰하세요. (diff 모드 — Read 도구 사용 안 함, 아래 diff 텍스트만 분석)
-
- lang=<LANG>
-
- ```diff
- <DIFF_TEXT>     ← 수만 토큰. 6번 반복.
- ```

+ 다음 경로의 git diff 파일을 [관점] 관점에서 리뷰하세요.
+ (diff 모드 — Read로 파일을 읽고 그 안의 diff 텍스트만 분석. 일반 source code 리뷰가 아님)
+
+ lang=<LANG>
+
+ DIFF 파일 경로: /tmp/fe-review-diff.txt     ← 한 줄.
```

**6개 `agents/reviewer-*.md`**

diff 모드 설명을 "프롬프트에 diff 텍스트 인라인" → "diff 파일 경로 → Read로 읽기"로 변경:

```diff
- 2. **diff 모드** — 프롬프트에 diff 텍스트가 포함되어 있으면 그 텍스트만 직접 분석합니다 (Read 사용 안 함).

+ 2. **diff 모드** — 프롬프트가 `(diff 모드 — ...)`라고 명시하고 diff 파일 경로
+    (예: /tmp/fe-review-diff.txt)가 주어지면, Read로 그 파일을 읽고 안에 든 git diff 텍스트만 분석합니다.
+    (전체 source 리뷰가 아니라, hunk에 변경된 라인만 대상.)
```

### 결과

`/reload-plugins` 후 동일 diff로 재테스트 → 6개 reviewer가 하나의 어시스턴트 메시지에 한꺼번에 호출되어 **병렬 실행으로 wall-time 단축 확인**.

## 트레이드오프

- ➕ dispatch prompt가 작아져 모델이 6개 tool_use를 한 메시지에 emit → 진짜 병렬
- ➕ orchestrator의 출력 토큰 절감 (diff text를 6번 인라인하지 않음)
- ➕ reviewer 간 컨텍스트가 동일한 파일을 Read하므로 Anthropic prompt cache 히트 가능
- ➖ reviewer마다 Read 호출 1번 추가 (병렬이라 wall-time 영향 미미, 약 +1초)
- ➖ `/tmp/fe-review-diff.txt` 한 개 파일이 OS temp에 남음 (재부팅 시 자동 정리. 디버깅에 오히려 유용 — `cat`으로 마지막 리뷰 입력 확인 가능)

## 배운 점

1. **`single message → parallel execution`은 런타임 보장이지만, `single message에 N개 tool_use를 넣을지`는 모델 결정.** 둘을 분리해서 봐야 한다.

2. **LLM 오케스트레이션 디자인에서 prompt 크기는 latency 변수가 아니라 control flow 변수다.** "큰 prompt × N"을 "path × N + 한 번의 외부 저장"으로 바꾸는 패턴은 다른 fan-out 워크로드에도 그대로 적용 가능.

3. **튜닝하기 전에 가설을 좁혀야 한다.** 처음엔 "Claude Code 런타임이 sub-agent를 직렬화한다"는 일반론에 빠질 수 있었지만, file-review의 병렬 작동이 그 가설의 반례였다. 같은 런타임 · 같은 sub-agent · 다른 결과 → 차이가 만든 변수가 원인. 그 변수가 prompt 크기였다.

4. **직접 확인 가능한 진단 신호 = 출력 wall-time vs 입력 prompt 크기.** 모델이 dispatch를 나누는 명확한 임계점은 없다 (점진적으로 변하는 행동). 다만 reviewer당 prompt가 5K 토큰을 넘기 시작하면 분할 확률이 눈에 띄게 올라간다는 게 이번 사례에서의 관찰.

## 적용 커밋

- `commands/diff-review.md` — 단계 1.5 추가, dispatch prompt 축소
- `agents/reviewer-{perf,quality,bugs,ts,a11y,security}.md` (6개) — diff 모드 설명 갱신
