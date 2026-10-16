import {
  aliasMetadataFileSchema, buildInventory, equipmentRecordSchema, layoutDocumentSchema, mappingVersionSchema, occurrenceBatchSchema,
  validateAliasRules, validateBindings, validateTypeDictionary, verifyMappingHash,
  type MappingIssue, type MappingScope, type MappingVersion, type TemplateDocument, type TypeDictionaryFile,
} from '@eqv/core';
import type { FleetData } from '@eqv/editor';
import { ApiError, listDir, readFile, type DirEntry } from './api.js';

/** Read-only inputs of one equipment, validated at the read boundary (GET only parses JSON). */
export interface LoadedEquipment extends FleetData {
  dictionaries: TypeDictionaryFile[];
}
export type EquipmentLoad =
  | { kind: 'not-found' }
  | { kind: 'error'; error: string; record: FleetData['record'] | null }
  | { kind: 'ok'; data: LoadedEquipment };
export type OnboardingLoad =
  | Exclude<EquipmentLoad, { kind: 'ok' }>
  | { kind: 'ok'; data: LoadedEquipment; templates: TemplateDocument[]; skippedTemplates: string[] };

/** Thrown for any content problem; the message becomes the equipment's error text. */
class DataError extends Error {}

const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const problems = (issues: readonly { path: readonly PropertyKey[]; message: string }[]) =>
  issues.map(({ path, message }) => `${path.map(String).join('.') || '(root)'}: ${message}`).join('; ');

/** Only a 404 is absence; every other failure propagates. */
async function readOptional(path: string): Promise<unknown | undefined> {
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

function checkScope(path: string, actual: MappingScope, expected: MappingScope): void {
  if (!sameScope(actual, expected)) throw new DataError(`${path}: scope가 경로와 다릅니다 (${JSON.stringify(actual)})`);
}

async function loadData(equipmentId: string): Promise<EquipmentLoad> {
  if (!NAME.test(equipmentId)) return { kind: 'not-found' };
  const recordPath = `equipment/${equipmentId}.json`;
  const rawRecord = await readOptional(recordPath);
  if (rawRecord === undefined) return { kind: 'not-found' };
  const parsedRecord = equipmentRecordSchema.safeParse(rawRecord);
  if (!parsedRecord.success) return { kind: 'error', record: null, error: `${recordPath}: ${problems(parsedRecord.error.issues)}` };
  const record = parsedRecord.data;
  try {
    if (record.equipmentId !== equipmentId) throw new DataError(`${recordPath}: equipmentId(${record.equipmentId})가 파일 이름과 다릅니다`);

    const batchPath = `observations/${equipmentId}/occurrence-batch.json`;
    const rawBatch = await readOptional(batchPath);
    if (rawBatch === undefined) throw new DataError('관측 데이터 없음');
    const batch = occurrenceBatchSchema.safeParse(rawBatch);
    if (!batch.success) throw new DataError(`${batchPath}: ${problems(batch.error.issues)}`);
    if (batch.data.equipmentId !== equipmentId) {
      throw new DataError(`${batchPath}: equipmentId(${batch.data.equipmentId})가 ${equipmentId}와 다릅니다`);
    }

    const metadataPath = `observations/${equipmentId}/alias-metadata.json`;
    const rawMetadata = await readOptional(metadataPath);
    let metadata;
    if (rawMetadata !== undefined) {
      const parsed = aliasMetadataFileSchema.safeParse(rawMetadata);
      if (!parsed.success) throw new DataError(`${metadataPath}: ${problems(parsed.error.issues)}`);
      if (parsed.data.equipmentId !== equipmentId) {
        throw new DataError(`${metadataPath}: equipmentId(${parsed.data.equipmentId})가 ${equipmentId}와 다릅니다`);
      }
      metadata = parsed.data;
    }
    const inventory = buildInventory(batch.data, metadata);

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
    let hasAliasRules = false;
    const ruleScopes: [string, MappingScope][] = [
      [`onboarding/scopes/maker/${maker}/alias-rules.json`, { level: 'maker', maker }],
      [`onboarding/scopes/model/${maker}/${model}/alias-rules.json`, { level: 'model', maker, model }],
      [`onboarding/scopes/equipment/${equipmentId}/alias-rules.json`, { level: 'equipment', equipmentId }],
    ];
    for (const [path, scope] of ruleScopes) {
      const raw = await readOptional(path);
      if (raw === undefined) continue;
      checkScope(path, check(path, validateAliasRules(raw)).scope, scope);
      hasAliasRules = true;
    }

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
    return { kind: 'ok', data: { record, inventory, dictionaries, bindings, mappings, hasAliasRules } };
  } catch (error) {
    return { kind: 'error', record, error: error instanceof Error ? error.message : '알 수 없는 오류' };
  }
}

/** Never rejects: transport and content failures become an `error` result. */
export async function loadEquipment(equipmentId: string): Promise<EquipmentLoad> {
  try {
    return await loadData(equipmentId);
  } catch (error) {
    return { kind: 'error', record: null, error: error instanceof Error ? error.message : '알 수 없는 오류' };
  }
}

export async function listEquipmentIds(): Promise<string[]> {
  let entries: DirEntry[];
  try {
    entries = await listDir('equipment');
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return [];
    throw error;
  }
  return entries.filter(({ kind, name }) => kind === 'file' && name.endsWith('.json')).map(({ name }) => name.slice(0, -'.json'.length));
}

async function loadTemplates(): Promise<{ templates: TemplateDocument[]; skipped: string[] }> {
  let entries: DirEntry[];
  try {
    entries = await listDir('templates');
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return { templates: [], skipped: [] };
    throw error;
  }
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

/** Never rejects. A broken record or batch is a data error, not not-found. */
export async function loadOnboarding(equipmentId: string): Promise<OnboardingLoad> {
  const loaded = await loadEquipment(equipmentId);
  if (loaded.kind !== 'ok') return loaded;
  try {
    const { templates, skipped } = await loadTemplates();
    return { kind: 'ok', data: loaded.data, templates, skippedTemplates: skipped };
  } catch (error) {
    return { kind: 'error', record: loaded.data.record, error: error instanceof Error ? error.message : '알 수 없는 오류' };
  }
}
