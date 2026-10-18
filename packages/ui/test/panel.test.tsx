// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { Panel } from '../src/index.js';

afterEach(cleanup);

it.each([[2], [3]] as const)('names the section by its level-%i title and shows actions', (level) => {
  render(<Panel title="Step" headingLevel={level} actions={<button type="button">Go</button>}>body</Panel>);
  expect(screen.getByRole('heading', { level, name: 'Step' })).toBeTruthy();
  expect(screen.getByRole('region', { name: 'Step' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Go' })).toBeTruthy();
});

it('without title or actions has no heading and no region', () => {
  render(<Panel>body</Panel>);
  expect(screen.queryByRole('heading')).toBeNull();
  expect(screen.queryByRole('region')).toBeNull();
  expect(screen.getByText('body')).toBeTruthy();
});
