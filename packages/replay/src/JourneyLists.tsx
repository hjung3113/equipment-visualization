import type { ReactNode } from 'react';
import type { JourneyBoundary, JourneyExecution, JourneyHop, JourneyLocation } from '@eqv/core';
import { Inbox } from 'lucide-react';
import { DataTable } from '@eqv/ui';
import { EmptyState } from '@fops/ui';
import { Evidence } from './Evidence.js';
import { NO_TIME, UNKNOWN_LANE, clock } from './words.js';

export interface JourneyHopListProps {
  hops: readonly JourneyHop[];
  /** The selected hop's number. */
  selectedHop: number | null;
  onSelectHop: (number: number) => void;
  /** Row action slot (the Focus link); the package does not know the Studio router. */
  renderAction?: (hop: JourneyHop) => ReactNode;
}

export interface JourneyExecutionListProps {
  executions: readonly JourneyExecution[];
  selectedOccurrenceId?: string | null;
  onSelectOccurrence?: (occurrenceId: string) => void;
}

const HOP_COLUMNS = [
  { id: 'number', header: '#', align: 'end' },
  { id: 'location', header: '위치' },
  { id: 'location-evidence', header: '위치 근거' },
  { id: 'identity-evidence', header: '식별 근거' },
  { id: 'arrival', header: '도착', className: 'whitespace-nowrap' },
  { id: 'departure', header: '떠남', className: 'whitespace-nowrap' },
  { id: 'action', header: '동작' },
] as const;
const EXECUTION_COLUMNS = [
  { id: 'kind', header: '종류', className: 'whitespace-nowrap' },
  { id: 'location', header: '위치' },
  { id: 'location-evidence', header: '위치 근거' },
  { id: 'identity-evidence', header: '식별 근거' },
  { id: 'start', header: '시작', className: 'whitespace-nowrap' },
  { id: 'end', header: '끝', className: 'whitespace-nowrap' },
] as const;
const KIND_KO = { PROCESS: '처리', POST_PROCESS: '후처리', FUNCTION: '기능' } as const;

const where = (location: JourneyLocation | null, moduleAlias: string | null) => location
  ? location.holdingSiteId === undefined ? location.componentId : `${location.componentId} / ${location.holdingSiteId}`
  : moduleAlias === null ? UNKNOWN_LANE : `${UNKNOWN_LANE} (alias ${moduleAlias})`;

function Boundary({ boundary, open }: { boundary: JourneyBoundary | null; open?: string }) {
  const text = boundary === null ? open : `${boundary.at === null ? NO_TIME : clock(boundary.at)} · seq ${boundary.seq}`;
  return <div className="flex items-center gap-2"><span>{text}</span><Evidence level={boundary === null ? 'unknown' : boundary.evidence} /></div>;
}

export function JourneyHopList({ hops, selectedHop, onSelectHop, renderAction }: JourneyHopListProps) {
  return (
    <DataTable label="물리 경유 목록" columns={HOP_COLUMNS}>
      {hops.map((hop) => (
        <DataTable.Row key={hop.number} data-hop={hop.number} selected={hop.number === selectedHop} onActivate={() => onSelectHop(hop.number)}>
          <DataTable.Cell rowHeader numeric>{hop.number}</DataTable.Cell>
          <DataTable.Cell className="whitespace-nowrap">{where(hop.location, hop.alias.moduleAlias)}</DataTable.Cell>
          <DataTable.Cell className="whitespace-nowrap"><Evidence level={hop.locationEvidence} /></DataTable.Cell>
          <DataTable.Cell className="whitespace-nowrap"><Evidence level={hop.identityEvidence} /></DataTable.Cell>
          <DataTable.Cell className="whitespace-nowrap"><Boundary boundary={hop.arrival} /></DataTable.Cell>
          <DataTable.Cell className="whitespace-nowrap"><Boundary boundary={hop.departure} open="열림" /></DataTable.Cell>
          <DataTable.Cell>{renderAction?.(hop)}</DataTable.Cell>
        </DataTable.Row>
      ))}
    </DataTable>
  );
}

export function JourneyExecutionList({ executions, selectedOccurrenceId = null, onSelectOccurrence }: JourneyExecutionListProps) {
  if (executions.length === 0) {
    return <DataTable label="실행 이력 목록" columns={EXECUTION_COLUMNS} state={
      <EmptyState size="sm" density="compact" icon={<Inbox className="size-4" aria-hidden />} title="실행 이력이 없습니다" />
    }>{null}</DataTable>;
  }
  return (
    <DataTable label="실행 이력 목록" columns={EXECUTION_COLUMNS}>
      {executions.map((row) => (
        <DataTable.Row key={row.occurrenceId} data-occurrence-id={row.occurrenceId} selected={onSelectOccurrence ? row.occurrenceId === selectedOccurrenceId : undefined}
          {...(onSelectOccurrence ? { onActivate: () => onSelectOccurrence(row.occurrenceId) } : {})}>
          <DataTable.Cell rowHeader className="whitespace-nowrap">{KIND_KO[row.kind]}</DataTable.Cell>
          <DataTable.Cell className="whitespace-nowrap">{where(row.location, row.alias?.moduleAlias ?? null)}</DataTable.Cell>
          <DataTable.Cell className="whitespace-nowrap"><Evidence level={row.locationEvidence} /></DataTable.Cell>
          <DataTable.Cell className="whitespace-nowrap"><Evidence level={row.identityEvidence} /></DataTable.Cell>
          <DataTable.Cell className="whitespace-nowrap"><Boundary boundary={row.start} /></DataTable.Cell>
          <DataTable.Cell className="whitespace-nowrap"><Boundary boundary={row.end} open="열림" /></DataTable.Cell>
        </DataTable.Row>
      ))}
    </DataTable>
  );
}
