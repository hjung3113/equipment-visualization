# analytics-platform 통합안 — 실제 Repository 기준

**검토 대상:** https://github.com/hjung3113/analytics-platform (main, 2026-10-14 조회). **구현/커밋 없음.**

## 확인된 현재 계약

1. `README.md`: 플랫폼 FE는 `pnpm` workspace, `apps/platform-web`, `packages`, `menus` 구조. 서버는 현재 mock. Parser Postgres를 소비하는 분석 플랫폼.
2. `AGENTS.md`, `docs/integration/platform-packages.md`: `packages/contracts → kernel/ui → components → shell → apps` 의존; 메뉴끼리 import 금지. 플랫폼 핵심 계층에 equipment-specific logic 금지.
3. `packages/contracts/src/adapter.ts`: 도메인 조회는 공통 `PlatformAdapter.menuQuery`; 임의 `fetchEquipmentReplay()` 같은 포트 메서드 추가 금지.
4. `menus/equipment/src/index.ts`: `equipment-detail`은 `/equipment/:equipmentId` 라우트를 이미 제공, navHidden; `equipment:view` 권한 사용.
5. `menus/analytics/src/endpoints.ts`: 분석 Context는 시간 apply, occurrence 상세 키는 equipmentId+anchor. `docs/14_drilldown_platform.md`: context link 및 returnTo 패턴.
6. `DESIGN.md`: FeedbackOps 시각 primitive와 플랫폼 extension tokens의 소유권 명확. 별도 로봇용 색상 체계로 교체 금지.
7. `docs/01_architecture_and_data_contract.md`: Parser 원본은 view/mart를 거쳐 API가 소비; late correction/rebuild 및 time-domain 규칙 존재. 조회는 범위/반환량 제한.

## 단계별 실제 파일 계획(제안)

### A. 기존 패키지 경계를 건드리지 않는 시작점

```text
menus/equipment/src/
  components/topview/
    model/               # domain layout/port/graph/evidence schema (순수 TS)
    renderer/            # SVG React viewer, token styles
    editor/              # edit commands; UI 별도 lazy chunk
    replay/              # observational action timeline, deterministic reducer
    registry/            # template catalog, revision
    fixtures/            # synthetic/logless examples
  pages/EquipmentTopView.tsx
  pages/EquipmentReplay.tsx
  endpoints.ts            # equipment.topview.definition / equipment.topview.events
  index.ts                # lazy manifest / capability / URL pageKeys
  mock/                   # 선언된 조회 핸들러, 런타임 렌더 code import 금지

menus/analytics/src/
  pages/...               # Top View 이동은 `linkTo('equipment-topview', ..)` 사용

apps/platform-web/src/
  ...                     # 기존 Registry 조립. manual Shell 편집 불필요.
```

- 초기에는 한 메뉴 도메인 Consumer 소유로 개발. 타 분석 메뉴는 `linkTo`를 통해 **같은 화면으로 이동**하고, 렌더러 코드에 import 하지 않음.
- 이 방식은 현재 `menu-*` 상호 import 금지, `packages/components`의 범용성 원칙 모두 충족.
- `equipment-detail`에 viewer tab을 추가하는 옵션이 가장 작은 UI 변경. 단, `replay`의 시각화 면적이 큰 만큼 `equipment-topview` 별도 페이지를 lazy로 추가할 수도 있음; IA 리뷰에서 확정.

### B. 2개 이상 메뉴에서 렌더러를 직접 재사용해야 할 때

- 공용 renderer를 `packages/components`에 domain-agnostic SVG viewport로 승격하거나, 별도 `packages/equipment-viz`라는 **독립 도메인 공유 패키지**를 ADR로 제안.
- 후자는 현재 문서의 정식 패키지 목록에 없음. 즉시 파일 추가로 기존 경계 계약을 우회하지 말 것.
- 첫 번째 후보가 domain-agnostic viewport API만 소유하고 장비 vocabulary는 `menus/equipment`가 유지하게 하는 방식이 제약이 적음.
- 테스트 후 실제 2~3개 소비자가 독립적으로 쓸 때 승격; 현재 메뉴간 링크만으로 충분하면 공통화 불필요.

## UI / Information Architecture

```text
Analytics Workspace
 └─ 생산성 드릴다운 (equipmentId, anchor, from/to, Lot ...)
       └─ linkTo() → Equipment Detail / Top View
             ├─ [Overview] [Top View] [Log Replay] [Event List]
             │     ├─ SVG (selection/highlight)
             │     ├─ Timeline (cursor, zoom, playback speed)
             │     └─ Event Grid (source/timestamp/provenance)
             └─ ReturnLink ← 원 분석 화면·드릴다운 문맥 복원

Equipment Management
 └─ Equipment Master → Detail → Published Layout
       └─ Edit(Layout revisions) [write permission 별도]
```

