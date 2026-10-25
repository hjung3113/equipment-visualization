import { useId, type ReactNode } from 'react';
import { StatusBadge, type Tone } from '@ap/ui';
import { DataTable } from '@eqv/ui';
import type { FleetRow, FleetStatus } from './fleet.js';

export interface FleetTableProps {
  rows: readonly FleetRow[];
  /** The host owns routing: it wraps the equipment id in its own link. */
  renderLink: (equipmentId: string, children: ReactNode, row: FleetRow) => ReactNode;
  /** The host owns row actions and their routing. */
  renderActions?: (row: FleetRow) => ReactNode;
}

const STATUS: Record<FleetStatus, { text: string; tone: Tone }> = {
  unstarted: { text: '미착수', tone: 'neutral' },
  draft: { text: '초안', tone: 'warning' },
  published: { text: '게시됨', tone: 'success' },
  drift: { text: 'Drift', tone: 'warning' },
  'no-observations': { text: '관측 없음', tone: 'neutral' },
};
const NUMERIC_COLUMNS = ['커버리지', 'assumed 비율', '미매핑 참조'].map((header) => ({ id: header, header, align: 'end' as const }));
const percent = (ratio: number | null) => ratio === null ? '—' : `${Math.round(ratio * 100)}%`;

export function FleetTable({ rows, renderLink, renderActions }: FleetTableProps) {
  const descriptionId = useId();
  return (
    <DataTable
      label="Fleet 표" aria-describedby={descriptionId} title="설비 목록"
      subtitle={<span id={descriptionId}>커버리지: 해석된 참조 수 / 전체 참조 수(무시한 alias 제외). assumed 비율: assumed 규칙으로 해석된 참조 수 / 해석된 참조 수.</span>}
      columns={['설비', 'Maker', 'Model', '상태', ...NUMERIC_COLUMNS, ...(renderActions === undefined ? [] : ['동작'])]}
    >
        {rows.map((row) => (
          <DataTable.Row key={row.equipmentId}>
            <DataTable.Cell rowHeader className="whitespace-nowrap">{renderLink(row.equipmentId, row.equipmentId, row)}</DataTable.Cell>
            <DataTable.Cell>{row.maker ?? '—'}</DataTable.Cell>
            <DataTable.Cell>{row.model ?? '—'}</DataTable.Cell>
            {row.error !== null ? (
              <DataTable.Cell colSpan={renderActions === undefined ? 4 : 5}><StatusBadge tone="danger" dot>오류</StatusBadge> {row.error}</DataTable.Cell>
            ) : (
              <>
                <DataTable.Cell><StatusBadge tone={STATUS[row.status!].tone} dot>{STATUS[row.status!].text}</StatusBadge></DataTable.Cell>
                <DataTable.Cell numeric>{percent(row.coverage?.references.ratio ?? null)}</DataTable.Cell>
                <DataTable.Cell numeric>{percent(row.assumedRatio)}</DataTable.Cell>
                <DataTable.Cell numeric>{row.unmappedReferences ?? '—'}</DataTable.Cell>
                {renderActions !== undefined && <DataTable.Cell action>{renderActions(row)}</DataTable.Cell>}
              </>
            )}
          </DataTable.Row>
        ))}
    </DataTable>
  );
}
