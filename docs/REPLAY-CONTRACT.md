# Replay Contract v0.4 — 로그 기반 설명 가능한 시각 재생

용어는 [`GLOSSARY.md`](../GLOSSARY.md), 근거 결정은 [ADR-0002](adr/0002-occurrence-input-contract.md)·[ADR-0003](adr/0003-facet-evidence-levels.md).

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
- **시각:** 모든 시각은 Site Wall-clock(`"YYYY-MM-DDTHH:mm:ss.fff"` naive 문자열 + `timeDomain` id). `Date`·로컬 timezone·UTC 변환 금지; 비교는 문자열 또는 timezone 없는 정수 값으로. 소수 3자리 고정이며 더 정밀한 원천 시각은 자르지 않고 거부한다([ADR-0009](adr/0009-site-wall-clock-millisecond-precision.md)).
- **구간:** Occurrence 구간은 `[start, end)`; 열린 Occurrence는 `end = null`.
- **조회:** 재생 구간과 **겹치는** Occurrence를 조회한다(구간 안에서 시작한 것만이 아님). 따라서 중간 진입 시 이미 진행 중이던 체류·실행이 snapshot 없이 복원된다. 완료 Result만 있는 원천에서 Watermark 이후 진행 중인 것은 보이지 않으므로 그 구간은 근거 부재로 표시.
- **동일 timestamp:** Record Sequence가 있으면 그 순서. 같은 Holding Site를 동시에 점유하는 충돌은 validation issue로 표시.
- **이어지는 상태:** 관측된 상태는 다음 근거까지 원래 등급을 유지하되 `lastObservedAt`을 보존하고, Watermark상 근거가 끊긴 구간에서는 `unknown`으로 강등.
- **Binding 경계:** 재생 구간이 Binding 유효기간 경계를 넘으면 segment로 나누고 경계 마커를 표시. 경계 이후 Material Location은 `unknown`으로 초기화하며 옛 이력을 새 레이아웃에 끼워 맞추지 않는다.
- **결정론:** `Replay Key = (Layout Revision, Mapping Version, Ruleset Version, Data Generation, 관측 집합 해시, t)`가 같으면 같은 SceneState. 브라우저 프레임률과 무관. 구현된 key는 활성 Binding, Layout Revision 대신 레이아웃 내용 해시(아직 revision 필드 없음), 제공된 Mapping Version의 hash, Watermark를 포함한 전체 batch의 해시를 사용한다.
- **Binding의 `layoutRevision`:** Binding은 선택 필드 `layoutRevision`(`sha256:<hex>`, Publish가 계산한 Layout Revision)을 가질 수 있고 없는 기존 bindings도 유효하다. Replay는 계속 `layoutId`로 Layout을 찾으며, Revision으로 찾는 것은 #53에서 다룬다(ADR-0007).
- **재생 속도:** Pause/speed x0.25, x0.5, x1, x2, x4 는 **화면 시간** 변화. 예시 모션은 이벤트가 겹칠 때 drawing order만 다르고 source 순서를 재배열하지 않음.
- **이동 표시:** 원천 시각 근거가 없다면 이동은 **discrete jump** 또는 `unknown`. '동작 중' 블레이드 실루엣을 임의 회전시키지 않음.
- **이송 중:** Get 종료와 Put 종료 사이 Material의 Location은 Handler Component(`derived`). Holding Site는 Mapping이 arm slot을 해석할 때만.
- **Module Activity:** 열린 Occurrence에서만 계산(`processing | post-processing | function | no recorded activity`). 기록 부재를 `idle`로 표시하지 않음. 하위 step·recipe는 inspector/event list에만.
- **Material 묶음:** Batch/FOUP/Boat는 Wafer와 별도 Material. 식별된 Wafer 목록이 없으면 집합 객체로만 표시(wafer n개 임의 생성 금지).
- **Late data:** 원천 MVP는 insert-only이므로 늦은 데이터는 새 segment로 Watermark가 늘어나는 것이다. 원천 logic version 변경·재처리 시에만 Data Generation이 올라가며, 이때 캐시된 SceneState를 폐기.

### Scene State 계약 (#9b)

