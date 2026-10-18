import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { replayKey, type Occurrence, type OccurrenceBatch } from '@eqv/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadFocus } from '../src/focus-data.js';
import { loadEquipment, loadOnboarding } from '../src/onboarding-data.js';
import { createFileApi } from '../server/files.js';
import { addEquipment, addWindow, record, seedRoot, writeDraft, writeJson } from './seed.js';

const repo = resolve(process.cwd(), '../..');
const fixture = async (file: string) => JSON.parse(await readFile(join(repo, file), 'utf8'));
let base: string;
let root: string;
let w1: { batch: OccurrenceBatch; path: string; hex: string };
let w2: { batch: OccurrenceBatch; path: string; hex: string };

const place = async (batch: OccurrenceBatch) => {
  const path = await addWindow(root, 'eq-synth-03', batch);
  return { batch, path, hex: path.slice(-'.batch.json'.length - 64, -'.batch.json'.length) };
};

beforeEach(async () => {
  ({ base, root } = await seedRoot());
  const api = createFileApi({ root });
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const result = await api.handle({ method: init?.method ?? 'GET', url: input, headers: {}, body: String(init?.body ?? '') });
    return new Response(JSON.stringify(result.body), { status: result.status });
  });
  await writeJson(root, 'equipment/eq-synth-03.json', await fixture('fixtures/import/eq-synth-03.equipment.json'));
  await writeJson(root, 'observations/eq-synth-03/alias-metadata.json', await fixture('fixtures/import/eq-synth-03.alias-metadata.json'));
  w1 = await place((await fixture('fixtures/import/eq-synth-03.w1.batch.json')) as OccurrenceBatch);
  w2 = await place((await fixture('fixtures/import/eq-synth-03.w2.batch.json')) as OccurrenceBatch);
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(base, { recursive: true, force: true });
});

const aliases = (load: Awaited<ReturnType<typeof loadEquipment>>) =>
  load.kind === 'ok' ? load.data.inventory.aliases.map(({ alias }) => alias) : [];

describe('selection', () => {
  it('selects the latest-from window by default and lists windows by from', async () => {
    const load = await loadEquipment('eq-synth-03');
    if (load.kind !== 'ok') throw new Error(JSON.stringify(load));
    expect(load.data.selectedWindow.path).toBe(w2.path);
    expect(load.data.windows.map(({ path }) => path)).toEqual([w1.path, w2.path]);
    expect(load.data.batch).toEqual(w2.batch);
    expect(aliases(load)).toContain('WC4');
  });

  it('selects the window a hex names and builds its Inventory', async () => {
    const load = await loadEquipment('eq-synth-03', { window: w1.hex });
    if (load.kind !== 'ok') throw new Error(JSON.stringify(load));
    expect(load.data.selectedWindow.path).toBe(w1.path);
    expect(aliases(load)).not.toContain('WC4');
  });

  it.each([
    ['64 zeros', () => '0'.repeat(64)],
    ['uppercase hex', () => w1.hex.toUpperCase()],
    ['sha256: prefix', () => `sha256:${w1.hex}`],
    ['garbage', () => 'x'],
  ])('reports an unknown window (%s) as an error, never another window', async (_label, value) => {
    const load = await loadEquipment('eq-synth-03', { window: value() });
    expect(load).toMatchObject({ kind: 'error', error: expect.stringMatching(/Sample Window .+없습니다/) });
  });

  it('passes evidence through unchanged', async () => {
    const load = await loadOnboarding('eq-synth-03', { window: w1.hex });
    if (load.kind !== 'ok') throw new Error(JSON.stringify(load));
    expect(load.data.batch).toEqual(w1.batch);
    expect(load.data.batch.issues).toHaveLength(2);
    expect(load.data.batch.occurrences.filter((o: Occurrence) => o.end === null)).toHaveLength(1);
    expect(load.data.batch.occurrences.flatMap((o: Occurrence) => [o.start, o.end]).filter((b) => b?.at === null)).toHaveLength(1);
  });
});

