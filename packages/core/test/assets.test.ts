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

// Owner-approved prototype local geometry, rounded to 3 decimals; independent of the source pack.
const geometry: Record<string, [string, number, number, number, number, number][]> = {
  'cluster-dual-hub': [
    ['efem-1', 360, 472, 0, 320, 96],
    ['robot-1', 0, 0, 0, 76, 76],
    ['lp-1', 310, 563, 0, 82, 66],
    ['lp-2', 410, 563, 0, 82, 66],
    ['ll-a', 297, 359.119, 30, 84, 72],
    ['ll-b', 423, 359.119, -30, 84, 72],
    ['tm-1', 360, 250, 0, 156, 180.13],
    ['tm-2', 620, 250, 0, 156, 180.13],
    ['robot-2', 0, 0, 0, 80, 80],
    ['robot-3', 0, 0, 0, 80, 80],
    ['buffer-1', 490, 250, 0, 80, 84],
    ['pm-a', 222, 250, 90, 92, 96],
    ['pm-b', 291, 130.488, 150, 92, 96],
    ['pm-c', 551, 130.488, 150, 92, 96],
    ['pm-d', 689, 130.488, -150, 92, 96],
    ['pm-e', 758, 250, -90, 92, 96],
    ['pm-f', 689, 369.512, -30, 92, 96],
  ],
  'cluster-single': [
    ['tm-1', 480, 236, 0, 173.2, 200],
    ['pm-a', 331.4, 236, 90, 96, 100],
    ['pm-b', 405.7, 107.309, 150, 96, 100],
    ['pm-c', 554.3, 107.309, -150, 96, 100],
    ['pm-d', 628.6, 236, -90, 96, 100],
    ['ll-a', 412.7, 352.567, 30, 84, 72],
    ['ll-b', 547.3, 352.567, -30, 84, 72],
    ['efem-1', 480, 467, 0, 450, 100],
    ['robot-1', 0, 0, 0, 80, 80],
    ['aligner-1', 168, 0, 0, 84, 72],
    ['robot-2', 0, 0, 0, 84, 84],
    ['lp-1', 370, 560, 0, 82, 66],
    ['lp-2', 480, 560, 0, 82, 66],
    ['lp-3', 590, 560, 0, 82, 66],
  ],
  'lithography-dual-stage': [
    ['lp-1', 125, 300, 0, 86, 80],
    ['robot-1', -280, 0, 0, 72, 72],
    ['stage-1', -100, -80, 0, 140, 110],
    ['stage-2', -100, 80, 0, 140, 110],
    ['metrology-1', 100, 80, 0, 140, 110],
    ['exposure-1', 100, -80, 0, 140, 110],
    ['robot-2', 785, 78, 0, 150, 60],
    ['optics-1', 255, -80, 0, 100, 100],
    ['housing-1', 530, 300, 0, 700, 360],
  ],
  'track-stacked': [
    ['lp-1', 167, 262, 0, 82, 66],
    ['lp-2', 167, 338, 0, 82, 66],
    ['rail-1', 520, 300, 0, 600, 72],
    ['robot-1', -150, 0, 0, 64, 64],
    ['coater-1', 430, 202, 0, 112, 100],
    ['coater-2', 560, 202, 0, 112, 100],
    ['developer-1', 690, 202, 0, 112, 100],
    ['bake-1', 430, 398, 0, 112, 100],
    ['bake-2', 560, 398, 0, 112, 100],
    ['bake-3', 690, 398, 0, 112, 100],
    ['aligner-1', 300, 216, 0, 80, 72],
  ],
  'vertical-batch-furnace': [
    ['lp-1', 133, 200, 0, 96, 80],
    ['lp-2', 133, 340, 0, 96, 80],
    ['stocker-1', 270, 270, 0, 154, 270],
    ['boat-1', 600, 170, 0, 110, 120],
    ['boat-2', 600, 370, 0, 110, 120],
    ['robot-1', 440, 270, 0, 84, 84],
    ['reactor-1', 790, 170, 0, 150, 150],
    ['reactor-2', 790, 370, 0, 150, 150],
  ],
  'wet-linear': [
    ['lp-1', 187, 220, 0, 82, 66],
    ['lp-2', 187, 300, 0, 82, 66],
    ['lp-3', 187, 380, 0, 82, 66],
    ['rail-1', 500, 300, 0, 520, 80],
    ['robot-1', 0, 0, 0, 76, 76],
    ['cell-1', 370, 196, 0, 112, 104],
    ['cell-2', 500, 196, 0, 112, 104],
    ['cell-3', 630, 196, 0, 112, 104],
    ['dry-1', 370, 404, 0, 112, 104],
    ['dry-2', 500, 404, 0, 112, 104],
    ['buffer-1', 630, 404, 0, 112, 104],
  ],
};

it.each(cases)('%s preserves every approved local geometry tuple', (id) => {
  const layout = template(id);
  expect(layout.components.map(({ id, transform: t, size }) =>
    [id, t.x, t.y, t.rotation, size?.width, size?.height]).sort())
    .toEqual([...geometry[id]!].sort());
});

