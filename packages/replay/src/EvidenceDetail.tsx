import { MousePointerClick, SearchX } from 'lucide-react';
import { EmptyState, FieldRow, PanelSectionTitle } from '@ap/ui';
import { RULESET_VERSION, type Boundary, type OccurrenceBatch, type SceneState } from '@eqv/core';
import { Evidence } from './Evidence.js';
import { ACTIVITY_KO, NO_TIME, UNKNOWN_LANE } from './words.js';

export interface EvidenceDetailProps {
  batch: OccurrenceBatch;
  /** Scene State at the cursor. */
  state: SceneState;
  selectedOccurrenceId: string | null;
}

function boundary(label: string, b: Boundary | null) {
  return (
    <FieldRow label={label} layout="property">
      {b === null ? '열림 (끝 Record 없음)' : <>
        {b.at ?? NO_TIME} · Record Sequence {b.seq} · 근거 <Evidence level={b.evidence} />{b.reason === undefined ? '' : ` · 사유 ${b.reason}`}
      </>}
    </FieldRow>
  );
}

export function EvidenceDetail({ batch, state, selectedOccurrenceId }: EvidenceDetailProps) {
  if (selectedOccurrenceId === null) {
    return <EmptyState size="sm" icon={<MousePointerClick className="size-4" aria-hidden />} title="Occurrence를 선택하세요" />;
  }
  const o = batch.occurrences.find((candidate) => candidate.id === selectedOccurrenceId);
  if (!o) {
    return <EmptyState size="sm" icon={<SearchX className="size-4" aria-hidden />} title={`Occurrence ${selectedOccurrenceId}를 찾을 수 없습니다`} />;
  }
  const material = state.materials.find((m) => m.occurrenceId === o.id);
  const component = state.components.find((c) => c.occurrenceIds.includes(o.id));
  return (
    <section className="text-text-primary" aria-label={`근거 상세 ${o.id}`}>
      <PanelSectionTitle size="tiny">{o.id} <small>{o.kind}</small></PanelSectionTitle>
      {material && (
        <FieldRow label="위치" layout="property">
          {material.location === null ? UNKNOWN_LANE
            : `${material.location.componentId}${material.location.holdingSiteId === undefined ? '' : ` / ${material.location.holdingSiteId}`}`}
          {' '}· 위치 근거 <Evidence level={material.locationEvidence} />
        </FieldRow>
      )}
      {component && (
        <FieldRow label="활동" layout="property">
          {ACTIVITY_KO[component.activity as keyof typeof ACTIVITY_KO]} · {component.componentId} · 활동 근거 <Evidence level={component.activityEvidence} />
        </FieldRow>
      )}
      {!material && !component && <FieldRow label="위치" layout="property">이 시점에 열려 있지 않음</FieldRow>}
      {o.material
        ? <FieldRow label="식별" layout="property">{o.material.kind} {o.material.id ?? '익명'} · 식별 근거 {material ? <Evidence level={material.identityEvidence} /> : <><Evidence level={o.material.identityEvidence} /> (원본)</>}</FieldRow>
        : <FieldRow label="식별" layout="property">물질 없음</FieldRow>}
      <PanelSectionTitle size="tiny">경계</PanelSectionTitle>
      {boundary('시작', o.start)}
      {boundary('끝', o.end)}
      <PanelSectionTitle size="tiny">출처</PanelSectionTitle>
      <FieldRow label="synthetic" layout="property">{o.synthetic ? '예' : '아니오'}</FieldRow>
      <FieldRow label="Mapping Version" layout="property">{state.binding?.mappingHash ?? '—'}</FieldRow>
      <FieldRow label="Ruleset" layout="property">{RULESET_VERSION}</FieldRow>
    </section>
  );
}
