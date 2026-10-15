---
status: accepted
---

# Component의 footprint는 선택적 size로 보존한다

Component는 레이아웃 단위의 선택적 `size: { width, height }`를 가진다. 두 값은 유한한 양수이며, `rotation` 적용 전 Component의 로컬 좌표계에서 footprint를 나타내고 `transform.scale`에 곱해진다. 부모-자식 로컬 좌표 합성을 그대로 유지한다. `size`가 없으면 footprint는 `unknown`이며 데이터에 기본값을 채우지 않는다. renderer는 이때 primitive의 원래 크기로 fallback한다.

Renderer 계약: housing, efem, tm, rail 등 구조를 감싸는 Role은 footprint에 맞게 늘린다. 모듈과 로봇 기호는 종횡비를 보존하여 footprint 안에 맞추고 중앙에 배치한다. 이는 렌더링 계약이며 실제 기구학이나 실측 치수의 근거가 아니다. 기존 primitive 크기만 사용하면 로봇이 EFEM/TM 밖으로 벗어나고 모듈이 겹치는 문제가 사용자에게 보고되었다(#32, 2026-10-15).

기하와 연결은 별개다(ADR-0004). footprint가 겹치거나 맞닿아도 Physical Interface나 Transfer Capability를 만들지 않으며, 포트나 로봇 궤적을 추론하지 않는다.

## Considered Options

- **Primitive 원래 크기만 사용:** 사용자에게 보고된 배치 깨짐을 해결하지 못하므로 기각한다.
- **비균일 scale:** 원형 기호를 왜곡하고 footprint와 기호 배율을 섞으므로 기각한다.
- **절대 좌표 bounding box:** 부모-자식 로컬 좌표 합성을 깨뜨리므로 기각한다.

## Consequences

- 선택 필드의 추가이므로 `schemaVersion`은 `0.4`를 유지하고 기존 Layout과 fixture도 계속 유효하다.
- v0.3 팩의 `bounds.w/h`는 `size.width/height`로 복원하고 `provenance.size`는 `assumed`, `sourceEvidence: ['src-v03-pack']`로 기록한다. 합성 팩의 치수는 검증된 실측값이 아니다.
- `provenance.size`에도 기존 속성과 같은 Source Evidence 검증을 적용한다. 근거 없는 `verified`는 거부한다.
