import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { dirname, join, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
  aliasMetadataFileSchema, equipmentRecordSchema, parseSampleWindowName, validateSampleWindow, validateTypeDictionary,
  type EquipmentRecord, type SampleWindowRef,
} from '@eqv/core';
import { ApiError, fail, NAME } from './errors.js';
import type { FileApiRequest, FileApiResponse } from './files.js';

const MAX_IMPORT_BYTES = 32 * 1024 * 1024;
const REPO_REASON = '저장소 밖 경로를 EQV_STUDIO_ASSETS로 지정하세요';
const WINDOW_FILE = '.batch.json';
const CONFLICT_CODES = new Set(['window-overlap', 'time-domain-mismatch']);

interface ImportDeps {
  root: string;
  repoRoot: string | undefined;
  rootReal(): Promise<string>;
  readTarget(segments: string[]): Promise<{ real: string }>;
  assertWritable(segments: string[]): Promise<void>;
  write(segments: string[], value: unknown, immutable: boolean, createOnly?: boolean):
    Promise<{ created: boolean; conflict: boolean; exists?: boolean }>;
  assertJsonType(request: FileApiRequest): void;
  usesBundledCatalog(): Promise<boolean>;
}

type Guard = { enabled: true; insideGitWorkTree: boolean } | { enabled: false; reason: string; status: number; insideGitWorkTree: false };

const contained = (root: string, target: string): boolean => target === root || target.startsWith(root + sep);
const reasonOf = (error: unknown): string => error instanceof Error ? error.message : 'unreadable';

