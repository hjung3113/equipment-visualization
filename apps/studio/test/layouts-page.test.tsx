// @vitest-environment jsdom
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { layoutDocumentSchema, layoutRevision } from '@eqv/core';
import type { TopViewerProps } from '@eqv/renderer';
import { App } from '../src/App.js';
import { createFileApi } from '../server/files.js';
import { seedRoot } from './seed.js';

vi.mock('@eqv/renderer', async (importOriginal) => {
  const renderer = await importOriginal<typeof import('@eqv/renderer')>();
  return {
    ...renderer,
    TopViewer: (props: TopViewerProps) => {
      if (props.layout.id === 'renderer-failure') throw new Error('Synthetic renderer failure');
      return <renderer.TopViewer {...props} />;
    },
  };
});

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let base: string;
let root: string;
beforeEach(async () => {
  ({ base, root } = await seedRoot());
  const api = createFileApi({ root });
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>));
    const result = await api.handle({ method: init?.method ?? 'GET', url: input, headers, body: String(init?.body ?? '') });
    return new Response(JSON.stringify(result.body), { status: result.status });
  });
});
afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await rm(base, { recursive: true, force: true });
});

/** Confirms the open publish dialog once its baseline is computed. */
async function confirmPublish() {
  const dialog = await screen.findByRole('alertdialog');
  const publish = within(dialog).getByRole('button', { name: '게시' }) as HTMLButtonElement;
  await waitFor(() => expect(publish.disabled).toBe(false));
  fireEvent.click(publish);
}
/** Clicks a toolbar action; `Revision 게시` also confirms its dialog. */
async function runAction(action: string) {
  fireEvent.click(screen.getByRole('button', { name: action }));
  if (action === 'Revision 게시') await confirmPublish();
}

const open = (file: string) => window.history.replaceState(null, '', `/layouts?${new URLSearchParams({ file })}`);
// The viewer's own svg: toolbar icons are svgs too, so a bare `main svg` finds one of them first.
const viewerSvg = (container: HTMLElement) => container.querySelector('[data-component-id]')!.closest('svg')!;
const componentIds = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[data-component-id]'), (node) => node.getAttribute('data-component-id')).sort();

it('saves a template as a draft that a reload reopens', async () => {
  open('templates/cluster-single.template.json');
  const first = render(<App />);
  await waitFor(() => expect(componentIds(first.container).length).toBeGreaterThan(0));
  const ids = componentIds(first.container);
  fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));
  await waitFor(() => expect(window.location.search).toContain('draft.layout.json'));
  await waitFor(() => expect(stat(join(root, 'layouts/cluster-single/draft.layout.json'))).resolves.toBeTruthy());
  first.unmount();

  open('layouts/cluster-single/draft.layout.json');
  const second = render(<App />);
  await waitFor(() => expect(componentIds(second.container)).toEqual(ids));
});

it('keeps the previous document when an import is invalid', async () => {
  open('templates/cluster-single.template.json');
  const { container } = render(<App />);
  await waitFor(() => expect(componentIds(container).length).toBeGreaterThan(0));
  const ids = componentIds(container);
  const input = screen.getByLabelText(/가져오기/);
  fireEvent.change(input, { target: { files: [new File(['{"kind":"template"}'], 'bad.json', { type: 'application/json' })] } });
  await screen.findByRole('alert');
  expect(componentIds(container)).toEqual(ids);
  expect(screen.queryByText('저장 안 됨')).toBeNull();
});

it('publishes a revision and lists it', async () => {
  open('templates/cluster-single.template.json');
  const { container } = render(<App />);
  await waitFor(() => expect(componentIds(container).length).toBeGreaterThan(0));
  const layout = layoutDocumentSchema.parse(JSON.parse(await readFile(join(root, 'templates/cluster-single.template.json'), 'utf8')));
  const revision = await layoutRevision(layout);
  fireEvent.click(screen.getByRole('button', { name: 'Revision 게시' }));
  await confirmPublish();
  const status = await screen.findByRole('status');
  expect(status.textContent).toContain(revision);
  const label = revision.slice('sha256:'.length, 'sha256:'.length + 12);
  await waitFor(() => expect(within(container).getByRole('link', { name: label })).toBeTruthy());
});

