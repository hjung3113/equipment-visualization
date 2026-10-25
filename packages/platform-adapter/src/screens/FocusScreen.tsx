import { useState } from 'react';
import type { ModuleScreenProps } from '@ap/contracts';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@ap/ui';
import { FocusView, type FocusTab } from '@eqv/views';
import { useReplayScreen } from '../use-replay-input.js';
import { useDetailSlot } from './detail-slot.js';
import { stateFor } from './states.js';

/**
 * `eqv:focus`. Top View, Gantt and Occurrence list on one cursor over the applied time. With the host's detail slot the evidence of
 * the selected Occurrence goes there as is (the label is the slot header; `EvidenceDetail` already has its own section structure, so
 * no `DetailPanelReadingColumn` wrapper); without it `FocusView` keeps its inline "근거 상세" tab. No Journey link: Journey is not
 * in the platform scope.
 */
export function FocusScreen({ host }: ModuleScreenProps) {
  const { props, load, resetKey } = useReplayScreen(host);
  const renderDetail = useDetailSlot(host);
  const [tab, setTab] = useState<FocusTab>('list');
  const state = stateFor(props, load);
  if (state !== null || load?.kind !== 'ready' || props.equipment === null) return <div>{state}</div>;
  const { equipment } = props;
  return (
    <FocusView input={load.input} notices={load.notices} entityType={props.entityType} anchor={props.anchor} resetKey={resetKey}
      range={{ value: props.range, onChange: (range) => host.setPage({ rangeFrom: range.from, rangeTo: range.to }, { replace: true }) }}
      tab={tab} onTabChange={setTab} {...(renderDetail ? { renderDetail } : {})}
      links={{ actions: <Button variant="secondary" size="toolbar" onClick={() => host.navigate({ screen: 'topview', page: { equipment } })}><ArrowLeft className="size-3.5" aria-hidden />Top View로</Button> }} />
  );
}
