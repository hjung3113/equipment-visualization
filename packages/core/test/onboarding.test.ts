import { readFileSync, readdirSync } from 'node:fs';
import { expect, it } from 'vitest';
import { z } from 'zod';
import {
  aliasMetadataFileSchema, buildInventory, computeCoverage, detectDrift, findMappingConflicts,
  layoutDocumentSchema, mappingVersionSchema, observedInventorySchema, occurrenceBatchSchema,
  typeDictionaryFileSchema, type EquipmentLayoutDocument, type Occurrence,
} from '../src/index.js';

const read = (path: string) => JSON.parse(readFileSync(new URL(`../../../fixtures/cluster-single/${path}`, import.meta.url), 'utf8'));
const batch = () => occurrenceBatchSchema.parse(read('occurrence-batch.json'));
const expected = () => observedInventorySchema.parse(read('expected-inventory.json'));
const metadata = () => aliasMetadataFileSchema.parse(read('onboarding/alias-metadata.json'));
const dictionary = () => typeDictionaryFileSchema.parse(read('onboarding/scopes/model/synth-maker/synth-model/type-dictionary.json'));
const layout = () => layoutDocumentSchema.parse(read('layout.json')) as EquipmentLayoutDocument;
const mapping = (prefix = '0abf') => {
  const file = readdirSync(new URL('../../../fixtures/cluster-single/onboarding/mappings/eq-synth-01/', import.meta.url)).find((name) => name.startsWith(prefix));
  return mappingVersionSchema.parse(read(`onboarding/mappings/eq-synth-01/${file}`));
};
const inventory = () => buildInventory(batch(), metadata());
// A cloned Occurrence needs its own Record Sequences (start = seq, end = seq + 1).
const resequence = (occurrence: Occurrence, seq: number): Occurrence => ({ ...occurrence,
  start: { ...occurrence.start, seq }, end: occurrence.end && { ...occurrence.end, seq: seq + 1 } });

it('builds the hand-counted inventory, copying only supplied metadata for observed aliases', () => {
  expect(buildInventory(batch())).toEqual(expected());
  const complete = metadata();
  expect(buildInventory(batch(), complete)).toStrictEqual({ ...expected(), aliases: expected().aliases.map((row) => ({
    ...row, ...complete.aliases.find((entry) => entry.alias === row.alias),
  })) });
  const meta = metadata();
  meta.aliases.push({ alias: 'ABSENT', isPort: true });
  delete meta.aliases.find((row) => row.alias === 'PM9')!.moduleType;
  expect(buildInventory(batch(), meta)).toStrictEqual({ ...expected(), aliases: expected().aliases.map((row) => {
    const fields = { ...meta.aliases.find((entry) => entry.alias === row.alias)! };
    const { alias, ...rest } = fields;
    expect(alias).toBe(row.alias);
    return { ...row, ...rest };
  }) });
});

it.each(['deduplicate', 'slot-order', 'null-boundaries', 'equipment'] as const)('inventory rule: %s', (rule) => {
  const input = batch();
  const occurrence = { ...input.occurrences[0]!, location: { moduleAlias: 'A', slotAlias: '1' }, from: undefined, to: { moduleAlias: 'A', slotAlias: '01' } };
  input.occurrences = [occurrence];
  if (rule === 'deduplicate') expect(buildInventory(input).aliases[0]!.references).toBe(1);
  if (rule === 'slot-order') {
    input.occurrences = ['x', '+9007199254740993', '9007199254740993', '10', '1', '9007199254740992', '01', '-1'].map((slotAlias, i) => ({ ...resequence(occurrence, 100 + 2 * i), to: undefined, location: { moduleAlias: 'A', slotAlias } }));
    expect(buildInventory(input).aliases[0]!.slots).toEqual(['-1', '01', '1', '10', '9007199254740992', '+9007199254740993', '9007199254740993', 'x']);
  }
  if (rule === 'null-boundaries') {
    occurrence.start = { ...occurrence.start, at: null };
    occurrence.end = occurrence.end && { ...occurrence.end, at: null };
    expect(buildInventory(input).aliases[0]).toMatchObject({ firstSeen: null, lastSeen: null });
  }
  if (rule === 'equipment') {
    expect(() => buildInventory(input, { ...metadata(), equipmentId: 'other' }))
      .toThrow(new RangeError(`metadata.equipmentId (other) must match batch.equipmentId (${input.equipmentId})`));
  }
});