it.each([
  { action: '초안 저장', method: 'PUT' },
  { action: 'Revision 게시', method: 'POST' },
])('keeps a newer unsaved import after a pending $action completes', async ({ action, method }) => {
  open('templates/cluster-single.template.json');
  const { container } = render(<App />);
  await waitFor(() => expect(componentIds(container).length).toBeGreaterThan(0));
  await screen.findByRole('link', { name: 'cluster-single' });
  const originalUrl = window.location.href;
  const fetchFromApi = globalThis.fetch;
  let release!: () => void;
  let started!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const writing = new Promise<void>((resolve) => { started = resolve; });
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const response = await fetchFromApi(input, init);
    if (init?.method === method) {
      started();
      await pending;
    }
    return response;
  });

  await runAction(action);
  await act(async () => { await writing; });
  const raw = JSON.parse(await readFile(join(root, 'templates/cluster-single.template.json'), 'utf8'));
  raw.id = 'imported-b';
  fireEvent.change(screen.getByLabelText(/가져오기/), {
    target: { files: [{ text: async () => JSON.stringify(raw) }] },
  });
  await screen.findByText('저장 안 됨');
  await act(async () => { release(); await pending; });

  expect(screen.getByText('imported-b')).toBeTruthy();
  expect(screen.getByText('저장 안 됨')).toBeTruthy();
  expect(screen.queryByRole('status')).toBeNull();
  expect(window.location.href).toBe(originalUrl);
  expect((screen.getByRole('button', { name: action }) as HTMLButtonElement).disabled).toBe(false);
});

it('contains renderer errors and recovers when another file is opened', async () => {
  open('templates/cluster-single.template.json');
  await writeFile(join(root, 'templates/another.template.json'),
    await readFile(join(root, 'templates/cluster-single.template.json'), 'utf8'));
  const { container } = render(<App />);
  await waitFor(() => expect(componentIds(container).length).toBeGreaterThan(0));
  const ids = componentIds(container);
  const raw = JSON.parse(await readFile(join(root, 'templates/cluster-single.template.json'), 'utf8'));
  raw.id = 'renderer-failure';
  fireEvent.change(screen.getByLabelText(/가져오기/), {
    target: { files: [{ text: async () => JSON.stringify(raw) }] },
  });
  expect((await screen.findByRole('alert')).textContent)
    .toBe('이 레이아웃을 그릴 수 없습니다: Synthetic renderer failure');
  const list = screen.getByRole('region', { name: '레이아웃 목록' });
  expect((screen.getByRole('button', { name: '초안 저장' }) as HTMLButtonElement).disabled).toBe(false);
  expect((screen.getByLabelText(/가져오기/) as HTMLInputElement).disabled).toBe(false);

  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
  try {
    fireEvent.click(await within(list).findByRole('link', { name: 'another' }));
  } finally {
    confirm.mockRestore();
  }
  await waitFor(() => expect(componentIds(container)).toEqual(ids));
  expect(screen.queryByRole('alert')).toBeNull();
});

it.each([
  { action: '초안 저장', method: 'PUT' },
  { action: 'Revision 게시', method: 'POST' },
])('keeps an accepted import after $action starts while import text is pending', async ({ action, method }) => {
  open('templates/cluster-single.template.json');
  const { container } = render(<App />);
  await waitFor(() => expect(componentIds(container).length).toBeGreaterThan(0));
  await screen.findByRole('link', { name: 'cluster-single' });
  const originalUrl = window.location.href;
  const raw = JSON.parse(await readFile(join(root, 'templates/cluster-single.template.json'), 'utf8'));
  raw.id = 'imported-b';
  let releaseText!: (text: string) => void;
  const text = new Promise<string>((resolve) => { releaseText = resolve; });
  fireEvent.change(screen.getByLabelText(/가져오기/), {
    target: { files: [{ text: () => text }] },
  });

  const fetchFromApi = globalThis.fetch;
  let releaseResponse!: () => void;
  let started!: () => void;
  const pending = new Promise<void>((resolve) => { releaseResponse = resolve; });
  const writing = new Promise<void>((resolve) => { started = resolve; });
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const response = await fetchFromApi(input, init);
    if (init?.method === method) {
      started();
      await pending;
    }
    return response;
  });
  await runAction(action);
  await act(async () => { await writing; });
  await act(async () => { releaseText(JSON.stringify(raw)); await text; });
  await screen.findByText('저장 안 됨');
  await act(async () => { releaseResponse(); await pending; });

  expect(screen.getByText('imported-b')).toBeTruthy();
  expect(screen.getByText('저장 안 됨')).toBeTruthy();
  expect(screen.queryByRole('status')).toBeNull();
  expect(window.location.href).toBe(originalUrl);
  expect((screen.getByRole('button', { name: action }) as HTMLButtonElement).disabled).toBe(false);
});

