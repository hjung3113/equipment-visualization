import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { BindingsFile, Occurrence, OccurrenceBatch, ReplayTimeline } from '@eqv/core';
import { DataTable } from '@eqv/ui';
import { Button } from '@fops/ui';
import { capNotice, rowSlice } from './row-cap.js';
import { LEVEL_KO, NO_TIME } from './words.js';

export interface OccurrenceListProps {
  batch: OccurrenceBatch;
  timeline: Pick<ReplayTimeline, 'range'>;
  bindings: BindingsFile | null;
  /** `SceneState.appliedSeq` at the cursor: a row is `진행 중` when the reducer holds it open there. */
  appliedSeq: number | null;
  selectedOccurrenceId: string | null;
  /** The route's entry Occurrence: a capped list shows it while nothing is selected, also when it is untimed or shares its time. */
  anchorOccurrenceId?: string | null;
  onSelectOccurrence: (id: string) => void;
  /** Platform link slot; the standalone Studio passes none. */
  renderRecordRef?: (occurrence: Occurrence) => ReactNode;
}

const alias = (a: { moduleAlias: string; slotAlias?: string | undefined }) => a.slotAlias === undefined ? a.moduleAlias : `${a.moduleAlias} / ${a.slotAlias}`;
const COLUMNS = ['원시 시각', 'Record Sequence', '종류', '대상', 'Evidence', 'Mapping Version', '원본 참조', 'Data Quality'];
const MAPPING_PREFIX = 'sha256:'.length + 8;

function target(o: Occurrence): string {
  const where = o.kind === 'TRANSFER' && o.from && o.to ? `${alias(o.from)} → ${alias(o.to)}${o.location ? ` (${alias(o.location)})` : ''}`
    : o.location ? alias(o.location) : '—';
  const material = o.material ? ` · ${o.material.kind} ${o.material.id ?? '익명'}${o.material.lotId === undefined ? '' : ` (${o.material.lotId})`}` : '';
  return where + material;
}

