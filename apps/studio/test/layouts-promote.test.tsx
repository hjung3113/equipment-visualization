// @vitest-environment jsdom
import { cp, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { layoutRevision, promoteLayout, type EquipmentLayoutDocument } from '@eqv/core';
import { App } from '../src/App.js';
import { createFileApi } from '../server/files.js';
import { writeJson } from './seed.js';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const realRepo = resolve(process.cwd(), '../..');
const LAYOUT_ID = 'promo-layout';
const PROMOTE = 'Template으로 승격';

let base: string;
let repo: string;
let root: string;
let layout: EquipmentLayoutDocument;
let hex: string;
let held: { release(): void } | null;
let holdPromotion: boolean;

const fileOf = () => `layouts/${LAYOUT_ID}/${hex}.layout.json`;
/** A data root outside a fake repo whose assets/templates holds one synthetic bundled Template, plus one published revision and a draft. */
async function setup(options: { insideRepo?: boolean; noRepo?: boolean } = {}) {
  base = await mkdtemp(join(tmpdir(), 'eqv-promote-ui-'));
  repo = join(base, 'repo');
  await mkdir(join(repo, 'assets/templates'), { recursive: true });
  await cp(join(realRepo, 'assets/templates/cluster-single.template.json'), join(repo, 'assets/templates/cluster-single.template.json'));
  root = options.insideRepo ? join(repo, 'assets') : join(base, 'data');
  await mkdir(root, { recursive: true });
  layout = { ...JSON.parse(await readFile(join(realRepo, 'fixtures/cluster-single/layout.json'), 'utf8')), id: LAYOUT_ID };
  hex = (await layoutRevision(layout)).slice('sha256:'.length);
  await writeJson(root, fileOf(), layout);
  await writeJson(root, `layouts/${LAYOUT_ID}/draft.layout.json`, layout);
  const api = createFileApi(options.noRepo ? { root } : { root, repoRoot: repo });
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>));
    const call = { method: init?.method ?? 'GET', url: input, headers, body: String(init?.body ?? '') };
    if (holdPromotion && input === '/api/template-promotions') {
      await new Promise<void>((release) => { held = { release }; });
    }
    const result = await api.handle(call);
    return new Response(JSON.stringify(result.body), { status: result.status });
  });
}
beforeEach(() => {
  held = null;
  holdPromotion = false;
});
afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await rm(base, { recursive: true, force: true });
});

const open = (file: string) => window.history.replaceState(null, '', `/layouts?${new URLSearchParams({ file })}`);
async function openPublished() {
  open(fileOf());
  const view = render(<App />);
  await waitFor(() => expect(view.container.querySelector('[data-component-id]')).toBeTruthy());
  return view;
}
const opener = () => screen.getByRole('button', { name: PROMOTE }) as HTMLButtonElement;
async function openDialog() {
  await waitFor(() => expect(opener().disabled).toBe(false));
  fireEvent.click(opener());
  return screen.findByRole('alertdialog');
}
const promote = (dialog: HTMLElement) => within(dialog).getByRole('button', { name: '승격' }) as HTMLButtonElement;
const fill = (dialog: HTMLElement, templateId: string) =>
  fireEvent.change(within(dialog).getByLabelText(/Template id/), { target: { value: templateId } });
const roleCounts = () => {
  const counts: Record<string, number> = {};
  for (const { role } of layout.components) counts[role] = (counts[role] ?? 0) + 1;
  return Object.entries(counts).sort(([a], [b]) => a < b ? -1 : 1).map(([role, n]) => `${role} ${n}`).join(', ');
};
const stored = async () => (await readdir(join(root, 'templates')).catch(() => [] as string[])).sort();