it('recovers a failed viewer when a healthy import is accepted', async () => {
  open('templates/cluster-single.template.json');
  const raw = JSON.parse(await readFile(join(root, 'templates/cluster-single.template.json'), 'utf8'));
  raw.id = 'renderer-failure';
  await writeFile(join(root, 'templates/cluster-single.template.json'), JSON.stringify(raw));
  const { container } = render(<App />);
  expect((await screen.findByRole('alert')).textContent)
    .toBe('이 레이아웃을 그릴 수 없습니다: Synthetic renderer failure');

  raw.id = 'healthy-b';
  let releaseText!: (text: string) => void;
  const text = new Promise<string>((resolve) => { releaseText = resolve; });
  fireEvent.change(screen.getByLabelText(/가져오기/), {
    target: { files: [{ text: () => text }] },
  });
  await act(async () => { releaseText(JSON.stringify(raw)); await text; });

  expect(screen.getByText('healthy-b')).toBeTruthy();
  await waitFor(() => expect(componentIds(container).length).toBeGreaterThan(0));
  expect(screen.queryByRole('alert')).toBeNull();
});

it('preserves Component selection after rejecting malformed JSON', async () => {
  open('templates/cluster-single.template.json');
  const { container } = render(<App />);
  await waitFor(() => expect(componentIds(container).length).toBeGreaterThan(0));
  const component = container.querySelector('[data-component-id][aria-pressed]')!;
  const id = component.getAttribute('data-component-id');
  fireEvent.click(component);
  expect(component.getAttribute('aria-pressed')).toBe('true');

  fireEvent.change(screen.getByLabelText(/가져오기/), {
    target: { files: [{ text: async () => '{' }] },
  });
  expect((await screen.findByRole('alert')).textContent)
    .toBe('가져오기 실패: JSON을 읽을 수 없습니다');
  expect(container.querySelector(`[data-component-id="${id}"]`)?.getAttribute('aria-pressed')).toBe('true');
});

