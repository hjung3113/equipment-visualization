// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useState } from 'react';
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

function ActivationHarness() {
  const [activeId, setActiveId] = useState('a');
  return (
    <DataTable label="Occurrence" columns={columns} role="grid">
      <DataTable.Row onActivate={() => setActiveId('a')} selected={activeId === 'a'}>
        <DataTable.Cell>A</DataTable.Cell>
      </DataTable.Row>
      <DataTable.Row onActivate={() => setActiveId('b')} selected={activeId === 'b'}>
        <DataTable.Cell>B</DataTable.Cell>
      </DataTable.Row>
      <DataTable.Row><DataTable.Cell>C</DataTable.Cell></DataTable.Row>
    </DataTable>
  );
}

it.each([
  ['click', (row: HTMLElement) => fireEvent.click(row)],
  ['Enter', (row: HTMLElement) => fireEvent.keyDown(row, { key: 'Enter' })],
  ['Space', (row: HTMLElement) => fireEvent.keyDown(row, { key: ' ' })],
] as const)('activates a row on %s and moves aria-selected to it', (_key, activate) => {
  render(<ActivationHarness />);
  const [, first, second, plain] = screen.getAllByRole('row');
  expect(first!.getAttribute('aria-selected')).toBe('true');
  expect(second!.getAttribute('aria-selected')).toBe('false');
  activate(second!);
  expect(second!.getAttribute('aria-selected')).toBe('true');
  expect(first!.getAttribute('aria-selected')).toBe('false');
  expect(second!.getAttribute('tabindex')).toBe('0');
  expect(plain!.hasAttribute('tabindex')).toBe(false);
});

it('keeps a layout className given to DataTable together with its own classes', () => {
  render(
    <DataTable label="Occurrence" columns={columns} className="mt-2">
      <DataTable.Row><DataTable.Cell>A</DataTable.Cell></DataTable.Row>
    </DataTable>,
  );
  const table = screen.getByRole('table', { name: 'Occurrence' });
  expect(table.className).toContain('mt-2');
  expect(table.className.trim().split(/\s+/).length).toBeGreaterThan(1);
});

it('leaves a row without onActivate unfocusable and not selectable', () => {
  renderTable();
  const [, row] = screen.getAllByRole('row');
  expect(row!.hasAttribute('tabindex')).toBe(false);
  expect(row!.hasAttribute('aria-selected')).toBe(false);
});
