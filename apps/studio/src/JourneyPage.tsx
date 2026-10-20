import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Inbox, Info, MapPinOff, ServerCrash, SearchX } from 'lucide-react';
import {
  bindingLayout, materialJourney, stepSceneState, type MaterialJourney, type Occurrence, type ReplayInput,
} from '@eqv/core';
import { TopViewer, type JourneyHopMark } from '@eqv/renderer';
import { Evidence, JourneyExecutionList, JourneyHopList } from '@eqv/replay';
import { Button, Callout, EmptyState } from '@fops/ui';
import { LoadingBlock, Page, Panel, StateMessage, Tabs, TabsContent, TabsList, TabsTrigger, ViewerZoomControls } from '@eqv/ui';
import { loadFocus, type FocusLoad } from './focus-data.js';
import { windowHex } from './onboarding-data.js';
import { Link, hrefFor } from './router.js';

type Tab = 'visits' | 'executions';
const TABS: { id: Tab; label: string }[] = [
  { id: 'visits', label: '물리 경유' },
  { id: 'executions', label: '실행 이력' },
];
type Loaded = { loadKey: string; result: FocusLoad | null; selectedHop: number | null; selectedOccurrenceId: string | null };

const message = (error: unknown) => error instanceof Error ? error.message : '알 수 없는 오류';
const none = (anchor: string | null, found: Occurrence | undefined): string | null =>
  anchor === null ? 'anchor가 없습니다'
    : found === undefined ? 'Occurrence를 찾을 수 없습니다'
      : found.material?.kind !== 'wafer' || found.material.id === null ? 'wafer id가 없는 Occurrence입니다' : null;

