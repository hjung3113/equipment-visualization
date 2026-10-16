// @vitest-environment jsdom
import { readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  instantiateLayout, layoutDocumentSchema, mappingVersionSchema, observedInventorySchema, validateAliasRules, validateBindings, verifyMappingHash,
  type TemplateDocument,
} from '@eqv/core';
import { App } from '../src/App.js';
import { navigate, setNavigationBlocker } from '../src/router.js';
import { createFileApi } from '../server/files.js';
import { addEquipment, seedOnboardingRoot, writeDraft, writeJson } from './seed.js';

const captured = vi.hoisted(() => ({ props: [] as { equipment: { equipmentId: string }; onDirtyChange?: (dirty: boolean) => void }[] }));
vi.mock('@eqv/editor', async (importOriginal) => {
  const original = await importOriginal<typeof import('@eqv/editor')>();
  return {
    ...original,
    MappingBoard: (props: Parameters<typeof original.MappingBoard>[0]) => {
      captured.props.push(props);
      return original.MappingBoard(props);
    },
  };
});

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const repo = resolve(process.cwd(), '../..');
let base: string;
let root: string;
let holds: { prefix: string; method?: string; release: () => void; wait: Promise<void> }[];
let failPut: ((path: string) => boolean) | null;
let beforePut: ((path: string) => Promise<void>) | null;

const hold = (prefix: string, method?: string) => {
  let release!: () => void;
  const wait = new Promise<void>((done) => { release = done; });
  const entry = { prefix, method, release, wait };
  holds.push(entry);
  return entry;
};

