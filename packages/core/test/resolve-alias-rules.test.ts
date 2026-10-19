import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  aliasRulesFileSchema, buildGenericLayout, buildInventory, aliasMetadataFileSchema, instantiateLayout, layoutDocumentSchema,
  occurrenceBatchSchema, publishMapping, resolveAliasRules, validateLayout,
  type AliasRule, type AliasRulesFile, type EquipmentLayoutDocument, type MappingScope, type TemplateDocument,
} from '../src/index.js';

const read = (path: string): unknown => JSON.parse(readFileSync(new URL(`../../../fixtures/${path}`, import.meta.url), 'utf8'));
const layout = () => layoutDocumentSchema.parse(read('cluster-single/layout.json'));
const model = () => aliasRulesFileSchema.parse(read('cluster-single/onboarding/scopes/model/synth-maker/synth-model/alias-rules.json'));
const equipment = () => aliasRulesFileSchema.parse(read('cluster-single/onboarding/scopes/equipment/eq-synth-01/alias-rules.json'));
const inventory = () => buildInventory(occurrenceBatchSchema.parse(read('cluster-single/occurrence-batch.json')),
  aliasMetadataFileSchema.parse(read('cluster-single/onboarding/alias-metadata.json')));
const aliases = () => inventory().aliases.map((row) => row.alias);
const base = { equipmentId: 'eq-synth-01', maker: 'synth-maker', model: 'synth-model' };
const modelScope: MappingScope = { level: 'model', maker: 'synth-maker', model: 'synth-model' };
const rule = (id: string, match: AliasRule['match'], target: AliasRule['target']): AliasRule => ({ id, match, target, certainty: 'assumed' });
const file = (rules: AliasRule[], scope: MappingScope = modelScope): AliasRulesFile => ({ schemaVersion: '0.4', scope, rules });
const both = (ruleFiles: AliasRulesFile[], list = ['PM1']) => {
  const input = { ...base, ruleFiles, aliases: list, layout: layout() };
  return { resolved: resolveAliasRules(input), published: publishMapping(input) };
};

it('resolves the fixture to the entries publishMapping publishes', async () => {
  const input = { ...base, ruleFiles: [model(), equipment()], aliases: aliases(), layout: layout() };
  const resolved = resolveAliasRules(input);
  const published = await publishMapping(input);
  if (!published.ok) throw new Error(JSON.stringify(published.issues));
  expect(resolved.issues).toEqual([]);
  expect(resolved.aliases.map(({ alias }) => alias)).toEqual([...aliases()].sort());
  expect(resolved.aliases.flatMap(({ entry }) => entry ? [entry] : [])).toEqual(published.mapping.entries);
  // PM9 resolves to pm-i, which the layout lacks, so the pattern does not match: no entry and nothing to report.
  expect(resolved.aliases.find(({ alias }) => alias === 'PM9')).toEqual({ alias: 'PM9', entry: null, overlap: [], issues: [] });
});

it('keeps other aliases resolving when one exact rule targets a missing component', async () => {
  const { resolved, published } = both([file([
    rule('bad', { exact: ['PM1'] }, { componentId: 'pm-zz' }), rule('ok', { exact: ['PM2'] }, { componentId: 'pm-b' }),
  ])], ['PM1', 'PM2']);
  const [pm1, pm2] = resolved.aliases;
  expect(pm1!.issues).toEqual([expect.objectContaining({ code: 'unknown-target', path: ['ruleFiles', 0, 'rules', 0, 'target', 'componentId'] })]);
  expect(pm2).toMatchObject({ entry: { alias: 'PM2', target: { componentId: 'pm-b' } }, issues: [] });
  const result = await published;
  expect(result).toEqual({ ok: false, issues: resolved.issues });
});

it('leaves an alias unresolved with both rules in overlap when two same-scope patterns match it', () => {
  const { resolved } = both([file([
    rule('one', { pattern: 'PM{n}' }, { componentId: 'pm-a' }), rule('two', { pattern: 'PM{m}' }, { componentId: 'pm-b' }),
  ])]);
  const [pm1] = resolved.aliases;
  expect(pm1).toMatchObject({ entry: null, overlap: [{ ruleId: 'one' }, { ruleId: 'two' }] });
  expect(pm1!.issues).toEqual([expect.objectContaining({ code: 'same-level-overlap', path: ['aliases', 0] })]);
  expect(resolved.issues).toEqual(pm1!.issues);
});

it('puts only the preflight issue at top level while the alias still reports its overlap', async () => {
  const bad = file([rule('x', { exact: ['VIRT'] }, { componentId: 'nope' })], { level: 'equipment', equipmentId: 'eq-synth-01' });
  const { resolved, published } = both([bad, file([
    rule('one', { pattern: 'PM{n}' }, { componentId: 'pm-a' }), rule('two', { pattern: 'PM{m}' }, { componentId: 'pm-b' }),
  ])], ['ZZ', 'PM1']);
  expect(resolved.issues).toEqual([expect.objectContaining({ code: 'unknown-target', path: ['ruleFiles', 0, 'rules', 0, 'target', 'componentId'] })]);
  // Original input index of PM1 is 1, not its sorted position 0.
  expect(resolved.aliases.find(({ alias }) => alias === 'PM1')!.issues).toEqual([expect.objectContaining({ code: 'same-level-overlap', path: ['aliases', 1] })]);
  expect(await published).toEqual({ ok: false, issues: resolved.issues });
});

it('keeps original file indices for rule files left out of resolution', () => {
  const { resolved } = both([{ schemaVersion: '0.4', scope: modelScope, rules: 'bad' } as unknown as AliasRulesFile,
    file([rule('bad', { exact: ['PM1'] }, { componentId: 'pm-zz' })])]);
  expect(resolved.issues).toEqual([expect.objectContaining({ code: 'schema', path: ['ruleFiles', 0, 'rules'] }),
    expect.objectContaining({ code: 'unknown-target', path: ['ruleFiles', 1, 'rules', 0, 'target', 'componentId'] })]);
  expect(resolved.aliases[0]!.issues[0]!.path.slice(0, 2)).toEqual(['ruleFiles', 1]);
});

it('turns the cluster-single template into a valid equipment layout', () => {
  const template = layoutDocumentSchema.parse(read('templates/cluster-single.template.json')) as TemplateDocument;
  const result = instantiateLayout(template, 'eq-1-layout');
  expect(result).toMatchObject({ kind: 'equipment-layout', id: 'eq-1-layout', templateId: 'cluster-single', components: template.components });
  expect('roleCardinality' in result).toBe(false);
  expect(validateLayout(result).ok).toBe(true);
});

it('keeps the Generic Layout template id and rejects an invalid layout id', () => {
  const { layout: generic } = buildGenericLayout({ inventory: inventory(), dictionaries: [] });
  const result: EquipmentLayoutDocument = instantiateLayout(generic, 'eq-1-layout');
  expect(result).toMatchObject({ id: 'eq-1-layout', templateId: 'generic', components: generic.components });
  expect(validateLayout(result).ok).toBe(true);
  expect(() => instantiateLayout(generic, 'Bad_Id')).toThrow(RangeError);
});
