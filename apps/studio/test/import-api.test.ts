import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sampleWindowName } from '@eqv/core';
import { createFileApi } from '../server/files.js';
import { record, seedRoot, writeJson } from './seed.js';

const repo = resolve(process.cwd(), '../..');
const fixture = (name: string) => readFile(join(repo, 'fixtures/import', name), 'utf8');
interface Batch { from: string; to: string; timeDomain: string; occurrences: { id: string }[] }
const fixtureJson = async (name: string): Promise<Record<string, unknown> & Batch> => JSON.parse(await fixture(name));
const JSON_TYPE = { 'content-type': 'application/json' };
const REPO_REASON = '저장소 밖 경로를 EQV_STUDIO_ASSETS로 지정하세요';
const W1 = '20260101T100000.000_20260101T103000.000_e4105058c6925622270f4a59777c54a5380bd7fd97fba676db1db96c65cd0ec4';
const W2 = '20260101T103000.000_20260101T110000.000_64b0d67de92b4275e871c6e48a801307d5bb9d065d990f2ad81aad6a1765ba51';

let base: string;
let root: string;
let api: ReturnType<typeof createFileApi>;
const created: string[] = [];
beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'eqv-import-'));
  root = join(base, 'assets');
  await mkdir(root);
  api = createFileApi({ root, repoRoot: repo });
  created.push(base);
});
afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const query = (params: Record<string, string>) => `?${new URLSearchParams(params)}`;
interface Body {
  error: string; path: string; created: boolean; summary: { name: string }; issues: { code: string }[];
  entries: { name: string }[]; enabled: boolean; catalog: string;
}
const send = async (target: ReturnType<typeof createFileApi>, method: string, url: string, body = '', headers: Record<string, string> = JSON_TYPE) =>
  (await target.handle({ method, url, headers, body })) as { status: number; body: Body };
const call = (method: string, url: string, body = '', headers: Record<string, string> = JSON_TYPE) => send(api, method, url, body, headers);
const register = async (name = 'eq-synth-03.equipment.json') => call('POST', '/api/import/equipment', await fixture(name));
const postWindow = (text: string, equipmentId = 'eq-synth-03') =>
  call('POST', `/api/import/windows${query({ equipmentId })}`, text);
const putAlias = (text: string, headers: Record<string, string> = JSON_TYPE, equipmentId = 'eq-synth-03') =>
  call('PUT', `/api/import/alias-metadata${query({ equipmentId })}`, text, headers);
const putDictionary = (text: string, maker = 'synth-maker-b', model = 'synth-wet') =>
  call('PUT', `/api/import/type-dictionary${query({ maker, model })}`, text);
const windowsDir = (equipmentId = 'eq-synth-03') => join(root, 'observations', equipmentId, 'windows');
const listWindows = (equipmentId?: string) => readdir(windowsDir(equipmentId)).catch(() => [] as string[]);
const exists = (path: string) => stat(path).then(() => true, () => false);
const tempFiles = async (dir: string): Promise<string[]> => {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true, recursive: true }).catch(() => [])) {
    if (entry.name.endsWith('.tmp')) found.push(entry.name);
  }
  return found;
};
const withBatch = async (name: string, edit: (batch: Batch) => void): Promise<string> => {
  const batch = await fixtureJson(name);
  edit(batch);
  return JSON.stringify(batch);
};
const importAll = async () => {
  expect((await register()).status).toBe(201);
  expect((await postWindow(await fixture('eq-synth-03.w1.batch.json'))).status).toBe(201);
};

