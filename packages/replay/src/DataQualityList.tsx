import type { ReplayTimeline } from '@eqv/core';
import { Button } from '@fops/ui';
import { DataTable } from '@eqv/ui';
import { NO_TIME } from './words.js';

export interface DataQualityListProps {
  timeline: Pick<ReplayTimeline, 'issues'>;
  onSelectOccurrence: (id: string) => void;
}

const COLUMNS = ['시각', 'Record Sequence', '종류', 'id', '관련 Occurrence'];

export function DataQualityList({ timeline, onSelectOccurrence }: DataQualityListProps) {
  if (timeline.issues.length === 0) return <p className="text-text-secondary">이 구간에 Data Quality Issue가 없습니다</p>;
  return (
    <DataTable label="Data Quality" columns={COLUMNS}>
      {[...timeline.issues].sort((a, b) => a.seq - b.seq).map((issue) => (
        <DataTable.Row key={issue.id}>
          <DataTable.Cell className="whitespace-nowrap">{issue.at ?? NO_TIME}</DataTable.Cell>
          <DataTable.Cell className="whitespace-nowrap">{issue.seq}</DataTable.Cell>
          <DataTable.Cell>{issue.issueType}</DataTable.Cell>
          <DataTable.Cell className="whitespace-nowrap">{issue.id}</DataTable.Cell>
          <DataTable.Cell>
            {issue.relatedOccurrenceId === undefined ? '—' : (
              <Button type="button" variant="outline" size="toolbar" aria-label={`관련 Occurrence ${issue.relatedOccurrenceId} 선택`}
                onClick={() => onSelectOccurrence(issue.relatedOccurrenceId!)}>{issue.relatedOccurrenceId}</Button>
            )}
          </DataTable.Cell>
        </DataTable.Row>
      ))}
    </DataTable>
  );
}
