# 독립 관점 리뷰 vs 단일 리뷰

[한국어](./comparison.md) · [English](./comparison.en.md)

> `fe-review-agents`의 핵심 가치를 직접 비교 스냅샷으로 보여줍니다. **Opus 4.7**(상위 모델)과 **Sonnet 4.6**(중간 모델) 양쪽으로 동일 샘플 코드에 단일 리뷰 vs 독립 관점 리뷰 두 방식을 돌려, 모델 강도에 따라 격차가 어떻게 변하는지 봅니다.

- **시점**: 2026-05-08
- **대상 코드**: [comparison/sample.tsx](./comparison/sample.tsx) — perf/quality/bugs/ts/a11y/security 6축 이슈가 자연스럽게 분산된 합성 React 컴포넌트(약 100라인)
- **A. 단일 리뷰 프롬프트**: "다음 React 컴포넌트를 코드 리뷰해주세요. 발견한 이슈들을 모두 알려주세요." ([baseline.md](./comparison/baseline.md))
- **B. 독립 관점 리뷰**: `/fe-review-agents:file-review docs/comparison/sample.tsx`

---

## 핵심 메시지

> **모델이 강할수록 단일 리뷰도 충분히 강합니다.** Opus 4.7 같은 최상위 모델 기준으로는 단일 리뷰가 검출율 75%까지 도달해서 독립 관점 리뷰와의 검출율 격차가 작습니다. 하지만 Sonnet 4.6 같은 중간 모델로 내려오면 단일 리뷰 검출율이 ~50%까지 떨어지고, 독립 관점 리뷰는 모델이 바뀌어도 ~100% 커버리지를 유지합니다.

`fe-review-agents`의 진짜 가치는 "한 번에 더 잡는다"보다 다음 셋입니다:

- **모델 내성** — 약한 모델일수록 격리 호출의 효과가 커짐
- **일관된 출력 형식** — 모든 이슈에 안정 룰 ID + 심각도 + 정확한 라인 번호 → grep / 대시보드 / PR 비교 가능
- **누락 축 보장** — perf 리뷰어는 보안/a11y에 주의를 뺏기지 않음

---

## 한눈에 — 모델 × 방식 검출율

| 모델              | 방식           | 발견 이슈 | 독립 관점 리뷰 기준 검출율 | 룰 ID 태그 | 이슈별 심각도               |
| ----------------- | -------------- | --------- | -------------------------- | ---------- | --------------------------- |
| **🟢 Opus 4.7**   | 단일 리뷰      | ~22       | **~73%** (8개 누락/모호)   | ❌         | ❌                          |
| **🟢 Opus 4.7**   | 독립 관점 리뷰 | **30**    | **100%** (기준선)          | ✅         | ✅ (4🔴 / 18🟠 / 7🟡 / 1🟢) |
| **🟡 Sonnet 4.6** | 단일 리뷰      | ~14       | **~50%** (14+ 누락)        | ❌         | ❌                          |
| **🟡 Sonnet 4.6** | 독립 관점 리뷰 | **28**    | **~93%**                   | ✅         | ✅ (4🔴 / 17🟠 / 6🟡 / 1🟢) |

→ **모델 강도가 내려갈수록 단일 리뷰 검출율은 급격히 떨어지고**(73% → 50%), 독립 관점 리뷰는 모델 변경에 덜 흔들립니다(100% → 93%). 격차는 **8개 → 14+개**로 거의 두 배.

→ 독립 관점 리뷰가 잡은 이슈 수 자체도 약간 다릅니다(30 vs 28) — 룰 해석에서 리뷰어마다 일부 차이는 있지만 **체계적 누락은 없습니다**.

---

## Opus 4.7 비교 (강한 모델)

<table>
<thead>
<tr>
<th width="50%">🟦 A. 단일 리뷰 — Opus 4.7</th>
<th width="50%">🟩 B. 독립 관점 리뷰 — Opus 4.7</th>
</tr>
</thead>
<tbody>
<tr>
<td valign="top">

코드 리뷰드립니다. 발견한 이슈를 우선순위별로 정리하면:

##### 🔴 즉시 수정 필요 (Critical)

