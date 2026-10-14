# Replay Contract v0.4 — 로그 기반 설명 가능한 시각 재생

용어는 [`CONTEXT.md`](../CONTEXT.md), 근거 결정은 [ADR-0002](adr/0002-occurrence-input-contract.md)·[ADR-0003](adr/0003-facet-evidence-levels.md).

## 기본 정의

**Replay**는 원천이 확정한 Occurrence의 시각화이지 물리 시뮬레이션이 아니다. '움직임'과 '실제 위치'를 구분하고, 증거가 없을 때 예시 동작을 사실처럼 보여주지 않는다.

## 파이프라인

```text
EventLog (equipment vendor source)
  ↓ Converter/Parser (원천: Start/End 매칭, carryover, DataQuality — 이 저장소 밖)
Completed Results + Data Quality Issues (+ 열린 Occurrence view, 요청 중)
  ↓ 원천 adapter (플랫폼 서버 read view `equipment.topview.events` — 이 저장소 밖)
Occurrence[] + DataQualityIssue[]           ← 이 저장소의 입력 계약
  ↓ Binding 해석 (Mapping Version: alias → Component / Holding Site)
  ↓ Deterministic reducer (Record Sequence 순, Ruleset Version)
SceneState(t) (Material Location, Module Activity, facet별 Evidence Level, 마커)
  ↓ SVG Overlay + Timeline/Event List/Drill-through
```

### Occurrence / SceneState / Render Transition

- **Occurrence:** 원천이 짝지어 확정한 실행·이송·체류 구간. 원천 occurrence anchor, 경계별 Record Sequence, 원래 timestamp, 원천 provenance를 보존한다. 끝이 없으면 열린 Occurrence(`end=null`).
- **Data Quality Issue:** 원천이 정상 Occurrence로 확정하지 못한 근거 결함. 상태를 바꾸지 않고 타임라인에 `unknown` 마커로 표시.
- **SceneState:** 특정 시점의 객체별 상태. Material별 Location과 identity, Component별 Module Activity, 각 facet의 Evidence Level, 근거 Occurrence 참조.
- **Render Transition:** 화면에만 필요한 움직임(`illustrative`). 두 관측 경계 사이에 그리는 이동 궤적은 **동작 경로가 실측되었다는 뜻이 아님**.

Core는 Start/End 점 이벤트를 짝짓지 않는다. Start/End만 주는 원천은 그 원천의 adapter가 짝지어 Occurrence로 넘긴다.

## Evidence Level — facet별 4수준

| 수준 | 예 | 기본 표시 |
|---|---|---|
| `observed` | 정상 매칭된 Put End로 시작한 Visit의 location | 사실 상태 강조, Occurrence row / 원천 링크 |
| `derived` | fallback 경계, 강제 종료(`Forced*`), synthetic relocation, Inferred wafer, Handler 위 이송 중 위치 | 규칙·Ruleset Version 표시, 근거 클릭 가능 |
| `illustrative` | 이전 위치에서 다음 위치로 SVG 점 이동 보간 | 기본 Off, 켜면 '예시 이동' 배지 |
| `unknown` | 미매핑 alias, Data Quality Issue, Time Anomaly, Watermark 이후, Binding 경계 직후 | 원래 값을 대체하지 않고 미확인 표시 |

`observed`는 해당 vendor 로그의 사실에 대한 해석 결과라는 뜻이지, 장비 센서 수준의 실제 위치 검증을 뜻하지 않는다.

### context_recognized_parser 필드 대응 (원천 adapter 기준)

| 원천 근거 | facet | Evidence |
|---|---|---|
| `*_time_exact=true`, `EndReason=Normal` | 해당 경계 | observed |
| `*_time_exact=false`(fallback), `EndReason=Forced*` | 해당 경계만 | derived |
| `xfr.is_synthetic=true` (relocation) | location, 경계 | derived |
| Wafer Start/End 직접 Resolved | material identity | observed |
| Wafer Inferred로 Resolved | material identity | derived |
| `WaferResolutionState = Empty / Unknown` | material identity | unknown (점유 facet은 별도 판정) |
| `data_quality_issue` row | — | 상태 불변, 타임라인 unknown 마커 |

## 타임라인 규칙

