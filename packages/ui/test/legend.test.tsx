// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { Legend } from '../src/index.js';

afterEach(cleanup);

it('renders a labelled list of the items, swatch optional', () => {
  render(<Legend label="범례" items={[{ swatch: <svg data-testid="sw" />, label: '관측' }, { swatch: null, label: 'Binding 경계 — 실선' }]} />);
  const items = within(screen.getByRole('list', { name: '범례' })).getAllByRole('listitem');
  expect(items.map((li) => li.textContent)).toEqual(['관측', 'Binding 경계 — 실선']);
  expect(within(items[0]!).getByTestId('sw')).toBeTruthy();
});
