import {
  checkBindingLayout, checkBindingMapping,
  type Binding, type BindingsFile, type EquipmentLayoutDocument, type MappingVersion, type OccurrenceBatch,
} from '@eqv/core';
import type { FleetData } from '@eqv/editor';
import { DataError, listSampleWindows, loadEquipment, readOptional, readSampleWindow, windowHex, type SampleWindowEntry } from './onboarding-data.js';
import { errorMessage } from './error-message.js';

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

const NO_BINDING = '게시된 Binding 없음';

/** A rejected read (not a 404) names the path it failed on. */
async function read(path: string): Promise<unknown | undefined> {
  try {
    return await readOptional(path);
  } catch (error) {
    throw new DataError(`${path}: ${errorMessage(error)}`);
  }
}

async function loadMapping(equipmentId: string, binding: Binding): Promise<MappingVersion> {
  const path = `onboarding/mappings/${equipmentId}/${binding.mappingHash.slice('sha256:'.length)}.mapping.json`;
  const raw = await read(path);
  if (raw === undefined) throw new DataError(`${path}: Mapping Version 파일 없음`);
  const checked = await checkBindingMapping(raw, binding, equipmentId);
  if (!checked.ok) throw new DataError(`${path}: ${checked.problem}`);
  return checked.value;
}

async function loadLayout(layoutId: string, revision: string | undefined, notices: string[]): Promise<EquipmentLayoutDocument> {
  const path = revision === undefined ? `layouts/${layoutId}/draft.layout.json`
    : `layouts/${layoutId}/${revision.slice('sha256:'.length)}.layout.json`;
  const raw = await read(path);
  if (raw === undefined) throw new DataError(`${path}: Layout 파일 없음`);
  const checked = await checkBindingLayout(raw, layoutId, revision);
  if (!checked.ok) throw new DataError(`${path}: ${checked.problem}`);
  if (checked.notice !== undefined) notices.push(checked.notice);
  return checked.value;
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
        scanError = errorMessage(error);
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
      return { kind: 'error', record, error: errorMessage(error) };
    }
  } catch (error) {
    return { kind: 'error', record: null, error: errorMessage(error) };
  }
}
