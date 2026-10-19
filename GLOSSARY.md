# Equipment Visualization

반도체 설비의 의미 기반 Top View와, 로그 근거를 잃지 않는 설명 가능한 Replay를 위한 도메인 언어.

## Layout (구조)

**Component**:
레이아웃 안의 물리 객체 인스턴스(Chamber, TM, LoadPort, Robot, 그리고 PM 내부 station 등). 하위 Component를 가질 수 있다.
_Avoid_: Station(별도 타입으로 쓰지 않음 — station은 하위 Component다), Module(로그 용어; Mapping으로만 연결)

**Holding Site**:
물질(wafer/carrier/batch)이 놓일 수 있는 이산 자리. 로봇 blade, PM station 자리, LL slot, boat slot 모두 Holding Site다.
_Avoid_: Slot(로그 용어), Stage(별도 Component)

**Location**:
물질이 있는 곳을 `Component` + 선택적 `Holding Site`로 가리키는 값. Holding Site를 모르면 Component 단위로만 표현하며 자리를 임의 배정하지 않는다.

**Handler**:
물질을 옮기는 Component(로봇, rail robot, stage exchanger). 이송 중인 물질의 Location은 이 Handler다.
_Avoid_: arm(Handler의 일부 Component일 뿐)

**Level**:
수직으로 겹친 Component를 나누는 층 식별자. Top View는 Level 필터로 다층 구조를 보여주며 높이 형상은 저장하지 않는다.
_Avoid_: z-order(그리기 순서), floor

**Physical Interface**:
두 Component의 포트 간 물리 접점(gate, slit, docking, optical 등 `kind`로 구분).
_Avoid_: connection(모호), adjacency

**Transfer Capability**:
두 Holding Site 사이에 어떤 handler로 이송이 *가능하다*는 사실. 실제 이송이 있었다는 근거가 아니다.
_Avoid_: route, path

**Process Route**:
설명용 대표 공정 흐름 순서(FOUP→LL→PM→…). Replay 근거로 쓰지 않는다.
_Avoid_: operation route, OptionalRouteDefinition

**Certainty**:
레이아웃 속성이나 매핑 항목 하나가 근거로 뒷받침되는 정도: `verified | assumed | unknown`. `assumed` 매핑을 거친 location은 Evidence Level이 최대 `derived`다.
_Avoid_: confidence

**Source Evidence**:
레이아웃 속성의 근거가 된 레퍼런스(출처, revision, 사용 허가)에 대한 참조.

## Onboarding

**Onboarding**:
로그에 관측된 구성으로부터 설비의 레이아웃과 Mapping Version을 만들고 유지하는 작업 흐름.
_Avoid_: 등록, setup

**Observed Inventory**:
샘플 기간의 Occurrence에서 모은 설비별 alias 목록(ModuleType, Port/Robot 여부, slot 집합, 활동 종류, 건수, 처음/마지막 관측)과 관측된 이송 쌍.
_Avoid_: module list, config(설비 설정 CFG와 다름)

**Role**:
제조사와 무관한 Component의 기능 분류(PM, LL, TM, LP, Robot, Aligner, Buffer 등). 템플릿 매칭의 공통 언어다.
_Avoid_: ModuleType(제조사별 원천 문자열), ChamberType

**Type Dictionary**:
원천 `ModuleType` 문자열을 Role로 바꾸는 버전 관리되는 사전. Mapping Scope 계층을 따른다.

**Alias Rule**:
원천 Module/Slot alias를 Component/Holding Site로 해석하는 규칙(정확 일치, 패턴, 다대일, slot 분할, slot 변환, 로봇 arm 지정, 무시).

**Mapping Scope**:
Alias Rule과 Type Dictionary가 작성되는 범위: `Global → Maker → Model → Equipment`. 좁은 범위가 넓은 범위를 덮어쓴다. Publish 시 평탄화되어 불변 Mapping Version이 된다.

