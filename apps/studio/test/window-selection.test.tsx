// @vitest-environment jsdom
import { readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { millisToWallClock, occurrenceBatchSchema, replayTimelineFrame, wallClockToMillis, type OccurrenceBatch } from '@eqv/core';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
import { FocusPage } from '../src/FocusPage.js';
import { timelineCost } from '../src/focus-data.js';
import { createFileApi } from '../server/files.js';
import { addSynth03, addWindow, importFixture, record, seedOnboardingRoot, windowHex as hexOf, writeDraft, writeJson } from './seed.js';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let base: string;
let root: string;
let w1: string;
let w2: string;
const W1_RANGE = '2026-01-01T10:00:00.000 – 2026-01-01T10:30:00.000';
const W2_RANGE = '2026-01-01T10:30:00.000 – 2026-01-01T11:00:00.000';

// jsdom 30 has no scrollIntoView; Radix Select calls it on open.
const scrollIntoView = Element.prototype.scrollIntoView;
beforeAll(() => { Element.prototype.scrollIntoView ??= function scrollIntoViewStub() {}; });
afterAll(() => { Element.prototype.scrollIntoView = scrollIntoView; });

beforeEach(async () => {
  ({ base, root } = await seedOnboardingRoot());
  ({ w1, w2 } = await addSynth03(root, { metadata: true, dictionary: true }));
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
const trigger = () => screen.getByRole('combobox', { name: '사용할 window' });
const row = (id: string) => document.querySelector(`tr[data-occurrence-id="${id}"]`);
const aliasRows = () => within(screen.getByRole('table', { name: 'Alias 목록' }));

/** Keyboard path: focus the trigger, Enter opens, Enter on the option selects. */
async function choose(range: string) {
  const control = trigger();
  control.focus();
  fireEvent.keyDown(control, { key: 'Enter' });
  const option = await screen.findByRole('option', { name: range });
  fireEvent.keyDown(option, { key: 'Enter' });
}

it('Onboarding: the picker switches the window, keeps focus on the trigger and survives a reload', async () => {
  at(`/onboarding/eq-synth-03?window=${w1}`);
  render(<App />);
  await loaded();
  await screen.findByRole('combobox', { name: '사용할 window' });
  expect(trigger().textContent).toContain(W1_RANGE);
  expect(aliasRows().queryByRole('rowheader', { name: 'WC4' })).toBeNull();

  await choose(W2_RANGE);
  await waitFor(() => expect(window.location.search).toBe(`?window=${w2}`));
  await waitFor(() => expect(screen.getByText('표본 기간: 2026-01-01T10:30:00.000 – 2026-01-01T11:00:00.000')).toBeTruthy());
  expect(aliasRows().getByRole('rowheader', { name: 'WC4' })).toBeTruthy();
  expect(document.activeElement).toBe(trigger());
  const details = within(screen.getByRole('heading', { name: 'Sample Window' }).closest('section')!);
  expect(details.getByText('g1')).toBeTruthy();
  expect(details.getByText(w2.slice(0, 12))).toBeTruthy();

  cleanup();
  render(<App />);
  await loaded();
  await waitFor(() => expect(aliasRows().getByRole('rowheader', { name: 'WC4' })).toBeTruthy());
  expect(trigger().textContent).toContain(W2_RANGE);
});

describe('picker presence', () => {
  it.each([
    ['one window', 'eq-synth-01', 1],
    ['no windows', 'eq-nodata', 0],
    ['unknown equipment', 'eq-missing', 0],
  ] as const)('%s', async (_name, id, options) => {
    if (id === 'eq-nodata') await writeJson(root, 'equipment/eq-nodata.json', record('eq-nodata'));
    at(`/onboarding/${id}`);
    render(<App />);
    await loaded();
    if (options === 0) {
      expect(screen.queryByRole('combobox')).toBeNull();
      if (id === 'eq-nodata') screen.getByText('Sample Window를 가져오세요');
      return;
    }
    const control = await screen.findByRole('combobox', { name: '사용할 window' });
    control.focus();
    fireEvent.keyDown(control, { key: 'Enter' });
    expect(await screen.findAllByRole('option')).toHaveLength(options);
  });
});

it('Onboarding: an unknown window stays the loader error and the picker recovers from it', async () => {
  at(`/onboarding/eq-synth-03?window=${'f'.repeat(64)}`);
  render(<App />);
  await loaded();
  expect((await screen.findByRole('alert')).textContent).toContain('데이터 오류');
  await screen.findByRole('combobox', { name: '사용할 window' });
  expect(trigger().textContent).not.toContain('2026-01-01');
  await choose(W1_RANGE);
  await waitFor(() => expect(screen.getByText(/^표본 기간: 2026-01-01T10:00:00\.000/)).toBeTruthy());
  expect(window.location.search).toBe(`?window=${w1}`);
});

describe('links carry the window', () => {
  it('Onboarding → Board → Onboarding with a draft', async () => {
    await writeDraft(root, 'eq-synth-03-layout');
    at(`/onboarding/eq-synth-03?window=${w1}`);
    render(<App />);
    await loaded();
    const link = await screen.findByRole('link', { name: '④ Mapping Board 열기' });
    expect(link.getAttribute('href')).toBe(`/onboarding/eq-synth-03/board?window=${w1}`);

    cleanup();
    at(`/onboarding/eq-synth-03/board?window=${w1}`);
    render(<App />);
    await loaded();
    await screen.findByRole('heading', { name: '④ Mapping Board' });
    expect(screen.getByText('Sample Window 2026-01-01T10:00:00.000 – 2026-01-01T10:30:00.000', { exact: true })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Onboarding으로 이동' }).getAttribute('href')).toBe(`/onboarding/eq-synth-03?window=${w1}`);
  });

  it('starting from the Generic Layout lands on the Board of the same window', async () => {
    at(`/onboarding/eq-synth-03?window=${w1}`);
    render(<App />);
    await loaded();
    fireEvent.click(await screen.findByRole('button', { name: 'Generic Layout으로 시작' }));
    await waitFor(() => expect(window.location.pathname + window.location.search).toBe(`/onboarding/eq-synth-03/board?window=${w1}`));
  });

  it('the Model dry-run links the current equipment on its window and a sibling on its own default', async () => {
    await writeDraft(root, 'eq-synth-03-layout');
    await writeJson(root, 'equipment/eq-synth-04.json', { ...(await importFixture('eq-synth-03.equipment.json')), equipmentId: 'eq-synth-04' });
    const sibling = { ...(await importFixture('eq-synth-03.w2.batch.json')), equipmentId: 'eq-synth-04' };
    await addWindow(root, 'eq-synth-04', sibling);
    at(`/onboarding/eq-synth-03/board?window=${w1}`);
    render(<App />);
    await loaded();
    await screen.findByRole('heading', { name: '④ Mapping Board' });
    fireEvent.click(await screen.findByRole('button', { name: '같은 Model 일괄 dry-run 실행' }));
    const table = await screen.findByRole('table', { name: /synth-maker-b\/synth-wet 설비 2대/ });
    expect(within(table).getByRole('link', { name: 'eq-synth-03' }).getAttribute('href')).toBe(`/onboarding/eq-synth-03/board?window=${w1}`);
    expect(within(table).getByRole('link', { name: 'eq-synth-04' }).getAttribute('href')).toBe('/onboarding/eq-synth-04/board');
  });
});

it.each([['w1', () => w1, W1_RANGE], ['w2', () => w2, W2_RANGE]] as const)('Publish writes the Baseline Inventory of the chosen window (%s)', async (_name, hex, range) => {
  await writeDraft(root, 'eq-synth-03-layout');
  const [from, to] = range.split(' – ');
  at(`/onboarding/eq-synth-03/board?window=${hex()}`);
  render(<App />);
  await loaded();
  await screen.findByRole('heading', { name: '④ Mapping Board' });
  await screen.findByText(`Baseline Inventory: ${from} – ${to}`);
  const publish = () => screen.getByRole('button', { name: '게시' });
  await waitFor(() => expect(publish().getAttribute('aria-disabled')).toBe('false'));
  fireEvent.click(publish());
  const bindingsPath = join(root, 'onboarding/bindings/eq-synth-03.bindings.json');
  await waitFor(async () => expect(await readFile(bindingsPath, 'utf8')).toContain('effectiveFrom'));
  const bindings = JSON.parse(await readFile(bindingsPath, 'utf8'));
  expect(bindings.bindings.at(-1).effectiveFrom).toBe(from);
  const dir = join(root, 'onboarding/baselines/eq-synth-03');
  const [file] = await readdir(dir);
  const baseline = JSON.parse(await readFile(join(dir, file!), 'utf8'));
  expect([baseline.from, baseline.to]).toEqual([from, to]);
});

describe('Focus anchor wiring', () => {
  const ENTRY = (anchor: string) => `/focus/eq-synth-03?entityType=occurrence&anchor=${anchor}`;

  it('replays the latest window containing the anchor, with a notice when several do', async () => {
    at(ENTRY('occ-carrier-window-boundary'));
    render(<App />);
    await loaded();
    await waitFor(() => expect(row('occ-w2-wc4-transfer')).not.toBeNull());
    expect(screen.getByText(/Sample Window 2개에 있어/).getAttribute('role')).toBe('status');
    expect(trigger().textContent).toContain(W2_RANGE);
  });

  it('replays the only window containing the anchor and then follows a picked window', async () => {
    at(ENTRY('occ-w1-wc1-inverted'));
    render(<App />);
    await loaded();
    await waitFor(() => expect(row('occ-w1-wc1-inverted')).not.toBeNull());
    expect(screen.queryByText(/Sample Window 2개에 있어/)).toBeNull();
    expect(trigger().textContent).toContain(W1_RANGE);
    expect(screen.getByDisplayValue('2026-01-01T10:21:00.000')).toBeTruthy();
    expect(screen.getByDisplayValue('2026-01-01T10:25:00.000')).toBeTruthy();

    await choose(W2_RANGE);
    await waitFor(() => expect(row('occ-w2-wc4-transfer')).not.toBeNull());
    const search = new URLSearchParams(window.location.search);
    expect([search.get('anchor'), search.get('window')]).toEqual(['occ-w1-wc1-inverted', w2]);
    expect(document.querySelector('tr[aria-selected="true"]')).toBeNull();
  });
});

it('Focus: an equipment without observations is a state with a link to its data page', async () => {
  await writeJson(root, 'equipment/eq-nodata.json', record('eq-nodata'));
  at('/focus/eq-nodata');
  render(<App />);
  await loaded();
  expect((await screen.findByText('Sample Window를 가져오세요')).closest('[role="status"]')).not.toBeNull();
  expect(screen.getByRole('link', { name: '설비 데이터 열기' }).getAttribute('href')).toBe('/equipment/eq-nodata');
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.queryByRole('combobox')).toBeNull();
});

describe('large-window guard', () => {
  const GUARD = '구간이 커서 Gantt를 그리지 않습니다';
  let batch: OccurrenceBatch;
  let cost: number;
  const emptyInput = (b: OccurrenceBatch) => ({ batch: b, layouts: [], bindings: { schemaVersion: '0.4' as const, equipmentId: b.equipmentId, bindings: [] }, mappings: [] });
  beforeEach(async () => {
    batch = occurrenceBatchSchema.parse(await importFixture('eq-synth-03.w1.batch.json'));
    cost = timelineCost(emptyInput(batch), replayTimelineFrame(emptyInput(batch), { from: batch.from, to: batch.to })).cost;
  });
  const gantt = () => screen.queryByRole('group', { name: 'Component lane Gantt' });
  const page = (budget?: number, id = 'eq-synth-03', window: string | null = w1, spanLimit?: number) =>
    render(<FocusPage equipmentId={id} sampleWindow={window} entityType={null} anchor={null}
      {...(budget === undefined ? {} : { timelineBudget: budget })} {...(spanLimit === undefined ? {} : { ganttSpanLimit: spanLimit })} />);

  it('over budget: Gantt replaced by a notice, everything else stays, a narrower range brings the Gantt back', async () => {
    page(cost - 1);
    await screen.findByText(GUARD);
    expect(gantt()).toBeNull();
    screen.getByRole('region', { name: 'Top View' });
    screen.getByRole('region', { name: '커서 시점 상태' });
    expect(row('occ-w1-wc2-forced')).not.toBeNull();
    expect((screen.getByRole('button', { name: '다음 단계' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Data Quality' }), { button: 0 });
    fireEvent.click(screen.getByRole('tab', { name: 'Data Quality' }));
    await screen.findByText('dqi-w1-unmatched-end');

    const narrow = { from: '2026-01-01T10:00:00.000' as const, to: '2026-01-01T10:05:00.000' as const };
    expect(timelineCost(emptyInput(batch), replayTimelineFrame(emptyInput(batch), narrow)).cost).toBeLessThanOrEqual(cost - 1);
    const [from, to] = screen.getAllByRole('textbox') as HTMLInputElement[];
    fireEvent.change(from!, { target: { value: narrow.from } });
    fireEvent.change(to!, { target: { value: narrow.to } });
    fireEvent.click(screen.getByRole('button', { name: '적용' }));
    await waitFor(() => expect(gantt()).not.toBeNull());
    expect(screen.queryByText(GUARD)).toBeNull();
  });

  it('over the span limit: Gantt replaced by a notice naming spans and limit, a narrower range brings the Gantt back', async () => {
    const limit = 3;
    page(undefined, 'eq-synth-03', w1, limit);
    await screen.findByText(GUARD);
    expect(gantt()).toBeNull();
    expect(screen.getByText(/Gantt 막대는 \d+개로 그리기 한도 3개를 넘습니다/)).not.toBeNull();
    screen.getByRole('region', { name: 'Top View' });
    const narrow = { from: '2026-01-01T10:00:00.000', to: '2026-01-01T10:00:30.000' };
    const [from, to] = screen.getAllByRole('textbox') as HTMLInputElement[];
    fireEvent.change(from!, { target: { value: narrow.from } });
    fireEvent.change(to!, { target: { value: narrow.to } });
    fireEvent.click(screen.getByRole('button', { name: '적용' }));
    await waitFor(() => expect(gantt()).not.toBeNull());
    expect(screen.queryByText(GUARD)).toBeNull();
  });

  it.each([
    ['exactly the budget', 'cost', 'eq-synth-03'],
    ['the default budget on w1', 'default', 'eq-synth-03'],
    ['the default budget on eq-synth-01', 'default', 'eq-synth-01'],
  ] as const)('%s: Gantt and no notice', async (_name, budget, id) => {
    await writeDraft(root, 'eq-synth-01-layout');
    page(budget === 'cost' ? cost : undefined, id, id === 'eq-synth-03' ? w1 : null);
    await waitFor(() => expect(gantt()).not.toBeNull());
    expect(screen.queryByText(GUARD)).toBeNull();
  });

  // jsdom has no layout: the virtual list would see a 0-size region and render no row. These two tests mock offsetHeight (region 480, rows 32) and offsetWidth.
  const mockLayout = () => {
    const height = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) { return this.getAttribute('role') === 'region' ? 480 : 32; });
    const width = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800);
    return () => { height.mockRestore(); width.mockRestore(); };
  };

  it('a 2,000-Occurrence window renders a bounded list window and no cap notice', async () => {
    const restoreLayout = mockLayout();
    const t0 = wallClockToMillis(batch.from);
    const occurrences = Array.from({ length: 2000 }, (_, i) => ({
      id: `occ-gen-${i}`, equipmentId: batch.equipmentId, kind: 'PROCESS' as const,
      start: { at: millisToWallClock(t0 + 500 * i), seq: 2 * i + 1, evidence: 'observed' as const },
      end: { at: millisToWallClock(t0 + 500 * i + 100), seq: 2 * i + 2, evidence: 'observed' as const },
      location: { moduleAlias: 'WC2' }, synthetic: false, source: { parserContractVersion: 'synthetic-1', dataGeneration: 'g1' },
    }));
    const big = occurrenceBatchSchema.parse({ ...batch, occurrences, issues: [], watermark: { seq: 4001, at: batch.to } });
    await rm(join(root, 'observations/eq-synth-03/windows'), { recursive: true, force: true });
    await addWindow(root, 'eq-synth-03', big);
    page(undefined, 'eq-synth-03', await hexOf(big));
    try {
      await waitFor(() => expect(document.querySelectorAll('tr[data-occurrence-id]').length).toBeGreaterThan(0));
      expect(document.querySelectorAll('tr[data-occurrence-id]').length).toBeLessThan(60);
      expect(screen.queryByText(/개를 표시합니다/)).toBeNull();
    } finally { restoreLayout(); }
  });

  it('an untimed anchor Occurrence in a 2,000-Occurrence window is rendered by the initial scroll', async () => {
    const restoreLayout = mockLayout();
        const occurrences = Array.from({ length: 2000 }, (_, i) => ({
      id: `occ-gen-${i}`, equipmentId: batch.equipmentId, kind: 'PROCESS' as const,
      start: { at: null, seq: i + 1, evidence: 'unknown' as const },
      end: null,
      location: { moduleAlias: 'WC2' }, synthetic: false, source: { parserContractVersion: 'synthetic-1', dataGeneration: 'g1' },
    }));
    const big = occurrenceBatchSchema.parse({ ...batch, occurrences, issues: [], watermark: { seq: 2001, at: batch.to } });
    await rm(join(root, 'observations/eq-synth-03/windows'), { recursive: true, force: true });
    await addWindow(root, 'eq-synth-03', big);
    render(<FocusPage equipmentId="eq-synth-03" sampleWindow={await hexOf(big)} entityType="occurrence" anchor="occ-gen-1000" />);
    try {
      await waitFor(() => expect(row('occ-gen-1000')).not.toBeNull());
      expect(document.querySelectorAll('tr[data-occurrence-id]').length).toBeLessThan(60);
    } finally { restoreLayout(); }
  });
});
