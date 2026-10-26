import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { activeBinding, type BindingsFile, type Occurrence, type OccurrenceBatch, type ReplayTimeline } from '@eqv/core';
import { Inbox } from 'lucide-react';
import { DataTable } from '@eqv/ui';
import { EmptyState, StatusBadge } from '@ap/ui';
import { LEVEL_KO, NO_TIME, wallClockText } from './words.js';

export interface OccurrenceListProps {
  batch: OccurrenceBatch;
  timeline: Pick<ReplayTimeline, 'range'>;
  bindings: BindingsFile | null;
  /** `SceneState.appliedSeq` at the cursor: a row is `진행 중` when the reducer holds it open there. */
  appliedSeq: number | null;
  selectedOccurrenceId: string | null;
  /** The route's entry Occurrence: the list opens on it while nothing is selected, also when it is untimed or shares its time. */
  anchorOccurrenceId?: string | null;
  onSelectOccurrence: (id: string) => void;
  /** Platform link slot; the standalone Studio passes none. */
  renderRecordRef?: (occurrence: Occurrence) => ReactNode;
}

const alias = (a: { moduleAlias: string; slotAlias?: string | undefined }) => a.slotAlias === undefined ? a.moduleAlias : `${a.moduleAlias} / ${a.slotAlias}`;
const COLUMNS = [
  { id: 'time', header: '원시 시각', className: 'whitespace-nowrap' },
  { id: 'sequence', header: 'Record Sequence', align: 'end', className: 'whitespace-nowrap' },
  { id: 'kind', header: '종류' },
  { id: 'target', header: '대상' },
  { id: 'evidence', header: '근거' },
  { id: 'mapping-version', header: 'Mapping Version', className: 'whitespace-nowrap' },
  { id: 'record-ref', header: '원본 참조', className: 'whitespace-nowrap' },
  { id: 'data-quality', header: 'Data Quality' },
] as const;
const MAPPING_PREFIX = 'sha256:'.length + 8;

function target(o: Occurrence): string {
  const where = o.kind === 'TRANSFER' && o.from && o.to ? `${alias(o.from)} → ${alias(o.to)}${o.location ? ` (${alias(o.location)})` : ''}`
    : o.location ? alias(o.location) : '—';
  const material = o.material ? ` · ${o.material.kind} ${o.material.id ?? '익명'}${o.material.lotId === undefined ? '' : ` (${o.material.lotId})`}` : '';
  return where + material;
}

