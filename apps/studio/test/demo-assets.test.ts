import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  aliasMetadataFileSchema, computeCoverage, equipmentRecordSchema, layoutRevision, mappingVersionSchema, millisToWallClock,
  observedInventorySchema, replayTimeline, replayTimelineFrame, seekSceneState, validateAliasRules, validateBindings,
  validateLayout, validateSampleWindow, validateTypeDictionary, verifyMappingHash, wallClockToMillis,
  type MappingVersion, type OccurrenceBatch, type ReplayInput, type SceneMaterial, type SceneState,
} from '@eqv/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFileApi } from '../server/files.js';
import { GANTT_SPAN_LIMIT, loadFocus, TIMELINE_BUDGET, timelineCost, type FocusData } from '../src/focus-data.js';
import { generateDemo } from '../scripts/demo/generate.ts';

const repo = resolve(process.cwd(), '../..');
const assets = join(repo, 'assets');
const EQUIPMENT = 'eq-demo-01';
const SPAN_TARGET = 2_500;
/** Every directory (or file) of the data root that belongs to the demo equipment. */
const DEMO_ROOTS = [
  `equipment/${EQUIPMENT}.json`, `observations/${EQUIPMENT}`, `layouts/${EQUIPMENT}-layout`, `onboarding/mappings/${EQUIPMENT}`,
  `onboarding/baselines/${EQUIPMENT}`, `onboarding/bindings/${EQUIPMENT}.bindings.json`,
  `onboarding/scopes/equipment/${EQUIPMENT}`, 'onboarding/scopes/model/synth-maker/synth-demo',
];

async function committed(path: string): Promise<string[]> {
  const absolute = join(assets, path);
  const entries = await readdir(absolute, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => error.code === 'ENOTDIR' ? null : Promise.reject(error));
  if (entries === null) return [path];
  return (await Promise.all(entries.map((entry) => committed(`${path}/${entry.name}`)))).flat();
}

let generated: Map<string, string>;
let focus: { hex: string; data: FocusData; input: ReplayInput }[];
beforeAll(async () => {
  generated = await generateDemo();
  // The real file API over the committed data root, read-only here: Focus reads it as it does in the dev server.
  const api = createFileApi({ root: assets });
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const result = await api.handle({ method: init?.method ?? 'GET', url: input, headers: {}, body: String(init?.body ?? '') });
    return new Response(JSON.stringify(result.body), { status: result.status });
  });
  const hexes = [...generated.keys()].filter((path) => path.endsWith('.batch.json'))
    .map((path) => path.slice(-'.batch.json'.length - 64, -'.batch.json'.length)).sort();
  focus = [];
  for (const hex of hexes) {
    const load = await loadFocus(EQUIPMENT, { window: hex });
    if (load.kind !== 'ok') throw new Error(`${hex}: ${JSON.stringify(load)}`);
    focus.push({ hex, data: load, input: { batch: load.batch, layouts: load.layouts, layoutRevisions: load.layoutRevisions, bindings: load.bindings, mappings: load.mappings } });
  }
});
afterAll(() => vi.unstubAllGlobals());

const json = (path: string) => JSON.parse(generated.get(path)!) as unknown;
const wafers = (state: SceneState): SceneMaterial[] => state.materials.filter((material) => material.kind === 'wafer');
const shift = (at: string, ms: number) => millisToWallClock(wallClockToMillis(at) + ms);

it('regenerates every committed demo file byte for byte, and commits no other demo file', async () => {
  const onDisk = (await Promise.all(DEMO_ROOTS.map(committed))).flat().sort();
  expect(onDisk).toEqual([...generated.keys()].sort());
  for (const [path, text] of generated) expect(await readFile(join(assets, path), 'utf8'), path).toBe(text);
});

