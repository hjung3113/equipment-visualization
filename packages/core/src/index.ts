export const PACKAGE_NAME = '@eqv/core';
export { siteWallClockSchema, type SiteWallClock } from './site-wall-clock.js';

export { LAYOUT_SCHEMA_VERSION, layoutDocumentSchema } from './layout/schema.js';
export type {
  LayoutDocument, TemplateDocument, EquipmentLayoutDocument, Component, Port, HoldingSite,
  Level, SourceEvidence, Provenance, Certainty, MaterialKind, PhysicalInterfaceEdge,
  TransferCapabilityEdge, ProcessRoute,
} from './layout/schema.js';
export { layoutRevision } from './layout/revision.js';
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
export { publishMapping, resolveAliasRules, verifyMappingHash } from './mapping/publish.js';
export type { AliasResolution, ResolveAliasRulesInput } from './mapping/publish.js';
export { resolveLocation } from './mapping/resolve.js';

export { observedInventorySchema } from './inventory/schema.js';
export type { ObservedInventory, InventoryAlias } from './inventory/schema.js';
export { sceneStateSchema } from './scene/schema.js';
export type { SceneState, SceneMaterial, SceneComponent, SceneMarker } from './scene/schema.js';
export { RULESET_VERSION, assertReplayInput, seekSceneState, stepSceneState } from './replay/reduce.js';
export type { ReplayInput } from './replay/reduce.js';
export { replayKey, sceneStateHash } from './replay/replay-key.js';
export type { ReplayKey } from './replay/replay-key.js';

export { aliasMetadataFileSchema } from './inventory/schema.js';
export type { AliasMetadataFile } from './inventory/schema.js';
export { buildInventory } from './onboarding/inventory.js';
export { computeCoverage } from './onboarding/coverage.js';
export type { Coverage } from './onboarding/coverage.js';
export { findMappingConflicts } from './onboarding/conflicts.js';
export type { MappingConflict } from './onboarding/conflicts.js';
export { detectDrift } from './onboarding/drift.js';
export type { Drift } from './onboarding/drift.js';

export { proposeTemplates } from './onboarding/templates.js';
export type { TemplateProposal } from './onboarding/templates.js';
export { buildGenericLayout } from './onboarding/generic-layout.js';
export { instantiateLayout } from './onboarding/instantiate.js';
export { compareNatural } from './onboarding/order.js';
export { equipmentRecordSchema } from './onboarding/equipment.js';
export type { EquipmentRecord } from './onboarding/equipment.js';
