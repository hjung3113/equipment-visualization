// @vitest-environment jsdom
import { mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { sampleWindowName } from '@eqv/core';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
import { navigate } from '../src/router.js';
import { createFileApi } from '../server/files.js';
import { addSynth03, addWindow, importFixture, seedOnboardingRoot, writeJson } from './seed.js';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const repo = resolve(process.cwd(), '../..');
type Api = ReturnType<typeof createFileApi>;
type Call = { method: string; url: string; headers: Record<string, string>; body: string };
let base: string;
let root: string;
let api: Api;
/** A test can answer some requests itself (a server 400 behind valid input, a dead network); `undefined` means "use the API". */
let override: ((call: Call) => Promise<Response | undefined> | Response | undefined) | null;

function serve(options: { repoRoot?: string } = { repoRoot: repo }) {
  api = createFileApi({ root, ...options });
}

beforeEach(async () => {
  override = null;
  ({ base, root } = await seedOnboardingRoot());
  serve();
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>));
    const call = { method: init?.method ?? 'GET', url: input, headers, body: String(init?.body ?? '') };
    const answered = await override?.(call);
    if (answered) return answered;
    const result = await api.handle(call);
    return new Response(JSON.stringify(result.body), { status: result.status });
  });
});
afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await rm(base, { recursive: true, force: true });
});

const at = (path: string) => window.history.replaceState(null, '', path);
const main = () => within(screen.getByRole('main'));
const loaded = () => waitFor(() => expect(screen.queryByText('불러오는 중…')).toBeNull());
const heading = (name: string) => screen.getByRole('heading', { level: 1, name });
const equipmentFiles = () => readdir(join(root, 'equipment')).then((names) => names.sort());
/** Typing is `fireEvent.change`; the button is enabled once the import status has loaded. */
async function fill(values: { equipmentId: string; maker: string; model: string }) {
  await waitFor(() => expect((screen.getByRole('button', { name: '등록' }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.change(screen.getByRole('textbox', { name: '설비 ID' }), { target: { value: values.equipmentId } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Maker' }), { target: { value: values.maker } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Model' }), { target: { value: values.model } });
}
const submit = () => fireEvent.submit(screen.getByRole('form', { name: '설비 등록' }));
const FIXTURE_VALUES = { equipmentId: 'eq-synth-03', maker: 'synth-maker-b', model: 'synth-wet' };
const rangeOf = (batch: Record<string, unknown>) => `${String(batch.from)} – ${String(batch.to)}`;

it('registers an equipment by keyboard path: Fleet entry, form, data page, then a 관측 없음 Fleet row', async () => {
  at('/fleet');
  render(<App />);
  await loaded();
  await waitFor(() => expect(screen.getByRole('link', { name: '설비 등록' }).getAttribute('href')).toBe('/fleet/new'));
  fireEvent.click(screen.getByRole('link', { name: '설비 등록' }));
  await waitFor(() => expect(document.activeElement).toBe(heading('설비 등록')));

  await fill(FIXTURE_VALUES);
  submit();
  await waitFor(() => expect(window.location.pathname).toBe('/equipment/eq-synth-03'));
  await waitFor(() => expect(document.activeElement).toBe(heading('설비 데이터')));
  expect(JSON.parse(await readFile(join(root, 'equipment/eq-synth-03.json'), 'utf8'))).toEqual(await importFixture('eq-synth-03.equipment.json'));
  await screen.findByText('Sample Window가 없습니다');
  expect(['설비 ID', 'Maker', 'Model'].map((label) => screen.getByText(label, { exact: true }).nextElementSibling?.textContent)).toEqual(['eq-synth-03', 'synth-maker-b', 'synth-wet']);

  act(() => navigate('/fleet'));
  await loaded();
  const row = screen.getByRole('link', { name: 'eq-synth-03' }).closest('tr')!;
  expect(within(row).getByText('관측 없음')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'eq-synth-03' }).getAttribute('href')).toBe('/equipment/eq-synth-03');
  expect(row.querySelector('.text-text-danger-label')).toBeNull();
});

it.each<[string, { equipmentId: string; maker: string; model: string }, string, RegExp, boolean]>([
  ['an empty 설비 ID (client)', { ...FIXTURE_VALUES, equipmentId: '' }, '설비 ID', /값을 입력하세요/, false],
  ['a Maker with a space (client)', { ...FIXTURE_VALUES, maker: 'a b' }, 'Maker', /영문자나 숫자로 시작/, false],
  ['an already registered 설비 ID (412)', FIXTURE_VALUES, '설비 ID', /이미 등록된 설비 ID입니다/, true],
  ['a 설비 ID differing only by case (409)', { ...FIXTURE_VALUES, equipmentId: 'EQ-SYNTH-03' }, '설비 ID', /'eq-synth-03'/, true],
  ['a Maker differing only by case (409)', { equipmentId: 'eq-other', maker: 'Synth-Maker-B', model: 'synth-wet' }, 'Maker', /'synth-maker-b'/, true],
  ['a Model differing only by case (409)', { equipmentId: 'eq-other', maker: 'synth-maker-b', model: 'SYNTH-WET' }, 'Model', /'synth-wet'/, true],
])('shows a field error, focuses the field and writes nothing for %s', async (_, values, label, description, existing) => {
  if (existing) await addSynth03(root, { windows: false });
  const before = await equipmentFiles();
  at('/fleet/new');
  render(<App />);
  await fill(values);
  submit();
  await waitFor(() => expect(screen.getByRole('textbox', { name: label, description })).toBeTruthy());
  const input = screen.getByRole('textbox', { name: label, description });
  expect(input.getAttribute('aria-invalid')).toBe('true');
  await waitFor(() => expect(document.activeElement).toBe(input));
  expect(window.location.pathname).toBe('/fleet/new');
  expect(await equipmentFiles()).toEqual(before);
});

it('shows the server verdict for a 400 even when the client passed', async () => {
  const real = await api.handle({ method: 'POST', url: '/api/import/equipment', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ schemaVersion: '0.4', equipmentId: 'a b', maker: 'synth-maker-b', model: 'synth-wet' }) });
  expect(real.status).toBe(400);
  override = ({ method, url }) => method === 'POST' && url.startsWith('/api/import/equipment')
    ? new Response(JSON.stringify(real.body), { status: real.status }) : undefined;
  const before = await equipmentFiles();
  at('/fleet/new');
  render(<App />);
  await fill(FIXTURE_VALUES);
  submit();
  const input = await waitFor(() => screen.getByRole('textbox', { name: '설비 ID', description: /영문자나 숫자로 시작/ }));
  expect(input.getAttribute('aria-invalid')).toBe('true');
  await waitFor(() => expect(document.activeElement).toBe(input));
  expect(window.location.pathname).toBe('/fleet/new');
  expect(await equipmentFiles()).toEqual(before);
});

