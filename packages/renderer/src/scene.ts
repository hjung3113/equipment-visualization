import type { Component, LayoutDocument } from '@eqv/core';
import {
  apply, bboxOf, isArm, mul, polyContainsRect, polysOverlap, rayPoly, rectPoly, rectsOverlap,
  robotR, rotation, scaling, shapeLocal, translation, type Box, type Mat, type Point,
} from './geom.js';
import { primitives, type PrimitiveParts } from './primitives.generated.js';
import { estimateTextWidth } from './text.js';
import { cloneNode, el, formatExact, formatNum, type SvgNode } from './svg.js';

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
}

export interface Scene {
  node: SvgNode;
  pxPerUnit: number;
}

const PAINT = {
  board: 'var(--eqv-board, #fbfdff)',
  ink: 'var(--eqv-ink, #101828)',
  secondary: 'var(--eqv-secondary, #374151)',
  interface: 'var(--eqv-interface, #374151)',
  capability: 'var(--eqv-capability, #8154ce)',
  detail: 'var(--eqv-detail-fill, #ffffff)',
  assumedBg: 'var(--eqv-assumed-bg, #f4ece0)',
  assumedFg: 'var(--eqv-assumed-fg, #8e5500)',
} as const;

const CLASS: Record<string, 'process' | 'holding' | 'robot' | 'structure'> = {
  pm: 'process', cell: 'process', coater: 'process', developer: 'process', dry: 'process', bake: 'process',
  reactor: 'process', exposure: 'process', metrology: 'process', stage: 'process', optics: 'process',
  lp: 'holding', loadlock: 'holding', buffer: 'holding', aligner: 'holding', boat: 'holding', stocker: 'holding',
  'robot-single': 'robot', 'robot-dual': 'robot', 'robot-multi': 'robot', handler: 'robot',
  efem: 'structure', tm: 'structure', rail: 'structure', housing: 'structure',
};

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

function assetOf(assetRef: string): { name: string; cls: Placed['cls']; prim: PrimitiveParts } {
  const name = assetRef.startsWith('primitive:') ? assetRef.slice('primitive:'.length) : assetRef;
  const prim = primitives[name];
  const cls = CLASS[name];
  if (!prim || !cls) throw new Error(`Unknown assetRef: ${assetRef}`);
  return { name, cls, prim };
}

function localTransform(component: Component): string {
  const { x, y, rotation: rot, scale } = component.transform;
  return `translate(${formatExact(x)} ${formatExact(y)}) rotate(${formatExact(rot)}) scale(${formatExact(scale)})`;
}

