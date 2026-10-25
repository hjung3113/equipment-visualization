# analytics-platform 통합안 — 실제 Repository 기준

**검토 대상:** https://github.com/hjung3113/analytics-platform (main, 2026-10-14 조회). 이 저장소의 `packages/platform-adapter`가 호스트 계약 1을 구현했고, 마운트는 analytics-platform의 별도 PR(AP #333/#334)이다.

## 확인된 현재 계약

1. `README.md`: 플랫폼 FE는 `pnpm` workspace, `apps/platform-web`, `packages`, `menus` 구조. 서버는 현재 mock. Parser Postgres를 소비하는 분석 플랫폼.
2. `AGENTS.md`, `docs/integration/platform-packages.md`: `packages/contracts → kernel/ui → components → shell → apps` 의존; 메뉴끼리 import 금지. 플랫폼 핵심 계층에 equipment-specific logic 금지.
3. 도메인 조회는 `defineEndpoint`로 선언한 엔드포인트를 `host.query`로 부른다. 임의 `fetchEquipmentReplay()` 같은 호스트 계약 메서드 추가 금지.
4. `menus/analytics/equipment/src/index.ts`: `equipment-detail`은 `/equipment/:equipmentId` 라우트를 이미 제공, navHidden; `equipment:view` 권한 사용.
5. `menus/analytics/analytics/src/endpoints.ts`: 분석 Context는 시간 apply, occurrence 상세 키는 equipmentId+anchor. `docs/14_drilldown_platform.md`: context link 및 returnTo 패턴.
6. `DESIGN.md`: FeedbackOps 시각 primitive와 플랫폼 extension tokens의 소유권 명확. 별도 로봇용 색상 체계로 교체 금지.
7. `docs/01_architecture_and_data_contract.md`: Parser 원본은 view/mart를 거쳐 API가 소비; late correction/rebuild 및 time-domain 규칙 존재. 조회는 범위/반환량 제한.

## 통합 형태

[ADR-0012](adr/0012-platform-first-sdk-host.md)(ADR-0001 일부 대체): `core`/`renderer`/`editor`/`replay`는 이 저장소의 독립 패키지가 정본이고 플랫폼을 모른다. 기본 호스트는 플랫폼 셸이고, 호스트 → 앱 계약은 플랫폼 SDK(게시된 `@ap/*`, [ADR-0013](adr/0013-platform-sdk-release-tarballs.md))가 소유한다. `packages/platform-adapter`가 그 계약을 구현해 화면을 조립하고, 플랫폼 `menus/analytics/equipment`는 연결만 한다. 모델·reducer·renderer 코드를 플랫폼 안에 다시 만들지 않는다.

- 테마: `--eqv-*` → 플랫폼 토큰 매핑은 `@eqv/ui/theme.css`가 소유하고 어댑터 `styles.css`가 import한다. 호스트 입력(설비·진입 키·시간)은 `host-props.ts`가 읽는다.
- 호스트는 시작 시 `eqvManifest`·엔드포인트를 React 없는 `@eqv/platform-adapter/manifest`에서 등록하고, 화면(`eqvScreens`)은 루트 `@eqv/platform-adapter`에서 lazy `import()`로 불러온다. 루트도 모두 계속 export한다.
- 타 분석 메뉴는 `linkTo`로 **같은 화면으로 이동**하고 렌더러 코드를 import하지 않는다. 현재 `menu-*` 상호 import 금지와 `packages/components` 범용성 원칙을 그대로 지킨다.
- 패키지 소비 방식은 게시된 SDK Release tarball이다(ADR-0013). submodule pin이 아니다.
- 반대 방향(AP가 `@eqv/*`를 소비)도 Release tarball이다([ADR-0014](adr/0014-eqv-release-tarballs.md)). Release `eqv-vX.Y.Z`의 여섯 파일(`eqv-{core,renderer,replay,ui,views,platform-adapter}-X.Y.Z.tgz`)을 모두 호스트의 직접 URL 의존으로 둔다. 패키지 안의 형제 `@eqv/*`는 정확 버전 peer이므로 `overrides`는 필요 없고, `dependencies`로 두면 `blockExoticSubdeps`가 `ERR_PNPM_EXOTIC_SUBDEP`로 막는다. packed manifest의 `@ap/*` peer는 SDK 정확 버전(오늘 `0.12.0`)이고 AP 워크스페이스는 `workspace:*`이므로 `peerDependencyRules.allowedVersions`에 `@eqv/*>@ap/*`를 둔다. CSS 진입은 `@import "tailwindcss"` → `@ap/ui/styles.css` → `@eqv/platform-adapter/styles.css` 순서다.
- 원천 parser Result → Occurrence 변환은 플랫폼 **서버** read view(`eqv.topview-events`)의 책임이다([ADR-0002](adr/0002-occurrence-input-contract.md)). 클라이언트와 이 저장소에는 원천 parser 코드·어휘를 두지 않는다.
- 플랫폼 호스트에는 데이터 가져오기가 없다([ADR-0010](adr/0010-studio-data-import.md)). 설비 식별은 플랫폼 설비 마스터가 소유하고, Occurrence는 `eqv.topview-events`가 준다. 가져오기(Sample Window)는 Studio 전용이다.
- 플랫폼 코드에 설비별 로직을 두지 않는다. 호스트는 어댑터 화면을 마운트할 뿐이다.

