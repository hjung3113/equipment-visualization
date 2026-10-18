// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ToastRegion, useToastQueue, type ToastTone } from '../src/index.js';

let notifyRef: (text: string, tone?: ToastTone) => void = () => {};

function Harness() {
  const { toasts, notify, dismiss } = useToastQueue();
  notifyRef = notify;
  return <ToastRegion toasts={toasts} onDismiss={dismiss} labels={{ dismiss: 'Close' }} />;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it.each([
  ['info', 'status'],
  ['warning', 'status'],
  ['danger', 'alert'],
] as const)('a %s toast is a %s', (tone, role) => {
  render(<Harness />);
  act(() => notifyRef('Saved', tone));
  expect(screen.getByRole(role).textContent).toContain('Saved');
});

it('disappears after 5000 ms', () => {
  render(<Harness />);
  act(() => notifyRef('Saved'));
  act(() => { vi.advanceTimersByTime(4999); });
  expect(screen.queryByText('Saved')).not.toBeNull();
  act(() => { vi.advanceTimersByTime(1); });
  expect(screen.queryByText('Saved')).toBeNull();
});

it('the dismiss button removes it at once', () => {
  render(<Harness />);
  act(() => notifyRef('Saved'));
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(screen.queryByText('Saved')).toBeNull();
});

it('keeps only the newest four', () => {
  render(<Harness />);
  act(() => { for (let i = 1; i <= 5; i += 1) notifyRef(`T${i}`); });
  expect(screen.getAllByRole('status').map((t) => t.textContent)).toEqual(['T2', 'T3', 'T4', 'T5']);
});
