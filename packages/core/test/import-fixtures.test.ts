import { readdirSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  aliasMetadataFileSchema, assertReplayInput, buildGenericLayout, buildInventory, detectDrift,
  equipmentRecordSchema, layoutDocumentSchema, occurrenceBatchSchema, proposeTemplates,
  typeDictionaryFileSchema, validateTypeDictionary,
  type OccurrenceBatch, type TemplateDocument,
} from '../src/index.js';
import { assertBatchRecords } from '../src/occurrence/validate.js';

const read = (path: string): unknown => JSON.parse(readFileSync(
  new URL(`../../../fixtures/import/${path}`, import.meta.url), 'utf8')) as unknown;
const equipment = () => equipmentRecordSchema.parse(read('eq-synth-03.equipment.json'));
const dictionary = () => typeDictionaryFileSchema.parse(read('synth-maker-b.synth-wet.type-dictionary.json'));
const metadata = () => aliasMetadataFileSchema.parse(read('eq-synth-03.alias-metadata.json'));
const batch = (window: 'w1' | 'w2') => occurrenceBatchSchema.parse(read(`eq-synth-03.${window}.batch.json`));
const recordSequences = (input: OccurrenceBatch) => [
  ...input.occurrences.flatMap(({ start, end }) => [start.seq, ...(end ? [end.seq] : [])]),
  ...input.issues.map(({ seq }) => seq),
];
const templates = (): TemplateDocument[] => readdirSync(new URL('../../../assets/templates/', import.meta.url))
  .filter((file) => file.endsWith('.template.json'))
  .sort()
  .map((file) => layoutDocumentSchema.parse(JSON.parse(readFileSync(
    new URL(`../../../assets/templates/${file}`, import.meta.url), 'utf8'),
  ) as unknown))
  .filter((document): document is TemplateDocument => document.kind === 'template');

it('validates the synthetic equipment, model dictionary and adapter metadata', () => {
  const record = equipment();
  expect(record).toEqual(read('eq-synth-03.equipment.json'));

  const validation = validateTypeDictionary(read('synth-maker-b.synth-wet.type-dictionary.json'));
  expect(validation.ok).toBe(true);
  if (validation.ok) expect(validation.file.scope).toEqual({ level: 'model', maker: record.maker, model: record.model });

  const aliasMetadata = aliasMetadataFileSchema.parse(read('eq-synth-03.alias-metadata.json'));
  expect(aliasMetadata.equipmentId).toBe(record.equipmentId);
  expect(metadata()).toEqual(aliasMetadata);
});

it.each(['w1', 'w2'] as const)('parses %s as one complete and internally consistent window', (window) => {
  const raw = read(`eq-synth-03.${window}.batch.json`);
  const parsed = occurrenceBatchSchema.parse(raw);
  const record = equipment();
  expect(parsed).toEqual(raw);
  expect(() => assertBatchRecords(parsed)).not.toThrow();

  const occurrenceIds = parsed.occurrences.map(({ id }) => id);
  const issueIds = parsed.issues.map(({ id }) => id);
  expect(new Set(occurrenceIds).size).toBe(occurrenceIds.length);
  expect(new Set(issueIds).size).toBe(issueIds.length);
  expect(parsed.occurrences.every(({ equipmentId, source }) => equipmentId === record.equipmentId &&
    source.parserContractVersion === parsed.parserContractVersion && source.dataGeneration === parsed.dataGeneration)).toBe(true);
  expect(parsed.issues.every(({ equipmentId }) => equipmentId === record.equipmentId)).toBe(true);
  expect(parsed.equipmentId).toBe(record.equipmentId);
  expect(parsed.continuationToken).toBeUndefined();

  const occurrenceIndex = new Map(parsed.occurrences.map(({ id }, index) => [id, index]));
  expect(parsed.issues.every(({ relatedOccurrenceId }) => relatedOccurrenceId === undefined ||
    occurrenceIndex.has(relatedOccurrenceId))).toBe(true);
  for (const occurrence of parsed.occurrences) {
    if (occurrence.start.at !== null && occurrence.end !== null && occurrence.end.at !== null &&
      occurrence.start.at <= occurrence.end.at) {
      expect(occurrence.end.at < parsed.from || occurrence.start.at >= parsed.to).toBe(false);
    }
  }
  expect(JSON.stringify(parsed)).not.toContain('"illustrative"');

  const boundaries = parsed.occurrences.flatMap(({ start, end }) => [start, ...(end ? [end] : [])]);
  const nonNullTimes = [
    ...boundaries.flatMap(({ at }) => at === null ? [] : [at]),
    ...parsed.issues.flatMap(({ at }) => at === null ? [] : [at]),
  ].sort();
  expect(parsed.watermark.seq).toBe(Math.max(...recordSequences(parsed)));
  expect(parsed.watermark.at).toBe(nonNullTimes.at(-1));
});

