import { resolve } from 'node:path';
import { ESLint } from 'eslint';
import { expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '..');

interface Variant {
  code: string;
  filePath: string;
  restricted: boolean;
}

async function lint(filePath: string, code: string): Promise<(string | null)[]> {
  const eslint = new ESLint({ cwd: repoRoot });
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.map((message) => message.ruleId) ?? [];
}

it.each<Variant>([
  {
    code: "import x from '@ap/kernel';",
    filePath: 'packages/core/src/x.ts',
    restricted: true,
  },
  {
    code: "import x from 'analytics-platform/menus';",
    filePath: 'packages/core/src/x.ts',
    restricted: true,
  },
  {
    code: "import x from '@ap/kernel';",
    filePath: 'packages/platform-adapter/src/x.ts',
    restricted: false,
  },
])('boundary: $code in $filePath', async ({ code, filePath, restricted }) => {
  const rules = await lint(filePath, code);
  if (restricted) {
    expect(rules).toContain('no-restricted-imports');
  } else {
    expect(rules).not.toContain('no-restricted-imports');
  }
});
