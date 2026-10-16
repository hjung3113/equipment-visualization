// @vitest-environment jsdom
import { readFile, readdir, rm } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
import * as onboardingData from '../src/onboarding-data.js';
import { navigate } from '../src/router.js';
import { createFileApi } from '../server/files.js';
import { addEquipment, publishEquipment, record, seedOnboardingRoot, signMapping, writeJson } from './seed.js';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const repo = resolve(process.cwd(), '../..');
let base: string;
let root: string;
/** Requests whose `path` starts with a held prefix wait here until the test releases them. */
let holds: { prefix: string; release: (outcome: 'ok' | 'fail') => void; wait: Promise<'ok' | 'fail'> }[];

const hold = (prefix: string) => {
  let release!: (outcome: 'ok' | 'fail') => void;
  const wait = new Promise<'ok' | 'fail'>((done) => { release = done; });
  const entry = { prefix, release, wait };
  holds.push(entry);
  return entry;
};

beforeEach(async () => {
  holds = [];
  ({ base, root } = await seedOnboardingRoot());
  const api = createFileApi({ root });
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const path = new URL(input, 'http://studio.test').searchParams.get('path') ?? '';
    const held = holds.find(({ prefix }) => path.startsWith(prefix));
    if (held && (await held.wait) === 'fail') throw new TypeError('network down');
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
// Wait for the load with a cheap text query, then query by role: a file's first *ByRole call is cold (≈0.5 s on a
// loaded runner) and, inside findBy*, it spends the 1000 ms window that the page load needs.
const loaded = () => waitFor(() => expect(screen.queryByText('불러오는 중…')).toBeNull());
const fleetRow = async (id: string) => { await loaded(); return screen.getByRole('link', { name: id }).closest('tr')!; };

it('lists a published equipment on /fleet with a link to its onboarding page', async () => {
  at('/fleet');
  render(<App />);
  const row = await fleetRow('eq-synth-01');
  expect(within(row).getByText('● 게시됨')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'eq-synth-01' }).getAttribute('href')).toBe('/onboarding/eq-synth-01');
});

it('shows the Inventory and Template sections on /onboarding/:equipmentId', async () => {
  at('/onboarding/eq-synth-01');
  render(<App />);
  await screen.findByRole('heading', { name: '② Inventory' });
  expect(screen.getByRole('heading', { name: '③ Template 제안' })).toBeTruthy();
  expect(screen.getByRole('table', { name: 'Alias 목록' })).toBeTruthy();
  expect(await screen.findByRole('img', { name: /미리보기$/ })).toBeTruthy();
});

it('shows not-found for an unknown id and a data error for a record without observations', async () => {
  await writeJson(root, 'equipment/eq-nodata.json', record('eq-nodata'));
  at('/onboarding/eq-unknown');
  const first = render(<App />);
  await screen.findByText('설비를 찾을 수 없습니다');
  first.unmount();

  at('/onboarding/eq-nodata');
  render(<App />);
  await screen.findByText(/관측 데이터 없음/);
  expect(screen.getByRole('alert').textContent).toContain('데이터 오류');
  expect(screen.queryByText('설비를 찾을 수 없습니다')).toBeNull();
});

const entries = async (path: string) => JSON.parse(await readFile(join(root, path), 'utf8'));
it.each<[string, (id: string) => Promise<void>]>([
  ['a record whose equipmentId differs from its file name', async (id) => {
    await addEquipment(root, id);
    await writeJson(root, `equipment/${id}.json`, { ...await entries(`equipment/${id}.json`), equipmentId: 'eq-other' });
  }],
  ['a batch for another equipment', async (id) => {
    await addEquipment(root, id);
    await writeJson(root, `observations/${id}/occurrence-batch.json`, { ...await entries(`observations/${id}/occurrence-batch.json`), equipmentId: 'eq-synth-01' });
  }],
  ['a model dictionary whose scope names another model', async (id) => {
    await addEquipment(root, id, { model: 'other-model' });
    await writeJson(root, 'onboarding/scopes/model/synth-maker/other-model/type-dictionary.json',
      await entries('onboarding/scopes/model/synth-maker/synth-model/type-dictionary.json'));
  }],
  ['overlapping bindings', async (id) => {
    await addEquipment(root, id);
    await writeJson(root, `onboarding/bindings/${id}.bindings.json`, { schemaVersion: '0.4', equipmentId: id, bindings: [
      { layoutId: 'l', mappingHash: `sha256:${'a'.repeat(64)}`, effectiveFrom: '2026-01-01T09:00:00.000', effectiveTo: '2026-01-01T11:00:00.000' },
      { layoutId: 'l', mappingHash: `sha256:${'b'.repeat(64)}`, effectiveFrom: '2026-01-01T10:00:00.000' },
    ] });
  }],
  ['a mapping whose entries were edited after hashing', async (id) => {
    await addEquipment(root, id);
    const hash = await publishEquipment(root, id);
    const path = `onboarding/mappings/${id}/${hash.slice('sha256:'.length)}.mapping.json`;
    const mapping = await entries(path);
    await writeJson(root, path, { ...mapping, entries: mapping.entries.slice(1) });
  }],
  ['a mapping whose hash differs from the binding', async (id) => {
    await addEquipment(root, id);
    const hash = await publishEquipment(root, id);
    const path = `onboarding/mappings/${id}/${hash.slice('sha256:'.length)}.mapping.json`;
    const body = await entries(path);
    delete body.hash;
    await writeJson(root, path, signMapping({ ...body, entries: body.entries.slice(1) }));
  }],
])('shows an error row without ratios for %s, next to a healthy equipment', async (scenario, setup) => {
  await setup('eq-bad');
  at('/fleet');
  render(<App />);
  const healthy = await fleetRow('eq-synth-01');
  expect(within(healthy).getByText('● 게시됨')).toBeTruthy();
  const bad = await fleetRow('eq-bad');
  expect(within(bad).getByText(/^⚠ 오류:/)).toBeTruthy();
  if (scenario === 'a record whose equipmentId differs from its file name') {
    expect(bad.textContent).toContain('equipment/eq-bad.json: equipmentId(eq-other)가 파일 이름과 다릅니다');
  }
  expect(bad.textContent).not.toMatch(/%|게시됨|초안|미착수/);

  navigate('/onboarding/eq-bad');
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('데이터 오류'));
  expect(screen.queryByText('설비를 찾을 수 없습니다')).toBeNull();
});

