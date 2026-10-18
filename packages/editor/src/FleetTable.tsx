import { useId, type ReactNode } from 'react';
import { Circle, CircleCheck, CircleDashed, Inbox, TriangleAlert, type LucideIcon } from 'lucide-react';
import { DataTable, StatusBadge, type StatusBadgeProps } from '@eqv/ui';
import type { FleetRow, FleetStatus } from './fleet.js';

export interface FleetTableProps {
  rows: readonly FleetRow[];
  /** The host owns routing: it wraps the equipment id in its own link. */
  renderLink: (equipmentId: string, children: ReactNode, row: FleetRow) => ReactNode;
}

const STATUS: Record<FleetStatus, { text: string; tone: StatusBadgeProps['tone']; icon: LucideIcon }> = {
  unstarted: { text: '미착수', tone: 'neutral', icon: Circle },
  draft: { text: '초안', tone: 'warning', icon: CircleDashed },
  published: { text: '게시됨', tone: 'success', icon: CircleCheck },
  'no-observations': { text: '관측 없음', tone: 'neutral', icon: Inbox },
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
            <DataTable.Cell rowHeader className="whitespace-nowrap">{renderLink(row.equipmentId, row.equipmentId, row)}</DataTable.Cell>
            <DataTable.Cell>{row.maker ?? '—'}</DataTable.Cell>
            <DataTable.Cell>{row.model ?? '—'}</DataTable.Cell>
            {row.error !== null ? (
              <DataTable.Cell colSpan={4}><StatusBadge tone="danger" icon={TriangleAlert}>오류</StatusBadge> {row.error}</DataTable.Cell>
            ) : (
              <>
                <DataTable.Cell><StatusBadge tone={STATUS[row.status!].tone} icon={STATUS[row.status!].icon}>{STATUS[row.status!].text}</StatusBadge></DataTable.Cell>
                <DataTable.Cell>{percent(row.coverage?.references.ratio ?? null)}</DataTable.Cell>
                <DataTable.Cell>{percent(row.assumedRatio)}</DataTable.Cell>
                <DataTable.Cell><span className="tabular-nums">{row.unmappedReferences ?? '—'}</span></DataTable.Cell>
              </>
            )}
          </DataTable.Row>
        ))}
      </DataTable>
      <p id={descriptionId}>커버리지: 해석된 참조 수 / 전체 참조 수(무시한 alias 제외). assumed 비율: assumed 규칙으로 해석된 참조 수 / 해석된 참조 수.</p>
    </>
  );
}
