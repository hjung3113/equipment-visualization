import type { HTMLAttributes, KeyboardEvent, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '@fops/ui';

export interface DataTableProps extends Omit<HTMLAttributes<HTMLTableElement>, 'aria-label' | 'children'> {
  /** Accessible name of the table; also names its scroll region. */
  label: string;
  columns: readonly string[];
  children: ReactNode;
}

export interface DataTableRowProps extends Omit<HTMLAttributes<HTMLTableRowElement>, 'onClick'> {
  /** Makes the row focusable and fires on click, Enter and Space. Arrow-key navigation stays with the consumer. */
  onActivate?: () => void;
  /** Sets `aria-selected`; leave undefined for rows that are not selectable. */
  selected?: boolean;
}

export interface DataTableCellProps extends TdHTMLAttributes<HTMLTableCellElement> {
  /** Renders a `<th scope="row">` instead of a `<td>`. */
  rowHeader?: boolean;
}

/** Dense table, AP `table-density`: 32px minimum row and header height, 4px 12px cell padding. */
export function DataTable({ label, columns, children, className, ...rest }: DataTableProps) {
  return (
    <div role="region" aria-label={label} tabIndex={0} className="overflow-x-auto rounded-lg border border-border-subtle bg-surface-card">
      <table aria-label={label} className={cn('w-full border-collapse text-sm text-text-primary', className)} {...rest}>
        <thead>
          <tr className="h-8 border-b border-border-subtle">
            {columns.map((name) => (
              <th key={name} scope="col" className="bg-surface-card-elevated px-3 py-1 text-left text-xs font-medium uppercase text-text-secondary">
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
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
      className={cn('h-8 border-b border-border-subtle hover:bg-surface-row-hover aria-selected:bg-surface-row-selected', className)}
    >
      {children}
    </tr>
  );
}

function Cell({ rowHeader = false, className, children, ...rest }: DataTableCellProps) {
  const cellClassName = cn('min-h-8 px-3 py-1 text-left align-top font-normal', className);
  return rowHeader ? (
    <th scope="row" className={cellClassName} {...(rest as ThHTMLAttributes<HTMLTableCellElement>)}>{children}</th>
  ) : (
    <td className={cellClassName} {...rest}>{children}</td>
  );
}

DataTable.Row = Row;
DataTable.Cell = Cell;
