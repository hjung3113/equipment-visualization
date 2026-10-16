import { mkdir, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { layoutDocumentSchema, layoutRevision } from '@eqv/core';
import { createFileApi } from '../server/files.js';
import { seedRoot } from './seed.js';

let base: string;
let root: string;
let api: ReturnType<typeof createFileApi>;
beforeEach(async () => {
  ({ base, root } = await seedRoot());
  api = createFileApi({ root });
});
afterEach(() => rm(base, { recursive: true, force: true }));

const JSON_TYPE = { 'content-type': 'application/json' };
const url = (endpoint: string, query: Record<string, string>) => `${endpoint}?${new URLSearchParams(query)}`;
const get = (query: Record<string, string>) => api.handle({ method: 'GET', url: url('/api/files', query), headers: {}, body: '' });
const put = (path: string, body: unknown, headers: Record<string, string> = JSON_TYPE) =>
  api.handle({ method: 'PUT', url: url('/api/files', { path }), headers, body: typeof body === 'string' ? body : JSON.stringify(body) });
const publish = (body: unknown) =>
  api.handle({ method: 'POST', url: '/api/layout-revisions', headers: JSON_TYPE, body: JSON.stringify(body) });
const readJson = async (path: string): Promise<{ id: string } & Record<string, unknown>> => JSON.parse(await readFile(join(root, path), 'utf8'));
const exists = (path: string) => stat(path).then(() => true, () => false);

const template = () => readJson('templates/cluster-single.template.json');
const fixtureLayout = () => readJson('layouts/eq-synth-01-layout.seed.json');
const fixturePath = (relative: string) => `onboarding/${relative}`;

it('round-trips a draft as 2-space JSON plus a newline', async () => {
  const layout = await template();
  const path = 'layouts/cluster-single/draft.layout.json';
  expect((await put(path, layout)).status).toBe(201);
  expect((await put(path, layout)).status).toBe(200);
  expect(await readFile(join(root, path), 'utf8')).toBe(`${JSON.stringify(layout, null, 2)}\n`);
  expect(await get({ path })).toEqual({ status: 200, body: layout });
});

it.each([
  { name: 'parent traversal', path: '../x.json' },
  { name: 'absolute path', path: '/etc/x.json' },
  { name: 'nested traversal', path: 'layouts/../../x.json' },
  { name: 'backslash', path: 'layouts\\a.json' },
  { name: 'symlink to an outside dir', path: 'layouts/cluster-single/draft.layout.json' },
])('refuses an unsafe path: $name', async ({ path }) => {
  await mkdir(join(base, 'outside'));
  const outsideFile = join(base, 'outside/draft.layout.json');
  const outsideContent = '{"outside":true}\n';
  await writeFile(outsideFile, outsideContent);
  await symlink(join(base, 'outside'), join(root, 'layouts/cluster-single'));
  const read = await get({ path });
  const write = await put(path, await template());
  const status = path === 'layouts/cluster-single/draft.layout.json' ? 403 : 400;
  expect(read.status).toBe(status);
  expect(write.status).toBe(status);
  expect(await readdir(base)).toEqual(['assets', 'outside']);
  expect(await readdir(join(base, 'outside'))).toEqual(['draft.layout.json']);
  expect(await readFile(outsideFile, 'utf8')).toBe(outsideContent);
  expect(await exists(join(base, 'x.json'))).toBe(false);
});

it.each([
  { name: 'template', path: 'templates/cluster-single.template.json' },
  { name: 'primitive', path: 'primitives/x.json' },
  { name: 'unknown layouts file', path: 'layouts/a/other.json' },
])('refuses a write outside the patterns: $name', async ({ path }) => {
  const before = await readJson('templates/cluster-single.template.json');
  const response = await put(path, await template());
  expect(response.status).toBe(403);
  if (!path.startsWith('templates')) expect(await exists(join(root, path))).toBe(false);
  expect(await readJson('templates/cluster-single.template.json')).toEqual(before);
});

it('refuses a draft write through a symlinked layout folder', async () => {
  await symlink(join(root, 'templates'), join(root, 'layouts/cluster-single'));
  const before = await readdir(join(root, 'templates'));
  const response = await put('layouts/cluster-single/draft.layout.json', await template());
  expect(response.status).toBe(403);
  expect(await readdir(join(root, 'templates'))).toEqual(before);
});

it('reads a template and lists the root and a folder', async () => {
  expect(await get({ path: 'templates/cluster-single.template.json' })).toEqual({ status: 200, body: await template() });
  expect((await get({ dir: '' })).body).toEqual({ entries: [
    { name: 'layouts', kind: 'dir' }, { name: 'onboarding', kind: 'dir' },
    { name: 'primitives', kind: 'dir' }, { name: 'templates', kind: 'dir' },
  ] });
  expect((await get({ dir: 'templates' })).body).toEqual({ entries: [{ name: 'cluster-single.template.json', kind: 'file' }] });
  expect((await get({ dir: 'nope' })).status).toBe(404);
});

it.each([
  { name: 'an invalid layout', path: 'layouts/cluster-single/draft.layout.json', body: { kind: 'template' } },
  { name: 'an id that differs from the folder', path: 'layouts/other-id/draft.layout.json', body: null },
  { name: 'an alias-rules scope that differs from the path',
    path: 'onboarding/scopes/equipment/eq-other/alias-rules.json', body: 'alias' },
])('rejects $name and writes nothing', async ({ path, body }) => {
  const value = body === 'alias' ? await readJson(fixturePath('scopes/equipment/eq-synth-01/alias-rules.json'))
    : body ?? await template();
  const response = await put(path, value);
  expect(response.status).toBe(400);
  expect(await exists(join(root, path))).toBe(false);
});

it('publishes an immutable revision named by its content hash', async () => {
  const layout = await fixtureLayout();
  const revision = await layoutRevision(layoutDocumentSchema.parse(layout));
  const path = `layouts/${layout.id}/${revision.slice('sha256:'.length)}.layout.json`;
  expect(await publish(layout)).toEqual({ status: 201, body: { path, revision } });
  expect((await publish(layout)).status).toBe(200);
  expect((await put(path, layout)).status).toBe(403);

  await writeFile(join(root, path), '{"different":true}\n');
  expect((await publish(layout)).status).toBe(409);
  expect(await readFile(join(root, path), 'utf8')).toBe('{"different":true}\n');

  const negativeZeroBody = JSON.stringify({ ...layout, id: 'negative-zero-layout' }).replace(/"x":-?\d+(?:\.\d+)?/, '"x":-0');
  const negativeZeroRequest = {
    method: 'POST', url: '/api/layout-revisions', headers: JSON_TYPE, body: negativeZeroBody,
  };
  expect((await api.handle(negativeZeroRequest)).status).toBe(201);
  expect((await api.handle(negativeZeroRequest)).status).toBe(200);
});

it('writes a mapping only at the path of its own hash', async () => {
  const dir = 'onboarding/mappings/eq-synth-01';
  const [file] = await readdir(join(root, dir));
  const mapping = await readJson(`${dir}/${file}`);
  await rm(join(root, dir), { recursive: true });
  expect(await put(`${dir}/${file}`, mapping)).toEqual({ status: 201, body: { path: `${dir}/${file}`, created: true } });
  expect((await put(`${dir}/${file}`, mapping)).status).toBe(200);
  const wrong = `${dir}/${'0'.repeat(64)}.mapping.json`;
  expect((await put(wrong, mapping)).status).toBe(400);
  expect(await exists(join(root, wrong))).toBe(false);
});

it('writes a baseline Inventory immutably at a hex path of its own equipment', async () => {
  const mappings = await readdir(join(root, 'onboarding/mappings/eq-synth-01'));
  const hex = mappings[0]!.replace('.mapping.json', '');
  const dir = 'onboarding/baselines/eq-synth-01';
  const inventory = { equipmentId: 'eq-synth-01', from: '2026-01-01T10:00:00.000', to: '2026-01-01T10:30:00.000', aliases: [], transfers: [] };
  expect(await put(`${dir}/${hex}.inventory.json`, inventory)).toEqual({ status: 201, body: { path: `${dir}/${hex}.inventory.json`, created: true } });
  expect((await put(`${dir}/${hex}.inventory.json`, inventory)).status).toBe(200);
  expect((await put(`${dir}/${hex}.inventory.json`, { ...inventory, to: '2026-01-01T11:00:00.000' })).status).toBe(409);
  expect((await put(`${dir}/${'b'.repeat(64)}.inventory.json`, { ...inventory, equipmentId: 'eq-other' })).status).toBe(400);
  expect((await put(`${dir}/${'c'.repeat(64)}.inventory.json`, { ...inventory, aliases: 'x' })).status).toBe(400);
  expect((await put(`${dir}/not-hex.inventory.json`, inventory)).status).toBe(403);
  expect(await readJson(`${dir}/${hex}.inventory.json`)).toEqual(inventory);
});

it('rejects a non-JSON content type', async () => {
  const response = await put('layouts/cluster-single/draft.layout.json', await template(), { 'content-type': 'text/plain' });
  expect(response.status).toBe(415);
});

const CREATE_ONLY = { ...JSON_TYPE, 'If-None-Match': '*' };
it('creates a mutable file only when absent under If-None-Match: *, and a plain PUT still overwrites', async () => {
  const layout = await template();
  const path = 'layouts/cluster-single/draft.layout.json';
  expect((await put(path, layout, CREATE_ONLY)).status).toBe(201);
  const before = await readFile(join(root, path), 'utf8');
  const changed = { ...layout, name: 'Renamed' };
  const refused = await put(path, changed, CREATE_ONLY);
  expect(refused.status).toBe(412);
  expect(refused.body).toEqual({ error: expect.any(String) });
  expect(await readFile(join(root, path), 'utf8')).toBe(before);
  expect((await put(path, changed)).status).toBe(200);
  expect(await readJson(path)).toMatchObject({ name: 'Renamed' });
});

it('still validates a create-only write', async () => {
  const layout = await template();
  expect((await put('layouts/other/draft.layout.json', layout, CREATE_ONLY)).status).toBe(400);
  expect(await exists(join(root, 'layouts/other/draft.layout.json'))).toBe(false);
});


it('refuses a baseline without a matching Mapping Version and leaves no file', async () => {
  const path = `onboarding/baselines/eq-synth-01/${'0'.repeat(64)}.inventory.json`;
  const inventory = { equipmentId: 'eq-synth-01', from: '2026-01-01T10:00:00.000', to: '2026-01-01T10:30:00.000', aliases: [], transfers: [] };
  expect(await put(path, inventory)).toEqual({ status: 409, body: { error: 'Mapping Version이 없습니다' } });
  expect(await exists(join(root, path))).toBe(false);
});
