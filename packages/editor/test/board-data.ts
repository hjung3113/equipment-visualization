import {
  aliasRulesFileSchema, instantiateLayout, layoutDocumentSchema, type AliasRulesFile, type EquipmentLayoutDocument,
} from '@eqv/core';
import type { BoardInput } from '../src/board.js';
import { dictionaries, fixtureTemplates, inventory, read, record } from './data.js';

const onboarding = 'fixtures/cluster-single/onboarding/scopes';
export const modelRules = (): AliasRulesFile => aliasRulesFileSchema.parse(read(`${onboarding}/model/synth-maker/synth-model/alias-rules.json`));
export const equipmentRules = (): AliasRulesFile => aliasRulesFileSchema.parse(read(`${onboarding}/equipment/eq-synth-01/alias-rules.json`));
export const fixtureLayout = (): EquipmentLayoutDocument => layoutDocumentSchema.parse(read('fixtures/cluster-single/layout.json')) as EquipmentLayoutDocument;
/** A fresh draft from the cluster-single template, as "이 템플릿으로 시작" writes it. */
export const templateDraft = (): EquipmentLayoutDocument =>
  instantiateLayout(fixtureTemplates().find(({ id }) => id === 'cluster-single')!, 'eq-synth-01-layout');

export const boardInput = (change: Partial<BoardInput> = {}): BoardInput => ({
  equipment: { equipmentId: record.equipmentId, maker: record.maker, model: record.model },
  inventory: inventory(), dictionaries, layout: fixtureLayout(), templates: fixtureTemplates(),
  ruleFiles: { model: modelRules(), equipment: equipmentRules() }, ...change,
});

/** The fixture draft without the LP↔LL Transfer Capabilities, so the observed LP1 → LLA transfer is a Mapping Conflict. */
export const layoutWithoutLpLl = (): EquipmentLayoutDocument => {
  const layout = fixtureLayout();
  return { ...layout, transferCapabilities: layout.transferCapabilities.filter(({ id }) => id !== 'lp-slot-1-ll' && id !== 'lp-slot-2-ll') };
};
