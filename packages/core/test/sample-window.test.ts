import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  bindingsFileSchema, observationHash, parseSampleWindowName, replayKey, sampleWindowName, validateSampleWindow,
  type ImportRejectCode, type OccurrenceBatch, type SampleWindowRef,
} from '../src/index.js';

const root = new URL('../../../fixtures/cluster-single/', import.meta.url);
const base = (): OccurrenceBatch => JSON.parse(readFileSync(new URL('occurrence-batch.json', root), 'utf8'));
const ctx = (existing: SampleWindowRef[] = []) => ({ equipmentId: 'eq-synth-01', existing });
const ref = (from: string, to: string, timeDomain = 'site-synth', hash = `sha256:${'a'.repeat(64)}`): SampleWindowRef => ({ from, to, timeDomain, hash });
const codes = (result: { issues?: { code: string }[] }) => result.issues?.map((issue) => issue.code);
const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === 'object') for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};
const run = async (edit: (b: OccurrenceBatch) => void, existing: SampleWindowRef[] = [], equipmentId = 'eq-synth-01') => {
  const batch = base();
  edit(batch);
  return validateSampleWindow(batch, { equipmentId, existing });
};

it('accepts the base batch and summarises it', async () => {
  const result = await validateSampleWindow(base(), ctx());
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  expect(result.warnings).toEqual([]);
  const { name, hash, ...rest } = result.summary;
  expect(rest).toEqual({
    from: '2026-01-01T10:00:00.000', to: '2026-01-01T10:30:00.000', timeDomain: 'site-synth', dataGeneration: 'g1',
    parserContractVersion: 'synthetic-1', watermark: { seq: 59, at: '2026-01-01T10:25:00.000' },
    occurrences: 29, openOccurrences: 1, dataQualityIssues: 2, dataQualityIssuesByType: { EndBeforeStart: 1, UnmatchedEnd: 1 },
    boundaryEvidence: { observed: 52, derived: 4, illustrative: 0, unknown: 1 },
    identityEvidence: { observed: 22, derived: 1, illustrative: 0, unknown: 2 },
    nullBoundaryTimes: 1, aliases: 8, seq: { min: 1, max: 59 },
  });
  expect(name).toBe(`20260101T100000.000_20260101T103000.000_${hash.slice(7)}`);
});

