import {
  layoutRevision, mappingVersionSchema, validateLayout, verifyMappingHash,
  type Binding, type BindingsFile, type EquipmentLayoutDocument, type MappingVersion, type OccurrenceBatch, type ReplayInput, type ReplayTimelineFrame,
} from '@eqv/core';
import type { FleetData } from '@eqv/editor';
import { DataError, listSampleWindows, loadEquipment, problems, readOptional, readSampleWindow, windowHex, type SampleWindowEntry } from './onboarding-data.js';

export type FocusData = {
  record: FleetData['record'];
  batch: OccurrenceBatch;
  /** The Sample Window `batch` was read from (the anchor rule may have chosen it). */
  selectedWindow: SampleWindowEntry;
  /** Never null: no published Binding is an empty list. */
  bindings: BindingsFile;
  /** Every Mapping Version a Binding names. */
  mappings: MappingVersion[];
  /** The draft Layout of each `layoutId` that has an unpinned Binding. */
  layouts: EquipmentLayoutDocument[];
  /** Each distinct `layoutRevision` a Binding pins, content-verified against its hash (ADR-0011). */
  layoutRevisions: Record<string, EquipmentLayoutDocument>;
  notices: string[];
};
export type FocusLoad =
  | { kind: 'not-found' }
  | { kind: 'error'; error: string; record: FleetData['record'] | null }
  | { kind: 'no-observations'; record: FleetData['record'] }
  | ({ kind: 'ok' } & FocusData);

/**
 * `replayTimeline` sorts the records once and then reads the Scene State at every breakpoint. A read costs the context it
 * searches (Bindings, Layouts, the Layout's components) plus, for each Occurrence open at that point and each Time Anomaly
 * inversion it scans, one location resolution through the Bindings, Mapping Versions and entries (see `timelineCost`).
 * Above this the Gantt is not computed. The value bounds the worst measured rate (a window with 1,000 to 3,000 Occurrences
 * open at once, about 0.21 µs per unit) to about 1 s. Measured in #106: the 50k-Occurrence mapped window costs 4,200,000 and
 * takes about 220 ms (it is then limited by `GANTT_SPAN_LIMIT`); a DQI-only window with 10,000 Bindings costs 100,260,000
 * and takes 0.6 s, with 50,000 about 2.5 billion.
 */
export const TIMELINE_BUDGET = 4_800_000;

/**
 * Most Gantt spans (material + activity spans + markers of the computed timeline) `FocusGantt` draws. Each span is an SVG
 * rect; the measured repaint is about 1.9 s per 100,000 spans, so 5,000 is about 100 ms. Above it the Gantt shows a notice.
 */
export const GANTT_SPAN_LIMIT = 5_000;

const maxOf = (values: number[]) => values.reduce((max, value) => Math.max(max, value), 0);

/**
 * Work of `replayTimeline` for `frame`: `records + breakpoints × (context + (open + inversions) × resolve)`.
 * `records` is the reducer's record set (reduce.ts: Occurrence starts, ends and Data Quality Issues), sorted once.
 * `open` is the most Occurrences open at any Record Sequence, an upper bound on the open set one read walks.
 * `inversions` is the adjacent timed record pairs whose time goes backwards (Time Anomaly candidates), which every read scans.
 * `context` is what a read does regardless of the open set: the Binding and Layout searches plus building and sorting the
 * Layout's components (`components × max(1, ⌈log₂ components⌉)`, the largest Layout).
 * `resolve` is one location resolution: `1 + bindings + mappings + entries + slots`, entries and slots at the largest
 * Mapping Version and entry (`mapping/resolve.ts` scans each list).
 */
