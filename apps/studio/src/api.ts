import type { EquipmentRecord } from '@eqv/core';

export class ApiError extends Error {
  /** `body` is the parsed response body (`null` when there was none); a write endpoint reads `issues` and the like from it. */
  constructor(message: string, readonly status: number | null = null, readonly body: unknown = null) {
    super(message);
  }
}

export interface ImportStatus {
  enabled: boolean;
  reason?: string;
  insideGitWorkTree: boolean;
  catalog: 'data-root' | 'bundled';
  maxWindowBytes: number;
}

export interface DirEntry {
  name: string;
  kind: 'file' | 'dir';
}

async function request(input: string, init?: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch {
    throw new ApiError('서버에 연결할 수 없습니다');
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = (body as { error?: unknown } | null)?.error;
    throw new ApiError(typeof message === 'string' ? message : `요청 실패 (${response.status})`, response.status, body);
  }
  return body;
}

const json = (method: string, body: unknown): RequestInit => ({
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

export const readFile = (path: string) => request(`/api/files?${new URLSearchParams({ path })}`);

export async function listDir(dir: string): Promise<DirEntry[]> {
  const body = await request(`/api/files?${new URLSearchParams({ dir })}`);
  return (body as { entries: DirEntry[] }).entries;
}

export async function saveDraft(id: string, layout: unknown): Promise<string> {
  const path = `layouts/${id}/draft.layout.json`;
  await request(`/api/files?${new URLSearchParams({ path })}`, json('PUT', layout));
  return path;
}

export async function publishRevision(layout: unknown): Promise<{ path: string; revision: string }> {
  return (await request('/api/layout-revisions', json('POST', layout))) as { path: string; revision: string };
}

/** Creates the layout draft only if none exists: a 412 ApiError means someone else created it first. */
export async function createDraft(id: string, layout: unknown): Promise<string> {
  const path = `layouts/${id}/draft.layout.json`;
  const init = json('PUT', layout);
  await request(`/api/files?${new URLSearchParams({ path })}`, { ...init, headers: { ...init.headers as Record<string, string>, 'If-None-Match': '*' } });
  return path;
}

export async function saveAliasRules(path: string, file: unknown): Promise<void> {
  await request(`/api/files?${new URLSearchParams({ path })}`, json('PUT', file));
}

/** Writes an immutable file; an existing file with different content is an ApiError with status 409. */
export async function putImmutable(path: string, value: unknown): Promise<void> {
  await request(`/api/files?${new URLSearchParams({ path })}`, json('PUT', value));
}

export async function saveBindings(equipmentId: string, file: unknown): Promise<void> {
  await request(`/api/files?${new URLSearchParams({ path: `onboarding/bindings/${equipmentId}.bindings.json` })}`, json('PUT', file));
}

export const importStatus = async (): Promise<ImportStatus> => (await request('/api/import/status')) as ImportStatus;

/** Creates the equipment record; the write is create-only, so an existing record is an ApiError (409 field collision, 412 same id). */
export async function registerEquipment(record: EquipmentRecord): Promise<{ path: string; created: true }> {
  return (await request('/api/import/equipment', json('POST', record))) as { path: string; created: true };
}
