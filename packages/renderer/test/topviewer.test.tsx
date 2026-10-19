// @vitest-environment jsdom
import { act } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import { afterEach, expect, it, vi } from 'vitest';
import type { Component, LayoutDocument, SceneState } from '@eqv/core';
import { TopViewer, buildScene, type TopViewerProps } from '../src/index.js';
import {
  defaultCamera, panByFraction, viewBoxOf, zoomAtPoint, type Camera, type Frame, type Size,
} from '../src/camera.js';
import { formatNum } from '../src/svg.js';
import type { Mat } from '../src/geom.js';

const TOKENS = new Set(['--eqv-board', '--eqv-ink', '--eqv-secondary']);

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function component(partial: Pick<Component, 'id' | 'assetRef' | 'label'> & {
  role?: string; parentId?: string; levelId?: string;
  x?: number; y?: number; w?: number; h?: number;
}): Component {
  return {
    id: partial.id,
    role: partial.role ?? 'module',
    assetRef: partial.assetRef,
    label: partial.label,
    parentId: partial.parentId,
    levelId: partial.levelId ?? 'level-main',
    transform: { x: partial.x ?? 0, y: partial.y ?? 0, rotation: 0, scale: 1 },
    size: partial.w != null && partial.h != null ? { width: partial.w, height: partial.h } : undefined,
    ports: [],
    holdingSites: [],
    provenance: {},
  };
}

function fixture(components: Component[]): LayoutDocument {
  return {
    schemaVersion: '0.4',
    kind: 'template',
    id: 'fixture',
    name: 'Fixture',
    unit: 'abstract',
    viewBox: { x: 0, y: 0, width: 800, height: 600 },
    sources: [],
    levels: [
      { id: 'level-main', label: 'Main', order: 0 },
      { id: 'level-upper', label: 'Upper', order: 1 },
    ],
    components,
    physicalInterfaces: [],
    transferCapabilities: [],
    processRoutes: [],
    roleCardinality: {},
  };
}

const layout = fixture([
  component({ id: 'frame', assetRef: 'primitive:housing', label: 'Frame', x: 400, y: 300, w: 500, h: 360, role: 'housing' }),
  component({ id: 'mod', assetRef: 'primitive:pm', label: 'PM', parentId: 'frame', x: -40, y: 0, w: 96, h: 100 }),
  component({ id: 'other', assetRef: 'primitive:pm', label: 'Other', x: 80, y: 80, w: 96, h: 100 }),
  component({ id: 'secret', assetRef: 'primitive:pm', label: 'Secret', x: 700, y: 80, w: 80, h: 80, levelId: 'level-upper' }),
]);

function mount(props: Omit<TopViewerProps, 'width' | 'height'> & { width?: number; height?: number }) {
  const width = props.width ?? props.layout.viewBox.width;
  const height = props.height ?? props.layout.viewBox.height;
  let current: TopViewerProps = { ...props, width, height };
  const result = render(<TopViewer {...current} />);
  const read = () => {
    const svg = result.container.querySelector('svg');
    if (!(svg instanceof SVGSVGElement)) throw new Error('missing svg');
    svg.getBoundingClientRect = () => new DOMRect(0, 0, current.width, current.height);
    return svg;
  };
  return {
    ...result,
    svg: read(),
    update(next: Partial<TopViewerProps>) {
      current = { ...current, ...next };
      result.rerender(<TopViewer {...current} />);
      return read();
    },
  };
}

function viewOf(props: { layout: LayoutDocument; width?: number; height?: number }): { view: Size; frame: Frame } {
  return {
    view: { width: props.width ?? props.layout.viewBox.width, height: props.height ?? props.layout.viewBox.height },
    frame: props.layout.viewBox,
  };
}

function viewBoxAttr(camera: Camera, view: Size, frame: Frame): string {
  const box = viewBoxOf(camera, view, frame);
  return `${formatNum(box.x)} ${formatNum(box.y)} ${formatNum(box.width)} ${formatNum(box.height)}`;
}

