import type { OccurrenceBatch, SiteWallClock } from '@eqv/core';

export type RecordStep = { seq: number; at: SiteWallClock };

/**
 * Sequence-step targets (REPLAY-CONTRACT Seek(t)): the distinct Record Sequence numbers of the batch (Occurrence starts,
 * ends and Data Quality Issues) in seq order. A step's time is that of `stepSceneState`: the last non-null `at` among
 * records with `seq <= s`, else `batch.from`. Kept only when that time lies in `[range.from, range.to)`.
 */
export function recordSteps(batch: OccurrenceBatch, range: { from: SiteWallClock; to: SiteWallClock }): RecordStep[] {
  const records = [
    ...batch.occurrences.flatMap((o) => [o.start, ...(o.end ? [o.end] : [])]),
    ...batch.issues,
  ].sort((a, b) => a.seq - b.seq);
  const steps: RecordStep[] = [];
  let at = batch.from;
  records.forEach((record, i) => {
    if (record.at !== null) at = record.at;
    if (records[i + 1]?.seq === record.seq) return;
    if (range.from <= at && at < range.to) steps.push({ seq: record.seq, at });
  });
  return steps;
}