it.each([
  { name: 'an Occurrence of another equipment', edit: (b: ReturnType<typeof batch>) => { b.occurrences[3]!.equipmentId = 'other'; },
    message: 'occurrences[3].equipmentId (record occ-efem-out) (other) must match batch.equipmentId (eq-synth-01)' },
  { name: 'a duplicate Record Sequence', edit: (b: ReturnType<typeof batch>) => { b.occurrences[2]!.start.seq = 2; },
    message: 'Record Sequence 2 is not unique (occurrences[1].start, occurrences[2].start)' },
])('rejects $name before building the Inventory', ({ edit, message }) => {
  const input = batch();
  edit(input);
  let error: unknown;
  try { buildInventory(input); } catch (caught) { error = caught; }
  expect(error).toEqual(new RangeError(message));
});

it('computes weighted coverage, ignored references and assumed share', () => {
  expect(computeCoverage(expected(), mapping())).toEqual({
    references: { resolved: 41, total: 42, ratio: 41 / 42 }, aliases: { resolved: 6, total: 7, ratio: 6 / 7 },
    ignored: { aliases: ['VIRT_SCH'], references: 1 }, assumed: { references: 8, ratio: 8 / 41 },
    unmapped: [{ alias: 'PM9', references: 1 }],
  });
  expect(computeCoverage(expected(), mapping('30d2')).assumed).toEqual({ references: 0, ratio: 0 });
  expect(computeCoverage({ ...expected(), aliases: expected().aliases.filter((row) => row.alias === 'PM9') }, mapping())).toEqual({
    references: { resolved: 0, total: 1, ratio: 0 }, aliases: { resolved: 0, total: 1, ratio: 0 },
    ignored: { aliases: [], references: 0 }, assumed: { references: 0, ratio: null }, unmapped: [{ alias: 'PM9', references: 1 }],
  });
  expect(computeCoverage({ ...expected(), aliases: [] }, mapping())).toEqual({
    references: { resolved: 0, total: 0, ratio: null }, aliases: { resolved: 0, total: 0, ratio: null },
    ignored: { aliases: [], references: 0 }, assumed: { references: 0, ratio: null }, unmapped: [],
  });
});

const transferFindings = [
  { kind: 'transfer-without-capability', from: 'LLA', to: 'PM2', count: 1, fromComponentId: 'll-a', toComponentId: 'pm-b' },
  { kind: 'transfer-without-capability', from: 'PM2', to: 'LLA', count: 1, fromComponentId: 'pm-b', toComponentId: 'll-a' },
];
it.each(['none', 'transfer', 'slots', 'role', 'port', 'robot', 'unmapped'] as const)('mapping conflicts: %s', (variant) => {
  const input = { inventory: inventory(), mapping: mapping(), layout: layout(), dictionaries: [dictionary()] };
  let findings: unknown[] = [];
  if (variant === 'transfer') {
    input.layout.transferCapabilities = input.layout.transferCapabilities.filter((edge) => !([edge.a.componentId, edge.b.componentId].includes('ll-a') && [edge.a.componentId, edge.b.componentId].includes('pm-b')));
    findings = transferFindings;
  }
  if (variant === 'slots') {
    input.inventory.aliases.find((row) => row.alias === 'PM2')!.slots.push('3');
    findings = [{ kind: 'slot-exceeds-sites', alias: 'PM2', componentId: 'pm-b', slots: ['3'] }];
  }
  if (variant === 'role') {
    input.dictionaries[0]!.entries.find((row) => row.moduleType === 'SYN_LOADLOCK')!.role = 'pm';
    findings = [{ kind: 'role-mismatch', alias: 'LLA', moduleType: 'SYN_LOADLOCK', expectedRole: 'pm', componentId: 'll-a', componentRole: 'll' }];
  }
  if (variant === 'port' || variant === 'unmapped') {
    const alias = variant === 'port' ? 'LLA' : 'PM9';
    input.inventory.aliases.find((row) => row.alias === alias)!.isPort = true;
    if (variant === 'port') findings = [{ kind: 'port-flag-mismatch', alias, componentId: 'll-a', isPort: true }];
  }
  if (variant === 'robot') {
    input.inventory.aliases.find((row) => row.alias === 'TM_R1')!.isRobot = false;
    findings = [{ kind: 'robot-flag-mismatch', alias: 'TM_R1', componentId: 'tm-robot', isRobot: false }];
  }
  expect(findMappingConflicts(input)).toEqual(findings);
});

