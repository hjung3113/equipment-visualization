import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { layoutDocumentSchema, type Component, type LayoutDocument } from '@eqv/core';
import { buildScene, TopView, type Scene, type SceneComponent, type SvgNode } from '../src/index.js';
import { buildOverlay, type OverlayState } from '../src/overlay.js';
import { robotR, shapeLocal } from '../src/geom.js';
import { renderNode } from '../src/svg.js';

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
const CAPABILITY = 'Transfer Capability (가능, 관측 아님)';
const CLASS_KO = {
  process: '공정 모듈',
  holding: '대기·출입 모듈',
  robot: '로봇·핸들러',
  structure: '구조물',
} as const;
const RAD = { process: 8, holding: 8, robot: 8, structure: 12 } as const;
const TOKENS = new Set([...readFileSync(new URL('assets/primitives/README.md', root), 'utf8')
  .matchAll(/^\| `(--eqv-[a-z-]+)` \|/gm)].map((match) => match[1]!));

function load(id: string): LayoutDocument {
  return layoutDocumentSchema.parse(JSON.parse(readFileSync(new URL(`assets/templates/${id}.template.json`, root), 'utf8')));
}

const templates = Object.fromEntries(TEMPLATE_IDS.map((id) => [id, load(id)])) as Record<(typeof TEMPLATE_IDS)[number], LayoutDocument>;

function component(partial: Pick<Component, 'id' | 'assetRef' | 'label'> & {
  role?: string; parentId?: string; levelId?: string;
  x?: number; y?: number; scale?: number; w?: number; h?: number;
}): Component {
  return {
    id: partial.id,
    role: partial.role ?? 'module',
    assetRef: partial.assetRef,
    label: partial.label,
    parentId: partial.parentId,
    levelId: partial.levelId ?? 'level-main',
    transform: { x: partial.x ?? 0, y: partial.y ?? 0, rotation: 0, scale: partial.scale ?? 1 },
    size: partial.w != null && partial.h != null ? { width: partial.w, height: partial.h } : undefined,
    ports: [],
    holdingSites: [],
    provenance: {},
  };
}

function capability(id: string, handler: string, a: string, b: string): LayoutDocument['transferCapabilities'][number] {
  return {
    id,
    handlerComponentId: handler,
    a: { componentId: a, holdingSiteId: 'slot' },
    b: { componentId: b, holdingSiteId: 'slot' },
    provenance: { certainty: 'assumed', sourceEvidence: [] },
  };
}