export function JourneyPage({ equipmentId, sampleWindow, anchor }: { equipmentId: string; sampleWindow: string | null; anchor: string | null }) {
  // The anchor only picks the window when `?window=` is absent, so it is part of the load only then (as in Focus).
  const loadKey = JSON.stringify([equipmentId, sampleWindow, sampleWindow === null ? anchor : null]);
  const fresh = (): Loaded => ({ loadKey, result: null, selectedHop: null, selectedOccurrenceId: null });
  const [view, setView] = useState<Loaded>(fresh);
  const [tab, setTab] = useState<Tab>('visits');
  // The zoom controls render into the Top View panel header, as in Focus.
  const [zoomHost, setZoomHost] = useState<HTMLElement | null>(null);
  if (view.loadKey !== loadKey) setView(fresh());

  useEffect(() => {
    let cancelled = false;
    loadFocus(equipmentId, { ...(sampleWindow === null ? {} : { window: sampleWindow }), anchor }).then((result) => {
      if (!cancelled) setView((previous) => previous.loadKey === loadKey ? { ...previous, result } : previous);
    });
    return () => { cancelled = true; };
  }, [loadKey]);

  const { result } = view;
  const ok = result?.kind === 'ok' ? result : null;
  const anchorOccurrence = ok && anchor !== null ? ok.batch.occurrences.find((o) => o.id === anchor) : undefined;
  const invalid = ok ? none(anchor, anchorOccurrence) : null;
  const waferId = anchorOccurrence?.material?.id ?? null;
  const input = useMemo((): ReplayInput | null => ok ? { batch: ok.batch, layouts: ok.layouts, layoutRevisions: ok.layoutRevisions, bindings: ok.bindings, mappings: ok.mappings } : null, [ok]);
  const computed = useMemo((): { journey: MaterialJourney; binding: ReturnType<typeof stepSceneState>['binding'] } | { error: string } | null => {
    if (!input || !anchorOccurrence || invalid !== null) return null;
    try {
      return { journey: materialJourney(input, `m:wafer:${waferId}`), binding: stepSceneState(input, anchorOccurrence.start.seq).binding };
    } catch (error) {
      return { error: message(error) };
    }
  }, [input, anchorOccurrence, invalid, waferId]);
  const journey = computed && 'journey' in computed ? computed.journey : null;
  const binding = computed && 'journey' in computed ? computed.binding : null;
  const layout = input ? bindingLayout(input, binding) : null;
  // Only hops placed on a Component of the Layout that is on screen are drawn; the others stay in the lists.
  const marks = useMemo((): JourneyHopMark[] => (journey?.hops ?? []).flatMap((hop) => hop.location !== null && binding !== null
    && hop.layoutId === binding.layoutId && hop.layoutRevision === binding.layoutRevision
    ? [{ number: hop.number, componentId: hop.location.componentId, evidence: hop.locationEvidence }] : []), [journey, binding]);
  const selectedMark = marks.find((mark) => mark.number === view.selectedHop) ?? null;
  const highlight = useMemo(() => selectedMark ? { componentIds: [selectedMark.componentId] } : null, [selectedMark]);
  const overlay = useMemo(() => ({ hops: marks, selected: selectedMark?.number ?? null }), [marks, selectedMark]);

  const patch = (changes: Partial<Loaded>) => setView((previous) => ({ ...previous, ...changes }));
  const windowRef = sampleWindow ?? (ok ? windowHex(ok.selectedWindow) : null);
  const focusHref = (occurrenceId: string | null) => hrefFor({ name: 'focus', equipmentId, entityType: null, anchor: occurrenceId, window: windowRef });
  const focusLink = (occurrenceId: string | null) => (
    <Button asChild variant="secondary" size="toolbar"><Link href={focusHref(occurrenceId)}>Focus 열기</Link></Button>
  );

  return (
    <Page title={waferId !== null && invalid === null ? <>Journey · <code>{waferId}</code></> : 'Journey'}
      breadcrumb={{ label: '경로', items: [
        { key: 'fleet', label: 'Fleet', href: hrefFor({ name: 'fleet' }) },
        { key: 'equipment', label: equipmentId, href: hrefFor({ name: 'equipment', equipmentId }) },
        { key: 'focus', label: 'Focus', href: focusHref(anchor) },
      ] }} linkComponent={Link}>
      {result === null ? <LoadingBlock label="불러오는 중…" /> : result.kind === 'not-found' ? (
        <StateMessage icon={MapPinOff} title="설비를 찾을 수 없습니다" body="등록된 설비 기록이 없습니다." />
      ) : result.kind === 'no-observations' ? (
        <StateMessage icon={Inbox} title="Sample Window를 가져오세요"
          body="이 설비는 등록되었지만 아직 가져온 관측이 없습니다. 볼 Sample Window가 없습니다."
          action={<Button asChild variant="secondary" size="sm"><Link href={hrefFor({ name: 'equipment', equipmentId })}>설비 데이터 열기</Link></Button>} />
      ) : result.kind === 'error' ? (
        <StateMessage tone="danger" icon={ServerCrash} title="데이터 오류" body={result.error} />
      ) : invalid !== null ? (
        <StateMessage icon={SearchX} title="이 anchor로 Journey를 열 수 없습니다" body={invalid}
          action={<Button asChild variant="secondary" size="sm"><Link href={focusHref(anchor)}>Focus 열기</Link></Button>} />
      ) : computed && 'error' in computed ? (
        <StateMessage tone="danger" icon={ServerCrash} title={`Journey 계산 오류: ${computed.error}`} />
      ) : journey && (
        <>
          {result.notices.map((notice) => (
            <Callout key={notice} tone="blue" icon={<Info className="size-3.5" aria-hidden />} className="mb-2">
              <span role="status">{notice}</span>
            </Callout>
          ))}
          <div className="m-0 mb-3 flex flex-wrap items-center gap-2 text-sm text-text-muted">
            <span>Sample Window <code>{result.selectedWindow.from} – {result.selectedWindow.to}</code></span>
            <span>wafer <code>{waferId}</code> 식별 근거</span>
            <Evidence level={anchorOccurrence!.material!.identityEvidence} />
          </div>
          <Panel title="Top View" className="mb-4 max-w-full min-w-0 flex-none overflow-auto" actions={<span ref={setZoomHost} className="contents" />}>
            {layout ? (
              <TopViewer layout={layout} width={720} height={420} journey={overlay} highlight={highlight}
                selectedId={selectedMark?.componentId ?? null}
                onSelectedChange={(id) => patch({ selectedOccurrenceId: null, selectedHop: id === null ? null : marks.find((mark) => mark.componentId === id)?.number ?? null })}
                renderControls={(controls) => zoomHost && createPortal(<ViewerZoomControls controls={controls} labels={{ zoomIn: '확대', zoomOut: '축소', fit: '맞춤' }} />, zoomHost)} />
            ) : <EmptyState size="sm" icon={<MapPinOff className="size-4" aria-hidden />} title="이 시점에 적용된 Binding이 없어 Top View를 표시할 수 없습니다" />}
          </Panel>
          <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
            <TabsList aria-label="Journey 상세">
              {TABS.map((item) => <TabsTrigger key={item.id} value={item.id}>{item.label}</TabsTrigger>)}
            </TabsList>
            <TabsContent value="visits">
              <JourneyHopList hops={journey.hops} selectedHop={view.selectedHop} onSelectHop={(number) => patch({ selectedHop: number, selectedOccurrenceId: null })}
                renderAction={(hop) => focusLink(hop.occurrenceIds[0]!)} />
            </TabsContent>
            <TabsContent value="executions">
              <JourneyExecutionList executions={journey.executions} selectedOccurrenceId={view.selectedOccurrenceId}
                onSelectOccurrence={(id) => patch({ selectedOccurrenceId: id, selectedHop: journey.hops.find((hop) => hop.occurrenceIds.includes(id))?.number ?? null })} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </Page>
  );
}
