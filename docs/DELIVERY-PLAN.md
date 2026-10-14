# 구체 실행 계획 (WBS + 의사결정 게이트) v0.4

**순서:** 설계 검증 → Core/Schema → Viewer → Editor → Log Replay → 플랫폼/운영 고도화.

| WBS | 우선 | 산출물 | 필수 전제 | 완료/리뷰 기준 |
|---|---|---|---|---|
| T01 | P0 | 6개 아키타입의 Diagram + `LayoutSchema` 정규화 | 공개 출처·provenance 확정 | Component/Port/Level/Physical/Capability 그래프 빠짐 없음 |
| T02 | P0 | AssetCatalog (일반화 primitive/assembly variant) | T01 | 타입 중복/속성 변경 모델 정의, vendor clone 금지 |
| T03 | P0 | Occurrence 입력 계약 + synthetic fixture (ADR-0002) | context_recognized_parser Result 구조 기준 | 열린 Occurrence·DataQuality·facet evidence 테스트 |
| T04 | P0 | Occurrence → SceneState 결정론적 reducer | T03 | seek/tie/Time Anomaly/Watermark/Binding 경계/dup/conflict fixture 테스트 |
| T05 | P1 | SVG Viewer + interactive selection + level toggles | T01/T02 | JSON→SVG 일치, theme, keyboard/zoom/port selection |
| T06 | P1 | Layout Editor 기본(move/rotate/snap/port/groups) | T05 | undo/redo, publish revision rollback, key transform 불변 |
| T07 | P1 | Replay MVP (cluster + wet + dual-stage) | T04/T05 | 실제 경로와 illustrative 경로가 명확히 구분됨 |
| T08 | P1 | 플랫폼 equipment detail + analytics deep link | T05/T07 | 기존 Scope/권한/Context/returnTo + 기존 회귀검사 통과 |
| T09 | P2 | Multi-level Track / Furnace/Boat playback | T07/T08 | level+batch 상태 모델 증거 연결 |
| T10 | P2 | Reference→Semantic TopView Skill + 팀 QA workflow | T01/T05/T06 | 매 신규 장비의 도형 재사용·불확실성·라이선스 보고 |

## 설계 승인 전 체크리스트

- [ ] 사용자 정의 `대표 장비`는 **구조형 템플릿**이라는 점에 동의; 제조사 실물 도면과 동일하다는 주장은 금지.
- [x] `EquipmentID`에 배정할 LayoutRevision의 유효기간: Binding `(equipmentId, Layout Revision, Mapping Version, effectiveFrom, effectiveTo?)` (DESIGN-v0.4 §3).
- [x] Parser가 `DateTime + ModuleId/SlotNo + EventId/Status`를 제공하고 Start/End 매칭·DataQuality까지 수행함을 확인 (context_recognized_parser docs/22, ADR-0002).
- [x] 이송 source/target: XFR의 From/To Module·Slot으로 식별 가능. 이송 중 위치는 Handler(`derived`). 남은 것: 열린 Occurrence read view 요청.
- [ ] default UI는 관찰된 상태(실측 가속도/경로 아님)만 표시. illustrative animation은 옵션.
- [ ] 사용자 역할: Viewer, Layout Editor, Publisher, Debug/RawSource viewer의 분리.
- [x] 독립 패키지 정본 + 플랫폼 얇은 소비자 (ADR-0001).

## Log Fidelity 지원 계층 — 입력 가용성에 따라 기능을 다르게

| 데이터 수준 | 필요한 로그 예 | 제공 가능한 출력 | 금지할 출력 |
|---|---|---|---|
| F0 | Module process Start/End | Chamber highlight, dwell/process interval | Robot/wafer 이동 추정 |
| F1 | Source/Destination transfer 완료 | Wafer의 위치 점프, 시간순 이송 연결 | 실측 이동 궤적/속도 |
| F2 | Transfer Start/End + Robot/Blade identity | 예시 경로 애니메이션(명시적 illustrative), Blade별 occupancy | 실제 조인트 각도라고 표시 |
| F3 | Pose/axis encoder logs | 자세/연속 위치 시각화 후보 | 센서 정확도 검증 없이 물리 일치 보증 |

