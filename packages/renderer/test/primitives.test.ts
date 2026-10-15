import { expect, it } from 'vitest';
import { readAssets, renderPrimitivesModule, splitPrimitive } from './compile-primitives.js';
import { sanitizePrimitive } from '../src/sanitize.js';

const WRAPPED = [
  'pm', 'cell', 'coater', 'developer', 'dry', 'bake', 'reactor', 'exposure', 'metrology', 'stage', 'optics',
  'lp', 'loadlock', 'buffer', 'aligner', 'boat', 'stocker',
];

it('matches the generated primitive module', async () => {
  await expect(renderPrimitivesModule(readAssets())).toMatchFileSnapshot('../src/primitives.generated.ts');
});

it.each(WRAPPED)('%s has a glyph and a non-empty glyph box', (name) => {
  const assets = readAssets();
  const parts = splitPrimitive(sanitizePrimitive(assets[name] ?? ''));
  expect(parts.glyph?.attrs['data-part']).toBe('glyph');
  expect(parts.glyphBox?.width).toBeGreaterThan(0);
  expect(parts.glyphBox?.height).toBeGreaterThan(0);
});