it.each<{ code: ImportRejectCode; path: (string | number)[]; edit: (b: OccurrenceBatch & Record<string, unknown>) => void; equipmentId?: string; existing?: SampleWindowRef[] }>([
  { code: 'schema', path: [], edit: (b) => { b.extra = 1; } },
  { code: 'fraction-too-long', path: ['from'], edit: (b) => { b.from = '2026-01-01T10:00:00.123456'; } },
  { code: 'fraction-missing', path: ['from'], edit: (b) => { b.from = '2026-01-01T10:00:00'; } },
  { code: 'offset', path: ['from'], edit: (b) => { b.from = '2026-01-01T10:00:00.000Z'; } },
  { code: 'offset', path: ['from'], edit: (b) => { b.from = '2026-01-01T10:00:00.000+09:00'; } },
  { code: 'malformed-time', path: ['from'], edit: (b) => { b.from = '2026-01-01 10:00:00.000'; } },
  { code: 'empty-range', path: ['to'], edit: (b) => { b.to = '2026-01-01T09:00:00.000'; } },
  { code: 'empty-range', path: ['to'], edit: (b) => { b.to = '2026-01-01T10:00:00.000'; } },
  { code: 'empty-time-domain', path: ['timeDomain'], edit: (b) => { b.timeDomain = ''; } },
  { code: 'continuation', path: ['continuationToken'], edit: (b) => { b.continuationToken = 'page-2'; } },
  { code: 'equipment-mismatch', path: ['equipmentId'], edit: () => {}, equipmentId: 'EQ-SYNTH-01' },
  { code: 'record-owner', path: ['occurrences', 3, 'equipmentId'], edit: (b) => { b.occurrences[3]!.equipmentId = 'other'; } },
  { code: 'duplicate-seq', path: ['occurrences', 2, 'start', 'seq'], edit: (b) => { b.occurrences[2]!.start.seq = 2; } },
  { code: 'duplicate-id', path: ['occurrences', 3, 'id'], edit: (b) => { b.occurrences[3]!.id = 'occ-lp-slot-two'; } },
  { code: 'duplicate-id', path: ['issues', 1, 'id'], edit: (b) => { b.issues[1]!.id = 'dqi-end-before-start'; } },
  { code: 'generation-mismatch', path: ['occurrences', 0, 'source', 'dataGeneration'], edit: (b) => { b.occurrences[0]!.source.dataGeneration = 'g2'; } },
  { code: 'outside-window', path: ['occurrences', 1], edit: (b) => { b.occurrences[1]!.start.at = '2026-01-01T09:00:00.000'; b.occurrences[1]!.end!.at = '2026-01-01T09:01:00.000'; } },
  { code: 'outside-window', path: ['occurrences', 1], edit: (b) => { b.occurrences[1]!.start.at = '2026-01-01T10:30:00.000'; b.occurrences[1]!.end!.at = '2026-01-01T10:31:00.000'; } },
  { code: 'window-overlap', path: ['from'], edit: () => {}, existing: [ref('2026-01-01T10:29:59.999', '2026-01-01T11:00:00.000')] },
  { code: 'time-domain-mismatch', path: ['timeDomain'], edit: () => {}, existing: [ref('2026-01-01T10:30:00.000', '2026-01-01T11:00:00.000', 'site-other')] },
])('rejects $code at $path (%#)', async ({ code, path, edit, equipmentId, existing }) => {
  const result = await run(edit, existing, equipmentId);
  expect(result.ok).toBe(false);
  expect(codes(result as { issues: { code: string }[] })).toEqual([code]);
  expect((result as { issues: { path: unknown }[] }).issues[0]!.path).toEqual(path);
});

it('allows one id in both arrays, since replayKey sorts them separately', async () => {
  const batch = base();
  batch.issues[1]!.id = batch.occurrences[0]!.id;
  const result = await validateSampleWindow(batch, ctx());
  expect(result.ok).toBe(true);
  expect(result.warnings).toEqual([]);
  const input = { batch, layouts: [], bindings: bindingsFileSchema.parse({ schemaVersion: '0.4', equipmentId: 'eq-synth-01', bindings: [] }), mappings: [] };
  await expect(replayKey(input, batch.from)).resolves.toBeDefined();
});

it('reports every shape problem together and never truncates a time', async () => {
  const batch = base() as OccurrenceBatch & Record<string, unknown>;
  batch.from = '2026-01-01T10:00:00.123456';
  batch.occurrences[0]!.end!.at = '2026-01-01T10:00:00.000Z';
  batch.extra = 1;
  const result = await validateSampleWindow(batch, ctx());
  expect(codes(result as { issues: { code: string }[] })).toEqual(['fraction-too-long', 'offset', 'schema']);
  expect(JSON.stringify(result)).not.toMatch(/10:00:00\.123(?!\d)/);
});

it('reports every semantic problem together, with a summary but no name or hash', async () => {
  const result = await run((b) => {
    b.occurrences[2]!.start.seq = 2;
    b.occurrences[3]!.id = 'occ-lp-slot-two';
    b.occurrences[0]!.source.dataGeneration = 'g2';
    b.occurrences[1]!.start.at = '2026-01-01T09:00:00.000';
    b.occurrences[1]!.end!.at = '2026-01-01T09:01:00.000';
    b.continuationToken = 'page-2';
  });
  if (result.ok) throw new Error('expected rejection');
  expect(new Set(codes(result))).toEqual(new Set(['duplicate-seq', 'duplicate-id', 'generation-mismatch', 'outside-window', 'continuation']));
  expect(result.summary).toBeDefined();
  expect(result.summary).not.toHaveProperty('name');
  expect(result.summary).not.toHaveProperty('hash');
});

