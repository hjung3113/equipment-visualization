import {
  verifyBindingContext,
  type BindingsFile, type EquipmentLayoutDocument, type MappingVersion, type OccurrenceBatch,
} from '@eqv/core';
import type { FleetData } from '@eqv/editor';
import { DataError, listSampleWindows, loadEquipment, readOptional, readSampleWindow, windowHex, type SampleWindowEntry } from './onboarding-data.js';
import { layoutPath, mappingPath } from './paths.js';
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

      // A pinned Binding replays its own Layout Revision; an unpinned one the draft of its layoutId (ADR-0011).
      const verified = await verifyBindingContext(bindings.bindings, {
        mapping: (binding) => read(mappingPath(equipmentId, binding)),
        layout: (layoutId, revision) => read(layoutPath(layoutId, revision)),
      }, equipmentId);
      if (!verified.ok) {
        const { at, problem } = verified;
        if (at.kind === 'mapping') throw new DataError(`${mappingPath(equipmentId, at.binding)}: ${problem ?? 'Mapping Version 파일 없음'}`);
        throw new DataError(`${layoutPath(at.layoutId, at.revision)}: ${problem ?? 'Layout 파일 없음'}`);
      }
      const { mappings, layouts, layoutRevisions } = verified;
      notices.push(...verified.notices);
      return { kind: 'ok', record, batch, selectedWindow: loaded.data.selectedWindow, bindings, mappings, layouts, layoutRevisions, notices };
    } catch (error) {
      return { kind: 'error', record, error: errorMessage(error) };
    }
  } catch (error) {
    return { kind: 'error', record: null, error: errorMessage(error) };
  }
}
