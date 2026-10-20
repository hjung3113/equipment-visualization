import { describe, expect, it } from 'vitest';
import { validateLayout, type Component, type LayoutDocument, type Provenance } from '@eqv/core';
import {
  canRedo, canUndo, cancelDrag, createLayoutEdit, dragTo, endDrag, isDirty, markSaved, moveBy, redo, rootDeltaToLocal, rotateBy,
  setTransform, undo, DEFAULT_SNAP, addComponent, removeComponent, removalImpact, setLabel, roleForPrimitive,
} from '../src/layout-edit.js';

const assumed: Provenance = { certainty: 'assumed', sourceEvidence: [] };
const verified: Provenance = { certainty: 'verified', sourceEvidence: ['src-a'] };

// Component `parent` keeps `transform` before `id` on purpose: edits must not reorder keys.
const parent = {
  transform: { x: 100, y: 50, rotation: 30, scale: 1 },
  id: 'parent', role: 'chamber', assetRef: 'generic/chamber', label: 'Parent', levelId: 'l1',
  ports: [], holdingSites: [],
  provenance: { transform: verified, role: assumed },
} as unknown as Component;
const child: Component = {
  id: 'child', role: 'stage', assetRef: 'generic/stage', label: 'Child', parentId: 'parent', levelId: 'l1',
  transform: { x: 10, y: 0, rotation: 0, scale: 1 }, size: { width: 5, height: 5 },
  ports: [{ id: 'p1', position: { x: 1, y: 2 }, provenance: assumed }],
  holdingSites: [{ id: 's1', materialKinds: ['wafer'], provenance: assumed }],
  provenance: { transform: assumed },
};
const robot: Component = {
  id: 'robot', role: 'robot', assetRef: 'generic/robot', label: 'Robot', levelId: 'l1',
  transform: { x: -40, y: 20, rotation: -90, scale: 1 },
  ports: [{ id: 'p2', position: { x: 0, y: 0 }, provenance: assumed }],
  holdingSites: [{ id: 's2', materialKinds: ['wafer'], provenance: assumed }],
  provenance: {},
};
const fixture = (components: Component[] = [parent, child, robot]): LayoutDocument => ({
  schemaVersion: '0.4', kind: 'equipment-layout', templateId: 'tpl', id: 'lay', name: 'Layout', unit: 'abstract',
  viewBox: { x: -200, y: -200, width: 400, height: 400 },
  sources: [{ id: 'src-a', title: 'Synthetic source', license: 'CC0-1.0' }],
  levels: [{ id: 'l1', label: 'L1', order: 0 }],
  components,
  physicalInterfaces: [{ id: 'pi1', kind: 'gate', a: { componentId: 'child', portId: 'p1' }, b: { componentId: 'robot', portId: 'p2' }, provenance: assumed }],
  transferCapabilities: [{
    id: 'tc1', a: { componentId: 'child', holdingSiteId: 's1' }, b: { componentId: 'robot', holdingSiteId: 's2' },
    handlerComponentId: 'robot', provenance: assumed,
  }],
  processRoutes: [],
});
const layout = fixture();
const fresh = () => createLayoutEdit(layout);
const byId = (doc: LayoutDocument, id: string) => doc.components.find((c) => c.id === id)!;
const tf = (state: ReturnType<typeof fresh>, id: string) => byId(state.present, id).transform;

describe('fixture', () => {
  it('is a valid layout', () => expect(validateLayout(layout).ok).toBe(true));
});

