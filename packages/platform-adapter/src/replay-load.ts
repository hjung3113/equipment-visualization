import type { ApiResponse, Assessment, ModuleHost } from '@ap/contracts';
import {
  assertReplayInput, checkBindingLayout, checkBindingMapping,
  type EquipmentLayoutDocument, type MappingVersion, type OccurrenceBatch, type ReplayInput,
} from '@eqv/core';
import { topviewContext, topviewEvents } from './endpoints.js';

export type LoadFailure = { kind: 'failed'; tone: 'danger' | 'warning'; title: string; message: string; errorId: string; notices: string[] };
/** What one load settles to. `forbidden` and `empty` carry no data; `ready` is a verified, complete `ReplayInput`. */
export type Settled =
  | { kind: 'ready'; input: ReplayInput; notices: string[] }
  | { kind: 'empty'; notices: string[] }
  | { kind: 'forbidden' }
  | LoadFailure;

const KIND_KO: Record<Assessment['kind'], string> = {
  collection: '수집', processing_delay: '처리 지연', coverage: '범위', time_domain: '시간 기준', respondent_history: '응답자 이력',
};
const REASON_KO = { source_unavailable: '출처를 쓸 수 없음', check_failed: '점검 실패' } as const;

/** `clear` raises no notice. `unknown` is worded as "not checked", never as "no problem" (unknown ≠ clear). */
export function assessmentNotices(assessments: readonly Assessment[]): string[] {
  const notices = assessments.flatMap((a) => {
    if (a.state === 'clear') return [];
    const detail = a.detail ? ` — ${a.detail}` : '';
    if (a.state === 'confirmed') return [`${KIND_KO[a.kind]}: 문제가 확인되었습니다${detail}`];
    return [`${KIND_KO[a.kind]}: 확인하지 못했습니다${a.reason ? ` (${REASON_KO[a.reason]})` : ''} — 이상 없음이 아닙니다${detail}`];
  });
  return [...new Set(notices)];
}

type Step<T> = { ok: true; data: T } | { ok: false; settled: Settled };
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

function failure(host: ModuleHost, tone: LoadFailure['tone'], title: string, text: string, assessments: Assessment[], correlationId?: string): LoadFailure {
  const errorId = host.reportError(new Error(`${title}: ${text}${correlationId ? ` (correlationId ${correlationId})` : ''}`));
  return { kind: 'failed', tone, title, message: text, errorId, notices: assessmentNotices(assessments) };
}

/**
 * Outcome → screen (decided deliberately, not by default):
 *   ok                       → render `data` (a null `data` is a data error); the caller resets `host.status` to ready if this screen set another
 *   empty                    → the screen's empty state; no status call
 *   forbidden                → `host.status('auth_required')`; the host draws that state (ADR-0053 G4)
 *   error                    → screen-local danger state with `message` and the `reportError` id; no status call
 *   timeout, too_large       → screen-local warning state, same fields; no status call
 * `unavailable` would hand the whole screen to the host for one failed query while equipment and time selection still work, and
 * `identity_mismatch` is the host's session-generation concept: neither is ever set from a query outcome.
 */
function step<T>(host: ModuleHost, response: ApiResponse<T>, assessments: Assessment[]): Step<T> {
  assessments.push(...response.assessments);
  const text = response.message ?? '';
  switch (response.outcome) {
    case 'ok':
      return response.data === null
        ? { ok: false, settled: failure(host, 'danger', '데이터 오류', '응답이 ok인데 data가 없습니다', assessments, response.correlationId) }
        : { ok: true, data: response.data };
    case 'empty': return { ok: false, settled: { kind: 'empty', notices: assessmentNotices(assessments) } };
    case 'forbidden': return { ok: false, settled: { kind: 'forbidden' } };
    case 'timeout': return { ok: false, settled: failure(host, 'warning', '응답 시간 초과', text || '서버가 제때 응답하지 않았습니다', assessments, response.correlationId) };
    case 'too_large': return { ok: false, settled: failure(host, 'warning', '구간이 너무 큽니다', text || '시간 구간을 줄이세요', assessments, response.correlationId) };
    case 'error': return { ok: false, settled: failure(host, 'danger', '불러오지 못했습니다', text || '서버 오류', assessments, response.correlationId) };
  }
}

const greater = (a: OccurrenceBatch['watermark'], b: OccurrenceBatch['watermark']) => b.seq > a.seq || (b.seq === a.seq && b.at > a.at) ? b : a;
const SCALARS = ['equipmentId', 'from', 'to', 'timeDomain', 'parserContractVersion', 'dataGeneration'] as const;

/**
 * Pages → one batch. `occurrences` and `issues` are concatenated in server page order (ADR-0002: never paired or reordered here);
 * the window scalars come from the first page and a later page that disagrees is a data error; `watermark` is the greatest
 * `(seq, at)`; the merged batch has no `continuationToken` (`assertReplayInput` requires a complete batch).
 */