export function timelineCost(input: ReplayInput, frame: ReplayTimelineFrame): {
  breakpoints: number; records: number; open: number; inversions: number; context: number; resolve: number; cost: number;
} {
  const { batch, bindings, mappings } = input;
  const layouts = [...input.layouts, ...Object.values(input.layoutRevisions ?? {})];
  const records = batch.issues.length + batch.occurrences.reduce((sum, o) => sum + (o.end ? 2 : 1), 0);
  const boundaries = [...batch.occurrences.flatMap((o) => [o.start, ...(o.end ? [o.end] : [])]), ...batch.issues].sort((a, b) => a.seq - b.seq);
  const starts = new Set(batch.occurrences.map((o) => o.start.seq));
  const issueSeqs = new Set(batch.issues.map((i) => i.seq));
  let running = 0;
  let open = 0;
  let previous: string | null = null;
  let inversions = 0;
  for (const { seq, at } of boundaries) {
    if (starts.has(seq)) open = Math.max(open, ++running);
    else if (!issueSeqs.has(seq)) running--;
    if (at !== null) {
      if (previous !== null && at < previous) inversions++;
      previous = at;
    }
  }
  const components = maxOf(layouts.map((layout) => layout.components.length));
  const entries = maxOf(mappings.map((mapping) => mapping.entries.length));
  const slots = maxOf(mappings.flatMap((mapping) => mapping.entries.map((entry) =>
    'ignore' in entry.target ? 0 : entry.target.slots?.assign.length ?? 0)));
  const context = bindings.bindings.length + layouts.length + components * Math.max(1, Math.ceil(Math.log2(components)));
  const resolve = 1 + bindings.bindings.length + mappings.length + entries + slots;
  const breakpoints = frame.breakpoints.length;
  return { breakpoints, records, open, inversions, context, resolve, cost: records + breakpoints * (context + (open + inversions) * resolve) };
}

const message = (error: unknown) => error instanceof Error ? error.message : '알 수 없는 오류';
const NO_BINDING = '게시된 Binding 없음';

/** A rejected read (not a 404) names the path it failed on. */
async function read(path: string): Promise<unknown | undefined> {
  try {
    return await readOptional(path);
  } catch (error) {
    throw new DataError(`${path}: ${message(error)}`);
  }
}

async function loadMapping(equipmentId: string, binding: Binding): Promise<MappingVersion> {
  const path = `onboarding/mappings/${equipmentId}/${binding.mappingHash.slice('sha256:'.length)}.mapping.json`;
  const raw = await read(path);
  if (raw === undefined) throw new DataError(`${path}: Mapping Version 파일 없음`);
  const parsed = mappingVersionSchema.safeParse(raw);
  if (!parsed.success) throw new DataError(`${path}: ${problems(parsed.error.issues)}`);
  const mapping = parsed.data;
  if (!await verifyMappingHash(mapping)) throw new DataError(`${path}: 내용 hash가 맞지 않습니다`);
  if (mapping.hash !== binding.mappingHash) throw new DataError(`${path}: hash(${mapping.hash})가 binding의 mappingHash와 다릅니다`);
  if (mapping.equipmentId !== equipmentId) throw new DataError(`${path}: equipmentId(${mapping.equipmentId})가 ${equipmentId}와 다릅니다`);
  if (mapping.layoutId !== binding.layoutId) throw new DataError(`${path}: layoutId(${mapping.layoutId})가 binding의 layoutId와 다릅니다`);
  return mapping;
}

async function loadLayout(layoutId: string, revision: string | undefined, notices: string[]): Promise<EquipmentLayoutDocument> {
  const path = revision === undefined ? `layouts/${layoutId}/draft.layout.json`
    : `layouts/${layoutId}/${revision.slice('sha256:'.length)}.layout.json`;
  if (revision === undefined) notices.push(`게시된 Layout Revision이 없어 초안 레이아웃으로 표시합니다 (${layoutId})`);
  const raw = await read(path);
  if (raw === undefined) throw new DataError(`${path}: Layout 파일 없음`);
  const result = validateLayout(raw);
  if (!result.ok) throw new DataError(`${path}: ${problems(result.issues)}`);
  const { layout } = result;
  if (layout.kind !== 'equipment-layout') throw new DataError(`${path}: equipment-layout이 아닙니다 (${layout.kind})`);
  if (layout.id !== layoutId) throw new DataError(`${path}: id(${layout.id})가 ${layoutId}와 다릅니다`);
  if (revision !== undefined && await layoutRevision(layout) !== revision) throw new DataError(`${path}: 내용 hash가 binding의 layoutRevision과 다릅니다`);
  return layout;
}

