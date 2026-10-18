import { aliasMetadataFileSchema, equipmentRecordSchema, validateTypeDictionary, type EquipmentRecord } from '@eqv/core';
import {
  DataError, listSampleWindows, problems, readOptional, readSampleWindow, type SampleWindowEntry,
} from './onboarding-data.js';

export type WindowRow =
  | { kind: 'ok'; entry: SampleWindowEntry; timeDomain: string; dataGeneration: string; occurrences: number; dataQualityIssues: number }
  | { kind: 'error'; entry: SampleWindowEntry; error: string };
export type FileState = { kind: 'absent' } | { kind: 'ok'; count: number } | { kind: 'error'; error: string };
type Windows = { kind: 'ok'; rows: WindowRow[] } | { kind: 'error'; error: string };
export type EquipmentDataLoad =
  | { kind: 'not-found' }
  | { kind: 'error'; error: string }
  | { kind: 'ok'; record: EquipmentRecord; windows: Windows; aliasMetadata: FileState; typeDictionary: FileState };

const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const message = (error: unknown) => error instanceof Error ? error.message : '알 수 없는 오류';

async function windowRow(equipmentId: string, entry: SampleWindowEntry): Promise<WindowRow> {
  try {
    const batch = await readSampleWindow(equipmentId, entry);
    return { kind: 'ok', entry, timeDomain: batch.timeDomain, dataGeneration: batch.dataGeneration,
      occurrences: batch.occurrences.length, dataQualityIssues: batch.issues.length };
  } catch (error) {
    return { kind: 'error', entry, error: message(error) };
  }
}

async function fileState(path: string, count: (raw: unknown) => number): Promise<FileState> {
  try {
    const raw = await readOptional(path);
    return raw === undefined ? { kind: 'absent' } : { kind: 'ok', count: count(raw) };
  } catch (error) {
    return { kind: 'error', error: message(error) };
  }
}

/** Never rejects. Reads the record, then every Sample Window and the two optional files; a bad window is an error row, never skipped. */
export async function loadEquipmentData(equipmentId: string): Promise<EquipmentDataLoad> {
  try {
    if (!NAME.test(equipmentId)) return { kind: 'not-found' };
    const recordPath = `equipment/${equipmentId}.json`;
    const rawRecord = await readOptional(recordPath);
    if (rawRecord === undefined) return { kind: 'not-found' };
    const parsedRecord = equipmentRecordSchema.safeParse(rawRecord);
    if (!parsedRecord.success) return { kind: 'error', error: `${recordPath}: ${problems(parsedRecord.error.issues)}` };
    const record = parsedRecord.data;
    if (record.equipmentId !== equipmentId) {
      return { kind: 'error', error: `${recordPath}: equipmentId(${record.equipmentId})가 파일 이름과 다릅니다` };
    }

    const metadataPath = `observations/${equipmentId}/alias-metadata.json`;
    const { maker, model } = record;
    const dictionaryPath = `onboarding/scopes/model/${maker}/${model}/type-dictionary.json`;
    const [windows, aliasMetadata, typeDictionary] = await Promise.all([
      (async (): Promise<Windows> => {
        try {
          const entries = await listSampleWindows(equipmentId);
          return { kind: 'ok', rows: await Promise.all(entries.map((entry) => windowRow(equipmentId, entry))) };
        } catch (error) {
          return { kind: 'error', error: message(error) };
        }
      })(),
      fileState(metadataPath, (raw) => {
        const parsed = aliasMetadataFileSchema.safeParse(raw);
        if (!parsed.success) throw new DataError(`${metadataPath}: ${problems(parsed.error.issues)}`);
        if (parsed.data.equipmentId !== equipmentId) {
          throw new DataError(`${metadataPath}: equipmentId(${parsed.data.equipmentId})가 ${equipmentId}와 다릅니다`);
        }
        return parsed.data.aliases.length;
      }),
      fileState(dictionaryPath, (raw) => {
        const result = validateTypeDictionary(raw);
        if (!result.ok) throw new DataError(`${dictionaryPath}: ${problems(result.issues)}`);
        const { file } = result;
        if (file.scope.level !== 'model' || file.scope.maker !== maker || file.scope.model !== model) {
          throw new DataError(`${dictionaryPath}: scope가 경로와 다릅니다 (${JSON.stringify(file.scope)})`);
        }
        return file.entries.length;
      }),
    ]);
    return { kind: 'ok', record, windows, aliasMetadata, typeDictionary };
  } catch (error) {
    return { kind: 'error', error: message(error) };
  }
}
