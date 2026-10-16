import type { ObservedInventory } from '../inventory/schema.js';
import type { LayoutDocument } from '../layout/schema.js';
import type { MappingVersion } from '../mapping/schema.js';

// Onboarding analyses compare alias strings and component IDs only; a tuple from another equipment or Layout
// would match by accident and report plausible but wrong results, so reject it like replay does (#29).
export function assertOnboardingTuple(mapping: Omit<MappingVersion, 'hash'>, inventories: Record<string, ObservedInventory>, layout?: LayoutDocument): void {
  for (const [name, inventory] of Object.entries(inventories)) {
    if (inventory.equipmentId !== mapping.equipmentId) {
      throw new RangeError(`${name}.equipmentId (${inventory.equipmentId}) must match mapping.equipmentId (${mapping.equipmentId})`);
    }
  }
  if (layout && layout.id !== mapping.layoutId) {
    throw new RangeError(`layout.id (${layout.id}) must match mapping.layoutId (${mapping.layoutId})`);
  }
}
