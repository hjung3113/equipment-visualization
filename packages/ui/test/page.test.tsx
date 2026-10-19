// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { Page } from '../src/index.js';

afterEach(cleanup);

it('with a title renders the level-1 heading, description and actions', () => {
  render(<Page title="Fleet" description="설비 목록" actions={<button type="button">새로고침</button>}>본문</Page>);
  expect(screen.getByRole('heading', { level: 1, name: 'Fleet' })).toBeTruthy();
  expect(screen.getByText('설비 목록')).toBeTruthy();
  expect(screen.getByRole('button', { name: '새로고침' })).toBeTruthy();
  expect(screen.getByText('본문')).toBeTruthy();
});

it('without a title renders the body only', () => {
  render(<Page>본문</Page>);
  expect(screen.queryByRole('heading')).toBeNull();
  expect(screen.queryByRole('banner')).toBeNull();
  expect(screen.getByText('본문')).toBeTruthy();
});

it('makes the heading programmatically focusable for route focus', () => {
  render(<Page title="Fleet">본문</Page>);
  expect(screen.getByRole('heading', { level: 1 }).getAttribute('tabindex')).toBe('-1');
});

function TestLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return <a data-test-link="" href={href} className={className}>{children}</a>;
}

it('renders ancestor crumbs in a named navigation: links through linkComponent, plain text without href', () => {
  render(
    <Page
      title="Detail"
      breadcrumb={{ label: 'Trail', items: [{ key: 'a', label: 'Fleet', href: '/fleet' }, { key: 'b', label: 'Group' }] }}
      linkComponent={TestLink}
    >
      본문
    </Page>,
  );
  const nav = screen.getByRole('navigation', { name: 'Trail' });
  const link = within(nav).getByRole('link', { name: 'Fleet' });
  expect(link.getAttribute('href')).toBe('/fleet');
  expect(link.hasAttribute('data-test-link')).toBe(true);
  expect(within(nav).getByText('Group').closest('a')).toBeNull();
  expect(screen.getByRole('heading', { level: 1, name: 'Detail' }).getAttribute('tabindex')).toBe('-1');
});

it('has no navigation without a breadcrumb', () => {
  render(<Page title="Fleet">본문</Page>);
  expect(screen.queryByRole('navigation')).toBeNull();
});
