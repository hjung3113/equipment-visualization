import { equipmentPath, modelDictionaryPath } from './paths.js';
import { equipmentRecordSchema, validateTypeDictionary, type EquipmentRecord } from '@eqv/core';
import {
  checkScope, DataError, listSampleWindows, NAME, problems, readAliasMetadata, readOptional, readSampleWindow, type SampleWindowEntry,
} from './onboarding-data.js';
import { errorMessage } from './error-message.js';

export type WindowRow =
  | { kind: 'ok'; entry: SampleWindowEntry; timeDomain: string; dataGeneration: string; occurrences: number; dataQualityIssues: number }
  | { kind: 'error'; entry: SampleWindowEntry; error: string };
export type FileState = { kind: 'absent' } | { kind: 'ok'; count: number } | { kind: 'error'; error: string };
type Windows = { kind: 'ok'; rows: WindowRow[] } | { kind: 'error'; error: string };
export type EquipmentDataLoad =
  | { kind: 'not-found' }
  | { kind: 'error'; error: string }
  | { kind: 'ok'; record: EquipmentRecord; windows: Windows; aliasMetadata: FileState; typeDictionary: FileState };

async function windowRow(equipmentId: string, entry: SampleWindowEntry): Promise<WindowRow> {
  try {
    const batch = await readSampleWindow(equipmentId, entry);
    return { kind: 'ok', entry, timeDomain: batch.timeDomain, dataGeneration: batch.dataGeneration,
      occurrences: batch.occurrences.length, dataQualityIssues: batch.issues.length };
  } catch (error) {
    return { kind: 'error', entry, error: errorMessage(error) };
  }
}

async function fileState(path: string, count: (raw: unknown) => number): Promise<FileState> {
  try {
    const raw = await readOptional(path);
    return raw === undefined ? { kind: 'absent' } : { kind: 'ok', count: count(raw) };
  } catch (error) {
    return { kind: 'error', error: errorMessage(error) };
  }
}

async function aliasMetadataState(equipmentId: string): Promise<FileState> {
  try {
    const metadata = await readAliasMetadata(equipmentId);
    return metadata === undefined ? { kind: 'absent' } : { kind: 'ok', count: metadata.aliases.length };
  } catch (error) {
    return { kind: 'error', error: errorMessage(error) };
  }
}

/** Never rejects. Reads the record, then every Sample Window and the two optional files; a bad window is an error row, never skipped. */
export async function loadEquipmentData(equipmentId: string): Promise<EquipmentDataLoad> {
  try {
    if (!NAME.test(equipmentId)) return { kind: 'not-found' };
    const recordPath = equipmentPath(equipmentId);
    const rawRecord = await readOptional(recordPath);
    if (rawRecord === undefined) return { kind: 'not-found' };
    const parsedRecord = equipmentRecordSchema.safeParse(rawRecord);
    if (!parsedRecord.success) return { kind: 'error', error: `${recordPath}: ${problems(parsedRecord.error.issues)}` };
    const record = parsedRecord.data;
    if (record.equipmentId !== equipmentId) {
      return { kind: 'error', error: `${recordPath}: equipmentId(${record.equipmentId})가 파일 이름과 다릅니다` };
    }

    const { maker, model } = record;
    const dictionaryPath = modelDictionaryPath(maker, model);
    const [windows, aliasMetadata, typeDictionary] = await Promise.all([
      (async (): Promise<Windows> => {
        try {
          const entries = await listSampleWindows(equipmentId);
          return { kind: 'ok', rows: await Promise.all(entries.map((entry) => windowRow(equipmentId, entry))) };
        } catch (error) {
          return { kind: 'error', error: errorMessage(error) };
        }
      })(),
      aliasMetadataState(equipmentId),
      fileState(dictionaryPath, (raw) => {
        const result = validateTypeDictionary(raw);
        if (!result.ok) throw new DataError(`${dictionaryPath}: ${problems(result.issues)}`);
        const { file } = result;
        checkScope(dictionaryPath, file.scope, { level: 'model', maker, model });
        return file.entries.length;
      }),
    ]);
    return { kind: 'ok', record, windows, aliasMetadata, typeDictionary };
  } catch (error) {
    return { kind: 'error', error: errorMessage(error) };
  }
}
