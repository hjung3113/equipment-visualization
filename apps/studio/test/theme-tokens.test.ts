import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { expect, it } from 'vitest';

const studioCss = readFileSync(resolve(import.meta.dirname, '../src/studio.css'), 'utf8');
// The tokens come from the installed @ap/ui platform SDK package (ADR-0013), not a checkout.
const styles = dirname(createRequire(import.meta.url).resolve('@ap/ui/styles/tokens.css'));
const platformCss = ['tokens.css', 'semantic.css'].map((f) => readFileSync(resolve(styles, f), 'utf8')).join('\n');

// ADR-0008: the --eqv-* rows whose platform token @ap/ui defines.
const MAP = [
  ['--eqv-canvas', '--surface-canvas'],
  ['--eqv-board', '--surface-card'],
  ['--eqv-border', '--border-subtle'],
  ['--eqv-ink', '--text-primary'],
  ['--eqv-secondary', '--text-secondary'],
  ['--eqv-interface', '--text-secondary'],
  ['--eqv-evidence', '--text-secondary'],
  ['--eqv-detail-fill', '--surface-field-filled'],
  ['--eqv-assumed-fg', '--text-warning-label'],
] as const;

it.each(MAP)('%s is wrapped rgb(var(%s)) and the token exists in @ap/ui', (eqv, token) => {
  expect(studioCss).toContain(`${eqv}: rgb(var(${token}));`);
  expect(platformCss).toContain(`${token}:`);
});

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