**Ignored Alias**:
의도적으로 표시하지 않기로 확정한 alias(가상·소프트웨어 모듈). 아직 해석되지 않은 미매핑 alias(`unknown`)와 다르다.

**Mapping Conflict**:
로그 관측과 레이아웃·매핑이 모순되는 지점(Transfer Capability 없는 관측 이송, Holding Site 수를 넘는 slot, Port/Role 불일치, 같은 수준 규칙 중첩). 자동으로 고치지 않는다.

**Template**:
한 구조 아키타입의 재사용 레이아웃. Role별 허용 개수(`roleCardinality`)를 가지며 매칭 후보가 된다. Component ID는 `pm-a`처럼 Role 기반이며 로그 alias와 같다는 사실은 매핑 근거가 아니다.
_Avoid_: archetype(구조 분류 이름으로만), model(장비 모델)

**Coverage**:
샘플 기간 Occurrence의 alias 참조 중 매핑으로 해석된 비율(건수 가중). Ignored Alias는 분모에서 뺀다.

**Generic Layout**:
맞는 템플릿이 없을 때 Observed Inventory에서 자동 생성하는 Role별 박스 배치 레이아웃. 모든 형상 Certainty는 `assumed`.

**Drift**:
Publish 이후 처음 보는 alias·slot 또는 Transfer Capability 없는 이송이 관측된 상태.

**Baseline Inventory**:
Mapping Version 게시 때 함께 저장한 기준 Observed Inventory. Drift는 이것과 현재 관측을 비교한다.

## Views

**Focus**:
Occurrence 한 건(`equipmentId`, `entityType`, `anchor`)을 중심으로 앞뒤 구간을 Top View·Gantt·목록으로 보는 화면 모드. 재생은 이 모드의 기능이다.
_Avoid_: replay 화면, player

**Aggregate**:
기간 집계 지표(Component Metric)를 Top View 위에 인코딩하는 화면 모드.
_Avoid_: dashboard, heatmap 모드

**Journey**:
wafer journey 하나의 경유지를 레이아웃 위 이산 hop으로 보는 화면 모드. 이동 궤적을 그리지 않는다.
_Avoid_: path animation, trace

**Hop**:
Journey에서 물질 한 장이 머문 하나의 Location. 번호는 도착 Record Sequence 순서이고, 같은 alias·Location이 이어지면 한 hop이다. Handler 위 구간도 hop이다(`derived`).
_Avoid_: path, trace, waypoint

**Component Metric**:
원천 alias(또는 alias 쌍) 기준으로 외부에서 계산되어 들어오는 기간 지표 값과 표본 수·품질. Mapping Version으로 Component·Transfer Capability에 대응된다.
_Avoid_: KPI, 지표(단독)

## Versioning

**Layout Revision**:
한 Equipment Template 레이아웃의 publish된 불변 버전.

**Mapping Version**:
로그의 Module/Slot alias를 Component/Holding Site로 해석하는 매핑의 불변 버전. 설비별로 관리한다.

**Binding**:
`(equipmentId, Layout Revision, Mapping Version, effectiveFrom, effectiveTo?)`. 특정 설비가 특정 기간에 어떤 구조·매핑을 썼는지를 말한다.

**Ruleset Version**:
Replay가 근거로부터 `derived` 상태를 계산하는 규칙 집합의 버전.

**Parser Contract Version**:
Adapter 입력 DTO 스키마의 버전.
_Avoid_: parserRevision

**Data Generation**:
같은 설비·구간의 관측 데이터가 정정·재처리로 바뀔 때 올라가는 세대 값.
_Avoid_: ingestionGeneration, eventGeneration, generation

