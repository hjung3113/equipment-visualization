// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { replayTimeline } from '@eqv/core';
import { CursorStateList, DataQualityList, EvidenceDetail, OccurrenceList } from '../src/index.js';
import { batch, input, stateAt, time, timeline } from './data.js';

afterEach(cleanup);

const list = (at: string, over: Partial<Parameters<typeof OccurrenceList>[0]> = {}) => {
  const onSelectOccurrence = vi.fn();
  render(<OccurrenceList batch={batch} timeline={timeline} bindings={input.bindings} appliedSeq={stateAt(time(at)).appliedSeq}
    selectedOccurrenceId={null} onSelectOccurrence={onSelectOccurrence} {...over} />);
  return { onSelectOccurrence };
};
const row = (id: string) => within(document.querySelector(`tr[data-occurrence-id="${id}"]`) as HTMLElement);

it('lists Occurrences overlapping the range in Record Sequence order, including those without a time', () => {
  list('10:06:00', { batch: { ...batch, occurrences: [...batch.occurrences].reverse() } });
  const ids = Array.from(document.querySelectorAll('tbody tr')).map((tr) => tr.getAttribute('data-occurrence-id'));
  const seqs = ids.map((id) => batch.occurrences.find((o) => o.id === id)!.start.seq);
  expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
  expect(ids).toHaveLength(batch.occurrences.length);
  expect(row('occ-null-time').getByText(/시각 없음/)).toBeTruthy();
  cleanup();
  const narrow = replayTimeline(input, { from: time('10:05:00'), to: time('10:11:00') });
  render(<OccurrenceList batch={batch} timeline={narrow} bindings={null} appliedSeq={null} selectedOccurrenceId={null} onSelectOccurrence={vi.fn()} />);
  expect(document.querySelector('tr[data-occurrence-id="occ-open"]')).toBeNull();
  expect(document.querySelector('tr[data-occurrence-id="occ-carrier"]')).not.toBeNull();
});

it('shows facet evidence, the Binding Mapping Version, the Data Quality ids and the record-ref slot', () => {
  list('10:06:00', { renderRecordRef: (o) => <a href={`#${o.id}`}>열기 {o.id}</a> });
  expect(row('occ-time-anomaly').getByText('dqi-end-before-start')).toBeTruthy();
  expect(row('occ-forced').getByText(/끝 파생/)).toBeTruthy();
  expect(row('occ-efem-out').getByText(/sha256:30d2c1a3/)).toBeTruthy();
  expect(row('occ-forced').getByText(/sha256:0abf3e9f/)).toBeTruthy();
  expect(row('occ-null-time').getAllByText('—').length).toBeGreaterThan(0);
  expect(row('occ-pm1-process').getByRole('link', { name: '열기 occ-pm1-process' })).toBeTruthy();
});

it.each([
  ['10:26:00', 'occ-open', true],
  ['10:19:30', 'occ-time-anomaly', false],
  ['10:09:00', 'occ-pm2-slot-one', false],
])('marks rows the reducer holds open at %s: %s → %s', (at, id, running) => {
  list(at);
  expect(row(id).queryByText('진행 중') !== null).toBe(running);
});

it('selects a row on click and marks the selected row', () => {
  const { onSelectOccurrence } = list('10:06:00');
  fireEvent.click(document.querySelector('tr[data-occurrence-id="occ-pm1-process"]')!);
  expect(onSelectOccurrence).toHaveBeenCalledWith('occ-pm1-process');
  cleanup();
  list('10:06:00', { selectedOccurrenceId: 'occ-pm1-process' });
  expect(document.querySelector('tr[aria-selected="true"]')?.getAttribute('data-occurrence-id')).toBe('occ-pm1-process');
  cleanup();
  list('10:06:00', { selectedOccurrenceId: 'occ-not-in-rows' });
  expect(document.querySelector('tbody tr')?.getAttribute('tabindex')).toBe('0');
  expect(document.querySelectorAll('tbody tr[tabindex="0"]')).toHaveLength(1);
});

