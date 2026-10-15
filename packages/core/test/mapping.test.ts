import { expect, it } from 'vitest';
import { z } from 'zod';
import {
  publishMapping, verifyMappingHash, resolveLocation, resolveRole, validateAliasRules,
  validateBindings, validateTypeDictionary, typeDictionaryFileSchema, aliasRulesFileSchema,
  mappingVersionSchema, bindingsFileSchema,
  type AliasRule, type AliasRulesFile, type MappingScope, type MappingVersion, type BindingsFile,
} from '../src/index.js';
import { clusterTemplate } from './fixtures/layout.js';

const at = '2026-01-01T00:00:00.000';
const later = '2026-02-01T00:00:00.000';
const scope: MappingScope = { level: 'model', maker: 'synthetic', model: 'cluster' };
const rule = (id: string, match: AliasRule['match'], target: AliasRule['target']): AliasRule =>
  ({ id, match, target, certainty: 'assumed' });
const file = (rules: AliasRule[], s: MappingScope = scope): AliasRulesFile => ({ schemaVersion: '0.4', scope: s, rules });
const publish = (ruleFiles: AliasRulesFile[], aliases = ['PM1']) => publishMapping({
  equipmentId: 'eq-1', maker: 'synthetic', model: 'cluster', ruleFiles, aliases, layout: clusterTemplate(),
});
const bindings = (mapping: MappingVersion): BindingsFile => ({
  schemaVersion: '0.4', equipmentId: 'eq-1', bindings: [{ layoutId: mapping.layoutId, mappingHash: mapping.hash, effectiveFrom: at }],
});
function resolve(mapping: MappingVersion, alias: string, slot?: string) {
  return resolveLocation({ bindings: bindings(mapping), mappings: [mapping], alias, slot, at });
}
const split = { offset: 0, assign: [
  { from: 1, to: 2, holdingSiteId: 'slot-1' }, { from: 3, to: 4, holdingSiteId: 'slot-2' },
] };

it.each([
  { name: 'exact', match: { exact: ['PM1'] }, target: { componentId: 'pm-a' }, alias: 'PM1', componentId: 'pm-a' },
  { name: 'pattern', match: { pattern: 'PM{n}' }, target: { componentId: 'pm-{n:letter}' }, alias: 'PM2', componentId: 'pm-b' },
  { name: 'many-to-one', match: { exact: ['CH1', 'Chamber1'] }, target: { componentId: 'pm-a' }, alias: 'Chamber1', componentId: 'pm-a' },
  { name: 'slot split', match: { exact: ['LLA'] }, target: { componentId: 'll-a', slots: split }, alias: 'LLA', slot: '3', componentId: 'll-a', holdingSiteId: 'slot-2' },
  { name: 'slot transform', match: { exact: ['LLA'] }, target: { componentId: 'll-a', slots: { ...split, offset: 1 } }, alias: 'LLA', slot: '0', componentId: 'll-a', holdingSiteId: 'slot-1' },
  { name: 'robot arm', match: { exact: ['TM_R1'] }, target: { componentId: 'tm-robot', slots: { offset: 0, assign: [{ from: 2, to: 2, holdingSiteId: 'blade-b' }] } }, alias: 'TM_R1', slot: '2', componentId: 'tm-robot', holdingSiteId: 'blade-b' },
  { name: 'ignore', match: { exact: ['VIRT_SCH'] }, target: { ignore: true as const }, alias: 'VIRT_SCH' },
])('publishes and resolves $name', async ({ match, target, alias, slot, componentId, holdingSiteId }) => {
  const result = await publish([file([rule('rule-a', match, target)])], [alias]);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  expect(resolve(result.mapping, alias, slot)).toEqual(componentId ? {
    kind: 'location', componentId, ...(holdingSiteId ? { holdingSiteId } : {}),
    slotStatus: holdingSiteId ? 'mapped' : 'none', certainty: 'assumed',
    mappingHash: result.mapping.hash, layoutId: result.mapping.layoutId,
  } : { kind: 'ignored', mappingHash: result.mapping.hash });
});

it.each([true, false])('uses scope first and then exact over pattern (equipment=%s)', async (equipment) => {
  const result = await publish([
    file([rule('exact', { exact: ['PM1'] }, { componentId: 'pm-a' })]),
    file([rule('pattern', { pattern: 'PM{n}' }, { componentId: 'pm-b' })], equipment ? { level: 'equipment', equipmentId: 'eq-1' } : scope),
  ]);
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.mapping.entries[0]?.target).toEqual({ componentId: equipment ? 'pm-b' : 'pm-a' });
});

it.each(['exact', 'pattern'] as const)('refuses same-level %s conflicts with both rule references', async (kind) => {
  const match = kind === 'exact' ? { exact: ['PM1'] } : { pattern: 'PM{n}' };
  const result = await publish(['rule-a', 'rule-b'].map((id) => file([rule(id, match, { componentId: 'pm-a' })])));
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.issues).toEqual([expect.objectContaining({ code: 'same-level-overlap', message: expect.stringMatching(/rule-a.*rule-b|rule-b.*rule-a/) })]);
});

