import type { KeyboardEvent, ReactNode } from 'react';
import type { BindingsFile, Occurrence, OccurrenceBatch, ReplayTimeline } from '@eqv/core';
import { LEVEL_KO, NO_TIME } from './words.js';

export interface OccurrenceListProps {
  batch: OccurrenceBatch;
  timeline: ReplayTimeline;
  bindings: BindingsFile | null;
  /** `SceneState.appliedSeq` at the cursor: a row is `진행 중` when the reducer holds it open there. */
  appliedSeq: number | null;
  selectedOccurrenceId: string | null;
  onSelectOccurrence: (id: string) => void;
  /** Platform link slot; the standalone Studio passes none. */
  renderRecordRef?: (occurrence: Occurrence) => ReactNode;
}

const alias = (a: { moduleAlias: string; slotAlias?: string | undefined }) => a.slotAlias === undefined ? a.moduleAlias : `${a.moduleAlias} / ${a.slotAlias}`;
const MAPPING_PREFIX = 'sha256:'.length + 8;

function target(o: Occurrence): string {
  const where = o.kind === 'TRANSFER' && o.from && o.to ? `${alias(o.from)} → ${alias(o.to)}${o.location ? ` (${alias(o.location)})` : ''}`
    : o.location ? alias(o.location) : '—';
  const material = o.material ? ` · ${o.material.kind} ${o.material.id ?? '익명'}${o.material.lotId === undefined ? '' : ` (${o.material.lotId})`}` : '';
  return where + material;
}

export function OccurrenceList({ batch, timeline, bindings, appliedSeq, selectedOccurrenceId, onSelectOccurrence, renderRecordRef }: OccurrenceListProps) {
  const { range } = timeline;
  const rows = batch.occurrences
    .filter((o) => (o.start.at === null || o.start.at < range.to) && (o.end === null || o.end.at === null || o.end.at > range.from))
    .sort((a, b) => a.start.seq - b.start.seq);
  const issuesOf = (id: string) => batch.issues.filter((issue) => issue.relatedOccurrenceId === id).map((issue) => issue.id);
  const mappingOf = (o: Occurrence) => {
    const at = o.start.at;
    if (at === null || !bindings) return '—';
    const binding = bindings.bindings.find((b) => b.effectiveFrom <= at && (b.effectiveTo === undefined || at < b.effectiveTo));
    return binding ? binding.mappingHash.slice(0, MAPPING_PREFIX) : '—';
  };
  const onKey = (event: KeyboardEvent<HTMLTableRowElement>, id: string) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectOccurrence(id); return; }
    const sibling = event.key === 'ArrowDown' ? event.currentTarget.nextElementSibling : event.key === 'ArrowUp' ? event.currentTarget.previousElementSibling : null;
    if (sibling instanceof HTMLElement) { event.preventDefault(); sibling.focus(); }
  };
  if (rows.length === 0) return <p className="eqv-rp-empty">이 구간에 겹치는 Occurrence가 없습니다</p>;
  return (
    <div className="eqv-rp-table-scroll" role="region" aria-label="Occurrence 목록 표" tabIndex={0}>
      <table className="eqv-rp-table" role="grid" aria-label="Occurrence 목록">
        <thead>
          <tr>
            <th scope="col">원시 시각</th><th scope="col">Record Sequence</th><th scope="col">종류</th><th scope="col">대상</th>
            <th scope="col">Evidence</th><th scope="col">Mapping Version</th><th scope="col">원본 참조</th><th scope="col">Data Quality</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o, i) => {
            const selected = o.id === selectedOccurrenceId;
            const running = appliedSeq !== null && o.start.seq <= appliedSeq && (o.end === null || o.end.seq > appliedSeq);
            const issues = issuesOf(o.id);
            return (
              <tr key={o.id} data-occurrence-id={o.id} aria-selected={selected} tabIndex={selected || (selectedOccurrenceId === null && i === 0) ? 0 : -1}
                className={selected ? 'eqv-rp-row eqv-rp-row-selected' : 'eqv-rp-row'}
                onClick={() => onSelectOccurrence(o.id)} onKeyDown={(event) => onKey(event, o.id)}>
                <td>
                  <div>시작 {o.start.at ?? NO_TIME}</div>
                  <div>끝 {o.end === null ? '열림' : o.end.at ?? NO_TIME}</div>
                  {running && <strong className="eqv-rp-running">진행 중</strong>}
                </td>
                <td className="eqv-rp-num">{o.start.seq} / {o.end?.seq ?? '—'}</td>
                <td>{o.kind}</td>
                <td>{target(o)}</td>
                <td>
                  시작 {LEVEL_KO[o.start.evidence]} · 끝 {o.end ? LEVEL_KO[o.end.evidence] : '—'}
                  {o.material && <> · 식별 {LEVEL_KO[o.material.identityEvidence]}</>}
                  {o.synthetic && <> · 합성</>}
                </td>
                <td>{mappingOf(o)}</td>
                <td>{o.source.recordRef ?? '—'}{renderRecordRef?.(o)}</td>
                <td>{issues.length ? issues.join(', ') : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
