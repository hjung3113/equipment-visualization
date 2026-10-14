export const PACKAGE_NAME = '@eqv/core';

export { LAYOUT_SCHEMA_VERSION, layoutDocumentSchema } from './layout/schema.js';
export type {
  LayoutDocument, TemplateDocument, EquipmentLayoutDocument, Component, Port, HoldingSite,
  Level, SourceEvidence, Provenance, Certainty, MaterialKind, PhysicalInterfaceEdge,
  TransferCapabilityEdge, ProcessRoute,
} from './layout/schema.js';
export { validateLayout } from './layout/validate.js';
export type { LayoutIssue, LayoutIssueCode, LayoutValidationResult } from './layout/validate.js';
