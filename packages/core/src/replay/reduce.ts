import { materialKey, occurrenceKey } from './keys.js';
import { activeBinding } from '../mapping/binding.js';
import type { EquipmentLayoutDocument } from '../layout/schema.js';
import { resolveLocation } from '../mapping/resolve.js';
import { HASH_PATTERN, type Binding, type BindingsFile, type MappingVersion } from '../mapping/schema.js';
import type { EvidenceLevel, Occurrence, OccurrenceBatch } from '../occurrence/schema.js';
import { assertBatchRecords } from '../occurrence/validate.js';
import type { SceneComponent, SceneMarker, SceneMaterial, SceneState } from '../scene/schema.js';
import type { SiteWallClock } from '../site-wall-clock.js';

export const RULESET_VERSION = 'scene-rules-2';
export type ReplayInput = {
  batch: OccurrenceBatch; layouts: EquipmentLayoutDocument[]; bindings: BindingsFile; mappings: MappingVersion[];
  /** Published Layout Revisions by `sha256:<hex>`; the caller verified each key against its content (ADR-0011). */
  layoutRevisions?: Readonly<{ [revision: string]: EquipmentLayoutDocument }>;
};
/**
 * The one Layout lookup (ADR-0011). A Binding that pins `layoutRevision` resolves by that revision only; a revision the
 * input lacks is no Layout, never the `layoutId` Layout. An unpinned Binding resolves by `layoutId` in `layouts`.
 */
export function bindingLayout(input: ReplayInput, binding: Pick<Binding, 'layoutId' | 'layoutRevision'> | null | undefined): EquipmentLayoutDocument | null {
  if (!binding) return null;
  if (binding.layoutRevision !== undefined) return input.layoutRevisions?.[binding.layoutRevision] ?? null;
  return input.layouts.find((l) => l.id === binding.layoutId) ?? null;
}
export function assertReplayInput(input: ReplayInput): void {
  const equipmentId = input.batch.equipmentId;
  if (input.bindings.equipmentId !== equipmentId) {
    throw new RangeError(`bindings.equipmentId (${input.bindings.equipmentId}) must match batch.equipmentId (${equipmentId})`);
  }
  for (const revision of Object.keys(input.layoutRevisions ?? {})) {
    if (!HASH_PATTERN.test(revision)) throw new RangeError(`layoutRevisions key ${revision} must be sha256:<64 lowercase hex>`);
  }
  for (const binding of input.bindings.bindings) {
    const layout = binding.layoutRevision === undefined ? undefined : input.layoutRevisions?.[binding.layoutRevision];
    if (layout && layout.id !== binding.layoutId) {
      throw new RangeError(`layoutRevisions[${binding.layoutRevision}] is Layout ${layout.id}, but the Binding names ${binding.layoutId}`);
    }
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

// What the rules read of the batch that does not depend on the instant: the seq-sorted records and the Time Anomaly
// inversions (each adjacent timed pair, in sequence order, whose time goes backwards). Prepared once per input.
export type Prepared = { all: Record[]; inversions: { previous: Record; current: Record & { at: SiteWallClock } }[] };
export function prepare(input: ReplayInput): Prepared {
  const all = records(input);
  const timed = all.filter((r): r is Record & { at: SiteWallClock } => r.at !== null);
  const inversions: Prepared['inversions'] = [];
  for (let i = 1; i < timed.length; i++) {
    if (timed[i]!.at < timed[i - 1]!.at) inversions.push({ previous: timed[i - 1]!, current: timed[i]! });
  }
  return { all, inversions };
}
// Occurrences started and not ended at `appliedSeq`, in start order.
const openAt = (input: ReplayInput, appliedSeq: number | null) => input.batch.occurrences.filter((o) => appliedSeq !== null &&
  o.start.seq <= appliedSeq && (o.end === null || o.end.seq > appliedSeq)).sort((a, b) => a.start.seq - b.start.seq);

export function seekSceneState(input: ReplayInput, t: SiteWallClock): SceneState {
  assertReplayInput(input);
  const prepared = prepare(input);
  const stop = prepared.all.findIndex((record) => record.at !== null && record.at > t);
  const appliedSeq = (stop === -1 ? prepared.all : prepared.all.slice(0, stop)).at(-1)?.seq ?? null;
  return sceneStateAt(input, t, prepared, appliedSeq, openAt(input, appliedSeq));
}
export function stepSceneState(input: ReplayInput, seq: number): SceneState {
  assertReplayInput(input);
  const prepared = prepare(input);
  const prefix = prepared.all.filter((record) => record.seq <= seq);
  const t = prefix.filter((record) => record.at !== null).at(-1)?.at ?? input.batch.from;
  const appliedSeq = prefix.at(-1)?.seq ?? null;
  return sceneStateAt(input, t, prepared, appliedSeq, openAt(input, appliedSeq));
}
// The one place the Scene State rules live. `open` is the Occurrences open after `appliedSeq`, in start order; the
// caller owns how it got them (a filter for one instant, an incremental set for a timeline pass).
export function sceneStateAt(input: ReplayInput, t: SiteWallClock, prepared: Prepared, appliedSeq: number | null, open: Occurrence[]): SceneState {
  const binding = activeBinding(input.bindings.bindings, t);
  const layout = bindingLayout(input, binding);
  const resolve = (o: Occurrence) => resolveLocation({ bindings: input.bindings, mappings: input.mappings,
    alias: o.location!.moduleAlias, ...(o.location!.slotAlias === undefined ? {} : { slot: o.location!.slotAlias }), at: t });
  const anomalies = new Set<string>();
  for (const { previous, current } of prepared.inversions) {
    if (current.at <= t && t <= previous.at!) {
      for (const record of [previous, current]) {
        if (record.owner && !(record.owner.location && resolve(record.owner).kind === 'ignored')) anomalies.add(record.owner.id);
      }
    }
  }
  const markers: SceneMarker[] = [...anomalies].map((occurrenceId) => ({ kind: 'time-anomaly', occurrenceId }));
  const afterWatermark = t > input.batch.watermark.at;
  if (afterWatermark) markers.push({ kind: 'after-watermark', watermarkAt: input.batch.watermark.at });
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
    const key = o.material.id === null ? occurrenceKey(o.id) : materialKey(o.material.kind, o.material.id);
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
    binding: binding ? { layoutId: binding.layoutId, mappingHash: binding.mappingHash,
      ...(binding.layoutRevision === undefined ? {} : { layoutRevision: binding.layoutRevision }) } : null,
    materials: placed, components, markers };
}
