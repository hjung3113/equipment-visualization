import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import {
  buildGenericLayout, layoutDocumentSchema, observedInventorySchema, typeDictionaryFileSchema,
  type Component, type LayoutDocument, type PhysicalInterfaceEdge, type Port,
} from '@eqv/core';
import { buildScene, TopView, type SceneOptions, type SvgNode } from '../src/index.js';
import { apply, bboxOf, mul, rectsOverlap, rotation, scaling, translation, type Box, type Mat } from '../src/geom.js';
import { estimateTextWidth } from '../src/text.js';
import { primitives } from '../src/primitives.generated.js';
import { buildOverlay } from '../src/overlay.js';

const root = new URL('../../../', import.meta.url);
const TEMPLATE_IDS = [
  'cluster-single', 'cluster-dual-hub', 'wet-linear', 'track-stacked',
  'lithography-dual-stage', 'vertical-batch-furnace',
] as const;
const PAIRS: Record<(typeof TEMPLATE_IDS)[number], number> = {
  'cluster-single': 6,
  'cluster-dual-hub': 10,
  'wet-linear': 9,
  'track-stacked': 7,
  'lithography-dual-stage': 3,
  'vertical-batch-furnace': 2,
};

function load(id: string): LayoutDocument {
  return layoutDocumentSchema.parse(JSON.parse(readFileSync(new URL(`assets/templates/${id}.template.json`, root), 'utf8')));
}

/** The cluster-single fixture with every assetRef outside the primitive catalog, to exercise the unknown-shape fallback. */
function loadUnlistedClusterLayout(): LayoutDocument {
  const layout = layoutDocumentSchema.parse(JSON.parse(readFileSync(new URL('fixtures/cluster-single/layout.json', root), 'utf8')));
  return { ...layout, components: layout.components.map((component) => ({ ...component, assetRef: 'synthetic-unlisted' })) };
}

function firstRect(node: SvgNode): SvgNode | undefined {
  if (node.tag === 'rect') return node;
  for (const child of node.children) {
    if (typeof child !== 'string') {
      const found = firstRect(child);
      if (found) return found;
    }
  }
  return undefined;
}

const templates = Object.fromEntries(TEMPLATE_IDS.map((id) => [id, load(id)])) as Record<(typeof TEMPLATE_IDS)[number], LayoutDocument>;

const TOKENS = new Set([...readFileSync(new URL('assets/primitives/README.md', root), 'utf8')
  .matchAll(/^\| `(--eqv-[a-z-]+)` \|/gm)].map((match) => match[1]!));

function render(layout: LayoutDocument, options: Partial<SceneOptions> = {}) {
  const width = options.width ?? layout.viewBox.width;
  const height = options.height ?? layout.viewBox.height;
  const pxPerUnit = Math.min(width / layout.viewBox.width, height / layout.viewBox.height);
  const scene = buildScene(layout, { ...options, width, height, pxPerUnit });
  const markup = renderToStaticMarkup(createElement(TopView, {
    layout, width, height,
    labels: options.labels,
    layers: options.layers,
    visibleLevelIds: options.visibleLevelIds,
  }));
  return { scene, markup, pxPerUnit };
}

it('renders unknown cluster assetRefs as role-classed dashed neutral boxes', () => {
  const layout = loadUnlistedClusterLayout();
  const { scene } = render(layout);
  const groups = componentsOf(scene.node);

  expect(groups.size).toBe(layout.components.length);
  for (const component of layout.components) {
    const group = groups.get(component.id)?.node;
    expect(group?.attrs['data-asset-unknown']).toBe('true');
    expect(firstRect(group!)?.attrs['stroke-dasharray']).toBeDefined();
    const title = group?.children.find((child) => typeof child !== 'string' && child.tag === 'title');
    const titleText = title && typeof title !== 'string' ? title.children.join('') : '';
    expect(titleText.endsWith(` · 알 수 없는 도형 (${component.assetRef})`)).toBe(true);
    expect(hasGlyph(group!)).toBe(false);
  }
  for (const component of layout.components) {
    expect(scene.components.get(component.id)).toMatchObject({ w: component.size?.width, h: component.size?.height });
  }
  expect(scene.components.get('pm-a')?.cls).toBe('process');
  expect(scene.components.get('ll-a')?.cls).toBe('holding');
  expect(scene.components.get('efem-robot')?.poly).toHaveLength(4);
});

