import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  bindingsFileSchema, checkBindingLayout, checkBindingMapping, layoutRevision, mappingVersionSchema, validateLayout,
  type Binding, type MappingVersion,
} from '../src/index.js';

const root = new URL('../../../fixtures/cluster-single/', import.meta.url);
const read = (path: string): unknown => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const directory = 'onboarding/mappings/eq-synth-01/';
const bindings = bindingsFileSchema.parse(read('onboarding/bindings/eq-synth-01.bindings.json')).bindings;
const binding: Binding = bindings[0]!;
const rawMapping = read(directory + readdirSync(new URL(directory, root)).find((f) => f.startsWith(binding.mappingHash.slice(7, 15)))!) as MappingVersion;
const rawLayout = read('layout.json') as { id: string; kind: string; components: unknown[] };

describe('checkBindingMapping', () => {
  it('returns the parsed Mapping Version when every check passes', async () => {
    const result = await checkBindingMapping(rawMapping, binding, 'eq-synth-01');
    expect(result).toEqual({ ok: true, value: mappingVersionSchema.parse(rawMapping) });
  });

  it.each([
    ['a bad schema', () => checkBindingMapping({ ...rawMapping, entries: 'x' }, binding, 'eq-synth-01'), /^entries: /],
    ['an edited body', () => checkBindingMapping({ ...rawMapping, layoutId: 'other' }, binding, 'eq-synth-01'), /^내용 hash가 맞지 않습니다$/],
    ['a hash the Binding does not name', () => checkBindingMapping(rawMapping, { ...binding, mappingHash: `sha256:${'0'.repeat(64)}` }, 'eq-synth-01'), /^hash\(sha256:[0-9a-f]+\)가 binding의 mappingHash와 다릅니다$/],
    ['another equipmentId', () => checkBindingMapping(rawMapping, binding, 'eq-other'), /^equipmentId\(eq-synth-01\)가 eq-other와 다릅니다$/],
    ['another layoutId', () => checkBindingMapping(rawMapping, { ...binding, layoutId: 'other-layout' }, 'eq-synth-01'), /^layoutId\(eq-synth-01-layout\)가 binding의 layoutId와 다릅니다$/],
  ])('rejects %s', async (_name, check, problem) => {
    const result = await check();
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.problem).toMatch(problem);
  });
});

describe('checkBindingLayout', () => {
  it('returns the draft Layout with the draft notice when no revision is pinned', async () => {
    const result = await checkBindingLayout(rawLayout, 'eq-synth-01-layout', undefined);
    expect(result).toMatchObject({ ok: true, notice: '게시된 Layout Revision이 없어 초안 레이아웃으로 표시합니다 (eq-synth-01-layout)' });
  });

  it('returns the pinned Layout without a notice when the revision hash matches', async () => {
    const validated = validateLayout(rawLayout);
    if (!validated.ok) throw new Error('fixture layout invalid');
    const result = await checkBindingLayout(rawLayout, 'eq-synth-01-layout', await layoutRevision(validated.layout));
    expect(result.ok).toBe(true);
    expect('notice' in result).toBe(false);
  });

  it.each([
    ['a bad schema', () => checkBindingLayout({ ...rawLayout, components: 'x' }, 'eq-synth-01-layout', undefined), /^\S+: /],
    ['a template file', () => checkBindingLayout(JSON.parse(readFileSync(new URL('../../../fixtures/templates/cluster-single.template.json', import.meta.url), 'utf8')), 'x', undefined), /^equipment-layout이 아닙니다 \(template\)$/],
    ['another layout id', () => checkBindingLayout(rawLayout, 'other-layout', undefined), /^id\(eq-synth-01-layout\)가 other-layout와 다릅니다$/],
    ['a revision hash mismatch', () => checkBindingLayout(rawLayout, 'eq-synth-01-layout', `sha256:${'0'.repeat(64)}`), /^내용 hash가 binding의 layoutRevision과 다릅니다$/],
  ])('rejects %s', async (_name, check, problem) => {
    const result = await check();
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.problem).toMatch(problem);
  });
});
