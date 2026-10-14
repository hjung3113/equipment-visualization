# Replay Contract v0.3 — 로그 기반 설명 가능한 시각 재생

## 기본 정의

**Replay**는 파싱된 이벤트의 시각화이지 물리 시뮬레이션이 아니다. '움직임'과 '실제 위치'를 구분하고, 증거가 없을 때 예시 동작을 사실처럼 보여주지 않는다.

## 파이프라인

```text
EventLog (equipment vendor source)
  ↓ Existing Converter/Parser & Raw Data
Parser-normalized Observations (Adapter: actual schema mapping)
  ↓ Alias Resolver + Evidence/Quality Classification
Semantic Actions (component, wafer/carrier/batch, source/target, interval, provenance)
  ↓ Deterministic Timeline Reducer (time t, source version, layout revision)
SceneState (occupancy, module status, arm/port/stage markers, unknown)
  ↓ SVG Overlay + Timeline/Event List/Drill-through
```

### Observations / SemanticAction의 차이

- Observation: 로그 또는 Raw Data의 사실에 가까운 원본 관찰. 원본 이벤트 참조, 원래 timestamp, parser/ingest revision 보존.
- SemanticAction: `wafer-transfer`, `module-process`, `carrier-arrival`, `stage-position`, `boat-load`, `unknown` 등 UI가 이해하는 표준 이벤트.
- SceneState: 특정 시점의 객체별 상태. `waferId?`, `location`, `processState`, `sourceEvidence`, `confidence`, `lastObservedAt`.
- Render Transition: 화면에만 필요한 움직임. `observed` 사건의 두 시점 사이에 그리는 이동 궤적은 **동작 경로가 실측되었다는 뜻이 아님**.

## 필수 provenance 4수준

| 수준 | 예 | 기본 표시 |
|---|---|---|
| `observed` | 해당 module process started/ended event | 사실 상태 강조, Event row / 원천 링크 |
| `derived` | 매칭된 이동 시작/완료에서 wafer 위치 갱신 | rule 표시, 이력/조건 클릭 가능 |
| `illustrative` | 이전 위치에서 다음 위치로 SVG 점 이동 보간 | 기본 Off, 켜면 '예시 이동' 배지 |
| `unknown` | source/target이 불명확, gap, missing end | 원래 값을 대체하지 않고 미확인 표시 |

`observed`는 해당 vendor 로그의 사실에 대한 해석 결과라는 뜻이지, 장비 센서 수준의 실제 위치 검증을 뜻하지 않는다.

## 타임라인 규칙

- 시간은 원천 기준 `eventTime`, 파서 DB 도착/정정은 `ingestedAt`, 시간축 판정은 `timeDomain`(사이트별 naive wall-clock 계약)으로 분리.
- Event interval은 `[start, end)`; 종료 기록이 없으면 `end = null` (`unknown`/진행 중 구분은 watermark와 parser evidence 기반).
- 동일 timestamp 다중 이벤트: 원본 sequence가 있으면 그것 우선. 없으면 **동시 사건 배치**로 처리하고 '의도된 순서' 추정 금지. 같은 holdingSite를 동시에 점유하는 충돌은 validation issue로 표시.
- 발생 순서가 뒤집힌 late data는 `generation` 변경으로 timeline 재생성. 오래된 캐시를 최신 근거처럼 보여주지 않음.
- 파일 경계 carryover: start-end 매칭 완료 결과는 하나의 logical interval. 누락 중단을 임의 종료시키지 않음.
- 사용자가 재생 구간의 중간에 진입할 때 '초기 상태'를 0/empty로 가정하지 않음. 이전 snapshot + 앞선 이벤트가 검증된 경우만 reconstruct. 아니면 위치 unknown.
- Seek(t) 결정론: `(layoutRevision, eventGeneration, orderedEventSet, t)`가 같으면 같은 SceneState. 브라우저 프레임률과 무관.
- Pause/speed x0.25, x0.5, x1, x2, x4 은 **화면 시간** 변화. 예시 모션은 이벤트가 겹칠 때 UI상의 drawing order만 다르고 source action의 time을 재배열하지 않음.
- 원천 시각 근거가 없다면 이동은 **discrete jump** 또는 `unknown`으로 표시. '동작 중' 블레이드 실루엣을 임의 회전시키지 않음.
- Batch/FOUP/Boat는 Wafer 단위와 별도의 material group. 식별된 Wafer 목록이 없으면 집합 객체로만 표시(wafer n개 임의 생성 금지).