beforeEach(async () => {
  holds = [];
  failPut = null;
  beforePut = null;
  captured.props = [];
  ({ base, root } = await seedOnboardingRoot());
  const api = createFileApi({ root });
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const path = new URL(input, 'http://studio.test').searchParams.get('path') ?? '';
    await holds.find(({ prefix, method }) => path.startsWith(prefix) && (!method || method === (init?.method ?? 'GET')))?.wait;
    if (init?.method === 'PUT') await beforePut?.(path);
    if (init?.method === 'PUT' && failPut?.(path)) return new Response(JSON.stringify({ error: '거부됨' }), { status: 400 });
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>));
    const result = await api.handle({ method: init?.method ?? 'GET', url: input, headers, body: String(init?.body ?? '') });
    return new Response(JSON.stringify(result.body), { status: result.status });
  });
});
afterEach(async () => {
  cleanup();
  setNavigationBlocker(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await rm(base, { recursive: true, force: true });
});

const at = (path: string) => window.history.replaceState(null, '', path);
const disk = async (path: string) => JSON.parse(await readFile(join(root, path), 'utf8'));
const diskText = (path: string) => readFile(join(root, path), 'utf8');
const MODEL_RULES = 'onboarding/scopes/model/synth-maker/synth-model/alias-rules.json';
const EQUIPMENT_RULES = 'onboarding/scopes/equipment/eq-synth-01/alias-rules.json';
const list = () => screen.findByRole('listbox', { name: 'Alias 목록' });
const option = async (alias: string) => within(await list()).getByRole('option', { name: new RegExp(`^${alias},`) });
const beforeUnloadPrevented = () => {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};
async function assignPm9(component = 'pm-b') {
  fireEvent.click(await option('PM9'));
  fireEvent.click(screen.getByRole('button', { name: '배정 (A)' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getAllByRole('option').find((row) => row.querySelector('code')!.textContent === component)!);
}
// See onboarding-pages.test.tsx: wait for the load with a text query before the file's first (cold) role query.
const loaded = () => waitFor(() => expect(screen.queryByText('불러오는 중…')).toBeNull());
const press = (target: Element, key: string) => fireEvent.keyDown(target, { key });
const save = () => fireEvent.click(screen.getByRole('button', { name: '저장' }));

it('mounts the Board for a direct visit and shows the fixture statuses', async () => {
  await writeDraft(root, 'eq-synth-01-layout');
  at('/onboarding/eq-synth-01/board');
  render(<App />);
  await loaded();
  screen.getByRole('heading', { name: '④ Mapping Board' });
  const status = async (alias: string) => (await option(alias)).querySelector('.eqv-ed-board-status')!.textContent;
  expect(await Promise.all(['EFEM_R1', 'LLA', 'LP1', 'PM1', 'PM2', 'PM9', 'TM_R1', 'VIRT_SCH'].map(status))).toEqual(
    ['● 확정', '● 확정', '● 확정', '● 확정', '◐ 자동', '○ 미매핑', '● 확정', '⊘ 무시']);
});

it('reads the shipped synthetic draft', async () => {
  await writeDraft(root, 'eq-synth-01-layout');
  expect(await disk('layouts/eq-synth-01-layout/draft.layout.json')).toEqual(
    JSON.parse(await readFile(join(repo, 'assets/layouts/eq-synth-01-layout/draft.layout.json'), 'utf8')));
});

it('opens the Board from the onboarding page link, which replaces the start buttons when a draft exists', async () => {
  await writeDraft(root, 'eq-synth-01-layout');
  at('/onboarding/eq-synth-01');
  render(<App />);
  fireEvent.click(await screen.findByRole('link', { name: '④ Mapping Board 열기' }));
  await screen.findByRole('heading', { name: '④ Mapping Board' });
  expect(window.location.pathname).toBe('/onboarding/eq-synth-01/board');
});

it('shows no start buttons when a draft exists', async () => {
  await writeDraft(root, 'eq-synth-01-layout');
  at('/onboarding/eq-synth-01');
  render(<App />);
  await screen.findByRole('link', { name: '④ Mapping Board 열기' });
  expect(screen.queryByRole('button', { name: /으로 시작$/ })).toBeNull();
});

it('creates the draft from the template and opens the Board when none exists', async () => {
  await addEquipment(root, 'eq-new');
  at('/onboarding/eq-new');
  render(<App />);
  expect(screen.queryByRole('link', { name: '④ Mapping Board 열기' })).toBeNull();
  const [start] = await screen.findAllByRole('button', { name: 'Radial Cluster · Single Vacuum Arm으로 시작' });
  fireEvent.click(start!);
  await screen.findByRole('heading', { name: '④ Mapping Board' });
  const template = JSON.parse(await readFile(join(repo, 'assets/templates/cluster-single.template.json'), 'utf8')) as TemplateDocument;
  expect(await disk('layouts/eq-new-layout/draft.layout.json')).toEqual(instantiateLayout(template, 'eq-new-layout'));
  expect(window.location.pathname).toBe('/onboarding/eq-new/board');
});

it('does not overwrite a draft created after the page loaded', async () => {
  await addEquipment(root, 'eq-new');
  at('/onboarding/eq-new');
  render(<App />);
  const [start] = await screen.findAllByRole('button', { name: 'Radial Cluster · Single Vacuum Arm으로 시작' });
  await writeDraft(root, 'eq-new-layout');
  const before = await diskText('layouts/eq-new-layout/draft.layout.json');
  fireEvent.click(start!);
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('이미 레이아웃 draft가 있습니다');
  expect(within(alert).getByRole('link', { name: '④ Mapping Board 열기' })).toBeTruthy();
  expect(await diskText('layouts/eq-new-layout/draft.layout.json')).toBe(before);
  expect(window.location.pathname).toBe('/onboarding/eq-new');
});

it('disables the start buttons when the layout id cannot be derived', async () => {
  await addEquipment(root, 'Eq_Bad');
  at('/onboarding/Eq_Bad');
  render(<App />);
  expect(await screen.findByText('설비 id로 레이아웃 id를 만들 수 없습니다')).toBeTruthy();
  for (const button of screen.getAllByRole('button', { name: /으로 시작$/ })) expect((button as HTMLButtonElement).disabled).toBe(true);
});

it('says so when the equipment has no draft', async () => {
  at('/onboarding/eq-synth-01/board');
  render(<App />);
  await screen.findByText('레이아웃 draft가 없습니다');
  expect(screen.getByRole('link', { name: 'Onboarding으로 이동' }).getAttribute('href')).toBe('/onboarding/eq-synth-01');
});

it.each([
  ['Model', MODEL_RULES, null],
  ['설비', EQUIPMENT_RULES, /^설비/],
] as const)('writes the %s alias-rules file on disk when saving', async (_name, path, radio) => {
  await writeDraft(root, 'eq-synth-01-layout');
  const other = path === MODEL_RULES ? EQUIPMENT_RULES : MODEL_RULES;
  const otherBefore = await diskText(other);
  at('/onboarding/eq-synth-01/board');
  render(<App />);
  await screen.findByRole('heading', { name: '④ Mapping Board' });
  if (radio) fireEvent.click(screen.getByRole('radio', { name: radio }));
  await assignPm9();
  save();
  await waitFor(async () => expect((await disk(path)).rules.map((rule: { id: string }) => rule.id)).toContain('board-pm9'));
  expect(validateAliasRules(await disk(path)).ok).toBe(true);
  expect(await screen.findByText('저장됨')).toBeTruthy();
  expect(await diskText(other)).toBe(otherBefore);
});

it('shows the alert and stays dirty when a PUT fails', async () => {
  await writeDraft(root, 'eq-synth-01-layout');
  failPut = (path) => path === MODEL_RULES;
  const before = await diskText(MODEL_RULES);
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  at('/onboarding/eq-synth-01/board');
  render(<App />);
  await screen.findByRole('heading', { name: '④ Mapping Board' });
  await assignPm9();
  save();
  expect((await screen.findByRole('alert')).textContent).toBe('거부됨');
  expect(await diskText(MODEL_RULES)).toBe(before);
  act(() => navigate('/fleet'));
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(window.location.pathname).toBe('/onboarding/eq-synth-01/board');
});

it('asks before leaving with unsaved edits and stops asking after a save', async () => {
  await writeDraft(root, 'eq-synth-01-layout');
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  at('/onboarding/eq-synth-01/board');
  render(<App />);
  await screen.findByRole('heading', { name: '④ Mapping Board' });
  expect(beforeUnloadPrevented()).toBe(false);
  await assignPm9();
  await waitFor(() => expect(beforeUnloadPrevented()).toBe(true));
  act(() => navigate('/fleet'));
  expect(confirm).toHaveBeenCalledWith('저장하지 않은 매핑 변경이 있습니다. 버리고 이동할까요?');
  expect(window.location.pathname).toBe('/onboarding/eq-synth-01/board');
  save();
  await screen.findByText('저장됨');
  await waitFor(() => expect(beforeUnloadPrevented()).toBe(false));
  confirm.mockClear();
  act(() => navigate('/fleet'));
  expect(confirm).not.toHaveBeenCalled();
  expect(window.location.pathname).toBe('/fleet');
});

async function dirtyOnA() {
  await writeDraft(root, 'eq-synth-01-layout');
  at('/onboarding/eq-synth-01/board');
  render(<App />);
  await screen.findByRole('heading', { name: '④ Mapping Board' });
  await assignPm9();
  await waitFor(() => expect(beforeUnloadPrevented()).toBe(true));
}

it.each([
  ['while B is still loading', async () => { await addEquipment(root, 'eq-b'); await writeDraft(root, 'eq-b-layout'); return hold('equipment/eq-b.json'); }],
  ['to an equipment without a draft', async () => { await addEquipment(root, 'eq-b'); return null; }],
])('drops the leave guard of A as soon as the user accepts leaving for B %s', async (_name, prepare) => {
  const gate = await prepare();
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
  await dirtyOnA();
  act(() => navigate('/onboarding/eq-b/board'));
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(window.location.pathname).toBe('/onboarding/eq-b/board');
  await waitFor(() => expect(beforeUnloadPrevented()).toBe(false));
  confirm.mockClear();
  act(() => navigate('/fleet'));
  expect(confirm).not.toHaveBeenCalled();
  gate?.release();
});

it('keeps A and its guard when leaving is declined', async () => {
  await addEquipment(root, 'eq-b');
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  await dirtyOnA();
  act(() => navigate('/onboarding/eq-b/board'));
  expect(window.location.pathname).toBe('/onboarding/eq-synth-01/board');
  expect(beforeUnloadPrevented()).toBe(true);
  expect((await option('PM9')).textContent).toContain('pm-b');
  act(() => navigate('/fleet'));
  expect(confirm).toHaveBeenCalledTimes(2);
});

it('ignores a late dirty callback from the board of the previous equipment', async () => {
  await addEquipment(root, 'eq-b');
  await writeDraft(root, 'eq-b-layout');
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
  await dirtyOnA();
  const callbackOfA = captured.props.findLast((props) => props.equipment.equipmentId === 'eq-synth-01')!.onDirtyChange!;
  act(() => navigate('/onboarding/eq-b/board'));
  await screen.findByText('eq-b', { selector: 'code' });
  await screen.findByRole('heading', { name: '④ Mapping Board' });
  act(() => callbackOfA(true));
  expect(beforeUnloadPrevented()).toBe(false);
  confirm.mockClear();
  act(() => navigate('/fleet'));
  expect(confirm).not.toHaveBeenCalled();
});

it('drops A at once on navigation and ignores a late result of A', async () => {
  await addEquipment(root, 'eq-b', { rename: (text) => text.replaceAll('PM1', 'B_PM1') });
  await writeDraft(root, 'eq-b-layout');
  await writeDraft(root, 'eq-synth-01-layout');
  const gate = hold('equipment/eq-synth-01.json');
  at('/onboarding/eq-synth-01/board');
  render(<App />);
  expect(screen.getByText('불러오는 중…')).toBeTruthy();
  act(() => navigate('/onboarding/eq-b/board'));
  await screen.findByRole('heading', { name: '④ Mapping Board' });
  expect((await option('B_PM1'))).toBeTruthy();
  await act(async () => { gate.release(); await gate.wait; await new Promise((done) => setTimeout(done, 50)); });
  expect(screen.getByText('eq-b', { selector: 'code' })).toBeTruthy();
  expect(within(await list()).queryByRole('option', { name: /^PM1,/ })).toBeNull();
});

it('removes the previous equipment Board at once on navigation', async () => {
  await addEquipment(root, 'eq-b');
  await writeDraft(root, 'eq-b-layout');
  await writeDraft(root, 'eq-synth-01-layout');
  at('/onboarding/eq-synth-01/board');
  render(<App />);
  await screen.findByRole('heading', { name: '④ Mapping Board' });
  const gate = hold('equipment/eq-b.json');
  act(() => navigate('/onboarding/eq-b/board'));
  expect(screen.queryByRole('listbox', { name: 'Alias 목록' })).toBeNull();
  expect(screen.getByText('불러오는 중…')).toBeTruthy();
  gate.release();
  await screen.findByRole('heading', { name: '④ Mapping Board' });
});

it.each(['mixed', 'generic'] as const)('UX-11 gives %s start actions distinct names, styling and unsuitable warnings', async (variant) => {
  await addEquipment(root, 'eq-new');
  const single = JSON.parse(await readFile(join(repo, 'assets/templates/cluster-single.template.json'), 'utf8')) as TemplateDocument;
  const lithography = JSON.parse(await readFile(join(repo, 'assets/templates/lithography-dual-stage.template.json'), 'utf8')) as TemplateDocument;
  await writeJson(root, 'templates/lithography-dual-stage.template.json', lithography);
  if (variant === 'generic') {
    await writeJson(root, 'templates/cluster-single.template.json', { ...single, roleCardinality: { pm: { min: 99, max: 99 } } });
  }
  at('/onboarding/eq-new');
  render(<App />);
  const starts = await screen.findAllByRole('button', { name: /으로 시작$/ });
  expect(starts).toHaveLength(variant === 'mixed' ? 2 : 3);
  expect(new Set(starts.map((b) => b.getAttribute('aria-label') ?? b.textContent)).size).toBe(starts.length);
  expect(screen.getAllByText('부적합 Template입니다')).toHaveLength(variant === 'mixed' ? 1 : 2);
  expect(screen.queryByRole('button', { name: 'Generic Layout으로 시작' }) !== null).toBe(variant === 'generic');
  for (const start of starts) {
    const name = start.getAttribute('aria-label')!;
    expect([`${single.name}으로 시작`, `${lithography.name}으로 시작`, 'Generic Layout으로 시작']).toContain(name);
    expect(start.classList.contains('eqv-ed-btn-primary')).toBe(true);
    const card = start.closest('li')!;
    if (card.textContent?.includes('✗ 부적합')) {
      expect(card.textContent).toContain('부적합 Template입니다');
      expect((start as HTMLButtonElement).disabled).toBe(false);
    }
  }
});

it('UX-12 gives a loaded Board one heading and a route back to its Onboarding page', async () => {
  await writeDraft(root, 'eq-synth-01-layout');
  at('/onboarding/eq-synth-01/board');
  render(<App />);
  await screen.findByRole('heading', { name: '④ Mapping Board' });
  expect(screen.getAllByRole('heading').filter((heading) => heading.textContent?.includes('Mapping Board'))).toHaveLength(1);
  expect(screen.getByRole('link', { name: 'Onboarding으로 이동' }).getAttribute('href')).toBe('/onboarding/eq-synth-01');
});

const BINDINGS = 'onboarding/bindings/eq-synth-01.bindings.json';
const publishButton = () => screen.getByRole('button', { name: '게시' });
const statusText = () => document.querySelector('.eqv-ed-publish-status')!.textContent;
const hex12 = (hash: string) => hash.slice('sha256:'.length, 'sha256:'.length + 12);
const inertAncestor = async () => (await list()).closest('[inert]');
it('opens and first-publishes a draft with a valid empty bindings file', async () => {
  await writeDraft(root, 'eq-synth-01-layout');
  await writeJson(root, BINDINGS, { schemaVersion: '0.4', equipmentId: 'eq-synth-01', bindings: [] });
  at('/onboarding/eq-synth-01/board');
  render(<App />);
  await screen.findByRole('heading', { name: '④ Mapping Board' });
  expect((screen.getByLabelText('effectiveFrom') as HTMLInputElement).value).toBe('2026-01-01T10:00:00.000');
  await waitFor(() => expect(publishButton().getAttribute('aria-disabled')).toBe('false'));
  fireEvent.click(publishButton());
  await waitFor(() => expect(statusText()).toMatch(/^게시됨 · /));
  const written = await disk(BINDINGS);
  expect(validateBindings(written).ok).toBe(true);
  expect(written.bindings).toHaveLength(1);
  expect(written.bindings[0].effectiveFrom).toBe('2026-01-01T10:00:00.000');
});

async function openPublishable() {
  await writeDraft(root, 'eq-synth-01-layout');
  at('/onboarding/eq-synth-01/board');
  render(<App />);
  await screen.findByRole('heading', { name: '④ Mapping Board' });
  await assignPm9();
  save();
  await screen.findByText('저장됨');
  await waitFor(() => expect(publishButton().getAttribute('aria-disabled')).toBe('false'));
}

it('publishes the revision, Mapping Version, Baseline Inventory and then the bindings, and reloads onto them', async () => {
  await openPublishable();
  const before = await disk(BINDINGS);
  fireEvent.click(publishButton());
  await waitFor(() => expect(statusText()).toMatch(/^게시됨 · [0-9a-f]{12} · 2026-01-01T10:30:00\.000$/));

  const bindings = validateBindings(await disk(BINDINGS));
  expect(bindings.ok).toBe(true);
  const written = (await disk(BINDINGS)).bindings;
  expect(written).toHaveLength(before.bindings.length + 1);
  expect(written.at(-2)).toEqual({ ...before.bindings.at(-1), effectiveTo: '2026-01-01T10:30:00.000' });
  const latest = written.at(-1);
  expect(latest).toMatchObject({ layoutId: 'eq-synth-01-layout', effectiveFrom: '2026-01-01T10:30:00.000', layoutRevision: expect.stringMatching(/^sha256:[0-9a-f]{64}$/) });
  expect(statusText()).toContain(hex12(latest.mappingHash));

  const hex = latest.mappingHash.slice('sha256:'.length);
  const mapping = mappingVersionSchema.parse(await disk(`onboarding/mappings/eq-synth-01/${hex}.mapping.json`));
  expect(await verifyMappingHash(mapping)).toBe(true);
  expect(mapping.entries.map(({ alias }) => alias)).toContain('PM9');
  const inventory = observedInventorySchema.parse(await disk(`onboarding/baselines/eq-synth-01/${hex}.inventory.json`));
  expect(inventory).toMatchObject({ equipmentId: 'eq-synth-01', from: '2026-01-01T10:00:00.000', to: '2026-01-01T10:30:00.000' });
  const revision = await disk(`layouts/eq-synth-01-layout/${latest.layoutRevision.slice('sha256:'.length)}.layout.json`);
  expect(layoutDocumentSchema.safeParse(revision).success).toBe(true);

  // The reload shows the new latest binding: the same inputs are now "same as the previous publication".
  await waitFor(() => expect(screen.getByText(/이전 게시와 같습니다/)).toBeTruthy());
  expect(publishButton().getAttribute('aria-disabled')).toBe('true');
  expect(await inertAncestor()).toBeNull();
});

it('names the failing step and writes no bindings when the bindings PUT fails, leaving the Board editable with its state', async () => {
  await openPublishable();
  const board = await list();
  const before = await diskText(BINDINGS);
  failPut = (path) => path === BINDINGS;
  fireEvent.click(publishButton());
  await waitFor(() => expect(statusText()).toBe('④ bindings 단계 실패: 거부됨'));
  expect(await diskText(BINDINGS)).toBe(before);
  expect(await inertAncestor()).toBeNull();
  expect(await list()).toBe(board);
  expect((await option('PM9')).textContent).toContain('pm-b');
  expect(publishButton().getAttribute('aria-disabled')).toBe('false');
});

it('keeps publishing when a different baseline already exists for the same Mapping Version', async () => {
  await openPublishable();
  let existing: unknown;
  beforePut = async (path) => {
    const match = /^onboarding\/mappings\/eq-synth-01\/([0-9a-f]{64})\.mapping\.json$/.exec(path);
    if (!match) return;
    existing = { equipmentId: 'eq-synth-01', from: '2025-12-01T00:00:00.000', to: '2025-12-02T00:00:00.000', aliases: [], transfers: [] };
    await writeJson(root, `onboarding/baselines/eq-synth-01/${match[1]}.inventory.json`, existing);
  };
  fireEvent.click(publishButton());
  await waitFor(() => expect(statusText()).toMatch(/^게시됨 · /));
  const latest = (await disk(BINDINGS)).bindings.at(-1);
  expect(await disk(`onboarding/baselines/eq-synth-01/${latest.mappingHash.slice('sha256:'.length)}.inventory.json`)).toEqual(existing);
});

it('lists the equipment of the same maker/model with their own Inventory, draft and rules', async () => {
  await writeDraft(root, 'eq-synth-01-layout');
  await addEquipment(root, 'eq-synth-02', { rename: (text) => text.replace(/\bLP1\b/g, 'LP2') });
  await writeDraft(root, 'eq-synth-02-layout');
  at('/onboarding/eq-synth-01/board');
  render(<App />);
  await screen.findByRole('heading', { name: '④ Mapping Board' });
  fireEvent.click(await screen.findByRole('button', { name: '같은 Model 일괄 dry-run 실행' }));
  const table = await screen.findByRole('table', { name: /^synth-maker\/synth-model 설비 2대$/ });
  const rows = within(table).getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('rowheader').concat(within(row).getAllByRole('cell')).map((cell) => cell.textContent));
  expect(rows.map(([id]) => id)).toEqual(['eq-synth-02', 'eq-synth-01']);
  expect(rows[0]![1]).toBe('미게시');
  expect(rows[1]![1]).toBe('게시됨');
  const unmapped = (row: (string | null)[]) => Number(row[5]);
  expect(unmapped(rows[0]!)).toBeGreaterThan(unmapped(rows[1]!));
  expect(within(table).getByRole('link', { name: 'eq-synth-02' }).getAttribute('href')).toBe('/onboarding/eq-synth-02/board');
});

it('rings both components and draws the observed-transfer line when a conflict is clicked, and clears on a second click', async () => {
  await writeDraft(root, 'eq-synth-01-layout');
  const draft = await disk('layouts/eq-synth-01-layout/draft.layout.json');
  draft.transferCapabilities = draft.transferCapabilities.filter(({ id }: { id: string }) => id !== 'lp-slot-1-ll' && id !== 'lp-slot-2-ll');
  await writeJson(root, 'layouts/eq-synth-01-layout/draft.layout.json', draft);
  at('/onboarding/eq-synth-01/board');
  const { container } = render(<App />);
  const conflict = await screen.findByRole('button', { name: /^이송 LP1 → LLA \(2건\)/ });
  expect(container.querySelector('[data-layer="highlight"]')).toBeNull();
  fireEvent.click(conflict);
  const layer = container.querySelector('[data-layer="highlight"]')!;
  expect(layer.querySelectorAll('rect')).toHaveLength(2);
  const line = layer.querySelector('line')!;
  expect(line.getAttribute('stroke-dasharray')).toBeTruthy();
  expect(line.querySelector('title')!.textContent).toBe('관측 이송 LP1 → LLA 2건 (Transfer Capability 없음)');
  fireEvent.click(conflict);
  expect(container.querySelector('[data-layer="highlight"]')).toBeNull();
});

it('keeps the publication in flight over the reload: the Board is inert, edits are refused, and the receipt survives', async () => {
  await openPublishable();
  const gate = hold(BINDINGS, 'PUT');
  fireEvent.click(publishButton());
  await waitFor(() => expect(statusText()).toBe('게시 중…'));
  expect(await inertAncestor()).not.toBeNull();
  const pm1 = await option('PM1');
  fireEvent.click(pm1);
  press(await list(), 'i');
  expect((await option('PM1')).textContent).toContain('● 확정');
  gate.release();
  await waitFor(() => expect(statusText()).toMatch(/^게시됨 · /));
  const latest = (await disk(BINDINGS)).bindings.at(-1);
  expect(statusText()).toBe(`게시됨 · ${hex12(latest.mappingHash)} · 2026-01-01T10:30:00.000`);
  await waitFor(async () => expect(await inertAncestor()).toBeNull());
  expect(statusText()).toBe(`게시됨 · ${hex12(latest.mappingHash)} · 2026-01-01T10:30:00.000`);
});

it.each(['success', 'failure'] as const)('preserves returned A edits and its guard when an earlier visit Publish settles with %s', async (outcome) => {
  await addEquipment(root, 'eq-b');
  await writeDraft(root, 'eq-b-layout');
  await openPublishable();
  const gate = hold(BINDINGS, 'PUT');
  let settled!: () => void;
  const finished = new Promise<void>((resolve) => { settled = resolve; });
  const fetchBefore = globalThis.fetch;
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const response = await fetchBefore(input, init);
    if (init?.method === 'PUT' && input.includes(encodeURIComponent(BINDINGS))) settled();
    return response;
  });
  fireEvent.click(publishButton());
  await waitFor(() => expect(statusText()).toBe('게시 중…'));
  act(() => navigate('/onboarding/eq-b/board'));
  await screen.findByRole('heading', { name: '④ Mapping Board' });
  act(() => navigate('/onboarding/eq-synth-01/board'));
  await screen.findByRole('heading', { name: '④ Mapping Board' });
  await assignPm9('pm-a');
  await waitFor(() => expect(beforeUnloadPrevented()).toBe(true));
  const board = await list();
  if (outcome === 'failure') failPut = (path) => path === BINDINGS;
  await act(async () => {
    gate.release();
    await finished;
    await new Promise((done) => setTimeout(done, 50));
  });
  expect(await list()).toBe(board);
  expect((await option('PM9')).textContent).toContain('pm-a');
  expect(statusText()).toBe('');
  expect(beforeUnloadPrevented()).toBe(true);
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  act(() => navigate('/fleet'));
  expect(window.location.pathname).toBe('/onboarding/eq-synth-01/board');
});
