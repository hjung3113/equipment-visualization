# 분석 화면 모드 v0.4

**상태:** Proposed (설계 grilling 확정, 2026-10-14). 용어는 [`CONTEXT.md`](../CONTEXT.md). 사용자·과업 우선순위는 [DESIGN-v0.4 §1](DESIGN-v0.4.md#1-제품-목표--비목표).

| 모드 | 사용자 과업 | 진입 키 | 구현 순서 |
|---|---|---|---|
| **Focus** | Occurrence 한 건의 앞뒤 맥락 확인 (공정·생산성 엔지니어) | `equipmentId` + (`entityType`, `anchor`) | 1 (M2) |
| **Aggregate** | 기간 집계 지표를 공간 위에서 (설비 엔지니어) | `equipmentId` + `from`/`to` + metric | 2 |
| **Journey** | wafer 한 장의 경유 hop 추적 (수율 엔지니어) | `equipmentId` + wafer anchor | 3 |
| Compare (2차) | 같은 Template 장비·기간 비교 | 여러 `equipmentId` 또는 여러 period | 후속 |

애니메이션 replay는 별도 모드가 아니라 Focus 안의 재생 기능이다. 실시간 모니터링은 없다.

## Focus

```text
┌ Top View (선택 Component·Material 강조, facet별 Evidence 표시) ────────┐
├ Gantt: Component lane × 시간 (Holding Site lane으로 펼침) ─────────────┤
│ pm-a ▓▓▓▓▓░░░▓▓▓▓    ▓ observed  ░ derived  ╳ unknown  │ 커서 │
│ ll-a ▓▓  ▓▓   ▓▓                                        │     │
├ [Occurrence 목록] [Data Quality] [근거 상세] ──────────────────────────┤
```

- Top View · Gantt · 목록이 **하나의 커서**를 공유한다. Gantt가 진단의 주 도구, Top View는 공간 맥락·선택.
- Gantt 막대는 Occurrence 종류로 색, Evidence는 패턴(빗금 등)으로 구분 — 색만으로 구분하지 않는다. Time Anomaly·Watermark 이후·Binding 경계는 lane 전체에 걸친 마커.
- 기본 구간 = 진입 Occurrence 구간 + 앞뒤 여유, 사용자 조정 가능. 재생 커서 `at`은 page-local 상태.
- 재생(play/pause/speed/step, sequence 단위 디버그 step)은 [`REPLAY-CONTRACT.md`](REPLAY-CONTRACT.md) 규칙을 따른다.
- 목록의 원본 참조는 `recordRef`(segment, 파일, Record Sequence)까지. 원본 줄 열람은 플랫폼 Debug/RawSource 권한이 채우는 링크 슬롯.

## Aggregate

- 지표는 이 저장소 밖(플랫폼 mart; context_recognized_parser docs/23 제안 1 점유, 2 이송 분포, 5 신뢰도)에서 계산해 **Component Metric**으로 받는다.
- Component Metric은 원천 alias(또는 from/to alias 쌍) 기준으로 들어오고, core가 Binding의 Mapping Version으로 Component / Holding Site / Transfer Capability에 대응시킨다. 대응 안 되는 지표는 "미매핑 지표" 패널.
- 인코딩: Component는 heatmap 채움, Transfer Capability는 선 굵기(건수) + 라벨(P95). 표본 수가 적거나 품질(`exactRatio` 낮음, `unlinkedRatio` 높음)이 나쁜 값은 빗금 처리하고 수치와 함께 품질을 툴팁에 표시.

```ts
type ComponentMetric = {
  equipmentId: string;
  period: { from: SiteWallClock; to: SiteWallClock; timeDomain: string };
  target:
    | { kind: 'alias'; moduleAlias: string; slotAlias?: string }
    | { kind: 'transfer'; from: { moduleAlias: string; slotAlias?: string }; to: { moduleAlias: string; slotAlias?: string } };
  metricId: string;            // 예: 'physical-occupancy-ratio', 'transfer-duration-p95'
  value: number; unit: string;
  sampleSize: number;
  quality: { exactRatio?: number; unlinkedRatio?: number };
};
```

`equipmentId`와 `period`가 행마다 있어 Compare 모드(여러 장비·여러 기간)를 계약 변경 없이 받는다.

## Journey

- wafer journey 하나의 경유지를 레이아웃 위 **이산 hop**(번호 붙은 점)으로 표시하고 목록을 병기. 경로 궤적·이동 애니메이션은 그리지 않는다.
- Handler 위 구간은 Handler Component에 hop으로 표시(`derived`).
- 물리 경유 순서(Visit, arrival Record Sequence)와 실행 이력(FNC/PostProcess 포함)은 다른 시퀀스다 — 목록에서 탭으로 분리.

## Compare (2차)

같은 Template 장비는 Component ID가 같으므로(`pm-a`는 어느 장비에서나 `pm-a`) small multiples·기간 차이를 Component 단위로 바로 정렬할 수 있다. 구현은 Aggregate 이후.
