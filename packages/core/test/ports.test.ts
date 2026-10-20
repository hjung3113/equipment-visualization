import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  componentWorldCenter, layoutDocumentSchema, portPositionToward, projectToFootprint,
  type Component, type LayoutDocument, type TemplateDocument,
} from '../src/index.js';

const root = new URL('../../../', import.meta.url);
const read = (path: string) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const templateIds = [
  'cluster-dual-hub', 'cluster-single', 'lithography-dual-stage', 'track-stacked',
  'vertical-batch-furnace', 'wet-linear',
] as const;
const template = (id: string) => layoutDocumentSchema.parse(
  read(`assets/templates/${id}.template.json`),
) as TemplateDocument;

const makePort = (id: string, x = 0, y = 0): Component['ports'][number] => ({
  id, position: { x, y }, provenance: { certainty: 'assumed', sourceEvidence: ['src-test'] },
});

const makeComponent = (
  id: string,
  transform: Component['transform'],
  size?: Component['size'],
  parentId?: string,
  ports: Component['ports'] = [],
): Component => ({
  id,
  role: 'module',
  assetRef: 'primitive:box',
  label: id,
  ...(parentId ? { parentId } : {}),
  levelId: 'level-main',
  transform,
  ...(size ? { size } : {}),
  ports,
  holdingSites: [],
  provenance: {},
});

const makeLayout = (
  components: Component[],
  physicalInterfaces: LayoutDocument['physicalInterfaces'] = [],
): LayoutDocument => layoutDocumentSchema.parse({
  schemaVersion: '0.4',
  kind: 'template',
  id: 'test-layout',
  name: 'Test layout',
  unit: 'abstract',
  viewBox: { x: 0, y: 0, width: 100, height: 100 },
  sources: [],
  levels: [{ id: 'level-main', label: 'Main', order: 0 }],
  components,
  physicalInterfaces,
  transferCapabilities: [],
  processRoutes: [],
  roleCardinality: {},
});

it.each(templateIds)('%s places each Physical Interface port toward its partner centre', (id) => {
  const layout = template(id);
  const byId = new Map(layout.components.map((component) => [component.id, component]));
  const portAt = (componentId: string, portId: string) => byId.get(componentId)!.ports
    .find((port) => port.id === portId)!;

  for (const edge of layout.physicalInterfaces) {
    const aTarget = componentWorldCenter(layout, edge.b.componentId);
    const bTarget = componentWorldCenter(layout, edge.a.componentId);
    expect(aTarget).toBeDefined();
    expect(bTarget).toBeDefined();
    expect(portAt(edge.a.componentId, edge.a.portId).position)
      .toEqual(portPositionToward(layout, edge.a.componentId, aTarget!));
    expect(portAt(edge.b.componentId, edge.b.portId).position)
      .toEqual(portPositionToward(layout, edge.b.componentId, bTarget!));
  }
});

it.each(templateIds)('%s keeps every sized Component port on its footprint edge', (id) => {
  const layout = template(id);

  for (const component of layout.components) {
    if (!component.size) continue;
    for (const port of component.ports) {
      const edgeRatio = Math.max(
        Math.abs(port.position.x) / (component.size.width / 2),
        Math.abs(port.position.y) / (component.size.height / 2),
      );
      expect(Math.abs(edgeRatio - 1)).toBeLessThanOrEqual(1e-3);
    }
  }
});

it.each([
  { local: { x: 20, y: 10 }, expected: { x: 50, y: 25 } },
  { local: { x: 0, y: 0 }, expected: { x: 0, y: 0 } },
])('projects $local onto the footprint edge', ({ local, expected }) => {
  const component = makeComponent('module-a', { x: 0, y: 0, rotation: 0, scale: 1 }, { width: 100, height: 60 });
  expect(projectToFootprint(component, local)).toEqual(expected);
});

it('composes the world centre through a rotated and scaled parent', () => {
  const parent = makeComponent('parent-a', { x: 100, y: 200, rotation: 90, scale: 2 }, { width: 80, height: 60 });
  const child = makeComponent('child-a', { x: 5, y: 3, rotation: -30, scale: 0.5 }, { width: 20, height: 10 }, parent.id);
  const layout = makeLayout([parent, child]);

  expect(componentWorldCenter(layout, child.id)).toEqual({ x: 94, y: 210 });
});

it('maps a world +x partner direction into the rotated Component local frame', () => {
  const module = makeComponent('module-a', { x: 0, y: 0, rotation: 90, scale: 1 }, { width: 100, height: 60 }, undefined, [makePort('port-a')]);
  const partner = makeComponent('module-b', { x: 40, y: 0, rotation: 0, scale: 1 }, { width: 20, height: 20 }, undefined, [makePort('port-b')]);
  const edge: LayoutDocument['physicalInterfaces'][number] = {
    id: 'edge-a',
    kind: 'gate',
    a: { componentId: module.id, portId: 'port-a' },
    b: { componentId: partner.id, portId: 'port-b' },
    provenance: { certainty: 'assumed', sourceEvidence: ['src-test'] },
  };
  const layout = makeLayout([module, partner], [edge]);

  expect(portPositionToward(layout, module.id, componentWorldCenter(layout, partner.id)!))
    .toEqual({ x: 0, y: -30 });
});

it('returns the local origin for a Component without size', () => {
  const component = makeComponent('module-a', { x: 10, y: 20, rotation: 45, scale: 2 });
  const layout = makeLayout([component]);

  expect(portPositionToward(layout, component.id, { x: 100, y: 200 })).toEqual({ x: 0, y: 0 });
});

it('stops composing a cyclic parent chain at its first repeated Component', () => {
  const a = makeComponent('module-a', { x: 1, y: 0, rotation: 0, scale: 1 }, { width: 20, height: 20 }, 'module-b');
  const b = makeComponent('module-b', { x: 0, y: 3, rotation: 90, scale: 2 }, { width: 20, height: 20 }, 'module-a');
  const layout = makeLayout([a, b]);
  const center = componentWorldCenter(layout, a.id);

  expect(center?.x).toBeCloseTo(0, 10);
  expect(center?.y).toBe(5);
});

it('returns safe fallbacks for unknown Component ids', () => {
  const layout = makeLayout([makeComponent('module-a', { x: 0, y: 0, rotation: 0, scale: 1 })]);

  expect(componentWorldCenter(layout, 'missing-module')).toBeUndefined();
  expect(portPositionToward(layout, 'missing-module', { x: 5, y: 6 })).toEqual({ x: 0, y: 0 });
});