describe('listing and read errors', () => {
  const dir = 'observations/eq-synth-03/windows';
  const range = (from: string, to: string, hex: string) => `${from}_${to}_${hex}.batch.json`;
  it.each<[string, () => Promise<{ window?: string; paths: string[] }>]>([
    ['content changed, name kept', async () => {
      const text = (await readFile(join(root, w1.path), 'utf8')).replace('"WC1"', '"WCX"');
      await writeFile(join(root, w1.path), text);
      return { window: w1.hex, paths: [w1.path] };
    }],
    ['a stray json entry', async () => {
      await writeJson(root, `${dir}/notes.json`, {});
      return { paths: [`${dir}/notes.json`] };
    }],
    ['a directory', async () => {
      await mkdir(join(root, dir, 'sub'));
      await writeFile(join(root, dir, 'sub/x.json'), '{}');
      return { paths: [`${dir}/sub`] };
    }],
    ['an uppercase-hex name', async () => {
      const name = range('20260101T110000.000', '20260101T113000.000', w1.hex.toUpperCase());
      await writeJson(root, `${dir}/${name}`, w1.batch);
      return { paths: [`${dir}/${name}`] };
    }],
    ['an overlapping name', async () => {
      const name = range('20260101T102000.000', '20260101T104000.000', w1.hex);
      await writeJson(root, `${dir}/${name}`, w1.batch);
      return { paths: [`${dir}/${name}`, w1.path] };
    }],
    ['windows as a regular file', async () => {
      await rm(join(root, dir), { recursive: true, force: true });
      await writeFile(join(root, dir), 'x');
      return { paths: [dir] };
    }],
    ['another equipment in the file', async () => {
      await writeFile(join(root, w1.path), (await readFile(join(root, w1.path), 'utf8')).replaceAll('"eq-synth-03"', '"eq-other"'));
      return { window: w1.hex, paths: [w1.path] };
    }],
  ])('%s is an error naming the path', async (label, setup) => {
    const { window, paths } = await setup();
    const load = await loadEquipment('eq-synth-03', window === undefined ? {} : { window });
    expect(load.kind).toBe('error');
    for (const path of paths) expect(load).toMatchObject({ error: expect.stringContaining(path) });
    if (label === 'another equipment in the file') expect(await loadEquipment('eq-synth-03')).toMatchObject({ kind: 'ok' });
  });
});

describe('no observations', () => {
  it.each(['no windows dir', 'empty windows dir'])('%s gives no-observations with the record', async (label) => {
    await writeJson(root, 'equipment/eq-nodata.json', record('eq-nodata'));
    if (label === 'empty windows dir') await mkdir(join(root, 'observations/eq-nodata/windows'), { recursive: true });
    expect(await loadEquipment('eq-nodata')).toEqual({ kind: 'no-observations', record: record('eq-nodata') });
    expect(await loadFocus('eq-nodata')).toEqual({ kind: 'no-observations', record: record('eq-nodata') });
  });
});

describe('Focus anchor', () => {
  const NOTICE = /Sample Window 2개에 있어/;
  const pick = async (options: Parameters<typeof loadFocus>[1]) => {
    const load = await loadFocus('eq-synth-03', options);
    if (load.kind !== 'ok') throw new Error(JSON.stringify(load));
    return load;
  };
  it('plays the latest window containing a shared anchor and says so', async () => {
    const load = await pick({ anchor: 'occ-carrier-window-boundary' });
    expect(load.batch).toEqual(w2.batch);
    expect(load.notices.some((n) => NOTICE.test(n))).toBe(true);
  });
  it.each([
    ['an anchor only in w1', 'occ-w1-wc1-inverted', () => w1.batch],
    ['an unknown anchor', 'occ-nope', () => w2.batch],
  ])('%s', async (_label, anchor, expected) => {
    const load = await pick({ anchor });
    expect(load.batch).toEqual(expected());
    expect(load.notices.some((n) => NOTICE.test(n))).toBe(false);
  });
  it('lets window win over anchor', async () => {
    expect((await pick({ window: w1.hex, anchor: 'occ-carrier-window-boundary' })).batch).toEqual(w1.batch);
  });
  it('fails on a corrupt window while scanning, naming its path', async () => {
    await writeFile(join(root, w1.path), (await readFile(join(root, w1.path), 'utf8')).replace('"WC1"', '"WCX"'));
    expect(await loadFocus('eq-synth-03', { anchor: 'occ-carrier-window-boundary' }))
      .toMatchObject({ kind: 'error', record: record('eq-synth-03', 'synth-maker-b', 'synth-wet'), error: expect.stringContaining(w1.path) });
  });
});

it('keeps the eq-synth-01 observation hash after the move', async () => {
  await addEquipment(root, 'eq-synth-01');
  await writeDraft(root, 'eq-synth-01-layout');
  const load = await loadFocus('eq-synth-01');
  if (load.kind !== 'ok') throw new Error(JSON.stringify(load));
  const original = await fixture('fixtures/cluster-single/occurrence-batch.json');
  expect(load.batch).toEqual(original);
  const bindings = { schemaVersion: '0.4' as const, equipmentId: 'eq-synth-01', bindings: [] };
  expect((await replayKey({ batch: load.batch, layouts: [], bindings, mappings: [] }, load.batch.from)).observationHash)
    .toBe('sha256:23e9e214b396bfaa4539e7b30c5f8f9163fbac6c50201430231f641ff7c822ba');
});
