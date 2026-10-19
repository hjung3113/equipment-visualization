import { canonicalJson, type LayoutDocument } from '@eqv/core';

export const COLLECTIONS = ['levels', 'components', 'physicalInterfaces', 'transferCapabilities', 'processRoutes'] as const;
export type CollectionName = typeof COLLECTIONS[number];
export interface CollectionChanges {
  added: string[];
  removed: string[];
  changed: string[];
}
export interface LayoutChanges {
  /** Header fields whose value differs; `kind`-specific fields (`templateId`, `roleCardinality`) count when present on either side. */
  header: string[];
  collections: Record<CollectionName, CollectionChanges>;
}

const record = (document: LayoutDocument) => document as unknown as Record<string, unknown>;

function compareCollection(before: readonly { id: string }[], after: readonly { id: string }[]): CollectionChanges {
  const previous = new Map(before.map((item) => [item.id, canonicalJson(item)]));
  const next = new Map(after.map((item) => [item.id, canonicalJson(item)]));
  const ids = (keep: (id: string) => boolean, from: Map<string, string>) => [...from.keys()].filter(keep).sort();
  return {
    added: ids((id) => !previous.has(id), next),
    removed: ids((id) => !next.has(id), previous),
    changed: ids((id) => previous.has(id) && previous.get(id) !== next.get(id), next),
  };
}

/** Id-level difference of two Layout documents. Nothing is inferred: no rename detection, no geometry thresholds. */
export function layoutChanges(before: LayoutDocument, after: LayoutDocument): LayoutChanges {
  const left = record(before);
  const right = record(after);
  const collections = new Set<string>(COLLECTIONS);
  const header = [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .filter((key) => !collections.has(key) && canonicalJson(left[key] ?? null) !== canonicalJson(right[key] ?? null))
    .sort();
  return {
    header,
    collections: Object.fromEntries(COLLECTIONS.map((name) => [name, compareCollection(before[name], after[name])])) as Record<CollectionName, CollectionChanges>,
  };
}

export const isUnchanged = (changes: LayoutChanges) =>
  changes.header.length === 0 && COLLECTIONS.every((name) => {
    const { added, removed, changed } = changes.collections[name];
    return added.length + removed.length + changed.length === 0;
  });
