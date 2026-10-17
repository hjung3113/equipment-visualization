import type { ReplayTimeline } from '@eqv/core';
import { NO_TIME } from './words.js';

export interface DataQualityListProps {
  timeline: ReplayTimeline;
  onSelectOccurrence: (id: string) => void;
}

export function DataQualityList({ timeline, onSelectOccurrence }: DataQualityListProps) {
  if (timeline.issues.length === 0) return <p className="eqv-rp-empty">이 구간에 Data Quality Issue가 없습니다</p>;
  return (
    <div className="eqv-rp-table-scroll" role="region" aria-label="Data Quality 표" tabIndex={0}>
      <table className="eqv-rp-table" aria-label="Data Quality">
        <thead>
          <tr><th scope="col">시각</th><th scope="col">Record Sequence</th><th scope="col">종류</th><th scope="col">id</th><th scope="col">관련 Occurrence</th></tr>
        </thead>
        <tbody>
          {[...timeline.issues].sort((a, b) => a.seq - b.seq).map((issue) => (
            <tr key={issue.id}>
              <td>{issue.at ?? NO_TIME}</td>
              <td className="eqv-rp-num">{issue.seq}</td>
              <td>{issue.issueType}</td>
              <td>{issue.id}</td>
              <td>
                {issue.relatedOccurrenceId === undefined ? '—' : (
                  <button type="button" className="eqv-rp-btn" aria-label={`관련 Occurrence ${issue.relatedOccurrenceId} 선택`}
                    onClick={() => onSelectOccurrence(issue.relatedOccurrenceId!)}>{issue.relatedOccurrenceId}</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
