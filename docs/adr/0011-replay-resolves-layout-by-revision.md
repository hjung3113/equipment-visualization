---
status: accepted
---

# Replay는 Layout Revision을 pin한 Binding의 Layout을 그 Revision으로만 찾는다

결정자: 소유자 — 승인(2026-10-19, #53).

ADR-0007의 "Replay는 계속 `layoutId`로 Layout을 찾는다"를 바꾼다. Publish는 항상 `layoutRevision`을 Binding에 쓰므로, 같은 `layoutId`를 편집해 두 번 게시하면 한 설비에 서로 다른 Revision을 가리키는 Binding이 둘 생긴다. `layoutId`로 찾으면 오래된 Binding 구간이 새 Layout 위에 그려져 잘못된 상태가 보이고, 입력에 둘이 함께 있으면 먼저 오는 쪽이 골라져 Replay Key가 입력 순서에 따라 바뀐다.

**해석 규칙.** `ReplayInput`은 선택 필드 `layoutRevisions`(`sha256:<hex>` → Layout)를 갖는다. 해석은 `@eqv/core`의 `bindingLayout(input, binding)` 하나뿐이다.

- `layoutRevision`이 있는 Binding(pin)은 `layoutRevisions[revision]`으로만 Layout을 찾는다.
- pin한 Revision이 입력에 없으면 Layout은 없다(Component 위치 `unknown`, components 없음). `layoutId`로 되돌아가 찾지 않는다. 다른 Revision을 그리는 것은 잘못된 상태이고, 모르는 것은 모르는 채로 둔다.
- `layoutRevision`이 없는 기존 Binding은 지금처럼 `layouts`에서 `layoutId`로 찾는다.

**검증은 호출자가 한다.** reducer는 동기 함수라 해시를 계산할 수 없다. 호출자는 각 Revision 파일을 읽을 때 `layoutRevision(layout)`이 키와 같은지 확인한다(Studio Focus는 불러올 때 확인한다). core는 `assertReplayInput`에서 `layoutRevisions` 키 형식과, pin된 항목의 `layout.id === binding.layoutId`를 확인하고, `replayKey`는 해석된 Layout의 내용 hash가 pin한 Revision과 다르면 `RangeError`를 던진다.

**Scene State와 Replay Key.** Scene State의 `binding`은 Binding이 pin했을 때만 `layoutRevision`을 갖는다(없으면 키를 두지 않아 기존 Scene State의 해시는 그대로다). `replayKey.layoutHash`는 해석된 Layout의 내용 hash이며 pin한 Revision과 같다. pin한 Binding이 고르는 Layout이 `layouts`만 준 입력에서 달라지므로 `RULESET_VERSION`은 `scene-rules-2`다.

**Focus.** Focus는 Binding 구간마다 Revision 파일(`layouts/<id>/<hex>.layout.json`) 하나를 읽고 불러올 때 hash를 확인한다. pin하지 않은 Binding이 있는 `layoutId`만 초안을 `layouts`에 싣는다. 같은 `layoutId`의 Binding들이 서로 다른 Revision을 가리켜도 이제 올바르므로 "최신 Binding의 것을 사용합니다" 안내는 없앤다.

## Considered Options

- **`layoutId` 조회 유지(현 상태):** 변경이 없지만 위의 잘못된 상태와 입력 순서 의존이 남는다.
- **`layoutId`마다 Revision 하나만 호출자가 넘기게 요구:** reducer는 그대로지만 한 재생 구간이 Binding 경계를 넘을 때 앞 구간을 표현할 수 없다.
- **`layouts`를 `{ revision, layout }` 항목으로 변경:** 한 필드로 끝나지만 모든 호출자와 테스트가 깨지는 변경이다. 선택 필드 추가는 기존 입력을 그대로 둔다.
