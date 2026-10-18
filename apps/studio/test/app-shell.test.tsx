// @vitest-environment jsdom
import { rm } from 'node:fs/promises';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
import { navigate } from '../src/router.js';
import { createFileApi } from '../server/files.js';
import { seedOnboardingRoot } from './seed.js';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let base: string;

beforeEach(async () => {
  let root: string;
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
  await rm(base, { recursive: true, force: true });
});

it.each([
  ['/fleet', 'Fleet'],
  ['/onboarding/eq-x', 'Fleet'],
  ['/onboarding/eq-x/board', 'Fleet'],
  ['/focus/eq-x', 'Fleet'],
  ['/layouts', '레이아웃'],
])('%s marks only %s current in the nav and keeps one page heading in main', async (path, current) => {
  window.history.replaceState(null, '', path);
  render(<App />);
  const nav = screen.getByRole('navigation', { name: '주 메뉴' });
  const other = current === 'Fleet' ? '레이아웃' : 'Fleet';
  expect(within(nav).getByRole('link', { name: current }).getAttribute('aria-current')).toBe('page');
  expect(within(nav).getByRole('link', { name: other }).getAttribute('aria-current')).toBeNull();
  const main = screen.getByRole('main');
  await waitFor(() => expect(within(main).getAllByRole('heading', { level: 1 })).toHaveLength(1));
});

it('moves focus to the new page heading after a pathname change, not after a query-only change', async () => {
  window.history.replaceState(null, '', '/fleet');
  render(<App />);
  await waitFor(() => expect(within(screen.getByRole('main')).getAllByRole('heading', { level: 1 })).toHaveLength(1));
  expect(document.activeElement).toBe(document.body);
  fireEvent.click(within(screen.getByRole('navigation', { name: '주 메뉴' })).getByRole('link', { name: '레이아웃' }));
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: '레이아웃' })));
  (document.activeElement as HTMLElement).blur();
  act(() => navigate('/layouts?file=templates%2Fx.template.json'));
  expect(document.activeElement).toBe(document.body);
});
