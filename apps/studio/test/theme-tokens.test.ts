import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

const studioCss = readFileSync(resolve(import.meta.dirname, '../src/studio.css'), 'utf8');

it('imports in the ADR-0008 consumer order', () => {
  const imports = [...studioCss.matchAll(/^@import\s+(.+?);/gm)].map((m) => m[1]);
  expect(imports.slice(0, 5)).toEqual([
    '"tailwindcss"',
    '"@ap/ui/styles/tokens.css" layer(base)',
    '"@ap/ui/styles/semantic.css" layer(base)',
    '"@ap/ui/styles/theme.css"',
    '"@ap/ui/styles/compat.css"',
  ]);
});

it('imports the --eqv-* theme from @eqv/ui after the @ap/ui theme', () => {
  const imports = [...studioCss.matchAll(/^@import\s+(.+?);/gm)].map((m) => m[1]);
  expect(imports.indexOf('"@eqv/ui/theme.css"')).toBeGreaterThan(imports.indexOf('"@ap/ui/styles/compat.css"'));
});
