// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useState } from 'react';
import { DataTable, type DataTableSort } from '../src/index.js';

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
  // AP table section: framed card region, filled header, transparent cells so row hover/selected fills show.
  const frame = screen.getByRole('region', { name: 'Occurrence' }).parentElement!;
  expect(frame.className).toMatch(/\bborder\b/);
  expect(frame.className).toContain('bg-surface-card');
  expect(screen.getByRole('columnheader', { name: columns[0] }).className).toContain('bg-surface-card-elevated');
  expect(screen.getByRole('cell', { name: 'A' }).className).not.toMatch(/\bbg-/);
});

it('puts a layout className from the column on its header cell', () => {
  render(
    <DataTable label="Occurrence" columns={[{ id: 'eq', header: '설비', className: 'whitespace-nowrap' }]}>
      <DataTable.Row><DataTable.Cell>EQ-1</DataTable.Cell></DataTable.Row>
    </DataTable>,
  );
  const th = screen.getByRole('columnheader', { name: '설비' });
  expect(th.className).toContain('whitespace-nowrap');
  expect(th.className).toContain('bg-surface-card-elevated');
});

it('activates a row on Enter and Space only when the key came from the row, not from a control inside it', () => {
  const activated: string[] = [];
  render(
    <DataTable label="Fleet" columns={columns}>
      <DataTable.Row onActivate={() => activated.push('row')}>
        <DataTable.Cell>EQ-1</DataTable.Cell>
        <DataTable.Cell><a href="/focus">열기</a></DataTable.Cell>
      </DataTable.Row>
    </DataTable>,
  );
  const link = screen.getByRole('link', { name: '열기' });
  expect(fireEvent.keyDown(link, { key: 'Enter' })).toBe(true);
  expect(fireEvent.keyDown(link, { key: ' ' })).toBe(true);
  expect(activated).toEqual([]);
  const [, row] = screen.getAllByRole('row');
  expect(fireEvent.keyDown(row!, { key: 'Enter' })).toBe(false);
  expect(activated).toEqual(['row']);
});

it('leaves a row without onActivate unfocusable and not selectable', () => {
  renderTable();
  const [, row] = screen.getAllByRole('row');
  expect(row!.hasAttribute('tabindex')).toBe(false);
  expect(row!.hasAttribute('aria-selected')).toBe(false);
});

it('scrolls a focused descendant into view inside the region, not the region itself', () => {
  const scrolled: Element[] = [];
  const original = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function scrollIntoView(this: Element) { scrolled.push(this); };
  try {
    render(
      <DataTable label="Actions" columns={columns}>
        <DataTable.Row><DataTable.Cell><a href="#open">Open</a></DataTable.Cell></DataTable.Row>
      </DataTable>,
    );
    fireEvent.focus(screen.getByRole('region', { name: 'Actions' }));
    expect(scrolled).toEqual([]);
    fireEvent.focus(screen.getByRole('link', { name: 'Open' }));
    expect(scrolled).toEqual([screen.getByRole('link', { name: 'Open' })]);
  } finally {
    Element.prototype.scrollIntoView = original;
  }
});

const sortColumns = [
  { id: 'name', header: 'Name', sortable: true },
  { id: 'count', header: 'Count', sortable: true, align: 'end' as const },
  { id: 'note', header: 'Note' },
];
const sortRows = [{ name: 'b', count: 2 }, { name: 'c', count: 3 }, { name: 'a', count: 1 }];

function SortHarness() {
  const [sort, setSort] = useState<DataTableSort | null>(null);
  const sorted = [...sortRows].sort((x, y) => {
    if (sort === null) return 0;
    const key = sort.columnId as 'name' | 'count';
    const order = x[key] < y[key] ? -1 : x[key] > y[key] ? 1 : 0;
    return sort.direction === 'ascending' ? order : -order;
  });
  return (
    <DataTable label="Sortable" columns={sortColumns} sort={sort} onSortChange={setSort}>
      {sorted.map((row) => (
        <DataTable.Row key={row.name}>
          <DataTable.Cell>{row.name}</DataTable.Cell>
          <DataTable.Cell numeric>{row.count}</DataTable.Cell>
          <DataTable.Cell />
        </DataTable.Row>
      ))}
    </DataTable>
  );
}

it.each([
  ['ascending', 1, ['a', 'b', 'c']],
  ['descending', 2, ['c', 'b', 'a']],
] as const)('sorts %s after %i click(s) on a sortable header', (direction, clicks, order) => {
  render(<SortHarness />);
  for (let i = 0; i < clicks; i += 1) fireEvent.click(screen.getByRole('button', { name: 'Name' }));
  expect(screen.getByRole('columnheader', { name: 'Name' }).getAttribute('aria-sort')).toBe(direction);
  expect(screen.getByRole('columnheader', { name: 'Count' }).getAttribute('aria-sort')).toBe('none');
  expect(screen.getByRole('columnheader', { name: 'Note' }).hasAttribute('aria-sort')).toBe(false);
  expect(screen.getAllByRole('row').slice(1).map((row) => row.firstElementChild!.textContent)).toEqual(order);
});

it('starts another column ascending and names the sort button by the header text', () => {
  render(<SortHarness />);
  fireEvent.click(screen.getByRole('button', { name: 'Name' }));
  fireEvent.click(screen.getByRole('button', { name: 'Count' }));
  expect(screen.getByRole('columnheader', { name: 'Count' }).getAttribute('aria-sort')).toBe('ascending');
  expect(screen.getByRole('columnheader', { name: 'Name' }).getAttribute('aria-sort')).toBe('none');
});

it.each([[2], [3]] as const)('renders the title as a level-%i heading with subtitle, actions and count', (level) => {
  render(
    <DataTable label="Fleet" columns={columns} title="Fleet table" subtitle="Sub" actions={<button type="button">Act</button>} headingLevel={level} count="8건">
      <DataTable.Row><DataTable.Cell>A</DataTable.Cell></DataTable.Row>
    </DataTable>,
  );
  expect(screen.getByRole('heading', { level, name: 'Fleet table' })).toBeTruthy();
  expect(screen.getByText('Sub')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Act' })).toBeTruthy();
  expect(screen.getByText('8건')).toBeTruthy();
});

it('shows state content inside the frame while the column headers stay', () => {
  render(<DataTable label="Empty" columns={columns} state={<p>Nothing here</p>}>{null}</DataTable>);
  expect(screen.getByText('Nothing here')).toBeTruthy();
  expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual(columns);
});

it('keeps the named focusable region as the table parent when capped', () => {
  render(<DataTable label="Capped" columns={columns} capped><DataTable.Row><DataTable.Cell>A</DataTable.Cell></DataTable.Row></DataTable>);
  const region = screen.getByRole('table', { name: 'Capped' }).parentElement!;
  expect(region.getAttribute('role')).toBe('region');
  expect(region.getAttribute('aria-label')).toBe('Capped');
  expect(region.getAttribute('tabindex')).toBe('0');
});