- **순서:** 상태 적용 순서는 원천의 Record Sequence 하나뿐이다. timestamp는 화면 위치를 정하는 값이지 순서 근거가 아니다.
- **Seek(t):** timestamp ≤ t인 **가장 긴 Record Sequence prefix**를 적용한 상태. sequence와 timestamp가 어긋난 경계(예: `EndBeforeStart`)는 Time Anomaly로 표시하고 그 구간의 영향 객체는 `unknown`. 디버그용 "sequence 단위 step" 탐색 제공.
- **시각:** 모든 시각은 Site Wall-clock(`"YYYY-MM-DDTHH:mm:ss.fff"` naive 문자열 + `timeDomain` id). `Date`·로컬 timezone·UTC 변환 금지; 비교는 문자열 또는 timezone 없는 정수 값으로.
- **구간:** Occurrence 구간은 `[start, end)`; 열린 Occurrence는 `end = null`.
- **조회:** 재생 구간과 **겹치는** Occurrence를 조회한다(구간 안에서 시작한 것만이 아님). 따라서 중간 진입 시 이미 진행 중이던 체류·실행이 snapshot 없이 복원된다. 완료 Result만 있는 원천에서 Watermark 이후 진행 중인 것은 보이지 않으므로 그 구간은 근거 부재로 표시.
- **동일 timestamp:** Record Sequence가 있으면 그 순서. 같은 Holding Site를 동시에 점유하는 충돌은 validation issue로 표시.
- **이어지는 상태:** 관측된 상태는 다음 근거까지 원래 등급을 유지하되 `lastObservedAt`을 보존하고, Watermark상 근거가 끊긴 구간에서는 `unknown`으로 강등.
- **Binding 경계:** 재생 구간이 Binding 유효기간 경계를 넘으면 segment로 나누고 경계 마커를 표시. 경계 이후 Material Location은 `unknown`으로 초기화하며 옛 이력을 새 레이아웃에 끼워 맞추지 않는다.
- **결정론:** `Replay Key = (Layout Revision, Mapping Version, Ruleset Version, Data Generation, 관측 집합 해시, t)`가 같으면 같은 SceneState. 브라우저 프레임률과 무관.
- **재생 속도:** Pause/speed x0.25, x0.5, x1, x2, x4 는 **화면 시간** 변화. 예시 모션은 이벤트가 겹칠 때 drawing order만 다르고 source 순서를 재배열하지 않음.
- **이동 표시:** 원천 시각 근거가 없다면 이동은 **discrete jump** 또는 `unknown`. '동작 중' 블레이드 실루엣을 임의 회전시키지 않음.
- **이송 중:** Get 종료와 Put 종료 사이 Material의 Location은 Handler Component(`derived`). Holding Site는 Mapping이 arm slot을 해석할 때만.
- **Module Activity:** 열린 Occurrence에서만 계산(`processing | post-processing | function | no recorded activity`). 기록 부재를 `idle`로 표시하지 않음. 하위 step·recipe는 inspector/event list에만.
- **Material 묶음:** Batch/FOUP/Boat는 Wafer와 별도 Material. 식별된 Wafer 목록이 없으면 집합 객체로만 표시(wafer n개 임의 생성 금지).
- **Late data:** 원천 MVP는 insert-only이므로 늦은 데이터는 새 segment로 Watermark가 늘어나는 것이다. 원천 logic version 변경·재처리 시에만 Data Generation이 올라가며, 이때 캐시된 SceneState를 폐기.

## 3개 대표 Replay 시나리오

### A. Cluster
- `Carrier load (LP1)` → `EFEM get/put` → `LL` → `VTM handoff` → `PM process` → `return`.
- 실제로 Occurrence가 있는 구간만 강조.
- LL 대기와 Pump sequence의 관찰 부재를 임의 sequence로 메우지 않음.

### B. Wet linear
- `LP input` → `rail robot transfer to Wet Cell A` → `spin rinse` → `dry cell` → `output`.
- Rail 위치는 센서/로그가 없으면 출발/도착 표기만. 물리 수치·속도 미표시.

### C. Lithography dual-stage
- `wafer table A align` / `wafer table B expose` → `stage exchange` → reverse.
- ASML 공식 설명에 따른 **행동 유형** 예시. 모션 가속도/정밀 위치 경로는 표시하지 않음.

