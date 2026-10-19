import { resolveLocation, wallClockToMillis, type EquipmentLayoutDocument, type ReplayInput, type SceneState } from '@eqv/core';

/** Same shape as the renderer's `IllustrativeGhost`; matched structurally because this package does not import the renderer. */
export interface IllustrativeGhost {
  materialKey: string;
  label: string;
  fromComponentId: string;
  toComponentId: string;
  fraction: number;
}

/**
 * Example-motion ghosts at a Scene State (never log evidence). One ghost per open TRANSFER whose source `from` and `to`
 * both resolve to different Components of `layout` and whose start and end are both observed times around `state.at`:
 * a point between two Component centres, not a trajectory. Anything less certain yields no ghost.
 */
export function illustrativeGhosts(input: ReplayInput, state: SceneState, layout: EquipmentLayoutDocument | null): IllustrativeGhost[] {
  if (!layout) return [];
  const now = wallClockToMillis(state.at);
  const known = new Set(layout.components.map((c) => c.id));
  const resolve = (place: { moduleAlias: string; slotAlias?: string }) => {
    const resolution = resolveLocation({ bindings: input.bindings, mappings: input.mappings, alias: place.moduleAlias,
      ...(place.slotAlias === undefined ? {} : { slot: place.slotAlias }), at: state.at });
    return resolution.kind === 'location' && known.has(resolution.componentId) ? resolution.componentId : null;
  };
  const ghosts: IllustrativeGhost[] = [];
  for (const o of input.batch.occurrences) {
    if (o.kind !== 'TRANSFER' || !o.from || !o.to || !o.end || o.start.at === null || o.end.at === null) continue;
    const start = wallClockToMillis(o.start.at);
    const end = wallClockToMillis(o.end.at);
    if (!(start < end && start <= now && now < end)) continue;
    const material = state.materials.find((m) => m.occurrenceId === o.id);
    if (!material || material.locationEvidence === 'unknown') continue;
    const fromComponentId = resolve(o.from);
    const toComponentId = resolve(o.to);
    if (fromComponentId === null || toComponentId === null || fromComponentId === toComponentId) continue;
    ghosts.push({ materialKey: material.key, label: `${material.kind} ${material.id ?? '익명'}`, fromComponentId, toComponentId,
      fraction: (now - start) / (end - start) });
  }
  return ghosts;
}
