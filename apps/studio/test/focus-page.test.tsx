// @vitest-environment jsdom
import { readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { seekSceneState, type ReplayInput } from '@eqv/core';
import { CursorStateList, type PlaybackScheduler } from '@eqv/replay';
import { App } from '../src/App.js';
import { FocusPage } from '../src/FocusPage.js';
import { loadFocus } from '../src/focus-data.js';
import { navigate } from '../src/router.js';
import { createFileApi } from '../server/files.js';
import { addEquipment, addSynth03, seedOnboardingRoot, writeDraft, writeJson } from './seed.js';

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
const heading = () => {
  const panel = within(screen.getByRole('region', { name: '커서 시점 상태' }));
  return `${panel.getByRole('heading', { name: '커서 시점 상태' }).textContent} (${panel.getByText(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$/).textContent})`;
};
const row = (id: string) => document.querySelector(`tr[data-occurrence-id="${id}"]`)!;
const MAPPING_OLD = 'onboarding/mappings/eq-synth-01/30d2c1a312841e4cfb9d293107651d4125c0ea37806e473e564b03ff52bf8ca2.mapping.json';

it('opens Focus at the entry Occurrence with the draft notice, the Top View, the Gantt and three tabs; the slider seeks', async () => {
  await writeDraft(root, 'eq-synth-01-layout');
  at(ENTRY);
  render(<App />);
  await loaded();
  screen.getByRole('heading', { name: 'Focus · eq-synth-01' });
  const pageHeader = within(screen.getByRole('banner'));
  pageHeader.getByRole('navigation', { name: '경로' });
  pageHeader.getByRole('link', { name: 'Onboarding으로 이동' });
  pageHeader.getByText(/^진입 키:/);
  pageHeader.getByText('occurrence');
  pageHeader.getByText('occ-pm1-process');
  expect(screen.getByText('게시된 Layout Revision이 없어 초안 레이아웃으로 표시합니다 (eq-synth-01-layout)').getAttribute('role')).toBe('status');
  expect(screen.getByDisplayValue('2026-01-01T10:05:00.000')).toBeTruthy();
  expect(screen.getByDisplayValue('2026-01-01T10:11:00.000')).toBeTruthy();
  screen.getByRole('group', { name: 'Synthetic single-hub cluster' });
  screen.getByRole('group', { name: 'Component lane Gantt' });
  expect(screen.getAllByRole('tab')).toEqual(['Occurrence 목록', 'Data Quality', '근거 상세'].map((name) => screen.getByRole('tab', { name })));
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
  fireEvent.mouseDown(screen.getByRole('tab', { name: '근거 상세' }));
  const detail = within(screen.getByRole('region', { name: '근거 상세 occ-pm1-process' }));
  expect(detail.getByText('시작', { exact: true }).parentElement?.lastElementChild?.textContent).toMatch(/^2026-01-01T10:06:00.000 · Record Sequence/);
});

it('switches tabs with the arrow keys', async () => {
  await writeDraft(root, 'eq-synth-01-layout');
  at(ENTRY);
  render(<App />);
  await loaded();
  const tabs = screen.getAllByRole('tab');
  tabs[0]!.focus();
  fireEvent.keyDown(tabs[0]!, { key: 'ArrowRight' });
  await waitFor(() => expect(tabs[1]!.getAttribute('aria-selected')).toBe('true'));
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
  const rangeError = screen.getByRole('alert');
  expect(from!.getAttribute('aria-invalid')).toBe('true');
  expect(from!.getAttribute('aria-describedby')).toBe(rangeError.id);
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
  within(screen.getByRole('status')).getByText('설비를 찾을 수 없습니다');
  within(screen.getByRole('banner')).getByRole('link', { name: 'Fleet으로 이동' });
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

it('replays the Sample Window the route names and drops selection and range when the window changes', async () => {
  const { w1, w2 } = await addSynth03(root);
  at(`/focus/eq-synth-03?window=${w1}`);
  render(<App />);
  await loaded();
  expect(row('occ-w1-wc2-forced')).not.toBeNull();
  expect(row('occ-w2-wc4-transfer')).toBeNull();
  fireEvent.click(row('occ-w1-wc2-forced'));
  expect(row('occ-w1-wc2-forced').getAttribute('aria-selected')).toBe('true');
  act(() => navigate(`/focus/eq-synth-03?window=${w2}`));
  await waitFor(() => expect(row('occ-w2-wc4-transfer')).not.toBeNull());
  expect(document.querySelector('tr[aria-selected="true"]')).toBeNull();
  expect(screen.getByDisplayValue('2026-01-01T10:30:00.000')).toBeTruthy();
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

// Playback and sequence stepping (#15d). The scheduler is the page's test seam; real timers are never used.
const manualClock = () => {
  let now = 0;
  let pending: (() => void) | null = null;
  const scheduler: PlaybackScheduler = { now: () => now, request: (cb) => { pending = cb; return 1; }, cancel: () => { pending = null; } };
  return { scheduler, frame: (gap: number) => { now += gap; const cb = pending; pending = null; act(() => cb?.()); } };
};
const applyRange = (from: string, to = '2026-01-01T10:30:00.000') => {
  const [a, b] = screen.getAllByRole('textbox') as HTMLInputElement[];
  fireEvent.change(a!, { target: { value: from } });
  fireEvent.change(b!, { target: { value: to } });
  fireEvent.click(screen.getByRole('button', { name: '적용' }));
};
const stateList = () => screen.getByRole('region', { name: '커서 시점 상태' });
const sequenceStatus = () => screen.queryByText(/^Sequence step · Record Sequence/);

it('playing frames show the same state as a direct seek to that cursor', async () => {
  await writeDraft(root, 'eq-synth-01-layout');
  const loadedFocus = await loadFocus('eq-synth-01');
  if (loadedFocus.kind !== 'ok') throw new Error('Expected the fixture to load');
  const data: ReplayInput = { batch: loadedFocus.batch, layouts: loadedFocus.layouts, bindings: loadedFocus.bindings, mappings: loadedFocus.mappings };
  const clock = manualClock();
  render(<FocusPage equipmentId="eq-synth-01" sampleWindow={null} entityType={null} anchor={null} scheduler={clock.scheduler} />);
  await loaded();
  applyRange('2026-01-01T10:01:20.000', '2026-01-01T10:02:30.000');
  fireEvent.click(screen.getByRole('radio', { name: 'x4' }));
  fireEvent.click(screen.getByRole('button', { name: '재생' }));
  for (let i = 0; i < 15; i += 1) clock.frame(250);
  expect(heading()).toBe('커서 시점 상태 (2026-01-01T10:01:35.000)');
  const played = stateList().textContent;
  cleanup();
  render(<CursorStateList state={seekSceneState(data, '2026-01-01T10:01:35.000')} />);
  expect(played).toBe(stateList().textContent);
  const materialTable = within(screen.getByRole('table', { name: '물질' }));
  const materialRow = materialTable.getAllByRole('row').find((item) => item.textContent?.includes('wafer W01'))!;
  expect(within(materialRow).getAllByRole('cell')[0]?.textContent).toBe('efem-robot');
});

it('sequence mode shows the record-ordered state; the previous record differs from the seek at the same time; a slider key leaves it', async () => {
  await writeDraft(root, 'eq-synth-01-layout');
  at('/focus/eq-synth-01');
  render(<App />);
  await loaded();
  applyRange('2026-01-01T10:02:00.000');
  expect(heading()).toBe('커서 시점 상태 (2026-01-01T10:02:00.000)');
  const materialTable = () => within(screen.getByRole('table', { name: '물질' }));
  const waferRow = () => materialTable().getAllByRole('row').find((item) => item.textContent?.includes('wafer W01'))!;
  expect(within(waferRow()).getAllByRole('cell').slice(0, 2).map((cell) => cell.textContent)).toEqual(['ll-a / slot-1', '관측']);
  fireEvent.click(screen.getByRole('button', { name: 'Sequence step' }));
  expect(sequenceStatus()!.textContent).toBe('Sequence step · Record Sequence 7 · 2026-01-01T10:02:00.000');
  fireEvent.click(screen.getByRole('button', { name: '이전 record' }));
  expect(sequenceStatus()!.textContent).toBe('Sequence step · Record Sequence 6 · 2026-01-01T10:02:00.000');
  expect(heading()).toBe('커서 시점 상태 (2026-01-01T10:02:00.000)');
  const priorW01 = materialTable().getAllByRole('row').find((row) => within(row).queryByRole('rowheader')?.textContent === 'wafer W01');
  expect(priorW01 ? within(priorW01).getAllByRole('cell')[0]!.textContent : '').not.toMatch(/^ll-a\b/);
  expect((screen.getByRole('button', { name: '이전 record' }) as HTMLButtonElement).disabled).toBe(true);
  const slider = screen.getByRole('slider', { name: '커서 시각' });
  slider.focus();
  fireEvent.keyDown(slider, { key: 'ArrowRight' });
  expect(sequenceStatus()).toBeNull();
  expect(heading()).toBe('커서 시점 상태 (2026-01-01T10:03:00.000)');
});

it('the example-motion toggle is off by default, badges and draws one ghost at 10:01:30, and resets on an equipment change', async () => {
  await writeDraft(root, 'eq-synth-01-layout');
  await addEquipment(root, 'eq-synth-02');
  at('/focus/eq-synth-01');
  render(<App />);
  await loaded();
  applyRange('2026-01-01T10:01:30.000');
  expect(heading()).toBe('커서 시점 상태 (2026-01-01T10:01:30.000)');
  expect((screen.getByRole('button', { name: 'Sequence step' }) as HTMLButtonElement).disabled).toBe(true);
  screen.getByText('이 시점까지 적용된 record가 구간 안에 없어 Sequence step을 쓸 수 없습니다');
  const badge = () => document.querySelector('[data-evidence="illustrative"]');
  const toggle = () => screen.getByRole('checkbox', { name: '예시 이동 표시' });
  const checked = () => toggle().getAttribute('aria-checked');
  expect([checked(), document.querySelectorAll('[data-illustrative]').length, badge()]).toEqual(['false', 0, null]);
  expect(screen.queryByText(/예시 이동 \(관측 아님\)/)).toBeNull();
  fireEvent.click(toggle());
  expect(badge()!.textContent).toBe('예시 이동');
  expect(document.querySelectorAll('[data-illustrative="true"]')).toHaveLength(1);
  screen.getByText('wafer W01: lp-a → ll-a · 예시 이동 (관측 아님)');
  fireEvent.click(toggle());
  expect([document.querySelectorAll('[data-illustrative]').length, badge()]).toEqual([0, null]);
  fireEvent.click(toggle());
  act(() => navigate('/focus/eq-synth-02'));
  await screen.findByRole('heading', { name: 'Focus · eq-synth-02' });
  await loaded();
  expect([checked(), badge()]).toEqual(['false', null]);
});
