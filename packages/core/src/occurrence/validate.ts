import type { OccurrenceBatch } from './schema.js';

export type BatchRecordProblem = {
  code: 'record-owner' | 'duplicate-seq' | 'duplicate-id';
  path: (string | number)[];
  message: string;
};

// Every precondition problem, in the order consumers report them: owners, Record Sequences, then ids.
export function batchRecordProblems(batch: OccurrenceBatch): BatchRecordProblem[] {
  const problems: BatchRecordProblem[] = [];
  for (const field of ['occurrences', 'issues'] as const) {
    for (const [i, record] of batch[field].entries()) {
      if (record.equipmentId !== batch.equipmentId) {
        problems.push({ code: 'record-owner', path: [field, i, 'equipmentId'],
          message: `${field}[${i}].equipmentId (record ${record.id}) (${record.equipmentId}) must match batch.equipmentId (${batch.equipmentId})` });
      }
    }
  }
  const owners = new Map<number, string>();
  const claim = (seq: number, label: string, path: (string | number)[]) => {
    const previous = owners.get(seq);
    if (previous !== undefined) problems.push({ code: 'duplicate-seq', path, message: `Record Sequence ${seq} is not unique (${previous}, ${label})` });
    else owners.set(seq, label);
  };
  for (const [i, occurrence] of batch.occurrences.entries()) {
    claim(occurrence.start.seq, `occurrences[${i}].start`, ['occurrences', i, 'start', 'seq']);
    if (occurrence.end) claim(occurrence.end.seq, `occurrences[${i}].end`, ['occurrences', i, 'end', 'seq']);
  }
  for (const [i, issue] of batch.issues.entries()) claim(issue.seq, `issues[${i}]`, ['issues', i, 'seq']);
  // replayKey sorts each array by id; equal ids would let input order decide the hash. An Occurrence and a DQI may share an id.
  for (const [field, label] of [['occurrences', 'Occurrence'], ['issues', 'Data Quality Issue']] as const) {
    const firstIndex = new Map<string, number>();
    for (const [j, record] of batch[field].entries()) {
      const i = firstIndex.get(record.id);
      if (i === undefined) firstIndex.set(record.id, j);
      else problems.push({ code: 'duplicate-id', path: [field, j, 'id'], message: `${label} id ${record.id} is not unique (${field}[${i}], ${field}[${j}])` });
    }
  }
  return problems;
}

// Preconditions every consumer of a batch relies on: one equipment, Record Sequence as a total order
// (GLOSSARY: a per-equipment global order number) and unique ids. An equal sequence would let array order decide state.
export function assertBatchRecords(batch: OccurrenceBatch): void {
  const [first] = batchRecordProblems(batch);
  if (first) throw new RangeError(first.message);
}
