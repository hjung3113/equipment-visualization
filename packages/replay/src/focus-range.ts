import { millisToWallClock, wallClockToMillis, type Occurrence, type OccurrenceBatch, type SiteWallClock } from '@eqv/core';

import { entryOccurrence } from './entry-occurrence.js';

export type FocusEntry = { entityType: string | null; anchor: string | null };
export type FocusRange = {
  range: { from: SiteWallClock; to: SiteWallClock };
  cursor: SiteWallClock;
  entry: Occurrence | null;
  notice: string | null;
};

const MIN_MARGIN_MS = 60_000;

/**
 * Default Focus range for an entry key (`entityType` `job`: `anchor` is the RecordSequence string, AP ADR-0094; otherwise `anchor` is an Occurrence id, the Studio reading).
 * The entry's span widened by max(25 %, 60 s) each side and clamped to the batch; the batch window when no entry applies.
 */
export function focusRange(batch: OccurrenceBatch, key: FocusEntry): FocusRange {
  const { anchor } = key;
  const whole = { from: batch.from, to: batch.to };
  const fallback = (notice: string, entry: Occurrence | null = null): FocusRange => ({ range: whole, cursor: batch.from, entry, notice });
  if (anchor === null) return fallback('진입 키가 없어 전체 구간을 표시합니다');
  const entry = entryOccurrence(batch, key);
  if (!entry) return fallback(`진입 Occurrence를 찾지 못해 전체 구간을 표시합니다 (${anchor})`);
  const startAt = entry.start.at;
  if (startAt === null) return fallback('진입 Occurrence의 시작 시각이 없어 전체 구간을 표시합니다', entry);

  const first = wallClockToMillis(startAt);
  const second = wallClockToMillis(entry.end?.at ?? batch.to);
  const low = Math.min(first, second);
  const high = Math.max(first, second);
  const margin = Math.max((high - low) / 4, MIN_MARGIN_MS);
  const floor = wallClockToMillis(batch.from);
  const ceiling = wallClockToMillis(batch.to);
  let from = Math.min(Math.max(low - margin, floor), ceiling - 1);
  const to = Math.max(Math.min(high + margin, ceiling), from + 1);
  from = Math.min(from, to - 1);
  const range = { from: millisToWallClock(Math.round(from)), to: millisToWallClock(Math.round(to)) };
  const cursor = startAt < range.from || startAt >= range.to ? range.from : startAt;
  return { range, cursor, entry, notice: null };
}
