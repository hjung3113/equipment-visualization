import { componentLocalMatrix, type Component, type LayoutDocument } from '@eqv/core';
import { capabilitySegment, type CapabilityEnd } from './capability.js';
import {
  apply, bboxOf, fromCore, isArm, mul, polyContainsRect, polysOverlap, rayPoly, rectPoly, rectsOverlap,
  robotR, shapeLocal, type Box, type Mat, type Point,
} from './geom.js';
import { primitives, type PrimitiveParts } from './primitives.generated.js';
import { estimateTextWidth } from './text.js';
import { cloneNode, el, formatExact, formatNum, withPointerEventsNone, type SvgNode } from './svg.js';

export interface SceneLayers {
  interfaces: boolean;
  certainty: boolean;
  holdingSites: boolean;
  capabilities: boolean;
}

export interface SceneOptions {
  width: number;
  height: number;
  pxPerUnit: number;
  labels?: 'label' | 'id' | 'none';
  layers?: Partial<SceneLayers>;
  /** Default: every level in the layout. */
  visibleLevelIds?: readonly string[];
  /** Default false. When true, visible Components are selectable and overlay layers ignore hits. */
  interactive?: boolean;
}

export interface SceneComponent {
  id: string;
  label: string;
  asset: string;
  cls: 'process' | 'holding' | 'robot' | 'structure';
  w: number;
  h: number;
  S: number;
  matrix: Mat;
  center: Point;
  poly: Point[];
  bbox: Box;
  hidden: boolean;
  bodyStroke: string;
  /** The layout's ordered Holding Site ids. Order only: Holding Sites have no geometry. */
  holdingSiteIds: readonly string[];
  /** Scene-space point of each Holding Site that declares a local `position` (the composed Component matrix applied to it). Sites without one are absent: unknown geometry, never inferred. */
  holdingSiteWorld: ReadonlyMap<string, Point>;
  /** Font px of the Component's own label when it is drawn below the bbox (label plan `outside`), else null. */
  outsideLabelPx: number | null;
  /** Scene-space text box of the Component's own label when it is drawn inside the body (label plan `band` or `center`), else null. */
  insideLabelBox: Box | null;
}

/** One explicit transfer capability. Endpoints stay paired; a flat handler/target set is not enough. */
export interface SceneCapability {
  handlerComponentId: string;
  aComponentId: string;
  bComponentId: string;
}

export interface Scene {
  node: SvgNode;
  pxPerUnit: number;
  /** The Layout viewBox the viewer fits, as a box. */
  viewBox: Box;
  components: ReadonlyMap<string, SceneComponent>;
  capabilities: readonly SceneCapability[];
}

const PAINT = {
  board: 'var(--eqv-board, #fbfdff)',
  ink: 'var(--eqv-ink, #101828)',
  secondary: 'var(--eqv-secondary, #374151)',
  interface: 'var(--eqv-interface, #374151)',
  detail: 'var(--eqv-detail-fill, #ffffff)',
  assumedBg: 'var(--eqv-assumed-bg, #f4ece0)',
  assumedFg: 'var(--eqv-assumed-fg, #8e5500)',
} as const;

const NEUTRAL_BOX: PrimitiveParts = {
  body: el('rect', {
    x: '-4', y: '-4', width: '8', height: '8',
    fill: PAINT.board,
    stroke: PAINT.secondary,
    'stroke-width': '1.75',
    'vector-effect': 'non-scaling-stroke',
  }),
  glyph: null,
  rest: [],
  viewBox: { x: -4, y: -4, width: 8, height: 8 },
  stretches: false,
  glyphBox: null,
};

const CLASS_KO: Record<SceneComponent['cls'], string> = {
  process: '공정 모듈',
  holding: '대기·출입 모듈',
  robot: '로봇·핸들러',
  structure: '구조물',
};

const CLASS: Record<string, 'process' | 'holding' | 'robot' | 'structure'> = {
  pm: 'process', cell: 'process', coater: 'process', developer: 'process', dry: 'process', bake: 'process',
  reactor: 'process', exposure: 'process', metrology: 'process', stage: 'process', optics: 'process',
  lp: 'holding', loadlock: 'holding', buffer: 'holding', aligner: 'holding', boat: 'holding', stocker: 'holding',
  'robot-single': 'robot', 'robot-dual': 'robot', 'robot-multi': 'robot', handler: 'robot',
  efem: 'structure', tm: 'structure', rail: 'structure', housing: 'structure',
};

/** Primitive class order and natural footprints from the bundled source tables. */
export const PRIMITIVE_CATALOG: readonly Readonly<{ name: string; cls: SceneComponent['cls']; clsLabel: string; width: number; height: number }>[] = Object.entries(CLASS).map(([name, cls]) => ({
  name, cls, clsLabel: CLASS_KO[cls], width: primitives[name]!.viewBox.width, height: primitives[name]!.viewBox.height,
}));

const BODY_ATTRS = ['fill', 'stroke', 'stroke-width', 'vector-effect', 'stroke-linecap', 'stroke-linejoin'] as const;

