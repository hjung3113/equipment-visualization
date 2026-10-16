import { expect, it } from 'vitest';
import { layoutRevision, validateBindings, type AliasRulesFile, type BindingsFile } from '@eqv/core';
import {
  conflictHighlight, defaultEffectiveFrom, dryRun, modelDryRunRows, planPublish, type DryRunInput, type ModelDryRunInput,
} from '../src/publish.js';
import { boardInput, layoutWithoutLpLl } from './board-data.js';
import { dictionaries, inventory } from './data.js';

const base = (change: Partial<DryRunInput> = {}): DryRunInput => {
  const { equipment, layout, ruleFiles } = boardInput();
  return { equipment, inventory: inventory(), dictionaries, layout, ruleFiles, ...change };
};
const hex = (n: string) => `sha256:${n.repeat(64)}`;
const binding = (change: Partial<BindingsFile['bindings'][number]> = {}): BindingsFile['bindings'][number] =>
  ({ layoutId: 'eq-synth-01-layout', mappingHash: hex('a'), effectiveFrom: '2026-01-01T09:00:00.000', ...change });
const file = (...bindings: BindingsFile['bindings']): BindingsFile => ({ schemaVersion: '0.4', equipmentId: 'eq-synth-01', bindings });
const brokenRules = (): AliasRulesFile => ({ schemaVersion: '0.4', scope: { level: 'model', maker: 'synth-maker', model: 'synth-model' },
  rules: [{ id: 'x', match: { exact: ['LP1'] }, target: { componentId: 'missing' }, certainty: 'verified' }] });

it('dry-runs the saved rule files with core coverage and conflicts, and skips both on rule issues', async () => {
  const input = base();
  const run = await dryRun(input);
  expect(run.issues).toEqual([]);
  expect(run.coverage).toEqual({
    references: { resolved: 41, total: 42, ratio: 41 / 42 }, aliases: { resolved: 6, total: 7, ratio: 6 / 7 },
    ignored: { aliases: ['VIRT_SCH'], references: 1 }, assumed: { references: 8, ratio: 8 / 41 },
    unmapped: [{ alias: 'PM9', references: 1 }],
  });
  expect(run.conflicts).toEqual([]);

  const broken = await dryRun(base({ ruleFiles: { model: brokenRules() } }));
  expect(broken).toMatchObject({ mapping: null, coverage: null, conflicts: [] });
  expect(broken.issues.length).toBeGreaterThan(0);
});

it('plans a first publish as one open binding with the layout revision', async () => {
  const input = base();
  const plan = await planPublish({ ...input, bindings: null, previous: null, effectiveFrom: input.inventory.from });
  expect(plan.problems).toEqual([]);
  expect(plan.layoutRevision).toBe(await layoutRevision(input.layout));
  expect(plan.bindings).toEqual(file({ layoutId: 'eq-synth-01-layout', mappingHash: plan.mapping!.hash, layoutRevision: plan.layoutRevision, effectiveFrom: input.inventory.from }));
  expect(validateBindings(plan.bindings).ok).toBe(true);
  expect(plan.baseline).toBe(input.inventory);
  expect(plan.diff.layout).toBe(`eq-synth-01-layout · revision ${plan.layoutRevision.slice(7, 19)} (이전 기록 없음)`);
  expect(plan.diff.entries.every(({ change }) => change === 'added')).toBe(true);
  expect(plan.diff.unchanged).toBe(0);
});

it('closes the latest open binding at the new effectiveFrom', async () => {
  const input = base();
  const open = binding();
  const plan = await planPublish({ ...input, bindings: file(open), previous: null, effectiveFrom: '2026-01-01T10:30:00.000' });
  expect(plan.problems).toEqual([]);
  expect(plan.bindings!.bindings).toEqual([
    { ...open, effectiveTo: '2026-01-01T10:30:00.000' },
    expect.objectContaining({ mappingHash: plan.mapping!.hash, layoutRevision: plan.layoutRevision, effectiveFrom: '2026-01-01T10:30:00.000' }),
  ]);
  expect(plan.bindings!.bindings[1]).not.toHaveProperty('effectiveTo');
  expect(plan.diff.binding).toHaveLength(2);
});

it.each([
  ['not after the latest effectiveFrom', '2026-01-01T09:00:00.000', 'effectiveFrom은 마지막 binding'],
  ['before the latest effectiveFrom', '2025-12-31T00:00:00.000', 'effectiveFrom은 마지막 binding'],
  ['malformed', '2026-01-01 10:30', 'effectiveFrom 형식'],
])('refuses an effectiveFrom that is %s', async (_name, effectiveFrom, text) => {
  const plan = await planPublish({ ...base(), bindings: file(binding()), previous: null, effectiveFrom });
  expect(plan.problems).toEqual([expect.stringContaining(text)]);
  expect(plan.bindings).toBeNull();
});

it('refuses a publish identical to the latest one, but not when the latest binding has no revision', async () => {
  const input = base();
  const first = await planPublish({ ...input, bindings: null, previous: null, effectiveFrom: input.inventory.from });
  const latest = binding({ mappingHash: first.mapping!.hash, layoutRevision: first.layoutRevision });
  const later = '2026-01-01T10:30:00.000';
  expect((await planPublish({ ...input, bindings: file(latest), previous: first.mapping, effectiveFrom: later })).problems).toEqual(['이전 게시와 같습니다']);
  const legacy = await planPublish({ ...input, bindings: file({ ...latest, layoutRevision: undefined }), previous: first.mapping, effectiveFrom: later });
  expect(legacy.problems).toEqual([]);
  expect(legacy.diff.layout).toContain('(이전 기록 없음)');
});

