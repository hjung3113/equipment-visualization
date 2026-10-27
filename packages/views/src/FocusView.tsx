import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, ChartGantt, MapPinOff, ServerCrash } from 'lucide-react';
import {
  bindingLayout, replayTimeline, replayTimelineFrame, parseWallClockRange, seekSceneState, stepSceneState,
  type ReplayInput, type ReplayTimeline, type ReplayTimelineFrame, type SceneState, type SiteWallClock,
} from '@eqv/core';
import { TopViewer } from '@eqv/renderer';
import {
  CursorStateList, DataQualityList, entryOccurrence, EvidenceDetail, FocusGantt, focusRange, illustrativeGhosts, OccurrenceList, PlaybackControls, recordSteps,
  usePlayback, type PlaybackScheduler,
} from '@eqv/replay';
import { Button, Checkbox, EmptyState, Input, Label } from '@ap/ui';
import { EvidenceBadge, Panel, StateMessage, Tabs, TabsContent, TabsList, TabsTrigger, ViewerZoomControls } from '@eqv/ui';
import { NoticeList } from './NoticeList.js';
import { GANTT_SPAN_LIMIT, TIMELINE_BUDGET, timelineCost } from './timeline-cost.js';

const errorMessage = (error: unknown) => error instanceof Error ? error.message : '알 수 없는 오류';

