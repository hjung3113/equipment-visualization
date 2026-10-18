import type { ReplayTimeline } from '@eqv/core';
import { Button } from '@fops/ui';
import { DataTable } from '@eqv/ui';
import { capNotice, rowSlice } from './row-cap.js';
import { NO_TIME } from './words.js';

export interface DataQualityListProps {
  timeline: Pick<ReplayTimeline, 'issues'>;
  /** `SceneState.appliedSeq` at the cursor: a capped list shows the issues around it. */
  appliedSeq?: number | null;
  onSelectOccurrence: (id: string) => void;
}

const COLUMNS = ['시각', 'Record Sequence', '종류', 'id', '관련 Occurrence'];

export function DataQualityList({ timeline, appliedSeq = null, onSelectOccurrence }: DataQualityListProps) {
  if (timeline.issues.length === 0) return <p className="text-text-secondary">이 구간에 Data Quality Issue가 없습니다</p>;
  const issues = [...timeline.issues].sort((a, b) => a.seq - b.seq);
  const slice = rowSlice(issues.length, appliedSeq === null ? 0 : Math.max(issues.findLastIndex((issue) => issue.seq <= appliedSeq), 0));
  return (
    <div>
      {slice.capped && <p role="status" className="mb-2 text-text-secondary">{capNotice('Data Quality Issue', issues.length, slice)}</p>}
      <DataTable label="Data Quality" columns={COLUMNS}>
      {issues.slice(slice.start, slice.end).map((issue) => (
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
    </div>
  );
}