function fixture(
  components: Component[],
  transferCapabilities: LayoutDocument['transferCapabilities'] = [],
  visibleLevelIds?: readonly string[],
): { layout: LayoutDocument; scene: Scene } {
  const layout: LayoutDocument = {
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
    physicalInterfaces: [],
    transferCapabilities,
    processRoutes: [],
    roleCardinality: {},
  };
  const scene = buildScene(layout, {
    width: 1600, height: 1200, pxPerUnit: 2, visibleLevelIds, interactive: true,
  });
  return { layout, scene };
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

function layer(node: SvgNode, name: string): SvgNode {
  const found = node.children.find((child) => typeof child !== 'string' && child.attrs['data-layer'] === name);
  if (!found || typeof found === 'string') throw new Error(`missing layer ${name}`);
  return found;
}

function shapes(node: SvgNode): SvgNode[] {
  const out: SvgNode[] = [];
  const walk = (current: SvgNode) => {
    if (current.tag !== 'g') out.push(current);
    for (const child of current.children) if (typeof child !== 'string') walk(child);
  };
  walk(node);
  return out;
}

function round(n: number): number {
  const rounded = Math.round(n * 10000) / 10000;
  return rounded === 0 ? 0 : rounded;
}

function overlay(scene: Scene, state: Partial<OverlayState> & Pick<OverlayState, 'selectedId'>) {
  return buildOverlay(scene, {
    hoveredId: null,
    focusedId: null,
    showAllCapabilities: false,
    ...state,
  }, 1 / scene.pxPerUnit);
}

it.each(TEMPLATE_IDS)('%s draws the 12a capability pairs only with no visible selection', (id) => {
  const layout = templates[id];
  const width = layout.viewBox.width;
  const height = layout.viewBox.height;
  const scene = buildScene(layout, {
    width, height, pxPerUnit: 1, layers: { capabilities: true },
  });
  const on = overlay(scene, { selectedId: null, showAllCapabilities: true });
  const off = overlay(scene, { selectedId: null, showAllCapabilities: false });
  expect(titles(on.capabilities)).toEqual(titles(layer(scene.node, 'capabilities')));
  expect(titles(on.capabilities)).toHaveLength(PAIRS[id]);
  expect(titles(off.capabilities)).toHaveLength(0);
  expect(on.interaction.children).toHaveLength(0);
});

// Literal endpoint sets read from the two template JSON files.
it.each([
  ['cluster-single', 'robot-2', [
    'Vac Robot → PM1', 'Vac Robot → PM2', 'Vac Robot → PM3',
    'Vac Robot → PM4', 'Vac Robot → LL-A', 'Vac Robot → LL-B',
  ]],
  ['cluster-single', 'pm-a', [
    'Vac Robot → PM1', 'Vac Robot → PM2', 'Vac Robot → PM3',
    'Vac Robot → PM4', 'Vac Robot → LL-A', 'Vac Robot → LL-B',
  ]],
  ['cluster-dual-hub', 'robot-3', [
    'Single Arm → Buffer', 'Single Arm → PM3', 'Single Arm → PM4',
    'Single Arm → PM5', 'Single Arm → PM6',
  ]],
  ['cluster-dual-hub', 'buffer-1', [
    'Dual Arm → LL-1', 'Dual Arm → LL-2', 'Dual Arm → Buffer',
    'Dual Arm → PM1', 'Dual Arm → PM2',
    'Single Arm → Buffer', 'Single Arm → PM3', 'Single Arm → PM4',
    'Single Arm → PM5', 'Single Arm → PM6',
  ]],
] as const)('%s selection %s draws its literal handler endpoints', (id, selectedId, endpoints) => {
  const layout = templates[id];
  const scene = buildScene(layout, {
    width: layout.viewBox.width, height: layout.viewBox.height, pxPerUnit: 1,
  });
  for (const showAllCapabilities of [true, false]) {
    expect(titles(overlay(scene, { selectedId, showAllCapabilities }).capabilities).sort())
      .toEqual(endpoints.map((endpoint) => `${endpoint} · ${CAPABILITY}`).sort());
  }
});

it('selecting one end of H→A↔B and H→C↔D draws that pair only', () => {
  const { layout, scene } = fixture([
    component({ id: 'h', assetRef: 'primitive:robot-single', label: 'Handler', x: 400, y: 300, w: 80, h: 80, role: 'robot' }),
    component({ id: 'a', assetRef: 'primitive:pm', label: 'Alpha', x: 160, y: 180, w: 80, h: 80 }),
    component({ id: 'b', assetRef: 'primitive:pm', label: 'Beta', x: 160, y: 420, w: 80, h: 80 }),
    component({ id: 'c', assetRef: 'primitive:pm', label: 'Gamma', x: 640, y: 180, w: 80, h: 80 }),
    component({ id: 'd', assetRef: 'primitive:pm', label: 'Delta', x: 640, y: 420, w: 80, h: 80 }),
  ], [
    capability('ab', 'h', 'a', 'b'),
    capability('cd', 'h', 'c', 'd'),
  ]);
  const title = (target: string) => `${layout.components.find((item) => item.id === 'h')?.label} → ${layout.components.find((item) => item.id === target)?.label} · ${CAPABILITY}`;
  for (const showAllCapabilities of [true, false]) {
    expect(titles(overlay(scene, { selectedId: 'a', showAllCapabilities }).capabilities).sort())
      .toEqual([title('a'), title('b')].sort());
    expect(titles(overlay(scene, { selectedId: 'c', showAllCapabilities }).capabilities).sort())
      .toEqual([title('c'), title('d')].sort());
  }
  expect(titles(overlay(scene, { selectedId: 'h', showAllCapabilities: false }).capabilities).sort())
    .toEqual([title('a'), title('b'), title('c'), title('d')].sort());
});

it('draws no capability for a selected component that has none, even when it touches another', () => {
  const { scene } = fixture([
    component({ id: 'h', assetRef: 'primitive:robot-single', label: 'Handler', x: 500, y: 300, w: 80, h: 80, role: 'robot' }),
    component({ id: 'a', assetRef: 'primitive:pm', label: 'Alpha', x: 100, y: 200, w: 96, h: 100 }),
    component({ id: 'b', assetRef: 'primitive:pm', label: 'Beside', x: 196, y: 200, w: 96, h: 100 }),
    component({ id: 'c', assetRef: 'primitive:pm', label: 'Gamma', x: 500, y: 120, w: 80, h: 80 }),
  ], [capability('ac', 'h', 'a', 'c')]);
  const alpha = scene.components.get('a');
  const beside = scene.components.get('b');
  if (!alpha || !beside) throw new Error('missing component geometry');
  expect(alpha.bbox.x1).toBeCloseTo(beside.bbox.x0, 4);
  expect(titles(overlay(scene, { selectedId: 'b', showAllCapabilities: true }).capabilities)).toHaveLength(0);
  expect(titles(overlay(scene, { selectedId: 'a', showAllCapabilities: true }).capabilities)).toHaveLength(2);
});

it.each([
  { name: 'null', selectedId: null as string | null, showAll: true },
  { name: 'null off', selectedId: null as string | null, showAll: false },
  { name: 'absent', selectedId: 'missing', showAll: true },
  { name: 'absent off', selectedId: 'missing', showAll: false },
  { name: 'hidden', selectedId: 'secret', showAll: true },
  { name: 'hidden off', selectedId: 'secret', showAll: false },
])('$name selection draws no interaction and the capability pairs of no selection', ({ selectedId, showAll }) => {
  const { scene } = fixture([
    component({ id: 'h', assetRef: 'primitive:robot-single', label: 'Handler', x: 400, y: 300, w: 80, h: 80, role: 'robot' }),
    component({ id: 'a', assetRef: 'primitive:pm', label: 'Alpha', x: 160, y: 200, w: 80, h: 80 }),
    component({ id: 'b', assetRef: 'primitive:pm', label: 'Beta', x: 160, y: 420, w: 80, h: 80 }),
    component({ id: 'secret', assetRef: 'primitive:pm', label: 'Secret', x: 640, y: 300, w: 80, h: 80, levelId: 'level-upper' }),
  ], [
    capability('ab', 'h', 'a', 'b'),
    capability('as', 'h', 'secret', 'a'),
  ], ['level-main']);
  const result = overlay(scene, {
    selectedId,
    hoveredId: selectedId,
    focusedId: selectedId,
    showAllCapabilities: showAll,
  });
  const open = overlay(scene, { selectedId: null, showAllCapabilities: showAll });
  expect(result.interaction.children).toHaveLength(0);
  expect(titles(result.capabilities)).toEqual(titles(open.capabilities));
  expect(titles(result.capabilities)).toEqual(showAll ? [`Handler → Alpha · ${CAPABILITY}`, `Handler → Beta · ${CAPABILITY}`] : []);
});

it.each([
  { id: 'arm', tag: 'circle' },
  { id: 'chamber', tag: 'polygon' },
  { id: 'mod', tag: 'rect' },
] as const)('$id interaction is a $tag expanded by screen pixels under a parent scaled by 2', ({ id, tag }) => {
  const { scene } = fixture([
    component({ id: 'frame', assetRef: 'primitive:housing', label: 'Frame', x: 400, y: 300, scale: 2, w: 700, h: 400, role: 'housing' }),
    component({ id: 'arm', assetRef: 'primitive:robot-single', label: 'Arm', parentId: 'frame', x: -40, y: 0, w: 80, h: 80, role: 'robot' }),
    component({ id: 'chamber', assetRef: 'primitive:tm', label: 'TM', parentId: 'frame', x: 40, y: 0, w: 100, h: 80, role: 'tm' }),
    component({ id: 'mod', assetRef: 'primitive:pm', label: 'PM', parentId: 'frame', x: 0, y: 40, w: 70, h: 76 }),
  ]);
  const comp = scene.components.get(id);
  if (!comp) throw new Error(`missing ${id}`);
  expect(comp.S).toBe(2);
  const kLocal = (1 / scene.pxPerUnit) / comp.S;

  const check = (node: SvgNode, dPx: number, strokePx: number, stroke: string) => {
    expect(node.tag).toBe(tag);
    expect(node.attrs.fill).toBe('none');
    expect(node.attrs.stroke).toBe(stroke);
    expect(node.attrs['vector-effect']).toBe('non-scaling-stroke');
    expect(Number(node.attrs['stroke-width'])).toBe(round(strokePx));
    const d = dPx * kLocal;
    if (tag === 'circle') {
      expect(Number(node.attrs.r)).toBe(round(robotR(comp.w, comp.h) + d));
    } else if (tag === 'polygon') {
      const expected = shapeLocal('tm', comp.w + 2 * d, comp.h + 2.3 * d).flat();
      const actual = (node.attrs.points ?? '').split(/[\s,]+/).map(Number);
      expect(actual).toEqual(expected.map(round));
    } else {
      const rx = Math.min(RAD[comp.cls] * kLocal, Math.min(comp.w, comp.h) * 0.2) + d;
      expect(Number(node.attrs.x)).toBe(round(-comp.w / 2 - d));
      expect(Number(node.attrs.y)).toBe(round(-comp.h / 2 - d));
      expect(Number(node.attrs.width)).toBe(round(comp.w + 2 * d));
      expect(Number(node.attrs.height)).toBe(round(comp.h + 2 * d));
      expect(Number(node.attrs.rx)).toBe(round(rx));
    }
  };

  const hover = shapes(overlay(scene, { selectedId: null, hoveredId: id }).interaction);
  expect(hover).toHaveLength(1);
  const hovered = hover[0];
  if (!hovered) throw new Error('missing hover');
  check(hovered, 0, 2.6, comp.bodyStroke);

  const selected = shapes(overlay(scene, { selectedId: id }).interaction);
  expect(selected).toHaveLength(2);
  const band = selected[0];
  const ring = selected[1];
  if (!band || !ring) throw new Error('missing selection');
  check(band, 1, 2, 'var(--eqv-selection-fill, #e4e8f6)');
  check(ring, 3, 2, 'var(--eqv-selection, #1428a0)');

  const focused = shapes(overlay(scene, { selectedId: null, focusedId: id }).interaction);
  expect(focused).toHaveLength(2);
  const separator = focused[0];
  const focusRing = focused[1];
  if (!separator || !focusRing) throw new Error('missing focus');
  check(separator, 3, 2, 'var(--eqv-board, #fbfdff)');
  check(focusRing, 5, 2, 'var(--eqv-selection, #1428a0)');
});

it('uses only documented paints for selection, hover, focus and capabilities', () => {
  const { scene } = fixture([
    component({ id: 'arm', assetRef: 'primitive:robot-single', label: 'Arm', x: 240, y: 300, w: 80, h: 80, role: 'robot' }),
    component({ id: 'mod', assetRef: 'primitive:pm', label: 'PM', x: 400, y: 180, w: 80, h: 80 }),
    component({ id: 'chamber', assetRef: 'primitive:tm', label: 'TM', x: 560, y: 300, w: 120, h: 100, role: 'tm' }),
  ], [capability('link', 'arm', 'mod', 'chamber')]);
  const result = overlay(scene, {
    selectedId: 'mod', hoveredId: 'arm', focusedId: 'chamber', showAllCapabilities: true,
    highlight: { componentIds: ['arm', 'mod'], transfers: [{ from: 'arm', to: 'mod', label: 'x' }] },
  });
  expect(titles(result.capabilities).length).toBeGreaterThan(0);
  expect(result.interaction.attrs['pointer-events']).toBe('none');
  expect(result.capabilities.attrs['pointer-events']).toBe('none');
  const paints: string[] = [];
  for (const group of [result.interaction, result.capabilities, result.highlight]) {
    const walk = (node: SvgNode) => {
      expect(node.attrs['data-component-id']).toBeUndefined();
      for (const name of ['fill', 'stroke']) {
        const paint = node.attrs[name];
        if (paint != null) paints.push(paint);
      }
      for (const child of node.children) if (typeof child !== 'string') walk(child);
    };
    walk(group);
  }
  expect(paints.length).toBeGreaterThan(0);
  for (const paint of paints) {
    expect(paint).toMatch(/^(?:none|var\(--eqv-[a-z-]+, #[0-9a-f]{6}\))$/);
    if (paint !== 'none') expect(TOKENS.has(paint.match(/--eqv-[a-z-]+/)?.[0] ?? '')).toBe(true);
  }
});

it('draws dashed rings and one titled line for a highlight, skipping hidden and absent ids', () => {
  const { scene } = fixture([
    component({ id: 'a', assetRef: 'primitive:pm', label: 'A', x: 100, y: 100, w: 80, h: 80 }),
    component({ id: 'b', assetRef: 'primitive:pm', label: 'B', x: 400, y: 300, w: 80, h: 80 }),
  ]);
  const label = '관측 이송 LP1 → LLA 3건 (Transfer Capability 없음)';
  const result = overlay(scene, { selectedId: null, highlight: { componentIds: ['a', 'b'], transfers: [{ from: 'a', to: 'b', label }] } }).highlight;
  expect(result.attrs['data-layer']).toBe('highlight');
  expect(result.attrs['pointer-events']).toBe('none');
  const drawn = shapes(result);
  const rings = drawn.filter((node) => node.tag === 'rect');
  const lines = drawn.filter((node) => node.tag === 'line');
  expect(rings).toHaveLength(2);
  for (const node of rings) expect(node.attrs).toMatchObject({ 'stroke-dasharray': '6 4', stroke: 'var(--eqv-highlight, #b42318)' });
  expect(lines).toHaveLength(1);
  expect(lines[0]!.attrs['stroke-dasharray']).toBe('6 4');
  expect(titles(lines[0]!)).toEqual([label]);
  const a = scene.components.get('a')!;
  const b = scene.components.get('b')!;
  expect(lines[0]!.attrs).toMatchObject({ x1: String(round(a.center[0])), y1: String(round(a.center[1])), x2: String(round(b.center[0])), y2: String(round(b.center[1])) });

  const partial = overlay(scene, { selectedId: null, highlight: { componentIds: ['a', 'missing'], transfers: [{ from: 'a', to: 'missing', label }] } }).highlight;
  expect(shapes(partial).map((node) => node.tag)).toEqual(['rect']);
});

it('leaves the highlight layer empty without a highlight', () => {
  const { scene } = fixture([component({ id: 'a', assetRef: 'primitive:pm', label: 'A', x: 100, y: 100, w: 80, h: 80 })]);
  expect(overlay(scene, { selectedId: null }).highlight.children).toEqual([]);
  expect(overlay(scene, { selectedId: null, highlight: null }).highlight.children).toEqual([]);
});

it.each(TEMPLATE_IDS)('%s is byte-identical when interactive is omitted or false', (id) => {
  const layout = templates[id];
  const width = layout.viewBox.width;
  const height = layout.viewBox.height;
  const markup = (interactive?: boolean) => renderToStaticMarkup(renderNode(buildScene(layout, {
    width, height, pxPerUnit: 1, interactive,
  }).node));
  expect(markup(false)).not.toContain('style=');
  expect(markup(false)).toBe(markup(undefined));
  expect(markup(undefined)).toBe(renderToStaticMarkup(createElement(TopView, { layout, width, height })));
});

it('makes visible components buttons and keeps overlay layers from taking the hit', () => {
  const { scene } = fixture([
    component({ id: 'box', assetRef: 'primitive:housing', label: 'Box', levelId: 'level-upper', x: 200, y: 200, w: 400, h: 300, role: 'housing' }),
    component({ id: 'mod', assetRef: 'primitive:pm', label: 'PM', parentId: 'box', x: 10, y: 20, w: 96, h: 100 }),
    component({ id: 'lock', assetRef: 'primitive:loadlock', label: 'Lock', x: 500, y: 200, w: 90, h: 80, role: 'loadlock' }),
    component({ id: 'arm', assetRef: 'primitive:robot-single', label: 'Arm', x: 640, y: 200, w: 80, h: 80, role: 'robot' }),
    component({ id: 'chamber', assetRef: 'primitive:tm', label: 'TM', x: 400, y: 420, w: 140, h: 120, role: 'tm' }),
  ], [], ['level-main']);
  const found = new Map<string, SvgNode>();
  const walk = (node: SvgNode) => {
    const id = node.attrs['data-component-id'];
    if (id) found.set(id, node);
    for (const child of node.children) if (typeof child !== 'string') walk(child);
  };
  walk(scene.node);
  expect([...found.keys()].sort()).toEqual(['arm', 'box', 'chamber', 'lock', 'mod']);
  const box = found.get('box');
  expect(box?.attrs['data-hidden']).toBe('true');
  expect(box?.attrs.tabindex).toBeUndefined();
  expect(box?.attrs.role).toBeUndefined();
  const expected: [string, SceneComponent['cls']][] = [
    ['mod', 'process'], ['lock', 'holding'], ['arm', 'robot'], ['chamber', 'structure'],
  ];
  for (const [id, cls] of expected) {
    const node = found.get(id);
    const label = scene.components.get(id)?.label;
    expect(node?.attrs['data-hidden']).toBeUndefined();
    expect(node?.attrs.style).toBe('outline:none');
    expect(node?.attrs.tabindex).toBe('0');
    expect(node?.attrs.role).toBe('button');
    expect(node?.attrs['aria-pressed']).toBe('false');
    expect(node?.attrs['aria-label']).toBe(`${label}, ${CLASS_KO[cls]}`);
  }
  for (const name of ['interfaces', 'capabilities', 'labels', 'badges', 'chips']) {
    const node = layer(scene.node, name);
    expect(node.attrs['pointer-events']).toBe('none');
  }
});
