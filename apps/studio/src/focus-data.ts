import {
  mappingVersionSchema, occurrenceBatchSchema, validateLayout, verifyMappingHash,
  type Binding, type BindingsFile, type EquipmentLayoutDocument, type MappingVersion, type OccurrenceBatch,
} from '@eqv/core';
import type { FleetData } from '@eqv/editor';
import { DataError, loadEquipment, problems, readOptional } from './onboarding-data.js';

export type FocusData = {
  record: FleetData['record'];
  batch: OccurrenceBatch;
  /** Never null: no published Binding is an empty list. */
  bindings: BindingsFile;
  /** Every Mapping Version a Binding names. */
  mappings: MappingVersion[];
  /** One Layout per distinct Binding `layoutId`. */
  layouts: EquipmentLayoutDocument[];
  notices: string[];
};
export type FocusLoad =
  | { kind: 'not-found' }
  | { kind: 'error'; error: string; record: FleetData['record'] | null }
  | ({ kind: 'ok' } & FocusData);

const message = (error: unknown) => error instanceof Error ? error.message : '알 수 없는 오류';
const NO_BINDING = '게시된 Binding 없음';

/** A rejected read (not a 404) names the path it failed on. */
async function read(path: string): Promise<unknown | undefined> {
  try {
    return await readOptional(path);
  } catch (error) {
    throw new DataError(`${path}: ${message(error)}`);
  }
}

async function loadBatch(equipmentId: string): Promise<OccurrenceBatch> {
  const path = `observations/${equipmentId}/occurrence-batch.json`;
  const raw = await read(path);
  if (raw === undefined) throw new DataError('관측 데이터 없음');
  const parsed = occurrenceBatchSchema.safeParse(raw);
  if (!parsed.success) throw new DataError(`${path}: ${problems(parsed.error.issues)}`);
  if (parsed.data.equipmentId !== equipmentId) throw new DataError(`${path}: equipmentId(${parsed.data.equipmentId})가 ${equipmentId}와 다릅니다`);
  return parsed.data;
}

async function loadMapping(equipmentId: string, binding: Binding): Promise<MappingVersion> {
  const path = `onboarding/mappings/${equipmentId}/${binding.mappingHash.slice('sha256:'.length)}.mapping.json`;
  const raw = await read(path);
  if (raw === undefined) throw new DataError(`${path}: Mapping Version 파일 없음`);
  const parsed = mappingVersionSchema.safeParse(raw);
  if (!parsed.success) throw new DataError(`${path}: ${problems(parsed.error.issues)}`);
  const mapping = parsed.data;
  if (!await verifyMappingHash(mapping)) throw new DataError(`${path}: 내용 hash가 맞지 않습니다`);
  if (mapping.hash !== binding.mappingHash) throw new DataError(`${path}: hash(${mapping.hash})가 binding의 mappingHash와 다릅니다`);
  if (mapping.equipmentId !== equipmentId) throw new DataError(`${path}: equipmentId(${mapping.equipmentId})가 ${equipmentId}와 다릅니다`);
  if (mapping.layoutId !== binding.layoutId) throw new DataError(`${path}: layoutId(${mapping.layoutId})가 binding의 layoutId와 다릅니다`);
  return mapping;
}

async function loadLayout(layoutId: string, revision: string | undefined, notices: string[]): Promise<EquipmentLayoutDocument> {
  const path = revision === undefined ? `layouts/${layoutId}/draft.layout.json`
    : `layouts/${layoutId}/${revision.slice('sha256:'.length)}.layout.json`;
  if (revision === undefined) notices.push(`게시된 Layout Revision이 없어 초안 레이아웃으로 표시합니다 (${layoutId})`);
  const raw = await read(path);
  if (raw === undefined) throw new DataError(`${path}: Layout 파일 없음`);
  const result = validateLayout(raw);
  if (!result.ok) throw new DataError(`${path}: ${problems(result.issues)}`);
  const { layout } = result;
  if (layout.kind !== 'equipment-layout') throw new DataError(`${path}: equipment-layout이 아닙니다 (${layout.kind})`);
  if (layout.id !== layoutId) throw new DataError(`${path}: id(${layout.id})가 ${layoutId}와 다릅니다`);
  return layout;
}

/** Never rejects. Everything Focus replays is read and checked here: the batch, every Binding's Mapping Version and Layout. */
export async function loadFocus(equipmentId: string): Promise<FocusLoad> {
  try {
    const loaded = await loadEquipment(equipmentId);
    if (loaded.kind !== 'ok') return loaded;
    const { record } = loaded.data;
    try {
      const batch = await loadBatch(equipmentId);
      const bindings: BindingsFile = loaded.data.bindings ?? { schemaVersion: '0.4', equipmentId, bindings: [] };
      const notices: string[] = [];
      if (bindings.bindings.length === 0) notices.push(NO_BINDING);

      const mappings = new Map<string, MappingVersion>();
      for (const binding of bindings.bindings) {
        const key = JSON.stringify([binding.mappingHash, binding.layoutId]);
        if (!mappings.has(key)) mappings.set(key, await loadMapping(equipmentId, binding));
      }

      // One Layout per id; the latest Binding of that id names its revision (revision lookup in the reducer is #53).
      const latest = new Map<string, Binding>();
      for (const binding of bindings.bindings) {
        const seen = latest.get(binding.layoutId);
        if (!seen || binding.effectiveFrom > seen.effectiveFrom) latest.set(binding.layoutId, binding);
      }
      const layouts: EquipmentLayoutDocument[] = [];
      for (const [layoutId, binding] of latest) {
        const revisions = new Set(bindings.bindings.filter((b) => b.layoutId === layoutId).map((b) => b.layoutRevision ?? null));
        if (revisions.size > 1) notices.push(`Layout ${layoutId}의 Binding들이 서로 다른 Layout Revision을 가리켜 최신 Binding의 것을 사용합니다`);
        layouts.push(await loadLayout(layoutId, binding.layoutRevision, notices));
      }
      return { kind: 'ok', record, batch, bindings, mappings: [...mappings.values()], layouts, notices };
    } catch (error) {
      return { kind: 'error', record, error: message(error) };
    }
  } catch (error) {
    return { kind: 'error', record: null, error: message(error) };
  }
}
