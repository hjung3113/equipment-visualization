import type { ReactNode } from 'react';
import { cn, FieldList, FieldRow } from '@ap/ui';

export interface DetailField {
  key: string;
  label: string;
  value: ReactNode;
  mono?: boolean;
}

export interface DetailFieldsProps {
  items: readonly DetailField[];
}

/** Label/value list on `@ap/ui` `FieldList` + `FieldRow` (`dl`/`dt`/`dd`); long labels and values wrap inside their column. */
export function DetailFields({ items }: DetailFieldsProps) {
  return (
    <FieldList>
      {items.map((item) => (
        <FieldRow key={item.key} label={item.label} layout="property" className="[&>dt]:min-w-0 [&>dt]:break-words">
          <div className={cn('min-w-0 [overflow-wrap:anywhere]', item.mono ? 'font-mono text-xs' : 'tabular-nums')}>{item.value}</div>
        </FieldRow>
      ))}
    </FieldList>
  );
}
