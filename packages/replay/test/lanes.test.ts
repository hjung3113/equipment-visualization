import { expect, it } from 'vitest';
import { buildLanes } from '../src/index.js';
import { equipmentLayout, timeline } from './data.js';

const ids = (expanded: string[]) => buildLanes(timeline, equipmentLayout, new Set(expanded));
const bars = (lane: ReturnType<typeof ids>[number]) => lane.rows.flat();

it('orders lanes by Layout Component, then 위치 미확인; expanding ll-a adds its Holding Site sublanes', () => {
  expect(ids([]).map((l) => l.id)).toEqual(['lp-a', 'efem-1', 'efem-robot', 'll-a', 'tm-1', 'tm-robot', 'pm-a', 'pm-b', '?']);
  expect(ids([]).at(-1)!.label).toBe('위치 미확인');
  expect(ids(['ll-a']).map((l) => l.id)).toEqual(
    ['lp-a', 'efem-1', 'efem-robot', 'll-a', 'll-a/slot-1', 'll-a/slot-2', 'tm-1', 'tm-robot', 'pm-a', 'pm-b', '?']);
});

it('stacks the two overlapping ll-a slot-1 wafers in two rows when expanded, never one row', () => {
  const lane = ids(['ll-a']).find((l) => l.id === 'll-a/slot-1')!;
  const rows = lane.rows.map((row) => row.map((b) => b.occurrenceIds[0]));
  const conflict = rows.filter((row) => row.some((o) => o?.startsWith('occ-lla-conflict-')));
  expect(conflict).toHaveLength(2);
  for (const row of lane.rows) {
    row.slice(1).forEach((bar, i) => expect(row[i]!.to <= bar.from).toBe(true));
  }
});

it('keeps materials of a collapsed Component, and Component-level wafers, in the Component lane', () => {
  const collapsed = ids([]).find((l) => l.id === 'll-a')!;
  expect(bars(collapsed).some((b) => b.occurrenceIds[0] === 'occ-lla-conflict-one')).toBe(true);
  const pmA = ids(['pm-a']).find((l) => l.id === 'pm-a')!;
  expect(bars(pmA).some((b) => b.occurrenceIds[0] === 'occ-pm1-process' && b.kind === 'material')).toBe(true);
});

it('puts materials without a location in 위치 미확인 and builds no Component lanes without a Layout', () => {
  const unknown = ids([]).find((l) => l.id === '?')!;
  expect(bars(unknown).length).toBeGreaterThan(0);
  const noLayout = buildLanes(timeline, null, new Set());
  expect(noLayout.map((l) => l.id)).toEqual(['?']);
  expect(bars(noLayout[0]!).length).toBeGreaterThan(0);
  const nullLocated = new Set(timeline.materials.filter((m) => !m.location).map((m) => m.occurrenceId));
  for (const bar of bars(noLayout[0]!)) expect(nullLocated.has(bar.occurrenceIds[0]!)).toBe(true);
});