- **XSS via `dangerouslySetInnerHTML`** — `c.body` 그대로 주입. 텍스트 렌더 또는 DOMPurify sanitize.
- **URL token → localStorage** — referrer/로그/히스토리 누출 + XSS 시 탈취 + `!` non-null assertion 위험.
- **state 직접 mutation** — `target.likes += 1; setComments(comments)`. 같은 참조 → 리렌더 안 됨. immutable 갱신.

##### 🟠 중요

- **`useEffect` deps 누락** — `userId`/`lang` 사용하지만 deps `[]`.
- **race condition / cleanup 부재** — unmount 후 setState. `AbortController` 필요.
- **fetch 에러 핸들링 전무** — `try/catch`/`res.ok` 없음. `handlePost`도 `await` 없음.
- **`comments.length`로 0 렌더 버그** — `> 0 &&` 사용.
- **`key={index}`** — `c.id`로 교체.
- **`<div onClick>` 좋아요** — `<button>` + `aria-label`로.
- **img alt 누락 + SendIcon button name 없음**.
- **`<select>` label 없음**.
- **textarea label + form 시맨틱**.

##### 🟡 개선

- **`any` 타입 다수** — `User` 타입 정의, `analytics`는 `declare global`로.
- **`JSON.parse(await res.text())`** — `commentsRes.json()`으로 충분.
- **`formatDate` 사이드 이펙트** — 순수 함수가 렌더마다 localStorage 쓰기.
- **인라인 함수 자식 리렌더** — `useCallback` 검토 (현재는 premature).
- **`lang` 상태 dead** — 적용 안 됨.
- **`theme` 적용 방식**.

</td>
<td valign="top">

#### 🔍 코드 리뷰 결과: docs/comparison/sample.tsx

**총 이슈**: 30개 · 🔴 4 | 🟠 18 | 🟡 7 | 🟢 1

##### 🔴 CRITICAL

- **[security/dangerously-set-inner-html]** Line 87: `c.body`(네트워크 댓글 본문)를 `dangerouslySetInnerHTML`에 직접 주입 — DOMPurify로 sanitize하거나 텍스트로 렌더.
- **[a11y/img-alt-missing]** Line 69: `<img src={user?.avatarUrl} />`에 `alt` 없음 — `alt={`${user?.name} avatar`}` 추가 또는 장식이면 `alt=""`.
- **[a11y/input-label-missing]** Line 74: `<select>`에 라벨 없음 — `aria-label="Language"` 추가.
- **[a11y/input-label-missing]** Line 95: `<textarea>`에 라벨 없음 — `aria-label="Comment"` 추가.
- **[a11y/icon-button-name]** Line 96: `<SendIcon />`만 자식인 `<button>`에 접근 가능 이름 없음 — `aria-label="Send comment"` 추가.

##### 🟠 HIGH

