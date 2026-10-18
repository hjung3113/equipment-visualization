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

it('reads an unlocated wafer as 위치 미확인 with unknown location evidence and observed identity (10:05:30)', () => {
  const state = stateAt(time('10:05:30'));
  render(<><CursorStateList state={state} /><EvidenceDetail batch={batch} state={state} selectedOccurrenceId="occ-tm-out" /></>);
  const item = screen.getByText(/^wafer W01:/);
  expect(item.textContent).toBe('wafer W01: 위치 미확인 · 위치 근거 미확인 · 식별 근거 관측');
  const detail = within(screen.getByRole('region', { name: '근거 상세 occ-tm-out' }));
  expect(detail.getByText((_, el) => el?.tagName === 'P' && el.textContent === '위치 미확인 · 위치 근거 미확인')).toBeTruthy();
  expect(detail.getByText((_, el) => el?.tagName === 'P' && /식별 근거 관측$/.test(el.textContent ?? ''))).toBeTruthy();
  expect(detail.getByText(/Mapping Version: sha256:0abf3e9f/)).toBeTruthy();
  expect(screen.queryByText('Watermark 이후', { exact: false })).toBeNull();
});

it('lists Watermark 이후 and an unknown location evidence for the open wafer (10:26:00)', () => {
  const state = stateAt(time('10:26:00'));
  render(<CursorStateList state={state} />);
  expect(screen.getByText(/^Watermark 이후/)).toBeTruthy();
  expect(screen.getByText(/^wafer W11:/).textContent).toBe('wafer W11: pm-b / station-1 · 위치 근거 미확인 · 식별 근거 관측');
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
  const badge = within(screen.getByText(/^시작:/)).getByText(word);
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
  const activity = within(screen.getByText(`${first!.componentId}:`, { exact: false })).getByText(word, { selector: '[data-evidence]' });
  expect(activity.getAttribute('data-evidence')).toBe(level);
  const badges = screen.getAllByText(word, { selector: '[data-evidence]' });
  expect(badges.length).toBeGreaterThanOrEqual(3);
  expect(badges.every((b) => b.getAttribute('data-evidence') === level)).toBe(true);
});
