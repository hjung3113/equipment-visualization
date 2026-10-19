import type { ReactNode } from 'react';
import { cn } from '@fops/ui';

export interface DetailField {
  key: string;
  label: ReactNode;
  value: ReactNode;
  mono?: boolean;
}

export interface DetailFieldsProps {
  items: readonly DetailField[];
}

/** Label/value list (AP `DetailDrawer` fields): `dl` semantics, long values wrap inside the column. */
export function DetailFields({ items }: DetailFieldsProps) {
  return (
    <dl className="m-0">
      {items.map((item) => (
        <div key={item.key} className="grid grid-cols-[9rem_1fr] gap-3 border-b border-border-subtle py-1.5 text-sm last:border-b-0">
          <dt className="min-w-0 break-words text-text-muted">{item.label}</dt>
          <dd className={cn('m-0 min-w-0 [overflow-wrap:anywhere] text-text-primary', item.mono ? 'font-mono text-xs' : 'tabular-nums')}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