function componentEl(svg: SVGSVGElement, id: string): Element {
  const node = svg.querySelector(`[data-component-id="${id}"]`);
  if (!node) throw new Error(`missing ${id}`);
  return node;
}

function pointer(target: Element, type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel', x: number, y: number) {
  const init: PointerEventInit = {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    pointerId: 1,
    button: 0,
    buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
  };
  const EventCtor = typeof PointerEvent === 'function' ? PointerEvent : MouseEvent;
  act(() => {
    target.dispatchEvent(new EventCtor(type, init));
  });
}

// Dispatches to the original target; does not model browser pointer-capture retargeting.
function clickAt(target: Element, x = 0, y = 0) {
  pointer(target, 'pointerdown', x, y);
  pointer(target, 'pointerup', x, y);
  fireEvent.click(target, { clientX: x, clientY: y });
}

function key(target: Element, keyName: string, extra: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key: keyName, bubbles: true, cancelable: true, ...extra });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

function labelFont(svg: SVGSVGElement): string {
  const size = svg.querySelector('[data-layer="labels"] text')?.getAttribute('font-size');
  if (!size) throw new Error('missing label');
  return size;
}

function boardOf(svg: SVGSVGElement): Element {
  const board = svg.firstElementChild;
  if (!board || board.tagName.toLowerCase() !== 'rect') throw new Error('missing board');
  return board;
}

function matrixAttr(matrix: Mat): string {
  return `matrix(${[matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f].map((value) => formatNum(value)).join(' ')})`;
}

it('appends an unknown-asset cue to the interactive aria-label', () => {
  const layout = fixture([component({ id: 'unknown', assetRef: 'synthetic-unlisted', label: 'Unknown module', role: 'robot' })]);
  const { svg } = mount({ layout });

  expect(componentEl(svg, 'unknown').getAttribute('aria-label')?.endsWith(', 알 수 없는 도형')).toBe(true);
});

it('toggles a component once per click and clears on a second click or the board', () => {
  const onSelectedChange = vi.fn();
  const { svg } = mount({ layout, onSelectedChange });
  const mod = componentEl(svg, 'mod');
  const inner = mod.querySelector('rect') ?? mod;
  expect(mod.getAttribute('role')).toBe('button');
  expect(mod.getAttribute('tabindex')).toBe('0');
  expect(mod.getAttribute('aria-label')).toBe('PM, 공정 모듈');
  expect(svg.getAttribute('tabindex')).toBe('0');

  clickAt(inner);
  expect(onSelectedChange).toHaveBeenCalledTimes(1);
  expect(onSelectedChange).toHaveBeenLastCalledWith('mod');
  expect(mod.getAttribute('aria-pressed')).toBe('true');
  expect(componentEl(svg, 'frame').getAttribute('aria-pressed')).toBe('false');
  expect(svg.querySelector('[data-layer="interaction"] [stroke*="--eqv-selection"]')).not.toBeNull();

  clickAt(inner);
  expect(onSelectedChange).toHaveBeenCalledTimes(2);
  expect(onSelectedChange).toHaveBeenLastCalledWith(null);
  expect(mod.getAttribute('aria-pressed')).toBe('false');
  expect(svg.querySelector('[data-layer="interaction"] [stroke*="--eqv-selection"]')).toBeNull();

  clickAt(boardOf(svg));
  expect(onSelectedChange).toHaveBeenCalledTimes(2);

  clickAt(inner);
  clickAt(boardOf(svg));
  expect(onSelectedChange).toHaveBeenLastCalledWith(null);
  expect(mod.getAttribute('aria-pressed')).toBe('false');
});

it('selects the pointerdown component when pointerup and click are retargeted to the svg', () => {
  const { svg } = mount({ layout });
  const mod = componentEl(svg, 'mod');
  pointer(mod.querySelector('rect') ?? mod, 'pointerdown', 20, 20);
  pointer(svg, 'pointerup', 20, 20);
  fireEvent.click(svg);
  expect(mod.getAttribute('aria-pressed')).toBe('true');

  pointer(boardOf(svg), 'pointerdown', 20, 20);
  pointer(svg, 'pointerup', 20, 20);
  fireEvent.click(mod);
  expect(mod.getAttribute('aria-pressed')).toBe('false');

  fireEvent.click(mod);
  expect(mod.getAttribute('aria-pressed')).toBe('true');
});