describe('D8 invariant', () => {
  it('only transforms (and verified→assumed) change; key order and all other fields stay', () => {
    let s = fresh();
    s = moveBy(s, 'parent', 12, -7, DEFAULT_SNAP);
    s = rotateBy(s, 'robot', 45, null);
    s = setTransform(s, 'child', { x: 3.5, rotation: 10 });
    s = dragTo(s, 'robot', 33, 21, null);
    s = dragTo(s, 'robot', 40, 25, DEFAULT_SNAP);
    s = endDrag(s);
    expect(s.past).toHaveLength(4);
    const restored: LayoutDocument = {
      ...s.present,
      components: s.present.components.map((c) => {
        const original = byId(layout, c.id);
        const { transform: editedEvidence, ...otherProvenance } = c.provenance;
        const provenance = original.provenance.transform
          ? { ...c.provenance, transform: original.provenance.transform } : otherProvenance;
        expect(editedEvidence === undefined).toBe(original.provenance.transform === undefined);
        return { ...c, transform: original.transform, provenance } as Component;
      }),
    };
    expect(JSON.stringify(restored)).toBe(JSON.stringify(layout));
    expect(Object.keys(byId(s.present, 'parent'))[0]).toBe('transform');
    expect(validateLayout(s.present).ok).toBe(true);
  });
});

describe('moveBy', () => {
  it('moving a parent changes only the parent transform', () => {
    const s = moveBy(fresh(), 'parent', 20, 0, null);
    expect(byId(s.present, 'child')).toBe(byId(layout, 'child'));
    expect(byId(s.present, 'robot')).toBe(byId(layout, 'robot'));
    expect(tf(s, 'parent').x).toBe(120);
  });

  it('a move never changes rotation or scale, a rotate never changes x/y', () => {
    const moved = tf(moveBy(fresh(), 'parent', 5, 5, null), 'parent');
    expect([moved.rotation, moved.scale]).toEqual([30, 1]);
    const rotated = tf(rotateBy(fresh(), 'parent', 5, null), 'parent');
    expect([rotated.x, rotated.y, rotated.scale]).toEqual([100, 50, 1]);
  });

  const odd = (transform: Partial<Component['transform']>) =>
    createLayoutEdit(fixture([{ ...robot, transform: { ...robot.transform, ...transform } }]));
  it('a move keeps an unnormalised rotation and an untouched 4-decimal axis byte-for-byte', () => {
    const s = moveBy(odd({ x: 1.2345, rotation: 270 }), 'robot', 0, 5, null);
    expect(tf(s, 'robot')).toMatchObject({ x: 1.2345, y: 25, rotation: 270 });
  });
  it('a rotate keeps stored x/y with more than 3 decimals', () => {
    const s = rotateBy(odd({ x: 1.2345, y: 2.3456 }), 'robot', 10, null);
    expect(tf(s, 'robot')).toMatchObject({ x: 1.2345, y: 2.3456, rotation: -80 });
  });
  it('setTransform writes only the patched fields', () => {
    const s = setTransform(odd({ x: 1.2345, rotation: 270 }), 'robot', { y: 7 });
    expect(tf(s, 'robot')).toMatchObject({ x: 1.2345, y: 7, rotation: 270 });
  });
});

