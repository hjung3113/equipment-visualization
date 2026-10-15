import type { ObservedInventory } from '../inventory/schema.js';
import type { EquipmentLayoutDocument } from '../layout/schema.js';
import type { MappingVersion } from '../mapping/schema.js';
import { transfersWithoutCapability } from './conflicts.js';
import { compareSlots, compareText } from './order.js';
import { assertOnboardingTuple } from './tuple.js';

export type Drift = {
  newAliases: string[];
  newSlots: { alias: string; slot: string }[];
  transfersWithoutCapability: ReturnType<typeof transfersWithoutCapability>;
};
export function detectDrift(input: {
  baseline: ObservedInventory; current: ObservedInventory; mapping: MappingVersion; layout: EquipmentLayoutDocument;
}): Drift {
  assertOnboardingTuple(input.mapping, { baseline: input.baseline, current: input.current }, input.layout);
  const baseline = new Map(input.baseline.aliases.map((row) => [row.alias, new Set(row.slots)]));
  const newAliases: string[] = [];
  const newSlots: Drift['newSlots'] = [];
  for (const row of input.current.aliases) {
    const slots = baseline.get(row.alias);
    if (!slots) newAliases.push(row.alias);
    for (const slot of row.slots) if (!slots?.has(slot)) newSlots.push({ alias: row.alias, slot });
  }
  return {
    newAliases: newAliases.sort(compareText),
    newSlots: newSlots.sort((a, b) => compareText(a.alias, b.alias) || compareSlots(a.slot, b.slot)),
    transfersWithoutCapability: transfersWithoutCapability({ inventory: input.current, mapping: input.mapping, layout: input.layout }),
  };
}
