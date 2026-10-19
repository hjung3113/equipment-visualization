// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { DetailFields } from '../src/index.js';

afterEach(cleanup);

it('lists terms and definitions in item order', () => {
  render(<DetailFields items={[{ key: 'a', label: 'First', value: '1' }, { key: 'b', label: 'Second', value: 'abc', mono: true }]} />);
  expect(screen.getAllByRole('term').map((t) => t.textContent)).toEqual(['First', 'Second']);
  expect(screen.getAllByRole('definition').map((d) => d.textContent)).toEqual(['1', 'abc']);
});
