# fe-review-skills

> 잘 알려진 프론트엔드 가이드라인 — Vercel React Best Practices, Toss Frontend Fundamentals, Effective TypeScript, WCAG 2.2, OWASP 등 — 을 **병렬 sub-agent로 동시에 돌려 하나의 리포트로 머지**하는 오픈소스 스킬팩.

🇺🇸 [English](./README.en.md)

---

## 무엇을 해주나요?

에이전트에게 diff 리뷰를 요청하면 이 스킬팩이:

1. 관련 `git diff`를 **수집** (staged / unstaged / branch / 리비전 범위) — 구조적 룰을 보는 lens가 켜져 있으면 변경된 파일 전체도 함께
2. 각 lens가 선언한 인풋 모드(`diff` 또는 `변경된 파일`)에 맞춰 sub-agent에 **동시에 전달**
3. 같은 라인 범위에 여러 관점이 걸리면 중복 제거하고 perspective를 나란히 보존하며 **머지**
4. 심각도로 **정렬**해 단일 리포트 출력

## 왜 여러개의 가이드라인인가

각 가이드라인은 **서로 다른 섹터**에 집중합니다:

- _"이 코드 빠른가?"_ (waterfall, RSC 직렬화, 번들) — **Vercel React Best Practices**
- _"이 코드 클린 코드인가?"_ (가독성·예측성·응집·결합) — **Toss Frontend Fundamentals**
- _"버그가 있는가?"_ (stale closure, deps 누락, race condition, floating promise) — **정확성 룰**
- _"타입 시스템에 부합하는가?"_ (`any`, 무분별한 cast, `!` 단언, `@ts-ignore`) — **Google TypeScript Guide + Effective TypeScript**
- _"키보드/스크린 리더로 닿는가?"_ — **WCAG 2.2 + ARIA APG**
- _"사용자 데이터가 새는가?"_ — **OWASP + 프론트 Security**

관점들이 거의 겹치지 않아서, 하나만 돌리면 다른 관점이 잡을 이슈는 통째로 빠집니다. 시니어 리뷰어가 PR을 볼 때 머릿속에서 동시에 굴리는 여러 시각을 그대로 도구로 옮긴 셈입니다.

## 왜 sub-agent 병렬인가

여러 가이드라인을 한 모델에 한꺼번에 시키지 않고 **각각 독립된 sub-agent로 띄우는 데에는 3가지 구조적 이유**가 있습니다:

1. **추론 오염 방지:** 같은 컨텍스트에서 perf → a11y → security를 순차로 시키면, 앞 lens의 발견·표현·심각도 판단이 뒤 lens의 톤과 우선순위에 색을 입힙니다. sub-agent로 갈라놓으면 perf 리뷰어는 a11y가 뭘 잡았는지 _모르는 상태로_ 자기 일만 합니다.
2. **모드 콜랩스 회피:** "이 PR을 perf·품질·a11y·security 다 봐줘"라고 한 컨텍스트에 시키면 모델은 가장 시끄럽거나 친숙한 한 축으로 빨려 들어갑니다(예: 눈에 띄는 보안 이슈 하나가 보이면 톤 전체가 보안 쪽으로 기움). 컨텍스트를 물리적으로 분리해버리면 그 collapse가 구조적으로 일어날 수가 없습니다.
3. **컨텍스트 예산 + 병렬성:** 자식의 풀 리즈닝은 자식 컨텍스트에서 소진되고 부모에겐 구조화된 finding JSON만 돌아옵니다. 부모는 머지/정렬에만 집중할 여유가 생기고, 자식들이 wall-clock으로 동시에 돌아 lens가 늘어도 시간이 거의 안 늡니다.

비유하자면 한 사람에게 "이 PR을 모든 관점에서 다 봐줘" 시키는 게 아니라, **여러 전문 리뷰어를 격리된 방에 넣고 같은 diff만 손에 쥐여준 뒤 끝나면 모아서 충돌·중복을 정리하는 패널 리뷰** 방식입니다.

