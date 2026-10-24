import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isThemeColorToken } from '@ap/ui/theme';
import { expect, it } from 'vitest';

const themeCss = readFileSync(resolve(import.meta.dirname, '../src/theme.css'), 'utf8');

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

it.each(MAP)('%s is wrapped rgb(var(%s)) and the token is a public @ap/ui theme token', (eqv, token) => {
  expect(themeCss).toContain(`${eqv}: rgb(var(${token}));`);
  expect(isThemeColorToken(token.slice(2))).toBe(true);
});
