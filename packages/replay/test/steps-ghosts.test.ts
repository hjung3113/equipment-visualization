import { millisToWallClock, seekSceneState, stepSceneState, wallClockToMillis, type Occurrence, type ReplayInput } from '@eqv/core';
import { expect, it } from 'vitest';
import { illustrativeGhosts, recordSteps } from '../src/index.js';
import { batch, equipmentLayout, input, stateAt, time, timeline } from './data.js';

const whole = { from: batch.from, to: batch.to };

it('recordSteps: seq 3..59 ascending at the step-state time, ties kept, a null time takes the previous timed one', () => {
  const steps = recordSteps(batch, whole);
  expect(steps.map((s) => s.seq)).toEqual(Array.from({ length: 57 }, (_, i) => i + 3));
  for (const step of steps) expect(step.at, `seq ${step.seq}`).toBe(stepSceneState(input, step.seq).at);
  expect(steps.filter((s) => s.seq === 6 || s.seq === 7).map((s) => s.at)).toEqual([time('10:02:00'), time('10:02:00')]);
  expect(steps.find((s) => s.seq === 45)!.at).toBe(time('10:19:00'));
});

it('recordSteps: a sub-range keeps a step by its step time, not the record time', () => {
  const from = time('10:19:30');
  const steps = recordSteps(batch, { from, to: time('10:21:30') });
  expect(steps.map((s) => s.seq)).not.toContain(45);
  expect(steps.every((s) => s.at >= from && s.at < time('10:21:30'))).toBe(true);
  expect(steps.length).toBeGreaterThan(0);
});

const synthetic = (occurrences: Occurrence[]): ReplayInput => ({ ...input, batch: { ...batch, occurrences, issues: [] } });
const transfer = (over: Partial<Occurrence>): Occurrence => ({
  id: 'occ-x', equipmentId: batch.equipmentId, kind: 'TRANSFER', synthetic: false, source: { parserContractVersion: 's', dataGeneration: 'g' },
  start: { at: time('10:05:00'), seq: 2, evidence: 'observed' }, end: { at: time('10:06:00'), seq: 4, evidence: 'observed' },
  from: { moduleAlias: 'LP1', slotAlias: '1' }, to: { moduleAlias: 'LLA', slotAlias: '1' }, location: { moduleAlias: 'EFEM_R1' },
  material: { kind: 'wafer', id: 'W99', identityEvidence: 'observed' }, ...over,
});
const unrelated: Occurrence = {
  id: 'occ-late', equipmentId: batch.equipmentId, kind: 'FUNCTION', synthetic: false, source: { parserContractVersion: 's', dataGeneration: 'g' },
  start: { at: time('10:08:00'), seq: 3, evidence: 'observed' }, end: null, location: { moduleAlias: 'PM1' },
};

it.each([
  ['10:01:30', [{ materialKey: 'm:wafer:W01', label: 'wafer W01', fromComponentId: 'lp-a', toComponentId: 'll-a', fraction: 0.5 }]],
  ['10:26:00', []],
])('illustrativeGhosts at %s', (at, expected) => {
  expect(illustrativeGhosts(input, stateAt(time(at)), equipmentLayout)).toEqual(expected);
});

it('illustrativeGhosts: no ghost for occ-tm-out after the Binding switch, but the in-flight W03 ghost remains; null layout gives none', () => {
  const state = stateAt(time('10:05:00'));
  const ghosts = illustrativeGhosts(input, state, equipmentLayout);
  expect(ghosts.map((g) => state.materials.find((m) => m.key === g.materialKey)!.occurrenceId)).not.toContain('occ-tm-out');
  expect(ghosts).toEqual([expect.objectContaining({ materialKey: 'm:wafer:W03', fromComponentId: 'pm-b', toComponentId: 'll-a', fraction: 0 })]);
  expect(illustrativeGhosts(input, state, null)).toEqual([]);
});

it.each([
  ['an open end', synthetic([transfer({ end: null })]), (i: ReplayInput) => seekSceneState(i, time('10:05:30'))],
  ['a from/to pair on one Component', synthetic([transfer({ to: { moduleAlias: 'LP1', slotAlias: '2' } })]), (i: ReplayInput) => seekSceneState(i, time('10:05:30'))],
  // A state time strictly past the end of an open Occurrence is only reachable through a Time Anomaly (location unknown),
  // so the interval check is pinned at the boundary: an earlier record already reached end.at while the end is still ahead.
  ['a state time equal to the end time (half-open interval)', synthetic([transfer({ end: { at: time('10:08:00'), seq: 4, evidence: 'observed' } }), unrelated]),
    (i: ReplayInput) => stepSceneState(i, 3)],
])('illustrativeGhosts: no ghost for %s even though the location is derived', (_name, data, state) => {
  const scene = state(data);
  const material = scene.materials.find((m) => m.occurrenceId === 'occ-x')!;
  expect([material.locationEvidence, material.location?.componentId]).toEqual(['derived', 'efem-robot']);
  expect(illustrativeGhosts(data, scene, equipmentLayout)).toEqual([]);
});

it('zero unevidenced motion (S4): every ghost is an open TRANSFER with timed boundaries, known location and fraction in [0, 1]', () => {
  const marks = [...timeline.breakpoints, batch.to];
  const instants = new Set<string>(marks);
  marks.slice(1).forEach((b, i) => {
    const a = wallClockToMillis(marks[i]!);
    const gap = wallClockToMillis(b) - a;
    if (gap >= 2) instants.add(millisToWallClock(a + Math.floor(gap / 2)));
  });
  let total = 0;
  for (const t of instants) {
    const state = stateAt(t);
    for (const ghost of illustrativeGhosts(input, state, equipmentLayout)) {
      total += 1;
      const material = state.materials.find((m) => m.key === ghost.materialKey)!;
      const o = batch.occurrences.find((x) => x.id === material.occurrenceId)!;
      expect(o.kind).toBe('TRANSFER');
      expect(o.start.at !== null && o.end?.at != null && o.start.at < o.end.at && o.start.at <= t && t < o.end.at, `${t} ${o.id}`).toBe(true);
      expect(material.locationEvidence).not.toBe('unknown');
      expect(ghost.fraction).toBeGreaterThanOrEqual(0);
      expect(ghost.fraction).toBeLessThanOrEqual(1);
    }
  }
  expect(total).toBeGreaterThan(0);
});