- **[predictability/hidden-side-effect]** Line 11: `formatDate`가 이름과 무관하게 localStorage 부수효과 — 포맷만 수행하고 저장은 별도 함수로.
- **[readability/context-overload]** Line 25: 한 컴포넌트가 user/comments/draft/theme/lang/auth/analytics 6+ 관심사 — 도메인별 훅으로 분리.
- **[predictability/signature-misleading]** Line 26: `user` state가 `any`로 선언, 런타임 형태가 안 드러남 — `User | null`로 명시.
- **[perf/server-fetch-in-effect]** Line 32: `useEffect`로 초기 데이터 fetch — Server Component에서 props 전달 또는 SWR/React Query로.
- **[perf/async-parallel]** Line 34: 독립 fetch 순차 await — `Promise.all([fetch(user), fetch(comments)])`로 병렬화.
- **[bugs/race-condition-fetch]** Line 34: `userId` 기반 순차 fetch에 abort 로직 없음 — AbortController로 이전 요청 취소.
- **[predictability/hidden-side-effect]** Line 33: `load` 내부에 인증 토큰 저장 + analytics 트래킹 — 이름이 드러나는 별도 함수로.
- **[ts/cast-instead-of-guard]** Line 35: `(await userRes.json()) as any` — 런타임 검증 없이 단정, zod/타입 가드 도입.
- **[ts/cast-instead-of-guard]** Line 37: `JSON.parse(...) as Comment[]` — 보장 없이 단정, 런타임 파싱/검증 추가.
- **[bugs/setstate-after-unmount]** Line 39: `await fetch` 후 `setUser`/`setComments`에 cancel 없음 — AbortController로 정리.
- **[security/token-in-url]** Line 42: URL 쿼리스트링에서 `token` 추출 — referrer/로그/히스토리 누출, HttpOnly 쿠키 또는 Authorization 헤더로.
- **[ts/non-null-assertion]** Line 42: `URLSearchParams.get('token')!` — null 가능을 단정, `if (!token) return;` 가드로.
- **[security/token-in-localstorage]** Line 43: `authToken`을 `localStorage`에 저장 — XSS 탈취 위험, HttpOnly 쿠키로.
- **[bugs/effect-missing-dep]** Line 48: `useEffect`가 `userId`/`lang` 참조하지만 deps `[]` — `[userId, lang]` 추가.
- **[bugs/state-mutation]** Line 53: `target.likes += 1; setComments(comments)` 직접 mutation 후 동일 ref — 새 배열로 immutable 업데이트.
- **[bugs/floating-promise]** Line 59: `fetch('/api/comments', ...)`를 await/then/catch 없이 호출 — `await` 또는 `.catch` 처리.
- **[bugs/button-missing-type]** Line 71: `<button>`에 `type` 없음 — `type="button"` 추가 (form default `submit` 방지).
- **[a11y/click-without-key-handler]** Line 88: `<div onClick>`에 키보드 핸들러 없음 — `<button type="button">`으로.
- **[a11y/semantic-button]** Line 88: `<div onClick={...}>`을 버튼으로 — `<button type="button">` 사용.
- **[bugs/button-missing-type]** Line 96: `<button>`에 `type` 없음 — `type="button"` 추가.

##### 🟡 MED

- **[perf/client-localstorage-unbounded]** Line 13: `formatDate` 호출(=렌더)마다 `localStorage.setItem` — 렌더 경로에서 제거.
- **[ts/explicit-any]** Line 26: `useState<any>(null)` — `useState<User | null>(null)`.
- **[ts/any-in-generic]** Line 26: `useState<any>` 제네릭에 any — 도메인 타입으로.
- **[ts/explicit-any]** Line 35: `as any` 캐스트 — 검증된 타입으로 좁히기.
- **[bugs/json-parse-no-try]** Line 37: `JSON.parse`를 try/catch 없이 — `commentsRes.json()` 또는 try/catch.
- **[bugs/non-null-assert-on-external]** Line 42: 외부 입력에 non-null assertion — null 체크로 가드.
- **[ts/explicit-any]** Line 45: `(window as any).analytics` — `Window` 인터페이스 확장.
- **[perf/rendering-key-index]** Line 84: `key={i}` 인덱스 사용 — `key={c.id}`.
- **[bugs/jsx-truthy-zero]** Line 80: `{comments.length && ...}`로 0 렌더 — `{comments.length > 0 && ...}`.

##### 🟢 LOW

- **[ts/missing-return-type-on-export]** Line 25: exported 함수에 명시적 반환 타입 없음 — `: JSX.Element` 추가.

</td>
</tr>
</tbody>
</table>

### Opus 단일 리뷰가 놓치거나 모호하게 처리한 이슈

| 룰 ID                                   | 심각도 | 단일 리뷰                                      |
| --------------------------------------- | ------ | ---------------------------------------------- |
| `[perf/async-parallel]`                 | 🟠     | ❌ 누락 (HIGH 성능 — 매 페이지 RTT 두 배)      |
| `[perf/server-fetch-in-effect]`         | 🟠     | △ deps 이슈로만 언급 (Server Component 이관 X) |
| `[bugs/button-missing-type]` ×2         | 🟠     | ❌ 둘 다 누락 (form 안 default `submit` 위험)  |
| `[ts/cast-instead-of-guard]` ×2         | 🟠     | △ "any 일반론"만, 런타임 검증 강조 X           |
| `[predictability/signature-misleading]` | 🟠     | △ "any everywhere"로 통합                      |
| `[ts/missing-return-type-on-export]`    | 🟢     | ❌ 누락                                        |

