// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { JourneyExecution, JourneyHop } from '@eqv/core';
import { JourneyExecutionList, JourneyHopList } from '../src/index.js';

afterEach(cleanup);

const hop = (over: Partial<JourneyHop>): JourneyHop => ({
  number: 1, alias: { moduleAlias: 'PM1' }, location: { componentId: 'pm-a' }, locationEvidence: 'observed', identityEvidence: 'observed',
  occurrenceIds: ['a'], arrival: { at: '2026-01-01T10:00:00.250', seq: 4, evidence: 'observed' },
  departure: { at: null, seq: 9, evidence: 'derived' }, layoutId: 'L', ...over,
});
const hops = [
  hop({}),
  hop({ number: 2, alias: { moduleAlias: 'LP1', slotAlias: '1' }, location: { componentId: 'lp-a', holdingSiteId: 'slot-01' }, locationEvidence: 'derived', identityEvidence: 'unknown', departure: null }),
  hop({ number: 3, alias: { moduleAlias: 'PM5' }, location: null, locationEvidence: 'unknown' }),
];
const row = (n: number) => within(document.querySelector(`tr[data-hop="${n}"]`) as HTMLElement);

it('lists a hop per row with location, the three evidence facets and each boundary, labelling an open departure', () => {
  render(<JourneyHopList hops={hops} selectedHop={null} onSelectHop={vi.fn()} renderAction={(h) => <a href={`#${h.number}`}>Focus 열기</a>} />);
  expect(screen.getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['#', '위치', '위치 근거', '식별 근거', '도착', '떠남', '동작']);
  expect(row(1).getByText('pm-a')).toBeTruthy();
  expect(row(1).getByText('10:00:00.250 · seq 4')).toBeTruthy();
  expect(row(1).getByText('시각 없음 · seq 9')).toBeTruthy();
  expect(row(1).getAllByText('관측')).toHaveLength(3);
  expect(row(1).getByText('파생')).toBeTruthy();
  expect(row(2).getByText('lp-a / slot-01')).toBeTruthy();
  expect(row(2).getByText('열림')).toBeTruthy();
  expect(row(2).getAllByText('미확인')).toHaveLength(2);
  expect(row(3).getByText('위치 미확인 (alias PM5)')).toBeTruthy();
  expect(row(3).getByRole('link', { name: 'Focus 열기' })).toBeTruthy();
});

it('selects a hop on activation and marks the selected row', () => {
  const onSelectHop = vi.fn();
  render(<JourneyHopList hops={hops} selectedHop={2} onSelectHop={onSelectHop} />);
  expect(document.querySelector('tr[data-hop="2"]')!.getAttribute('aria-selected')).toBe('true');
  fireEvent.click(document.querySelector('tr[data-hop="3"]')!);
  expect(onSelectHop).toHaveBeenCalledWith(3);
});

const executions: JourneyExecution[] = [
  { occurrenceId: 'p', kind: 'PROCESS', alias: { moduleAlias: 'PM1' }, location: { componentId: 'pm-a' }, locationEvidence: 'observed', identityEvidence: 'observed',
    start: { at: '2026-01-01T10:01:00.000', seq: 3, evidence: 'unknown' }, end: null },
  { occurrenceId: 'pp', kind: 'POST_PROCESS', alias: { moduleAlias: 'PM5' }, location: null, locationEvidence: 'unknown', identityEvidence: 'derived',
    start: { at: null, seq: 5, evidence: 'observed' }, end: { at: null, seq: 6, evidence: 'observed' } },
  { occurrenceId: 'f', kind: 'FUNCTION', alias: null, location: null, locationEvidence: 'unknown', identityEvidence: 'observed',
    start: { at: null, seq: 7, evidence: 'observed' }, end: null },
];

it('lists executions with kind words, unknown locations, evidence badges and an open end', () => {
  render(<JourneyExecutionList executions={executions} />);
  expect(screen.getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['종류', '위치', '위치 근거', '식별 근거', '시작', '끝']);
  const at = (id: string) => within(document.querySelector(`tr[data-occurrence-id="${id}"]`) as HTMLElement);
  expect(at('p').getByText('처리')).toBeTruthy();
  expect(at('p').getByText('열림')).toBeTruthy();
  expect(at('pp').getByText('후처리')).toBeTruthy();
  expect(at('pp').getByText('위치 미확인 (alias PM5)')).toBeTruthy();
  expect(at('f').getByText('기능')).toBeTruthy();
  expect(at('f').getByText('위치 미확인')).toBeTruthy();
  expect(at('p').getByText('10:01:00.000 · seq 3').closest('td')!.textContent).toContain('미확인');
});

it('says so when there is no execution history', () => {
  render(<JourneyExecutionList executions={[]} />);
  expect(screen.getByText('실행 이력이 없습니다')).toBeTruthy();
});