it('passes every generated file through its @eqv/core validator', async () => {
  const windows = [...generated].filter(([path]) => path.endsWith('.batch.json')).map(([, text]) => JSON.parse(text) as OccurrenceBatch);
  expect(windows).toHaveLength(2);
  for (const batch of windows) {
    const others = await Promise.all(windows.filter((w) => w !== batch).map(async (other) => {
      const checked = await validateSampleWindow(other, { equipmentId: EQUIPMENT, existing: [] });
      if (!checked.ok) throw new Error(JSON.stringify(checked.issues));
      return { from: other.from, to: other.to, timeDomain: other.timeDomain, hash: checked.summary.hash };
    }));
    const result = await validateSampleWindow(batch, { equipmentId: EQUIPMENT, existing: others });
    expect(result.ok ? 'ok' : result.issues).toBe('ok');
  }
  for (const [path, text] of generated) {
    const value: unknown = JSON.parse(text);
    if (path.endsWith('.layout.json')) expect(validateLayout(value).ok, path).toBe(true);
    else if (path.endsWith('.mapping.json')) {
      const mapping = mappingVersionSchema.parse(value);
      expect(await verifyMappingHash(mapping), path).toBe(true);
      expect(path, path).toContain(mapping.hash.slice('sha256:'.length));
    } else if (path.endsWith('.inventory.json')) expect(observedInventorySchema.safeParse(value).success, path).toBe(true);
    else if (path.endsWith('.bindings.json')) expect(validateBindings(value).ok, path).toBe(true);
    else if (path.endsWith('type-dictionary.json')) expect(validateTypeDictionary(value).ok, path).toBe(true);
    else if (path.endsWith('alias-rules.json')) expect(validateAliasRules(value).ok, path).toBe(true);
    else if (path.endsWith('alias-metadata.json')) expect(aliasMetadataFileSchema.safeParse(value).success, path).toBe(true);
    else if (path.startsWith('equipment/')) expect(equipmentRecordSchema.safeParse(value).success, path).toBe(true);
  }
  const revisionFile = [...generated.keys()].find((path) => /layouts\/[^/]+\/[0-9a-f]{64}\.layout\.json$/.test(path))!;
  const layout = validateLayout(json(revisionFile));
  if (!layout.ok) throw new Error('layout');
  expect(revisionFile).toContain((await layoutRevision(layout.layout)).slice('sha256:'.length));
  expect(json('layouts/eq-demo-01-layout/draft.layout.json')).toEqual(json(revisionFile));
});

