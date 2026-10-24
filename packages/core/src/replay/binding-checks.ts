import { layoutRevision } from '../layout/revision.js';
import type { EquipmentLayoutDocument } from '../layout/schema.js';
import { validateLayout } from '../layout/validate.js';
import { mappingVersionSchema, type Binding, type MappingVersion } from '../mapping/schema.js';
import { verifyMappingHash } from '../mapping/publish.js';

/** `problem` is a Korean message without the path prefix; the host that read the file adds it. */
export type BindingCheck<T> = { ok: true; value: T } | { ok: false; problem: string };

const problems = (issues: readonly { path: readonly PropertyKey[]; message: string }[]) =>
  issues.map(({ path, message }) => `${path.map(String).join('.') || '(root)'}: ${message}`).join('; ');

/** Content checks of a Mapping Version file read for `binding`: schema, content hash, and the hash, equipment and layout it must name. */
export async function checkBindingMapping(raw: unknown, binding: Binding, equipmentId: string): Promise<BindingCheck<MappingVersion>> {
  const parsed = mappingVersionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, problem: problems(parsed.error.issues) };
  const mapping = parsed.data;
  if (!await verifyMappingHash(mapping)) return { ok: false, problem: '내용 hash가 맞지 않습니다' };
  if (mapping.hash !== binding.mappingHash) return { ok: false, problem: `hash(${mapping.hash})가 binding의 mappingHash와 다릅니다` };
  if (mapping.equipmentId !== equipmentId) return { ok: false, problem: `equipmentId(${mapping.equipmentId})가 ${equipmentId}와 다릅니다` };
  if (mapping.layoutId !== binding.layoutId) return { ok: false, problem: `layoutId(${mapping.layoutId})가 binding의 layoutId와 다릅니다` };
  return { ok: true, value: mapping };
}

/**
 * Content checks of a Layout file read for a Binding's `layoutId`: `revision` is the pinned Layout Revision, undefined for the draft
 * (ADR-0011). `notice` is set for the draft, which a Binding without a pin replays.
 */
export async function checkBindingLayout(raw: unknown, layoutId: string, revision: string | undefined):
Promise<BindingCheck<EquipmentLayoutDocument> & { notice?: string }> {
  const notice = revision === undefined ? `게시된 Layout Revision이 없어 초안 레이아웃으로 표시합니다 (${layoutId})` : undefined;
  const result = validateLayout(raw);
  if (!result.ok) return { ok: false, problem: problems(result.issues) };
  const { layout } = result;
  if (layout.kind !== 'equipment-layout') return { ok: false, problem: `equipment-layout이 아닙니다 (${layout.kind})` };
  if (layout.id !== layoutId) return { ok: false, problem: `id(${layout.id})가 ${layoutId}와 다릅니다` };
  if (revision !== undefined && await layoutRevision(layout) !== revision) return { ok: false, problem: '내용 hash가 binding의 layoutRevision과 다릅니다' };
  return { ok: true, value: layout, ...(notice === undefined ? {} : { notice }) };
}

/** Where a Binding-context check failed: the Mapping Version a Binding names, or a Layout (the draft when `revision` is undefined). */
export type BindingContextRef = { kind: 'mapping'; binding: Binding } | { kind: 'layout'; layoutId: string; revision: string | undefined };

/** Each host supplies its own reading (file path vs. response lookup); `undefined` is "not there". */
export type BindingContextReaders = {
  mapping(binding: Binding): Promise<unknown | undefined>;
  layout(layoutId: string, revision: string | undefined): Promise<unknown | undefined>;
};

export type BindingContext =
  | {
    ok: true;
    mappings: MappingVersion[];
    /** The draft Layout of each `layoutId` that has an unpinned Binding. */
    layouts: EquipmentLayoutDocument[];
    layoutRevisions: Record<string, EquipmentLayoutDocument>;
    /** Draft notices, in Binding order. */
    notices: string[];
  }
  /** `problem` is null when the reader returned undefined; otherwise it is the check's path-free message. */
  | { ok: false; problem: string | null; at: BindingContextRef };

/**
 * Server and file data is not trusted to be self-consistent (ADR-0011): checks each distinct (mappingHash, layoutId)
 * relationship once, each unpinned `layoutId` once as the draft, and each pinned Layout Revision once. Stops at the first failure
 * (Mapping Versions first, then drafts, then pinned revisions). Both hosts (Studio, platform adapter) use this one order, so the
 * same bad input reports the same first failure everywhere (#177 slice close; the adapter used a per-Binding order before).
 */
export async function verifyBindingContext(bindings: readonly Binding[], readers: BindingContextReaders, equipmentId: string): Promise<BindingContext> {
  const mappings: MappingVersion[] = [];
  const relationships = new Set<string>();
  for (const binding of bindings) {
    const relationship = JSON.stringify([binding.mappingHash, binding.layoutId]);
    if (relationships.has(relationship)) continue;
    relationships.add(relationship);
    const at: BindingContextRef = { kind: 'mapping', binding };
    const raw = await readers.mapping(binding);
    if (raw === undefined) return { ok: false, problem: null, at };
    const checked = await checkBindingMapping(raw, binding, equipmentId);
    if (!checked.ok) return { ok: false, problem: checked.problem, at };
    mappings.push(checked.value);
  }

  const layouts: EquipmentLayoutDocument[] = [];
  const notices: string[] = [];
  for (const layoutId of new Set(bindings.filter((b) => b.layoutRevision === undefined).map((b) => b.layoutId))) {
    const at: BindingContextRef = { kind: 'layout', layoutId, revision: undefined };
    const raw = await readers.layout(layoutId, undefined);
    if (raw === undefined) return { ok: false, problem: null, at };
    const checked = await checkBindingLayout(raw, layoutId, undefined);
    if (!checked.ok) return { ok: false, problem: checked.problem, at };
    if (checked.notice !== undefined) notices.push(checked.notice);
    layouts.push(checked.value);
  }

  const layoutRevisions: Record<string, EquipmentLayoutDocument> = {};
  for (const { layoutId, layoutRevision: revision } of bindings) {
    if (revision === undefined || revision in layoutRevisions) continue;
    const at: BindingContextRef = { kind: 'layout', layoutId, revision };
    const raw = await readers.layout(layoutId, revision);
    if (raw === undefined) return { ok: false, problem: null, at };
    const checked = await checkBindingLayout(raw, layoutId, revision);
    if (!checked.ok) return { ok: false, problem: checked.problem, at };
    layoutRevisions[revision] = checked.value;
  }
  return { ok: true, mappings, layouts, layoutRevisions, notices };
}
