import { canonicalJson, componentWorldCenter, portPositionToward, type Component, type LayoutDocument, type MaterialKind, type PhysicalInterfaceEdge, type TransferCapabilityEdge } from '@eqv/core';

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

export function roleForPrimitive(name: string): string {
  if (name === 'loadlock') return 'll';
  return ['robot-single', 'robot-dual', 'robot-multi', 'handler'].includes(name) ? 'robot' : name;
}

export interface AddComponentSpec {
  asset: string;
  size: { width: number; height: number };
  levelId: string;
  x: number;
  y: number;
}

/** Adds geometry only; no Port, Holding Site or graph is inferred. */
export function addComponent(state: LayoutEditState, spec: AddComponentSpec, snap: SnapOptions | null): { state: LayoutEditState; componentId: string | null } {
  if (state.drag || !state.present.levels.some((level) => level.id === spec.levelId)) return { state, componentId: null };
  const role = roleForPrimitive(spec.asset);
  const prefix = `${role}-`;
  let highest = 0n;
  for (const doc of [state.present, state.baseline, ...state.past, ...state.future]) {
    for (const component of doc.components) {
      if (!component.id.startsWith(prefix)) continue;
      const suffix = component.id.slice(prefix.length);
      if (/^\d+$/.test(suffix)) {
        const value = BigInt(suffix);
        if (value > highest) highest = value;
      }
    }
  }
  const n = highest + 1n;
  const componentId = `${role}-${n}`;
  const assumed = () => ({ certainty: 'assumed' as const, sourceEvidence: [] });
  const component: Component = {
    id: componentId, role, assetRef: `primitive:${spec.asset}`, label: `${role.toUpperCase()} ${n}`, levelId: spec.levelId,
    transform: { x: round3(snap ? snapTo(spec.x, snap.grid) : spec.x), y: round3(snap ? snapTo(spec.y, snap.grid) : spec.y), rotation: 0, scale: 1 },
    size: { ...spec.size }, ports: [], holdingSites: [],
    provenance: { role: assumed(), assetRef: assumed(), label: assumed(), levelId: assumed(), transform: assumed() },
  };
  return { state: commit(state, { ...state.present, components: [...state.present.components, component] }), componentId };
}

export interface RemovalImpact {
  blockedBy: 'children' | 'last' | null;
  physicalInterfaces: number;
  transferCapabilities: number;
  processRouteSteps: number;
  processRoutes: number;
}
const touches = (edge: { a: { componentId: string }; b: { componentId: string } }, id: string) => edge.a.componentId === id || edge.b.componentId === id;

export function removalImpact(layout: LayoutDocument, componentId: string): RemovalImpact {
  if (!layout.components.some((component) => component.id === componentId)) return { blockedBy: null, physicalInterfaces: 0, transferCapabilities: 0, processRouteSteps: 0, processRoutes: 0 };
  return {
    blockedBy: layout.components.some((component) => component.parentId === componentId) ? 'children' : layout.components.length === 1 ? 'last' : null,
    physicalInterfaces: layout.physicalInterfaces.filter((edge) => touches(edge, componentId)).length,
    transferCapabilities: layout.transferCapabilities.filter((edge) => touches(edge, componentId) || edge.handlerComponentId === componentId).length,
    processRouteSteps: layout.processRoutes.reduce((sum, route) => sum + route.steps.filter((id) => id === componentId).length, 0),
    processRoutes: layout.processRoutes.filter((route) => route.steps.filter((id) => id !== componentId).length < 2).length,
  };
}

export function removeComponent(state: LayoutEditState, componentId: string): LayoutEditState {
  const layout = state.present;
  if (state.drag || !layout.components.some((component) => component.id === componentId) || removalImpact(layout, componentId).blockedBy !== null) return state;
  return commit(state, {
    ...layout,
    components: layout.components.filter((component) => component.id !== componentId),
    physicalInterfaces: layout.physicalInterfaces.filter((edge) => !touches(edge, componentId)),
    transferCapabilities: layout.transferCapabilities.filter((edge) => !touches(edge, componentId) && edge.handlerComponentId !== componentId),
    processRoutes: layout.processRoutes.map((route) => route.steps.includes(componentId) ? { ...route, steps: route.steps.filter((id) => id !== componentId) } : route).filter((route) => route.steps.length >= 2),
  });
}

