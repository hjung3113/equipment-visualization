---
status: accepted
---

# 기본 호스트는 analytics-platform이고, 이 저장소는 플랫폼 SDK를 `platform-adapter`에서만 소비한다

결정자: 소유자 — 승인(2026-10-21, #70·#177: "SDK로 플랫폼에 통합", analytics-platform ADR-0039 방향 채택).

[ADR-0001](0001-standalone-packages-thin-platform-consumer.md)의 무게중심을 바꾼다. ADR-0001은 "독립 패키지가 정본, 플랫폼은 얇은 소비자"로, 플랫폼 `menus/equipment`에 page 조립·`menuQuery` 선언·`platform-adapter`만 두었다. 소유자 정정(2026-10-17, analytics-platform #332·#396 코멘트)과 analytics-platform [ADR-0043](https://github.com/hjung3113/analytics-platform/blob/main/docs/adr/0043-platform-sdk-is-the-app-contract-and-unified-framework.md)(2026-10-19, Decided: SDK는 플랫폼에 올릴 앱이 지킬 계약이고 플랫폼이 소유하며, 의존 방향은 SDK ← 제품 하나)에 따라, 이 저장소의 화면은 플랫폼 셸에 올라가는 앱으로 먼저 설계하고 독립 Studio는 같은 패키지를 직접 조립하는 두 번째 호스트(저작·검증)로 남긴다.

**결정.**

- 도메인·렌더러 패키지(`core`·`renderer`·`editor`·`replay`)가 정본이고 계속 플랫폼을 모른다. `core`·`renderer`는 `@ap/*`를 import하지 않고, `editor`·`replay`는 디자인 시스템 `@ap/ui`만 import한다([ADR-0013](0013-platform-sdk-release-tarballs.md)). 그 밖의 플랫폼 SDK는 import하지 않는다.
- 기본 호스트는 analytics-platform 셸이다. 호스트 → 앱 계약(화면 manifest, 호스트 포트, `menuQuery` 선언, 계약 버전)은 플랫폼 SDK가 소유한다. 이 저장소가 자기 입력 타입을 내고 플랫폼이 맞추는 방식은 쓰지 않는다.
- 디자인 시스템 `@ap/ui`를 뺀 플랫폼 SDK(호스트 계약 `@ap/contracts` 등)를 import하는 곳은 `packages/platform-adapter` 하나다([ADR-0013](0013-platform-sdk-release-tarballs.md)). 어댑터는 SDK 계약을 구현해 플랫폼 탑재 화면(manifest + 화면 컴포넌트 + `menuQuery` 선언 + `--eqv-*` 테마 매핑)을 낸다. 조립은 어댑터가 하고 플랫폼 `menus/analytics/equipment`는 연결만 한다.
- Studio는 호스트 포트를 구현하지 않는다. 두 호스트의 동등성은 패키지 수준에서 검사한다(같은 입력 → 같은 렌더·검증).

**그대로인 것.** `--eqv-*` 토큰 소유와 어댑터의 토큰 주입(ADR-0001 Consequences), [ADR-0002](0002-occurrence-input-contract.md) Occurrence 입력 계약, 플랫폼 안 1차 범위가 읽기(뷰어·재생)라는 점, 쓰기(초안·Publish)의 별도 설계, 저장소가 플랫폼 없이 빌드·테스트된다는 점.

**정한 것과 남은 것.** SDK 패키지 이름(게시된 `@ap/*`), 계약 버전 `1`, 이 저장소 CI의 SDK 설치(공개 Release tarball), 디자인 시스템 원본의 ADR-0008 개정(`@ap/ui`)은 [ADR-0013](0013-platform-sdk-release-tarballs.md)이 정했다. `eslint.config.js`의 `platform-adapter` 예외를 `@ap/contracts`·`@ap/ui` 둘로 좁히는 일은 어댑터를 만들 때 한다(177c, #189에서 했다).

## Considered Options

- **ADR-0001 유지(독립 패키지 정본, 플랫폼은 얇은 소비자):** 계약을 이 저장소가 내게 되어 플랫폼 소유 SDK(ADR-0043)와 의존 방향이 반대가 된다.
- **플랫폼 안에 모델·reducer·renderer 재구현:** ADR-0001이 거부한 이유(독립 검증 불가, 이중 소유)가 그대로 남는다.

## Consequences

- `platform-adapter`는 아직 없다(README "planned"). SDK 전환 작업이 그 패키지를 만든다.
- SDK 전환에 속하는 항목(#177): 쓰기 API ADR, meta DB의 Layout 소유, 사용자 역할, `at`/`anchor` codec, Top View 컨테이너 크기, 표시 어휘(근거 등급 단어) 소유.