it.each([
  { source: 'template', action: '초안 저장' },
  { source: 'draft', action: '초안 저장' },
  { source: 'draft', action: 'Revision 게시' },
])('preserves selection and camera after $action from a $source', async ({ source, action }) => {
  const template = 'templates/cluster-single.template.json';
  const draft = 'layouts/cluster-single/draft.layout.json';
  const raw = JSON.parse(await readFile(join(root, template), 'utf8'));
  if (source === 'draft') await globalThis.fetch(`/api/files?${new URLSearchParams({ path: draft })}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(raw),
  });
  open(source === 'template' ? template : draft);
  const { container } = render(<App />);
  await waitFor(() => expect(componentIds(container).length).toBeGreaterThan(0));
  const component = container.querySelector('[data-component-id][aria-pressed]')!;
  const id = component.getAttribute('data-component-id');
  fireEvent.click(component);
  expect(component.getAttribute('aria-pressed')).toBe('true');
  const fitted = viewerSvg(container).getAttribute('viewBox');
  fireEvent.click(screen.getByRole('button', { name: '확대' }));
  const zoomed = viewerSvg(container).getAttribute('viewBox');
  expect(zoomed).not.toBe(fitted);

  const fetchFromApi = globalThis.fetch;
  let reread = false;
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const response = await fetchFromApi(input, init);
    if (!init?.method && new URL(input, window.location.origin).searchParams.get('path') === draft) reread = true;
    return response;
  });
  await runAction(action);
  if (action === '초안 저장') {
    await waitFor(() => expect(reread).toBe(true));
    await act(async () => {});
    await screen.findByRole('link', { name: 'draft' });
  } else {
    const revision = await layoutRevision(layoutDocumentSchema.parse(raw));
    await screen.findByRole('link', { name: revision.slice('sha256:'.length, 'sha256:'.length + 12) });
  }
  expect(container.querySelector(`[data-component-id="${id}"]`)?.getAttribute('aria-pressed')).toBe('true');
  expect(viewerSvg(container).getAttribute('viewBox')).toBe(zoomed);
});

it('keeps the saved viewer until a differing draft read replaces its content', async () => {
  open('templates/cluster-single.template.json');
  const { container } = render(<App />);
  await waitFor(() => expect(componentIds(container).length).toBeGreaterThan(0));
  const component = container.querySelector('[data-component-id][aria-pressed]')!;
  const id = component.getAttribute('data-component-id');
  fireEvent.click(component);
  fireEvent.click(screen.getByRole('button', { name: '확대' }));
  const zoomed = viewerSvg(container).getAttribute('viewBox');
  const raw = JSON.parse(await readFile(join(root, 'templates/cluster-single.template.json'), 'utf8'));
  raw.name = 'Changed draft from disk';
  const draft = 'layouts/cluster-single/draft.layout.json';
  const fetchFromApi = globalThis.fetch;
  let release!: () => void;
  let reading = false;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    if (!init?.method && new URL(input, window.location.origin).searchParams.get('path') === draft) {
      reading = true;
      await pending;
      await writeFile(join(root, draft), JSON.stringify(raw));
    }
    return fetchFromApi(input, init);
  });
  fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));
  await waitFor(() => expect(reading).toBe(true));
  try {
    expect(container.querySelector(`[data-component-id="${id}"]`)?.getAttribute('aria-pressed')).toBe('true');
    expect(viewerSvg(container).getAttribute('viewBox')).toBe(zoomed);
  } finally {
    await act(async () => { release(); });
    await screen.findByRole('group', { name: 'Changed draft from disk' });
  }
});

it('asks before discarding an unsaved import through a template link', async () => {
  window.history.replaceState(null, '', '/layouts');
  render(<App />);
  const raw = JSON.parse(await readFile(join(root, 'templates/cluster-single.template.json'), 'utf8'));
  raw.id = 'unsaved-import';
  fireEvent.change(screen.getByLabelText(/가져오기/), {
    target: { files: [{ text: async () => JSON.stringify(raw) }] },
  });
  await screen.findByText('저장 안 됨');
  const originalUrl = window.location.href;
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  try {
    const template = await screen.findByRole('link', { name: 'cluster-single' });
    fireEvent.click(template);
    expect(window.location.href).toBe(originalUrl);
    expect(screen.getByText('저장 안 됨')).toBeTruthy();
    expect(screen.getByText('unsaved-import')).toBeTruthy();
    expect(confirm).toHaveBeenCalledWith('저장하지 않은 가져오기 문서가 있습니다. 버리고 이동할까요?');

    confirm.mockReturnValue(true);
    fireEvent.click(template);
    await screen.findByRole('group', { name: raw.name });
    expect(window.location.search).toContain('cluster-single.template.json');
    expect(screen.queryByText('저장 안 됨')).toBeNull();
    expect(screen.queryByText('unsaved-import')).toBeNull();
  } finally {
    confirm.mockRestore();
  }
});

it('saves an unsaved import without asking for confirmation', async () => {
  window.history.replaceState(null, '', '/layouts');
  render(<App />);
  const raw = JSON.parse(await readFile(join(root, 'templates/cluster-single.template.json'), 'utf8'));
  raw.id = 'unsaved-import';
  fireEvent.change(screen.getByLabelText(/가져오기/), {
    target: { files: [{ text: async () => JSON.stringify(raw) }] },
  });
  await screen.findByText('저장 안 됨');
  const originalUrl = window.location.href;
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  try {
    fireEvent.click(screen.getByRole('link', { name: 'Fleet' }));
    expect(window.location.href).toBe(originalUrl);
    expect(confirm).toHaveBeenCalled();
    confirm.mockClear();

    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));
    await waitFor(() => expect(window.location.search).toContain('draft.layout.json'));
    await waitFor(() => expect(screen.queryByText('저장 안 됨')).toBeNull());
    expect(confirm).not.toHaveBeenCalled();
    expect(JSON.parse(await readFile(join(root, 'layouts/unsaved-import/draft.layout.json'), 'utf8')).id)
      .toBe('unsaved-import');
  } finally {
    confirm.mockRestore();
  }
});

it.each(['save', 'discard', 'unmount'])('prevents beforeunload only while an import is unsaved (%s)', async (finish) => {
  window.history.replaceState(null, '', '/layouts');
  const view = render(<App />);
  const beforeImport = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(beforeImport);
  expect(beforeImport.defaultPrevented).toBe(false);
  const raw = await readFile(join(root, 'templates/cluster-single.template.json'), 'utf8');
  fireEvent.change(screen.getByLabelText(/가져오기/), {
    target: { files: [{ text: async () => raw }] },
  });
  await screen.findByText('저장 안 됨');
  const unsaved = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(unsaved);
  expect(unsaved.defaultPrevented).toBe(true);

  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
  try {
    if (finish === 'save') {
      fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));
      await waitFor(() => expect(window.location.search).toContain('draft.layout.json'));
      await waitFor(() => expect(screen.queryByText('저장 안 됨')).toBeNull());
    } else if (finish === 'discard') {
      fireEvent.click(await screen.findByRole('link', { name: 'cluster-single' }));
      await waitFor(() => expect(screen.queryByText('저장 안 됨')).toBeNull());
      await screen.findByRole('group', { name: JSON.parse(raw).name });
    } else {
      view.unmount();
    }
    const finished = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(finished);
    expect(finished.defaultPrevented).toBe(false);
  } finally {
    confirm.mockRestore();
  }
});

const TEMPLATE = 'templates/cluster-single.template.json';
const hexOf = (revision: string) => revision.slice('sha256:'.length);

/** Writes a layout revision of `cluster-single` straight to disk (the file API refuses revision paths). */
async function writeRevision(edit: (raw: Record<string, unknown>) => void) {
  const raw = JSON.parse(await readFile(join(root, TEMPLATE), 'utf8'));
  edit(raw);
  const hex = hexOf(await layoutRevision(layoutDocumentSchema.parse(raw)));
  await mkdir(join(root, 'layouts/cluster-single'), { recursive: true });
  await writeFile(join(root, `layouts/cluster-single/${hex}.layout.json`), JSON.stringify(raw));
  return hex;
}

async function pinRevision(hex: string) {
  const response = await globalThis.fetch(`/api/files?${new URLSearchParams({ path: 'onboarding/bindings/eq-pin.bindings.json' })}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      schemaVersion: '0.4', equipmentId: 'eq-pin',
      bindings: [{
        layoutId: 'cluster-single', mappingHash: `sha256:${'a'.repeat(64)}`, layoutRevision: `sha256:${hex}`,
        effectiveFrom: '2026-01-01T09:00:00.000',
      }],
    }),
  });
  expect(response.ok).toBe(true);
}

