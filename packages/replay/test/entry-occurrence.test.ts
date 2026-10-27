import { expect, it } from 'vitest';
import { entryOccurrence, focusRange } from '../src/index.js';
import { batch } from './data.js';

const idOf = (entityType: string | null, anchor: string | null) => entryOccurrence(batch, { entityType, anchor })?.id ?? null;

it.each([
  ['job', '18', 'occ-pm1-process'],
  ['job', '58', 'occ-open'],
  ['occurrence', 'occ-pm1-process', 'occ-pm1-process'],
  [null, 'occ-carrier', 'occ-carrier'],
  ['whatever', 'occ-open', 'occ-open'],
  ['job', 'occ-pm1-process', null],
  ['job', '4', null],
  ['job', '018', null],
  ['job', '1.0', null],
  ['job', ' 18', null],
  ['job', '', null],
  ['job', '9999999999999999999', null],
  ['job', null, null],
  ['occurrence', null, null],
  ['occurrence', '18', null],
])('entryOccurrence(%s, %s) -> %s', (entityType, anchor, expected) => {
  expect(idOf(entityType, anchor)).toBe(expected);
});

it('a job anchor shared by two Occurrences resolves to the first in batch order', () => {
  const [first, second] = batch.occurrences;
  const shared = { ...batch, occurrences: [{ ...second!, start: { ...second!.start, seq: first!.start.seq } }, first!] };
  expect(entryOccurrence(shared, { entityType: 'job', anchor: String(first!.start.seq) })?.id).toBe(second!.id);
});

it('focusRange follows a job anchor to its Occurrence and keeps the Korean not-found notice with the anchor', () => {
  expect(focusRange(batch, { entityType: 'job', anchor: '18' }).entry?.id).toBe('occ-pm1-process');
  expect(focusRange(batch, { entityType: 'job', anchor: '4' }).notice).toBe('진입 Occurrence를 찾지 못해 전체 구간을 표시합니다 (4)');
});
