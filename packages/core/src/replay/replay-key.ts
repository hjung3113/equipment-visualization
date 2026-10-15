import { canonicalJson, sha256Hex } from '../canonical.js';
import type { Binding } from '../mapping/schema.js';
import type { SceneState } from '../scene/schema.js';
import type { SiteWallClock } from '../site-wall-clock.js';
import { RULESET_VERSION, type ReplayInput } from './reduce.js';

export type ReplayKey = {
  binding: Binding | null;
  layoutHash: string | null;
  mappingHash: string | null;
  rulesetVersion: string; dataGeneration: string;
  observationHash: string;
  t: SiteWallClock;
};
export async function replayKey(input: ReplayInput, t: SiteWallClock): Promise<ReplayKey> {
  const binding = input.bindings.bindings.find((b) => b.effectiveFrom <= t && (b.effectiveTo === undefined || t < b.effectiveTo));
  const layout = binding && input.layouts.find((l) => l.id === binding.layoutId);
  const mapping = binding && input.mappings.find((m) => m.hash === binding.mappingHash && m.layoutId === binding.layoutId && m.equipmentId === input.bindings.equipmentId);
  const byId = (a: { id: string }, b: { id: string }) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  const batch = { ...input.batch, occurrences: [...input.batch.occurrences].sort(byId), issues: [...input.batch.issues].sort(byId) };
  return { binding: binding ? { ...binding } : null, layoutHash: layout ? await sha256Hex(canonicalJson(layout)) : null,
    mappingHash: mapping?.hash ?? null, rulesetVersion: RULESET_VERSION, dataGeneration: input.batch.dataGeneration,
    observationHash: await sha256Hex(canonicalJson(batch)), t };
}
export function sceneStateHash(state: SceneState): Promise<string> {
  return sha256Hex(canonicalJson(state));
}