export function setLabel(state: LayoutEditState, componentId: string, label: string): LayoutEditState {
  const trimmed = label.trim();
  if (state.drag || !trimmed) return state;
  const components = state.present.components.map((component) => {
    if (component.id !== componentId || component.label === trimmed) return component;
    const provenance = component.provenance.label?.certainty === 'verified'
      ? { ...component.provenance, label: { ...component.provenance.label, certainty: 'assumed' as const } } : component.provenance;
    return { ...component, label: trimmed, provenance };
  });
  return commit(state, { ...state.present, components });
}


const assumed = () => ({ certainty: 'assumed' as const, sourceEvidence: [] });

/** Numeric ids are local to the current collection; history does not reserve removed ids. */
function nextLocalId(items: { id: string }[], prefix: string): string {
  let highest = 0n;
  for (const { id } of items) {
    const suffix = id.startsWith(prefix) ? id.slice(prefix.length) : '';
    if (/^\d+$/.test(suffix) && BigInt(suffix) > highest) highest = BigInt(suffix);
  }
  return `${prefix}${highest + 1n}`;
}

export interface AddPhysicalInterfaceSpec {
  a: { componentId: string; portId: string | null };
  b: { componentId: string; portId: string | null };
  kind: PhysicalInterfaceEdge['kind'];
}
const samePort = (a: PhysicalInterfaceEdge['a'], b: PhysicalInterfaceEdge['a']) => a.componentId === b.componentId && a.portId === b.portId;
const sameSite = (a: TransferCapabilityEdge['a'], b: TransferCapabilityEdge['a']) => a.componentId === b.componentId && a.holdingSiteId === b.holdingSiteId;

export function addPhysicalInterface(state: LayoutEditState, spec: AddPhysicalInterfaceSpec): { state: LayoutEditState; interfaceId: string | null } {
  const layout = state.present;
  const refused = { state, interfaceId: null };
  if (state.drag || spec.a.componentId === spec.b.componentId) return refused;
  const a = layout.components.find((component) => component.id === spec.a.componentId);
  const b = layout.components.find((component) => component.id === spec.b.componentId);
  if (!a || !b) return refused;
  const available = (component: Component, portId: string | null) => portId === null || (
    component.ports.some((port) => port.id === portId) && !layout.physicalInterfaces.some((edge) =>
      samePort(edge.a, { componentId: component.id, portId }) || samePort(edge.b, { componentId: component.id, portId })));
  if (!available(a, spec.a.portId) || !available(b, spec.b.portId)) return refused;
  const portA = spec.a.portId ?? nextLocalId(a.ports, 'p-');
  const portB = spec.b.portId ?? nextLocalId(b.ports, 'p-');
  const endpointA = { componentId: a.id, portId: portA };
  const endpointB = { componentId: b.id, portId: portB };
  if (layout.physicalInterfaces.some((edge) => (samePort(edge.a, endpointA) && samePort(edge.b, endpointB))
    || (samePort(edge.a, endpointB) && samePort(edge.b, endpointA)))) return refused;
  const interfaceId = nextLocalId(layout.physicalInterfaces, 'edge-');
  const components = layout.components.map((component) => {
    const other = component.id === a.id ? b : component.id === b.id ? a : null;
    const requestedPort = component.id === a.id ? spec.a.portId : spec.b.portId;
    if (!other || requestedPort !== null) return component;
    return { ...component, ports: [...component.ports, {
      id: component.id === a.id ? portA : portB,
      position: portPositionToward(layout, component.id, componentWorldCenter(layout, other.id)!), provenance: assumed(),
    }] };
  });
  return { state: commit(state, { ...layout, components, physicalInterfaces: [...layout.physicalInterfaces,
    { id: interfaceId, kind: spec.kind, a: endpointA, b: endpointB, provenance: assumed() }] }), interfaceId };
}

export function removePhysicalInterface(state: LayoutEditState, interfaceId: string): LayoutEditState {
  return state.drag ? state : commit(state, { ...state.present, physicalInterfaces: state.present.physicalInterfaces.filter((edge) => edge.id !== interfaceId) });
}

