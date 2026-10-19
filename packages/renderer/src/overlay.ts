import type { SceneState } from '@eqv/core';
import { capabilitySegment } from './capability.js';
import { isArm, robotR, shapeLocal, type Mat } from './geom.js';
import type { Scene, SceneComponent } from './scene.js';
import { estimateTextWidth } from './text.js';
import { el, formatNum, withPointerEventsNone, type SvgNode } from './svg.js';

export interface OverlayState {
  selectedId: string | null;
  hoveredId: string | null;
  /** Pass the focused id only while keyboard modality is showing the focus rings. */
  focusedId: string | null;
  /** Draw every visible capability pair. Ignored while a selection is visible. */
  showAllCapabilities: boolean;
  /** Components to ring and observed transfers to mark as dashed lines. Display only: it is not a path or a capability. */
  highlight?: Highlight | null;
}

export interface Highlight {
  componentIds: readonly string[];
  transfers?: readonly { from: string; to: string; label: string }[];
}

/** One example-motion ghost, already computed by the host. The renderer only draws it; it is never log evidence. */
export interface IllustrativeGhost {
  materialKey: string;
  label: string;
  fromComponentId: string;
  toComponentId: string;
  fraction: number;
}

/** Cursor-time scene state plus illustrative ghosts. The renderer never runs the reducer, decides evidence or computes motion. */
export interface ReplayOverlay {
  state: SceneState;
  illustrative?: readonly IllustrativeGhost[];
}

const DASH = '6 4';
const RAD: Record<SceneComponent['cls'], number> = { process: 8, holding: 8, robot: 8, structure: 12 };

const PAINT = {
  selection: 'var(--eqv-selection, #1428a0)',
  selectionFill: 'var(--eqv-selection-fill, #e4e8f6)',
  board: 'var(--eqv-board, #fbfdff)',
  highlight: 'var(--eqv-highlight, #b42318)',
  evidence: 'var(--eqv-evidence, #374151)',
  materialFill: 'var(--eqv-material-fill, #f7e4cd)',
  materialStroke: 'var(--eqv-material-stroke, #b45309)',
  ink: 'var(--eqv-ink, #101828)',
} as const;

type StateMaterial = SceneState['materials'][number];
type StateEvidence = StateMaterial['locationEvidence'];
type StateActivity = Exclude<SceneState['components'][number]['activity'], 'no recorded activity'>;

const DASH_UNKNOWN = '2 3';
const EVIDENCE_DASH: Record<StateEvidence, string | undefined> = { observed: undefined, derived: DASH, unknown: DASH_UNKNOWN };
const EVIDENCE_KO: Record<StateEvidence, string> = { observed: '관측', derived: '파생', unknown: '미확인' };
const ACTIVITY_KO: Record<StateActivity, string> = { processing: '처리 중', 'post-processing': '후처리', function: '기능' };
const TOKEN_PX = 8;
const TOKEN_GAP_PX = 3;
const TOKENS_PER_ROW = 6;

function matrixAttr(matrix: Mat): string {
  return `matrix(${formatNum(matrix.a)} ${formatNum(matrix.b)} ${formatNum(matrix.c)} ${formatNum(matrix.d)} ${formatNum(matrix.e)} ${formatNum(matrix.f)})`;
}

function visible(scene: Scene, id: string | null): SceneComponent | null {
  if (!id) return null;
  const row = scene.components.get(id);
  if (!row || row.hidden) return null;
  return row;
}

