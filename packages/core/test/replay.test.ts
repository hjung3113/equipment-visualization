import { readFileSync, readdirSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  bindingsFileSchema, layoutDocumentSchema, mappingVersionSchema, occurrenceBatchSchema, sceneStateSchema,
  seekSceneState, stepSceneState, replayKey, replayTimeline, sceneStateHash, layoutRevision, bindingLayout, assertReplayInput, type ReplayInput, type SiteWallClock,
} from '../src/index.js';

const root = new URL('../../../fixtures/cluster-single/', import.meta.url);
const read = (path: string): unknown => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const time = (value: string): SiteWallClock => `2026-01-01T${value}.000`;
const input = (): ReplayInput => {
  const layout = layoutDocumentSchema.parse(read('layout.json'));
  if (layout.kind !== 'equipment-layout') throw new Error('Expected equipment layout');
  const directory = 'onboarding/mappings/eq-synth-01/';
  return { batch: occurrenceBatchSchema.parse(read('occurrence-batch.json')), layouts: [layout],
    bindings: bindingsFileSchema.parse(read('onboarding/bindings/eq-synth-01.bindings.json')),
    mappings: readdirSync(new URL(directory, root)).sort().map((file) => mappingVersionSchema.parse(read(directory + file))) };
};
const thrown = (run: () => unknown): unknown => {
  try { run(); } catch (error) { return error; }
  return undefined;
};
const expected = (read('expected-scene-states.json') as { states: unknown[] }).states.map((state) => sceneStateSchema.parse(state));
it.each(['batch', 'occurrence', 'issue'] as const)('rejects foreign equipment in %s before replay', async (foreign) => {
  const data = input();
  const batch = data.batch;
  const occurrenceIndex = batch.occurrences.length - 1;
  const issueIndex = batch.issues.length - 1;
  data.batch = occurrenceBatchSchema.parse({ ...batch,
    equipmentId: foreign === 'batch' ? 'eq-other' : batch.equipmentId,
    occurrences: batch.occurrences.map((record, i) => foreign === 'batch' || (foreign === 'occurrence' && i === occurrenceIndex)
      ? { ...record, equipmentId: 'eq-other' } : record),
    issues: batch.issues.map((record, i) => foreign === 'batch' || (foreign === 'issue' && i === issueIndex)
      ? { ...record, equipmentId: 'eq-other' } : record),
  });
  const message = foreign === 'batch'
    ? `bindings.equipmentId (${data.bindings.equipmentId}) must match batch.equipmentId (eq-other)`
    : `${foreign === 'occurrence' ? `occurrences[${occurrenceIndex}].equipmentId (record ${batch.occurrences[occurrenceIndex]!.id})`
      : `issues[${issueIndex}].equipmentId (record ${batch.issues[issueIndex]!.id})`} (eq-other) must match batch.equipmentId (${batch.equipmentId})`;
  expect(() => seekSceneState(data, time('10:00:30'))).toThrow(RangeError);
  expect(() => seekSceneState(data, time('10:00:30'))).toThrow(message);
  expect(() => stepSceneState(data, 3)).toThrow(RangeError);
  expect(() => stepSceneState(data, 3)).toThrow(message);
  await expect(replayKey(data, time('10:00:30'))).rejects.toThrow(RangeError);
  await expect(replayKey(data, time('10:00:30'))).rejects.toThrow(message);
});

