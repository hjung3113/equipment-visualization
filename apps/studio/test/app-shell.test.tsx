// @vitest-environment jsdom
import { rm } from 'node:fs/promises';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
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
