import {
  aliasMetadataFileSchema, buildInventory, equipmentRecordSchema, idSchema, layoutDocumentSchema, mappingVersionSchema, parseSampleWindowName,
  validateAliasRules, validateBindings, validateSampleWindow, validateTypeDictionary, verifyMappingHash,
  validateLayout,
  type AliasMetadataFile, type AliasRulesFile, type BindingsFile, type EquipmentLayoutDocument, type EquipmentRecord, type MappingIssue, type MappingScope,
  type MappingVersion, type OccurrenceBatch, type SiteWallClock, type TemplateDocument, type TypeDictionaryFile,
} from '@eqv/core';
import type { FleetData, RuleFiles } from '@eqv/editor';
import { ApiError, dirOrEmpty, listDir, readFile, type DirEntry } from './api.js';
import { errorMessage } from './error-message.js';

/** One Sample Window file, known from its name alone (ADR-0010): `hash` is `sha256:<hex>`, `path` is relative to the data root. */
export type SampleWindowEntry = { name: string; path: string; from: SiteWallClock; to: SiteWallClock; hash: string };
export const windowHex = (entry: Pick<SampleWindowEntry, 'hash'>): string => entry.hash.slice('sha256:'.length);
export const shortWindowHash = (hash: string): string => hash.slice('sha256:'.length, 'sha256:'.length + 12);

/** Read-only inputs of one equipment, validated at the read boundary (GET only parses JSON). */
export interface LoadedEquipment extends FleetData {
  /** The selected Sample Window's validated batch (the Inventory is built from it). */
  batch: OccurrenceBatch;
  /** Every Sample Window of the equipment, `from` ascending. */
  windows: SampleWindowEntry[];
  selectedWindow: SampleWindowEntry;
  dictionaries: TypeDictionaryFile[];
  /** The validated alias-rules files that exist, by scope level. */
  ruleFiles: RuleFiles;
}
/** The equipment's layout draft: found, absent (404), underivable layout id, or unreadable/invalid. */
export type DraftLookup =
  | { kind: 'found'; layoutId: string; layout: EquipmentLayoutDocument }
  | { kind: 'absent'; layoutId: string }
  | { kind: 'no-id' }
  | { kind: 'error'; layoutId: string; error: string };
export type EquipmentLoad =
  | { kind: 'not-found' }
  | { kind: 'error'; error: string; record: FleetData['record'] | null }
  | { kind: 'no-observations'; record: EquipmentRecord }
  | { kind: 'ok'; data: LoadedEquipment };
export type OnboardingLoad =
  | Exclude<EquipmentLoad, { kind: 'ok' }>
  | { kind: 'ok'; data: LoadedEquipment; templates: TemplateDocument[]; skippedTemplates: string[]; draft: DraftLookup };

/** Thrown for any content problem; the message becomes the equipment's error text. */
export class DataError extends Error {}

export const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
export const problems = (issues: readonly { path: readonly PropertyKey[]; message: string }[]) =>
  issues.map(({ path, message }) => `${path.map(String).join('.') || '(root)'}: ${message}`).join('; ');

/** Only a 404 is absence; every other failure propagates. */
export async function readOptional(path: string): Promise<unknown | undefined> {
  try {
    return await readFile(path);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return undefined;
    throw error;
  }
}

function check<T>(path: string, result: { ok: true; file: T } | { ok: false; issues: MappingIssue[] }): T {
  if (!result.ok) throw new DataError(`${path}: ${problems(result.issues)}`);
  return result.file;
}

function sameScope(a: MappingScope, b: MappingScope): boolean {
  switch (a.level) {
    case 'global': return b.level === 'global';
    case 'maker': return b.level === 'maker' && a.maker === b.maker;
    case 'model': return b.level === 'model' && a.maker === b.maker && a.model === b.model;
    case 'equipment': return b.level === 'equipment' && a.equipmentId === b.equipmentId;
  }
}

export function checkScope(path: string, actual: MappingScope, expected: MappingScope): void {
  if (!sameScope(actual, expected)) throw new DataError(`${path}: scope가 경로와 다릅니다 (${JSON.stringify(actual)})`);
}

