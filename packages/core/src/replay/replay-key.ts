import { canonicalJson, sha256Hex } from '../canonical.js';
import { layoutRevision } from '../layout/revision.js';
import type { Binding } from '../mapping/schema.js';
import type { OccurrenceBatch } from '../occurrence/schema.js';
import type { SceneState } from '../scene/schema.js';
import type { SiteWallClock } from '../site-wall-clock.js';
import { RULESET_VERSION, assertReplayInput, bindingLayout, type ReplayInput } from './reduce.js';

export type ReplayKey = {
  binding: Binding | null;
  layoutHash: string | null;
  mappingHash: string | null;
  rulesetVersion: string; dataGeneration: string;
  observationHash: string;
  t: SiteWallClock;
};
// Hash of the observed record set, whatever the array order (ids are unique within each array; see assertBatchRecords).
export function observationHash(batch: OccurrenceBatch): Promise<string> {
  const byId = (a: { id: string }, b: { id: string }) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  return sha256Hex(canonicalJson({ ...batch, occurrences: [...batch.occurrences].sort(byId), issues: [...batch.issues].sort(byId) }));
}
export async function replayKey(input: ReplayInput, t: SiteWallClock): Promise<ReplayKey> {
  assertReplayInput(input);
  const binding = input.bindings.bindings.find((b) => b.effectiveFrom <= t && (b.effectiveTo === undefined || t < b.effectiveTo));
  const layout = bindingLayout(input, binding);
  const layoutHash = layout ? await layoutRevision(layout) : null;
  if (binding?.layoutRevision !== undefined && layoutHash !== null && layoutHash !== binding.layoutRevision) {
    throw new RangeError(`layoutRevisions[${binding.layoutRevision}] has content hash ${layoutHash}`);
  }
  const mapping = binding && input.mappings.find((m) => m.hash === binding.mappingHash && m.layoutId === binding.layoutId && m.equipmentId === input.bindings.equipmentId);
  return { binding: binding ? { ...binding } : null, layoutHash,
    mappingHash: mapping?.hash ?? null, rulesetVersion: RULESET_VERSION, dataGeneration: input.batch.dataGeneration,
    observationHash: await observationHash(input.batch), t };
}
export function sceneStateHash(state: SceneState): Promise<string> {
  return sha256Hex(canonicalJson(state));
}
