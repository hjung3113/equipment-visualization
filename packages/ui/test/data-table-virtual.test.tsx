// @vitest-environment jsdom
// jsdom has no layout: the virtualizer reads the scroll region's size from offsetHeight/offsetWidth, which are 0 and
// would render no row. These tests mock offsetHeight (region 480, rows 32) and offsetWidth, so the first window is
// ~15 rows plus overscan. The mount position comes from `initialIndex` (no scroll event fires on mount). Post-mount
// scrolls (`scrollToIndex`) also need scrollHeight (offsets clamp to scrollHeight − clientHeight) and
// Element.scrollTo, which sets scrollTop and fires `scroll`.
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DataTable, VIRTUAL_ROW_THRESHOLD, type DataTableRows } from '../src/index.js';

const REGION = 480;
const ROW = 32;

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.getAttribute('role') === 'region' ? REGION : ROW;
  });
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800);
  vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockReturnValue(1_000_000);
  Element.prototype.scrollTo = function (this: Element, options?: ScrollToOptions | number) {
    this.scrollTop = typeof options === 'object' ? options.top ?? 0 : 0;
    this.dispatchEvent(new Event('scroll'));
  } as typeof Element.prototype.scrollTo;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const rows = (count: number, over: Partial<DataTableRows> = {}): DataTableRows => ({
  count,
  render: (index) => (
    <DataTable.Row data-testid={`row-${index}`}>
      <DataTable.Cell>행 {index}</DataTable.Cell>
    </DataTable.Row>
  ),
  ...over,
});
const table = (r: DataTableRows) => <DataTable label="Many" columns={['이름']} rows={r} />;
const dataRows = () => Array.from(document.querySelectorAll('tbody > tr[data-index]'));

it('windows a long table: bounded rows, spacers, aria-rowcount and aria-rowindex', () => {
  render(table(rows(5000)));
  const rendered = dataRows();
  expect(rendered.length).toBeGreaterThan(10);
  expect(rendered.length).toBeLessThan(60);
  expect(screen.getByRole('table', { name: 'Many' }).getAttribute('aria-rowcount')).toBe('5001');
  expect(rendered[0]!.getAttribute('aria-rowindex')).toBe('2');
  expect(rendered.every((tr) => tr.getAttribute('aria-rowindex') === String(Number(tr.getAttribute('data-index')) + 2))).toBe(true);
  expect(document.querySelectorAll('tbody > tr[aria-hidden]')).toHaveLength(2);
  expect(screen.getByRole('region', { name: 'Many' }).className).toContain('max-h-[60vh]');
});

it('renders every row below the threshold, with no spacers or aria-rowcount', () => {
  render(table(rows(VIRTUAL_ROW_THRESHOLD - 1)));
  expect(dataRows()).toHaveLength(VIRTUAL_ROW_THRESHOLD - 1);
  expect(document.querySelector('tbody > tr[aria-hidden]')).toBeNull();
  expect(screen.getByRole('table', { name: 'Many' }).hasAttribute('aria-rowcount')).toBe(false);
});

it('starts at initialIndex and renders the target row after scrollToIndex changes', () => {
  const { rerender } = render(table(rows(5000, { initialIndex: 2500 })));
  expect(screen.getByTestId('row-2500')).toBeTruthy();
  expect(screen.queryByTestId('row-0')).toBeNull();
  act(() => { rerender(table(rows(5000, { initialIndex: 2500, scrollToIndex: 4000 }))); });
  expect(screen.getByTestId('row-4000')).toBeTruthy();
  expect(dataRows().length).toBeLessThan(60);
  expect(within(screen.getByRole('table', { name: 'Many' })).getByRole('row', { name: '행 4000' }).getAttribute('aria-rowindex')).toBe('4002');
});
