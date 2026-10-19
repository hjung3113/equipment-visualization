import { cloneElement, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { HTMLAttributes, Key, KeyboardEvent, ReactElement, ReactNode, Ref, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
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

/** At or above this many rows `rows` windows the body; below it every row renders as plain DOM. */
export const VIRTUAL_ROW_THRESHOLD = 200;

/** Rows by index instead of `children`, for tables that can hold thousands of rows. Implies `capped`. */
export interface DataTableRows {
  count: number;
  /**
   * One `DataTable.Row` per index. The table adds `key`, `data-index`, `aria-rowindex` and the measuring `ref` to it.
   * `rendered` is the inclusive index window of the rows in the DOM now (every row below the threshold), for a roving tab stop.
   */
  render: (index: number, rendered: { start: number; end: number }) => ReactElement<DataTableRowProps>;
  /** Row height before it is measured, in px. Default 32. */
  estimateSize?: number;
  /** Stable key per index; default the index. */
  getKey?: (index: number) => Key;
  /** First position when the table mounts (centred); `scrollToIndex` wins when both are set. */
  initialIndex?: number;
  /** Brings this row into the scroll viewport whenever the value changes; a no-op while it is visible. Only the table scrolls, never the page. */
  scrollToIndex?: number | null;
  /** Scrolls to `scrollToIndex` again when this value changes, also when the index did not: a repeated key command. */
  scrollKey?: number;
}

export interface DataTableProps extends Omit<HTMLAttributes<HTMLTableElement>, 'aria-label' | 'children' | 'title'> {
  /** Accessible name of the table; also names its scroll region. */
  label: string;
  /** A string is `{ id: header, header }`. */
  columns: readonly (string | DataTableColumn)[];
  /** `DataTable.Row` elements only; pass `rows` instead for a long table. */
  children?: ReactNode;
  rows?: DataTableRows;
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
  /** React 19 passes `ref` as a prop; the virtual table merges its measuring ref with this one. */
  ref?: Ref<HTMLTableRowElement>;
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
  label, columns, children, rows, className, title, subtitle, actions, headingLevel = 2, count, state, capped, sort, onSortChange, ...rest
}: DataTableProps) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const hasHeader = title !== undefined || actions !== undefined;
  const aboveRegion = hasHeader || count !== undefined;
  const region = useRef<HTMLDivElement>(null);
  const tbody = useRef<HTMLTableSectionElement>(null);
  const virtualRows = rows !== undefined && rows.count >= VIRTUAL_ROW_THRESHOLD ? rows : undefined;
  const virtual = virtualRows !== undefined;
  const [bodyOffset, setBodyOffset] = useState(0);
  // The sticky header covers the top of the viewport: items start below it, and a scrolled-to row must clear it.
  useLayoutEffect(() => {
    if (region.current === null || tbody.current === null) return;
    setBodyOffset(Math.round(tbody.current.getBoundingClientRect().top - region.current.getBoundingClientRect().top + region.current.scrollTop));
  }, [virtual, columns.length]);
  const [start] = useState(() => rows?.scrollToIndex ?? rows?.initialIndex ?? 0);
  const mounted = useRef(false);
  // The plain table's scroll offset, tracked while it is not virtual (the virtualizer rewrites the offset on enabling).
  const scrollTop = useRef(0);
  const virtualizer = useVirtualizer({
    enabled: virtual,
    count: rows?.count ?? 0,
    getScrollElement: () => region.current,
    estimateSize: () => rows?.estimateSize ?? 32,
    getItemKey: (index) => rows?.getKey?.(index) ?? index,
    overscan: 8,
    useFlushSync: false,
    // A table that turns virtual after mount (rows grew past the threshold) opens at the offset the user had.
    initialOffset: () => (mounted.current ? scrollTop.current : start * (rows?.estimateSize ?? 32)),
    scrollMargin: bodyOffset,
    scrollPaddingStart: bodyOffset,
  });
  const target = rows?.scrollToIndex ?? null;
  const scrollKey = rows?.scrollKey;
  useEffect(() => {
    if (rows === undefined) return;
    const first = !mounted.current;
    mounted.current = true;
    const index = first ? target ?? rows.initialIndex ?? null : target;
    if (index === null || index < 0 || index >= rows.count) return;
    if (virtual) virtualizer.scrollToIndex(index, { align: first ? 'center' : 'auto' });
    else if (region.current !== null) {
      const row = region.current.querySelector<HTMLElement>(`tbody > tr[data-index="${index}"]`);
      if (row !== null) revealRow(region.current, row, bodyOffset);
    }
    // Only a new target scrolls; the virtualizer and offsets change on every render.
  }, [target, scrollKey, virtual]);
  const items = virtual ? virtualizer.getVirtualItems() : [];
  const rendered = virtual ? { start: items[0]?.index ?? 0, end: items[items.length - 1]?.index ?? 0 } : { start: 0, end: (rows?.count ?? 1) - 1 };
  const above = items.length === 0 ? 0 : items[0]!.start - bodyOffset;
  const below = items.length === 0 ? 0 : virtualizer.getTotalSize() - (items[items.length - 1]!.end - bodyOffset);
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
        ref={region}
        role="region"
        aria-label={label}
        tabIndex={0}
        onScroll={(event) => { if (!virtual) scrollTop.current = event.currentTarget.scrollTop; }}
        onFocus={(event) => {
          // Keyboard focus on a clipped row action must bring it fully into the scroll viewport (default behavior is instant, never smooth).
          if (event.target !== event.currentTarget) event.target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        }}
        className={cn('overflow-x-auto', (capped || rows !== undefined) && 'max-h-[60vh] overflow-auto overscroll-contain', aboveRegion && 'border-t border-border-subtle')}
      >
        <table aria-label={label} {...(virtualRows ? { 'aria-rowcount': virtualRows.count + 1 } : {})} className={cn('w-full border-separate border-spacing-0 text-sm text-text-primary', className)} {...rest}>
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
          <tbody ref={tbody}>
            {rows === undefined ? children : virtualRows ? (
              <>
                <Spacer height={above} columns={columns.length} />
                {items.map((item) => {
                  const element = virtualRows.render(item.index, rendered);
                  return cloneElement(element, {
                    key: item.key,
                    'data-index': item.index,
                    'aria-rowindex': item.index + 2,
                    ref: mergeRefs(element.props.ref, virtualizer.measureElement),
                  } as Partial<DataTableRowProps>);
                })}
                <Spacer height={below} columns={columns.length} />
              </>
            ) : (
              Array.from({ length: rows.count }, (_, index) => cloneElement(rows.render(index, rendered), { key: rows.getKey?.(index) ?? index, 'data-index': index } as Partial<DataTableRowProps>))
            )}
          </tbody>
        </table>
      </div>
      {state !== undefined && <div className="border-t border-border-subtle p-3">{state}</div>}
    </div>
  );
}

/** The virtualizer's runtime geometry is the one place this package sets `style` (see eslint.config.js). */
function Spacer({ height, columns }: { height: number; columns: number }) {
  return (
    <tr aria-hidden style={{ height }}>
      <td colSpan={columns} className="p-0" />
    </tr>
  );
}

function mergeRefs<T>(...refs: (Ref<T> | undefined)[]) {
  return (node: T | null) => {
    for (const ref of refs) {
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    }
  };
}

/** Scrolls only the table's own viewport so `row` clears the sticky header and the bottom edge. */
function revealRow(region: HTMLElement, row: HTMLElement, headerHeight: number) {
  const view = region.getBoundingClientRect();
  const box = row.getBoundingClientRect();
  if (box.top < view.top + headerHeight) region.scrollTop -= view.top + headerHeight - box.top;
  else if (box.bottom > view.bottom) region.scrollTop += box.bottom - view.bottom;
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