it('shows one form-level alert and no field error when the server cannot be reached', async () => {
  override = ({ method }) => { if (method === 'POST') throw new TypeError('network down'); return undefined; };
  at('/fleet/new');
  render(<App />);
  await fill(FIXTURE_VALUES);
  submit();
  await waitFor(() => expect(main().getByRole('alert').textContent).toContain('등록하지 못했습니다'));
  expect(main().getByRole('alert').textContent).toContain('서버에 연결할 수 없습니다');
  for (const name of ['설비 ID', 'Maker', 'Model']) expect(screen.getByRole('textbox', { name }).getAttribute('aria-invalid')).toBeNull();
});

it('clears a field error when that field changes', async () => {
  at('/fleet/new');
  render(<App />);
  await fill({ ...FIXTURE_VALUES, equipmentId: '' });
  submit();
  await waitFor(() => expect(screen.getByRole('textbox', { name: '설비 ID' }).getAttribute('aria-invalid')).toBe('true'));
  fireEvent.change(screen.getByRole('textbox', { name: '설비 ID' }), { target: { value: 'eq-synth-03' } });
  expect(screen.getByRole('textbox', { name: '설비 ID' }).getAttribute('aria-invalid')).toBeNull();
});

it.each<[string, boolean, string]>([
  ['a data root inside the repository', true, '저장소 밖 경로를 EQV_STUDIO_ASSETS로 지정하세요'],
  ['no repository root', false, 'repository root unknown'],
])('disables registration with the reason for %s', async (_, insideRepo, reason) => {
  serve(insideRepo ? { repoRoot: base } : {});
  at('/fleet');
  const fleet = render(<App />);
  await loaded();
  await waitFor(() => expect(screen.getByRole('button', { name: '설비 등록', description: new RegExp(reason) })).toBeTruthy());
  expect((screen.getByRole('button', { name: '설비 등록' }) as HTMLButtonElement).disabled).toBe(true);
  fleet.unmount();

  at('/fleet/new');
  const form = render(<App />);
  await waitFor(() => expect(screen.getByRole('button', { name: '등록', description: new RegExp(reason) })).toBeTruthy());
  expect((screen.getByRole('button', { name: '등록' }) as HTMLButtonElement).disabled).toBe(true);
  form.unmount();

  at('/equipment/eq-synth-01');
  render(<App />);
  await screen.findByText('가져오기를 쓸 수 없습니다');
  await waitFor(() => expect(screen.getByText('설비 ID', { exact: true }).nextElementSibling?.textContent).toBe('eq-synth-01'));
});

it('warns when the data root is inside a git work tree', async () => {
  await mkdir(join(base, '.git'));
  at('/equipment/eq-synth-01');
  render(<App />);
  await screen.findByText('데이터 루트가 git 작업 트리 안에 있습니다');
});

it('says when the bundled Template catalog is used', async () => {
  await rm(join(root, 'templates'), { recursive: true });
  at('/equipment/eq-synth-01');
  render(<App />);
  await screen.findByText('번들 Template 카탈로그를 씁니다');
});