it('publishes deterministic versions and verifies their content hash', async () => {
  const rules = [rule('first', { exact: ['PM1'] }, { componentId: 'pm-a' }), rule('second', { exact: ['PM2'] }, { componentId: 'pm-b' })];
  const files = [file(rules), file([], { level: 'global' })];
  const first = await publish(files, ['PM2', 'PM1', 'PM1']);
  expect(first.ok).toBe(true);
  if (!first.ok) return;
  expect(await publish(files, ['PM2', 'PM1'])).toEqual(first);
  expect(await publish([files[1]!, file([...rules].reverse())], ['PM1', 'PM2'])).toEqual(first);
  expect(await verifyMappingHash(first.mapping)).toBe(true);
  const changed = structuredClone(first.mapping);
  changed.entries[0]!.certainty = 'verified';
  expect(await verifyMappingHash(changed)).toBe(false);
});

it('never treats matching component ids or labels as evidence', async () => {
  const layout = clusterTemplate();
  layout.components.find((component) => component.id === 'pm-a')!.label = 'PM1';
  const result = await publishMapping({ equipmentId: 'eq-1', maker: 'synthetic', model: 'cluster', ruleFiles: [], aliases: ['pm-a', 'PM1'], layout });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.mapping.entries).toEqual([]);
  for (const alias of ['pm-a', 'PM1']) expect(resolve(result.mapping, alias)).toEqual({ kind: 'unknown', reason: 'unmapped-alias' });
});

it.each([
  { target: { componentId: 'missing' }, match: { exact: ['PM1'] }, alias: 'PM1', ok: false },
  { target: { componentId: 'pm-a', slots: { offset: 0, assign: [{ from: 1, to: 1, holdingSiteId: 'missing' }] } }, match: { exact: ['PM1'] }, alias: 'PM1', ok: false },
  { target: { componentId: 'pm-{n:letter}' }, match: { pattern: 'PM{n}' }, alias: 'PM9', ok: true },
])('checks targets without inventing a pattern target ($alias, $ok)', async ({ target, match, alias, ok }) => {
  const result = await publish([file([rule('target', match, target)])], [alias]);
  expect(result.ok).toBe(ok);
  if (result.ok) expect(result.mapping.entries).toEqual([]);
  else expect(result.issues).toEqual([expect.objectContaining({ code: 'unknown-target' })]);
});

it.each([
  { slots: split, slot: undefined, status: 'none' }, { slots: undefined, slot: '1', status: 'none' },
  ...['x', '8', '1.0', '1e0', ' 1', '1\n', '9007199254740993'].map((slot) => ({ slots: split, slot, status: 'unmapped' })),
])('keeps uncertain slots unassigned ($slot, $status)', async ({ slots, slot, status }) => {
  const result = await publish([file([rule('slots', { exact: ['LLA'] }, { componentId: 'll-a', ...(slots ? { slots } : {}) })])], ['LLA']);
  expect(result.ok).toBe(true);
  if (result.ok) expect(resolve(result.mapping, 'LLA', slot)).toEqual({ kind: 'location', componentId: 'll-a', slotStatus: status, certainty: 'assumed', mappingHash: result.mapping.hash, layoutId: result.mapping.layoutId });
});

it('switches binding at the half-open boundary and reports absent bindings or mappings', async () => {
  const a = await publish([file([rule('a', { exact: ['PM1'] }, { componentId: 'pm-a' })])]);
  const b = await publish([file([rule('b', { exact: ['PM1'] }, { componentId: 'pm-b' })])]);
  if (!a.ok || !b.ok) throw new Error('publish failed');
  const input = { bindings: { ...bindings(a.mapping), bindings: [
    { ...bindings(a.mapping).bindings[0]!, effectiveTo: later },
    { ...bindings(b.mapping).bindings[0]!, effectiveFrom: later },
  ] }, mappings: [a.mapping, b.mapping], alias: 'PM1' };
  expect(resolveLocation({ ...input, at })).toMatchObject({ componentId: 'pm-a' });
  expect(resolveLocation({ ...input, at: later })).toMatchObject({ componentId: 'pm-b' });
  expect(resolveLocation({ ...input, at: '2025-12-31T23:59:59.999' })).toEqual({ kind: 'unknown', reason: 'no-binding' });
  expect(resolveLocation({ ...input, mappings: [], at })).toEqual({ kind: 'unknown', reason: 'missing-mapping' });
});

it.each(['overlap', 'equal', 'reverse', 'open-before-latest'])('rejects invalid binding intervals: %s', (kind) => {
  const binding = { layoutId: 'cluster-single', mappingHash: `sha256:${'0'.repeat(64)}`, effectiveFrom: at };
  const rows = kind === 'equal' || kind === 'reverse'
    ? [{ ...binding, effectiveTo: kind === 'equal' ? at : '2025-01-01T00:00:00.000' }]
    : [{ ...binding, ...(kind === 'overlap' ? { effectiveTo: '2026-03-01T00:00:00.000' } : {}) }, { ...binding, effectiveFrom: later }];
  const result = validateBindings({ schemaVersion: '0.4', equipmentId: 'eq-1', bindings: rows });
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.issues.some((issue) => issue.code === (kind === 'overlap' ? 'binding-overlap' : 'binding-order'))).toBe(true);
});