it.each([
  { name: 'equal Occurrence boundary sequences', edit: (b: ReplayInput['batch']) => { b.occurrences[2]!.start.seq = 2; },
    message: 'Record Sequence 2 is not unique (occurrences[1].start, occurrences[2].start)' },
  { name: 'a DQI sharing a boundary sequence', edit: (b: ReplayInput['batch']) => { b.issues[0]!.seq = 45; },
    message: 'Record Sequence 45 is not unique (occurrences[23].start, issues[0])' },
  { name: 'a duplicate Occurrence id', edit: (b: ReplayInput['batch']) => { b.occurrences[3]!.id = 'occ-lp-slot-two'; },
    message: 'Occurrence id occ-lp-slot-two is not unique (occurrences[2], occurrences[3])' },
  { name: 'a duplicate DQI id', edit: (b: ReplayInput['batch']) => { b.issues[1]!.id = 'dqi-end-before-start'; },
    message: 'Data Quality Issue id dqi-end-before-start is not unique (issues[0], issues[1])' },
  { name: 'an unfinished page', edit: (b: ReplayInput['batch']) => { b.continuationToken = 'page-2'; },
    message: 'batch.continuationToken is set: replay needs the complete OccurrenceBatch' },
])('rejects $name before replay', async ({ edit, message }) => {
  const data = input();
  edit(data.batch);
  const error = new RangeError(message);
  expect(thrown(() => seekSceneState(data, time('10:00:30')))).toEqual(error);
  expect(thrown(() => stepSceneState(data, 3))).toEqual(error);
  expect(thrown(() => replayTimeline(data, { from: data.batch.from, to: data.batch.to }))).toEqual(error);
  await expect(replayKey(data, time('10:00:30'))).rejects.toEqual(error);
});

it.each(expected)('seeks the independent Scene State at $at', (state) => {
  const actual = seekSceneState(input(), state.at);
  expect(sceneStateSchema.parse(actual)).toEqual(state);
});

it('repeats each seek 100 times and ignores record array order', async () => {
  const original = input();
  const reversed = input();
  reversed.batch.occurrences.reverse();
  reversed.batch.issues.reverse();
  const before = JSON.stringify(original);
  for (const state of expected) {
    const hashes = new Set<string>();
    for (let n = 0; n < 100; n++) hashes.add(await sceneStateHash(seekSceneState(original, state.at)));
    expect(hashes.size).toBe(1);
    expect(seekSceneState(reversed, state.at)).toEqual(state);
    expect(await replayKey(reversed, state.at)).toEqual(await replayKey(original, state.at));
  }
  expect(JSON.stringify(original)).toBe(before);
});

it('steps exact sequence prefixes and agrees with seek when their prefixes coincide', () => {
  const data = input();
  const records = [...data.batch.issues, ...data.batch.occurrences.flatMap((o) => o.end ? [o.start, o.end] : [o.start])]
    .sort((a, b) => a.seq - b.seq);
  for (const record of records) {
    const t = records.filter((r) => r.seq <= record.seq && r.at !== null).at(-1)?.at ?? data.batch.from;
    const seek = seekSceneState(data, t);
    if (seek.appliedSeq === record.seq) expect(stepSceneState(data, record.seq)).toEqual(seek);
  }
  const eight = stepSceneState(data, 8);
  expect(eight).toMatchObject({ appliedSeq: 8, at: time('10:03:00') });
  expect(eight.materials.some((m) => m.id === 'W01')).toBe(false);
  expect(stepSceneState(data, 44)).toMatchObject({ appliedSeq: 44, at: time('10:19:00') });
  const fortyFive = stepSceneState(data, 45);
  expect(fortyFive).toMatchObject({ appliedSeq: 45, at: time('10:19:00') });
  expect(fortyFive.components.find((c) => c.componentId === 'pm-b')).toMatchObject({ activity: 'function', activityEvidence: 'unknown' });
});

it.each([false, true])('uses batch.from for a prefix without known times (empty=%s)', (empty) => {
  const data = input();
  data.batch = occurrenceBatchSchema.parse({ ...data.batch, occurrences: [], issues: empty ? [] : [
    { id: 'null-time', equipmentId: data.batch.equipmentId, issueType: 'missing-time', seq: 1, at: null },
  ] });
  expect(stepSceneState(data, 1)).toMatchObject({ at: data.batch.from, appliedSeq: empty ? null : 1 });
});

