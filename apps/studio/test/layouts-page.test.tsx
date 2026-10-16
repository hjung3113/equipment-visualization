// @vitest-environment jsdom
import { readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { layoutDocumentSchema, layoutRevision } from '@eqv/core';
import { App } from '../src/App.js';
import { createFileApi } from '../server/files.js';
import { seedRoot } from './seed.js';

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