describe('rootDeltaToLocal', () => {
  const rot = (deg: number, scale = 1) => ({ x: 0, y: 0, rotation: deg, scale });
  const at = (id: string, parentId: string | undefined, transform: Component['transform']): Component =>
    ({ ...child, id, parentId, transform, ports: [], holdingSites: [] }) as Component;
  // Independent forward model: world delta = M(root)·M(parent)·local, M = scale·[cos -sin; sin cos].
  const forward = (chain: [number, number][], lx: number, ly: number) => chain.reduceRight(([x, y], [deg, s]) => {
    const r = (deg * Math.PI) / 180;
    return [s * (Math.cos(r) * x - Math.sin(r) * y), s * (Math.sin(r) * x + Math.cos(r) * y)] as [number, number];
  }, [lx, ly] as [number, number]);

  it.each([
    ['root component', fixture([at('a', undefined, rot(77, 3))]), 'a', [20, 5], [20, 5]],
    ['child of rotation 90 scale 2', fixture([at('a', undefined, rot(90, 2)), at('b', 'a', rot(0))]), 'b', [20, 0], [0, -10]],
  ] as const)('%s', (_name, doc, id, [dx, dy], [ex, ey]) => {
    const local = rootDeltaToLocal(doc, id, dx, dy);
    expect(local.dx).toBeCloseTo(ex, 9);
    expect(local.dy).toBeCloseTo(ey, 9);
  });

  it('grandchild under two rotated, scaled parents round-trips through the forward matrices', () => {
    const doc = fixture([at('a', undefined, rot(30, 2)), at('b', 'a', rot(-75, 0.5)), at('c', 'b', rot(10))]);
    const local = rootDeltaToLocal(doc, 'c', 14, -9);
    const [wx, wy] = forward([[30, 2], [-75, 0.5]], local.dx, local.dy);
    expect(wx).toBeCloseTo(14, 9);
    expect(wy).toBeCloseTo(-9, 9);
  });

  it('moveBy applies the local delta to the child of a rotated parent', () => {
    const doc = fixture([at('a', undefined, rot(90, 2)), at('b', 'a', rot(0))]);
    const s = moveBy(createLayoutEdit(doc), 'b', 20, 0, null);
    expect(tf(s, 'b').x).toBeCloseTo(0, 9);
    expect(tf(s, 'b').y).toBeCloseTo(-10, 9);
  });
});

describe('snap', () => {
  const doc = (x: number) => createLayoutEdit(fixture([{ ...robot, transform: { x, y: 0, rotation: 0, scale: 1 } }]));
  it.each([[13.6, 10], [15, 20], [-15, -10]])('move to %s snaps to %s', (target, expected) => {
    expect(tf(moveBy(doc(0), 'robot', target, 0, DEFAULT_SNAP), 'robot').x).toBe(expected);
  });
  it('snap null leaves the value', () => expect(tf(moveBy(doc(0), 'robot', 13.6, 0, null), 'robot').x).toBe(13.6));
  it.each([[22, 15], [23, 30]])('rotation %s snaps to %s', (target, expected) => {
    expect(tf(rotateBy(doc(0), 'robot', target, DEFAULT_SNAP), 'robot').rotation).toBe(expected);
  });
});

describe('rotation and number normalisation', () => {
  const rotated = (start: number, by: number) => {
    const s = createLayoutEdit(fixture([{ ...robot, transform: { ...robot.transform, rotation: start } }]));
    return tf(rotateBy(s, 'robot', by, null), 'robot').rotation;
  };
  it.each([[170, 20, -170], [-170, -20, 170], [90, 90, 180], [0, -180, 180], [10, 360 + 20, 30], [0, -179.9996, 180], [0, 359.9996, 0]])('%s + %s → %s', (start, by, expected) => {
    expect(rotated(start, by)).toBe(expected);
  });
  it('rounds to 3 decimals and turns -0 into 0', () => {
    const s = moveBy(fresh(), 'robot', 0.123456, 0, null);
    expect(tf(s, 'robot').x).toBe(-39.877);
    const zero = moveBy(createLayoutEdit(fixture([{ ...robot, transform: { ...robot.transform, x: 5 } }])), 'robot', -5, 0, null);
    expect(Object.is(tf(zero, 'robot').x, 0)).toBe(true);
  });
});

describe('setTransform', () => {
  it('sets exact values without snapping', () => {
    const t = tf(setTransform(fresh(), 'robot', { x: 13.6, y: 0.0004, rotation: 22 }), 'robot');
    expect([t.x, t.y, t.rotation]).toEqual([13.6, 0, 22]);
  });
  it.each([[{ x: NaN }], [{ y: Infinity }], [{ rotation: -Infinity }]])('rejects non-finite %j', (patch) => {
    const s = fresh();
    expect(setTransform(s, 'robot', patch)).toBe(s);
  });
  it('a same-value set returns the same state', () => {
    const s = fresh();
    expect(setTransform(s, 'robot', { x: -40, y: 20 })).toBe(s);
  });
  it('a no-op on a verified, unnormalised transform adds no history and keeps provenance', () => {
    const odd = { ...parent, transform: { x: 1.2345, y: 20, rotation: 270, scale: 1 } } as Component;
    const s = createLayoutEdit(fixture([odd]));
    expect(setTransform(s, 'parent', { y: 20 })).toBe(s);
    expect(moveBy(s, 'parent', 0, 0, null)).toBe(s);
    expect(endDrag(dragTo(s, 'parent', 0, 0, null)).past).toHaveLength(0);
  });
});

