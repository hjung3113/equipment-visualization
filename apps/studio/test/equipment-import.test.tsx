// @vitest-environment jsdom
import { readFile, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { sampleWindowName } from '@eqv/core';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
import { createFileApi } from '../server/files.js';
import { importFixture, seedRoot, writeJson } from './seed.js';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const repo = resolve(process.cwd(), '../..');
let base: string;
let root: string;
let api: ReturnType<typeof createFileApi>;
let sent: { method: string; url: string; body: string; headers: Record<string, string> }[];

beforeEach(async () => {
  ({ base, root } = await seedRoot());
  sent = [];
  await writeJson(root, 'equipment/eq-synth-03.json', await importFixture('eq-synth-03.equipment.json'));
  api = createFileApi({ root, repoRoot: repo });
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>));
    const body = String(init?.body ?? '');
    sent.push({ method, url, body, headers });
    const result = await api.handle({ method, url, headers, body });
    return new Response(JSON.stringify(result.body), { status: result.status });
  });
});

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await rm(base, { recursive: true, force: true });
});

const at = (path: string) => window.history.replaceState(null, '', path);
const loaded = async () => {
  await screen.findByText('Sample Window', { exact: true });
};

async function openPage() {
  at('/equipment/eq-synth-03');
  render(<App />);
  await loaded();
}

async function upload(label: string, text: string, name: string) {
  const button = await screen.findByRole('button', { name: label }) as HTMLButtonElement;
  await waitFor(() => expect(button.disabled).toBe(false));
  button.focus();
  const input = screen.getByLabelText(label) as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File([text], name, { type: 'application/json' })] } });
}

async function preview(title = 'Sample Window 미리보기') {
  await screen.findByText('가져오기는 값을 고치지 않습니다');
  await waitFor(() => expect(screen.queryByText('검사 중…')).toBeNull());
  return screen.getByRole('region', { name: title });
}

function detailValue(scope: HTMLElement, label: string) {
  const term = within(scope).getByText(label, { exact: true });
  return term.closest('div')?.querySelector('dd')?.textContent ?? null;
}

function rowsOf(table: HTMLElement) {
  return within(table).getAllByRole('row').slice(1);
}

async function storedWindowNames() {
  try {
    return await readdir(join(root, 'observations/eq-synth-03/windows'));
  } catch {
    return [];
  }
}

const invalidFiles = [
  ['sub-ms.batch.json', 'fraction-too-long', 'occurrences.0.start.at'],
  ['continuation.batch.json', 'continuation', 'continuationToken'],
  ['point-events.json', 'schema', '(root)'],
] as const;

it.each(invalidFiles)('shows every rejection for %s without writing a Sample Window', async (fileName, code, path) => {
  const text = await readFile(join(repo, 'fixtures/import/invalid', fileName), 'utf8');
  await openPage();
  await upload('Sample Window 가져오기', text, fileName);
  const panel = await preview();
  const table = screen.getByRole('table', { name: '가져오기 문제' });
  const rows = rowsOf(table);
  const match = rows.find((row) => row.textContent?.includes(code));
  if (fileName === 'point-events.json') {
    expect(rows).toHaveLength(9);
    expect(match).toBeTruthy();
    expect(rows.some((row) => row.textContent?.includes('(root)'))).toBe(true);
    expect(within(screen.getByRole('alert')).getByText(/Start\/End 점 이벤트나 원시 로그는 원천 변환기에서 Occurrence로 바꾼 뒤/)).toBeTruthy();
  } else {
    expect(match?.textContent).toContain(path);
  }
  if (fileName === 'sub-ms.batch.json') {
    expect(within(panel).queryByText('구간', { exact: true })).toBeNull();
    expect(match?.textContent).toContain('2026-01-01T10:05:00.123456');
  }
  expect((screen.getByRole('button', { name: '가져오기' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole('alert').textContent).toContain('가져올 수 없습니다');
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: '닫기' })));
  expect(await storedWindowNames()).toEqual([]);
});

