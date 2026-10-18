import type { HTMLAttributes, KeyboardEvent, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@fops/ui';

export interface DataTableColumn {
  id: string;
  header: string;
  /** `end` right-aligns the header; pair it with `numeric` cells. */
  align?: 'start' | 'end';
  /** Renders a sort button; needs `onSortChange` on the table. */
  sortable?: boolean;
  /** Layout classes for the header cell, for example `whitespace-nowrap` on a short heading. */
  className?: string;
}

export type DataTableSortDirection = 'ascending' | 'descending';

export interface DataTableSort {
  columnId: string;
  direction: DataTableSortDirection;
}

export interface DataTableProps extends Omit<HTMLAttributes<HTMLTableElement>, 'aria-label' | 'children' | 'title'> {
  /** Accessible name of the table; also names its scroll region. */
  label: string;
  /** A string is `{ id: header, header }`. */
  columns: readonly (string | DataTableColumn)[];
  /** `DataTable.Row` elements only. */
  children: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  headingLevel?: 2 | 3;
  /** Status line text above the table, for example a row count (consumer words). */
  count?: ReactNode;
  /** A `StateMessage` / `LoadingBlock` shown inside the frame below the table; pass no rows with it. */
  state?: ReactNode;
  /** Caps the scroll viewport height; the header stays sticky. */
  capped?: boolean;
  /** Controlled sort. The consumer sorts its own rows. */
  sort?: DataTableSort | null;
  onSortChange?: (sort: DataTableSort) => void;
}

export interface DataTableRowProps extends Omit<HTMLAttributes<HTMLTableRowElement>, 'onClick'> {
  /** Makes the row focusable and fires on click, Enter and Space. Arrow-key navigation stays with the consumer. */
  onActivate?: () => void;
  /** Sets `aria-selected`; leave undefined for rows that are not selectable. A selected row shows the accent bar. */
  selected?: boolean;
}

export interface DataTableCellProps extends TdHTMLAttributes<HTMLTableCellElement> {
  /** Renders a `<th scope="row">` instead of a `<td>`. */
  rowHeader?: boolean;
  /** Right-aligned tabular figures. */
  numeric?: boolean;
  mono?: boolean;
}

/**
 * Dense table in the AP `PlatformDataTable` frame: 32px rows, sticky uppercase header, optional title bar, count line,
 * state block and controlled two-state sort. The data model stays with the consumer.
 */
export function DataTable({
  label, columns, children, className, title, subtitle, actions, headingLevel = 2, count, state, capped, sort, onSortChange, ...rest
}: DataTableProps) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const hasHeader = title !== undefined || actions !== undefined;
  const aboveRegion = hasHeader || count !== undefined;
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border-subtle bg-surface-card">
      {hasHeader && (
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 p-3">
          <div className="min-w-0">
            {title !== undefined && <Heading className="m-0 text-base leading-5 font-semibold text-text-primary">{title}</Heading>}
            {subtitle !== undefined && <p className="m-0 text-xs text-text-muted">{subtitle}</p>}
          </div>
          {actions !== undefined && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {count !== undefined && (
        <div aria-live="polite" className={cn('flex min-h-7 flex-wrap items-center gap-x-2 px-3 py-1 text-xs text-text-muted tabular-nums', hasHeader && 'border-t border-border-subtle')}>
          {count}
        </div>
      )}
      <div
        role="region"
        aria-label={label}
        tabIndex={0}
        className={cn('overflow-x-auto', capped && 'max-h-[60vh] overflow-auto overscroll-contain', aboveRegion && 'border-t border-border-subtle')}
      >
        <table aria-label={label} className={cn('w-full border-separate border-spacing-0 text-sm text-text-primary', className)} {...rest}>
          <thead>
            <tr className="h-8">
              {columns.map((column) => {
                const col: DataTableColumn = typeof column === 'string' ? { id: column, header: column } : column;
                const sortable = col.sortable === true && onSortChange !== undefined;
                const sorted = sortable && sort?.columnId === col.id ? sort.direction : undefined;
                const SortIcon = sorted === 'ascending' ? ArrowUp : sorted === 'descending' ? ArrowDown : ArrowUpDown;
                return (
                  <th
                    key={col.id}
                    scope="col"
                    {...(sortable ? { 'aria-sort': sorted ?? 'none' } : {})}
                    className={cn(
                      'sticky top-0 z-[1] border-b border-border-subtle bg-surface-card-elevated px-3 py-1 text-left text-xs font-semibold uppercase tracking-wide text-text-secondary first:border-l-2 first:border-l-transparent',
                      col.align === 'end' && 'text-right',
                      col.className,
                    )}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => onSortChange({ columnId: col.id, direction: sorted === 'ascending' ? 'descending' : 'ascending' })}
                        className="-mx-1 inline-flex items-center gap-1 rounded-sm px-1 uppercase hover:text-text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring"
                      >
                        {col.header}
                        <SortIcon className={cn('size-3', sorted === undefined && 'opacity-40')} aria-hidden />
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
      {state !== undefined && <div className="border-t border-border-subtle p-3">{state}</div>}
    </div>
  );
}

function Row({ onActivate, selected, onKeyDown, className, children, ...rest }: DataTableRowProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
    onKeyDown?.(event);
    if (onActivate === undefined || event.defaultPrevented) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onActivate();
    }
  };
  return (
    <tr
      {...(onActivate === undefined ? {} : { tabIndex: 0, onClick: onActivate })}
      {...(selected === undefined ? {} : { 'aria-selected': selected })}
      {...rest}
      onKeyDown={handleKeyDown}
      className={cn('group/row h-8 hover:bg-surface-row-hover aria-selected:bg-surface-row-selected', className)}
    >
      {children}
    </tr>
  );
}

function Cell({ rowHeader = false, numeric, mono, className, children, ...rest }: DataTableCellProps) {
  const cellClassName = cn(
    'min-h-8 border-b border-border-subtle px-3 py-1 text-left align-middle font-normal group-last/row:border-b-0 first:border-l-2 first:border-l-transparent group-aria-selected/row:first:border-l-accent-primary',
    numeric && 'text-right tabular-nums whitespace-nowrap',
    mono && 'font-mono text-xs',
    className,
  );
  return rowHeader ? (
    <th scope="row" className={cellClassName} {...(rest as ThHTMLAttributes<HTMLTableCellElement>)}>{children}</th>
  ) : (
    <td className={cellClassName} {...rest}>{children}</td>
  );
}

DataTable.Row = Row;
DataTable.Cell = Cell;
