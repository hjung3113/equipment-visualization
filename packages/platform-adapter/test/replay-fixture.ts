import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { BindingsFile, EquipmentLayoutDocument, MappingVersion, OccurrenceBatch, ReplayInput } from '@eqv/core';

// vitest runs with cwd = packages/platform-adapter; the synthetic cluster-single fixture lives at the repo root.
const root = resolve(process.cwd(), '../../fixtures/cluster-single');
const json = async (path: string) => JSON.parse(await readFile(resolve(root, path), 'utf8'));

export const batch: OccurrenceBatch = await json('occurrence-batch.json');
export const layout: EquipmentLayoutDocument = await json('layout.json');
export const bindings: BindingsFile = await json('onboarding/bindings/eq-synth-01.bindings.json');
const mappingDir = 'onboarding/mappings/eq-synth-01';
export const mappings: MappingVersion[] = await Promise.all(bindings.bindings.map(({ mappingHash }) =>
  json(`${mappingDir}/${mappingHash.slice('sha256:'.length)}.mapping.json`)));

export const EQUIPMENT = 'eq-synth-01';
/** What the host's Global Context carries: naive seconds, no fraction. */
export const HOST_TIME = { from: '2026-01-01T10:00:00', to: '2026-01-01T10:30:00' };

export const contextData = (): Omit<ReplayInput, 'batch'> => ({ layouts: [layout], bindings, mappings });

/** The batch cut into two server pages: the first carries `continuationToken: 'p2'` and an earlier Watermark. */
export const pages = (): [OccurrenceBatch, OccurrenceBatch] => {
  const cut = 15;
  return [
    { ...batch, watermark: { seq: 30, at: '2026-01-01T10:13:00.000' }, occurrences: batch.occurrences.slice(0, cut), issues: [], continuationToken: 'p2' },
    { ...batch, occurrences: batch.occurrences.slice(cut) },
  ];
};