export function OccurrenceList({ batch, timeline, bindings, appliedSeq, selectedOccurrenceId, anchorOccurrenceId = null, onSelectOccurrence, renderRecordRef }: OccurrenceListProps) {
  const { range } = timeline;
  const rows = batch.occurrences
    .filter((o) => (o.start.at === null || o.start.at < range.to) && (o.end === null || o.end.at === null || o.end.at > range.from))
    .sort((a, b) => a.start.seq - b.start.seq);
  // Keyboard movement past a slice edge moves the keyboard caret (and the slice with it); the selection stays a separate state.
  // A new selection hands the slice back to the selection.
  const [nav, setNav] = useState<{ id: string; selected: string | null } | null>(null);
  if (nav !== null && nav.selected !== selectedOccurrenceId) setNav(null);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (nav !== null) body.current?.querySelector<HTMLElement>(`tr[data-occurrence-id="${CSS.escape(nav.id)}"]`)?.focus();
  }, [nav]);
  // The jump-back button unmounts on activation; keyboard focus follows the selection instead of dropping to <body>.
  const [jumped, setJumped] = useState(0);
  useEffect(() => {
    if (jumped > 0 && selectedOccurrenceId !== null) body.current?.querySelector<HTMLElement>(`tr[data-occurrence-id="${CSS.escape(selectedOccurrenceId)}"]`)?.focus();
  }, [jumped]);
  const indexOf = (id: string | null) => id === null ? -1 : rows.findIndex((o) => o.id === id);
  const atCursor = appliedSeq === null ? 0 : Math.max(rows.findLastIndex((o) => o.start.seq <= appliedSeq), 0);
  const pinned = indexOf(nav?.id ?? null);
  const selectedIndex = indexOf(selectedOccurrenceId);
  const anchorIndex = indexOf(anchorOccurrenceId);
  const slice = rowSlice(rows.length, pinned >= 0 ? pinned : selectedIndex >= 0 ? selectedIndex : anchorIndex >= 0 ? anchorIndex : atCursor);
  const shown = rows.slice(slice.start, slice.end);
  const selectionHidden = selectedIndex >= 0 && (selectedIndex < slice.start || selectedIndex >= slice.end);
  // Roving tabindex: the caret row, else the selected row, else the first rendered row is the one Tab stop.
  const stopId = [nav?.id, selectedOccurrenceId].find((id) => id != null && shown.some((o) => o.id === id)) ?? shown[0]?.id;
  const issuesOf = (id: string) => batch.issues.filter((issue) => issue.relatedOccurrenceId === id).map((issue) => issue.id);
  const mappingOf = (o: Occurrence) => {
    const at = o.start.at;
    if (at === null || !bindings) return '—';
    const binding = bindings.bindings.find((b) => b.effectiveFrom <= at && (b.effectiveTo === undefined || at < b.effectiveTo));
    return binding ? binding.mappingHash.slice(0, MAPPING_PREFIX) : '—';
  };
  const onKey = (event: KeyboardEvent<HTMLTableRowElement>) => {
    const down = event.key === 'ArrowDown';
    const sibling = down ? event.currentTarget.nextElementSibling : event.key === 'ArrowUp' ? event.currentTarget.previousElementSibling : null;
    if (sibling instanceof HTMLElement) { event.preventDefault(); sibling.focus(); return; }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const next = rows[indexOf(event.currentTarget.dataset.occurrenceId ?? null) + (down ? 1 : -1)];
    if (next) { event.preventDefault(); setNav({ id: next.id, selected: selectedOccurrenceId }); }
  };
  if (rows.length === 0) return <p className="text-text-secondary">이 구간에 겹치는 Occurrence가 없습니다</p>;
  return (
    <div ref={body}>
      {slice.capped && (
        <div role="status" className="mb-2 text-text-secondary">
          <p>{capNotice('Occurrence', rows.length, slice)}</p>
          {selectionHidden && (
            <p className="mt-1 flex items-center gap-2">
              선택한 Occurrence는 표시 범위 밖에 있습니다
              <Button type="button" variant="outline" size="toolbar" onClick={() => { setNav(null); setJumped((n) => n + 1); }}>선택한 Occurrence로 이동</Button>
            </p>
          )}
        </div>
      )}
      <DataTable label="Occurrence 목록" role="grid" columns={COLUMNS}>
        {shown.map((o) => {
          const selected = o.id === selectedOccurrenceId;
          const running = appliedSeq !== null && o.start.seq <= appliedSeq && (o.end === null || o.end.seq > appliedSeq);
          const issues = issuesOf(o.id);
          return (
            <DataTable.Row key={o.id} data-occurrence-id={o.id} selected={selected} tabIndex={o.id === stopId ? 0 : -1}
              onActivate={() => onSelectOccurrence(o.id)} onKeyDown={onKey}>
              <DataTable.Cell className="whitespace-nowrap">
                <div>시작 {o.start.at ?? NO_TIME}</div>
                <div>끝 {o.end === null ? '열림' : o.end.at ?? NO_TIME}</div>
                {running && <strong className="font-semibold text-accent-primary">진행 중</strong>}
              </DataTable.Cell>
              <DataTable.Cell className="whitespace-nowrap">{o.start.seq} / {o.end?.seq ?? '—'}</DataTable.Cell>
              <DataTable.Cell>{o.kind}</DataTable.Cell>
              <DataTable.Cell>{target(o)}</DataTable.Cell>
              <DataTable.Cell>
                시작 {LEVEL_KO[o.start.evidence]} · 끝 {o.end ? LEVEL_KO[o.end.evidence] : '—'}
                {o.material && <> · 식별 {LEVEL_KO[o.material.identityEvidence]}</>}
                {o.synthetic && <> · 합성</>}
              </DataTable.Cell>
              <DataTable.Cell>{mappingOf(o)}</DataTable.Cell>
              <DataTable.Cell>{o.source.recordRef ?? '—'}{renderRecordRef?.(o)}</DataTable.Cell>
              <DataTable.Cell>{issues.length ? issues.join(', ') : '—'}</DataTable.Cell>
            </DataTable.Row>
          );
        })}
      </DataTable>
    </div>
  );
}
