---
status: accepted
---

# 게시된 Layout Revision을 데이터 루트 `templates/`에 Template으로 승격한다

결정자: 소유자 — 승인(2026-10-26, #159): 저장 위치는 데이터 루트 `templates/`, 별도 승인 단계 없이 승격 즉시 Template 후보, 출처를 남긴다. 나머지 세부(아래 **결정**의 원천·`roleCardinality`·카탈로그 합치기·삭제)는 conductor 결정이며 되돌릴 수 있다.

`docs/DELIVERY-PLAN.md` T06b 후반부. 다듬은 Layout을 다음 설비의 Template 후보로 다시 쓰고 싶지만, `templates/`는 읽기 전용이고([DESIGN-v0.4](../DESIGN-v0.4.md) §Studio 저장) Template 문서를 Layout에서 만드는 역방향 규칙이 없었다(`instantiateLayout`은 Template → Layout 한 방향).

**결정.**

- **원천은 게시된 Layout Revision 하나.** 승격은 `layouts/<layoutId>/<hex>.layout.json`(불변, ADR-0007/0011)만 받는다. 초안은 승격하지 않는다: 바뀔 수 있는 파일에서 만든 Template은 출처를 다시 확인할 수 없다.
- **문서 변환.** Layout 문서 전체(`schemaVersion`, `unit`, `viewBox`, `sources`, `levels`, `components`(그 안의 Holding Site·Port·provenance), `physicalInterfaces`, `transferCapabilities`, `processRoutes`)를 그대로 복사하고, 정체성 필드만 바꾼다: `kind: 'template'`, 새 `id`(`idSchema`)와 `name`(둘 다 사용자가 입력), `templateId`는 빼고 `roleCardinality`·`promotedFrom`을 더한다. 결과는 `validateLayout`을 통과해야 쓴다. Component ID는 바꾸지 않는다(안정 ID; Role 기반 ID라도 로그 alias와 같다는 것은 매핑 근거가 아니다 — GLOSSARY Template). `roleCardinality`는 Role마다 그 Role의 Component 수로 `{ min: n, max: n }`(정확히 그 수)이다. 범위를 넓히는 편집은 v1에 없다.
- **출처 필드.** Template 스키마에 선택 필드 `promotedFrom: { layoutId, layoutRevision }`(`layoutRevision`은 `sha256:<hex>`)를 더한다. 번들 Template에는 없다. 기존 Template 파일은 그대로 유효하다.
- **출처 확인.** 승격 endpoint는 쓰기 전에 원천 파일을 읽어 `layoutRevision(layout)`이 파일 이름의 hex와 같고 `layout.id`가 폴더 이름과 같은지 확인한다(ADR-0011과 같은 확인). 다르면 422이고 쓰지 않는다.
- **저장과 승인.** 데이터 루트가 저장소 작업 트리 밖일 때만 승격한다(안이면 403, ADR-0010 가져오기와 같은 사유 문구). 데이터 루트 `templates/<id>.template.json`에 create-only로 쓴다(같은 id가 있으면 409, 덮어쓰지 않음). 승인 단계는 없다: 쓰이면 곧바로 ③ Template 제안의 후보다. Studio에서 삭제하지 않는다(파일을 손으로 옮긴다).
- **카탈로그 합치기.** 데이터 루트가 저장소 밖이면 Studio의 Template 카탈로그는 번들 `assets/templates/`와 데이터 루트 `templates/`의 합집합이다. 데이터 루트가 저장소 안(기본값 `assets/`)이면 두 폴더가 같으므로 번들 하나다. 이 규칙은 [ADR-0010](0010-studio-data-import.md) **데이터 루트** 문단의 "데이터 루트에 `templates/`가 있으면 번들을 대신한다"를 대체한다. 상태 endpoint의 `catalog`는 `'bundled' | 'bundled+data-root'`가 된다. id가 겹치면 번들이 이기고, 겹친 데이터 루트 파일은 파싱 실패 목록(`skippedTemplates`)이 아니라 별도 안내("id가 번들과 겹쳐 건너뛴 Template")로 보인다. 승격 시점에도 번들 id와 겹치면 409로 거절한다.
  - *명확화(2026-10-26):* 데이터 루트 파일은 **파일 이름**이 번들과 같아도 가려지고(번들이 이긴다), 승격도 `<templateId>.template.json`을 번들이 이미 가지고 있으면 409로 거절한다. `promote.ts`와 `apps/studio/README.md`가 이미 이 규칙이다.
- **범위.** Studio만. 플랫폼 쪽 저장(플랫폼 메타 DB의 Layout·Template 소유, DESIGN §11 Open)과 승인 정책은 플랫폼 통합 단계의 일이다.

## Considered Options

- **저장소 `assets/templates/`에 쓰기:** 번들과 섞여 git 이력이 된다. 데이터 루트가 저장소 밖이어야 한다는 ADR-0010과 맞지 않는다.
- **승인 대기 상태(검토 후 후보):** 승인자·상태 저장이 필요하다. 단일 사용자 로컬 도구에서 얻는 것이 적다. 플랫폼 통합 때 다시 본다.
- **초안에서 승격:** 바로 쓸 수 있지만 출처가 바뀌는 파일을 가리킨다.
- **`roleCardinality`를 사용자가 범위로 입력:** 더 일반적이지만 매칭 결과를 바꾸는 입력을 근거 없이 받게 된다. 정확한 수로 시작하고 필요가 보이면 편집을 더한다.

## Consequences

- core에 역변환 함수(`promoteLayout(layout, { templateId, layoutRevision })` 같은 것)와 스키마 필드가 생긴다. 스키마 변경은 이 ADR을 근거로 같은 PR에서 한다.
- Studio dev 서버의 `usesBundledCatalog` 규칙, `ImportStatus.catalog`, Template 읽기가 바뀐다. `templates/`는 승격 endpoint로만 쓴다(일반 `PUT /api/files`는 계속 403).
- ADR-0010 데이터 루트 문단과 `docs/ONBOARDING.md` §3에는 이 ADR을 가리키는 주석을 이 PR에서 단다. `apps/studio/README.md`의 `templates/` 행은 #159 구현 PR에서 고친다.
- 구현은 #159.