it('resolves the most specific dictionary and detects duplicate entries', () => {
  const dictionaries = [scope, { level: 'equipment' as const, equipmentId: 'eq-1' }].map((scope, i) => ({ schemaVersion: '0.4' as const, scope, entries: [{ moduleType: 'PROCESS', role: i ? 'chamber' : 'pm' }] }));
  expect(resolveRole(dictionaries, 'PROCESS')).toBe('chamber');
  expect(resolveRole(dictionaries, 'missing')).toBe('unknown');
  expect(validateTypeDictionary({ ...dictionaries[0], entries: [dictionaries[0]!.entries[0], dictionaries[0]!.entries[0]] })).toMatchObject({ ok: false, issues: [{ code: 'duplicate-entry', path: ['entries', 1, 'moduleType'] }] });
});

it.each([
  { name: 'duplicate alias', rules: [rule('a', { exact: ['PM1'] }, { ignore: true }), rule('b', { exact: ['PM1'] }, { ignore: true })], code: 'duplicate-alias' },
  { name: 'duplicate id', rules: [rule('a', { exact: ['PM1'] }, { ignore: true }), rule('a', { exact: ['PM2'] }, { ignore: true })], code: 'duplicate-id' },
  { name: 'unknown capture', rules: [rule('a', { pattern: 'PM{n}' }, { componentId: 'pm-{m}' })], code: 'unknown-capture' },
  { name: 'malformed pattern', rules: [rule('a', { pattern: 'PM{N}' }, { ignore: true })], code: 'schema' },
  { name: 'exact capture', rules: [rule('a', { exact: ['PM1'] }, { componentId: 'pm-{n}' })], code: 'schema' },
  { name: 'overlapping slots', rules: [rule('a', { exact: ['LLA'] }, { componentId: 'll-a', slots: { ...split, assign: [split.assign[0]!, { from: 2, to: 3, holdingSiteId: 'slot-2' }] } })], code: 'overlapping-slots' },
])('validates alias files: $name', async ({ rules, code }) => {
  const result = validateAliasRules(file(rules));
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.issues.some((issue) => issue.code === code)).toBe(true);
  expect((await publish([file(rules)])).ok).toBe(false);
});

it('accepts disjoint inclusive slot ranges', () => {
  expect(validateAliasRules(file([rule('a', { exact: ['LLA'] }, { componentId: 'll-a', slots: split })])).ok).toBe(true);
});

it.each([
  { level: 'model' as const, maker: 'synthetic', model: 'other' },
  { level: 'maker' as const, maker: 'other' },
  { level: 'equipment' as const, equipmentId: 'other' },
])('rejects mismatched $level scope files', async (scope) => {
  expect(await publish([file([], scope)])).toMatchObject({ ok: false, issues: [{ code: 'scope-mismatch' }] });
});

it.each([
  ['type-dictionary', typeDictionaryFileSchema], ['alias-rules', aliasRulesFileSchema],
  ['mapping-version', mappingVersionSchema], ['bindings', bindingsFileSchema],
] as const)('pins the %s JSON Schema', async (name, schema) => {
  await expect(JSON.stringify(z.toJSONSchema(schema), null, 2) + '\n').toMatchFileSnapshot(`../schema/${name}.schema.json`);
});

it.each(['PM0', 'PM27', 'pm1', 'PM1\n'])('does not resolve invalid letter captures or partial matches: %s', async (alias) => {
  const result = await publish([file([rule('a', { pattern: 'PM{n}' }, { componentId: 'pm-{n:letter}' })])], [alias]);
  expect(result).toMatchObject({ ok: true, mapping: { entries: [] } });
});

it('treats glob literals literally and preserves captured digits verbatim', async () => {
  const layout = clusterTemplate();
  const component = layout.components.find((component) => component.id === 'pm-a')!;
  component.id = 'pm-01';
  const result = await publishMapping({ equipmentId: 'eq-1', maker: 'synthetic', model: 'cluster', layout,
    ruleFiles: [file([rule('literal', { pattern: 'PM.+[{n}]' }, { componentId: 'pm-{n}' })])], aliases: ['PM.+[01]', 'PMxx01'] });
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.mapping.entries.map(({ alias, target }) => ({ alias, target }))).toEqual([
    { alias: 'PM.+[01]', target: { componentId: 'pm-01' } },
  ]);
});

it('hashes canonical JSON using an independently computed SHA-256 vector', async () => {
  const result = await publish([], []);
  expect(result).toMatchObject({ ok: true, mapping: {
    hash: 'sha256:79e02fb9a9756c3fbcf9f6410a5b97c3602ca81732c90a6afbbec1eb0a3e9358',
  } });
});
