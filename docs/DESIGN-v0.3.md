# Equipment Visualization Framework — 설계 초안 v0.3

**상태:** Proposed — ADR 승인·실제 데이터 계약 확인 전 구현 금지. 2026-10-14.

## 1. 제품 목표 / 비목표

목표:
- 반도체 장비(Etch/Deposition/Clean/Photo Track/Lithography/Furnace 등)를 같은 시각 언어로 표현.
- 물리 위치/접점/접근 가능한 이송 경로와 시각 장식의 명확한 분리.
- 제조사 전체 SVG 복제 대신 구조 아키타입과 파라미터형 Assembly를 재사용.
- 설비관리·분석 화면에서 선택, 상태 강조, 시점 이동, 로그 이벤트의 가시화.
- 로그를 읽은 사람이 '어느 모듈에서 언제 무엇이 있었는지'를 역추적하도록 원문 근거를 제공.

비목표 (MVP):
- 실제 엔코더 위치, 로봇 기구학 보증, 충돌 판정, 공정 물리, 정확한 제조사 실측 형상.
- 파서 이벤트가 없는 상태/웨이퍼 이동을 AI로 생성한 것처럼 표시.
- 모든 설비를 범용 단일 토폴로지로 강제하거나 3D CAD 편집을 지원.
- 로그를 명령처럼 해석해 설비에 쓰기/제어하는 기능.

## 2. 리뷰에 따른 중요한 변경

1. 기존 v0.1의 `robot-dual-arm.svg` 고정 도형은 '동작 가능한 dual arm'이 아님. Arm, Blade, HoldingSite, Joint, Axis, Reachability는 서로 독립 객체/속성.
2. `chamber=single-wafer` 가정 금지. 한 Process Module에 여러 Stage/Slot/Station 가능.
3. Robot 중심 모델만으로는 ASML Stage 교환, ASM Dual-Boat, Track Stacked, Wet Rail 설명 불가.
4. `physical interface / transfer capability / operation route`의 별도 그래프 필요.
5. 실제 설비 사진은 '참고 증거'이고 자동 벡터 결과는 초안. 가려진 객체나 모르는 축은 `unknown`.
6. 앱 플랫폼 `DESIGN.md`와 충돌하므로 v0.1의 단독 팔레트는 기본값이 될 수 없음. SVG는 플랫폼 CSS semantic tokens를 소비하고 내보내기용 fallback만 보유.
7. `SVG↔draw.io` 완전 라운드트립을 계약에 넣지 않는다. Layout JSON이 원본; SVG와 draw.io는 파생물.

## 3. 도메인 모델

```text
Catalog
 ├─ PartDefinition (body, link, joint, wrist, endEffector, stage, boat, sensor ...) 
 ├─ AssemblyTemplate (robot, EFEM, TM, chamber, furnace, scanner, track section ...)
 ├─ InterfaceDefinition (port, gate, pass-through, stage-landing, service ...)
 └─ StyleToken / RenderRecipe / Evidence

EquipmentLayout (equipmentModel + revision + published state)
 ├─ ComponentInstance[]
 │   ├─ stable instanceId, type, templateRef, overrides
 │   ├─ parentId / localTransform(x,y,rotation,scale) / levelId
 │   ├─ ports[] / sites[] / children[]
 │   └─ sourceEvidence / confidence / verifiedProperties
 ├─ PhysicalInterfaceEdge[]
 ├─ TransferCapabilityEdge[]
 ├─ OptionalRouteDefinition[]
 ├─ ViewDefinition[] (top / side / per-level / schematic inset)
 └─ MappingDefinition (Parser aliases → component/holdingSite identity)

Runtime: Observation[] → SemanticAction[] → TimeState → SVG overlay
```

### 반드시 구분할 독립 차원

- Component(Chamber) / Station(내부 물리 위치) / Holding Site(웨이퍼 놓이는 자리) / Robot Arm / End Effector.
- Transfer **물리 접점** vs Transfer **가능성** vs 과거 로그상 **실제 이송**.
- 인스턴스 `EquipmentID`와 Template Model(일대다). 별개 설비에 같은 템플릿을 바인딩하되 바인딩 alias는 설비별 버전 관리.
- X,Y 좌표와 실제mm: 별도 `unit: abstract` / `mm` 필드. 도면에서 치수 정보가 없는 경우 abstract를 mm로 승격 금지.
- Topology `floor level` / `module layer` / `hidden z-order`: Multi-stack일 때 Top View에서 선택적 레이어 표시.
- `LogSource`의 raw/standard/parsed event / Derived action / visual illustration를 별도 증거 등급으로 유지.

### RobotSpec v0.3

`environment`, `mechanism`, `arms[]`, `endEffectors[]`, `holdingSites[]`, `axes[]`, `mounting`, `independence`, `poseMode`, `zLevels`, `reachability`.