type Range = { from: SiteWallClock; to: SiteWallClock };
type View = {
  /** The host's load identity (`resetKey`): the range, cursor and selections all belong to it. */
  resetKey: string;
  entryKey: string;
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
export type FocusTab = 'list' | 'quality' | 'detail';
const TABS: { id: FocusTab; label: string }[] = [
  { id: 'list', label: 'Occurrence 목록' },
  { id: 'quality', label: 'Data Quality' },
  { id: 'detail', label: '근거 상세' },
];

const count = (value: number) => value.toLocaleString('en-US');

function parseRange(from: string, to: string): { range: Range } | { error: string } {
  const parsed = parseWallClockRange(from, to);
  if (parsed.ok) return { range: { from: parsed.from, to: parsed.to } };
  return { error: parsed.problem === 'format' ? 'Site Wall-clock 형식(YYYY-MM-DDTHH:mm:ss.fff)이 아닙니다' : '시작은 끝보다 앞서야 합니다' };
}

type FocusViewBaseProps = {
  input: ReplayInput;
  /** Shown above the range form, one status line each (anchor choice, missing Binding, draft Layout). */
  notices: readonly string[];
  entityType: string | null;
  anchor: string | null;
  /** The host's load identity: a change resets every piece of view state (range, cursor, selections, mode). */
  resetKey: string;
  /** The applied 재생 구간 held by the host (page keys), so it survives a refresh and a copied link: `value` is shown as the applied range and "적용" reports the new one through `onChange`. Absent: the view keeps the range itself (Studio). The host owns clearing it when the entry changes. */
  range?: { value: Range | null; onChange: (range: Range) => void };
  /** When given, selecting an Occurrence hands its `EvidenceDetail` to the host (null clears the slot: reset, no valid state, no selection, removal, unmount) and the inline "근거 상세" tab is omitted. The callback must be stable (memoised or a state setter): a new identity re-publishes. */
  renderDetail?: (detail: { node: ReactNode; label: string } | null) => void;
  links?: {
    /** The "Journey 열기" control for the selected wafer Occurrence; absent = no control. */
    journey?: (occurrenceId: string) => ReactNode;
    /** Extra host controls, rendered after the Journey control in the Top View panel's action area. */
    actions?: ReactNode;
  };
  /** Largest `timelineCost` (records + breakpoints × (context + (open + inversions) × resolve)) the Gantt is computed for; tests only, `TIMELINE_BUDGET` by default. */
  timelineBudget?: number;
  /** Most Gantt spans (materials + activities + markers) drawn; tests only, `GANTT_SPAN_LIMIT` by default. */
  ganttSpanLimit?: number;
  /** Frame clock for playback; tests only, the browser's by default. */
  scheduler?: PlaybackScheduler;
};

/** The selected detail tab; `tab` needs `onTabChange` (a controlled tab with no way to change is a dead tab strip). Used to keep the tab across the host's own remounts (a Studio load). */
export type FocusViewProps = FocusViewBaseProps & (
  | { tab: FocusTab; onTabChange: (tab: FocusTab) => void }
  | { tab?: undefined; onTabChange?: undefined }
);

/** Top View, Gantt and Occurrence list on one cursor, from props only (no page chrome, router or loader). */
export function FocusView({ input, notices, entityType, anchor, resetKey, range: hostRange, renderDetail, tab: controlledTab, onTabChange, links, timelineBudget = TIMELINE_BUDGET, ganttSpanLimit = GANTT_SPAN_LIMIT, scheduler }: FocusViewProps) {
  const entryKey = JSON.stringify([entityType, anchor]);
  // An anchor naming an Occurrence of the batch is the entry: it starts selected (view state only; the cursor is the entry's own).
  const entryId = entryOccurrence(input.batch, { entityType, anchor })?.id ?? null;
  const fresh = (): View => ({ resetKey, entryKey, applied: null, draft: null, rangeError: null, cursor: null,
    selectedOccurrenceId: entryId, selectedComponentId: null, expanded: new Set(), mode: { kind: 'time' }, illustrative: false });
  const [view, setView] = useState<View>(fresh);
  const [ownTab, setOwnTab] = useState<FocusTab>('list');
  // The zoom controls render into the Top View panel header (not over the fixed-width viewer, where a narrow page clips them).
  const [zoomHost, setZoomHost] = useState<HTMLElement | null>(null);
  const rangeId = useId();
  const rangeFormId = `${rangeId}-form`;
  const rangeErrorId = `${rangeId}-error`;
  // Everything below belongs to the reset key and the entry key: a change clears it during render. The cursor, range and
  // selection belong to one batch.
  if (view.resetKey !== resetKey) setView(fresh());
  else if (view.entryKey !== entryKey) setView({ ...view, entryKey, applied: null, draft: null, rangeError: null, cursor: null, selectedOccurrenceId: entryId, mode: { kind: 'time' } });

  const entry = useMemo(() => focusRange(input.batch, { entityType, anchor }), [input.batch, entityType, anchor]);
  const range = (hostRange ? hostRange.value : view.applied) ?? entry.range ?? null;
  const rawCursor = view.cursor ?? entry.cursor ?? null;
  const cursor = range && rawCursor && rawCursor >= range.from && rawCursor < range.to ? rawCursor : range?.from ?? null;

  const framed = useMemo((): { frame: ReplayTimelineFrame } | { error: string } | null => {
    if (!range) return null;
    try {
      return { frame: replayTimelineFrame(input, range) };
    } catch (error) {
      return { error: errorMessage(error) };
    }
  }, [input, range]);
  const frame = framed && 'frame' in framed ? framed.frame : null;
  const cost = useMemo(() => frame ? timelineCost(input, frame) : null, [input, frame]);
  const tooLarge = cost !== null && cost.cost > timelineBudget;
  // The Gantt is the only view that needs the full timeline; above the budget everything else still runs on `input` and `frame`.
  const computed = useMemo((): { timeline: ReplayTimeline } | { error: string } | null => {
    if (!range || cost === null || tooLarge) return null;
    try {
      return { timeline: replayTimeline(input, range) };
    } catch (error) {
      return { error: errorMessage(error) };
    }
  }, [input, range, cost, tooLarge]);
  const computedTimeline = computed && 'timeline' in computed ? computed.timeline : null;
  const spans = computedTimeline ? computedTimeline.materials.length + computedTimeline.activities.length + computedTimeline.markers.length : 0;
  const tooManySpans = spans > ganttSpanLimit;
  const timeline = tooManySpans ? null : computedTimeline;
  const steps = useMemo(() => range ? recordSteps(input.batch, range) : [], [input.batch, range]);
  const { mode } = view;
  const sequenceSeq = mode.kind === 'sequence' && steps.some((s) => s.seq === mode.seq) ? mode.seq : null;
  const sceneState = useMemo((): SceneState | { error: string } | null => {
    if (!frame || !cursor) return null;
    try {
      return sequenceSeq !== null ? stepSceneState(input, sequenceSeq) : seekSceneState(input, cursor);
    } catch (error) {
      return { error: errorMessage(error) };
    }
  }, [input, frame, cursor, sequenceSeq]);
  const state = sceneState && !('error' in sceneState) ? sceneState : null;
  const layout = bindingLayout(input, state?.binding);
  const selectedId = view.selectedOccurrenceId;
  const highlight = useMemo(() => {
    if (!state || selectedId === null) return null;
    const ids = [
      ...state.materials.filter((m) => m.occurrenceId === selectedId && m.location).map((m) => m.location!.componentId),
      ...state.components.filter((c) => c.occurrenceIds.includes(selectedId)).map((c) => c.componentId),
    ];
    return ids.length ? { componentIds: [...new Set(ids)] } : null;
  }, [state, selectedId]);
  const selectedMaterial = selectedId === null ? undefined : input.batch.occurrences.find((o) => o.id === selectedId)?.material;
  const journeyAnchor = selectedMaterial?.kind === 'wafer' && selectedMaterial.id !== null ? selectedId : null;
  const ghosts = useMemo(
    () => view.illustrative && state ? illustrativeGhosts(input, state, layout) : null,
    [view.illustrative, input, state, layout]);
  const replay = useMemo(() => state ? { state, ...(ghosts ? { illustrative: ghosts } : {}) } : null, [state, ghosts]);

  // The host's detail slot shows the evidence of the selected Occurrence at the shown state; it is cleared (null) through the
  // same callback when that stops holding, the callback is replaced or removed, and on unmount.
  const detail = useMemo(
    () => selectedId === null || !state ? null : { node: <EvidenceDetail batch={input.batch} state={state} selectedOccurrenceId={selectedId} />, label: `근거 상세 · ${selectedId}` },
    [input.batch, state, selectedId]);
  useEffect(() => {
    if (!renderDetail) return;
    renderDetail(detail);
    return () => renderDetail(null);
  }, [renderDetail, detail]);

  const patch = (changes: Partial<View>) => setView((previous) => ({ ...previous, ...changes }));
  const playback = usePlayback({ cursor, range, onCursorChange: (at) => patch({ cursor: at }), resetKey: JSON.stringify([resetKey, entryKey]), scheduler });
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
    hostRange?.onChange(parsed.range);
    patch({ applied: parsed.range, draft: null, rangeError: null, mode: { kind: 'time' }, ...(outside ? { cursor: parsed.range.from } : {}) });
  };
  const select = (id: string, moveCursor: boolean) => {
    const start = input.batch.occurrences.find((o) => o.id === id)?.start.at ?? null;
    const move = moveCursor && start !== null && range !== null && start >= range.from && start < range.to;
    patch({ selectedOccurrenceId: id, ...(move ? { cursor: start, mode: { kind: 'time' } } : {}) });
  };
  // With the host's detail slot there is no inline "detail" tab: a tab value of 'detail' shows the list.
  const tab = renderDetail && (controlledTab ?? ownTab) === 'detail' ? 'list' : controlledTab ?? ownTab;
  const tabs = renderDetail ? TABS.filter((item) => item.id !== 'detail') : TABS;

  return (
    <>
      <NoticeList notices={[...notices, ...(entry.notice ? [entry.notice] : [])]} />
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
      {frame && state && cursor && (
        <>
          <PlaybackControls playing={playback.playing} onPlay={() => { patch({ mode: { kind: 'time' } }); playback.play(); }} onPause={playback.pause}
            speed={playback.speed} onSpeedChange={playback.setSpeed}
            onPreviousBreakpoint={previousBreakpoint === undefined ? null : () => stepBreakpoint(previousBreakpoint)}
            onNextBreakpoint={nextBreakpoint === undefined ? null : () => stepBreakpoint(nextBreakpoint)}
            sequence={{ available: entryStep !== undefined || sequenceSeq !== null,
              unavailableReason: '이 시점까지 적용된 기록이 구간 안에 없어 기록 단위 보기를 쓸 수 없습니다', active: sequenceSeq !== null,
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
                {journeyAnchor !== null && links?.journey?.(journeyAnchor)}
                {links?.actions}
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
              <FocusGantt timeline={timeline} layout={layout} batch={input.batch} cursor={state.at}
                onCursorChange={toTime} selectedOccurrenceId={selectedId}
                onSelectOccurrence={(id) => select(id, false)} selectedComponentId={view.selectedComponentId}
                expanded={view.expanded} onToggleExpand={(id) => setView((previous) => {
                  const expanded = new Set(previous.expanded);
                  if (!expanded.delete(id)) expanded.add(id);
                  return { ...previous, expanded };
                })} />
            ) : tooLarge ? (
              <StateMessage tone="warning" icon={ChartGantt} title="구간이 커서 Gantt를 그리지 않습니다"
                body={`범위를 좁히세요. 지금 범위는 기록 ${count(cost.records)}개 + 전환 시점 ${count(cost.breakpoints)}개 × (읽기마다 Binding·Layout 탐색 ${count(cost.context)} + (동시 open Occurrence ${count(cost.open)}개 + 시간 역전 ${count(cost.inversions)}개) × 위치 해석 ${count(cost.resolve)}) = ${count(cost.cost)}로 Gantt 계산 한도 ${count(timelineBudget)}을 넘습니다. Top View·커서 시점 상태·Occurrence 목록·Data Quality·근거 상세는 그대로 씁니다.`} />
            ) : tooManySpans && (
              <StateMessage tone="warning" icon={ChartGantt} title="구간이 커서 Gantt를 그리지 않습니다"
                body={`범위를 좁히세요. 지금 범위의 Gantt 막대는 ${count(spans)}개로 그리기 한도 ${count(ganttSpanLimit)}개를 넘습니다. Top View·커서 시점 상태·Occurrence 목록·Data Quality·근거 상세는 그대로 씁니다.`} />
            )}
          </Panel>
          {/* Escape closes the detail from anywhere in the tabs, a focused table row included. */}
          <div onKeyDown={(event) => { if (event.key === 'Escape' && selectedId !== null) patch({ selectedOccurrenceId: null }); }}>
          <Tabs value={tab} onValueChange={(value) => { setOwnTab(value as FocusTab); onTabChange?.(value as FocusTab); }} className="mt-4">
            <TabsList aria-label="Focus 상세">
              {tabs.map((item) => <TabsTrigger key={item.id} value={item.id}>{item.label}</TabsTrigger>)}
            </TabsList>
            <TabsContent value="list">
              <OccurrenceList batch={input.batch} timeline={frame} bindings={input.bindings} appliedSeq={state.appliedSeq}
                anchorOccurrenceId={anchor} selectedOccurrenceId={selectedId} onSelectOccurrence={(id) => select(id, true)} />
            </TabsContent>
            <TabsContent value="quality"><DataQualityList timeline={frame} appliedSeq={state.appliedSeq} onSelectOccurrence={(id) => select(id, true)} /></TabsContent>
            {!renderDetail && <TabsContent value="detail"><EvidenceDetail batch={input.batch} state={state} selectedOccurrenceId={selectedId} /></TabsContent>}
          </Tabs>
          </div>
        </>
      )}
    </>
  );
}