export function OccurrenceList({ batch, timeline, bindings, appliedSeq, selectedOccurrenceId, anchorOccurrenceId = null, onSelectOccurrence, renderRecordRef }: OccurrenceListProps) {
  const { range } = timeline;
  const rows = useMemo(() => batch.occurrences
    .filter((o) => (o.start.at === null || o.start.at < range.to) && (o.end === null || o.end.at === null || o.end.at > range.from))
    .sort((a, b) => a.start.seq - b.start.seq), [batch, range]);
  // The keyboard caret is a row of its own, apart from the selection; a new selection hands the caret back to it.
  const [nav, setNav] = useState<{ id: string; selected: string | null; press: number } | null>(null);
  if (nav !== null && nav.selected !== selectedOccurrenceId) setNav(null);
  // The caret row may still be off-screen when the key is pressed: it takes focus when it mounts.
  const focusId = useRef<string | null>(null);
  const indexOf = (id: string | null | undefined) => id == null ? -1 : rows.findIndex((o) => o.id === id);
  const caretIndex = indexOf(nav?.id);
  const selectedIndex = indexOf(selectedOccurrenceId);
  // The first position of every mount: the selection, else the anchor, else the cursor row. The list does not follow the cursor afterwards.
  const [opening] = useState(() => {
    const anchorIndex = indexOf(anchorOccurrenceId);
    return anchorIndex >= 0 ? anchorIndex : appliedSeq === null ? 0 : Math.max(rows.findLastIndex((o) => o.start.seq <= appliedSeq), 0);
  });
  const scrollTo = caretIndex >= 0 ? caretIndex : selectedIndex >= 0 ? selectedIndex : null;
  const issuesOf = (id: string) => batch.issues.filter((issue) => issue.relatedOccurrenceId === id).map((issue) => issue.id);
  const mappingOf = (o: Occurrence) => {
    const at = o.start.at;
    if (at === null || !bindings) return '—';
    const binding = activeBinding(bindings.bindings, at);
    return binding ? binding.mappingHash.slice(0, MAPPING_PREFIX) : '—';
  };
  const onKey = (event: KeyboardEvent<HTMLTableRowElement>) => {
    const at = Number(event.currentTarget.dataset.index);
    const to = event.key === 'ArrowDown' ? at + 1 : event.key === 'ArrowUp' ? at - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : null;
    const next = to === null ? undefined : rows[to];
    if (!next) return;
    event.preventDefault();
    focusId.current = next.id;
    setNav((prev) => ({ id: next.id, selected: selectedOccurrenceId, press: (prev?.press ?? 0) + 1 }));
  };
  if (rows.length === 0) {
    return <DataTable label="Occurrence 목록" role="grid" columns={COLUMNS} state={
      <EmptyState size="sm" density="compact" icon={<Inbox className="size-4" aria-hidden />} title="이 구간에 겹치는 Occurrence가 없습니다" />
    }>{null}</DataTable>;
  }
  return (
    <DataTable label="Occurrence 목록" role="grid" columns={COLUMNS} rows={{
      count: rows.length,
      getKey: (index) => rows[index]!.id,
      initialIndex: opening,
      scrollToIndex: scrollTo,
      scrollKey: nav?.press ?? 0,
      render: (index, rendered) => {
        const o = rows[index]!;
        const selected = o.id === selectedOccurrenceId;
        const running = appliedSeq !== null && o.start.seq <= appliedSeq && (o.end === null || o.end.seq > appliedSeq);
        const issues = issuesOf(o.id);
        // Roving tabindex: the caret row, else the selected row, else the first rendered row is the one Tab stop.
        const stop = [caretIndex, selectedIndex].find((i) => i >= rendered.start && i <= rendered.end) ?? rendered.start;
        return (
          <DataTable.Row data-occurrence-id={o.id} selected={selected} tabIndex={index === stop ? 0 : -1}
            ref={(el: HTMLTableRowElement | null) => { if (el !== null && focusId.current === o.id) { focusId.current = null; el.focus(); } }}
            onActivate={() => onSelectOccurrence(o.id)} onKeyDown={onKey}>
            <DataTable.Cell className="whitespace-nowrap">
              <div>시작 {o.start.at === null ? NO_TIME : wallClockText(o.start.at)}</div>
              <div>끝 {o.end === null ? '열림' : o.end.at === null ? NO_TIME : wallClockText(o.end.at)}</div>
              {running && <StatusBadge tone="info" dot>진행 중</StatusBadge>}
            </DataTable.Cell>
            <DataTable.Cell numeric>{o.start.seq} / {o.end?.seq ?? '—'}</DataTable.Cell>
            <DataTable.Cell>{o.kind}</DataTable.Cell>
            <DataTable.Cell>{target(o)}</DataTable.Cell>
            <DataTable.Cell>
              시작 {LEVEL_KO[o.start.evidence]} · 끝 {o.end ? LEVEL_KO[o.end.evidence] : '—'}
              {o.material && <> · 식별 {LEVEL_KO[o.material.identityEvidence]}</>}
              {o.synthetic && <> · 합성</>}
            </DataTable.Cell>
            <DataTable.Cell mono>{mappingOf(o)}</DataTable.Cell>
            <DataTable.Cell>{o.source.recordRef ?? '—'}{renderRecordRef?.(o)}</DataTable.Cell>
            <DataTable.Cell>{issues.length ? issues.join(', ') : '—'}</DataTable.Cell>
          </DataTable.Row>
        );
      },
    }} />
  );
}