describe('data-root guard', () => {
  const refusals: [string, () => Promise<{ root: string; repoRoot: string }>][] = [
    ['the real <repo>/assets', async () => ({ root: join(repo, 'assets'), repoRoot: repo })],
    ['a simulated repo, deeper root', async () => {
      const deeper = join(base, 'assets/sub/deeper');
      await mkdir(deeper, { recursive: true });
      return { root: deeper, repoRoot: base };
    }],
    ['a symlink whose realpath is inside the repo', async () => {
      const other = await mkdtemp(join(tmpdir(), 'eqv-import-link-'));
      created.push(other);
      await symlink(join(base, 'assets'), join(other, 'link'));
      return { root: join(other, 'link'), repoRoot: base };
    }],
    ['equality: root is the repo root', async () => ({ root: base, repoRoot: base })],
  ];
  it.each(refusals.map((row, index) => [...row, index] as const))('refuses import writes and keeps reads: %s', async (_name, setup, index) => {
    if (index > 0) {
      await mkdir(join(base, 'assets/templates'), { recursive: true });
      await writeJson(base, 'assets/templates/note.json', { note: true });
    }
    const guarded = await setup();
    const snapshot = () => readdir(guarded.root, { recursive: true });
    const before = await snapshot();
    const guardedApi = createFileApi(guarded);
    const status = await send(guardedApi, 'GET', '/api/import/status');
    expect(status).toEqual({ status: 200, body: expect.objectContaining({ enabled: false, reason: REPO_REASON, insideGitWorkTree: false }) });
    const writes: [string, string, string][] = [
      ['POST', '/api/import/equipment', await fixture('eq-synth-03.equipment.json')],
      ['POST', `/api/import/windows${query({ equipmentId: 'eq-synth-03' })}`, await fixture('eq-synth-03.w1.batch.json')],
      ['PUT', `/api/import/alias-metadata${query({ equipmentId: 'eq-synth-03' })}`, await fixture('eq-synth-03.alias-metadata.json')],
      ['PUT', `/api/import/type-dictionary${query({ maker: 'synth-maker-b', model: 'synth-wet' })}`, await fixture('synth-maker-b.synth-wet.type-dictionary.json')],
    ];
    for (const [method, url, body] of writes) {
      expect(await send(guardedApi, method, url, body)).toEqual({ status: 403, body: { error: REPO_REASON } });
    }
    expect(await snapshot()).toEqual(before);
    const read = index === 0 ? 'templates/cluster-single.template.json' : 'templates/note.json';
    expect((await send(guardedApi, 'GET', `/api/files${query({ path: read })}`)).status).toBe(200);
  });

  it('keeps the general file API writable inside a simulated repo', async () => {
    const deeper = join(base, 'assets/sub/deeper');
    await mkdir(deeper, { recursive: true });
    const template = await readFile(join(repo, 'assets/templates/cluster-single.template.json'), 'utf8');
    const layout = { ...JSON.parse(template), id: 'cluster-single' };
    const result = await send(createFileApi({ root: deeper, repoRoot: base }), 'PUT',
      `/api/files${query({ path: 'layouts/cluster-single/draft.layout.json' })}`, JSON.stringify(layout));
    expect(result.status).toBe(201);
  });

  it('fails closed when the data root is missing', async () => {
    const missing = createFileApi({ root: join(base, 'nope'), repoRoot: repo });
    expect(await send(missing, 'GET', '/api/import/status')).toEqual({
      status: 200, body: expect.objectContaining({ enabled: false, reason: 'Assets root not found', insideGitWorkTree: false }),
    });
    expect(await send(missing, 'POST', '/api/import/equipment', await fixture('eq-synth-03.equipment.json')))
      .toEqual({ status: 404, body: { error: 'Assets root not found' } });
  });

  it('fails closed when the repo root cannot be resolved, or is not given', async () => {
    for (const unknown of [createFileApi({ root, repoRoot: join(base, 'no-repo') }), createFileApi({ root })]) {
      expect(await send(unknown, 'GET', '/api/import/status')).toEqual({
        status: 200, body: expect.objectContaining({ enabled: false, reason: 'repository root unknown' }),
      });
      expect(await send(unknown, 'POST', '/api/import/equipment', await fixture('eq-synth-03.equipment.json')))
        .toEqual({ status: 403, body: { error: 'repository root unknown' } });
    }
  });

  it('without repoRoot, templates/ reads are as before (no bundled fallback)', async () => {
    const plain = createFileApi({ root });
    expect((await send(plain, 'GET', `/api/files${query({ dir: 'templates' })}`)).status).toBe(404);
  });

  it.each([['a .git directory', 'dir'], ['a .git file (worktree or submodule)', 'file']])('warns for %s above the root', async (_name, kind) => {
    if (kind === 'dir') await mkdir(join(base, '.git'));
    else await writeFile(join(base, '.git'), 'gitdir: x');
    expect((await call('GET', '/api/import/status')).body).toMatchObject({ enabled: true, insideGitWorkTree: true });
    expect((await register()).status).toBe(201);
  });

  it('reports a plain temp root as outside any git work tree, with the 32 MiB cap', async () => {
    expect(await call('GET', '/api/import/status')).toEqual({
      status: 200, body: { enabled: true, insideGitWorkTree: false, catalog: 'bundled', maxWindowBytes: 33554432 },
    });
    expect((await call('POST', '/api/import/status')).status).toBe(405);
    expect((await call('GET', '/api/import/other')).status).toBe(404);
  });

  it('reports which catalog is in use', async () => {
    const bundled = await call('GET', `/api/files${query({ dir: 'templates' })}`);
    expect(bundled.body.entries.map((entry: { name: string }) => entry.name)).toEqual(
      (await readdir(join(repo, 'assets/templates'))).filter((name) => name.endsWith('.json')).sort());
    const seeded = await seedRoot();
    created.push(seeded.base);
    const own = createFileApi({ root: seeded.root, repoRoot: repo });
    expect((await send(own, 'GET', '/api/import/status')).body.catalog).toBe('data-root');
    expect((await send(own, 'GET', `/api/files${query({ dir: 'templates' })}`)).body.entries).toHaveLength(1);
  });
});

