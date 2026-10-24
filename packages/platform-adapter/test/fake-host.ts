import { act } from '@testing-library/react';
import type { ApiResponse, Assessment, ContextKey, EndpointSpec, GlobalContext, ModuleHost, ModuleStatus, ModuleTarget } from '@ap/contracts';

export type QueryCall = { id: string; params: unknown; signal: AbortSignal | undefined };
export type QueryHandler = (call: QueryCall) => Promise<ApiResponse<unknown>>;

export type FakeHostOptions = {
  page?: Record<string, string>;
  context?: Partial<GlobalContext>;
  unsupported?: ContextKey[];
  detailSlot?: boolean;
  query: QueryHandler | null;
};

export const response = <T>(outcome: ApiResponse<T>['outcome'], data: T | null, extra: Partial<ApiResponse<T>> = {}): ApiResponse<T> =>
  ({ outcome, data, assessments: [], trust: null, correlationId: 'corr-1', ...extra });
export const ok = <T>(data: T, assessments: Assessment[] = []) => response('ok', data, { assessments });

/** A `ModuleHost` typed against `@ap/contracts` (the kernel is not importable by a host module). Records what a screen does to it. */
export function createFakeHost(options: FakeHostOptions) {
  const page = { ...options.page };
  let context = { ...options.context };
  const unsupported = [...options.unsupported ?? []];
  const listeners = new Set<() => void>();
  const abort = new AbortController();
  const log = {
    queries: [] as QueryCall[],
    statuses: [] as ModuleStatus[],
    errors: [] as unknown[],
    navigations: [] as ModuleTarget[],
    shown: [] as { node: unknown; label: string }[],
    cleared: 0,
  };
  // A host change reaches mounted screens through subscribe; React expects it inside act.
  const emit = () => act(() => listeners.forEach((listener) => listener()));
  const query = options.query;
  const host: ModuleHost = {
    contract: 1,
    session: () => ({ user: null, generation: 1 }),
    can: () => true,
    params: () => ({}),
    page: (key) => page[key] ?? null,
    setPage: () => undefined,
    href: () => null,
    navigate: (target) => { log.navigations.push(target); return true; },
    returnTarget: () => '/',
    context: () => ({ values: context, unsupported }),
    ...(query ? {
      query: async <P, T>(spec: EndpointSpec<P, T>, params: P, signal?: AbortSignal) => {
        const call = { id: spec.id, params, signal };
        log.queries.push(call);
        return await query(call) as ApiResponse<T>;
      },
    } : {}),
    config: () => null,
    lang: () => 'ko',
    notify: () => undefined,
    status: (next) => { log.statuses.push(next); },
    reportError: (error) => { log.errors.push(error); return `err-${log.errors.length}`; },
    focusTarget: () => undefined,
    ...(options.detailSlot ? { detail: {
      show: (node: unknown, label: string) => { log.shown.push({ node, label }); },
      clear: () => { log.cleared += 1; },
    } } : {}),
    subscribe: (onChange) => { listeners.add(onChange); return () => { listeners.delete(onChange); }; },
    signal: abort.signal,
  };
  return {
    host,
    log,
    setPage(patch: Record<string, string | null>) {
      for (const [key, value] of Object.entries(patch)) if (value === null) delete page[key]; else page[key] = value;
      emit();
    },
    setContext(next: Partial<GlobalContext>) { context = { ...next }; emit(); },
    abortScreen: () => abort.abort(),
  };
}

export type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };
export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}
