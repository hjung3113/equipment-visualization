import { link, lstat, mkdir, readdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
  layoutRevision, mappingVersionSchema, observedInventorySchema, validateAliasRules, validateBindings, validateLayout,
  validateTypeDictionary, verifyMappingHash,
} from '@eqv/core';
import { ApiError, contained, fail, NAME } from './errors.js';
import { createCatalog } from './catalog.js';
import { createImportApi, IMPORT_API_PREFIX } from './import.js';
import { createPromoteApi } from './promote.js';

export interface FileApiRequest {
  method: string;
  url: string;
  headers: Record<string, string | undefined>;
  body: string;
}
export interface FileApiResponse {
  status: number;
  body: unknown;
}
/** Where a write may land: the data root's realpath resolved once per request, and (import only) the repo it must stay out of. */
export interface WriteScope {
  base: string;
  repoReal?: string;
}
/** Test seams: run inside `write`, after the request's guard and before any file is created / published. */
export interface FileApiHooks {
  beforeWrite?(): Promise<void>;
  afterTempWrite?(): Promise<void>;
}

const LAYOUT_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const HEX = /^[0-9a-f]{64}$/;


type Validated = { ok: boolean; issues?: unknown[] };
const check = (result: Validated, message: string): void => {
  if (!result.ok) fail(400, message, result.issues);
};
const scopeIs = (value: unknown, expected: Record<string, string>): boolean => {
  const scope = (value as { scope?: unknown } | null)?.scope;
  return isDeepStrictEqual(scope, expected);
};
const equipmentIdOf = (value: unknown): unknown => (value as { equipmentId?: unknown } | null)?.equipmentId;

interface Target {
  immutable: boolean;
  /** Validates the received value; throws ApiError(400) on failure. Returns the layout's content hash when relevant. */
  validate(value: unknown): Promise<void>;
}

/** Maps a relative path onto its write pattern, or throws 403 when the path is not writable. */
function writeTarget(segments: string[], requireMapping: (equipmentId: string, hex: string) => Promise<void>): Target {
  const [area, ...rest] = segments;
  const file = rest.at(-1) ?? '';
  const mutable = (validate: (value: unknown) => Promise<void> | void): Target => ({
    immutable: false, validate: async (value) => { await validate(value); },
  });
  if (area === 'layouts' && rest.length === 2 && LAYOUT_ID.test(rest[0]!)) {
    const layoutId = rest[0]!;
    if (file === 'draft.layout.json') {
      return mutable((value) => {
        const result = validateLayout(value);
        check(result, 'Invalid layout');
        if ((value as { id?: unknown }).id !== layoutId) fail(400, `Layout id must equal the folder name ${layoutId}`);
      });
    }
    if (file.endsWith('.layout.json') && HEX.test(file.slice(0, -'.layout.json'.length))) {
      fail(403, 'Layout revisions are immutable: use POST /api/layout-revisions');
    }
  }
  if (area === 'onboarding') {
    const key = rest.join('/');
    const dictionary = (scope: Record<string, string>) => mutable((value) => {
      check(validateTypeDictionary(value), 'Invalid type dictionary');
      if (!scopeIs(value, scope)) fail(400, 'Scope does not match the path');
    });
    const aliases = (scope: Record<string, string>) => mutable((value) => {
      check(validateAliasRules(value), 'Invalid alias rules');
      if (!scopeIs(value, scope)) fail(400, 'Scope does not match the path');
    });
    if (key === 'scopes/global/type-dictionary.json') return dictionary({ level: 'global' });
    const maker = /^scopes\/maker\/([^/]+)\/(type-dictionary|alias-rules)\.json$/.exec(key);
    if (maker && NAME.test(maker[1]!)) {
      const scope = { level: 'maker', maker: maker[1]! };
      return maker[2] === 'type-dictionary' ? dictionary(scope) : aliases(scope);
    }
    const model = /^scopes\/model\/([^/]+)\/([^/]+)\/(type-dictionary|alias-rules)\.json$/.exec(key);
    if (model && NAME.test(model[1]!) && NAME.test(model[2]!)) {
      const scope = { level: 'model', maker: model[1]!, model: model[2]! };
      return model[3] === 'type-dictionary' ? dictionary(scope) : aliases(scope);
    }
    const equipment = /^scopes\/equipment\/([^/]+)\/alias-rules\.json$/.exec(key);
    if (equipment && NAME.test(equipment[1]!)) return aliases({ level: 'equipment', equipmentId: equipment[1]! });
    const mapping = /^mappings\/([^/]+)\/([^/]+)\.mapping\.json$/.exec(key);
    if (mapping && NAME.test(mapping[1]!) && HEX.test(mapping[2]!)) {
      const [, equipmentId, hex] = mapping;
      return {
        immutable: true,
        validate: async (value) => {
          const parsed = mappingVersionSchema.safeParse(value);
          if (!parsed.success) return fail(400, 'Invalid mapping version', parsed.error.issues);
          if (!await verifyMappingHash(parsed.data)) fail(400, 'Mapping hash does not match its content');
          if (parsed.data.hash !== `sha256:${hex}`) fail(400, 'Mapping hash does not match the file name');
          if (parsed.data.equipmentId !== equipmentId) fail(400, 'equipmentId does not match the path');
        },
      };
    }
    const baseline = /^baselines\/([^/]+)\/([^/]+)\.inventory\.json$/.exec(key);
    if (baseline && NAME.test(baseline[1]!) && HEX.test(baseline[2]!)) {
      return {
        immutable: true,
        validate: async (value) => {
          const parsed = observedInventorySchema.safeParse(value);
          if (!parsed.success) return fail(400, 'Invalid inventory', parsed.error.issues);
          if (parsed.data.equipmentId !== baseline[1]) fail(400, 'equipmentId does not match the path');
          await requireMapping(baseline[1]!, baseline[2]!);
        },
      };
    }
    const bindings = /^bindings\/([^/]+)\.bindings\.json$/.exec(key);
    if (bindings && NAME.test(bindings[1]!)) {
      return mutable((value) => {
        check(validateBindings(value), 'Invalid bindings');
        if (equipmentIdOf(value) !== bindings[1]) fail(400, 'equipmentId does not match the path');
      });
    }
  }
  return fail(403, 'Path is not writable');
}

