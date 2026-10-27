import { act, cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ApiResponse } from '@ap/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { eqvScreens } from '../src/index.js';
import { createFakeHost, deferred, ok, response, type FakeHostOptions, type QueryCall } from './fake-host.js';
import { bindings, contextData, EQUIPMENT, HOST_TIME, layout, mappings, pages } from './replay-fixture.js';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// Radix-based @ap/ui controls render slowly under full-suite load (#88).
configure({ asyncUtilTimeout: 5000 });
afterEach(cleanup);

const CONTEXT_ID = 'eqv.topview-context';
const EVENTS_ID = 'eqv.topview-events';
const SCREENS = [['topview', eqvScreens.topview], ['focus', eqvScreens.focus]] as const;

/** A healthy server: the context, then the events in two pages. */
const server = (overrides: { context?: ApiResponse<unknown>; events?: (token: string | undefined) => ApiResponse<unknown> } = {}) => async ({ id, params }: QueryCall) => {
  if (id === CONTEXT_ID) return overrides.context ?? ok(contextData());
  const token = (params as { continuationToken?: string }).continuationToken;
  const [first, second] = pages();
  return overrides.events?.(token) ?? (token === undefined ? ok(first) : ok(second));
};
const hostFor = (options: Partial<FakeHostOptions> = {}) => createFakeHost({
  page: { equipment: EQUIPMENT }, context: HOST_TIME, query: server(), ...options,
});
const row = (id: string) => document.querySelector(`tr[data-occurrence-id="${id}"]`);
const loaded = () => waitFor(() => expect(screen.queryByText('불러오는 중…')).toBeNull());

describe('queries', () => {
  it('asks only the two declared endpoints, with the screen signal, and follows continuation pages in server order', async () => {
    const fake = hostFor();
    const Screen = eqvScreens.focus;
    render(<Screen host={fake.host} params={{}} />);
    await waitFor(() => expect(row('occ-open')).not.toBeNull());
    expect(fake.log.queries.map(({ id, params }) => [id, params])).toEqual([
      [CONTEXT_ID, { equipmentId: EQUIPMENT }],
      [EVENTS_ID, { equipmentId: EQUIPMENT }],
      [EVENTS_ID, { equipmentId: EQUIPMENT, continuationToken: 'p2' }],
    ]);
    // Both pages are in one batch: a row from the first page and one from the last.
    expect(row('occ-carrier')).not.toBeNull();
    act(() => fake.abortScreen());
    expect(fake.log.queries.every(({ signal }) => signal?.aborted)).toBe(true);
  });
});

describe('states that need the user', () => {
  it.each(SCREENS)('%s: an unsupported time is shown as not applied and nothing is queried', async (_name, Screen) => {
    const fake = hostFor({ unsupported: ['time'] });
    render(<Screen host={fake.host} params={{}} />);
    screen.getByText('이 화면에는 시간 구간이 적용되지 않습니다');
    expect(fake.log.queries).toEqual([]);
  });

  it.each(SCREENS)('%s: no equipment asks for one and queries nothing', async (_name, Screen) => {
    const fake = hostFor({ page: {} });
    render(<Screen host={fake.host} params={{}} />);
    screen.getByText('설비를 고르세요');
    expect(fake.log.queries).toEqual([]);
  });

  it.each(SCREENS)('%s: no applied time asks for one and queries nothing', async (_name, Screen) => {
    const fake = hostFor({ context: { from: HOST_TIME.from, to: null } });
    render(<Screen host={fake.host} params={{}} />);
    screen.getByText('시간 구간을 고르세요');
    expect(fake.log.queries).toEqual([]);
  });
});

describe('load races', () => {
  it.each(SCREENS)('%s: a new equipment aborts the in-flight load and its late response is not shown', async (_name, Screen) => {
    const late = deferred<ApiResponse<unknown>>();
    const fake = hostFor({
      query: async (call) => {
        if (call.id === CONTEXT_ID && (call.params as { equipmentId: string }).equipmentId === 'eq-slow') return await late.promise;
        return await server()(call);
      },
    });
    fake.setPage({ equipment: 'eq-slow' });
    render(<Screen host={fake.host} params={{}} />);
    await waitFor(() => expect(fake.log.queries).toHaveLength(1));
    const first = fake.log.queries[0]!;
    fake.setPage({ equipment: EQUIPMENT });
    await waitFor(() => expect(first.signal?.aborted).toBe(true));
    await loaded();
    await act(async () => { late.resolve(response('error', null, { message: 'stale frame' })); await late.promise; });
    expect(screen.queryByText(/stale frame/)).toBeNull();
    expect(fake.log.errors).toEqual([]);
  });
});

