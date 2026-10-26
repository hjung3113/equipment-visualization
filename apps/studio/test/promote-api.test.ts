import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { symlink } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { layoutRevision, promoteLayout, validateLayout, type EquipmentLayoutDocument } from '@eqv/core';
import { createFileApi } from '../server/files.js';
import { writeJson } from './seed.js';

const realRepo = resolve(process.cwd(), '../..');
const JSON_TYPE = { 'content-type': 'application/json' };
const LAYOUT_ID = 'promo-layout';

let base: string;
let repo: string;
let root: string;
let api: ReturnType<typeof createFileApi>;
interface Body { error: string; path: string; templateId: string; entries: { name: string }[]; catalog: string;
  templates: { source: string; file: string; document: { id: string } }[]; skipped: string[]; shadowed: string[] }
const send = async (target: ReturnType<typeof createFileApi>, method: string, url: string, body: unknown = '') =>
  (await target.handle({ method, url, headers: JSON_TYPE, body: typeof body === 'string' ? body : JSON.stringify(body) })) as { status: number; body: Body };
const promote = (body: Record<string, unknown>, target = api) => send(target, 'POST', '/api/template-promotions', body);
const exists = (path: string) => readFile(path).then(() => true, () => false);
const snapshot = (dir: string) => readdir(dir, { recursive: true });

const fixture = async (): Promise<EquipmentLayoutDocument> =>
  ({ ...JSON.parse(await readFile(join(realRepo, 'fixtures/cluster-single/layout.json'), 'utf8')), id: LAYOUT_ID });
/** Publishes the fixture layout (optionally edited) into the data root; returns its 64-hex revision. */
const publish = async (edit: (layout: EquipmentLayoutDocument) => void = () => undefined): Promise<string> => {
  const layout = await fixture();
  edit(layout);
  const result = await send(api, 'POST', '/api/layout-revisions', layout);
  expect(result.status).toBe(201);
  return result.body.path.split('/')[2]!.slice(0, 64);
};
const request = (revision: string, templateId = 'promoted-one') => ({ layoutId: LAYOUT_ID, revision, templateId, name: 'Promoted One' });

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'eqv-promote-'));
  repo = join(base, 'repo');
  root = join(base, 'data');
  await mkdir(join(repo, 'assets/templates'), { recursive: true });
  await mkdir(root);
  await cp(join(realRepo, 'assets/templates/cluster-single.template.json'), join(repo, 'assets/templates/cluster-single.template.json'));
  api = createFileApi({ root, repoRoot: repo });
});
afterEach(() => rm(base, { recursive: true, force: true }));

describe('POST /api/template-promotions', () => {
  it('writes the promoted Template create-only into the data root and serves it in the union catalog', async () => {
    const revision = await publish();
    const result = await promote(request(revision));
    expect(result).toEqual({ status: 201, body: { path: 'templates/promoted-one.template.json', templateId: 'promoted-one' } });
    const stored = JSON.parse(await readFile(join(root, result.body.path), 'utf8'));
    const layout = await fixture();
    expect(stored).toEqual(promoteLayout(layout, { templateId: 'promoted-one', name: 'Promoted One', layoutRevision: `sha256:${revision}` }));
    expect(validateLayout(stored).ok).toBe(true);
    expect(`sha256:${revision}`).toBe(await layoutRevision(layout));
    expect((await send(api, 'GET', '/api/templates')).body.templates.map(({ file }) => file))
      .toEqual(['cluster-single.template.json', 'promoted-one.template.json']);
    expect((await send(api, 'GET', `/api/files?path=templates/promoted-one.template.json`)).body).toEqual(stored);
    expect(await snapshot(join(repo, 'assets/templates'))).toEqual(['cluster-single.template.json']);
  });

  it('refuses when the data root is inside the repository, writing nothing', async () => {
    const inside = join(repo, 'assets');
    const before = await snapshot(inside);
    const result = await promote(request('a'.repeat(64)), createFileApi({ root: inside, repoRoot: repo }));
    expect(result).toEqual({ status: 403, body: { error: '저장소 밖 경로를 EQV_STUDIO_ASSETS로 지정하세요' } });
    expect(await snapshot(inside)).toEqual(before);
  });

  it('keeps PUT /api/files on templates/** forbidden', async () => {
    const result = await api.handle({ method: 'PUT', url: '/api/files?path=templates/x.template.json', headers: JSON_TYPE, body: '{}' });
    expect(result.status).toBe(403);
  });

  it.each([
    ['not a layout id', { layoutId: 'Bad_Id' }],
    ['not a revision hex', { revision: 'abc' }],
    ['not a template id', { templateId: 'Bad_Id' }],
    ['an empty name', { name: ' ' }],
  ])('400 for a body field that is %s', async (_name, patch) => {
    const result = await promote({ ...request('a'.repeat(64)), ...patch });
    expect(result.status).toBe(400);
    expect(await exists(join(root, 'templates'))).toBe(false);
  });

  it('404 when the Layout Revision is absent', async () => {
    expect((await promote(request('a'.repeat(64)))).status).toBe(404);
  });

  it.each([
    ['a file name that is not its content hash', async () => {
      const layout = await fixture();
      const wrong = 'b'.repeat(64);
      await writeJson(root, `layouts/${LAYOUT_ID}/${wrong}.layout.json`, layout);
      return wrong;
    }],
    ['a folder that is not the layout id', async () => {
      const layout = { ...(await fixture()), id: 'other-layout' };
      const hex = (await layoutRevision(layout)).slice('sha256:'.length);
      await writeJson(root, `layouts/${LAYOUT_ID}/${hex}.layout.json`, layout);
      return hex;
    }],
    ['an invalid layout', async () => {
      const layout = { ...(await fixture()), components: [] };
      const hex = 'c'.repeat(64);
      await writeJson(root, `layouts/${LAYOUT_ID}/${hex}.layout.json`, layout);
      return hex;
    }],
  ])('422 for %s, writing nothing', async (_name, seed) => {
    const result = await promote(request(await seed()));
    expect(result.status).toBe(422);
    expect(await exists(join(root, 'templates'))).toBe(false);
  });

  it('409 for an existing data-root id, also under another file name, and for a bundled id', async () => {
    const revision = await publish();
    expect((await promote(request(revision))).status).toBe(201);
    expect((await promote(request(revision))).status).toBe(409);
    const stored = JSON.parse(await readFile(join(root, 'templates/promoted-one.template.json'), 'utf8'));
    await writeJson(root, 'templates/renamed.template.json', { ...stored, id: 'other-one' });
    const sameId = await promote(request(revision, 'other-one'));
    expect(sameId).toEqual({ status: 409, body: { error: '같은 id의 Template이 이미 있습니다' } });
    expect((await promote(request(revision, 'cluster-single'))).status).toBe(409);
    expect((await readdir(join(root, 'templates'))).sort()).toEqual(['promoted-one.template.json', 'renamed.template.json']);
  });
});