it('previews and imports w1 with preserved evidence, exact body text, toast, and row focus', async () => {
  const w1Text = await readFile(join(repo, 'fixtures/import/eq-synth-03.w1.batch.json'), 'utf8');
  const w1 = JSON.parse(w1Text) as Record<string, unknown>;
  await openPage();
  await upload('Sample Window 가져오기', w1Text, 'eq-synth-03.w1.batch.json');
  const panel = await preview();
  expect(detailValue(panel, '구간')).toBe('2026-01-01T10:00:00.000 – 2026-01-01T10:30:00.000');
  expect(detailValue(panel, 'Occurrence')).toBe('11개 · 열린 Occurrence 1개');
  expect(detailValue(panel, '시각 없는 경계')).toBe('1개 (at: null)');
  expect(detailValue(panel, 'Data Quality Issue')).toBe('2개 · EndBeforeStart 1개 보존됨 · UnmatchedEnd 1개 보존됨');
  const evidence = within(panel).getByText('경계 근거', { exact: true }).closest('div')!;
  expect(Array.from(evidence.querySelectorAll('[data-evidence]'), (badge) => badge.textContent)).toEqual(['관측 19', '파생 1', '예시 0', '미확인 1']);
  expect(detailValue(panel, 'hash')).toBe('e4105058c692');

  const importButton = screen.getByRole('button', { name: '가져오기' });
  expect(document.activeElement).toBe(importButton);
  fireEvent.click(importButton);
  const message = 'Sample Window 2026-01-01T10:00:00.000 – 2026-01-01T10:30:00.000을(를) 가져왔습니다';
  await waitFor(() => expect(screen.getAllByRole('status').some((item) => item.textContent?.includes(message))).toBe(true));
  await waitFor(() => expect(screen.getByText('1개', { exact: true })).toBeTruthy());
  expect(document.activeElement).toBe(screen.getByRole('link', {
    name: '2026-01-01T10:00:00.000 – 2026-01-01T10:30:00.000 Onboarding 열기',
  }));
  const path = `observations/eq-synth-03/windows/${await sampleWindowName(w1 as Parameters<typeof sampleWindowName>[0])}.batch.json`;
  expect(JSON.parse(await readFile(join(root, path), 'utf8'))).toEqual(w1);
  expect(sent.find(({ url }) => new URL(url, 'http://studio.test').pathname === '/api/import/windows')?.body).toBe(w1Text);
});

it('imports w2 after w1 as a separate Sample Window', async () => {
  const w1Text = await readFile(join(repo, 'fixtures/import/eq-synth-03.w1.batch.json'), 'utf8');
  const w2Text = await readFile(join(repo, 'fixtures/import/eq-synth-03.w2.batch.json'), 'utf8');
  await openPage();
  await upload('Sample Window 가져오기', w1Text, 'w1.json');
  await preview();
  fireEvent.click(screen.getByRole('button', { name: '가져오기' }));
  await waitFor(() => expect(screen.getByText('1개', { exact: true })).toBeTruthy());
  await upload('Sample Window 가져오기', w2Text, 'w2.json');
  await preview();
  fireEvent.click(screen.getByRole('button', { name: '가져오기' }));
  await waitFor(() => expect(screen.getByText('2개', { exact: true })).toBeTruthy());
});