export function createImportApi(deps: ImportDeps) {
  const { root, repoRoot } = deps;

  async function exists(path: string): Promise<boolean> {
    return stat(path).then(() => true, () => false);
  }

  async function insideGitWorkTree(rootRealPath: string): Promise<boolean> {
    for (let dir = rootRealPath; ; dir = dirname(dir)) {
      if (await exists(join(dir, '.git'))) return true;
      if (dirname(dir) === dir) return false;
    }
  }

  /** Per request: the data root must resolve, and must not be inside this repository (O3). */
  async function guard(): Promise<Guard> {
    const off = (reason: string, status: number): Guard => ({ enabled: false, reason, status, insideGitWorkTree: false });
    if (repoRoot === undefined) return off('repository root unknown', 403);
    let rootPath: string;
    try {
      rootPath = await realpath(root);
    } catch {
      return off('Assets root not found', 404);
    }
    let repoPath: string;
    try {
      repoPath = await realpath(repoRoot);
    } catch {
      return off('repository root unknown', 403);
    }
    if (contained(repoPath, rootPath)) return off(REPO_REASON, 403);
    return { enabled: true, insideGitWorkTree: await insideGitWorkTree(rootPath) };
  }

  async function status(): Promise<FileApiResponse> {
    const state = await guard();
    return {
      status: 200,
      body: {
        enabled: state.enabled,
        ...(state.enabled ? {} : { reason: state.reason }),
        insideGitWorkTree: state.insideGitWorkTree,
        catalog: await deps.usesBundledCatalog() ? 'bundled' : 'data-root',
        maxWindowBytes: MAX_IMPORT_BYTES,
      },
    };
  }

  async function assertEnabled(): Promise<void> {
    const state = await guard();
    if (!state.enabled) fail(state.status, state.reason);
  }

  function queryName(query: URLSearchParams, key: string): string {
    const value = query.get(key);
    if (value === null || !NAME.test(value)) return fail(400, `${key} must match ${NAME.source}`);
    return value;
  }

  function receive(request: FileApiRequest): unknown {
    deps.assertJsonType(request);
    if (Buffer.byteLength(request.body, 'utf8') > MAX_IMPORT_BYTES) fail(413, 'Body exceeds 32 MiB');
    try {
      return JSON.parse(request.body) as unknown;
    } catch {
      return fail(400, 'Body is not valid JSON');
    }
  }

  /** Names in a directory; a missing directory is empty. Symlink escapes stay 403 (readTarget). */
  async function listNames(segments: string[]): Promise<string[]> {
    let real: string;
    try {
      real = (await deps.readTarget(segments)).real;
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return [];
      throw error;
    }
    if (!(await stat(real)).isDirectory()) return fail(422, `${segments.join('/')}: not a directory`);
    return (await readdir(real)).sort();
  }

  async function readStored(segments: string[]): Promise<unknown> {
    const path = segments.join('/');
    try {
      const { real } = await deps.readTarget(segments);
      if (!(await stat(real)).isFile()) return fail(422, `${path}: not a file`);
      return JSON.parse(await readFile(real, 'utf8')) as unknown;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      return fail(422, `${path}: ${reasonOf(error)}`);
    }
  }

  async function readRecord(name: string): Promise<EquipmentRecord> {
    const value = await readStored(['equipment', name]);
    const parsed = equipmentRecordSchema.safeParse(value);
    return parsed.success ? parsed.data : fail(422, `equipment/${name}: ${parsed.error.issues[0]?.message ?? 'invalid equipment record'}`);
  }

  async function readRecords(): Promise<{ stem: string; record: EquipmentRecord }[]> {
    const records: { stem: string; record: EquipmentRecord }[] = [];
    for (const name of await listNames(['equipment'])) {
      if (name.endsWith('.json')) records.push({ stem: name.slice(0, -'.json'.length), record: await readRecord(name) });
    }
    return records;
  }

  /** Registered = `equipment/<id>.json` parses and carries exactly this id (APFS case aliases are not). */
  async function requireRegistered(equipmentId: string): Promise<void> {
    const name = `${equipmentId}.json`;
    try {
      await deps.readTarget(['equipment', name]);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return fail(404, 'Equipment is not registered');
      throw error;
    }
    if ((await readRecord(name)).equipmentId !== equipmentId) fail(404, 'Equipment is not registered');
  }

  const sameIgnoringCase = (a: string, b: string): boolean => a !== b && a.toLowerCase() === b.toLowerCase();

  async function registerEquipment(request: FileApiRequest): Promise<FileApiResponse> {
    await assertEnabled();
    const body = receive(request);
    const parsed = equipmentRecordSchema.safeParse(body);
    if (!parsed.success) return fail(400, 'Invalid equipment record', parsed.error.issues);
    const { equipmentId, maker, model } = parsed.data;
    const records = await readRecords();
    const collision = (field: 'equipmentId' | 'maker' | 'model', existing: string): FileApiResponse => ({
      status: 409,
      body: { error: `${field} ${JSON.stringify(parsed.data[field])} differs only by case from the registered ${JSON.stringify(existing)}`, field, existing },
    });
    const byId = records.find(({ stem }) => sameIgnoringCase(stem, equipmentId));
    if (byId) return collision('equipmentId', byId.stem);
    const byMaker = records.find(({ record }) => sameIgnoringCase(record.maker, maker));
    if (byMaker) return collision('maker', byMaker.record.maker);
    const byModel = records.find(({ record }) => record.maker === maker && sameIgnoringCase(record.model, model));
    if (byModel) return collision('model', byModel.record.model);
    const segments = ['equipment', `${equipmentId}.json`];
    await deps.assertWritable(segments);
    const written = await deps.write(segments, body, false, true);
    if (written.exists) return { status: 412, body: { error: 'A file already exists at this path' } };
    return { status: 201, body: { path: segments.join('/'), created: true } };
  }

  async function importWindow(request: FileApiRequest, query: URLSearchParams): Promise<FileApiResponse> {
    await assertEnabled();
    const equipmentId = queryName(query, 'equipmentId');
    const body = receive(request);
    await requireRegistered(equipmentId);
    const existing: SampleWindowRef[] = [];
    const dir = ['observations', equipmentId, 'windows'];
    for (const name of await listNames(dir)) {
      const parsedName = name.endsWith(WINDOW_FILE) ? parseSampleWindowName(name.slice(0, -WINDOW_FILE.length)) : null;
      if (!parsedName) return fail(422, `${dir.join('/')}/${name}: not a Sample Window file name`);
      const stored = await readStored([...dir, name]);
      const timeDomain = (stored as { timeDomain?: unknown } | null)?.timeDomain;
      if (typeof timeDomain !== 'string') return fail(422, `${dir.join('/')}/${name}: timeDomain is not a string`);
      existing.push({ ...parsedName, timeDomain });
    }
    const result = await validateSampleWindow(body, { equipmentId, existing });
    if (!result.ok) {
      const conflict = result.issues.length > 0 && result.issues.every(({ code }) => CONFLICT_CODES.has(code));
      return {
        status: conflict ? 409 : 400,
        body: { error: 'Sample Window rejected', issues: result.issues, warnings: result.warnings, ...(result.summary ? { summary: result.summary } : {}) },
      };
    }
    const segments = [...dir, `${result.summary.name}${WINDOW_FILE}`];
    await deps.assertWritable(segments);
    const written = await deps.write(segments, body, true);
    if (written.conflict) return { status: 409, body: { error: 'A different file already exists at this path' } };
    return {
      status: written.created ? 201 : 200,
      body: { path: segments.join('/'), created: written.created, summary: result.summary, warnings: result.warnings },
    };
  }

  async function putAliasMetadata(request: FileApiRequest, query: URLSearchParams): Promise<FileApiResponse> {
    await assertEnabled();
    const equipmentId = queryName(query, 'equipmentId');
    const body = receive(request);
    const parsed = aliasMetadataFileSchema.safeParse(body);
    if (!parsed.success) return fail(400, 'Invalid alias metadata', parsed.error.issues);
    if (parsed.data.equipmentId !== equipmentId) fail(400, 'equipmentId does not match the query');
    await requireRegistered(equipmentId);
    const segments = ['observations', equipmentId, 'alias-metadata.json'];
    await deps.assertWritable(segments);
    const createOnly = Object.entries(request.headers).some(([name, value]) => name.toLowerCase() === 'if-none-match' && value?.trim() === '*');
    const written = await deps.write(segments, body, false, createOnly);
    if (written.exists) return { status: 412, body: { error: 'A file already exists at this path' } };
    return { status: written.created ? 201 : 200, body: { path: segments.join('/'), created: written.created } };
  }

  async function putTypeDictionary(request: FileApiRequest, query: URLSearchParams): Promise<FileApiResponse> {
    await assertEnabled();
    const maker = queryName(query, 'maker');
    const model = queryName(query, 'model');
    const body = receive(request);
    const checked = validateTypeDictionary(body);
    if (!checked.ok) return fail(400, 'Invalid type dictionary', checked.issues);
    if (!isDeepStrictEqual((body as { scope?: unknown }).scope, { level: 'model', maker, model })) fail(400, 'Scope does not match the query');
    const records = await readRecords();
    if (!records.some(({ record }) => record.maker === maker && record.model === model)) {
      return fail(404, 'No registered equipment has this maker and model');
    }
    const segments = ['onboarding', 'scopes', 'model', maker, model, 'type-dictionary.json'];
    await deps.assertWritable(segments);
    const written = await deps.write(segments, body, false, true);
    if (written.exists) return { status: 412, body: { error: 'A file already exists at this path' } };
    return { status: 201, body: { path: segments.join('/'), created: true } };
  }

  async function dispatch(request: FileApiRequest, url: URL): Promise<FileApiResponse> {
    const routes: Record<string, [string, () => Promise<FileApiResponse>]> = {
      '/api/import/status': ['GET', status],
      '/api/import/equipment': ['POST', () => registerEquipment(request)],
      '/api/import/windows': ['POST', () => importWindow(request, url.searchParams)],
      '/api/import/alias-metadata': ['PUT', () => putAliasMetadata(request, url.searchParams)],
      '/api/import/type-dictionary': ['PUT', () => putTypeDictionary(request, url.searchParams)],
    };
    const route = routes[url.pathname];
    if (!route) return fail(404, 'Unknown endpoint');
    if (request.method !== route[0]) return fail(405, 'Method not allowed');
    return route[1]();
  }

  return { dispatch };
}