it('renders Generic Layout generic-box assets without unknown markers', () => {
  const inventory = observedInventorySchema.parse(JSON.parse(readFileSync(new URL('fixtures/cluster-single/expected-inventory.json', root), 'utf8')));
  const dictionary = typeDictionaryFileSchema.parse(JSON.parse(readFileSync(
    new URL('fixtures/cluster-single/onboarding/scopes/model/synth-maker/synth-model/type-dictionary.json', root), 'utf8',
  )));
  const { layout } = buildGenericLayout({ inventory, dictionaries: [dictionary] });
  const { scene } = render(layout);
  const groups = componentsOf(scene.node);

  expect(groups.size).toBe(layout.components.length);
  for (const component of layout.components) {
    expect(groups.get(component.id)?.node.attrs['data-asset-unknown']).toBeUndefined();
    expect(scene.components.get(component.id)).toMatchObject({ w: 8, h: 8 });
  }
});

it.each([
  { role: 'constructor', assetRef: 'synthetic-unlisted', cls: 'process' },
  { role: 'toString', assetRef: 'synthetic-unlisted', cls: 'process' },
  { role: 'll', assetRef: 'constructor', cls: 'holding' },
  { role: 'robot', assetRef: 'primitive:toString', cls: 'robot' },
])('uses own catalog entries for role=$role and assetRef=$assetRef', ({ role, assetRef, cls }) => {
  const layout = fixture([component({ id: 'box', assetRef, role, label: 'Box' })]);
  const { scene } = render(layout, { interactive: true });
  expect(scene.components.get('box')?.cls).toBe(cls);
  expect(componentsOf(scene.node).get('box')?.node.attrs['data-asset-unknown']).toBe('true');
  const overlay = buildOverlay(scene, {
    selectedId: 'box', hoveredId: 'box', focusedId: 'box', showAllCapabilities: false,
  }, 1);
  expect(overlay.interaction.children).toHaveLength(3);
});

it.each(['synthetic-unlisted', 'generic-box'])('keeps chips and capability starts outside a non-square neutral robot (%s)', (assetRef) => {
  const layout = fixture([
    component({
      id: 'robot', assetRef, label: 'Robot', role: 'robot', x: 200, y: 300, w: 80, h: 20,
      holdingSites: [site('blade')],
    }),
    component({ id: 'pm', assetRef: 'primitive:pm', label: 'PM', x: 500, y: 300, w: 96, h: 100, holdingSites: [site('slot')] }),
  ], {
    transferCapabilities: [{
      id: 'cap', handlerComponentId: 'robot',
      a: { componentId: 'robot', holdingSiteId: 'blade' },
      b: { componentId: 'pm', holdingSiteId: 'slot' },
      provenance: { certainty: 'assumed', sourceEvidence: [] },
    }],
  });
  const { scene } = render(layout, { labels: 'none', layers: { holdingSites: true, capabilities: true } });
  const body = firstRect(componentsOf(scene.node).get('robot')!.node)!;
  expect(body.attrs).toMatchObject({ x: '-40', y: '-10', width: '80', height: '20' });
  const chip = chipRects(scene.node).find(({ id }) => id === 'robot')!.box;
  expect.soft(rectsOverlap(chip, { x0: 160, x1: 240, y0: 290, y1: 310 })).toBe(false);
  expect.soft(chip.x0).toBe(240);
  const overlay = buildOverlay(scene, {
    selectedId: 'robot', hoveredId: null, focusedId: null, showAllCapabilities: false,
  }, 1);
  for (const capabilities of [layer(scene.node, 'capabilities'), overlay.capabilities]) {
    const segments: string[] = [];
    walkWorld(capabilities, (node) => { if (node.tag === 'path') segments.push(node.attrs.d!); });
    expect.soft(segments).toEqual(['M245 300L449 300']);
  }
});

it.each([
  { assetRef: 'synthetic-unlisted', unknown: true },
  { assetRef: 'generic-box', unknown: false },
])('uses the declared footprint for $assetRef', ({ assetRef, unknown }) => {
  const layout = fixture([component({ id: 'box', assetRef, label: 'Box', w: 14, h: 10 })]);
  const { scene } = render(layout);
  const group = componentsOf(scene.node).get('box')?.node;

  expect(scene.components.get('box')).toMatchObject({ w: 14, h: 10 });
  expect(firstRect(group!)).toMatchObject({ attrs: { x: '-7', y: '-5', width: '14', height: '10' } });
  expect(group?.attrs['data-asset-unknown']).toBe(unknown ? 'true' : undefined);
});

function componentsOf(node: SvgNode): Map<string, { node: SvgNode; parentId: string | null }> {
  const out = new Map<string, { node: SvgNode; parentId: string | null }>();
  const walk = (current: SvgNode, parentId: string | null) => {
    const id = current.attrs['data-component-id'];
    if (id) out.set(id, { node: current, parentId });
    for (const child of current.children) {
      if (typeof child !== 'string') walk(child, id ?? parentId);
    }
  };
  walk(node, null);
  return out;
}

