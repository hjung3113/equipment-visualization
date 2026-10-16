import { expect, it } from 'vitest';
import { hrefFor, parseRoute, type Route } from '../src/router.js';

const NAMED: [string, string, Route][] = [
  ['/fleet', '', { name: 'fleet' }],
  ['/layouts', '', { name: 'layouts', file: null }],
  ['/layouts', '?file=layouts/a/draft.layout.json', { name: 'layouts', file: 'layouts/a/draft.layout.json' }],
  ['/onboarding/eq-synth-01', '', { name: 'onboarding', equipmentId: 'eq-synth-01' }],
  ['/focus/eq-synth-01', '?entityType=wafer&anchor=occ-1',
    { name: 'focus', equipmentId: 'eq-synth-01', entityType: 'wafer', anchor: 'occ-1' }],
  ['/focus/eq-synth-01', '', { name: 'focus', equipmentId: 'eq-synth-01', entityType: null, anchor: null }],
  ['/onboarding/a%2Fb%20c', '', { name: 'onboarding', equipmentId: 'a/b c' }],
];

it.each(NAMED)('parses %s%s', (pathname, search, route) => {
  expect(parseRoute(pathname, search)).toEqual(route);
  const [hrefPath = '', hrefSearch = ''] = hrefFor(route).split(/(?=\?)/);
  expect(parseRoute(hrefPath, hrefSearch)).toEqual(route);
});

it.each(['/', '/nope', '/fleet/extra', '/onboarding', '/onboarding/%E0%A4%A'])('treats %s as not found', (pathname) => {
  expect(parseRoute(pathname, '')).toEqual({ name: 'not-found', pathname });
});
