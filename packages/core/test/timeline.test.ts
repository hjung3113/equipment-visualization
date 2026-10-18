import { readFileSync, readdirSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  bindingsFileSchema, layoutDocumentSchema, mappingVersionSchema, millisToWallClock, occurrenceBatchSchema,
  replayTimeline, seekSceneState, wallClockToMillis, type ReplayInput, type SiteWallClock,
} from '../src/index.js';

const root = new URL('../../../fixtures/cluster-single/', import.meta.url);
const read = (path: string): unknown => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const time = (value: string): SiteWallClock => `2026-01-01T${value}.000`;
const input = (): ReplayInput => {
  const layout = layoutDocumentSchema.parse(read('layout.json'));
  if (layout.kind !== 'equipment-layout') throw new Error('Expected equipment layout');
  const directory = 'onboarding/mappings/eq-synth-01/';
  return { batch: occurrenceBatchSchema.parse(read('occurrence-batch.json')), layouts: [layout],
    bindings: bindingsFileSchema.parse(read('onboarding/bindings/eq-synth-01.bindings.json')),
    mappings: readdirSync(new URL(directory, root)).sort().map((file) => mappingVersionSchema.parse(read(directory + file))) };
};
const data = input();
const window = { from: data.batch.from, to: data.batch.to };
const timeline = replayTimeline(data, window);
const without = <T extends object>(value: T, ...keys: string[]) =>
  Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
const covers = (t: SiteWallClock) => <S extends { from: SiteWallClock; to: SiteWallClock }>(span: S) => span.from <= t && t < span.to;

it('agrees with seekSceneState at breakpoints, before the end, and inside every gap', () => {
  const instants = new Set<SiteWallClock>([...timeline.breakpoints, millisToWallClock(wallClockToMillis(window.to) - 1)]);
  const marks = [...timeline.breakpoints, window.to];
  marks.slice(1).forEach((b, i) => {
    const a = wallClockToMillis(marks[i]!);
    const gap = wallClockToMillis(b) - a;
    if (gap >= 2) instants.add(millisToWallClock(a + Math.floor(gap / 2)));
  });
  expect(instants.size).toBeGreaterThan(timeline.breakpoints.length);
  for (const t of instants) {
    const state = seekSceneState(data, t);
    const at = covers(t);
    expect(timeline.materials.filter(at).map((span) => without(span, 'from', 'to')),
      `materials at ${t}`).toEqual(state.materials.map((m) => without(m, 'lastObservedAt')));
    expect(timeline.activities.filter(at).map((span) => without(span, 'from', 'to')),
      `activities at ${t}`).toEqual(state.components.filter((c) => c.activity !== 'no recorded activity'));
    expect(timeline.markers.filter(at).map((span) => span.marker), `markers at ${t}`).toEqual(state.markers);
  }
});

it('breaks at the Binding switch and one millisecond after the Watermark, inside the range', () => {
  expect(timeline.breakpoints).toContain(time('10:04:30'));
  expect(timeline.breakpoints).toContain('2026-01-01T10:25:00.001');
  expect(timeline.breakpoints[0]).toBe(window.from);
  expect(timeline.breakpoints.every((t) => window.from <= t && t < window.to)).toBe(true);
  expect(timeline.bindingBoundaries).toEqual([time('10:04:30')]);
});

it('answer key: Binding switch, open Occurrence after the Watermark, occupancy conflict', () => {
  const handler = timeline.materials.filter((m) => m.occurrenceId === 'occ-tm-out');
  expect(handler.at(0)).toMatchObject({ location: { componentId: 'tm-robot' }, locationEvidence: 'derived', to: time('10:04:30') });
  expect(handler.at(-1)).toMatchObject({ from: time('10:04:30'), location: null, locationEvidence: 'unknown' });

  const open = timeline.materials.filter((m) => m.occurrenceId === 'occ-open');
  expect(open.at(-1)).toMatchObject({ from: '2026-01-01T10:25:00.001', to: window.to, locationEvidence: 'unknown' });

  const conflict = timeline.markers.filter((s) => s.marker.kind === 'occupancy-conflict');
  expect(conflict.length).toBeGreaterThan(0);
  expect(conflict[0]!.marker).toMatchObject({ componentId: 'll-a', holdingSiteId: 'slot-1' });
  const lla = timeline.materials.filter((m) => m.occurrenceId.startsWith('occ-lla-conflict-'));
  for (const span of conflict) {
    const both = lla.filter((m) => m.from < span.to && span.from < m.to);
    expect(new Set(both.map((m) => m.occurrenceId)).size).toBe(2);
  }
});

it('restores mid-entry state for a sub-range without a snapshot', () => {
  const sub = replayTimeline(data, { from: time('10:05:00'), to: time('10:07:00') });
  expect(sub.breakpoints[0]).toBe(time('10:05:00'));
  expect(sub.bindingBoundaries).toEqual([]);
  const first = sub.materials.filter((m) => m.from === time('10:05:00'));
  const state = seekSceneState(data, time('10:05:00'));
  expect(first.length).toBeGreaterThan(0);
  expect(first.map((m) => m.key)).toEqual(state.materials.map((m) => m.key));
});

it('rejects an empty or reversed range and foreign equipment', () => {
  expect(() => replayTimeline(data, { from: time('10:05:00'), to: time('10:05:00') })).toThrow(RangeError);
  expect(() => replayTimeline(data, { from: time('10:06:00'), to: time('10:05:00') })).toThrow(RangeError);
  const foreign = { ...data, bindings: { ...data.bindings, equipmentId: 'eq-other' } };
  expect(() => replayTimeline(foreign, window)).toThrow(RangeError);
  expect(() => replayTimeline(foreign, window)).toThrow('must match batch.equipmentId');
});

it('uses no time API in src', () => {
  for (const file of ['../src/replay/timeline.ts', '../src/site-wall-clock.ts', '../src/occurrence/window.ts']) {
    expect(readFileSync(new URL(file, import.meta.url), 'utf8')).not.toMatch(/\bDate\b|getTime|toISOString|\bIntl\b/);
  }
});
