// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { hrefFor, navigate, parseRoute, setNavigationBlocker, useRoute, type Route } from '../src/router.js';

afterEach(() => {
  cleanup();
  setNavigationBlocker(null);
});

const HEX = 'e4105058c692'.repeat(5) + 'abcd';

const NAMED: [string, string, Route][] = [
  ['/fleet', '', { name: 'fleet' }],
  ['/layouts', '', { name: 'layouts', file: null }],
  ['/layouts', '?file=layouts/a/draft.layout.json', { name: 'layouts', file: 'layouts/a/draft.layout.json' }],
  ['/fleet/new', '', { name: 'equipment-new' }],
  ['/equipment/eq-synth-03', '', { name: 'equipment', equipmentId: 'eq-synth-03' }],
  ['/equipment/a%2Fb', '', { name: 'equipment', equipmentId: 'a/b' }],
  ['/onboarding/eq-synth-01', '', { name: 'onboarding', equipmentId: 'eq-synth-01', window: null }],
  ['/onboarding/eq-synth-01', `?window=${HEX}`, { name: 'onboarding', equipmentId: 'eq-synth-01', window: HEX }],
  ['/onboarding/eq-synth-01/board', '', { name: 'board', equipmentId: 'eq-synth-01' }],
  ['/onboarding/a%2Fb/board', '', { name: 'board', equipmentId: 'a/b' }],
  ['/focus/eq-synth-01', '?entityType=wafer&anchor=occ-1',
    { name: 'focus', equipmentId: 'eq-synth-01', entityType: 'wafer', anchor: 'occ-1', window: null }],
  ['/focus/eq-synth-01', `?entityType=wafer&anchor=occ-1&window=${HEX}`,
    { name: 'focus', equipmentId: 'eq-synth-01', entityType: 'wafer', anchor: 'occ-1', window: HEX }],
  ['/focus/eq-synth-01', '', { name: 'focus', equipmentId: 'eq-synth-01', entityType: null, anchor: null, window: null }],
  ['/onboarding/a%2Fb%20c', '', { name: 'onboarding', equipmentId: 'a/b c', window: null }],
];

it.each(NAMED)('parses %s%s', (pathname, search, route) => {
  expect(parseRoute(pathname, search)).toEqual(route);
  const [hrefPath = '', hrefSearch = ''] = hrefFor(route).split(/(?=\?)/);
  expect(parseRoute(hrefPath, hrefSearch)).toEqual(route);
});

it.each(['/', '/nope', '/fleet/extra', '/fleet/new/x', '/equipment', '/equipment/a/b', '/onboarding', '/onboarding/%E0%A4%A', '/onboarding/eq-synth-01/other', '/onboarding/eq-synth-01/board/x'])('treats %s as not found', (pathname) => {
  expect(parseRoute(pathname, '')).toEqual({ name: 'not-found', pathname });
});

it.each([[true, { name: 'dev-ui' }], [false, { name: 'not-found', pathname: '/dev/ui' }]])('parses /dev/ui with dev=%s', (dev, route) => {
  expect(parseRoute('/dev/ui', '', dev)).toEqual(route);
});

it.each(['/dev/ui/x', '/dev'])('treats %s as not found in dev', (pathname) => {
  expect(parseRoute(pathname, '', true)).toEqual({ name: 'not-found', pathname });
});

it('builds the gallery href', () => {
  expect(hrefFor({ name: 'dev-ui' })).toBe('/dev/ui');
});

it.each([false, true])('blocks navigation without changing history, then allows it (replace=%s)', (replace) => {
  navigate('/layouts');
  const { result } = renderHook(() => useRoute());
  const historyLength = window.history.length;
  setNavigationBlocker(() => false);
  act(() => navigate('/fleet', { replace }));
  expect(window.location.pathname).toBe('/layouts');
  expect(window.history.length).toBe(historyLength);
  expect(result.current).toEqual({ name: 'layouts', file: null });

  setNavigationBlocker(() => true);
  act(() => navigate('/fleet', { replace }));
  expect(window.location.pathname).toBe('/fleet');
  expect(result.current).toEqual({ name: 'fleet' });
});

it('reverts a blocked popstate without changing the route, then allows a popstate', () => {
  navigate('/layouts?file=original#viewer');
  const { result } = renderHook(() => useRoute());
  setNavigationBlocker(() => false);
  act(() => {
    window.history.replaceState(null, '', '/fleet');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  expect(window.location.pathname + window.location.search + window.location.hash).toBe('/layouts?file=original#viewer');
  expect(result.current).toEqual({ name: 'layouts', file: 'original' });

  setNavigationBlocker(() => true);
  act(() => {
    window.history.replaceState(null, '', '/fleet');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  expect(window.location.pathname).toBe('/fleet');
  expect(result.current).toEqual({ name: 'fleet' });
});

it('bypasses the blocker for forced navigation', () => {
  navigate('/layouts');
  setNavigationBlocker(() => false);
  navigate('/fleet');
  expect(window.location.pathname).toBe('/layouts');
  setNavigationBlocker(() => { throw new Error('Forced navigation must not consult the blocker'); });
  expect(() => navigate('/fleet', { force: true })).not.toThrow();
  expect(window.location.pathname).toBe('/fleet');
});
