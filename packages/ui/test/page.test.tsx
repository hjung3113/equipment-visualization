// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
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