it.each([
  ['click', (el: HTMLElement) => fireEvent.click(el)],
  ['Enter', (el: HTMLElement) => fireEvent.keyDown(el, { key: 'Enter' })],
  ['Space', (el: HTMLElement) => fireEvent.keyDown(el, { key: ' ' })],
])('activates a row on %s; ArrowDown/ArrowUp move focus between rows', (_name, activate) => {
  const { onSelectOccurrence } = list('10:06:00');
  const rows = Array.from(document.querySelectorAll<HTMLElement>('tbody tr'));
  activate(rows[1]!);
  expect(onSelectOccurrence).toHaveBeenCalledTimes(1);
  expect(onSelectOccurrence).toHaveBeenCalledWith(rows[1]!.getAttribute('data-occurrence-id'));
  rows[1]!.focus();
  fireEvent.keyDown(rows[1]!, { key: 'ArrowDown' });
  expect(document.activeElement).toBe(rows[2]);
  fireEvent.keyDown(rows[2]!, { key: 'ArrowUp' });
  expect(document.activeElement).toBe(rows[1]);
  expect(onSelectOccurrence).toHaveBeenCalledTimes(1);
});

it('lists Data Quality Issues and selects the related Occurrence', () => {
  const onSelectOccurrence = vi.fn();
  render(<DataQualityList timeline={timeline} onSelectOccurrence={onSelectOccurrence} />);
  expect(screen.getAllByRole('row')).toHaveLength(1 + batch.issues.length);
  fireEvent.click(screen.getByRole('button', { name: 'Occurrence occ-time-anomaly 선택'.replace('Occurrence ', '관련 Occurrence ') }));
  expect(onSelectOccurrence).toHaveBeenCalledWith('occ-time-anomaly');
});

it('keeps empty replay lists inside their named DataTable state frames', () => {
  const emptyBatch = { ...batch, occurrences: [] };
  render(<>
    <DataQualityList timeline={{ issues: [] }} onSelectOccurrence={vi.fn()} />
    <OccurrenceList batch={emptyBatch} timeline={timeline} bindings={null} appliedSeq={null} selectedOccurrenceId={null} onSelectOccurrence={vi.fn()} />
  </>);
  screen.getByRole('table', { name: 'Data Quality' });
  screen.getByRole('grid', { name: 'Occurrence 목록' });
  screen.getByText('이 구간에 Data Quality Issue가 없습니다');
  screen.getByText('이 구간에 겹치는 Occurrence가 없습니다');
});

it('presents cursor activities and materials in named tables', () => {
  render(<CursorStateList state={stateAt(time('10:26:00'))} />);
  screen.getByRole('table', { name: 'Component 활동' });
  const materials = screen.getByRole('table', { name: '물질' });
  within(materials).getByRole('row', { name: /wafer W11/ });
  expect(screen.getByText(/^Watermark 이후/).getAttribute('data-tone')).toBe('warning');
});

it('reads an unlocated wafer as 위치 미확인 with unknown location evidence and observed identity (10:05:30)', () => {
  const state = stateAt(time('10:05:30'));
  render(<><CursorStateList state={state} /><EvidenceDetail batch={batch} state={state} selectedOccurrenceId="occ-tm-out" /></>);
  const materialRow = within(screen.getByRole('table', { name: '물질' })).getByRole('row', { name: /wafer W01/ });
  const materialCells = within(materialRow).getAllByRole('cell');
  expect(within(materialRow).getByRole('rowheader').textContent).toBe('wafer W01');
  expect(materialCells.map((cell) => cell.textContent)).toEqual(['위치 미확인', '미확인', '관측']);
  const detail = within(screen.getByRole('region', { name: '근거 상세 occ-tm-out' }));
  const locationLabel = detail.getAllByText('위치', { exact: true }).at(-1)!;
  const identityLabel = detail.getAllByText('식별', { exact: true }).at(-1)!;
  expect(locationLabel.parentElement?.lastElementChild?.textContent).toBe('위치 미확인 · 위치 근거 미확인');
  expect(identityLabel.parentElement?.lastElementChild?.textContent).toBe('wafer W01 · 식별 근거 관측');
  expect(detail.getByText(/^sha256:0abf3e9f/)).toBeTruthy();
  expect(screen.queryByText('Watermark 이후', { exact: false })).toBeNull();
});

