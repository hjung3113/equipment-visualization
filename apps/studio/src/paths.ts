import { hashHex, type Binding } from '@eqv/core';

export const layoutDir = (layoutId: string) => `layouts/${layoutId}`;
export const layoutPath = (layoutId: string, revision: string | undefined) =>
  `${layoutDir(layoutId)}/${revision === undefined ? 'draft' : hashHex(revision)}.layout.json`;
export const mappingPath = (equipmentId: string, binding: Pick<Binding, 'mappingHash'>) =>
  `onboarding/mappings/${equipmentId}/${hashHex(binding.mappingHash)}.mapping.json`;
export const baselinePath = (equipmentId: string, binding: Pick<Binding, 'mappingHash'>) =>
  `onboarding/baselines/${equipmentId}/${hashHex(binding.mappingHash)}.inventory.json`;
export const bindingsPath = (equipmentId: string) => `onboarding/bindings/${equipmentId}.bindings.json`;
export const equipmentPath = (id: string) => `equipment/${id}.json`;
export const modelDictionaryPath = (maker: string, model: string) => `onboarding/scopes/model/${maker}/${model}/type-dictionary.json`;
export const modelRulesPath = (maker: string, model: string) => `onboarding/scopes/model/${maker}/${model}/alias-rules.json`;
export const equipmentRulesPath = (id: string) => `onboarding/scopes/equipment/${id}/alias-rules.json`;
export const aliasMetadataPath = (id: string) => `observations/${id}/alias-metadata.json`;
export const windowsDir = (id: string) => `observations/${id}/windows`;
