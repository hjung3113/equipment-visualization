import { describe, expect, it } from 'vitest';
import { RELEASE_PACKAGES, mapExport, releaseManifest, releaseSet, validateArchive } from './eqv-release.mjs';

const pkg = (name, deps = []) => ({ name: `@eqv/${name}`, dependencies: Object.fromEntries(deps.map((d) => [`@eqv/${d}`, 'workspace:*'])) });
const sixManifests = () => ({
  core: pkg('core'),
  renderer: pkg('renderer', ['core']),
  ui: pkg('ui', ['core']),
  replay: pkg('replay', ['core', 'ui']),
  views: pkg('views', ['core', 'renderer', 'replay', 'ui']),
  'platform-adapter': pkg('platform-adapter', ['core', 'renderer', 'replay', 'ui', 'views']),
  editor: pkg('editor', ['core']),
});

describe('releaseSet', () => {
  it('is the adapter closure in dependency order and equals the six release packages', () => {
    const order = releaseSet(sixManifests());
    expect([...order].sort()).toEqual([...RELEASE_PACKAGES].sort());
    for (const [i, dir] of order.entries()) {
      for (const dep of Object.keys(sixManifests()[dir].dependencies)) expect(order.indexOf(dep.slice('@eqv/'.length))).toBeLessThan(i);
    }
  });

  it('fails when the adapter gains or loses an @eqv/* dependency', () => {
    const grown = sixManifests();
    grown['platform-adapter'] = pkg('platform-adapter', ['core', 'renderer', 'replay', 'ui', 'views', 'editor']);
    expect(() => releaseSet(grown)).toThrow(/closure/);
    const shrunk = sixManifests();
    shrunk['platform-adapter'] = pkg('platform-adapter', ['core', 'renderer', 'replay', 'ui']);
    expect(() => releaseSet(shrunk)).toThrow(/closure/);
  });
});

describe('mapExport', () => {
  it.each([
    ['./src/index.ts', { types: './dist/index.d.ts', import: './dist/index.js' }],
    ['./src/screens/Screen.tsx', { types: './dist/screens/Screen.d.ts', import: './dist/screens/Screen.js' }],
    ['./src/styles.css', './dist/styles.css'],
    ['./schema/layout.schema.json', './schema/layout.schema.json'],
    ['./dist/theme.css', './dist/theme.css'],
    [{ types: './dist/index.d.ts', import: './dist/index.js' }, { types: './dist/index.d.ts', import: './dist/index.js' }],
  ])('maps %j', (source, expected) => {
    expect(mapExport(source, 'x')).toEqual(expected);
  });

  it.each(['./lib/index.js', './src/data.json', 'src/index.ts', 42])('rejects %j', (source) => {
    expect(() => mapExport(source, 'x')).toThrow();
  });
});

describe('releaseManifest', () => {
  const source = {
    name: '@eqv/views',
    version: '0.0.0',
    private: true,
    type: 'module',
    sideEffects: ['**/*.css'],
    exports: { '.': './src/index.ts', './styles.css': './src/styles.css' },
    scripts: { build: 'tsc' },
    peerDependencies: { '@ap/ui': '0.12.0', react: '^19.0.0' },
    dependencies: { '@eqv/core': 'workspace:*', 'lucide-react': '0.469.0' },
    devDependencies: { vitest: '3.2.7' },
  };

  it('turns @eqv/* siblings into exact peers, keeps other dependencies, source peers and sideEffects, and drops everything else', () => {
    expect(releaseManifest(source, '1.2.3')).toEqual({
      name: '@eqv/views',
      version: '1.2.3',
      type: 'module',
      sideEffects: ['**/*.css'],
      exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' }, './styles.css': './dist/styles.css' },
      files: ['dist'],
      dependencies: { 'lucide-react': '0.469.0' },
      peerDependencies: { '@ap/ui': '0.12.0', react: '^19.0.0', '@eqv/core': '1.2.3' },
    });
  });

  it('ships core schema/ and adds no peer to a package that has none', () => {
    const core = releaseManifest({ name: '@eqv/core', type: 'module', exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' }, './layout.schema.json': './schema/layout.schema.json' } }, '1.2.3');
    expect(core.files).toEqual(['dist', 'schema']);
    expect(core).not.toHaveProperty('peerDependencies');
  });
});

describe('validateArchive', () => {
  const manifest = { exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } }, peerDependencies: { '@eqv/core': '1.2.3' } };
  const good = ['package/', 'package/package.json', 'package/dist/', 'package/dist/index.js', 'package/dist/index.d.ts'];

  it('accepts a clean archive', () => {
    expect(() => validateArchive('views', good, manifest, '1.2.3')).not.toThrow();
  });

  it.each([
    ['source', 'package/src/index.ts', manifest],
    ['a test directory', 'package/test/a.ts', manifest],
    ['a test file', 'package/dist/a.test.js', manifest],
    ['a tsconfig', 'package/tsconfig.build.json', manifest],
    ['a path outside package/', 'other/x', manifest],
    ['a workspace range', 'package/dist/x.js', { ...manifest, peerDependencies: { '@eqv/core': 'workspace:*' } }],
    ['a loose @eqv version', 'package/dist/x.js', { ...manifest, peerDependencies: { '@eqv/core': '^1.2.3' } }],
    ['an @eqv sibling in dependencies', 'package/dist/x.js', { ...manifest, dependencies: { '@eqv/core': '1.2.3' } }],
  ])('rejects %s', (_label, extra, withManifest) => {
    expect(() => validateArchive('views', [...good, extra], withManifest, '1.2.3')).toThrow();
  });

  it('rejects an archive missing a file its exports name', () => {
    expect(() => validateArchive('views', good.filter((p) => !p.endsWith('index.d.ts')), manifest, '1.2.3')).toThrow(/missing/);
  });
});
