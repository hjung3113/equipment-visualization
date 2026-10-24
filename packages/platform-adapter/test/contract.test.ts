import { GLOBAL_KEYS, HOST_CONTRACTS, KERNEL_PERMISSIONS, projectContext, type AnyEndpointSpec, type ModuleManifest } from '@ap/contracts';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { eqvManifest, topviewContext, topviewEvents, type TopviewContextParams, type TopviewEventsParams } from '../src/index.js';

// The host (AP kernel `mountModule`, ADR-0053) cannot be imported here; these are its manifest rules, re-implemented.
const HOST_FEATURES = ['query', 'detailSlot', 'write'];
const kernelNamespaces = new Set(KERNEL_PERMISSIONS.map((p) => p.split(':')[0]));
// Mirrors AP `isDotSegment` (kernel location.ts): decode once; an invalid escape counts as a dot segment (fail-closed).
const isDotSegment = (segment: string) => {
  let decoded: string;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    return true;
  }
  return decoded === '.' || decoded === '..';
};
// Mirrors AP `isPathPattern` (kernel module.ts): no URL delimiters, backslash, control characters or whitespace, no `//`, no dot segments.
const isControlOrSpace = (char: string) => { const code = char.codePointAt(0)!; return code <= 0x20 || code === 0x7f || /\s/u.test(char); };
const isPathPattern = (path: string) => ![...path].some((char) => '?#\\'.includes(char) || isControlOrSpace(char))
  && !path.includes('//') && !path.split('/').some(isDotSegment);
// Mirrors the AP registry's route helpers; a module screen path is mounted as `<prefix>/<path>` (`''` is the prefix itself).
const segments = (path: string) => path.split('/').filter(Boolean);
const isParam = (segment: string) => segment.startsWith(':');

const { module: mod, screens, groups } = eqvManifest;
const screenIds = new Set(screens.map((s) => s.id));
const owns = (value: string) => value.startsWith(`${mod.id}:`);

const rules: [string, (m: ModuleManifest) => boolean][] = [
  ['the contract is one the host accepts', (m) => (HOST_CONTRACTS as readonly number[]).includes(m.module.contract)],
  ['required host features exist', (m) => m.requires.every((f) => HOST_FEATURES.includes(f))],
  ['the module id is not a kernel namespace', (m) => !kernelNamespaces.has(m.module.id)],
  ['group ids start with <moduleId>:', (m) => m.groups.every((g) => owns(g.id))],
  ['screen ids are unique', (m) => new Set(m.screens.map((s) => s.id)).size === m.screens.length],
  ['screen ids are bare (the host adds <moduleId>:)', (m) => m.screens.every((s) => !s.id.includes(':'))],
  ['screen permissions start with <moduleId>:', (m) => m.screens.every((s) => owns(s.permission))],
  ['every screen group is declared', (m) => m.screens.every((s) => m.groups.some((g) => g.id === s.group))],
  ['screen paths are relative patterns', (m) => m.screens.every((s) => !s.path.startsWith('/') && isPathPattern(s.path))],
  ['a parent is a screen of the module', (m) => m.screens.every((s) => s.parent === undefined || screenIds.has(s.parent))],
  // createRegistry rules a module's menus must also pass (kernel registry.ts):
  ['a parent route needs no params (breadcrumbs link to it bare)', (m) => m.screens.every((s) => s.parent === undefined || !segments(m.screens.find((p) => p.id === s.parent)!.path).some(isParam))],
  ['each declared group has exactly one primary screen', (m) => m.groups.every((g) => m.screens.filter((s) => s.group === g.id && s.primary).length === 1)],
  ['no page key is a global Context key', (m) => m.screens.every((s) => s.pageKeys.every((k) => !GLOBAL_KEYS.has(k)))],
  ['no two screens share a route shape', (m) => new Set(m.screens.map((s) => segments(s.path).map((x) => (isParam(x) ? ':' : x)).join('/'))).size === m.screens.length],
];

describe('eqvManifest vs host registration rules', () => {
  it.each(rules)('%s', (_name, check) => {
    expect(check(eqvManifest)).toBe(true);
  });

  it('declares the topview and focus screens under the eqv:equipment group', () => {
    expect([...screenIds].sort()).toEqual(['focus', 'topview']);
    expect(groups.map((g) => g.id)).toEqual(['eqv:equipment']);
  });
});

describe('path pattern mirror (AP kernel module.test.ts cases)', () => {
  it.each(['', 'focus', ':id', 'a/b'])('accepts %j', (path) => expect(isPathPattern(path)).toBe(true));
  it.each(['..', 'a/../b', '%2e%2e/admin', '%2E%2e/admin', '%2e/x', '%zz/admin', 'a\\b', 'items?x=1', 'items#x', 'a//b', 'a\u0001b', 'a b', 'a\u3000b'])('rejects %j', (path) =>
    expect(isPathPattern(path)).toBe(false),
  );
});

describe('endpoint declarations', () => {
  const endpoints: AnyEndpointSpec[] = [topviewContext, topviewEvents];

  it.each(endpoints.map((e) => [e.id, e] as const))('%s names a registered screen (eqv:<screen>) and applies time', (_id, spec) => {
    const registered = screens.map((s) => `${mod.id}:${s.id}`);
    expect(registered).toContain(spec.menuId);
    expect(spec.id).toMatch(/^eqv\.[a-z-]+$/);
    expect(spec.context).toEqual({ time: 'apply' });
    expect(spec.permission).toBe('eqv:view');
  });

  it('projects from/to only because time is applied', () => {
    const g = { from: '2026-01-01T00:00:00', to: '2026-01-01T01:00:00' } as Parameters<typeof projectContext>[1];
    expect(Object.keys(projectContext(topviewEvents, g))).toEqual(['from', 'to']);
  });

  it('bounds the event window to one shift', () => {
    expect(topviewEvents.limits).toEqual({ maxHours: 8 });
  });

  it('lists every params key in paramKeys', () => {
    expectTypeOf(topviewContext.paramKeys).toEqualTypeOf<Readonly<Record<keyof TopviewContextParams & string, true>>>();
    expectTypeOf(topviewEvents.paramKeys).toEqualTypeOf<Readonly<Record<keyof TopviewEventsParams & string, true>>>();
    expect(Object.keys(topviewEvents.paramKeys).sort()).toEqual(['continuationToken', 'equipmentId']);
  });
});