/** Stroke-only outline in the component's local frame. `dPx` and `strokePx` are screen pixels. */
function ring(comp: SceneComponent, dPx: number, stroke: string, strokePx: number, k: number, dash?: string): SvgNode {
  const kLocal = k / comp.S;
  const d = dPx * kLocal;
  const attrs: Record<string, string> = {
    fill: 'none',
    stroke,
    'stroke-width': formatNum(strokePx),
    'vector-effect': 'non-scaling-stroke',
  };
  if (dash) attrs['stroke-dasharray'] = dash;
  if (isArm(comp.asset)) {
    return el('circle', { ...attrs, cx: '0', cy: '0', r: formatNum(robotR(comp.w, comp.h) + d) });
  }
  if (comp.asset === 'tm') {
    const points = shapeLocal('tm', comp.w + 2 * d, comp.h + 2.3 * d);
    return el('polygon', {
      ...attrs,
      points: points.map(([x, y]) => `${formatNum(x)},${formatNum(y)}`).join(' '),
      'stroke-linejoin': 'round',
    });
  }
  const rx = Math.min(RAD[comp.cls] * kLocal, Math.min(comp.w, comp.h) * 0.2) + d;
  return el('rect', {
    ...attrs,
    x: formatNum(-comp.w / 2 - d),
    y: formatNum(-comp.h / 2 - d),
    width: formatNum(comp.w + 2 * d),
    height: formatNum(comp.h + 2 * d),
    rx: formatNum(rx),
  });
}

function mark(comp: SceneComponent, shapes: SvgNode[]): SvgNode {
  return el('g', { transform: matrixAttr(comp.matrix) }, shapes);
}

function titled(node: SvgNode, text: string): SvgNode {
  return { ...node, children: [el('title', {}, [text])] };
}

function capabilityNodes(scene: Scene, selectedId: string | null, showAll: boolean, k: number): SvgNode[] {
  const selected = visible(scene, selectedId);
  const nodes: SvgNode[] = [];
  const seen = new Set<string>();
  const add = (handlerId: string, targetId: string) => {
    if (handlerId === targetId) return;
    const key = `${handlerId}\0${targetId}`;
    if (seen.has(key)) return;
    seen.add(key);
    const handler = visible(scene, handlerId);
    const target = visible(scene, targetId);
    if (!handler || !target) return;
    const segment = capabilitySegment(handler, target, k);
    if (segment) nodes.push(segment);
  };
  if (selected) {
    const asHandler = scene.capabilities.some((edge) => edge.handlerComponentId === selected.id);
    if (asHandler) {
      for (const edge of scene.capabilities) {
        if (edge.handlerComponentId !== selected.id) continue;
        add(edge.handlerComponentId, edge.aComponentId);
        add(edge.handlerComponentId, edge.bComponentId);
      }
    } else {
      for (const edge of scene.capabilities) {
        if (edge.aComponentId !== selected.id && edge.bComponentId !== selected.id) continue;
        const partner = edge.aComponentId === selected.id ? edge.bComponentId : edge.aComponentId;
        add(edge.handlerComponentId, selected.id);
        add(edge.handlerComponentId, partner);
      }
    }
  } else if (showAll) {
    for (const edge of scene.capabilities) {
      add(edge.handlerComponentId, edge.aComponentId);
      add(edge.handlerComponentId, edge.bComponentId);
    }
  }
  return nodes;
}

function highlightNodes(scene: Scene, highlight: Highlight | null | undefined, k: number): SvgNode[] {
  if (!highlight) return [];
  const nodes: SvgNode[] = [];
  const seen = new Set<string>();
  for (const id of highlight.componentIds) {
    const comp = visible(scene, id);
    if (!comp || seen.has(id)) continue;
    seen.add(id);
    nodes.push(mark(comp, [ring(comp, 4, PAINT.highlight, 2, k, DASH)]));
  }
  for (const transfer of highlight.transfers ?? []) {
    const from = visible(scene, transfer.from);
    const to = visible(scene, transfer.to);
    if (!from || !to) continue;
    nodes.push(el('line', {
      x1: formatNum(from.center[0]), y1: formatNum(from.center[1]),
      x2: formatNum(to.center[0]), y2: formatNum(to.center[1]),
      stroke: PAINT.highlight,
      'pointer-events': 'stroke',
      'stroke-width': formatNum(2),
      'stroke-dasharray': DASH,
      'vector-effect': 'non-scaling-stroke',
    }, [el('title', {}, [transfer.label])]));
  }
  return nodes;
}