function layer(node: SvgNode, name: string): SvgNode {
  const found = node.children.find((child) => typeof child !== 'string' && child.attrs['data-layer'] === name);
  if (!found || typeof found === 'string') throw new Error(`missing layer ${name}`);
  return found;
}

function titles(node: SvgNode): string[] {
  const out: string[] = [];
  const walk = (current: SvgNode) => {
    if (current.tag === 'title') out.push(current.children.filter((child) => typeof child === 'string').join(''));
    for (const child of current.children) if (typeof child !== 'string') walk(child);
  };
  walk(node);
  return out;
}

function texts(node: SvgNode): string[] {
  const out: string[] = [];
  const walk = (current: SvgNode) => {
    if (current.tag === 'text') out.push(current.children.filter((child) => typeof child === 'string').join(''));
    for (const child of current.children) if (typeof child !== 'string') walk(child);
  };
  walk(node);
  return out;
}

function hasGlyph(node: SvgNode): boolean {
  if (node.attrs['data-part'] === 'glyph') return true;
  return node.children.some((child) => typeof child !== 'string' && hasGlyph(child));
}

function glyphTransform(node: SvgNode): string | undefined {
  if (node.attrs['data-part'] === 'glyph') return node.attrs.transform;
  for (const child of node.children) {
    if (typeof child !== 'string') {
      const found = glyphTransform(child);
      if (found) return found;
    }
  }
  return undefined;
}

function isStructure(component: Component): boolean {
  return ['efem', 'tm', 'rail', 'housing'].includes(component.assetRef.replace(/^primitive:/, ''));
}

function hasAssumed(component: Component): boolean {
  return Object.values(component.provenance).some((entry) => entry?.certainty === 'assumed');
}

function scaleProduct(layout: LayoutDocument, id: string): number {
  let scale = 1;
  let current = layout.components.find((item) => item.id === id);
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    scale *= current.transform.scale;
    current = current.parentId ? layout.components.find((item) => item.id === current?.parentId) : undefined;
  }
  return scale;
}

function component(partial: Pick<Component, 'id' | 'assetRef' | 'label'> & {
  role?: string; parentId?: string; levelId?: string;
  x?: number; y?: number; rotation?: number; scale?: number;
  w?: number; h?: number; ports?: Port[]; provenance?: Component['provenance'];
  holdingSites?: Component['holdingSites'];
}): Component {
  return {
    id: partial.id,
    role: partial.role ?? 'module',
    assetRef: partial.assetRef,
    label: partial.label,
    parentId: partial.parentId,
    levelId: partial.levelId ?? 'level-main',
    transform: { x: partial.x ?? 0, y: partial.y ?? 0, rotation: partial.rotation ?? 0, scale: partial.scale ?? 1 },
    size: partial.w != null && partial.h != null ? { width: partial.w, height: partial.h } : undefined,
    ports: partial.ports ?? [],
    holdingSites: partial.holdingSites ?? [],
    provenance: partial.provenance ?? {},
  };
}

function site(id: string): Component['holdingSites'][number] {
  return { id, materialKinds: ['wafer'], provenance: { certainty: 'assumed', sourceEvidence: [] } };
}

const IDENT: Mat = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

function parseTransform(value: string): Mat {
  let m = IDENT;
  for (const match of value.matchAll(/(translate|rotate|scale)\(([^)]*)\)/g)) {
    const fn = match[1]!;
    const args = match[2]!.trim().split(/[\s,]+/).map(Number);
    if (fn === 'translate') m = mul(m, translation(args[0]!, args[1] ?? 0));
    else if (fn === 'rotate') m = mul(m, rotation(args[0]!));
    else m = mul(m, scaling(args[1] ?? args[0]!));
  }
  return m;
}

/** Walk the rendered tree, accumulating each element's world matrix from its rendered transform attributes. */
function walkWorld(node: SvgNode, visit: (current: SvgNode, world: Mat, owner: string | null) => void): void {
  const recurse = (current: SvgNode, m: Mat, owner: string | null): void => {
    const world = current.attrs.transform ? mul(m, parseTransform(current.attrs.transform)) : m;
    const id = current.attrs['data-component-id'] ?? owner;
    visit(current, world, id);
    for (const child of current.children) if (typeof child !== 'string') recurse(child, world, id);
  };
  recurse(node, IDENT, null);
}