it('includes DQIs in prefix and anomaly windows without treating them as owners', () => {
  const data = input();
  data.batch = occurrenceBatchSchema.parse({ ...data.batch, occurrences: [{ id: 'function', equipmentId: data.batch.equipmentId,
    kind: 'FUNCTION', location: { moduleAlias: 'PM1' }, start: { seq: 1, at: time('10:00:00'), evidence: 'observed' },
    end: { seq: 3, at: time('10:02:00'), evidence: 'observed' }, synthetic: false,
    source: { parserContractVersion: data.batch.parserContractVersion, dataGeneration: data.batch.dataGeneration } }],
  issues: [{ id: 'dqi', equipmentId: data.batch.equipmentId, issueType: 'synthetic', seq: 2, at: time('10:05:00'), relatedOccurrenceId: 'unrelated' }] });
  const early = seekSceneState(data, time('10:03:00'));
  expect(early.appliedSeq).toBe(1);
  expect(early.components.find((c) => c.componentId === 'pm-a')).toMatchObject({ activity: 'function', activityEvidence: 'unknown', occurrenceIds: ['function'] });
  expect(early.markers).toEqual([{ kind: 'time-anomaly', occurrenceId: 'function' }]);
  const late = seekSceneState(data, time('10:05:00'));
  expect(late.appliedSeq).toBe(3);
  expect(late.markers).toEqual([{ kind: 'time-anomaly', occurrenceId: 'function' }]);
});

it.each(['10:00:30', '10:05:30'])('identifies the complete active replay inputs at %s', async (at) => {
  const data = input();
  const t = time(at);
  const binding = data.bindings.bindings[at === '10:00:30' ? 0 : 1]!;
  expect(await replayKey(data, t)).toMatchObject({ binding, mappingHash: binding.mappingHash,
    layoutHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/), rulesetVersion: 'scene-rules-2', dataGeneration: 'g1', t });
});

it.each(['watermark', 'binding', 'layout', 'mapping', 'layout-content'] as const)('changes key and state when %s changes', async (change) => {
  const a = input();
  const b = input();
  const t = time(change === 'watermark' ? '10:26:00' : '10:05:30');
  if (change === 'watermark') b.batch.watermark.at = time('10:27:00');
  if (change === 'binding') {
    b.bindings.bindings[0]!.effectiveTo = time('10:06:00');
    b.bindings.bindings[1]!.effectiveFrom = time('10:06:00');
  }
  if (change === 'layout') b.layouts = [];
  if (change === 'mapping') b.mappings = b.mappings.filter((m) => m.hash !== b.bindings.bindings[1]!.mappingHash);
  if (change === 'layout-content') b.layouts[0]!.components.pop();
  const changedKey = await replayKey(b, t);
  const changedState = seekSceneState(b, t);
  expect(await replayKey(a, t)).not.toEqual(changedKey);
  expect(seekSceneState(a, t)).not.toEqual(changedState);
  if (change === 'layout' || change === 'mapping') {
    expect(changedKey[change === 'layout' ? 'layoutHash' : 'mappingHash']).toBeNull();
    for (const material of changedState.materials) expect(material).toMatchObject({ location: null, locationEvidence: 'unknown' });
    expect(changedState.markers).toEqual([]);
    expect(changedState.binding).not.toBeNull();
    if (change === 'layout') expect(changedState.components).toEqual([]);
  }
});

it.each(['no-binding', 'missing-mapping'] as const)('preserves aliases without invented locations for %s', (missing) => {
  const data = input();
  if (missing === 'no-binding') data.bindings.bindings = [];
  else data.mappings = [];
  const state = seekSceneState(data, time('10:00:30'));
  expect(state.materials.length).toBeGreaterThan(0);
  for (const material of state.materials) {
    expect(material).toMatchObject({ location: null, locationEvidence: 'unknown' });
    expect(material.alias.moduleAlias).toBe('LP1');
  }
  expect(state.markers).toEqual([]);
  if (missing === 'no-binding') {
    expect(state.binding).toBeNull();
    expect(state.components).toEqual([]);
  } else {
    expect(state.binding).toEqual({ layoutId: data.bindings.bindings[0]!.layoutId, mappingHash: data.bindings.bindings[0]!.mappingHash });
    expect(state.components.every((c) => c.activity === 'no recorded activity')).toBe(true);
  }
});

it('places the latest open Occurrence for a shared material key', () => {
  const data = input();
  const first = data.batch.occurrences.find((o) => o.id === 'occ-lp-slot-one')!;
  data.batch = occurrenceBatchSchema.parse({ ...data.batch, issues: [], occurrences: [
    { ...first, start: { ...first.start, seq: 1 }, end: null },
    { ...first, id: 'latest', start: { ...first.start, seq: 2 }, end: null, location: { moduleAlias: 'LLA', slotAlias: '2' } },
  ] });
  expect(seekSceneState(data, time('10:00:30')).materials).toEqual([
    expect.objectContaining({ key: 'm:wafer:W01', occurrenceId: 'latest', location: { componentId: 'll-a', holdingSiteId: 'slot-2' } }),
  ]);
});

