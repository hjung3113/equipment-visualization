import { idSchema, type EquipmentLayoutDocument, type TemplateDocument } from '../layout/schema.js';

/** Copies a Template or Generic Layout into a new Equipment Layout draft; only identity fields change. */
export function instantiateLayout(source: TemplateDocument | EquipmentLayoutDocument, layoutId: string): EquipmentLayoutDocument {
  if (!idSchema.safeParse(layoutId).success) throw new RangeError(`layoutId ${JSON.stringify(layoutId)} is not a valid id`);
  if (source.kind === 'equipment-layout') return { ...source, id: layoutId };
  const copy: Record<string, unknown> = { ...source };
  delete copy.roleCardinality;
  delete copy.promotedFrom;
  return { ...copy, kind: 'equipment-layout', id: layoutId, templateId: source.id } as EquipmentLayoutDocument;
}
