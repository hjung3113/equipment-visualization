export interface Mat {
  a: number; b: number; c: number; d: number; e: number; f: number;
}

export type Point = [number, number];

export interface Box {
  x0: number; y0: number; x1: number; y1: number;
}

/** Apply `b` first, then `a`. */
export function mul(a: Mat, b: Mat): Mat {
  return {
    a: a.a * b.a + a.c * b.b,
    b: a.b * b.a + a.d * b.b,
    c: a.a * b.c + a.c * b.d,
    d: a.b * b.c + a.d * b.d,
    e: a.a * b.e + a.c * b.f + a.e,
    f: a.b * b.e + a.d * b.f + a.f,
  };
}

export function translation(x: number, y: number): Mat {
  return { a: 1, b: 0, c: 0, d: 1, e: x, f: y };
}

export function rotation(deg: number): Mat {
  const r = deg * Math.PI / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
}

export function scaling(s: number): Mat {
  return { a: s, b: 0, c: 0, d: s, e: 0, f: 0 };
}

export function apply(m: Mat, x: number, y: number): Point {
  return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
}

export function bboxOf(points: Point[]): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of points) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return { x0, y0, x1, y1 };
}

export function robotR(w: number, h: number): number {
  return Math.min(w, h) / 2 / 1.42;
}

const ARMS = new Set(['robot-single', 'robot-dual', 'robot-multi']);
export const isArm = (asset: string): boolean => ARMS.has(asset);

/** Footprint polygon in the component content frame (origin at the centre). */
export function shapeLocal(asset: string, w: number, h: number): Point[] {
  if (asset === 'tm') {
    return [[0, -h / 2], [w / 2, -h / 4], [w / 2, h / 4], [0, h / 2], [-w / 2, h / 4], [-w / 2, -h / 4]];
  }
  if (isArm(asset)) {
    const r = robotR(w, h);
    return Array.from({ length: 16 }, (_, i) => {
      const a = (i / 16) * 2 * Math.PI;
      return [r * Math.cos(a), r * Math.sin(a)] as Point;
    });
  }
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
}

function segInter(p: Point, dir: Point, q: Point, s: Point): number | null {
  const cr = dir[0] * s[1] - dir[1] * s[0];
  if (Math.abs(cr) < 1e-9) return null;
  const qp: Point = [q[0] - p[0], q[1] - p[1]];
  const t = (qp[0] * s[1] - qp[1] * s[0]) / cr;
  const u = (qp[0] * dir[1] - qp[1] * dir[0]) / cr;
  return u >= 0 && u <= 1 ? t : null;
}

export function rayPoly(p: Point, dir: Point, poly: Point[]): number | null {
  let best: number | null = null;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (!a || !b) continue;
    const t = segInter(p, dir, a, [b[0] - a[0], b[1] - a[1]]);
    if (t != null && t >= -1e-6 && (best == null || t < best)) best = t;
  }
  return best;
}

export function polysOverlap(p: Point[], q: Point[], eps = 0): boolean {
  for (const poly of [p, q]) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      if (!a || !b) continue;
      const n: Point = [b[1] - a[1], a[0] - b[0]];
      const ln = Math.hypot(n[0], n[1]) || 1;
      const project = (pts: Point[]) => {
        let lo = Infinity, hi = -Infinity;
        for (const pt of pts) {
          const v = (pt[0] * n[0] + pt[1] * n[1]) / ln;
          lo = Math.min(lo, v);
          hi = Math.max(hi, v);
        }
        return [lo, hi] as const;
      };
      const [a0, a1] = project(p);
      const [b0, b1] = project(q);
      if (a1 < b0 + eps || b1 < a0 + eps) return false;
    }
  }
  return true;
}

export function rectsOverlap(a: Box, b: Box): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

export function rectPoly(r: Box): Point[] {
  return [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]];
}

/** Rect is fully inside a convex polygon (same winding as the prototype footprints). */
export function polyContainsRect(poly: Point[], rect: Box): boolean {
  const pts = rectPoly(rect);
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (!a || !b) continue;
    for (const p of pts) {
      const cr = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
      if (cr < 0) return false;
    }
  }
  return true;
}