it('rejects an overlapping Sample Window in the preview when the existing window is loaded', async () => {
  const w1Text = await readFile(join(repo, 'fixtures/import/eq-synth-03.w1.batch.json'), 'utf8');
  const w1 = JSON.parse(w1Text) as Record<string, unknown>;
  const stored = await api.handle({ method: 'POST', url: `/api/import/windows?${new URLSearchParams({ equipmentId: 'eq-synth-03' })}`,
    headers: { 'Content-Type': 'application/json' }, body: w1Text });
  expect(stored.status).toBe(201);

  await openPage();
  await screen.findByRole('link', {
    name: '2026-01-01T10:00:00.000 – 2026-01-01T10:30:00.000 Onboarding 열기',
  });
  const overlapping = { ...w1, to: '2026-01-01T10:30:00.001' };
  await upload('Sample Window 가져오기', JSON.stringify(overlapping), 'overlapping.json');
  await preview();

  const table = screen.getByRole('table', { name: '가져오기 문제' });
  expect(table.textContent).toContain('window-overlap');
  expect(screen.getByText('문제')).toBeTruthy();
  expect(screen.queryByText('서버 판정')).toBeNull();
  expect(screen.getByRole('alert').textContent).toContain('가져올 수 없습니다');
  expect((screen.getByRole('button', { name: '가져오기' }) as HTMLButtonElement).disabled).toBe(true);
  expect(sent.filter(({ method, url }) => method === 'POST' && new URL(url, 'http://studio.test').pathname === '/api/import/windows')).toEqual([]);
  expect(await storedWindowNames()).toHaveLength(1);
});

it('keeps the server overlap verdict final when the page data is stale', async () => {
  const w1Text = await readFile(join(repo, 'fixtures/import/eq-synth-03.w1.batch.json'), 'utf8');
  const w1 = JSON.parse(w1Text) as Record<string, unknown>;
  await openPage();
  const stored = await api.handle({ method: 'POST', url: `/api/import/windows?${new URLSearchParams({ equipmentId: 'eq-synth-03' })}`,
    headers: { 'Content-Type': 'application/json' }, body: w1Text });
  expect(stored.status).toBe(201);
  const changed = { ...w1, to: '2026-01-01T10:30:00.001' };
  await upload('Sample Window 가져오기', JSON.stringify(changed), 'changed.json');
  await preview();
  fireEvent.click(screen.getByRole('button', { name: '가져오기' }));
  await screen.findByText('서버가 가져오기를 거부했습니다');
  const serverTable = screen.getByRole('table', { name: '가져오기 문제' });
  expect(screen.getByText('서버 판정')).toBeTruthy();
  expect(serverTable.textContent).toContain('window-overlap');
  expect((screen.getByRole('button', { name: '가져오기' }) as HTMLButtonElement).disabled).toBe(true);
  await waitFor(() => expect(screen.getByText('1개', { exact: true })).toBeTruthy());
  expect(await storedWindowNames()).toHaveLength(1);
});

it('keeps an identical window idempotent and leaves its stored bytes unchanged', async () => {
  const w1Text = await readFile(join(repo, 'fixtures/import/eq-synth-03.w1.batch.json'), 'utf8');
  const w1 = JSON.parse(w1Text) as Record<string, unknown>;
  await writeJson(root, `observations/eq-synth-03/windows/${await sampleWindowName(w1 as Parameters<typeof sampleWindowName>[0])}.batch.json`, w1);
  const [storedName] = await storedWindowNames();
  const before = await readFile(join(root, 'observations/eq-synth-03/windows', storedName!), 'utf8');
  await openPage();
  await upload('Sample Window 가져오기', w1Text, 'eq-synth-03.w1.batch.json');
  const panel = await preview();
  expect(within(panel).getByText('같은 내용의 window가 이미 있습니다')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '가져오기' }));
  await waitFor(() => expect(screen.getAllByRole('status').some((item) => item.textContent?.includes('이미 있는 window입니다'))).toBe(true));
  expect(screen.getByText('1개', { exact: true })).toBeTruthy();
  const after = await readFile(join(root, `observations/eq-synth-03/windows/${(await storedWindowNames())[0]}`), 'utf8');
  expect(after).toBe(before);
});