it('lists every Sample Window with its counts, hash and links, and the alias and dictionary counts', async () => {
  const { w1, w2 } = await addSynth03(root, { metadata: true, dictionary: true });
  const [b1, b2] = [await importFixture('eq-synth-03.w1.batch.json'), await importFixture('eq-synth-03.w2.batch.json')];
  at('/equipment/eq-synth-03');
  render(<App />);
  await screen.findByText('2개');
  const cells = (batch: Record<string, unknown>) =>
    Array.from(screen.getByRole('rowheader', { name: rangeOf(batch) }).closest('tr')!.querySelectorAll('td'), (cell) => cell.textContent);
  expect(cells(b1).slice(0, 5)).toEqual(['site-synth', 'g1', '11', '2', w1.slice(0, 12)]);
  expect(cells(b2).slice(0, 5)).toEqual(['site-synth', 'g1', '10', '0', w2.slice(0, 12)]);
  expect(w1.startsWith('e4105058c692')).toBe(true);
  expect(screen.getByRole('link', { name: `${rangeOf(b1)} Onboarding 열기` }).getAttribute('href')).toBe(`/onboarding/eq-synth-03?window=${w1}`);
  expect(screen.getByRole('link', { name: `${rangeOf(b1)} Focus 열기` }).getAttribute('href')).toBe(`/focus/eq-synth-03?window=${w1}`);
  expect(screen.getByRole('link', { name: `${rangeOf(b2)} Onboarding 열기` }).getAttribute('href')).toBe(`/onboarding/eq-synth-03?window=${w2}`);
  expect(screen.getByText('Alias metadata', { exact: true, selector: 'span' }).nextElementSibling?.textContent).toBe('alias 12개');
  expect(screen.getByText('Type Dictionary (Model 범위)', { exact: true }).nextElementSibling?.textContent).toBe('ModuleType 6개');
});

it('shows absent, wrong-scope and per-window file problems without hiding the rest', async () => {
  await addSynth03(root, { windows: false });
  at('/equipment/eq-synth-03');
  const absent = render(<App />);
  await screen.findByText('Sample Window가 없습니다');
  expect(screen.getAllByText('없음')).toHaveLength(2);
  screen.getByText('ModuleType·Port·Robot 정보 없이 Inventory를 만듭니다');
  screen.getByText('모든 Role이 unknown이 되어 Template 제안이 맞지 않습니다');
  absent.unmount();

  const dictionary = await importFixture('synth-maker-b.synth-wet.type-dictionary.json');
  await writeJson(root, 'onboarding/scopes/model/synth-maker-b/synth-wet/type-dictionary.json',
    { ...dictionary, scope: { level: 'model', maker: 'synth-maker-b', model: 'other-model' } });
  const [b1, b2] = [await importFixture('eq-synth-03.w1.batch.json'), await importFixture('eq-synth-03.w2.batch.json')];
  await addWindow(root, 'eq-synth-03', b1);
  await writeJson(root, `observations/eq-synth-03/windows/${await sampleWindowName(b2 as Parameters<typeof sampleWindowName>[0])}.batch.json`, b1);
  render(<App />);
  await screen.findByText('2개');
  expect(within(screen.getByRole('region', { name: '설비' })).getByText('오류')).toBeTruthy();
  const bad = screen.getByRole('rowheader', { name: rangeOf(b2) }).closest('tr')!;
  expect(within(bad).getByText('오류')).toBeTruthy();
  expect(bad.textContent).toContain('파일 이름이 내용과 다릅니다');
  expect(within(screen.getByRole('rowheader', { name: rangeOf(b1) }).closest('tr')!).queryByText('오류')).toBeNull();
});

it('shows a list error instead of rows when the windows folder holds a stray file', async () => {
  await addSynth03(root, { windows: false });
  await writeJson(root, 'observations/eq-synth-03/windows/notes.json', {});
  at('/equipment/eq-synth-03');
  render(<App />);
  await screen.findByText('Sample Window 목록을 읽을 수 없습니다');
  expect(screen.getByText('설비 ID', { exact: true }).nextElementSibling?.textContent).toBe('eq-synth-03');
});

it('says so for an unknown equipment id', async () => {
  at('/equipment/eq-unknown');
  render(<App />);
  await screen.findByText('설비를 찾을 수 없습니다');
  expect(main().getByRole('link', { name: 'Fleet으로 이동' })).toBeTruthy();
});

it('opens the Sample Window a link names, never falls back from an unknown one, and links back to the data page', async () => {
  const { w1 } = await addSynth03(root);
  const [b1, b2] = [await importFixture('eq-synth-03.w1.batch.json'), await importFixture('eq-synth-03.w2.batch.json')];
  at(`/onboarding/eq-synth-03?window=${w1}`);
  const first = render(<App />);
  await screen.findByText(`표본 기간: ${rangeOf(b1)}`);
  expect(screen.getByRole('link', { name: '설비 데이터' }).getAttribute('href')).toBe('/equipment/eq-synth-03');
  first.unmount();

  at('/onboarding/eq-synth-03');
  const second = render(<App />);
  await screen.findByText(`표본 기간: ${rangeOf(b2)}`);
  second.unmount();

  at(`/onboarding/eq-synth-03?window=${'f'.repeat(64)}`);
  render(<App />);
  await waitFor(() => expect(main().getByRole('alert').textContent).toMatch(/데이터 오류.*Sample Window/));
});
