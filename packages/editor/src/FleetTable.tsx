import type { ReactNode } from 'react';
import type { FleetRow, FleetStatus } from './fleet.js';

export interface FleetTableProps {
  rows: readonly FleetRow[];
  /** The host owns routing: it wraps the equipment id in its own link. */
  renderLink: (equipmentId: string, children: ReactNode) => ReactNode;
}

const STATUS_TEXT: Record<FleetStatus, string> = { unstarted: '○ 미착수', draft: '◐ 초안', published: '● 게시됨' };
const percent = (ratio: number | null) => ratio === null ? '—' : `${Math.round(ratio * 100)}%`;

export function FleetTable({ rows, renderLink }: FleetTableProps) {
  return (
    <table className="eqv-ed-table">
      <thead>
        <tr>
          {['설비', 'Maker', 'Model', '상태', '커버리지', 'assumed 비율', '미매핑 참조'].map((name) =>
            <th key={name} scope="col">{name}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.equipmentId}>
            <th scope="row">{renderLink(row.equipmentId, row.equipmentId)}</th>
            <td>{row.maker ?? '—'}</td>
            <td>{row.model ?? '—'}</td>
            {row.error !== null ? (
              <td colSpan={4} className="eqv-ed-error">⚠ 오류: {row.error}</td>
            ) : (
              <>
                <td className={`eqv-ed-status eqv-ed-status-${row.status}`}>{STATUS_TEXT[row.status!]}</td>
                <td>{percent(row.coverage?.references.ratio ?? null)}</td>
                <td>{percent(row.assumedRatio)}</td>
                <td className="eqv-ed-num">{row.unmappedReferences}</td>
              </>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
