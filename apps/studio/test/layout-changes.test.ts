import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { layoutDocumentSchema, type LayoutDocument } from '@eqv/core';
import { layoutChanges, isUnchanged } from '../src/layout-changes.js';

const base = layoutDocumentSchema.parse(JSON.parse(
  readFileSync(resolve(process.cwd(), '../../assets/templates/cluster-single.template.json'), 'utf8')));
type Raw = Record<string, unknown> & { viewBox: Record<string, number> };
const clone = () => structuredClone(base) as unknown as Raw;
const asLayout = (raw: Raw) => raw as unknown as LayoutDocument;

it('reports no change for an identical document', () => {
  const changes = layoutChanges(base, asLayout(clone()));
  expect(isUnchanged(changes)).toBe(true);
  expect(changes.header).toEqual([]);
});

// The template has no processRoutes, so the test input gets two minimal valid ones.
const withRoute = (raw: Raw) => {
  const [first, second] = (raw.components as { id: string }[]);
  const route = (id: string) => ({ id, label: id, steps: [first!.id, second!.id] });
  raw.processRoutes = [route('route-a'), route('route-b')];
  return raw;
};
it.each(['levels', 'components', 'physicalInterfaces', 'transferCapabilities', 'processRoutes'] as const)(
  'reports added, removed and changed ids in %s, sorted', (name) => {
    const before = asLayout(withRoute(clone()));
    const items = before[name] as { id: string }[];
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const after = withRoute(clone());
    const next = (after[name] as { id: string }[]).slice(1);
    next[next.length - 1] = { ...next[next.length - 1]!, extra: true } as { id: string };
    next.push({ ...structuredClone(first), id: 'zz-added' }, { ...structuredClone(first), id: 'aa-added' });
    after[name] = next;
    const changes = layoutChanges(before, asLayout(after));
    expect(changes.collections[name]).toEqual({ added: ['aa-added', 'zz-added'], removed: [first.id], changed: [last.id] });
    expect(isUnchanged(changes)).toBe(false);
  },
);

it('reports changed header fields by name', () => {
  const after = clone();
  after.name = 'Renamed';
  after.viewBox = { ...after.viewBox, width: after.viewBox.width! + 1 };
  expect(layoutChanges(base, asLayout(after)).header).toEqual(['name', 'viewBox']);
});