interface LabelPlan {
  tw: number;
  th: number;
  band: number;
  mode: 'band' | 'center' | 'outside';
  px: number;
}

interface LabelBox extends Box {
  owner: string;
  inside: boolean;
}

interface Placed {
  component: Component;
  id: string;
  asset: string;
  cls: 'process' | 'holding' | 'robot' | 'structure';
  prim: PrimitiveParts;
  unknownAsset: boolean;
  w: number;
  h: number;
  S: number;
  worldRot: number;
  matrix: Mat;
  poly: Point[];
  bbox: Box;
  center: Point;
  hidden: boolean;
  stacked: boolean;
}

function roleClass(role: string): Placed['cls'] {
  return Object.hasOwn(CLASS, role) ? CLASS[role]! : (role === 'll' ? 'holding' : role === 'robot' ? 'robot' : 'process');
}

function assetOf(assetRef: string, role: string): { name: string; cls: Placed['cls']; prim: PrimitiveParts; unknownAsset: boolean } {
  const name = assetRef.startsWith('primitive:') ? assetRef.slice('primitive:'.length) : assetRef;
  const prim = Object.hasOwn(primitives, name) ? primitives[name] : undefined;
  const cls = Object.hasOwn(CLASS, name) ? CLASS[name] : undefined;
  if (name === 'generic-box') return { name, cls: roleClass(role), prim: NEUTRAL_BOX, unknownAsset: false };
  if (prim && cls) return { name, cls, prim, unknownAsset: false };
  return { name: 'generic-box', cls: roleClass(role), prim: NEUTRAL_BOX, unknownAsset: true };
}

function localTransform(component: Component): string {
  const { x, y, rotation: rot, scale } = component.transform;
  return `translate(${formatExact(x)} ${formatExact(y)}) rotate(${formatExact(rot)}) scale(${formatExact(scale)})`;
}