- `EquipmentID`는 목적지 객체 식별자, 사용자 전역 Selection은 필터 집합. 둘을 섞지 않는다.
- 시간 범위는 전역 Context의 `time`을 참조/적용하도록 메뉴별로 선언하고, 재생 커서 `at`는 page-local visualization state (프로젝트 URL codec 원칙 재사용).
- `anchor`는 occurrence 식별에 사용; clock instant와 혼동 금지.
- 상세 열람 권한과 편집/공개 권한은 다르게 (`equipment:view`, 제안 `equipment:topview:edit`, `equipment:topview:publish`, `equipment:replay:view`). 실제 권한 문자열은 추후 정책 승인.
- 불완전 데이터면 Canvas에 속이는 state 동작 대신 `DataTrustIndicator`와 이벤트 패널 표시.
- 설비 선택 후 다른 Site 데이터나 다른 EquipmentID 이벤트를 클라이언트에서 섞어 보여주지 않음.

## API/DTO 제안 (후보 필드, 기존 실데이터 스키마를 주장하지 않음)

`equipment.topview.definition`: `{ equipmentId, templateId, layoutRevision, components, ports, physicalConnections, transferCapabilities, views, sourceEvidence, updatedAt }`.

`equipment.topview.events`: `{ equipmentId, from, to, anchor?, parserContractVersion, ingestionGeneration, dataWatermark, observations, assessments, continuationToken? }`.

`equipment.topview.saveDraft` / `publish`: **변경 API는 별도 설계 필요**. 현재 공개 `menuQuery`는 read contract에 최적화된 상태이므로 DB 쓰기를 조회 `menuQuery`로 위장하거나 generic kernel port에 슬쩍 섞지 않음. 쓰기/승인/감사는 후속 ADR 및 API 권한 경계 확정 후.

### 서버 쿼리 유의사항

- Parser Postgres 원본 직접 join 금지: read-only 호환 view/mart/service 어댑터를 통해 관찰 이벤트를 normalize.
- 액티브 replay 이벤트의 시간 범위·row cap/continuation; 무제한 full-day/full-site event fetch 금지.
- 권한/Scope/time-domain 검증은 서버에서, 클라이언트 탭 숨기기로 대체하지 않음.
- 데이터 보정/지연 완료/Parser 변경으로 과거 timeline이 바뀔 때 `ingestionGeneration`과 `parserContractVersion` 비교하여 결과 폐기·재조회.
- 원본 Site 시간축 의미를 보존; 브라우저 사용자 로컬 시간으로 임의 변환 금지.

## 렌더러 라이브러리 검토

| 후보 | 선택 제안 | 사유 |
|---|---|---|
| Native SVG+React | **Viewer MVP 기본** | 의미 그룹, 속성, 분리된 상태 overlay에 유리. 규모가 작다면 추가 라이브러리 불필요 |
| SVG.js | Editor 도형 조작용 검토 | SVG selection/resize extensions 존재. React 컴포넌트 소유 DOM과 직접 변경 충돌 방지 설계 필요 |
| @xyflow/react | 별도 topology/flow editor 후보 | edges, handles, zoom/pan 장점. 실제 실루엣 기반 SVG Scene 전체 renderer로는 부적합할 수 있음 |
| draw.io | 초안 작성/공통 library 제작용 | 사내 에셋 도구, JSON 원본을 대체하지 않음 |
| SVG-Edit | 세부 Path 편집기(선택) | 에셋 전문가 작업; 제품 내부에 통합할 필요성은 별도 UX 검토 |

후보 근거: https://github.com/xyflow/xyflow (MIT), https://github.com/svgdotjs/svg.js (MIT), https://www.drawio.com/docs/manual/advanced/custom-shape-libraries/ .

## 플랫폼 회귀 시나리오

1. Analytics → Equipment Top View → ReturnLink 후 이전 시간/설비/드릴 단계 복원.
2. 직접 URL / 새 탭 / 뒤로가기 / base-path에서도 동일 대상·시각 복원.
3. 전역 Scope 변경 시 이전 이미지/로그가 한 프레임이라도 노출되지 않음.
4. `time` 미지원 또는 범위 미지원 상황에서 조용히 기본 구간 대체 금지.
5. 테마/다크모드, 작은 Desktop 너비, 키보드 접근, screen reader 접근 확인.
6. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` 및 앱 E2E.

### 관련 실제 파일 URL
- https://github.com/hjung3113/analytics-platform/blob/main/docs/integration/platform-packages.md
- https://github.com/hjung3113/analytics-platform/blob/main/menus/equipment/src/index.ts
- https://github.com/hjung3113/analytics-platform/blob/main/menus/analytics/src/endpoints.ts
- https://github.com/hjung3113/analytics-platform/blob/main/docs/01_architecture_and_data_contract.md
- https://github.com/hjung3113/analytics-platform/blob/main/DESIGN.md