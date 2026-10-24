import { act, cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ApiResponse } from '@ap/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import type { OccurrenceBatch } from '@eqv/core';
import { eqvManifest, eqvScreens, FOCUS_SCREEN, TOPVIEW_SCREEN } from '../src/index.js';
import { createFakeHost, deferred, ok, response, type FakeHostOptions, type QueryCall } from './fake-host.js';
import { contextData, EQUIPMENT, HOST_TIME, mappings, pages } from './replay-fixture.js';

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

describe('outcomes', () => {
  const failing = (outcome: ApiResponse<unknown>['outcome']) => hostFor({ query: server({ context: response(outcome, null, { message: `${outcome}-text` }) }) });

  it.each([['error', '불러오지 못했습니다'], ['timeout', '응답 시간 초과'], ['too_large', '구간이 너무 큽니다']] as const)(
    '%s is a screen-local state with the message and the reportError id, and no status call', async (outcome, title) => {
      const fake = failing(outcome);
      const Screen = eqvScreens.topview;
      render(<Screen host={fake.host} params={{}} />);
      await screen.findByText(title);
      screen.getByText(new RegExp(`${outcome}-text`));
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

  it('forbidden sets auth_required; the next successful load returns to ready', async () => {
    let allowed = false;
    const fake = hostFor({ query: async (call) => allowed ? await server()(call) : response('forbidden', null) });
    const Screen = eqvScreens.topview;
    render(<Screen host={fake.host} params={{}} />);
    await waitFor(() => expect(fake.log.statuses).toEqual(['auth_required']));
    allowed = true;
    fake.setPage({ equipment: 'eq-synth-02' });
    await waitFor(() => expect(fake.log.statuses).toEqual(['auth_required', 'ready']));
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

  it('a page that disagrees with the first page is a data error', async () => {
    const odd = (token: string | undefined): ApiResponse<unknown> => ok<OccurrenceBatch>(token === undefined ? pages()[0] : { ...pages()[1], dataGeneration: 'g2' });
    const fake = hostFor({ query: server({ events: odd }) });
    const Screen = eqvScreens.focus;
    render(<Screen host={fake.host} params={{}} />);
    await screen.findByText('데이터 오류');
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
    await screen.findAllByText('2026-01-01T10:30:00.000');
    expect(document.querySelector('[data-layer="replay"]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Focus 열기' }));
    expect(fake.log.navigations).toEqual([{ screen: 'focus', page: { equipment: EQUIPMENT } }]);
  });

  it('with detailSlot, selecting a Component shows its detail in the host slot', async () => {
    const fake = hostFor({ detailSlot: true });
    const Screen = eqvScreens.topview;
    render(<Screen host={fake.host} params={{}} />);
    await screen.findAllByText('2026-01-01T10:30:00.000');
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

describe('eqvScreens', () => {
  it('has exactly the manifest screen ids', () => {
    expect(Object.keys(eqvScreens).sort()).toEqual(eqvManifest.screens.map((s) => s.id).sort());
    expect([TOPVIEW_SCREEN, FOCUS_SCREEN].sort()).toEqual(Object.keys(eqvScreens).sort());
  });
});
