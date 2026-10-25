import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { layoutDocumentSchema, type Component, type LayoutDocument, type SceneState } from '@eqv/core';
import { buildScene, TopView, type Scene, type SceneComponent, type SvgNode } from '../src/index.js';
import { buildOverlay, buildReplayLayer, type IllustrativeGhost, type OverlayState } from '../src/overlay.js';
import { robotR, shapeLocal } from '../src/geom.js';
import { formatNum, renderNode } from '../src/svg.js';

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
  x?: number; y?: number; scale?: number; w?: number; h?: number; sites?: string[];
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
    holdingSites: (partial.sites ?? []).map((id) => ({
      id, materialKinds: ['wafer' as const], provenance: { certainty: 'assumed' as const, sourceEvidence: [] },
    })),
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

it('uses only documented paints for selection, hover, focus, capabilities and replay', () => {
  const { scene } = fixture([
    component({ id: 'arm', assetRef: 'primitive:robot-single', label: 'Arm', x: 240, y: 300, w: 80, h: 80, role: 'robot' }),
    component({ id: 'mod', assetRef: 'primitive:pm', label: 'PM', x: 400, y: 180, w: 80, h: 80 }),
    component({ id: 'chamber', assetRef: 'primitive:tm', label: 'TM', x: 560, y: 300, w: 120, h: 100, role: 'tm' }),
  ], [capability('link', 'arm', 'mod', 'chamber')]);
  const result = overlay(scene, {
    selectedId: 'mod', hoveredId: 'arm', focusedId: 'chamber', showAllCapabilities: true,
    highlight: { componentIds: ['arm', 'mod'], transfers: [{ from: 'arm', to: 'mod', label: 'x' }] },
  });
  const materials = Array.from({ length: 7 }, (_, i) => stateMaterial({
    key: `m:wafer:W${i + 1}`, kind: 'wafer', id: `W${i + 1}`,
    location: { componentId: 'mod' }, locationEvidence: 'observed',
    identityEvidence: i === 0 ? 'unknown' : 'observed',
  }));
  const replayPaint = buildReplayLayer(scene, {
    state: replayState({
      materials,
      components: [
        { componentId: 'mod', activity: 'processing', activityEvidence: 'derived', occurrenceIds: [] },
        { componentId: 'arm', activity: 'no recorded activity', activityEvidence: 'unknown', occurrenceIds: [] },
      ],
      markers: [{ kind: 'occupancy-conflict', componentId: 'chamber', holdingSiteId: 'slot', materialKeys: ['m:wafer:W1'] }],
    }),
    illustrative: [{ materialKey: 'm:wafer:W1', label: 'W1 → mod', fromComponentId: 'arm', toComponentId: 'mod', fraction: 0.5 }],
  }, 1 / scene.pxPerUnit);
  expect(titles(result.capabilities).length).toBeGreaterThan(0);
  expect(result.interaction.attrs['pointer-events']).toBe('none');
  expect(result.capabilities.attrs['pointer-events']).toBe('none');
  expect(replayPaint.attrs['aria-hidden']).toBe('true');
  expect(replayPaint.attrs['pointer-events']).toBe('none');
  const paints: string[] = [];
  for (const group of [result.interaction, result.capabilities, result.highlight, replayPaint]) {
    const walk = (node: SvgNode) => {
      expect(node.attrs['data-component-id']).toBeUndefined();
      if (node.tag === 'text') expect(node.attrs.fill).toBeDefined();
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
  expect(drawn.filter((node) => node.attrs['pointer-events'] && node.attrs['pointer-events'] !== 'none')).toEqual(lines);
  expect(lines[0]!.attrs['pointer-events']).toBe('stroke');
  expect(titles(lines[0]!)).toEqual([label]);
  const a = scene.components.get('a')!;
  const b = scene.components.get('b')!;
  expect(lines[0]!.attrs).toMatchObject({ x1: String(round(a.center[0])), y1: String(round(a.center[1])), x2: String(round(b.center[0])), y2: String(round(b.center[1])) });

  const partial = overlay(scene, { selectedId: null, highlight: { componentIds: ['a', 'missing'], transfers: [{ from: 'a', to: 'missing', label }] } }).highlight;
  expect(shapes(partial).map((node) => node.tag)).toEqual(['rect']);
});

it('skips highlight rings and transfers touching a component on a filtered-out level', () => {
  const { scene } = fixture([
    component({ id: 'a', assetRef: 'primitive:pm', label: 'A', x: 100, y: 100, w: 80, h: 80 }),
    component({ id: 'hidden', assetRef: 'primitive:pm', label: 'Hidden', levelId: 'level-upper', x: 400, y: 300, w: 80, h: 80 }),
  ], [], ['level-main']);
  const result = overlay(scene, { selectedId: null, highlight: {
    componentIds: ['a', 'hidden', 'missing'],
    transfers: [
      { from: 'a', to: 'hidden', label: 'hidden target' },
      { from: 'hidden', to: 'a', label: 'hidden source' },
      { from: 'a', to: 'missing', label: 'absent target' },
    ],
  } }).highlight;
  expect(shapes(result).map((node) => node.tag)).toEqual(['rect']);
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

// --- Replay layer (15b): activity, materials, conflicts, illustrative ghosts ---

type StateMaterial = SceneState['materials'][number];
type StateEvidence = StateMaterial['locationEvidence'];

function stateMaterial(partial: Pick<StateMaterial, 'key' | 'kind' | 'id' | 'location' | 'locationEvidence' | 'identityEvidence'>): StateMaterial {
  return {
    lotId: undefined,
    alias: { moduleAlias: 'PM' },
    occurrenceId: `o:${partial.key}`,
    lastObservedAt: null,
    ...partial,
  };
}

function replayState(parts: Pick<SceneState, 'materials' | 'components'> & Partial<Pick<SceneState, 'markers'>>): SceneState {
  return {
    equipmentId: 'EQ-FX',
    at: '2026-10-17T09:00:00.000',
    appliedSeq: 4,
    binding: { layoutId: 'fixture', mappingHash: `sha256:${'a'.repeat(64)}` },
    markers: [],
    ...parts,
  };
}

function replayLayer(scene: Scene, state: SceneState, illustrative?: readonly IllustrativeGhost[]): SvgNode {
  return buildReplayLayer(scene, { state, illustrative }, 1 / scene.pxPerUnit);
}

/** Everything drawn for one component: its transformed mark group plus its scene-space material cluster. */
function markOf(node: SvgNode, comp: SceneComponent): SvgNode {
  const m = comp.matrix;
  const transform = `matrix(${[m.a, m.b, m.c, m.d, m.e, m.f].map((value) => formatNum(value)).join(' ')})`;
  const found = node.children.filter((child): child is SvgNode => typeof child !== 'string'
    && ((child.tag === 'g' && child.attrs.transform === transform) || child.attrs['data-material-cluster'] === comp.id));
  if (found.length === 0) throw new Error(`missing mark for ${comp.id}`);
  return { tag: 'g', attrs: {}, children: found.flatMap((child) => child.attrs['data-material-cluster'] ? [child] : child.children) };
}

const EVIDENCE_ORDER = ['observed', 'derived', 'unknown'] as const;
const EVIDENCE_KO = { observed: '관측', derived: '파생', unknown: '미확인' } as const;
const TOKEN_TITLE = (id: string, site: string | undefined, locationEvidence: StateEvidence, identityEvidence: StateEvidence) =>
  `${id} · ${site ?? '위치 Component 단위'} · 위치 ${EVIDENCE_KO[locationEvidence]} · 식별 ${EVIDENCE_KO[identityEvidence]}`;

it.each([...EVIDENCE_ORDER].flatMap((locationEvidence) => EVIDENCE_ORDER.map((identityEvidence) => ({ locationEvidence, identityEvidence }))))(
  '$locationEvidence location × $identityEvidence identity: token dash follows location, ? on either unknown',
  ({ locationEvidence, identityEvidence }) => {
    const { scene } = fixture([component({ id: 'a', assetRef: 'primitive:pm', label: 'A', x: 400, y: 300, w: 96, h: 100 })]);
    const state = replayState({
      materials: [stateMaterial({
        key: 'm:wafer:W1', kind: 'wafer', id: 'W1', location: { componentId: 'a' }, locationEvidence, identityEvidence,
      })],
      components: [{ componentId: 'a', activity: 'processing', activityEvidence: 'observed', occurrenceIds: [] }],
    });
    const drawn = shapes(markOf(replayLayer(scene, state), scene.components.get('a')!));
    const token = drawn.find((node) => node.tag === 'circle');
    if (!token) throw new Error('missing token');
    expect(token.attrs.fill).toBe('var(--eqv-material-fill, #f7e4cd)');
    expect(token.attrs.stroke).toBe('var(--eqv-material-stroke, #b45309)');
    expect(token.attrs['stroke-dasharray']).toBe(locationEvidence === 'observed' ? undefined : locationEvidence === 'derived' ? '6 4' : '2 3');
    expect(drawn.filter((node) => node.tag === 'text').map((node) => node.children.join('')))
      .toEqual(identityEvidence === 'unknown' || locationEvidence === 'unknown' ? ['W1', '?'] : ['W1']);
  },
);

it.each([
  { activity: 'processing', evidence: 'observed', title: '처리 중 · 관측', dash: undefined },
  { activity: 'processing', evidence: 'derived', title: '처리 중 · 파생', dash: '6 4' },
  { activity: 'post-processing', evidence: 'unknown', title: '후처리 · 미확인', dash: '2 3' },
  { activity: 'function', evidence: 'unknown', title: '기능 · 미확인', dash: '2 3' },
] as const)('activity ring dash follows $evidence activityEvidence only and has no ?', ({ activity, evidence, title, dash }) => {
  const { scene } = fixture([component({ id: 'a', assetRef: 'primitive:pm', label: 'A', x: 400, y: 300, w: 96, h: 100 })]);
  const state = replayState({
    materials: [stateMaterial({
      key: 'm:wafer:W1', kind: 'wafer', id: 'W1', location: { componentId: 'a' },
      locationEvidence: 'observed', identityEvidence: 'unknown',
    })],
    components: [{ componentId: 'a', activity, activityEvidence: evidence, occurrenceIds: [] }],
  });
  const drawn = shapes(markOf(replayLayer(scene, state), scene.components.get('a')!));
  const ring = drawn.find((node) => node.tag === 'rect' && node.attrs.stroke === 'var(--eqv-evidence, #374151)');
  if (!ring) throw new Error('missing activity ring');
  expect(ring.attrs['stroke-dasharray']).toBe(dash);
  expect(titles(ring)).toEqual([title]);
  expect(ring.children).toHaveLength(1);
  expect(drawn.filter((node) => node.tag === 'text').map((node) => node.children.join(''))).toEqual(['W1', '?']);
});

it.each([
  { evidence: 'observed', tint: '0.3', dash: undefined },
  { evidence: 'derived', tint: '0.15', dash: '6 4' },
  { evidence: 'unknown', tint: undefined, dash: '2 3' },
] as const)('$evidence activity: body tint opacity $tint, ring dash $dash', ({ evidence, tint, dash }) => {
  const { scene } = fixture([component({ id: 'a', assetRef: 'primitive:pm', label: 'A', x: 400, y: 300, w: 96, h: 100 })]);
  const state = replayState({
    materials: [],
    components: [{ componentId: 'a', activity: 'processing', activityEvidence: evidence, occurrenceIds: [] }],
  });
  const drawn = shapes(markOf(replayLayer(scene, state), scene.components.get('a')!));
  const tinted = drawn.filter((node) => node.attrs.fill === 'var(--eqv-active-fill, #d6e6fb)');
  expect(tinted.map((node) => node.attrs['fill-opacity'])).toEqual(tint ? [tint] : []);
  expect(tinted.every((node) => node.attrs.stroke === 'none' && titles(node).length === 0)).toBe(true);
  const ring = drawn.find((node) => node.attrs.stroke === 'var(--eqv-evidence, #374151)');
  expect(ring?.attrs['stroke-dasharray']).toBe(dash);
  expect(titles(ring ?? { tag: 'x', attrs: {}, children: [] })).toHaveLength(1);
});

it.each([
  { kind: 'wafer', tag: 'circle' },
  { kind: 'reticle', tag: 'circle' },
  { kind: 'carrier', tag: 'rect' },
  { kind: 'batch', tag: 'rect' },
  { kind: 'boat', tag: 'rect' },
] as const)('$kind token is a $tag', ({ kind, tag }) => {
  const { scene } = fixture([component({ id: 'a', assetRef: 'primitive:pm', label: 'A', x: 400, y: 300, w: 96, h: 100 })]);
  const state = replayState({
    materials: [stateMaterial({
      key: `m:${kind}:M1`, kind, id: 'M1', location: { componentId: 'a' }, locationEvidence: 'observed', identityEvidence: 'observed',
    })],
    components: [{ componentId: 'a', activity: 'no recorded activity', activityEvidence: 'unknown', occurrenceIds: [] }],
  });
  const drawn = shapes(markOf(replayLayer(scene, state), scene.components.get('a')!));
  expect(drawn.find((node) => node.attrs.fill === 'var(--eqv-material-fill, #f7e4cd)')?.tag).toBe(tag);
});

it('titles a material token with id, holding site and both evidence facets', () => {
  const { scene } = fixture([component({ id: 'a', assetRef: 'primitive:pm', label: 'A', x: 400, y: 300, w: 96, h: 100 })]);
  const state = replayState({
    materials: [
      stateMaterial({
        key: 'm:wafer:W1', kind: 'wafer', id: 'W1', location: { componentId: 'a', holdingSiteId: 'slot-2' },
        locationEvidence: 'derived', identityEvidence: 'unknown',
      }),
      stateMaterial({
        key: 'o:occ-9', kind: 'carrier', id: null, location: { componentId: 'a' },
        locationEvidence: 'observed', identityEvidence: 'observed',
      }),
    ],
    components: [{ componentId: 'a', activity: 'no recorded activity', activityEvidence: 'unknown', occurrenceIds: [] }],
  });
  const drawn = shapes(markOf(replayLayer(scene, state), scene.components.get('a')!));
  expect(titles({ tag: 'g', attrs: {}, children: drawn.filter((node) => node.attrs.fill === 'var(--eqv-material-fill, #f7e4cd)') }))
    .toEqual([TOKEN_TITLE('W1', 'slot-2', 'derived', 'unknown'), TOKEN_TITLE('익명', undefined, 'observed', 'observed')]);
});

it('draws nothing for no recorded activity, location null, a filtered-out level and an absent id', () => {
  const { scene } = fixture([
    component({ id: 'idle', assetRef: 'primitive:pm', label: 'Idle', x: 200, y: 300, w: 96, h: 100 }),
    component({ id: 'secret', assetRef: 'primitive:pm', label: 'Secret', x: 600, y: 300, w: 96, h: 100, levelId: 'level-upper' }),
  ], [], ['level-main']);
  const state = replayState({
    materials: [
      stateMaterial({ key: 'm:wafer:W1', kind: 'wafer', id: 'W1', location: null, locationEvidence: 'observed', identityEvidence: 'observed' }),
      stateMaterial({ key: 'm:wafer:W2', kind: 'wafer', id: 'W2', location: { componentId: 'secret' }, locationEvidence: 'observed', identityEvidence: 'observed' }),
      stateMaterial({ key: 'm:wafer:W3', kind: 'wafer', id: 'W3', location: { componentId: 'missing' }, locationEvidence: 'observed', identityEvidence: 'observed' }),
    ],
    components: [
      { componentId: 'idle', activity: 'no recorded activity', activityEvidence: 'unknown', occurrenceIds: [] },
      { componentId: 'secret', activity: 'processing', activityEvidence: 'observed', occurrenceIds: [] },
      { componentId: 'missing', activity: 'processing', activityEvidence: 'observed', occurrenceIds: [] },
    ],
  });
  const result = replayLayer(scene, state);
  expect(result.attrs['data-layer']).toBe('replay');
  expect(result.children).toEqual([]);
});

function sitedState(materials: [string, string | undefined][]): SceneState {
  return replayState({
    materials: materials.map(([id, site]) => stateMaterial({
      key: `m:wafer:${id}`, kind: 'wafer', id,
      location: { componentId: 'r', ...(site ? { holdingSiteId: site } : {}) },
      locationEvidence: 'observed', identityEvidence: 'observed',
    })),
    components: [{ componentId: 'r', activity: 'no recorded activity', activityEvidence: 'unknown', occurrenceIds: [] }],
  });
}

function discs(scene: Scene, state: SceneState): { id: string; cx: number; r: number }[] {
  return shapes(markOf(replayLayer(scene, state), scene.components.get('r')!))
    .filter((node) => node.tag === 'circle')
    .map((node) => ({ id: titles(node)[0]!.split(' · ')[0]!, cx: Number(node.attrs.cx), r: Number(node.attrs.r) }));
}

const siteScene = () => fixture([component({
  id: 'r', assetRef: 'primitive:robot-dual', label: 'R', role: 'robot', x: 400, y: 300, w: 96, h: 100, sites: ['blade-a', 'blade-b'],
})]).scene;

it('draws one disc per material in Holding Site order, with a wider gap between sites and component-level last', () => {
  const scene = siteScene();
  const found = discs(scene, sitedState([['W2', 'blade-b'], ['W1', 'blade-a'], ['W3', 'blade-a'], ['W4', undefined]]));
  expect(found.map((disc) => disc.id)).toEqual(['W1', 'W3', 'W2', 'W4']);
  const gaps = found.slice(1).map((disc, i) => disc.cx - found[i]!.cx);
  expect(gaps[0]!).toBeLessThan(gaps[1]!);
  expect(gaps[0]!).toBeLessThan(gaps[2]!);
});

it('puts a holding site the layout does not list in the component-level group, never a guessed site', () => {
  const found = discs(siteScene(), sitedState([['W1', 'blade-a'], ['W2', 'blade-z'], ['W3', undefined]]));
  expect(found.map((disc) => disc.id)).toEqual(['W1', 'W2', 'W3']);
  const gaps = found.slice(1).map((disc, i) => disc.cx - found[i]!.cx);
  expect(gaps[1]!).toBeLessThan(gaps[0]!);
});

it('paints every material cluster after every activity tint, whatever the component order', () => {
  const { scene } = fixture([
    component({ id: 'r', assetRef: 'primitive:robot-dual', label: 'R', role: 'robot', x: 400, y: 300, w: 96, h: 100, sites: ['blade-a', 'blade-b'] }),
    component({ id: 'b', assetRef: 'primitive:pm', label: 'B', x: 400, y: 300, w: 200, h: 200 }),
  ]);
  const state = replayState({
    materials: sitedState([['W1', 'blade-a'], ['W2', 'blade-b']]).materials,
    components: [
      { componentId: 'r', activity: 'no recorded activity', activityEvidence: 'unknown', occurrenceIds: [] },
      { componentId: 'b', activity: 'processing', activityEvidence: 'observed', occurrenceIds: [] },
    ],
  });
  const order = replayLayer(scene, state).children.map((child) => typeof child !== 'string' && child.attrs['data-material-cluster'] ? 'cluster' : 'other');
  expect(order.filter((kind) => kind === 'cluster')).toHaveLength(1);
  expect(order.indexOf('cluster')).toBe(order.length - 1);
  expect(order.length).toBeGreaterThan(1);
});

describe('material labels', () => {
  const ids = ['W1', 'W2', 'W3', 'W4', 'W5'];
  const overflow = () => {
    const scene = siteScene();
    return markOf(replayLayer(scene, sitedState(ids.map((id) => [id, 'blade-b'] as [string, string]))), scene.components.get('r')!);
  };

  it('labels up to four discs with their id, ellipsising a long one', () => {
    const scene = siteScene();
    const labelled = shapes(markOf(replayLayer(scene, sitedState([['W1', 'blade-a'], ['WAFER-0001234', 'blade-b']])), scene.components.get('r')!))
      .filter((node) => node.tag === 'text');
    expect(labelled.map((node) => node.children.join(''))).toEqual(['W1', 'WAFER-0…']);
    expect(labelled.every((node) => node.attrs.fill === 'var(--eqv-ink, #101828)')).toBe(true);
  });

  it('from five shows three discs plus a +N chip that names the hidden ids in its title', () => {
    const layer = overflow();
    const drawn = shapes(layer);
    expect(drawn.filter((node) => node.tag === 'circle').map((node) => titles(node)[0]!.split(' · ')[0])).toEqual(['W1', 'W2', 'W3']);
    expect(drawn.filter((node) => node.tag === 'text').map((node) => node.children.join(''))).toEqual(['+2']);
    expect(titles(layer).filter((t) => t.startsWith('+'))).toEqual(['+2 · W4, W5']);
  });

  it('leaves an anonymous material unlabelled', () => {
    const scene = siteScene();
    const anonymous = replayState({
      materials: [stateMaterial({
        key: 'o:1', kind: 'wafer', id: null, location: { componentId: 'r' }, locationEvidence: 'observed', identityEvidence: 'observed',
      })],
      components: [{ componentId: 'r', activity: 'no recorded activity', activityEvidence: 'unknown', occurrenceIds: [] }],
    });
    expect(shapes(markOf(replayLayer(scene, anonymous), scene.components.get('r')!)).filter((node) => node.tag === 'text')).toEqual([]);
  });
});

it('rings an occupancy conflict with its holding site and material keys', () => {
  const { scene } = fixture([component({ id: 'a', assetRef: 'primitive:pm', label: 'A', x: 400, y: 300, w: 96, h: 100 })]);
  const state = replayState({
    materials: [],
    components: [{ componentId: 'a', activity: 'no recorded activity', activityEvidence: 'unknown', occurrenceIds: [] }],
    markers: [{ kind: 'occupancy-conflict', componentId: 'a', holdingSiteId: 'slot-3', materialKeys: ['m:wafer:W1', 'm:wafer:W2'] }],
  });
  const drawn = shapes(markOf(replayLayer(scene, state), scene.components.get('a')!));
  const conflict = drawn.filter((node) => node.tag === 'rect');
  expect(conflict).toHaveLength(1);
  expect(conflict[0]!.attrs).toMatchObject({ stroke: 'var(--eqv-highlight, #b42318)', 'stroke-dasharray': '2 3' });
  expect(titles(conflict[0]!)).toEqual(['점유 충돌: slot-3 — m:wafer:W1, m:wafer:W2']);
});

function ghostFixture(): Scene {
  const { scene } = fixture([
    component({ id: 'a', assetRef: 'primitive:pm', label: 'A', x: 100, y: 100, w: 96, h: 100 }),
    component({ id: 'b', assetRef: 'primitive:pm', label: 'B', x: 500, y: 380, w: 96, h: 100 }),
    component({ id: 'secret', assetRef: 'primitive:pm', label: 'Secret', x: 700, y: 80, w: 80, h: 80, levelId: 'level-upper' }),
  ], [], ['level-main']);
  return scene;
}

it.each([
  { name: 'absent', illustrative: undefined },
  { name: 'empty', illustrative: [] },
] as const)('draws no ghost when illustrative is $name', ({ illustrative }) => {
  const result = replayLayer(ghostFixture(), replayState({ materials: [], components: [] }), illustrative);
  expect(shapes(result).filter((node) => node.attrs['data-illustrative'])).toEqual([]);
  expect(shapes(result).filter((node) => node.tag === 'text')).toEqual([]);
});

it('draws hollow dashed ghost circles between centres, clamped, skipping hidden ends, keeping the real token', () => {
  const scene = ghostFixture();
  const a = scene.components.get('a')!;
  const b = scene.components.get('b')!;
  const state = replayState({
    materials: [stateMaterial({
      key: 'm:wafer:W1', kind: 'wafer', id: 'W1', location: { componentId: 'a' },
      locationEvidence: 'observed', identityEvidence: 'observed',
    })],
    components: [{ componentId: 'a', activity: 'no recorded activity', activityEvidence: 'unknown', occurrenceIds: [] }],
  });
  const result = replayLayer(scene, state, [
    { materialKey: 'm:wafer:W1', label: 'W1 → B', fromComponentId: 'a', toComponentId: 'b', fraction: 0.5 },
    { materialKey: 'm:wafer:W2', label: 'clamped', fromComponentId: 'a', toComponentId: 'b', fraction: 2 },
    { materialKey: 'm:wafer:W3', label: 'hidden end', fromComponentId: 'a', toComponentId: 'secret', fraction: 0.5 },
  ]);
  const ghosts = shapes(result).filter((node) => node.attrs['data-illustrative'] === 'true');
  expect(ghosts).toHaveLength(2);
  expect(ghosts[0]!.attrs).toMatchObject({
    cx: String(round((a.center[0] + b.center[0]) / 2)),
    cy: String(round((a.center[1] + b.center[1]) / 2)),
    fill: 'none',
    stroke: 'var(--eqv-material-stroke, #b45309)',
    'stroke-dasharray': '6 4',
  });
  expect(ghosts[1]!.attrs).toMatchObject({ cx: String(round(b.center[0])), cy: String(round(b.center[1])) });
  expect(titles(ghosts[0]!)).toEqual(['W1 → B · 예시 이동 (관측 아님)']);
  expect(shapes(result).filter((node) => node.tag === 'text').map((node) => node.children.join('')).filter((text) => text === '예시 이동')).toHaveLength(2);
  expect(ghosts[0]!.attrs.r).toBe(String(round(4 / scene.pxPerUnit)));
  const ghostLabel = shapes(result).find((node) => node.tag === 'text' && node.children.join('') === '예시 이동');
  expect(ghostLabel?.attrs['font-size']).toBe(String(round(8 / scene.pxPerUnit)));
  expect(ghostLabel?.attrs.x).toBe(String(round(a.center[0] + (b.center[0] - a.center[0]) / 2 + 6 / scene.pxPerUnit)));
  expect(shapes(result).some((node) => node.tag === 'line' || node.tag === 'path')).toBe(false);
  const token = shapes(markOf(result, a)).find((node) => node.tag === 'circle');
  expect(titles(token ?? { tag: 'x', attrs: {}, children: [] })).toEqual([TOKEN_TITLE('W1', undefined, 'observed', 'observed')]);
});

it('scales a token to about 12 screen px under a parent scaled by 2', () => {
  const { scene } = fixture([
    component({ id: 'frame', assetRef: 'primitive:housing', label: 'Frame', x: 400, y: 300, scale: 2, w: 700, h: 400, role: 'housing' }),
    component({ id: 'mod', assetRef: 'primitive:pm', label: 'PM', parentId: 'frame', x: 0, y: 40, w: 70, h: 76 }),
  ]);
  const comp = scene.components.get('mod')!;
  expect(comp.S).toBe(2);
  const state = replayState({
    materials: [stateMaterial({
      key: 'm:carrier:C1', kind: 'carrier', id: 'C1', location: { componentId: 'mod' },
      locationEvidence: 'observed', identityEvidence: 'observed',
    })],
    components: [{ componentId: 'mod', activity: 'no recorded activity', activityEvidence: 'unknown', occurrenceIds: [] }],
  });
  const token = shapes(markOf(replayLayer(scene, state), comp)).find((node) => node.tag === 'rect');
  if (!token) throw new Error('missing token');
  expect(Number(token.attrs.width) / (1 / scene.pxPerUnit)).toBeCloseTo(12, 5);
});

it('draws a material cluster upright in scene space on a component rotated 150 degrees, on the bbox bottom side', () => {
  const { scene } = fixture([component({ id: 'a', assetRef: 'primitive:pm', label: 'A', x: 400, y: 300, w: 96, h: 100 })]);
  const comp = scene.components.get('a')!;
  const rotated = { ...comp, matrix: { ...comp.matrix, a: -0.866, b: 0.5, c: -0.5, d: -0.866 } };
  const rotatedScene: Scene = { ...scene, components: new Map([['a', rotated]]) };
  const state = replayState({
    materials: [stateMaterial({
      key: 'm:wafer:W1', kind: 'wafer', id: 'W1', location: { componentId: 'a' }, locationEvidence: 'observed', identityEvidence: 'observed',
    })],
    components: [{ componentId: 'a', activity: 'processing', activityEvidence: 'observed', occurrenceIds: [] }],
  });
  const result = replayLayer(rotatedScene, state);
  const rotatedGroups = result.children.filter((child): child is SvgNode => typeof child !== 'string' && child.attrs.transform != null);
  const cluster = result.children.find((child): child is SvgNode => typeof child !== 'string' && child.attrs['data-material-cluster'] === 'a');
  if (!cluster) throw new Error('missing cluster');
  expect(rotatedGroups).toHaveLength(1);
  expect(shapes(rotatedGroups[0]!).some((node) => node.tag === 'text' || node.attrs.fill === 'var(--eqv-material-fill, #f7e4cd)')).toBe(false);
  expect(cluster.attrs.transform).toBeUndefined();
  const inside = shapes(cluster);
  expect(inside.filter((node) => node.tag === 'text').map((node) => node.children.join(''))).toEqual(['W1']);
  for (const node of inside.filter((n) => n.tag === 'circle' || n.tag === 'text')) {
    expect(node.attrs.transform).toBeUndefined();
    expect(Number(node.attrs.cy ?? node.attrs.y)).toBeGreaterThan(comp.center[1]);
    expect(Number(node.attrs.cy ?? node.attrs.y)).toBeLessThanOrEqual(comp.bbox.y1);
  }
});

it.each([
  { size: 'large', shrink: 200, below: false },
  { size: 'small', shrink: 20, below: true },
])('places the material row $size Component: outside below bbox = $below', ({ shrink, below }) => {
  const { scene } = fixture([component({ id: 'a', assetRef: 'primitive:pm', label: 'A', x: 400, y: 300, w: 96, h: 100 })]);
  const comp = scene.components.get('a')!;
  const kk = (comp.bbox.y1 - comp.bbox.y0) / shrink;
  const state = replayState({
    components: [{ componentId: 'a', activity: 'processing', activityEvidence: 'observed', occurrenceIds: [] }],
    materials: [stateMaterial({ key: 'm:wafer:W1', kind: 'wafer', id: 'W1', location: { componentId: 'a' }, locationEvidence: 'observed', identityEvidence: 'observed' })],
  });
  const token = shapes(markOf(buildReplayLayer(scene, { state }, kk), comp)).find((n) => n.tag === 'circle' && n.attrs.fill === 'var(--eqv-material-fill, #f7e4cd)');
  if (!token) throw new Error('missing token');
  const cy = Number(token.attrs.cy);
  const r = Number(token.attrs.r);
  if (below) expect(cy - r).toBeGreaterThanOrEqual(comp.bbox.y1);
  else expect(cy + r).toBeLessThanOrEqual(comp.bbox.y1);
});