describe('request generations', () => {
  it.each(SCREENS)('%s: restoring an earlier equipment waits for a new response instead of reviving the old result', async (_name, Screen) => {
    const late = deferred<ApiResponse<unknown>>();
    let calls = 0;
    const fake = hostFor({
      detailSlot: true,
      query: async (call) => {
        if (call.id === CONTEXT_ID && ++calls === 2) return await late.promise;
        return await server()(call);
      },
    });
    render(<Screen host={fake.host} params={{}} />);
    await waitFor(() => expect(document.querySelector('tr[data-occurrence-id], [data-layer="replay"]')).not.toBeNull());
    fake.setPage({ equipment: null });
    await screen.findByText('설비를 고르세요');
    fake.setPage({ equipment: EQUIPMENT });
    await waitFor(() => expect(calls).toBe(2));
    screen.getByText('불러오는 중…');
    expect(document.querySelector('tr[data-occurrence-id], [data-layer="replay"]')).toBeNull();
    await act(async () => { late.resolve(ok(contextData())); await late.promise; });
    await waitFor(() => expect(document.querySelector('tr[data-occurrence-id], [data-layer="replay"]')).not.toBeNull());
  });

  it.each(SCREENS)('%s: A → B → A with B unsettled does not show the first A result', async (_name, Screen) => {
    const slowB = deferred<ApiResponse<unknown>>();
    let aCalls = 0;
    const fake = hostFor({
      query: async (call) => {
        const equipmentId = (call.params as { equipmentId: string }).equipmentId;
        if (call.id === CONTEXT_ID && equipmentId === 'eq-b') return await slowB.promise;
        if (call.id === CONTEXT_ID && ++aCalls === 2) return await new Promise<never>(() => undefined);
        return await server()(call);
      },
    });
    render(<Screen host={fake.host} params={{}} />);
    await waitFor(() => expect(document.querySelector('tr[data-occurrence-id], [data-layer="replay"]')).not.toBeNull());
    fake.setPage({ equipment: 'eq-b' });
    await screen.findByText('불러오는 중…');
    fake.setPage({ equipment: EQUIPMENT });
    await waitFor(() => expect(aCalls).toBe(2));
    screen.getByText('불러오는 중…');
    expect(document.querySelector('tr[data-occurrence-id], [data-layer="replay"]')).toBeNull();
  });
});

