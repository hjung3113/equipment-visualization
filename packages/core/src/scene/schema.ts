import { z } from 'zod';
import { idSchema } from '../layout/schema.js';
import { evidenceLevelSchema, occurrenceSchema } from '../occurrence/schema.js';
import { siteWallClockSchema } from '../site-wall-clock.js';

const text = z.string().min(1);
const stateEvidenceSchema = z.enum(['observed', 'derived', 'unknown']);
const sceneMaterialSchema = z.strictObject({
  key: text.describe('Material id, or occ:<occurrenceId> when id is null.'),
  kind: occurrenceSchema.shape.material.unwrap().shape.kind,
  id: text.nullable(),
  identityEvidence: evidenceLevelSchema,
  lotId: z.string().optional(),
  alias: occurrenceSchema.shape.location.unwrap(),
  location: z.strictObject({ componentId: idSchema, holdingSiteId: idSchema.optional() }).nullable(),
  locationEvidence: stateEvidenceSchema,
  occurrenceId: text,
  lastObservedAt: siteWallClockSchema.nullable(),
});
const sceneComponentSchema = z.strictObject({
  componentId: idSchema,
  activity: z.enum(['processing', 'post-processing', 'function', 'no recorded activity']),
  activityEvidence: stateEvidenceSchema,
  occurrenceIds: z.array(text).describe('Open activity Occurrence ids, sorted by code unit.'),
});
const sceneMarkerSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('after-watermark'), watermarkAt: siteWallClockSchema }),
  z.strictObject({ kind: z.literal('occupancy-conflict'), componentId: idSchema, holdingSiteId: idSchema, materialKeys: z.array(text) }),
  z.strictObject({ kind: z.literal('time-anomaly'), occurrenceId: text }),
  z.strictObject({ kind: z.literal('unmapped-alias'), alias: text, occurrenceId: text }),
]);
export const sceneStateSchema = z.strictObject({
  equipmentId: text,
  at: siteWallClockSchema,
  appliedSeq: z.int().nonnegative().nullable(),
  binding: z.strictObject({ layoutId: idSchema, mappingHash: z.string().regex(/^sha256:[0-9a-f]{64}$/) }).nullable(),
  materials: z.array(sceneMaterialSchema).describe('Sorted by key in code-unit order.'),
  components: z.array(sceneComponentSchema).describe('Every bound layout Component, sorted by componentId; empty without a Binding.'),
  markers: z.array(sceneMarkerSchema).describe('Sorted by kind then id fields in code-unit order; DQIs belong only to the timeline.'),
});
export type SceneMaterial = z.infer<typeof sceneMaterialSchema>;
export type SceneComponent = z.infer<typeof sceneComponentSchema>;
export type SceneMarker = z.infer<typeof sceneMarkerSchema>;
export type SceneState = z.infer<typeof sceneStateSchema>;
