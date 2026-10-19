import type { EvidenceLevel, Occurrence } from '../occurrence/schema.js';
import type { SceneMaterial, SceneState } from '../scene/schema.js';
import { assertReplayInput, prepare, sceneStateAt, type ReplayInput } from './reduce.js';

export type JourneyEvidence = SceneMaterial['locationEvidence'];
export type JourneyBoundary = { at: Occurrence['start']['at']; seq: number; evidence: JourneyEvidence };
export type JourneyLocation = NonNullable<SceneMaterial['location']>;
export type JourneyHop = {
  number: number;
  alias: SceneMaterial['alias'];
  location: JourneyLocation | null;
  locationEvidence: JourneyEvidence;
  identityEvidence: JourneyEvidence;
  occurrenceIds: string[];
  arrival: JourneyBoundary;
  departure: JourneyBoundary | null;
  layoutId: string | null;
  layoutRevision?: string;
};
export type JourneyExecution = {
  occurrenceId: string;
  kind: 'PROCESS' | 'POST_PROCESS' | 'FUNCTION';
  alias: SceneMaterial['alias'] | null;
  location: JourneyLocation | null;
  locationEvidence: JourneyEvidence;
  identityEvidence: JourneyEvidence;
  start: JourneyBoundary;
  end: JourneyBoundary | null;
};
export type MaterialJourney = { materialKey: string; hops: JourneyHop[]; executions: JourneyExecution[] };

const RANK: Record<JourneyEvidence, number> = { observed: 2, derived: 1, unknown: 0 };
const lowest = (a: JourneyEvidence, b: JourneyEvidence) => RANK[a] <= RANK[b] ? a : b;
// Same reading as the reducer: illustrative is shown as unknown.
const evidence = (value: EvidenceLevel): JourneyEvidence => value === 'illustrative' ? 'unknown' : value;
const boundary = (b: Occurrence['start']): JourneyBoundary => ({ at: b.at, seq: b.seq, evidence: evidence(b.evidence) });
const keyOf = (o: Occurrence) => o.material === undefined ? null
  : o.material.id === null ? `o:${o.id}` : `m:${o.material.kind}:${o.material.id}`;
const ACTIVITY = new Set<Occurrence['kind']>(['PROCESS', 'POST_PROCESS', 'FUNCTION']);

/**
 * One material's physical hops (located Occurrences in Record Sequence order, merged while alias, Location and Layout
 * identity stay equal) and its execution history (PROCESS / POST_PROCESS / FUNCTION). Each sample is the Scene State
 * after the sample's start record, read through `sceneStateAt`; the placement rules are not copied here.
 */
export function materialJourney(input: ReplayInput, materialKey: string): MaterialJourney {
  assertReplayInput(input);
  const prepared = prepare(input);
  const own = input.batch.occurrences.filter((o) => keyOf(o) === materialKey).sort((a, b) => a.start.seq - b.start.seq);
  const cache = new Map<string, SceneState>();
  const state = (o: Occurrence) => {
    const cached = cache.get(o.id);
    if (cached) return cached;
    const seq = o.start.seq;
    const prefix = prepared.all.filter((record) => record.seq <= seq);
    const t = prefix.filter((record) => record.at !== null).at(-1)?.at ?? input.batch.from;
    const open = input.batch.occurrences.filter((x) => x.start.seq <= seq && (x.end === null || x.end.seq > seq))
      .sort((a, b) => a.start.seq - b.start.seq);
    const scene = sceneStateAt(input, t, prepared, prefix.at(-1)?.seq ?? null, open);
    cache.set(o.id, scene);
    return scene;
  };

  const hops: JourneyHop[] = [];
  let last: { identity: string; hop: JourneyHop } | null = null;
  for (const o of own) {
    if (!o.location) continue;
    const scene = state(o);
    const material = scene.materials.find((m) => m.key === materialKey);
    if (!material) continue;
    const layoutId = scene.binding?.layoutId ?? null;
    const layoutRevision = scene.binding?.layoutRevision;
    const identity = JSON.stringify([material.alias.moduleAlias, material.alias.slotAlias ?? null,
      material.location?.componentId ?? null, material.location?.holdingSiteId ?? null, layoutId, layoutRevision ?? null]);
    if (last && last.identity === identity) {
      last.hop.locationEvidence = lowest(last.hop.locationEvidence, material.locationEvidence);
      last.hop.identityEvidence = lowest(last.hop.identityEvidence, material.identityEvidence);
      last.hop.occurrenceIds.push(o.id);
      last.hop.departure = o.end ? boundary(o.end) : null;
      continue;
    }
    const hop: JourneyHop = { number: hops.length + 1, alias: { ...material.alias },
      location: material.location ? { ...material.location } : null,
      locationEvidence: material.locationEvidence, identityEvidence: material.identityEvidence,
      occurrenceIds: [o.id], arrival: boundary(o.start), departure: o.end ? boundary(o.end) : null, layoutId,
      ...(layoutRevision === undefined ? {} : { layoutRevision }) };
    hops.push(hop);
    last = { identity, hop };
  }

  const executions = own.filter((o) => ACTIVITY.has(o.kind)).map((o): JourneyExecution => {
    const sampled = o.location ? state(o).materials.find((m) => m.key === materialKey && m.occurrenceId === o.id) : undefined;
    return { occurrenceId: o.id, kind: o.kind as JourneyExecution['kind'],
      alias: o.location ? { ...o.location } : null,
      location: sampled?.location ? { ...sampled.location } : null,
      locationEvidence: sampled?.locationEvidence ?? 'unknown',
      identityEvidence: evidence(o.material!.identityEvidence),
      start: boundary(o.start), end: o.end ? boundary(o.end) : null };
  });
  return { materialKey, hops, executions };
}
