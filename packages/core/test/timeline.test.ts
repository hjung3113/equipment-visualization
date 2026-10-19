import { readFileSync, readdirSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  bindingsFileSchema, canonicalJson, layoutDocumentSchema, mappingVersionSchema, millisToWallClock, occurrenceBatchSchema,
  replayTimeline, replayTimelineFrame, seekSceneState, wallClockToMillis, type MappingVersion, type ReplayInput, type ReplayTimeline,
  type SiteWallClock, type TimelineRange,
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

const importRoot = new URL('../../../fixtures/import/', import.meta.url);
const importInput = (name: string): ReplayInput => {
  const batch = occurrenceBatchSchema.parse(JSON.parse(readFileSync(new URL(`eq-synth-03.${name}.batch.json`, importRoot), 'utf8')));
  return { batch, layouts: [], bindings: { schemaVersion: '0.4', equipmentId: batch.equipmentId, bindings: [] }, mappings: [] };
};
const w1 = importInput('w1');
const w2 = importInput('w2');

it.each([
  ['cluster-single, whole range', data, window],
  ['cluster-single, Binding switch, Watermark, open Occurrence, occupancy conflict', data, { from: time('10:05:00'), to: time('10:11:00') }],
  ['import w1 (open Occurrence, at: null, inverted boundary, 2 DQIs)', w1, { from: w1.batch.from, to: w1.batch.to }],
  ['import w2', w2, { from: w2.batch.from, to: w2.batch.to }],
])('replayTimelineFrame equals the frame fields of replayTimeline: %s', (_name, replayInput, range) => {
  const { breakpoints, bindingBoundaries, issues } = replayTimeline(replayInput, range);
  expect(replayTimelineFrame(replayInput, range)).toEqual({ range, breakpoints, bindingBoundaries, issues });
});

it('replayTimelineFrame rejects an empty range and foreign equipment like replayTimeline', () => {
  expect(() => replayTimelineFrame(data, { from: time('10:05:00'), to: time('10:05:00') })).toThrow(RangeError);
  expect(() => replayTimelineFrame({ ...data, bindings: { ...data.bindings, equipmentId: 'eq-other' } }, window)).toThrow('must match batch.equipmentId');
});

it('uses no time API in src', () => {
  for (const file of ['../src/replay/timeline.ts', '../src/site-wall-clock.ts', '../src/occurrence/window.ts']) {
    expect(readFileSync(new URL(file, import.meta.url), 'utf8')).not.toMatch(/\bDate\b|getTime|toISOString|\bIntl\b/);
  }
});

// Oracle: the timeline as it was defined before the one-pass rewrite, one `seekSceneState` sample per breakpoint
// and the same run-length merge. `replayTimeline` must equal it exactly, down to key order.
function sampledTimeline(replayInput: ReplayInput, range: TimelineRange): ReplayTimeline {
  type Span = { from: SiteWallClock; to: SiteWallClock };
  const strip = (value: object, ...keys: string[]) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
  const cmp = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
  const ids = (m: { kind: string; [key: string]: unknown }): string[] => {
    switch (m.kind) {
      case 'after-watermark': return [m.kind, m['watermarkAt'] as string];
      case 'occupancy-conflict': return [m.kind, m['componentId'] as string, m['holdingSiteId'] as string];
      case 'time-anomaly': return [m.kind, m['occurrenceId'] as string];
      default: return [m.kind, m['alias'] as string, m['occurrenceId'] as string];
    }
  };
  const cmpIds = (a: string[], b: string[]) => {
    for (let i = 0; i < Math.min(a.length, b.length); i++) { const order = cmp(a[i]!, b[i]!); if (order) return order; }
    return 0;
  };
  const { breakpoints, bindingBoundaries, issues } = replayTimelineFrame(replayInput, range);
  const open = { materials: new Map<string, any>(), activities: new Map<string, any>(), markers: new Map<string, any>() };
  const done = { materials: [] as any[], activities: [] as any[], markers: [] as any[] };
  const place = (group: Map<string, any>, finished: any[], identity: string, from: SiteWallClock, to: SiteWallClock, next: object, seen: Set<string>) => {
    seen.add(identity);
    const current = group.get(identity);
    if (current) {
      if (canonicalJson(strip(current, 'from', 'to')) === canonicalJson(next)) { current.to = to; return; }
      finished.push(current);
    }
    group.set(identity, { ...next, from, to });
  };
  const close = (group: Map<string, Span>, finished: Span[], seen: Set<string>) => {
    for (const [identity, span] of group) {
      if (seen.has(identity)) continue;
      finished.push(span);
      group.delete(identity);
    }
  };
  breakpoints.forEach((from, i) => {
    const to = breakpoints[i + 1] ?? range.to;
    const state = seekSceneState(replayInput, from);
    const seen = { materials: new Set<string>(), activities: new Set<string>(), markers: new Set<string>() };
    for (const placed of state.materials) {
      const material = strip(placed, 'lastObservedAt') as { key: string };
      place(open.materials, done.materials, material.key, from, to, material, seen.materials);
    }
    for (const component of state.components) {
      if (component.activity === 'no recorded activity') continue;
      place(open.activities, done.activities, component.componentId, from, to, component, seen.activities);
    }
    for (const marker of state.markers) place(open.markers, done.markers, canonicalJson(ids(marker)), from, to, { marker }, seen.markers);
    close(open.materials, done.materials, seen.materials);
    close(open.activities, done.activities, seen.activities);
    close(open.markers, done.markers, seen.markers);
  });
  return { range, breakpoints,
    materials: [...done.materials, ...open.materials.values()].sort((a, b) => cmp(a.key, b.key) || cmp(a.from, b.from)),
    activities: [...done.activities, ...open.activities.values()].sort((a, b) => cmp(a.componentId, b.componentId) || cmp(a.from, b.from)),
    markers: [...done.markers, ...open.markers.values()].sort((a, b) => cmpIds(ids(a.marker), ids(b.marker)) || cmp(a.from, b.from)),
    bindingBoundaries, issues };
}
const sameAsSampled = (replayInput: ReplayInput, range: TimelineRange) =>
  expect(JSON.stringify(replayTimeline(replayInput, range))).toBe(JSON.stringify(sampledTimeline(replayInput, range)));

it.each([
  ['cluster-single, whole range', data, window],
  ['cluster-single, a sub-range across the Binding switch', data, { from: time('10:03:00'), to: time('10:11:00') }],
  ['cluster-single, a sub-range after the Watermark', data, { from: time('10:26:00'), to: time('10:29:00') }],
  ['import w1', w1, { from: w1.batch.from, to: w1.batch.to }],
  ['import w2', w2, { from: w2.batch.from, to: w2.batch.to }],
])('replayTimeline equals sampling seekSceneState per breakpoint: %s', (_name, replayInput, range) => sameAsSampled(replayInput, range));

// mulberry32: a tiny seeded PRNG, so the random batches are the same on every run.
const prng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
};
const EQUIPMENT = 'eq-rand';
const mappingFiles = readdirSync(new URL('onboarding/mappings/eq-synth-01/', root)).sort();
const randomInput = (seed: number): ReplayInput => {
  const rnd = prng(seed);
  const int = (n: number) => Math.floor(rnd() * n);
  const pick = <T,>(items: readonly T[]): T => items[int(items.length)]!;
  const maybe = (p: number) => rnd() < p;
  const mappings = mappingFiles.map((file) => ({ ...(mappingVersionSchema.parse(read('onboarding/mappings/eq-synth-01/' + file)) as MappingVersion), equipmentId: EQUIPMENT }));
  const aliases = mappings[0]!.entries.map((entry) => entry.alias);
  const from = time('10:00:00');
  const to = time('10:00:30');
  const at = (second: number): SiteWallClock => millisToWallClock(wallClockToMillis(from) + second * 1000 + (maybe(0.3) ? 500 : 0));

  const count = 3 + int(10);
  const issueCount = int(4);
  // Record Sequences 1..M in a random order, then each Occurrence's end is moved after its start (start.seq < end.seq).
  const total = 2 * count + issueCount;
  const seqs = Array.from({ length: total }, (_, i) => i + 1);
  for (let i = total - 1; i > 0; i--) { const j = int(i + 1); [seqs[i], seqs[j]] = [seqs[j]!, seqs[i]!]; }
  const chaos = pick([0, 0.15, 1]);
  const boundary = (seq: number, nullable: boolean) => {
    // Mostly time grows with the sequence (ties from the coarse grid); `chaos` of the records get a random instant instead.
    const second = maybe(chaos) ? int(32) - 1 : Math.floor((seq / total) * 30);
    return { at: nullable && maybe(0.12) ? null : at(second), seq, evidence: pick(['observed', 'observed', 'derived', 'illustrative', 'unknown'] as const) };
  };
  const place = () => {
    const slot = pick(['1', '1', '2', '3', 'x', undefined]);
    return { moduleAlias: maybe(0.1) ? 'ALIAS_NOT_MAPPED' : pick(aliases), ...(slot === undefined ? {} : { slotAlias: slot }) };
  };
  const occurrences = Array.from({ length: count }, (_, i) => {
    let [a, b] = [seqs[2 * i]!, seqs[2 * i + 1]!];
    if (a > b) [a, b] = [b, a];
    const kind = pick(['PROCESS', 'POST_PROCESS', 'FUNCTION', 'TRANSFER', 'VISIT', 'CARRIER_PRESENCE'] as const);
    const wafer = pick(['W1', 'W2', 'W3', null]);
    return { id: `occ-${i}`, equipmentId: EQUIPMENT, kind, start: i === 0 ? { ...boundary(a, false), at: null } : boundary(a, true),
      end: maybe(0.25) ? null : boundary(b, true), location: place(), synthetic: maybe(0.15),
      source: { parserContractVersion: 'synthetic-1', dataGeneration: 'g1' },
      ...(maybe(0.8) ? { material: { kind: pick(['wafer', 'wafer', 'carrier'] as const), id: wafer, identityEvidence: pick(['observed', 'derived', 'unknown'] as const) } } : {}),
      ...(kind === 'TRANSFER' ? { from: place(), to: place() } : {}) };
  });
  const issues = Array.from({ length: issueCount }, (_, i) => ({ id: `dqi-${i}`, equipmentId: EQUIPMENT, issueType: 'UnmatchedEnd',
    seq: seqs[2 * count + i]!, at: maybe(0.2) ? null : at(int(30)) }));
  const batch = occurrenceBatchSchema.parse({ equipmentId: EQUIPMENT, from, to, timeDomain: 'site-synth', parserContractVersion: 'synthetic-1',
    dataGeneration: 'g1', watermark: { seq: total + 1, at: pick([at(int(30)), at(30), to, time('10:01:00')]) }, occurrences, issues });

  // Two Bindings, the boundary inside the range; the hashes are drawn in either order, and a gap sometimes separates them.
  const [first, second] = maybe(0.5) ? mappings : [...mappings].reverse();
  const switchAt = at(5 + int(20));
  const gap = maybe(0.3) ? 1000 : 0;
  const bindings = bindingsFileSchema.parse({ schemaVersion: '0.4', equipmentId: EQUIPMENT, bindings: [
    { layoutId: 'eq-synth-01-layout', mappingHash: first!.hash, effectiveFrom: '2026-01-01T09:00:00.000', effectiveTo: switchAt },
    { layoutId: 'eq-synth-01-layout', mappingHash: second!.hash, effectiveFrom: millisToWallClock(wallClockToMillis(switchAt) + gap) },
  ] });
  return { batch, layouts: data.layouts, bindings, mappings };
};

it('replayTimeline equals sampling seekSceneState per breakpoint: 200 seeded random batches', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const random = randomInput(seed);
    const rnd = prng(seed * 7919);
    const a = wallClockToMillis(random.batch.from) + Math.floor(rnd() * 20000);
    const sub = { from: millisToWallClock(a), to: millisToWallClock(a + 500 + Math.floor(rnd() * 9000)) };
    for (const range of [{ from: random.batch.from, to: random.batch.to }, sub]) {
      try { sameAsSampled(random, range); } catch (error) { throw new Error(`seed ${seed}, ${range.from}..${range.to}: ${(error as Error).message.slice(0, 300)}`); }
    }
  }
});