export function mergePages(pages: readonly OccurrenceBatch[]): OccurrenceBatch {
  const [first, ...rest] = pages;
  if (!first) throw new RangeError('no page');
  for (const [index, page] of rest.entries()) {
    const differs = SCALARS.find((key) => page[key] !== first[key]);
    if (differs) throw new RangeError(`page ${index + 2}의 ${differs}(${page[differs]})가 첫 page(${first[differs]})와 다릅니다`);
  }
  const head = { ...first };
  delete head.continuationToken;
  return {
    ...head,
    watermark: pages.reduce((best, page) => greater(best, page.watermark), first.watermark),
    occurrences: pages.flatMap((page) => page.occurrences),
    issues: pages.flatMap((page) => page.issues),
  };
}

/** Server data is not trusted to be self-consistent (ADR-0011): every Mapping Version and Layout is content-checked against its Binding. */
export async function verifyContext(context: Omit<ReplayInput, 'batch'>, equipmentId: string): Promise<{ input: Omit<ReplayInput, 'batch'>; notices: string[] }> {
  const mappings = new Map<string, MappingVersion>();
  const layouts = new Map<string, EquipmentLayoutDocument>();
  const layoutRevisions: Record<string, EquipmentLayoutDocument> = {};
  const notices = new Set<string>();
  for (const binding of context.bindings.bindings) {
    if (!mappings.has(binding.mappingHash)) {
      const raw = context.mappings.find((m) => m.hash === binding.mappingHash);
      if (raw === undefined) throw new RangeError(`Mapping Version ${binding.mappingHash}이(가) 응답에 없습니다`);
      const checked = await checkBindingMapping(raw, binding, equipmentId);
      if (!checked.ok) throw new RangeError(`Mapping Version ${binding.mappingHash}: ${checked.problem}`);
      mappings.set(binding.mappingHash, checked.value);
    }
    const revision = binding.layoutRevision;
    if (revision === undefined ? layouts.has(binding.layoutId) : revision in layoutRevisions) continue;
    const raw = revision === undefined ? context.layouts.find((l) => l.id === binding.layoutId) : context.layoutRevisions?.[revision];
    if (raw === undefined) throw new RangeError(`Layout ${binding.layoutId}${revision === undefined ? ' (초안)' : ` ${revision}`}이(가) 응답에 없습니다`);
    const checked = await checkBindingLayout(raw, binding.layoutId, revision);
    if (!checked.ok) throw new RangeError(`Layout ${binding.layoutId}: ${checked.problem}`);
    if (checked.notice !== undefined) notices.add(checked.notice);
    if (revision === undefined) layouts.set(binding.layoutId, checked.value);
    else layoutRevisions[revision] = checked.value;
  }
  return { input: { bindings: context.bindings, mappings: [...mappings.values()], layouts: [...layouts.values()], layoutRevisions }, notices: [...notices] };
}

/**
 * Loads the context and every events page for `equipmentId` through the declared endpoints only. The loop ends when a page has no
 * `continuationToken`; it is bounded by the server's `maxHours` window, a token seen twice (a cycle is a data error), and `signal`.
 * Resolves null when `signal` aborted: the caller drops the result.
 */
export async function loadReplayInput(host: ModuleHost, equipmentId: string, signal: AbortSignal): Promise<Settled | null> {
  const assessments: Assessment[] = [];
  try {
    if (!host.query) return failure(host, 'danger', '불러오지 못했습니다', '호스트가 query 기능을 제공하지 않습니다', assessments);
    const contextResponse = await host.query(topviewContext, { equipmentId }, signal);
    if (signal.aborted) return null;
    const context = step(host, contextResponse, assessments);
    if (!context.ok) return context.settled;
    const pages: OccurrenceBatch[] = [];
    const seen = new Set<string>();
    let token: string | undefined;
    do {
      const response = await host.query(topviewEvents, token === undefined ? { equipmentId } : { equipmentId, continuationToken: token }, signal);
      if (signal.aborted) return null;
      const page = step(host, response, assessments);
      if (!page.ok) {
        // An empty first page is an empty window; an empty later page leaves the batch incomplete.
        return pages.length > 0 && page.settled.kind === 'empty'
          ? failure(host, 'danger', '데이터 오류', '연속 page가 비어 있어 batch가 완전하지 않습니다', assessments, response.correlationId)
          : page.settled;
      }
      pages.push(page.data);
      token = page.data.continuationToken;
      if (token !== undefined && seen.has(token)) return failure(host, 'danger', '데이터 오류', 'continuationToken이 반복되어 page를 끝낼 수 없습니다', assessments);
      if (token !== undefined) seen.add(token);
    } while (token !== undefined);
    try {
      const batch = mergePages(pages);
      if (batch.equipmentId !== equipmentId) throw new RangeError(`batch.equipmentId(${batch.equipmentId})가 ${equipmentId}와 다릅니다`);
      const verified = await verifyContext(context.data, equipmentId);
      const input: ReplayInput = { ...verified.input, batch };
      assertReplayInput(input);
      return { kind: 'ready', input, notices: [...assessmentNotices(assessments), ...verified.notices] };
    } catch (error) {
      return signal.aborted ? null : failure(host, 'danger', '데이터 오류', message(error), assessments);
    }
  } catch (error) {
    return signal.aborted ? null : failure(host, 'danger', '불러오지 못했습니다', message(error), assessments);
  }
}
