import { expect, it } from 'vitest';
import { computeCoverage, layoutDocumentSchema, type EquipmentLayoutDocument } from '@eqv/core';
import { summarizeFleet, type FleetData } from '../src/index.js';
import { bindings, inventory, mappings, read, record } from './data.js';

const published = (change: Partial<FleetData> = {}): FleetData =>
  ({ record, inventory: inventory(), bindings, mappings, hasAliasRules: true, baseline: null, layout: null, ...change });
const layout = layoutDocumentSchema.parse(read('fixtures/cluster-single/layout.json')) as EquipmentLayoutDocument;
const LATEST = 'sha256:0abf3e9ff0b22cb0e7993bfe143461f44ef1b8828df2cdce8e25af3d02987aef';

it('takes coverage from the binding with the latest effectiveFrom', () => {
  const [row] = summarizeFleet([published()]);
  const latest = bindings.bindings.reduce((a, b) => b.effectiveFrom > a.effectiveFrom ? b : a);
  expect(latest.mappingHash).toBe(LATEST);
  const coverage = computeCoverage(inventory(), mappings[LATEST]!);
  expect(row).toMatchObject({ status: 'published', error: null, coverage, assumedRatio: coverage.assumed.ratio,
    unmappedReferences: coverage.unmapped.reduce((sum, { references }) => sum + references, 0) });
});

it.each([
  ['an empty bindings file with rules', { bindings: { ...bindings, bindings: [] }, hasAliasRules: true }, 'draft'],
  ['no bindings file with rules', { bindings: null, hasAliasRules: true }, 'draft'],
  ['no bindings file and no rules', { bindings: null, hasAliasRules: false }, 'unstarted'],
] as [string, Partial<FleetData>, string][])('is %s: %s', (_, change, status) => {
  const [row] = summarizeFleet([published(change)]);
  const references = inventory().aliases.reduce((sum, { references }) => sum + references, 0);
  expect(row).toMatchObject({ status, coverage: null, assumedRatio: null, unmappedReferences: references, error: null });
});

it('turns a missing mapping file into an error row without ratios', () => {
  const [row] = summarizeFleet([published({ mappings: {} })]);
  expect(row).toMatchObject({ status: null, coverage: null, assumedRatio: null, unmappedReferences: null });
  expect(row!.error).toContain(LATEST);
});

it('turns a core tuple RangeError into an error row', () => {
  const other = { ...inventory(), equipmentId: 'eq-other' };
  const [row] = summarizeFleet([published({ inventory: other })]);
  expect(row).toMatchObject({ status: null, unmappedReferences: null });
  expect(row!.error).toContain('eq-other');
});

it('stays published, not drift-free, when the baseline or the layout is missing', () => {
  const rows = summarizeFleet([published({ layout }), published({ baseline: inventory() })]);
  expect(rows.map(({ status, drift }) => [status, drift])).toEqual([['published', null], ['published', null]]);
});

it('is published with an empty drift when the window matches the baseline and every transfer has a capability', () => {
  const [row] = summarizeFleet([published({ baseline: inventory(), layout })]);
  expect(row).toMatchObject({ status: 'published', drift: { newAliases: [], newSlots: [], transfersWithoutCapability: [] } });
});

it.each([
  ['a new alias', { baseline: () => ({ ...inventory(), aliases: inventory().aliases.filter(({ alias }) => alias !== 'LP1') }), layout: () => layout },
    (drift: NonNullable<ReturnType<typeof summarizeFleet>[number]['drift']>) => expect(drift.newAliases).toEqual(['LP1'])],
  ['a new slot', { baseline: () => ({ ...inventory(), aliases: inventory().aliases.map((row) => row.alias === 'LP1' ? { ...row, slots: ['1'] } : row) }), layout: () => layout },
    (drift: NonNullable<ReturnType<typeof summarizeFleet>[number]['drift']>) => expect(drift.newSlots).toEqual([{ alias: 'LP1', slot: '2' }])],
  ['a transfer without capability', { baseline: () => inventory(), layout: () => ({ ...layout, transferCapabilities: [] }) },
    (drift: NonNullable<ReturnType<typeof summarizeFleet>[number]['drift']>) => expect(drift.transfersWithoutCapability.length).toBeGreaterThan(0)],
])('is drift for %s', (_, { baseline, layout: makeLayout }, check) => {
  const [row] = summarizeFleet([published({ baseline: baseline(), layout: makeLayout() })]);
  expect(row).toMatchObject({ status: 'drift', error: null });
  check(row!.drift!);
});

it('turns a drift detection RangeError into an error row', () => {
  const [row] = summarizeFleet([published({ baseline: { ...inventory(), equipmentId: 'eq-other' }, layout })]);
  expect(row).toMatchObject({ status: null, drift: null });
  expect(row!.error).toContain('eq-other');
});

it('turns a registered equipment without Sample Windows into a status row, not an error', () => {
  const [row] = summarizeFleet([{ record, noObservations: true }]);
  expect(row).toMatchObject({ status: 'no-observations', error: null, coverage: null, assumedRatio: null, unmappedReferences: null });
});

it('sorts error rows, then no-observations rows, then by unmapped references descending, ties by equipmentId', () => {
  const unpublished = (equipmentId: string, drop: number) => published({
    record: { ...record, equipmentId }, bindings: null,
    inventory: { ...inventory(), equipmentId, aliases: inventory().aliases.slice(drop) },
  });
  const rows = summarizeFleet([
    unpublished('b', 0), unpublished('a', 0), unpublished('c', 3),
    { equipmentId: 'z', maker: null, model: null, error: '관측 데이터 없음' }, published(),
    { record: { ...record, equipmentId: 'm' }, noObservations: true },
  ]);
  expect(rows.map(({ equipmentId }) => equipmentId)).toEqual(['z', 'm', 'a', 'b', 'c', 'eq-synth-01']);
});