it.each(['pointerup', 'pointercancel'] as const)('captures only after the drag threshold and releases on %s', (end) => {
  const { svg } = mount({ layout });
  let captured = false;
  svg.setPointerCapture = () => { captured = true; };
  svg.hasPointerCapture = () => captured;
  svg.releasePointerCapture = () => { captured = false; };

  pointer(componentEl(svg, 'mod'), 'pointerdown', 20, 20);
  expect(captured).toBe(false);
  pointer(svg, 'pointermove', 23, 20);
  expect(captured).toBe(false);
  pointer(svg, 'pointermove', 24, 20);
  expect(captured).toBe(true);
  pointer(svg, end, 24, 20);
  expect(captured).toBe(false);
});

it('toggles the focused component with Enter and Space and clears it with Escape', () => {
  const onSelectedChange = vi.fn();
  const { svg } = mount({ layout, onSelectedChange });
  const mod = componentEl(svg, 'mod');
  act(() => {
    if (mod instanceof HTMLElement || mod instanceof SVGElement) mod.focus();
  });
  fireEvent.focusIn(mod);
  const enter = key(mod, 'Enter');
  expect(enter.defaultPrevented).toBe(false);
  expect(mod.getAttribute('aria-pressed')).toBe('true');
  expect(document.activeElement).toBe(mod);
  const space = key(mod, ' ');
  expect(space.defaultPrevented).toBe(true);
  expect(mod.getAttribute('aria-pressed')).toBe('false');
  expect(document.activeElement).toBe(mod);
  key(mod, 'Enter');
  key(screen.getByRole('button', { name: '확대' }), 'Escape');
  expect(onSelectedChange).toHaveBeenLastCalledWith(null);
  expect(mod.getAttribute('aria-pressed')).toBe('false');
  expect(document.activeElement).toBe(mod);
});

it('pans after 4px and swallows the click, and pointercancel does not click', () => {
  const onSelectedChange = vi.fn();
  const { svg } = mount({ layout, onSelectedChange });
  fireEvent.click(screen.getByRole('button', { name: '확대' }));
  const zoomed = svg.getAttribute('viewBox');
  clickAt(componentEl(svg, 'mod'));
  expect(componentEl(svg, 'mod').getAttribute('aria-pressed')).toBe('true');

  pointer(svg, 'pointerdown', 20, 20);
  pointer(svg, 'pointermove', 24, 20);
  pointer(svg, 'pointerup', 24, 20);
  fireEvent.click(componentEl(svg, 'other'));
  expect(componentEl(svg, 'mod').getAttribute('aria-pressed')).toBe('true');
  expect(componentEl(svg, 'other').getAttribute('aria-pressed')).toBe('false');
  expect(svg.getAttribute('viewBox')).not.toBe(zoomed);
  expect(onSelectedChange).toHaveBeenCalledTimes(1);

  const beforeReturn = svg.getAttribute('viewBox');
  pointer(svg, 'pointerdown', 20, 20);
  pointer(svg, 'pointermove', 28, 20);
  expect(svg.getAttribute('viewBox')).not.toBe(beforeReturn);
  pointer(svg, 'pointermove', 20, 20);
  expect(svg.getAttribute('viewBox')).toBe(beforeReturn);
  pointer(svg, 'pointerup', 20, 20);
  fireEvent.click(componentEl(svg, 'other'));
  expect(componentEl(svg, 'mod').getAttribute('aria-pressed')).toBe('true');
  expect(componentEl(svg, 'other').getAttribute('aria-pressed')).toBe('false');

  pointer(componentEl(svg, 'other'), 'pointerdown', 0, 0);
  pointer(componentEl(svg, 'other'), 'pointermove', 8, 0);
  pointer(componentEl(svg, 'other'), 'pointercancel', 8, 0);
  fireEvent.click(componentEl(svg, 'other'));
  expect(componentEl(svg, 'mod').getAttribute('aria-pressed')).toBe('true');
  clickAt(componentEl(svg, 'other'));
  expect(componentEl(svg, 'other').getAttribute('aria-pressed')).toBe('true');
});

