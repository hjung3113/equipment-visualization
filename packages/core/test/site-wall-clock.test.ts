import { expect, it } from 'vitest';
import { millisToWallClock, wallClockToMillis, type SiteWallClock } from '../src/index.js';

it.each([
  { at: '0001-01-01T00:00:00.000', next: '0001-01-01T00:00:00.001' },
  { at: '2024-02-29T23:59:59.999', next: '2024-03-01T00:00:00.000' },
  { at: '2100-02-28T23:59:59.999', next: '2100-03-01T00:00:00.000' },
  { at: '2000-02-29T12:00:00.000', next: '2000-02-29T12:00:00.001' },
  { at: '9999-12-31T23:59:59.999', next: undefined },
] as { at: SiteWallClock; next: SiteWallClock | undefined }[])('round-trips $at', ({ at, next }) => {
  const ms = wallClockToMillis(at);
  expect(millisToWallClock(ms)).toBe(at);
  if (next) {
    expect(wallClockToMillis(next)).toBe(ms + 1);
    expect(millisToWallClock(ms + 1)).toBe(next);
  }
});

it('subtracts to plain milliseconds', () => {
  expect(wallClockToMillis('2026-01-01T10:04:30.000') - wallClockToMillis('2026-01-01T10:00:00.000')).toBe(270000);
});

it.each(['2026-13-01T00:00:00.000', '2026-02-30T00:00:00.000', '2026-01-01T24:00:00.000'])('rejects impossible %s', (value) => {
  expect(() => wallClockToMillis(value)).toThrow(RangeError);
});

it.each([0.5, -1, wallClockToMillis('9999-12-31T23:59:59.999') + 1])('rejects instant %s', (ms) => {
  expect(() => millisToWallClock(ms)).toThrow(RangeError);
});