describe('outcomes', () => {
  const failing = (outcome: ApiResponse<unknown>['outcome']) => hostFor({ query: server({ context: response(outcome, null, { message: `${outcome}-text` }) }) });

  it.each([
    ['error', '불러오지 못했습니다', /error-text/],
    ['timeout', '응답 시간 초과', /서버가 제때 응답하지 않았습니다/],
    ['too_large', '구간이 너무 큽니다', /최대 8시간까지.*기간을 8시간 이하로 줄이세요/],
  ] as const)(
    '%s is a screen-local state with the message and the reportError id, and no status call', async (outcome, title, message) => {
      const fake = failing(outcome);
      const Screen = eqvScreens.topview;
      render(<Screen host={fake.host} params={{}} />);
      await screen.findByText(title);
      screen.getByText(message);
      if (outcome !== 'error') expect(screen.queryByText(new RegExp(`${outcome}-text`))).toBeNull();
      screen.getByText('오류 ID err-1');
      expect(fake.log.statuses).toEqual([]);
    });

  it('empty shows the empty state and makes no status call', async () => {
    const fake = hostFor({ query: server({ context: response('empty', null) }) });
    const Screen = eqvScreens.topview;
    render(<Screen host={fake.host} params={{}} />);
    await screen.findByText('이 구간에 표시할 Occurrence가 없습니다');
    expect(fake.log.statuses).toEqual([]);
  });

  it('forbidden sets auth_required; the next load of an equipment the server answers returns to ready and shows the data', async () => {
    const fake = hostFor({
      page: { equipment: 'eq-denied' },
      query: async (call) => (call.params as { equipmentId: string }).equipmentId === EQUIPMENT ? await server()(call) : response('forbidden', null),
    });
    const Screen = eqvScreens.focus;
    render(<Screen host={fake.host} params={{}} />);
    await waitFor(() => expect(fake.log.statuses).toEqual(['auth_required']));
    fake.setPage({ equipment: EQUIPMENT });
    await waitFor(() => expect(row('occ-open')).not.toBeNull());
    expect(fake.log.statuses).toEqual(['auth_required', 'ready']);
    expect(screen.queryByText('데이터 오류')).toBeNull();
  });

  it('forbidden → a local error on the next equipment also returns the host to ready', async () => {
    let allowed = false;
    const fake = hostFor({ query: async () => allowed ? response('error', null, { message: 'local' }) : response('forbidden', null) });
    const Screen = eqvScreens.topview;
    render(<Screen host={fake.host} params={{}} />);
    await waitFor(() => expect(fake.log.statuses).toEqual(['auth_required']));
    allowed = true;
    fake.setPage({ equipment: 'eq-synth-02' });
    await waitFor(() => expect(fake.log.statuses).toEqual(['auth_required', 'ready']));
    await screen.findByText('불러오지 못했습니다');
  });

  it('non-clear assessments become notices; unknown is not worded as clear', async () => {
    const fake = hostFor({ query: server({ events: (token) => ok(token === undefined ? pages()[0] : pages()[1], token === undefined ? [{ kind: 'coverage', state: 'unknown', reason: 'check_failed' }, { kind: 'collection', state: 'clear' }] : []) }) });
    const Screen = eqvScreens.focus;
    render(<Screen host={fake.host} params={{}} />);
    await screen.findByText('범위: 확인하지 못했습니다 (점검 실패) — 이상 없음이 아닙니다');
    expect(screen.queryByText(/수집/)).toBeNull();
  });

  it.each(SCREENS)('%s: a tampered Mapping Version is an error state, not a partial replay', async (_name, Screen) => {
    const tampered = { ...mappings[0]!, entries: mappings[0]!.entries.slice(0, -1) };
    const fake = hostFor({ query: server({ context: ok({ ...contextData(), mappings: [tampered, mappings[1]!] }) }) });
    render(<Screen host={fake.host} params={{}} />);
    await screen.findByText('데이터 오류');
    screen.getByText(/내용 hash가 맞지 않습니다/);
    expect(document.querySelector('tr[data-occurrence-id]')).toBeNull();
  });

  it.each(SCREENS)('%s: two Bindings sharing a Mapping hash but naming different valid Layouts are a data error', async (_name, Screen) => {
    const [first] = bindings.bindings;
    const other = { ...layout, id: 'eq-synth-01-layout-b' };
    const twin = { ...bindings, bindings: [first!, { ...first!, layoutId: other.id, effectiveFrom: '2026-01-01T10:04:30.000' }] };
    const fake = hostFor({ query: server({ context: ok({ layouts: [layout, other], bindings: twin, mappings }) }) });
    render(<Screen host={fake.host} params={{}} />);
    await screen.findByText('데이터 오류');
    screen.getByText(/layoutId/);
    expect(document.querySelector('tr[data-occurrence-id]')).toBeNull();
  });

});

