import type { SvgNode } from '../src/svg.js';

type Point = [number, number];

const SHAPES = new Set(['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path']);

function numbers(value: string): number[] {
  return (value.match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
}

/** Same transform composition as core `shapesFit`: translate and rotate only, right to left. */
function elementMap(transform = ''): (point: Point) => Point {
  const operations = [...transform.matchAll(/([a-z]+)\(([^)]+)\)/gi)];
  if (transform.replace(/([a-z]+)\(([^)]+)\)/gi, '').trim() !== '') {
    throw new Error(`leftover transform: ${transform}`);
  }
  return (point) => operations.reduceRight<Point>((acc, match) => {
    const operation = match[1] ?? '';
    const raw = match[2] ?? '';
    const [a = 0, b = 0, c = 0] = numbers(raw);
    const [x, y] = acc;
    if (operation === 'translate') return [x + a, y + b];
    if (operation !== 'rotate') throw new Error(`unsupported transform ${operation}`);
    const r = a * Math.PI / 180;
    return [b + (x - b) * Math.cos(r) - (y - c) * Math.sin(r), c + (x - b) * Math.sin(r) + (y - c) * Math.cos(r)];
  }, point);
}

/** Path extrema in root coordinates. Commands are the primitive subset: M L H V Q A Z. */
function pathExtrema(d: string, map: (p: Point) => Point): Point[] {
  const parts = d.match(/[MLQAHVZ]|[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi) ?? [];
  if (d.replace(/[MLQAHVZ]|[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?|[\s,]/gi, '') !== '') {
    throw new Error(`leftover path: ${d}`);
  }
  let i = 0;
  let command = '';
  let current: Point = [0, 0];
  let start: Point = [0, 0];
  const out: Point[] = [];
  const take = () => {
    const part = parts[i++];
    if (part == null) throw new Error('path ended early');
    return Number(part);
  };
  const point = (): Point => [take(), take()];
  while (i < parts.length) {
    const head = parts[i];
    if (head != null && /^[A-Z]$/.test(head)) command = parts[i++] ?? '';
    const from = current;
    if (command === 'Z') {
      current = start;
      out.push(map(current));
      command = '';
      continue;
    }
    if (command === 'M' || command === 'L') {
      current = point();
      if (command === 'M') {
        start = current;
        command = 'L';
      }
    } else if (command === 'H') current = [take(), current[1]];
    else if (command === 'V') current = [current[0], take()];
    else if (command === 'Q') {
      const control = map(point());
      const endpoint = point();
      const a = map(from);
      const b = map(endpoint);
      for (const axis of [0, 1] as const) {
        const denominator = a[axis] - 2 * control[axis] + b[axis];
        const t = (a[axis] - control[axis]) / denominator;
        if (t > 0 && t < 1) {
          out.push([0, 1].map((j) => (1 - t) ** 2 * a[j]! + 2 * (1 - t) * t * control[j]! + t ** 2 * b[j]!) as Point);
        }
      }
      out.push(a, b);
      current = endpoint;
    } else if (command === 'A') {
      let rx = Math.abs(take());
      let ry = Math.abs(take());
      const phi = take() * Math.PI / 180;
      const large = take();
      const sweep = take();
      current = point();
      if (rx && ry && (from[0] !== current[0] || from[1] !== current[1])) {
        const cos = Math.cos(phi);
        const sin = Math.sin(phi);
        const dx = (from[0] - current[0]) / 2;
        const dy = (from[1] - current[1]) / 2;
        const xp = cos * dx + sin * dy;
        const yp = -sin * dx + cos * dy;
        const size = xp ** 2 / rx ** 2 + yp ** 2 / ry ** 2;
        if (size > 1) {
          rx *= Math.sqrt(size);
          ry *= Math.sqrt(size);
        }
        const factor = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0,
          (rx ** 2 * ry ** 2 - rx ** 2 * yp ** 2 - ry ** 2 * xp ** 2) / (rx ** 2 * yp ** 2 + ry ** 2 * xp ** 2)));
        const cxp = factor * rx * yp / ry;
        const cyp = -factor * ry * xp / rx;
        const center: Point = [
          cos * cxp - sin * cyp + (from[0] + current[0]) / 2,
          sin * cxp + cos * cyp + (from[1] + current[1]) / 2,
        ];
        const theta = Math.atan2((yp - cyp) / ry, (xp - cxp) / rx);
        let delta = Math.atan2((-yp - cyp) / ry, (-xp - cxp) / rx) - theta;
        const tau = 2 * Math.PI;
        if (sweep && delta < 0) delta += tau;
        if (!sweep && delta > 0) delta -= tau;
        const origin = map(center);
        const u = map([center[0] + rx * cos, center[1] + rx * sin]);
        const v = map([center[0] - ry * sin, center[1] + ry * cos]);
        for (const axis of [0, 1] as const) {
          const angle = Math.atan2(v[axis] - origin[axis], u[axis] - origin[axis]);
          for (const t of [angle, angle + Math.PI]) {
            const distance = ((sweep ? t - theta : theta - t) % tau + tau) % tau;
            if (distance <= Math.abs(delta) + 1e-10) {
              out.push([
                origin[0] + (u[0] - origin[0]) * Math.cos(t) + (v[0] - origin[0]) * Math.sin(t),
                origin[1] + (u[1] - origin[1]) * Math.cos(t) + (v[1] - origin[1]) * Math.sin(t),
              ]);
            }
          }
        }
      }
    } else throw new Error(`Unsupported path command: ${command}`);
    out.push(map(from), map(current));
  }
  return out;
}