F0도 유의미한 Replay MVP. 데이터가 부족하다고 F2 동작을 AI로 꾸며내지 않는다. 원천 PRC 계층(L1–L4)과 혼동하지 않도록 Fidelity Tier는 `F`로 표기한다.

## 화면 디자인 (기존 플랫폼 UI 계약 준수)

**Equipment Detail**: `Overview | Top View | Replay | Events` (최종 IA는 사용자 검토로 확정)

- Viewer: 좌측 또는 전체폭 SVG, 선택된 Component → Right Detail Slot, 상태색/이름/불확실성.
- Replay: 상단 동일 SVG, 하단 시간 Timeline(Play/Pause/Seek/Speed) + Event Grid(기간·도메인/alias/evidence), 클릭 시 두 화면 동기화.
- Editor(별도 권한): Left Symbol Catalog, center SVG canvas, right Properties/Port/Level/Binding, top publish/change preview.
- 분석 메뉴 → Top View: Equipment + selected time range/anchor를 URL 계약으로 전달해 열고 `ReturnLink`로 원 분석 드릴다운 복원.

## 데이터 소스/리비전 정책

- Published Layout(설비가 해당 시기에 쓰던 구조) 및 Parser Generation(관찰 버전)을 ReplaySession에 pin.
- Layout revision이 바뀌어 Alias 매핑이 불가능해지면 옛 이력은 최신 레이아웃에 임의로 끼워 맞추지 않는다.
- UI query result는 `equipmentId`, `layoutRevision`, `dataGeneration`, `timeDomain`, `scope`가 맞을 때만 scene에 적용.
- 서버에서 Range/row cap + pagination/streaming 허용 여부를 먼저 정하고 대량 이벤트는 비동기/snapshot 방식으로 탐색.

## 수용 테스트 예시

1. Cluster: EFEM/LL boundary 검증; 두 Arm에 서로 다른 Wafer가 실릴 때 시각 객체 분리.
2. Multi-space PM: 동일 PM 내부 holdingSite 두 개에 다른 Wafer가 동시에 있어도 모듈 collision 오탐 금지.
3. Track: 같은 X/Y에 겹친 서로 다른 Level의 component를 개별 선택 가능.
4. Dual-stage: 서로 다른 두 Stage에서 측정/노광이 겹칠 때 시간축상 병렬 상태 유지.
5. Furnace: `boat` 단위 batch 입출고를 `wafer 1개 transfer`로 강제하지 않음.
6. 열린 Occurrence: end가 없으면 arbitrary end 생성하지 않음. 원천이 다음 파일에서 완료하면 같은 Occurrence id로 닫힌 구간이 들어온다(carryover는 원천 책임).
7. Unmapped Alias: unknown event list에 남고 SVG에서 근거 없는 이동 없음.
8. Permission/site 변경: 이전 장비 상태 즉시 무효화, 잘못된 Site event 혼합 금지.
9. Binding 경계: 재생 구간이 Layout Revision 교체를 넘으면 segment 분할, 경계 이후 Location `unknown`.

## 다음 Sprint에 권장하는 작업 묶음

- **Design PR:** 본 문서/스키마/6종 개념 템플릿 리뷰, repo ADR 승인.
- **Core PR:** normalize + reducer(클러스터 synthetic fixture)만 구현, UI 없음.
- **Viewer PR:** Equipment Detail 탭 / selection / layer toggles / mock.
- **Replay PR:** 타임라인/근거 패널 + read endpoint. 이때야 사용자용 간단 애니메이션 도입.

`docs/RESEARCH.md`, `docs/REPLAY-CONTRACT.md`, `docs/INTEGRATION.md`, `docs/adr/`를 이슈의 참조 문서로 사용.