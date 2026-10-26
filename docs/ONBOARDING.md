# Onboarding — 로그 관측으로 레이아웃·매핑 만들기 v0.4

**상태:** 전체 Studio 흐름은 Proposed (설계 grilling 확정, 2026-10-14). §3의 Template 제안·Generic Layout 생성 함수는 core에 구현됨(#11b); 읽기 전용 Fleet·Inventory·Template 제안 화면, Mapping Board, 샘플 기간 dry-run, Publish(Layout Revision·Mapping Version·Baseline Inventory·Binding, [ADR-0007](adr/0007-publish-writes-revision-mapping-baseline-binding.md))는 Studio에 구현됨; 설비 등록, Model Type Dictionary, alias metadata, Sample Window 가져오기는 [ADR-0010](adr/0010-studio-data-import.md)에 따라 #97–#103에서 구현됨. 용어는 [`GLOSSARY.md`](../GLOSSARY.md), 범위·평탄화 결정은 [ADR-0005](adr/0005-scoped-alias-rules-flattened-mapping.md).

Onboarding은 Studio의 MVP 핵심 흐름이다. 장비 모델 수가 많아 사람이 레이아웃을 하나씩 그리는 방식은 확장되지 않으므로, 로그에 관측된 구성(Observed Inventory)에서 템플릿을 제안하고 매핑 초안을 만든 뒤 사람은 예외만 고친다. 자유 편집은 템플릿 인스턴스와 Generic Layout을 다듬거나 primitive로 레이아웃을 직접 조립하는 기능이다(T06c, 2026-10-20 owner 요청). 구현: /layouts에서 Component 이동(drag·Alt+화살표)·15° 회전·격자 맞춤·실행 취소 (#158). Component 추가(25개 primitive)·삭제·이름 변경 (#166). Port·Physical Interface, Holding Site·Transfer Capability 추가·삭제 (#167, #168). 크기 변경·포트 맞춤·다중 선택은 아직 없다.

## 1. 흐름

```text
① Fleet ─ ② Inventory ─ ③ Template 제안 ─ ④ Mapping Board ─ ⑤ 검증(dry-run) ─ ⑥ Publish ─ ⑦ Drift 감시
                                                                                        └→ 같은 Model 장비에 적용
```

| 단계 | 화면 | 핵심 내용 |
|---|---|---|
| ① Fleet | Maker → Model → 장비 표 | 상태 `관측 없음 / 미착수 / 초안 / 게시됨 / Drift`, 커버리지 %, assumed 비율, 미매핑 영향도. 관측 없음은 등록했지만 Sample Window가 없는 설비다(오류 아님, 설비 데이터 페이지로 링크). 정렬: 오류, 관측 없음, 그다음 영향도 순 |
| ② Inventory | alias 목록 + 관측 이송 그래프 | alias별 ModuleType·Role·Port/Robot 여부·slot 집합·활동 배지(PRC/FNC/XFR/Carrier)·건수·처음/마지막 관측. 관측 이송 쌍(A→B, 건수)은 공간 정보 없는 node-link |
| ③ Template 제안 | 상위 3개 썸네일 비교 | 점수와 근거 문장("PM 4/4 ✓, LL 2/2 ✓, TM robot ✓, 설명 안 되는 alias 1"). 맞는 것이 없으면 Generic Layout |
| ④ Mapping Board | alias 목록 · Top View · 선택 상세 (§4) | 배정·규칙화·무시·충돌 해결 |
| ⑤ 검증 | 샘플 기간 dry-run replay | 선택한 Sample Window로 검증한다. 커버리지, Mapping Conflict 목록, 미매핑 영향도. 충돌 클릭 → SVG 강조. reducer는 실행하지 않는다. |
| ⑥ Publish | 이전 버전 diff | 규칙 평탄화 → 불변 Mapping Version + Binding(effectiveFrom) |
| ⑦ Drift | Fleet 상태 배지 + 검토 대기열 | 게시 후 새 alias·slot, Transfer Capability 없는 관측 이송. Fleet `Drift` 배지는 **가장 늦은** Sample Window를, Onboarding의 `⑦ Drift 검토` 패널은 **선택한** window를 최신 Binding의 Baseline과 비교한다 |

## 2. Observed Inventory

- 계약은 `ObservedInventory` DTO. core는 기준 구현 `buildInventory(batch: OccurrenceBatch, metadata?: AliasMetadataFile): ObservedInventory`를 제공하며(#11a, 독립 실행·synthetic fixture), 선택 입력 `AliasMetadataFile`은 같은 `equipmentId`의 adapter metadata(`moduleType`/`isPort`/`isRobot`)만 공급한다. 다른 장비 metadata, batch와 다른 `equipmentId`의 Occurrence·DQI record, 중복 Record Sequence, 중복 Occurrence·DQI `id`는 `RangeError`이며(replay와 같은 검사, #42) batch에 없는 alias는 추가하지 않는다. `computeCoverage`·`findMappingConflicts`·`detectDrift`는 Inventory와 Mapping Version의 `equipmentId`, Layout과 `mapping.layoutId`가 다르면 `RangeError`를 던진다(#39). 플랫폼 서버는 긴 기간을 미리 집계해 같은 DTO로 넘길 수 있다.
- 샘플 기간은 선택한 **Sample Window의 구간**이다(ADR-0010). Studio 기본은 `from`이 가장 늦은 window이며 Onboarding에서 다른 window를 고른다(`?window=`). 드문 alias(정비 모듈 등)는 Drift가 나중에 잡는다.
- Role은 Type Dictionary로 `ModuleType` → Role 변환. 사전에 없는 ModuleType은 Role `unknown`이고 목록 최상단에 표시.

### ObservedInventory 계약 (#9b)

`packages/core/src/inventory/schema.ts`의 strict `observedInventorySchema`와
`@eqv/core/observed-inventory.schema.json`이 DTO 형식을 정의한다. Inventory 계산은 `buildInventory`가 구현한다(#11a).

```ts
type ObservedInventory = {
  equipmentId: string; from: SiteWallClock; to: SiteWallClock;
  aliases: InventoryAlias[];
  transfers: { from: string; to: string; count: number }[];
};
type InventoryAlias = {
  alias: string;
  references: number;
  slots: string[];
  activity: { kind: Occurrence['kind']; count: number }[];
  firstSeen: SiteWallClock | null; lastSeen: SiteWallClock | null;
  moduleType?: string; isPort?: boolean; isRobot?: boolean;
};
```

- `from`/`to`는 입력 batch의 조회 구간이다. 중간 진입 Occurrence의 경계가 구간 밖이어도 버리지 않는다.
- 각 Occurrence의 **존재하는** `location`/`from`/`to` 참조를 각각 수집한다. 같은 alias를 여러 필드에서 참조해도 `references`는 Occurrence당 한 번만 센다.
- `slots`는 해당 alias와 함께 나온 모든 `slotAlias`의 중복 없는 집합이다. `/^[+-]?[0-9]+$/` 문자열을 먼저 정확한 정수 값(`BigInt`, `Number` 반올림 금지)으로 정렬하고, 같은 정수 값이면 code-unit 순으로 정렬한다. 나머지 문자열은 그 뒤에 code-unit 순으로 둔다.
- `activity`는 `location.moduleAlias`가 해당 alias인 Occurrence만 종류별로 세며 `kind` 순으로 정렬한다. 이송의 `from`/`to` 참조를 활동으로 세지 않는다.
- `firstSeen`/`lastSeen`은 해당 alias를 참조한 Occurrence의 모든 null이 아닌 경계 `at`의 최솟값/최댓값이다. 유효 시각이 하나도 없으면 둘 다 null이다.
- `aliases`는 alias code-unit 순, `transfers`는 `(from, to)` code-unit 순이다. 이송 쌍은 `TRANSFER`이며 `from`과 `to`가 모두 있을 때만 세고 module alias 기준으로 합친다. locale 정렬은 사용하지 않는다.
- `moduleType`/`isPort`/`isRobot`은 adapter가 별도로 공급하는 선택 필드다. OccurrenceBatch에는 이 값이 없으므로 추측하지 않는다. Role은 Type Dictionary로 얻는 표시 정보이며 DTO 필드가 아니다.

## 3. Template 매칭

`proposeTemplates({ inventory, dictionaries, templates })`는 결정론적·설명 가능한 규칙으로 상위 3개(후보가 적으면 그 수만큼)를 반환한다(ML 없음). **자동 게시 없음:** 제안만 반환하며 Mapping Version을 만들지 않는다.

1. **Role 개수 적합도:** alias의 `moduleType`을 `resolveRole`과 Type Dictionary로 해석한다. 필드가 없거나 사전에서 해석되지 않으면 `unknown`이며 alias 문자열에서 Role을 추측하지 않는다. Inventory에서 관측된 Role 중 `unknown`을 제외한 Role만 code-unit 순으로 `roleFit` 행을 만든다. `drawn`은 Template의 해당 Role Component 수, `min`·`max`는 `roleCardinality` 값(항목이 없으면 모두 0)이다. 관측 수가 범위 밖인 Role 수가 `rolesOutOfRange`이며 0이면 `fits: true`다. 관측되지 않은 Template Role은 감점하지 않는다.
2. **대칭 배정:** 먼저 관측 alias와 Template Component가 각각 하나인 Role을 `unique-role`로 배정한다. 다음은 Role code-unit 순, alias 자연 정렬 순으로 이미 배정된 관측 이송 이웃(양방향)을 검사한다. 같은 Role의 미배정 Component 중 모든 배정된 이웃과 명시적인 Transfer Capability로 연결된 후보가 정확히 하나이면 `transfer-neighbors`로 배정한다. 이 단계에서 앞서 배정한 이웃도 사용한다. 마지막으로 남은 alias 자연 정렬 순과 남은 Component ID code-unit 순을 짝지어 `natural-order`로 배정한다. 모든 배정은 근거 `basis`를 가지며 Certainty는 `assumed`다. Component가 부족한 alias와 모든 `unknown` alias는 `unexplainedAliases`에 자연 정렬 순으로 남긴다.
3. **이송 일관성:** `total`은 Inventory 이송 쌍의 `count` 합, `explained`는 양쪽 alias가 배정되고 두 Component의 Holding Site 사이에 명시적인 Transfer Capability가 있는 쌍의 `count` 합이다. 양방향으로 검사하며 geometry·Physical Interface·Process Route는 근거가 아니다. `ratio = explained / total`, 이송이 없으면 null이다.
4. **순위:** `rolesOutOfRange` 오름차순 → 이송 `ratio` 내림차순(null은 마지막) → 설명되지 않는 alias 수 오름차순 → `exactRoleMatches` 내림차순 → Template ID code-unit 오름차순의 사전식 비교다. `exactRoleMatches`는 범위 안이며 관측 수와 `drawn`이 같은 Role 수다. `rank`는 1부터 시작한다.
5. **금지·정렬:** Component ID나 label이 alias와 같다는 사실을 매핑 근거로 쓰지 않는다. 자연 정렬은 최대 숫자·비숫자 run을 비교하고 숫자끼리는 정확한 `BigInt`, 나머지는 code-unit 순을 쓴다. run 목록이 접두사면 짧은 목록이 먼저며, 마지막 동률은 원문 code-unit 순이다(`PM2 < PM10`, `PM01 < PM1`). 배정 결과도 alias 자연 정렬 순이다.

**근거 문장:** Role을 대문자로 표기한다. 범위 안이고 관측 수가 `drawn`과 같으면 `ROLE 관측/도형 ✓`, 범위 안이지만 다르면 `ROLE 관측 (최소–최대) ✓`, 범위 밖이면 `ROLE 관측 (최소–최대) ✗`다. 이어 `이송 explained/total ✓`(`explained < total`이면 `✗`), 이송이 없으면 `이송 없음`, 마지막은 `설명 안 되는 alias n`이다. 각 항목은 `, `로 잇고 범위에는 en dash(`–`)를 쓴다. 문장은 표시용이며 `@eqv/editor`의 `formatProposalEvidence(proposal)`이 `roleFit`·`transfers`·`unexplainedAliases`로 만든다. synthetic cluster fixture의 `cluster-single` 제안:

```text
LL 1/1 ✓, LP 1/1 ✓, PM 3 (1–6) ✓, ROBOT 2/2 ✓, 이송 7/7 ✓, 설명 안 되는 alias 2
```

`fixtures/templates/`의 세 후보는 #11b의 synthetic Template(테스트 입력)이며 OEM 형상이나 기구학 검증을 주장하지 않는다. Studio의 Template 제안은 데이터 루트에 `templates/`가 없으면 `assets/templates/`의 변환 아키타입 여섯 개(#7)를 읽는다(`apps/studio/server/files.ts`).

### Generic Layout

맞는 Template이 없으면 `buildGenericLayout({ inventory, dictionaries })`로 Observed Inventory에서 생성한다. **alias가 하나 이상이어야 한다.** 빈 Inventory는 `RangeError('Cannot build Generic Layout from empty Inventory')`를 던진다.

- `unknown`을 포함해 alias마다 Component 하나를 만든다. Role 해석은 위와 같고, 각 Role 안의 alias 자연 정렬 순번 `n`으로 ID는 `role-n`, label은 `ROLE n`, asset은 `generic-box`다. alias 이름을 label로 복사하지 않는다. 좌표 단위는 `abstract`다.
- `isPort === true`인 모든 alias가 0열이다. 열은 **무방향 관측 이송 그래프의 Port 기점 최단 거리**다. 도달하지 못한 alias는 최대 도달 열 + 1인 마지막 열에 두며 Port가 하나도 없으면 모두 0열이다. 같은 열 안은 alias 자연 정렬 순으로 0부터 행을 매긴다. 좌표는 `(10 + 20·열, 10 + 20·행)`, 회전 0, scale 1이며 viewBox는 `(0, 0, 20·열 수, 20·최대 행 수)`다. 같은 Inventory는 입력 배열 순서와 무관하게 같은 결과다.
- 관측 slot 중 정수 문자열(`/^[+-]?[0-9]+$/`)만 §2의 정렬 순으로 Holding Site를 만든다. 정확한 `BigInt` 값 `v`가 0 이상이면 `slot-v`, 음수면 `slot-neg-절댓값`이다. 같은 값의 문자열(`01`, `1`)은 첫 문자열이 만든 site 하나를 공유하고 둘 다 `assignments.sites`에 남긴다. 정수가 아닌 slot은 site·배정 항목을 만들지 않는다. `materialKinds`는 다섯 종류 전체(`wafer`, `carrier`, `batch`, `boat`, `reticle`)를 나열해 특정 종류를 단정하지 않는다.
- 모든 생성 속성·Holding Site와 alias 배정의 Certainty는 `assumed`다. provenance는 `src-observed-inventory`를 참조한다. `ports`·Physical Interface·Transfer Capability·Process Route는 비어 있으며 관측 이송으로 연결 가능성을 만들지 않는다. 이송 경로는 사람이 추가한다(/layouts의 Transfer Capability 편집, #168). **자동 게시 없음.**

형상을 다듬은 Layout을 "Template으로 승격"하는 규칙은 [ADR-0015](adr/0015-template-promotion.md)가 정한다(게시된 Layout Revision → 데이터 루트 `templates/`, 승인 단계 없음, `promotedFrom` 출처). 구현은 #159이며 아직 없다.

## 4. Mapping Board

```text
┌ Alias (그룹: Role) ───────────┐┌ Template Top View ──────────────┐┌ 선택 항목 ───────────┐
│ ▸ PM  (4)                     ││        [LP1][LP2][LP3]          ││ alias  PM3          │
│   PM1   ● 확정    pm-a        ││         [ EFEM  ⦿R ]            ││ type   PROCESS_CH   │
│   PM2   ◐ 자동    pm-b        ││        [LLA]   [LLB]            ││ slots  1,2          │
│   PM3   ⚠ 충돌    pm-c        ││     [pm-a] ( TM ⦿ ) [pm-d]      ││ → pm-c (자동, 근거:  │
│   CH4   ○ 미매핑  —           ││        [pm-b]  [pm-c]           ││   ModuleType+이송)   │
│ ▸ 무시 (2)  VIRT_SCH, SW_CTRL ││  alias를 component/site로 drag  ││ ⚠ PM3→LLB 이송 87건  │
│ [규칙 추가] [자동 일괄 확정]  ││                                 ││   레이아웃상 불가    │
└───────────────────────────────┘└─────────────────────────────────┘│ [이송 경로 추가][재매핑]│
 j/k 이동 · Enter 확정 · A 배정 · I 무시 · R 규칙화 · / 검색 · ⌘Z/⇧⌘Z                └──────────────────────┘
```

- **상태:** `확정(confirmed)` · `자동(assumed)` · `충돌` · `무시(Ignored Alias)` · `미매핑(unknown)`. 색 외에 기호·텍스트로도 구분.
- **배정:** drag 또는 키보드(alias 선택 → `A` → component 검색 팔레트). drag 전용 동작 없음.
- **규칙화(`R`):** 선택 alias에서 패턴 제안 → 저장 전 반드시 미리보기("매칭: PM1–PM4 → pm-1–pm-4, 충돌 0").
- **일괄:** 다중 선택 후 일괄 확정·무시, undo/redo.
- **연동:** SVG component 클릭 → 배정된 alias 역강조. 충돌 클릭 → 관련 component·이송 경로 강조.

### 구현 규칙 (Mapping Board, #14b)

구현된 범위: alias 목록·Top View·선택 항목의 3-pane, 배정(키보드 팔레트·drag)·확정(`Enter`)·무시(`I`), 실행 취소/다시 실행, 역강조, 명시적 `[저장]`. 규칙화(`R`), 다중 선택과 일괄 확정·무시, `/` 검색(#14c)도 구현됐다. 충돌 목록·이송 경로 강조·dry-run·Publish는 §6 '검증과 Publish (#14d)'를 본다.

- **상태(첫 일치):** `⚠ 충돌`(같은 범위 규칙 중첩, 규칙 해석 문제 또는 `findMappingConflicts`가 alias를 지목) → `⊘ 무시` → `● 확정`(verified) → `◐ 자동`(assumed; 저장 전 초안은 `◐ 자동 (미저장)`) → `○ 미매핑`. 규칙도 초안도 없는 alias는 추측하지 않고 미매핑이다. 저장된 기준과 다른 winning rule도 상태 뒤에 ` (미저장)`을 붙인다. 대상이 레이아웃에 없으면 `(레이아웃에 없음)`, label이 id와 다르면 `id · label`을 목록과 선택 항목에 표시한다.
- **초안:** 레이아웃의 `templateId`가 가리키는 Template(`generic`이면 Generic Layout)의 `proposeTemplates`/`buildGenericLayout` 배정을 `assumed` 정확 일치 규칙으로 보여 준다. 규칙이 하나도 일치하지 않는 alias에만 적용하고, 레이아웃에 없거나 Role이 다른 component는 버린다. 초안만으로는 변경 상태가 아니다.
- **저장:** 저장 범위(Model 기본 / 설비)의 `alias-rules.json`만 쓴다. 사람이 한 동작은 `verified`이고, 변경된 범위의 파일과 초안이 있으면 저장 범위 파일(초안은 `assumed` 규칙 `board-<alias>`)을 한 번에 저장한다. Mapping Version·Binding은 쓰지 않는다(ADR-0005). Model 범위로 저장해도 Equipment 범위 규칙이 이기면 "설비 범위 규칙(<id>)이 우선합니다"를 보여 준다.
- **저장 안내:** 새로 열어 변경이 없으면 `변경 없음`, 초안만 있으면 `초안 N건 (저장하면 assumed 규칙으로 기록)`, 사람의 변경이 있으면 `저장 안 됨 · Model, 설비`처럼 실제 변경 범위를 나열한다. `저장됨`은 저장 성공 직후에만 표시하며, 이탈 확인은 사람의 변경에만 적용한다. 저장이 시작되면 포커스를 저장 상태로 옮기며, 상태 요소는 성공·실패 후에도 유지한다. 저장 중 버튼 비활성화로 중복 실행을 막는다.
- **공유 규칙 안내:** Model 저장 범위에서 기존의 저장된 Model 규칙을 바꾸거나 대체하는 편집은 규칙 id와 maker/model의 모든 설비에 적용됨을 알린다. Model 규칙의 `unknown-target` 문제에는 설비 범위 사용을 안내한다. 편집의 적용 방식은 바꾸지 않는다.
- **키보드·팔레트:** 배정 팔레트는 배경을 차단하고 포커스를 가둔다. 닫으면 alias 목록으로 포커스가 돌아온다. 확정이 미매핑 또는 이미 같은 verified 정확 규칙이라 아무 변경도 만들지 않으면 버튼에 `aria-disabled`와 이유를 표시하고, 목록의 Enter도 상태 줄로 같은 이유를 알린다.
- **다중 선택·일괄(#14c):** 활성 행 옆에 표시 집합을 둔다(`Space` 토글, `Shift`+`j/k/↑/↓`로 이동하며 표시, `⌘/Ctrl`+클릭 토글(첫 클릭은 기존 활성 행도 표시), `Shift`+클릭 범위, `Esc` 해제, 일반 클릭은 표시를 지운다). 표시가 없으면 `aria-selected`는 활성 행만, 있으면 표시된 행만 true다. 표시한 행이 둘 이상(또는 활성 행이 아닌 한 행)이면 `Enter`·`I`와 선택 항목의 `일괄 확정`·`일괄 무시`가 현재 필터에서 보이는 표시 행에만 적용되고, 일괄 동작 하나가 undo/redo 기록 하나다. 상태 줄에 기록한 편집 수 `N건 확정`·`N건 무시`와 건너뛴 사유(`대상 없음`, `규칙 충돌`, `이미 확정됨`)를 알리고, 실제 상태·대상이 그대로인 alias는 `결과가 바뀌지 않음`으로 나열한다. 일괄 선택 항목에도 변경한 Model 규칙의 공유 범위와 우선하는 설비 규칙을 안내한다. `자동 일괄 확정 (N)`은 보이는 `◐ 자동` 행(초안 포함)을 한 번에 확정한다. 실행 전에 해당 행들의 Model 공유 범위·변경 규칙과 우선하는 설비 규칙을 버튼의 설명으로 연결해 알린다.
- **규칙화 `R`(#14c):** 활성 alias의 마지막 숫자 묶음에서 패턴(`PM{n}`)과 대상(`pm-{n:letter}`)을 제안만 하고, 저장 범위(Model/설비)에 추가하기 전에 core의 `matchAliasRule`·`resolveAliasRules`로 미리보기한다(적용·예외·대상 없음·충돌·우선 규칙). 추가하는 규칙은 `verified` 패턴이며, 대상이 같은 저장 범위의 단일 alias 정확 규칙은 중복이므로 함께 제거한다(다른 대상의 정확 규칙은 예외로 남긴다). 같은 범위 규칙과 겹치거나 일치하는 alias가 없거나 저장 범위 파일에 유효하지 않은 규칙이 있으면 추가를 거부하고, 레이아웃에 없는 component로 치환되는 alias는 배정하지 않는다. 추가와 제거는 undo 기록 하나다.
- **`/` 검색(#14c):** `Alias 검색` 입력이 alias·ModuleType·대상 component id를 대소문자 무시 부분 일치로 거른다. 가려진 행은 이동·일괄 대상·표시에서 빠지고, 비어 있는 Role 그룹은 그리지 않는다. 입력에서 `Esc`는 지우고 목록으로, `Enter`/`↓`는 지우지 않고 목록으로 돌아간다.
- **레이아웃 draft:** `layouts/<layoutId>/draft.layout.json`(`<layoutId>`는 게시된 최신 binding의 `layoutId`, 없으면 `<equipmentId>-layout`). 없으면 Onboarding 화면의 "이 템플릿으로 시작"이 `instantiateLayout`으로 만들며, 이미 있으면 덮어쓰지 않는다.

## 5. Alias Rule

| 종류 | 예 |
|---|---|
| 정확 일치 | `PM1` → `pm-a` |
| 패턴 (제한 glob + 캡처, 정규식 아님) | `PM{n}` → `pm-{n}` |
| 다대일 | `PM1`, `CH1`, `Chamber1` → `pm-a` |
| slot 분할 | `PM1` slot `1-2` → `pm-a/station-1`, `3-4` → `pm-a/station-2` |
| slot 변환 | 0-based ↔ 1-based 오프셋, slot → Holding Site 표 |
| 로봇 arm 지정 | `TM_R1` slot `1` → `tm-robot` blade A Holding Site |
| 무시 | `VIRT_SCH` → Ignored Alias |

- **우선순위:** 좁은 Mapping Scope를 먼저 선택한 뒤 그 범위 안에서 정확 일치 > 패턴. 같은 수준 중첩은 Mapping Conflict로 저장 거부.
- **시간에 따른 의미 변경**(개조 등)은 규칙 유효기간이 아니라 새 Mapping Version + Binding으로 표현한다(시간 축 단일화).
- **Mapping Scope:** `Global → Maker → Model → Equipment`. 주로 Model 범위에 작성하고 예외만 Equipment 범위에서 덮어쓴다. Publish 시 평탄화(ADR-0005).
- **같은 Model 적용:** 한 대를 끝내면 같은 Model N대를 일괄 dry-run해 장비별 커버리지·충돌 표를 보여주고, 예외 장비만 열어 Equipment 범위로 덮어쓴다. Model 규칙이 바뀌면 해당 장비에 "새 규칙 반영 가능" 배지.
- **assumed 게시:** 확정 안 된 항목은 Certainty `assumed`로 게시 가능. 그 매핑을 거친 location facet Evidence는 최대 `derived`.

### 구현 규칙 (S3, #8)

Publish는 먼저 가장 좁은 Mapping Scope를 선택하고, 그 범위 안에서 정확 일치를 패턴보다 우선한다. 패턴의 `{name}`은 숫자 문자열을 캡처하며 대상의 `{name}`은 숫자를 그대로, `{name:letter}`는 1–26을 a–z로 치환한다(그 밖의 값은 미매칭). slot 분할·slot 변환·로봇 arm 지정은 모두 하나의 `SlotMap` 형식(`offset` + `assign`의 정수 범위와 `holdingSiteId`)을 사용하며 범위 중첩은 거부한다. 규칙이 없는 alias는 Mapping Version에 포함하지 않고 `unknown`으로 해석한다. 버전 hash는 hash 필드를 제외한 canonical JSON(객체 키 재귀 정렬, 배열 순서 유지, 공백 없음)의 SHA-256이다. Type Dictionary에서 해당 ModuleType 항목이 있는 가장 좁은 범위의 Role이 서로 다르면 파일 순서와 관계없이 `unknown`으로 해석하며, 같은 Role의 중복은 허용한다.

## 6. 커버리지와 Mapping Conflict

`computeCoverage(inventory, mapping)`의 반환값은 다음과 같다. alias에 non-ignore Mapping entry가 있으면 해석됨, `{ ignore: true }`이면 무시, entry가 없으면 미매핑이다. SlotMap의 문제는 alias 해석 여부를 바꾸지 않고 Mapping Conflict로 보고한다.

```ts
type Coverage = {
  references: { resolved: number; total: number; ratio: number | null };
  aliases: { resolved: number; total: number; ratio: number | null };
  ignored: { aliases: string[]; references: number };
  assumed: { references: number; ratio: number | null };
  unmapped: { alias: string; references: number }[];
};
```

- **커버리지(headline):** `references`는 Inventory의 `references` 건수로 가중하며 `aliases`는 alias 개수 기준 보조 지표다. 각각 `ratio = resolved / total`이며 자신의 `total`이 0이면 null이다.
- **Ignored Alias:** 두 지표의 분자·분모 모두에서 제외하며 `ignored.aliases`(code-unit 순)와 `ignored.references`로 따로 표시한다. `unmapped`에는 포함하지 않는다.
- **assumed:** `assumed.references`는 assumed entry로 해석된 참조 수이며 `ratio = assumed.references / references.resolved`다. 해석된 참조가 0이면 null이다. `unmapped`는 참조 수 내림차순, 동률은 alias code-unit 순이다. 어떤 비율도 NaN이 되지 않는다.

`findMappingConflicts({ inventory, mapping, layout, dictionaries })`는 다음 다섯 종류를 반환한다. 미매핑·무시 alias는 충돌을 만들지 않으며 자동 수정하지 않는다.

- `transfer-without-capability`: 두 alias가 모두 Component로 해석되지만 두 Component의 Holding Site 사이에 명시적인 Transfer Capability가 없는 관측 이송(무방향 검사). 형상·Physical Interface·Process Route는 사용하지 않는다.
- `slot-exceeds-sites`: SlotMap이 있으면 signed-decimal이 아니거나 `BigInt(slot) + BigInt(offset)`이 어느 `assign` 범위에도 속하지 않는 관측 slot만 반환한다. SlotMap이 없으면 고유 관측 slot 수가 Holding Site 수보다 많을 때 모든 관측 slot을 반환한다.
- `role-mismatch`: alias의 `moduleType`을 `resolveRole`로 해석한 Role이 `unknown`이 아니고 Component의 `role`과 다르다.
- `port-flag-mismatch`: 정의된 `isPort`가 Component의 `materialKinds`에 `carrier`가 있는 Holding Site 존재 여부와 다르다.
- `robot-flag-mismatch`: 정의된 `isRobot`이 Component의 `role === 'robot'` 여부와 다르다.

충돌은 `kind`, alias(이송은 `(from, to)`) code-unit 순으로 정렬하며 slot은 §2 순서다. 같은 수준의 winning rule 중첩은 `findMappingConflicts`가 아니라 `publishMapping`의 범위 평탄화에서 공급된 alias를 대상으로 `same-level-overlap`으로 보고한다. 파일 내부의 중복 exact alias·겹치는 slot 범위 검사는 `validateAliasRules`가 담당한다. 조치는 사람 확인 후 이송 경로 추가(sourceEvidence = 로그 관측) 또는 재매핑이며 자동 게시하지 않는다.

`detectDrift({ baseline, current, mapping, layout })`의 `baseline`은 Mapping 게시의 기준 Inventory다. `newAliases`는 current에만 있는 alias, `newSlots`는 current에만 있는 `(alias, slot)`이며 게시 때 이미 미매핑이었던 alias는 새 alias가 아니다. 새 alias의 slot도 기준에 없는 쌍이면 포함한다. alias와 slot 정렬은 §2와 같다. `transfersWithoutCapability`는 current 전체에 위와 같은 Transfer Capability 검사를 적용한 충돌 항목이다. Fleet 상태 `Drift`(세 목록 중 하나라도 비어 있지 않을 때, 가장 늦은 window 기준)와 Onboarding의 검토 대기열(선택한 window 기준, 종류별 건수와 항목, Mapping Board 링크)로 표시하며 외부 알림은 플랫폼 통합 단계다. Baseline Inventory 파일이나 최신 Binding의 Layout이 없거나(#14d 이전에 게시한 Binding), 읽을 수 없거나, 스키마·hash가 틀리거나, `detectDrift`가 `RangeError`를 던지면 Drift는 **알 수 없음**이다: 설비 로드는 그대로 성공하고(Fleet·Onboarding·Board가 막히지 않는다), Fleet은 `게시됨 · Drift 미확인`(neutral, 이유는 title)으로 두며 패널은 "Drift를 판단할 수 없습니다"와 이유(없으면 "Baseline Inventory가 없습니다", 틀린 파일이면 경로와 문제)를 보인다. "Drift 없음"으로 취급하지 않고 오류 행도 아니다. 검토 대기열은 항목이 있을 때만 Mapping Board 링크를 보이며 Onboarding 페이지의 마지막(②, ③, ⑦ 순)에 놓인다.

### 검증과 Publish (#14d)

구현 규칙은 ADR-0007을 따른다.

- **Dry-run(D8):** 저장된 규칙 파일과 현재 레이아웃 초안으로 `publishMapping`을 실행하고(쓰지 않는다) 성공하면 불러온 샘플 Inventory로 `computeCoverage`와 `findMappingConflicts`를 계산한다. reducer는 실행하지 않는다. Board의 저장하지 않은 편집은 포함되지 않으며, 저장하지 않은 자동 초안 alias는 미매핑으로 나온다. `publishMapping` 문제는 목록으로 보이고 Publish를 막는다.
- **충돌 강조(D11):** 충돌을 누르면 Board의 Top View에 표시한다. `transfer-without-capability`는 두 Component에 점선 링을 그리고 두 중심을 잇는 점선 한 줄을 `관측 이송 <from> → <to> <count>건 (Transfer Capability 없음)`이라는 제목으로 그린다. 이 선은 관측의 표시일 뿐 경로·궤적·Transfer Capability가 아니다. 다른 충돌은 해당 Component에 링을 그린다. 같은 충돌을 다시 누르면 해제한다.
- **Publish 쓰기 순서(D5):** (1) 초안을 Layout Revision으로 `POST /api/layout-revisions`, (2) Mapping Version, (3) Baseline Inventory(같은 hash의 Mapping Version 파일이 있어야 하며, 기존 baseline과의 409면 기존 파일 유지), (4) bindings 파일 덮어쓰기. 4단계가 commit point이며 실패하면 그 단계 이름을 보인다. 앞 단계는 참조되지 않는 불변 파일만 남기고 재시도는 멱등이다.
- **Binding(D6, D7):** 새 Binding은 항상 `layoutRevision`을 채운다. `effectiveFrom`은 필수 입력(SiteWallClock)이며 binding이 없는 장비는 Inventory `from`, 있는 장비는 Inventory `to`로 채운다. 이 기본값이 최근 Binding의 `effectiveFrom`보다 늦지 않으면 빈칸으로 두고 `마지막 binding(<from>)보다 늦은 시각을 입력하세요`를 안내하며, 입력하기 전에는 오류로 표시하지 않는다. 최근 Binding의 `effectiveFrom`보다 늦어야 하고, 최근 Binding이 열려 있으면 새 `effectiveFrom`으로 `effectiveTo`를 닫는다. 새 bindings 파일은 `validateBindings`를 통과해야 한다.
- **Publish 비활성(D9, D10):** Board에 저장하지 않은 변경이 있거나, `publishMapping` 문제가 있거나, `effectiveFrom`이 잘못되었거나, 새 Mapping hash와 Layout Revision이 최근 Binding과 같으면(`이전 게시와 같습니다`) 게시할 수 없다. Mapping Conflict는 막지 않고 diff에 건수로 보인다.
- **Diff:** 날짜 입력은 이미 계산한 dry-run·Layout Revision에서 동기적으로 검증하며 diff를 유지한다. alias별 추가·삭제·변경(대상, certainty, 규칙)과 변경 없는 개수, Layout Revision 줄, Binding 줄을 보인다. `assumed` entry는 `assumed`로 표시한다.
- **같은 Model 일괄 dry-run(D12):** 같은 maker/model 장비마다 각 조회에서 불러온 자신의 Inventory·레이아웃 초안·저장된 규칙 파일로 계산한다. 정렬은 막는 문제, 충돌 수 많은 순, 참조 coverage 낮은 순, `equipmentId`(code-unit)다. 레이아웃 초안이 없거나 읽지 못한 장비는 행에 오류를 보이고 상태는 `—`(알 수 없음)로 표시한다. maker/model을 읽지 못한 설비는 표에서 제외하고 caption에 `읽지 못한 설비 N대`를 덧붙인다.

## 7. 파일 배치 (Studio 파일 기반)

```text
assets/equipment/<equipmentId>.json                      # 설비 기록: equipmentId, maker, model
assets/observations/<equipmentId>/
  windows/<from>_<to>_<hex>.batch.json                   # Sample Window: 불변, append-only (ADR-0010)
  alias-metadata.json                                    # 선택
assets/onboarding/
  scopes/global/type-dictionary.json
  scopes/maker/<maker>/{type-dictionary,alias-rules}.json
  scopes/model/<maker>/<model>/{type-dictionary,alias-rules}.json
  scopes/equipment/<equipmentId>/alias-rules.json        # 예외 덮어쓰기
  mappings/<equipmentId>/<version>.mapping.json          # 평탄화·불변, 내용 hash 포함
  baselines/<equipmentId>/<mappingHex>.inventory.json    # Mapping Version을 게시한 기준 Inventory(불변, Drift 비교용)
  bindings/<equipmentId>.bindings.json                   # Binding의 선택 필드 layoutRevision(sha256:<hex>)을 Publish가 채운다
assets/layouts/<layoutId>/draft.layout.json             # Mapping Board가 배정하는 Equipment Layout draft (§4)
```

Studio dev 파일 API(#13)는 위 경로만 쓰며, 각 경로는 대응하는 core validator를 통과해야 한다.

설비 기록(`equipmentRecordSchema`, `schemaVersion: "0.4"`, `equipmentId`·`maker`·`model`)은 파일 이름이 `equipmentId`와 같아야 하며, `maker`/`model`이 적용되는 Scope를 정한다. `equipment/`와 `observations/`는 일반 파일 API로는 쓰지 않는다(쓰기는 403). 승인된 규칙(ADR-0010): 가져오기 endpoint(`/api/import/*`)로만 쓴다. 설비 기록은 create-only, Sample Window는 불변 추가(겹치는 구간은 거부, 대체·폐기 없음), alias metadata는 확인 후 교체다. 데이터 루트(`EQV_STUDIO_ASSETS`)가 이 저장소 안이면 가져오기를 거부하고, 다른 git 작업 트리 안이면 경고한다. Studio는 읽을 때 각 파일을 core validator로 다시 검사하며, 404만 "없음"으로 취급하고 그 외 실패나 잘못된 내용은 해당 설비의 오류로 표시한다.

저장소에는 synthetic 설비만 둔다. 실제 maker/model 값은 플랫폼 배포 계층. 가져온 데이터는 저장소 밖 데이터 루트에 있다.

## 8. 권한

이 저장소는 액션 이름만 계약으로 정의한다: `onboarding:edit-rules`, `onboarding:publish-mapping`, `onboarding:edit-global-dictionary`. 강제는 플랫폼(Global 사전 수정은 소수). 독립 Studio는 로컬 도구로 권한 검사 없음.