function normRot(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Gap between the bbox bottom and an `outside` Component label's line box, screen px. */
const OUTSIDE_LABEL_GAP_PX = 9;

/** Bottom of an `outside` label's estimated text box below the bbox, screen px (centre 0.5px, baseline +0.36px, descent 0.22px). */
export function outsideLabelBottomPx(px: number): number {
  return OUTSIDE_LABEL_GAP_PX + px * (0.5 + 0.36 + 0.22);
}

function labelPx(cls: Placed['cls'], idMode: boolean): number {
  if (cls === 'structure') return idMode ? 11.5 : 12;
  return idMode ? 12 : 13;
}

/** Port of the prototype `labelPlan`. Sizes are content-frame units; `kLocal` is one screen px in that frame. */
function labelPlan(placed: Placed, text: string, px: number, mono: boolean, kLocal: number): LabelPlan {
  const tw = estimateTextWidth(text, px, mono) * kLocal;
  const th = px * kLocal;
  const r = normRot(placed.worldRot) * Math.PI / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  const band = c * th + s * tw + 14 * kLocal;
  const cross = c * placed.w + s * placed.h;
  let fits = tw + 14 * kLocal <= cross && (placed.h - band) > 24 * kLocal;
  if (placed.asset === 'loadlock') fits = tw + 14 * kLocal <= cross && placed.h >= 36 * kLocal;
  const mode = fits ? 'band' : (tw + 10 * kLocal <= cross && placed.h >= th + 10 * kLocal) ? 'center' : 'outside';
  return { tw, th, band, mode, px };
}

function scaleGroup(sx: number, sy: number, children: SvgNode[]): SvgNode {
  const transform = sx === sy ? `scale(${formatNum(sx)})` : `scale(${formatNum(sx)} ${formatNum(sy)})`;
  return el('g', { transform }, children);
}

function stackWrap(kLocal: number, children: SvgNode[]): SvgNode {
  return el('g', {
    'data-stack': 'true',
    transform: `translate(${formatNum(5 * kLocal)} ${formatNum(-5 * kLocal)})`,
  }, children);
}

function structureRect(body: SvgNode, w: number | null, h: number | null, rx: number, fill?: string): SvgNode {
  const attrs: Record<string, string> = {};
  for (const key of BODY_ATTRS) {
    const value = body.attrs[key];
    if (value != null) attrs[key] = value;
  }
  if (fill) attrs.fill = fill;
  if (w == null || h == null) {
    // A size-less structure keeps its natural body geometry; only the corner radius is screen-fixed.
    if (body.attrs.x != null) attrs.x = body.attrs.x;
    if (body.attrs.y != null) attrs.y = body.attrs.y;
    if (body.attrs.width != null) attrs.width = body.attrs.width;
    if (body.attrs.height != null) attrs.height = body.attrs.height;
  } else {
    attrs.x = formatNum(-w / 2);
    attrs.y = formatNum(-h / 2);
    attrs.width = formatNum(w);
    attrs.height = formatNum(h);
  }
  attrs.rx = formatNum(rx);
  return el('rect', attrs);
}

function fittedGlyph(placed: Placed, plan: LabelPlan | undefined, showLabel: boolean, fit: number, kLocal: number): SvgNode | null {
  const { prim } = placed;
  if (!prim.glyph || !prim.glyphBox) return null;
  if (showLabel && plan?.mode === 'center') return null;
  const band = showLabel && plan?.mode === 'band' ? plan.band : 10 * kLocal;
  const contentGy = placed.asset === 'loadlock' ? 0 : -band / 2;
  const gy = fit === 0 ? 0 : contentGy / fit;
  const availW = placed.w - 14 * kLocal;
  const availH = placed.h - band - 10 * kLocal;
  const glyphW = prim.glyphBox.width * fit;
  const glyphH = prim.glyphBox.height * fit;
  const glyphScale = placed.asset === 'loadlock' ? 1 : Math.min(1, glyphW > 0 ? availW / glyphW : 1, glyphH > 0 ? availH / glyphH : 1);
  if (!(glyphScale > 0)) return null;
  const glyph = cloneNode(prim.glyph);
  glyph.attrs = { ...glyph.attrs, transform: `translate(0 ${formatNum(gy)}) scale(${formatNum(glyphScale)})` };
  return glyph;
}

function symbolNodes(placed: Placed, plan: LabelPlan | undefined, showLabel: boolean, kLocal: number): SvgNode[] {
  const { prim } = placed;
  if (placed.asset === 'generic-box') {
    const body = cloneNode(prim.body);
    body.attrs = {
      ...body.attrs,
      x: formatNum(-placed.w / 2),
      y: formatNum(-placed.h / 2),
      width: formatNum(placed.w),
      height: formatNum(placed.h),
      ...(placed.unknownAsset ? { 'stroke-dasharray': '4 3' } : {}),
    };
    const nodes: SvgNode[] = [];
    if (placed.stacked) {
      const stackBody = cloneNode(body);
      stackBody.attrs = { ...stackBody.attrs, fill: PAINT.board };
      nodes.push(stackWrap(kLocal, [stackBody]));
    }
    nodes.push(body);
    return nodes;
  }
  const hasSize = placed.component.size != null;
  const sx = !hasSize ? 1 : prim.stretches ? placed.w / prim.viewBox.width : Math.min(placed.w / prim.viewBox.width, placed.h / prim.viewBox.height);
  const sy = !hasSize ? 1 : prim.stretches ? placed.h / prim.viewBox.height : sx;
  const nodes: SvgNode[] = [];
  if (prim.stretches && prim.body.tag === 'rect') {
    const rx = 12 * kLocal;
    const bw = hasSize ? placed.w : null;
    const bh = hasSize ? placed.h : null;
    if (placed.stacked) nodes.push(stackWrap(kLocal, [structureRect(prim.body, bw, bh, rx, PAINT.board)]));
    nodes.push(structureRect(prim.body, bw, bh, rx));
    if (prim.rest.length) nodes.push(scaleGroup(sx, sy, prim.rest.map(cloneNode)));
    return nodes;
  }
  const glyph = fittedGlyph(placed, plan, showLabel, sx, kLocal);
  const inner = [cloneNode(prim.body), ...(glyph ? [glyph] : []), ...prim.rest.map(cloneNode)];
  if (placed.stacked) {
    const stackBody = cloneNode(prim.body);
    stackBody.attrs = { ...stackBody.attrs, fill: PAINT.board };
    nodes.push(stackWrap(kLocal, [scaleGroup(sx, sy, [stackBody])]));
  }
  nodes.push(scaleGroup(sx, sy, inner));
  return nodes;
}

function unitY(m: Mat): Point {
  const len = Math.hypot(m.c, m.d) || 1;
  return [m.c / len, m.d / len];
}

/** Prototype `collar`: one-sided rotation ray, else an overlap bar, else a corner link. */
function collar(a: Placed, b: Placed, k: number): [Point, Point] | null {
  const rotA = Math.abs(normRot(a.worldRot)) > 0.5;
  const rotB = Math.abs(normRot(b.worldRot)) > 0.5;
  if (rotA !== rotB) {
    const rotated = rotA ? a : b;
    const other = rotA ? b : a;
    const p = apply(rotated.matrix, 0, rotated.h / 2);
    const dir = unitY(rotated.matrix);
    const t = rayPoly(p, dir, other.poly);
    if (t == null) return null;
    const q: Point = [p[0] + dir[0] * t, p[1] + dir[1] * t];
    return rotA ? [p, q] : [q, p];
  }
  const ab = a.bbox;
  const bb = b.bbox;
  const ox0 = Math.max(ab.x0, bb.x0);
  const ox1 = Math.min(ab.x1, bb.x1);
  const oy0 = Math.max(ab.y0, bb.y0);
  const oy1 = Math.min(ab.y1, bb.y1);
  const area = (row: Placed) => row.w * row.S * row.h * row.S;
  const small = area(a) < area(b) ? a : b;
  const span = (e1: number, s2: number): [number, number] => {
    let lo = Math.min(e1, s2);
    let hi = Math.max(e1, s2);
    if (hi - lo < 10 * k) {
      const mid = (lo + hi) / 2;
      lo = mid - 5 * k;
      hi = mid + 5 * k;
    }
    return [lo, hi];
  };
  if (ox1 - ox0 >= 12 * k) {
    const x = Math.min(Math.max(small.center[0], ox0 + 8 * k), ox1 - 8 * k);
    const [lo, hi] = a.center[1] < b.center[1] ? span(ab.y1, bb.y0) : span(bb.y1, ab.y0);
    return a.center[1] < b.center[1] ? [[x, lo], [x, hi]] : [[x, hi], [x, lo]];
  }
  if (oy1 - oy0 >= 12 * k) {
    const y = Math.min(Math.max(small.center[1], oy0 + 8 * k), oy1 - 8 * k);
    const [lo, hi] = a.center[0] < b.center[0] ? span(ab.x1, bb.x0) : span(bb.x1, ab.x0);
    return a.center[0] < b.center[0] ? [[lo, y], [hi, y]] : [[hi, y], [lo, y]];
  }
  const px = ab.x1 < bb.x0 ? [ab.x1, bb.x0] : [ab.x0, bb.x1];
  const py = ab.y1 < bb.y0 ? [ab.y1, bb.y0] : [ab.y0, bb.y1];
  return [[px[0]!, py[0]!], [px[1]!, py[1]!]];
}

function interfaceMark(a: Placed, b: Placed, kind: string, k: number): SvgNode | null {
  const segment = collar(a, b, k);
  if (!segment) return null;
  const [p, q] = segment;
  const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
  const ang = Math.atan2(q[1] - p[1], q[0] - p[0]) * 180 / Math.PI;
  const mx = (p[0] + q[0]) / 2;
  const my = (p[1] + q[1]) / 2;
  const optical = kind === 'optical';
  const bar: Record<string, string> = {
    x: formatNum(-2.5 * k),
    y: formatNum(-7 * k),
    width: formatNum(5 * k),
    height: formatNum(14 * k),
    rx: formatNum(1.2 * k),
    transform: `translate(${formatNum(mx)} ${formatNum(my)}) rotate(${formatNum(ang)})`,
    fill: optical ? PAINT.detail : PAINT.interface,
  };
  if (optical) {
    bar.stroke = PAINT.interface;
    bar['stroke-width'] = formatNum(1.5 * k);
  }
  const children: (SvgNode | string)[] = [
    el('title', {}, [`${a.component.label} ↔ ${b.component.label} · Physical Interface (${kind})`]),
    el('path', {
      d: `M${formatNum(p[0])} ${formatNum(p[1])}L${formatNum(q[0])} ${formatNum(q[1])}`,
      fill: 'none',
      stroke: PAINT.interface,
      'stroke-width': formatNum(2 * k),
    }),
    el('rect', bar),
  ];
  if (len > 16 * k) {
    for (const pt of [p, q]) {
      children.push(el('rect', {
        x: formatNum(pt[0] - 3 * k),
        y: formatNum(pt[1] - 3 * k),
        width: formatNum(6 * k),
        height: formatNum(6 * k),
        rx: formatNum(k),
        fill: PAINT.detail,
        stroke: PAINT.interface,
        'stroke-width': formatNum(1.5 * k),
      }));
    }
  }
  return el('g', {}, children);
}

function segmentEnd(row: Placed): CapabilityEnd {
  return { asset: row.asset, label: row.component.label, center: row.center, poly: row.poly, w: row.w, h: row.h, S: row.S };
}

function textNode(text: string, x: number, y: number, anchor: string, px: number, k: number, fill: string, weight: string, halo: boolean): SvgNode {
  const attrs: Record<string, string> = {
    x: formatNum(x),
    y: formatNum(y),
    'text-anchor': anchor,
    'font-family': 'inherit',
    'font-size': formatNum(px * k),
    'font-weight': weight,
    fill,
  };
  if (halo) {
    attrs.stroke = PAINT.board;
    attrs['stroke-width'] = formatNum(4 * k);
    attrs['paint-order'] = 'stroke';
  }
  return el('text', attrs, [text]);
}

function hasAssumed(component: Component): boolean {
  return Object.values(component.provenance).some((entry) => entry?.certainty === 'assumed');
}

function circleBox(center: Point, r: number): Box {
  return { x0: center[0] - r, y0: center[1] - r, x1: center[0] + r, y1: center[1] + r };
}

/** Badge position: next to the label, else the corner. A corner badge dodges to the bottom-left when it would sit on the chip slot. */
function badgeAt(placed: Placed, label: LabelBox | undefined, chipSlot: Box | undefined, k: number): Point {
  const corner: Point = [placed.bbox.x1 - 12 * k, placed.bbox.y0 + 12 * k];
  let at = corner;
  if (label) {
    const bx = label.x1 + 12 * k;
    if (!isArm(placed.asset) && label.inside && bx + 10 * k > placed.bbox.x1) at = corner;
    else at = [bx, (label.y0 + label.y1) / 2];
  }
  if (at === corner && chipSlot && rectsOverlap(circleBox(at, 8.5 * k), chipSlot)) {
    return [placed.bbox.x0 + 12 * k, placed.bbox.y1 - 12 * k];
  }
  return at;
}

function assumedBadge(x: number, y: number, k: number): SvgNode {
  return el('g', {}, [
    el('title', {}, ['매핑 assumed (Certainty, 증거 아님)']),
    el('circle', {
      cx: formatNum(x),
      cy: formatNum(y),
      r: formatNum(8.5 * k),
      fill: PAINT.assumedBg,
      stroke: PAINT.assumedFg,
      'stroke-width': formatNum(1.4 * k),
    }),
    el('text', {
      x: formatNum(x),
      y: formatNum(y + 3.6 * k),
      'text-anchor': 'middle',
      'font-family': 'inherit',
      'font-size': formatNum(10 * k),
      'font-weight': '700',
      fill: PAINT.assumedFg,
    }, ['A']),
  ]);
}

function chipSize(placed: Placed, k: number): { width: number; height: number } {
  const tw = estimateTextWidth(String(placed.component.holdingSites.length), 10, false) * k;
  return { width: tw + 6 * k, height: 14 * k };
}

/** Chip candidates in order: top-right inside, top-left inside, bottom-right inside, just outside the top-right. Robot-class Components try corners of their fitted primitive extent, so the fallback can sit clear of arms and fork. */
function chipRectAt(placed: Placed, index: number, k: number): Box {
  const { width, height } = chipSize(placed, k);
  const frame = placed.cls === 'robot' ? fittedExtent(placed) : placed.bbox;
  if (index === 1) return { x0: frame.x0, y0: frame.y0, x1: frame.x0 + width, y1: frame.y0 + height };
  if (index === 2) return { x0: frame.x1 - width, y0: frame.y1 - height, x1: frame.x1, y1: frame.y1 };
  if (index === 3) return { x0: frame.x1, y0: frame.y0, x1: frame.x1 + width, y1: frame.y0 + height };
  return { x0: frame.x1 - width, y0: frame.y0, x1: frame.x1, y1: frame.y0 + height };
}

/** A robot-class Component's rendered extent in world coordinates: the neutral rectangle or fitted primitive, arms and fork included. */
function fittedExtent(placed: Placed): Box {
  if (placed.asset === 'generic-box') return placed.bbox;
  const { viewBox } = placed.prim;
  const fit = placed.component.size == null
    ? 1
    : Math.min(placed.w / viewBox.width, placed.h / viewBox.height);
  return bboxOf([
    apply(placed.matrix, viewBox.x * fit, viewBox.y * fit),
    apply(placed.matrix, (viewBox.x + viewBox.width) * fit, viewBox.y * fit),
    apply(placed.matrix, (viewBox.x + viewBox.width) * fit, (viewBox.y + viewBox.height) * fit),
    apply(placed.matrix, viewBox.x * fit, (viewBox.y + viewBox.height) * fit),
  ]);
}

/**
 * First chip candidate clear of every badge, label box, already-placed chip and, for a robot-class
 * Component, its fitted primitive extent; if none is clear, the last candidate.
 */
function chipRectFor(placed: Placed, taken: Box[], labels: LabelBox[], k: number): Box {
  const guard = placed.cls === 'robot' ? fittedExtent(placed) : undefined;
  const clear = (rect: Box): boolean =>
    !taken.some((box) => rectsOverlap(rect, box))
    && !labels.some((box) => rectsOverlap(rect, box))
    && !(guard && rectsOverlap(rect, guard));
  let chosen = chipRectAt(placed, 0, k);
  for (let index = 1; index < 4 && !clear(chosen); index += 1) chosen = chipRectAt(placed, index, k);
  return chosen;
}

function holdingChip(placed: Placed, rect: Box, k: number): SvgNode {
  const n = placed.component.holdingSites.length;
  const px = 10;
  const width = rect.x1 - rect.x0;
  const height = rect.y1 - rect.y0;
  return el('g', { 'data-chip-for': placed.id }, [
    el('title', {}, [`Holding Site ${n}곳`]),
    el('rect', {
      x: formatNum(rect.x0),
      y: formatNum(rect.y0),
      width: formatNum(width),
      height: formatNum(height),
      rx: formatNum(2 * k),
      fill: PAINT.board,
      stroke: PAINT.secondary,
      'stroke-width': formatNum(k),
    }),
    el('text', {
      x: formatNum(rect.x0 + width / 2),
      y: formatNum(rect.y0 + height / 2 + px * 0.35 * k),
      'text-anchor': 'middle',
      'font-family': 'inherit',
      'font-size': formatNum(px * k),
      'font-weight': '600',
      fill: PAINT.ink,
    }, [String(n)]),
  ]);
}

export function buildScene(layout: LayoutDocument, options: SceneOptions): Scene {
  const pxPerUnit = options.pxPerUnit;
  if (!(pxPerUnit > 0)) throw new Error('pxPerUnit must be positive');
  const k = 1 / pxPerUnit;
  const interactive = options.interactive ?? false;
  const labels = options.labels ?? 'label';
  const layers: SceneLayers = {
    interfaces: true,
    certainty: false,
    holdingSites: false,
    capabilities: false,
    ...options.layers,
  };
  const visible = new Set(options.visibleLevelIds ?? layout.levels.map((level) => level.id));
  const lowest = Math.min(...layout.levels.map((level) => level.order));
  const orderOf = new Map(layout.levels.map((level) => [level.id, level.order]));
  const byId = new Map(layout.components.map((component) => [component.id, component]));
  const childrenOf = new Map<string, Component[]>();
  const roots: Component[] = [];
  for (const component of layout.components) {
    if (!component.parentId) roots.push(component);
    else {
      const list = childrenOf.get(component.parentId) ?? [];
      list.push(component);
      childrenOf.set(component.parentId, list);
    }
  }

  const placed = new Map<string, Placed>();
  const resolve = (id: string, stack: Set<string>): Placed => {
    const existing = placed.get(id);
    if (existing) return existing;
    const component = byId.get(id);
    if (!component) throw new Error(`missing component ${id}`);
    if (stack.has(id)) throw new Error(`component cycle at ${id}`);
    stack.add(id);
    const parent = component.parentId ? resolve(component.parentId, stack) : null;
    stack.delete(id);
    const { name, cls, prim, unknownAsset } = assetOf(component.assetRef, component.role);
    const w = component.size?.width ?? (name === 'generic-box' ? 8 : prim.viewBox.width);
    const h = component.size?.height ?? (name === 'generic-box' ? 8 : prim.viewBox.height);
    const local = fromCore(componentLocalMatrix(component.transform));
    const matrix = parent ? mul(parent.matrix, local) : local;
    const S = (parent?.S ?? 1) * component.transform.scale;
    const worldRot = (parent?.worldRot ?? 0) + component.transform.rotation;
    const poly = shapeLocal(name, w, h).map(([x, y]) => apply(matrix, x, y));
    const hidden = !visible.has(component.levelId);
    const row: Placed = {
      component, id, asset: name, cls, prim, unknownAsset, w, h, S, worldRot, matrix, poly,
      bbox: bboxOf(poly),
      center: apply(matrix, 0, 0),
      hidden,
      stacked: !hidden && (orderOf.get(component.levelId) ?? 0) > lowest,
    };
    placed.set(id, row);
    return row;
  };
  for (const component of layout.components) resolve(component.id, new Set());

  const idMode = labels === 'id';
  const showLabel = labels !== 'none';
  const plans = new Map<string, LabelPlan>();
  const missed = new Set<string>();
  if (showLabel) {
    for (const row of placed.values()) {
      if (row.hidden || row.cls === 'structure' || isArm(row.asset)) continue;
      const text = idMode ? row.id : row.component.label;
      const plan = labelPlan(row, text, labelPx(row.cls, idMode), idMode, k / row.S);
      plans.set(row.id, plan);
      if (plan.mode !== 'band') missed.add(row.asset);
    }
    for (const [id, plan] of plans) {
      const row = placed.get(id);
      if (row && plan.mode === 'band' && missed.has(row.asset)) plan.mode = 'center';
    }
  }

  const buildGroup = (component: Component): SvgNode => {
    const row = placed.get(component.id);
    if (!row) throw new Error(`unplaced ${component.id}`);
    const kids = (childrenOf.get(component.id) ?? []).map(buildGroup);
    const attrs: Record<string, string> = {
      'data-component-id': component.id,
      'data-level-id': component.levelId,
      transform: localTransform(component),
    };
    if (row.unknownAsset) attrs['data-asset-unknown'] = 'true';
    if (row.hidden) {
      attrs['data-hidden'] = 'true';
      return el('g', attrs, kids);
    }
    if (interactive) {
      attrs.style = 'outline:none';
      attrs.tabindex = '0';
      attrs.role = 'button';
      attrs['aria-pressed'] = 'false';
      attrs['aria-label'] = `${component.label}, ${CLASS_KO[row.cls]}${row.unknownAsset ? ', 알 수 없는 도형' : ''}`;
    }
    const plan = plans.get(component.id);
    return el('g', attrs, [
      el('title', {}, [`${component.label} · ${component.id}${row.unknownAsset ? ` · 알 수 없는 도형 (${component.assetRef})` : ''}`]),
      ...symbolNodes(row, plan, showLabel, k / row.S),
      ...kids,
    ]);
  };

  const labelNodes: SvgNode[] = [];
  const labelBoxes: LabelBox[] = [];
  const rows = layout.components.map((component) => placed.get(component.id)).filter((row): row is Placed => row != null);
  if (showLabel) {
    for (const row of rows) {
      if (row.hidden || isArm(row.asset)) continue;
      const text = idMode ? row.id : row.component.label;
      const px = labelPx(row.cls, idMode);
      const weight = idMode ? '500' : '600';
      const worldTw = estimateTextWidth(text, px, idMode) * k;
      if (row.cls === 'structure') {
        let x: number;
        let y: number;
        let anchor = 'start';
        if (row.asset === 'tm') {
          const worldW = row.w * row.S;
          const worldH = row.h * row.S;
          const need = worldTw / 2 + 8 * k;
          const d = worldW === 0 ? 0 : (need / (worldW / 2)) * (worldH / 4);
          x = row.center[0];
          y = row.center[1] - worldH / 2 + d + px * 0.5 * k;
          anchor = 'middle';
        } else if (row.asset === 'rail') {
          x = row.bbox.x1 - 26 * k;
          y = row.center[1] + px * 0.36 * k;
          anchor = 'end';
        } else {
          x = row.bbox.x0 + 12 * k;
          y = row.bbox.y0 + 18 * k;
        }
        labelNodes.push(textNode(text, x, y, anchor, px, k, PAINT.secondary, weight, false));
        const x0 = anchor === 'middle' ? x - worldTw / 2 : anchor === 'end' ? x - worldTw : x;
        labelBoxes.push({ x0, x1: x0 + worldTw, y0: y - px * 0.78 * k, y1: y + px * 0.22 * k, owner: row.id, inside: false });
      } else {
        const plan = plans.get(row.id);
        if (!plan) continue;
        let x = row.center[0];
        let y = row.center[1];
        let halo = false;
        if (plan.mode === 'band') {
          const ly = row.asset === 'loadlock' ? 0 : row.h / 2 - plan.band / 2;
          [x, y] = apply(row.matrix, 0, ly);
        } else if (plan.mode === 'outside') {
          y = row.bbox.y1 + OUTSIDE_LABEL_GAP_PX * k + px * 0.5 * k;
          halo = true;
        }
        const by = y + px * 0.36 * k;
        labelNodes.push(textNode(text, x, by, 'middle', px, k, PAINT.ink, weight, halo));
        labelBoxes.push({
          x0: x - worldTw / 2, x1: x + worldTw / 2, y0: by - px * 0.78 * k, y1: by + px * 0.22 * k,
          owner: row.id, inside: !halo,
        });
      }
    }
    for (const row of rows) {
      if (row.hidden || !isArm(row.asset)) continue;
      const text = idMode ? row.id : row.component.label;
      const px = labelPx(row.cls, idMode);
      const worldTw = estimateTextWidth(text, px, idMode) * k;
      const radius = robotR(row.w, row.h) * row.S;
      const reach = radius * 1.36;
      const parent = row.component.parentId ? placed.get(row.component.parentId) : undefined;
      const candidates: { x: number; y: number; anchor: string }[] = [
        { x: row.center[0], y: row.center[1] + radius + 7 * k + px * 0.8 * k, anchor: 'middle' },
        { x: row.center[0] + reach + 6 * k, y: row.center[1] + px * 0.36 * k, anchor: 'start' },
        { x: row.center[0] - reach - 6 * k, y: row.center[1] + px * 0.36 * k, anchor: 'end' },
        { x: row.center[0], y: row.center[1] - reach - 6 * k, anchor: 'middle' },
      ];
      let best: { x: number; y: number; anchor: string; score: number; box: Box } | null = null;
      for (const [index, candidate] of candidates.entries()) {
        const x0 = candidate.anchor === 'middle' ? candidate.x - worldTw / 2 : candidate.anchor === 'start' ? candidate.x : candidate.x - worldTw;
        const box: Box = { x0: x0 - 2 * k, x1: x0 + worldTw + 2 * k, y0: candidate.y - px * 0.8 * k, y1: candidate.y + px * 0.25 * k };
        let score = index * 0.5;
        const poly = rectPoly(box);
        for (const other of rows) {
          if (other === row || other === parent || other.cls === 'structure') continue;
          if (polysOverlap(poly, other.poly, 0)) score += 100;
          else if (polysOverlap(rectPoly({
            x0: box.x0 - 8 * k, x1: box.x1 + 8 * k, y0: box.y0 - 6 * k, y1: box.y1 + 6 * k,
          }), other.poly, 0)) score += 3;
        }
        for (const other of rows) {
          if (other.cls !== 'structure' || other === parent) continue;
          const inside = box.x0 >= other.bbox.x0 && box.x1 <= other.bbox.x1 && box.y0 >= other.bbox.y0 && box.y1 <= other.bbox.y1;
          if (polysOverlap(poly, other.poly, 0) && !inside) score += 50;
        }
        if (parent && !polyContainsRect(parent.poly, box)) score += 60;
        for (const label of labelBoxes) if (rectsOverlap(box, label)) score += 80;
        if (!best || score < best.score) best = { ...candidate, score, box };
      }
      if (!best) continue;
      labelNodes.push(textNode(text, best.x, best.y, best.anchor, px, k, PAINT.ink, idMode ? '500' : '600', true));
      labelBoxes.push({ ...best.box, owner: row.id, inside: false });
    }
  }

  const interfaceNodes: SvgNode[] = [];
  if (layers.interfaces) {
    for (const edge of layout.physicalInterfaces) {
      const a = placed.get(edge.a.componentId);
      const b = placed.get(edge.b.componentId);
      if (!a || !b) throw new Error(`physical interface ${edge.id} references a missing component`);
      if (a.hidden || b.hidden) continue;
      const mark = interfaceMark(a, b, edge.kind, k);
      if (mark) interfaceNodes.push(mark);
    }
  }

  const capabilityNodes: SvgNode[] = [];
  if (layers.capabilities) {
    const seen = new Set<string>();
    for (const edge of layout.transferCapabilities) {
      const handler = placed.get(edge.handlerComponentId);
      if (!handler) throw new Error(`transfer capability ${edge.id} references a missing handler`);
      for (const targetId of [edge.a.componentId, edge.b.componentId]) {
        if (targetId === edge.handlerComponentId || seen.has(`${edge.handlerComponentId}\0${targetId}`)) continue;
        seen.add(`${edge.handlerComponentId}\0${targetId}`);
        const target = placed.get(targetId);
        if (!target) throw new Error(`transfer capability ${edge.id} references a missing component`);
        if (handler.hidden || target.hidden) continue;
        const segment = capabilitySegment(segmentEnd(handler), segmentEnd(target), k);
        if (segment) capabilityNodes.push(segment);
      }
    }
  }

  // Badges are placed before any chip so every chip can dodge them; each badge in turn dodges
  // its own component's preferred chip slot by falling back to the bottom-left corner.
  const badgeNodes: SvgNode[] = [];
  const chipNodes: SvgNode[] = [];
  const badgeBoxes: Box[] = [];
  if (layers.certainty || layers.holdingSites) {
    const chipSlots = new Map<string, Box>();
    if (layers.holdingSites) {
      for (const row of rows) {
        if (row.hidden || row.component.holdingSites.length < 1) continue;
        chipSlots.set(row.id, chipRectAt(row, 0, k));
      }
    }
    if (layers.certainty) {
      for (const row of rows) {
        if (row.hidden || row.cls === 'structure' || !hasAssumed(row.component)) continue;
        const [x, y] = badgeAt(row, labelBoxes.find((label) => label.owner === row.id), chipSlots.get(row.id), k);
        badgeNodes.push(assumedBadge(x, y, k));
        badgeBoxes.push(circleBox([x, y], 8.5 * k));
      }
    }
    if (layers.holdingSites) {
      const chipBoxes: Box[] = [];
      for (const row of rows) {
        if (row.hidden || row.component.holdingSites.length < 1) continue;
        const rect = chipRectFor(row, [...badgeBoxes, ...chipBoxes], labelBoxes, k);
        chipNodes.push(holdingChip(row, rect, k));
        chipBoxes.push(rect);
      }
    }
  }

  const components = new Map<string, SceneComponent>();
  for (const row of placed.values()) {
    components.set(row.id, {
      id: row.id,
      label: row.component.label,
      asset: row.asset,
      cls: row.cls,
      w: row.w,
      h: row.h,
      S: row.S,
      matrix: row.matrix,
      center: row.center,
      poly: row.poly,
      bbox: row.bbox,
      hidden: row.hidden,
      bodyStroke: row.prim.body.attrs.stroke ?? 'none',
      holdingSiteIds: row.component.holdingSites.map((site) => site.id),
      holdingSiteWorld: new Map(row.component.holdingSites.flatMap((site): [string, Point][] => (
        site.position ? [[site.id, apply(row.matrix, site.position.x, site.position.y)]] : []
      ))),
      outsideLabelPx: plans.get(row.id)?.mode === 'outside' ? plans.get(row.id)!.px : null,
      insideLabelBox: labelBoxes.find((label) => label.owner === row.id && label.inside) ?? null,
    });
  }
  const capabilities = layout.transferCapabilities.map((edge) => ({
    handlerComponentId: edge.handlerComponentId,
    aComponentId: edge.a.componentId,
    bComponentId: edge.b.componentId,
  }));

  const layer = (name: string, children: SvgNode[]): SvgNode => {
    const node = el('g', { 'data-layer': name }, children);
    return interactive ? withPointerEventsNone(node) : node;
  };

  const { viewBox } = layout;
  const node = el('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    viewBox: `${formatExact(viewBox.x)} ${formatExact(viewBox.y)} ${formatExact(viewBox.width)} ${formatExact(viewBox.height)}`,
    width: formatExact(options.width),
    height: formatExact(options.height),
    role: 'group',
    'aria-label': layout.name,
  }, [
    el('rect', {
      x: formatExact(viewBox.x),
      y: formatExact(viewBox.y),
      width: formatExact(viewBox.width),
      height: formatExact(viewBox.height),
      fill: PAINT.board,
    }),
    ...roots.map(buildGroup),
    layer('interfaces', interfaceNodes),
    layer('capabilities', capabilityNodes),
    layer('labels', labelNodes),
    layer('badges', badgeNodes),
    // Chips are not one of the four named overlay layers; they follow badges.
    layer('chips', chipNodes),
  ]);
  return {
    node,
    pxPerUnit,
    viewBox: { x0: viewBox.x, y0: viewBox.y, x1: viewBox.x + viewBox.width, y1: viewBox.y + viewBox.height },
    components,
    capabilities,
  };
}