it('follows a controlled selection without calling back, and ignores a click the owner drops', () => {
  const onSelectedChange = vi.fn();
  const viewed = mount({ layout, selectedId: null, onSelectedChange });
  expect(onSelectedChange).not.toHaveBeenCalled();
  viewed.update({ selectedId: 'mod' });
  expect(componentEl(viewed.svg, 'mod').getAttribute('aria-pressed')).toBe('true');
  expect(viewed.svg.querySelector('[data-layer="interaction"] [stroke*="--eqv-selection"]')).not.toBeNull();
  expect(onSelectedChange).not.toHaveBeenCalled();

  clickAt(componentEl(viewed.svg, 'other'));
  expect(onSelectedChange).toHaveBeenCalledTimes(1);
  expect(onSelectedChange).toHaveBeenCalledWith('other');
  expect(componentEl(viewed.svg, 'mod').getAttribute('aria-pressed')).toBe('true');
  expect(componentEl(viewed.svg, 'other').getAttribute('aria-pressed')).toBe('false');

  viewed.update({ selectedId: null });
  expect(componentEl(viewed.svg, 'mod').getAttribute('aria-pressed')).toBe('false');
  expect(viewed.svg.querySelector('[data-layer="interaction"] [stroke*="--eqv-selection"]')).toBeNull();
});

it('keeps aria-pressed through a settled relayout and a level that is hidden and shown again', () => {
  vi.useFakeTimers();
  const onSelectedChange = vi.fn();
  const viewed = mount({ layout, selectedId: 'secret', onSelectedChange });
  expect(componentEl(viewed.svg, 'secret').getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: '확대' }));
  act(() => {
    vi.advanceTimersByTime(150);
  });
  expect(componentEl(viewed.svg, 'secret').getAttribute('aria-pressed')).toBe('true');

  viewed.update({ visibleLevelIds: ['level-main'] });
  const hidden = componentEl(viewed.svg, 'secret');
  expect(hidden.getAttribute('data-hidden')).toBe('true');
  expect(hidden.hasAttribute('aria-pressed')).toBe(false);
  expect(hidden.getAttribute('role')).toBeNull();
  viewed.update({ visibleLevelIds: undefined });
  expect(componentEl(viewed.svg, 'secret').getAttribute('aria-pressed')).toBe('true');
  expect(onSelectedChange).not.toHaveBeenCalled();
});

it('draws focus rings when keyboard input follows pointer focus', () => {
  const { svg } = mount({ layout });
  const mod = componentEl(svg, 'mod');
  pointer(mod, 'pointerdown', 0, 0);
  fireEvent.focusIn(mod);
  expect(svg.querySelector('[data-layer="interaction"] [stroke*="--eqv-board"]')).toBeNull();
  key(mod, 'Tab');
  const shapes = Array.from(svg.querySelectorAll('[data-layer="interaction"] rect'));
  expect(shapes).toHaveLength(2);
  expect(shapes.some((shape) => shape.getAttribute('stroke')?.includes('--eqv-board'))).toBe(true);
  expect(shapes.some((shape) => shape.getAttribute('stroke')?.includes('--eqv-selection'))).toBe(true);
});

it('still draws focus rings when keyboard focus follows a pointerdown that did not move focus', () => {
  const { svg } = mount({ layout });
  const px = Math.min(800 / layout.viewBox.width, 600 / layout.viewBox.height);
  const scene = buildScene(layout, { width: 800, height: 600, pxPerUnit: px, interactive: true });
  pointer(componentEl(svg, 'other'), 'pointerdown', 0, 0);
  key(svg, 'Tab');
  fireEvent.focusIn(componentEl(svg, 'mod'));
  const marks = Array.from(svg.querySelectorAll('[data-layer="interaction"] g')).map((node) => node.getAttribute('transform'));
  expect(marks).toContain(matrixAttr(scene.components.get('mod')!.matrix));
  expect(marks).not.toContain(matrixAttr(scene.components.get('other')!.matrix));
});

