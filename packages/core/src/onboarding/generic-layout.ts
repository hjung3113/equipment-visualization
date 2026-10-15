import type { ObservedInventory } from '../inventory/schema.js';
import type { Component, EquipmentLayoutDocument, HoldingSite, Provenance } from '../layout/schema.js';
import type { TypeDictionaryFile } from '../mapping/schema.js';
import { resolveRole } from '../mapping/validate.js';
import { compareNatural, compareSlots, isIntegerSlot } from './order.js';

export function buildGenericLayout({ inventory, dictionaries }: {
  inventory: ObservedInventory; dictionaries: TypeDictionaryFile[];
}): { layout: EquipmentLayoutDocument; assignments: {
  alias: string; componentId: string; certainty: 'assumed'; sites: { slot: string; holdingSiteId: string }[];
}[] } {
  if (!inventory.aliases.length) throw new RangeError('Cannot build Generic Layout from empty Inventory');
  const aliases = [...inventory.aliases].sort((a, b) => compareNatural(a.alias, b.alias));
  const graph = new Map(aliases.map(({ alias }) => [alias, new Set<string>()]));
  for (const { from, to } of inventory.transfers) {
    if (!graph.has(from) || !graph.has(to)) continue;
    graph.get(from)!.add(to);
    graph.get(to)!.add(from);
  }
  const columns = new Map<string, number>();
  const queue = aliases.filter(({ isPort }) => isPort === true).map(({ alias }) => alias);
  for (const alias of queue) columns.set(alias, 0);
  for (let i = 0; i < queue.length; i++) {
    const alias = queue[i]!;
    for (const neighbour of graph.get(alias)!) {
      if (columns.has(neighbour)) continue;
      columns.set(neighbour, columns.get(alias)! + 1);
      queue.push(neighbour);
    }
  }
  const lastColumn = columns.size ? Math.max(...columns.values()) + 1 : 0;
  for (const { alias } of aliases) if (!columns.has(alias)) columns.set(alias, lastColumn);
  const rows = new Map<number, number>();
  const roleCounts = new Map<string, number>();
  const components: Component[] = [];
  const provenance: Provenance = { certainty: 'assumed', sourceEvidence: ['src-observed-inventory'] };
  const assignments = aliases.map((entry) => {
    const role = entry.moduleType === undefined ? 'unknown' : resolveRole(dictionaries, entry.moduleType);
    const n = (roleCounts.get(role) ?? 0) + 1;
    roleCounts.set(role, n);
    const componentId = `${role}-${n}`;
    const holdingSites: HoldingSite[] = [];
    const siteIds = new Set<string>();
    const sites = [...entry.slots].filter(isIntegerSlot).sort(compareSlots).map((slot) => {
      const v = BigInt(slot);
      const holdingSiteId = v < 0n ? `slot-neg-${-v}` : `slot-${v}`;
      if (!siteIds.has(holdingSiteId)) {
        siteIds.add(holdingSiteId);
        holdingSites.push({ id: holdingSiteId, materialKinds: ['wafer', 'carrier', 'batch', 'boat', 'reticle'], provenance });
      }
      return { slot, holdingSiteId };
    });
    const column = columns.get(entry.alias)!;
    const row = rows.get(column) ?? 0;
    rows.set(column, row + 1);
    components.push({ id: componentId, role, assetRef: 'generic-box', label: `${role.toUpperCase()} ${n}`, levelId: 'level-main',
      transform: { x: 10 + 20 * column, y: 10 + 20 * row, rotation: 0, scale: 1 }, ports: [], holdingSites,
      provenance: { role: provenance, assetRef: provenance, label: provenance, levelId: provenance, transform: provenance } });
    return { alias: entry.alias, componentId, certainty: 'assumed' as const, sites };
  });
  return { layout: {
    schemaVersion: '0.4', kind: 'equipment-layout', id: 'generic-layout', templateId: 'generic', name: 'Generic layout', unit: 'abstract',
    viewBox: { x: 0, y: 0, width: 20 * (Math.max(...columns.values()) + 1), height: 20 * Math.max(...rows.values()) },
    levels: [{ id: 'level-main', label: 'Main', order: 0 }],
    sources: [{ id: 'src-observed-inventory', title: 'Generated from Observed Inventory', license: 'synthetic' }],
    components, physicalInterfaces: [], transferCapabilities: [], processRoutes: [],
  }, assignments };
}