describe('GET /api/templates', () => {
  it('lists the union, separating unparsable files from files shadowed by the bundle', async () => {
    const revision = await publish();
    await promote(request(revision));
    const bundled = JSON.parse(await readFile(join(repo, 'assets/templates/cluster-single.template.json'), 'utf8'));
    await writeJson(root, 'templates/same-id.template.json', { ...bundled, kind: 'template' });
    await writeJson(root, 'templates/cluster-single.template.json', { ...bundled, id: 'different-id' });
    await writeFile(join(root, 'templates/broken.template.json'), '{not json');
    const result = await send(api, 'GET', '/api/templates');
    expect(result.status).toBe(200);
    expect(result.body.templates.map(({ source, file }) => [source, file])).toEqual([
      ['bundled', 'cluster-single.template.json'], ['data-root', 'promoted-one.template.json'],
    ]);
    expect(result.body.shadowed).toEqual(['cluster-single.template.json', 'same-id.template.json']);
    expect(result.body.skipped).toEqual(['broken.template.json']);
  });

  it('reads the data root templates/ as the whole catalog without a repository root', async () => {
    await writeJson(root, 'templates/only.template.json', JSON.parse(await readFile(join(repo, 'assets/templates/cluster-single.template.json'), 'utf8')));
    const result = await send(createFileApi({ root }), 'GET', '/api/templates');
    expect(result.body.templates.map(({ file }) => file)).toEqual(['only.template.json']);
  });

  it.each([['with a repository root', true], ['without a repository root', false]])(
    'does not read a data-root catalog that escapes the data root (%s)', async (_label, withRepo) => {
      const template = JSON.parse(await readFile(join(repo, 'assets/templates/cluster-single.template.json'), 'utf8'));
      const outside = join(base, 'outside');
      await mkdir(outside);
      await writeJson(outside, 'leaked.template.json', { ...template, id: 'leaked' });
      const target = createFileApi(withRepo ? { root, repoRoot: repo } : { root });
      const names = (result: { body: Body }) => JSON.stringify(result.body);

      await symlink(outside, join(root, 'templates'));
      const dirListing = await send(target, 'GET', '/api/files?dir=templates');
      const fileRead = await send(target, 'GET', '/api/files?path=templates/leaked.template.json');
      expect((await send(target, 'GET', '/api/templates')).body.templates.map(({ file }) => file)).toEqual(withRepo ? ['cluster-single.template.json'] : []);
      expect(names(dirListing)).not.toContain('leaked');
      expect(names(fileRead)).not.toContain('leaked');
      expect(fileRead.status).not.toBe(200);

      // A symlinked child file pointing outside the real templates/ folder is excluded too.
      await rm(join(root, 'templates'));
      await mkdir(join(root, 'templates'));
      await symlink(join(outside, 'leaked.template.json'), join(root, 'templates/leaked.template.json'));
      expect((await send(target, 'GET', '/api/templates')).body.templates.map(({ document }) => document.id)).not.toContain('leaked');
      expect(names(await send(target, 'GET', '/api/files?dir=templates'))).not.toContain('leaked');
    },
  );

  it('reads the bundle first for a name both folders have', async () => {
    const bundled = JSON.parse(await readFile(join(repo, 'assets/templates/cluster-single.template.json'), 'utf8'));
    await writeJson(root, 'templates/cluster-single.template.json', { ...bundled, id: 'different-id' });
    expect((await send(api, 'GET', '/api/files?path=templates/cluster-single.template.json')).body).toEqual(bundled);
  });
});
