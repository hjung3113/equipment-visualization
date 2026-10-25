import type { SceneState } from '@eqv/core';
import { MoveRight, Inbox } from 'lucide-react';
import { DataTable, Panel } from '@eqv/ui';
import { Callout, EmptyState, FieldRow, PanelSectionTitle, StatusBadge } from '@ap/ui';
import type { IllustrativeGhost } from './ghosts.js';
import { Evidence } from './Evidence.js';
import { ACTIVITY_KO, UNKNOWN_LANE, wallClockText } from './words.js';

const COMPONENT_COLUMNS = [
  { id: 'component', header: 'Component', className: 'whitespace-nowrap' },
  { id: 'activity', header: '활동' },
  { id: 'evidence', header: '근거', className: 'whitespace-nowrap' },
] as const;

const MATERIAL_COLUMNS = [
  { id: 'material', header: '물질', className: 'whitespace-nowrap' },
  { id: 'location', header: '위치' },
  { id: 'location-evidence', header: '위치 근거', className: 'whitespace-nowrap' },
  { id: 'identity-evidence', header: '식별 근거', className: 'whitespace-nowrap' },
] as const;

export interface CursorStateListProps {
  state: SceneState;
  /** Example-motion ghosts, passed only while the page's illustrative toggle is on. */
  illustrative?: readonly IllustrativeGhost[];
}

/** Text equivalent of the Top View replay layer at the cursor (the SVG layer is `aria-hidden`). */
export function CursorStateList({ state, illustrative = [] }: CursorStateListProps) {
  const active = state.components.filter((c) => c.activity !== 'no recorded activity');
  return (
    <Panel title="커서 시점 상태" subtitle={wallClockText(state.at)}>
      <FieldRow label="Binding" layout="property">
        {state.binding ? <span className="break-all">{state.binding.layoutId} · {state.binding.mappingHash}</span> : '적용된 Binding 없음'}
      </FieldRow>
      <PanelSectionTitle size="tiny">Component 활동</PanelSectionTitle>
      <DataTable label="Component 활동" columns={COMPONENT_COLUMNS} state={active.length === 0 ? (
        <EmptyState size="sm" density="compact" icon={<Inbox className="size-4" aria-hidden />} title="기록된 활동 없음" />
      ) : undefined}>
        {active.map((component) => (
          <DataTable.Row key={component.componentId}>
            <DataTable.Cell mono>{component.componentId}</DataTable.Cell>
            <DataTable.Cell>{ACTIVITY_KO[component.activity as keyof typeof ACTIVITY_KO]}</DataTable.Cell>
            <DataTable.Cell className="whitespace-nowrap"><Evidence level={component.activityEvidence} /></DataTable.Cell>
          </DataTable.Row>
        ))}
      </DataTable>

      <PanelSectionTitle size="tiny">물질</PanelSectionTitle>
      <DataTable label="물질" columns={MATERIAL_COLUMNS} state={state.materials.length === 0 ? (
        <EmptyState size="sm" density="compact" icon={<Inbox className="size-4" aria-hidden />} title="열려 있는 물질 없음" />
      ) : undefined}>
        {state.materials.map((material) => (
          <DataTable.Row key={material.key}>
            <DataTable.Cell rowHeader mono>{material.kind} {material.id ?? '익명'}</DataTable.Cell>
            <DataTable.Cell>{material.location === null ? UNKNOWN_LANE
              : `${material.location.componentId}${material.location.holdingSiteId === undefined ? '' : ` / ${material.location.holdingSiteId}`}`}</DataTable.Cell>
            <DataTable.Cell className="whitespace-nowrap"><Evidence level={material.locationEvidence} /></DataTable.Cell>
            <DataTable.Cell className="whitespace-nowrap"><Evidence level={material.identityEvidence} /></DataTable.Cell>
          </DataTable.Row>
        ))}
      </DataTable>

      {illustrative.length > 0 && (
        <Callout tone="cyan" title="예시 이동" icon={<MoveRight className="size-3.5" aria-hidden />} className="mt-3">
          <ul className="my-0 list-disc pl-5">
            {illustrative.map((ghost) => (
              <li key={ghost.materialKey}>{ghost.label}: {ghost.fromComponentId} → {ghost.toComponentId} · 예시 이동 (관측 아님)</li>
            ))}
          </ul>
        </Callout>
      )}

      {state.markers.length > 0 && (
        <>
          <PanelSectionTitle size="tiny">표식</PanelSectionTitle>
          <ul className="my-0 flex flex-wrap gap-2">
            {state.markers.map((marker) => {
              switch (marker.kind) {
                case 'after-watermark': return <li key={marker.kind}><StatusBadge tone="warning" dot>Watermark 이후 ({wallClockText(marker.watermarkAt)})</StatusBadge></li>;
                case 'time-anomaly': return <li key={`${marker.kind}:${marker.occurrenceId}`}><StatusBadge tone="danger" dot>시각 역전 ({marker.occurrenceId})</StatusBadge></li>;
                case 'occupancy-conflict':
                  return <li key={`${marker.kind}:${marker.componentId}:${marker.holdingSiteId}`}><StatusBadge tone="danger" dot>점유 충돌 ({marker.componentId} / {marker.holdingSiteId}: {marker.materialKeys.join(', ')})</StatusBadge></li>;
                case 'unmapped-alias': return <li key={`${marker.kind}:${marker.alias}:${marker.occurrenceId}`}><StatusBadge tone="warning" dot>미매핑 alias ({marker.alias}, {marker.occurrenceId})</StatusBadge></li>;
              }
            })}
          </ul>
        </>
      )}
    </Panel>
  );
}