- `armCount != bladeCount != holdingSiteCount`.
- 최소 MVP render는 `base + arm assembly + holding site`까지만. Forward Kinematics는 미래 확장/검증 자료 확보 후.
- 듀얼 Arm 간 동작 독립성이 미확인이면 `unknown`; 시각 예시에서 임의 독립 모션 금지.

## 4. 구조 아키타입 — 초기 8개 목표

| 순서 | ID | 대표 장비 유형(회사/계열은 출처 참고) | 특이 요구사항 | 선제 제작 |
|---|---|---|---|---|
| P0 | `cluster-single` | AMAT Centura / Lam cluster type | vacuum boundary, loadlock, central TM, single arm | 구조 SVG v0.3 |
| P0 | `cluster-dual-hub` | AMAT Endura, 복합 cluster type | multiple TM, dual hub, arm overlap | 구조 SVG v0.3 |
| P0 | `wet-linear` | SEMES single-wafer wet clean type | rail robot, serial cell, dryer | 구조 SVG v0.3 |
| P0 | `track-stacked` | TEL LITHIUS / SEMES photo track type | multi-level, repeated coat/dev/bake | 구조 SVG v0.3 |
| P1 | `lithography-dual-stage` | ASML TWINSCAN type | stage exchange, reticle/wafer systems | 구조 SVG v0.3 |
| P1 | `vertical-batch-furnace` | ASM SONORA/A400 type | dual-reactor, boat, stocker, batches | 구조 SVG v0.3 |
| P2 | `wet-batch-bench` | immersion / batch wet-bench type | tank train, cassettes, batch transfer | 설계만 |
| P2 | `inspection-inline` | in-line inspection / test / sorter type | conveyor, detector, gantry, inspection stations | 설계만 |

**주의:** 위 모든 SVG는 실제 제조사의 특정 모델과 1:1로 일치하지 않는다. 퍼블릭 문서에서 확인되는 기능/구조 축만 참고한 **원천별 provenance가 있는 generic archetype**이다.

## 5. 재사용 자산 후보 (35+ 파라미터 조합)

- Housing: body shell, radial TM(N=4/5/6/8), rectangular TM, transfer corridor, service zone, maintenance door.
- Handling: single SCARA, independent dual SCARA, vacuum radial, boomerang, multi-finger, gantry, linear rail, base, joint, link, wrist, end effector, holding site.
- Interface: FOUP/LoadPort, load lock, gate valve, slit, docking port, aligner, buffer, cassette rack, sensor.
- Process: round/rectangular PM, multi-station PM, wet spin cell, dry cell, immersion tank, coat spinner, developer, hot/cool plate.
- Lithography: wafer stage, reticle stage, measurement position, exposure position, wafer/reticle handler, optics placeholder.
- Batch: furnace reactor, boat, loader, elevator, stocker, carousel, dual reactor bridge.
- Overlay: wafer marker, carrier marker, batch marker, active zone, uncertain/unknown overlay, observed/derived/illustrative marker.

`assetId`는 도형 타입을 뜻하고 `instanceId`는 레이아웃 내 유일한 객체. 같은 도형은 다른 위치·라벨·접근 조건으로 반복 사용 가능.

## 6. SVG 편집/렌더링 원칙

- `SVG Native DOM` 우선: 개별 `<g id="cmp-..." data-component-id="...">` 그룹과 역할별 stroke/fill.
- ViewBox는 기하 좌표를 관리, 전체 Zoom/Pan은 UI 상태. 로봇 모션 상태는 SVG 원본을 직접 변경하지 않고 runtime transform overlay에서 합성.
- 1차 편집: move/resize/rotate, group hierarchy, port snapping, arrow routing, undo/redo, level selector, ID/property panel, color token override.
- 2차 편집: custom path editing, reference-image overlay alignment, layer-specific editing.
- Custom SVG 수용 시 스크립트/외부 href/event-handler/foreignObject/remote CSS 차단; 선언적 허용 요소만 통과.
- Style tokens: `DESIGN.md`와 `@ap/ui` 토큰 사용. exported SVG는 fallback color를 지정하되 자체 앱 테마가 우선.
- 이동 경로의 수작업 자유 그림보다 `port-to-port` connector/waypoint를 우선. 물리 연결은 선 하나의 픽셀 근접만으로 판정 불가.

## 7. Replay 기능 분리

- `Observed`: 로그로 직접 확인된 이벤트·상태, 시간·대상 근거 있음.
- `Derived`: 확인된 이벤트로 계산한 위치/순서/구간. 규칙과 parser/schema revision 기록.
- `Illustrative`: 화면 이해를 돕기 위한 animation interpolation(실측 궤적 아님); 기본 끔, 토글로 노출 및 명시적 라벨.
- `Unknown`: 로그 누락/미매핑/복수 해석. 임의 이동 생성 금지.