it('derives the status from absence: no bindings and no rules is 미착수, model rules make it 초안', async () => {
  await addEquipment(root, 'eq-new', { maker: 'other-maker', model: 'other-model' });
  await addEquipment(root, 'eq-draft');
  at('/fleet');
  render(<App />);
  expect(within(await fleetRow('eq-new')).getByText('○ 미착수')).toBeTruthy();
  expect(within(await fleetRow('eq-draft')).getByText('◐ 초안')).toBeTruthy();
});

it('renders the Inventory with dashes when alias metadata is absent', async () => {
  await addEquipment(root, 'eq-nometa', { maker: 'other-maker', model: 'other-model', metadata: false });
  at('/onboarding/eq-nometa');
  render(<App />);
  const table = await screen.findByRole('table', { name: 'Alias 목록' });
  const moduleTypes = within(table).getAllByRole('row').slice(1).map((row) => row.querySelectorAll('td')[0]!.textContent);
  expect(moduleTypes.length).toBeGreaterThan(0);
  expect(new Set(moduleTypes)).toEqual(new Set(['—']));
});

it('treats an invalid alias-metadata file as an error, not as absent', async () => {
  await addEquipment(root, 'eq-badmeta');
  await writeJson(root, 'observations/eq-badmeta/alias-metadata.json', { schemaVersion: '0.4' });
  at('/fleet');
  const first = render(<App />);
  expect(within(await fleetRow('eq-badmeta')).getByText(/^⚠ 오류:/)).toBeTruthy();
  first.unmount();

  at('/onboarding/eq-badmeta');
  render(<App />);
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('alias-metadata.json'));
});

const renameWith = (prefix: string) => (text: string) => text.replaceAll('"PM1"', `"${prefix}_PM1"`);

it.each(['ok', 'fail'] as const)('ignores a late %s result of a previous equipment id', async (outcome) => {
  await addEquipment(root, 'eq-a', { rename: renameWith('A') });
  await addEquipment(root, 'eq-b', { rename: renameWith('B') });
  const gate = hold('equipment/eq-a.json');
  const load = onboardingData.loadOnboarding;
  let completion!: ReturnType<typeof load>;
  vi.spyOn(onboardingData, 'loadOnboarding').mockImplementation((id) => {
    const pending = load(id);
    if (id === 'eq-a') completion = pending;
    return pending;
  });
  at('/onboarding/eq-a');
  render(<App />);
  act(() => navigate('/onboarding/eq-b'));
  await screen.findByText('B_PM1');

  await act(async () => {
    gate.release(outcome);
    await completion;
  });
  expect(screen.getByText('B_PM1')).toBeTruthy();
  expect(screen.queryByText('A_PM1')).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('eq-b');
});

it('clears the previous equipment at once while the next one loads', async () => {
  await addEquipment(root, 'eq-a', { rename: renameWith('A') });
  await addEquipment(root, 'eq-b', { rename: renameWith('B') });
  at('/onboarding/eq-a');
  render(<App />);
  await screen.findByText('A_PM1');
  const gate = hold('equipment/eq-b.json');
  act(() => navigate('/onboarding/eq-b'));
  expect(screen.queryByText('A_PM1')).toBeNull();
  expect(screen.queryByRole('table', { name: 'Alias 목록' })).toBeNull();
  expect(screen.getByText('불러오는 중…')).toBeTruthy();

  gate.release('ok');
  await screen.findByText('B_PM1');
});

const COPIES = async () => {
  const onboarding = join(repo, 'fixtures/cluster-single/onboarding');
  const walk = async (dir: string): Promise<string[]> => (await Promise.all((await readdir(dir, { withFileTypes: true }))
    .map(async (entry) => entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]))).flat();
  const pairs: [string, string][] = [
    ['fixtures/cluster-single/occurrence-batch.json', 'assets/observations/eq-synth-01/occurrence-batch.json'],
    ['fixtures/cluster-single/onboarding/alias-metadata.json', 'assets/observations/eq-synth-01/alias-metadata.json'],
    ['fixtures/cluster-single/layout.json', 'assets/layouts/eq-synth-01-layout/draft.layout.json'],
  ];
  for (const file of await walk(onboarding)) {
    const inside = relative(onboarding, file);
    if (inside !== 'alias-metadata.json') pairs.push([relative(repo, file), `assets/onboarding/${inside}`]);
  }
  return pairs;
};
it('keeps every assets/ seed copy byte-identical to its fixture', async () => {
  const pairs = await COPIES();
  expect(pairs.length).toBe(9);
  for (const [source, copy] of pairs) {
    expect(await readFile(join(repo, copy)), copy).toEqual(await readFile(join(repo, source)));
  }
});