type Point = [number, number];
type Component = TemplateDocument['components'][number];
type Frame = { x: number; y: number; rotation: number; scale: number };
const mapPoint = (frame: Frame, [x, y]: Point): Point => {
  const angle = frame.rotation * Math.PI / 180;
  return [frame.x + frame.scale * (x * Math.cos(angle) - y * Math.sin(angle)),
    frame.y + frame.scale * (x * Math.sin(angle) + y * Math.cos(angle))];
};
const worldFrames = (layout: TemplateDocument) => {
  const frames = new Map<string, Frame>();
  const resolve = (component: Component): Frame => {
    const cached = frames.get(component.id);
    if (cached) return cached;
    let frame = component.transform;
    if (component.parentId) {
      const parent = resolve(layout.components.find(({ id }) => id === component.parentId)!);
      const [x, y] = mapPoint(parent, [frame.x, frame.y]);
      frame = { x, y, rotation: parent.rotation + frame.rotation, scale: parent.scale * frame.scale };
    }
    frames.set(component.id, frame);
    return frame;
  };
  layout.components.forEach(resolve);
  return frames;
};
const footprint = (component: Component, frame: Frame): Point[] => {
  const { width: w, height: h } = component.size!;
  const points: Point[] = component.role === 'tm'
    ? [[0, -h / 2], [w / 2, -h / 4], [w / 2, h / 4], [0, h / 2], [-w / 2, h / 4], [-w / 2, -h / 4]]
    : [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
  return points.map((point) => mapPoint(frame, point));
};
// Convex footprints are counterclockwise in their numeric coordinate system.
const contains = (outer: Point[], inner: Point[], tolerance = 0.5) => inner.every(([x, y]) =>
  outer.every(([ax, ay], i) => {
    const [bx, by] = outer[(i + 1) % outer.length]!;
    return ((bx - ax) * (y - ay) - (by - ay) * (x - ax)) / Math.hypot(bx - ax, by - ay) >= -tolerance;
  }));
const overlaps = (a: Point[], b: Point[], tolerance = 0.5) => [a, b].every((polygon) =>
  polygon.every(([x, y], i) => {
    const [nextX, nextY] = polygon[(i + 1) % polygon.length]!;
    const length = Math.hypot(nextX - x, nextY - y);
    const project = (points: Point[]) => points.map(([px, py]) => (px * (nextY - y) - py * (nextX - x)) / length);
    const pa = project(a), pb = project(b);
    return Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb)) > tolerance;
  }));

it.each(cases)('%s contains every child footprint inside its parent', (id) => {
  const layout = template(id), frames = worldFrames(layout);
  for (const child of layout.components.filter(({ parentId }) => parentId)) {
    const parent = layout.components.find(({ id }) => id === child.parentId)!;
    expect(contains(footprint(parent, frames.get(parent.id)!), footprint(child, frames.get(child.id)!)),
      `${id}: ${child.id} inside ${parent.id}`).toBe(true);
  }
});

it.each(cases)('%s has no overlapping top-level or sibling footprints', (id) => {
  const layout = template(id), frames = worldFrames(layout);
  const collisions: string[] = [];
  for (const [index, a] of layout.components.entries()) {
    for (const b of layout.components.slice(index + 1)) {
      if (a.parentId !== b.parentId) continue;
      if (overlaps(footprint(a, frames.get(a.id)!), footprint(b, frames.get(b.id)!))) {
        collisions.push(`${a.id}/${b.id}`);
      }
    }
  }
  expect(collisions, id).toEqual([]);
});

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
  const checkEvidence = (value: unknown, path: string[] = []): void => {
    if (!value || typeof value !== 'object') return;
    const geometryProperty = path.length === 4 && path[0] === 'components'
      && path[2] === 'provenance' && ['transform', 'size'].includes(path[3]!);
    if ('certainty' in value) expect(value).toEqual({
      certainty: 'assumed',
      sourceEvidence: geometryProperty ? ['src-v03-pack', 'src-geometry-2026-10'] : ['src-v03-pack'],
    });
    for (const [key, child] of Object.entries(value)) checkEvidence(child, [...path, key]);
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

it.each(cases.flatMap(([id]) => [
  { id, name: 'zero width', size: { width: 0, height: 92 }, path: ['size', 'width'], code: 'schema' },
  { id, name: 'negative height', size: { width: 420, height: -1 }, path: ['size', 'height'], code: 'schema' },
  { id, name: 'extra footprint key', size: { width: 420, height: 92, depth: 1 }, path: ['size'], code: 'schema' },
  { id, name: 'verified footprint without evidence', size: { width: 420, height: 92 }, path: ['provenance', 'size', 'sourceEvidence'], code: 'verified-without-evidence' },
]))('$id rejects $name with a precise footprint issue', ({ id, size, path, code }) => {
  const input = read(`assets/templates/${id}.template.json`);
  input.components[0].size = size;
  if (code === 'verified-without-evidence') {
    input.components[0].provenance.size = { certainty: 'verified', sourceEvidence: [] };
  }
  expect(validateLayout(input).issues).toEqual([
    { code, path: ['components', 0, ...path], message: expect.any(String) },
  ]);
});
