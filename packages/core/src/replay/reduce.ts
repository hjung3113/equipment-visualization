import type { EquipmentLayoutDocument } from '../layout/schema.js';
import { resolveLocation } from '../mapping/resolve.js';
import type { BindingsFile, MappingVersion } from '../mapping/schema.js';
import type { EvidenceLevel, Occurrence, OccurrenceBatch } from '../occurrence/schema.js';
import { assertBatchRecords } from '../occurrence/validate.js';
import type { SceneComponent, SceneMarker, SceneMaterial, SceneState } from '../scene/schema.js';
import type { SiteWallClock } from '../site-wall-clock.js';

export const RULESET_VERSION = 'scene-rules-1';
export type ReplayInput = {
  batch: OccurrenceBatch; layouts: EquipmentLayoutDocument[]; bindings: BindingsFile; mappings: MappingVersion[];
};
export function assertReplayInput(input: ReplayInput): void {
  const equipmentId = input.batch.equipmentId;
  if (input.bindings.equipmentId !== equipmentId) {
    throw new RangeError(`bindings.equipmentId (${input.bindings.equipmentId}) must match batch.equipmentId (${equipmentId})`);
  }
  assertBatchRecords(input.batch);
  // An unfinished page can omit a record that would change a facet (e.g. a second occupant), so replay
  // needs the complete batch; assembling pages is the caller's job.
  if (input.batch.continuationToken !== undefined) {
    throw new RangeError('batch.continuationToken is set: replay needs the complete OccurrenceBatch');
  }
}
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
type Record = { seq: number; at: SiteWallClock | null; owner?: Occurrence };
function records(input: ReplayInput): Record[] {
  return [
    ...input.batch.occurrences.flatMap((owner) => [
      { ...owner.start, owner }, ...(owner.end ? [{ ...owner.end, owner }] : []),
    ]),
    ...input.batch.issues.map(({ seq, at }) => ({ seq, at })),
  ].sort((a, b) => a.seq - b.seq);
}
const evidence = (value: EvidenceLevel): SceneMaterial['identityEvidence'] => value === 'illustrative' ? 'unknown' : value;
const cap = (value: SceneMaterial['identityEvidence'], assumed: boolean) => assumed && value === 'observed' ? 'derived' : value;

