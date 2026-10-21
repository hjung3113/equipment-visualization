import { millisToWallClock, replayTimelineFrame, wallClockToMillis, type EquipmentLayoutDocument, type OccurrenceBatch, type ReplayInput } from '@eqv/core';
import { describe, expect, it } from 'vitest';
import { TIMELINE_BUDGET, timelineCost } from '../src/focus-data.js';

describe('timelineCost', () => {
  // A Data Quality Issue-only batch (no open Occurrence, no inversion) with one adjacent Binding per issue: every read
  // searches the Bindings, which the batch alone does not show.
  const N = 50_000;
  const t0 = wallClockToMillis('2026-01-01T10:00:00.000');
  const clock = (i: number) => millisToWallClock(t0 + 1000 * i);
  const batch: OccurrenceBatch = {
    equipmentId: 'eq-x', from: clock(0), to: clock(N), timeDomain: 'site-synth', watermark: { seq: N, at: clock(N) },
    parserContractVersion: 'p1', dataGeneration: 'g1', occurrences: [],
    issues: Array.from({ length: N }, (_, i) => ({ id: `dqi-${i}`, equipmentId: 'eq-x', issueType: 'unmatched-end', seq: i + 1, at: clock(i) })),
  };
  const input: ReplayInput = {
    batch, layouts: [], mappings: [],
    bindings: { schemaVersion: '0.4', equipmentId: 'eq-x', bindings: Array.from({ length: N }, (_, i) =>
      ({ layoutId: 'lay', mappingHash: `sha256:${'a'.repeat(64)}`, effectiveFrom: clock(i), effectiveTo: clock(i + 1) })) },
  };

  it('counts the Binding search every read makes, so a DQI-only window with many Bindings is over the budget', () => {
    const frame = replayTimelineFrame(input, { from: batch.from, to: batch.to });
    const cost = timelineCost(input, frame);
    // Hand-derived: 50,000 records; 50,000 breakpoints (one per issue time); no open Occurrence, no
    // inversion; context = 50,000 Bindings + 0 Layouts + 0 components. 50,000 + 50,000 × 50,000 = 2,500,050,000.
    expect(cost).toMatchObject({ records: N, breakpoints: N, open: 0, inversions: 0, context: N, cost: 2_500_050_000 });
    expect(cost.cost).toBeGreaterThan(TIMELINE_BUDGET);
  });

  it('counts the Layouts of layoutRevisions as well as layouts', () => {
    const layout = (components: number) => ({ components: Array.from({ length: components }, (_, i) => ({ id: `c${i}` })) }) as unknown as EquipmentLayoutDocument;
    const small: ReplayInput = { ...input, bindings: { ...input.bindings, bindings: [] },
      layoutRevisions: { [`sha256:${'1'.repeat(64)}`]: layout(8), [`sha256:${'2'.repeat(64)}`]: layout(100) } };
    const cost = timelineCost(small, replayTimelineFrame(small, { from: batch.from, to: batch.to }));
    // Hand-derived: 0 Bindings + 2 Layouts + 100 components × max(1, ⌈log₂ 100⌉ = 7); 50,000 records, 50,000 breakpoints.
    expect(cost).toMatchObject({ context: 0 + 2 + 700, cost: N + N * (702 + 0) });
  });
});
