import type { EquipmentRecord, ImportIssue, ImportWarningCode, SampleWindowSummary, TemplateDocument } from '@eqv/core';

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
  catalog: 'bundled' | 'bundled+data-root';
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

async function putFile(path: string, body: unknown, headers?: Record<string, string>): Promise<void> {
  const init = json('PUT', body);
  await request(`/api/files?${new URLSearchParams({ path })}`, headers === undefined
    ? init
    : { ...init, headers: { ...init.headers as Record<string, string>, ...headers } });
}

export const readFile = (path: string) => request(`/api/files?${new URLSearchParams({ path })}`);

export async function listDir(dir: string): Promise<DirEntry[]> {
  const body = await request(`/api/files?${new URLSearchParams({ dir })}`);
  return (body as { entries: DirEntry[] }).entries;
}

/** A directory listing where a missing directory (404) is empty; every other failure propagates. */
export async function dirOrEmpty(dir: string): Promise<DirEntry[]> {
  try {
    return await listDir(dir);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return [];
    throw error;
  }
}

export async function saveDraft(id: string, layout: unknown): Promise<string> {
  const path = `layouts/${id}/draft.layout.json`;
  await putFile(path, layout);
  return path;
}

export async function publishRevision(layout: unknown): Promise<{ path: string; revision: string }> {
  return (await request('/api/layout-revisions', json('POST', layout))) as { path: string; revision: string };
}

/** Creates the layout draft only if none exists: a 412 ApiError means someone else created it first. */
export async function createDraft(id: string, layout: unknown): Promise<string> {
  const path = `layouts/${id}/draft.layout.json`;
  await putFile(path, layout, { 'If-None-Match': '*' });
  return path;
}

export async function saveAliasRules(path: string, file: unknown): Promise<void> {
  await putFile(path, file);
}

/** Writes an immutable file; an existing file with different content is an ApiError with status 409. */
export async function putImmutable(path: string, value: unknown): Promise<void> {
  await putFile(path, value);
}

export async function saveBindings(equipmentId: string, file: unknown): Promise<void> {
  await putFile(`onboarding/bindings/${equipmentId}.bindings.json`, file);
}

export interface TemplateCatalog {
  templates: { source: 'bundled' | 'data-root'; file: string; document: TemplateDocument }[];
  skipped: string[];
  shadowed: string[];
}

export const listTemplates = async (): Promise<TemplateCatalog> => (await request('/api/templates')) as TemplateCatalog;

/** Promotes the published Layout Revision `<layoutId>/<revision>` to a Template in the data root (ADR-0015); create-only. */
export async function promoteTemplate(body: { layoutId: string; revision: string; templateId: string; name: string }):
  Promise<{ path: string; templateId: string }> {
  return (await request('/api/template-promotions', json('POST', body))) as { path: string; templateId: string };
}

export const importStatus = async (): Promise<ImportStatus> => (await request('/api/import/status')) as ImportStatus;

/** Creates the equipment record; the write is create-only, so an existing record is an ApiError (409 field collision, 412 same id). */
export async function registerEquipment(record: EquipmentRecord): Promise<{ path: string; created: true }> {
  return (await request('/api/import/equipment', json('POST', record))) as { path: string; created: true };
}

/** Sends the selected file's text unchanged so the import boundary hashes and stores the submitted JSON. */
async function importText(input: string, method: string, text: string, headers: Record<string, string>) {
  return request(input, { method, headers, body: text });
}

export interface ImportWindowResult {
  path: string;
  created: boolean;
  summary: SampleWindowSummary;
  warnings: ImportIssue<ImportWarningCode>[];
}

export async function importWindow(equipmentId: string, text: string): Promise<ImportWindowResult> {
  const query = new URLSearchParams({ equipmentId });
  return (await importText(`/api/import/windows?${query}`, 'POST', text, { 'Content-Type': 'application/json' })) as ImportWindowResult;
}

export interface ImportFileResult {
  path: string;
  created: boolean;
}

export async function putAliasMetadata(equipmentId: string, text: string, options: { createOnly: boolean }): Promise<ImportFileResult> {
  const query = new URLSearchParams({ equipmentId });
  const headers = { 'Content-Type': 'application/json', ...(options.createOnly ? { 'If-None-Match': '*' } : {}) };
  return (await importText(`/api/import/alias-metadata?${query}`, 'PUT', text, headers)) as ImportFileResult;
}

export async function putTypeDictionary(maker: string, model: string, text: string): Promise<ImportFileResult> {
  const query = new URLSearchParams({ maker, model });
  return (await importText(`/api/import/type-dictionary?${query}`, 'PUT', text, { 'Content-Type': 'application/json' })) as ImportFileResult;
}