## 왜 비용이 N배가 아닌가

lens 수만큼 토큰을 다 쓰는 건 아닙니다 — lens마다 _판단의 단위_ 가 달라서 인풋도 다르게 주거든요. 라인·함수 단위 룰을 보는 5개 lens(bugs / a11y / security / perf / ts)는 **diff만** 받으면 충분하고, 응집·결합 같은 구조적 룰을 보는 `lens-code-quality` 하나만 **변경된 파일 전체**를 추가로 받습니다.

**5/6 lens가 diff만 보니 전체 토큰 사용량이 현저히 작아져서**, 실제 비용은 _"전체 코드베이스 × N배"가 아니라 "diff × N배 + α"_ 로 유지됩니다. 그 비용으로 사는 _여러 관점의 일관된 커버리지_ 는 — _프롬프트를 어떻게 짜든 단일 모델 한 번의 추론으로는 구조적으로 살 수 없다_ 는 게 이 프로젝트의 베팅입니다.

## lens 목록

| Lens                | 출처                                                                                                             | 묻는 질문                              | 인풋                 | 무엇을 잡나                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------- |
| `lens-react-perf`   | [Vercel React Best Practices](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices) | 빠른가?                                | diff                 | Waterfall, RSC 직렬화 부풀림, 번들 사이즈, 렌더링 안티패턴                                                     |
| `lens-bugs`         | React rules-of-hooks + ESLint/TS-ESLint + JS/TS/HTML/CSS 정확성 룰                                               | 버그가 있는가?                         | diff                 | Stale closure, deps 누락, hook 순서, race condition, floating promise, 빈 catch, == 강제변환, button type 누락 |
| `lens-ts`           | Google TypeScript Style Guide + Effective TypeScript                                                             | 타입 시스템과 함께 가는가, 우회하는가? | diff                 | `any`, 무분별한 cast, `!` 단언, `@ts-ignore`, 약한 타입, mutable export                                        |
| `lens-code-quality` | [Toss Frontend Fundamentals](https://github.com/toss/frontend-fundamentals)                                      | 변경하기 쉬운가?                       | **diff + 파일 전체** | 가독성 · 예측 가능성 · 응집도 · 결합도                                                                         |
| `lens-a11y`         | WCAG 2.2 + ARIA APG                                                                                              | 모두에게 닿는가?                       | diff                 | alt 누락, 이름 없는 아이콘 버튼, 키보드 네비 깨짐, ARIA 오용, focus indicator 제거                             |
| `lens-security`     | OWASP + 프론트엔드 특화                                                                                          | 데이터가 새지 않는가?                  | diff                 | XSS, 시크릿 노출, 안전하지 않은 저장, 위험한 JS API                                                            |

## 설치

```bash
# 전체 설치
npx skills add YOUR_USERNAME/fe-review-skills --all

# 필요한 것만 골라서
npx skills add YOUR_USERNAME/fe-review-skills \
  --skill diff-review \
  --skill lens-react-perf \
  --skill lens-a11y
```

> `YOUR_USERNAME`은 fork 또는 배포 후 본인 GitHub 계정으로 바꾸세요.

[Agent Skills 공개 표준](https://skills.sh)을 따르므로 호환되는 모든 에이전트(Claude Code, Cursor, Cline, opencode 등)에서 동작합니다.

## 사용법

설치 후, 그냥 요청하세요:

```
staged 변경사항 리뷰해줘
```

옵션 포함:

```
lang=ko severity_min=high lenses=perf,a11y 로 diff 리뷰해줘
```

### 옵션

| 옵션           | 기본값   | 값                                                                 |
| -------------- | -------- | ------------------------------------------------------------------ |
| `scope`        | `staged` | `staged`, `unstaged`, `branch:<name>`, `range:<a>..<b>`            |
| `lang`         | `en`     | `en`, `ko`                                                         |
| `lenses`       | 전체 6개 | `perf`, `bugs`, `ts`, `quality`, `a11y`, `security` 중 콤마 리스트 |
| `severity_min` | `high`   | `critical`, `high`, `medium`, `low`                                |

### 단일 lens 실행

각 lens는 단독 호출 가능한 스킬이라 한 가지 관점만 돌릴 수도 있습니다:

```
unstaged 변경사항에 lens-a11y만 돌려줘
```

## 아키텍처

```
                ┌──────────────────────────┐
                │ Git diff                 │
                │ (+ changed files when    │
                │  a structural lens runs) │
                └────────────┬─────────────┘
                             │
       ┌────────┬────────┬───┴────┬────────┬─────────┐
       ▼        ▼        ▼        ▼        ▼         ▼
   ┌──────┐┌──────┐┌──────┐┌──────┐┌─────────┐┌──────────┐
   │ perf ││ bugs ││  ts  ││ a11y ││ quality ││ security │   ← 병렬 sub-agent
   └──┬───┘└──┬───┘└──┬───┘└──┬───┘└────┬────┘└────┬─────┘
      └───────┴───────┴───┬───┴─────────┴──────────┘
                          ▼
                ┌─────────────────────┐
                │  Dedupe + merge     │  ← key: file:line + severity max
                │  (같은 라인,         │
                │   여러 관점)         │
                └──────────┬──────────┘
                           ▼
                ┌─────────────────────┐
                │ Prioritized report  │
                │ Critical → Low      │
                └─────────────────────┘
```

오케스트레이터(`diff-review`)는 Task 툴로 6개 sub-agent를 띄워 fan-out하고, 머지/정렬은 자기 컨텍스트에서만 합니다. 왜 이렇게 분리했는지의 근거는 위 [왜 sub-agent 병렬인가](#왜-sub-agent-병렬인가) 섹션 참조.

## Findings 머지 방식

각 lens는 JSON finding 배열을 반환합니다:

```json
{
  "file": "src/components/Header.tsx",
  "line_start": 23,
  "line_end": 41,
  "severity": "high",
  "category": "server-fetch-in-effect",
  "title": "useEffect for data fetching",
  "rationale": "초기 데이터를 클라이언트에서 fetch해 waterfall과 번들 비용 발생.",
  "suggestion": "Server Component로 이동 후 props로 전달"
}
```

머지는 `file` + 라인 범위 겹침으로 그룹화합니다. 같은 코드에 여러 lens가 동시에 fire하면, 머지된 이슈가 모든 관점을 보존합니다 — 예를 들어 `useEffect`로 데이터 fetch하는 패턴은 `lens-react-perf`(waterfall), `lens-code-quality`(숨은 side effect), `lens-bugs`(unmount 후 setState race) 세 군데에서 한꺼번에 잡힐 수 있습니다. 리뷰어는 세 개의 중복 알림이 아니라 세 관점을 가진 하나의 이슈를 봅니다.

최종 severity는 perspective들의 최댓값. 정렬은 severity 내림차순 → file path → line number.

## 기여하기

PR 환영합니다. 새 lens 추가 시:

1. `skills/lens-<name>/SKILL.md`를 YAML frontmatter(`name`, `input-mode`, `description`, `user-invocable: true`)와 함께 생성. `input-mode`는 `diff`(라인/함수 단위 룰) 또는 `changed-files`(구조적 룰)
2. 패턴마다 하나의 rule id로 카탈로그 작성
3. JSON 출력 스키마를 따르기 (기존 lens 참고)
4. `package.json`의 `skills`와 오케스트레이터 lens 목록에 등록

룰 추가 기준: "런타임 데이터 없이 lens의 input-mode로 신뢰성 있게 탐지 가능한가?" + "시니어 프론트엔드 리뷰어가 PR에서 지적할 만한가?" 둘 다 yes면 추가.

## 영감

본 프로젝트는 토스가 사내에서 쓰는 Compounding Engineering 패턴(여러 LLM이 병렬로 PR을 본다)에서 영감을 받았습니다.

## 라이선스

MIT — [LICENSE](./LICENSE) 참조.