it.each([
  { name: 'signed integers and offset', slots: ['x', '9007199254740993', '0', '-1', '+0'], offset: 2, bad: ['9007199254740993', 'x'] },
  { name: 'BigInt does not round', slots: ['9007199254740993'], offset: -9007199254740991, bad: ['9007199254740993'], limit: 1 },
  { name: 'no SlotMap exceeds site count', offset: undefined, slots: ['x', '2', '1'], bad: ['1', '2', 'x'] },
] as const)('slot conflicts: $name', ({ slots, offset, bad, ...options }) => {
  const observed = inventory();
  observed.aliases = [observed.aliases.find((row) => row.alias === 'PM2')!];
  observed.aliases[0]!.slots = [...slots];
  observed.transfers = [];
  const version = mapping();
  const target = version.entries.find((entry) => entry.alias === 'PM2')!.target;
  if ('ignore' in target) throw new Error('Expected mapped PM2');
  if (offset === undefined) delete target.slots;
  else target.slots = { offset, assign: [{ from: options.limit ?? 1, to: options.limit ?? 2, holdingSiteId: 'station-1' }] };
  expect(findMappingConflicts({ inventory: observed, mapping: mappingVersionSchema.parse(version), layout: layout(), dictionaries: [] })).toEqual([
    { kind: 'slot-exceeds-sites', alias: 'PM2', componentId: 'pm-b', slots: [...bad] },
  ]);
});

it('detects drift against the published inventory, including current unexplained transfers', () => {
  const baseline = expected();
  const input = { baseline, current: baseline, mapping: mapping(), layout: layout() };
  expect(detectDrift(input)).toEqual({ newAliases: [], newSlots: [], transfersWithoutCapability: [] });
  const currentBatch = batch();
  currentBatch.occurrences.push({ ...resequence(currentBatch.occurrences[0]!, 100), location: { moduleAlias: 'NEW' }, from: undefined, to: undefined });
  currentBatch.occurrences.push({ ...resequence(currentBatch.occurrences[0]!, 102), kind: 'TRANSFER', location: { moduleAlias: 'PM2', slotAlias: '3' }, from: { moduleAlias: 'LP1' }, to: { moduleAlias: 'PM2' } });
  expect(detectDrift({ ...input, current: buildInventory(currentBatch) })).toEqual({
    newAliases: ['NEW'], newSlots: [{ alias: 'PM2', slot: '3' }], transfersWithoutCapability: [
      { kind: 'transfer-without-capability', from: 'LP1', to: 'PM2', count: 1, fromComponentId: 'lp-a', toComponentId: 'pm-b' },
    ],
  });
});

it.each([
  { name: 'coverage, inventory of another equipment', run: () => computeCoverage({ ...expected(), equipmentId: 'other' }, mapping()), error: 'inventory.equipmentId (other)' },
  { name: 'conflicts, inventory of another equipment', run: () => findMappingConflicts({ inventory: { ...inventory(), equipmentId: 'other' }, mapping: mapping(), layout: layout(), dictionaries: [] }), error: 'inventory.equipmentId (other)' },
  { name: 'conflicts, mapping for another layout', run: () => findMappingConflicts({ inventory: inventory(), mapping: mapping(), layout: { ...layout(), id: 'other' }, dictionaries: [] }), error: 'layout.id (other)' },
  { name: 'drift, baseline of another equipment', run: () => detectDrift({ baseline: { ...expected(), equipmentId: 'other' }, current: expected(), mapping: mapping(), layout: layout() }), error: 'baseline.equipmentId (other)' },
  { name: 'drift, mapping for another layout', run: () => detectDrift({ baseline: expected(), current: expected(), mapping: mapping(), layout: { ...layout(), id: 'other' } }), error: 'layout.id (other)' },
])('rejects a mismatched onboarding tuple: $name', ({ run, error }) => {
  expect(run).toThrow(RangeError);
  expect(run).toThrow(error);
});

it('validates metadata and dictionary and pins the public metadata schema', async () => {
  expect(metadata().aliases).toHaveLength(8);
  expect(dictionary().entries).toHaveLength(5);
  const meta = metadata();
  expect(aliasMetadataFileSchema.safeParse({ ...meta, aliases: [...meta.aliases, meta.aliases[0]] }).success).toBe(false);
  await expect(JSON.stringify(z.toJSONSchema(aliasMetadataFileSchema), null, 2) + '\n').toMatchFileSnapshot('../schema/alias-metadata.schema.json');
});
