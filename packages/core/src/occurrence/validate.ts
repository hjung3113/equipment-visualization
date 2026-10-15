import type { OccurrenceBatch } from './schema.js';

// Preconditions every consumer of a batch relies on: one equipment, and Record Sequence as a total order
// (GLOSSARY: a per-equipment global order number). An equal sequence would let array order decide state.
export function assertBatchRecords(batch: OccurrenceBatch): void {
  const owners = new Map<number, string>();
  const claim = (seq: number, label: string) => {
    const previous = owners.get(seq);
    if (previous !== undefined) throw new RangeError(`Record Sequence ${seq} is not unique (${previous}, ${label})`);
    owners.set(seq, label);
  };
  for (const field of ['occurrences', 'issues'] as const) {
    for (const [i, record] of batch[field].entries()) {
      if (record.equipmentId !== batch.equipmentId) {
        throw new RangeError(`${field}[${i}].equipmentId (record ${record.id}) (${record.equipmentId}) must match batch.equipmentId (${batch.equipmentId})`);
      }
    }
  }
  for (const [i, occurrence] of batch.occurrences.entries()) {
    claim(occurrence.start.seq, `occurrences[${i}].start`);
    if (occurrence.end) claim(occurrence.end.seq, `occurrences[${i}].end`);
  }
  for (const [i, issue] of batch.issues.entries()) claim(issue.seq, `issues[${i}]`);
}
