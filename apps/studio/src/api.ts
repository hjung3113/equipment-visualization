export class ApiError extends Error {
  constructor(message: string, readonly status: number | null = null) {
    super(message);
  }
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
    throw new ApiError(typeof message === 'string' ? message : `요청 실패 (${response.status})`, response.status);
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
