import type { Occurrence, OccurrenceBatch } from '@eqv/core';

import type { FocusEntry } from './focus-range.js';

/** AP ADR-0094: the anchor is the parser RecordSequence as an opaque decimal string. */
const RECORD_SEQUENCE = /^(0|[1-9][0-9]{0,18})$/;

/**
 * The Occurrence a Focus entry key names. `entityType` `job` (analytics-platform ADR-0094): `anchor` is the RecordSequence as an
 * opaque decimal string, matched by string equality with the start Boundary's `seq` (never parsed as a number); the first match in
 * batch order. Any other `entityType` (`occurrence`, `null`): `anchor` is an Occurrence id (the Studio reading).
 */
export function entryOccurrence(batch: OccurrenceBatch, { entityType, anchor }: FocusEntry): Occurrence | null {
  if (anchor === null) return null;
  if (entityType === 'job') return RECORD_SEQUENCE.test(anchor) ? batch.occurrences.find((o) => String(o.start.seq) === anchor) ?? null : null;
  return batch.occurrences.find((o) => o.id === anchor) ?? null;
}
