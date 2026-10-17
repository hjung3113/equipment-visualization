import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  bindingsFileSchema, layoutDocumentSchema, mappingVersionSchema, occurrenceBatchSchema, replayTimeline, seekSceneState,
  type EquipmentLayoutDocument, type ReplayInput, type SiteWallClock,
} from '@eqv/core';

// vitest runs with cwd = packages/replay; import.meta.url is not a file URL under jsdom.
const root = resolve(process.cwd(), '../../fixtures/cluster-single');
const read = (path: string): unknown => JSON.parse(readFileSync(join(root, path), 'utf8'));

export const time = (value: string): SiteWallClock => `2026-01-01T${value}.000`;
const layout = layoutDocumentSchema.parse(read('layout.json'));
if (layout.kind !== 'equipment-layout') throw new Error('Expected equipment layout');
export const equipmentLayout: EquipmentLayoutDocument = layout;
const directory = 'onboarding/mappings/eq-synth-01/';
export const input: ReplayInput = {
  batch: occurrenceBatchSchema.parse(read('occurrence-batch.json')),
  layouts: [layout],
  bindings: bindingsFileSchema.parse(read('onboarding/bindings/eq-synth-01.bindings.json')),
  mappings: readdirSync(join(root, directory)).sort().map((file) => mappingVersionSchema.parse(read(directory + file))),
};
export const { batch } = input;
export const timeline = replayTimeline(input, { from: batch.from, to: batch.to });
export const stateAt = (t: SiteWallClock) => seekSceneState(input, t);