export function seekSceneState(input: ReplayInput, t: SiteWallClock): SceneState {
  assertReplayInput(input);
  const all = records(input);
  const stop = all.findIndex((record) => record.at !== null && record.at > t);
  return reduce(input, t, all, stop === -1 ? all : all.slice(0, stop));
}
export function stepSceneState(input: ReplayInput, seq: number): SceneState {
  assertReplayInput(input);
  const all = records(input);
  const prefix = all.filter((record) => record.seq <= seq);
  const t = prefix.filter((record) => record.at !== null).at(-1)?.at ?? input.batch.from;
  return reduce(input, t, all, prefix);
}
function reduce(input: ReplayInput, t: SiteWallClock, all: Record[], prefix: Record[]): SceneState {
  const binding = input.bindings.bindings.find((b) => b.effectiveFrom <= t && (b.effectiveTo === undefined || t < b.effectiveTo));
  const layout = binding && input.layouts.find((l) => l.id === binding.layoutId);
  const resolve = (o: Occurrence) => resolveLocation({ bindings: input.bindings, mappings: input.mappings,
    alias: o.location!.moduleAlias, ...(o.location!.slotAlias === undefined ? {} : { slot: o.location!.slotAlias }), at: t });
  const anomalies = new Set<string>();
  const timed = all.filter((r): r is Record & { at: SiteWallClock } => r.at !== null);
  for (let i = 1; i < timed.length; i++) {
    const previous = timed[i - 1]!;
    const current = timed[i]!;
    if (current.at < previous.at && current.at <= t && t <= previous.at) {
      for (const record of [previous, current]) {
        if (record.owner && !(record.owner.location && resolve(record.owner).kind === 'ignored')) anomalies.add(record.owner.id);
      }
    }
  }
  const markers: SceneMarker[] = [...anomalies].map((occurrenceId) => ({ kind: 'time-anomaly', occurrenceId }));
  const afterWatermark = t > input.batch.watermark.at;
  if (afterWatermark) markers.push({ kind: 'after-watermark', watermarkAt: input.batch.watermark.at });
  const appliedSeq = prefix.at(-1)?.seq ?? null;
  const open = input.batch.occurrences.filter((o) => appliedSeq !== null && o.start.seq <= appliedSeq &&
    (o.end === null || o.end.seq > appliedSeq)).sort((a, b) => a.start.seq - b.start.seq);
  const materials = new Map<string, SceneMaterial>();
  const activities = new Map<string, { occurrence: Occurrence; evidence: SceneComponent['activityEvidence'] }[]>();
  for (const o of open) {
    if (!o.location) continue;
    const resolution = resolve(o);
    const previousSegment = !binding || o.start.at === null || o.start.at < binding.effectiveFrom;
    const unknown = afterWatermark || anomalies.has(o.id) || previousSegment;
    const resolved = layout && resolution.kind === 'location' ? resolution : undefined;
    if (resolved && ['PROCESS', 'POST_PROCESS', 'FUNCTION'].includes(o.kind)) {
      const entries = activities.get(resolved.componentId) ?? [];
      entries.push({ occurrence: o, evidence: unknown ? 'unknown' : cap(evidence(o.start.evidence), resolved.certainty === 'assumed') });
      activities.set(resolved.componentId, entries);
    }
    if (!o.material) continue;
    const key = o.material.id === null ? `o:${o.id}` : `m:${o.material.kind}:${o.material.id}`;
    // Select the latest placement before deciding whether its alias is displayed.
    materials.delete(key);
    if (layout && !previousSegment && resolution.kind === 'ignored') continue;
    if (layout && !previousSegment && resolution.kind === 'unknown' && resolution.reason === 'unmapped-alias') {
      markers.push({ kind: 'unmapped-alias', alias: o.location.moduleAlias, occurrenceId: o.id });
    }
    const location = !previousSegment && resolved ? { componentId: resolved.componentId,
      ...(resolved.holdingSiteId === undefined ? {} : { holdingSiteId: resolved.holdingSiteId }) } : null;
    materials.set(key, { key, kind: o.material.kind, id: o.material.id, identityEvidence: evidence(o.material.identityEvidence),
      ...(o.material.lotId === undefined ? {} : { lotId: o.material.lotId }), alias: { ...o.location }, location,
      locationEvidence: !location || unknown ? 'unknown' : cap(o.kind === 'TRANSFER' || o.synthetic ? 'derived' : 'observed', resolved!.certainty === 'assumed'),
      occurrenceId: o.id, lastObservedAt: o.start.at });
  }
  const placed = [...materials.values()].sort((a, b) => compare(a.key, b.key));
  const occupancy = new Map<string, SceneMaterial[]>();
  for (const material of placed) {
    if (material.location?.holdingSiteId === undefined) continue;
    const key = JSON.stringify([material.location.componentId, material.location.holdingSiteId]);
    const group = occupancy.get(key) ?? [];
    group.push(material);
    occupancy.set(key, group);
  }
  for (const group of occupancy.values()) {
    if (group.length < 2) continue;
    const location = group[0]!.location!;
    markers.push({ kind: 'occupancy-conflict', componentId: location.componentId, holdingSiteId: location.holdingSiteId!, materialKeys: group.map((m) => m.key) });
    for (const material of group) material.locationEvidence = 'unknown';
  }
  const components: SceneComponent[] = (layout?.components ?? []).map((c): SceneComponent => {
    const entries = activities.get(c.id) ?? [];
    const selected = entries.at(-1);
    const kinds = { PROCESS: 'processing', POST_PROCESS: 'post-processing', FUNCTION: 'function' } as const;
    return { componentId: c.id, activity: selected ? kinds[selected.occurrence.kind as keyof typeof kinds] : 'no recorded activity',
      activityEvidence: selected?.evidence ?? 'unknown', occurrenceIds: entries.map((entry) => entry.occurrence.id).sort(compare) };
  }).sort((a, b) => compare(a.componentId, b.componentId));
  const markerIds = (m: SceneMarker): string[] => {
    switch (m.kind) {
      case 'after-watermark': return [m.kind, m.watermarkAt];
      case 'occupancy-conflict': return [m.kind, m.componentId, m.holdingSiteId];
      case 'time-anomaly': return [m.kind, m.occurrenceId];
      case 'unmapped-alias': return [m.kind, m.alias, m.occurrenceId];
    }
  };
  markers.sort((a, b) => {
    const left = markerIds(a);
    const right = markerIds(b);
    for (let i = 0; i < left.length; i++) {
      const order = compare(left[i]!, right[i]!);
      if (order) return order;
    }
    return 0;
  });
  return { equipmentId: input.batch.equipmentId, at: t, appliedSeq,
    binding: binding ? { layoutId: binding.layoutId, mappingHash: binding.mappingHash } : null,
    materials: placed, components, markers };
}
