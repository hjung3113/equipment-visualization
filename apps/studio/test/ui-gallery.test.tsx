// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { App } from '../src/App.js';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(cleanup);

async function renderGallery() {
  window.history.replaceState(null, '', '/dev/ui');
  render(<App />);
  await screen.findByRole('heading', { level: 1, name: 'UI 갤러리' });
}

it.each(['DataTable', 'Panel', 'StateMessage', 'StatusBadge', 'DetailFields', 'FileButton', 'FormField', '툴바 버튼', 'ViewerZoomControls', '토스트', 'Tabs'])(
  'has a %s section',
  async (name) => {
    await renderGallery();
    expect(screen.getByRole('region', { name })).toBeTruthy();
  },
);

it('stays out of the nav', async () => {
  await renderGallery();
  expect(within(screen.getByRole('navigation', { name: '주 메뉴' })).getAllByRole('link')).toHaveLength(2);
});

it('sorts the equipment table by a header button', async () => {
  await renderGallery();
  const table = within(screen.getByRole('region', { name: 'DataTable' }));
  const header = table.getAllByRole('columnheader', { name: /커버리지/ })[0]!;
  fireEvent.click(within(header).getByRole('button'));
  expect(header.getAttribute('aria-sort')).toBe('ascending');
});

it('shows an info toast', async () => {
  await renderGallery();
  fireEvent.click(within(screen.getByRole('region', { name: '토스트' })).getByRole('button', { name: '정보' }));
  expect(screen.getByText('정보 토스트입니다').closest('[role="status"]')).toBeTruthy();
});
