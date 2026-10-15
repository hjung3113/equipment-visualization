import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  aliasMetadataFileSchema, buildInventory, layoutDocumentSchema, occurrenceBatchSchema,
  proposeTemplates, typeDictionaryFileSchema, validateLayout, type TemplateDocument,
} from '../src/index.js';

const root = new URL('../../../', import.meta.url);
const read = (path: string) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const cases = [
  ['cluster-single', 26], ['cluster-dual-hub', 29], ['wet-linear', 2340],
  ['track-stacked', 21], ['lithography-dual-stage', 51], ['vertical-batch-furnace', 1],
] as const;
// Original v0.3 IDs are pinned here so CI needs no external source pack.
const originalIds: Record<string, string[]> = {
  'cluster-single': ['TM1', 'PM1', 'PM2', 'PM3', 'PM4', 'LLA', 'LLB', 'EFEM', 'ATM', 'ALIGN', 'RB1', 'LP1', 'LP2', 'LP3'],
  'cluster-dual-hub': ['EFEM', 'ATM', 'LP1', 'LP2', 'LL1', 'LL2', 'TM1', 'TM2', 'RB1', 'RB2', 'BUF', 'PM1', 'PM2', 'PM3', 'PM4', 'PM5', 'PM6'],
  'wet-linear': ['LP1', 'LP2', 'LP3', 'HANDLER', 'RB', 'W1', 'W2', 'W3', 'D1', 'D2', 'BUF'],
  'track-stacked': ['LP1', 'LP2', 'TRACK', 'ATM', 'COT1', 'COT2', 'DEV1', 'BAKE1', 'BAKE2', 'COOL', 'ALIGN'],
  'lithography-dual-stage': ['WAFER_LP', 'WH', 'STAGE_A', 'STAGE_B', 'METRO', 'EXPOSE', 'RETICLE', 'OPTICS', 'BODY'],
  'vertical-batch-furnace': ['LP1', 'LP2', 'STOCK', 'BOAT1', 'BOAT2', 'HANDLER', 'REACTOR1', 'REACTOR2'],
};
const template = (id: string) => layoutDocumentSchema.parse(read(`assets/templates/${id}.template.json`)) as TemplateDocument;

it.each(cases)('%s conforms to v0.4 with assumed evidence and module-to-module capabilities', (id, count) => {
  const layout = template(id);
  expect(validateLayout(layout)).toMatchObject({ ok: true });
  expect(layout.transferCapabilities).toHaveLength(count);
  const components = new Map(layout.components.map((component) => [component.id, component]));
  for (const component of layout.components) {
    expect(component.id).toMatch(/^[a-z]+-(?:[a-z]|[1-9]\d*)$/);
    expect(originalIds[id]).not.toContain(component.id);
  }
  for (const edge of layout.transferCapabilities) {
    expect(components.get(edge.handlerComponentId)?.role).toBe('robot');
    for (const endpoint of [edge.a, edge.b]) {
      const component = components.get(endpoint.componentId)!;
      expect(component.role).not.toBe('robot');
      expect(component.holdingSites.some((site) => site.id === endpoint.holdingSiteId)).toBe(true);
    }
  }
  const checkEvidence = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if ('certainty' in value) expect(value).toEqual({ certainty: 'assumed', sourceEvidence: ['src-v03-pack'] });
    for (const child of Object.values(value)) checkEvidence(child);
  };
  checkEvidence(layout);
  for (const [role, range] of Object.entries(layout.roleCardinality)) {
    const drawn = layout.components.filter((component) => component.role === role).length;
    expect(range).toEqual({ min: drawn, max: drawn });
  }
});

it.each(['cluster-single', 'cluster-dual-hub'])('%s retains two two-slot LLs and LL–PM connectivity', (id) => {
  const layout = template(id);
  const locks = layout.components.filter(({ role }) => role === 'll');
  expect(locks).toHaveLength(2);
  for (const lock of locks) expect(lock.holdingSites.map(({ id, materialKinds }) => [id, materialKinds]))
    .toEqual([['slot-1', ['wafer']], ['slot-2', ['wafer']]]);
  const roles = new Map(layout.components.map(({ id, role }) => [id, role]));
  expect(layout.transferCapabilities.some(({ a, b }) =>
    [roles.get(a.componentId), roles.get(b.componentId)].sort().join(',') === 'll,pm')).toBe(true);
});

it.each([
  ['lithography-dual-stage', 'stage-1', 'exposure-1'],
  ['lithography-dual-stage', 'stage-2', 'metrology-1'],
  ['vertical-batch-furnace', 'stocker-1', 'boat-1'],
  ['vertical-batch-furnace', 'stocker-1', 'boat-2'],
])('%s excludes ambiguous transfer %s–%s', (id, a, b) => {
  expect(template(id!).transferCapabilities.some((edge) =>
    [edge.a.componentId, edge.b.componentId].sort().join(',') === [a, b].sort().join(','))).toBe(false);
});