it('promotes the open published revision: prefilled name, preview, success message and the new listing entry', async () => {
  await setup();
  await openPublished();
  const dialog = await openDialog();
  expect((within(dialog).getByLabelText(/이름/) as HTMLInputElement).value).toBe(layout.name);
  expect(promote(dialog).disabled).toBe(true);
  expect(within(dialog).queryByText(/Role별 개수/)).toBeNull();
  fill(dialog, 'Bad_Id');
  expect(within(dialog).getByText('Template id 형식이 아닙니다')).toBeTruthy();
  expect(promote(dialog).disabled).toBe(true);
  fill(dialog, 'promoted-one');
  expect(within(dialog).getByText(`sha256:${hex.slice(0, 12)}…`)).toBeTruthy();
  expect(within(dialog).getByText(roleCounts())).toBeTruthy();
  fireEvent.click(promote(dialog));
  await screen.findByText('Template으로 승격했습니다');
  expect(screen.queryByRole('alertdialog')).toBeNull();
  expect(screen.getByText('templates/promoted-one.template.json')).toBeTruthy();
  await waitFor(() => expect(screen.getByRole('link', { name: 'promoted-one' })).toBeTruthy());
  expect(JSON.parse(await readFile(join(root, 'templates/promoted-one.template.json'), 'utf8')))
    .toEqual(promoteLayout(layout, { templateId: 'promoted-one', name: layout.name, layoutRevision: `sha256:${hex}` }));
});

it.each([
  ['a data root inside the repository', { insideRepo: true }, '저장소 밖 경로를 EQV_STUDIO_ASSETS로 지정하세요'],
  ['no repository root', { noRepo: true }, 'repository root unknown'],
])('disables the action with the status reason for %s', async (_name, options, reason) => {
  await setup(options);
  await openPublished();
  await waitFor(() => expect(opener().disabled).toBe(true));
  await waitFor(() => expect(opener().getAttribute('aria-describedby')).toBeTruthy());
  expect(screen.getByText(new RegExp(reason))).toBeTruthy();
});

it.each([
  ['a draft', () => `layouts/${LAYOUT_ID}/draft.layout.json`],
  ['a template', () => 'templates/cluster-single.template.json'],
])('offers no promotion for %s', async (_name, file) => {
  await setup();
  open(file());
  const view = render(<App />);
  await waitFor(() => expect(view.container.querySelector('[data-component-id]')).toBeTruthy());
  expect(screen.queryByRole('button', { name: PROMOTE })).toBeNull();
});

it('keeps the dialog open with the server message on a 409', async () => {
  await setup();
  await openPublished();
  const dialog = await openDialog();
  fill(dialog, 'cluster-single');
  fireEvent.click(promote(dialog));
  await within(dialog).findByText('번들 Template과 id가 같습니다');
  expect(screen.getByRole('alertdialog')).toBe(dialog);
  expect(promote(dialog).disabled).toBe(false);
  expect(await stored()).toEqual([]);
});

it('promotes the published revision, not local edits, and says so', async () => {
  await setup();
  const view = await openPublished();
  const pmB = view.container.querySelector('[data-component-id="pm-b"]')!;
  fireEvent.click(pmB);
  fireEvent.keyDown(pmB, { key: 'Delete' });
  fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '삭제' }));
  await waitFor(() => expect(view.container.querySelector('[data-component-id="pm-b"]')).toBeNull());
  const dialog = await openDialog();
  expect(within(dialog).getByText(/저장하지 않은 편집은 포함하지 않습니다/)).toBeTruthy();
  fill(dialog, 'promoted-one');
  expect(within(dialog).getByText(roleCounts())).toBeTruthy();
  fireEvent.click(promote(dialog));
  await screen.findByText('Template으로 승격했습니다');
  const written = JSON.parse(await readFile(join(root, 'templates/promoted-one.template.json'), 'utf8')) as EquipmentLayoutDocument;
  expect(written.components).toEqual(layout.components);
});

it.each(['switch', 'import'])('drops a pending promotion result after a file %s', async (action) => {
  await setup();
  await openPublished();
  holdPromotion = true;
  const dialog = await openDialog();
  fill(dialog, 'promoted-one');
  fireEvent.click(promote(dialog));
  await waitFor(() => expect(held).not.toBeNull());
  expect(promote(dialog).disabled).toBe(true);
  if (action === 'switch') {
    await act(async () => { window.history.pushState(null, '', `/layouts?${new URLSearchParams({ file: `layouts/${LAYOUT_ID}/draft.layout.json` })}`); window.dispatchEvent(new PopStateEvent('popstate')); });
  } else {
    fireEvent.change(screen.getByLabelText(/가져오기/), { target: { files: [new File([JSON.stringify(layout)], 'layout.json', { type: 'application/json' })] } });
  }
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  await act(async () => { held!.release(); });
  await waitFor(async () => expect(await stored()).toEqual(['promoted-one.template.json']));
  expect(screen.queryByText('Template으로 승격했습니다')).toBeNull();
});
