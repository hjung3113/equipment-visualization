// @vitest-environment jsdom
import { readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { layoutRevision, validateLayout } from '@eqv/core';
import { App } from '../src/App.js';
import { createFileApi } from '../server/files.js';
import { stubFileApi } from './file-api.js';
import { addWindow, record, seedOnboardingRoot, windowHex, writeDraft, writeJson } from './seed.js';

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
  stubFileApi(api);
});
afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await rm(base, { recursive: true, force: true });
});

const at = (path: string) => window.history.replaceState(null, '', path);
const loaded = () => waitFor(() => expect(screen.queryByText('불러오는 중…')).toBeNull());
const ENTRY = '/journey/eq-synth-01?anchor=occ-lp-slot-one';
const hopRows = () => Array.from(document.querySelectorAll('tbody tr[data-hop]'));
const badge = (n: number) => document.querySelector(`[data-layer="journey"] [data-journey-hop="${n}"]`);
const batchOf = async () => JSON.parse(await readFile(join(repo, 'fixtures/cluster-single/occurrence-batch.json'), 'utf8'));
const open = async (path = ENTRY) => {
  await writeDraft(root, 'eq-synth-01-layout');
  at(path);
  render(<App />);
  await loaded();
};

it('lists W01’s hops in Record Sequence order, draws numbered badges on the Top View and switches tabs with the arrow keys', async () => {
  await open();
  screen.getByRole('heading', { name: 'Journey · W01' });
  const banner = within(screen.getByRole('banner'));
  banner.getByRole('link', { name: 'Focus' });
  expect(hopRows().map((tr) => tr.getAttribute('data-hop'))).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
  expect(hopRows().map((tr) => tr.querySelector('th')!.textContent)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
  const journey = document.querySelector('[data-layer="journey"]')!;
  expect(journey.querySelectorAll('[data-journey-hop]').length).toBeGreaterThan(0);
  expect(journey.querySelector('line, path, polyline, animate, animateTransform')).toBeNull();
  expect(screen.getByText(/^wafer/).parentElement!.querySelector('[data-evidence="observed"]')).not.toBeNull();
  expect(screen.getByText(/Sample Window/).textContent).toContain('2026-01-01T10:00:00.000');
  const tabs = screen.getAllByRole('tab');
  expect(tabs).toEqual(['물리 경유', '실행 이력'].map((name) => screen.getByRole('tab', { name })));
  tabs[0]!.focus();
  fireEvent.keyDown(tabs[0]!, { key: 'ArrowRight' });
  await waitFor(() => expect(tabs[1]!.getAttribute('aria-selected')).toBe('true'));
  expect(document.querySelector('tr[data-occurrence-id="occ-pm1-process"]')).not.toBeNull();
  expect(document.querySelectorAll('tr[data-occurrence-id]')).toHaveLength(1);
});

it('selects a hop from the Top View, a row and the keyboard, with repeated visits to one Component, and never draws capability lines', async () => {
  await open();
  const row = (n: number) => document.querySelector(`tr[data-hop="${n}"]`)!;
  const selectedRows = () => hopRows().filter((tr) => tr.getAttribute('aria-selected') === 'true').map((tr) => tr.getAttribute('data-hop'));
  // lp-a holds hops 1 and 9: a click selects the lowest-numbered one.
  fireEvent.click(badge(9)!);
  expect(selectedRows()).toEqual(['1']);
  expect(badge(1)!.getAttribute('data-selected')).toBe('true');
  expect(document.querySelectorAll('[data-layer="highlight"] g').length).toBe(1);
  expect(document.querySelector('[data-layer="capabilities"]')!.children).toHaveLength(0);
  // a row selects its exact hop, even when another hop shares the Component
  fireEvent.click(row(9));
  expect(selectedRows()).toEqual(['9']);
  expect(badge(9)!.getAttribute('data-selected')).toBe('true');
  expect(badge(1)!.getAttribute('data-selected')).toBeNull();
  // keyboard: Escape clears, Enter on a Component selects its lowest hop
  const lp = document.querySelector('[data-layer="journey"]')!.parentElement!.querySelector('[data-component-id="lp-a"]')!;
  fireEvent.keyDown(lp, { key: 'Escape' });
  expect(selectedRows()).toEqual([]);
  expect(document.querySelector('[data-layer="journey"] [data-selected]')).toBeNull();
  fireEvent.keyDown(lp, { key: 'Enter' });
  expect(selectedRows()).toEqual(['1']);
  expect(document.querySelector('[data-layer="capabilities"]')!.children).toHaveLength(0);
});

it('leaves Enter on a hop’s Focus link to the link instead of selecting the row', async () => {
  await open();
  const row = document.querySelector('tr[data-hop="2"]')!;
  const link = within(row as HTMLElement).getByRole('link', { name: 'Focus 열기' });
  expect(fireEvent.keyDown(link, { key: 'Enter' })).toBe(true);
  expect(row.getAttribute('aria-selected')).toBe('false');
  fireEvent.click(link);
  expect(window.location.pathname).toBe('/focus/eq-synth-01');
});

it.each([
  ['', 'anchor가 없습니다'],
  ['?anchor=occ-nope', 'Occurrence를 찾을 수 없습니다'],
  ['?anchor=occ-carrier', 'wafer id가 없는 Occurrence입니다'],
  ['?anchor=occ-identity-empty', 'wafer id가 없는 Occurrence입니다'],
])('explains an invalid anchor (%s) and links back to Focus', async (query, reason) => {
  await open(`/journey/eq-synth-01${query}`);
  const state = within(screen.getByRole('status'));
  state.getByText('이 anchor로 Journey를 열 수 없습니다');
  state.getByText(reason);
  const link = state.getByRole('link', { name: 'Focus 열기' });
  expect(link.getAttribute('href')).toMatch(/^\/focus\/eq-synth-01/);
});

it('finds the window holding the anchor when the newer window lacks it, and honours an explicit window', async () => {
  const older = await batchOf();
  const newer = { ...older, from: '2026-01-02T10:00:00.000', to: '2026-01-02T10:30:00.000', watermark: { seq: 59, at: '2026-01-02T10:25:00.000' }, occurrences: [], issues: [] };
  await addWindow(root, 'eq-synth-01', newer);
  await open();
  expect(hopRows()).toHaveLength(9);
  const hex = await windowHex(older);
  cleanup();
  await open(`${ENTRY}&window=${hex}`);
  expect(hopRows()).toHaveLength(9);
  expect(within(screen.getByRole('banner')).getByRole('link', { name: 'Focus' }).getAttribute('href')).toBe(`/focus/eq-synth-01?anchor=occ-lp-slot-one&window=${hex}`);
});

it('keeps the lists and says the Top View is unavailable when no Binding resolves a Layout, for a timed and an untimed anchor', async () => {
  await writeJson(root, 'equipment/eq-synth-02.json', record('eq-synth-02'));
  const batch = JSON.parse((await readFile(join(repo, 'fixtures/cluster-single/occurrence-batch.json'), 'utf8')).replaceAll('"eq-synth-01"', '"eq-synth-02"'));
  batch.occurrences.find((o: { id: string }) => o.id === 'occ-lp-slot-one').start.at = null;
  await addWindow(root, 'eq-synth-02', batch);
  for (const anchor of ['occ-lp-slot-two', 'occ-lp-slot-one']) {
    at(`/journey/eq-synth-02?anchor=${anchor}`);
    render(<App />);
    await loaded();
    screen.getByText('이 시점에 적용된 Binding이 없어 Top View를 표시할 수 없습니다');
    expect(hopRows().length).toBeGreaterThan(0);
    expect(hopRows()[0]!.textContent).toContain('위치 미확인 (alias LP1)');
    cleanup();
  }
});

it('lists a hop of another Layout Revision but draws only those of the displayed Binding’s Revision', async () => {
  const raw = JSON.parse(await readFile(join(repo, 'fixtures/cluster-single/layout.json'), 'utf8'));
  const checked = validateLayout(raw);
  if (!checked.ok || checked.layout.kind !== 'equipment-layout') throw new Error('Expected the fixture layout');
  const older = checked.layout;
  const newer = { ...older, components: [...older.components, { ...older.components.at(-1)!, id: 'pm-added' }] };
  const [olderHash, newerHash] = [await layoutRevision(older), await layoutRevision(newer)];
  const path = 'onboarding/bindings/eq-synth-01.bindings.json';
  const bindings = JSON.parse(await readFile(join(root, path), 'utf8'));
  bindings.bindings[0].layoutRevision = olderHash;
  bindings.bindings[1].layoutRevision = newerHash;
  await writeJson(root, path, bindings);
  for (const [hash, layout] of [[olderHash, older], [newerHash, newer]] as const) {
    await writeJson(root, `layouts/eq-synth-01-layout/${hash.slice('sha256:'.length)}.layout.json`, layout);
  }
  at(ENTRY);
  render(<App />);
  await loaded();
  expect(hopRows()).toHaveLength(9);
  const drawn = Array.from(document.querySelectorAll('[data-layer="journey"] [data-journey-hop]')).map((g) => g.getAttribute('data-journey-hop'));
  expect(drawn.length).toBeGreaterThan(0);
  expect(drawn.length).toBeLessThan(9);
});