it.each(['identity', 'start'] as const)('reads illustrative %s evidence as unknown', (facet) => {
  const data = input();
  const source = data.batch.occurrences.find((o) => o.kind === 'PROCESS' && o.material)!;
  data.batch = occurrenceBatchSchema.parse({ ...data.batch, issues: [], occurrences: [{ ...source, end: null,
    start: { ...source.start, seq: 1, at: time('10:00:00'), evidence: facet === 'start' ? 'illustrative' : 'observed' },
    material: { ...source.material!, identityEvidence: facet === 'identity' ? 'illustrative' : 'observed' },
  }] });
  const state = seekSceneState(data, time('10:00:30'));
  expect(state.materials[0]).toMatchObject({ identityEvidence: facet === 'identity' ? 'unknown' : 'observed', locationEvidence: 'observed' });
  expect(state.components.find((c) => c.componentId === 'pm-a')).toMatchObject({ activity: 'processing', activityEvidence: facet === 'start' ? 'unknown' : 'observed' });
});

it('selects the newest activity and evidence while sorting all open occurrence ids', () => {
  const data = input();
  const source = { equipmentId: data.batch.equipmentId, location: { moduleAlias: 'PM1' }, end: null, synthetic: false,
    source: { parserContractVersion: data.batch.parserContractVersion, dataGeneration: data.batch.dataGeneration } };
  data.batch = occurrenceBatchSchema.parse({ ...data.batch, issues: [], occurrences: [
    { ...source, id: 'z-process', kind: 'PROCESS', start: { seq: 1, at: time('10:00:00'), evidence: 'observed' } },
    { ...source, id: 'a-function', kind: 'FUNCTION', start: { seq: 2, at: time('10:00:10'), evidence: 'derived' } },
  ] });
  expect(seekSceneState(data, time('10:00:30')).components.find((c) => c.componentId === 'pm-a')).toEqual({
    componentId: 'pm-a', activity: 'function', activityEvidence: 'derived', occurrenceIds: ['a-function', 'z-process'],
  });
});

it('derives synthetic VISIT location evidence while preserving identity evidence', () => {
  const data = input();
  const source = data.batch.occurrences.find((o) => o.id === 'occ-lp-slot-one')!;
  data.batch = occurrenceBatchSchema.parse({ ...data.batch, issues: [], occurrences: [
    { ...source, synthetic: true, start: { ...source.start, seq: 1 }, end: null },
  ] });
  const state = seekSceneState(data, time('10:00:30'));
  expect(state.materials).toEqual([expect.objectContaining({ occurrenceId: source.id,
    location: { componentId: 'lp-a', holdingSiteId: 'slot-1' }, locationEvidence: 'derived', identityEvidence: 'observed' })]);
  expect(state.markers).toEqual([]);
});

it('preserves open placement and activity evidence exactly at the watermark', () => {
  const data = input();
  const source = data.batch.occurrences.find((o) => o.kind === 'PROCESS' && o.material)!;
  data.batch = occurrenceBatchSchema.parse({ ...data.batch, issues: [],
    watermark: { seq: 1, at: time('10:00:30') }, occurrences: [
      { ...source, start: { seq: 1, at: time('10:00:00'), evidence: 'observed' }, end: null },
    ] });
  const state = seekSceneState(data, data.batch.watermark.at);
  expect(state.materials).toEqual([expect.objectContaining({ occurrenceId: source.id,
    location: { componentId: 'pm-a' }, locationEvidence: 'observed', identityEvidence: source.material!.identityEvidence })]);
  expect(state.components.find((c) => c.componentId === 'pm-a')).toMatchObject({
    activity: 'processing', activityEvidence: 'observed', occurrenceIds: [source.id],
  });
  expect(state.markers).toEqual([]);
});

