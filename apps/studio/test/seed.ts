import { cp, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

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
