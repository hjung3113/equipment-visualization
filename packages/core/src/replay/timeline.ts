import type { DataQualityIssue } from '../occurrence/schema.js';
import type { SceneComponent, SceneMarker, SceneMaterial } from '../scene/schema.js';
import { canonicalJson } from '../canonical.js';
import { millisToWallClock, wallClockToMillis, type SiteWallClock } from '../site-wall-clock.js';
import { assertReplayInput, seekSceneState, type ReplayInput } from './reduce.js';

export type TimelineRange = { from: SiteWallClock; to: SiteWallClock };
// `to` is clipped to `range.to`; whether an Occurrence is open or ended there comes from the batch (join on `occurrenceId`).
type Span = { from: SiteWallClock; to: SiteWallClock };
export type MaterialSpan = Span & Omit<SceneMaterial, 'lastObservedAt'>;
export type ActivitySpan = Span & SceneComponent;
export type MarkerSpan = Span & { marker: SceneMarker };
export type ReplayTimeline = {
  range: TimelineRange;
  breakpoints: SiteWallClock[];
  materials: MaterialSpan[];
  activities: ActivitySpan[];
  markers: MarkerSpan[];
  bindingBoundaries: SiteWallClock[];
  issues: DataQualityIssue[];
};

const without = <T extends object, K extends keyof T>(value: T, ...keys: K[]): Omit<T, K> =>
  Object.fromEntries(Object.entries(value).filter(([key]) => !(keys as string[]).includes(key))) as Omit<T, K>;
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const LAST = '9999-12-31T23:59:59.999';
const plusOneMilli = (t: SiteWallClock): SiteWallClock | null => t >= LAST ? null : millisToWallClock(wallClockToMillis(t) + 1);
// Same order as the reducer's marker sort (reduce.ts), so spans read like a Scene State.
const markerIds = (m: SceneMarker): string[] => {
  switch (m.kind) {
    case 'after-watermark': return [m.kind, m.watermarkAt];
    case 'occupancy-conflict': return [m.kind, m.componentId, m.holdingSiteId];
    case 'time-anomaly': return [m.kind, m.occurrenceId];
    case 'unmapped-alias': return [m.kind, m.alias, m.occurrenceId];
  }
};
const compareIds = (a: string[], b: string[]) => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const order = compare(a[i]!, b[i]!);
    if (order) return order;
  }
  return 0;
};

// Run-length encoding of `seekSceneState`: sample it at every instant where the sought state can change
// (see `breakpoints`) and merge equal adjacent samples. No reducer rule is re-implemented here.
export function replayTimeline(input: ReplayInput, range: TimelineRange): ReplayTimeline {
  assertReplayInput(input);
  if (!(range.from < range.to)) throw new RangeError(`range.from (${range.from}) must be before range.to (${range.to})`);
  const inRange = (t: SiteWallClock) => range.from <= t && t < range.to;
  const { batch } = input;

  const records = [
    ...batch.occurrences.flatMap((o) => [o.start, ...(o.end ? [o.end] : [])]),
    ...batch.issues,
  ].sort((a, b) => a.seq - b.seq);
  const timed = records.flatMap((r) => r.at === null ? [] : [r.at]);
  const candidates: (SiteWallClock | null)[] = [range.from, ...timed, plusOneMilli(batch.watermark.at)];
  for (const { effectiveFrom, effectiveTo } of input.bindings.bindings) {
    candidates.push(effectiveFrom);
    if (effectiveTo !== undefined) candidates.push(effectiveTo);
  }
  for (let i = 1; i < timed.length; i++) {
    if (timed[i]! < timed[i - 1]!) candidates.push(plusOneMilli(timed[i - 1]!));
  }
  const breakpoints = [...new Set(candidates.filter((t): t is SiteWallClock => t !== null && inRange(t)))].sort(compare);

  const open = { materials: new Map<string, MaterialSpan>(), activities: new Map<string, ActivitySpan>(), markers: new Map<string, MarkerSpan>() };
  const done = { materials: [] as MaterialSpan[], activities: [] as ActivitySpan[], markers: [] as MarkerSpan[] };
  // Extend the open span for `identity` when the content is unchanged, else close it and start a new one.
  const place = <T extends Span>(group: Map<string, T>, finished: T[], identity: string, from: SiteWallClock, to: SiteWallClock,
    next: Omit<T, 'from' | 'to'>, seen: Set<string>) => {
    seen.add(identity);
    const current = group.get(identity);
    if (current) {
      if (canonicalJson(without(current, 'from', 'to')) === canonicalJson(next)) { current.to = to; return; }
      finished.push(current);
    }
    group.set(identity, { ...next, from, to } as T);
  };
  const close = <T extends Span>(group: Map<string, T>, finished: T[], seen: Set<string>) => {
    for (const [identity, span] of group) {
      if (seen.has(identity)) continue;
      finished.push(span);
      group.delete(identity);
    }
  };

  breakpoints.forEach((from, i) => {
    const to = breakpoints[i + 1] ?? range.to;
    const state = seekSceneState(input, from);
    const seen = { materials: new Set<string>(), activities: new Set<string>(), markers: new Set<string>() };
    for (const placed of state.materials) {
      const material = without(placed, 'lastObservedAt');
      place(open.materials, done.materials, material.key, from, to, material, seen.materials);
    }
    for (const component of state.components) {
      if (component.activity === 'no recorded activity') continue;
      place(open.activities, done.activities, component.componentId, from, to, component, seen.activities);
    }
    for (const marker of state.markers) {
      place(open.markers, done.markers, canonicalJson(markerIds(marker)), from, to, { marker }, seen.markers);
    }
    close(open.materials, done.materials, seen.materials);
    close(open.activities, done.activities, seen.activities);
    close(open.markers, done.markers, seen.markers);
  });

  const materials = [...done.materials, ...open.materials.values()].sort((a, b) => compare(a.key, b.key) || compare(a.from, b.from));
  const activities = [...done.activities, ...open.activities.values()]
    .sort((a, b) => compare(a.componentId, b.componentId) || compare(a.from, b.from));
  const markers = [...done.markers, ...open.markers.values()]
    .sort((a, b) => compareIds(markerIds(a.marker), markerIds(b.marker)) || compare(a.from, b.from));
  const boundaries = input.bindings.bindings.flatMap((b) => [b.effectiveFrom, ...(b.effectiveTo === undefined ? [] : [b.effectiveTo])]);
  const bindingBoundaries = [...new Set(boundaries.filter((t) => range.from < t && t < range.to))].sort(compare);
  const issues = batch.issues.filter((issue) => issue.at === null || inRange(issue.at)).sort((a, b) => a.seq - b.seq);
  return { range, breakpoints, materials, activities, markers, bindingBoundaries, issues };
}
