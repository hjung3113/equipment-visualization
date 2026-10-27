import { occurrenceOverlapsWindow, type OccurrenceBatch, type ReplayInput } from '@eqv/core';
import { batch, bindings, layouts, mappings } from './cluster-single.generated.js';

/** Synthetic endpoint responses for a host's mock server (`eqv.topview-context`, `eqv.topview-events`). Never import from production code. */

export const EQV_MOCK_EQUIPMENT = 'eq-synth-01';
/** The host Global Context for the fixture's 30-minute sample window (naive seconds, as the host carries them). */
export const EQV_MOCK_WINDOW = { from: '2026-01-01T10:00:00', to: '2026-01-01T10:30:00' };

const PAGE_SIZE = 15;
const FIRST_PAGE_WATERMARK = { seq: 30, at: '2026-01-01T10:13:00.000' };
const NEXT_PAGE = 'p2';

/** The fixture context for `eq-synth-01`; any other equipment gets a ready context with no Binding. */
export function eqvMockContext(equipmentId: string): Omit<ReplayInput, 'batch'> {
  if (equipmentId === EQV_MOCK_EQUIPMENT) return { layouts, bindings, mappings };
  return { layouts: [], mappings: [], bindings: { schemaVersion: '0.4', equipmentId, bindings: [] } };
}

/** The fixture occurrences overlapping the requested window, in Record Sequence order, paged like a server would. */
export function eqvMockEvents(params: { equipmentId: string; from: string; to: string; continuationToken?: string }): OccurrenceBatch {
  const { equipmentId, continuationToken } = params;
  const from = `${params.from}.000`;
  const to = `${params.to}.000`;
  const { occurrences, issues, watermark, ...rest } = batch;
  const window = { ...rest, equipmentId, from, to };
  if (equipmentId !== EQV_MOCK_EQUIPMENT) return { ...window, watermark, occurrences: [], issues: [] };
  const kept = occurrences.filter((occurrence) => occurrenceOverlapsWindow(occurrence, from, to));
  if (kept.length <= PAGE_SIZE) return { ...window, watermark, occurrences: kept, issues };
  if (continuationToken === undefined) {
    return { ...window, watermark: FIRST_PAGE_WATERMARK, occurrences: kept.slice(0, PAGE_SIZE), issues: [], continuationToken: NEXT_PAGE };
  }
  return { ...window, watermark, occurrences: kept.slice(PAGE_SIZE), issues };
}