## 3개 대표 Replay 시나리오

### A. Cluster
- `FOUP arrival (LP1)` → `EFEM pickup` → `LL transfer` → `pump` → `VTM handoff` → `PM process` → `return`.
- 실제로 모듈/이송 이벤트가 확인된 구간만 강조.
- LL 대기와 Pump sequence의 관찰 부재를 임의 sequence로 메우지 않음.

### B. Wet linear
- `LP input` → `rail robot transfer to Wet Cell A` → `spin rinse` → `dry cell` → `output`.
- Rail 위치는 센서/로그가 없으면 단순 경로 또는 출발/도착 표기. 물리 수치·속도 미표시.

### C. Lithography dual-stage
- `wafer table A align` / `wafer table B expose` → `stage exchange` → reverse.
- ASML 공식 설명에 따른 **행동 유형** 예시. 모션 가속도/정밀 위치 경로는 표시하지 않음.

### 이후 시나리오
- `BoatLoad → BatchProcessing → BoatUnload`, multi-wafer module slot, multi-finger robot independent streams, aligner/reticle handler 별도 state.

## 데이터 계약 예시 — 타입 초안

```ts
type Observation = {
  id: string;
  equipmentId: string;
  eventTime: string; // platform site wall-clock contract, NOT automatic Date.toISOString()
  endTime?: string | null;
  entity: { kind: 'wafer'|'carrier'|'boat'|'reticle'|'module'|'robot'|'stage'; id?: string };
  eventType: string;
  moduleAlias?: string;
  sourceAlias?: string;
  targetAlias?: string;
  source: { parserRevision: string; dataGeneration: string; originalRecordRef?: string };
};

type SemanticAction = {
  id: string; observedIds: string[]; // 0 allowed only illustrative fixture, not live event
  kind: 'TRANSFER'|'PROCESS'|'ARRIVE'|'DEPART'|'STAGE_SWAP'|'BOAT_LOAD'|'UNKNOWN';
  start: string; end?: string | null;
  componentIds: string[];
  materialRef?: { kind: 'wafer'|'carrier'|'boat'|'reticle'|'batch'; id: string };
  confidence: 'observed'|'derived'|'illustrative'|'unknown';
  quality: { missingStart?: boolean; missingEnd?: boolean; ambiguity?: boolean; stale?: boolean };
};
```

이 필드는 Parser 실제 DB 스키마가 아니라 **Adapter 입력 DTO 후보**이다. 추후 표준 로그 스펙/Raw Data에 없는 필드를 강제하지 말 것.

## 테스트 매트릭스

- out-of-order, duplicate id, same-time independent transitions, same-site contradiction
- missing event before/after window, carryover start→end in next file, late ingestion updates
- alias not mapped, layout changed halfway through replay, source parser revision changed
- two arms concurrently moving, one arm multiple blades, multi-space process stage
- unknown wafer ID, carrier-only event, batch type, stage swap, overlapping process intervals
- speed/seek/back/forward determinism, snapshot at arbitrary t, background tab throttling
- permission/scope change mid replay, event cap exceeded, empty / coverage missing

## 데이터 신뢰 표시

Timeline의 Event List 열: `원시 시각 | 표준 동작 | 대상 | 증거 수준 | Mapper Version | 원본 참조 | 검증 상태`. SVG marker hover에서도 근거와 불확실성 확인.

**릴리스 게이트:** 관찰되지 않은 physical motion이 `observed`로 라벨링된 사례가 0건; provenance 없는 표현은 기본 hidden; 동일 입력 100회 seek hash 동일; 변형된 parser generation에 stale cache 재사용 0건.