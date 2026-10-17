import { readdirSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('imports neither the renderer nor the editor', () => {
  const dir = new URL('../src/', import.meta.url);
  const sources = readdirSync(dir).filter((file) => /\.tsx?$/.test(file));
  expect(sources.length).toBeGreaterThan(0);
  for (const file of sources) {
    expect(readFileSync(new URL(file, dir), 'utf8'), file).not.toMatch(/@eqv\/(renderer|editor)/);
  }
});