**Sample Window**:
한 설비에 대해 가져온 완전한 OccurrenceBatch 하나와 그 조회 구간 `[from, to)`. 불변이며 Inventory와 Replay의 단위다. Studio는 window를 합치지 않는다(ADR-0010, 구현: #99/#100).
_Avoid_: Observation(입력 단위로서), snapshot

**Replay Key**:
`(Layout Revision, Mapping Version, Ruleset Version, Data Generation, 관측 집합 해시, t)`. 같으면 Scene State가 같아야 한다.

## Material

**Material**:
Location을 가지는 처리 대상 객체. MVP는 `wafer`와 `carrier`이며 `batch`, `boat`, `reticle`은 예약된 종류다.
_Avoid_: substrate, item

**Carrier**:
wafer를 담아 LoadPort에 놓이는 용기(FOUP 등). Carrier 안의 wafer는 LoadPort의 Holding Site에 있는 것으로 표현한다.
_Avoid_: FOUP(종류 이름), cassette

**Lot / Job**:
위치가 없는 Material 묶음 속성. 필터·강조에만 쓰며 화면 객체로 그리지 않는다.

**Module Activity**:
열린 Occurrence에서만 계산하는 Component의 활동 상태: `processing | post-processing | function | no recorded activity`.
_Avoid_: idle(기록 부재는 idle의 근거가 아님), module status

## Replay (입력)

**Occurrence**:
원천(parser)이 이미 Start/End를 짝지어 확정한 하나의 실행·이송·체류 구간. 끝이 아직 없으면 열린 Occurrence(`end=null`)다. Replay의 입력 단위다.
_Avoid_: event(점 이벤트를 뜻할 때만 사용), Observation(입력 단위로서), interval

**Data Quality Issue**:
원천이 정상 Occurrence로 확정하지 못한 근거 결함(짝 없는 End, 시각 역전 등). 상태를 바꾸지 않고 타임라인에 표시된다.

**Record Sequence**:
원천이 부여한 설비별 전역 순서 번호. 상태 적용 순서의 유일한 기준이며 timestamp는 순서가 아니라 값이다.

**Time Anomaly**:
Record Sequence 순서와 timestamp 순서가 어긋난 경계. 영향 받은 객체는 그 구간에서 `unknown`이 된다.

**Site Wall-clock**:
설비 사이트 기준 timezone 없는 시각 값. 어떤 단계에서도 로컬 timezone이나 UTC로 변환하지 않는다. 소수초는 정확히 3자리이며, 더 정밀한 원천 시각은 자르지 않고 거부한다(ADR-0009).
_Avoid_: timestamp(UTC instant로 오해될 때), local time

**Watermark**:
원천이 해당 설비에 대해 완료 Result를 확정한 마지막 지점. 이후 구간은 근거 부재로 취급한다.

## Replay (근거)

**Evidence Level**:
Replay가 보여주는 모든 상태·동작의 근거 등급: `observed | derived | illustrative | unknown`. Occurrence 전체가 아니라 facet(location, material identity, start, end)마다 붙는다.
_Avoid_: confidence, provenance level, reconstructed

**observed**:
로그 이벤트가 직접 말하는 사실(장비 센서 수준의 검증을 뜻하지는 않음).

**derived**:
observed 근거에 버전이 있는 규칙을 적용해 계산한 상태.
_Avoid_: reconstructed, inferred

**illustrative**:
이해를 돕는 화면 연출(보간 이동 등). 근거가 아니며 기본으로 꺼져 있다.

**unknown**:
근거가 없거나, 매핑이 없거나, 해석이 여러 갈래인 상태. 다른 값으로 메우지 않는다.

**Fidelity Tier**:
설비 로그가 제공하는 근거 수준에 따라 Replay가 보여줄 수 있는 범위를 나눈 등급 `F0`(모듈 실행 구간)~`F3`(자세·축 엔코더). 원천 PRC 계층(L1–L4)과 다른 개념이다.
_Avoid_: L0–L3, data level

**Scene State**:
특정 시점 t에 Replay가 결정론적으로 만든 객체별 상태(점유, 모듈 상태, 마커)와 그 Evidence Level.
_Avoid_: TimeState, frame
