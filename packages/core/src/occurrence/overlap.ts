import type { Occurrence } from './schema.js';

/**
 * Whether an Occurrence overlaps the half-open window `[from, to)`: it is out only when it ends before `from` (an end exactly at `from` stays in)
 * or starts at or after `to`. Only provable cases are judged: a null time, an open Occurrence and an inverted one (Time Anomaly) are kept.
 */
export function occurrenceOverlapsWindow({ start, end }: Pick<Occurrence, 'start' | 'end'>, from: string, to: string): boolean {
  if (start.at === null || end?.at == null || start.at > end.at) return true;
  return !(end.at < from || start.at >= to);
}