## UI / Information Architecture

```text
Analytics Workspace
 └─ 생산성 드릴다운 (equipmentId, anchor, from/to, Lot ...)
       └─ linkTo() → Equipment Detail / Top View
             ├─ Focus (equipmentId + entityType/anchor) — Top View · Gantt · Occurrence 목록, 커서 공유
             ├─ Aggregate (from/to + metric) — Component Metric 인코딩
             ├─ Journey (anchor = wafer를 실은 Occurrence id) — 이산 hop
             └─ ReturnLink ← 원 분석 화면·드릴다운 문맥 복원

Equipment Management
 └─ Equipment Master → Onboarding (Fleet → Inventory → Template → Mapping Board → dry-run → Publish)
       [onboarding:edit-rules / onboarding:publish-mapping / onboarding:edit-global-dictionary]
```

- `EquipmentID`는 목적지 객체 식별자, 사용자 전역 Selection은 필터 집합. 둘을 섞지 않는다.
- 시간 범위는 전역 Context의 `time`을 참조/적용하도록 메뉴별로 선언하고, 재생 커서 `at`는 page-local visualization state (프로젝트 URL codec 원칙 재사용).
- `anchor`는 occurrence 식별에 사용; clock instant와 혼동 금지.
- 상세 열람 권한과 편집/공개 권한은 다르게 한다. 읽기 화면의 권한은 `eqv:view`이고(Candidate), 편집/공개 권한 문자열은 변경 API 설계 때 정책 승인으로 정한다.
- 불완전 데이터면 Canvas에 속이는 state 동작 대신 `DataTrustIndicator`와 이벤트 패널 표시.
- 설비 선택 후 다른 Site 데이터나 다른 EquipmentID 이벤트를 클라이언트에서 섞어 보여주지 않음.

## 선언된 엔드포인트 (`packages/platform-adapter/src/endpoints.ts`, 이름은 Candidate — AP #334 확정 전)

플랫폼 host contract 1의 `defineEndpoint`로 선언한 read 엔드포인트 둘. 두 화면(`eqv:topview`, `eqv:focus`)이 함께 쓰고 `menuId`는 `eqv:focus`. 권한 `eqv:view`(화면 표시용; 서버가 요청마다 재검사), `context: { time: 'apply' }` — `from`/`to`는 호스트가 적용된 Context에서 투영하며 params에 넣지 않는다. 응답 타입은 `@eqv/core` 타입.

- `eqv.topview-context` — params `{ equipmentId }` → `Omit<ReplayInput, 'batch'>` (`layouts`, `layoutRevisions?`, `bindings`, `mappings`): 적용 시간에 유효한 모든 Binding, Mapping Version, draft Layout, Layout Revision (ADR-0011).
- `eqv.topview-events` — params `{ equipmentId, continuationToken? }` → `OccurrenceBatch` (`REPLAY-CONTRACT.md`): `{ equipmentId, from, to, timeDomain, watermark, parserContractVersion, dataGeneration, occurrences, issues, continuationToken? }`. 구간과 **겹치는** source-paired Occurrence를 그대로 반환하며 클라이언트는 Start/End를 짝짓거나 재정렬하지 않는다(ADR-0002). `limits.maxHours: 8`(한 교대; REPLAY-CONTRACT/INTEGRATION에 수치가 없어 정한 값, Focus Gantt 예산이 단일 window batch로 측정됨).
- 두 엔드포인트 공통: `kinds` = `collection`, `processing_delay`, `coverage`, `time_domain`(`mergeTimeDomain: true`) — 창의 완전성(Watermark·늦은 데이터)과 Site 시간축을 알리는 assessment. `requiresScope: false`(설비는 page key `equipment`로 지정 — 모듈 prefix 뒤 `?equipment=<id>`; `eqv:topview`는 prefix 자체(그룹의 primary 화면), `eqv:focus`는 그 하위 `<prefix>/focus`이며 page key `equipment`·`entityType`·`anchor`. AP 레지스트리가 param이 필요한 부모 경로와 primary 없는 그룹을 거부하므로 경로 param을 쓰지 않는다. 화면이 page key를 엔드포인트 params `{ equipmentId }`로 복사하고, 키가 없으면 "설비를 고르세요" 상태를 보인다).
- 호스트의 mock 서버는 `@eqv/platform-adapter/mock-data`(`eqvMockContext`, `eqvMockEvents`, `EQV_MOCK_EQUIPMENT`, `EQV_MOCK_WINDOW`)로 두 엔드포인트에 답한다. `fixtures/cluster-single`에서 생성한 합성 데이터이며(`pnpm --filter @eqv/platform-adapter gen:mock-data`, drift 테스트가 검사), 패키지 루트 export에는 없고 프로덕션 코드가 import하지 않는다. 호스트에는 설비 데이터나 로직을 두지 않는다.
- metrics·inventory 엔드포인트와 변경 API(`saveDraft`/`publish`)는 선언하지 않았다: 첫 범위는 read-only(ADR-0012). 변경 API는 `defineAction`·감사·권한 경계를 갖춘 별도 설계 후속.

