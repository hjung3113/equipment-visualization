import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  layoutDocumentSchema, materialJourney, stepSceneState, type MappingVersion, type Occurrence, type ReplayInput, type SiteWallClock,
} from '../src/index.js';

const root = new URL('../../../fixtures/cluster-single/', import.meta.url);
const layout = layoutDocumentSchema.parse(JSON.parse(readFileSync(new URL('layout.json', root), 'utf8')));
if (layout.kind !== 'equipment-layout') throw new Error('Expected equipment layout');
const hash = (c: string) => `sha256:${c.repeat(64)}`;
const time = (value: string): SiteWallClock => `2026-01-01T${value}.000`;
const mapping = (certainty: 'verified' | 'assumed' = 'verified'): MappingVersion => ({
  schemaVersion: '0.4', equipmentId: 'eq-j', layoutId: layout.id, hash: hash('a'),
  entries: [
    { alias: 'LP1', target: { componentId: 'lp-a', slots: { offset: 0, assign: [{ from: 1, to: 1, holdingSiteId: 'slot-01' }, { from: 2, to: 2, holdingSiteId: 'slot-02' }] } }, certainty: 'verified', rule: { scope: { level: 'global' }, ruleId: 'r' } },
    { alias: 'ROBOT', target: { componentId: 'efem-robot' }, certainty: 'verified', rule: { scope: { level: 'global' }, ruleId: 'r' } },
    { alias: 'PM1', target: { componentId: 'pm-a' }, certainty, rule: { scope: { level: 'global' }, ruleId: 'r' } },
    { alias: 'GHOST', target: { ignore: true }, certainty: 'verified', rule: { scope: { level: 'global' }, ruleId: 'r' } },
  ],
});
type Spec = { id: string; kind?: Occurrence['kind']; alias?: string; slot?: string; wafer?: string | null; identity?: 'observed' | 'illustrative';
  start: [number, string | null, Occurrence['start']['evidence']?]; end?: [number, string | null] | null; synthetic?: boolean };
const occurrence = (s: Spec): Occurrence => ({
  id: s.id, equipmentId: 'eq-j', kind: s.kind ?? 'VISIT',
  start: { at: s.start[1] === null ? null : time(s.start[1]), seq: s.start[0], evidence: s.start[2] ?? 'observed' },
  end: s.end ? { at: s.end[1] === null ? null : time(s.end[1]), seq: s.end[0], evidence: 'observed' } : null,
  ...(s.alias === undefined ? {} : { location: { moduleAlias: s.alias, ...(s.slot === undefined ? {} : { slotAlias: s.slot }) } }),
  ...(s.wafer === null ? { material: { kind: 'wafer' as const, id: null, identityEvidence: 'observed' as const } }
    : s.wafer === undefined ? {} : { material: { kind: 'wafer' as const, id: s.wafer, identityEvidence: s.identity ?? 'observed' } }),
  synthetic: s.synthetic ?? false, source: { parserContractVersion: 'synthetic-1', dataGeneration: 'g1' },
});
const input = (specs: Spec[], options: { certainty?: 'verified' | 'assumed'; watermark?: string; issues?: ReplayInput['batch']['issues'] } = {}): ReplayInput => ({
  batch: { equipmentId: 'eq-j', from: time('10:00:00'), to: time('11:00:00'), timeDomain: 'site-synth',
    watermark: { seq: 999, at: time(options.watermark ?? '10:59:00') }, parserContractVersion: 'synthetic-1', dataGeneration: 'g1',
    occurrences: specs.map(occurrence), issues: options.issues ?? [] },
  layouts: [layout], mappings: [mapping(options.certainty)],
  bindings: { schemaVersion: '0.4', equipmentId: 'eq-j', bindings: [{ layoutId: layout.id, mappingHash: hash('a'), effectiveFrom: time('09:00:00') }] },
});
const W = 'm:wafer:W1';

it('orders hops by Record Sequence even when a later record has an earlier timestamp', () => {
  const journey = materialJourney(input([
    { id: 'a', alias: 'LP1', slot: '1', wafer: 'W1', start: [1, '10:05:00'], end: [2, '10:06:00'] },
    { id: 'b', alias: 'PM1', wafer: 'W1', start: [3, '10:02:00'], end: [4, '10:03:00'] },
  ]), W);
  expect(journey.hops.map((h) => [h.number, h.occurrenceIds, h.location?.componentId])).toEqual([[1, ['a'], 'lp-a'], [2, ['b'], 'pm-a']]);
});