it('lists Watermark 이후 and an unknown location evidence for the open wafer (10:26:00)', () => {
  const state = stateAt(time('10:26:00'));
  render(<CursorStateList state={state} />);
  expect(screen.getByText(/^Watermark 이후/)).toBeTruthy();
  const row = within(screen.getByRole('table', { name: '물질' })).getByRole('row', { name: /wafer W11/ });
  expect(within(row).getByRole('rowheader').textContent).toBe('wafer W11');
  expect(within(row).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['pm-b / station-1', '미확인', '관측']);
});

it('says an unselected or closed Occurrence has no location facet instead of guessing', () => {
  const state = stateAt(time('10:26:00'));
  const { rerender } = render(<EvidenceDetail batch={batch} state={state} selectedOccurrenceId={null} />);
  expect(screen.getByText('Occurrence를 선택하세요')).toBeTruthy();
  rerender(<EvidenceDetail batch={batch} state={state} selectedOccurrenceId="occ-pm1-process" />);
  expect(screen.getByText('이 시점에 열려 있지 않음')).toBeTruthy();
});

const LEVELS = [['observed', '관측'], ['derived', '파생'], ['unknown', '미확인']] as const;

it.each([...LEVELS, ['illustrative', '예시'] as const])('EvidenceDetail shows a %s boundary as a badge reading %s', (level, word) => {
  const id = 'occ-pm1-process';
  const changed = { ...batch, occurrences: batch.occurrences.map((o) => o.id === id ? { ...o, start: { ...o.start, evidence: level } } : o) };
  render(<EvidenceDetail batch={changed} state={stateAt(time('10:06:00'))} selectedOccurrenceId={id} />);
  const startLabel = screen.getByText('시작', { exact: true });
  const boundary = startLabel.parentElement?.lastElementChild;
  expect(boundary?.textContent).toContain('· Record Sequence');
  const badge = within(boundary as HTMLElement).getByText(word, { selector: '[data-evidence]' });
  expect(badge.getAttribute('data-evidence')).toBe(level);
});

it.each(LEVELS)('CursorStateList shows %s activity, location and identity evidence as badges reading %s', (level, word) => {
  const base = stateAt(time('10:26:00'));
  const [first, ...rest] = base.components;
  const state = {
    ...base,
    components: [{ ...first!, activity: 'processing' as const, activityEvidence: level }, ...rest],
    materials: base.materials.map((m) => ({ ...m, locationEvidence: level, identityEvidence: level })),
  };
  render(<CursorStateList state={state} />);
  const activityRow = within(screen.getByRole('table', { name: 'Component 활동' })).getByRole('row', { name: new RegExp(first!.componentId) });
  const activity = within(activityRow).getByText(word, { selector: '[data-evidence]' });
  expect(activity.getAttribute('data-evidence')).toBe(level);
  const badges = screen.getAllByText(word, { selector: '[data-evidence]' });
  expect(badges.length).toBeGreaterThanOrEqual(3);
  expect(badges.every((b) => b.getAttribute('data-evidence') === level)).toBe(true);
});

const many = (count: number) => {
  const base = batch.occurrences.find((o) => o.id === 'occ-pm1-process')!;
  const occurrences = Array.from({ length: count }, (_, i) => ({ ...base, id: `occ-gen-${i}`, start: { ...base.start, at: null, seq: 2 * i + 1 }, end: null }));
  return { ...batch, occurrences, issues: [] };
};
const ids = () => Array.from(document.querySelectorAll('tbody tr')).map((tr) => tr.getAttribute('data-occurrence-id'));
const NOTICE = /Occurrence 2,000개 중 .*번째 500개를 표시합니다/;
// #118: rendering 500 rows of a 2,000-row batch in jsdom takes 5–6 s on a loaded CI runner; #113 (virtualization) removes the cost.
const CAPPED_TIMEOUT = 20_000;

it('caps a large Occurrence list at 500 rows around the cursor row, with a notice, and moves the slice with the selection', () => {
  const big = many(2000);
  const props = { batch: big, timeline, bindings: null, onSelectOccurrence: vi.fn() };
  const { rerender } = render(<OccurrenceList {...props} appliedSeq={2 * 1000 + 1} selectedOccurrenceId={null} />);
  expect(ids()).toHaveLength(500);
  expect(ids()[0]).toBe('occ-gen-750');
  expect(screen.getByRole('status').textContent).toBe('Occurrence 2,000개 중 751–1,250번째 500개를 표시합니다. 커서를 옮기거나 목록에서 위아래로 이동하면 표시 범위가 따라갑니다.');
  rerender(<OccurrenceList {...props} appliedSeq={2 * 1000 + 1} selectedOccurrenceId="occ-gen-1700" />);
  expect(ids()).toContain('occ-gen-1700');
  expect(ids()).toHaveLength(500);
  expect(screen.getByRole('status').textContent).toMatch(NOTICE);
}, CAPPED_TIMEOUT);

