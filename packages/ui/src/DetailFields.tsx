import type { ReactNode } from 'react';
import { FieldList, FieldRow } from '@ap/ui';

export interface DetailField {
  key: string;
  label: string;
  value: ReactNode;
  mono?: boolean;
}

export interface DetailFieldsProps {
  items: readonly DetailField[];
}

/** Label/value list on `@ap/ui` `FieldList` + `FieldRow layout="detail"` (`dl`/`dt`/`dd`): the platform's detail-panel property list. */
export function DetailFields({ items }: DetailFieldsProps) {
  return (
    <FieldList>
      {items.map((item) => (
        <FieldRow key={item.key} label={item.label} layout="detail" mono={item.mono}>{item.value}</FieldRow>
      ))}
    </FieldList>
  );
}
