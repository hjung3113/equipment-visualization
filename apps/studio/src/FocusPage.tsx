import { useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react';
import {
  replayTimeline, seekSceneState, siteWallClockSchema, stepSceneState, wallClockToMillis, type ReplayInput, type ReplayTimeline, type SceneState, type SiteWallClock,
} from '@eqv/core';
import { TopViewer } from '@eqv/renderer';
import {
  CursorStateList, DataQualityList, EvidenceDetail, FocusGantt, focusRange, illustrativeGhosts, OccurrenceList, PlaybackControls, recordSteps,
  usePlayback, type PlaybackScheduler,
} from '@eqv/replay';
import { loadFocus, type FocusLoad } from './focus-data.js';
import { Link, hrefFor } from './router.js';

type Range = { from: SiteWallClock; to: SiteWallClock };
type View = {
  equipmentId: string;
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

function Tabs({ base, active, onChange }: { base: string; active: Tab; onChange: (tab: Tab) => void }) {
  const onKey = (event: KeyboardEvent<HTMLElement>) => {
    const index = TABS.findIndex((tab) => tab.id === active);
    const next = event.key === 'ArrowRight' ? (index + 1) % TABS.length : event.key === 'ArrowLeft' ? (index + TABS.length - 1) % TABS.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    onChange(TABS[next]!.id);
    document.getElementById(`${base}-${TABS[next]!.id}`)?.focus();
  };
  return (
    <div role="tablist" aria-label="Focus 상세" className="focus-tabs" onKeyDown={onKey}>
      {TABS.map((tab) => (
        <button key={tab.id} id={`${base}-${tab.id}`} type="button" role="tab" aria-selected={tab.id === active}
          aria-controls={`${base}-panel`} tabIndex={tab.id === active ? 0 : -1} onClick={() => onChange(tab.id)}>{tab.label}</button>
      ))}
    </div>
  );
}

export function FocusPage({ equipmentId, entityType, anchor, scheduler }: {
  equipmentId: string; entityType: string | null; anchor: string | null;
  /** Frame clock for playback; tests only, the browser's by default. */
  scheduler?: PlaybackScheduler;
}) {
  const entryKey = JSON.stringify([entityType, anchor]);
  const fresh = (): View => ({ equipmentId, entryKey, result: null, applied: null, draft: null, rangeError: null, cursor: null,
    selectedOccurrenceId: null, selectedComponentId: null, expanded: new Set(), mode: { kind: 'time' }, illustrative: false });
  const [view, setView] = useState<View>(fresh);
  const [tab, setTab] = useState<Tab>('list');
  const tabsId = useId();
  // Everything below belongs to the route's equipmentId and entry key: a change clears it during render, and a late
  // result of a previous id is dropped by the effect cleanup.
  if (view.equipmentId !== equipmentId) setView(fresh());
  else if (view.entryKey !== entryKey) setView({ ...view, entryKey, applied: null, draft: null, rangeError: null, cursor: null, mode: { kind: 'time' } });

  useEffect(() => {
    let cancelled = false;
    loadFocus(equipmentId).then((result) => {
      if (!cancelled) setView((previous) => previous.equipmentId === equipmentId ? { ...previous, result } : previous);
    });
    return () => { cancelled = true; };
  }, [equipmentId]);

  const { result } = view;
  const ok = result?.kind === 'ok' ? result : null;
  const entry = useMemo(() => ok ? focusRange(ok.batch, { entityType, anchor }) : null, [ok, entityType, anchor]);
  const range = view.applied ?? entry?.range ?? null;
  const rawCursor = view.cursor ?? entry?.cursor ?? null;
  const cursor = range && rawCursor && rawCursor >= range.from && rawCursor < range.to ? rawCursor : range?.from ?? null;

  const computed = useMemo((): { input: ReplayInput; timeline: ReplayTimeline } | { error: string } | null => {
    if (!ok || !range) return null;
    try {
      const input: ReplayInput = { batch: ok.batch, layouts: ok.layouts, bindings: ok.bindings, mappings: ok.mappings };
      return { input, timeline: replayTimeline(input, range) };
    } catch (error) {
      return { error: message(error) };
    }
  }, [ok, range]);
  const timelineInput = computed && !('error' in computed) ? computed : null;
  const steps = useMemo(() => ok && range ? recordSteps(ok.batch, range) : [], [ok, range]);
  const { mode } = view;
  const sequenceSeq = mode.kind === 'sequence' && steps.some((s) => s.seq === mode.seq) ? mode.seq : null;
  const sceneState = useMemo((): SceneState | { error: string } | null => {
    if (!timelineInput || !cursor) return null;
    try {
      return sequenceSeq !== null ? stepSceneState(timelineInput.input, sequenceSeq) : seekSceneState(timelineInput.input, cursor);
    } catch (error) {
      return { error: message(error) };
    }
  }, [timelineInput, cursor, sequenceSeq]);
  const state = sceneState && !('error' in sceneState) ? sceneState : null;
  const layout = ok && state?.binding ? ok.layouts.find((l) => l.id === state.binding!.layoutId) ?? null : null;
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
    () => view.illustrative && timelineInput && state ? illustrativeGhosts(timelineInput.input, state, layout) : null,
    [view.illustrative, timelineInput, state, layout]);
  const replay = useMemo(() => state ? { state, ...(ghosts ? { illustrative: ghosts } : {}) } : null, [state, ghosts]);

  const patch = (changes: Partial<View>) => setView((previous) => ({ ...previous, ...changes }));
  const playback = usePlayback({ cursor, range, onCursorChange: (at) => patch({ cursor: at }), resetKey: JSON.stringify([equipmentId, entryKey]), scheduler });
  const shownAt = state?.at ?? null;
  const breakpoints = timelineInput?.timeline.breakpoints ?? [];
  const previousBreakpoint = shownAt === null ? undefined : [...breakpoints].reverse().find((t) => t < shownAt);
  const nextBreakpoint = shownAt === null ? undefined : breakpoints.find((t) => t > shownAt);
  const toTime = (at: SiteWallClock) => patch({ cursor: at, mode: { kind: 'time' } });
  const stepBreakpoint = (at: SiteWallClock) => { playback.pause(); toTime(at); };
  const stepIndex = sequenceSeq === null ? -1 : steps.findIndex((s) => s.seq === sequenceSeq);
  const enterSequence = () => {
    if (!state) return;
    const found = state.appliedSeq === null ? steps[0] : steps.filter((s) => s.seq <= state.appliedSeq!).at(-1);
    if (!found) return;
    playback.pause();
    patch({ mode: { kind: 'sequence', seq: found.seq } });
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
    <>
      <h1>Focus · <code>{equipmentId}</code></h1>
      <p>{anchor !== null ? <>진입 키: <code>{entityType ?? '—'}</code> / <code>{anchor}</code></> : '진입 키 없음'}</p>
      {result === null ? <p>불러오는 중…</p> : result.kind === 'not-found' ? (
        <>
          <p>설비를 찾을 수 없습니다</p>
          <p><Link href={hrefFor({ name: 'fleet' })}>Fleet으로 이동</Link></p>
        </>
      ) : result.kind === 'error' ? (
        <>
          <p role="alert">데이터 오류: {result.error}</p>
          <p><Link href={hrefFor({ name: 'fleet' })}>Fleet으로 이동</Link></p>
        </>
      ) : (
        <>
          <p><Link href={hrefFor({ name: 'onboarding', equipmentId })}>Onboarding으로 이동</Link></p>
          {[...result.notices, ...(entry?.notice ? [entry.notice] : [])].map((notice) => <p key={notice} role="status">{notice}</p>)}
          {range && (
            <form aria-label="구간" className="focus-range" onSubmit={(event) => { event.preventDefault(); apply(); }}>
              <label>시작 <input type="text" value={draft.from} onChange={(event) => patch({ draft: { ...draft, from: event.target.value } })} /></label>
              <label>끝 <input type="text" value={draft.to} onChange={(event) => patch({ draft: { ...draft, to: event.target.value } })} /></label>
              <button type="submit">적용</button>
              {view.rangeError && <span role="alert">{view.rangeError}</span>}
            </form>
          )}
          {computed && 'error' in computed && <p role="alert">Replay 오류: {computed.error}</p>}
          {sceneState && 'error' in sceneState && <p role="alert">Replay 오류: {sceneState.error}</p>}
          {timelineInput && state && cursor && (
            <>
              <PlaybackControls playing={playback.playing} onPlay={() => { patch({ mode: { kind: 'time' } }); playback.play(); }} onPause={playback.pause}
                speed={playback.speed} onSpeedChange={playback.setSpeed}
                onPreviousBreakpoint={previousBreakpoint === undefined ? null : () => stepBreakpoint(previousBreakpoint)}
                onNextBreakpoint={nextBreakpoint === undefined ? null : () => stepBreakpoint(nextBreakpoint)}
                sequence={{ available: steps.length > 0, active: sequenceSeq !== null,
                  onToggle: () => sequenceSeq !== null ? patch({ mode: { kind: 'time' } }) : enterSequence(),
                  onPrevious: stepIndex > 0 ? () => moveStep(stepIndex - 1) : null,
                  onNext: stepIndex >= 0 && stepIndex < steps.length - 1 ? () => moveStep(stepIndex + 1) : null,
                  step: sequenceSeq === null ? null : { seq: sequenceSeq, at: state.at } }} />
              <label className="focus-illustrative">
                <input type="checkbox" checked={view.illustrative} onChange={(event) => patch({ illustrative: event.target.checked })} /> 예시 이동 표시
              </label>
              <div className="focus-top">
                <section aria-label="Top View">
                  <h2>Top View{view.illustrative && <span className="eqv-rp-illustrative-badge">예시 이동</span>}</h2>
                  {layout ? (
                    <TopViewer layout={layout} width={720} height={420} replay={replay} highlight={highlight}
                      selectedId={view.selectedComponentId} onSelectedChange={(id) => patch({ selectedComponentId: id })} />
                  ) : <p>이 시점에 적용된 Binding이 없어 Top View를 표시할 수 없습니다</p>}
                </section>
                <CursorStateList state={state} {...(ghosts ? { illustrative: ghosts } : {})} />
              </div>
              <section aria-label="Gantt">
                <h2>Gantt</h2>
                <FocusGantt timeline={timelineInput.timeline} layout={layout} batch={ok!.batch} cursor={state.at}
                  onCursorChange={toTime} selectedOccurrenceId={selectedId}
                  onSelectOccurrence={(id) => select(id, false)} selectedComponentId={view.selectedComponentId}
                  expanded={view.expanded} onToggleExpand={(id) => setView((previous) => {
                    const expanded = new Set(previous.expanded);
                    if (!expanded.delete(id)) expanded.add(id);
                    return { ...previous, expanded };
                  })} />
              </section>
              <Tabs base={tabsId} active={tab} onChange={setTab} />
              <div role="tabpanel" id={`${tabsId}-panel`} className="focus-panel" aria-labelledby={`${tabsId}-${tab}`}>
                {tab === 'list' && (
                  <OccurrenceList batch={ok!.batch} timeline={timelineInput.timeline} bindings={ok!.bindings} appliedSeq={state.appliedSeq}
                    selectedOccurrenceId={selectedId} onSelectOccurrence={(id) => select(id, true)} />
                )}
                {tab === 'quality' && <DataQualityList timeline={timelineInput.timeline} onSelectOccurrence={(id) => select(id, true)} />}
                {tab === 'detail' && <EvidenceDetail batch={ok!.batch} state={state} selectedOccurrenceId={selectedId} />}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