it('keeps adjacent windows separate and carries the open carrier with its original start', () => {
  const w1 = batch('w1');
  const w2 = batch('w2');
  expect(w1.to).toBe(w2.from);
  expect(w2.timeDomain).toBe(w1.timeDomain);
  expect(w2.parserContractVersion).toBe(w1.parserContractVersion);
  expect(w2.dataGeneration).toBe(w1.dataGeneration);

  const sharedIds = w1.occurrences.map(({ id }) => id).filter((id) => w2.occurrences.some((row) => row.id === id));
  expect(sharedIds).toEqual(['occ-carrier-window-boundary']);
  const carrierW1 = w1.occurrences.find(({ id }) => id === sharedIds[0])!;
  const carrierW2 = w2.occurrences.find(({ id }) => id === sharedIds[0])!;
  expect(carrierW1.kind).toBe('CARRIER_PRESENCE');
  expect(carrierW1.end).toBeNull();
  expect(carrierW1.location?.moduleAlias.startsWith('LP')).toBe(true);
  expect(carrierW1.start.at !== null && carrierW1.start.at >= w1.from && carrierW1.start.at < w1.to).toBe(true);
  expect(carrierW2.kind).toBe('CARRIER_PRESENCE');
  expect(carrierW2.end).not.toBeNull();
  expect(carrierW2.start).toEqual(carrierW1.start);

  const maxW1Sequence = Math.max(...recordSequences(w1));
  expect(recordSequences(w2).filter((seq) => seq !== carrierW2.start.seq).every((seq) => seq > maxW1Sequence)).toBe(true);
});

it('preserves the required w1 evidence, issue links, transfer and observed aliases', () => {
  const w1 = batch('w1');
  expect(w1.occurrences.filter(({ end }) => end === null)).toHaveLength(1);
  const boundaries = w1.occurrences.flatMap(({ start, end }) => [start, ...(end ? [end] : [])]);
  expect(boundaries.filter(({ at }) => at === null)).toHaveLength(1);
  expect(w1.occurrences.filter(({ end }) => end?.evidence === 'derived' && end.reason?.startsWith('Forced'))).toHaveLength(1);
  expect(w1.occurrences.filter(({ material }) => material !== undefined && material.id !== null &&
    material.identityEvidence === 'derived')).toHaveLength(1);

  expect(w1.issues.map(({ issueType }) => issueType).sort()).toEqual(['EndBeforeStart', 'UnmatchedEnd']);
  const endBeforeStart = w1.issues.find(({ issueType }) => issueType === 'EndBeforeStart')!;
  const inverted = w1.occurrences.find(({ id }) => id === endBeforeStart.relatedOccurrenceId)!;
  expect(inverted.end).not.toBeNull();
  expect(inverted.end!.at! < inverted.start.at!).toBe(true);
  expect(inverted.end!.seq).toBeGreaterThan(inverted.start.seq);
  expect(w1.issues.find(({ issueType }) => issueType === 'UnmatchedEnd')?.relatedOccurrenceId).toBeUndefined();

  expect(w1.occurrences.some(({ kind, location, from, to }) => kind === 'TRANSFER' &&
    location?.moduleAlias === 'WR1' && from !== undefined && to !== undefined)).toBe(true);
  const inventory = buildInventory(w1, metadata());
  expect(inventory.aliases.map(({ alias }) => alias)).toEqual([
    'BUF1', 'DRY1', 'DRY2', 'LP1', 'LP2', 'LP3', 'RAIL1', 'WC1', 'WC2', 'WC3', 'WR1',
  ]);
});

