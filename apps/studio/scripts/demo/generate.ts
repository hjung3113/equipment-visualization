import { aliasMetadataPath, baselinePath, bindingsPath, equipmentPath, equipmentRulesPath, layoutPath, mappingPath, modelDictionaryPath, modelRulesPath, windowsDir } from '../../src/paths.ts';
import {
  aliasMetadataFileSchema, aliasRulesFileSchema, buildInventory, instantiateLayout, layoutRevision, sampleWindowName,
  typeDictionaryFileSchema, validateLayout,
  type AliasMetadataFile, type AliasRulesFile, type EquipmentRecord, type OccurrenceBatch, type TypeDictionaryFile,
} from '@eqv/core';
// Not '@eqv/editor': its entry is TypeScript source with `.js` specifiers, which plain Node cannot load. publish.ts needs only @eqv/core.
import { defaultEffectiveFrom, planPublish } from '../../../../packages/editor/src/publish.ts';
import template from '../../../../assets/templates/cluster-single.template.json' with { type: 'json' };
import { buildDemoWindows, EQUIPMENT_ID, PM_COUNT } from './scenario.ts';

const MAKER = 'synth-maker';
const MODEL = 'synth-demo';
const LAYOUT_ID = `${EQUIPMENT_ID}-layout`;
const LOAD_PORT_SLOTS = 25;

const record: EquipmentRecord = { schemaVersion: '0.4', equipmentId: EQUIPMENT_ID, maker: MAKER, model: MODEL };

const dictionary: TypeDictionaryFile = typeDictionaryFileSchema.parse({
  schemaVersion: '0.4', scope: { level: 'model', maker: MAKER, model: MODEL },
  entries: [
    { moduleType: 'DEMO_LOADPORT', role: 'lp' }, { moduleType: 'DEMO_ATM_ROBOT', role: 'robot' },
    { moduleType: 'DEMO_ALIGNER', role: 'aligner' }, { moduleType: 'DEMO_LOADLOCK', role: 'll' },
    { moduleType: 'DEMO_VAC_ROBOT', role: 'robot' }, { moduleType: 'DEMO_PROC_CH', role: 'pm' },
  ],
});

const slotRange = (from: number, to: number, holdingSiteId: string) => ({ from, to, holdingSiteId });
const slots = (...assign: ReturnType<typeof slotRange>[]) => ({ offset: 0, assign });

const modelRules: AliasRulesFile = aliasRulesFileSchema.parse({
  schemaVersion: '0.4', scope: { level: 'model', maker: MAKER, model: MODEL },
  rules: [
    // Slot 0 is the carrier site; slots 1..25 are the wafer slots.
    { id: 'lp', match: { pattern: 'LP{n}' }, target: { componentId: 'lp-{n}', slots: slots(slotRange(0, 0, 'carrier'),
      ...Array.from({ length: LOAD_PORT_SLOTS }, (_, i) => slotRange(i + 1, i + 1, `slot-${i + 1}`))) }, certainty: 'verified' },
    { id: 'efem-robot', match: { exact: ['EFEM_R1'] }, target: { componentId: 'robot-1', slots: slots(slotRange(1, 1, 'blade-a'), slotRange(2, 2, 'blade-b')) }, certainty: 'verified' },
    { id: 'tm-robot', match: { exact: ['TM_R1'] }, target: { componentId: 'robot-2', slots: slots(slotRange(1, 1, 'blade-a')) }, certainty: 'verified' },
    { id: 'll', match: { pattern: 'LL{n}' }, target: { componentId: 'll-{n:letter}', slots: slots(slotRange(1, 1, 'slot-1'), slotRange(2, 2, 'slot-2')) }, certainty: 'verified' },
    // PM5 matches this pattern but the Layout has no pm-e: the alias stays without an Alias Rule (labelled imperfection 1).
    { id: 'pm', match: { pattern: 'PM{n}' }, target: { componentId: 'pm-{n:letter}', slots: slots(slotRange(1, 1, 'station-1')) }, certainty: 'verified' },
  ],
});
// The aligner's single site is taken from the cluster-single template, not confirmed for this unit: assumed.
const equipmentRules: AliasRulesFile = aliasRulesFileSchema.parse({
  schemaVersion: '0.4', scope: { level: 'equipment', equipmentId: EQUIPMENT_ID },
  rules: [{ id: 'aligner-assumed', match: { exact: ['ALN1'] }, target: { componentId: 'aligner-1', slots: slots(slotRange(1, 1, 'station-1')) }, certainty: 'assumed' }],
});

