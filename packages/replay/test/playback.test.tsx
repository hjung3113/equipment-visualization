// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { wallClockToMillis, type SiteWallClock } from '@eqv/core';
import { PlaybackControls, usePlayback, type PlaybackControlsProps, type PlaybackScheduler, type PlaybackSpeed } from '../src/index.js';
import { time } from './data.js';

afterEach(cleanup);

const range = { from: time('10:00:00'), to: time('10:00:10') };
function manual() {
  let now = 1000;
  let pending: (() => void) | null = null;
  let cancelled = 0;
  const scheduler: PlaybackScheduler = { now: () => now, request: (cb) => { pending = cb; return 1; }, cancel: () => { pending = null; cancelled += 1; } };
  return {
    scheduler,
    frame: (gap: number) => { now += gap; const cb = pending; pending = null; act(() => cb?.()); },
    stale: () => pending,
    wasCancelled: () => cancelled > 0,
  };
}
function harness(start: SiteWallClock, scheduler: PlaybackScheduler) {
  return renderHook(() => {
    const [cursor, setCursor] = useState<SiteWallClock>(start);
    return { cursor, ...usePlayback({ cursor, range, onCursorChange: setCursor, scheduler }) };
  });
}
const ms = (t: SiteWallClock) => wallClockToMillis(t) - wallClockToMillis(range.from);

it('advances by floor(min(gap, 250) * speed) integer ms per frame, and keeps accumulating without a re-subscribe', () => {
  const clock = manual();
  const { result } = harness(range.from, clock.scheduler);
  act(() => result.current.setSpeed(2));
  act(() => result.current.play());
  clock.frame(100);
  expect(ms(result.current.cursor)).toBe(200);
  clock.frame(100);
  expect(ms(result.current.cursor)).toBe(400);
  clock.frame(1000);
  expect(ms(result.current.cursor)).toBe(400 + 500);
});

it.each([[0.25, 3, 0], [0.25, 10, 2], [4, 1000, 1000]] as [PlaybackSpeed, number, number][])('x%s with a %i ms gap moves %i ms', (speed, gap, moved) => {
  const clock = manual();
  const { result } = harness(range.from, clock.scheduler);
  act(() => result.current.setSpeed(speed));
  act(() => result.current.play());
  clock.frame(gap);
  expect(ms(result.current.cursor)).toBe(moved);
});

it('stops at range.to - 1 ms and pauses; play at that end restarts at range.from', () => {
  const clock = manual();
  const { result } = harness(time('10:00:09'), clock.scheduler);
  act(() => result.current.setSpeed(4));
  act(() => result.current.play());
  clock.frame(250);
  clock.frame(250);
  expect(ms(result.current.cursor)).toBe(9999);
  expect(result.current.playing).toBe(false);
  act(() => result.current.play());
  expect(result.current.cursor).toBe(range.from);
  expect(result.current.playing).toBe(true);
});

it('pauses when the document becomes hidden and does not resume when visible again', () => {
  const clock = manual();
  const { result } = harness(range.from, clock.scheduler);
  act(() => result.current.play());
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
  expect(result.current.playing).toBe(false);
  hidden.mockReturnValue(false);
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
  expect(result.current.playing).toBe(false);
});

it('a callback left over after pause or unmount does not move the cursor, and the frame is cancelled', () => {
  const clock = manual();
  const onCursorChange = vi.fn();
  const { result, unmount } = renderHook(() => usePlayback({ cursor: range.from, range, onCursorChange, scheduler: clock.scheduler }));
  act(() => result.current.play());
  const leftover = clock.stale()!;
  act(() => result.current.pause());
  onCursorChange.mockClear();
  leftover();
  expect(onCursorChange).not.toHaveBeenCalled();
  act(() => result.current.play());
  const second = clock.stale()!;
  unmount();
  expect(clock.wasCancelled()).toBe(true);
  second();
  expect(onCursorChange).not.toHaveBeenCalled();
});

it('schedules nothing without a cursor or range, and resetKey pauses and restores x1', () => {
  const clock = manual();
  const { result, rerender } = renderHook(({ key }) => usePlayback({ cursor: null, range: null, onCursorChange: () => undefined, resetKey: key, scheduler: clock.scheduler }),
    { initialProps: { key: 'a' } });
  act(() => result.current.play());
  expect(clock.stale()).toBeNull();
  const live = renderHook(({ key }) => usePlayback({ cursor: range.from, range, onCursorChange: () => undefined, resetKey: key, scheduler: clock.scheduler }),
    { initialProps: { key: 'a' } });
  act(() => { live.result.current.setSpeed(4); live.result.current.play(); });
  live.rerender({ key: 'b' });
  expect([live.result.current.playing, live.result.current.speed]).toEqual([false, 1]);
  rerender({ key: 'b' });
});

const controls = (over: Partial<PlaybackControlsProps> = {}, sequence: Partial<PlaybackControlsProps['sequence']> = {}) => {
  const props: PlaybackControlsProps = { playing: false, onPlay: vi.fn(), onPause: vi.fn(), speed: 1, onSpeedChange: vi.fn(),
    onPreviousBreakpoint: vi.fn(), onNextBreakpoint: vi.fn(),
    sequence: { available: true, active: false, onToggle: vi.fn(), onPrevious: null, onNext: null, step: null, ...sequence }, ...over };
  render(<PlaybackControls {...props} />);
  return props;
};

it('PlaybackControls: one play/pause button, the five speeds, breakpoint buttons', () => {
  const props = controls();
  fireEvent.click(screen.getByRole('button', { name: '재생' }));
  expect(props.onPlay).toHaveBeenCalled();
  expect((screen.getByRole('combobox', { name: '속도' }) as HTMLSelectElement).value).toBe('1');
  expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['x0.25', 'x0.5', 'x1', 'x2', 'x4']);
  fireEvent.change(screen.getByRole('combobox', { name: '속도' }), { target: { value: '4' } });
  expect(props.onSpeedChange).toHaveBeenCalledWith(4);
  cleanup();
  controls({ playing: true, onPreviousBreakpoint: null });
  screen.getByRole('button', { name: '일시정지' });
  expect((screen.getByRole('button', { name: '이전 단계' }) as HTMLButtonElement).disabled).toBe(true);
});

it('PlaybackControls: record buttons are disabled at the ends; the status names the seq and time only in sequence mode', () => {
  controls({}, { active: true, step: { seq: 7, at: time('10:02:00') }, onPrevious: vi.fn(), onNext: null });
  expect((screen.getByRole('button', { name: '이전 record' }) as HTMLButtonElement).disabled).toBe(false);
  expect((screen.getByRole('button', { name: '다음 record' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole('button', { name: 'Sequence step' }).getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByRole('status').textContent).toBe('Sequence step · Record Sequence 7 · 2026-01-01T10:02:00.000');
  cleanup();
  controls();
  expect(screen.getByRole('status').textContent).toBe('');
});
