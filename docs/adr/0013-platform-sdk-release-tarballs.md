---
status: accepted
---

# 플랫폼 SDK는 GitHub Release tarball로 소비하고, 디자인 시스템 원본은 `@fops/ui`에서 `@ap/ui`로 바꾼다

결정자: conductor — 소유자 방향(2026-10-24, #177: "플랫폼 sdk 최대한 활용")에 따른 결정. 되돌릴 수 있다.

[ADR-0012](0012-platform-first-sdk-host.md)가 "SDK 전환에서 정함"으로 남긴 항목을 닫고, [ADR-0008](0008-platform-design-system-fops-ui.md)의 디자인 시스템 원본만 바꾼다. 플랫폼은 SDK `sdk-v0.12.0`(2026-10-23, public Release)에 `ap-{contracts,kernel,ui,components,shell}-0.12.0.tgz`와 `SHA256SUMS`를 올렸다. `@ap/ui`는 FeedbackOps `@fops/ui`가 analytics-platform으로 옮겨 온 것이다(AP ADR-0046).

**결정.**

- **소비 방식.** 플랫폼 SDK는 GitHub Release tarball URL 의존으로 받는다. git 서브모듈과 `path:` 의존은 쓰지 않는다. `@ap/*`를 쓰는 패키지마다 Release URL을 직접 의존으로 두고, 업그레이드는 모든 `@ap/*` URL과 정확 버전 peer를 함께 올리고(아래 **업그레이드**), `pnpm-workspace.yaml`의 `strictPeerDependencies: true`가 선언된 peer와 맞지 않는 설치(EV 패키지의 `@ap/*` 정확 버전 peer 포함)를 막는다(`sdk-v0.19.0`부터: tarball 안 형제 `@ap/*`가 정확 버전 peer라 `@ap/*` `overrides`를 두지 않는다 — AP #806; 그 전에는 `overrides`가 각 `@ap/*`를 같은 Release 파일로 고정했다). `overrides`는 tarball이 싣지 않는 소비자 조건(`@tiptap/*` 3.23.5 고정 — AP 가이드 목록에 없는 `@tiptap/core`·`@tiptap/pm` 포함 — 과 `@formkit/auto-animate@0.10.0` 패치)을 함께 둔다. 저장소가 public이라 CI에 비밀이 필요 없다.
- **디자인 시스템 원본.** `@fops/ui` → `@ap/ui`(이 결정 때 0.12.0, 지금 고정은 0.19.0). ADR-0008의 규칙(Studio 포함 모든 화면이 같은 디자인 시스템, `--eqv-*`는 플랫폼이 정의하는 변수만 감싸 매핑, `@ap/ui`에 없는 패턴은 EV 컴포넌트가 먼저, CSS 소비 순서)은 그대로이고 패키지 출처만 바뀐다. `external/feedbackops` 서브모듈과 그 워크스페이스 항목은 없앤다. `@ap/ui`가 내지 않는 `OutlineBadge`(AP ADR-0050)는 `@eqv/ui`가 `@ap/ui` `Badge`의 outline variant로 다시 짓는다.
- **패키지 이름.** 게시된 `@ap/*` 이름을 쓴다. 이름이 바뀌면 이 저장소에서는 버전 bump로 다룬다.
- **호스트 계약.** 계약 버전은 `1`(`@ap/contracts`)이다.
- **업그레이드.** SDK 버전 올림은 명시적인 PR이다. 모든 `@ap/*` URL과 정확 버전(의존, `peerDependencies`)을 한 PR에서 함께 올린다.
- **CI.** EV CI는 공개 tarball을 설치한다. AP CI에 기대지 않는다.
- **경계(ESLint).** `core`·`renderer`는 모든 `@ap/*`(`@ap/ui` 포함)와 디자인 시스템을 import하지 않는다. `editor`·`replay`·`ui`·`views`·Studio는 `@ap/*` 중 `@ap/ui`만 import할 수 있다. 그 밖의 `@ap/*`는 `packages/platform-adapter`만 쓰며 `@ap/contracts`와 `@ap/ui`로 한정했다(177c, #189). 동적 `import()`와 `import type`도 같은 규칙이다.

**그대로인 것.** ADR-0012의 결정(기본 호스트는 플랫폼, 디자인 시스템 `@ap/ui`를 뺀 SDK import는 어댑터 하나, Studio는 호스트 포트를 구현하지 않음), 저장소가 플랫폼 서버 없이 빌드·테스트된다는 점, 이 저장소에서 analytics-platform 코드를 고치지 않는다는 점.

## Considered Options

- **서브모듈 / git `path:` 의존:** AP ADR-0056이 SDK 소비자에게 권하지 않는다. 설치가 무겁고 핀이 커밋이라 버전 의미가 없다.
- **FeedbackOps 서브모듈 유지(ADR-0008 D):** 원본이 이미 AP로 옮겨 가 갈라진다.
- **(채택) Release tarball URL(`sdk-v0.15.0`부터 직접 의존 + `strictPeerDependencies`, 그 전에는 `@ap/*` overrides):** 버전이 고정되고 checksum이 있으며 public이라 비밀이 필요 없다.

## Consequences

- ADR-0008은 이 ADR로 개정된다. 본문의 `@fops/ui`·서브모듈 서술은 결정 당시의 기록이다.
- ADR-0012의 "정하지 않은 것" 중 패키지 이름·계약 버전·CI·디자인 시스템 원본은 여기서 정했다. `platform-adapter` 예외를 두 패키지로 좁히는 일은 어댑터 구현에서 한다.
- `pnpm install`은 GitHub Release에 접근해야 한다(오프라인 설치 불가).
- 업그레이드 PR은 URL 일괄 변경, 락파일, 게이트 통과를 함께 검증한다.
