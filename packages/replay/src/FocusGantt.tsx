import { useId, useMemo, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import {
  millisToWallClock, wallClockToMillis, type EquipmentLayoutDocument, type OccurrenceBatch, type ReplayTimeline, type SiteWallClock,
} from '@eqv/core';
import { Legend, type LegendItem } from '@eqv/ui';
import { buildLanes, type Bar } from './lanes.js';
import { ACTIVITY_KO, EVIDENCE_KO, clock, wallClockText, type StateEvidence } from './words.js';

export interface FocusGanttProps {
  timeline: ReplayTimeline;
  layout: EquipmentLayoutDocument | null;
  batch: OccurrenceBatch;
  cursor: SiteWallClock;
  onCursorChange: (at: SiteWallClock) => void;
  selectedOccurrenceId: string | null;
  onSelectOccurrence: (id: string) => void;
  selectedComponentId: string | null;
  expanded: ReadonlySet<string>;
  onToggleExpand: (componentId: string) => void;
}

const LABEL_W = 160;
const PLOT_W = 800;
const WIDTH = LABEL_W + PLOT_W + 12;
const AXIS_H = 34;
const ROW_H = 18;
const PAD = 4;
const TICKS = 6;
/** Room under the plot for the time-anomaly label, so it never sits on a bar. */
const LABEL_BAND = 14;
const DRAG_THRESHOLD = 4;
const EVIDENCES: StateEvidence[] = ['observed', 'derived', 'unknown'];
const PATTERN_TEXT: Record<StateEvidence, string> = { observed: '단색', derived: '사선 무늬', unknown: '교차 무늬' };

/** Base fill and outline per bar family; patterns are drawn over the base so colour is never the only cue. */
const BASE: Record<string, { fill: string; stroke: string }> = {
  processing: { fill: 'var(--eqv-process-fill, #e3efff)', stroke: 'var(--eqv-process-stroke, #2577cc)' },
  'post-processing': { fill: 'var(--eqv-holding-fill, #dcf8ef)', stroke: 'var(--eqv-holding-stroke, #008090)' },
  function: { fill: 'var(--eqv-robot-fill, #f3eefd)', stroke: 'var(--eqv-robot-stroke, #8154ce)' },
  material: { fill: 'var(--eqv-material-fill, #f7e4cd)', stroke: 'var(--eqv-material-stroke, #b45309)' },
};
const baseOf = (bar: Bar) => BASE[bar.kind === 'material' ? 'material' : bar.what]!;

function openAtRangeEnd(bar: Bar, batch: OccurrenceBatch, rangeTo: SiteWallClock): boolean {
  if (bar.to !== rangeTo) return false;
  return bar.occurrenceIds.some((id) => {
    const end = batch.occurrences.find((o) => o.id === id)?.end;
    return end === null || end === undefined || end.at === null || end.at > rangeTo;
  });
}

export function FocusGantt({
  timeline, layout, batch, cursor, onCursorChange, selectedOccurrenceId, onSelectOccurrence, selectedComponentId, expanded, onToggleExpand,
}: FocusGanttProps) {
  const prefix = `eqv-rp-${useId().replace(/[^A-Za-z0-9]/g, '')}`;
  const { range } = timeline;
  const fromMs = wallClockToMillis(range.from);
  const lastMs = wallClockToMillis(range.to) - 1;
  const spanMs = lastMs + 1 - fromMs;
  const x = (t: SiteWallClock) => LABEL_W + Math.min(1, Math.max(0, (wallClockToMillis(t) - fromMs) / spanMs)) * PLOT_W;
  const cursorMs = Math.min(lastMs, Math.max(fromMs, wallClockToMillis(cursor)));

  const lanes = useMemo(() => buildLanes(timeline, layout, expanded), [timeline, layout, expanded]);
  const layoutTops = useMemo(() => {
    let top = AXIS_H;
    return lanes.map((lane) => {
      const height = Math.max(1, lane.rows.length) * ROW_H + 2 * PAD;
      const placed = { top, height };
      top += height;
      return placed;
    });
  }, [lanes]);
  const plotBottom = layoutTops.length ? layoutTops[layoutTops.length - 1]!.top + layoutTops[layoutTops.length - 1]!.height : AXIS_H;
  const laneIndex = new Map(lanes.map((lane, i) => [lane.id, i]));

  const drag = useRef<{ pointerId: number; x: number; captured: boolean } | null>(null);
  const seekFromPointer = (event: PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width <= 0) return;
    const fraction = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    onCursorChange(millisToWallClock(Math.min(lastMs, fromMs + Math.floor(fraction * spanMs))));
  };
  const onPointerDown = (event: PointerEvent<SVGRectElement>) => {
    drag.current = { pointerId: event.pointerId, x: event.clientX, captured: false };
    seekFromPointer(event);
  };
  const onPointerMove = (event: PointerEvent<SVGRectElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (event.buttons === 0) { drag.current = null; return; }
    if (!current.captured) {
      if (Math.abs(event.clientX - current.x) < DRAG_THRESHOLD) return;
      current.captured = true;
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* not supported (jsdom) */ }
    }
    seekFromPointer(event);
  };
  const onPointerEnd = (event: PointerEvent<SVGRectElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    if (current.captured) {
      try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* already released */ }
    }
  };
  const onPointerLeave = () => { if (drag.current && !drag.current.captured) drag.current = null; };
  const onSliderKey = (event: KeyboardEvent<SVGRectElement>) => {
    let next: SiteWallClock | undefined;
    if (event.key === 'ArrowLeft') next = [...timeline.breakpoints].reverse().find((t) => wallClockToMillis(t) < cursorMs);
    else if (event.key === 'ArrowRight') next = timeline.breakpoints.find((t) => wallClockToMillis(t) > cursorMs);
    else if (event.key === 'Home') next = range.from;
    else if (event.key === 'End') next = millisToWallClock(lastMs);
    else return;
    event.preventDefault();
    if (next !== undefined) onCursorChange(next);
  };

  const barName = (bar: Bar, lane: (typeof lanes)[number], componentLabel: string) => {
    const target = lane.holdingSiteId === undefined ? lane.label : `${componentLabel} ${lane.label}`;
    const what = bar.kind === 'activity' ? ACTIVITY_KO[bar.what as keyof typeof ACTIVITY_KO]
      : `${bar.what} ${bar.materialId ?? '익명'}`;
    const end = openAtRangeEnd(bar, batch, range.to) ? '열림' : clock(bar.to);
    const evidence = bar.kind === 'activity' ? EVIDENCE_KO[bar.evidence] : `위치 ${EVIDENCE_KO[bar.evidence]}`;
    return `${target} ${what} ${clock(bar.from)}–${end} · ${evidence}`;
  };

  const swatch = (fill: string, stroke: string, pattern?: string) => (
    <svg width="26" height="12" aria-hidden="true">
      <rect width="26" height="12" fill={fill} stroke={stroke} />
      {pattern !== undefined && <rect width="26" height="12" fill={`url(#${pattern})`} />}
    </svg>
  );
  const legend: LegendItem[] = [
    ...EVIDENCES.map((evidence) => ({
      swatch: swatch(BASE.material!.fill, BASE.material!.stroke, `${prefix}-${evidence}`), label: `${EVIDENCE_KO[evidence]} — ${PATTERN_TEXT[evidence]}`,
    })),
    ...(['processing', 'post-processing', 'function'] as const).map((activity) => ({
      swatch: swatch(BASE[activity]!.fill, BASE[activity]!.stroke), label: `활동 ${ACTIVITY_KO[activity]}`,
    })),
    { swatch: swatch(BASE.material!.fill, BASE.material!.stroke), label: '물질 위치' },
    ...['Binding 경계 — 실선', 'Watermark — 점선, Watermark 이후 — 음영', '시각 역전 — 음영 띠', '점유 충돌 — 레인 외곽선',
      '▸ 구간 끝에서 열림 — 끝 미확정', '▼ 축 위 눈금 — Data Quality Issue'].map((label) => ({ swatch: null, label })),
  ];

  const hasTimeAnomaly = timeline.markers.some(({ marker }) => marker.kind === 'time-anomaly');
  const timeAnomalyKeys = new Set<string>();
  let componentLabel = '';
  return (
    <div className="text-text-primary">
      <div className="max-w-full overflow-x-auto focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring" role="region" aria-label="Gantt 차트" tabIndex={0}>
      <svg viewBox={`0 0 ${WIDTH} ${plotBottom + PAD + (hasTimeAnomaly ? LABEL_BAND : 0)}`} width="100%" style={{ '--eqv-rp-min': `${WIDTH}px` } as CSSProperties} role="group" aria-label="Component 레인 Gantt" className="eqv-rp-svg">
        <defs>
          <pattern id={`${prefix}-observed`} width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="none" /></pattern>
          <pattern id={`${prefix}-derived`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--eqv-evidence, #374151)" strokeWidth="2" />
          </pattern>
          <pattern id={`${prefix}-unknown`} width="6" height="6" patternUnits="userSpaceOnUse">
            <path d="M0 0H6M0 0V6" stroke="var(--eqv-evidence, #374151)" strokeWidth="1" fill="none" />
          </pattern>
        </defs>

        <line className="eqv-rp-grid" x1={LABEL_W} x2={LABEL_W + PLOT_W} y1={AXIS_H} y2={AXIS_H} />
        {Array.from({ length: TICKS }, (_, i) => {
          const ms = Math.round(fromMs + (spanMs * i) / (TICKS - 1));
          const t = millisToWallClock(Math.min(ms, lastMs));
          return (
            <g key={i} className="eqv-rp-tick" aria-hidden="true">
              <line x1={x(t)} x2={x(t)} y1={AXIS_H - 6} y2={plotBottom} />
              <text x={x(t)} y={AXIS_H - 10} textAnchor={i === 0 ? 'start' : i === TICKS - 1 ? 'end' : 'middle'}>{spanMs < 60_000 ? t.slice(11, 23) : t.slice(11, 19)}</text>
            </g>
          );
        })}

        {timeline.markers.map((span, i) => {
          const { marker } = span;
          if (marker.kind === 'after-watermark') {
            return (
              <g key={`m${i}`} data-marker="after-watermark">
                <rect className="eqv-rp-after-watermark" x={x(span.from)} y={AXIS_H} width={Math.max(1, x(span.to) - x(span.from))} height={plotBottom - AXIS_H} />
                <text className="eqv-rp-marker-label" x={x(span.from) + 3} y={AXIS_H + 11}>Watermark 이후</text>
              </g>
            );
          }
          if (marker.kind === 'time-anomaly') {
            const key = `${span.from}|${span.to}`;
            const label = !timeAnomalyKeys.has(key);
            timeAnomalyKeys.add(key);
            return (
              <g key={`m${i}`} data-marker="time-anomaly">
                <rect className="eqv-rp-time-anomaly" x={x(span.from)} y={AXIS_H} width={Math.max(2, x(span.to) - x(span.from))} height={plotBottom - AXIS_H}>
                  <title>{`시각 역전 · ${marker.occurrenceId}`}</title>
                </rect>
                {label && <text className="eqv-rp-marker-label" x={x(span.from) + 3} y={plotBottom + LABEL_BAND - 3}>시각 역전</text>}
              </g>
            );
          }
          return null;
        })}

        {lanes.map((lane, i) => {
          const { top, height } = layoutTops[i]!;
          if (lane.holdingSiteId === undefined) componentLabel = lane.label;
          const component = layout?.components.find((c) => c.id === lane.componentId);
          const canExpand = lane.holdingSiteId === undefined && component !== undefined && component.holdingSites.length > 0;
          const isOpen = lane.componentId !== null && expanded.has(lane.componentId);
          const current = lane.holdingSiteId === undefined && lane.componentId !== null && lane.componentId === selectedComponentId;
          return (
            <g key={lane.id} role="group" aria-label={`레인 ${lane.holdingSiteId === undefined ? lane.label : `${componentLabel} ${lane.label}`}`}
              aria-current={current ? 'true' : undefined} data-lane-id={lane.id} className={current ? 'eqv-rp-lane-current' : undefined}>
              <rect className="eqv-rp-lane-bg" x={0} y={top} width={LABEL_W + PLOT_W} height={height} />
              {canExpand ? (
                <g role="button" tabIndex={0} aria-expanded={isOpen} aria-label={`${lane.label} Holding Site ${isOpen ? '접기' : '펼치기'}`}
                  className="eqv-rp-disclosure" onClick={() => onToggleExpand(lane.componentId!)}
                  onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onToggleExpand(lane.componentId!); } }}>
                  <rect x={0} y={top} width={LABEL_W - 4} height={height} fill="transparent" />
                  <text x={4} y={top + PAD + 12} aria-hidden="true">{isOpen ? '▾' : '▸'} {lane.label}</text>
                </g>
              ) : (
                <text className="eqv-rp-lane-label" x={lane.holdingSiteId === undefined ? 4 : 20} y={top + PAD + 12}>{lane.label}</text>
              )}
              {lane.rows.map((row, r) => row.map((bar) => {
                const left = x(bar.from);
                const right = Math.max(left + 2, x(bar.to));
                const y = top + PAD + r * ROW_H;
                const base = baseOf(bar);
                const selected = selectedOccurrenceId !== null && bar.occurrenceIds.includes(selectedOccurrenceId);
                const open = openAtRangeEnd(bar, batch, range.to);
                const name = barName(bar, lane, componentLabel);
                const select = () => onSelectOccurrence(bar.occurrenceIds[0]!);
                return (
                  <g key={bar.id} role="button" tabIndex={0} aria-label={name} aria-pressed={selected} data-bar={bar.kind}
                    data-evidence={bar.evidence} data-occurrence-id={bar.occurrenceIds.join(' ')} className={selected ? 'eqv-rp-bar eqv-rp-bar-selected' : 'eqv-rp-bar'}
                    onClick={select} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); } }}>
                    <title>{name}</title>
                    <rect x={left} y={y} width={right - left} height={ROW_H - 3} rx={2} fill={base.fill} stroke={base.stroke} strokeWidth={1} />
                    <rect x={left} y={y} width={right - left} height={ROW_H - 3} rx={2} fill={`url(#${prefix}-${bar.evidence})`} data-pattern={bar.evidence} />
                    {open && <path data-mark="open-end" className="eqv-rp-open-end" d={`M${right - 6} ${y}L${right} ${y + (ROW_H - 3) / 2}L${right - 6} ${y + ROW_H - 3}`} />}
                  </g>
                );
              }))}
            </g>
          );
        })}

        {timeline.markers.map((span, i) => {
          const { marker } = span;
          if (marker.kind !== 'occupancy-conflict') return null;
          const index = laneIndex.get(marker.componentId);
          if (index === undefined) return null;
          const { top, height } = layoutTops[index]!;
          return (
            <rect key={`c${i}`} data-marker="occupancy-conflict" className="eqv-rp-conflict" x={x(span.from)} y={top + 1}
              width={Math.max(2, x(span.to) - x(span.from))} height={height - 2}>
              <title>{`점유 충돌 · ${marker.componentId}/${marker.holdingSiteId}`}</title>
            </rect>
          );
        })}

        {timeline.bindingBoundaries.map((t) => (
          <g key={t} data-marker="binding-boundary">
            <line className="eqv-rp-binding" x1={x(t)} x2={x(t)} y1={AXIS_H} y2={plotBottom}><title>{`Binding 경계 · ${wallClockText(t)}`}</title></line>
            <text className="eqv-rp-marker-label" x={x(t) + 3} y={AXIS_H + 11}>Binding 경계</text>
          </g>
        ))}
        {batch.watermark.at >= range.from && batch.watermark.at < range.to && (
          <g data-marker="watermark">
            <line className="eqv-rp-watermark" x1={x(batch.watermark.at)} x2={x(batch.watermark.at)} y1={AXIS_H} y2={plotBottom}>
              <title>{`Watermark · ${wallClockText(batch.watermark.at)}`}</title>
            </line>
            <text className="eqv-rp-marker-label" x={x(batch.watermark.at) - 3} y={AXIS_H + 11} textAnchor="end">Watermark</text>
          </g>
        )}
        {timeline.issues.map((issue) => issue.at === null ? null : (
          <g key={issue.id} data-marker="dqi" role="img" aria-label={`Data Quality Issue ${issue.issueType} ${wallClockText(issue.at)}`}>
            <path className="eqv-rp-dqi" d={`M${x(issue.at) - 4} ${AXIS_H - 14}h8l-4 8z`} />
            <title>{`${issue.issueType} · ${issue.id} · ${wallClockText(issue.at)}`}</title>
          </g>
        ))}

        <line className="eqv-rp-cursor" x1={x(millisToWallClock(cursorMs))} x2={x(millisToWallClock(cursorMs))} y1={0} y2={plotBottom} aria-hidden="true" />
        <rect className="eqv-rp-axis" role="slider" tabIndex={0} aria-label="커서 시각" aria-orientation="horizontal"
          aria-valuemin={fromMs} aria-valuemax={lastMs} aria-valuenow={cursorMs} aria-valuetext={wallClockText(millisToWallClock(cursorMs))}
          x={LABEL_W} y={0} width={PLOT_W} height={AXIS_H - 14} onKeyDown={onSliderKey}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} onPointerLeave={onPointerLeave} />
      </svg>
      </div>
      <Legend label="범례" items={legend} />
    </div>
  );
}