function localPoints(node: SvgNode): Point[] {
  const n = (key: string) => Number(node.attrs[key] ?? 0);
  if (node.tag === 'rect') {
    return [[n('x'), n('y')], [n('x') + n('width'), n('y')], [n('x'), n('y') + n('height')], [n('x') + n('width'), n('y') + n('height')]];
  }
  if (node.tag === 'circle' || node.tag === 'ellipse') {
    const rx = node.tag === 'circle' ? n('r') : n('rx');
    const ry = node.tag === 'circle' ? n('r') : n('ry');
    return [[n('cx') - rx, n('cy') - ry], [n('cx') + rx, n('cy') + ry]];
  }
  if (node.tag === 'line') return [[n('x1'), n('y1')], [n('x2'), n('y2')]];
  if (node.tag === 'path') return [];
  const coords = numbers(node.attrs.points ?? '');
  const points: Point[] = [];
  for (let i = 0; i + 1 < coords.length; i += 2) points.push([coords[i]!, coords[i + 1]!]);
  return points;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Glyph bounds in viewBox units, expanded by half the stroke the way `shapesFit` does. */
export function glyphBoxOf(glyph: SvgNode): { x: number; y: number; width: number; height: number } | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  let any = false;
  const visit = (node: SvgNode, parent: (p: Point) => Point) => {
    const local = elementMap(node.attrs.transform ?? '');
    const map = (p: Point) => parent(local(p));
    if (SHAPES.has(node.tag)) {
      const pts = node.tag === 'path' ? pathExtrema(node.attrs.d ?? '', map) : localPoints(node).map(map);
      const half = node.attrs.stroke === 'none' ? 0 : Number(node.attrs['stroke-width'] ?? 0) / 2;
      for (const [x, y] of pts) {
        any = true;
        x0 = Math.min(x0, x - half);
        y0 = Math.min(y0, y - half);
        x1 = Math.max(x1, x + half);
        y1 = Math.max(y1, y + half);
      }
    }
    for (const child of node.children) if (typeof child !== 'string') visit(child, map);
  };
  visit(glyph, (p) => p);
  if (!any || !Number.isFinite(x0)) return null;
  return { x: round4(x0), y: round4(y0), width: round4(x1 - x0), height: round4(y1 - y0) };
}
