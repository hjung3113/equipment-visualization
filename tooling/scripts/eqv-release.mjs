// Pure parts of the @eqv/* release (ADR-0014): the package set, the source-export to dist-target mapping, the packed manifest and
// the archive rules. eqv-pack.mjs does the file work around them.
export const ADAPTER = '@eqv/platform-adapter';
export const SCOPE = '@eqv/';
/** The six packages a release carries: the adapter and its @eqv/* runtime closure. */
export const RELEASE_PACKAGES = Object.freeze(['core', 'renderer', 'replay', 'ui', 'views', 'platform-adapter']);

const dirOf = (name) => name.slice(SCOPE.length);

/**
 * The adapter plus the @eqv/* packages it depends on, transitively, in dependency order (dependencies first).
 * `manifests` maps a directory name (`core`) to its parsed package.json. Throws unless the set is exactly RELEASE_PACKAGES.
 */
export function releaseSet(manifests) {
  const order = [];
  const seen = new Set();
  const visit = (dir, from) => {
    if (seen.has(dir)) return;
    const manifest = manifests[dir];
    if (!manifest) throw new Error(`${from} depends on @eqv/${dir}, which has no package manifest`);
    seen.add(dir);
    for (const dep of Object.keys(manifest.dependencies ?? {})) if (dep.startsWith(SCOPE)) visit(dirOf(dep), manifest.name);
    order.push(dir);
  };
  visit(dirOf(ADAPTER), 'release');
  const expected = [...RELEASE_PACKAGES].sort().join(', ');
  const found = [...order].sort().join(', ');
  if (expected !== found) throw new Error(`the ${ADAPTER} closure is [${found}], the release carries [${expected}]: update RELEASE_PACKAGES and ADR-0014 together`);
  return order;
}

/** './src/theme/index.ts' → { types: './dist/theme/index.d.ts', import: './dist/theme/index.js' }; './src/x.css' → './dist/x.css'. */
function distTarget(target, label) {
  const inDist = `./dist/${target.slice('./src/'.length)}`;
  if (/\.tsx?$/.test(inDist)) {
    const stem = inDist.replace(/\.tsx?$/, '');
    return { types: `${stem}.d.ts`, import: `${stem}.js` };
  }
  if (inDist.endsWith('.css')) return inDist;
  throw new Error(`${label}: cannot map ${JSON.stringify(target)} to dist (only .ts, .tsx and .css under ./src/)`);
}

/** Targets under ./src/ move to ./dist/; condition objects and ./dist/ or ./schema/ targets pass through unchanged. */
export function mapExport(target, label) {
  if (typeof target === 'object' && target !== null) return target;
  if (typeof target === 'string' && target.startsWith('./src/')) return distTarget(target, label);
  if (typeof target === 'string' && (target.startsWith('./dist/') || target.startsWith('./schema/'))) return target;
  throw new Error(`${label}: export target ${JSON.stringify(target)} must start with ./src/, ./dist/ or ./schema/`);
}

/** The manifest staged for `pnpm pack`: dist exports, @eqv/* siblings as exact peers next to the source package's peers, nothing else. */
export function releaseManifest(source, version) {
  const exports = {};
  for (const [subpath, target] of Object.entries(source.exports ?? {})) exports[subpath] = mapExport(target, `${source.name} exports["${subpath}"]`);
  if (Object.keys(exports).length === 0) throw new Error(`${source.name}: source manifest has no exports`);
  const manifest = { name: source.name, version, type: source.type };
  if (source.sideEffects !== undefined) manifest.sideEffects = source.sideEffects;
  manifest.exports = exports;
  manifest.files = source.name === '@eqv/core' ? ['dist', 'schema'] : ['dist'];
  // Siblings are exact peers, not dependencies: pnpm rejects a URL-resolved @eqv/* as an exotic subdependency (blockExoticSubdeps).
  const dependencies = Object.entries(source.dependencies ?? {});
  const plain = dependencies.filter(([dep]) => !dep.startsWith(SCOPE));
  const siblings = dependencies.filter(([dep]) => dep.startsWith(SCOPE)).map(([dep]) => [dep, version]);
  if (plain.length > 0) manifest.dependencies = Object.fromEntries(plain);
  if (source.peerDependencies || siblings.length > 0) manifest.peerDependencies = { ...source.peerDependencies, ...Object.fromEntries(siblings) };
  return manifest;
}

function archiveRelativePath(path) {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
  if (normalized.split('/').includes('..') || normalized.startsWith('/')) throw new Error(`unsafe path in packed archive: ${path}`);
  if (normalized === 'package') return '';
  if (!normalized.startsWith('package/')) throw new Error(`unexpected packed archive path: ${path}`);
  return normalized.slice('package/'.length);
}

/** Throws on the first rule an archive breaks. `paths` are the `tar -t` entries, `manifest` the package.json inside. */
export function validateArchive(name, paths, manifest, version) {
  const files = paths.map(archiveRelativePath).filter(Boolean);
  const reject = (reason, test) => {
    const hit = files.find(test);
    if (hit) throw new Error(`${name} tarball ${reason}: ${hit}`);
  };
  reject('includes source', (path) => path === 'src' || path.startsWith('src/'));
  reject('includes tests', (path) => path === 'test' || path.startsWith('test/') || /(^|\/)(__tests__|__fixtures__)\//.test(path) || /\.test\.[^/]+$/.test(path));
  reject('includes a tsconfig', (path) => path.split('/').some((part) => part.startsWith('tsconfig')));
  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const [dep, range] of Object.entries(manifest[field] ?? {})) {
      if (range.startsWith('workspace:')) throw new Error(`${name} tarball ${field}.${dep} is ${range}, a workspace range`);
      if (dep.startsWith(SCOPE) && field === 'dependencies') throw new Error(`${name} tarball dependencies.${dep}: an @eqv/* sibling must be an exact peerDependency`);
      if (dep.startsWith(SCOPE) && range !== version) throw new Error(`${name} tarball ${field}.${dep} is ${range}, expected exactly ${version}`);
    }
  }
  const present = new Set(files);
  const targets = (value) => (typeof value === 'string' ? [value] : Object.values(value).flatMap(targets));
  for (const target of Object.values(manifest.exports ?? {}).flatMap(targets)) {
    if (!present.has(target.slice('./'.length))) throw new Error(`${name} tarball is missing its exports target ${target}`);
  }
}