it('lists added, removed and changed entries against the previous Mapping Version', async () => {
  const input = base();
  const next = (await dryRun(input)).mapping!;
  const pm1 = next.entries.find(({ alias }) => alias === 'PM1')!;
  const pm2 = next.entries.find(({ alias }) => alias === 'PM2')!;
  const previous = {
    ...next,
    entries: [
      { ...pm1, certainty: 'assumed' as const },
      pm2,
      ...next.entries.filter(({ alias }) => alias !== 'PM1' && alias !== 'PM2' && alias !== 'LP1'),
      { alias: 'OLD', target: { ignore: true as const }, certainty: 'verified' as const, rule: pm1.rule },
    ],
  };
  const plan = await planPublish({ ...input, bindings: file(binding({ layoutRevision: hex('b') })), previous, effectiveFrom: '2026-01-01T10:30:00.000' });
  expect(plan.diff.entries.map(({ alias, change }) => [alias, change])).toEqual([['LP1', 'added'], ['OLD', 'removed'], ['PM1', 'changed']]);
  expect(plan.diff.entries[2]).toMatchObject({ before: 'pm-a · assumed · model:pm-pattern', after: 'pm-a · verified · model:pm-pattern' });
  expect(plan.diff.entries[1]).toMatchObject({ before: expect.stringMatching(/^무시 · verified · /), after: null });
  expect(plan.diff.unchanged).toBe(next.entries.length - 2);
  expect(plan.diff.layout).toContain('(이전 bbbbbbbbbbbb)');
});

it('surfaces rule issues as problems and writes nothing', async () => {
  const plan = await planPublish({ ...base({ ruleFiles: { model: brokenRules() } }), bindings: null, previous: null, effectiveFrom: '2026-01-01T10:00:00.000' });
  expect(plan.mapping).toBeNull();
  expect(plan.problems[0]).toMatch(/^규칙 문제/);
  expect(plan.bindings).toBeNull();
});

it('reports bindings that fail validation in Korean', async () => {
  const closed = binding({ effectiveTo: '2026-01-01T12:00:00.000' });
  const plan = await planPublish({ ...base(), bindings: file(closed), previous: null, effectiveFrom: '2026-01-01T10:30:00.000' });
  expect(plan.problems).toEqual(['Binding 구간이 겹칩니다']);
  expect(plan.bindings).toBeNull();
});

it.each([
  ['without bindings', null, '2026-01-01T10:00:00.000'],
  ['with bindings', file(binding()), '2026-01-01T10:30:00.000'],
  ['at Inventory end', file(binding({ effectiveFrom: '2026-01-01T10:30:00.000' })), ''],
  ['after Inventory end', file(binding({ effectiveFrom: '2026-01-02T00:00:00.000' })), ''],
])('prefills effectiveFrom from the Inventory %s', (_name, bindings, expected) => {
  expect(defaultEffectiveFrom(inventory(), bindings)).toBe(expected);
});

it('highlights both ends of a transfer conflict with the observed-transfer title and the component of any other conflict', async () => {
  const input = base({ layout: layoutWithoutLpLl() });
  const run = await dryRun(input);
  const transfer = run.conflicts.find((conflict) => conflict.kind === 'transfer-without-capability' && conflict.from === 'LP1')!;
  expect(conflictHighlight(transfer)).toEqual({
    componentIds: ['lp-a', 'll-a'],
    transfers: [{ from: 'lp-a', to: 'll-a', label: '관측 이송 LP1 → LLA 2건 (Transfer Capability 없음)' }],
  });
  expect(conflictHighlight({ kind: 'role-mismatch', alias: 'PM9', moduleType: 'PROCESS', expectedRole: 'pm', componentId: 'lp-a', componentRole: 'lp' }))
    .toEqual({ componentIds: ['lp-a'] });
});

const row = (equipmentId: string, change: Partial<ModelDryRunInput> = {}): ModelDryRunInput =>
  ({ equipmentId, published: true, input: base(), ...change });
const worse = (): ModelDryRunInput['input'] => base({ layout: layoutWithoutLpLl() });
const low = (): ModelDryRunInput['input'] => base({ ruleFiles: { model: { ...boardInput().ruleFiles.model!, rules: [] } } });

it.each([
  ['blocking issues first', [row('b'), row('a', { input: base({ ruleFiles: { model: brokenRules() } }) })], ['a', 'b']],
  ['then more conflicts', [row('a'), row('b', { input: worse() })], ['b', 'a']],
  ['then lower reference coverage', [row('a'), row('b', { input: low() })], ['b', 'a']],
  ['then equipmentId by code unit', [row('b'), row('B'), row('a')], ['B', 'a', 'b']],
])('orders same-Model rows: %s', async (_name, rows, expected) => {
  expect((await modelDryRunRows(rows)).map(({ equipmentId }) => equipmentId)).toEqual(expected);
});

it('shows a missing draft and a load error in the row instead of numbers', async () => {
  const rows = await modelDryRunRows([
    row('ok', { published: false }), row('nodraft', { input: { ...base(), layout: null } }), row('bad', { published: null, error: 'inventory 읽기 실패', input: undefined }),
  ]);
  expect(rows.find(({ equipmentId }) => equipmentId === 'nodraft')).toMatchObject({ error: '레이아웃 초안 없음', referenceRatio: null, conflicts: null });
  expect(rows.find(({ equipmentId }) => equipmentId === 'bad')).toMatchObject({ status: '—', error: 'inventory 읽기 실패', blockingIssues: null });
  expect(rows.find(({ equipmentId }) => equipmentId === 'ok')).toMatchObject({ status: '미게시', error: null, blockingIssues: 0, referenceRatio: expect.any(Number) });
});