describe('equipment registration', () => {
  it('creates the record exactly as received, then refuses a second one', async () => {
    expect(await register()).toEqual({ status: 201, body: { path: 'equipment/eq-synth-03.json', created: true } });
    expect(JSON.parse(await readFile(join(root, 'equipment/eq-synth-03.json'), 'utf8'))).toEqual(await fixtureJson('eq-synth-03.equipment.json'));
    expect((await register()).status).toBe(412);
  });

  it.each([
    ['equipmentId', record('EQ-SYNTH-03', 'other-maker', 'other-model'), 'eq-synth-03'],
    ['maker', record('eq-synth-04', 'Synth-Maker-B', 'synth-wet'), 'synth-maker-b'],
    ['model', record('eq-synth-04', 'synth-maker-b', 'SYNTH-WET'), 'synth-wet'],
  ])('409 for a %s that differs only by case', async (field, body, existing) => {
    await register();
    const result = await call('POST', '/api/import/equipment', JSON.stringify(body));
    expect(result).toEqual({ status: 409, body: { error: expect.any(String), field, existing } });
    expect(await readdir(join(root, 'equipment'))).toEqual(['eq-synth-03.json']);
  });

  it.each([
    ['../x', record('../x')], ['a b', record('a b')], ['.x', record('.x')],
    ['an extra field', { ...record('eq-synth-09'), extra: 1 }],
  ])('400 for %s', async (_name, body) => {
    const result = await call('POST', '/api/import/equipment', JSON.stringify(body));
    expect(result.status).toBe(400);
    expect(result.body.issues).toBeInstanceOf(Array);
    expect(await exists(join(root, 'equipment'))).toBe(false);
  });

  it('415 for text/plain and 400 for invalid JSON, writing nothing', async () => {
    expect((await call('POST', '/api/import/equipment', await fixture('eq-synth-03.equipment.json'), { 'content-type': 'text/plain' })).status).toBe(415);
    expect((await call('POST', '/api/import/equipment', '{')).status).toBe(400);
    expect(await exists(join(root, 'equipment'))).toBe(false);
  });

  it('422 when a stored record is unreadable', async () => {
    await mkdir(join(root, 'equipment'));
    await writeFile(join(root, 'equipment/eq-synth-03.json'), '{ not json');
    const result = await register();
    expect(result.status).toBe(422);
    expect(result.body.error).toContain('equipment/eq-synth-03.json');
  });
});

