import { defineEndpoint, menuPermission } from '@ap/contracts';
import type { OccurrenceBatch, ReplayInput } from '@eqv/core';

/**
 * Candidate endpoint declarations until AP #334 confirms the names (AP #492 direction for the `eqv:view` permission).
 * Both are reads. The host projects `from`/`to` from the applied Context (`time: 'apply'`); they are never params.
 * `topview-events` returns the server's source-paired Occurrences as is; the client never pairs Start/End or reorders (ADR-0002).
 * One endpoint names one menu: both serve the `topview` and `focus` screens and name `eqv:focus`, the registered menu id.
 * Kinds: `collection` + `processing_delay` + `coverage` say whether the window is complete (Watermark, late data);
 * `time_domain` carries the Site wall-clock domain the Occurrence times are in (merged: `mergeTimeDomain`).
 * `respondent_history` is left out: replay does not filter by equipment membership.
 */
const kinds = ['collection', 'processing_delay', 'coverage', 'time_domain'] as const;
const permission = menuPermission('eqv:view');

export type TopviewContextParams = { equipmentId: string };
export type TopviewEventsParams = { equipmentId: string; continuationToken?: string };

/** Every Binding, Mapping Version, draft Layout and Layout Revision effective in the applied time (ADR-0011). */
export const topviewContext = defineEndpoint<TopviewContextParams, Omit<ReplayInput, 'batch'>>({
  id: 'eqv.topview-context',
  menuId: 'eqv:focus',
  paramKeys: { equipmentId: true },
  permission,
  requiresScope: false,
  context: { time: 'apply' },
  kinds,
  mergeTimeDomain: true,
});

/**
 * Occurrences overlapping the applied window, paged by `continuationToken`. `maxHours: 8` (one shift) is a conductor decision:
 * REPLAY-CONTRACT.md and INTEGRATION.md name no bounded-fetch number, INTEGRATION forbids unbounded full-day fetches, and the
 * Focus Gantt budget was measured on single-window batches.
 */
export const topviewEvents = defineEndpoint<TopviewEventsParams, OccurrenceBatch>({
  id: 'eqv.topview-events',
  menuId: 'eqv:focus',
  paramKeys: { equipmentId: true, continuationToken: true },
  permission,
  requiresScope: false,
  context: { time: 'apply' },
  kinds,
  limits: { maxHours: 8 },
  mergeTimeDomain: true,
});
