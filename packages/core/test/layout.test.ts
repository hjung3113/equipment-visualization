import { expect, it } from 'vitest';
import { z } from 'zod';

import { layoutDocumentSchema, validateLayout, type LayoutIssueCode } from '../src/index';
import { clusterTemplate } from './fixtures/layout';

it('validates a synthetic template without changing data or filling unknown provenance', () => {
  const input = clusterTemplate();
  expect(validateLayout(input)).toEqual({ ok: true, layout: input, issues: [] });
});

function withoutCardinality(input: ReturnType<typeof clusterTemplate>) {
  return Object.fromEntries(Object.entries(input).filter(([key]) => key !== 'roleCardinality'));
}

it('validates an equipment layout linked to a template', () => {
  const body = withoutCardinality(clusterTemplate());
  const input = { ...body, kind: 'equipment-layout', templateId: 'cluster-single' };
  expect(validateLayout(input)).toEqual({ ok: true, layout: input, issues: [] });
});

it('never creates connectivity from coincident ports on neighbouring components', () => {
  const input = clusterTemplate();
  input.physicalInterfaces = [];
  const result = validateLayout(input);
  expect(result).toEqual({ ok: true, layout: input, issues: [] });
  if (result.ok) expect(result.layout.physicalInterfaces).toEqual([]);
});

type Failure = {
  name: string;
  mutate: (input: ReturnType<typeof clusterTemplate>) => unknown;
  code: LayoutIssueCode;
  path: (string | number)[];
};

const failures: Failure[] = [
  { name: 'v0.3 evidence', mutate: (v) => ({ ...v, evidence: [] }), code: 'schema', path: [] },
  { name: 'v0.3 component kind', mutate: (v) => ({ ...v, components: [{ ...v.components[0], kind: 'lp' }, ...v.components.slice(1)] }), code: 'schema', path: ['components', 0] },
  { name: 'pixel units', mutate: (v) => ({ ...v, unit: 'px' }), code: 'schema', path: ['unit'] },
  { name: 'empty viewBox', mutate: (v) => { v.viewBox.width = 0; return v; }, code: 'schema', path: ['viewBox', 'width'] },
  { name: 'missing cardinality', mutate: (v) => { return withoutCardinality(v); }, code: 'schema', path: ['roleCardinality'] },
  { name: 'missing template', mutate: (v) => { return { ...withoutCardinality(v), kind: 'equipment-layout' }; }, code: 'schema', path: ['templateId'] },
  { name: 'invalid id', mutate: (v) => ({ ...v, id: 'PM1' }), code: 'schema', path: ['id'] },
  { name: 'duplicate component', mutate: (v) => { v.components.push(structuredClone(v.components[6]!)); return v; }, code: 'duplicate-id', path: ['components', 8, 'id'] },
  { name: 'duplicate local port', mutate: (v) => { v.components[0]!.ports.push(structuredClone(v.components[0]!.ports[0]!)); return v; }, code: 'duplicate-id', path: ['components', 0, 'ports', 1, 'id'] },
  { name: 'missing parent', mutate: (v) => { v.components[0]!.parentId = 'missing'; return v; }, code: 'unknown-reference', path: ['components', 0, 'parentId'] },
  { name: 'missing port', mutate: (v) => { v.physicalInterfaces[0]!.a.portId = 'missing'; return v; }, code: 'unknown-reference', path: ['physicalInterfaces', 0, 'a', 'portId'] },
  { name: 'missing site', mutate: (v) => { v.transferCapabilities[0]!.a.holdingSiteId = 'missing'; return v; }, code: 'unknown-reference', path: ['transferCapabilities', 0, 'a', 'holdingSiteId'] },
  { name: 'missing handler', mutate: (v) => { v.transferCapabilities[0]!.handlerComponentId = 'missing'; return v; }, code: 'unknown-reference', path: ['transferCapabilities', 0, 'handlerComponentId'] },
  { name: 'missing route step', mutate: (v) => { v.processRoutes[0]!.steps[1] = 'missing'; return v; }, code: 'unknown-reference', path: ['processRoutes', 0, 'steps', 1] },
  { name: 'missing source', mutate: (v) => { v.physicalInterfaces[0]!.provenance.sourceEvidence[0] = 'missing'; return v; }, code: 'unknown-reference', path: ['physicalInterfaces', 0, 'provenance', 'sourceEvidence', 0] },
  { name: 'missing level', mutate: (v) => { v.components[0]!.levelId = 'missing'; return v; }, code: 'unknown-level', path: ['components', 0, 'levelId'] },
  { name: 'parent cycle', mutate: (v) => { v.components[4]!.parentId = 'tm-robot'; return v; }, code: 'hierarchy-cycle', path: ['components', 4, 'parentId'] },
  { name: 'non-robot handler', mutate: (v) => { v.transferCapabilities[0]!.handlerComponentId = 'pm-a'; return v; }, code: 'handler-not-robot', path: ['transferCapabilities', 0, 'handlerComponentId'] },
  { name: 'physical self-loop', mutate: (v) => { v.physicalInterfaces[0]!.b = { ...v.physicalInterfaces[0]!.a }; return v; }, code: 'self-loop', path: ['physicalInterfaces', 0, 'b'] },
  { name: 'transfer self-loop', mutate: (v) => { v.transferCapabilities[0]!.b = { ...v.transferCapabilities[0]!.a }; return v; }, code: 'self-loop', path: ['transferCapabilities', 0, 'b'] },
  { name: 'verified without evidence', mutate: (v) => { v.physicalInterfaces[0]!.provenance.sourceEvidence = []; return v; }, code: 'verified-without-evidence', path: ['physicalInterfaces', 0, 'provenance', 'sourceEvidence'] },
  { name: 'duplicate source', mutate: (v) => { v.sources.push({ ...v.sources[0]! }); return v; }, code: 'duplicate-id', path: ['sources', 1, 'id'] },
  { name: 'duplicate level', mutate: (v) => { v.levels.push({ ...v.levels[0]! }); return v; }, code: 'duplicate-id', path: ['levels', 1, 'id'] },
  { name: 'duplicate local site', mutate: (v) => { v.components[0]!.holdingSites.push(structuredClone(v.components[0]!.holdingSites[0]!)); return v; }, code: 'duplicate-id', path: ['components', 0, 'holdingSites', 3, 'id'] },
  { name: 'duplicate physical edge', mutate: (v) => { v.physicalInterfaces.push(structuredClone(v.physicalInterfaces[0]!)); return v; }, code: 'duplicate-id', path: ['physicalInterfaces', 5, 'id'] },
  { name: 'duplicate transfer edge', mutate: (v) => { v.transferCapabilities.push(structuredClone(v.transferCapabilities[0]!)); return v; }, code: 'duplicate-id', path: ['transferCapabilities', 3, 'id'] },
  { name: 'duplicate route', mutate: (v) => { v.processRoutes.push(structuredClone(v.processRoutes[0]!)); return v; }, code: 'duplicate-id', path: ['processRoutes', 1, 'id'] },
  { name: 'missing port component', mutate: (v) => { v.physicalInterfaces[0]!.a.componentId = 'missing'; return v; }, code: 'unknown-reference', path: ['physicalInterfaces', 0, 'a', 'componentId'] },
  { name: 'missing site component', mutate: (v) => { v.transferCapabilities[0]!.a.componentId = 'missing'; return v; }, code: 'unknown-reference', path: ['transferCapabilities', 0, 'a', 'componentId'] },
  { name: 'port evidence reference', mutate: (v) => { v.components[0]!.ports[0]!.provenance.sourceEvidence = ['missing']; return v; }, code: 'unknown-reference', path: ['components', 0, 'ports', 0, 'provenance', 'sourceEvidence', 0] },
  { name: 'site evidence reference', mutate: (v) => { v.components[0]!.holdingSites[0]!.provenance.sourceEvidence = ['missing']; return v; }, code: 'unknown-reference', path: ['components', 0, 'holdingSites', 0, 'provenance', 'sourceEvidence', 0] },
  { name: 'property evidence reference', mutate: (v) => { v.components[0]!.provenance.role = { certainty: 'assumed', sourceEvidence: ['missing'] }; return v; }, code: 'unknown-reference', path: ['components', 0, 'provenance', 'role', 'sourceEvidence', 0] },
  { name: 'transfer evidence reference', mutate: (v) => { v.transferCapabilities[0]!.provenance.sourceEvidence = ['missing']; return v; }, code: 'unknown-reference', path: ['transferCapabilities', 0, 'provenance', 'sourceEvidence', 0] },
  { name: 'inverted cardinality', mutate: (v) => { v.roleCardinality.pm = { min: 3, max: 2 }; return v; }, code: 'schema', path: ['roleCardinality', 'pm', 'max'] },
  { name: 'non-finite geometry', mutate: (v) => { v.components[0]!.transform.x = Infinity; return v; }, code: 'schema', path: ['components', 0, 'transform', 'x'] },
  { name: 'non-positive scale', mutate: (v) => { v.components[0]!.transform.scale = 0; return v; }, code: 'schema', path: ['components', 0, 'transform', 'scale'] },
  { name: 'role count', mutate: (v) => { v.roleCardinality.pm = { min: 3, max: 6 }; return v; }, code: 'role-cardinality', path: ['roleCardinality', 'pm'] },
];

