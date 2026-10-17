// @vitest-environment jsdom
import { readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
import { loadFocus } from '../src/focus-data.js';
import { navigate } from '../src/router.js';
import { createFileApi } from '../server/files.js';
import { addEquipment, seedOnboardingRoot, writeDraft, writeJson } from './seed.js';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const repo = resolve(process.cwd(), '../..');
let base: string;
let root: string;

beforeEach(async () => {
  ({ base, root } = await seedOnboardingRoot());
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
  vi.restoreAllMocks();
  await rm(base, { recursive: true, force: true });
});

const at = (path: string) => window.history.replaceState(null, '', path);
const loaded = () => waitFor(() => expect(screen.queryByText('불러오는 중…')).toBeNull());
const ENTRY = '/focus/eq-synth-01?entityType=occurrence&anchor=occ-pm1-process';
const heading = () => screen.getByRole('heading', { name: /^커서 시점 상태/ }).textContent;
const row = (id: string) => document.querySelector(`tr[data-occurrence-id="${id}"]`)!;
const MAPPING_OLD = 'onboarding/mappings/eq-synth-01/30d2c1a312841e4cfb9d293107651d4125c0ea37806e473e564b03ff52bf8ca2.mapping.json';

it('opens Focus at the entry Occurrence with the draft notice, the Top View, the Gantt and three tabs; the slider seeks', async () => {
  await writeDraft(root, 'eq-synth-01-layout');
  at(ENTRY);
  render(<App />);
  await loaded();
  screen.getByRole('heading', { name: 'Focus · eq-synth-01' });
  expect(screen.getByText('게시된 Layout Revision이 없어 초안 레이아웃으로 표시합니다 (eq-synth-01-layout)').getAttribute('role')).toBe('status');
  expect(screen.getByDisplayValue('2026-01-01T10:05:00.000')).toBeTruthy();
  expect(screen.getByDisplayValue('2026-01-01T10:11:00.000')).toBeTruthy();
  screen.getByRole('group', { name: 'Synthetic single-hub cluster' });
  screen.getByRole('group', { name: 'Component lane Gantt' });
  expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Occurrence 목록', 'Data Quality', '근거 상세']);
  expect(heading()).toBe('커서 시점 상태 (2026-01-01T10:06:00.000)');
  const before = document.querySelector('[data-layer="replay"]');
  expect(before).not.toBeNull();

  const slider = screen.getByRole('slider', { name: '커서 시각' });
  slider.focus();
  fireEvent.keyDown(slider, { key: 'ArrowRight' });
  expect(heading()).toBe('커서 시점 상태 (2026-01-01T10:07:00.000)');
  expect(document.querySelector('[data-layer="replay"]')).not.toBeNull();
});

it('selects an Occurrence in every view: row, Top View highlight on its Component, evidence detail; a list row moves the cursor', async () => {
  await writeDraft(root, 'eq-synth-01-layout');
  at(ENTRY);
  render(<App />);
  await loaded();
  fireEvent.click(row('occ-lla-slot-two'));
  expect(heading()).toBe('커서 시점 상태 (2026-01-01T10:05:00.000)');
  fireEvent.click(row('occ-pm1-process'));
  expect(heading()).toBe('커서 시점 상태 (2026-01-01T10:06:00.000)');
  expect(row('occ-pm1-process').getAttribute('aria-selected')).toBe('true');
  const ring = document.querySelector('[data-layer="highlight"] g[transform]')!;
  // The ring is drawn with a matrix, the Component group with translate/rotate/scale: same placement, different spelling.
  expect(ring.getAttribute('transform')).toBe('matrix(1 0 0 1 24 32)');
  expect(document.querySelector('[data-component-id="pm-a"]')!.getAttribute('transform')).toMatch(/^translate\(24 32\) /);
  fireEvent.click(screen.getByRole('tab', { name: '근거 상세' }));
  within(screen.getByRole('region', { name: '근거 상세 occ-pm1-process' })).getByText(/^시작: 2026-01-01T10:06:00.000/);
});

it('switches tabs with the arrow keys', async () => {
  await writeDraft(root, 'eq-synth-01-layout');
  at(ENTRY);
  render(<App />);
  await loaded();
  const tabs = screen.getAllByRole('tab');
  tabs[0]!.focus();
  fireEvent.keyDown(tabs[0]!, { key: 'ArrowRight' });
  expect(tabs[1]!.getAttribute('aria-selected')).toBe('true');
  expect(document.activeElement).toBe(tabs[1]);
  screen.getByText('이 구간에 Data Quality Issue가 없습니다');
});

it('applies a typed range, and keeps the old range with an error for an invalid one', async () => {
  await writeDraft(root, 'eq-synth-01-layout');
  at(ENTRY);
  render(<App />);
  await loaded();
  const [from] = screen.getAllByRole('textbox') as HTMLInputElement[];
  fireEvent.change(from!, { target: { value: 'nope' } });
  fireEvent.click(screen.getByRole('button', { name: '적용' }));
  screen.getByRole('alert');
  fireEvent.change(from!, { target: { value: '2026-01-01T10:08:00.000' } });
  fireEvent.click(screen.getByRole('button', { name: '적용' }));
  expect(screen.queryByRole('alert')).toBeNull();
  expect(heading()).toBe('커서 시점 상태 (2026-01-01T10:08:00.000)');
  expect(from!.value).toBe('2026-01-01T10:08:00.000');
});

it('shows 게시된 Binding 없음 and still lists Occurrences when there are no Bindings; an unknown equipment is not found', async () => {
  await addEquipment(root, 'eq-synth-02');
  at('/focus/eq-synth-02');
  render(<App />);
  await loaded();
  screen.getByText('게시된 Binding 없음');
  expect(document.querySelectorAll('tbody tr[data-occurrence-id]').length).toBeGreaterThan(0);
  cleanup();
  at('/focus/no-such');
  render(<App />);
  await loaded();
  screen.getByText('설비를 찾을 수 없습니다');
});

it('drops selection and range when the route moves to another equipment', async () => {
  await writeDraft(root, 'eq-synth-01-layout');
  await addEquipment(root, 'eq-synth-02');
  at(ENTRY);
  render(<App />);
  await loaded();
  fireEvent.click(row('occ-pm1-process'));
  act(() => navigate('/focus/eq-synth-02'));
  await screen.findByRole('heading', { name: 'Focus · eq-synth-02' });
  await loaded();
  expect(document.querySelector('tr[aria-selected="true"]')).toBeNull();
  expect(screen.getByDisplayValue('2026-01-01T10:00:00.000')).toBeTruthy();
});

it('links Focus from Onboarding only when the equipment has Bindings', async () => {
  at('/onboarding/eq-synth-01');
  render(<App />);
  await loaded();
  expect(screen.getByRole('link', { name: 'Focus 열기' }).getAttribute('href')).toBe('/focus/eq-synth-01');
  cleanup();
  await addEquipment(root, 'eq-new');
  at('/onboarding/eq-new');
  render(<App />);
  await loaded();
  expect(screen.queryByRole('link', { name: 'Focus 열기' })).toBeNull();
});

it('loadFocus reads every Binding\'s Mapping Version and Layout and reports the failing path', async () => {
  const ok = await loadFocus('eq-synth-01');
  expect(ok).toMatchObject({ kind: 'error', error: expect.stringContaining('layouts/eq-synth-01-layout/draft.layout.json') });

  await writeDraft(root, 'eq-synth-01-layout');
  const healthy = await loadFocus('eq-synth-01');
  expect(healthy.kind === 'ok' && [healthy.mappings.length, healthy.layouts.length, healthy.notices]).toEqual(
    [2, 1, ['게시된 Layout Revision이 없어 초안 레이아웃으로 표시합니다 (eq-synth-01-layout)']]);

  const old = JSON.parse(await readFile(join(repo, 'fixtures/cluster-single', MAPPING_OLD), 'utf8'));
  await writeJson(root, MAPPING_OLD, { ...old, entries: old.entries.slice(1) });
  expect(await loadFocus('eq-synth-01')).toMatchObject({ kind: 'error', error: expect.stringContaining(MAPPING_OLD) });
  await writeJson(root, MAPPING_OLD, old);

  const serve = globalThis.fetch;
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    if (decodeURIComponent(input).includes(MAPPING_OLD)) throw new Error('boom');
    return serve(input, init);
  });
  expect(await loadFocus('eq-synth-01')).toMatchObject({ kind: 'error', error: expect.stringContaining(`${MAPPING_OLD}: `) });
  vi.stubGlobal('fetch', serve);

  const layout = JSON.parse(await readFile(join(repo, 'fixtures/cluster-single/layout.json'), 'utf8'));
  await writeJson(root, 'layouts/eq-synth-01-layout/draft.layout.json', { ...layout, id: 'other-layout' });
  expect(await loadFocus('eq-synth-01')).toMatchObject({ kind: 'error', error: expect.stringContaining('layouts/eq-synth-01-layout/draft.layout.json: id(') });
});
