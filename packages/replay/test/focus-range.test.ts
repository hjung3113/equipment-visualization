import { expect, it } from 'vitest';
import { focusRange } from '../src/index.js';
import { batch, time } from './data.js';

it.each([
  ['occ-pm1-process', '10:05:00', '10:11:00', '10:06:00'],
  ['occ-open', '10:22:30', '10:30:00', '10:24:00'],
  ['occ-time-anomaly', '10:18:00', '10:21:00', '10:20:00'],
])('widens the entry %s by its margin and starts at its start.at', (anchor, from, to, cursor) => {
  const result = focusRange(batch, { entityType: 'occurrence', anchor });
  expect(result.range).toEqual({ from: time(from), to: time(to) });
  expect(result.cursor).toBe(time(cursor));
  expect(result.entry?.id).toBe(anchor);
  expect(result.notice).toBeNull();
});

it.each([
  [{ entityType: null, anchor: null }, '진입 키가 없어 전체 구간을 표시합니다'],
  [{ entityType: 'occurrence', anchor: 'nope' }, '진입 Occurrence를 찾지 못해 전체 구간을 표시합니다 (nope)'],
  [{ entityType: 'occurrence', anchor: 'occ-null-time' }, '진입 Occurrence의 시작 시각이 없어 전체 구간을 표시합니다'],
])('falls back to the batch window with a notice for %j', (entry, notice) => {
  const result = focusRange(batch, entry);
  expect(result.range).toEqual({ from: batch.from, to: batch.to });
  expect(result.cursor).toBe(time('10:00:00'));
  expect(result.notice).toBe(notice);
});