it('keeps ArrowDown/ArrowUp working at the edge of a capped slice by moving the slice', () => {
  render(<OccurrenceList batch={many(2000)} timeline={timeline} bindings={null} appliedSeq={1} selectedOccurrenceId={null} onSelectOccurrence={vi.fn()} />);
  expect(ids()[0]).toBe('occ-gen-0');
  expect(ids()).toHaveLength(500);
  const last = document.querySelector<HTMLElement>('tr[data-occurrence-id="occ-gen-499"]')!;
  last.focus();
  fireEvent.keyDown(last, { key: 'ArrowDown' });
  expect(ids()).toContain('occ-gen-500');
  expect(document.activeElement?.getAttribute('data-occurrence-id')).toBe('occ-gen-500');
}, CAPPED_TIMEOUT);

const props2 = { timeline, bindings: null, appliedSeq: 1, onSelectOccurrence: vi.fn() };
const tabStops = () => document.querySelectorAll('tbody tr[tabindex="0"]');

it.each([['ArrowDown', 'occ-gen-500'], ['ArrowUp', 'occ-gen-1499']])(
  'keeps the selection and a Tab stop after %s past a slice edge, and offers a way back to the selection', (key, to) => {
    const selected = key === 'ArrowDown' ? 'occ-gen-0' : 'occ-gen-1999';
    const start = key === 'ArrowDown' ? 0 : 1500;
    render(<OccurrenceList {...props2} batch={many(2000)} selectedOccurrenceId={selected} />);
    const edge = document.querySelector<HTMLElement>(`tr[data-occurrence-id="${key === 'ArrowDown' ? 'occ-gen-499' : 'occ-gen-1500'}"]`)!;
    expect(edge).not.toBeNull();
    edge.focus();
    fireEvent.keyDown(edge, { key });
    expect(document.activeElement?.getAttribute('data-occurrence-id')).toBe(to);
    expect(ids()).not.toContain(selected);
    expect(tabStops().length).toBe(1);
    expect(screen.getByRole('status').textContent).toContain('선택한 Occurrence는 표시 범위 밖에 있습니다');
    fireEvent.click(screen.getByRole('button', { name: '선택한 Occurrence로 이동' }));
    expect(ids()).toContain(selected);
    expect(ids()[0]).toBe(`occ-gen-${start}`);
    expect(document.querySelector('tr[aria-selected="true"]')?.getAttribute('data-occurrence-id')).toBe(selected);
    expect(document.activeElement?.getAttribute('data-occurrence-id')).toBe(selected);
    expect(tabStops().length).toBe(1);
  }, CAPPED_TIMEOUT);

it('centres a capped list on the anchor Occurrence, also when it is untimed and the cursor is elsewhere', () => {
  render(<OccurrenceList {...props2} batch={many(2000)} appliedSeq={2 * 1999 + 1} anchorOccurrenceId="occ-gen-1000" selectedOccurrenceId={null} />);
  expect(ids()).toContain('occ-gen-1000');
  expect(ids()).toHaveLength(500);
}, CAPPED_TIMEOUT);

it('caps the Data Quality list too, around the cursor', () => {
  const issues = Array.from({ length: 2000 }, (_, i) => ({ id: `dqi-${i}`, issueType: 'unmatched-end', seq: i + 1, at: null }));
  render(<DataQualityList timeline={{ issues } as unknown as typeof timeline} appliedSeq={1000} onSelectOccurrence={vi.fn()} />);
  expect(screen.getAllByRole('row')).toHaveLength(501);
  expect(screen.getByText('dqi-999')).toBeTruthy();
  expect(screen.getByRole('status').textContent).toMatch(/Data Quality Issue 2,000개 중 .*번째 500개를 표시합니다/);
}, CAPPED_TIMEOUT);
