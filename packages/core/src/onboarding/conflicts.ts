import type { ObservedInventory } from '../inventory/schema.js';
import type { EquipmentLayoutDocument, LayoutDocument } from '../layout/schema.js';
import type { MappingVersion, TypeDictionaryFile } from '../mapping/schema.js';
import { resolveRole } from '../mapping/validate.js';
import { compareSlots, compareText, isIntegerSlot } from './order.js';

type TransferConflict = { kind: 'transfer-without-capability'; from: string; to: string; count: number; fromComponentId: string; toComponentId: string };
export type MappingConflict = TransferConflict
  | { kind: 'slot-exceeds-sites'; alias: string; componentId: string; slots: string[] }
  | { kind: 'role-mismatch'; alias: string; moduleType: string; expectedRole: string; componentId: string; componentRole: string }
  | { kind: 'port-flag-mismatch'; alias: string; componentId: string; isPort: boolean }
  | { kind: 'robot-flag-mismatch'; alias: string; componentId: string; isRobot: boolean };

export function componentsLinked(layout: LayoutDocument, aId: string, bId: string): boolean {
  const a = layout.components.find(({ id }) => id === aId);
  const b = layout.components.find(({ id }) => id === bId);
  if (!a || !b) return false;
  return layout.transferCapabilities.some((edge) => {
    const connects = (left: typeof edge.a, right: typeof edge.b) => left.componentId === a.id && right.componentId === b.id &&
      a.holdingSites.some((site) => site.id === left.holdingSiteId) && b.holdingSites.some((site) => site.id === right.holdingSiteId);
    return connects(edge.a, edge.b) || connects(edge.b, edge.a);
  });
}

type Input = { inventory: ObservedInventory; mapping: MappingVersion; layout: EquipmentLayoutDocument };
export function transfersWithoutCapability({ inventory, mapping, layout }: Input): TransferConflict[] {
  const components = new Map(layout.components.map((component) => [component.id, component]));
  const entries = new Map(mapping.entries.map((entry) => [entry.alias, entry.target]));
  const conflicts: TransferConflict[] = [];
  for (const pair of inventory.transfers) {
    const from = entries.get(pair.from);
    const to = entries.get(pair.to);
    if (!from || !to || 'ignore' in from || 'ignore' in to) continue;
    const a = components.get(from.componentId);
    const b = components.get(to.componentId);
    if (!a || !b) continue;
    if (!componentsLinked(layout, a.id, b.id)) conflicts.push({ kind: 'transfer-without-capability', ...pair, fromComponentId: a.id, toComponentId: b.id });
  }
  return conflicts.sort((a, b) => compareText(a.from, b.from) || compareText(a.to, b.to));
}

export function findMappingConflicts(input: Input & { dictionaries: TypeDictionaryFile[] }): MappingConflict[] {
  const { inventory, mapping, layout, dictionaries } = input;
  const conflicts: MappingConflict[] = transfersWithoutCapability(input);
  const entries = new Map(mapping.entries.map((entry) => [entry.alias, entry.target]));
  const components = new Map(layout.components.map((component) => [component.id, component]));
  for (const row of inventory.aliases) {
    const target = entries.get(row.alias);
    if (!target || 'ignore' in target) continue;
    const component = components.get(target.componentId);
    if (!component) continue;
    const slotMap = target.slots;
    const slots = slotMap ? row.slots.filter((slot) => {
      if (!isIntegerSlot(slot)) return true;
      const value = BigInt(slot) + BigInt(slotMap.offset);
      return !slotMap.assign.some((range) => value >= BigInt(range.from) && value <= BigInt(range.to));
    }) : new Set(row.slots).size > component.holdingSites.length ? [...row.slots] : [];
    const common = { alias: row.alias, componentId: component.id };
    if (slots.length) conflicts.push({ kind: 'slot-exceeds-sites', ...common, slots: slots.sort(compareSlots) });
    if (row.moduleType !== undefined) {
      const expectedRole = resolveRole(dictionaries, row.moduleType);
      if (expectedRole !== 'unknown' && expectedRole !== component.role) conflicts.push({
        kind: 'role-mismatch', ...common, moduleType: row.moduleType, expectedRole, componentRole: component.role,
      });
    }
    if (row.isPort !== undefined && row.isPort !== component.holdingSites.some((site) => site.materialKinds.includes('carrier'))) {
      conflicts.push({ kind: 'port-flag-mismatch', ...common, isPort: row.isPort });
    }
    if (row.isRobot !== undefined && row.isRobot !== (component.role === 'robot')) {
      conflicts.push({ kind: 'robot-flag-mismatch', ...common, isRobot: row.isRobot });
    }
  }
  return conflicts.sort((a, b) => compareText(a.kind, b.kind) ||
    (a.kind === 'transfer-without-capability' && b.kind === 'transfer-without-capability'
      ? compareText(a.from, b.from) || compareText(a.to, b.to)
      : 'alias' in a && 'alias' in b ? compareText(a.alias, b.alias) : 0));
}
