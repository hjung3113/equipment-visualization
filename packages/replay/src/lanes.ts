import type { EquipmentLayoutDocument, ReplayTimeline, SiteWallClock } from '@eqv/core';
import { UNKNOWN_LANE, type StateEvidence } from './words.js';

export type Bar = {
  id: string;
  kind: 'activity' | 'material';
  /** Open activity Occurrences (activity bars may carry several) or the material's Occurrence. */
  occurrenceIds: string[];
  from: SiteWallClock;
  to: SiteWallClock;
  /** Activity bars: the activity's evidence. Material bars: the location facet's evidence. */
  evidence: StateEvidence;
  /** `processing` | `post-processing` | `function` for activity bars; the material kind for material bars. */
  what: string;
  /** Material id (`null` = anonymous) for material bars. */
  materialId: string | null;
  identityEvidence: StateEvidence | null;
};
export type Lane = {
  id: string;
  label: string;
  componentId: string | null;
  holdingSiteId?: string;
  rows: Bar[][];
};

const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

function stack(bars: Bar[]): Bar[][] {
  const rows: Bar[][] = [];
  for (const bar of [...bars].sort((a, b) => compare(a.from, b.from) || compare(a.to, b.to) || compare(a.id, b.id))) {
    const row = rows.find((r) => r[r.length - 1]!.to <= bar.from);
    if (row) row.push(bar);
    else rows.push([bar]);
  }
  return rows;
}

/**
 * Gantt lanes in Layout Component order, then Components the timeline names that this Layout lacks, then `위치 미확인`.
 * Material bars sit in their Holding Site sublane only while that Component is expanded; otherwise in the Component lane.
 */
export function buildLanes(timeline: ReplayTimeline, layout: EquipmentLayoutDocument | null, expanded: ReadonlySet<string>): Lane[] {
  const components = layout?.components ?? [];
  const known = new Set(components.map((c) => c.id));
  const foreign = new Set<string>();
  for (const span of [...timeline.activities, ...timeline.materials]) {
    const id = 'componentId' in span ? span.componentId : span.location?.componentId;
    if (id && !known.has(id)) foreign.add(id);
  }
  const buckets = new Map<string, Bar[]>();
  const put = (laneId: string, bar: Bar) => buckets.set(laneId, [...(buckets.get(laneId) ?? []), bar]);
  const siteIds = new Map(components.map((c) => [c.id, new Set(c.holdingSites.map((s) => s.id))]));

  for (const a of timeline.activities) {
    put(a.componentId, { id: `a:${a.componentId}:${a.from}`, kind: 'activity', occurrenceIds: a.occurrenceIds, from: a.from, to: a.to,
      evidence: a.activityEvidence, what: a.activity, materialId: null, identityEvidence: null });
  }
  for (const m of timeline.materials) {
    const bar: Bar = { id: `m:${m.key}:${m.from}`, kind: 'material', occurrenceIds: [m.occurrenceId], from: m.from, to: m.to,
      evidence: m.locationEvidence, what: m.kind, materialId: m.id, identityEvidence: m.identityEvidence };
    const { location } = m;
    if (!location) put('?', bar);
    else if (location.holdingSiteId !== undefined && expanded.has(location.componentId) && siteIds.get(location.componentId)?.has(location.holdingSiteId)) {
      put(`${location.componentId}/${location.holdingSiteId}`, bar);
    } else put(location.componentId, bar);
  }

  const lanes: Lane[] = [];
  const add = (lane: Omit<Lane, 'rows'>) => lanes.push({ ...lane, rows: stack(buckets.get(lane.id) ?? []) });
  for (const c of components) {
    add({ id: c.id, label: c.label || c.id, componentId: c.id });
    if (expanded.has(c.id)) {
      for (const s of c.holdingSites) add({ id: `${c.id}/${s.id}`, label: s.label || s.id, componentId: c.id, holdingSiteId: s.id });
    }
  }
  for (const id of [...foreign].sort(compare)) add({ id, label: `${id} (이 Layout에 없음)`, componentId: id });
  add({ id: '?', label: UNKNOWN_LANE, componentId: null });
  return lanes;
}
