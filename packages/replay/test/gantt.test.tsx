// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { SiteWallClock } from '@eqv/core';
import { FocusGantt } from '../src/index.js';
import { batch, equipmentLayout, time, timeline } from './data.js';

afterEach(cleanup);

function setup(cursor: SiteWallClock = time('10:06:00'), expanded: string[] = []) {
  const handlers = { onCursorChange: vi.fn(), onSelectOccurrence: vi.fn(), onToggleExpand: vi.fn() };
  const view = render(<FocusGantt timeline={timeline} layout={equipmentLayout} batch={batch} cursor={cursor} selectedOccurrenceId={null}
    selectedComponentId={null} expanded={new Set(expanded)} {...handlers} />);
  return { ...handlers, view, svg: view.container.querySelector('svg')! };
}

it('draws one pattern per evidence level, named in the legend, and a bar for each level uses it', () => {
  const { svg } = setup();
  for (const level of ['observed', 'derived', 'unknown']) expect(svg.querySelectorAll(`pattern[id$="-${level}"]`)).toHaveLength(1);
  const legend = within(screen.getByRole('list', { name: '범례' }));
  for (const text of ['관측 — 단색', '파생 — 사선 무늬', '미확인 — 교차 무늬']) expect(legend.getByText(text)).toBeTruthy();
  const bar = svg.querySelector('[data-evidence="derived"] rect[data-pattern]')!;
  expect(bar.getAttribute('fill')).toMatch(/^url\(#.*-derived\)$/);
});

it('draws the Binding boundary, Watermark line and shade, Time Anomaly band and Data Quality ticks', () => {
  const { svg } = setup();
  const marker = (name: string) => svg.querySelectorAll(`[data-marker="${name}"]`);
  expect(marker('binding-boundary')).toHaveLength(1);
  expect(marker('binding-boundary')[0]!.textContent).toContain('Binding 경계');
  expect(marker('watermark')).toHaveLength(1);
  expect(marker('after-watermark')[0]!.textContent).toBe('Watermark 이후');
  expect(marker('time-anomaly')[0]!.textContent).toContain('시각 역전');
  expect(marker('dqi')).toHaveLength(timeline.issues.length);
  expect(marker('occupancy-conflict').length).toBeGreaterThan(0);
});

it('moves the cursor with ←/→ to the previous/next breakpoint and Home/End to the range ends', () => {
  const { onCursorChange } = setup();
  const slider = screen.getByRole('slider', { name: '커서 시각' });
  expect(slider.getAttribute('aria-valuetext')).toBe(time('10:06:00'));
  expect(slider.getAttribute('aria-valuemax')).toBe(String(Number(slider.getAttribute('aria-valuemin')) + 30 * 60_000 - 1));
  for (const [key, expected] of [['ArrowLeft', time('10:05:00')], ['ArrowRight', time('10:07:00')],
    ['Home', time('10:00:00')], ['End', '2026-01-01T10:29:59.999']] as const) {
    fireEvent.keyDown(slider, { key });
    expect(onCursorChange).toHaveBeenLastCalledWith(expected);
  }
});

it('seeks on pointer down over the axis', () => {
  const { onCursorChange } = setup();
  const slider = screen.getByRole('slider', { name: '커서 시각' });
  slider.getBoundingClientRect = () => ({ left: 100, width: 800, top: 0, height: 20, right: 900, bottom: 20, x: 100, y: 0, toJSON: () => ({}) });
  fireEvent.pointerDown(slider, { clientX: 500, pointerId: 1 });
  expect(onCursorChange).toHaveBeenCalledWith(time('10:15:00'));
});

it('selects an Occurrence on a bar click without moving the cursor, and marks open Occurrences with an open end', () => {
  const { onCursorChange, onSelectOccurrence, svg } = setup(time('10:26:00'));
  const bar = Array.from(svg.querySelectorAll('[data-bar="material"][data-occurrence-id="occ-open"]')).at(-1)!;
  expect(bar.getAttribute('aria-label')).toMatch(/열림 · 위치 미확인$/);
  expect(bar.querySelector('[data-mark="open-end"]')).not.toBeNull();
  fireEvent.pointerDown(bar);
  fireEvent.pointerUp(bar);
  fireEvent.click(bar);
  expect(onSelectOccurrence).toHaveBeenCalledWith('occ-open');
  expect(onCursorChange).not.toHaveBeenCalled();
  expect(svg.querySelector('[data-bar][data-occurrence-id="occ-pm1-process"] [data-mark="open-end"]')).toBeNull();
});

it('expands a Component into Holding Site sublanes through its disclosure button', () => {
  const { onToggleExpand } = setup();
  fireEvent.click(screen.getByRole('button', { name: /^ll-a.* Holding Site 펼치기$/ }));
  expect(onToggleExpand).toHaveBeenCalledWith('ll-a');
  cleanup();
  setup(time('10:06:00'), ['ll-a']);
  expect(screen.getByRole('button', { name: /^ll-a.* Holding Site 접기$/ }).getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByRole('group', { name: /^레인 .*slot-1$/ })).toBeTruthy();
});