function circleBox(circle: SvgNode, world: Mat): Box {
  const cx = Number(circle.attrs.cx);
  const cy = Number(circle.attrs.cy);
  const r = Number(circle.attrs.r) * Math.hypot(world.a, world.b);
  const [wx, wy] = apply(world, cx, cy);
  return { x0: wx - r, y0: wy - r, x1: wx + r, y1: wy + r };
}

const ROBOT_ASSETS = new Set(['robot-single', 'robot-dual', 'robot-multi', 'handler']);

/** The rendered fit scale of a component group: its main `scale(...)` symbol group, skipping the stacked copy. */
function fitOf(group: SvgNode): number {
  for (const child of group.children) {
    if (typeof child === 'string' || child.attrs['data-stack'] === 'true') continue;
    const match = /^scale\(([\d.]+)\)/.exec(child.attrs.transform ?? '');
    if (match) return Number(match[1]);
  }
  throw new Error('component group without a fit group');
}

/**
 * Robot-class chip guard: each robot's fitted primitive extent (viewBox scaled by the rendered fit) in
 * world coordinates, from the rendered group transform plus the primitive viewBox — covers arms and fork.
 */
function robotExtentBoxes(layout: LayoutDocument, node: SvgNode): Map<string, Box[]> {
  const robots = new Map(layout.components
    .filter((item) => ROBOT_ASSETS.has(item.assetRef.replace(/^primitive:/, '')))
    .map((item) => [item.id, item.assetRef.replace(/^primitive:/, '')]));
  const out = new Map<string, Box[]>();
  const visit = (current: SvgNode, world: Mat): void => {
    const m = current.attrs.transform ? mul(world, parseTransform(current.attrs.transform)) : world;
    const id = current.attrs['data-component-id'];
    const asset = id != null ? robots.get(id) : undefined;
    if (id != null && asset != null) {
      const fit = fitOf(current);
      const { x, y, width, height } = primitives[asset]!.viewBox;
      const corners = [
        apply(m, x * fit, y * fit),
        apply(m, (x + width) * fit, y * fit),
        apply(m, (x + width) * fit, (y + height) * fit),
        apply(m, x * fit, (y + height) * fit),
      ];
      out.set(id, [bboxOf(corners)]);
    }
    for (const child of current.children) if (typeof child !== 'string') visit(child, m);
  };
  visit(node, IDENT);
  return out;
}

/** Rendered geometry is rounded to four decimals; clearance is asserted beyond that formatting noise. */
const FORMAT_EPS = 0.01;

function shrink(rect: Box, eps: number): Box {
  return { x0: rect.x0 + eps, y0: rect.y0 + eps, x1: rect.x1 - eps, y1: rect.y1 - eps };
}

function badgeBoxes(node: SvgNode): Box[] {
  const out: Box[] = [];
  walkWorld(layer(node, 'badges'), (current, world) => {
    if (current.tag === 'circle') out.push(circleBox(current, world));
  });
  return out;
}

function labelBoxesFromRendered(node: SvgNode, mono: boolean): Box[] {
  const out: Box[] = [];
  walkWorld(layer(node, 'labels'), (current) => {
    if (current.tag !== 'text') return;
    const text = current.children.filter((child) => typeof child === 'string').join('');
    const px = Number(current.attrs['font-size']);
    const x = Number(current.attrs.x);
    const by = Number(current.attrs.y);
    const tw = estimateTextWidth(text, px, mono);
    const x0 = current.attrs['text-anchor'] === 'middle' ? x - tw / 2
      : current.attrs['text-anchor'] === 'end' ? x - tw : x;
    out.push({ x0, x1: x0 + tw, y0: by - 0.78 * px, y1: by + 0.22 * px });
  });
  return out;
}

function chipRects(node: SvgNode): { id: string; box: Box }[] {
  const out: { id: string; box: Box }[] = [];
  for (const group of layer(node, 'chips').children) {
    if (typeof group === 'string') continue;
    const rect = group.children.find((child): child is SvgNode => typeof child !== 'string' && child.tag === 'rect');
    if (!rect || !group.attrs['data-chip-for']) throw new Error('chip without owner or rect');
    const x = Number(rect.attrs.x);
    const y = Number(rect.attrs.y);
    out.push({
      id: group.attrs['data-chip-for']!,
      box: { x0: x, y0: y, x1: x + Number(rect.attrs.width), y1: y + Number(rect.attrs.height) },
    });
  }
  return out;
}

