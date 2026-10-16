import { rayPoly, robotR, type Point } from './geom.js';
import { el, formatNum, type SvgNode } from './svg.js';

/** Geometry `capabilitySegment` needs. Centres and polygons are world coordinates; `w`/`h` are the local footprint. */
export interface CapabilityEnd {
  label: string;
  center: Point;
  poly: Point[];
  w: number;
  h: number;
  S: number;
}

const CAPABILITY = 'var(--eqv-capability, #8154ce)';

/** One handler → target segment. A transfer is possible, not observed. Null when the segment would be shorter than 4px. */
export function capabilitySegment(handler: CapabilityEnd, target: CapabilityEnd, k: number): SvgNode | null {
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
    el('title', {}, [`${handler.label} → ${target.label} · Transfer Capability (가능, 관측 아님)`]),
    el('path', {
      d: `M${formatNum(start[0])} ${formatNum(start[1])}L${formatNum(stop[0])} ${formatNum(stop[1])}`,
      fill: 'none',
      stroke: CAPABILITY,
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
      fill: CAPABILITY,
      transform: `rotate(${formatNum(ang)} ${formatNum(stop[0])} ${formatNum(stop[1])})`,
    }),
  ]);
}
