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
