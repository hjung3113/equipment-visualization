import type { ReplayInput, ReplayTimelineFrame } from '@eqv/core';

/**
 * `replayTimeline` sorts the records once and then reads the Scene State at every breakpoint. A read costs the context it
 * searches (Bindings, Layouts, the Layout's components) plus, for each Occurrence open at that point and each Time Anomaly
 * inversion it scans, one location resolution through the Bindings, Mapping Versions and entries (see `timelineCost`).
 * Above this the Gantt is not computed. The value bounds the worst measured rate (a window with 1,000 to 3,000 Occurrences
 * open at once, about 0.21 µs per unit) to about 1 s. Measured in #106: the 50k-Occurrence mapped window costs 4,200,000 and
 * takes about 220 ms (it is then limited by `GANTT_SPAN_LIMIT`); a DQI-only window with 10,000 Bindings costs 100,260,000
 * and takes 0.6 s, with 50,000 about 2.5 billion.
 */
export const TIMELINE_BUDGET = 4_800_000;

/**
 * Most Gantt spans (material + activity spans + markers of the computed timeline) `FocusGantt` draws. Each span is an SVG
 * rect; the measured repaint is about 1.9 s per 100,000 spans, so 5,000 is about 100 ms. Above it the Gantt shows a notice.
 */
export const GANTT_SPAN_LIMIT = 5_000;

const maxOf = (values: number[]) => values.reduce((max, value) => Math.max(max, value), 0);

/**
 * Work of `replayTimeline` for `frame`: `records + breakpoints × (context + (open + inversions) × resolve)`.
 * `records` is the reducer's record set (reduce.ts: Occurrence starts, ends and Data Quality Issues), sorted once.
 * `open` is the most Occurrences open at any Record Sequence, an upper bound on the open set one read walks.
 * `inversions` is the adjacent timed record pairs whose time goes backwards (Time Anomaly candidates), which every read scans.
 * `context` is what a read does regardless of the open set: the Binding and Layout searches plus building and sorting the
 * Layout's components (`components × max(1, ⌈log₂ components⌉)`, the largest Layout).
 * `resolve` is one location resolution: `1 + bindings + mappings + entries + slots`, entries and slots at the largest
 * Mapping Version and entry (`mapping/resolve.ts` scans each list).
 */
export function timelineCost(input: ReplayInput, frame: ReplayTimelineFrame): {
  breakpoints: number; records: number; open: number; inversions: number; context: number; resolve: number; cost: number;
} {
  const { batch, bindings, mappings } = input;
  const layouts = [...input.layouts, ...Object.values(input.layoutRevisions ?? {})];
  const records = batch.issues.length + batch.occurrences.reduce((sum, o) => sum + (o.end ? 2 : 1), 0);
  const boundaries = [...batch.occurrences.flatMap((o) => [o.start, ...(o.end ? [o.end] : [])]), ...batch.issues].sort((a, b) => a.seq - b.seq);
  const starts = new Set(batch.occurrences.map((o) => o.start.seq));
  const issueSeqs = new Set(batch.issues.map((i) => i.seq));
  let running = 0;
  let open = 0;
  let previous: string | null = null;
  let inversions = 0;
  for (const { seq, at } of boundaries) {
    if (starts.has(seq)) open = Math.max(open, ++running);
    else if (!issueSeqs.has(seq)) running--;
    if (at !== null) {
      if (previous !== null && at < previous) inversions++;
      previous = at;
    }
  }
  const components = maxOf(layouts.map((layout) => layout.components.length));
  const entries = maxOf(mappings.map((mapping) => mapping.entries.length));
  const slots = maxOf(mappings.flatMap((mapping) => mapping.entries.map((entry) =>
    'ignore' in entry.target ? 0 : entry.target.slots?.assign.length ?? 0)));
  const context = bindings.bindings.length + layouts.length + components * Math.max(1, Math.ceil(Math.log2(components)));
  const resolve = 1 + bindings.bindings.length + mappings.length + entries + slots;
  const breakpoints = frame.breakpoints.length;
  return { breakpoints, records, open, inversions, context, resolve, cost: records + breakpoints * (context + (open + inversions) * resolve) };
}