function fixture(
  components: Component[],
  extra: {
    physicalInterfaces?: LayoutDocument['physicalInterfaces'];
    transferCapabilities?: LayoutDocument['transferCapabilities'];
  } = {},
): LayoutDocument {
  return {
    schemaVersion: '0.4',
    kind: 'template',
    id: 'fixture',
    name: 'Fixture',
    unit: 'abstract',
    viewBox: { x: 0, y: 0, width: 800, height: 600 },
    sources: [],
    levels: [
      { id: 'level-main', label: 'Main', order: 0 },
      { id: 'level-upper', label: 'Upper', order: 1 },
    ],
    components,
    physicalInterfaces: extra.physicalInterfaces ?? [],
    transferCapabilities: extra.transferCapabilities ?? [],
    processRoutes: [],
    roleCardinality: {},
  };
}

function edge(id: string, a: string, b: string, kind: PhysicalInterfaceEdge['kind'] = 'gate'): PhysicalInterfaceEdge {
  return {
    id, kind,
    a: { componentId: a, portId: 'p' },
    b: { componentId: b, portId: 'p' },
    provenance: { certainty: 'assumed', sourceEvidence: [] },
  };
}

it.each(TEMPLATE_IDS)('%s preserves component ids, nesting and transforms', (id) => {
  const layout = templates[id];
  const { scene, markup } = render(layout);
  const found = componentsOf(scene.node);
  const ids = layout.components.map((item) => item.id).sort();
  expect([...found.keys()].sort()).toEqual(ids);
  const markupIds = [...markup.matchAll(/data-component-id="([^"]*)"/g)].map((match) => match[1]);
  expect(markupIds.sort()).toEqual(ids);
  expect(new Set(markupIds).size).toBe(markupIds.length);
  for (const item of layout.components) {
    const row = found.get(item.id);
    expect(row?.parentId ?? null).toBe(item.parentId ?? null);
    const { x, y, rotation, scale } = item.transform;
    expect(row?.node.attrs.transform).toBe(`translate(${x} ${y}) rotate(${rotation}) scale(${scale})`);
  }
});

it.each(TEMPLATE_IDS)('%s matches the review snapshot', async (id) => {
  const { markup } = render(templates[id]);
  await expect(markup).toMatchFileSnapshot(`__snapshots__/${id}.svg`);
});

it.each(TEMPLATE_IDS)('%s draws one interface mark per explicit edge and none when the layer is off', (id) => {
  const layout = templates[id];
  const marks = (node: SvgNode) => titles(layer(node, 'interfaces')).filter((title) => title.includes('Physical Interface'));
  const defaults = render(layout);
  const off = render(layout, { layers: { interfaces: false } });
  expect(marks(defaults.scene.node)).toHaveLength(layout.physicalInterfaces.length);
  expect(marks(off.scene.node)).toHaveLength(0);
  expect(titles(layer(defaults.scene.node, 'capabilities'))).toHaveLength(0);
  expect(titles(layer(defaults.scene.node, 'badges'))).toHaveLength(0);
  expect(texts(layer(defaults.scene.node, 'chips'))).toHaveLength(0);
});

it('does not invent interface marks from adjacency or from ports', () => {
  const port: Port = {
    id: 'p', position: { x: 40, y: 0 }, provenance: { certainty: 'assumed', sourceEvidence: [] },
  };
  const adjacent = render(fixture([
    component({ id: 'a', assetRef: 'primitive:pm', label: 'A', x: 100, y: 100, w: 96, h: 100, ports: [port] }),
    component({ id: 'b', assetRef: 'primitive:pm', label: 'B', x: 196, y: 100, w: 96, h: 100, ports: [port] }),
  ]));
  expect(titles(layer(adjacent.scene.node, 'interfaces'))).toHaveLength(0);
  const linked = render(fixture([
    component({ id: 'a', assetRef: 'primitive:pm', label: 'A', x: 80, y: 80, w: 96, h: 100 }),
    component({ id: 'b', assetRef: 'primitive:pm', label: 'B', x: 600, y: 400, w: 96, h: 100 }),
  ], { physicalInterfaces: [edge('far', 'a', 'b', 'optical')] }));
  expect(titles(layer(linked.scene.node, 'interfaces'))).toEqual(['A ↔ B · Physical Interface (optical)']);
});

it.each(TEMPLATE_IDS)('%s draws the distinct handler capability pairs', (id) => {
  const layout = templates[id];
  const { scene } = render(layout, { layers: { capabilities: true } });
  const marks = titles(layer(scene.node, 'capabilities'));
  expect(marks).toHaveLength(PAIRS[id]);
  const handlers = new Set(layout.transferCapabilities.map((item) => item.handlerComponentId));
  const handlerLabels = new Set(layout.components.filter((item) => handlers.has(item.id)).map((item) => item.label));
  for (const title of marks) {
    expect(title).toContain('Transfer Capability (가능, 관측 아님)');
    expect(handlerLabels.has(title.split(' → ')[0] ?? '')).toBe(true);
  }
});

