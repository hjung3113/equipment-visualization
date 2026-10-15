import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { z } from 'zod';

import { occurrenceBatchSchema, type Occurrence, type OccurrenceBatch } from '../src/index.js';

const fixtureUrl = new URL('../../../fixtures/cluster-single/occurrence-batch.json', import.meta.url);
const readmeUrl = new URL('../../../fixtures/cluster-single/README.md', import.meta.url);
const readFixture = (): unknown => JSON.parse(readFileSync(fixtureUrl, 'utf8'));
const batch = (): OccurrenceBatch => occurrenceBatchSchema.parse(readFixture());
const readme = () => readFileSync(readmeUrl, 'utf8');
const caseTable = () => readme().split('\n').filter((line) => line.startsWith('|')).join('\n');
const occurrence = (input: OccurrenceBatch, id: string): Occurrence => {
  const row = input.occurrences.find((item) => item.id === id);
  if (!row) throw new Error(`Missing occurrence ${id}`);
  return row;
};
const overlaps = (a: Occurrence, b: Occurrence) => {
  expect(a.start.at).not.toBeNull();
  expect(b.start.at).not.toBeNull();
  return (b.end === null || (a.start.at! < b.end.at!))
    && (a.end === null || (b.start.at! < a.end.at!));
};

it('parses the source-shaped synthetic OccurrenceBatch without adding or removing fields', () => {
  expect(batch()).toEqual(readFixture());
});

it('has globally unique record sequences and valid issue references', () => {
  const input = batch();
  const sequences = [
    ...input.occurrences.flatMap((row) => row.end ? [row.start.seq, row.end.seq] : [row.start.seq]),
    ...input.issues.map((row) => row.seq),
  ];
  expect(new Set(sequences).size).toBe(sequences.length);
  for (const issue of input.issues) {
    if (issue.relatedOccurrenceId) expect(input.occurrences.some((row) => row.id === issue.relatedOccurrenceId)).toBe(true);
  }
});

