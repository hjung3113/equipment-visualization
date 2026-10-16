import { lstat, mkdir, readdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
  layoutRevision, mappingVersionSchema, validateAliasRules, validateBindings, validateLayout,
  validateTypeDictionary, verifyMappingHash,
} from '@eqv/core';

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

const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const LAYOUT_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const HEX = /^[0-9a-f]{64}$/;

class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly issues?: unknown[]) {
    super(message);
  }
}
const fail = (status: number, message: string, issues?: unknown[]): never => {
  throw new ApiError(status, message, issues);
};

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
function writeTarget(segments: string[]): Target {
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
const contained = (root: string, target: string): boolean => target === root || target.startsWith(root + sep);

export function createFileApi({ root }: { root: string }) {
  async function rootReal(): Promise<string> {
    try {
      return await realpath(root);
    } catch {
      return fail(404, 'Assets root not found');
    }
  }

  async function readTarget(segments: string[]): Promise<{ real: string; absolute: string }> {
    const base = await rootReal();
    const absolute = join(root, ...segments);
    let real: string;
    try {
      real = await realpath(absolute);
    } catch (error) {
      return missing(error) ? fail(404, 'Not found') : fail(500, 'Cannot resolve path');
    }
    if (!contained(base, real)) fail(403, 'Path escapes the assets root');
    return { real, absolute };
  }

  async function get(segments: string[], kind: 'file' | 'dir'): Promise<FileApiResponse> {
    const { real } = await readTarget(segments);
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
    const base = await rootReal();
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
    entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    return { status: 200, body: { entries } };
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

  async function write(segments: string[], value: unknown, immutable: boolean): Promise<{ created: boolean; conflict: boolean }> {
    const absolute = join(root, ...segments);
    const text = `${JSON.stringify(value, null, 2)}\n`;
    await mkdir(dirname(absolute), { recursive: true });
    if (immutable) {
      try {
        await writeFile(absolute, text, { flag: 'wx' });
        return { created: true, conflict: false };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        let existing: unknown;
        try {
          existing = JSON.parse(await readFile(absolute, 'utf8'));
        } catch {
          return { created: false, conflict: true };
        }
        return { created: false, conflict: !isDeepStrictEqual(existing, JSON.parse(text)) };
      }
    }
    const existed = await lstat(absolute).then(() => true, () => false);
    const temp = join(dirname(absolute), `.${segments.at(-1)}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`);
    try {
      await writeFile(temp, text, { flag: 'wx' });
      await rename(temp, absolute);
    } catch (error) {
      await rm(temp, { force: true });
      throw error;
    }
    return { created: !existed, conflict: false };
  }

  function parseBody(request: FileApiRequest): unknown {
    const type = Object.entries(request.headers).find(([name]) => name.toLowerCase() === 'content-type')?.[1];
    if (!type || !/^application\/json\s*(;.*)?$/i.test(type)) fail(415, 'Content-Type must be application/json');
    try {
      return JSON.parse(request.body) as unknown;
    } catch {
      return fail(400, 'Body is not valid JSON');
    }
  }

  async function put(request: FileApiRequest, query: URLSearchParams): Promise<FileApiResponse> {
    const segments = relativeSegments(query.get('path'), 'file');
    const body = parseBody(request);
    const target = writeTarget(segments);
    await target.validate(body);
    await assertWritable(segments);
    const path = segments.join('/');
    const result = await write(segments, body, target.immutable);
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
