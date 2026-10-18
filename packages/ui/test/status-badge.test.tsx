// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { Check } from 'lucide-react';
import { afterEach, expect, it } from 'vitest';
import { StatusBadge } from '../src/index.js';

afterEach(cleanup);

it.each(['success', 'warning', 'danger', 'neutral', 'info'] as const)('%s badge shows its text with a hidden icon', (tone) => {
  render(<StatusBadge tone={tone} icon={Check}>Label</StatusBadge>);
  const badge = screen.getByText('Label');
  expect(badge.getAttribute('data-tone')).toBe(tone);
  expect(badge.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
});
