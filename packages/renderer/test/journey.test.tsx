// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { layoutDocumentSchema, type LayoutDocument } from '@eqv/core';
import { TopViewer, buildScene, type JourneyHopMark } from '../src/index.js';
import { buildJourneyLayer } from '../src/journey.js';
import type { SvgNode } from '../src/svg.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const layout: LayoutDocument = layoutDocumentSchema.parse(
  JSON.parse(readFileSync(resolve(process.cwd(), '../../assets/templates/cluster-single.template.json'), 'utf8')));
const scene = buildScene(layout, { width: 1000, height: 700, pxPerUnit: 4, interactive: true });
const k = 1 / scene.pxPerUnit;
const hop = (number: number, componentId: string, evidence: JourneyHopMark['evidence'] = 'observed'): JourneyHopMark => ({ number, componentId, evidence });
const all = (node: SvgNode): SvgNode[] => [node, ...node.children.flatMap((c) => typeof c === 'string' ? [] : all(c))];
const badges = (layer: SvgNode) => layer.children.filter((c): c is SvgNode => typeof c !== 'string');
const text = (node: SvgNode) => node.children.filter((c): c is string => typeof c === 'string').join('');
const titleOf = (node: SvgNode) => text(node.children.find((c): c is SvgNode => typeof c !== 'string' && c.tag === 'title')!);
const num = (node: SvgNode, name: string) => Number(node.attrs[name]);

it('numbers the badges per Component in hop order, in a row on the top edge of its bbox', () => {
  const bbox = scene.components.get('pm-a')!.bbox;
  const layer = buildJourneyLayer(scene, { hops: [hop(3, 'pm-a'), hop(1, 'pm-a'), hop(2, 'lp-1')] }, k);
  const row = badges(layer).filter((b) => b.attrs['data-component-id'] === 'pm-a');
  expect(row.map((b) => b.attrs['data-journey-hop'])).toEqual(['1', '3']);
  const circles = row.map((b) => b.children.find((c): c is SvgNode => typeof c !== 'string' && c.tag === 'circle')!);
  expect(num(circles[0]!, 'cx')).toBeLessThan(num(circles[1]!, 'cx'));
  for (const c of circles) {
    expect(num(c, 'cy') - num(c, 'r')).toBeGreaterThanOrEqual(bbox.y0);
    expect(num(c, 'cy')).toBeLessThan((bbox.y0 + bbox.y1) / 2);
  }
  expect(row.map(text).concat(row.flatMap((b) => b.children.filter((c): c is SvgNode => typeof c !== 'string' && c.tag === 'text').map(text)))).toContain('3');
  expect(row.map(titleOf)).toEqual(['hop 1 · pm-a · 관측', 'hop 3 · pm-a · 관측']);
});

it.each([
  { evidence: 'observed', dash: undefined },
  { evidence: 'derived', dash: '6 4' },
  { evidence: 'unknown', dash: '2 3' },
] as const)('rings a $evidence hop with dash $dash', ({ evidence, dash }) => {
  const [badge] = badges(buildJourneyLayer(scene, { hops: [hop(1, 'pm-a', evidence)] }, k));
  const circle = badge!.children.find((c): c is SvgNode => typeof c !== 'string' && c.tag === 'circle')!;
  expect(circle.attrs['stroke-dasharray']).toBe(dash);
});

it('shows the first three badges and a +N chip naming the hidden numbers from five hops on a Component', () => {
  const four = badges(buildJourneyLayer(scene, { hops: [1, 2, 3, 4].map((n) => hop(n, 'pm-a')) }, k));
  expect(four).toHaveLength(4);
  const five = badges(buildJourneyLayer(scene, { hops: [1, 2, 3, 4, 5].map((n) => hop(n, 'pm-a')) }, k));
  expect(five.map((b) => b.attrs['data-journey-hop'] ?? 'more')).toEqual(['1', '2', '3', 'more']);
  expect(titleOf(five[3]!)).toBe('+2 · hop 4, 5');
});

it('draws only discrete marks: no connector, no animation, and the selected badge is emphasised beyond colour', () => {
  const layer = buildJourneyLayer(scene, { hops: [hop(1, 'lp-1'), hop(2, 'll-a', 'derived'), hop(3, 'pm-a')], selected: 2 }, k);
  expect(all(layer).map((n) => n.tag).filter((tag) => /^(line|path|polyline|polygon|animate.*)$/.test(tag))).toEqual([]);
  expect(JSON.stringify(layer)).not.toMatch(/animation|transition/);
  const widths = badges(layer).map((b) => [b.attrs['data-journey-hop'], b.attrs['data-selected'],
    b.children.find((c): c is SvgNode => typeof c !== 'string' && c.tag === 'circle')!.attrs['stroke-width']]);
  expect(widths).toEqual([['1', undefined, '1.5'], ['2', 'true', '3'], ['3', undefined, '1.5']]);
});

it('selects a Component through a badge click without drawing Transfer Capability segments or a connector', () => {
  expect(scene.capabilities.length).toBeGreaterThan(0);
  const picked: (string | null)[] = [];
  const { container } = render(<TopViewer layout={layout} width={1000} height={700} selectedId="ll-a"
    onSelectedChange={(id) => picked.push(id)} highlight={{ componentIds: ['ll-a'] }}
    journey={{ hops: [hop(1, 'lp-1'), hop(2, 'll-a'), hop(3, 'pm-a', 'derived')], selected: 2 }} />);
  const svg = container.querySelector('svg')!;
  const journey = svg.querySelector('[data-layer="journey"]')!;
  expect(journey.querySelectorAll('[data-journey-hop]')).toHaveLength(3);
  expect(svg.querySelector('[data-layer="capabilities"]')!.children).toHaveLength(0);
  expect(svg.querySelector('[data-layer="highlight"]')!.querySelectorAll('line, path, polyline')).toHaveLength(0);
  expect(journey.querySelector('line, path, polyline, animate, animateTransform, animateMotion, set')).toBeNull();
  expect(journey.getAttribute('pointer-events')).toBeNull();
  fireEvent.click(journey.querySelector('[data-journey-hop="3"]')!);
  expect(picked).toEqual(['pm-a']);
});
