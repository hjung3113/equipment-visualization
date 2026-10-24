import { readdir } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { PRIMITIVE_CATALOG } from '../src/index.js';
import { primitives } from '../src/primitives.generated.js';

it('exports all 25 bundled primitives with their natural sizes and class labels', async () => {
  const names = (await readdir(new URL('../../../assets/primitives/', import.meta.url))).filter((name) => name.endsWith('.svg')).map((name) => name.slice(0, -4));
  expect(PRIMITIVE_CATALOG).toHaveLength(25);
  expect(PRIMITIVE_CATALOG.map((entry) => entry.name).sort()).toEqual(names.sort());
  for (const entry of PRIMITIVE_CATALOG) {
    expect({ width: entry.width, height: entry.height }).toEqual({ width: primitives[entry.name]!.viewBox.width, height: primitives[entry.name]!.viewBox.height });
    expect(entry.clsLabel).toBe({ process: '공정 모듈', holding: '대기·출입 모듈', robot: '로봇·핸들러', structure: '구조물' }[entry.cls]);
  }
});