→ Opus 기준 누락은 **4건 명확 + 4건 모호**. 임팩트 있는 건 `perf/async-parallel`과 `button-missing-type` ×2.

---

## Sonnet 4.6 비교 (중간 모델)

<table>
<thead>
<tr>
<th width="50%">🟦 A. 단일 리뷰 — Sonnet 4.6</th>
<th width="50%">🟩 B. 독립 관점 리뷰 — Sonnet 4.6</th>
</tr>
</thead>
<tbody>
<tr>
<td valign="top">

코드 잘 읽었습니다. 하나씩 짚어볼게요.

##### 🔴 즉시 수정 (Critical)

- **XSS via `dangerouslySetInnerHTML`** — 외부 API 데이터 직접 렌더. DOMPurify sanitize 또는 텍스트로.
- **URL token → localStorage** — 히스토리/서버 로그/Referer 노출 + XSS 시 탈취 + `!` 위험.
- **`handleLike` state mutation** — 동일 ref로 리렌더 안 됨. immutable 갱신.

##### 🟠 중요 (Bugs)

- **`useEffect` deps 누락** — `userId`/`lang` 미포함.
- **`handlePost` 결과 무시** — `await` 없음, 에러 처리 없음, 새 댓글 추가 로직 없음.
- **`comments.length`로 0 렌더** — `> 0 &&` 사용.

##### 🟠 타입

- **`useState<any>` 두 군데** — `User` 타입 정의 권장.
- **`commentsRes.text()` + `JSON.parse`** — `.json()`으로 통일.

##### 🟠 접근성

- **`<img>` alt 없음** — `alt={user?.name…}` 또는 `alt=""`.
- **좋아요 `<div onClick>`** — `<button>` + `aria-label`.
- **전송 `<button>`에 SVG만** — `aria-label` 추가.

##### 🟡 개선

- **`formatDate` 사이드 이펙트** — 순수 함수가 localStorage 쓰기.
- **`<li key={i}>`** — `c.id` 사용.

가장 시급한 건 XSS, 토큰 노출 방식, `handleLike` 버그 — 이 셋입니다.

</td>
<td valign="top">

#### 🔍 코드 리뷰 결과: docs/comparison/sample.tsx

**총 이슈**: 28개 · 🔴 4 | 🟠 17 | 🟡 6 | 🟢 1

##### 🔴 CRITICAL

- **[security/dangerously-set-inner-html]** Line 87: `c.body`(서버/네트워크 본문)를 `dangerouslySetInnerHTML`에 직접 삽입 — DOMPurify로 sanitize 필수.
- **[a11y/img-alt-missing]** Line 69: `<img src={user?.avatarUrl} />`에 `alt` 없음 — `alt={`${user.name}의 아바타`}` 등 의미 있는 대체 텍스트.
- **[a11y/input-label-missing]** Line 95: `<textarea>`에 라벨 없음 — `aria-label="댓글 작성"` 또는 `<label htmlFor>` 추가.
- **[a11y/icon-button-name]** Line 96: `<SendIcon>`만 자식인 `<button>`에 접근 가능 이름 없음 — `aria-label="댓글 게시"` 추가.

##### 🟠 HIGH

