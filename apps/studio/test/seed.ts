import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { sampleWindowName } from '@eqv/core';

// vitest runs with cwd = apps/studio; import.meta.url is not a file URL under jsdom.
const repo = resolve(process.cwd(), '../..');

/** A temp assets root seeded with synthetic data: one template and the cluster-single onboarding files. */
export async function seedRoot(): Promise<{ base: string; root: string }> {
  const base = await mkdtemp(join(tmpdir(), 'eqv-studio-'));
  const root = join(base, 'assets');
  await mkdir(join(root, 'templates'), { recursive: true });
  await mkdir(join(root, 'primitives'), { recursive: true });
  await cp(join(repo, 'assets/templates/cluster-single.template.json'), join(root, 'templates/cluster-single.template.json'));
  await writeFile(join(root, 'primitives/note.txt'), 'not json');
  await cp(join(repo, 'fixtures/cluster-single/onboarding'), join(root, 'onboarding'), { recursive: true });
  await mkdir(join(root, 'layouts'), { recursive: true });
  await cp(join(repo, 'fixtures/cluster-single/layout.json'), join(root, 'layouts/eq-synth-01-layout.seed.json'));
  return { base, root };
}

/** `seedRoot` plus the published synthetic equipment `eq-synth-01` (its record and observations). */
export async function seedOnboardingRoot(): Promise<{ base: string; root: string }> {
  const seeded = await seedRoot();
  await addEquipment(seeded.root, 'eq-synth-01', { rename: (text) => text });
  return seeded;
}

export const record = (equipmentId: string, maker = 'synth-maker', model = 'synth-model') =>
  ({ schemaVersion: '0.4', equipmentId, maker, model });

export async function writeJson(root: string, path: string, value: unknown): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), JSON.stringify(value));
}

/** Writes `batch` as `equipmentId`'s Sample Window under its content name; returns the data-root-relative path. */
export async function addWindow(root: string, equipmentId: string, batch: unknown): Promise<string> {
  const path = `observations/${equipmentId}/windows/${await sampleWindowName(batch as Parameters<typeof sampleWindowName>[0])}.batch.json`;
  await writeJson(root, path, batch);
  return path;
}

/** The healthy cluster-single observations re-keyed to `equipmentId`; `rename` rewrites alias names in both files. */
export async function addEquipment(root: string, equipmentId: string, options: {
  maker?: string; model?: string; rename?: (text: string) => string; metadata?: boolean;
} = {}): Promise<void> {
  const rename = options.rename ?? ((text: string) => text);
  const rekey = async (file: string) => JSON.parse(rename(await readFile(join(repo, file), 'utf8')).replaceAll('"eq-synth-01"', JSON.stringify(equipmentId)));
  await writeJson(root, `equipment/${equipmentId}.json`, record(equipmentId, options.maker, options.model));
  await addWindow(root, equipmentId, await rekey('fixtures/cluster-single/occurrence-batch.json'));
  if (options.metadata !== false) {
    await writeJson(root, `observations/${equipmentId}/alias-metadata.json`, await rekey('fixtures/cluster-single/onboarding/alias-metadata.json'));
  }
}

const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` :
  value !== null && typeof value === 'object' ? `{${Object.entries(value).filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`).join(',')}}` :
  JSON.stringify(value);
export const signMapping = <T extends object>(body: T): T & { hash: string } =>
  ({ ...body, hash: `sha256:${createHash('sha256').update(canonical(body)).digest('hex')}` });

/** Publishes `equipmentId`: a properly hashed mapping, plus one binding to it. Returns the mapping hash. */
export async function publishEquipment(root: string, equipmentId: string): Promise<string> {
  const source = JSON.parse(await readFile(join(repo,
    'fixtures/cluster-single/onboarding/mappings/eq-synth-01/0abf3e9ff0b22cb0e7993bfe143461f44ef1b8828df2cdce8e25af3d02987aef.mapping.json'), 'utf8'));
  delete source.hash;
  const mapping = signMapping({ ...source, equipmentId });
  await writeJson(root, `onboarding/mappings/${equipmentId}/${mapping.hash.slice('sha256:'.length)}.mapping.json`, mapping);
  await writeJson(root, `onboarding/bindings/${equipmentId}.bindings.json`, { schemaVersion: '0.4', equipmentId,
    bindings: [{ layoutId: mapping.layoutId, mappingHash: mapping.hash, effectiveFrom: '2026-01-01T09:00:00.000' }] });
  return mapping.hash;
}

/** Writes the synthetic cluster-single layout as `layoutId`'s draft (kind equipment-layout, id = layoutId). */
export async function writeDraft(root: string, layoutId: string): Promise<void> {
  const layout = JSON.parse(await readFile(join(repo, 'fixtures/cluster-single/layout.json'), 'utf8'));
  await writeJson(root, `layouts/${layoutId}/draft.layout.json`, { ...layout, id: layoutId });
}
