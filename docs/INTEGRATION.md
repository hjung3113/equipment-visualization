# analytics-platform 통합안 — 실제 Repository 기준

**검토 대상:** https://github.com/hjung3113/analytics-platform (main, 2026-10-14 조회). **구현/커밋 없음.**

## 확인된 현재 계약

1. `README.md`: 플랫폼 FE는 `pnpm` workspace, `apps/platform-web`, `packages`, `menus` 구조. 서버는 현재 mock. Parser Postgres를 소비하는 분석 플랫폼.
2. `AGENTS.md`, `docs/integration/platform-packages.md`: `packages/contracts → kernel/ui → components → shell → apps` 의존; 메뉴끼리 import 금지. 플랫폼 핵심 계층에 equipment-specific logic 금지.
3. `packages/contracts/src/adapter.ts`: 도메인 조회는 공통 `PlatformAdapter.menuQuery`; 임의 `fetchEquipmentReplay()` 같은 포트 메서드 추가 금지.
4. `menus/analytics/equipment/src/index.ts`: `equipment-detail`은 `/equipment/:equipmentId` 라우트를 이미 제공, navHidden; `equipment:view` 권한 사용.
5. `menus/analytics/analytics/src/endpoints.ts`: 분석 Context는 시간 apply, occurrence 상세 키는 equipmentId+anchor. `docs/14_drilldown_platform.md`: context link 및 returnTo 패턴.
6. `DESIGN.md`: FeedbackOps 시각 primitive와 플랫폼 extension tokens의 소유권 명확. 별도 로봇용 색상 체계로 교체 금지.
7. `docs/01_architecture_and_data_contract.md`: Parser 원본은 view/mart를 거쳐 API가 소비; late correction/rebuild 및 time-domain 규칙 존재. 조회는 범위/반환량 제한.

## 단계별 실제 파일 계획(제안)

[ADR-0001](adr/0001-standalone-packages-thin-platform-consumer.md): `core`/`renderer`/`editor`/`replay`는 이 저장소의 독립 패키지가 정본이고, 플랫폼은 **얇은 소비자**다. 모델·reducer·renderer 코드를 플랫폼 안에 다시 만들지 않는다.

### 플랫폼 쪽 소비자 구조

```text
menus/analytics/equipment/src/
  pages/EquipmentTopView.tsx     # 이 저장소 renderer/replay 패키지 조립 (lazy)
  pages/EquipmentReplay.tsx
  endpoints.ts                   # menuQuery 선언: equipment.topview.definition / .events / .metrics / .inventory
  index.ts                       # lazy manifest / capability / URL pageKeys
  mock/                          # 선언된 조회 핸들러용 synthetic 응답, 런타임 렌더 code import 금지

packages/platform-adapter (이 저장소)
  theme.ts                       # 플랫폼 토큰 → --eqv-* CSS 변수 매핑·주입
  context.ts                     # URL/Scope/time/권한 → viewer/replay props

menus/analytics/analytics/src/
  pages/...                      # Top View 이동은 `linkTo('equipment-topview', ..)` 사용
```

