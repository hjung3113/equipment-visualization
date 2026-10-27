import { expect, it } from 'vitest';
import { occurrenceOverlapsWindow, type SiteWallClock } from '../src/index.js';

const at = (value: string): SiteWallClock => `2026-01-01T${value}.000`;
const boundary = (time: string | null) => ({ seq: 1, at: time === null ? null : at(time) });
const FROM = at('10:00:00');
const TO = at('10:30:00');

it.each([
  { name: 'inside', start: '10:05:00', end: '10:10:00', kept: true },
  { name: 'ends exactly at from', start: '09:50:00', end: '10:00:00', kept: true },
  { name: 'ends before from', start: '09:50:00', end: '09:59:59', kept: false },
  { name: 'starts exactly at to', start: '10:30:00', end: '10:40:00', kept: false },
  { name: 'starts just before to', start: '10:29:59', end: '10:40:00', kept: true },
  { name: 'open', start: '09:00:00', end: null, kept: true },
  { name: 'null start time', start: null, end: '09:00:00', kept: true },
  { name: 'inverted (Time Anomaly)', start: '11:00:00', end: '09:00:00', kept: true },
])('the window [from, to) keeps $name: $kept', ({ start, end, kept }) => {
  const occurrence = { start: boundary(start), end: end === null ? null : boundary(end) };
  expect(occurrenceOverlapsWindow(occurrence as Parameters<typeof occurrenceOverlapsWindow>[0], FROM, TO)).toBe(kept);
});
