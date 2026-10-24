// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  expect(screen.getByText(/^Watermark 이후/).className).toContain('text-text-warning-label');
});

it('reads an unlocated wafer as 위치 미확인 with unknown location evidence and observed identity (10:05:30)', () => {
  const state = stateAt(time('10:05:30'));
  render(<><CursorStateList state={state} /><EvidenceDetail batch={batch} state={state} selectedOccurrenceId="occ-tm-out" /></>);
  const materialRow = within(screen.getByRole('table', { name: '물질' })).getByRole('row', { name: /wafer W01/ });
  const materialCells = within(materialRow).getAllByRole('cell');
  expect(within(materialRow).getByRole('rowheader').textContent).toBe('wafer W01');
  expect(materialCells.map((cell) => cell.textContent)).toEqual(['위치 미확인', '미확인', '관측']);
  const detail = within(screen.getByRole('region', { name: '근거 상세 occ-tm-out' }));
  const locationLabel = detail.getByText('위치', { exact: true });
  const identityLabel = detail.getByText('식별', { exact: true });
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
const ids = () => Array.from(document.querySelectorAll('tbody tr[data-occurrence-id]')).map((tr) => tr.getAttribute('data-occurrence-id'));
const props2 = { timeline, bindings: null, appliedSeq: 1, onSelectOccurrence: vi.fn() };
const tabStops = () => document.querySelectorAll('tbody tr[tabindex="0"]');
const active = () => document.activeElement?.getAttribute('data-occurrence-id');

// jsdom has no layout, so the virtualizer sees a 0-size region and renders no row. Mocked: offsetHeight (region 480, rows 32) and
// offsetWidth give a window of ~15 rows plus overscan; scrollHeight and Element.scrollTo (sets scrollTop, fires `scroll`) serve scrolls after mount.
describe('large lists are virtualized', () => {
  const savedScrollTo = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTo');
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) { return this.getAttribute('role') === 'region' ? 480 : 32; });
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800);
    vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockReturnValue(10_000_000);
    Object.defineProperty(Element.prototype, 'scrollTo', {
      configurable: true,
      writable: true,
      value: function (this: Element, options?: ScrollToOptions | number) {
        this.scrollTop = typeof options === 'object' ? options.top ?? 0 : 0;
        this.dispatchEvent(new Event('scroll'));
      },
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    if (savedScrollTo) Object.defineProperty(Element.prototype, 'scrollTo', savedScrollTo);
    else delete (Element.prototype as { scrollTo?: unknown }).scrollTo;
  });

  it('opens a 2,000-Occurrence list on the cursor row with a bounded window and no cap notice, and follows the selection', () => {
    const props = { batch: many(2000), timeline, bindings: null, onSelectOccurrence: vi.fn() };
    const { rerender } = render(<OccurrenceList {...props} appliedSeq={2 * 1000 + 1} selectedOccurrenceId={null} />);
    expect(ids()).toContain('occ-gen-1000');
    expect(ids().length).toBeLessThan(60);
    expect(screen.getByRole('grid', { name: 'Occurrence 목록' }).getAttribute('aria-rowcount')).toBe('2001');
    expect(screen.queryByRole('status')).toBeNull();
    rerender(<OccurrenceList {...props} appliedSeq={2 * 1000 + 1} selectedOccurrenceId="occ-gen-1700" />);
    expect(ids()).toContain('occ-gen-1700');
    expect(ids().length).toBeLessThan(60);
  });

  it('opens on the selection when there is one, ahead of the anchor and the cursor', () => {
    render(<OccurrenceList {...props2} batch={many(2000)} appliedSeq={2 * 1999 + 1} anchorOccurrenceId="occ-gen-1000" selectedOccurrenceId="occ-gen-300" />);
    expect(ids()).toContain('occ-gen-300');
    expect(ids()).not.toContain('occ-gen-1000');
  });

  it('opens on the anchor Occurrence, also when it is untimed and the cursor is elsewhere', () => {
    render(<OccurrenceList {...props2} batch={many(2000)} appliedSeq={2 * 1999 + 1} anchorOccurrenceId="occ-gen-1000" selectedOccurrenceId={null} />);
    expect(ids()).toContain('occ-gen-1000');
    expect(ids().length).toBeLessThan(60);
  });

  it('does not follow the cursor after mount', () => {
    const props = { ...props2, batch: many(2000), selectedOccurrenceId: null };
    const { rerender } = render(<OccurrenceList {...props} appliedSeq={1} />);
    rerender(<OccurrenceList {...props} appliedSeq={2 * 1500 + 1} />);
    expect(ids()).toContain('occ-gen-0');
    expect(ids()).not.toContain('occ-gen-1500');
  });

  it.each([['End', 'occ-gen-1999'], ['Home', 'occ-gen-0'], ['ArrowDown', 'occ-gen-1001'], ['ArrowUp', 'occ-gen-999']])(
    '%s from the selected row moves focus to %s, scrolling it into the window first; one Tab stop remains', (key, to) => {
      render(<OccurrenceList {...props2} batch={many(2000)} selectedOccurrenceId="occ-gen-1000" />);
      const from = document.querySelector<HTMLElement>('tr[data-occurrence-id="occ-gen-1000"]')!;
      from.focus();
      fireEvent.keyDown(from, { key });
      expect(active()).toBe(to);
      expect(ids()).toContain(to);
      expect(tabStops().length).toBe(1);
    });

  it('moves the single Tab stop to the first rendered row once the caret row has scrolled out', () => {
    render(<OccurrenceList {...props2} batch={many(2000)} selectedOccurrenceId="occ-gen-1000" />);
    const from = document.querySelector<HTMLElement>('tr[data-occurrence-id="occ-gen-1000"]')!;
    from.focus();
    fireEvent.keyDown(from, { key: 'End' });
    expect(ids()).not.toContain('occ-gen-1000');
    expect(tabStops().length).toBe(1);
    expect(document.querySelector('tbody tr[tabindex="0"]')?.getAttribute('data-occurrence-id')).toBe('occ-gen-1999');
    const view = screen.getByRole('region', { name: 'Occurrence 목록' });
    act(() => { view.scrollTo({ top: 0 }); });
    expect(tabStops().length).toBe(1);
    expect(document.querySelector('tbody tr[tabindex="0"]')?.getAttribute('data-occurrence-id')).toBe(ids()[0]);
  });

  it.each([['Home', 'occ-gen-0', 'occ-gen-1000'], ['End', 'occ-gen-1999', 'occ-gen-1000']])(
    'repeating %s after the caret row has been scrolled out focuses %s again; one Tab stop remains', (key, to, from) => {
      render(<OccurrenceList {...props2} batch={many(2000)} selectedOccurrenceId={from} />);
      const row = document.querySelector<HTMLElement>(`tr[data-occurrence-id="${from}"]`)!;
      row.focus();
      fireEvent.keyDown(row, { key });
      expect(active()).toBe(to);
      const view = screen.getByRole('region', { name: 'Occurrence 목록' });
      act(() => { view.scrollTo({ top: key === 'Home' ? 800 * 32 : 0 }); });
      expect(ids()).not.toContain(to);
      const first = document.querySelector<HTMLElement>('tbody tr[tabindex="0"]')!;
      first.focus();
      fireEvent.keyDown(first, { key });
      expect(ids()).toContain(to);
      expect(active()).toBe(to);
      expect(tabStops().length).toBe(1);
    });

  it('shows the cursor row of a 2,000-issue Data Quality list, bounded, and keeps the related-Occurrence buttons', () => {
    const issues = Array.from({ length: 2000 }, (_, i) => ({ id: `dqi-${i}`, issueType: 'unmatched-end', seq: i + 1, at: null, relatedOccurrenceId: `occ-${i}` }));
    const onSelect = vi.fn();
    render(<DataQualityList timeline={{ issues } as unknown as typeof timeline} appliedSeq={1000} onSelectOccurrence={onSelect} />);
    expect(screen.getByText('dqi-999')).toBeTruthy();
    expect(screen.getAllByRole('row').length).toBeLessThan(60);
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '관련 Occurrence occ-999 선택' }));
    expect(onSelect).toHaveBeenCalledWith('occ-999');
  });

  it('renders a 50,000-Occurrence window as a bounded list', () => {
    const big = many(50_000);
    const t0 = performance.now();
    render(<OccurrenceList {...props2} batch={big} appliedSeq={2 * 25_000 + 1} selectedOccurrenceId={null} />);
    console.info(`50k OccurrenceList mount: ${Math.round(performance.now() - t0)} ms, ${ids().length} rows`);
    expect(ids()).toContain('occ-gen-25000');
    expect(ids().length).toBeLessThan(60);
  });
});