it('restores focus rings on handled keyboard input after a layout replacement retains native focus', () => {
  const viewed = mount({ layout });
  const mod = componentEl(viewed.svg, 'mod') as SVGElement;
  key(viewed.svg, 'Tab');
  act(() => mod.focus());
  expect(viewed.svg.querySelector('[data-layer="interaction"] [stroke*="--eqv-board"]')).not.toBeNull();

  viewed.update({ layout: { ...layout, name: 'Replacement' } });
  expect(componentEl(viewed.svg, 'mod')).toBe(mod);
  expect(document.activeElement).toBe(mod);
  expect(viewed.svg.querySelector('[data-layer="interaction"] [stroke*="--eqv-board"]')).toBeNull();
  key(mod, 'Enter');
  expect(viewed.svg.querySelector('[data-layer="interaction"] [stroke*="--eqv-board"]')).not.toBeNull();
  expect(document.activeElement).toBe(mod);
});

it('removes the native outline from a focused interactive group while keeping the svg focus cue', () => {
  const { svg } = mount({ layout });
  const mod = componentEl(svg, 'mod') as SVGElement;
  act(() => mod.focus());
  expect(document.activeElement).toBe(mod);
  expect(mod.style.outline).toBe('none');
  expect(getComputedStyle(mod).outlineStyle).toBe('none');
  expect(svg.style.outline).toBe('');
});