- **[bugs/effect-missing-dep]** Line 48: `useEffect`가 `userId`/`lang` 참조하지만 deps `[]` — `[userId, lang]` 추가.
- **[bugs/effect-stale-closure]** Line 45: `[]` deps 내 `load()` 클로저가 `lang`을 초기값으로 영원히 캡처 — deps에 `lang` 추가 또는 `useRef`.
- **[bugs/setstate-after-unmount]** Line 39: `await` 후 `setUser`/`setComments`에 cancel 없음 — AbortController로 cleanup.
- **[bugs/floating-promise]** Line 47: `load()` Promise를 await/.catch 없이 fire-and-forget — `.catch(console.error)` 또는 try/catch.
- **[bugs/floating-promise]** Line 59: `fetch('/api/comments', ...)`를 await/then/catch 없이 호출 — `await` 또는 `.catch`.
- **[bugs/state-mutation]** Line 53: `target.likes += 1; setComments(comments)` 직접 mutation 후 동일 ref — 불변 업데이트로.
- **[bugs/button-missing-type]** Line 96: `<button>`에 `type` 없음 — `type="button"` 명시 (form default `submit` 방지).
- **[ts/any-in-generic]** Line 26: `useState<any>(null)` — `User` 인터페이스 정의 후 `useState<User | null>(null)`로 좁힘.
- **[ts/cast-instead-of-guard]** Line 35: `(await userRes.json()) as any` — 런타임 보장 없는 단정, zod 등으로 검증.
- **[ts/cast-instead-of-guard]** Line 37: `JSON.parse(...) as Comment[]` — 런타임 구조 검증 없음, zod로 narrowing.
- **[ts/non-null-assertion]** Line 42: `URLSearchParams.get('token')!` — `get()`은 `null` 반환 가능, null 체크로 가드.
- **[security/token-in-url]** Line 42: URL 쿼리 파라미터 `?token=`에서 세션 토큰 추출 — referrer/로그/히스토리 노출, Authorization 헤더 또는 httpOnly 쿠키로.
- **[security/token-in-localstorage]** Line 43: `localStorage.setItem('authToken', ...)` — XSS 시 토큰 탈취, httpOnly 쿠키로.
- **[predictability/hidden-side-effect]** Line 13: `formatDate`가 `localStorage.setItem` 부수효과 — 함수명 변경 또는 호출부로 이동.
- **[readability/context-overload]** Line 25: `CommentSection`이 user/댓글/인증/테마/언어 5+ 무관 관심사 처리 — 별도 훅 또는 컨텍스트로 분리.
- **[predictability/hidden-side-effect]** Line 42: `useEffect` 내부에서 URL 파싱 후 `localStorage`에 `authToken` 저장 — 명시적 함수/훅으로 분리.
- **[perf/async-parallel]** Line 34: 독립 fetch 두 건 순차 await — `Promise.all([...])`로 병렬화.
- **[perf/server-fetch-in-effect]** Line 32: 초기 데이터를 `useEffect`에서 fetch — Server Component 또는 데이터 라이브러리로.
- **[a11y/click-without-key-handler]** Line 88: `<div onClick>`에 `onKeyDown` 없음 — `<button type="button">`으로 교체.
- **[a11y/semantic-button]** Line 88: `<div onClick>`을 버튼으로 — `<button type="button">` 사용.
- **[a11y/form-error-not-associated]** Line 95: `<textarea>` 유효성 에러 연결할 `aria-describedby` 없음 — 에러 요소에 id + aria-describedby.

##### 🟡 MED

- **[bugs/json-parse-no-try]** Line 37: `JSON.parse`를 try/catch 없이 — try/catch로 감싸기.
- **[bugs/non-null-assert-on-external]** Line 42: `URLSearchParams.get('token')!` — null 가드 추가.
- **[bugs/jsx-truthy-zero]** Line 80: `{comments.length && ...}`로 0 렌더 — `{comments.length > 0 && ...}`.
- **[ts/any-in-generic]** Line 45: `window as any` — `Window` 인터페이스 확장으로 대체.
- **[perf/client-localstorage-unbounded]** Line 13: 렌더마다 `localStorage.setItem` — 렌더 밖으로 이동.
- **[perf/rendering-key-index]** Line 84: `key={i}` — `c.id` 사용.

##### 🟢 LOW

- **[ts/missing-return-type-on-export]** Line 25: exported `CommentSection`에 명시적 반환 타입 없음 — `: JSX.Element` 추가.

</td>
</tr>
</tbody>
</table>

### Sonnet 단일 리뷰가 놓친 이슈 (~14건)

Opus 단일 리뷰가 놓친 것 + 추가로:

