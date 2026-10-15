import type { SiteWallClock } from '../site-wall-clock.js';
import type { BindingsFile, MappingVersion, Resolution } from './schema.js';

export function resolveLocation(input: {
  bindings: BindingsFile; mappings: MappingVersion[]; alias: string; slot?: string; at: SiteWallClock;
}): Resolution {
  const binding = input.bindings.bindings.find((binding) => binding.effectiveFrom <= input.at &&
    (binding.effectiveTo === undefined || input.at < binding.effectiveTo));
  if (!binding) return { kind: 'unknown', reason: 'no-binding' };
  const mapping = input.mappings.find((mapping) => mapping.hash === binding.mappingHash);
  if (!mapping) return { kind: 'unknown', reason: 'missing-mapping' };
  const entry = mapping.entries.find((entry) => entry.alias === input.alias);
  if (!entry) return { kind: 'unknown', reason: 'unmapped-alias' };
  if ('ignore' in entry.target) return { kind: 'ignored', mappingHash: mapping.hash };
  const location = { kind: 'location' as const, componentId: entry.target.componentId,
    certainty: entry.certainty, mappingHash: mapping.hash, layoutId: binding.layoutId };
  if (input.slot === undefined || !entry.target.slots) return { ...location, slotStatus: 'none' };
  if (!/^[+-]?[0-9]+$/.test(input.slot)) return { ...location, slotStatus: 'unmapped' };
  // BigInt preserves integer slots beyond Number's exact range; no rounding into a valid site.
  const slot = BigInt(input.slot) + BigInt(entry.target.slots.offset);
  const assignment = entry.target.slots.assign.find((range) => slot >= BigInt(range.from) && slot <= BigInt(range.to));
  return assignment ? { ...location, slotStatus: 'mapped', holdingSiteId: assignment.holdingSiteId }
    : { ...location, slotStatus: 'unmapped' };
}