- 타 분석 메뉴는 `linkTo`로 **같은 화면으로 이동**하고 렌더러 코드를 import하지 않는다. 현재 `menu-*` 상호 import 금지와 `packages/components` 범용성 원칙을 그대로 지킨다.
- `equipment-detail`에 viewer tab을 추가하는 옵션이 가장 작은 UI 변경. `replay`의 시각화 면적이 크면 `equipment-topview` 별도 페이지를 lazy로 추가; IA 리뷰에서 확정.
- 패키지 소비 방식은 submodule pin이며 private 저장소 접근 CI 게이트(analytics-platform #332) 결정 후 진행.
- 원천 parser Result → Occurrence 변환은 플랫폼 **서버** read view(`equipment.topview.events`)의 책임이다([ADR-0002](adr/0002-occurrence-input-contract.md)). 클라이언트와 이 저장소에는 원천 parser 코드·어휘를 두지 않는다.
- 플랫폼 호스트에는 데이터 가져오기가 없다([ADR-0010](adr/0010-studio-data-import.md)). 설비 식별은 플랫폼 설비 마스터가 소유하고, Occurrence는 `equipment.topview.events`가 준다. 가져오기(Sample Window)는 Studio 전용이다.
- 호스트(`menus/analytics/equipment`)는 assembly와 location adapter를 `platform-adapter`/viewer에 props로 주입한다. 플랫폼 코드에 설비별 로직을 두지 않는다.

## UI / Information Architecture

```text
Analytics Workspace
 └─ 생산성 드릴다운 (equipmentId, anchor, from/to, Lot ...)
       └─ linkTo() → Equipment Detail / Top View
             ├─ Focus (equipmentId + entityType/anchor) — Top View · Gantt · Occurrence 목록, 커서 공유
             ├─ Aggregate (from/to + metric) — Component Metric 인코딩
             ├─ Journey (wafer anchor) — 이산 hop
             └─ ReturnLink ← 원 분석 화면·드릴다운 문맥 복원

Equipment Management
 └─ Equipment Master → Onboarding (Fleet → Inventory → Template → Mapping Board → dry-run → Publish)
       [onboarding:edit-rules / onboarding:publish-mapping / onboarding:edit-global-dictionary]
```

- `EquipmentID`는 목적지 객체 식별자, 사용자 전역 Selection은 필터 집합. 둘을 섞지 않는다.
- 시간 범위는 전역 Context의 `time`을 참조/적용하도록 메뉴별로 선언하고, 재생 커서 `at`는 page-local visualization state (프로젝트 URL codec 원칙 재사용).
- `anchor`는 occurrence 식별에 사용; clock instant와 혼동 금지.
- 상세 열람 권한과 편집/공개 권한은 다르게 (`equipment:view`, 제안 `equipment:topview:edit`, `equipment:topview:publish`, `equipment:replay:view`). 실제 권한 문자열은 추후 정책 승인.
- 불완전 데이터면 Canvas에 속이는 state 동작 대신 `DataTrustIndicator`와 이벤트 패널 표시.
- 설비 선택 후 다른 Site 데이터나 다른 EquipmentID 이벤트를 클라이언트에서 섞어 보여주지 않음.

## API/DTO 제안 (후보 필드, 기존 실데이터 스키마를 주장하지 않음)

`equipment.topview.definition`: `{ equipmentId, binding: { layoutRevision, mappingVersion, effectiveFrom, effectiveTo }, layout, mapping, updatedAt }` — `layout`은 Component/Level/PhysicalInterface/TransferCapability/ProcessRoute를 포함한 Layout Revision 원본(ADR-0004).

`equipment.topview.metrics`: `VIEWS.md`의 `ComponentMetric[]` (원천 alias 기준; 지표 계산은 플랫폼 mart).

`equipment.topview.inventory`: `ONBOARDING.md`의 `ObservedInventory` (긴 샘플 기간은 서버 집계).

`equipment.topview.events`: `REPLAY-CONTRACT.md`의 `OccurrenceBatch` — `{ equipmentId, from, to, timeDomain, watermark, parserContractVersion, dataGeneration, occurrences, issues, continuationToken? }`. 조회는 구간과 **겹치는** Occurrence.

`equipment.topview.saveDraft` / `publish`: **변경 API는 별도 설계 필요**. 현재 공개 `menuQuery`는 read contract에 최적화된 상태이므로 DB 쓰기를 조회 `menuQuery`로 위장하거나 generic kernel port에 슬쩍 섞지 않음. 쓰기/승인/감사는 후속 ADR 및 API 권한 경계 확정 후.

### 서버 쿼리 유의사항

- Parser Postgres 원본 직접 join 금지: read-only 호환 view/mart/service 어댑터를 통해 관찰 이벤트를 normalize.
- 액티브 replay 이벤트의 시간 범위·row cap/continuation; 무제한 full-day/full-site event fetch 금지.
- 권한/Scope/time-domain 검증은 서버에서, 클라이언트 탭 숨기기로 대체하지 않음.
- 원천 logic 변경/재처리로 과거 timeline이 바뀔 때 `dataGeneration`과 `parserContractVersion`을 비교하여 결과 폐기·재조회. 늦은 데이터(새 segment)는 `watermark` 증가로만 반영.
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
- https://github.com/hjung3113/analytics-platform/blob/main/menus/analytics/equipment/src/index.ts
- https://github.com/hjung3113/analytics-platform/blob/main/menus/analytics/analytics/src/endpoints.ts
- https://github.com/hjung3113/analytics-platform/blob/main/docs/01_architecture_and_data_contract.md
- https://github.com/hjung3113/analytics-platform/blob/main/DESIGN.md