import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import {
  layoutDocumentSchema, type Component, type LayoutDocument, type PhysicalInterfaceEdge, type Port,
} from '@eqv/core';
import { buildScene, TopView, type SceneOptions, type SvgNode } from '../src/index.js';

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
    holdingSites: [],
    provenance: partial.provenance ?? {},
  };
}

function fixture(
  components: Component[],
  extra: { physicalInterfaces?: LayoutDocument['physicalInterfaces'] } = {},
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
    transferCapabilities: [],
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

it.each(TEMPLATE_IDS)('%s chip text equals the holding site count', (id) => {
  const layout = templates[id];
  const { scene } = render(layout, { layers: { holdingSites: true } });
  const expected = layout.components.filter((item) => item.holdingSites.length >= 1).map((item) => String(item.holdingSites.length)).sort();
  expect(texts(layer(scene.node, 'chips')).sort()).toEqual(expected);
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
  { mode: 'band', w: 96, h: 100 },
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
    expect(glyphTransform(node!)).toMatch(/^translate\(0 -/);
    expect(glyphTransform(node!)).toContain('scale(');
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
])('keeps a 12px corner on $name', ({ layout, id }) => {
  const doc = layout();
  const { scene, pxPerUnit } = render(doc);
  const node = componentsOf(scene.node).get(id)?.node;
  const rect = node?.children.find((child): child is SvgNode => typeof child !== 'string' && child.tag === 'rect');
  const size = doc.components.find((item) => item.id === id)?.size;
  expect(Number(rect?.attrs.width)).toBe(size?.width);
  expect(Number(rect?.attrs.height)).toBe(size?.height);
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