it('draws a TRANSFER on the Handler as derived and merges a VISIT and PROCESS at one Location into one hop', () => {
  const journey = materialJourney(input([
    { id: 'v', alias: 'PM1', wafer: 'W1', start: [1, '10:00:00'], end: [2, '10:01:00'] },
    { id: 'p', kind: 'PROCESS', alias: 'PM1', wafer: 'W1', start: [3, '10:01:00'], end: [4, '10:02:00'] },
    { id: 't', kind: 'TRANSFER', alias: 'ROBOT', wafer: 'W1', start: [5, '10:02:00'], end: [6, '10:03:00'] },
  ]), W);
  expect(journey.hops).toMatchObject([
    { number: 1, occurrenceIds: ['v', 'p'], location: { componentId: 'pm-a' }, locationEvidence: 'observed', arrival: { seq: 1 }, departure: { seq: 4 } },
    { number: 2, occurrenceIds: ['t'], location: { componentId: 'efem-robot' }, locationEvidence: 'derived' },
  ]);
});

it.each([
  { name: 'closed', visitEnd: [6, '10:06:00'] as [number, string], departure: { seq: 6 } },
  { name: 'open', visitEnd: null, departure: null },
])('keeps the longer or open VISIT as the departure of a merged hop with a nested PROCESS ($name VISIT)', ({ visitEnd, departure }) => {
  const { hops } = materialJourney(input([
    { id: 'v', alias: 'PM1', wafer: 'W1', start: [1, '10:00:00'], end: visitEnd },
    { id: 'p', kind: 'PROCESS', alias: 'PM1', wafer: 'W1', start: [2, '10:01:00'], end: [3, '10:02:00'] },
  ]), W);
  expect(hops).toHaveLength(1);
  expect(hops[0]).toMatchObject({ occurrenceIds: ['v', 'p'], departure });
});

it('keeps an unmapped alias as an unknown hop with its alias, and caps an assumed mapping at derived', () => {
  const unmapped = materialJourney(input([{ id: 'x', alias: 'PM5', wafer: 'W1', start: [1, '10:00:00'], end: null }]), W);
  expect(unmapped.hops).toMatchObject([{ alias: { moduleAlias: 'PM5' }, location: null, locationEvidence: 'unknown' }]);
  const assumed = materialJourney(input([{ id: 'x', alias: 'PM1', wafer: 'W1', start: [1, '10:00:00'], end: null }], { certainty: 'assumed' }), W);
  expect(assumed.hops[0]).toMatchObject({ location: { componentId: 'pm-a' }, locationEvidence: 'derived' });
});

it('leaves the departure null for an open last Occurrence and skips an ignored alias', () => {
  const journey = materialJourney(input([
    { id: 'g', alias: 'GHOST', wafer: 'W1', start: [1, '10:00:00'], end: [2, '10:01:00'] },
    { id: 'a', alias: 'PM1', wafer: 'W1', start: [3, '10:02:00'], end: null },
  ]), W);
  expect(journey.hops).toMatchObject([{ number: 1, occurrenceIds: ['a'], departure: null }]);
});

it.each([
  { name: 'a Time Anomaly at the sample', specs: [
    { id: 'a', alias: 'LP1', slot: '1', wafer: 'W1', start: [1, '10:10:00'], end: [2, '10:11:00'] },
    { id: 'b', alias: 'PM1', wafer: 'W1', start: [3, '10:05:00'], end: [4, '10:06:00'] },
  ] satisfies Spec[], hop: 2 },
  { name: 'an occupancy conflict at the sample', specs: [
    { id: 'a', alias: 'LP1', slot: '1', wafer: 'W2', start: [1, '10:00:00'], end: [4, '10:03:00'] },
    { id: 'b', alias: 'LP1', slot: '1', wafer: 'W1', start: [2, '10:01:00'], end: [3, '10:02:00'] },
  ] satisfies Spec[], hop: 1 },
])('marks the hop unknown for $name', ({ specs, hop }) => {
  expect(materialJourney(input(specs), W).hops[hop - 1]!.locationEvidence).toBe('unknown');
});