### 화면 동작 (`packages/platform-adapter/src/screens/`, 177d)

`eqvScreens`(`topview`, `focus`; 호스트가 `eqv:<id>`로 등록)는 `({ host, params })` 화면이다. 마운트는 AP PR(AP #333/#334)이며 이 저장소에는 아직 없다.

- **입력**: 설비는 `host.page('equipment')`, 진입 키는 `entityType`·`anchor` page key(Top View의 "Focus 열기"는 `entityType: 'occurrence'`와 선택한 Component의 열린 Occurrence id — 선택이 없거나 열린 것이 없으면 커서 시점에 열린 첫 Occurrence id(code unit 순) — 를 `anchor`로 넘긴다), Focus의 적용 재생 구간은 `rangeFrom`·`rangeTo` page key(Site Wall-clock 쌍, 순서가 맞지 않으면 무시; `host.setPage`로 쓴다), 시간은 `host.context()`의 `from`/`to`. 호스트 시각은 초 단위 naive(`YYYY-MM-DDTHH:mm:ss`)라 읽을 때 한 번 `.000`을 붙여 Site Wall-clock으로 만든다. 기본 구간·기본 설비를 채우지 않는다.
- **상태**: `time`이 `unsupported`면 "이 화면에는 시간 구간이 적용되지 않습니다"(쿼리 없음), 설비가 없으면 "설비를 고르세요", `from`/`to`가 없으면 "시간 구간을 고르세요"(둘 다 쿼리 없음).
- **로드**: `host.query`로 `eqv.topview-context`와 `eqv.topview-events`만 호출한다. 이벤트는 `continuationToken`이 없어질 때까지 따라가 한 batch로 합친다(`occurrences`/`issues`는 서버 page 순서 그대로, window 필드는 첫 page 기준이며 다른 page가 다르면 데이터 오류, `watermark`는 `(seq, at)` 최댓값, 토큰 제거). 루프는 서버 `maxHours`, 반복 토큰 거부, 화면 signal 중단으로 끝난다. 새 설비/시간은 이전 로드를 중단하고 늦은 응답을 버린다.
- **검증**: 모든 Mapping Version·Layout Revision을 `verifyBindingContext`(`@eqv/core`; `checkBindingMapping`/`checkBindingLayout`)로 내용 검증한 뒤 `assertReplayInput`. 실패는 부분 replay 없이 오류 상태.
- **outcome**: `ok` → 렌더(이전에 `auth_required`를 세팅했다면 `host.status('ready')`), `empty` → 빈 상태(status 호출 없음), `forbidden` → `host.status('auth_required')`(호스트가 상태를 그림), `error` → 화면 안 danger 상태, `timeout`/`too_large` → 화면 안 warning 상태(`message`와 `host.reportError` id 표시, status 호출 없음). `unavailable`·`identity_mismatch`는 쿼리 outcome으로 세팅하지 않는다.
- **assessment**: `clear`가 아닌 것만 안내로 보이며 `unknown`은 "확인하지 못했습니다 — 이상 없음이 아닙니다"로 `confirmed`와 구분한다.
- **`eqv:focus`**: `FocusView`(Top View · Gantt · Occurrence 목록, 한 커서). `host.detail`이 있으면 선택한 Occurrence의 근거 상세를 `host.detail.show(node, label)`로 보내고(리셋·선택 해제·언마운트 시 `clear`) 인라인 "근거 상세" 탭은 없다. 없으면 인라인 탭. Journey 링크 없음, "Top View로" 버튼.
- **`eqv:topview`**: 적용 구간 끝(`to`)에 유효한 Layout과 그 시점의 `seekSceneState`(근거 라벨은 reducer가 준 그대로), Component 선택 시 id·라벨·역할·활동·활동 근거를 `host.detail.show` 또는 인라인 패널로, "Focus 열기" 버튼.

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