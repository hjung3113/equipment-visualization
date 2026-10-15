export const PACKAGE_NAME = '@eqv/core';
export { siteWallClockSchema, type SiteWallClock } from './site-wall-clock.js';

export { LAYOUT_SCHEMA_VERSION, layoutDocumentSchema } from './layout/schema.js';
export type {
  LayoutDocument, TemplateDocument, EquipmentLayoutDocument, Component, Port, HoldingSite,
  Level, SourceEvidence, Provenance, Certainty, MaterialKind, PhysicalInterfaceEdge,
  TransferCapabilityEdge, ProcessRoute,
} from './layout/schema.js';
export { validateLayout } from './layout/validate.js';
export type { LayoutIssue, LayoutIssueCode, LayoutValidationResult } from './layout/validate.js';

export { occurrenceBatchSchema } from './occurrence/schema.js';
export type { EvidenceLevel, Boundary, Occurrence, DataQualityIssue, OccurrenceBatch } from './occurrence/schema.js';

export { typeDictionaryFileSchema, aliasRulesFileSchema, mappingVersionSchema, bindingsFileSchema } from './mapping/schema.js';
export type {
  MappingScope, TypeDictionaryFile, AliasRulesFile, AliasRule, SlotMap, MappingVersion,
  MappingEntry, BindingsFile, Binding, Resolution, MappingIssue,
} from './mapping/schema.js';
export { resolveRole, validateTypeDictionary, validateAliasRules, validateBindings } from './mapping/validate.js';
export { publishMapping, verifyMappingHash } from './mapping/publish.js';
export { resolveLocation } from './mapping/resolve.js';