it.each(failures)('rejects $name with a precise issue', ({ mutate, code, path }) => {
  const result = validateLayout(mutate(clusterTemplate()));
  expect(result.ok).toBe(false);
  expect(result.issues).toEqual([{ code, path, message: expect.any(String) }]);
});

it('collects defects in document order', () => {
  const input = clusterTemplate();
  input.components[0]!.levelId = 'missing';
  input.transferCapabilities[0]!.handlerComponentId = 'pm-a';
  const result = validateLayout(input);
  expect(result.issues).toEqual([
    { code: 'unknown-level', path: ['components', 0, 'levelId'], message: expect.any(String) },
    { code: 'handler-not-robot', path: ['transferCapabilities', 0, 'handlerComponentId'], message: expect.any(String) },
  ]);
});

it('reports each hierarchy cycle once even when an earlier component points into it', () => {
  const input = clusterTemplate();
  input.components[0]!.parentId = 'tm-robot';
  input.components[4]!.parentId = 'tm-robot';
  input.components[1]!.parentId = 'efem-robot';
  expect(validateLayout(input).issues).toEqual([
    { code: 'hierarchy-cycle', path: ['components', 1, 'parentId'], message: expect.any(String) },
    { code: 'hierarchy-cycle', path: ['components', 4, 'parentId'], message: expect.any(String) },
  ]);
});

it('returns schema issues without running semantic validation', () => {
  const input = clusterTemplate();
  input.components[0]!.levelId = 'missing';
  expect(validateLayout({ ...input, unit: 'px' }).issues).toEqual([
    { code: 'schema', path: ['unit'], message: expect.any(String) },
  ]);
});

it('keeps the published JSON Schema synchronized with the zod source', async () => {
  const schema = z.toJSONSchema(layoutDocumentSchema);
  await expect(JSON.stringify(schema, null, 2) + '\n').toMatchFileSnapshot('../schema/layout.schema.json');
});
