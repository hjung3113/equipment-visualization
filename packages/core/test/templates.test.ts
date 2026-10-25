import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  aliasMetadataFileSchema, buildGenericLayout, buildInventory, layoutDocumentSchema, occurrenceBatchSchema,
  proposeTemplates, typeDictionaryFileSchema, validateLayout,
  type ObservedInventory, type TemplateDocument,
} from '../src/index.js';
import { compareNatural } from '../src/onboarding/order.js';

const read = (path: string) => JSON.parse(readFileSync(new URL(`../../../fixtures/${path}`, import.meta.url), 'utf8'));
const dictionaries = [typeDictionaryFileSchema.parse(read('cluster-single/onboarding/scopes/model/synth-maker/synth-model/type-dictionary.json'))];
const inventory = () => buildInventory(occurrenceBatchSchema.parse(read('cluster-single/occurrence-batch.json')),
  aliasMetadataFileSchema.parse(read('cluster-single/onboarding/alias-metadata.json')));
const templates = () => ['cluster-single', 'cluster-dual-hub', 'linear-track'].map((id) =>
  layoutDocumentSchema.parse(read(`templates/${id}.template.json`)) as TemplateDocument);
const propose = (input: ObservedInventory, candidates = templates()) => proposeTemplates({ inventory: input, dictionaries, templates: candidates });

it('validates the synthetic candidates and preserves the single-cluster structure', () => {
  for (const template of templates()) expect(validateLayout(template)).toMatchObject({ ok: true });
  const original = layoutDocumentSchema.parse(read('cluster-single/layout.json'));
  // The fixture layout uses catalog primitives; the onboarding candidate keeps its synthetic assetRefs (out of scope, #206).
  const withoutAssetRef = (components: typeof original.components) => components.map((component) => ({ ...component, assetRef: undefined }));
  expect(withoutAssetRef(templates()[0]!.components)).toMatchObject(withoutAssetRef(original.components));
  expect(templates()[0]).toMatchObject({ physicalInterfaces: original.physicalInterfaces,
    transferCapabilities: original.transferCapabilities, levels: original.levels });
});

it('ranks the fixture proposals with hand-counted roles, weighted transfers and explicit assumed assignments', () => {
  const proposals = propose(inventory());
  expect(proposals.map(({ templateId, rank }) => [templateId, rank])).toEqual([
    ['cluster-single', 1], ['cluster-dual-hub', 2], ['linear-track', 3],
  ]);
  expect(proposals[0]).toEqual({
    templateId: 'cluster-single', rank: 1, fits: true, rolesOutOfRange: 0, exactRoleMatches: 3,
    roleFit: [
      { role: 'll', observed: 1, drawn: 1, min: 1, max: 2, inRange: true },
      { role: 'lp', observed: 1, drawn: 1, min: 1, max: 4, inRange: true },
      { role: 'pm', observed: 3, drawn: 2, min: 1, max: 6, inRange: true },
      { role: 'robot', observed: 2, drawn: 2, min: 2, max: 2, inRange: true },
    ],
    transfers: { explained: 7, total: 7, ratio: 1 }, unexplainedAliases: ['PM9', 'VIRT_SCH'],
    assignments: [
      ['EFEM_R1', 'efem-robot', 'natural-order'], ['LLA', 'll-a', 'unique-role'], ['LP1', 'lp-a', 'unique-role'],
      ['PM1', 'pm-a', 'natural-order'], ['PM2', 'pm-b', 'natural-order'], ['TM_R1', 'tm-robot', 'natural-order'],
    ].map(([alias, componentId, basis]) => ({ alias, componentId, basis, certainty: 'assumed' })),
  });
  expect(proposals[1]).toMatchObject({ rolesOutOfRange: 2, transfers: { explained: 7, total: 7, ratio: 1 },
    unexplainedAliases: ['VIRT_SCH'] });
  expect(proposals[2]).toMatchObject({ rolesOutOfRange: 2, transfers: { explained: 0, total: 7, ratio: 0 },
    unexplainedAliases: ['LLA', 'TM_R1', 'VIRT_SCH'] });
});

it.each([
  ['PM2', 'PM10', -1], ['PM09007199254740993', 'PM9007199254740992', 1], ['PM01', 'PM1', -1],
  ['A1', 'A01x', -1], ['A2b10', 'A2b3', 1], ['pm', 'PM', 1], ['PM01Z', 'PM1A', 1], ['A1', 'AB', -1],
] as const)('orders %s against %s naturally without losing integer precision', (a, b, result) => {
  expect(compareNatural(a, b)).toBe(result);
  expect(compareNatural(b, a)).toBe(-result);
});

