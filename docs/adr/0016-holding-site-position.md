---
status: accepted
---

# Holding Site에 선택적 Component-local 좌표 `position`을 둔다

결정자: conductor — #224의 범위(선택 필드, 렌더러 배치, 합성 rotary 자산)를 따른다. 아래 세부는 되돌릴 수 있다. `schemaVersion`은 올리지 않는다.

회전 stage 같은 한 PM 안의 여러 자리(station)를 Top View에서 각 자리에 놓고 싶다. 지금 Holding Site에는 좌표가 없어 렌더러는 위치가 있는 Material을 Component 아래의 한 줄에 Site 순서로 늘어놓는다([VIEWS](../VIEWS.md) Top View 재생 레이어: "이 자리는 표시용 순서일 뿐 Holding Site 좌표가 아니다"). 이 줄은 자리의 물리적 위치를 말해 주지 못한다.

**결정.**

- **필드.** `holdingSite.position?: { x, y }`(`strictObject`, 유한한 수). 기존 Port `position`과 같은 `positionSchema`를 쓴다. 단위는 Layout `unit`이며 정규화(0–1) 좌표가 아니다.
- **좌표계.** Component-local이다: 원점은 Component 중심이고, 그 Component 자신의 회전·스케일을 적용하기 전의 좌표다. 세계 좌표는 Port와 같이 모든 부모 transform을 합성한 `componentWorldMatrix × position`이다.
- **생략은 모름.** `position`이 없으면 그 자리의 형상은 unknown이다. 이웃 Site, `size`, Site 순서로 추정하지 않는다. 선택 필드를 더하는 가산 변경이므로 `schemaVersion`은 `'0.4'`로 남는다([ADR-0006](0006-component-footprint-size.md) 선례). 새 좌표는 그 문서의 revision hash만 바꾼다.
- **좌표는 그리기 메타데이터다.** Site 좌표는 관측된 이송이나 kinematics가 아니다. Holding Site `provenance`는 물리 좌표가 정확하다는 증거가 아니다. 번들 fixture의 좌표는 가정·합성이다. 재생의 evidence facet(위치·식별·시작·끝, [ADR-0003](0003-facet-evidence-levels.md))은 바꾸지 않으며, 좌표가 있어도 위치 근거가 `observed`로 올라가지 않는다. 좌표는 Physical Interface, Transfer Capability, 회전·kinematic 모델을 만들지 않는다(형상과 연결은 다른 데이터).
- **footprint 검증.** `component.size`가 있으면 footprint는 중심 기준 사각형 `[-w/2, w/2] × [-h/2, h/2]`이고 경계는 포함한다. `position`과 `size`가 모두 있고 좌표가 사각형 밖이면 `site-position-outside-footprint` 이슈(경로 `components[i].holdingSites[j].position`)를 낸다. `size`가 없으면 footprint는 unknown이므로 경계를 지어내지 않고 구조 검사(`schema`)만 한다 — 이것이 한계다. 유한하지 않은 값이나 여분의 키는 `schema` 이슈다.
- **렌더링.** 위치가 있는 Site를 가리키는 Material은 그 세계 좌표를 중심으로 같은 최상위 화면 직립 클러스터 그룹에 그린다(크기는 화면 px, Component 회전·스케일을 토큰에 적용하지 않음). 좌표가 없는 Site, layout에 없는 `holdingSiteId`, Component 단위 위치는 기존 순서 줄 그대로다(좌표를 추측하지 않음). 위치 Site가 하나도 없는 Component의 출력은 이전과 바이트 단위로 같다. 위치가 있는 Material은 `+N` 상한 뒤로 숨기지 않으며 상한은 순서 줄에만 적용한다. 같은 Site의 두 Material은 어긋나게 놓지 않아 점유 충돌 마커를 가리지 않는다. 움직임·보간은 없다: 중심은 커서 시각의 재생 상태 사이에서만 바뀐다.

## Considered Options

- **정규화 0–1 좌표:** footprint가 없는 Component에서 의미가 없고 Port와 다르다.
- **`size`/순서에서 자리를 계산:** 형상을 지어내는 일이다. unknown은 unknown으로 둔다.
- **`schemaVersion` 올림:** 기존 문서가 그대로 유효하므로 불필요하다.
- **회전 모델(각도·반지름) 필드:** kinematics를 단정한다. 좌표 하나로 충분하다.

## Consequences

- core `holdingSiteSchema`, `layout.schema.json`, `validateLayout`(새 이슈 코드), 렌더러 `buildScene`/`materialTokens`가 바뀐다.
- 편집기의 Layout 왕복, Template 승격([ADR-0015](0015-template-promotion.md), Holding Site를 통째로 복사), `instantiateLayout`은 필드를 보존해야 한다. Site 좌표를 편집하는 UI는 이 ADR의 범위가 아니다.
- 합성 `cluster-rotary-stations` Template과 `fixtures/cluster-rotary/`가 가정 좌표로 전·후를 보여 준다. 실제 설비 형상 주장은 없다.
- 구현은 #224.