- **[perf/server-fetch-in-effect]** 🟠 ❌
- **[perf/async-parallel]** 🟠 ❌
- **[perf/client-localstorage-unbounded]** 🟡 ❌ (formatDate는 quality 관점만 언급)
- **[bugs/setstate-after-unmount]** 🟠 ❌
- **[bugs/effect-stale-closure]** 🟠 ❌
- **[bugs/floating-promise]** Line 47 (load) 🟠 ❌ (handlePost만 catch)
- **[bugs/button-missing-type]** 🟠 ❌
- **[ts/cast-instead-of-guard]** ×2 🟠 ❌
- **[ts/missing-return-type-on-export]** 🟢 ❌
- **[a11y/click-without-key-handler]** 🟠 ❌ (semantic-button만 catch)
- **[a11y/input-label-missing]** Line 95 (textarea) 🔴 ❌
- **[a11y/input-label-missing]** Line 74 (select) 🔴 ❌ (Sonnet KO 6-rev도 select는 누락)
- **[a11y/form-error-not-associated]** 🟠 ❌
- **[readability/context-overload]** 🟠 ❌
- **[predictability/hidden-side-effect]** Line 42 (load 함수 auth 사이드 이펙트) 🟠 ❌
- **[predictability/signature-misleading]** 🟠 ❌

→ Sonnet 기준 단일 리뷰 격차는 **14+건**. CRITICAL 1건(textarea label)도 포함. perf 축은 거의 전부 누락.

---

## 진짜 가치 — 단순 검출율 외

### 1. 모델 내성

단일 리뷰 검출율은 모델 강도에 강하게 의존합니다:

- Opus 4.7 단일 리뷰: ~75%
- Sonnet 4.6 단일 리뷰: ~50%
- (예측) Haiku 4.5 / 4o-mini / 로컬 7B 모델: 더 낮음

독립 관점 리뷰는 같은 샘플 코드에서 모델 무관하게 ~93-100% 유지. 각 서브에이전트의 컨텍스트가 좁고 카탈로그가 명시적이라, 모델이 약해도 자기 룰 체크리스트는 빼먹지 않습니다.

### 2. 일관된 출력 형식

모든 이슈가 `[axis/rule-id]` (예: `[security/token-in-localstorage]`) + 이슈별 `🔴/🟠/🟡/🟢` + 정확한 라인 번호로 태깅됩니다. 결과:

- **`grep`** — `grep "perf/async-parallel" reports/*.md`로 시간에 걸친 등장 빈도 추적
- **대시보드 / 메트릭** — 팀별 / repo별 룰 위반 트렌드 차트화
- **PR 비교** — 다른 PR이나 다른 시점 결과와 1:1 비교 가능
- **자동화 훅** — CRITICAL 1개 이상 시 PR 차단 같은 룰

단일 리뷰 출력은 자유 산문이라 위 어느 것도 안 됩니다.

### 3. 누락 축 보장

각 리뷰어는 자기 카탈로그만 본다는 보장이 있습니다. perf 리뷰어가 "이 PR은 보안이 너무 심각해서 perf는 다음에…"라며 주의를 옮기는 일이 구조적으로 불가능합니다. 단일 리뷰는 가장 두드러진 축으로 주의가 쏠리는 mode collapse가 발생합니다 — Opus 단일 리뷰가 `perf/async-parallel`을 놓친 게 정확히 그 패턴입니다.

---

## 비용 vs 가치

독립 관점 리뷰는 토큰을 약 **6-7배** 씁니다. 100라인 샘플 코드에서는 수십 원 단위 차이지만, 큰 PR에선 비례해 커집니다.

결정 기준:

- **강한 모델 + 단발성 리뷰** → 단일 리뷰로 충분 (Opus 단일 리뷰 검출율 ~75%로 실용적)
- **약한 모델 환경** (Haiku / 오픈소스 LLM / 비용 민감) → 독립 관점 리뷰가 격차를 메움
- **시간에 걸친 PR 추적 / 메트릭 / 자동화** → 독립 관점 리뷰 출력 형식이 필수
- **규제·감사 환경** ("감사관에게 a11y 누락 0개 보증 받아야 함") → 독립 관점 리뷰의 누락 축 보장이 필수

> **재현하기**: `/fe-review-agents:file-review docs/comparison/sample.tsx` + 일반 LLM에 [comparison/baseline.md](./comparison/baseline.md)의 프롬프트로. 본 문서는 2026-05-08, Opus 4.7 + Sonnet 4.6 한 시점 스냅샷입니다. LLM 출력은 비결정적이라 검출율은 매 실행마다 ±2-3개 흔들립니다.