function relativeSegments(value: string | null, kind: 'file' | 'dir'): string[] {
  if (value === null) return fail(400, `Missing ${kind === 'file' ? 'path' : 'dir'} query`);
  if (kind === 'file' && value === '') fail(400, 'Empty path');
  if (value === '') return [];
  if (value.startsWith('/') || value.includes('\\') || value.includes('\0')) fail(400, 'Unsafe path');
  const segments = value.split('/');
  if (segments[0]!.includes(':')) fail(400, 'Unsafe path');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) fail(400, 'Unsafe path');
  if (kind === 'file' && !value.endsWith('.json')) fail(400, 'Only .json files are supported');
  return segments;
}

const missing = (error: unknown): boolean => (error as NodeJS.ErrnoException).code === 'ENOENT';
export function createFileApi({ root, repoRoot, hooks }: { root: string; repoRoot?: string; hooks?: FileApiHooks }) {
  async function rootReal(): Promise<string> {
    try {
      return await realpath(root);
    } catch {
      return fail(404, 'Assets root not found');
    }
  }

  const catalog = createCatalog({ root, repoRoot });

  async function resolveIn(base: string, absolute: string): Promise<{ real: string; absolute: string; base: string }> {
    let real: string;
    try {
      real = await realpath(absolute);
    } catch (error) {
      return missing(error) ? fail(404, 'Not found') : fail(500, 'Cannot resolve path');
    }
    if (!contained(base, real)) fail(403, 'Path escapes the assets root');
    return { real, absolute, base };
  }

  /** The bundled catalog folder's real path, or 404 when it is absent. */
  async function bundledBase(): Promise<string> {
    try {
      return await realpath(catalog.bundledDir());
    } catch {
      return fail(404, 'Not found');
    }
  }

  /** `templates/**` reads the bundle first, then (union catalog) the data root; containment is checked against the base the path came from. */
  async function readTarget(segments: string[]): Promise<{ real: string; absolute: string; base: string }> {
    if (repoRoot !== undefined && segments[0] === 'templates') {
      const kind = await catalog.kind();
      if (kind !== 'data-root') {
        try {
          return await resolveIn(await bundledBase(), join(repoRoot, 'assets', ...segments));
        } catch (error) {
          if (kind === 'bundled' || !(error instanceof ApiError) || error.status !== 404) throw error;
        }
      }
    }
    return resolveIn(await rootReal(), join(root, ...segments));
  }

  /** The `templates` listing of a union catalog: bundled names win; a missing side contributes nothing. */
  async function unionTemplateEntries(): Promise<{ name: string; kind: 'file' | 'dir' }[]> {
    const merged = new Map<string, { name: string; kind: 'file' | 'dir' }>();
    let found = false;
    const sources = [
      async () => resolveIn(await bundledBase(), catalog.bundledDir()),
      async () => resolveIn(await rootReal(), join(root, 'templates')),
    ];
    for (const source of sources) {
      let target: { real: string; base: string };
      try {
        target = await source();
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) continue;
        throw error;
      }
      found = true;
      for (const entry of await listEntries(target.real, target.base)) if (!merged.has(entry.name)) merged.set(entry.name, entry);
    }
    return found ? [...merged.values()] : fail(404, 'Not found');
  }

  async function listEntries(real: string, base: string): Promise<{ name: string; kind: 'file' | 'dir' }[]> {
    const entries: { name: string; kind: 'file' | 'dir' }[] = [];
    for (const name of await readdir(real)) {
      try {
        const entryReal = await realpath(join(real, name));
        if (!contained(base, entryReal)) continue;
        const entryInfo = await stat(entryReal);
        if (entryInfo.isDirectory()) entries.push({ name, kind: 'dir' });
        else if (entryInfo.isFile() && name.endsWith('.json')) entries.push({ name, kind: 'file' });
      } catch {
        continue;
      }
    }
    return entries;
  }

  async function get(segments: string[], kind: 'file' | 'dir'): Promise<FileApiResponse> {
    const sortByName = (entries: { name: string }[]) => entries.sort((x, y) => x.name < y.name ? -1 : x.name > y.name ? 1 : 0);
    if (kind === 'dir' && repoRoot !== undefined && segments.length === 1 && segments[0] === 'templates' && await catalog.kind() === 'bundled+data-root') {
      return { status: 200, body: { entries: sortByName(await unionTemplateEntries()) } };
    }
    const { real, base } = await readTarget(segments);
    const info = await stat(real);
    if (kind === 'file') {
      if (!info.isFile()) fail(400, 'Not a file');
      try {
        return { status: 200, body: JSON.parse(await readFile(real, 'utf8')) as unknown };
      } catch {
        return fail(422, 'File is not valid JSON');
      }
    }
    if (!info.isDirectory()) fail(400, 'Not a directory');
    return { status: 200, body: { entries: sortByName(await listEntries(real, base)) } };
  }

  /** Rejects symlinks in existing components below the root and any escape from the real root. */
  async function assertWritable(segments: string[]): Promise<void> {
    const base = await rootReal();
    let current = root;
    for (const segment of segments) {
      current = join(current, segment);
      try {
        if ((await lstat(current)).isSymbolicLink()) fail(403, 'Symlinks are not writable');
      } catch (error) {
        if (error instanceof ApiError) throw error;
        if (missing(error)) break;
        fail(500, 'Cannot inspect path');
      }
    }
    let ancestor = join(root, ...segments);
    for (;;) {
      try {
        if (!contained(base, await realpath(ancestor))) fail(403, 'Path escapes the assets root');
        break;
      } catch (error) {
        if (error instanceof ApiError) throw error;
        if (!missing(error) || ancestor === root) fail(500, 'Cannot resolve path');
        ancestor = dirname(ancestor);
      }
    }
  }

  /**
   * The deepest existing ancestor of `dir` must resolve inside the request's data root and outside the repo (403 otherwise).
   * Run right before each create so a link swapped in after the guard is refused. The window between this check and the
   * create is not closed (no directory-handle API in Node); the Studio is a single-user local dev tool, so that narrower
   * race is accepted. The final component is never followed: files are published with link(2), which fails on any existing name.
   */
  async function assertParentInside(dir: string, scope: WriteScope): Promise<void> {
    for (let ancestor = dir; ; ancestor = dirname(ancestor)) {
      let real: string;
      try {
        real = await realpath(ancestor);
      } catch (error) {
        if (!missing(error) || ancestor === scope.base) return fail(500, 'Cannot resolve path');
        continue;
      }
      if (!contained(scope.base, real) || (scope.repoReal !== undefined && contained(scope.repoReal, real))) {
        fail(403, 'Path escapes the assets root');
      }
      return;
    }
  }

  /** Writes a sibling temp file, then publishes it under `absolute`. A failure leaves neither the temp nor the final name. */
  async function stage(absolute: string, text: string, scope: WriteScope, publish: (temp: string) => Promise<void>): Promise<void> {
    const dir = dirname(absolute);
    await assertParentInside(dir, scope);
    await mkdir(dir, { recursive: true });
    const temp = join(dir, `.${absolute.slice(dir.length + 1)}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`);
    try {
      await writeFile(temp, text, { flag: 'wx' });
      await hooks?.afterTempWrite?.();
      await assertParentInside(dir, scope);
      await publish(temp);
    } finally {
      await rm(temp, { force: true });
    }
  }

  async function write(
    segments: string[], value: unknown, immutable: boolean, createOnly = false, requestScope?: WriteScope,
  ): Promise<{ created: boolean; conflict: boolean; exists?: boolean }> {
    await hooks?.beforeWrite?.();
    const scope = requestScope ?? { base: await rootReal() };
    const absolute = join(scope.base, ...segments);
    const text = `${JSON.stringify(value, null, 2)}\n`;
    if (createOnly || immutable) {
      let exists = false;
      await stage(absolute, text, scope, async (temp) => {
        try {
          await link(temp, absolute);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
          exists = true;
        }
      });
      if (!exists) return { created: true, conflict: false };
      if (!immutable) return { created: false, conflict: false, exists: true };
      let existing: unknown;
      try {
        existing = JSON.parse(await readFile(absolute, 'utf8'));
      } catch {
        return { created: false, conflict: true };
      }
      return { created: false, conflict: !isDeepStrictEqual(existing, JSON.parse(text)) };
    }
    const existed = await lstat(absolute).then(() => true, () => false);
    await stage(absolute, text, scope, (temp) => rename(temp, absolute));
    return { created: !existed, conflict: false };
  }

  function assertJsonType(request: FileApiRequest): void {
    const type = Object.entries(request.headers).find(([name]) => name.toLowerCase() === 'content-type')?.[1];
    if (!type || !/^application\/json\s*(;.*)?$/i.test(type)) fail(415, 'Content-Type must be application/json');
  }

  function parseBody(request: FileApiRequest): unknown {
    assertJsonType(request);
    try {
      return JSON.parse(request.body) as unknown;
    } catch {
      return fail(400, 'Body is not valid JSON');
    }
  }

  async function put(request: FileApiRequest, query: URLSearchParams): Promise<FileApiResponse> {
    const segments = relativeSegments(query.get('path'), 'file');
    const body = parseBody(request);
    const target = writeTarget(segments, async (equipmentId, hex) => {
      try {
        const { real } = await readTarget(['onboarding', 'mappings', equipmentId, `${hex}.mapping.json`]);
        if (!(await stat(real)).isFile()) fail(409, 'Mapping Version이 없습니다');
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) fail(409, 'Mapping Version이 없습니다');
        throw error;
      }
    });
    await target.validate(body);
    await assertWritable(segments);
    const path = segments.join('/');
    const createOnly = Object.entries(request.headers).some(([name, value]) => name.toLowerCase() === 'if-none-match' && value?.trim() === '*');
    const result = await write(segments, body, target.immutable, createOnly);
    if (result.exists) return { status: 412, body: { error: 'A file already exists at this path' } };
    if (result.conflict) return { status: 409, body: { error: 'A different file already exists at this path' } };
    return { status: result.created ? 201 : 200, body: { path, created: result.created } };
  }

  async function publish(request: FileApiRequest): Promise<FileApiResponse> {
    const body = parseBody(request);
    const result = validateLayout(body);
    if (!result.ok) return fail(400, 'Invalid layout', result.issues);
    const revision = await layoutRevision(result.layout);
    const segments = ['layouts', result.layout.id, `${revision.slice('sha256:'.length)}.layout.json`];
    await assertWritable(segments);
    const written = await write(segments, body, true);
    if (written.conflict) return { status: 409, body: { error: 'A different file already exists at this path' } };
    return { status: written.created ? 201 : 200, body: { path: segments.join('/'), revision } };
  }

  const importApi = createImportApi({
    root, repoRoot, readTarget, assertWritable, write, assertJsonType, catalogKind: catalog.kind,
  });
  const promoteApi = createPromoteApi({
    root, rootReal, repoRoot, catalog, assertEnabled: importApi.assertEnabled, assertWritable, write, assertJsonType,
  });

  async function dispatch(request: FileApiRequest): Promise<FileApiResponse> {
    const url = new URL(request.url, 'http://studio.local');
    const { searchParams } = url;
    if (url.pathname === '/api/files') {
      if (request.method === 'GET') {
        if (searchParams.has('path')) return get(relativeSegments(searchParams.get('path'), 'file'), 'file');
        if (searchParams.has('dir')) return get(relativeSegments(searchParams.get('dir'), 'dir'), 'dir');
        return fail(400, 'Missing path or dir query');
      }
      if (request.method === 'PUT') return put(request, searchParams);
      return fail(405, 'Method not allowed');
    }
    if (url.pathname === '/api/layout-revisions') {
      if (request.method === 'POST') return publish(request);
      return fail(405, 'Method not allowed');
    }
    if (url.pathname === '/api/templates') {
      if (request.method === 'GET') return promoteApi.list();
      return fail(405, 'Method not allowed');
    }
    if (url.pathname === '/api/template-promotions') {
      if (request.method === 'POST') return promoteApi.promote(request);
      return fail(405, 'Method not allowed');
    }
    if (url.pathname.startsWith(IMPORT_API_PREFIX)) return importApi.dispatch(request, url);
    return fail(404, 'Unknown endpoint');
  }

  return {
    async handle(request: FileApiRequest): Promise<FileApiResponse> {
      try {
        return await dispatch(request);
      } catch (error) {
        if (error instanceof ApiError) {
          return { status: error.status, body: error.issues ? { error: error.message, issues: error.issues } : { error: error.message } };
        }
        return { status: 500, body: { error: 'Internal error' } };
      }
    },
  };
}