describe('Focus detail', () => {
  it('with detailSlot, selecting an Occurrence shows its evidence in the host slot and a reset clears it; there is no inline tab', async () => {
    const fake = hostFor({ detailSlot: true });
    const Screen = eqvScreens.focus;
    render(<Screen host={fake.host} params={{}} />);
    await waitFor(() => expect(row('occ-pm1-process')).not.toBeNull());
    expect(screen.queryByRole('tab', { name: '근거 상세' })).toBeNull();
    fireEvent.click(row('occ-pm1-process')!);
    await waitFor(() => expect(fake.log.shown.at(-1)?.label).toBe('근거 상세 · occ-pm1-process'));
    const cleared = fake.log.cleared;
    fake.setPage({ equipment: 'eq-synth-02' });
    await waitFor(() => expect(fake.log.cleared).toBeGreaterThan(cleared));
  });

  it('without detailSlot the 근거 상세 tab is inline', async () => {
    const fake = hostFor();
    const Screen = eqvScreens.focus;
    render(<Screen host={fake.host} params={{}} />);
    await waitFor(() => expect(row('occ-pm1-process')).not.toBeNull());
    fireEvent.click(row('occ-pm1-process')!);
    fireEvent.mouseDown(screen.getByRole('tab', { name: '근거 상세' }));
    await screen.findByRole('region', { name: '근거 상세 occ-pm1-process' });
  });

  it('Top View로 navigates to the topview screen with the equipment', async () => {
    const fake = hostFor();
    const Screen = eqvScreens.focus;
    render(<Screen host={fake.host} params={{}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Top View로' }));
    expect(fake.log.navigations).toEqual([{ screen: 'topview', page: { equipment: EQUIPMENT } }]);
  });
});

describe('Top View', () => {
  it('shows the layout with the scene state as of the padded end of the window, and opens Focus', async () => {
    const fake = hostFor();
    const Screen = eqvScreens.topview;
    render(<Screen host={fake.host} params={{}} />);
    await screen.findAllByText('2026-01-01 10:30:00');
    expect(document.querySelector('[data-layer="replay"]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Focus 열기' }));
    expect(fake.log.navigations).toEqual([{ screen: 'focus', page: { equipment: EQUIPMENT, entityType: 'job', anchor: '58' } }]);
  });

  it.each([
    [null, '1'],
    ['pm-b', '19'],
    ['pm-a', '18'],
  ] as const)('Focus 열기 at 10:08:30 with %s selected opens Focus on that Component\'s open Occurrence (its RecordSequence), else the first one open at the cursor', async (id, anchor) => {
    const fake = hostFor({ context: { from: HOST_TIME.from, to: '2026-01-01T10:08:30' } });
    const Screen = eqvScreens.topview;
    render(<Screen host={fake.host} params={{}} />);
    await screen.findByText('Component를 선택하세요');
    if (id !== null) fireEvent.click(document.querySelector(`[data-component-id="${id}"]`)!);
    fireEvent.click(screen.getByRole('button', { name: 'Focus 열기' }));
    expect(fake.log.navigations).toEqual([{ screen: 'focus', page: { equipment: EQUIPMENT, entityType: 'job', anchor } }]);
  });

  it('with detailSlot, selecting a Component shows its detail in the host slot', async () => {
    const fake = hostFor({ detailSlot: true });
    const Screen = eqvScreens.topview;
    render(<Screen host={fake.host} params={{}} />);
    await screen.findAllByText('2026-01-01 10:30:00');
    fireEvent.click(document.querySelector('[data-component-id="pm-a"]')!);
    await waitFor(() => expect(fake.log.shown.at(-1)?.label).toBe('Component · pm-a'));
    expect(screen.queryByRole('region', { name: 'Component 상세' })).toBeNull();
  });

  it('without detailSlot the Component detail is an inline panel', async () => {
    const fake = hostFor();
    const Screen = eqvScreens.topview;
    render(<Screen host={fake.host} params={{}} />);
    await screen.findByText('Component를 선택하세요');
    fireEvent.click(document.querySelector('[data-component-id="pm-a"]')!);
    await screen.findByRole('region', { name: 'Component 상세 pm-a' });
  });
});

describe('Top View Component detail words', () => {
  it.each([
    ['pm-b', /처리 중/],
    ['pm-a', /기록된 활동 없음/],
  ] as const)('%s shows the activity in Korean with its evidence badge', async (id, words) => {
    const fake = hostFor();
    const Screen = eqvScreens.topview;
    render(<Screen host={fake.host} params={{}} />);
    await screen.findByText('Component를 선택하세요');
    fireEvent.click(document.querySelector(`[data-component-id="${id}"]`)!);
    const region = await screen.findByRole('region', { name: `Component 상세 ${id}` });
    expect(region.textContent).toMatch(words);
    expect(region.textContent).not.toMatch(/processing|no recorded activity/);
    expect(region.textContent).toMatch(/활동 근거/);
  });
});

describe('Focus 재생 구간 in the page keys', () => {
  const rangeInputs = () => [screen.getByLabelText('시작'), screen.getByLabelText('끝')] as HTMLInputElement[];

  it('applying a range writes rangeFrom/rangeTo through the host, and a remount reads the range back', async () => {
    const fake = hostFor();
    const Screen = eqvScreens.focus;
    const first = render(<Screen host={fake.host} params={{}} />);
    await screen.findByRole('form', { name: '구간' });
    const [from, to] = rangeInputs();
    fireEvent.change(from!, { target: { value: '2026-01-01T10:05:00.000' } });
    fireEvent.change(to!, { target: { value: '2026-01-01T10:12:00.000' } });
    fireEvent.submit(screen.getByRole('form', { name: '구간' }));
    expect(fake.log.pageWrites).toEqual([{ rangeFrom: '2026-01-01T10:05:00.000', rangeTo: '2026-01-01T10:12:00.000' }]);
    first.unmount();
    render(<Screen host={fake.host} params={{}} />);
    await screen.findByRole('form', { name: '구간' });
    expect(rangeInputs().map((input) => input.value)).toEqual(['2026-01-01T10:05:00.000', '2026-01-01T10:12:00.000']);
  });

  it.each([
    ['reversed', '2026-01-01T10:12:00.000', '2026-01-01T10:05:00.000'],
    ['equal', '2026-01-01T10:05:00.000', '2026-01-01T10:05:00.000'],
    ['malformed', 'not-a-time', '2026-01-01T10:12:00.000'],
    ['missing end', '2026-01-01T10:05:00.000', null],
    ['impossible calendar', '2026-02-30T10:00:00.000', '2026-02-30T11:00:00.000'],
  ] as const)('a %s pair in the page keys is ignored, not applied', async (_name, rangeFrom, rangeTo) => {
    const fake = hostFor({ page: { equipment: EQUIPMENT, rangeFrom, ...(rangeTo === null ? {} : { rangeTo }) } });
    const Screen = eqvScreens.focus;
    render(<Screen host={fake.host} params={{}} />);
    await screen.findByRole('form', { name: '구간' });
    expect(rangeInputs().map((input) => input.value)).not.toContain(rangeFrom);
  });

  it('a saved range survives a host refresh of the same equipment, time and entry', async () => {
    const fake = hostFor({ page: { equipment: EQUIPMENT, rangeFrom: '2026-01-01T10:05:00.000', rangeTo: '2026-01-01T10:12:00.000' } });
    const Screen = eqvScreens.focus;
    render(<Screen host={fake.host} params={{}} />);
    await screen.findByRole('form', { name: '구간' });
    fake.setPage({ unrelated: 'x' });
    expect(rangeInputs().map((input) => input.value)).toEqual(['2026-01-01T10:05:00.000', '2026-01-01T10:12:00.000']);
    expect(fake.log.pageWrites).toEqual([]);
    expect(fake.host.page('rangeFrom')).toBe('2026-01-01T10:05:00.000');
  });

  it.each([
    ['applied time', (fake: ReturnType<typeof hostFor>) => fake.setContext({ from: '2026-01-02T10:00:00', to: '2026-01-02T11:00:00' })],
    ['equipment', (fake: ReturnType<typeof hostFor>) => fake.setPage({ equipment: 'other-tool' })],
    ['entry anchor', (fake: ReturnType<typeof hostFor>) => fake.setPage({ entityType: 'occurrence', anchor: 'occ-pm1-process' })],
  ] as const)('a saved range is dropped when the %s changes', async (_name, change) => {
    const fake = hostFor({ page: { equipment: EQUIPMENT, rangeFrom: '2026-01-01T10:05:00.000', rangeTo: '2026-01-01T10:12:00.000' } });
    const Screen = eqvScreens.focus;
    render(<Screen host={fake.host} params={{}} />);
    await screen.findByRole('form', { name: '구간' });
    change(fake);
    await waitFor(() => expect(fake.host.page('rangeFrom')).toBeNull());
    expect(fake.host.page('rangeTo')).toBeNull();
  });
});

describe('Korean copy', () => {
  it.each([
    ['topview', eqvScreens.topview, '2026-01-01 10:30:00'],
    ['focus', eqvScreens.focus, '2026-01-01 10:'],
  ] as const)('%s: times read YYYY-MM-DD HH:mm:ss and no control keeps an English label', async (_name, Screen, shown) => {
    const fake = hostFor();
    render(<Screen host={fake.host} params={{}} />);
    await waitFor(() => expect(document.querySelector('table, [data-layer="replay"]')).not.toBeNull());
    const text = document.body.textContent ?? '';
    expect(text).toContain(shown);
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    expect(text).not.toMatch(/Sequence step|이전 record|다음 record/);
  });

  it('the evidence detail names its provenance rows in Korean (Ruleset Version stays a glossary term)', async () => {
    const fake = hostFor();
    const Screen = eqvScreens.focus;
    render(<Screen host={fake.host} params={{}} />);
    await waitFor(() => expect(row('occ-pm1-process')).not.toBeNull());
    fireEvent.click(row('occ-pm1-process')!);
    fireEvent.mouseDown(screen.getByRole('tab', { name: '근거 상세' }));
    const detail = await screen.findByRole('region', { name: '근거 상세 occ-pm1-process' });
    for (const label of ['합성 데이터', 'Mapping Version', 'Ruleset Version']) expect(within(detail).getByText(label)).toBeTruthy();
    expect(within(detail).queryByText('synthetic')).toBeNull();
  });
});