export async function readAliasMetadata(equipmentId: string): Promise<AliasMetadataFile | undefined> {
  const path = `observations/${equipmentId}/alias-metadata.json`;
  let raw: unknown | undefined;
  try {
    raw = await readOptional(path);
  } catch (error) {
    throw new DataError(errorMessage(error));
  }
  if (raw === undefined) return undefined;
  const parsed = aliasMetadataFileSchema.safeParse(raw);
  if (!parsed.success) throw new DataError(`${path}: ${problems(parsed.error.issues)}`);
  if (parsed.data.equipmentId !== equipmentId) {
    throw new DataError(`${path}: equipmentId(${parsed.data.equipmentId})가 ${equipmentId}와 다릅니다`);
  }
  return parsed.data;
}

const WINDOW_SUFFIX = '.batch.json';
const WINDOW_HEX = /^[0-9a-f]{64}$/;

/** Names only (ADR-0010): a 404 is zero windows; a stray entry or two overlapping ranges is a data error, never skipped. */
export async function listSampleWindows(equipmentId: string): Promise<SampleWindowEntry[]> {
  const dir = `observations/${equipmentId}/windows`;
  let entries: DirEntry[];
  try {
    entries = await listDir(dir);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return [];
    throw new DataError(`${dir}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const windows = entries.map(({ kind, name }): SampleWindowEntry => {
    const path = `${dir}/${name}`;
    const parsed = kind === 'file' && name.endsWith(WINDOW_SUFFIX) ? parseSampleWindowName(name.slice(0, -WINDOW_SUFFIX.length)) : null;
    if (!parsed) throw new DataError(`${path}: Sample Window 파일 이름(<from>_<to>_<hex>${WINDOW_SUFFIX})이 아닙니다`);
    return { name: name.slice(0, -WINDOW_SUFFIX.length), path, ...parsed };
  }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  let reach: SampleWindowEntry | null = null;
  for (const window of windows) {
    if (reach && window.from < reach.to) throw new DataError(`${reach.path}와 ${window.path}: Sample Window 구간이 겹칩니다`);
    if (!reach || window.to > reach.to) reach = window;
  }
  return windows;
}

/** Reads one listed window and re-checks it with the core validator; a 404 after listing is an error. */
export async function readSampleWindow(equipmentId: string, entry: SampleWindowEntry): Promise<OccurrenceBatch> {
  let raw: unknown | undefined;
  try {
    raw = await readOptional(entry.path);
  } catch (error) {
    throw new DataError(`${entry.path}: ${errorMessage(error)}`);
  }
  if (raw === undefined) throw new DataError(`${entry.path}: 파일을 찾을 수 없습니다`);
  const result = await validateSampleWindow(raw, { equipmentId, existing: [] });
  if (!result.ok) {
    throw new DataError(`${entry.path}: ${problems(result.issues.map((issue) => ({ path: issue.path, message: `${issue.code}: ${issue.message}` })))}`);
  }
  if (result.summary.name !== entry.name) {
    throw new DataError(`${entry.path}: 파일 이름이 내용과 다릅니다 (내용 기준 이름: ${result.summary.name})`);
  }
  return result.batch;
}

/** The window `window` (64 hex digits) names, else the one with the latest `from`; an unknown value never falls back. */
export function selectSampleWindow(windows: SampleWindowEntry[], window?: string): SampleWindowEntry {
  if (window === undefined) return windows[windows.length - 1]!;
  const found = WINDOW_HEX.test(window) ? windows.find(({ hash }) => hash === `sha256:${window}`) : undefined;
  if (!found) throw new DataError(`Sample Window ${window}이(가) 없습니다`);
  return found;
}

async function loadData(equipmentId: string, options: { window?: string }): Promise<EquipmentLoad> {
  if (!NAME.test(equipmentId)) return { kind: 'not-found' };
  const recordPath = `equipment/${equipmentId}.json`;
  const rawRecord = await readOptional(recordPath);
  if (rawRecord === undefined) return { kind: 'not-found' };
  const parsedRecord = equipmentRecordSchema.safeParse(rawRecord);
  if (!parsedRecord.success) return { kind: 'error', record: null, error: `${recordPath}: ${problems(parsedRecord.error.issues)}` };
  const record = parsedRecord.data;
  try {
    if (record.equipmentId !== equipmentId) throw new DataError(`${recordPath}: equipmentId(${record.equipmentId})가 파일 이름과 다릅니다`);

    const windows = await listSampleWindows(equipmentId);
    if (windows.length === 0) return { kind: 'no-observations', record };
    const selectedWindow = selectSampleWindow(windows, options.window);
    const batch = await readSampleWindow(equipmentId, selectedWindow);

    const metadata = await readAliasMetadata(equipmentId);
    const inventory = buildInventory(batch, metadata);

    const { maker, model } = record;
    const dictionaries: TypeDictionaryFile[] = [];
    const dictionaryScopes: [string, MappingScope][] = [
      ['onboarding/scopes/global/type-dictionary.json', { level: 'global' }],
      [`onboarding/scopes/maker/${maker}/type-dictionary.json`, { level: 'maker', maker }],
      [`onboarding/scopes/model/${maker}/${model}/type-dictionary.json`, { level: 'model', maker, model }],
    ];
    for (const [path, scope] of dictionaryScopes) {
      const raw = await readOptional(path);
      if (raw === undefined) continue;
      const file = check(path, validateTypeDictionary(raw));
      checkScope(path, file.scope, scope);
      dictionaries.push(file);
    }
    const ruleFiles: RuleFiles = {};
    const ruleScopes: [string, MappingScope, keyof RuleFiles][] = [
      [`onboarding/scopes/maker/${maker}/alias-rules.json`, { level: 'maker', maker }, 'maker'],
      [`onboarding/scopes/model/${maker}/${model}/alias-rules.json`, { level: 'model', maker, model }, 'model'],
      [`onboarding/scopes/equipment/${equipmentId}/alias-rules.json`, { level: 'equipment', equipmentId }, 'equipment'],
    ];
    for (const [path, scope, key] of ruleScopes) {
      const raw = await readOptional(path);
      if (raw === undefined) continue;
      const file: AliasRulesFile = check(path, validateAliasRules(raw));
      checkScope(path, file.scope, scope);
      ruleFiles[key] = file;
    }
    const hasAliasRules = Object.keys(ruleFiles).length > 0;

    const bindingsPath = `onboarding/bindings/${equipmentId}.bindings.json`;
    const rawBindings = await readOptional(bindingsPath);
    const bindings = rawBindings === undefined ? null : check(bindingsPath, validateBindings(rawBindings));
    if (bindings && bindings.equipmentId !== equipmentId) {
      throw new DataError(`${bindingsPath}: equipmentId(${bindings.equipmentId})가 ${equipmentId}와 다릅니다`);
    }

    const mappings: Record<string, MappingVersion> = {};
    if (bindings && bindings.bindings.length > 0) {
      const latest = bindings.bindings.reduce((a, b) => b.effectiveFrom > a.effectiveFrom ? b : a);
      const hex = latest.mappingHash.slice('sha256:'.length);
      const mappingPath = `onboarding/mappings/${equipmentId}/${hex}.mapping.json`;
      const rawMapping = await readOptional(mappingPath);
      if (rawMapping === undefined) throw new DataError(`${mappingPath}: Mapping Version 파일 없음`);
      const parsed = mappingVersionSchema.safeParse(rawMapping);
      if (!parsed.success) throw new DataError(`${mappingPath}: ${problems(parsed.error.issues)}`);
      const mapping = parsed.data;
      if (!await verifyMappingHash(mapping)) throw new DataError(`${mappingPath}: 내용 hash가 맞지 않습니다`);
      if (mapping.hash !== latest.mappingHash) throw new DataError(`${mappingPath}: hash(${mapping.hash})가 binding의 mappingHash와 다릅니다`);
      if (mapping.equipmentId !== equipmentId) throw new DataError(`${mappingPath}: equipmentId(${mapping.equipmentId})가 ${equipmentId}와 다릅니다`);
      if (mapping.layoutId !== latest.layoutId) throw new DataError(`${mappingPath}: layoutId(${mapping.layoutId})가 binding의 layoutId와 다릅니다`);
      mappings[mapping.hash] = mapping;
    }
    return { kind: 'ok', data: { record, inventory, batch, windows, selectedWindow, dictionaries, bindings, mappings, hasAliasRules, ruleFiles } };
  } catch (error) {
    return { kind: 'error', record, error: errorMessage(error) };
  }
}

/** Never rejects: transport and content failures become an `error` result. */
export async function loadEquipment(equipmentId: string, options: { window?: string } = {}): Promise<EquipmentLoad> {
  try {
    return await loadData(equipmentId, options);
  } catch (error) {
    return { kind: 'error', record: null, error: errorMessage(error) };
  }
}

export async function listEquipmentIds(): Promise<string[]> {
  const entries = await dirOrEmpty('equipment');
  return entries.filter(({ kind, name }) => kind === 'file' && name.endsWith('.json')).map(({ name }) => name.slice(0, -'.json'.length));
}

async function loadTemplates(): Promise<{ templates: TemplateDocument[]; skipped: string[] }> {
  const entries = await dirOrEmpty('templates');
  const names = entries.filter(({ kind, name }) => kind === 'file' && name.endsWith('.template.json')).map(({ name }) => name);
  const templates: TemplateDocument[] = [];
  const skipped: string[] = [];
  await Promise.all(names.map(async (name) => {
    try {
      const parsed = layoutDocumentSchema.safeParse(await readFile(`templates/${name}`));
      if (parsed.success && parsed.data.kind === 'template') templates.push(parsed.data);
      else skipped.push(name);
    } catch {
      skipped.push(name);
    }
  }));
  const bySource = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
  return { templates: templates.sort((a, b) => bySource(a.id, b.id)), skipped: skipped.sort(bySource) };
}


/** The layout the Board edits: the latest binding's layout once published, otherwise `<equipmentId>-layout`. */
function draftLayoutId(equipmentId: string, bindings: BindingsFile | null): string | null {
  if (bindings && bindings.bindings.length > 0) {
    return bindings.bindings.reduce((a, b) => b.effectiveFrom > a.effectiveFrom ? b : a).layoutId;
  }
  const id = `${equipmentId}-layout`;
  return idSchema.safeParse(id).success ? id : null;
}

/** Never rejects. Only a 404 is "no draft"; an invalid or foreign file is an error, never silently replaced. */
async function lookupDraft(equipmentId: string, bindings: BindingsFile | null): Promise<DraftLookup> {
  const layoutId = draftLayoutId(equipmentId, bindings);
  if (layoutId === null) return { kind: 'no-id' };
  const path = `layouts/${layoutId}/draft.layout.json`;
  try {
    const raw = await readOptional(path);
    if (raw === undefined) return { kind: 'absent', layoutId };
    const result = validateLayout(raw);
    if (!result.ok) return { kind: 'error', layoutId, error: `${path}: ${problems(result.issues)}` };
    const { layout } = result;
    if (layout.kind !== 'equipment-layout') return { kind: 'error', layoutId, error: `${path}: equipment-layout이 아닙니다 (${layout.kind})` };
    if (layout.id !== layoutId) return { kind: 'error', layoutId, error: `${path}: id(${layout.id})가 ${layoutId}와 다릅니다` };
    return { kind: 'found', layoutId, layout };
  } catch (error) {
    return { kind: 'error', layoutId, error: errorMessage(error) };
  }
}

/** Never rejects. A broken record or batch is a data error, not not-found. */
export async function loadOnboarding(equipmentId: string, options: { window?: string } = {}): Promise<OnboardingLoad> {
  const loaded = await loadEquipment(equipmentId, options);
  if (loaded.kind !== 'ok') return loaded;
  try {
    const { templates, skipped } = await loadTemplates();
    return { kind: 'ok', data: loaded.data, templates, skippedTemplates: skipped, draft: await lookupDraft(equipmentId, loaded.data.bindings) };
  } catch (error) {
    return { kind: 'error', record: loaded.data.record, error: errorMessage(error) };
  }
}
