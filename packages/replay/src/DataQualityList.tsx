import { useMemo, useState } from 'react';
import type { ReplayTimeline } from '@eqv/core';
import { Inbox } from 'lucide-react';
import { Button, EmptyState } from '@ap/ui';
import { DataTable } from '@eqv/ui';
import { NO_TIME, wallClockText } from './words.js';

export interface DataQualityListProps {
  timeline: Pick<ReplayTimeline, 'issues'>;
  /** `SceneState.appliedSeq` at the cursor: the list opens on the issue at it (it does not follow the cursor afterwards). */
  appliedSeq?: number | null;
  onSelectOccurrence: (id: string) => void;
}

const COLUMNS = [
  { id: 'time', header: '시각', className: 'whitespace-nowrap' },
  { id: 'sequence', header: 'Record Sequence', align: 'end', className: 'whitespace-nowrap' },
  { id: 'kind', header: '종류' },
  { id: 'id', header: 'id', className: 'whitespace-nowrap' },
  { id: 'related-occurrence', header: '관련 Occurrence', className: 'whitespace-nowrap' },
] as const;

export function DataQualityList({ timeline, appliedSeq = null, onSelectOccurrence }: DataQualityListProps) {
  const issues = useMemo(() => [...timeline.issues].sort((a, b) => a.seq - b.seq), [timeline.issues]);
  const [opening] = useState(() => appliedSeq === null ? 0 : Math.max(issues.findLastIndex((issue) => issue.seq <= appliedSeq), 0));
  if (issues.length === 0) {
    return <DataTable label="Data Quality" columns={COLUMNS} state={
      <EmptyState size="sm" density="compact" icon={<Inbox className="size-4" aria-hidden />} title="이 구간에 Data Quality Issue가 없습니다" />
    }>{null}</DataTable>;
  }
  return (
    <DataTable label="Data Quality" columns={COLUMNS} rows={{
      count: issues.length,
      getKey: (index) => issues[index]!.id,
      initialIndex: opening,
      render: (index) => {
        const issue = issues[index]!;
        return (
          <DataTable.Row>
            <DataTable.Cell className="whitespace-nowrap">{issue.at === null ? NO_TIME : wallClockText(issue.at)}</DataTable.Cell>
            <DataTable.Cell numeric>{issue.seq}</DataTable.Cell>
            <DataTable.Cell>{issue.issueType}</DataTable.Cell>
            <DataTable.Cell mono>{issue.id}</DataTable.Cell>
            <DataTable.Cell>
              {issue.relatedOccurrenceId === undefined ? '—' : (
                <Button type="button" variant="link" size="sm" aria-label={`관련 Occurrence ${issue.relatedOccurrenceId} 선택`}
                  onClick={() => onSelectOccurrence(issue.relatedOccurrenceId!)}><span className="font-mono text-xs">{issue.relatedOccurrenceId}</span></Button>
              )}
            </DataTable.Cell>
          </DataTable.Row>
        );
      },
    }} />
  );
}
