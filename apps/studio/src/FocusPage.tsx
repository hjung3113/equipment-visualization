import { useEffect, useId, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, ChartGantt, Inbox, Info, MapPinOff, ServerCrash } from 'lucide-react';
import {
  bindingLayout, replayTimeline, replayTimelineFrame, seekSceneState, siteWallClockSchema, stepSceneState, wallClockToMillis,
  type ReplayInput, type ReplayTimeline, type ReplayTimelineFrame, type SceneState, type SiteWallClock,
} from '@eqv/core';
import { TopViewer } from '@eqv/renderer';
import {
  CursorStateList, DataQualityList, EvidenceDetail, FocusGantt, focusRange, illustrativeGhosts, OccurrenceList, PlaybackControls, recordSteps,
  usePlayback, type PlaybackScheduler,
} from '@eqv/replay';
import { GANTT_SPAN_LIMIT, TIMELINE_BUDGET, loadFocus, timelineCost, type FocusLoad } from './focus-data.js';
import { Button, Callout, Checkbox, EmptyState, Input, Label } from '@fops/ui';
import { EvidenceBadge, LoadingBlock, Page, Panel, StateMessage, Tabs, TabsContent, TabsList, TabsTrigger, ViewerZoomControls } from '@eqv/ui';
import { Link, hrefFor, navigate } from './router.js';
import { windowHex } from './onboarding-data.js';
import { WindowPicker } from './WindowPicker.js';

type Range = { from: SiteWallClock; to: SiteWallClock };
type View = {
  /** What the load depends on (`loadKey` in `FocusPage`): the result, range, cursor and selections all belong to it. */
  loadKey: string;
  entryKey: string;
  result: FocusLoad | null;
  /** The user-applied range; null means the entry's default. */
  applied: Range | null;
  draft: { from: string; to: string } | null;
  rangeError: string | null;
  /** null means the entry's default cursor. */
  cursor: SiteWallClock | null;
  selectedOccurrenceId: string | null;
  selectedComponentId: string | null;
  expanded: ReadonlySet<string>;
  /** `sequence`: every view shows `stepSceneState` at that Record Sequence instead of the time cursor's seek. */
  mode: { kind: 'time' } | { kind: 'sequence'; seq: number };
  /** Example-motion ghosts; page-local, off by default. */
  illustrative: boolean;
};
type Tab = 'list' | 'quality' | 'detail';
const TABS: { id: Tab; label: string }[] = [
  { id: 'list', label: 'Occurrence 목록' },
  { id: 'quality', label: 'Data Quality' },
  { id: 'detail', label: '근거 상세' },
];

const message = (error: unknown) => error instanceof Error ? error.message : '알 수 없는 오류';
const PICKER_HINT = '재생·Gantt·목록이 이 window 하나를 씁니다. 기본은 진입 Occurrence를 담은 가장 늦은 window, 없으면 가장 늦은 window이며, 고른 window는 주소(?window=)에 남습니다.';
const count = (value: number) => value.toLocaleString('en-US');

function parseRange(from: string, to: string): { range: Range } | { error: string } {
  const a = siteWallClockSchema.safeParse(from);
  const b = siteWallClockSchema.safeParse(to);
  if (!a.success || !b.success) return { error: 'Site Wall-clock 형식(YYYY-MM-DDTHH:mm:ss.fff)이 아닙니다' };
  try {
    if (!(wallClockToMillis(a.data) < wallClockToMillis(b.data))) return { error: '시작은 끝보다 앞서야 합니다' };
  } catch (error) {
    return { error: message(error) };
  }
  return { range: { from: a.data, to: b.data } };
}

