import type { AliasMetadataFile, InventoryAlias, ObservedInventory } from '../inventory/schema.js';
import type { OccurrenceBatch } from '../occurrence/schema.js';
import { assertBatchRecords } from '../occurrence/validate.js';
import { compareSlots, compareText } from './order.js';

export function buildInventory(batch: OccurrenceBatch, metadata?: AliasMetadataFile): ObservedInventory {
  assertBatchRecords(batch);
  if (metadata && metadata.equipmentId !== batch.equipmentId) {
    throw new RangeError(`metadata.equipmentId (${metadata.equipmentId}) must match batch.equipmentId (${batch.equipmentId})`);
  }
  const aliases = new Map<string, InventoryAlias>();
  const transfers = new Map<string, { from: string; to: string; count: number }>();
  for (const occurrence of batch.occurrences) {
    const seen = new Set<string>();
    for (const ref of [occurrence.location, occurrence.from, occurrence.to]) {
      if (!ref) continue;
      let row = aliases.get(ref.moduleAlias);
      if (!row) {
        row = { alias: ref.moduleAlias, references: 0, slots: [], activity: [], firstSeen: null, lastSeen: null };
        aliases.set(ref.moduleAlias, row);
      }
      if (ref.slotAlias !== undefined && !row.slots.includes(ref.slotAlias)) row.slots.push(ref.slotAlias);
      if (seen.has(ref.moduleAlias)) continue;
      seen.add(ref.moduleAlias);
      row.references++;
      for (const at of [occurrence.start.at, occurrence.end?.at]) {
        if (at == null) continue;
        if (row.firstSeen === null || at < row.firstSeen) row.firstSeen = at;
        if (row.lastSeen === null || at > row.lastSeen) row.lastSeen = at;
      }
    }
    if (occurrence.location) {
      const row = aliases.get(occurrence.location.moduleAlias)!;
      const activity = row.activity.find(({ kind }) => kind === occurrence.kind);
      if (activity) activity.count++;
      else row.activity.push({ kind: occurrence.kind, count: 1 });
    }
    if (occurrence.kind === 'TRANSFER' && occurrence.from && occurrence.to) {
      const from = occurrence.from.moduleAlias;
      const to = occurrence.to.moduleAlias;
      const key = JSON.stringify([from, to]);
      const pair = transfers.get(key);
      if (pair) pair.count++;
      else transfers.set(key, { from, to, count: 1 });
    }
  }
  const metadataByAlias = new Map(metadata?.aliases.map((row) => [row.alias, row]));
  for (const row of aliases.values()) {
    row.slots.sort(compareSlots);
    row.activity.sort((a, b) => compareText(a.kind, b.kind));
    const fields = metadataByAlias.get(row.alias);
    if (fields?.moduleType !== undefined) row.moduleType = fields.moduleType;
    if (fields?.isPort !== undefined) row.isPort = fields.isPort;
    if (fields?.isRobot !== undefined) row.isRobot = fields.isRobot;
  }
  return {
    equipmentId: batch.equipmentId, from: batch.from, to: batch.to,
    aliases: [...aliases.values()].sort((a, b) => compareText(a.alias, b.alias)),
    transfers: [...transfers.values()].sort((a, b) => compareText(a.from, b.from) || compareText(a.to, b.to)),
  };
}
