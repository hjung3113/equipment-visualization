import { expect, it } from 'vitest';
import { diagnoseWallClock, millisToWallClock, parseWallClockRange, siteWallClockSchema, wallClockToMillis, type SiteWallClock } from '../src/index.js';

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

it.each([
  { value: '2026-01-01T10:00:00.000', reason: undefined },
  { value: '2026-01-01T10:00:00.123456', reason: 'fraction-too-long' },
  { value: '2026-01-01T10:00:00.1234', reason: 'fraction-too-long' },
  { value: '2026-01-01T10:00:00', reason: 'fraction-missing' },
  { value: '2026-01-01T10:00:00.000Z', reason: 'offset' },
  { value: '2026-01-01T10:00:00.000+09:00', reason: 'offset' },
  { value: '10:00:00Z', reason: 'offset' },
  { value: '2026-01-01T10:00:00.5', reason: 'malformed' },
  { value: '2026-01-01 10:00:00.000', reason: 'malformed' },
  { value: '', reason: 'malformed' },
])('diagnoses $value as $reason', ({ value, reason }) => {
  const diagnosis = diagnoseWallClock(value);
  expect(diagnosis).toEqual(reason ? { ok: false, reason } : { ok: true });
  expect(diagnosis.ok).toBe(siteWallClockSchema.safeParse(value).success);
});

it.each([
  { from: '2026-01-01T10:00:00.000', to: '2026-01-01T10:30:00.000', result: { ok: true, from: '2026-01-01T10:00:00.000', to: '2026-01-01T10:30:00.000' } },
  { from: '2026-01-01T10:00:00', to: '2026-01-01T10:30:00.000', result: { ok: false, problem: 'format' } },
  { from: '2026-02-30T10:00:00.000', to: '2026-03-01T10:00:00.000', result: { ok: false, problem: 'format' } },
  { from: '2026-01-01T10:30:00.000', to: '2026-01-01T10:30:00.000', result: { ok: false, problem: 'order' } },
  { from: '2026-01-01T11:00:00.000', to: '2026-01-01T10:30:00.000', result: { ok: false, problem: 'order' } },
])('parses the range $from – $to', ({ from, to, result }) => {
  expect(parseWallClockRange(from, to)).toEqual(result);
});
