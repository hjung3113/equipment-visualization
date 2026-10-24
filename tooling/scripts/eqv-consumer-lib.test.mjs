import { describe, expect, it } from 'vitest';
import { blockEntries, hasCssSelector, readWorkspaceBlock, selectCssProbes } from './eqv-consumer-lib.mjs';

describe('readWorkspaceBlock + blockEntries', () => {
  const yaml = ['allowBuilds:', '  esbuild: true', 'overrides:', '  "@ap/ui": "https://example.test/ap-ui-0.12.0.tgz"', '  "@tiptap/core": 3.23.5', '# comment', 'patchedDependencies:', '  "a@1.0.0": patches/a.patch', ''].join('\n');

  it('reads the entries of one block and stops at the next top-level key', () => {
    expect(blockEntries(readWorkspaceBlock(yaml, 'overrides'))).toEqual([['@ap/ui', 'https://example.test/ap-ui-0.12.0.tgz'], ['@tiptap/core', '3.23.5']]);
    expect(blockEntries(readWorkspaceBlock(yaml, 'patchedDependencies'))).toEqual([['a@1.0.0', 'patches/a.patch']]);
  });

  it('fails when the block is missing', () => {
    expect(() => readWorkspaceBlock(yaml, 'nothing')).toThrow(/no nothing block/);
  });
});

describe('selectCssProbes', () => {
  const packages = [
    { name: 'ui', sourceText: 'const a = { className: "w-rail flex-wrap shared-x p-2" };\n// don\'t "mislead"\nconst b = "mb-4";' },
    { name: 'replay', sourceText: 'x("eqv-rp-bar p-2"); y("w-rail");' },
    { name: 'views', sourceText: 'z("size-3.5 p-2");' },
  ];

  it('picks classes found in the target package only, and in replay the eqv-rp-* utility', () => {
    const probes = Object.fromEntries(selectCssProbes(packages, ['ui', 'replay', 'views']).map(({ name, classNames }) => [name, classNames]));
    expect(probes).toEqual({ ui: ['flex-wrap', 'mb-4'], replay: ['eqv-rp-bar'], views: ['size-3.5'] });
  });

  it('skips a class the host CSS already has, and fails when none is left', () => {
    expect(() => selectCssProbes(packages, ['views'], 2, (token) => token === 'size-3.5')).toThrow(/@eqv\/views/);
  });
});

describe('hasCssSelector', () => {
  it.each([
    ['.mb-4{margin:1rem}', 'mb-4', true],
    ['.mb-40{margin:10rem}', 'mb-4', false],
    ['.size-3\\.5{width:1px}', 'size-3.5', true],
  ])('%s has %s: %s', (css, name, expected) => {
    expect(hasCssSelector(css, name)).toBe(expected);
  });
});
