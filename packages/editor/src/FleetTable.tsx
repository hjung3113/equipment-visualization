import { useId, type ReactNode } from 'react';
import { DataTable } from '@eqv/ui';
import type { FleetRow, FleetStatus } from './fleet.js';

export interface FleetTableProps {
  rows: readonly FleetRow[];
  /** The host owns routing: it wraps the equipment id in its own link. */
  renderLink: (equipmentId: string, children: ReactNode) => ReactNode;
}

const STATUS_TEXT: Record<FleetStatus, string> = { unstarted: '○ 미착수', draft: '◐ 초안', published: '● 게시됨' };
const STATUS_TONE: Record<FleetStatus, string> = {
  unstarted: 'text-text-secondary', draft: 'text-text-warning-label', published: 'text-accent-primary',
};
const percent = (ratio: number | null) => ratio === null ? '—' : `${Math.round(ratio * 100)}%`;

export function FleetTable({ rows, renderLink }: FleetTableProps) {
  const descriptionId = useId();
  return (
    <>
      <DataTable
        label="Fleet 표" aria-describedby={descriptionId}
        columns={['설비', 'Maker', 'Model', '상태', '커버리지', 'assumed 비율', '미매핑 참조']}
      >
        {rows.map((row) => (
          <DataTable.Row key={row.equipmentId}>
            <DataTable.Cell rowHeader>{renderLink(row.equipmentId, row.equipmentId)}</DataTable.Cell>
            <DataTable.Cell>{row.maker ?? '—'}</DataTable.Cell>
            <DataTable.Cell>{row.model ?? '—'}</DataTable.Cell>
            {row.error !== null ? (
              <DataTable.Cell colSpan={4}><span className="font-semibold text-text-danger">⚠ 오류: {row.error}</span></DataTable.Cell>
            ) : (
              <>
                <DataTable.Cell><span className={`whitespace-nowrap font-semibold ${STATUS_TONE[row.status!]}`}>{STATUS_TEXT[row.status!]}</span></DataTable.Cell>
                <DataTable.Cell>{percent(row.coverage?.references.ratio ?? null)}</DataTable.Cell>
                <DataTable.Cell>{percent(row.assumedRatio)}</DataTable.Cell>
                <DataTable.Cell><span className="tabular-nums">{row.unmappedReferences}</span></DataTable.Cell>
              </>
            )}
          </DataTable.Row>
        ))}
      </DataTable>
      <p id={descriptionId}>커버리지: 해석된 참조 수 / 전체 참조 수(무시한 alias 제외). assumed 비율: assumed 규칙으로 해석된 참조 수 / 해석된 참조 수.</p>
    </>
  );
}
