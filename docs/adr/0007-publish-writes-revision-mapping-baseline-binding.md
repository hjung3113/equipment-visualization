---
status: accepted
---

# Publish는 Layout Revision, Mapping Version, Baseline Inventory를 먼저 쓰고 bindings 파일을 마지막에 쓴다

Studio의 Publish는 네 개의 파일을 정해진 순서로 쓴다. (1) 현재 초안을 Layout Revision으로 쓴다(`POST /api/layout-revisions`, 같은 내용이면 멱등). (2) Mapping Version을 `onboarding/mappings/<equipmentId>/<hex>.mapping.json`에 쓴다(불변, 같은 내용이면 통과). (3) Mapping Version을 게시할 때 기준이 된 샘플 Inventory를 Baseline Inventory로 `onboarding/baselines/<equipmentId>/<mappingHex>.inventory.json`에 쓴다(불변). (4) bindings 파일을 덮어쓴다. 이 마지막 쓰기가 commit point다. Replay는 bindings를 통해서만 Mapping Version을 찾으므로, 앞의 세 단계가 중간에 실패해도 어떤 binding도 참조하지 않는 불변 파일만 남고 재시도는 멱등이다. 실패한 단계는 화면에 단계 이름과 함께 표시한다.

Baseline Inventory가 이미 있으면(409) 기존 파일을 유지하고 Publish를 계속한다. 같은 Mapping Version에 대한 기준은 처음 게시 때의 것이 Drift 비교의 기준으로 남아야 하기 때문이다.

Binding에 선택 필드 `layoutRevision`(`sha256:<hex>`, `layoutRevision()` 값)을 추가하고 Publish는 항상 채운다. Mapping Version의 `layoutId`는 초안의 `id`다. Replay는 계속 `layoutId`로 Layout을 찾는다. Revision으로 찾는 것은 reducer가 동기 함수라 해시를 계산할 수 없으므로 #53에 남긴다. 필드가 없는 기존 bindings는 그대로 유효하다.

`effectiveFrom`은 사람이 입력한다. Binding이 없는 장비는 Inventory `from`, 있는 장비는 Inventory `to`로 채우고, 가장 최근 binding의 `effectiveFrom`보다 늦어야 한다. 최근 binding이 열려 있으면 새 `effectiveFrom`으로 `effectiveTo`를 닫는다. 새 bindings 파일은 `validateBindings`를 통과해야 한다.

## Considered Options

- **Revision 없는 binding(현 상태):** 변경이 없지만 게시 시점의 초안 내용을 나중에 특정할 수 없고, 같은 `layoutId`의 초안이 바뀐 것을 감지하지 못한다.
- **별도 게시 기록 파일:** 이력은 명확하지만 bindings와 기록 사이에 두 번째 commit point가 생겨 부분 실패 상태가 늘어난다.
- **Baseline을 bindings에 인라인 저장:** 파일 수는 줄지만 bindings가 Inventory 크기만큼 커지고, 덮어쓰는 파일 안에 불변이어야 할 기준이 섞인다.
