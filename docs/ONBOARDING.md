# Onboarding — 로그 관측으로 레이아웃·매핑 만들기 v0.4

**상태:** Proposed (설계 grilling 확정, 2026-10-14). 용어는 [`CONTEXT.md`](../CONTEXT.md), 범위·평탄화 결정은 [ADR-0005](adr/0005-scoped-alias-rules-flattened-mapping.md).

Onboarding은 Studio의 MVP 핵심 흐름이다. 장비 모델 수가 많아 사람이 레이아웃을 하나씩 그리는 방식은 확장되지 않으므로, 로그에 관측된 구성(Observed Inventory)에서 템플릿을 제안하고 매핑 초안을 만든 뒤 사람은 예외만 고친다. 자유 편집(이동/회전/snap)은 템플릿 인스턴스와 Generic Layout 형상을 다듬는 보조 기능이다.

## 1. 흐름

```text
① Fleet ─ ② Inventory ─ ③ Template 제안 ─ ④ Mapping Board ─ ⑤ 검증(dry-run) ─ ⑥ Publish ─ ⑦ Drift 감시
                                                                                        └→ 같은 Model 장비에 적용
```

| 단계 | 화면 | 핵심 내용 |
|---|---|---|
| ① Fleet | Maker → Model → 장비 표 | 상태 `미착수 / 초안 / 게시됨 / Drift`, 커버리지 %, assumed 비율, 미매핑 영향도. 영향도 순 정렬 |
| ② Inventory | alias 목록 + 관측 이송 그래프 | alias별 ModuleType·Role·Port/Robot 여부·slot 집합·활동 배지(PRC/FNC/XFR/Carrier)·건수·처음/마지막 관측. 관측 이송 쌍(A→B, 건수)은 공간 정보 없는 node-link |
| ③ Template 제안 | 상위 3개 썸네일 비교 | 점수와 근거 문장("PM 4/4 ✓, LL 2/2 ✓, TM robot ✓, 설명 안 되는 alias 1"). 맞는 것이 없으면 Generic Layout |
| ④ Mapping Board | alias 목록 · Top View · 선택 상세 (§4) | 배정·규칙화·무시·충돌 해결 |
| ⑤ 검증 | 샘플 기간 dry-run replay | 커버리지, Mapping Conflict 목록, 미매핑 영향도. 충돌 클릭 → SVG 강조 |
| ⑥ Publish | 이전 버전 diff | 규칙 평탄화 → 불변 Mapping Version + Binding(effectiveFrom) |
| ⑦ Drift | Fleet 상태 배지 + 검토 대기열 | 게시 후 새 alias·slot, Transfer Capability 없는 관측 이송 |

## 2. Observed Inventory

- 계약은 `ObservedInventory` DTO. core가 기준 구현 `buildInventory(occurrences)`를 제공하고(독립 실행·synthetic fixture), 플랫폼 서버는 긴 기간을 미리 집계해 같은 DTO로 넘길 수 있다.
- 샘플 기간 기본 **최근 30일**, 사용자 조정 가능. 드문 alias(정비 모듈 등)는 Drift가 나중에 잡는다.
- Role은 Type Dictionary로 `ModuleType` → Role 변환. 사전에 없는 ModuleType은 Role `unknown`이고 목록 최상단에 표시.

## 3. Template 매칭

결정론적·설명 가능한 점수만 사용한다(ML 없음). 제안은 자동 게시되지 않는다.

1. **Role 개수 적합도:** 정확히 일치, 또는 템플릿 `roleCardinality` 범위 안(예: radial TM의 PM 2–6).
2. **이송 일관성:** 관측 이송 쌍 중 템플릿 Transfer Capability로 설명되는 비율.
3. **감점:** 설명되지 않는 alias 수.
4. **대칭 배정:** 같은 Role 여러 개(`PM1–4` → `pm-a–d`)는 관측 이송 이웃으로 먼저 구분, 안 되면 alias 자연 정렬 순서로 배정하고 Certainty `assumed`.
5. **금지:** Component ID나 label이 alias와 같다는 사실을 매핑 근거로 쓰지 않는다.

### Generic Layout

맞는 템플릿이 없으면 Observed Inventory에서 자동 생성한다. 흐름 방향은 관측 이송 그래프를 Port 기점으로 위상 정렬한 열 배치(LP → EFEM 쪽 → LL → TM → PM), 같은 열 안은 alias 자연 정렬. 같은 Inventory면 항상 같은 배치. 모든 형상 Certainty는 `assumed`. 다듬은 뒤 "Template으로 승격"하면 다른 장비의 매칭 후보가 된다.

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

- **커버리지(headline):** 샘플 기간 Occurrence의 alias 참조 중 해석된 비율(**건수 가중**). 보조로 alias 개수 기준 커버리지. Ignored Alias는 분모 제외·별도 표시, assumed 비율 병기.
- **Mapping Conflict:** Transfer Capability 없는 관측 이송, Holding Site 수를 넘는 관측 slot, Port 플래그와 Role 불일치, 같은 수준 규칙 중첩. 자동 수정 없음. 조치: "이송 경로 추가"(sourceEvidence = 로그 관측, 사람 확인) 또는 재매핑.
- **Drift:** 게시 이후 처음 보는 alias, 처음 보는 slot, Transfer Capability 없는 관측 이송. Fleet 상태 `Drift` + 영향도. 외부 알림은 플랫폼 통합 단계.

## 7. 파일 배치 (Studio 파일 기반)

```text
assets/onboarding/
  scopes/global/type-dictionary.json
  scopes/maker/<maker>/{type-dictionary,alias-rules}.json
  scopes/model/<maker>/<model>/{type-dictionary,alias-rules}.json
  scopes/equipment/<equipmentId>/alias-rules.json        # 예외 덮어쓰기
  mappings/<equipmentId>/<version>.mapping.json          # 평탄화·불변, 내용 hash 포함
  bindings/<equipmentId>.bindings.json
```

저장소에는 synthetic 설비만 둔다. 실제 maker/model 값은 플랫폼 배포 계층.

## 8. 권한

이 저장소는 액션 이름만 계약으로 정의한다: `onboarding:edit-rules`, `onboarding:publish-mapping`, `onboarding:edit-global-dictionary`. 강제는 플랫폼(Global 사전 수정은 소수). 독립 Studio는 로컬 도구로 권한 검사 없음.