it('zooms from the wheel toward the cursor, lets a limit through, and drops the listener on unmount', () => {
  const remove = vi.spyOn(SVGSVGElement.prototype, 'removeEventListener');
  const { svg, unmount } = mount({ layout });
  const initial = svg.getAttribute('viewBox');
  const out = new WheelEvent('wheel', { deltaY: 80, deltaMode: 0, clientX: 10, clientY: 20, cancelable: true, bubbles: true });
  act(() => {
    svg.dispatchEvent(out);
  });
  expect(out.defaultPrevented).toBe(false);
  expect(svg.getAttribute('viewBox')).toBe(initial);

  const inward = new WheelEvent('wheel', { deltaY: -80, deltaMode: 0, clientX: 10, clientY: 20, cancelable: true, bubbles: true });
  act(() => {
    svg.dispatchEvent(inward);
  });
  expect(inward.defaultPrevented).toBe(true);
  const [x0, , w0] = (initial ?? '').split(/[\s,]+/).map(Number);
  const [x1, , w1] = (svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
  expect(w1).not.toBeCloseTo(w0 ?? 0, 3);
  expect(x1).not.toBeCloseTo(x0 ?? 0, 3);

  const toMax = new WheelEvent('wheel', { deltaY: -5000, clientX: 10, clientY: 20, cancelable: true, bubbles: true });
  act(() => {
    svg.dispatchEvent(toMax);
  });
  const capped = svg.getAttribute('viewBox');
  const more = new WheelEvent('wheel', { deltaY: -100, clientX: 10, clientY: 20, cancelable: true, bubbles: true });
  act(() => {
    svg.dispatchEvent(more);
  });
  expect(more.defaultPrevented).toBe(false);
  expect(svg.getAttribute('viewBox')).toBe(capped);

  unmount();
  expect(remove.mock.calls.some((args) => args[0] === 'wheel')).toBe(true);
});

it('zooms and fits from the toolbar the way the camera does', () => {
  const { svg } = mount({ layout });
  const { view, frame } = viewOf({ layout });
  const zoomIn = screen.getByRole('button', { name: '확대' });
  const zoomOut = screen.getByRole('button', { name: '축소' });
  const fit = screen.getByRole('button', { name: '맞춤' });
  expect(zoomIn.hasAttribute('disabled')).toBe(false);
  expect(zoomOut.hasAttribute('disabled')).toBe(true);
  expect(fit.hasAttribute('disabled')).toBe(true);
  expect(zoomOut.style.opacity).toBe('0.4');
  expect(fit.style.opacity).toBe('0.4');
  expect(Number(zoomIn.style.opacity || 1)).toBeGreaterThanOrEqual(1);

  let camera = defaultCamera(frame);
  fireEvent.click(zoomIn);
  camera = zoomAtPoint(camera, camera.zoom * 1.25, { x: camera.cx, y: camera.cy }, frame);
  expect(svg.getAttribute('viewBox')).toBe(viewBoxAttr(camera, view, frame));
  expect(zoomOut.hasAttribute('disabled')).toBe(false);
  expect(fit.hasAttribute('disabled')).toBe(false);
  expect(Number(zoomOut.style.opacity || 1)).toBeGreaterThanOrEqual(1);
  expect(Number(fit.style.opacity || 1)).toBeGreaterThanOrEqual(1);

  fireEvent.click(zoomOut);
  camera = zoomAtPoint(camera, camera.zoom / 1.25, { x: camera.cx, y: camera.cy }, frame);
  expect(svg.getAttribute('viewBox')).toBe(viewBoxAttr(camera, view, frame));
  expect(fit.hasAttribute('disabled')).toBe(true);
  expect(fit.style.opacity).toBe('0.4');

  for (let i = 0; i < 12 && !zoomIn.hasAttribute('disabled'); i += 1) fireEvent.click(zoomIn);
  expect(zoomIn.hasAttribute('disabled')).toBe(true);
  expect(zoomIn.style.opacity).toBe('0.4');
  const capped = svg.getAttribute('viewBox');
  fireEvent.click(zoomIn);
  expect(svg.getAttribute('viewBox')).toBe(capped);
  fireEvent.click(fit);
  expect(svg.getAttribute('viewBox')).toBe(viewBoxAttr(defaultCamera(frame), view, frame));
  expect(fit.hasAttribute('disabled')).toBe(true);
});

it('zooms and pans from the keyboard, and a zoom-1 pan disables only 축소', () => {
  const { svg } = mount({ layout });
  const { view, frame } = viewOf({ layout });
  const initial = svg.getAttribute('viewBox');
  for (const name of ['ArrowRight', '+', '-']) {
    const modified = key(svg, name, { ctrlKey: true });
    expect(modified.defaultPrevented).toBe(false);
    expect(svg.getAttribute('viewBox')).toBe(initial);
  }
  expect(key(svg, '=', { metaKey: true }).defaultPrevented).toBe(false);
  expect(key(svg, '0', { altKey: true }).defaultPrevented).toBe(false);

  let camera = defaultCamera(frame);
  const steps: { key: string; apply: (current: Camera) => Camera }[] = [
    { key: '+', apply: (current) => zoomAtPoint(current, current.zoom * 1.25, { x: current.cx, y: current.cy }, frame) },
    { key: '=', apply: (current) => zoomAtPoint(current, current.zoom * 1.25, { x: current.cx, y: current.cy }, frame) },
    { key: '-', apply: (current) => zoomAtPoint(current, current.zoom / 1.25, { x: current.cx, y: current.cy }, frame) },
    { key: 'ArrowLeft', apply: (current) => panByFraction(current, -0.1, 0, view, frame) },
    { key: 'ArrowUp', apply: (current) => panByFraction(current, 0, -0.1, view, frame) },
    { key: 'ArrowDown', apply: (current) => panByFraction(current, 0, 0.1, view, frame) },
    { key: '0', apply: () => defaultCamera(frame) },
  ];
  for (const step of steps) {
    const event = key(svg, step.key);
    camera = step.apply(camera);
    expect(event.defaultPrevented).toBe(true);
    expect(svg.getAttribute('viewBox')).toBe(viewBoxAttr(camera, view, frame));
  }

  const pan = key(svg, 'ArrowRight');
  camera = panByFraction(camera, 0.1, 0, view, frame);
  expect(pan.defaultPrevented).toBe(true);
  expect(svg.getAttribute('viewBox')).toBe(viewBoxAttr(camera, view, frame));
  expect(screen.getByRole('button', { name: '축소' }).hasAttribute('disabled')).toBe(true);
  expect(screen.getByRole('button', { name: '맞춤' }).hasAttribute('disabled')).toBe(false);
});

it('rebuilds label size 150ms after the last zoom and not before', () => {
  vi.useFakeTimers();
  const { svg } = mount({ layout });
  const zoomIn = screen.getByRole('button', { name: '확대' });
  const original = labelFont(svg);
  fireEvent.click(zoomIn);
  expect(labelFont(svg)).toBe(original);
  act(() => {
    vi.advanceTimersByTime(100);
  });
  expect(labelFont(svg)).toBe(original);
  fireEvent.click(zoomIn);
  expect(vi.getTimerCount()).toBe(1);
  act(() => {
    vi.advanceTimersByTime(149);
  });
  expect(labelFont(svg)).toBe(original);
  act(() => {
    vi.advanceTimersByTime(1);
  });
  expect(labelFont(svg)).not.toBe(original);
});

it('cancels a pending relayout when layers change or the view unmounts', () => {
  vi.useFakeTimers();
  const viewed = mount({ layout });
  const original = labelFont(viewed.svg);
  fireEvent.click(screen.getByRole('button', { name: '확대' }));
  expect(vi.getTimerCount()).toBe(1);
  viewed.update({ layers: { interfaces: false } });
  expect(vi.getTimerCount()).toBe(0);
  const zoomed = labelFont(viewed.svg);
  expect(zoomed).not.toBe(original);
  act(() => {
    vi.advanceTimersByTime(500);
  });
  expect(labelFont(viewed.svg)).toBe(zoomed);

  fireEvent.click(screen.getByRole('button', { name: '확대' }));
  expect(vi.getTimerCount()).toBe(1);
  viewed.unmount();
  expect(vi.getTimerCount()).toBe(0);
  act(() => {
    vi.advanceTimersByTime(500);
  });
});

it('does not rebuild the scene when the view is only panned', () => {
  vi.useFakeTimers();
  const { svg } = mount({ layout });
  const original = labelFont(svg);
  const initial = svg.getAttribute('viewBox');
  key(svg, 'ArrowRight');
  expect(vi.getTimerCount()).toBe(0);
  expect(svg.getAttribute('viewBox')).not.toBe(initial);
  act(() => {
    vi.advanceTimersByTime(200);
  });
  expect(labelFont(svg)).toBe(original);
});

it('keeps the same DOM node for a component that the selection did not touch', () => {
  const { svg } = mount({ layout });
  const selected = componentEl(svg, 'mod');
  const other = componentEl(svg, 'other');
  clickAt(selected);
  expect(componentEl(svg, 'mod')).toBe(selected);
  expect(componentEl(svg, 'other')).toBe(other);
  expect(selected.getAttribute('aria-pressed')).toBe('true');
  expect(svg.querySelectorAll('[data-component-id]')).toHaveLength(layout.components.length);
});

it('paints the toolbar with documented tokens', () => {
  mount({ layout });
  for (const name of ['확대', '축소', '맞춤']) {
    const button = screen.getByRole('button', { name });
    expect(button.getAttribute('type')).toBe('button');
    for (const prop of ['backgroundColor', 'color', 'borderColor'] as const) {
      const value = button.style[prop];
      expect(value).toMatch(/^var\(--eqv-[a-z-]+, #[0-9a-f]{6}\)$/);
      expect(TOKENS.has(value.match(/--eqv-[a-z-]+/)?.[0] ?? '')).toBe(true);
    }
  }
});

it('stacks interaction under the overlays and does not repeat the scene capability layer', () => {
  const { svg } = mount({ layout });
  const direct = Array.from(svg.children).map((node) => node.getAttribute('data-layer')
    ?? (node.hasAttribute('data-component-id') ? 'component' : node.tagName.toLowerCase()));
  const lastComponent = direct.lastIndexOf('component');
  expect(direct[0]).toBe('rect');
  expect(direct.slice(lastComponent + 1)).toEqual([
    'interaction', 'interfaces', 'capabilities', 'labels', 'badges', 'chips',
  ]);
  expect(direct.filter((item) => item === 'capabilities')).toHaveLength(1);
});

it('stacks capabilities, highlight, then interaction when a highlight is present', () => {
  const id = layout.components[0]!.id;
  const { svg } = mount({ layout, selectedId: id, highlight: { componentIds: [id] } });
  const layers = Array.from(svg.children).map((node) => node.getAttribute('data-layer'));
  expect(layers.filter((layer) => ['capabilities', 'highlight', 'interaction'].includes(layer ?? '')))
    .toEqual(['capabilities', 'highlight', 'interaction']);
});

it('draws a replay layer only when replay is set, between capabilities and highlight, and keeps click selection', () => {
  const bare = mount({ layout });
  expect(bare.svg.querySelector('[data-layer="replay"]')).toBeNull();

  const state: SceneState = {
    equipmentId: 'EQ-FX',
    at: '2026-10-17T09:00:00.000',
    appliedSeq: 1,
    binding: { layoutId: 'fixture', mappingHash: `sha256:${'a'.repeat(64)}` },
    materials: [],
    components: [{ componentId: 'mod', activity: 'processing', activityEvidence: 'observed', occurrenceIds: [] }],
    markers: [],
  };
  const withReplay = mount({ layout, replay: { state } });
  const replayEl = withReplay.svg.querySelector('[data-layer="replay"]');
  expect(replayEl).not.toBeNull();
  expect(replayEl?.getAttribute('aria-hidden')).toBe('true');
  expect(replayEl?.getAttribute('pointer-events')).toBe('none');
  const mod = componentEl(withReplay.svg, 'mod');
  clickAt(mod);
  expect(mod.getAttribute('aria-pressed')).toBe('true');

  const highlighted = mount({ layout, replay: { state }, highlight: { componentIds: ['mod'] } });
  const order = Array.from(highlighted.svg.children).map((node) => node.getAttribute('data-layer'))
    .filter((name): name is string => ['capabilities', 'replay', 'highlight', 'interaction'].includes(name ?? ''));
  expect(order).toEqual(['capabilities', 'replay', 'highlight', 'interaction']);
});

it('renders the host control slot instead of the default buttons, wired to the same zoom', () => {
  const { svg } = mount({
    layout,
    renderControls: (c) => (
      <>
        <button type="button" disabled={!c.canZoomIn} onClick={c.zoomIn}>host-in</button>
        <button type="button" disabled={!c.canZoomOut} onClick={c.zoomOut}>host-out</button>
        <button type="button" disabled={!c.canFit} onClick={c.fit}>host-fit</button>
      </>
    ),
  });
  expect(screen.queryByRole('button', { name: '확대' })).toBeNull();
  const home = svg.getAttribute('viewBox');
  expect(screen.getByRole('button', { name: 'host-out' })).toHaveProperty('disabled', true);
  expect(screen.getByRole('button', { name: 'host-fit' })).toHaveProperty('disabled', true);
  fireEvent.click(screen.getByRole('button', { name: 'host-in' }));
  const zoomed = svg.getAttribute('viewBox');
  expect(zoomed).not.toBe(home);
  expect(screen.getByRole('button', { name: 'host-out' })).toHaveProperty('disabled', false);
  fireEvent.click(screen.getByRole('button', { name: 'host-in' }));
  expect(svg.getAttribute('viewBox')).not.toBe(zoomed);
  fireEvent.click(screen.getByRole('button', { name: 'host-out' }));
  expect(svg.getAttribute('viewBox')).toBe(zoomed);
  fireEvent.click(screen.getByRole('button', { name: 'host-fit' }));
  expect(svg.getAttribute('viewBox')).toBe(home);
});
