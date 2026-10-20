import { millisToWallClock, wallClockToMillis, type Occurrence, type OccurrenceBatch } from '@eqv/core';

export const EQUIPMENT_ID = 'eq-demo-01';
const PARSER_CONTRACT = 'synthetic-demo-1';
const DATA_GENERATION = 'g1';
const TIME_DOMAIN = 'site-demo';
export const PM_COUNT = 4;

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const WAFERS = 25;
/** Nominal gap between two pickups from the carrier, and its random spread. */
const CADENCE = 210 * SECOND;
const CADENCE_SPREAD = 30 * SECOND;
const FIRST_PICKUP = 90 * SECOND;
/** The Watermark trails the window end by this much; every completed record is at or before it. */
const WATERMARK_LAG = 5 * MINUTE;
/** The scheduler retries a wafer's whole route this much later when some resource is not free for it. */
const RETRY_STEP = 5 * SECOND;

interface WindowSpec {
  prefix: string;
  lotId: string;
  carrierId: string;
  loadPort: number;
  from: string;
  to: string;
  seed: number;
  /** Index of the wafer routed to the alias that has no rule (labelled imperfection 1). */
  unmappedChamberWafer: number;
  /** Minutes after `from` of the Data Quality Issue (labelled imperfection 2). */
  issueAfter: number;
}
const WINDOWS: WindowSpec[] = [
  { prefix: 'D1', lotId: 'LOT-D1', carrierId: 'CAR-D1', loadPort: 1, from: '2026-01-02T08:00:00.000', to: '2026-01-02T10:00:00.000', seed: 1101, unmappedChamberWafer: 12, issueAfter: 41 },
  { prefix: 'D2', lotId: 'LOT-D2', carrierId: 'CAR-D2', loadPort: 2, from: '2026-01-02T10:00:00.000', to: '2026-01-02T12:00:00.000', seed: 2202, unmappedChamberWafer: 7, issueAfter: 63 },
];

/** mulberry32: a small seeded PRNG, so the scenario is the same on every run. */
function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Busy intervals of one resource, half-open `[start, end)`. */
class Calendar {
  private busy: [number, number][] = [];
  /** End of the latest busy interval overlapping `[start, end)`, or null when it is free. */
  conflictEnd(start: number, end: number): number | null {
    let latest: number | null = null;
    for (const [s, e] of this.busy) if (s < end && e > start && (latest === null || e > latest)) latest = e;
    return latest;
  }
  free(start: number, end: number): boolean {
    return this.conflictEnd(start, end) === null;
  }
  earliest(ready: number, duration: number): number {
    let start = ready;
    for (;;) {
      const conflict = this.conflictEnd(start, start + duration);
      if (conflict === null) return start;
      start = conflict;
    }
  }
  reserve(start: number, end: number): void {
    this.busy.push([start, end]);
  }
}

interface Site { alias: string; slot: string; calendar: Calendar }
interface Draft {
  id: string; kind: Occurrence['kind']; start: number; end: number | null;
  location: { moduleAlias: string; slotAlias?: string };
  from?: { moduleAlias: string; slotAlias?: string }; to?: { moduleAlias: string; slotAlias?: string };
  material: { kind: 'wafer' | 'carrier'; id: string };
}

interface Route {
  blade1: number; t1: number; a1: number; t2: number; blade2: number; a2: number; llIn: Site; t3: number; a3: number;
  chamber: string; chamberSlot: string; processEnd: number; t4: number; a4: number; llOut: Site; t5: number; blade3: number; a5: number;
}

/** Everything one window's schedule shares: the resource calendars. */
function resources() {
  const lowest = <T>(options: T[], key: (option: T) => number): T =>
    options.reduce((best, option) => key(option) < key(best) ? option : best);
  const sites = (alias: string) => [1, 2].map((slot): Site => ({ alias, slot: String(slot), calendar: new Calendar() }));
  return {
    blades: [new Calendar(), new Calendar()], aligner: new Calendar(), transferModule: new Calendar(),
    loadLocks: [...sites('LL1'), ...sites('LL2')],
    chambers: Array.from({ length: PM_COUNT }, (_, i) => ({ alias: `PM${i + 1}`, calendar: new Calendar() })),
    unmappedChamber: { alias: 'PM5', calendar: new Calendar() },
    lowest,
  };
}

/**
 * One window as an OccurrenceBatch. Every Occurrence is a source-paired start/end; the scenario writes no point events and no
 * illustrative evidence. `firstSeq` continues the Record Sequence of the previous window (it is global per equipment).
 *
 * Deliberate, labelled imperfections (the only ones):
 *  1. one wafer per window is processed in `PM5`, an alias no Alias Rule covers: its location is unknown (unmapped alias);
 *  2. one `UnmatchedEnd` Data Quality Issue per window, with no related Occurrence;
 *  3. the carrier and every wafer's final load port VISIT are source-open (`end: null`): the wafers rest in the carrier and the
 *     source has reported no unload by the Watermark, so no end is invented.
 */