it('draws handler to module only, never a self segment, when a capability endpoint is the handler site', () => {
  const layout = fixture([
    component({
      id: 'robot-1', assetRef: 'primitive:robot-single', label: 'Robot', role: 'robot', x: 200, y: 300, w: 80, h: 80,
      holdingSites: [site('blade-1')],
    }),
    component({ id: 'pm-1', assetRef: 'primitive:pm', label: 'PM', x: 500, y: 300, w: 96, h: 100, holdingSites: [site('slot-1')] }),
  ], {
    transferCapabilities: [{
      id: 'cap-1',
      a: { componentId: 'robot-1', holdingSiteId: 'blade-1' },
      b: { componentId: 'pm-1', holdingSiteId: 'slot-1' },
      handlerComponentId: 'robot-1',
      provenance: { certainty: 'assumed', sourceEvidence: [] },
    }],
  });
  const { scene } = render(layout, { layers: { capabilities: true } });
  expect(titles(layer(scene.node, 'capabilities'))).toEqual(['Robot → PM · Transfer Capability (가능, 관측 아님)']);
});

it.each(TEMPLATE_IDS)('%s chip text equals the holding site count', (id) => {
  const layout = templates[id];
  const { scene } = render(layout, { layers: { holdingSites: true } });
  const expected = layout.components.filter((item) => item.holdingSites.length >= 1).map((item) => String(item.holdingSites.length)).sort();
  expect(texts(layer(scene.node, 'chips')).sort()).toEqual(expected);
});

it.each([
  ['cluster-single', 'label'],
  ['cluster-single', 'none'],
  ['track-stacked', 'label'],
  ['track-stacked', 'none'],
] as const)('%s with labels=%s keeps chips clear of badges, labels and robot extents', (id, mode) => {
  const layout = templates[id];
  const { scene } = render(layout, {
    labels: mode,
    layers: { interfaces: true, certainty: true, holdingSites: true, capabilities: true },
  });
  const chips = chipRects(scene.node);
  const badges = badgeBoxes(scene.node);
  const labels = labelBoxesFromRendered(scene.node, false);
  const guards = robotExtentBoxes(layout, scene.node);
  expect(chips.length).toBeGreaterThan(0);
  expect(badges.length).toBeGreaterThan(0);
  for (const chip of chips) {
    const rect = shrink(chip.box, FORMAT_EPS);
    for (const badge of badges) {
      expect(rectsOverlap(rect, badge), `chip of ${chip.id} over a badge`).toBe(false);
    }
    for (const label of labels) {
      expect(rectsOverlap(rect, label), `chip of ${chip.id} over a label`).toBe(false);
    }
    for (const guard of guards.get(chip.id) ?? []) {
      expect(rectsOverlap(rect, guard), `chip of ${chip.id} over its robot extent`).toBe(false);
    }
  }
});

it('draws the loadlock glyph at scale 1 and offset 0 in band mode', () => {
  const { scene } = render(templates['cluster-single']);
  const node = componentsOf(scene.node).get('ll-a')?.node;
  expect(node).toBeTruthy();
  expect(glyphTransform(node!)).toBe('translate(0 0) scale(1)');
});

it('badges appear only where an assumed provenance entry exists', () => {
  const layout = templates['cluster-single'];
  const expected = layout.components.filter((item) => !isStructure(item) && hasAssumed(item));
  const on = render(layout, { layers: { certainty: true } });
  expect(titles(layer(on.scene.node, 'badges'))).toHaveLength(expected.length);
  const target = expected[0];
  expect(target).toBeTruthy();
  const emptied: LayoutDocument = {
    ...layout,
    components: layout.components.map((item) => (item.id === target?.id ? { ...item, provenance: {} } : item)),
  };
  const after = render(emptied, { layers: { certainty: true } });
  expect(titles(layer(after.scene.node, 'badges'))).toHaveLength(expected.length - 1);
});