export function removePort(state: LayoutEditState, componentId: string, portId: string): LayoutEditState {
  const layout = state.present;
  if (state.drag || !layout.components.some((component) => component.id === componentId && component.ports.some((port) => port.id === portId))) return state;
  const endpoint = { componentId, portId };
  return commit(state, { ...layout,
    components: layout.components.map((component) => component.id === componentId ? { ...component, ports: component.ports.filter((port) => port.id !== portId) } : component),
    physicalInterfaces: layout.physicalInterfaces.filter((edge) => !samePort(edge.a, endpoint) && !samePort(edge.b, endpoint)),
  });
}

export function addHoldingSite(state: LayoutEditState, componentId: string, materialKinds: MaterialKind[]): { state: LayoutEditState; holdingSiteId: string | null } {
  const component = state.present.components.find((candidate) => candidate.id === componentId);
  const kinds = (['wafer', 'carrier', 'batch', 'boat', 'reticle'] as const).filter((kind) => materialKinds.includes(kind));
  if (state.drag || !component || kinds.length === 0) return { state, holdingSiteId: null };
  const holdingSiteId = nextLocalId(component.holdingSites, 'slot-');
  return { state: commit(state, { ...state.present, components: state.present.components.map((candidate) => candidate.id === componentId
    ? { ...candidate, holdingSites: [...candidate.holdingSites, { id: holdingSiteId, materialKinds: kinds, provenance: assumed() }] } : candidate) }), holdingSiteId };
}

export function removeHoldingSite(state: LayoutEditState, componentId: string, holdingSiteId: string): LayoutEditState {
  const layout = state.present;
  if (state.drag || !layout.components.some((component) => component.id === componentId && component.holdingSites.some((site) => site.id === holdingSiteId))) return state;
  const endpoint = { componentId, holdingSiteId };
  return commit(state, { ...layout,
    components: layout.components.map((component) => component.id === componentId ? { ...component, holdingSites: component.holdingSites.filter((site) => site.id !== holdingSiteId) } : component),
    transferCapabilities: layout.transferCapabilities.filter((edge) => !sameSite(edge.a, endpoint) && !sameSite(edge.b, endpoint)),
  });
}

export type AddTransferCapabilitySpec = Pick<TransferCapabilityEdge, 'a' | 'b' | 'handlerComponentId'>;

export function addTransferCapability(state: LayoutEditState, spec: AddTransferCapabilitySpec): { state: LayoutEditState; capabilityId: string | null } {
  const layout = state.present;
  const hasSite = (endpoint: TransferCapabilityEdge['a']) => layout.components.some((component) => component.id === endpoint.componentId
    && component.holdingSites.some((site) => site.id === endpoint.holdingSiteId));
  if (state.drag || !hasSite(spec.a) || !hasSite(spec.b) || sameSite(spec.a, spec.b)
    || !layout.components.some((component) => component.id === spec.handlerComponentId && component.role === 'robot')
    || layout.transferCapabilities.some((edge) => edge.handlerComponentId === spec.handlerComponentId && (
      (sameSite(edge.a, spec.a) && sameSite(edge.b, spec.b)) || (sameSite(edge.a, spec.b) && sameSite(edge.b, spec.a))))) return { state, capabilityId: null };
  const base = `${spec.a.componentId}-${spec.a.holdingSiteId}-${spec.b.componentId}-${spec.b.holdingSiteId}`;
  const taken = new Set(layout.transferCapabilities.map((edge) => edge.id));
  let capabilityId = base;
  for (let suffix = 2n; taken.has(capabilityId); suffix++) capabilityId = `${base}-${suffix}`;
  return { state: commit(state, { ...layout, transferCapabilities: [...layout.transferCapabilities, { ...spec, id: capabilityId, provenance: assumed() }] }), capabilityId };
}

export function removeTransferCapability(state: LayoutEditState, capabilityId: string): LayoutEditState {
  return state.drag ? state : commit(state, { ...state.present, transferCapabilities: state.present.transferCapabilities.filter((edge) => edge.id !== capabilityId) });
}