export function FocusPage({ equipmentId, sampleWindow, entityType, anchor, scheduler, timelineBudget = TIMELINE_BUDGET, ganttSpanLimit = GANTT_SPAN_LIMIT }: {
  equipmentId: string; sampleWindow: string | null; entityType: string | null; anchor: string | null;
  /** Largest `timelineCost` (records + breakpoints × (context + (open + inversions) × resolve)) the Gantt is computed for; tests only, `TIMELINE_BUDGET` by default. */
  timelineBudget?: number;
  /** Most Gantt spans (materials + activities + markers) drawn; tests only, `GANTT_SPAN_LIMIT` by default. */
  ganttSpanLimit?: number;
  /** Frame clock for playback; tests only, the browser's by default. */
  scheduler?: PlaybackScheduler;
}) {
  const entryKey = JSON.stringify([entityType, anchor]);
  // The anchor only picks the window when `?window=` is absent, so it is part of the load only then.
  const loadKey = JSON.stringify([equipmentId, sampleWindow, sampleWindow === null ? anchor : null]);
  const fresh = (): View => ({ loadKey, entryKey, result: null, applied: null, draft: null, rangeError: null, cursor: null,
    selectedOccurrenceId: null, selectedComponentId: null, expanded: new Set(), mode: { kind: 'time' }, illustrative: false });
  const [view, setView] = useState<View>(fresh);
  const [tab, setTab] = useState<Tab>('list');
  // The zoom controls render into the Top View panel header (not over the fixed-width viewer, where a narrow page clips them).
  const [zoomHost, setZoomHost] = useState<HTMLElement | null>(null);
  const rangeId = useId();
  const rangeFormId = `${rangeId}-form`;
  const rangeErrorId = `${rangeId}-error`;
  // Everything below belongs to the load key and the entry key: a change clears it during render, and a late result of a
  // previous load is dropped by the effect cleanup. The cursor, range and selection belong to one batch.
  if (view.loadKey !== loadKey) setView(fresh());
  else if (view.entryKey !== entryKey) setView({ ...view, entryKey, applied: null, draft: null, rangeError: null, cursor: null, mode: { kind: 'time' } });

  useEffect(() => {
    let cancelled = false;
    loadFocus(equipmentId, { ...(sampleWindow === null ? {} : { window: sampleWindow }), anchor }).then((result) => {
      if (!cancelled) setView((previous) => previous.loadKey === loadKey ? { ...previous, result } : previous);
    });
    return () => { cancelled = true; };
  }, [loadKey]);

  const { result } = view;
  const ok = result?.kind === 'ok' ? result : null;
  const entry = useMemo(() => ok ? focusRange(ok.batch, { entityType, anchor }) : null, [ok, entityType, anchor]);
  const range = view.applied ?? entry?.range ?? null;
  const rawCursor = view.cursor ?? entry?.cursor ?? null;
  const cursor = range && rawCursor && rawCursor >= range.from && rawCursor < range.to ? rawCursor : range?.from ?? null;

  const input = useMemo((): ReplayInput | null => ok ? { batch: ok.batch, layouts: ok.layouts, layoutRevisions: ok.layoutRevisions, bindings: ok.bindings, mappings: ok.mappings } : null, [ok]);
  const framed = useMemo((): { frame: ReplayTimelineFrame } | { error: string } | null => {
    if (!input || !range) return null;
    try {
      return { frame: replayTimelineFrame(input, range) };
    } catch (error) {
      return { error: message(error) };
    }
  }, [input, range]);
  const frame = framed && 'frame' in framed ? framed.frame : null;
  const cost = useMemo(() => input && frame ? timelineCost(input, frame) : null, [input, frame]);
  const tooLarge = cost !== null && cost.cost > timelineBudget;
  // The Gantt is the only view that needs the full timeline; above the budget everything else still runs on `input` and `frame`.
  const computed = useMemo((): { timeline: ReplayTimeline } | { error: string } | null => {
    if (!input || !range || cost === null || tooLarge) return null;
    try {
      return { timeline: replayTimeline(input, range) };
    } catch (error) {
      return { error: message(error) };
    }
  }, [input, range, cost, tooLarge]);
  const computedTimeline = computed && 'timeline' in computed ? computed.timeline : null;
  const spans = computedTimeline ? computedTimeline.materials.length + computedTimeline.activities.length + computedTimeline.markers.length : 0;
  const tooManySpans = spans > ganttSpanLimit;
  const timeline = tooManySpans ? null : computedTimeline;
  const steps = useMemo(() => ok && range ? recordSteps(ok.batch, range) : [], [ok, range]);
  const { mode } = view;
  const sequenceSeq = mode.kind === 'sequence' && steps.some((s) => s.seq === mode.seq) ? mode.seq : null;
  const sceneState = useMemo((): SceneState | { error: string } | null => {
    if (!input || !frame || !cursor) return null;
    try {
      return sequenceSeq !== null ? stepSceneState(input, sequenceSeq) : seekSceneState(input, cursor);
    } catch (error) {
      return { error: message(error) };
    }
  }, [input, frame, cursor, sequenceSeq]);
  const state = sceneState && !('error' in sceneState) ? sceneState : null;
  const layout = input ? bindingLayout(input, state?.binding) : null;
  const selectedId = view.selectedOccurrenceId;
  const highlight = useMemo(() => {
    if (!state || selectedId === null) return null;
    const ids = [
      ...state.materials.filter((m) => m.occurrenceId === selectedId && m.location).map((m) => m.location!.componentId),
      ...state.components.filter((c) => c.occurrenceIds.includes(selectedId)).map((c) => c.componentId),
    ];
    return ids.length ? { componentIds: [...new Set(ids)] } : null;
  }, [state, selectedId]);
  const ghosts = useMemo(
    () => view.illustrative && input && state ? illustrativeGhosts(input, state, layout) : null,
    [view.illustrative, input, state, layout]);
  const replay = useMemo(() => state ? { state, ...(ghosts ? { illustrative: ghosts } : {}) } : null, [state, ghosts]);

  const patch = (changes: Partial<View>) => setView((previous) => ({ ...previous, ...changes }));
  const playback = usePlayback({ cursor, range, onCursorChange: (at) => patch({ cursor: at }), resetKey: JSON.stringify([loadKey, entryKey]), scheduler });
  const shownAt = state?.at ?? null;
  const breakpoints = frame?.breakpoints ?? [];
  const previousBreakpoint = shownAt === null ? undefined : [...breakpoints].reverse().find((t) => t < shownAt);
  const nextBreakpoint = shownAt === null ? undefined : breakpoints.find((t) => t > shownAt);
  const toTime = (at: SiteWallClock) => patch({ cursor: at, mode: { kind: 'time' } });
  const stepBreakpoint = (at: SiteWallClock) => { playback.pause(); toTime(at); };
  const stepIndex = sequenceSeq === null ? -1 : steps.findIndex((s) => s.seq === sequenceSeq);
  const entryStep = !state ? undefined : state.appliedSeq === null ? steps[0] : steps.filter((s) => s.seq <= state.appliedSeq!).at(-1);
  const enterSequence = () => {
    if (!entryStep) return;
    playback.pause();
    patch({ mode: { kind: 'sequence', seq: entryStep.seq } });
  };
  const moveStep = (index: number) => { const step = steps[index]; if (step) patch({ mode: { kind: 'sequence', seq: step.seq } }); };
  const draft = view.draft ?? (range ? { from: range.from, to: range.to } : { from: '', to: '' });
  const apply = () => {
    const parsed = parseRange(draft.from, draft.to);
    if ('error' in parsed) { patch({ rangeError: parsed.error }); return; }
    const outside = cursor === null || cursor < parsed.range.from || cursor >= parsed.range.to;
    patch({ applied: parsed.range, draft: null, rangeError: null, mode: { kind: 'time' }, ...(outside ? { cursor: parsed.range.from } : {}) });
  };
  const select = (id: string, moveCursor: boolean) => {
    const start = ok?.batch.occurrences.find((o) => o.id === id)?.start.at ?? null;
    const move = moveCursor && start !== null && range !== null && start >= range.from && start < range.to;
    patch({ selectedOccurrenceId: id, ...(move ? { cursor: start, mode: { kind: 'time' } } : {}) });
  };

  return (
    <Page title={<>Focus · <code>{equipmentId}</code></>}
      description={anchor !== null ? <span title={`${entityType ?? '—'} / ${anchor}`}>진입 키: <code>{entityType ?? '—'}</code> / <code>{anchor}</code></span> : '진입 키 없음'}
      breadcrumb={{ label: '경로', items: [
        { key: 'fleet', label: 'Fleet', href: hrefFor({ name: 'fleet' }) },
        { key: 'equipment', label: equipmentId, href: hrefFor({ name: 'equipment', equipmentId }) },
      ] }} linkComponent={Link}
      actions={result?.kind === 'ok' ? (
        <Button asChild variant="secondary" size="toolbar">
          <Link href={hrefFor({ name: 'onboarding', equipmentId, window: sampleWindow ?? windowHex(result.selectedWindow) })}>
            <ArrowRight className="size-3.5" aria-hidden />Onboarding으로 이동
          </Link>
        </Button>
      ) : result?.kind === 'not-found' || result?.kind === 'error' ? (
        <Button asChild variant="secondary" size="toolbar">
          <Link href={hrefFor({ name: 'fleet' })}><ArrowRight className="size-3.5" aria-hidden />Fleet으로 이동</Link>
        </Button>
      ) : undefined}>
      <WindowPicker equipmentId={equipmentId} hint={PICKER_HINT}
        value={sampleWindow ?? (ok ? windowHex(ok.selectedWindow) : null)}
        details={ok ? { dataGeneration: ok.batch.dataGeneration, timeDomain: ok.batch.timeDomain, hash: ok.selectedWindow.hash } : null}
        onChange={(hex) => navigate(hrefFor({ name: 'focus', equipmentId, entityType, anchor, window: hex }))} />
      {result === null ? <LoadingBlock label="불러오는 중…" /> : result.kind === 'not-found' ? (
        <StateMessage icon={MapPinOff} title="설비를 찾을 수 없습니다" body="등록된 설비 기록이 없습니다." />
      ) : result.kind === 'no-observations' ? (
        <StateMessage icon={Inbox} title="Sample Window를 가져오세요"
          body="이 설비는 등록되었지만 아직 가져온 관측이 없습니다. 재생할 Sample Window가 없습니다."
          action={<Button asChild variant="secondary" size="sm"><Link href={hrefFor({ name: 'equipment', equipmentId })}>설비 데이터 열기</Link></Button>} />
      ) : result.kind === 'error' ? (
        <StateMessage tone="danger" icon={ServerCrash} title="데이터 오류" body={result.error} />
      ) : (
        <>
          {[...result.notices, ...(entry?.notice ? [entry.notice] : [])].map((notice) => (
            <Callout key={notice} tone="blue" icon={<Info className="size-3.5" aria-hidden />} className="mb-2">
              <span role="status">{notice}</span>
            </Callout>
          ))}
          {range && (
            <Panel title="재생 구간" className="mb-4" actions={
              <Button type="submit" form={rangeFormId} variant="secondary" size="toolbar"><ArrowRight className="size-3.5" aria-hidden />적용</Button>
            }>
              <form id={rangeFormId} aria-label="구간" className="grid gap-3" onSubmit={(event) => { event.preventDefault(); apply(); }}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1">
                    <Label htmlFor={`${rangeId}-from`}>시작</Label>
                    <Input id={`${rangeId}-from`} type="text" className="w-full max-w-72" value={draft.from}
                      aria-invalid={view.rangeError !== null} aria-describedby={view.rangeError ? rangeErrorId : undefined}
                      onChange={(event) => patch({ draft: { ...draft, from: event.target.value } })} />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`${rangeId}-to`}>끝</Label>
                    <Input id={`${rangeId}-to`} type="text" className="w-full max-w-72" value={draft.to}
                      aria-invalid={view.rangeError !== null} aria-describedby={view.rangeError ? rangeErrorId : undefined}
                      onChange={(event) => patch({ draft: { ...draft, to: event.target.value } })} />
                  </div>
                </div>
                {view.rangeError && <p id={rangeErrorId} role="alert" className="m-0 text-xs text-text-danger-label">{view.rangeError}</p>}
              </form>
            </Panel>
          )}
          {framed && 'error' in framed && <StateMessage compact tone="danger" icon={ServerCrash} title={`Replay 오류: ${framed.error}`} />}
          {computed && 'error' in computed && <StateMessage compact tone="danger" icon={ServerCrash} title={`Replay 오류: ${computed.error}`} />}
          {sceneState && 'error' in sceneState && <StateMessage compact tone="danger" icon={ServerCrash} title={`Replay 오류: ${sceneState.error}`} />}
          {input && frame && state && cursor && (
            <>
              <PlaybackControls playing={playback.playing} onPlay={() => { patch({ mode: { kind: 'time' } }); playback.play(); }} onPause={playback.pause}
                speed={playback.speed} onSpeedChange={playback.setSpeed}
                onPreviousBreakpoint={previousBreakpoint === undefined ? null : () => stepBreakpoint(previousBreakpoint)}
                onNextBreakpoint={nextBreakpoint === undefined ? null : () => stepBreakpoint(nextBreakpoint)}
                sequence={{ available: entryStep !== undefined || sequenceSeq !== null,
                  unavailableReason: '이 시점까지 적용된 record가 구간 안에 없어 Sequence step을 쓸 수 없습니다', active: sequenceSeq !== null,
                  onToggle: () => sequenceSeq !== null ? patch({ mode: { kind: 'time' } }) : enterSequence(),
                  onPrevious: stepIndex > 0 ? () => moveStep(stepIndex - 1) : null,
                  onNext: stepIndex >= 0 && stepIndex < steps.length - 1 ? () => moveStep(stepIndex + 1) : null,
                  step: sequenceSeq === null ? null : { seq: sequenceSeq, at: state.at } }} />
              <div className="flex flex-wrap items-start gap-4">
                <Panel title="Top View" className="max-w-full min-w-0 flex-none overflow-auto"
                  actions={<>
                    <span ref={setZoomHost} className="contents" />
                    <Checkbox id={`${rangeId}-illustrative`} checked={view.illustrative} onCheckedChange={(value) => patch({ illustrative: value === true })} />
                    <Label htmlFor={`${rangeId}-illustrative`}>예시 이동 표시</Label>
                    {view.illustrative && <EvidenceBadge level="illustrative">예시 이동</EvidenceBadge>}
                  </>}>
                  {layout ? (
                    <TopViewer layout={layout} width={720} height={420} replay={replay} highlight={highlight}
                      selectedId={view.selectedComponentId} onSelectedChange={(id) => patch({ selectedComponentId: id })}
                      renderControls={(controls) => zoomHost && createPortal(<ViewerZoomControls controls={controls} labels={{ zoomIn: '확대', zoomOut: '축소', fit: '맞춤' }} />, zoomHost)} />
                  ) : <EmptyState size="sm" icon={<MapPinOff className="size-4" aria-hidden />} title="이 시점에 적용된 Binding이 없어 Top View를 표시할 수 없습니다" />}
                </Panel>
                <div className="min-w-0 flex-1 basis-96">
                  <CursorStateList state={state} {...(ghosts ? { illustrative: ghosts } : {})} />
                </div>
              </div>
              <Panel title="Gantt">
                {timeline ? (
                  <FocusGantt timeline={timeline} layout={layout} batch={ok!.batch} cursor={state.at}
                    onCursorChange={toTime} selectedOccurrenceId={selectedId}
                    onSelectOccurrence={(id) => select(id, false)} selectedComponentId={view.selectedComponentId}
                    expanded={view.expanded} onToggleExpand={(id) => setView((previous) => {
                      const expanded = new Set(previous.expanded);
                      if (!expanded.delete(id)) expanded.add(id);
                      return { ...previous, expanded };
                    })} />
                ) : tooLarge ? (
                  <StateMessage tone="warning" icon={ChartGantt} title="구간이 커서 Gantt를 그리지 않습니다"
                    body={`범위를 좁히세요. 지금 범위는 record ${count(cost.records)}개 + breakpoint ${count(cost.breakpoints)}개 × (읽기마다 Binding·Layout 탐색 ${count(cost.context)} + (동시 open Occurrence ${count(cost.open)}개 + 시간 역전 ${count(cost.inversions)}개) × 위치 해석 ${count(cost.resolve)}) = ${count(cost.cost)}로 Gantt 계산 한도 ${count(timelineBudget)}을 넘습니다. Top View·커서 시점 상태·Occurrence 목록·Data Quality·근거 상세는 그대로 씁니다.`} />
                ) : tooManySpans && (
                  <StateMessage tone="warning" icon={ChartGantt} title="구간이 커서 Gantt를 그리지 않습니다"
                    body={`범위를 좁히세요. 지금 범위의 Gantt 막대는 ${count(spans)}개로 그리기 한도 ${count(ganttSpanLimit)}개를 넘습니다. Top View·커서 시점 상태·Occurrence 목록·Data Quality·근거 상세는 그대로 씁니다.`} />
                )}
              </Panel>
              <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)} className="mt-4">
                <TabsList aria-label="Focus 상세">
                  {TABS.map((item) => <TabsTrigger key={item.id} value={item.id}>{item.label}</TabsTrigger>)}
                </TabsList>
                <TabsContent value="list">
                  <OccurrenceList batch={ok!.batch} timeline={frame} bindings={ok!.bindings} appliedSeq={state.appliedSeq}
                    anchorOccurrenceId={anchor} selectedOccurrenceId={selectedId} onSelectOccurrence={(id) => select(id, true)} />
                </TabsContent>
                <TabsContent value="quality"><DataQualityList timeline={frame} appliedSeq={state.appliedSeq} onSelectOccurrence={(id) => select(id, true)} /></TabsContent>
                <TabsContent value="detail"><EvidenceDetail batch={ok!.batch} state={state} selectedOccurrenceId={selectedId} /></TabsContent>
              </Tabs>
            </>
          )}
        </>
      )}
    </Page>
  );
}
