import type { Box, Point } from './geom.js';

/** Camera centre is in layout units. `zoom` is a multiple of the meet-fit scale, from 1 to 8. */
export interface Camera {
  zoom: number;
  cx: number;
  cy: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 8;

export function fitScale(view: Size, frame: Frame): number {
  return Math.min(view.width / frame.width, view.height / frame.height);
}

export function defaultCamera(frame: Frame): Camera {
  return { zoom: 1, cx: frame.x + frame.width / 2, cy: frame.y + frame.height / 2 };
}

export function pxPerUnit(camera: Camera, view: Size, frame: Frame): number {
  return fitScale(view, frame) * camera.zoom;
}

/** Layout rectangle currently mapped onto the view. */
export function viewBoxOf(camera: Camera, view: Size, frame: Frame): Frame {
  const px = pxPerUnit(camera, view, frame);
  const width = view.width / px;
  const height = view.height / px;
  return { x: camera.cx - width / 2, y: camera.cy - height / 2, width, height };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Keep the centre inside the layout viewBox so some of the content stays in view. */
export function clampCenter(camera: Camera, frame: Frame): Camera {
  const cx = clamp(camera.cx, frame.x, frame.x + frame.width);
  const cy = clamp(camera.cy, frame.y, frame.y + frame.height);
  if (cx === camera.cx && cy === camera.cy) return camera;
  return { zoom: camera.zoom, cx, cy };
}

/**
 * Zoom toward `anchor` (layout units). An unchanged zoom, including a request that clamps
 * back to the current limit, does not move the centre. Otherwise the anchor keeps its
 * screen position, then the centre clamp wins.
 */
export function zoomAtPoint(camera: Camera, requested: number, anchor: { x: number; y: number }, frame: Frame): Camera {
  const nextZoom = clamp(requested, ZOOM_MIN, ZOOM_MAX);
  if (nextZoom === camera.zoom) return camera;
  const ratio = camera.zoom / nextZoom;
  return clampCenter({
    zoom: nextZoom,
    cx: anchor.x - (anchor.x - camera.cx) * ratio,
    cy: anchor.y - (anchor.y - camera.cy) * ratio,
  }, frame);
}

/** Wheel zoom before clamping. Line deltas count as 16px; page deltas count as the view height. */
export function zoomFromWheel(zoom: number, deltaY: number, deltaMode: number, viewHeight: number): number {
  let delta = deltaY;
  if (deltaMode === 1) delta *= 16;
  else if (deltaMode === 2) delta *= viewHeight;
  return zoom * Math.exp(-delta * 0.002);
}

export function screenToLayout(camera: Camera, view: Size, frame: Frame, sx: number, sy: number): Point {
  const box = viewBoxOf(camera, view, frame);
  return [box.x + (sx / view.width) * box.width, box.y + (sy / view.height) * box.height];
}

export function layoutToScreen(camera: Camera, view: Size, frame: Frame, x: number, y: number): Point {
  const box = viewBoxOf(camera, view, frame);
  return [((x - box.x) / box.width) * view.width, ((y - box.y) / box.height) * view.height];
}

/** Pan by a fraction of the current view. Positive x moves the centre right. */
export function panByFraction(camera: Camera, fx: number, fy: number, view: Size, frame: Frame): Camera {
  const box = viewBoxOf(camera, view, frame);
  return clampCenter({ ...camera, cx: camera.cx + fx * box.width, cy: camera.cy + fy * box.height }, frame);
}

/**
 * Smallest pan that puts `bbox` inside the view. A bbox larger than the view on an axis is centred
 * on that axis. No zoom change. The centre clamp wins when both cannot hold.
 */
export function bringIntoView(camera: Camera, bbox: Box, view: Size, frame: Frame): Camera {
  const box = viewBoxOf(camera, view, frame);
  let cx = camera.cx;
  let cy = camera.cy;
  const bw = bbox.x1 - bbox.x0;
  const bh = bbox.y1 - bbox.y0;
  if (bw > box.width) cx = (bbox.x0 + bbox.x1) / 2;
  else if (bbox.x0 < box.x) cx += bbox.x0 - box.x;
  else if (bbox.x1 > box.x + box.width) cx += bbox.x1 - (box.x + box.width);
  if (bh > box.height) cy = (bbox.y0 + bbox.y1) / 2;
  else if (bbox.y0 < box.y) cy += bbox.y0 - box.y;
  else if (bbox.y1 > box.y + box.height) cy += bbox.y1 - (box.y + box.height);
  return clampCenter({ zoom: camera.zoom, cx, cy }, frame);
}
