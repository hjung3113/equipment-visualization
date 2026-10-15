import type { ObservedInventory } from '../inventory/schema.js';
import type { MappingVersion } from '../mapping/schema.js';
import { compareText } from './order.js';

type Count = { resolved: number; total: number; ratio: number | null };
export type Coverage = {
  references: Count;
  aliases: Count;
  ignored: { aliases: string[]; references: number };
  assumed: { references: number; ratio: number | null };
  unmapped: { alias: string; references: number }[];
};
const ratio = (part: number, total: number): number | null => total === 0 ? null : part / total;
export function computeCoverage(inventory: ObservedInventory, mapping: MappingVersion): Coverage {
  const result: Coverage = {
    references: { resolved: 0, total: 0, ratio: null }, aliases: { resolved: 0, total: 0, ratio: null },
    ignored: { aliases: [], references: 0 }, assumed: { references: 0, ratio: null }, unmapped: [],
  };
  const entries = new Map(mapping.entries.map((entry) => [entry.alias, entry]));
  for (const row of inventory.aliases) {
    const entry = entries.get(row.alias);
    if (entry && 'ignore' in entry.target) {
      result.ignored.aliases.push(row.alias);
      result.ignored.references += row.references;
      continue;
    }
    result.references.total += row.references;
    result.aliases.total++;
    if (entry) {
      result.references.resolved += row.references;
      result.aliases.resolved++;
      if (entry.certainty === 'assumed') result.assumed.references += row.references;
    } else result.unmapped.push({ alias: row.alias, references: row.references });
  }
  result.references.ratio = ratio(result.references.resolved, result.references.total);
  result.aliases.ratio = ratio(result.aliases.resolved, result.aliases.total);
  result.assumed.ratio = ratio(result.assumed.references, result.references.resolved);
  result.ignored.aliases.sort(compareText);
  result.unmapped.sort((a, b) => b.references - a.references || compareText(a.alias, b.alias));
  return result;
}