it('uses only explicit links to every already-assigned neighbour, including earlier pass-two assignments', () => {
  const input = inventory();
  input.aliases = input.aliases.filter(({ alias }) => ['LP1', 'LLA', 'PM1', 'PM2'].includes(alias));
  input.transfers = [{ from: 'LP1', to: 'PM1', count: 4 }, { from: 'PM1', to: 'PM2', count: 2 }, { from: 'LLA', to: 'PM1', count: 1 }];
  const template = templates()[0]!;
  const edge = template.transferCapabilities[0]!;
  const link = (a: string, b: string) => ({ ...edge, a: { componentId: a, holdingSiteId: a === 'lp-a' || a === 'll-a' ? 'slot-1' : 'station-1' },
    b: { componentId: b, holdingSiteId: 'station-1' } });
  template.transferCapabilities = [link('lp-a', 'pm-a'), link('lp-a', 'pm-b'), link('ll-a', 'pm-b'), link('pm-b', 'pm-a')];
  expect(propose(input, [template])[0]!.assignments.filter(({ alias }) => alias.startsWith('PM'))).toEqual([
    { alias: 'PM1', componentId: 'pm-b', certainty: 'assumed', basis: 'transfer-neighbors' },
    { alias: 'PM2', componentId: 'pm-a', certainty: 'assumed', basis: 'transfer-neighbors' },
  ]);
  template.transferCapabilities = [];
  expect(propose(input, [template])[0]).toMatchObject({ transfers: { explained: 0, total: 7, ratio: 0 },
    assignments: expect.arrayContaining([{ alias: 'PM1', componentId: 'pm-a', certainty: 'assumed', basis: 'natural-order' }]) });
});

it.each(['ratio', 'unexplained', 'exact', 'id'] as const)('breaks equal role-fit ranks by %s and limits output to three', (criterion) => {
  const a = templates()[0]!;
  const b = structuredClone(a);
  a.id = 'z'; b.id = 'a';
  if (criterion === 'ratio') b.transferCapabilities = [];
  if (criterion === 'unexplained' || criterion === 'exact') {
    a.components.push({ ...structuredClone(a.components.find(({ id }) => id === 'pm-a')!), id: 'pm-c' });
  }
  if (criterion === 'unexplained') a.components.push({ ...structuredClone(a.components.find(({ id }) => id === 'pm-a')!), id: 'pm-d' });
  if (criterion === 'exact') {
    b.components.push({ ...structuredClone(b.components.find(({ id }) => id === 'pm-a')!), id: 'pm-c' },
      { ...structuredClone(b.components.find(({ id }) => id === 'pm-a')!), id: 'pm-d' });
  }
  const others = ['x', 'y'].map((id) => ({ ...structuredClone(b), id }));
  const proposals = propose(inventory(), [b, ...others, a]);
  expect(proposals).toHaveLength(3);
  expect(proposals[0]!.templateId).toBe(criterion === 'id' ? 'a' : 'z');
});

it('keeps aliases without moduleType unknown and reports absent transfers', () => {
  const input = inventory();
  input.aliases = [{ ...input.aliases.find(({ alias }) => alias === 'PM1')!, alias: 'pm-a', moduleType: undefined }];
  input.transfers = [];
  expect(propose(input, [templates()[0]!])[0]).toEqual({ templateId: 'cluster-single', rank: 1, fits: true,
    roleFit: [], rolesOutOfRange: 0, transfers: { explained: 0, total: 0, ratio: null }, unexplainedAliases: ['pm-a'],
    exactRoleMatches: 0, assignments: [] });
});