/** Hover, selection and focus shapes, the capability segments for this selection and the highlight. No React and no DOM. */
export function buildOverlay(scene: Scene, state: OverlayState, k: number): { interaction: SvgNode; capabilities: SvgNode; highlight: SvgNode } {
  const shapes: SvgNode[] = [];
  const hovered = visible(scene, state.hoveredId);
  const selected = visible(scene, state.selectedId);
  const focused = visible(scene, state.focusedId);
  if (hovered) shapes.push(mark(hovered, [ring(hovered, 0, hovered.bodyStroke, 2.6, k)]));
  if (selected) {
    shapes.push(mark(selected, [
      ring(selected, 1, PAINT.selectionFill, 2, k),
      ring(selected, 3, PAINT.selection, 2, k),
    ]));
  }
  if (focused) {
    shapes.push(mark(focused, [
      ring(focused, 3, PAINT.board, 2, k),
      ring(focused, 5, PAINT.selection, 2, k),
    ]));
  }
  return {
    interaction: withPointerEventsNone(el('g', { 'data-layer': 'interaction' }, shapes)),
    capabilities: withPointerEventsNone(el('g', { 'data-layer': 'capabilities' }, capabilityNodes(scene, state.selectedId, state.showAllCapabilities, k))),
    highlight: withPointerEventsNone(el('g', { 'data-layer': 'highlight' }, highlightNodes(scene, state.highlight, k))),
  };
}

function materialToken(material: StateMaterial, cx: number, cy: number, kLocal: number): SvgNode[] {
  const attrs: Record<string, string> = {
    fill: PAINT.materialFill,
    stroke: PAINT.materialStroke,
    'stroke-width': formatNum(1),
    'vector-effect': 'non-scaling-stroke',
  };
  const dash = EVIDENCE_DASH[material.locationEvidence];
  if (dash) attrs['stroke-dasharray'] = dash;
  const title = el('title', {}, [
    `${material.id ?? '익명'} · ${material.location?.holdingSiteId ?? '위치 Component 단위'} · 위치 ${EVIDENCE_KO[material.locationEvidence]} · 식별 ${EVIDENCE_KO[material.identityEvidence]}`,
  ]);
  const half = TOKEN_PX / 2 * kLocal;
  const token = material.kind === 'wafer' || material.kind === 'reticle'
    ? el('circle', { ...attrs, cx: formatNum(cx), cy: formatNum(cy), r: formatNum(half) }, [title])
    : el('rect', {
      ...attrs,
      x: formatNum(cx - half),
      y: formatNum(cy - half),
      width: formatNum(TOKEN_PX * kLocal),
      height: formatNum(TOKEN_PX * kLocal),
      rx: formatNum(2 * kLocal),
    }, [title]);
  if (material.identityEvidence !== 'unknown' && material.locationEvidence !== 'unknown') return [token];
  return [token, el('text', {
    x: formatNum(cx),
    y: formatNum(cy + 0.35 * TOKEN_PX * kLocal),
    'text-anchor': 'middle',
    'font-family': 'inherit',
    'font-size': formatNum(TOKEN_PX * kLocal),
    fill: PAINT.evidence,
  }, ['?'])];
}

/** One row of tokens on the component's bottom edge, centred; screen-pixel sizes through `kLocal`. */
function materialTokens(comp: SceneComponent, materials: readonly StateMaterial[], k: number): SvgNode[] {
  const kLocal = k / comp.S;
  const shown = materials.slice(0, TOKENS_PER_ROW);
  const overflow = materials.length - shown.length;
  const plus = overflow > 0 ? `+${overflow}` : null;
  const rowPx = shown.length * TOKEN_PX + (shown.length - 1) * TOKEN_GAP_PX
    + (plus ? TOKEN_GAP_PX + estimateTextWidth(plus, TOKEN_PX, false) : 0);
  const cy = comp.h / 2 - TOKEN_PX / 2 * kLocal;
  const nodes: SvgNode[] = [];
  let xPx = -rowPx / 2 + TOKEN_PX / 2;
  for (const material of shown) {
    nodes.push(...materialToken(material, xPx * kLocal, cy, kLocal));
    xPx += TOKEN_PX + TOKEN_GAP_PX;
  }
  if (plus) {
    nodes.push(el('text', {
      x: formatNum((xPx - TOKEN_PX / 2) * kLocal),
      y: formatNum(cy + 0.35 * TOKEN_PX * kLocal),
      'font-family': 'inherit',
      'font-size': formatNum(TOKEN_PX * kLocal),
      fill: PAINT.ink,
    }, [plus]));
  }
  return nodes;
}

