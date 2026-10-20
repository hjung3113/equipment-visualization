import { canonicalJson, type Component, type LayoutDocument } from '@eqv/core';

export type SnapOptions = { grid: number; rotationStep: number };
/** Layout units (`abstract` or `mm` alike); the document unit is never changed. */
export const DEFAULT_SNAP: SnapOptions = { grid: 10, rotationStep: 15 };

export interface LayoutEditState {
  present: LayoutDocument;
  /** Last saved document. */
  baseline: LayoutDocument;
  past: LayoutDocument[];
  future: LayoutDocument[];
  /** An uncommitted drag preview: `present` is `origin` moved by the total drag delta. */
  drag: { componentId: string; origin: LayoutDocument } | null;
}

export type TransformPatch = { x?: number; y?: number; rotation?: number };

export function createLayoutEdit(layout: LayoutDocument): LayoutEditState {
  return { present: layout, baseline: layout, past: [], future: [], drag: null };
}

const same = (a: LayoutDocument, b: LayoutDocument) => a === b || canonicalJson(a) === canonicalJson(b);
export const isDirty = (state: LayoutEditState): boolean => !same(state.present, state.baseline);
export const canUndo = (state: LayoutEditState): boolean => state.past.length > 0;
export const canRedo = (state: LayoutEditState): boolean => state.future.length > 0;
export const markSaved = (state: LayoutEditState): LayoutEditState => ({ ...state, baseline: state.present });

export function undo(state: LayoutEditState): LayoutEditState {
  const previous = state.past.at(-1);
  return previous && !state.drag
    ? { ...state, present: previous, past: state.past.slice(0, -1), future: [state.present, ...state.future] } : state;
}
export function redo(state: LayoutEditState): LayoutEditState {
  const next = state.future[0];
  return next && !state.drag
    ? { ...state, present: next, past: [...state.past, state.present], future: state.future.slice(1) } : state;
}

type Matrix = { a: number; b: number; c: number; d: number };
const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1 };
const linear = (t: Component['transform']): Matrix => {
  const rad = (t.rotation * Math.PI) / 180;
  const cos = Math.cos(rad) * t.scale;
  const sin = Math.sin(rad) * t.scale;
  return { a: cos, b: sin, c: -sin, d: cos };
};
const multiply = (m: Matrix, n: Matrix): Matrix => ({
  a: m.a * n.a + m.c * n.b, b: m.b * n.a + m.d * n.b,
  c: m.a * n.c + m.c * n.d, d: m.b * n.c + m.d * n.d,
});

/** Linear part (rotation·scale, no translation) of the world transform of the ancestors of a Component, root first. */
function parentLinear(layout: LayoutDocument, component: Component): Matrix {
  const byId = new Map(layout.components.map((c) => [c.id, c]));
  const chain: Component[] = [];
  const seen = new Set<string>([component.id]);
  for (let id = component.parentId; id !== undefined && !seen.has(id);) {
    const parent = byId.get(id);
    if (!parent) break;
    seen.add(id);
    chain.unshift(parent);
    id = parent.parentId;
  }
  return chain.reduce((acc, c) => multiply(acc, linear(c.transform)), IDENTITY);
}

/** Converts a delta in layout root coordinates to the Component's parent-local frame. */
export function rootDeltaToLocal(layout: LayoutDocument, componentId: string, dx: number, dy: number): { dx: number; dy: number } {
  const component = layout.components.find((c) => c.id === componentId);
  if (!component) return { dx, dy };
  const { a, b, c, d } = parentLinear(layout, component);
  const det = a * d - b * c;
  if (!Number.isFinite(det) || det === 0) return { dx, dy };
  return { dx: (d * dx - c * dy) / det, dy: (-b * dx + a * dy) / det };
}

const round3 = (v: number) => Math.round(v * 1000) / 1000 || 0;
const normalizeRotation = (degrees: number) => {
  const r = ((degrees % 360) + 360) % 360;
  return r > 180 ? r - 360 : r;
};
/** Rounds first so a value rounding onto -180 (or 360) lands back in (-180, 180]. */
const cleanRotation = (degrees: number) => round3(normalizeRotation(round3(degrees)));
const snapTo = (v: number, step: number) => step > 0 ? Math.round(v / step) * step : v;

