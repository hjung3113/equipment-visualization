import { capabilitySegment } from './capability.js';
import { isArm, robotR, shapeLocal, type Mat } from './geom.js';
import type { Scene, SceneComponent } from './scene.js';
import { el, formatNum, withPointerEventsNone, type SvgNode } from './svg.js';

export interface OverlayState {
  selectedId: string | null;
  hoveredId: string | null;
  /** Pass the focused id only while keyboard modality is showing the focus rings. */
  focusedId: string | null;
  /** Draw every visible capability pair. Ignored while a selection is visible. */
  showAllCapabilities: boolean;
}

const RAD: Record<SceneComponent['cls'], number> = { process: 8, holding: 8, robot: 8, structure: 12 };

const PAINT = {
  selection: 'var(--eqv-selection, #1428a0)',
  selectionFill: 'var(--eqv-selection-fill, #e4e8f6)',
  board: 'var(--eqv-board, #fbfdff)',
} as const;

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
function ring(comp: SceneComponent, dPx: number, stroke: string, strokePx: number, k: number): SvgNode {
  const kLocal = k / comp.S;
  const d = dPx * kLocal;
  const attrs: Record<string, string> = {
    fill: 'none',
    stroke,
    'stroke-width': formatNum(strokePx),
    'vector-effect': 'non-scaling-stroke',
  };
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

/** Hover, selection and focus shapes, plus the capability segments for this selection. No React and no DOM. */
export function buildOverlay(scene: Scene, state: OverlayState, k: number): { interaction: SvgNode; capabilities: SvgNode } {
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
  };
}