Replay는 synthetic animation engine이 아니라 `ActionTimeline`으로 특정 시점의 `SceneState`를 결정론적으로 만드는 실행기. Seek, reverse/forward, 속도 조절은 시간을 이동할 뿐 관측되지 않은 사건을 만들지 않음. 상세: `REPLAY-CONTRACT.md`.

## 8. 설계/구현 우선순위

### Phase 0 — 설계 계약 및 공개 레퍼런스 검증 (현재)
- 기존 v0.1 P0 5건 + P1 6건 구조 결함을 기준으로 schema/role/coordinate/mapping/layer/provenance를 확정.
- 6개 generic archetype + 최소 15개 핵심 primitive 품질 검토; 위상·연결·레이어 모델 검증.
- Parser의 실제 정규화 Raw Data 항목 존재 여부는 사내에서 추후 연계 단계 확인. 공개 샘플/fixture로 계약 선제 검증.
- **출구 조건:** 데이터 스키마/누락 처리 기준/로그 타임라인의 근거 레벨 결정, ADR 초안 리뷰 완료.

### Phase 1 — 정규 모델/상태 코어 (우선)
- `Layout/Topology/Mapping/Site` versioned schema, topology QA, deterministic replay state reducer, representative fixture.
- 클라이언트 렌더링 로직보다 모델/semantic 검증을 먼저 안정화.
- **출구 조건:** 6개 유형 JSON 로딩, disconnected port / duplicate wafer occupancy / missing mapping 검출.

### Phase 2 — SVG Viewer 및 기본 편집
- React SVG viewer, selection/highlight, pan/zoom, drag component, snap, layers, export; light/dark, virtual scale.
- layout revision publish, rollback, diff, evidence record 및 승인 UX.
- **출구 조건:** round-trip(JSON→SVG→편집→JSON→SVG) 좌표/ID 보존. 임의 SVG 역분해는 제외.

### Phase 3 — 로그 기반 Replay MVP
- 3개 대표 흐름: `FOUP→LL→TM→PM`, `rail robot→wet cell→dryer`, `dual stage align↔expose`.
- event-to-action adapter + provenance 표시 + timeline seek, batch event 지원.
- **출구 조건:** start/end 결손·동일 타임스탬프·late corrections·out-of-order·동시 Arm 상태 테스트, 근거 없는 추측 0건.

### Phase 4 — 분석 플랫폼 통합/확대
- `equipment-detail` 내 Viewer, `analytics`에서 Equipment+time/anchor deeplink, menu endpoint, mock/server conformance.
- Phase 3 검증 후 다른 설비 아키타입 replay와 성능/권한/운영 안정화.
- **출구 조건:** deep link/scope/permissions/time-domain consistency regression, 계측과 오류 관찰성 확인.

## 9. 최소 성공 지표 / 검증

1. 도형 재사용: 새 모델에서 신규 primitive 비중 추적(품질을 희생해 0%를 강제하지 않음).
2. 표현 검증: Component/Port/Connections/Level의 식별 정확도, 참조그림에서 확인되지 않은 요소 `unknown` 처리율.
3. Replay 품질: 모든 시각 동작이 provenance로 역추적, 모호한 타임라인에 'unknown' 표시, 동일 fixture 재생 상태 해시 결정성.
4. 운영 품질: 범위 초과 재생 거절, permission/scope, SVG sanitizer, 접근성, 레이아웃 동시 수정 충돌.
5. 사용자 효용: 특정 Chamber에 문제가 생긴 순간으로 2~3번 내 Drill-through, 시간 슬라이더-테이블 동기화.

## 10. 확정 필요 ADR

- ADR-T01: Authoritative model은 versioned semantic JSON; SVG/draw.io는 파생물.
- ADR-T02: `physical/transfer/operation` 3 graph와 stable ID/port ID.
- ADR-T03: Viewer/Editor/Replay API 분리 + renderer 기술 선택 PoC.
- ADR-T04: Data evidence policy observed/derived/illustrative/unknown.
- ADR-T05: 기존 플랫폼 패키지 경계 안의 위치와 메뉴간 데이터 전달 계약.
- ADR-T06: 사진/공개 레퍼런스 저작권·사내 이미지 취급/에셋 provenance.

## 11. 설계상 남겨둔 Open

- 실제 Parser에서 Wafer/Robot/Module transfer의 관찰 가능 이벤트 필드 수준(별도 사용자 데이터 공개 불필요; 사내 담당자가 스키마 어댑터 구현 가능).
- 문서 수준에서 라우트 파라미터 `at`와 `anchor`의 경계/URL codec (기존 router 규칙 준수).
- 자산/레이아웃의 플랫폼 메타 DB 소유권, 소규모 팀 동시 편집 전략, 모델별 Custom Template의 승인 정책.
- 실시간 애니메이션(미결정; 로그 리플레이와는 다른 제품 요구). 기존 플랫폼의 5분 polling을 재생 clock으로 오해하지 않음.