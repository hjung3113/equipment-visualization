import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  instantiateLayout, layoutDocumentSchema, promoteLayout, validateLayout, type EquipmentLayoutDocument, type TemplateDocument,
} from '../src/index.js';

const read = (path: string) => JSON.parse(readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8'));
const layout = () => layoutDocumentSchema.parse(read('fixtures/cluster-single/layout.json')) as EquipmentLayoutDocument;
const revision = `sha256:${'a'.repeat(64)}`;
const input = { templateId: 'promoted-one', name: 'Promoted', layoutRevision: revision };

describe('promoteLayout', () => {
  it('turns a Layout Revision into a valid Template with exact Role counts and its origin', () => {
    const source = layout();
    const result = promoteLayout(source, input);
    expect(validateLayout(result).ok).toBe(true);
    expect(result).toMatchObject({ kind: 'template', id: 'promoted-one', name: 'Promoted', promotedFrom: { layoutId: source.id, layoutRevision: revision } });
    expect('templateId' in result).toBe(false);
    expect(result.components).toEqual(source.components);
    const counts: Record<string, number> = {};
    for (const { role } of source.components) counts[role] = (counts[role] ?? 0) + 1;
    expect(result.roleCardinality).toEqual(Object.fromEntries(Object.entries(counts).map(([role, n]) => [role, { min: n, max: n }])));
    expect(Object.keys(result.roleCardinality)).toEqual(Object.keys(counts).sort());
    expect(promoteLayout(source, input)).toEqual(result);
  });

  it('instantiates a promoted Template into a valid Layout without promotedFrom', () => {
    const result = instantiateLayout(promoteLayout(layout(), input), 'eq-2-layout');
    expect('promotedFrom' in result).toBe(false);
    expect(validateLayout(result).ok).toBe(true);
  });

  it.each([
    ['invalid id', () => layout(), { ...input, templateId: 'Bad_Id' }],
    ['empty name', () => layout(), { ...input, name: '' }],
    ['template source', () => read('assets/templates/cluster-single.template.json') as EquipmentLayoutDocument, input],
  ])('rejects %s', (_name, source, options) => {
    expect(() => promoteLayout(source(), options)).toThrow(RangeError);
  });
});

it.each([
  ['absent', undefined, true],
  ['present', { layoutId: 'eq-1-layout', layoutRevision: revision }, true],
  ['malformed', { layoutId: 'eq-1-layout', layoutRevision: 'sha256:abc' }, false],
])('Template schema: promotedFrom %s', (_name, promotedFrom, ok) => {
  const template = read('assets/templates/cluster-single.template.json') as TemplateDocument;
  expect(layoutDocumentSchema.safeParse({ ...template, ...(promotedFrom && { promotedFrom }) }).success).toBe(ok);
});