it('creates absent alias metadata without a replacement dialog', async () => {
  const text = await readFile(join(repo, 'fixtures/import/eq-synth-03.alias-metadata.json'), 'utf8');
  const fixture = JSON.parse(text) as Record<string, unknown>;
  await openPage();
  await upload('Alias metadata', text, 'eq-synth-03.alias-metadata.json');
  await preview('Alias metadata 미리보기');
  fireEvent.click(screen.getByRole('button', { name: '가져오기' }));
  await waitFor(() => expect(screen.getAllByRole('status').some((item) => item.textContent?.includes('alias 12개'))).toBe(true));
  await waitFor(() => expect(screen.getAllByRole('definition').some((item) => item.textContent === 'alias 12개')).toBe(true));
  expect(screen.queryByRole('alertdialog')).toBeNull();
  expect(JSON.parse(await readFile(join(root, 'observations/eq-synth-03/alias-metadata.json'), 'utf8'))).toEqual(fixture);
  const request = sent.find(({ url }) => new URL(url, 'http://studio.test').pathname === '/api/import/alias-metadata')!;
  expect(request.body).toBe(text);
  expect(request.headers['If-None-Match']).toBe('*');
});

it('shows alias changes and replaces only after the alert dialog is confirmed', async () => {
  const original = JSON.parse(await readFile(join(repo, 'fixtures/import/eq-synth-03.alias-metadata.json'), 'utf8')) as {
    schemaVersion: string; equipmentId: string; aliases: Record<string, unknown>[];
  };
  const changed = { ...original, aliases: [
    ...original.aliases.slice(1).map((alias, index) => index === 0 ? { ...alias, moduleType: 'SYN_CHANGED' } : alias),
    { alias: 'ZZ1' },
  ] };
  await writeJson(root, 'observations/eq-synth-03/alias-metadata.json', original);
  await openPage();
  await upload('Alias metadata', JSON.stringify(changed), 'changed-aliases.json');
  const panel = await preview('Alias metadata 미리보기');
  const changes = '추가 1개 · 삭제 1개 · 변경 1개 · 그대로 10개';
  expect(detailValue(panel, '변경')).toBe(changes);
  fireEvent.click(screen.getByRole('button', { name: '가져오기' }));
  const dialog = await screen.findByRole('alertdialog');
  expect(dialog.textContent).toContain(changes);
  const cancel = within(dialog).getByRole('button', { name: '취소' });
  await waitFor(() => expect(document.activeElement).toBe(cancel));
  fireEvent.click(cancel);
  expect(JSON.parse(await readFile(join(root, 'observations/eq-synth-03/alias-metadata.json'), 'utf8'))).toEqual(original);
  fireEvent.click(screen.getByRole('button', { name: '가져오기' }));
  const confirm = await screen.findByRole('alertdialog');
  fireEvent.click(within(confirm).getByRole('button', { name: '교체' }));
  await waitFor(() => expect(screen.getAllByRole('status').some((item) => item.textContent?.includes('교체했습니다'))).toBe(true));
  expect(JSON.parse(await readFile(join(root, 'observations/eq-synth-03/alias-metadata.json'), 'utf8'))).toEqual(changed);
});

it('rejects alias metadata for another equipment in the preview', async () => {
  const fixture = await importFixture('eq-synth-03.alias-metadata.json');
  const text = JSON.stringify({ ...fixture, equipmentId: 'eq-other' });
  await openPage();
  await upload('Alias metadata', text, 'other-equipment.json');
  await preview('Alias metadata 미리보기');
  expect(screen.getByRole('table', { name: '가져오기 문제' }).textContent).toContain('equipment-mismatch');
  expect((screen.getByRole('button', { name: '가져오기' }) as HTMLButtonElement).disabled).toBe(true);
});