/** Returns the same layout object when the Component is unknown or the transform does not change. */
function withTransform(layout: LayoutDocument, componentId: string, next: (t: Component['transform']) => TransformPatch): LayoutDocument {
  const index = layout.components.findIndex((c) => c.id === componentId);
  if (index < 0) return layout;
  const component = layout.components[index]!;
  const patch = next(component.transform);
  const t = component.transform;
  const written: TransformPatch = {};
  if (patch.x !== undefined) written.x = round3(patch.x);
  if (patch.y !== undefined) written.y = round3(patch.y);
  if (patch.rotation !== undefined) written.rotation = cleanRotation(patch.rotation);
  const fields = Object.entries(written) as [keyof TransformPatch, number][];
  if (!fields.every(([, v]) => Number.isFinite(v)) || fields.every(([k, v]) => v === t[k])) return layout;
  const provenanceTransform = component.provenance.transform;
  const updated: Component = {
    ...component,
    transform: { ...t, ...written },
    ...(provenanceTransform?.certainty === 'verified'
      ? { provenance: { ...component.provenance, transform: { ...provenanceTransform, certainty: 'assumed' as const } } } : {}),
  };
  return { ...layout, components: layout.components.map((c, i) => i === index ? updated : c) };
}

const moveLayout = (layout: LayoutDocument, componentId: string, dx: number, dy: number, snap: SnapOptions | null) => {
  const local = rootDeltaToLocal(layout, componentId, dx, dy);
  const axis = (value: number, delta: number) => snap ? snapTo(value + delta, snap.grid) : value + delta;
  // An axis with no delta is not written, so its stored value stays byte-for-byte.
  return withTransform(layout, componentId, (t) => ({
    ...(local.dx !== 0 ? { x: axis(t.x, local.dx) } : {}),
    ...(local.dy !== 0 ? { y: axis(t.y, local.dy) } : {}),
  }));
};

function commit(state: LayoutEditState, next: LayoutDocument): LayoutEditState {
  return next === state.present || same(next, state.present)
    ? state : { ...state, present: next, past: [...state.past, state.present], future: [] };
}

export function moveBy(state: LayoutEditState, componentId: string, dx: number, dy: number, snap: SnapOptions | null): LayoutEditState {
  return state.drag ? state : commit(state, moveLayout(state.present, componentId, dx, dy, snap));
}

export function rotateBy(state: LayoutEditState, componentId: string, degrees: number, snap: SnapOptions | null): LayoutEditState {
  if (state.drag) return state;
  return commit(state, withTransform(state.present, componentId, (t) => ({
    rotation: snap ? snapTo(t.rotation + degrees, snap.rotationStep) : t.rotation + degrees,
  })));
}

/** Sets the given fields exactly (never snapped); a non-finite value leaves the state unchanged. */
export function setTransform(state: LayoutEditState, componentId: string, patch: TransformPatch): LayoutEditState {
  if (state.drag || Object.values(patch).some((v) => v !== undefined && !Number.isFinite(v))) return state;
  return commit(state, withTransform(state.present, componentId, () => patch));
}

/** Previews the total drag delta from the drag origin; history is untouched until `endDrag`. */
export function dragTo(state: LayoutEditState, componentId: string, dx: number, dy: number, snap: SnapOptions | null): LayoutEditState {
  if (!state.present.components.some((c) => c.id === componentId)) return state;
  const origin = state.drag?.componentId === componentId ? state.drag.origin : state.present;
  return { ...state, present: moveLayout(origin, componentId, dx, dy, snap), drag: { componentId, origin } };
}

export function endDrag(state: LayoutEditState): LayoutEditState {
  if (!state.drag) return state;
  const { origin } = state.drag;
  return same(state.present, origin)
    ? { ...state, present: origin, drag: null }
    : { ...state, past: [...state.past, origin], future: [], drag: null };
}

export function cancelDrag(state: LayoutEditState): LayoutEditState {
  return state.drag ? { ...state, present: state.drag.origin, drag: null } : state;
}
