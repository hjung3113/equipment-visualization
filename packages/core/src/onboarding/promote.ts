import { idSchema, type EquipmentLayoutDocument, type TemplateDocument } from '../layout/schema.js';

/**
 * Copies a published Layout Revision into a Template document (ADR-0015); only identity fields change.
 * `roleCardinality` is the exact Component count per Role; Component IDs and all other fields are copied verbatim.
 */
export function promoteLayout(
  layout: EquipmentLayoutDocument, { templateId, name, layoutRevision }: { templateId: string; name: string; layoutRevision: string },
): TemplateDocument {
  if ((layout as { kind: string }).kind !== 'equipment-layout') throw new RangeError('only an equipment-layout can be promoted');
  if (!idSchema.safeParse(templateId).success) throw new RangeError(`templateId ${JSON.stringify(templateId)} is not a valid id`);
  if (name === '') throw new RangeError('name must not be empty');
  const counts = new Map<string, number>();
  for (const { role } of layout.components) counts.set(role, (counts.get(role) ?? 0) + 1);
  const roleCardinality = Object.fromEntries(
    [...counts].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([role, n]) => [role, { min: n, max: n }]),
  );
  const copy: Record<string, unknown> = { ...layout };
  delete copy.templateId;
  return {
    ...copy, kind: 'template', id: templateId, name, roleCardinality, promotedFrom: { layoutId: layout.id, layoutRevision },
  } as TemplateDocument;
}
