import type { Occurrence } from './schema.js';

/**
 * Whether an Occurrence overlaps the half-open window `[from, to)`: it is out when it starts at or after `to` (whatever its end, open included)
 * or ends before `from` (an end exactly at `from` stays in). Only provable cases are judged: a null time and an inverted Occurrence (Time Anomaly) are kept.
 */
export function occurrenceOverlapsWindow({ start, end }: Pick<Occurrence, 'start' | 'end'>, from: string, to: string): boolean {
  if (start.at === null) return true;
  if (end?.at != null && start.at > end.at) return true;
  if (start.at >= to) return false;
  return !(end?.at != null && end.at < from);
}