`packages/core/src/scene/schema.ts`의 strict `sceneStateSchema`와
`@eqv/core/scene-state.schema.json`이 아래 형식을 정의한다. `seekSceneState`는 시각 prefix, `stepSceneState`는 지정 seq 이하의 모든 record를 적용하고, `replayKey`는 재생 입력을 식별한다. `stepSceneState`의 `t`는 prefix에서 seq 순으로 마지막인 null 아닌 `at`이며, 없으면 `batch.from`이다.
`fixtures/cluster-single/expected-scene-states.json`은 구현과 독립적인 정답이다.
DQI는 타임라인 마커이며 Scene State에 들어가지 않고 상태를 바꾸지 않는다.
Replay 입력은 하나의 설비에 속해야 하며 `bindings.equipmentId`, batch와 모든 Occurrence·DQI record의 `equipmentId`가 다르면 `seekSceneState`·`stepSceneState`·`replayKey`·`replayTimeline`은 상태를 도출하기 전에 `RangeError`를 던진다. 같은 진입점은 다음 batch도 `RangeError`로 거부한다(#42):
- **Record Sequence 중복:** 모든 Occurrence의 `start.seq`·`end.seq`와 모든 DQI `seq`는 batch 안에서 서로 달라야 한다. 같은 seq면 입력 배열 순서가 상태를 정하게 되어 Replay Key 불변식이 깨진다.
- **id 중복:** Occurrence `id`는 batch 안에서 서로 달라야 하고, DQI `id`도 서로 달라야 한다. `replayKey`가 id 순으로 정렬해 관측 집합 해시를 만들므로 같은 id면 입력 배열 순서가 해시를 정한다.
- **미완료 page:** `continuationToken`이 있는 batch. 빠진 page의 record가 facet을 바꿀 수 있으므로(예: 같은 Holding Site의 두 번째 점유) 호출자가 전체 batch를 모은 뒤 replay한다. core는 page를 가져오지 않는다.

```ts
type SceneState = {
  equipmentId: string;
  at: SiteWallClock;
  appliedSeq: number | null;
  binding: { layoutId: string; mappingHash: string } | null;
  materials: SceneMaterial[];
  components: SceneComponent[];
  markers: SceneMarker[];
};
type SceneMaterial = {
  key: string; // `m:<kind>:<id>`, 또는 id=null이면 `o:<occurrenceId>`
  kind: 'wafer' | 'carrier' | 'batch' | 'boat' | 'reticle';
  id: string | null; identityEvidence: 'observed' | 'derived' | 'unknown'; lotId?: string;
  alias: { moduleAlias: string; slotAlias?: string };
  location: { componentId: string; holdingSiteId?: string } | null;
  locationEvidence: 'observed' | 'derived' | 'unknown';
  occurrenceId: string;
  lastObservedAt: SiteWallClock | null; // 배치한 Occurrence의 start.at
};
type SceneComponent = {
  componentId: string;
  activity: 'processing' | 'post-processing' | 'function' | 'no recorded activity';
  activityEvidence: 'observed' | 'derived' | 'unknown';
  occurrenceIds: string[];
};
type SceneMarker =
  | { kind: 'after-watermark'; watermarkAt: SiteWallClock }
  | { kind: 'occupancy-conflict'; componentId: string; holdingSiteId: string; materialKeys: string[] }
  | { kind: 'time-anomaly'; occurrenceId: string }
  | { kind: 'unmapped-alias'; alias: string; occurrenceId: string };
```

`materials`는 `key`, `components`는 `componentId`, `markers`는 `kind` 다음 각 id 필드 순으로
code-unit 정렬한다. 복합 식별자는 occupancy의 `(componentId, holdingSiteId)`,
unmapped의 `(alias, occurrenceId)` 순이며 Time Anomaly는 `occurrenceId`다.
`occurrenceIds`와 `materialKeys`도 code-unit 정렬한다. locale이나 현재 시각에 의존하지 않는다.

1. **Prefix (Seek):** 모든 Occurrence 경계와 모든 DQI를 `seq` 순으로 둔다. null이 아닌 `at`이 모두 `at <= t`(문자열 비교)를 만족하는 가장 긴 prefix를 적용한다. `at: null`은 그 자체로 prefix를 멈추지 않는다. `appliedSeq`는 마지막 적용 seq이며 아무것도 적용하지 않았으면 null이다.
2. **Open과 수명:** start가 prefix 안이고 end가 null이거나 prefix 밖이면 열린 Occurrence다. 배치와 활동은 열린 동안만 존재한다. 적용된 end는 위의 “다음 근거”이며 후속 배치가 없어도 기존 배치를 제거한다. 물질은 Scene State에서 사라지며 위치를 carry-forward하거나 추측하지 않는다.
3. **배치:** 열린 Occurrence에 `material`과 `location`이 모두 있으면 물질을 배치한다. TRANSFER도 자신의 `location`(Handler alias와 arm slot)에 배치한다. `location`이 없으면 배치도 활동도 없고 `from`/`to`나 geometry로 대체하지 않는다. 식별된 물질의 key는 `"m:" + kind + ":" + id`, `id: null`인 익명 물질은 `"o:" + occurrenceId`다. `m:`와 `o:` 접두사는 원천 문자열과 무관하게 충돌하지 않으며 같은 id의 서로 다른 kind도 구분한다. `id`는 원천 값을 보존한다. 같은 material key가 여러 열린 Occurrence에 있으면 `start.seq`가 가장 큰 것이 이긴다. `alias`는 원천 값을 보존한다.
4. **해석과 Binding:** t를 포함하는 Binding을 사용한다. 없으면 `binding: null`, `components: []`이고 배치된 물질은 alias를 보존하며 `location: null`/`unknown`이다. Binding 부재는 미매핑 alias가 아니므로 마커를 만들지 않는다. `start.at < effectiveFrom`인 물질은 이전 segment에서 시작했으므로 `null`/`unknown`으로 초기화한다. `start.at: null`도 현재 segment 시작을 증명하지 못하므로 같다. 나머지는 t에서 `resolveLocation(moduleAlias, slotAlias)`로 해석한다. `location` 결과는 Component와 선택적 Holding Site를 사용하고, `unknown`의 `missing-mapping`은 `null`/`unknown`이며 마커가 없다. 미매핑 alias는 `null`/`unknown`과 `unmapped-alias` 마커를 만든다. `ignored`는 물질과 마커를 모두 생략한다. 옛 이력을 새 segment에 끼워 맞추지 않는다.
5. **Location 근거:** VISIT/PROCESS/POST_PROCESS/FUNCTION/CARRIER_PRESENCE는 기본 `observed`, TRANSFER(Handler 위 물질)와 `synthetic: true`는 `derived`다. Mapping의 `certainty: assumed`는 최대 `derived`로 제한한다. 이어서 규칙 7의 활성 Time Anomaly, 규칙 8의 점유 충돌, 규칙 9의 Watermark 이후는 `unknown`으로 내린다. 순서는 `observed > derived > unknown`이며 적용된 등급 중 가장 낮은 것을 쓴다. fallback/forced 경계 근거는 location 근거를 바꾸지 않는다. `identityEvidence`는 원천 값을 복사하되 `illustrative`는 `unknown`으로 읽는다. 예시 표현은 렌더링 개념이며 Scene State의 근거가 아니다(ADR-0003).
6. **활동:** Binding의 Layout에 있는 모든 Component를 나열한다. 열린 PROCESS/POST_PROCESS/FUNCTION의 `location`이 해석되는 Component에 각각 `processing`/`post-processing`/`function`을 둔다. ignored/unmapped는 활동을 만들지 않는다. 여러 활동이면 가장 큰 `start.seq`가 활동 값을 정하고 모든 열린 활동 id를 `occurrenceIds`에 넣는다. 선택된 Occurrence의 `start.evidence`에서 `illustrative`를 먼저 `unknown`으로 읽은 값을 `activityEvidence`로 사용하되 assumed Mapping은 최대 `derived`, 규칙 7/9 또는 이전 Binding segment에서 시작했으면 `unknown`이다. `start.at: null`인 활동은 prefix로 open을 정하고 현재 Mapping으로 Component를 해석하되 근거는 `unknown`이다. 활동이 없으면 `no recorded activity`/`unknown`/`[]`이며 idle을 추론하지 않는다.
7. **Time Anomaly:** prefix 밖과 ignored alias를 포함한 **모든** null이 아닌 시각 record를 seq 순으로 본다. 연속한 두 record에서 뒤 seq의 시각이 더 이르면 `[뒤.at, 앞.at]`(양 끝 포함)이 anomaly window다. t가 그 안이면 양 record를 소유한 각 Occurrence에 `time-anomaly` 마커를 붙이고 그 배치/활동을 `unknown`으로 둔다. 단, 현재 Mapping에서 `location` alias가 ignored인 소유자의 마커만 제외한다. 이 필터는 window나 다른 소유자의 마커를 지우지 않는다. DQI 자체는 Occurrence 소유자가 아니며 타임라인에만 표시한다.
8. **점유 충돌:** 배치된 물질 둘 이상이 같은 `componentId`와 같은 **정의된** `holdingSiteId`로 해석되면 정렬된 material key 목록을 가진 마커 하나를 만들고 해당 물질의 location 근거를 모두 `unknown`으로 둔다. 참 점유자를 고르지 않는다. 한 Component의 서로 다른 Holding Site는 충돌하지 않으며 Holding Site가 없는 Component 단위 위치도 충돌시키지 않는다.
9. **Watermark:** `t > watermark.at`이면 `after-watermark`를 만들고 모든 물질의 location 근거와 모든 활동 근거를 `unknown`으로 내린다. 값은 보존해 미확인으로 표시한다. identity 근거와 원천 경계 라벨은 바꾸지 않는다(ADR-0003의 facet 독립성).

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