/** Opens the publish dialog on the cluster-single template and counts POSTs. */
async function openPublishDialog() {
  const posts: unknown[] = [];
  const fetchFromApi = globalThis.fetch;
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    if (init?.method === 'POST') posts.push(JSON.parse(String(init.body)));
    return fetchFromApi(input, init);
  });
  open(TEMPLATE);
  const view = render(<App />);
  await waitFor(() => expect(componentIds(view.container).length).toBeGreaterThan(0));
  fireEvent.click(screen.getByRole('button', { name: 'Revision 게시' }));
  const dialog = await screen.findByRole('alertdialog');
  return { posts, dialog, view };
}

it('opens the publish dialog focused on cancel, and cancel publishes nothing', async () => {
  const { posts, dialog } = await openPublishDialog();
  const cancel = within(dialog).getByRole('button', { name: '취소' });
  await waitFor(() => expect(document.activeElement).toBe(cancel));
  expect(within(dialog).getByText('Layout Revision을 게시할까요?')).toBeTruthy();
  await within(dialog).findByText('첫 Revision');
  fireEvent.click(cancel);
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(posts).toEqual([]);
  expect(screen.queryByText('게시된 Revision')).toBeNull();
});

it('keeps 게시 disabled while the baseline is computing', async () => {
  const fetchFromApi = globalThis.fetch;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    if (new URL(input, window.location.origin).searchParams.get('dir') === 'layouts/cluster-single') await pending;
    return fetchFromApi(input, init);
  });
  open(TEMPLATE);
  const { container } = render(<App />);
  await waitFor(() => expect(componentIds(container).length).toBeGreaterThan(0));
  fireEvent.click(screen.getByRole('button', { name: 'Revision 게시' }));
  const dialog = await screen.findByRole('alertdialog');
  expect((within(dialog).getByRole('button', { name: '게시' }) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => { release(); await pending; });
  await within(dialog).findByText('첫 Revision');
  expect((within(dialog).getByRole('button', { name: '게시' }) as HTMLButtonElement).disabled).toBe(false);
});

it('says content that is already published writes no new file', async () => {
  const layout = layoutDocumentSchema.parse(JSON.parse(await readFile(join(root, TEMPLATE), 'utf8')));
  const hex = hexOf(await layoutRevision(layout));
  await mkdir(join(root, 'layouts/cluster-single'), { recursive: true });
  await writeFile(join(root, `layouts/cluster-single/${hex}.layout.json`), await readFile(join(root, TEMPLATE)));
  const { dialog } = await openPublishDialog();
  expect((await within(dialog).findByText(`이 내용은 이미 ${hex.slice(0, 12)}로 게시되어 있습니다`))).toBeTruthy();
});