describe('no-op edits', () => {
  it.each([
    ['zero move', (s: ReturnType<typeof fresh>) => moveBy(s, 'robot', 0, 0, null)],
    ['move that snaps back', (s: ReturnType<typeof fresh>) => moveBy(s, 'robot', 3, 3, { grid: 10, rotationStep: 15 })],
    ['zero rotate', (s: ReturnType<typeof fresh>) => rotateBy(s, 'robot', 0, null)],
    ['full turn', (s: ReturnType<typeof fresh>) => rotateBy(s, 'robot', 360, null)],
    ['unknown move', (s: ReturnType<typeof fresh>) => moveBy(s, 'nope', 5, 5, null)],
    ['unknown rotate', (s: ReturnType<typeof fresh>) => rotateBy(s, 'nope', 5, null)],
    ['unknown set', (s: ReturnType<typeof fresh>) => setTransform(s, 'nope', { x: 1 })],
    ['unknown drag', (s: ReturnType<typeof fresh>) => dragTo(s, 'nope', 5, 5, null)],
  ])('%s returns the same state', (_name, run) => {
    const s = createLayoutEdit(fixture([{ ...robot, transform: { x: 10, y: 20, rotation: -90, scale: 1 } }]));
    expect(run(s)).toBe(s);
  });
});

describe('provenance', () => {
  it('verified transform becomes assumed with evidence kept', () => {
    const p = byId(moveBy(fresh(), 'parent', 5, 0, null).present, 'parent').provenance;
    expect(p.transform).toEqual({ certainty: 'assumed', sourceEvidence: ['src-a'] });
    expect(p.role).toEqual(assumed);
  });
  it.each([['child', assumed], ['robot', undefined]])('%s provenance.transform stays as it was', (id, expected) => {
    const p = byId(moveBy(fresh(), id, 5, 0, null).present, id).provenance;
    expect(p.transform).toEqual(expected);
    expect('transform' in p).toBe(expected !== undefined);
  });
  it('a no-op on a verified transform keeps it verified', () => {
    expect(byId(moveBy(fresh(), 'parent', 0, 0, null).present, 'parent').provenance.transform).toEqual(verified);
  });
});

