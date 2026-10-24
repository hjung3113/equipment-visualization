import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ModuleScreenProps } from '@ap/contracts';
import { ArrowRight, MapPinOff, MousePointerClick, ServerCrash } from 'lucide-react';
import { Button, EmptyState, FieldRow } from '@ap/ui';
import { bindingLayout, seekSceneState, type EquipmentLayoutDocument, type ReplayInput, type SceneState, type SiteWallClock } from '@eqv/core';
import { TopViewer, type ReplayOverlay } from '@eqv/renderer';
import { ACTIVITY_KO, CursorStateList, Evidence } from '@eqv/replay';
import { Panel, StateMessage, ViewerZoomControls } from '@eqv/ui';
import { NoticeList } from '@eqv/views';
import { useReplayScreen } from '../use-replay-input.js';
import { useDetailSlot, usePublishDetail, type DetailPayload } from './detail-slot.js';
import { stateFor } from './states.js';

type Scene = { state: SceneState; layout: EquipmentLayoutDocument | null } | { error: string };

function ComponentDetail({ layout, state, componentId }: { layout: EquipmentLayoutDocument; state: SceneState; componentId: string }) {
  const component = layout.components.find((c) => c.id === componentId);
  const activity = state.components.find((c) => c.componentId === componentId);
  if (!component) return <EmptyState size="sm" icon={<MousePointerClick className="size-4" aria-hidden />} title={`Component ${componentId}를 찾을 수 없습니다`} />;
  return (
    <section aria-label={`Component 상세 ${component.id}`} className="text-text-primary">
      <FieldRow label="Component" layout="property">{component.id}</FieldRow>
      <FieldRow label="라벨" layout="property">{component.label}</FieldRow>
      <FieldRow label="역할" layout="property">{component.role}</FieldRow>
      <FieldRow label="활동" layout="property">
        {activity ? <>{ACTIVITY_KO[activity.activity as keyof typeof ACTIVITY_KO] ?? '기록된 활동 없음'} · 활동 근거 <Evidence level={activity.activityEvidence} /></> : '이 시점에 Binding이 없어 알 수 없음'}
      </FieldRow>
    </section>
  );
}

function sceneAt(input: ReplayInput, to: SiteWallClock): Scene {
  try {
    const state = seekSceneState(input, to);
    return { state, layout: bindingLayout(input, state.binding) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * `eqv:topview` (the primary screen). The layout effective at the end of the applied window with the scene state as of `to`
 * (`seekSceneState`, evidence labels exactly as the reducer gives them). A selected Component's detail goes to the host's slot,
 * or an inline panel without `detailSlot`.
 */
export function TopViewScreen({ host }: ModuleScreenProps) {
  const { props, load, resetKey } = useReplayScreen(host);
  const publish = useDetailSlot(host);
  const [selection, setSelection] = useState<{ key: string; id: string | null }>({ key: resetKey, id: null });
  const [zoomHost, setZoomHost] = useState<HTMLElement | null>(null);
  const input = load?.kind === 'ready' ? load.input : null;
  const to = props.time.kind === 'applied' ? props.time.to : null;
  const scene = useMemo(() => input && to ? sceneAt(input, to) : null, [input, to]);
  const ready = scene && !('error' in scene) ? scene : null;
  const replay = useMemo((): ReplayOverlay | null => ready ? { state: ready.state } : null, [ready]);
  // The selection belongs to the load: another equipment or window clears it.
  if (selection.key !== resetKey) setSelection({ key: resetKey, id: null });
  const selectedId = selection.key === resetKey ? selection.id : null;
  const detail = useMemo((): DetailPayload => ready?.layout && selectedId !== null
    ? { node: <ComponentDetail layout={ready.layout} state={ready.state} componentId={selectedId} />, label: `Component · ${selectedId}` } : null, [ready, selectedId]);
  usePublishDetail(publish, detail);

  const state = stateFor(props, load);
  if (state !== null || load?.kind !== 'ready' || props.equipment === null) return <div>{state}</div>;
  const { equipment } = props;
  if (scene === null || 'error' in scene) return <StateMessage tone="danger" icon={ServerCrash} title={`Replay 오류: ${scene?.error ?? ''}`} />;
  return (
    <>
      <NoticeList notices={load.notices} />
      <div className="flex flex-wrap items-start gap-4">
        <Panel title="Top View" subtitle={scene.state.at} className="max-w-full min-w-0 flex-none overflow-auto"
          actions={<>
            <span ref={setZoomHost} className="contents" />
            <Button variant="secondary" size="toolbar" onClick={() => host.navigate({ screen: 'focus', page: { equipment } })}><ArrowRight className="size-3.5" aria-hidden />Focus 열기</Button>
          </>}>
          {scene.layout ? (
            <TopViewer layout={scene.layout} width={720} height={420} replay={replay} selectedId={selectedId}
              onSelectedChange={(id) => setSelection({ key: resetKey, id })}
              renderControls={(controls) => zoomHost && createPortal(<ViewerZoomControls controls={controls} labels={{ zoomIn: '확대', zoomOut: '축소', fit: '맞춤' }} />, zoomHost)} />
          ) : <EmptyState size="sm" icon={<MapPinOff className="size-4" aria-hidden />} title="이 시점에 적용된 Binding이 없어 Top View를 표시할 수 없습니다" />}
        </Panel>
        <div className="min-w-0 flex-1 basis-96">
          <CursorStateList state={scene.state} />
          {!publish && scene.layout && (
            <Panel title="Component 상세" className="mt-4">
              {selectedId === null
                ? <EmptyState size="sm" icon={<MousePointerClick className="size-4" aria-hidden />} title="Component를 선택하세요" />
                : <ComponentDetail layout={scene.layout} state={scene.state} componentId={selectedId} />}
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
