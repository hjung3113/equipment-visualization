import { readFileSync, readdirSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  bindingsFileSchema, layoutDocumentSchema, layoutRevision, mappingVersionSchema, occurrenceBatchSchema,
  replayKey, type LayoutDocument, type ReplayInput, type SiteWallClock,
} from '../src/index.js';

const root = new URL('../../../fixtures/cluster-single/', import.meta.url);
const read = (path: string): unknown => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const layout = (): LayoutDocument => layoutDocumentSchema.parse(read('layout.json'));
const reorder = (value: unknown): unknown => Array.isArray(value) ? value.map(reorder)
  : value !== null && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).reverse().map(([key, v]) => [key, reorder(v)])) : value;

it('equals the Replay Key layoutHash and ignores object key order', async () => {
  const equipment = layout();
  if (equipment.kind !== 'equipment-layout') throw new Error('Expected equipment layout');
  const directory = 'onboarding/mappings/eq-synth-01/';
  const input: ReplayInput = { batch: occurrenceBatchSchema.parse(read('occurrence-batch.json')), layouts: [equipment],
    bindings: bindingsFileSchema.parse(read('onboarding/bindings/eq-synth-01.bindings.json')),
    mappings: readdirSync(new URL(directory, root)).sort().map((file) => mappingVersionSchema.parse(read(directory + file))) };
  const key = await replayKey(input, '2026-01-01T10:00:30.000' as SiteWallClock);
  const revision = await layoutRevision(equipment);
  expect(revision).toMatch(/^sha256:[0-9a-f]{64}$/);
  expect(revision).toBe(key.layoutHash);
  expect(await layoutRevision(layoutDocumentSchema.parse(reorder(equipment)))).toBe(revision);
});