it.each(cases.map(([id]) => id))('%s links only sites sharing a material its handler blades can hold', (id) => {
  const layout = template(id);
  const sites = new Map(layout.components.flatMap((c) => c.holdingSites.map((s) => [`${c.id}/${s.id}`, s.materialKinds] as const)));
  const carried = (handler: string) => new Set(layout.components.find((c) => c.id === handler)!.holdingSites.flatMap((s) => s.materialKinds));
  for (const edge of layout.transferCapabilities) {
    const a = sites.get(`${edge.a.componentId}/${edge.a.holdingSiteId}`)!;
    const b = sites.get(`${edge.b.componentId}/${edge.b.holdingSiteId}`)!;
    expect(a.some((kind) => b.includes(kind) && carried(edge.handlerComponentId).has(kind)), edge.id).toBe(true);
  }
});

it('lets the wet-linear wafer robot move wafers between load ports', () => {
  expect(template('wet-linear').transferCapabilities).toContainEqual(expect.objectContaining({
    a: { componentId: 'lp-1', holdingSiteId: 'slot-1' }, b: { componentId: 'lp-2', holdingSiteId: 'slot-1' }, handlerComponentId: 'robot-1',
  }));
});

it('contains exactly six templates and 25 primitives', () => {
  expect(readdirSync(new URL('assets/templates/', root)).filter((name) => name.endsWith('.json')).sort())
    .toEqual(cases.map(([id]) => `${id}.template.json`).sort());
  expect(readdirSync(new URL('assets/primitives/', root)).filter((name) => name.endsWith('.svg'))).toHaveLength(25);
});

it('keeps primitives free of element ids so repeated inlining cannot collide', () => {
  for (const name of readdirSync(new URL('assets/primitives/', root)).filter((file) => file.endsWith('.svg'))) {
    expect(readFileSync(new URL(`assets/primitives/${name}`, root), 'utf8'), name).not.toMatch(/\sid="/);
  }
});

it.each(['robot-single', 'robot-dual', 'robot-multi', 'tm'])('%s bounds include every shape and its stroke', (name) => {
  const svg = readFileSync(new URL(`assets/primitives/${name}.svg`, root), 'utf8');
  const [x, y, width, height] = svg.match(/viewBox="([^"]+)"/)![1]!.split(/\s+/).map(Number) as [number, number, number, number];
  expect(x).toBe(-width / 2); expect(y).toBe(-height / 2);
  const shapes = [...svg.matchAll(/<(rect|circle|polygon|path)\b([^>]+)\/>/g)];
  expect(shapes.length).toBeGreaterThan(1);
  for (const [, tag, raw] of shapes) {
    const attrs = Object.fromEntries([...raw!.matchAll(/([\w-]+)="([^"]*)"/g)].map((match) => [match[1]!, match[2]!]));
    const n = (key: string) => Number(attrs[key] ?? 0);
    let xs: number[], ys: number[];
    if (tag === 'rect') { xs = [n('x'), n('x') + n('width')]; ys = [n('y'), n('y') + n('height')]; }
    else if (tag === 'circle') { xs = [n('cx') - n('r'), n('cx') + n('r')]; ys = [n('cy') - n('r'), n('cy') + n('r')]; }
    else {
      const coordinates = (attrs[tag === 'path' ? 'd' : 'points']!.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
      if (tag === 'path') expect(attrs.d!.replace(/[-\d.\sMLZ,]/g, '')).toBe('');
      xs = coordinates.filter((_, i) => i % 2 === 0); ys = coordinates.filter((_, i) => i % 2 === 1);
    }
    const halfStroke = n('stroke-width') / 2;
    expect(Math.min(...xs) - halfStroke).toBeGreaterThanOrEqual(x - 1e-10);
    expect(Math.max(...xs) + halfStroke).toBeLessThanOrEqual(x + width + 1e-10);
    expect(Math.min(...ys) - halfStroke).toBeGreaterThanOrEqual(y - 1e-10);
    expect(Math.max(...ys) + halfStroke).toBeLessThanOrEqual(y + height + 1e-10);
  }
});

it('ranks converted cluster-single within the top three for the fixture Inventory', () => {
  const base = 'fixtures/cluster-single/';
  const inventory = buildInventory(occurrenceBatchSchema.parse(read(`${base}occurrence-batch.json`)),
    aliasMetadataFileSchema.parse(read(`${base}onboarding/alias-metadata.json`)));
  const dictionaries = [typeDictionaryFileSchema.parse(read(`${base}onboarding/scopes/model/synth-maker/synth-model/type-dictionary.json`))];
  const proposals = proposeTemplates({ inventory, dictionaries, templates: cases.map(([id]) => template(id)) });
  console.info('Converted asset ranks:', proposals.map(({ templateId, rank }) => ({ templateId, rank })));
  expect(proposals.find(({ templateId }) => templateId === 'cluster-single')?.rank).toBeLessThanOrEqual(3);
});

it('preserves the reviewed template and primitive asset bytes', () => {
  const paths = ['templates', 'primitives'].flatMap((dir) => readdirSync(new URL(`assets/${dir}/`, root))
    .filter((file) => /\.(json|svg)$/.test(file)).sort().map((file) => `assets/${dir}/${file}`));
  const hashes = Object.fromEntries(paths.map((path) => [path,
    createHash('sha256').update(readFileSync(new URL(path, root))).digest('hex')]));
  expect(hashes).toMatchSnapshot();
});