function buildWindow(spec: WindowSpec, firstSeq: number): { batch: OccurrenceBatch; lastSeq: number } {
  const rng = prng(spec.seed);
  const between = (min: number, spread: number) => min + Math.floor(rng() * spread);
  const from = wallClockToMillis(spec.from);
  const to = wallClockToMillis(spec.to);
  const lp = `LP${spec.loadPort}`;
  const { blades, aligner, transferModule, loadLocks, chambers, unmappedChamber, lowest } = resources();
  const drafts: Draft[] = [];
  const wafer = (index: number) => ({ kind: 'wafer' as const, id: `${spec.prefix}-W${String(index + 1).padStart(2, '0')}` });
  const bladeSlot = (blade: number) => String(blade + 1);

  let nominal = from + FIRST_PICKUP;
  let previousPickup = from;
  for (let i = 0; i < WAFERS; i++) {
    const d = {
      toAligner: between(8 * SECOND, 3 * SECOND), align: between(18 * SECOND, 6 * SECOND), toLock: between(9 * SECOND, 3 * SECOND),
      pump: between(45 * SECOND, 15 * SECOND), toChamber: between(11 * SECOND, 3 * SECOND), process: between(540 * SECOND, 180 * SECOND),
      fromChamber: between(11 * SECOND, 3 * SECOND), vent: between(40 * SECOND, 15 * SECOND), toCarrier: between(10 * SECOND, 3 * SECOND),
    };
    const unmapped = i === spec.unmappedChamberWafer;
    // Preferences rotate with the wafer, so the chambers and load lock sites are all used.
    const rotated = <T>(options: T[], by: number) => options.map((_, k) => options[(by + k) % options.length]!);
    const candidates = unmapped ? [unmappedChamber] : rotated(chambers, i);
    const lockIn = rotated(loadLocks, Math.floor(i / 2));
    const lockOut = rotated(loadLocks, Math.floor(i / 2) + 2);
    const pickBlade = (ready: number, duration: number) => {
      const blade = lowest([0, 1], (b) => blades[b]!.earliest(ready, duration));
      return { blade, start: blades[blade]!.earliest(ready, duration) };
    };
    const attempt = (ready: number): Route | null => {
      const first = pickBlade(ready, d.toAligner);
      const a1 = first.start + d.toAligner;
      const second = pickBlade(a1 + d.align, d.toLock);
      if (!aligner.free(a1, second.start)) return null;
      const a2 = second.start + d.toLock;
      const t3 = transferModule.earliest(a2 + d.pump, d.toChamber);
      const llIn = lockIn.find((site) => site.calendar.free(a2, t3));
      if (!llIn) return null;
      const a3 = t3 + d.toChamber;
      const processEnd = a3 + d.process;
      const t4 = transferModule.earliest(processEnd, d.fromChamber);
      const chamber = candidates.find((c) => c.calendar.free(a3, t4));
      if (!chamber) return null;
      const a4 = t4 + d.fromChamber;
      const third = pickBlade(a4 + d.vent, d.toCarrier);
      const llOut = lockOut.find((site) => site.calendar.free(a4, third.start));
      if (!llOut) return null;
      return {
        blade1: first.blade, t1: first.start, a1, t2: second.start, blade2: second.blade, a2, llIn, t3, a3,
        chamber: chamber.alias, chamberSlot: '1', processEnd, t4, a4, llOut, t5: third.start, blade3: third.blade, a5: third.start + d.toCarrier,
      };
    };
    let ready = Math.max(nominal, previousPickup + 30 * SECOND);
    let route: Route | null;
    while ((route = attempt(ready)) === null) ready += RETRY_STEP;
    previousPickup = route.t1;
    nominal += CADENCE + between(0, CADENCE_SPREAD) - CADENCE_SPREAD / 2;

    blades[route.blade1]!.reserve(route.t1, route.a1);
    aligner.reserve(route.a1, route.t2);
    blades[route.blade2]!.reserve(route.t2, route.a2);
    route.llIn.calendar.reserve(route.a2, route.t3);
    transferModule.reserve(route.t3, route.a3);
    candidates.find((c) => c.alias === route.chamber)!.calendar.reserve(route.a3, route.t4);
    transferModule.reserve(route.t4, route.a4);
    route.llOut.calendar.reserve(route.a4, route.t5);
    blades[route.blade3]!.reserve(route.t5, route.a5);

    const material = wafer(i);
    const slot = String(i + 1);
    const id = (step: string) => `occ-${material.id.toLowerCase()}-${step}`;
    const at = (alias: string, slotAlias: string) => ({ moduleAlias: alias, slotAlias });
    const rest = (step: string, start: number, end: number | null, alias: string, slotAlias: string): Draft =>
      ({ id: id(step), kind: 'VISIT', start, end, location: at(alias, slotAlias), material });
    const move = (step: string, start: number, end: number, handler: string, handlerSlot: string, source: Draft['from'], target: Draft['to']): Draft =>
      ({ id: id(step), kind: 'TRANSFER', start, end, location: at(handler, handlerSlot), from: source, to: target, material });
    drafts.push(
      rest('carrier-in', from, route.t1, lp, slot),
      move('to-aligner', route.t1, route.a1, 'EFEM_R1', bladeSlot(route.blade1), at(lp, slot), at('ALN1', '1')),
      rest('aligner', route.a1, route.t2, 'ALN1', '1'),
      move('to-lock', route.t2, route.a2, 'EFEM_R1', bladeSlot(route.blade2), at('ALN1', '1'), at(route.llIn.alias, route.llIn.slot)),
      rest('lock-in', route.a2, route.t3, route.llIn.alias, route.llIn.slot),
      move('to-chamber', route.t3, route.a3, 'TM_R1', '1', at(route.llIn.alias, route.llIn.slot), at(route.chamber, route.chamberSlot)),
      { id: id('process'), kind: 'PROCESS', start: route.a3, end: route.processEnd, location: at(route.chamber, route.chamberSlot), material },
      ...(route.t4 > route.processEnd ? [rest('chamber-wait', route.processEnd, route.t4, route.chamber, route.chamberSlot)] : []),
      move('from-chamber', route.t4, route.a4, 'TM_R1', '1', at(route.chamber, route.chamberSlot), at(route.llOut.alias, route.llOut.slot)),
      rest('lock-out', route.a4, route.t5, route.llOut.alias, route.llOut.slot),
      move('to-carrier', route.t5, route.a5, 'EFEM_R1', bladeSlot(route.blade3), at(route.llOut.alias, route.llOut.slot), at(lp, slot)),
      rest('carrier-out', route.a5, null, lp, slot),
    );
  }
  drafts.unshift({ id: `occ-${spec.carrierId.toLowerCase()}`, kind: 'CARRIER_PRESENCE', start: from, end: null, location: { moduleAlias: lp, slotAlias: '0' }, material: { kind: 'carrier', id: spec.carrierId } });

  const watermarkAt = to - WATERMARK_LAG;
  const issueAt = from + spec.issueAfter * MINUTE;
  // Record Sequence follows time; at equal times a boundary that ends something precedes one that starts something.
  const records = [
    ...drafts.flatMap((draft, order) => [
      { time: draft.start, phase: 1, order, draft, side: 'start' as const },
      ...(draft.end === null ? [] : [{ time: draft.end, phase: 0, order, draft, side: 'end' as const }]),
    ]),
    { time: issueAt, phase: 1, order: drafts.length, draft: null, side: 'issue' as const },
  ].sort((a, b) => a.time - b.time || a.phase - b.phase || a.order - b.order);
  const seqOf = new Map(records.map((record, index) => [record, firstSeq + index]));
  const boundary = (draft: Draft, side: 'start' | 'end') => {
    const record = records.find((r) => r.draft === draft && r.side === side)!;
    return { at: millisToWallClock(record.time), seq: seqOf.get(record)!, evidence: 'observed' as const };
  };
  const lastSeq = firstSeq + records.length - 1;
  if (records.some((record) => record.time > watermarkAt)) throw new RangeError(`${spec.prefix}: a record lies after the Watermark`);

  const occurrences: Occurrence[] = drafts.map((draft) => ({
    id: draft.id, equipmentId: EQUIPMENT_ID, kind: draft.kind, start: boundary(draft, 'start'),
    end: draft.end === null ? null : boundary(draft, 'end'),
    location: draft.location, ...(draft.from ? { from: draft.from } : {}), ...(draft.to ? { to: draft.to } : {}),
    material: { kind: draft.material.kind, id: draft.material.id, identityEvidence: 'observed', lotId: spec.lotId },
    synthetic: false, source: { parserContractVersion: PARSER_CONTRACT, dataGeneration: DATA_GENERATION },
  }));
  const issueRecord = records.find((record) => record.side === 'issue')!;
  return {
    lastSeq,
    batch: {
      equipmentId: EQUIPMENT_ID, from: spec.from, to: spec.to, timeDomain: TIME_DOMAIN,
      watermark: { seq: lastSeq, at: millisToWallClock(watermarkAt) },
      parserContractVersion: PARSER_CONTRACT, dataGeneration: DATA_GENERATION, occurrences,
      issues: [{ id: `dqi-${spec.prefix.toLowerCase()}-unmatched-end`, equipmentId: EQUIPMENT_ID, issueType: 'UnmatchedEnd',
        seq: seqOf.get(issueRecord)!, at: millisToWallClock(issueAt) }],
    },
  };
}

/** The demo's Sample Windows in time order, with one Record Sequence running through both. */
export function buildDemoWindows(): OccurrenceBatch[] {
  let nextSeq = 1;
  return WINDOWS.map((spec) => {
    const { batch, lastSeq } = buildWindow(spec, nextSeq);
    nextSeq = lastSeq + 1;
    return batch;
  });
}
