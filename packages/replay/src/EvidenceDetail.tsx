import { RULESET_VERSION, type Boundary, type OccurrenceBatch, type SceneState } from '@eqv/core';
import { ACTIVITY_KO, EVIDENCE_KO, LEVEL_KO, NO_TIME, UNKNOWN_LANE } from './words.js';

export interface EvidenceDetailProps {
  batch: OccurrenceBatch;
  /** Scene State at the cursor. */
  state: SceneState;
  selectedOccurrenceId: string | null;
}

function boundary(label: string, b: Boundary | null) {
  if (b === null) return <p>{label}: 열림 (끝 Record 없음)</p>;
  return (
    <p>
      {label}: {b.at ?? NO_TIME} · Record Sequence {b.seq} · 근거 {LEVEL_KO[b.evidence]}{b.reason === undefined ? '' : ` · 사유 ${b.reason}`}
    </p>
  );
}

export function EvidenceDetail({ batch, state, selectedOccurrenceId }: EvidenceDetailProps) {
  if (selectedOccurrenceId === null) return <p className="eqv-rp-empty">Occurrence를 선택하세요</p>;
  const o = batch.occurrences.find((candidate) => candidate.id === selectedOccurrenceId);
  if (!o) return <p className="eqv-rp-empty">Occurrence {selectedOccurrenceId}를 찾을 수 없습니다</p>;
  const material = state.materials.find((m) => m.occurrenceId === o.id);
  const component = state.components.find((c) => c.occurrenceIds.includes(o.id));
  return (
    <section className="eqv-rp-detail" aria-label={`근거 상세 ${o.id}`}>
      <h3>{o.id} <small>{o.kind}</small></h3>
      <h4>위치</h4>
      {material && (
        <p>
          {material.location === null ? UNKNOWN_LANE
            : `${material.location.componentId}${material.location.holdingSiteId === undefined ? '' : ` / ${material.location.holdingSiteId}`}`}
          {' '}· 위치 근거 {EVIDENCE_KO[material.locationEvidence]}
        </p>
      )}
      {component && (
        <p>활동 {ACTIVITY_KO[component.activity as keyof typeof ACTIVITY_KO]} · {component.componentId} · 활동 근거 {EVIDENCE_KO[component.activityEvidence]}</p>
      )}
      {!material && !component && <p>이 시점에 열려 있지 않음</p>}
      <h4>식별</h4>
      {o.material
        ? <p>{o.material.kind} {o.material.id ?? '익명'} · 식별 근거 {material ? EVIDENCE_KO[material.identityEvidence] : `${LEVEL_KO[o.material.identityEvidence]} (원본)`}</p>
        : <p>물질 없음</p>}
      <h4>경계</h4>
      {boundary('시작', o.start)}
      {boundary('끝', o.end)}
      <h4>출처</h4>
      <p>synthetic: {o.synthetic ? '예' : '아니오'}</p>
      <p>Mapping Version: {state.binding?.mappingHash ?? '—'}</p>
      <p>Ruleset: {RULESET_VERSION}</p>
    </section>
  );
}
