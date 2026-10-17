// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DataTable } from '../src/index.js';

afterEach(cleanup);

const columns = ['설비', '상태'];
const rows = [
  { id: 'a', cells: ['EQ-1', '게시됨'] },
  { id: 'b', cells: ['EQ-2', '초안'] },
];

const renderTable = () =>
  render(
    <DataTable label="Fleet" columns={columns}>
      {rows.map((row) => (
        <DataTable.Row key={row.id}>
          {row.cells.map((cell) => <DataTable.Cell key={cell}>{cell}</DataTable.Cell>)}
        </DataTable.Row>
      ))}
    </DataTable>,
  );

it('renders an accessible table with column headers and rows', () => {
  renderTable();
  const table = screen.getByRole('table', { name: 'Fleet' });
  expect(within(table).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(columns);
  expect(within(table).getAllByRole('columnheader').every((th) => th.getAttribute('scope') === 'col')).toBe(true);
  expect(within(table).getAllByRole('row')).toHaveLength(3);
  expect(within(table).getByRole('cell', { name: 'EQ-2' })).toBeTruthy();
});

it('activates a row on click, Enter and Space, and marks the active row aria-selected', () => {
  const onActivate = vi.fn();
  const { rerender } = render(
    <DataTable label="Occurrence" columns={columns} role="grid">
      <DataTable.Row onActivate={() => onActivate('a')} selected={false}><DataTable.Cell>A</DataTable.Cell></DataTable.Row>
      <DataTable.Row onActivate={() => onActivate('b')} selected><DataTable.Cell>B</DataTable.Cell></DataTable.Row>
    </DataTable>,
  );
  const [, first, second] = screen.getAllByRole('row');
  expect(first!.getAttribute('aria-selected')).toBe('false');
  expect(second!.getAttribute('aria-selected')).toBe('true');
  fireEvent.click(first!);
  fireEvent.keyDown(first!, { key: 'Enter' });
  fireEvent.keyDown(first!, { key: ' ' });
  fireEvent.keyDown(first!, { key: 'a' });
  expect(onActivate.mock.calls).toEqual([['a'], ['a'], ['a']]);
  rerender(
    <DataTable label="Occurrence" columns={columns} role="grid">
      <DataTable.Row onActivate={() => onActivate('a')} selected><DataTable.Cell>A</DataTable.Cell></DataTable.Row>
      <DataTable.Row onActivate={() => onActivate('b')} selected={false}><DataTable.Cell>B</DataTable.Cell></DataTable.Row>
    </DataTable>,
  );
  const [, nowFirst, nowSecond] = screen.getAllByRole('row');
  expect(nowFirst!.getAttribute('aria-selected')).toBe('true');
  expect(nowSecond!.getAttribute('aria-selected')).toBe('false');
});

it('leaves a row without onActivate unfocusable and not selectable', () => {
  renderTable();
  const [, row] = screen.getAllByRole('row');
  expect(row!.hasAttribute('tabindex')).toBe(false);
  expect(row!.hasAttribute('aria-selected')).toBe(false);
});