it('hiding level-upper leaves those groups empty, drops their marks, and stacked copies show when visible', () => {
  const layout = templates['track-stacked'];
  const upper = layout.components.filter((item) => item.levelId === 'level-upper');
  expect(upper.length).toBeGreaterThan(0);
  const hidden = render(layout, {
    visibleLevelIds: ['level-main'],
    layers: { interfaces: true, capabilities: true, holdingSites: true, certainty: true },
  });
  const found = componentsOf(hidden.scene.node);
  for (const item of upper) {
    const node = found.get(item.id)?.node;
    expect(node?.attrs['data-hidden']).toBe('true');
    expect(node?.children.every((child) => typeof child !== 'string' && child.attrs['data-component-id'])).toBe(true);
  }
  const hiddenIds = new Set(upper.map((item) => item.id));
  const expectedInterfaces = layout.physicalInterfaces.filter((item) => !hiddenIds.has(item.a.componentId) && !hiddenIds.has(item.b.componentId)).length;
  expect(titles(layer(hidden.scene.node, 'interfaces')).filter((title) => title.includes('Physical Interface'))).toHaveLength(expectedInterfaces);
  const visiblePairs = new Set<string>();
  for (const item of layout.transferCapabilities) {
    if (hiddenIds.has(item.handlerComponentId)) continue;
    for (const targetId of [item.a.componentId, item.b.componentId]) {
      if (targetId === item.handlerComponentId || hiddenIds.has(targetId)) continue;
      visiblePairs.add(`${item.handlerComponentId}\0${targetId}`);
    }
  }
  expect(visiblePairs.size).toBeLessThan(PAIRS['track-stacked']);
  expect(titles(layer(hidden.scene.node, 'capabilities'))).toHaveLength(visiblePairs.size);
  const visibleChips = layout.components
    .filter((item) => item.levelId !== 'level-upper' && item.holdingSites.length >= 1)
    .map((item) => String(item.holdingSites.length)).sort();
  expect(texts(layer(hidden.scene.node, 'chips')).sort()).toEqual(visibleChips);
  const visibleBadges = layout.components.filter((item) => item.levelId !== 'level-upper' && !isStructure(item) && hasAssumed(item)).length;
  expect(titles(layer(hidden.scene.node, 'badges'))).toHaveLength(visibleBadges);

  const shown = componentsOf(render(layout).scene.node);
  for (const item of upper) {
    const node = shown.get(item.id)?.node;
    expect(node?.children.some((child) => typeof child !== 'string' && child.attrs['data-stack'] === 'true')).toBe(true);
  }
});

it('keeps a visible child nested under a hidden parent and drops a mark on that parent', () => {
  const layout = fixture([
    component({ id: 'box', assetRef: 'primitive:housing', label: 'Box', levelId: 'level-upper', x: 200, y: 200, scale: 2, w: 400, h: 300, role: 'housing' }),
    component({ id: 'mod', assetRef: 'primitive:pm', label: 'PM', parentId: 'box', x: 10, y: 20, w: 96, h: 100 }),
    component({ id: 'other', assetRef: 'primitive:pm', label: 'Other', x: 500, y: 200, w: 96, h: 100 }),
  ], { physicalInterfaces: [edge('link', 'box', 'other')] });
  const { scene } = render(layout, { visibleLevelIds: ['level-main'] });
  const found = componentsOf(scene.node);
  const box = found.get('box')?.node;
  const mod = found.get('mod');
  expect(box?.attrs['data-hidden']).toBe('true');
  expect(mod?.parentId).toBe('box');
  expect(mod?.node.attrs.transform).toBe('translate(10 20) rotate(0) scale(1)');
  expect(box?.children.every((child) => typeof child !== 'string' && child.attrs['data-component-id'])).toBe(true);
  expect(titles(mod!.node).some((title) => title.includes('PM'))).toBe(true);
  expect(titles(layer(scene.node, 'interfaces'))).toHaveLength(0);
});

