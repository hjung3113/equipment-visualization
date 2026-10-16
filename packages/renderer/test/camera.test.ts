import { expect, it } from 'vitest';
import {
  bringIntoView, clampCenter, defaultCamera, layoutToScreen, viewBoxOf, zoomAtPoint, zoomFromWheel,
  type Camera, type Frame, type Size,
} from '../src/camera.js';

const SQUARE: Frame = { x: 0, y: 0, width: 100, height: 100 };

function meet(frame: Frame, view: Size, x: number, y: number): [number, number] {
  const fit = Math.min(view.width / frame.width, view.height / frame.height);
  const padX = (view.width - frame.width * fit) / 2;
  const padY = (view.height - frame.height * fit) / 2;
  return [(x - frame.x) * fit + padX, (y - frame.y) * fit + padY];
}

it('clamps the centre into the layout viewBox and leaves an interior centre untouched', () => {
  const frame = { x: 10, y: 20, width: 100, height: 80 };
  const inside: Camera = { zoom: 3, cx: 40, cy: 50 };
  expect(clampCenter(inside, frame)).toBe(inside);
  expect(clampCenter({ zoom: 3, cx: -10, cy: 500 }, frame)).toEqual({ zoom: 3, cx: 10, cy: 100 });
  expect(clampCenter({ zoom: 3, cx: 200, cy: 0 }, frame)).toEqual({ zoom: 3, cx: 110, cy: 20 });
});

it('keeps the anchor on the same screen pixel when the zoomed centre stays inside the frame', () => {
  const frame = { x: 0, y: 0, width: 1000, height: 1000 };
  const view = { width: 200, height: 200 };
  const camera = { zoom: 2, cx: 400, cy: 500 };
  const anchor = { x: 420, y: 530 };
  const before = layoutToScreen(camera, view, frame, anchor.x, anchor.y);
  const next = zoomAtPoint(camera, 4, anchor, frame);
  const after = layoutToScreen(next, view, frame, anchor.x, anchor.y);
  expect(next.zoom).toBe(4);
  expect(after[0]).toBeCloseTo(before[0], 8);
  expect(after[1]).toBeCloseTo(before[1], 8);
});

it('uses the clamped zoom for the anchor when the request overshoots 1 or 8', () => {
  const frame = { x: 0, y: 0, width: 1000, height: 1000 };
  const camera = { zoom: 2, cx: 400, cy: 500 };
  const anchor = { x: 420, y: 530 };
  const overshot = zoomAtPoint(camera, 100, anchor, frame);
  expect(overshot).toEqual(zoomAtPoint(camera, 8, anchor, frame));
  expect(overshot.zoom).toBe(8);
  const wrongRatio = camera.zoom / 100;
  const wrongCx = anchor.x - (anchor.x - camera.cx) * wrongRatio;
  expect(overshot.cx).not.toBeCloseTo(wrongCx, 4);

  const undershot = zoomAtPoint(camera, 0.01, anchor, frame);
  expect(undershot).toEqual(zoomAtPoint(camera, 1, anchor, frame));
  expect(undershot.zoom).toBe(1);
});

it('does not move the centre when a request clamps back to the current zoom', () => {
  const atMax = zoomAtPoint({ zoom: 4, cx: 20, cy: 30 }, 8, { x: 0, y: 0 }, SQUARE);
  expect(zoomAtPoint(atMax, 50, { x: 1, y: 1 }, SQUARE)).toBe(atMax);
  const atMin: Camera = { zoom: 1, cx: 40, cy: 60 };
  expect(zoomAtPoint(atMin, 0.2, { x: 10, y: 10 }, SQUARE)).toBe(atMin);
});

it('clamps the centre after zooming toward a point', () => {
  const next = zoomAtPoint({ zoom: 2, cx: 90, cy: 50 }, 1, { x: 0, y: 50 }, SQUARE);
  expect(next).toEqual({ zoom: 1, cx: 100, cy: 50 });
});

it.each([
  { deltaMode: 0, deltaY: 10, viewHeight: 100, expected: 2 * Math.exp(-10 * 0.002) },
  { deltaMode: 1, deltaY: 10, viewHeight: 100, expected: 2 * Math.exp(-160 * 0.002) },
  { deltaMode: 2, deltaY: 1, viewHeight: 100, expected: 2 * Math.exp(-100 * 0.002) },
])('wheel deltaMode $deltaMode scales the zoom by the pixel delta', ({ deltaMode, deltaY, viewHeight, expected }) => {
  expect(zoomFromWheel(2, deltaY, deltaMode, viewHeight)).toBeCloseTo(expected, 10);
});

it('matches meet-fit at zoom 1, including a mismatched aspect and a nonzero origin', () => {
  const cases: { frame: Frame; view: Size; viewBox: Frame }[] = [
    {
      frame: { x: 10, y: 20, width: 100, height: 50 },
      view: { width: 200, height: 100 },
      viewBox: { x: 10, y: 20, width: 100, height: 50 },
    },
    {
      frame: SQUARE,
      view: { width: 200, height: 100 },
      viewBox: { x: -50, y: 0, width: 200, height: 100 },
    },
    {
      frame: { x: 10, y: 20, width: 100, height: 100 },
      view: { width: 200, height: 100 },
      viewBox: { x: -40, y: 20, width: 200, height: 100 },
    },
  ];
  for (const { frame, view, viewBox } of cases) {
    const camera = defaultCamera(frame);
    expect(camera.zoom).toBe(1);
    expect(viewBoxOf(camera, view, frame)).toEqual(viewBox);
    for (const [x, y] of [[frame.x, frame.y], [frame.x + frame.width / 2, frame.y + frame.height], [frame.x + 20, frame.y + 10]] as const) {
      const screen = layoutToScreen(camera, view, frame, x, y);
      const fitted = meet(frame, view, x, y);
      expect(screen[0]).toBeCloseTo(fitted[0], 8);
      expect(screen[1]).toBeCloseTo(fitted[1], 8);
    }
  }
});

it('pans the minimum amount, centres an oversized bbox, and lets the centre clamp win', () => {
  const frame = { x: 0, y: 0, width: 200, height: 200 };
  const view = { width: 100, height: 100 };
  const camera = { zoom: 2, cx: 100, cy: 100 };
  expect(bringIntoView(camera, { x0: 10, y0: 40, x1: 30, y1: 55 }, view, frame)).toEqual({ zoom: 2, cx: 60, cy: 90 });
  expect(bringIntoView(camera, { x0: 60, y0: 60, x1: 80, y1: 80 }, view, frame)).toEqual(camera);
  expect(bringIntoView(camera, { x0: 0, y0: 20, x1: 150, y1: 40 }, view, frame)).toEqual({ zoom: 2, cx: 75, cy: 70 });

  const tight = { x: 0, y: 0, width: 30, height: 30 };
  const edge = { zoom: 4, cx: 15, cy: 15 };
  expect(bringIntoView(edge, { x0: -20, y0: -5, x1: -15, y1: 0 }, { width: 100, height: 100 }, tight)).toEqual({
    zoom: 4, cx: 0, cy: 0,
  });
});
