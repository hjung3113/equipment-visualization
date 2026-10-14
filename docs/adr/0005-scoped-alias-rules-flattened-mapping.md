---
status: accepted
---

# Alias Rule은 범위 계층에 작성하고, Publish 시 불변 Mapping Version으로 평탄화한다

Alias Rule과 Type Dictionary는 `Global → Maker → Model → Equipment` Mapping Scope에 작성하고 좁은 범위가 넓은 범위를 덮어쓰지만, Replay가 쓰는 것은 Publish 시점에 이 계층을 풀어 굳힌 불변 Mapping Version뿐이다. 같은 Model의 장비 수십 대가 규칙을 공유해야 온보딩 비용이 장비 수에 비례하지 않고, 동시에 Model 규칙 수정이 이미 게시된 과거 replay 결과를 조용히 바꾸면 Replay Key 결정론이 깨지기 때문이다. Model 규칙이 바뀌면 해당 장비에 재게시 가능 표시만 하고, 재게시는 사람이 dry-run 후 결정한다.

확정되지 않은 자동 제안도 Certainty `assumed`로 게시할 수 있으며, 그 매핑을 거친 location facet의 Evidence Level은 최대 `derived`다. 온보딩 속도와 근거 정직성을 둘 다 지키기 위해서다.

## Considered Options

- **런타임 계층 해석(Replay가 매번 Scope를 합성):** 규칙 재사용은 같지만 과거 결과가 규칙 수정에 따라 바뀐다.
- **장비별 독립 매핑만:** 결정론은 쉽지만 같은 Model 장비마다 같은 작업을 반복한다.
- **확정 항목만 게시:** 정직하지만 수백 개 alias를 하나씩 확정해야 쓰기 시작할 수 있다.