### 이후 시나리오
- `BoatLoad → BatchProcessing → BoatUnload`, multi-wafer module slot, multi-finger robot independent streams, aligner/reticle handler 별도 state.

## 데이터 계약 — 타입 초안

```ts
type SiteWallClock = string; // "YYYY-MM-DDTHH:mm:ss.fff", timezone 없음. Date 변환 금지.

type EvidenceLevel = 'observed' | 'derived' | 'illustrative' | 'unknown';

type Boundary = {
  at: SiteWallClock | null;     // 시각 파싱 실패 시 null
  seq: number;                  // 원천 Record Sequence
  evidence: EvidenceLevel;      // exact/normal → observed, fallback/forced → derived
  reason?: string;              // 원천 EndReason 등 (Forced* 구분)
};

type Occurrence = {
  id: string;                   // 원천 occurrence anchor 기반, 안정적
  equipmentId: string;
  kind: 'VISIT' | 'TRANSFER' | 'PROCESS' | 'POST_PROCESS' | 'FUNCTION' | 'CARRIER_PRESENCE';
  start: Boundary;
  end: Boundary | null;         // null = 열린 Occurrence
  location?: { moduleAlias: string; slotAlias?: string };
  from?: { moduleAlias: string; slotAlias?: string };
  to?: { moduleAlias: string; slotAlias?: string };
  material?: {
    kind: 'wafer' | 'carrier' | 'batch' | 'boat' | 'reticle';
    id: string | null;
    identityEvidence: EvidenceLevel;
    lotId?: string; jobId?: string;
  };
  synthetic: boolean;           // 원천이 행 전체를 생성(relocation 등)
  source: { parserContractVersion: string; dataGeneration: string; recordRef?: string };
};

type DataQualityIssue = {
  id: string;
  equipmentId: string;
  issueType: string;            // 원천 issue_type 그대로
  seq: number;
  at: SiteWallClock | null;
  relatedOccurrenceId?: string;
};

type OccurrenceBatch = {
  equipmentId: string;
  from: SiteWallClock; to: SiteWallClock; timeDomain: string;
  watermark: { seq: number; at: SiteWallClock };
  parserContractVersion: string; dataGeneration: string;
  occurrences: Occurrence[];   // [from, to)와 겹치는 것
  issues: DataQualityIssue[];
  continuationToken?: string;
};
```

이 필드는 원천 DB 스키마가 아니라 **이 저장소 입력 DTO 후보**이다. alias → Component/Holding Site 해석은 Mapping Version이 담당하며 DTO에는 원천 alias를 그대로 둔다.

## 테스트 매트릭스

- 열린 Occurrence(end=null), Watermark 이후 구간, 구간 앞에서 시작한 Occurrence의 중간 진입
- 동일 timestamp 다중 경계, Time Anomaly(EndBeforeStart, sequence/timestamp 역전), 시각 null 경계
- 강제 종료(`Forced*`) 경계, fallback 경계, synthetic relocation transfer
- Data Quality Issue 표시(상태 불변), 미매핑 alias, Binding 경계를 넘는 재생 구간
- Wafer identity Resolved/Inferred/Empty/Unknown, carrier-only Occurrence, Lot 필터
- 두 Handler 동시 점유, 한 Handler 여러 Holding Site, multi-site PM 동시 점유(충돌 오탐 금지), 같은 Holding Site 이중 점유(충돌 검출)
- speed/seek/back/forward 결정론, 임의 t snapshot, sequence step과 seek 일치, background tab throttling
- permission/scope 변경 중 재생, event cap 초과, empty / coverage 없음, Data Generation 변경 시 캐시 폐기

## 데이터 신뢰 표시

Timeline의 Event List 열: `원시 시각 | Record Sequence | Occurrence 종류 | 대상 | facet별 Evidence | Mapping Version | 원본 참조 | Data Quality`. SVG marker hover에서도 근거와 불확실성 확인.

**릴리스 게이트:** 관찰되지 않은 physical motion이 `observed`로 라벨링된 사례가 0건; 근거 없는 표현은 기본 hidden; 동일 Replay Key 100회 seek hash 동일; Data Generation이 바뀐 뒤 stale cache 재사용 0건.
