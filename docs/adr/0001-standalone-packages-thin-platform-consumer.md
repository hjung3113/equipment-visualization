---
status: superseded in part by ADR-0012
---

> 2026-10-21: 기본 호스트와 계약 소유는 [ADR-0012](0012-platform-first-sdk-host.md)가 바꾼다(플랫폼 셸이 기본 호스트, 계약은 플랫폼 SDK 소유, 조립은 `platform-adapter`). 도메인·렌더러 패키지의 플랫폼 무의존과 `--eqv-*` 토큰 소유는 그대로다.

# 독립 패키지가 정본, analytics-platform은 얇은 소비자

`core`/`renderer`/`editor`/`replay`는 이 저장소의 독립 패키지로 구현하고, analytics-platform의 `menus/equipment`에는 page 조립·`menuQuery` endpoint 선언·`platform-adapter`(테마 매핑, URL/Scope/권한 연결)만 둔다. 스타일은 renderer가 자체 semantic CSS 변수(`--eqv-*`)와 fallback을 소유하고, `platform-adapter`가 플랫폼 토큰을 그 변수에 주입한다. Equipment 시각화는 플랫폼 밖에서도 실행·검증되어야 하고(독립 Studio, synthetic fixture), 플랫폼 내부에 모델·reducer를 두면 `@ap/*` 경계 규칙과 private/public 저장소 분리를 동시에 지킬 수 없기 때문이다.

## Considered Options

- **플랫폼 `menus/equipment/src/components/topview/` 안에 직접 구현** (INTEGRATION v0.3 계획 A): 플랫폼 패키지 경계는 지키지만 독립 실행이 불가능하고, 이 저장소가 프로토타입으로 전락한다.
- **플랫폼에 `packages/equipment-viz` 공유 패키지 신설**: 플랫폼의 정식 패키지 목록을 바꿔야 하고, 결국 이 저장소와 같은 코드를 이중 소유한다.

## Consequences

- renderer는 `DESIGN.md`/`@ap/ui` 토큰을 직접 참조하지 않는다. 플랫폼 테마 변경은 adapter 매핑만 고친다.
- 플랫폼 통합은 submodule/패키지 소비 방식이며 private 저장소 접근 CI 게이트(analytics-platform #332)에 묶인다.