function ghostNodes(scene: Scene, ghosts: readonly IllustrativeGhost[], k: number): SvgNode[] {
  const nodes: SvgNode[] = [];
  for (const ghost of ghosts) {
    const from = visible(scene, ghost.fromComponentId);
    const to = visible(scene, ghost.toComponentId);
    if (!from || !to) continue;
    const fraction = Math.min(1, Math.max(0, ghost.fraction));
    const cx = from.center[0] + fraction * (to.center[0] - from.center[0]);
    const cy = from.center[1] + fraction * (to.center[1] - from.center[1]);
    const r = TOKEN_PX / 2 * k;
    nodes.push(el('circle', {
      'data-illustrative': 'true',
      cx: formatNum(cx),
      cy: formatNum(cy),
      r: formatNum(r),
      fill: 'none',
      stroke: PAINT.materialStroke,
      'stroke-width': formatNum(1),
      'vector-effect': 'non-scaling-stroke',
      'stroke-dasharray': DASH,
    }, [el('title', {}, [`${ghost.label} · 예시 이동 (관측 아님)`])]));
    nodes.push(el('text', {
      x: formatNum(cx + r + 2 * k),
      y: formatNum(cy + 0.35 * TOKEN_PX * k),
      'font-family': 'inherit',
      'font-size': formatNum(TOKEN_PX * k),
      fill: PAINT.materialStroke,
    }, ['예시 이동']));
  }
  return nodes;
}

/**
 * Cursor-time replay layer: activity rings, material tokens, occupancy-conflict rings and illustrative
 * ghosts. The state and the ghosts are given (D4); nothing here pairs occurrences, decides evidence
 * or computes motion. `k = 1 / scene.pxPerUnit`, the same `k` as `buildOverlay`.
 */
export function buildReplayLayer(scene: Scene, replay: ReplayOverlay, k: number): SvgNode {
  const nodes: SvgNode[] = [];
  const byComponent = new Map<string, StateMaterial[]>();
  for (const material of replay.state.materials) {
    if (!material.location) continue;
    const row = byComponent.get(material.location.componentId);
    if (row) row.push(material);
    else byComponent.set(material.location.componentId, [material]);
  }
  for (const state of replay.state.components) {
    const comp = visible(scene, state.componentId);
    if (!comp) continue;
    const parts: SvgNode[] = [];
    if (state.activity !== 'no recorded activity') {
      parts.push(titled(
        ring(comp, 6, PAINT.evidence, 2, k, EVIDENCE_DASH[state.activityEvidence]),
        `${ACTIVITY_KO[state.activity]} · ${EVIDENCE_KO[state.activityEvidence]}`,
      ));
    }
    const located = byComponent.get(state.componentId);
    if (located) parts.push(...materialTokens(comp, located, k));
    if (parts.length > 0) nodes.push(mark(comp, parts));
  }
  for (const marker of replay.state.markers) {
    if (marker.kind !== 'occupancy-conflict') continue;
    const comp = visible(scene, marker.componentId);
    if (!comp) continue;
    nodes.push(mark(comp, [titled(
      ring(comp, 9, PAINT.highlight, 2, k, DASH_UNKNOWN),
      `점유 충돌: ${marker.holdingSiteId} — ${marker.materialKeys.join(', ')}`,
    )]));
  }
  nodes.push(...ghostNodes(scene, replay.illustrative ?? [], k));
  return withPointerEventsNone(el('g', { 'data-layer': 'replay', 'aria-hidden': 'true' }, nodes));
}