it('links every fixture id to the README case table in both directions', () => {
  const input = batch();
  const ids = [...input.occurrences, ...input.issues].map((row) => row.id);
  const linked = [...caseTable().matchAll(/`((?:occ|dqi)-[^`]+)`/g)].map((match) => match[1]);
  expect([...new Set(linked)].sort()).toEqual(ids.sort());
});

type Case = { id: string; check: (row: Occurrence, input: OccurrenceBatch) => void };
const cases: Case[] = [
  { id: 'occ-efem-out', check: (row, input) => {
    for (const id of ['occ-carrier', 'occ-lp-slot-one', 'occ-efem-out', 'occ-lla-arrival', 'occ-tm-out', 'occ-pm1-process', 'occ-tm-return', 'occ-lla-return', 'occ-efem-return', 'occ-lp-return']) {
      const normal = occurrence(input, id);
      expect(normal.start.evidence).toBe('observed');
      expect(normal.end?.evidence).toBe('observed');
      expect(normal.material?.identityEvidence).toBe('observed');
    }
    expect(row.kind).toBe('TRANSFER');
    expect(row.location?.moduleAlias).toBe('EFEM_R1');
    expect(row.from).toEqual({ moduleAlias: 'LP1', slotAlias: '1' });
    expect(row.to).toEqual({ moduleAlias: 'LLA', slotAlias: '1' });
    expect(row.start.evidence).toBe('observed');
    expect(row.end?.evidence).toBe('observed');
    expect(row.material).toMatchObject({ id: 'W01', identityEvidence: 'observed' });
  } },
  { id: 'occ-pm1-process', check: (row, input) => {
    const tm = occurrence(input, 'occ-tm-out');
    const back = occurrence(input, 'occ-tm-return');
    expect(tm.from).toEqual({ moduleAlias: 'LLA', slotAlias: '1' });
    expect(tm.to).toEqual({ moduleAlias: 'PM1' });
    expect(row).toMatchObject({ kind: 'PROCESS', location: { moduleAlias: 'PM1' } });
    expect(tm.end!.at! <= row.start.at!).toBe(true);
    expect(row.end!.at! <= back.start.at!).toBe(true);
    expect(back.from).toEqual(tm.to);
    expect(back.to).toEqual(tm.from);
    const efem = occurrence(input, 'occ-efem-return');
    expect(back.end!.at! <= efem.start.at!).toBe(true);
    expect(efem.to).toEqual({ moduleAlias: 'LP1', slotAlias: '1' });
  } },
  { id: 'occ-forced', check: (row) => {
    expect(row.start.evidence).toBe('observed');
    expect(row.end).toMatchObject({ evidence: 'derived', reason: expect.stringMatching(/^Forced/) });
  } },
  { id: 'occ-fallback', check: (row) => {
    expect(row.start.evidence).toBe('derived');
    expect(row.end?.evidence).toBe('observed');
  } },
  { id: 'occ-relocation', check: (row) => {
    expect(row).toMatchObject({ kind: 'TRANSFER', synthetic: true });
    expect(row.start.evidence).toBe('derived');
    expect(row.end?.evidence).toBe('derived');
  } },
  { id: 'occ-inferred', check: (row) => {
    expect(row.material?.id).not.toBeNull();
    expect(row.material?.identityEvidence).toBe('derived');
  } },
  ...['empty', 'unknown'].map((state): Case => ({ id: `occ-identity-${state}`, check: (row) => {
    expect(row.material).toMatchObject({ id: null, identityEvidence: 'unknown' });
  } })),
  { id: 'occ-open', check: (row, input) => {
    expect(row.end).toBeNull();
    expect(row.start.at! < input.to).toBe(true);
  } },
  { id: 'occ-carrier', check: (row, input) => {
    expect(row).toMatchObject({ kind: 'CARRIER_PRESENCE', location: { moduleAlias: 'LP1' }, material: { kind: 'carrier', id: 'C01' } });
    expect(row.start.at! < input.from).toBe(true);
    expect(row.end!.at! > input.from).toBe(true);
  } },
  { id: 'occ-time-anomaly', check: (row, input) => {
    expect(row.end!.at! < row.start.at!).toBe(true);
    expect(row.end!.seq > row.start.seq).toBe(true);
    const records = input.occurrences.flatMap((item) => item.end ? [item.start, item.end] : [item.start])
      .concat(input.issues.map((issue) => ({ ...issue, evidence: 'unknown' as const })))
      .sort((a, b) => a.seq - b.seq);
    const index = records.findIndex((item) => item.seq === row.start.seq);
    expect(records[index + 1]?.seq).toBe(row.end!.seq);
    expect(records[index + 1]!.at! < records[index]!.at!).toBe(true);
    expect(input.issues.find((issue) => issue.issueType === 'EndBeforeStart')?.relatedOccurrenceId).toBe(row.id);
    const unmatched = input.issues.find((issue) => issue.issueType === 'UnmatchedEnd');
    expect(unmatched).toBeDefined();
    expect(unmatched).not.toHaveProperty('relatedOccurrenceId');
  } },
  { id: 'occ-null-time', check: (row) => { expect(row.start.at).toBeNull(); } },
  { id: 'occ-tm-out', check: (row, input) => {
    const visit = occurrence(input, 'occ-lla-arrival');
    expect(visit.end?.at).toBe(row.start.at);
    expect(visit.end?.seq).not.toBe(row.start.seq);
    const bind = readme().match(/T_BIND = `(\d{4}-[^`]+)`/)?.[1];
    expect(bind).toBeDefined();
    expect(input.from < bind! && bind! < input.to).toBe(true);
    expect(row.start.at! < bind! && bind! < row.end!.at!).toBe(true);
  } },
  { id: 'occ-efem-overlap', check: (row, input) => {
    const tm = occurrence(input, 'occ-tm-out');
    expect([row.kind, tm.kind]).toEqual(['TRANSFER', 'TRANSFER']);
    expect([row.location?.moduleAlias, tm.location?.moduleAlias]).toEqual(['EFEM_R1', 'TM_R1']);
    expect(overlaps(row, tm)).toBe(true);
  } },
  { id: 'occ-tm-arm-two', check: (row, input) => {
    const other = occurrence(input, 'occ-tm-out');
    expect([row.kind, other.kind]).toEqual(['TRANSFER', 'TRANSFER']);
    expect(row.location).toEqual({ moduleAlias: 'TM_R1', slotAlias: '2' });
    expect(other.location).toEqual({ moduleAlias: 'TM_R1', slotAlias: '1' });
    expect(row.material?.id).not.toBe(other.material?.id);
    expect(overlaps(row, other)).toBe(true);
  } },
  { id: 'occ-pm2-slot-two', check: (row, input) => {
    const other = occurrence(input, 'occ-pm2-slot-one');
    expect(row.location).toEqual({ moduleAlias: 'PM2', slotAlias: '2' });
    expect(other.location).toEqual({ moduleAlias: 'PM2', slotAlias: '1' });
    expect(overlaps(row, other)).toBe(true);
  } },
  { id: 'occ-lla-conflict-two', check: (row, input) => {
    const other = occurrence(input, 'occ-lla-conflict-one');
    expect(row.location).toEqual({ moduleAlias: 'LLA', slotAlias: '1' });
    expect(row.location).toEqual(other.location);
    expect([row.material?.kind, other.material?.kind]).toEqual(['wafer', 'wafer']);
    expect(row.material?.id).not.toBe(other.material?.id);
    expect(overlaps(row, other)).toBe(true);
  } },
  { id: 'occ-unmapped', check: (row) => { expect(row.location?.moduleAlias).toBe('PM9'); } },
  { id: 'occ-ignored', check: (row, input) => {
    expect(row.location?.moduleAlias).toBe('VIRT_SCH');
    const previous = occurrence(input, 'occ-unmapped');
    expect(row.start.seq).toBe(previous.start.seq + 1);
    expect(row.start.at! < previous.start.at!).toBe(true);
    expect(row.end!.at! > row.start.at!).toBe(true);
    expect(previous.end!.at! > previous.start.at!).toBe(true);
  } },
  { id: 'occ-lp-slot-two', check: (row, input) => {
    expect(row.location).toEqual({ moduleAlias: 'LP1', slotAlias: '2' });
    expect(new Set(input.occurrences.flatMap((item) => item.material?.lotId ? [item.material.lotId] : [])).size).toBe(2);
  } },
  { id: 'occ-open', check: (_row, input) => {
    expect(input.from < input.watermark.at && input.watermark.at < input.to).toBe(true);
    const records = input.occurrences.flatMap((item) => item.end ? [item.start, item.end] : [item.start]);
    expect(records.every((record) => record.at === null || record.at <= input.watermark.at)).toBe(true);
    const absent = readme().match(/ABSENT_RECORD = `([^`]+)`/)?.[1];
    expect(absent).toBeDefined();
    expect(input.watermark.at < absent! && absent! < input.to).toBe(true);
    expect([...records, ...input.issues].some((record) => record.at === absent)).toBe(false);
    expect(Math.max(...records.map((record) => record.seq), ...input.issues.map((issue) => issue.seq))).toBe(input.watermark.seq);
  } },
];

it.each(cases)('pins the case relationship for $id', ({ id, check }) => {
  const input = batch();
  check(occurrence(input, id), input);
});

it.each([
  { name: 'timezone suffix', patch: { start: { at: '2026-01-01T00:00:00.000Z', seq: 0, evidence: 'observed' } } },
  { name: 'unknown kind', patch: { kind: 'POINT_EVENT' } },
  { name: 'unknown evidence', patch: { start: { at: null, seq: 0, evidence: 'reconstructed' } } },
  { name: 'extra occurrence key', patch: { extra: true } },
])('rejects $name', ({ patch }) => {
  const input = batch();
  input.occurrences[0] = { ...input.occurrences[0]!, ...patch } as Occurrence;
  expect(occurrenceBatchSchema.safeParse(input).success).toBe(false);
});

it('keeps the published OccurrenceBatch JSON Schema synchronized with zod', async () => {
  await expect(JSON.stringify(z.toJSONSchema(occurrenceBatchSchema), null, 2) + '\n')
    .toMatchFileSnapshot('../schema/occurrence-batch.schema.json');
});