/**
 * Without `window`, the latest-`from` window that contains `anchor`, else the latest window. Every window is read and
 * checked on this path (a bad file is an error, never skipped); `notice` is set when several windows contain the anchor.
 */
async function windowForAnchor(equipmentId: string, anchor: string): Promise<{ hex: string | undefined; notice: string | null }> {
  const windows = await listSampleWindows(equipmentId);
  const containing: SampleWindowEntry[] = [];
  for (const entry of [...windows].reverse()) {
    const batch = await readSampleWindow(equipmentId, entry);
    if (batch.occurrences.some(({ id }) => id === anchor)) containing.push(entry);
  }
  const latest = containing[0];
  if (!latest) return { hex: undefined, notice: null };
  const notice = containing.length < 2 ? null
    : `진입 Occurrence ${anchor}가 Sample Window ${containing.length}개에 있어 가장 늦은 window(${latest.from} – ${latest.to})를 엽니다`;
  return { hex: windowHex(latest), notice };
}

/** Never rejects. Everything Focus replays is read and checked here: the batch, every Binding's Mapping Version and Layout. */
export async function loadFocus(equipmentId: string, options: { window?: string; anchor?: string | null } = {}): Promise<FocusLoad> {
  try {
    let { window } = options;
    let anchorNotice: string | null = null;
    let scanError: string | null = null;
    if (window === undefined && typeof options.anchor === 'string') {
      try {
        ({ hex: window, notice: anchorNotice } = await windowForAnchor(equipmentId, options.anchor));
      } catch (error) {
        scanError = message(error);
      }
    }
    const loaded = await loadEquipment(equipmentId, { window });
    if (loaded.kind === 'not-found') return loaded;
    if (scanError !== null) return { kind: 'error', record: loaded.kind === 'ok' ? loaded.data.record : loaded.record, error: scanError };
    if (loaded.kind !== 'ok') return loaded;
    const { record, batch } = loaded.data;
    try {
      const bindings: BindingsFile = loaded.data.bindings ?? { schemaVersion: '0.4', equipmentId, bindings: [] };
      const notices: string[] = [];
      if (anchorNotice) notices.push(anchorNotice);
      if (bindings.bindings.length === 0) notices.push(NO_BINDING);

      const mappings = new Map<string, MappingVersion>();
      for (const binding of bindings.bindings) {
        const key = JSON.stringify([binding.mappingHash, binding.layoutId]);
        if (!mappings.has(key)) mappings.set(key, await loadMapping(equipmentId, binding));
      }

      // A pinned Binding replays its own Layout Revision; an unpinned one the draft of its layoutId (ADR-0011).
      const drafts = [...new Set(bindings.bindings.filter((b) => b.layoutRevision === undefined).map((b) => b.layoutId))];
      const layouts: EquipmentLayoutDocument[] = [];
      for (const layoutId of drafts) layouts.push(await loadLayout(layoutId, undefined, notices));
      const layoutRevisions: Record<string, EquipmentLayoutDocument> = {};
      for (const binding of bindings.bindings) {
        const revision = binding.layoutRevision;
        if (revision === undefined || revision in layoutRevisions) continue;
        layoutRevisions[revision] = await loadLayout(binding.layoutId, revision, notices);
      }
      return { kind: 'ok', record, batch, selectedWindow: loaded.data.selectedWindow, bindings, mappings: [...mappings.values()], layouts, layoutRevisions, notices };
    } catch (error) {
      return { kind: 'error', record, error: message(error) };
    }
  } catch (error) {
    return { kind: 'error', record: null, error: message(error) };
  }
}