it('creates a Model Type Dictionary, then blocks a second import as create-only', async () => {
  const text = await readFile(join(repo, 'fixtures/import/synth-maker-b.synth-wet.type-dictionary.json'), 'utf8');
  const fixture = JSON.parse(text) as { entries: unknown[] };
  await openPage();
  await upload('Type Dictionary(Model 범위)', text, 'type-dictionary.json');
  await preview('Type Dictionary 미리보기');
  fireEvent.click(screen.getByRole('button', { name: '가져오기' }));
  const path = 'onboarding/scopes/model/synth-maker-b/synth-wet/type-dictionary.json';
  await waitFor(() => expect(screen.getAllByRole('status').some((item) => item.textContent?.includes('ModuleType 6개'))).toBe(true));
  expect(JSON.parse(await readFile(join(root, path), 'utf8'))).toEqual(fixture);
  await waitFor(() => expect(screen.getAllByRole('definition').some((item) => item.textContent === 'ModuleType 6개')).toBe(true));
  await upload('Type Dictionary(Model 범위)', text, 'type-dictionary.json');
  const panel = await preview('Type Dictionary 미리보기');
  expect(within(panel).getByText('이 Model의 Type Dictionary가 이미 있습니다')).toBeTruthy();
  expect(within(panel).queryByText('거부나 경고가 없습니다')).toBeNull();
  expect((screen.getByRole('button', { name: '가져오기' }) as HTMLButtonElement).disabled).toBe(true);
});

it('rejects a Type Dictionary whose scope does not match the equipment Model', async () => {
  const fixture = await importFixture('synth-maker-b.synth-wet.type-dictionary.json') as { scope: Record<string, unknown> };
  const text = JSON.stringify({ ...fixture, scope: { ...fixture.scope, model: 'other' } });
  await openPage();
  await upload('Type Dictionary(Model 범위)', text, 'other-model.json');
  await preview('Type Dictionary 미리보기');
  expect(screen.getByRole('table', { name: '가져오기 문제' }).textContent).toContain('scope-mismatch');
  expect((screen.getByRole('button', { name: '가져오기' }) as HTMLButtonElement).disabled).toBe(true);
});

it('blocks all three file buttons when import status is disabled', async () => {
  api = createFileApi({ root });
  await openPage();
  expect((screen.getByRole('button', { name: 'Sample Window 가져오기' }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: 'Alias metadata' }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: 'Type Dictionary(Model 범위)' }) as HTMLButtonElement).disabled).toBe(true);
});

it.each([
  ['file size over the import limit', () => new File([new Uint8Array(32 * 1024 * 1024 + 1)], 'large.json', { type: 'application/json' }), '파일이 가져오기 상한을 넘습니다'],
  ['invalid JSON text', () => new File(['{'], 'invalid.json', { type: 'application/json' }), 'JSON으로 읽을 수 없습니다'],
])('stops preview checks for %s and leaves focus on close', async (_label, makeFile, title) => {
  await openPage();
  const button = screen.getByRole('button', { name: 'Sample Window 가져오기' }) as HTMLButtonElement;
  await waitFor(() => expect(button.disabled).toBe(false));
  button.focus();
  fireEvent.change(screen.getByLabelText('Sample Window 가져오기'), { target: { files: [makeFile()] } });
  await preview();
  expect(screen.getByRole('alert').textContent).toContain(title);
  expect((screen.getByRole('button', { name: '가져오기' }) as HTMLButtonElement).disabled).toBe(true);
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: '닫기' })));
});

it.each([true, false])('describes all file buttons only when import is blocked (blocked=%s)', async (blocked) => {
  if (blocked) api = createFileApi({ root });
  await openPage();
  if (blocked) await screen.findByText('가져오기를 쓸 수 없습니다');
  else await waitFor(() => expect((screen.getByRole('button', { name: 'Sample Window 가져오기' }) as HTMLButtonElement).disabled).toBe(false));
  for (const name of ['Sample Window 가져오기', 'Alias metadata', 'Type Dictionary(Model 범위)']) {
    const button = screen.getByRole('button', { name });
    if (blocked) {
      expect(document.getElementById(button.getAttribute('aria-describedby')!)?.textContent).toContain('가져오기를 쓸 수 없습니다');
    } else {
      expect(button.getAttribute('aria-describedby')).toBeNull();
    }
  }
});