function normRot(deg: number): number {
  return ((deg % 360) + 360) % 360;
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

function structureRect(body: SvgNode, w: number, h: number, rx: number, fill?: string): SvgNode {
  const attrs: Record<string, string> = {};
  for (const key of BODY_ATTRS) {
    const value = body.attrs[key];
    if (value != null) attrs[key] = value;
  }
  if (fill) attrs.fill = fill;
  attrs.x = formatNum(-w / 2);
  attrs.y = formatNum(-h / 2);
  attrs.width = formatNum(w);
  attrs.height = formatNum(h);
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
  const glyphScale = Math.min(1, glyphW > 0 ? availW / glyphW : 1, glyphH > 0 ? availH / glyphH : 1);
  if (!(glyphScale > 0)) return null;
  const glyph = cloneNode(prim.glyph);
  glyph.attrs = { ...glyph.attrs, transform: `translate(0 ${formatNum(gy)}) scale(${formatNum(glyphScale)})` };
  return glyph;
}

function symbolNodes(placed: Placed, plan: LabelPlan | undefined, showLabel: boolean, kLocal: number): SvgNode[] {
  const { prim } = placed;
  const hasSize = placed.component.size != null;
  const sx = !hasSize ? 1 : prim.stretches ? placed.w / prim.viewBox.width : Math.min(placed.w / prim.viewBox.width, placed.h / prim.viewBox.height);
  const sy = !hasSize ? 1 : prim.stretches ? placed.h / prim.viewBox.height : sx;
  const nodes: SvgNode[] = [];
  if (hasSize && prim.stretches && prim.body.tag === 'rect') {
    const rx = 12 * kLocal;
    if (placed.stacked) nodes.push(stackWrap(kLocal, [structureRect(prim.body, placed.w, placed.h, rx, PAINT.board)]));
    nodes.push(structureRect(prim.body, placed.w, placed.h, rx));
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

function capabilitySegment(handler: Placed, target: Placed, k: number): SvgNode | null {
  const dx = target.center[0] - handler.center[0];
  const dy = target.center[1] - handler.center[1];
  const len = Math.hypot(dx, dy) || 1;
  const u: Point = [dx / len, dy / len];
  const tIn = rayPoly(handler.center, [dx, dy], target.poly);
  const end: Point = tIn != null
    ? [handler.center[0] + dx * tIn, handler.center[1] + dy * tIn]
    : target.center;
  const r0 = robotR(handler.w, handler.h) * handler.S + 5 * k;
  const start: Point = [handler.center[0] + u[0] * r0, handler.center[1] + u[1] * r0];
  const stop: Point = [end[0] - u[0] * 3 * k, end[1] - u[1] * 3 * k];
  if ((stop[0] - start[0]) * u[0] + (stop[1] - start[1]) * u[1] < 4 * k) return null;
  const ang = Math.atan2(u[1], u[0]) * 180 / Math.PI;
  return el('g', {}, [
    el('title', {}, [`${handler.component.label} → ${target.component.label} · Transfer Capability (가능, 관측 아님)`]),
    el('path', {
      d: `M${formatNum(start[0])} ${formatNum(start[1])}L${formatNum(stop[0])} ${formatNum(stop[1])}`,
      fill: 'none',
      stroke: PAINT.capability,
      'stroke-width': formatNum(2 * k),
      'stroke-dasharray': `0 ${formatNum(5 * k)}`,
      'stroke-linecap': 'round',
    }),
    el('rect', {
      x: formatNum(stop[0] - 3 * k),
      y: formatNum(stop[1] - 3 * k),
      width: formatNum(6 * k),
      height: formatNum(6 * k),
      rx: formatNum(k),
      fill: PAINT.capability,
      transform: `rotate(${formatNum(ang)} ${formatNum(stop[0])} ${formatNum(stop[1])})`,
    }),
  ]);
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

function badgeAt(placed: Placed, label: LabelBox | undefined, k: number): Point {
  const corner: Point = [placed.bbox.x1 - 12 * k, placed.bbox.y0 + 12 * k];
  if (!label) return corner;
  const bx = label.x1 + 12 * k;
  if (!isArm(placed.asset) && label.inside && bx + 10 * k > placed.bbox.x1) return corner;
  return [bx, (label.y0 + label.y1) / 2];
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

function holdingChip(placed: Placed, k: number): SvgNode {
  const n = placed.component.holdingSites.length;
  const px = 10;
  const tw = estimateTextWidth(String(n), px, false) * k;
  const pad = 3 * k;
  const width = tw + pad * 2;
  const height = 14 * k;
  const x = placed.bbox.x1 - width;
  const y = placed.bbox.y0;
  return el('g', {}, [
    el('title', {}, [`Holding Site ${n}곳`]),
    el('rect', {
      x: formatNum(x),
      y: formatNum(y),
      width: formatNum(width),
      height: formatNum(height),
      rx: formatNum(2 * k),
      fill: PAINT.board,
      stroke: PAINT.secondary,
      'stroke-width': formatNum(k),
    }),
    el('text', {
      x: formatNum(x + width / 2),
      y: formatNum(y + height / 2 + px * 0.35 * k),
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
    const { name, cls, prim } = assetOf(component.assetRef);
    const w = component.size?.width ?? prim.viewBox.width;
    const h = component.size?.height ?? prim.viewBox.height;
    const local = mul(mul(translation(component.transform.x, component.transform.y), rotation(component.transform.rotation)), scaling(component.transform.scale));
    const matrix = parent ? mul(parent.matrix, local) : local;
    const S = (parent?.S ?? 1) * component.transform.scale;
    const worldRot = (parent?.worldRot ?? 0) + component.transform.rotation;
    const poly = shapeLocal(name, w, h).map(([x, y]) => apply(matrix, x, y));
    const hidden = !visible.has(component.levelId);
    const row: Placed = {
      component, id, asset: name, cls, prim, w, h, S, worldRot, matrix, poly,
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
    if (row.hidden) {
      attrs['data-hidden'] = 'true';
      return el('g', attrs, kids);
    }
    const plan = plans.get(component.id);
    return el('g', attrs, [
      el('title', {}, [`${component.label} · ${component.id}`]),
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
          y = row.bbox.y1 + 9 * k + px * 0.5 * k;
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
        const segment = capabilitySegment(handler, target, k);
        if (segment) capabilityNodes.push(segment);
      }
    }
  }

  const badgeNodes: SvgNode[] = [];
  if (layers.certainty) {
    for (const row of rows) {
      if (row.hidden || row.cls === 'structure' || !hasAssumed(row.component)) continue;
      const [x, y] = badgeAt(row, labelBoxes.find((label) => label.owner === row.id), k);
      badgeNodes.push(assumedBadge(x, y, k));
    }
  }

  const chipNodes: SvgNode[] = [];
  if (layers.holdingSites) {
    for (const row of rows) {
      if (row.hidden || row.component.holdingSites.length < 1) continue;
      chipNodes.push(holdingChip(row, k));
    }
  }

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
    el('g', { 'data-layer': 'interfaces' }, interfaceNodes),
    el('g', { 'data-layer': 'capabilities' }, capabilityNodes),
    el('g', { 'data-layer': 'labels' }, labelNodes),
    el('g', { 'data-layer': 'badges' }, badgeNodes),
    // Chips are not one of the four named overlay layers; they follow badges.
    el('g', { 'data-layer': 'chips' }, chipNodes),
  ]);
  return { node, pxPerUnit };
}