describe('Sample Windows', () => {
  beforeEach(async () => { await register(); });

  it('stores w1 under the server-computed name, is idempotent, and accepts the adjacent w2', async () => {
    const text = await fixture('eq-synth-03.w1.batch.json');
    const first = await postWindow(text);
    expect(first.status).toBe(201);
    expect(first.body.path).toBe(`observations/eq-synth-03/windows/${W1}.batch.json`);
    expect(first.body.summary.name).toBe(await sampleWindowName(JSON.parse(text)));
    expect(first.body.created).toBe(true);
    const file = join(root, first.body.path);
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(JSON.parse(text));
    const before = await stat(file);
    const again = await postWindow(text);
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ created: false, path: first.body.path });
    expect((await stat(file)).mtimeMs).toBe(before.mtimeMs);
    const second = await postWindow(await fixture('eq-synth-03.w2.batch.json'));
    expect(second.status).toBe(201);
    expect(second.body.path).toBe(`observations/eq-synth-03/windows/${W2}.batch.json`);
  });

  it.each<[string, string, () => Promise<string>, number]>([
    ['409 overlap', 'eq-synth-03', () => withBatch('eq-synth-03.w1.batch.json', (b) => { b.to = '2026-01-01T10:30:00.001'; }), 409],
    ['409 time domain', 'eq-synth-03', () => withBatch('eq-synth-03.w2.batch.json', (b) => { b.timeDomain = 'site-other'; }), 409],
    ['404 unregistered id', 'eq-unregistered', () => fixture('eq-synth-03.w2.batch.json'), 404],
    ['404 case variant of a registered id', 'EQ-SYNTH-03', () => fixture('eq-synth-03.w2.batch.json'), 404],
    ['400 path-like id', '../x', () => fixture('eq-synth-03.w2.batch.json'), 400],
    ['400 encoded slash', 'a%2Fb', () => fixture('eq-synth-03.w2.batch.json'), 400],
  ])('%s', async (_name, equipmentId, makeBody, status) => {
    await postWindow(await fixture('eq-synth-03.w1.batch.json'));
    const before = await listWindows();
    const result = await call('POST', `/api/import/windows?equipmentId=${equipmentId}`, await makeBody());
    expect(result.status).toBe(status);
    expect(await listWindows()).toEqual(before);
    expect(await tempFiles(base)).toEqual([]);
  });

  it('409 with a plain error for a different file at the same name', async () => {
    const dir = windowsDir();
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${W1}.batch.json`), JSON.stringify({ timeDomain: 'site-synth', x: 1 }));
    const result = await postWindow(await fixture('eq-synth-03.w1.batch.json'));
    expect(result).toEqual({ status: 409, body: { error: 'A different file already exists at this path' } });
    expect(JSON.parse(await readFile(join(dir, `${W1}.batch.json`), 'utf8'))).toEqual({ timeDomain: 'site-synth', x: 1 });
  });

  it('413 above 32 MiB, 415 for text/plain, 422 for a stray windows/ entry', async () => {
    expect(await postWindow(' '.repeat(33 * 1024 * 1024))).toEqual({ status: 413, body: { error: 'Body exceeds 32 MiB' } });
    const w1 = await fixture('eq-synth-03.w1.batch.json');
    expect((await call('POST', `/api/import/windows${query({ equipmentId: 'eq-synth-03' })}`, w1, { 'content-type': 'text/plain' })).status).toBe(415);
    await mkdir(windowsDir(), { recursive: true });
    await writeFile(join(windowsDir(), 'notes.json'), '{}');
    const stray = await postWindow(w1);
    expect(stray.status).toBe(422);
    expect(stray.body.error).toContain('notes.json');
    expect(await listWindows()).toEqual(['notes.json']);
  });

  it.each<[string, () => Promise<string>, string?]>([
    ['fraction-too-long', () => fixture('invalid/sub-ms.batch.json')],
    ['continuation', () => fixture('invalid/continuation.batch.json')],
    ['schema', () => fixture('invalid/point-events.json')],
    ['equipment-mismatch', () => fixture('eq-synth-03.w1.batch.json'), 'eq-synth-04'],
    ['duplicate-id', () => withBatch('eq-synth-03.w1.batch.json', (b) => { b.occurrences[1]!.id = b.occurrences[0]!.id; })],
    ['empty-range', () => withBatch('eq-synth-03.w1.batch.json', (b) => { b.to = b.from; })],
  ])('400 %s', async (code, makeBody, equipmentId = 'eq-synth-03') => {
    await call('POST', '/api/import/equipment', JSON.stringify(record('eq-synth-04', 'synth-maker-b', 'synth-wet')));
    const result = await postWindow(await makeBody(), equipmentId);
    expect(result.status).toBe(400);
    expect(result.body.error).toBe('Sample Window rejected');
    expect(result.body.issues.map((issue: { code: string }) => issue.code)).toContain(code);
    expect(await listWindows()).toEqual([]);
    expect(await listWindows('eq-synth-04')).toEqual([]);
    expect(await tempFiles(base)).toEqual([]);
  });

  it('a sub-millisecond time is never stored, even truncated', async () => {
    await postWindow(await fixture('invalid/sub-ms.batch.json'));
    expect(await listWindows()).toEqual([]);
  });

  it('mixed duplicate-id and window-overlap is 400, not 409', async () => {
    await postWindow(await fixture('eq-synth-03.w1.batch.json'));
    const result = await postWindow(await withBatch('eq-synth-03.w1.batch.json', (b) => { b.occurrences[1]!.id = b.occurrences[0]!.id; }));
    const codes = result.body.issues.map((issue: { code: string }) => issue.code);
    expect(codes).toEqual(expect.arrayContaining(['duplicate-id', 'window-overlap']));
    expect(result.status).toBe(400);
    expect(await listWindows()).toEqual([`${W1}.batch.json`]);
  });
});

describe('alias metadata', () => {
  beforeEach(async () => { await register(); });

  it('creates with If-None-Match, refuses a second create, and replaces without the header', async () => {
    const text = await fixture('eq-synth-03.alias-metadata.json');
    const target = join(root, 'observations/eq-synth-03/alias-metadata.json');
    expect(await putAlias(text, { ...JSON_TYPE, 'If-None-Match': '*' }))
      .toEqual({ status: 201, body: { path: 'observations/eq-synth-03/alias-metadata.json', created: true } });
    expect(JSON.parse(await readFile(target, 'utf8'))).toEqual(JSON.parse(text));
    const changed = JSON.stringify({ ...JSON.parse(text), aliases: [{ alias: 'ONLY' }] });
    expect((await putAlias(changed, { ...JSON_TYPE, 'if-none-match': '*' })).status).toBe(412);
    expect(JSON.parse(await readFile(target, 'utf8'))).toEqual(JSON.parse(text));
    expect(await putAlias(changed)).toEqual({ status: 200, body: { path: 'observations/eq-synth-03/alias-metadata.json', created: false } });
    expect(JSON.parse(await readFile(target, 'utf8'))).toEqual(JSON.parse(changed));
    expect(await tempFiles(base)).toEqual([]);
  });

  it.each<[string, () => Promise<string>, string, number]>([
    ['equipmentId differs from the query', async () => JSON.stringify({ ...(await fixtureJson('eq-synth-03.alias-metadata.json')), equipmentId: 'eq-synth-04' }), 'eq-synth-03', 400],
    ['duplicate alias', async () => JSON.stringify({ schemaVersion: '0.4', equipmentId: 'eq-synth-03', aliases: [{ alias: 'A' }, { alias: 'A' }] }), 'eq-synth-03', 400],
    ['unregistered equipment', async () => JSON.stringify({ ...(await fixtureJson('eq-synth-03.alias-metadata.json')), equipmentId: 'eq-unregistered' }), 'eq-unregistered', 404],
  ])('%s', async (_name, makeBody, equipmentId, status) => {
    expect((await putAlias(await makeBody(), JSON_TYPE, equipmentId)).status).toBe(status);
    expect(await exists(join(root, 'observations'))).toBe(false);
  });
});

describe('type dictionary', () => {
  beforeEach(async () => { await register(); });
  const modelPath = 'onboarding/scopes/model/synth-maker-b/synth-wet/type-dictionary.json';

  it('creates once at the Model path; the general API still overwrites it', async () => {
    const text = await fixture('synth-maker-b.synth-wet.type-dictionary.json');
    expect(await putDictionary(text)).toEqual({ status: 201, body: { path: modelPath, created: true } });
    expect(JSON.parse(await readFile(join(root, modelPath), 'utf8'))).toEqual(JSON.parse(text));
    expect((await putDictionary(text)).status).toBe(412);
    const general = await call('PUT', `/api/files${query({ path: modelPath })}`, text);
    expect(general.status).toBe(200);
  });

  it.each<[string, string, string, (text: string) => string, number]>([
    ['scope maker differs from the query', 'synth-maker-b', 'synth-wet', (t) => t.replace('"synth-maker-b"', '"other"'), 400],
    ['no registered record with that model', 'synth-maker-b', 'other', (t) => t.replace('"synth-wet"', '"other"'), 404],
  ])('%s', async (_name, maker, model, edit, status) => {
    expect((await putDictionary(edit(await fixture('synth-maker-b.synth-wet.type-dictionary.json')), maker, model)).status).toBe(status);
    expect(await exists(join(root, 'onboarding'))).toBe(false);
  });
});

describe('general file API is unchanged', () => {
  it.each([
    'equipment/eq-synth-03.json',
    `observations/eq-synth-03/windows/${W1}.batch.json`,
  ])('PUT %s is 403', async (path) => {
    const result = await call('PUT', `/api/files${query({ path })}`, await fixture('eq-synth-03.equipment.json'));
    expect(result.status).toBe(403);
    expect(await exists(join(root, 'equipment'))).toBe(false);
    expect(await exists(join(root, 'observations'))).toBe(false);
  });
});

describe('path security', () => {
  it('a symlinked observations/<id> refuses the window import and writes nothing outside', async () => {
    await importAll();
    await rm(join(root, 'observations'), { recursive: true });
    const outside = join(base, 'outside');
    await mkdir(outside);
    await mkdir(join(root, 'observations'));
    await symlink(outside, join(root, 'observations/eq-synth-03'));
    const result = await postWindow(await fixture('eq-synth-03.w1.batch.json'));
    expect(result.status).toBe(403);
    expect(await readdir(outside)).toEqual([]);
  });

  it('a symlinked equipment/ refuses registration and writes nothing outside', async () => {
    const outside = join(base, 'outside');
    await mkdir(outside);
    await symlink(outside, join(root, 'equipment'));
    expect((await register()).status).toBe(403);
    expect(await readdir(outside)).toEqual([]);
  });

  it.each([
    ['maker=.. / model=.', { maker: '..', model: '.' }],
    ['an empty maker', { maker: '', model: 'x' }],
  ])('400 for %s', async (_name, params) => {
    await register();
    const result = await call('PUT', `/api/import/type-dictionary${query(params)}`, await fixture('synth-maker-b.synth-wet.type-dictionary.json'));
    expect(result.status).toBe(400);
    expect(await exists(join(root, 'onboarding'))).toBe(false);
  });
});

describe('writes stay inside the approved root', () => {
  let fakeRepo: string;
  beforeEach(async () => {
    fakeRepo = join(base, 'repo');
    await mkdir(join(fakeRepo, 'assets'), { recursive: true });
  });
  const repoFiles = () => readdir(fakeRepo, { recursive: true });

  it('403 and no file in the repo when a subdirectory is swapped for a link into it after the guard', async () => {
    await mkdir(join(root, 'equipment'));
    const swapped = createFileApi({
      root, repoRoot: fakeRepo,
      hooks: {
        beforeWrite: async () => {
          await rm(join(root, 'equipment'), { recursive: true });
          await symlink(join(fakeRepo, 'assets'), join(root, 'equipment'));
        },
      },
    });
    const before = await repoFiles();
    const result = await send(swapped, 'POST', '/api/import/equipment', await fixture('eq-synth-03.equipment.json'));
    expect(result.status).toBe(403);
    expect(await repoFiles()).toEqual(before);
  });

  it('writes through the root resolved at the guard when the data-root link is retargeted into the repo', async () => {
    const link = join(base, 'link');
    await symlink(root, link);
    const swapped = createFileApi({
      root: link, repoRoot: fakeRepo,
      hooks: {
        beforeWrite: async () => {
          await rm(link);
          await symlink(join(fakeRepo, 'assets'), link);
        },
      },
    });
    const before = await repoFiles();
    expect((await send(swapped, 'POST', '/api/import/equipment', await fixture('eq-synth-03.equipment.json'))).status).toBe(201);
    expect(await repoFiles()).toEqual(before);
    expect(await exists(join(root, 'equipment/eq-synth-03.json'))).toBe(true);
  });

  it('a failed create leaves no final or temp file, and the retry succeeds', async () => {
    let fail = true;
    const flaky = createFileApi({
      root, repoRoot: repo,
      hooks: { afterTempWrite: async () => { if (fail) throw new Error('ENOSPC'); } },
    });
    const body = await fixture('eq-synth-03.equipment.json');
    expect((await send(flaky, 'POST', '/api/import/equipment', body)).status).toBe(500);
    expect(await readdir(join(root, 'equipment'))).toEqual([]);
    fail = false;
    expect((await send(flaky, 'POST', '/api/import/equipment', body)).status).toBe(201);
    expect(await readdir(join(root, 'equipment'))).toEqual(['eq-synth-03.json']);
  });
});

describe('stored-file failures', () => {
  it.each<[string, string, number]>([
    ['unreadable record file', 'equipment/eq-synth-03.json', 0o000],
    ['unreadable equipment directory', 'equipment', 0o000],
    ['equipment directory without search permission', 'equipment', 0o600],
  ])('422 without the absolute path: %s', async (_name, target, mode) => {
    await register();
    await chmod(join(root, target), mode);
    try {
      const results = [await register(), await postWindow(await fixture('eq-synth-03.w1.batch.json'))];
      for (const result of results) {
        expect(result.status).toBe(422);
        expect(result.body.error).toContain('equipment');
        expect(JSON.stringify(result.body)).not.toContain(base);
      }
    } finally {
      await chmod(join(root, target), target === 'equipment' ? 0o755 : 0o644);
    }
  });

  it('keeps 404 for an unregistered id', async () => {
    expect((await postWindow(await fixture('eq-synth-03.w1.batch.json'))).status).toBe(404);
  });
});

describe('type dictionary needs a correctly named record', () => {
  it('422 when the only record with this maker/model is misnamed, writing nothing', async () => {
    await mkdir(join(root, 'equipment'));
    await writeFile(join(root, 'equipment/wrong-name.json'), await fixture('eq-synth-03.equipment.json'));
    const result = await putDictionary(await fixture('synth-maker-b.synth-wet.type-dictionary.json'));
    expect(result.status).toBe(422);
    expect(result.body.error).toContain('equipment/wrong-name.json');
    expect(await exists(join(root, 'onboarding'))).toBe(false);
  });
});