it('proposes wet-linear from w1 and marks only w2 cell count out of range', () => {
  const dictionaryFile = dictionary();
  const w1 = batch('w1');
  const w2 = batch('w2');
  const candidates = templates();
  expect(candidates).toHaveLength(6);

  const w1Inventory = buildInventory(w1, metadata());
  expect(proposeTemplates({ inventory: w1Inventory, dictionaries: [dictionaryFile], templates: candidates })[0])
    .toMatchObject({ templateId: 'wet-linear', rank: 1, rolesOutOfRange: 0 });

  const w2Inventory = buildInventory(w2, metadata());
  expect(w2Inventory.aliases.map(({ alias }) => alias)).toEqual([
    'BUF1', 'DRY1', 'DRY2', 'LP1', 'LP2', 'LP3', 'RAIL1', 'WC1', 'WC2', 'WC3', 'WC4', 'WR1',
  ]);
  const wetProposal = proposeTemplates({ inventory: w2Inventory, dictionaries: [dictionaryFile], templates: candidates })
    .find(({ templateId }) => templateId === 'wet-linear')!;
  expect(wetProposal.rolesOutOfRange).toBe(1);
  expect(wetProposal.roleFit.find(({ role }) => role === 'cell')).toEqual({
    role: 'cell', observed: 4, drawn: 3, min: 3, max: 3, inRange: false,
  });
  expect(wetProposal.roleFit.filter(({ role }) => role !== 'cell').every(({ inRange }) => inRange)).toBe(true);
});

it('reports the added alias and slots as Drift against the w1 generic layout', () => {
  const dictionaryFile = dictionary();
  const w1Inventory = buildInventory(batch('w1'), metadata());
  const w2Inventory = buildInventory(batch('w2'), metadata());
  const layout = buildGenericLayout({ inventory: w1Inventory, dictionaries: [dictionaryFile] }).layout;
  const mapping = {
    schemaVersion: '0.4' as const,
    equipmentId: 'eq-synth-03',
    layoutId: layout.id,
    entries: [],
    hash: `sha256:${'0'.repeat(64)}`,
  };

  expect(detectDrift({ baseline: w1Inventory, current: w2Inventory, mapping, layout })).toEqual({
    newAliases: ['WC4'],
    newSlots: [{ alias: 'BUF1', slot: '9' }, { alias: 'WC4', slot: '1' }],
    transfersWithoutCapability: [],
  });
});

it.each([
  { name: 'sub-ms', file: 'invalid/sub-ms.batch.json' },
  { name: 'continuation', file: 'invalid/continuation.batch.json' },
  { name: 'point-events', file: 'invalid/point-events.json' },
] as const)('keeps invalid upload example $name on its intended rejection path', ({ name, file }) => {
  const raw = read(file);
  const parsed = occurrenceBatchSchema.safeParse(raw);
  if (name === 'sub-ms') {
    expect(parsed.success).toBe(false);
    if (parsed.success) throw new Error('sub-ms fixture unexpectedly parsed');
    const occurrences = (raw as { occurrences: { id: string }[] }).occurrences;
    const path = ['occurrences', occurrences.findIndex(({ id }) => id === 'occ-sub-ms'), 'start', 'at'];
    expect(parsed.error.issues).toHaveLength(1);
    expect(parsed.error.issues[0]?.path).toEqual(path);
  } else if (name === 'point-events') {
    expect(parsed.success).toBe(false);
  } else {
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error('continuation fixture should be schema-valid');
    expect(parsed.data.continuationToken).toBe('page-2');
    expect(() => assertReplayInput({
      batch: parsed.data,
      layouts: [],
      bindings: { schemaVersion: '0.4', equipmentId: 'eq-synth-03', bindings: [] },
      mappings: [],
    })).toThrow(new RangeError('batch.continuationToken is set: replay needs the complete OccurrenceBatch'));
  }
});