it.each([
  { mode: 'band', w: 70, h: 76 },
  { mode: 'center', w: 28, h: 40 },
  { mode: 'outside', w: 16, h: 16 },
] as const)('label lod uses $mode', ({ mode, w, h }) => {
  const layout = fixture([component({ id: 'mod', assetRef: 'primitive:pm', label: 'PM', x: 200, y: 150, w, h })]);
  const { scene } = render(layout);
  const node = componentsOf(scene.node).get('mod')?.node;
  const label = layer(scene.node, 'labels').children.find((child): child is SvgNode => typeof child !== 'string' && child.tag === 'text');
  expect(node).toBeTruthy();
  expect(label).toBeTruthy();
  const y = Number(label?.attrs.y);
  if (mode === 'band') {
    const transform = glyphTransform(node!);
    expect(transform).toMatch(/^translate\(0 -/);
    const glyphScale = Number(transform?.match(/scale\(([\d.]+)\)/)?.[1]);
    expect(glyphScale).toBeLessThan(1);
    // The glyph sits inside the primitive fit group, so its world offset is fit × gy = -band/2 = -(13+14)/2.
    const fit = Number(node!.children
      .find((child): child is SvgNode => typeof child !== 'string' && /^scale\(/.test(child.attrs.transform ?? ''))
      ?.attrs.transform?.match(/scale\(([\d.]+)\)/)?.[1]);
    const gy = Number(transform?.match(/translate\(0 (-?[\d.]+)\)/)?.[1]);
    expect(fit * gy).toBeCloseTo(-13.5, 2);
    expect(y).toBeGreaterThan(150 - h / 2);
    expect(y).toBeLessThan(150 + h / 2);
  } else if (mode === 'center') {
    expect(hasGlyph(node!)).toBe(false);
    expect(label?.attrs['paint-order']).toBeUndefined();
  } else {
    expect(label?.attrs['paint-order']).toBe('stroke');
    expect(label?.attrs.stroke).toContain('--eqv-board');
    expect(y).toBeGreaterThan(150 + h / 2);
  }
});

it('demotes band labels to center when any instance of the asset misses band', () => {
  const alone = fixture([component({ id: 'wide', assetRef: 'primitive:pm', label: 'PM', x: 200, y: 200, w: 96, h: 100 })]);
  expect(hasGlyph(componentsOf(render(alone).scene.node).get('wide')!.node)).toBe(true);
  const both = fixture([
    component({ id: 'wide', assetRef: 'primitive:pm', label: 'PM', x: 200, y: 200, w: 96, h: 100 }),
    component({ id: 'narrow', assetRef: 'primitive:pm', label: 'PM', x: 500, y: 200, w: 28, h: 40 }),
  ]);
  const found = componentsOf(render(both).scene.node);
  expect(hasGlyph(found.get('wide')!.node)).toBe(false);
  expect(hasGlyph(found.get('narrow')!.node)).toBe(false);
});

it.each([
  {
    name: 'template efem',
    layout: () => templates['cluster-single'],
    id: 'efem-1',
  },
  {
    name: 'efem under a parent scaled by 2',
    layout: () => fixture([
      component({ id: 'frame', assetRef: 'primitive:housing', label: 'Frame', x: 400, y: 300, scale: 2, w: 700, h: 400, role: 'housing' }),
      component({ id: 'efem-1', assetRef: 'primitive:efem', label: 'EFEM', parentId: 'frame', w: 440, h: 100, role: 'efem' }),
    ]),
    id: 'efem-1',
  },
  {
    name: 'size-less efem under a parent scaled by 2',
    layout: () => fixture([
      component({ id: 'frame', assetRef: 'primitive:housing', label: 'Frame', x: 400, y: 300, scale: 2, w: 700, h: 400, role: 'housing' }),
      component({ id: 'efem-1', assetRef: 'primitive:efem', label: 'EFEM', parentId: 'frame', role: 'efem' }),
    ]),
    id: 'efem-1',
  },
])('keeps a 12px corner on $name', ({ layout, id }) => {
  const doc = layout();
  const { scene, pxPerUnit } = render(doc);
  const node = componentsOf(scene.node).get(id)?.node;
  const rect = node?.children.find((child): child is SvgNode => typeof child !== 'string' && child.tag === 'rect');
  const size = doc.components.find((item) => item.id === id)?.size;
  if (size) {
    expect(Number(rect?.attrs.width)).toBe(size.width);
    expect(Number(rect?.attrs.height)).toBe(size.height);
  } else {
    expect(size).toBeUndefined();
    // Natural body geometry: the primitive body's own x/y/width/height (efem), not the padded viewBox frame.
    expect(Number(rect?.attrs.x)).toBe(-220);
    expect(Number(rect?.attrs.y)).toBe(-50);
    expect(Number(rect?.attrs.width)).toBe(440);
    expect(Number(rect?.attrs.height)).toBe(100);
  }
  expect(Number(rect?.attrs.rx) * scaleProduct(doc, id) * pxPerUnit).toBeCloseTo(12, 4);
});

it.each(TEMPLATE_IDS)('%s uses only documented paints', (id) => {
  const { markup } = render(templates[id]);
  const paints = [...markup.matchAll(/\b(?:fill|stroke)="([^"]*)"/g)].map((match) => match[1] ?? '');
  expect(paints.length).toBeGreaterThan(0);
  for (const paint of paints) {
    expect(paint).toMatch(/^(?:none|var\(--eqv-[a-z-]+, #[0-9a-f]{6}\))$/);
    if (paint !== 'none') expect(TOKENS.has(paint.match(/--eqv-[a-z-]+/)?.[0] ?? '')).toBe(true);
  }
});
