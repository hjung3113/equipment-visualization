import { expect, it } from 'vitest';
import { computeCoverage } from '@eqv/core';
import { summarizeFleet, type FleetData } from '../src/index.js';
import { bindings, inventory, mappings, record } from './data.js';

const published = (change: Partial<FleetData> = {}): FleetData =>
  ({ record, inventory: inventory(), bindings, mappings, hasAliasRules: true, ...change });
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
