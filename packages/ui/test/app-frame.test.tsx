// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppFrame } from '../src/index.js';

const store = new Map<string, string>();
const memoryStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { store.set(key, value); },
};
beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', memoryStorage);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const labels = { nav: '주 메뉴', skipToContent: '본문으로 건너뛰기', collapse: '사이드바 접기', expand: '사이드바 펼치기' };
const items = [
  { key: 'fleet', label: 'Fleet', icon: <svg />, href: '/fleet', current: true },
  { key: 'layouts', label: '레이아웃', icon: <svg />, href: '/layouts', current: false },
];
const frame = (extra: Partial<Parameters<typeof AppFrame>[0]> = {}) =>
  render(<AppFrame appName="Studio" brand="EV" items={items} labels={labels} {...extra}>본문</AppFrame>);

it('lists the items as links in the named nav, marking only the current one', () => {
  frame();
  const nav = screen.getByRole('navigation', { name: '주 메뉴' });
  const fleet = within(nav).getByRole('link', { name: 'Fleet' });
  const layouts = within(nav).getByRole('link', { name: '레이아웃' });
  expect(fleet.getAttribute('href')).toBe('/fleet');
  expect(layouts.getAttribute('href')).toBe('/layouts');
  expect(fleet.getAttribute('aria-current')).toBe('page');
  expect(layouts.getAttribute('aria-current')).toBeNull();
});

it('points the skip link at a focusable main and adds no heading', () => {
  frame();
  const main = screen.getByRole('main');
  expect(screen.getByRole('link', { name: '본문으로 건너뛰기' }).getAttribute('href')).toBe(`#${main.id}`);
  expect(main.getAttribute('tabindex')).toBe('-1');
  expect(within(main).getByText('본문')).toBeTruthy();
  expect(screen.queryByRole('heading')).toBeNull();
});

it('toggles collapse ↔ expand and keeps the link names when collapsed', () => {
  frame();
  const toggle = screen.getByRole('button', { name: '사이드바 접기' });
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  fireEvent.click(toggle);
  const expand = screen.getByRole('button', { name: '사이드바 펼치기' });
  expect(expand.getAttribute('aria-expanded')).toBe('false');
  const nav = screen.getByRole('navigation', { name: '주 메뉴' });
  expect(within(nav).getByRole('link', { name: 'Fleet' }).getAttribute('aria-current')).toBe('page');
  expect(within(nav).getByRole('link', { name: '레이아웃' })).toBeTruthy();
});

it('renders the items through a custom linkComponent', () => {
  frame({ linkComponent: (props) => <a data-routed="yes" {...props} /> });
  const links = within(screen.getByRole('navigation', { name: '주 메뉴' })).getAllByRole('link');
  expect(links.map((link) => link.getAttribute('data-routed'))).toEqual(['yes', 'yes']);
});

const KEY = 'test.sidebar';

it('restores a stored collapsed state and stores each toggle under collapsedStorageKey', () => {
  window.localStorage.setItem(KEY, 'true');
  frame({ collapsedStorageKey: KEY });
  fireEvent.click(screen.getByRole('button', { name: '사이드바 펼치기' }));
  expect(window.localStorage.getItem(KEY)).toBe('false');
  fireEvent.click(screen.getByRole('button', { name: '사이드바 접기' }));
  expect(window.localStorage.getItem(KEY)).toBe('true');
});

it('falls back to expanded and still toggles when localStorage throws', () => {
  const blocked = () => { throw new Error('blocked'); };
  vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked });
  frame({ collapsedStorageKey: KEY });
  fireEvent.click(screen.getByRole('button', { name: '사이드바 접기' }));
  expect(screen.getByRole('button', { name: '사이드바 펼치기' })).toBeTruthy();
});
