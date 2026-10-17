import { useCallback, useEffect, useRef, useState } from 'react';
import { millisToWallClock, wallClockToMillis, type SiteWallClock } from '@eqv/core';

export const SPEEDS = [0.25, 0.5, 1, 2, 4] as const;
export type PlaybackSpeed = (typeof SPEEDS)[number];
/** Longest wall-clock gap one frame may account for, so a throttled or stalled frame cannot jump the cursor. */
const MAX_FRAME_MS = 250;

export interface PlaybackScheduler {
  now: () => number;
  request: (callback: () => void) => number;
  cancel: (handle: number) => void;
}
const browserScheduler: PlaybackScheduler = {
  now: () => performance.now(),
  request: (callback) => requestAnimationFrame(() => callback()),
  cancel: (handle) => cancelAnimationFrame(handle),
};

export interface UsePlaybackOptions {
  cursor: SiteWallClock | null;
  range: { from: SiteWallClock; to: SiteWallClock } | null;
  onCursorChange: (at: SiteWallClock) => void;
  /** Pauses and resets the speed to x1 when it changes (a different equipment or entry). */
  resetKey?: string;
  scheduler?: PlaybackScheduler;
}

/**
 * Plays the time cursor at `speed` screen-time (REPLAY-CONTRACT 재생 속도). Each frame adds `floor(min(elapsed, 250 ms) * speed)`
 * integer milliseconds taken from `scheduler.now()`. Reaching `range.to` stops at `range.to - 1 ms`. Playback moves the cursor
 * only; the caller seeks there, so a playing frame and a manual seek to the same time show the same state.
 */
export function usePlayback({ cursor, range, onCursorChange, resetKey, scheduler = browserScheduler }: UsePlaybackOptions) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<PlaybackSpeed>(1);
  const latest = useRef({ cursor, range, speed, onCursorChange });
  useEffect(() => { latest.current = { cursor, range, speed, onCursorChange }; });

  const [seenKey, setSeenKey] = useState(resetKey);
  if (seenKey !== resetKey) {
    setSeenKey(resetKey);
    setPlaying(false);
    setSpeed(1);
  }

  const ready = cursor !== null && range !== null;
  const play = useCallback(() => {
    const { cursor: at, range: span } = latest.current;
    if (at === null || span === null) return;
    if (wallClockToMillis(at) >= wallClockToMillis(span.to) - 1) latest.current.onCursorChange(span.from);
    setPlaying(true);
  }, []);
  const pause = useCallback(() => setPlaying(false), []);

  // Losing a valid input pauses; recovery never restarts playback, only an explicit play() does.
  useEffect(() => { if (!ready) setPlaying(false); }, [ready]);

  useEffect(() => {
    if (!playing) return undefined;
    let previous = scheduler.now();
    let handle = 0;
    let active = true;
    const frame = () => {
      if (!active) return;
      const current = latest.current;
      if (current.cursor === null || current.range === null) return;
      const time = scheduler.now();
      const advance = Math.floor(Math.min(Math.max(time - previous, 0), MAX_FRAME_MS) * current.speed);
      previous = time;
      const last = wallClockToMillis(current.range.to) - 1;
      const next = wallClockToMillis(current.cursor) + advance;
      if (next >= last + 1) {
        active = false;
        current.onCursorChange(millisToWallClock(last));
        setPlaying(false);
        return;
      }
      if (advance > 0) {
        current.onCursorChange(millisToWallClock(next));
        // The cursor prop lags one render behind; keep the baseline for a second callback before the re-render.
        latest.current = { ...current, cursor: millisToWallClock(next) };
      }
      handle = scheduler.request(frame);
    };
    const onVisibility = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', onVisibility);
    handle = scheduler.request(frame);
    return () => {
      active = false;
      scheduler.cancel(handle);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [playing, scheduler]);

  return { playing, speed, play, pause, setSpeed };
}