describe('drag', () => {
  it('several dragTo calls then endDrag add one history entry; undo restores the origin', () => {
    let s = dragTo(fresh(), 'robot', 5, 0, null);
    s = dragTo(s, 'robot', 8, 4, null);
    s = dragTo(s, 'robot', 20, 10, null);
    expect(s.past).toHaveLength(0);
    expect(tf(s, 'robot')).toMatchObject({ x: -20, y: 30 });
    s = endDrag(s);
    expect(s.past).toEqual([layout]);
    expect(s.drag).toBeNull();
    expect(undo(s).present).toBe(layout);
  });
  it('cancelDrag restores the origin without an entry', () => {
    const s = cancelDrag(dragTo(fresh(), 'robot', 5, 0, null));
    expect(s.present).toBe(layout);
    expect(s.past).toHaveLength(0);
    expect(s.drag).toBeNull();
  });
  it('a zero-delta drag adds no entry', () => {
    const s = endDrag(dragTo(dragTo(fresh(), 'robot', 5, 0, null), 'robot', 0, 0, null));
    expect(s.past).toHaveLength(0);
    expect(s.present).toBe(layout);
    expect(s.drag).toBeNull();
  });
  it('undo, redo and edits are ignored during a drag', () => {
    const edited = moveBy(fresh(), 'robot', 10, 0, null);
    const dragging = dragTo(edited, 'robot', 5, 0, null);
    const redoable = dragTo(undo(edited), 'robot', 5, 0, null);
    expect(dragging.past).toHaveLength(1);
    expect(redoable.future).toHaveLength(1);
    expect(undo(dragging)).toBe(dragging);
    expect(redo(redoable)).toBe(redoable);
  });
  it.each([
    ['moveBy', (s: ReturnType<typeof fresh>) => moveBy(s, 'robot', 1, 1, null)],
    ['rotateBy', (s: ReturnType<typeof fresh>) => rotateBy(s, 'robot', 10, null)],
    ['setTransform', (s: ReturnType<typeof fresh>) => setTransform(s, 'robot', { x: 1 })],
  ])('%s is ignored during a drag', (_name, run) => {
    const dragging = dragTo(fresh(), 'robot', 5, 0, null);
    expect(run(dragging)).toBe(dragging);
  });
  it('a drag of another component starts from the current present', () => {
    const s = dragTo(dragTo(fresh(), 'robot', 5, 0, null), 'parent', 10, 0, null);
    expect(tf(s, 'robot').x).toBe(-35);
    expect(s.drag?.componentId).toBe('parent');
  });
});

describe('history and dirty', () => {
  it('undo/redo walk the history and an edit clears redo', () => {
    let s = moveBy(fresh(), 'robot', 10, 0, null);
    s = moveBy(s, 'robot', 10, 0, null);
    expect([canUndo(s), canRedo(s)]).toEqual([true, false]);
    s = undo(undo(s));
    expect([canUndo(s), canRedo(s), tf(s, 'robot').x]).toEqual([false, true, -40]);
    expect(undo(s)).toBe(s);
    s = redo(s);
    expect(tf(s, 'robot').x).toBe(-30);
    expect(canRedo(moveBy(undo(s), 'robot', 1, 0, null))).toBe(false);
    expect(redo(redo(redo(s)))).toEqual(redo(redo(s)));
  });
  it('dirty is measured against the saved baseline', () => {
    let s = fresh();
    expect(isDirty(s)).toBe(false);
    s = moveBy(s, 'robot', 10, 0, null);
    expect(isDirty(s)).toBe(true);
    expect(isDirty(undo(s))).toBe(false);
    s = markSaved(s);
    expect(isDirty(s)).toBe(false);
    expect(canUndo(s)).toBe(true);
    expect(isDirty(undo(s))).toBe(true);
  });
});

