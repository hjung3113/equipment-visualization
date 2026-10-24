import type { Assessment } from '@ap/contracts';
import { describe, expect, it } from 'vitest';
import { hostWallClock, readHostProps } from '../src/host-props.js';
import { assessmentNotices, mergePages } from '../src/replay-load.js';
import { createFakeHost } from './fake-host.js';
import { batch, pages } from './replay-fixture.js';

describe('hostWallClock', () => {
  it.each([
    ['2026-01-01T10:30:00', '2026-01-01T10:30:00.000'],
    ['2026-01-01T10:30:00.250', '2026-01-01T10:30:00.250'],
    ['2026-01-01T10:30:00Z', null],
    ['2026-01-01', null],
  ])('%s → %s', (input, expected) => {
    expect(hostWallClock(input)).toBe(expected);
  });
});

describe('readHostProps', () => {
  const read = (options: Parameters<typeof createFakeHost>[0]) => readHostProps(createFakeHost(options).host).time;
  it('pads the host time once, never invents a range', () => {
    expect(read({ query: null, context: { from: '2026-01-01T10:00:00', to: '2026-01-01T10:30:00' } }))
      .toEqual({ kind: 'applied', from: '2026-01-01T10:00:00.000', to: '2026-01-01T10:30:00.000' });
    expect(read({ query: null, context: { from: '2026-01-01T10:00:00', to: null } })).toEqual({ kind: 'missing' });
    expect(read({ query: null, unsupported: ['time'], context: { from: '2026-01-01T10:00:00', to: '2026-01-01T10:30:00' } })).toEqual({ kind: 'unsupported' });
    expect(read({ query: null, context: { from: '2026-01-01T11:00:00', to: '2026-01-01T10:30:00' } }).kind).toBe('invalid');
  });
});

describe('mergePages', () => {
  it('concatenates in server page order, keeps the first page window, takes the greatest Watermark, drops the token', () => {
    const [first, second] = pages();
    const merged = mergePages([second, first]);
    expect(merged.occurrences.map((o) => o.id)).toEqual([...second.occurrences, ...first.occurrences].map((o) => o.id));
    expect(merged.watermark).toEqual(batch.watermark);
    expect(merged.continuationToken).toBeUndefined();
    expect(mergePages([first, second]).issues).toEqual(batch.issues);
  });

  it('rejects a later page that names another window or equipment', () => {
    const [first, second] = pages();
    expect(() => mergePages([first, { ...second, dataGeneration: 'g2' }])).toThrow(/dataGeneration/);
    expect(() => mergePages([first, { ...second, equipmentId: 'eq-other' }])).toThrow(/equipmentId/);
  });
});

describe('assessmentNotices', () => {
  it('words unknown as not checked and confirmed as a problem; clear raises nothing', () => {
    const assessments: Assessment[] = [
      { kind: 'collection', state: 'clear' },
      { kind: 'coverage', state: 'unknown', reason: 'source_unavailable' },
      { kind: 'processing_delay', state: 'confirmed', detail: '15분' },
      { kind: 'processing_delay', state: 'confirmed', detail: '15분' },
    ];
    expect(assessmentNotices(assessments)).toEqual([
      '범위: 확인하지 못했습니다 (출처를 쓸 수 없음) — 이상 없음이 아닙니다',
      '처리 지연: 문제가 확인되었습니다 — 15분',
    ]);
  });
});
