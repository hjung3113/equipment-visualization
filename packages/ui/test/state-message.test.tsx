// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { Inbox } from 'lucide-react';
import { afterEach, expect, it } from 'vitest';
import { LoadingBlock, StateMessage } from '../src/index.js';

afterEach(cleanup);

it.each([
  ['neutral', 'status'],
  ['warning', 'status'],
  ['danger', 'alert'],
] as const)('%s tone is a %s with title, body and action', (tone, role) => {
  render(<StateMessage tone={tone} icon={Inbox} title="Title" body="Body" action={<button type="button">Retry</button>} />);
  const root = screen.getByRole(role);
  expect(root.textContent).toContain('Title');
  expect(root.textContent).toContain('Body');
  expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
});

it('LoadingBlock is a busy status named by its label', () => {
  render(<LoadingBlock label="Loading rows" />);
  const status = screen.getByRole('status');
  expect(status.getAttribute('aria-busy')).toBe('true');
  expect(status.textContent).toBe('Loading rows');
});