const metadata = (alias: string, moduleType: string, flags: { isPort?: boolean; isRobot?: boolean } = {}) =>
  ({ alias, moduleType, isPort: flags.isPort ?? false, isRobot: flags.isRobot ?? false });
const aliasMetadata: AliasMetadataFile = aliasMetadataFileSchema.parse({
  schemaVersion: '0.4', equipmentId: EQUIPMENT_ID,
  aliases: [
    metadata('LP1', 'DEMO_LOADPORT', { isPort: true }), metadata('LP2', 'DEMO_LOADPORT', { isPort: true }),
    metadata('ALN1', 'DEMO_ALIGNER'), metadata('EFEM_R1', 'DEMO_ATM_ROBOT', { isRobot: true }),
    metadata('LL1', 'DEMO_LOADLOCK'), metadata('LL2', 'DEMO_LOADLOCK'), metadata('TM_R1', 'DEMO_VAC_ROBOT', { isRobot: true }),
    ...Array.from({ length: PM_COUNT + 1 }, (_, i) => metadata(`PM${i + 1}`, 'DEMO_PROC_CH')),
  ],
});

/** Studio writes every JSON file as two-space JSON with a trailing newline (`server/files.ts` `write`). */
const text = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

/**
 * The files of the synthetic demo equipment `eq-demo-01`, by data-root-relative path. Pure and deterministic: the files are
 * built through the same core and editor functions Studio's Onboarding and Publish use, and nothing is read or written here.
 */
export async function generateDemo(): Promise<Map<string, string>> {
  const parsedTemplate = validateLayout(template);
  if (!parsedTemplate.ok || parsedTemplate.layout.kind !== 'template') throw new Error('cluster-single.template.json is not a valid template');
  const layout = instantiateLayout(parsedTemplate.layout, LAYOUT_ID);

  const windows = buildDemoWindows();
  const first = windows[0]!;
  const last = windows.at(-1)!;
  // One Mapping Version covers both windows, so its baseline Inventory is built over both (their Record Sequence is one).
  const both: OccurrenceBatch = { ...first, to: last.to, watermark: last.watermark, occurrences: windows.flatMap((w) => w.occurrences), issues: windows.flatMap((w) => w.issues) };
  const inventory = buildInventory(both, aliasMetadata);

  const plan = await planPublish({
    equipment: { equipmentId: EQUIPMENT_ID, maker: MAKER, model: MODEL }, inventory, dictionaries: [dictionary], layout,
    ruleFiles: { model: modelRules, equipment: equipmentRules }, bindings: null, previous: null,
    effectiveFrom: defaultEffectiveFrom(inventory, null),
  });
  const { mapping, bindings } = plan;
  if (plan.problems.length > 0 || !mapping || !bindings) throw new Error(`demo publish plan has problems: ${plan.problems.join('; ')}`);

  const files = new Map<string, string>();
  files.set(equipmentPath(EQUIPMENT_ID), text(record));
  files.set(modelDictionaryPath(MAKER, MODEL), text(dictionary));
  files.set(modelRulesPath(MAKER, MODEL), text(modelRules));
  files.set(equipmentRulesPath(EQUIPMENT_ID), text(equipmentRules));
  files.set(aliasMetadataPath(EQUIPMENT_ID), text(aliasMetadata));
  for (const batch of windows) files.set(`${windowsDir(EQUIPMENT_ID)}/${await sampleWindowName(batch)}.batch.json`, text(batch));
  files.set(layoutPath(LAYOUT_ID, undefined), text(layout));
  files.set(layoutPath(LAYOUT_ID, await layoutRevision(layout)), text(layout));
  files.set(mappingPath(EQUIPMENT_ID, { mappingHash: mapping.hash }), text(mapping));
  files.set(baselinePath(EQUIPMENT_ID, { mappingHash: mapping.hash }), text(plan.baseline));
  files.set(bindingsPath(EQUIPMENT_ID), text(bindings));
  return files;
}