it.each([
  { code: 'illustrative-in-source', edit: (b: OccurrenceBatch) => { b.occurrences[3]!.material!.identityEvidence = 'illustrative'; } },
  { code: 'no-occurrences', edit: (b: OccurrenceBatch) => { b.occurrences = []; b.issues = []; } },
  { code: 'dqi-outside-window', edit: (b: OccurrenceBatch) => { b.issues[0]!.relatedOccurrenceId = 'occ-elsewhere'; } },
])('accepts with warning $code', async ({ code, edit }) => {
  const result = await run(edit);
  expect(result.ok).toBe(true);
  expect(result.warnings.map((warning) => warning.code)).toEqual([code]);
  if (!result.ok) return;
  if (code === 'illustrative-in-source') expect(result.summary.identityEvidence.illustrative).toBe(1);
  if (code === 'no-occurrences') expect(result.summary.seq).toBeNull();
});

it('judges windows only on provable overlap', async () => {
  expect((await run(() => {}, [ref('2026-01-01T10:30:00.000', '2026-01-01T11:00:00.000')])).ok).toBe(true);
  const endsAtFrom = await run((b) => { b.occurrences[1]!.start.at = '2026-01-01T09:00:00.000'; b.occurrences[1]!.end!.at = '2026-01-01T10:00:00.000'; });
  expect(endsAtFrom.ok).toBe(true);
  const batch = base();
  const same = ref(batch.from, batch.to, batch.timeDomain, await observationHash(batch));
  expect((await validateSampleWindow(batch, ctx([same]))).ok).toBe(true);
});

it('hashes and names independently of record order', async () => {
  const batch = base();
  const reversed = base();
  reversed.occurrences.reverse();
  reversed.issues.reverse();
  const a = await validateSampleWindow(batch, ctx());
  const b = await validateSampleWindow(reversed, ctx());
  if (!a.ok || !b.ok) throw new Error('expected acceptance');
  expect(b.summary.hash).toBe(a.summary.hash);
  expect(b.summary.name).toBe(a.summary.name);
  const bindings = bindingsFileSchema.parse({ schemaVersion: '0.4', equipmentId: 'eq-synth-01', bindings: [] });
  expect((await replayKey({ batch, layouts: [], bindings, mappings: [] }, batch.from)).observationHash).toBe(a.summary.hash);
});

it('never mutates or alters its input', async () => {
  const raw = deepFreeze(base());
  const result = await validateSampleWindow(raw, ctx());
  if (!result.ok) throw new Error('expected acceptance');
  expect(result.batch).toEqual(raw);
});

it('names a window and parses the name back', async () => {
  const batch = base();
  const result = await validateSampleWindow(batch, ctx());
  if (!result.ok) throw new Error('expected acceptance');
  expect(await sampleWindowName(batch)).toBe(result.summary.name);
  expect(parseSampleWindowName(result.summary.name)).toEqual({ from: batch.from, to: batch.to, hash: result.summary.hash });
});

const hex = 'ab'.repeat(32);
const f = '20260101T100000.000';
const t = '20260101T103000.000';
it.each([
  { why: 'a .batch.json suffix', name: `${f}_${t}_${hex}.batch.json` },
  { why: 'uppercase hex', name: `${f}_${t}_${hex.toUpperCase()}` },
  { why: '63 hex digits', name: `${f}_${t}_${hex.slice(1)}` },
  { why: 'from equal to to', name: `${f}_${f}_${hex}` },
  { why: 'from after to', name: `${t}_${f}_${hex}` },
  { why: 'a missing part', name: `${f}_${hex}` },
])('does not parse a name with $why', ({ name }) => {
  expect(parseSampleWindowName(name)).toBeNull();
});
