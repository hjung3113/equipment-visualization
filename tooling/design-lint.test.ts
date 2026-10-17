import { resolve } from 'node:path';
import { ESLint } from 'eslint';
import { beforeAll, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '..');
const eslint = new ESLint({ cwd: repoRoot });

// The first lint loads the config, the TypeScript parser and the Tailwind theme (#75).
beforeAll(async () => {
  await eslint.lintText('', { filePath: 'packages/replay/src/x.tsx' });
}, 30_000);

async function shadcnRules(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).flatMap((m) => (m.ruleId?.startsWith('shadcn/') ? [m.ruleId] : []));
}

// ADR-0008: DOM UI packages follow the @fops/ui design-system rules; core and renderer are out of scope.
it.each([
  ['packages/replay/src/x.tsx', 'export const X = () => <div style={{ color: "red" }} />;', ['shadcn/no-inline-styles']],
  ['packages/editor/src/x.tsx', 'export const X = () => <div className="bg-red-500" />;', ['shadcn/no-raw-colors']],
  ['apps/studio/src/x.tsx', 'export const X = () => <div className="eqv-made-up" />;', ['shadcn/no-unknown-classes']],
  ['apps/studio/src/x.tsx', 'export const X = () => <div className="flex gap-2 text-text-secondary" />;', []],
  [
    'packages/replay/src/x.tsx',
    'import { Button } from "@fops/ui"; export const X = () => <Button className="bg-surface-card">x</Button>;',
    ['shadcn/no-restyle'],
  ],
  ['packages/editor/src/x.tsx', 'export const X = () => <div className="p-[13px]" />;', ['shadcn/no-arbitrary-values']],
  [
    'apps/studio/src/x.tsx',
    'import { Button } from "@fops/ui"; export const X = ({ c }: { c: string }) => <Button className={`mt-${c}`}>x</Button>;',
    ['shadcn/require-static-classes'],
  ],
  ['packages/renderer/src/x.tsx', 'export const X = () => <div style={{ color: "red" }} />;', []],
])('%s: %s', async (filePath, code, expected) => {
  expect(await shadcnRules(filePath, code)).toEqual(expected);
});
