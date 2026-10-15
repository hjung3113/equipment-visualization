import { readFileSync, readdirSync } from 'node:fs';
import { expect, it } from 'vitest';
import { z } from 'zod';
import {
  aliasRulesFileSchema, bindingsFileSchema, layoutDocumentSchema, mappingVersionSchema,
  observedInventorySchema, occurrenceBatchSchema, publishMapping, sceneStateSchema,
  validateBindings, validateLayout, verifyMappingHash, type SceneState,
} from '../src/index.js';

const root = new URL('../../../fixtures/cluster-single/', import.meta.url);
const read = (path: string): unknown => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const batch = () => occurrenceBatchSchema.parse(read('occurrence-batch.json'));
const aliases = () => [...new Set(batch().occurrences.flatMap((row) =>
  [row.location, row.from, row.to].flatMap((ref) => ref ? [ref.moduleAlias] : [])))].sort();
const bindings = () => bindingsFileSchema.parse(read('onboarding/bindings/eq-synth-01.bindings.json'));
const states = (): SceneState[] => z.strictObject({ equipmentId: z.string(), states: z.array(sceneStateSchema) })
  .parse(read('expected-scene-states.json')).states;
const state = (time: string) => {
  const result = states().find((row) => row.at === `2026-01-01T${time}.000`);
  if (!result) throw new Error(`Missing state ${time}`);
  return result;
};

it('validates the synthetic equipment layout', () => {
  expect(validateLayout(read('layout.json')).ok).toBe(true);
});

it('re-publishes both immutable Mapping Versions and validates their bindings', async () => {
  const model = aliasRulesFileSchema.parse(read('onboarding/scopes/model/synth-maker/synth-model/alias-rules.json'));
  const equipment = aliasRulesFileSchema.parse(read('onboarding/scopes/equipment/eq-synth-01/alias-rules.json'));
  const directory = 'onboarding/mappings/eq-synth-01/';
  const files = readdirSync(new URL(directory, root)).sort();
  expect(files).toHaveLength(2);
  const committed = files.map((file) => mappingVersionSchema.parse(read(directory + file)));
  for (const ruleFiles of [[model], [model, equipment]]) {
    const published = await publishMapping({ equipmentId: batch().equipmentId, maker: 'synth-maker', model: 'synth-model',
      layout: layoutDocumentSchema.parse(read('layout.json')), aliases: aliases(), ruleFiles });
    expect(published.ok).toBe(true);
    if (!published.ok) throw new Error(JSON.stringify(published.issues));
    expect(committed.find((mapping) => mapping.hash === published.mapping.hash)).toEqual(published.mapping);
    expect(await verifyMappingHash(published.mapping)).toBe(true);
    expect(files).toContain(`${published.mapping.hash.slice(7)}.mapping.json`);
  }
  expect(validateBindings(bindings()).ok).toBe(true);
  expect(bindings().bindings.map((binding) => binding.mappingHash).sort()).toEqual(committed.map((mapping) => mapping.hash).sort());
});

it('parses the hand-counted Inventory and covers exactly the referenced aliases', () => {
  const inventory = observedInventorySchema.parse(read('expected-inventory.json'));
  expect(inventory.aliases.map((row) => row.alias)).toEqual(aliases());
  expect([inventory.equipmentId, inventory.from, inventory.to]).toEqual([batch().equipmentId, batch().from, batch().to]);
});

it('validates all sixteen ordered Scene States against the bound layout', () => {
  const expected = states();
  expect(expected).toHaveLength(16);
  const ids = layoutDocumentSchema.parse(read('layout.json')).components.map((row) => row.id).sort();
  for (const row of expected) {
    expect(row.equipmentId).toBe(batch().equipmentId);
    const binding = bindings().bindings.find((binding) => binding.effectiveFrom <= row.at &&
      (binding.effectiveTo === undefined || row.at < binding.effectiveTo));
    expect(row.binding).toEqual(binding ? { layoutId: binding.layoutId, mappingHash: binding.mappingHash } : null);
    expect(row.components.map((component) => component.componentId)).toEqual(ids);
    expect(row.materials.map((material) => material.key)).toEqual(row.materials.map((material) => material.key).sort());
    for (const component of row.components) expect(component.occurrenceIds).toEqual([...component.occurrenceIds].sort());
    expect(JSON.stringify(row)).not.toContain('illustrative');
    expect(JSON.stringify(row)).not.toContain('VIRT_SCH');
    expect(JSON.stringify(row)).not.toContain('occ-ignored');
  }
});

const cases: { time: string; check: (row: SceneState) => void }[] = [
  { time: '10:03:30', check: (row) => expect(row.materials.find((m) => m.key === 'W01')).toMatchObject({
    location: { componentId: 'tm-robot', holdingSiteId: 'blade-a' }, locationEvidence: 'derived',
  }) },
  { time: '10:05:30', check: (row) => expect(row.materials.find((m) => m.key === 'W01')).toMatchObject({ location: null, locationEvidence: 'unknown' }) },
  { time: '10:08:30', check: (row) => {
    expect(row.materials.filter((m) => m.alias.moduleAlias === 'PM2').map((m) => [m.key, m.locationEvidence])).toEqual([['W04', 'derived'], ['W05', 'derived']]);
    expect(row.markers).toEqual([]);
    expect(row.components.find((c) => c.componentId === 'pm-b')).toMatchObject({ activity: 'processing', activityEvidence: 'derived', occurrenceIds: ['occ-pm2-slot-one', 'occ-pm2-slot-two'] });
  } },
  { time: '10:22:45', check: (row) => {
    expect(row.markers).toEqual([
      { kind: 'occupancy-conflict', componentId: 'll-a', holdingSiteId: 'slot-1', materialKeys: ['W08', 'W09'] },
      { kind: 'time-anomaly', occurrenceId: 'occ-unmapped' },
    ]);
    expect(row.materials.filter((m) => ['W08', 'W09'].includes(m.key)).map((m) => [m.key, m.locationEvidence])).toEqual([['W08', 'unknown'], ['W09', 'unknown']]);
  } },
  { time: '10:23:30', check: (row) => {
    expect(row.materials.find((m) => m.key === 'W10')).toMatchObject({ location: null, locationEvidence: 'unknown' });
    expect(row.markers).toEqual([{ kind: 'unmapped-alias', alias: 'PM9', occurrenceId: 'occ-unmapped' }]);
  } },
  { time: '10:20:30', check: (row) => expect(row.components.find((c) => c.componentId === 'pm-b')).toEqual({ componentId: 'pm-b', activity: 'function', activityEvidence: 'unknown', occurrenceIds: ['occ-null-time'] }) },
  { time: '10:26:00', check: (row) => {
    expect(row.markers).toEqual([{ kind: 'after-watermark', watermarkAt: batch().watermark.at }]);
    for (const material of row.materials) expect(material.locationEvidence).toBe('unknown');
    for (const component of row.components) expect(component.activityEvidence).toBe('unknown');
    expect(row.materials.find((m) => m.key === 'W11')?.identityEvidence).toBe('observed');
  } },
];
it.each(cases)('pins evidence trust at $time', ({ time, check }) => check(state(time)));

it.each([
  ['observed-inventory', observedInventorySchema], ['scene-state', sceneStateSchema],
] as const)('pins the public %s JSON Schema', async (name, schema) => {
  await expect(JSON.stringify(z.toJSONSchema(schema), null, 2) + '\n').toMatchFileSnapshot(`../schema/${name}.schema.json`);
});
