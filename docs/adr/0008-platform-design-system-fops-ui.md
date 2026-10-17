---
status: accepted
---

# EV 화면은 Studio를 포함해 analytics-platform과 같은 디자인 시스템(FeedbackOps `@fops/ui`)을 쓴다

결정자: 사용자 — "독립 실행이어도 디자인 시스템은 맞춘다"(2026-10-17, #73). 가져오는 방식과 패키지별 범위는 에이전트 추천이다.

EV의 모든 화면은 독립 Studio에서 돌 때도 analytics-platform(AP)과 같은 디자인 시스템으로 그린다. 그 원본은 AP가 아니라 FeedbackOps `@fops/ui`다. AP도 이 패키지를 서브모듈 패키지로 직접 참조하고 복사하지 않는다(AP ADR-0010). 셸 구조는 AP ADR-0011을 따른다. EV도 같은 방식으로 FeedbackOps 저장소(`hjung3113/FeedbackOps`, public)를 git 서브모듈로 두고 `@fops/ui`를 pnpm 워크스페이스 패키지로 참조한다. `@ap/*` 의존은 생기지 않으므로 독립 실행과 ADR-0001의 `@ap/*` 경계는 그대로다.

플랫폼 편입이 1차 목표이고, Studio는 같은 패키지를 조립하는 두 번째 호스트다(EV#70, AP ADR-0039). 두 호스트에서 화면이 다른 시스템처럼 보이면 편입 때 화면을 다시 그려야 한다. 2026-10-17 기준 Studio는 브라우저 기본 버튼·표·글자 그대로였다. 이전 규칙("플랫폼 토큰은 `platform-adapter`만 주입")이 Studio의 모양을 플랫폼과 무관하게 남겨 두었고, UX 리뷰도 그 규칙에 따라 Studio 안의 흐름·문구·접근성만 보았다.

## 패키지별 범위

- **`core`·`renderer`**: 디자인 시스템을 모른다. SVG는 계속 `--eqv-*` 변수와 fallback만 읽는다. `@fops/*`를 import하지 않는다(ESLint 경계 규칙으로 강제, 구현 슬라이스 a).
- **`replay`·`editor`**: DOM 컨트롤(버튼, 탭, select, checkbox, 표, 배지)은 `@fops/ui` 프리미티브로 그린다. `@fops/ui`는 peer dependency다(`workspace:*`, 패키지가 `private` `0.0.0`이다). 호스트가 한 벌을 준다. AP 안에서는 AP 워크스페이스의 같은 패키지다. 자체 스타일 방식은 아래 개정(2026-10-18)이 정한다: 슬라이스 d까지는 패키지 CSS(FeedbackOps 변수 `rgb(var(--…))`와 `--eqv-*`), 이후에는 `@fops/ui` 테마의 Tailwind 유틸리티다. Gantt·Top View 같은 SVG 그림은 계속 `--eqv-*`를 쓴다.
- **`ui`(`@eqv/ui`)**: `@fops/ui`에 없는 패턴(밀집 표, 증거 배지, 범례 등)의 EV 컴포넌트. 개정(2026-10-18)을 본다.
- **Studio**: `@fops/ui` `theme.css` 머리 주석의 소비자 순서를 그대로 따른다. 이 순서는 FeedbackOps ADR-0058의 불변 조건이다. 순서가 바뀌면 base 토큰이 theme 층에 진다.
  ```css
  @import "tailwindcss";
  @import "@fops/ui/styles/tokens.css" layer(base);
  @import "@fops/ui/styles/semantic.css" layer(base);
  @import "@fops/ui/styles/theme.css";
  @import "@fops/ui/styles/compat.css";
  @source "<external/feedbackops/packages/ui/src까지의 상대 경로>";
  @source "<apps/studio/src>";
  ```
  `--eqv-*` 값은 `@fops/ui`가 **정의하는** 변수에서만 정한다. FeedbackOps 토큰은 RGB 채널 목록이므로 `rgb(var(--surface-canvas))`처럼 감싼다. 감싸지 않고 채널 목록(`37 119 204`)을 그대로 넣으면, 값이 정의돼 있지만 색이 아니어서 SVG fallback이 적용되지 않는다(`assets/primitives/README.md`).
  셸은 AP ADR-0011 구조다. 치수의 원본은 `@fops/ui` 레이아웃 토큰이다: 레일 `--rail-width` 52px, 사이드바 `--sidebar-width`/`--sidebar-width-collapsed` 240/56px, 상단 바 없음, 페이지 머리 `--toolbar-height` 50px. 표 행 최소 32px는 `@fops/ui` 토큰이 아니라 AP `DESIGN.md` `table-density`와 AP `06_platform_ui_contract.md` §15가 정한다. `@fops/ui`의 `--row-height-*`(44/60/96px)는 쓰지 않는다. AP의 셸 컴포넌트(`@ap/shell`)는 import할 수 없으므로, 같은 구조를 `@fops/ui` 위에서 Studio 안에 짓는다.
- **플랫폼 확장 토큰**: 차트·카테고리 색, `surface-sunken`, `accent-*-soft`는 AP가 소유한다(AP `packages/ui/src/styles/tokens.css`). EV는 그 파일을 복사하지 않는다. EV가 필요한 값은 `--eqv-*` 변수로 두고 AP 값을 fallback으로 적는다(`assets/primitives/README.md` 표). Studio는 이 행들을 `var(--…)`로 가리키지 않고 fallback hex를 그대로 쓴다. `--chart-*-stroke`, `--icon-*-soft`, `--surface-sunken`, `--accent-*-soft`, `--cat-amber-stroke`, `--border-control` 같은 이름은 `@fops/ui`에 없다. 플랫폼 안에서는 `platform-adapter`가 실제 값을 주입한다.

## 서브모듈

- 경로는 `external/feedbackops`다. 워크스페이스에는 `external/feedbackops/packages/ui`와 그 의존인 `external/feedbackops/packages/shared`만 넣는다.
- 핀은 커밋이다. 갱신은 별도 PR로 한다. AP처럼 FeedbackOps `develop`을 따라간다. CI 체크아웃은 `submodules: true`다. public 저장소라 토큰이 필요 없다.

## Considered Options

- **(A) 지금 규칙 유지 — 플랫폼 모양은 `platform-adapter`에서만**: 가장 싸다. 대신 Studio가 다른 시스템처럼 보이고, 편입 때 `replay`·`editor` 컨트롤을 다시 그려야 한다. 사용자가 기각했다(2026-10-17).
- **(B) FeedbackOps 토큰 CSS를 EV에 복사**: 서브모듈 없이 가장 빨리 맞춘다. 대신 복사본이 시간이 지나며 갈라진다. AP ADR-0010이 같은 이유로 기각한 방식이다. 프리미티브(Radix 기반 컴포넌트)까지 복사하면 두 벌을 유지해야 한다.
- **(C) AP `@ap/ui`·`@ap/shell`을 import**: AP 화면과 가장 가깝다. 대신 `platform-adapter` 밖에 `@ap/*` 의존이 생겨 ADR-0001과 독립 실행이 깨진다.
- **(D, 채택) FeedbackOps 서브모듈로 `@fops/ui` 직접 참조**: AP와 원본이 같아 모양이 일치한다. `@ap/*` 의존이 없다. 대신 설치가 무거워진다. `@fops/ui`가 Radix, tiptap 같은 의존을 함께 가져온다.

## Consequences

- 이 ADR과 같은 PR에서 고치는 문서는 다음과 같다. 구현은 #73 슬라이스 a–d가 한다.
  - `README.md` 규칙 5
  - `docs/DESIGN-v0.4.md` 통합 형태·Style tokens
  - `assets/primitives/README.md` Theme tokens
  - `AGENTS.md` UI 게이트
  - `.claude/conductor/PROFILE.md` UX lens
- ADR-0001의 결과 문장 "renderer는 `DESIGN.md`/`@ap/ui` 토큰을 직접 참조하지 않는다"는 그대로 유효하다. "플랫폼 토큰은 adapter가 주입"은 플랫폼 호스트에 대한 문장으로 남는다. Studio 기본값은 이 ADR이 정한다.
- 화면 변경의 UX 리뷰는 같은 종류의 AP 화면과 나란히 비교한다. 기본 컨트롤이나 스타일 없는 컨트롤은 그 자체로 지적 대상이다.
- 열린 점(슬라이스 a에서 확인)이 셋 있다.
  - `@fops/ui`는 TS 소스(`main: ./src/index.ts`)를 낸다. EV의 `tsc` 빌드·타입 검사가 그 소스를 EV 설정으로 읽을 때 통과하는지 확인한다. `replay`·`editor`의 `tsconfig.build.json`은 `rootDir: "src"`에 `declaration: true`라서, `src/`가 그 파일을 import하면 TS6059가 날 수 있다. 의존 `.ts`를 내보내지 않는 빌드 설정은 슬라이스 c에서 정한다.
  - vitest(jsdom)가 `@fops/ui` 컴포넌트를 그대로 렌더하는지 확인한다.
  - 설치 크기를 기록한다.
- AP#396(공통 SDK)이 셸을 패키지로 내면, Studio 셸을 그쪽으로 옮길지 다시 정한다.

## 개정 (2026-10-18)

#73 슬라이스 a가 열린 점을 확인했고, 소유자 규칙(2026-10-18: `@fops/ui`에 없는 UI 패턴은 EV 컴포넌트나 레이아웃을 먼저 만들고 화면이 그것을 쓴다)이 생겼다. 이에 따라 위 "패키지별 범위"의 일부를 바꾼다.

1. **DOM UI 패키지(`@eqv/ui`, `@eqv/replay`, `@eqv/editor`)는 TypeScript 소스로 소비한다**(`exports` → `./src/…`, `tsc` 산출물 없음). `@fops/ui`와 AP 패키지와 같다. 이유: `rootDir: src`인 `tsc` 빌드는 `@fops/ui` 소스를 포함할 수 없고(TS6059), 두 호스트(Studio Vite, AP Vite)가 모두 소스를 컴파일한다. `core`·`renderer`는 `dist` 빌드를 유지한다. `@fops/ui`를 import하는 패키지는 `lib`에 `DOM.Iterable`을 넣는다(슬라이스 a에서 `useHorizontalOverflow.ts`가 없이는 TS2488이었다).
2. **DOM UI 패키지는 패키지 CSS 클래스가 아니라 `@fops/ui` 테마의 Tailwind 유틸리티로 스타일한다.** 이유: 디자인 린트(`@shadcn/lint`, PR #77)가 검사할 수 있어야 한다. 각 패키지는 `@source "./"`가 든 `src/styles.css`를 내고, 호스트가 `@fops/ui` 테마 뒤에서 import한다(Studio는 `studio.css`, AP는 어댑터 호스트). 이는 위 "두 패키지는 자체 Tailwind 유틸리티 클래스를 쓰지 않는다 … 호스트가 이 패키지 트리를 `@source`로 훑지 않아도 된다" 문장을 대체한다.
3. **`@fops/ui`에 없는 패턴의 EV 컴포넌트는 `@eqv/ui`에 둔다.** `@fops/ui` 프리미티브와 토큰 위에 짓고, `@eqv/core` 타입을 import할 수 있다. 이유: 화면마다 표·배지를 따로 꾸미면 플랫폼과 갈라진다. `core`·`renderer`는 `@eqv/ui`를 import하지 않는다(ESLint 경계 규칙).
4. **`replay`·`editor`는 슬라이스 d에서 (1)–(2)로 옮긴다.** 그때까지 두 패키지의 CSS는 그대로이고, 디자인 린트의 기존 지적은 억제 목록에 남는다.