// Layout Revision lookup (ADR-0011): two revisions of one layoutId, each pinned by one of the two Bindings (boundary 10:04:30).
const revisions = async () => {
  const data = input();
  const base = data.layouts[0]!;
  const older = structuredClone(base);
  const newer = { ...structuredClone(base), components: base.components.slice(0, -1) };
  const [olderHash, newerHash] = [await layoutRevision(older), await layoutRevision(newer)];
  data.bindings.bindings[0]!.layoutRevision = olderHash;
  data.bindings.bindings[1]!.layoutRevision = newerHash;
  data.layoutRevisions = { [olderHash]: older, [newerHash]: newer };
  return { data, older, newer, olderHash, newerHash };
};
const ids = (layout: { components: { id: string }[] }) => layout.components.map((c) => c.id).sort();

it('resolves each Binding segment to its own pinned revision, whatever the order of the inputs', async () => {
  const { data, older, newer, olderHash, newerHash } = await revisions();
  expect(ids(older)).not.toEqual(ids(newer));
  const flipped = { ...data, layouts: [newer, older], layoutRevisions: { [newerHash]: newer, [olderHash]: older } };
  for (const candidate of [data, flipped]) {
    expect(seekSceneState(candidate, time('10:00:30')).components.map((c) => c.componentId)).toEqual(ids(older));
    expect(seekSceneState(candidate, time('10:05:30')).components.map((c) => c.componentId)).toEqual(ids(newer));
  }
  expect(seekSceneState(data, time('10:05:30'))).toEqual(seekSceneState(flipped, time('10:05:30')));
  expect(await replayKey(data, time('10:00:30'))).toEqual(await replayKey(flipped, time('10:00:30')));
  expect(await replayKey(data, time('10:00:30'))).toMatchObject({ layoutHash: olderHash });
  expect(await replayKey(data, time('10:05:30'))).toMatchObject({ layoutHash: newerHash });
});

it('treats a pinned revision missing from the input as no Layout, even when layouts holds that id', async () => {
  const { data, olderHash } = await revisions();
  data.layoutRevisions = {};
  expect(data.layouts[0]!.id).toBe(data.bindings.bindings[0]!.layoutId);
  const state = seekSceneState(data, time('10:00:30'));
  expect(state.components).toEqual([]);
  expect(state.materials.length).toBeGreaterThan(0);
  for (const material of state.materials) expect(material).toMatchObject({ location: null, locationEvidence: 'unknown' });
  expect(state.binding).toMatchObject({ layoutRevision: olderHash });
  expect((await replayKey(data, time('10:00:30'))).layoutHash).toBeNull();
});

it('resolves an unpinned Binding by layoutId and carries layoutRevision only for a pinned one', async () => {
  const { data, olderHash } = await revisions();
  delete data.bindings.bindings[1]!.layoutRevision;
  expect(bindingLayout(data, data.bindings.bindings[1]!)).toBe(data.layouts[0]);
  expect(seekSceneState(data, time('10:05:30')).binding).toEqual({ layoutId: 'eq-synth-01-layout', mappingHash: data.bindings.bindings[1]!.mappingHash });
  expect(seekSceneState(data, time('10:00:30')).binding).toEqual({ layoutId: 'eq-synth-01-layout', mappingHash: data.bindings.bindings[0]!.mappingHash, layoutRevision: olderHash });
});

it('rejects a malformed layoutRevisions key and a revision of another layout id', async () => {
  const { data, older, olderHash } = await revisions();
  expect(() => assertReplayInput({ ...data, layoutRevisions: { ...data.layoutRevisions, 'sha256:ABC': older } })).toThrow(RangeError);
  expect(() => assertReplayInput({ ...data, layoutRevisions: { ...data.layoutRevisions, [olderHash]: { ...older, id: 'other-layout' } } }))
    .toThrow(`layoutRevisions[${olderHash}] is Layout other-layout, but the Binding names eq-synth-01-layout`);
});

it('rejects a layoutRevisions entry whose content does not hash to its key', async () => {
  const { data, older, olderHash } = await revisions();
  data.layoutRevisions = { ...data.layoutRevisions, [olderHash]: { ...older, components: older.components.slice(1) } };
  await expect(replayKey(data, time('10:00:30'))).rejects.toThrow(RangeError);
  await expect(replayKey(data, time('10:05:30'))).resolves.toBeDefined();
});