it('compares with the revision a Binding pins, not with the other revision', async () => {
  // Pin the lexicographically smaller hex so that "greatest hex" would pick the wrong baseline.
  const first = await writeRevision((raw) => { raw.name = 'Revision A'; });
  const second = await writeRevision((raw) => { raw.name = 'Revision B'; });
  const [pinned, other] = first < second ? [first, second] : [second, first];
  await pinRevision(pinned);
  const { dialog } = await openPublishDialog();
  await within(dialog).findByText(/Binding이 가리키는 Revision/);
  expect(dialog.textContent).toContain(pinned.slice(0, 12));
  expect(dialog.textContent).not.toContain(other.slice(0, 12));
  const table = within(dialog).getByRole('table', { name: 'Layout 변경 목록' });
  expect(within(table).getByText('name')).toBeTruthy();
  expect(within(table).getByText('머리 필드')).toBeTruthy();
});

it('uses the only existing revision as the baseline and reports an unchanged document', async () => {
  const hex = await writeRevision((raw) => { raw.name = 'Older name'; });
  const { dialog } = await openPublishDialog();
  await within(dialog).findByText('비교 기준:');
  expect(dialog.textContent).toContain(hex.slice(0, 12));
  expect(dialog.textContent).not.toContain('Binding이 가리키는 Revision');
});

it('shows no comparison when several revisions exist and no Binding pins one', async () => {
  await writeRevision((raw) => { raw.name = 'Revision A'; });
  await writeRevision((raw) => { raw.name = 'Revision B'; });
  const { dialog } = await openPublishDialog();
  await within(dialog).findByText('기존 Revision 2개');
  expect(within(dialog).queryByRole('table')).toBeNull();
});

it('publishes the previewed document when 게시 is chosen', async () => {
  window.history.replaceState(null, '', '/layouts');
  const posts: { id?: string }[] = [];
  const fetchFromApi = globalThis.fetch;
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    if (init?.method === 'POST') posts.push(JSON.parse(String(init.body)));
    return fetchFromApi(input, init);
  });
  render(<App />);
  const raw = JSON.parse(await readFile(join(root, TEMPLATE), 'utf8'));
  raw.id = 'imported-b';
  fireEvent.change(screen.getByLabelText(/가져오기/), { target: { files: [{ text: async () => JSON.stringify(raw) }] } });
  await screen.findByText('저장 안 됨');
  fireEvent.click(screen.getByRole('button', { name: 'Revision 게시' }));
  expect(await within(await screen.findByRole('alertdialog')).findByText('imported-b')).toBeTruthy();
  await confirmPublish();
  await screen.findByText('게시된 Revision');
  expect(posts.map((post) => post.id)).toEqual(['imported-b']);
  expect(screen.queryByRole('alertdialog')).toBeNull();
});

it('drops a baseline that arrives after an import was accepted', async () => {
  const fetchFromApi = globalThis.fetch;
  let release!: () => void;
  let listed!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const requested = new Promise<void>((resolve) => { listed = resolve; });
  const posts: unknown[] = [];
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    if (init?.method === 'POST') posts.push(init.body);
    if (new URL(input, window.location.origin).searchParams.get('dir') === 'layouts/cluster-single') {
      listed();
      await pending;
    }
    return fetchFromApi(input, init);
  });
  open(TEMPLATE);
  const { container } = render(<App />);
  await waitFor(() => expect(componentIds(container).length).toBeGreaterThan(0));
  fireEvent.click(screen.getByRole('button', { name: 'Revision 게시' }));
  await screen.findByRole('alertdialog');
  await requested;
  const raw = JSON.parse(await readFile(join(root, TEMPLATE), 'utf8'));
  raw.id = 'imported-b';
  fireEvent.change(screen.getByLabelText(/가져오기/), { target: { files: [{ text: async () => JSON.stringify(raw) }] } });
  await screen.findByText('저장 안 됨');
  expect(screen.queryByRole('alertdialog')).toBeNull();
  await act(async () => { release(); await pending; });
  expect(screen.queryByRole('alertdialog')).toBeNull();
  expect(screen.getByText('imported-b')).toBeTruthy();
  expect(posts).toEqual([]);
});
