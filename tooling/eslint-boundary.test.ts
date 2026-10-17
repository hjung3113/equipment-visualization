import { resolve } from 'node:path';
import { ESLint } from 'eslint';
import { beforeAll, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '..');

// ADR-0001 boundary: firing any of these in a restricted package is a defect.
const BOUNDARY_RULES = [
  'no-restricted-imports',
  'no-restricted-syntax',
  '@typescript-eslint/no-require-imports',
] as const;

type BoundaryRule = (typeof BOUNDARY_RULES)[number];

interface Variant {
  code: string;
  filePath: string;
  /** Expected firing boundary rule; null when none may fire. */
  rule: BoundaryRule | null;
}

const eslint = new ESLint({ cwd: repoRoot });

// The first lint loads the config and the TypeScript parser; under a loaded gate that alone passed 5 s (#75).
beforeAll(async () => {
  await eslint.lintText('', { filePath: 'packages/core/src/x.ts' });
}, 30_000);

async function lint(filePath: string, code: string): Promise<(string | null)[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.map((message) => message.ruleId) ?? [];
}

it.each<Variant>([
  {
    code: "import x from '@ap/kernel';",
    filePath: 'packages/core/src/x.ts',
    rule: 'no-restricted-imports',
  },
  {
    code: "import x from 'analytics-platform/menus';",
    filePath: 'packages/core/src/x.ts',
    rule: 'no-restricted-imports',
  },
  {
    code: "export { x } from '@ap/kernel';",
    filePath: 'packages/core/src/x.ts',
    rule: 'no-restricted-imports',
  },
  {
    code: "export { x } from 'analytics-platform/menus';",
    filePath: 'packages/core/src/x.ts',
    rule: 'no-restricted-imports',
  },
  {
    code: "export * from '@ap/kernel';",
    filePath: 'packages/core/src/x.ts',
    rule: 'no-restricted-imports',
  },
  {
    code: "export * from 'analytics-platform/menus';",
    filePath: 'packages/core/src/x.ts',
    rule: 'no-restricted-imports',
  },
  {
    code: "export const dep = await import('@ap/kernel');",
    filePath: 'packages/core/src/x.ts',
    rule: 'no-restricted-syntax',
  },
  {
    code: "export const dep = await import('analytics-platform/menus');",
    filePath: 'packages/core/src/x.ts',
    rule: 'no-restricted-syntax',
  },
  {
    code: "export type Dep = import('@ap/kernel').Dep;",
    filePath: 'packages/core/src/x.ts',
    rule: 'no-restricted-syntax',
  },
  {
    code: "export type Dep = import('analytics-platform/menus').Dep;",
    filePath: 'packages/core/src/x.ts',
    rule: 'no-restricted-syntax',
  },
  {
    code: "const x = require('@ap/kernel');",
    filePath: 'packages/core/src/x.ts',
    rule: '@typescript-eslint/no-require-imports',
  },
  {
    code: "import x from '@ap/kernel';",
    filePath: 'packages/platform-adapter/src/x.ts',
    rule: null,
  },
  {
    code: "export const dep = await import('@ap/kernel');",
    filePath: 'packages/platform-adapter/src/x.ts',
    rule: null,
  },
  {
    code: "export type Dep = import('@ap/kernel').Dep;",
    filePath: 'packages/platform-adapter/src/x.ts',
    rule: null,
  },
  {
    code: "import { Button } from '@fops/ui';",
    filePath: 'packages/core/src/x.ts',
    rule: 'no-restricted-imports',
  },
  {
    code: "export const dep = await import('@fops/ui');",
    filePath: 'packages/renderer/src/x.ts',
    rule: 'no-restricted-syntax',
  },
  {
    code: "export type T = import('@fops/ui').ButtonProps;",
    filePath: 'packages/renderer/src/x.ts',
    rule: 'no-restricted-syntax',
  },
  {
    // Guards the flat-config override: the core/renderer block must keep the @ap rule.
    code: "import x from '@ap/kernel';",
    filePath: 'packages/renderer/src/x.ts',
    rule: 'no-restricted-imports',
  },
  {
    code: "import { Button } from '@fops/ui';",
    filePath: 'packages/replay/src/x.tsx',
    rule: null,
  },
  {
    code: "import { Button } from '@fops/ui';",
    filePath: 'apps/studio/src/x.tsx',
    rule: null,
  },
  {
    code: "import { DataTable } from '@eqv/ui';",
    filePath: 'packages/core/src/x.ts',
    rule: 'no-restricted-imports',
  },
  {
    code: "export const dep = await import('@eqv/ui');",
    filePath: 'packages/renderer/src/x.ts',
    rule: 'no-restricted-syntax',
  },
  {
    code: "import { DataTable } from '@eqv/ui';",
    filePath: 'packages/replay/src/x.tsx',
    rule: null,
  },
  {
    // Negative control: the boundary pattern must not over-match.
    code: "import x from 'apple'; import('@apx/kernel');",
    filePath: 'packages/core/src/x.ts',
    rule: null,
  },
])('boundary: $code in $filePath', async ({ code, filePath, rule }) => {
  const messages = await lint(filePath, code);
  const fired = messages.filter(
    (id): id is BoundaryRule => id !== null && (BOUNDARY_RULES as readonly string[]).includes(id),
  );
  expect(fired).toEqual(rule === null ? [] : [rule]);
});