it('lists only PROCESS, POST_PROCESS and FUNCTION in Record Sequence order, including location-less and ignored rows', () => {
  const journey = materialJourney(input([
    { id: 'f', kind: 'FUNCTION', wafer: 'W1', identity: 'illustrative', start: [7, '10:07:00', 'derived'], end: [8, '10:08:00'] },
    { id: 'v', alias: 'PM1', wafer: 'W1', start: [1, '10:00:00'], end: [2, '10:01:00'] },
    { id: 'p', kind: 'PROCESS', alias: 'PM1', wafer: 'W1', start: [3, '10:02:00', 'illustrative'], end: null },
    { id: 'pp', kind: 'POST_PROCESS', alias: 'GHOST', wafer: 'W1', start: [5, '10:05:00'], end: [6, '10:06:00'] },
    { id: 'other', kind: 'PROCESS', alias: 'PM1', wafer: 'W2', start: [9, '10:09:00'], end: null },
  ]), W);
  expect(journey.executions).toMatchObject([
    { occurrenceId: 'p', kind: 'PROCESS', location: { componentId: 'pm-a' }, locationEvidence: 'observed', start: { evidence: 'unknown' }, end: null },
    { occurrenceId: 'pp', kind: 'POST_PROCESS', alias: { moduleAlias: 'GHOST' }, location: null, locationEvidence: 'unknown' },
    { occurrenceId: 'f', kind: 'FUNCTION', alias: null, location: null, locationEvidence: 'unknown', identityEvidence: 'unknown', start: { evidence: 'derived' } },
  ]);
  expect(journey.executions.map((e) => e.occurrenceId)).toEqual(['p', 'pp', 'f']);
});

it('starts another hop when the Layout Revision changes, even with the same alias and Location', () => {
  const data = input([
    { id: 'a', alias: 'PM1', wafer: 'W1', start: [1, '10:00:00'], end: [2, '10:01:00'] },
    { id: 'b', alias: 'PM1', wafer: 'W1', start: [3, '10:30:00'], end: null },
  ]);
  const [r1, r2] = [hash('1'), hash('2')];
  data.layoutRevisions = { [r1]: layout, [r2]: layout };
  data.bindings.bindings = [
    { layoutId: layout.id, mappingHash: hash('a'), layoutRevision: r1, effectiveFrom: time('09:00:00'), effectiveTo: time('10:15:00') },
    { layoutId: layout.id, mappingHash: hash('a'), layoutRevision: r2, effectiveFrom: time('10:15:00') },
  ];
  const { hops } = materialJourney(data, W);
  expect(hops.map((h) => [h.occurrenceIds, h.layoutRevision])).toEqual([[['a'], r1], [['b'], r2]]);
  expect(hops.every((h) => h.location?.componentId === 'pm-a')).toBe(true);
});

it('is a pure function of its input', () => {
  const data = input([{ id: 'a', alias: 'LP1', slot: '1', wafer: 'W1', start: [1, '10:00:00'], end: null }]);
  expect(materialJourney(data, W)).toEqual(materialJourney(data, W));
});

it('agrees with stepSceneState at every sample with other materials opening and closing between samples', () => {
  const data = input([
    { id: 'a', alias: 'LP1', slot: '1', wafer: 'W1', start: [1, null], end: [9, '10:05:00'] },
    { id: 'o1', alias: 'LP1', slot: '2', wafer: 'W2', start: [2, '10:01:00'], end: [4, '10:02:00'] },
    { id: 'o2', alias: 'PM1', wafer: 'W2', start: [3, null], end: [8, '10:04:00'] },
    { id: 'o3', alias: 'ROBOT', wafer: 'W3', start: [5, '10:03:00'], end: null },
    { id: 'b', kind: 'TRANSFER', alias: 'ROBOT', wafer: 'W1', start: [10, '10:06:00'], end: [13, '10:08:00'] },
    { id: 'o4', alias: 'PM1', wafer: 'W2', start: [11, '10:07:00'], end: [14, '10:09:00'] },
    { id: 'c', alias: 'PM1', wafer: 'W1', start: [15, '10:03:30'], end: null },
  ], { issues: [{ id: 'dqi-1', equipmentId: 'eq-j', issueType: 'synthetic', seq: 12, at: time('10:07:30') }] });
  const { hops } = materialJourney(data, W);
  expect(hops).toHaveLength(3);
  expect(hops[0]).toMatchObject({ location: null, locationEvidence: 'unknown', arrival: { seq: 1, at: null } });
  for (const hop of hops) {
    expect(hop.occurrenceIds).toHaveLength(1);
    const material = stepSceneState(data, hop.arrival.seq).materials.find((m) => m.key === W);
    expect({ location: hop.location, evidence: hop.locationEvidence, identity: hop.identityEvidence })
      .toEqual({ location: material?.location ?? null, evidence: material?.locationEvidence, identity: material?.identityEvidence });
  }
});
