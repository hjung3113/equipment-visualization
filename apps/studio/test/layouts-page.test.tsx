// @vitest-environment jsdom
import { readFile, rm, stat, writeFile } from 'node:fs/promises';
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

const open = (file: string) => window.history.replaceState(null, '', `/layouts?${new URLSearchParams({ file })}`);
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

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: action }));
    await writing;
  });
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

  fireEvent.click(await within(list).findByRole('link', { name: 'another' }));
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
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: action }));
    await writing;
  });
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
