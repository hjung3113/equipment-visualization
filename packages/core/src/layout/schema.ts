import { z } from 'zod';

export const LAYOUT_SCHEMA_VERSION = '0.4';

export const idSchema = z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
const certaintySchema = z.enum(['verified', 'assumed', 'unknown']);
const materialKindSchema = z.enum(['wafer', 'carrier', 'batch', 'boat', 'reticle']);
export const MATERIAL_KINDS: readonly z.infer<typeof materialKindSchema>[] = materialKindSchema.options;
const provenanceSchema = z.strictObject({
  certainty: certaintySchema,
  sourceEvidence: z.array(idSchema),
});
const positionSchema = z.strictObject({ x: z.number(), y: z.number() });
const sourceEvidenceSchema = z.strictObject({
  id: idSchema,
  title: z.string(),
  uri: z.string().optional(),
  revision: z.string().optional(),
  license: z.string(),
});
const levelSchema = z.strictObject({ id: idSchema, label: z.string(), order: z.int() });
const portSchema = z.strictObject({
  id: idSchema,
  label: z.string().optional(),
  position: positionSchema,
  provenance: provenanceSchema,
}).describe('Port IDs are unique within their Component; edges use Component + Port references.');
const holdingSiteSchema = z.strictObject({
  id: idSchema,
  label: z.string().optional(),
  materialKinds: z.array(materialKindSchema).min(1),
  position: positionSchema.optional().describe('Component-local drawing coordinate, same frame as Port positions: origin at the Component centre, before its rotation and scale. Omission means unknown geometry, never inferred. Not observed transfer or kinematics.'),
  provenance: provenanceSchema,
}).describe('One explicit entry per discrete material place, with an ID unique within its Component. A 25-slot LoadPort has 25 sites; no count or range shorthand. Robot blades are Holding Sites, independent of arm counts and kinematics.');
const componentSchema = z.strictObject({
  id: idSchema,
  role: idSchema.describe('Open Role vocabulary; only robot has structural handler meaning.'),
  assetRef: z.string().min(1),
  label: z.string(),
  parentId: idSchema.optional(),
  levelId: idSchema,
  transform: z.strictObject({
    x: z.number(), y: z.number(), rotation: z.number(), scale: z.number().positive(),
  }).describe('Finite geometry local to the parent; geometry never establishes connectivity.'),
  size: z.strictObject({
    width: z.number().positive(), height: z.number().positive(),
  }).optional().describe('ADR-0006: footprint in layout units in the Component local frame before rotation, multiplied by transform.scale. Absence means unknown; renderers fall back to primitive natural size. Structural Roles stretch to the footprint; module and robot symbols fit centred with aspect ratio preserved. Geometry never establishes connectivity.'),
  ports: z.array(portSchema),
  holdingSites: z.array(holdingSiteSchema),
  provenance: z.strictObject({
    role: provenanceSchema.optional(),
    assetRef: provenanceSchema.optional(),
    label: provenanceSchema.optional(),
    parentId: provenanceSchema.optional(),
    levelId: provenanceSchema.optional(),
    transform: provenanceSchema.optional(),
    size: provenanceSchema.optional(),
  }).describe('An absent property key means its Certainty is unknown. Validation never fills assumed or verified provenance.'),
});
const portRefSchema = z.strictObject({ componentId: idSchema, portId: idSchema });
const siteRefSchema = z.strictObject({ componentId: idSchema, holdingSiteId: idSchema });
const physicalInterfaceKindSchema = z.enum(['gate', 'slit', 'docking', 'optical', 'pass-through', 'stage-landing', 'service']);
export const PHYSICAL_INTERFACE_KINDS: readonly z.infer<typeof physicalInterfaceKindSchema>[] = physicalInterfaceKindSchema.options;
const physicalInterfaceSchema = z.strictObject({
  id: idSchema,
  kind: physicalInterfaceKindSchema,
  a: portRefSchema,
  b: portRefSchema,
  provenance: provenanceSchema,
}).describe('Explicit undirected physical port interface; never inferred from visual adjacency.');
const transferCapabilitySchema = z.strictObject({
  id: idSchema,
  a: siteRefSchema,
  b: siteRefSchema,
  handlerComponentId: idSchema,
  provenance: provenanceSchema,
}).describe('Explicit undirected Holding Site capability via a robot Component; possible transfer is not evidence of an actual transfer.');
const processRouteSchema = z.strictObject({
  id: idSchema, label: z.string(), steps: z.array(idSchema).min(2),
}).describe('Explanatory Component sequence only, never Replay evidence (ADR-0004).');
const cardinalitySchema = z.strictObject({
  min: z.int().nonnegative(), max: z.int().nonnegative(),
}).refine(({ min, max }) => max >= min, { path: ['max'], message: 'max must be at least min' });

const body = {
  schemaVersion: z.literal(LAYOUT_SCHEMA_VERSION),
  id: idSchema,
  name: z.string().min(1),
  unit: z.enum(['abstract', 'mm']).describe('Abstract coordinates are never promoted to mm without evidence.'),
  viewBox: z.strictObject({
    x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().positive(),
  }),
  sources: z.array(sourceEvidenceSchema),
  levels: z.array(levelSchema).min(1),
  components: z.array(componentSchema).min(1),
  physicalInterfaces: z.array(physicalInterfaceSchema),
  transferCapabilities: z.array(transferCapabilitySchema),
  processRoutes: z.array(processRouteSchema),
};
const templateDocumentSchema = z.strictObject({
  ...body, kind: z.literal('template'), roleCardinality: z.record(idSchema, cardinalitySchema),
  promotedFrom: z.strictObject({
    layoutId: idSchema, layoutRevision: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  }).optional().describe('ADR-0015: the published Layout Revision this Template was promoted from; absent on bundled Templates.'),
});
const equipmentLayoutDocumentSchema = z.strictObject({
  ...body, kind: z.literal('equipment-layout'), templateId: idSchema,
});
export const layoutDocumentSchema = z.discriminatedUnion('kind', [
  templateDocumentSchema, equipmentLayoutDocumentSchema,
]);

export type LayoutDocument = z.infer<typeof layoutDocumentSchema>;
export type TemplateDocument = z.infer<typeof templateDocumentSchema>;
export type EquipmentLayoutDocument = z.infer<typeof equipmentLayoutDocumentSchema>;
export type Component = z.infer<typeof componentSchema>;
export type Port = z.infer<typeof portSchema>;
export type HoldingSite = z.infer<typeof holdingSiteSchema>;
export type Level = z.infer<typeof levelSchema>;
export type SourceEvidence = z.infer<typeof sourceEvidenceSchema>;
export type Provenance = z.infer<typeof provenanceSchema>;
export type Certainty = z.infer<typeof certaintySchema>;
export type MaterialKind = z.infer<typeof materialKindSchema>;
export type PhysicalInterfaceEdge = z.infer<typeof physicalInterfaceSchema>;
export type TransferCapabilityEdge = z.infer<typeof transferCapabilitySchema>;
export type ProcessRoute = z.infer<typeof processRouteSchema>;