describe.each([0, 1])('Sample Window %i in Focus', (index) => {
  it('opens on the pinned Layout Revision with no draft notice, and its Gantt is within both guards', () => {
    const { data, input } = focus[index]!;
    expect(data.layouts).toEqual([]);
    expect(Object.keys(data.layoutRevisions)).toHaveLength(1);
    expect(data.notices).toEqual([]);
    const range = { from: data.batch.from, to: data.batch.to };
    const frame = replayTimelineFrame(input, range);
    expect(timelineCost(input, frame).cost).toBeLessThanOrEqual(TIMELINE_BUDGET);
    const timeline = replayTimeline(input, range);
    const spans = timeline.materials.length + timeline.activities.length + timeline.markers.length;
    expect(spans).toBeLessThanOrEqual(GANTT_SPAN_LIMIT);
    expect(spans).toBeLessThanOrEqual(SPAN_TARGET);
  });

  it('shows the terminal placements before the Watermark, and keeps them with lowered evidence after it', () => {
    const { input } = focus[index]!;
    const { batch } = input;
    const open = batch.occurrences.filter((occurrence) => occurrence.end === null && occurrence.kind === 'VISIT');
    expect(open.length).toBeGreaterThan(0);
    const early = seekSceneState(input, shift(batch.watermark.at, -1));
    expect(early.markers.filter((marker) => marker.kind === 'after-watermark')).toEqual([]);
    const resting = wafers(early).filter((material) => open.some((occurrence) => occurrence.id === material.occurrenceId));
    expect(resting).toHaveLength(open.length);
    for (const material of resting) {
      expect(material.location?.componentId).toMatch(/^lp-/);
      expect(material.location?.holdingSiteId).toMatch(/^slot-/);
      expect(material.locationEvidence).toBe('observed');
    }
    const late = seekSceneState(input, shift(batch.to, -1));
    expect(late.markers.map((marker) => marker.kind)).toContain('after-watermark');
    const kept = wafers(late).filter((material) => open.some((occurrence) => occurrence.id === material.occurrenceId));
    expect(kept).toHaveLength(open.length);
    for (const material of kept) expect(material.locationEvidence).toBe('unknown');
  });

  it('places a wafer at a PM station during a PROCESS, and the unmapped chamber stays unknown', () => {
    const { input } = focus[index]!;
    const processes = input.batch.occurrences.filter((occurrence) => occurrence.kind === 'PROCESS' && occurrence.end !== null);
    const mapped = processes.find((occurrence) => occurrence.location!.moduleAlias !== 'PM5')!;
    const middle = (occurrence: typeof mapped) => millisToWallClock(Math.floor((wallClockToMillis(occurrence.start.at!) + wallClockToMillis(occurrence.end!.at!)) / 2));
    const state = seekSceneState(input, middle(mapped));
    const material = state.materials.find((candidate) => candidate.occurrenceId === mapped.id)!;
    expect(material.location).toEqual({ componentId: `pm-${'abcd'[Number(mapped.location!.moduleAlias.slice(2)) - 1]}`, holdingSiteId: 'station-1' });
    expect(material.locationEvidence).toBe('observed');

    const unmapped = processes.find((occurrence) => occurrence.location!.moduleAlias === 'PM5')!;
    const other = seekSceneState(input, middle(unmapped));
    expect(other.materials.find((candidate) => candidate.occurrenceId === unmapped.id)).toMatchObject({ location: null, locationEvidence: 'unknown' });
    expect(other.markers).toContainEqual({ kind: 'unmapped-alias', alias: 'PM5', occurrenceId: unmapped.id });
  });

  it('puts two wafers on the dual EFEM robot on two different blades', () => {
    const { input } = focus[index]!;
    const transfers = input.batch.occurrences.filter((occurrence) => occurrence.kind === 'TRANSFER' && occurrence.location!.moduleAlias === 'EFEM_R1');
    const together = transfers.flatMap((a, i) => transfers.slice(i + 1).filter((b) => a.start.at! < b.end!.at! && b.start.at! < a.end!.at!)
      .map((b) => ({ a, b, at: a.start.at! > b.start.at! ? a.start.at! : b.start.at! })));
    expect(together.length).toBeGreaterThanOrEqual(3);
    for (const { a, b, at } of together) {
      const state = seekSceneState(input, at);
      const sites = [a, b].map((occurrence) => state.materials.find((material) => material.occurrenceId === occurrence.id)?.location);
      expect(sites.map((site) => site?.componentId)).toEqual(['robot-1', 'robot-1']);
      expect(new Set(sites.map((site) => site?.holdingSiteId)).size).toBe(2);
      expect(state.markers.filter((marker) => marker.kind === 'occupancy-conflict')).toEqual([]);
    }
  });
});

it('leaves PM5 as the only referenced alias without a mapping, and a Data Quality Issue in each window', () => {
  const inventory = observedInventorySchema.parse(json([...generated.keys()].find((path) => path.endsWith('.inventory.json'))!));
  const mapping: MappingVersion = mappingVersionSchema.parse(json([...generated.keys()].find((path) => path.endsWith('.mapping.json'))!));
  expect(computeCoverage(inventory, mapping).unmapped.map(({ alias }) => alias)).toEqual(['PM5']);
  expect(focus.map(({ data }) => data.batch.issues.map(({ issueType }) => issueType))).toEqual([['UnmatchedEnd'], ['UnmatchedEnd']]);
});

it('keeps the Record Sequence unique and ordered by time across both windows', () => {
  const records = focus.flatMap(({ data }) => [
    ...data.batch.occurrences.flatMap((o) => [o.start, ...(o.end ? [o.end] : [])]), ...data.batch.issues,
  ]).sort((a, b) => a.seq - b.seq);
  expect(new Set(records.map((r) => r.seq)).size).toBe(records.length);
  const times = records.map((r) => r.at!);
  expect(times).toEqual([...times].sort());
});