describe('Component assembly', () => {
  const spec = { asset: 'pm', size: { width: 80, height: 60 }, levelId: 'l1', x: 14.12345, y: 26.98765 };
  it.each(['loadlock', 'robot-single', 'robot-dual', 'robot-multi', 'handler', 'pm'])('maps primitive %s to its Role', (name) => {
    expect(roleForPrimitive(name)).toBe(name === 'loadlock' ? 'll' : name.startsWith('robot-') || name === 'handler' ? 'robot' : name);
  });
  it('adds an assumed Component with explicit natural size and no connectivity', () => {
    const { state, componentId } = addComponent(fresh(), spec, DEFAULT_SNAP);
    expect(componentId).toBe('pm-1');
    expect(byId(state.present, componentId!)).toEqual({ id: 'pm-1', role: 'pm', assetRef: 'primitive:pm', label: 'PM 1', levelId: 'l1',
      transform: { x: 10, y: 30, rotation: 0, scale: 1 }, size: spec.size, ports: [], holdingSites: [],
      provenance: { role: assumed, assetRef: assumed, label: assumed, levelId: assumed, transform: assumed } });
    for (const key of ['physicalInterfaces', 'transferCapabilities', 'processRoutes'] as const) expect(state.present[key]).toBe(layout[key]);
    expect(state.past).toEqual([layout]);
    expect(byId(addComponent(fresh(), spec, null).state.present, 'pm-1').transform.x).toBe(14.123);
  });
  it('reserves ids in saved, past and future documents, including a deleted id', () => {
    const first = addComponent(fresh(), spec, null).state;
    const second = addComponent(first, spec, null).state;
    expect(addComponent(undo(second), spec, null).componentId).toBe('pm-3');
    expect(addComponent(removeComponent(markSaved(second), 'pm-2'), spec, null).componentId).toBe('pm-3');
  });
  it('allocates a fresh id above the safe integer limit', () => {
    const state = createLayoutEdit(fixture([{ ...robot, id: 'pm-9007199254740993', role: 'pm' }]));
    const added = addComponent(state, spec, null);
    expect(added.componentId).toBe('pm-9007199254740994');
    expect(new Set(added.state.present.components.map((component) => component.id)).size).toBe(2);
  });
  it.each(['level', 'drag'])('does not add for invalid %s', (reason) => {
    const state = reason === 'drag' ? dragTo(fresh(), 'robot', 1, 1, null) : fresh();
    expect(addComponent(state, { ...spec, levelId: reason === 'level' ? 'missing' : 'l1' }, null)).toEqual({ state, componentId: null });
  });
  it('counts and removes all graph references in one undoable edit, preserving unrelated keys', () => {
    const doc = { ...layout, processRoutes: [{ id: 'drop', label: 'Drop', steps: ['child', 'robot'] }, { id: 'keep', label: 'Keep', steps: ['parent', 'child', 'robot'] }] };
    expect(removalImpact(doc, 'child')).toEqual({ blockedBy: null, physicalInterfaces: 1, transferCapabilities: 1, processRouteSteps: 2, processRoutes: 1 });
    const removed = removeComponent(createLayoutEdit(doc), 'child');
    expect(removed.present.components).toEqual([parent, robot]);
    expect(removed.present.physicalInterfaces).toEqual([]);
    expect(removed.present.transferCapabilities).toEqual([]);
    expect(removed.present.processRoutes).toEqual([{ id: 'keep', label: 'Keep', steps: ['parent', 'robot'] }]);
    expect(Object.keys(removed.present)).toEqual(Object.keys(doc));
    expect(undo(removed).present).toBe(doc);
  });
  it.each(['children', 'last', 'unknown', 'drag'])('blocks removal for %s', (reason) => {
    const state = reason === 'last' ? createLayoutEdit(fixture([robot])) : reason === 'drag' ? dragTo(fresh(), 'robot', 1, 1, null) : fresh();
    const id = reason === 'children' ? 'parent' : reason === 'unknown' ? 'missing' : 'robot';
    expect(removeComponent(state, id)).toBe(state);
    if (reason === 'children' || reason === 'last') expect(removalImpact(state.present, id).blockedBy).toBe(reason);
    if (reason === 'unknown') expect(removalImpact(state.present, id)).toEqual({ blockedBy: null, physicalInterfaces: 0, transferCapabilities: 0, processRouteSteps: 0, processRoutes: 0 });
  });
  it('trims labels and downgrades only verified label provenance', () => {
    const doc = fixture([{ ...robot, provenance: { label: verified } }, child]);
    const state = createLayoutEdit(doc);
    const changed = setLabel(state, 'robot', '  New name  ');
    expect(byId(changed.present, 'robot').label).toBe('New name');
    expect(byId(changed.present, 'robot').provenance.label).toEqual({ ...verified, certainty: 'assumed' });
    expect(setLabel(state, 'robot', ' ')).toBe(state);
    expect(setLabel(state, 'robot', 'Robot')).toBe(state);
    const dragging = dragTo(state, 'robot', 1, 1, null);
    expect(setLabel(dragging, 'robot', 'Name')).toBe(dragging);
  });
});