it('generates deterministic generic geometry, integer sites and assumed provenance without capabilities', () => {
  const input = inventory();
  const result = buildGenericLayout({ inventory: input, dictionaries });
  expect(result).toEqual(buildGenericLayout({ inventory: { ...input, aliases: [...input.aliases].reverse(), transfers: [...input.transfers].reverse() }, dictionaries }));
  expect(validateLayout(result.layout)).toMatchObject({ ok: true });
  expect(result.layout).toMatchObject({ schemaVersion: '0.4', kind: 'equipment-layout', id: 'generic-layout', templateId: 'generic',
    name: 'Generic layout', unit: 'abstract', viewBox: { x: 0, y: 0, width: 80, height: 80 },
    sources: [{ id: 'src-observed-inventory', title: 'Generated from Observed Inventory', license: 'synthetic' }],
    levels: [{ id: 'level-main', label: 'Main', order: 0 }], physicalInterfaces: [], transferCapabilities: [], processRoutes: [] });
  const expected = [
    ['LP1', 'lp-1', 'lp', 0, 0], ['LLA', 'll-1', 'll', 1, 0], ['PM1', 'pm-1', 'pm', 2, 0], ['PM2', 'pm-2', 'pm', 2, 1],
    ['EFEM_R1', 'robot-1', 'robot', 3, 0], ['PM9', 'pm-3', 'pm', 3, 1], ['TM_R1', 'robot-2', 'robot', 3, 2], ['VIRT_SCH', 'unknown-1', 'unknown', 3, 3],
  ];
  for (const [alias, id, role, column, row] of expected) {
    const assignment = result.assignments.find((entry) => entry.alias === alias)!;
    expect(assignment).toMatchObject({ componentId: id, certainty: 'assumed' });
    const component = result.layout.components.find((entry) => entry.id === id)!;
    expect(component).toMatchObject({ role, assetRef: 'generic-box', ports: [], label: `${String(role).toUpperCase()} ${String(id).split('-')[1]}`,
      transform: { x: 10 + 20 * Number(column), y: 10 + 20 * Number(row), rotation: 0, scale: 1 } });
    const provenance = { certainty: 'assumed', sourceEvidence: ['src-observed-inventory'] };
    expect(component.provenance).toEqual({ role: provenance, label: provenance, assetRef: provenance, levelId: provenance, transform: provenance });
    for (const site of component.holdingSites) expect(site).toMatchObject({ materialKinds: ['wafer', 'carrier', 'batch', 'boat', 'reticle'], provenance });
  }
  for (const alias of ['LLA', 'LP1', 'PM2', 'TM_R1']) expect(result.assignments.find((entry) => entry.alias === alias)!.sites).toEqual([
    { slot: '1', holdingSiteId: 'slot-1' }, { slot: '2', holdingSiteId: 'slot-2' },
  ]);
});

it('coalesces duplicate integer values exactly and omits noninteger sites with no Port', () => {
  const input = inventory();
  input.aliases = [{ ...input.aliases[0]!, slots: ['x', '1', '01', '-2', '-02', '9007199254740993'], isPort: false }];
  input.transfers = [];
  const result = buildGenericLayout({ inventory: input, dictionaries });
  expect(result.layout.viewBox).toEqual({ x: 0, y: 0, width: 20, height: 20 });
  expect(result.layout.components[0]!.holdingSites.map(({ id }) => id)).toEqual(['slot-neg-2', 'slot-1', 'slot-9007199254740993']);
  expect(result.assignments[0]!.sites).toEqual([
    { slot: '-02', holdingSiteId: 'slot-neg-2' }, { slot: '-2', holdingSiteId: 'slot-neg-2' },
    { slot: '01', holdingSiteId: 'slot-1' }, { slot: '1', holdingSiteId: 'slot-1' },
    { slot: '9007199254740993', holdingSiteId: 'slot-9007199254740993' },
  ]);
  expect(validateLayout(result.layout)).toMatchObject({ ok: true });
});

it('puts every alias in one column without a Port, even with transfer cycles', () => {
  const input = inventory();
  input.aliases = input.aliases.map((row) => ({ ...row, isPort: false }));
  const result = buildGenericLayout({ inventory: input, dictionaries });
  expect(result.layout.viewBox).toEqual({ x: 0, y: 0, width: 20, height: 160 });
  expect(result.layout.components.map(({ transform }) => transform.x)).toEqual(Array(8).fill(10));
});

it('rejects an empty Inventory before generating geometry', () => {
  expect(() => buildGenericLayout({ inventory: { ...inventory(), aliases: [], transfers: [] }, dictionaries }))
    .toThrow(new RangeError('Cannot build Generic Layout from empty Inventory'));
});

it('uses the 0–0 range for an observed Role without its own cardinality entry', () => {
  const input = inventory();
  input.aliases = [{ ...input.aliases.find(({ alias }) => alias === 'PM1')!, moduleType: 'SYN_CONSTRUCTOR' }];
  input.transfers = [];
  const dictionary = typeDictionaryFileSchema.parse({ schemaVersion: '0.4', scope: { level: 'global' },
    entries: [{ moduleType: 'SYN_CONSTRUCTOR', role: 'constructor' }] });
  const [proposal] = proposeTemplates({ inventory: input, dictionaries: [dictionary], templates: [templates()[0]!] });
  expect(proposal!.roleFit).toEqual([{ role: 'constructor', observed: 1, drawn: 0, min: 0, max: 0, inRange: false }]);
});
