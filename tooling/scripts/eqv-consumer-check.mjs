// Clean outside-consumer gate for the @eqv/* release tarballs (ADR-0014). Usage: pnpm eqv:consumer-check <dir from `pnpm eqv:pack`>
//
// Creates a temp project outside the repo that depends on @eqv/platform-adapter (file:) and pins all six @eqv/* with `overrides` to
// their tarballs, as ADR-0014 tells analytics-platform to do, then runs: install → single-copy check → tsc → vite build with CSS
// probes. The @ap/* URLs, @tiptap/* pins and patches are read from this repo's pnpm-workspace.yaml and the tool versions from
// apps/studio/package.json at run time. This is an external SDK consumer; it does not cover analytics-platform's workspace.
// Probe classes are derived from each package's installed dist JS (a class found in no other @eqv package), so no class list can go
// stale; the check prints the dist file that carries each probe.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blockEntries, findCopyMismatches, hasCssSelector, readWorkspaceBlock, selectCssProbes } from './eqv-consumer-lib.mjs';
import { RELEASE_PACKAGES } from './eqv-release.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const STUDIO_TOOLS = ['react', 'react-dom', 'vite', 'tailwindcss', '@tailwindcss/vite', 'typescript', '@types/react', '@types/react-dom'];
const PROBE_PACKAGES = ['ui', 'replay', 'views'];

let step = 'setup';

function fail(message) {
  throw new Error(message);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, CI: 'true' } });
  if (result.error) fail(`${command} could not run: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim() || `exit ${result.status ?? 'unknown'}`;
    fail(`${command} ${args.join(' ')} exited ${result.status}:\n${detail.slice(-3000)}`);
  }
  return result.stdout;
}

function runStep(name, action) {
  step = name;
  const started = Date.now();
  const result = action();
  process.stdout.write(`eqv:consumer-check PASS ${name} (${((Date.now() - started) / 1000).toFixed(1)}s)\n`);
  return result;
}

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

const APP_FILES = {
  'index.html': '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.ts"></script></body></html>\n',
  'vite.config.ts': `import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({ plugins: [tailwindcss()] });
`,
  'tsconfig.json': `${JSON.stringify({
    compilerOptions: {
      target: 'ES2022', lib: ['ES2022', 'DOM', 'DOM.Iterable'], module: 'ESNext', moduleResolution: 'Bundler', jsx: 'react-jsx',
      strict: true, noEmit: true, types: [], skipLibCheck: false,
    },
    include: ['src'],
  }, null, 2)}\n`,
  'src/style.css': `@import "tailwindcss";
@import "@ap/ui/styles.css";
@import "@eqv/platform-adapter/styles.css";
`,
  // The vite entry imports the stylesheet only: Tailwind also scans every module vite bundles, which would let a probe pass without
  // the package's `@source` line. The adapter is imported by check.ts, which only tsc reads.
  'src/main.ts': `import './style.css';\n`,
  'src/check.ts': `import { eqvManifest, eqvScreens } from '@eqv/platform-adapter';
import { EQV_MOCK_EQUIPMENT, eqvMockContext, eqvMockEvents } from '@eqv/platform-adapter/mock-data';

export const adapterExports = [eqvManifest, eqvScreens, EQV_MOCK_EQUIPMENT, eqvMockContext, eqvMockEvents];
`,
};

function tarballs(tarballDir) {
  const found = {};
  for (const name of RELEASE_PACKAGES) {
    const files = readdirSync(tarballDir).filter((file) => new RegExp(`^eqv-${name}-\\d.*\\.tgz$`).test(file));
    if (files.length !== 1) fail(`expected one eqv-${name}-*.tgz in ${tarballDir}, found ${files.length}`);
    found[name] = join(tarballDir, files[0]);
  }
  return found;
}

function writeProject(root, tarballDir) {
  const files = tarballs(tarballDir);
  const workspaceYaml = readFileSync(join(repoRoot, 'pnpm-workspace.yaml'), 'utf8');
  const overrideLines = readWorkspaceBlock(workspaceYaml, 'overrides');
  const overrides = Object.fromEntries(blockEntries(overrideLines));
  for (const name of ['@ap/ui', '@ap/contracts']) if (!overrides[name]) fail(`pnpm-workspace.yaml overrides carry no ${name} URL`);

  const studio = readJson(join(repoRoot, 'apps', 'studio', 'package.json'));
  const studioVersions = { ...studio.dependencies, ...studio.devDependencies };
  const tools = {};
  for (const name of STUDIO_TOOLS) {
    if (!studioVersions[name]) fail(`apps/studio/package.json declares no ${name}`);
    tools[name] = studioVersions[name];
  }
  writeFileSync(join(root, 'package.json'), `${JSON.stringify({
    name: 'eqv-outside-consumer',
    private: true,
    type: 'module',
    dependencies: { '@eqv/platform-adapter': `file:${files['platform-adapter']}`, '@ap/ui': overrides['@ap/ui'], '@ap/contracts': overrides['@ap/contracts'], ...tools },
  }, null, 2)}\n`);

  const patchLines = [];
  for (const [id, path] of blockEntries(readWorkspaceBlock(workspaceYaml, 'patchedDependencies'))) {
    if (!existsSync(join(repoRoot, path))) fail(`patch file from pnpm-workspace.yaml not found: ${path}`);
    mkdirSync(dirname(join(root, path)), { recursive: true });
    cpSync(join(repoRoot, path), join(root, path));
    patchLines.push(`  ${JSON.stringify(id)}: ${JSON.stringify(path)}`);
  }
  writeFileSync(join(root, 'pnpm-workspace.yaml'), [
    'packages: []',
    'allowBuilds:',
    '  esbuild: true',
    ...(patchLines.length > 0 ? ['patchedDependencies:', ...patchLines] : []),
    'overrides:',
    ...overrideLines,
    ...RELEASE_PACKAGES.map((name) => `  "@eqv/${name}": "file:${files[name]}"`),
    '',
  ].join('\n'));

  for (const [path, content] of Object.entries(APP_FILES)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
}

/** The directory `name` resolves to when looked up from `dir` upward through node_modules (package.json is not an export, so walk by hand). */
function resolveFrom(dir, name) {
  for (let current = realpathSync(dir); ; current = dirname(current)) {
    const candidate = join(current, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return realpathSync(candidate);
    if (dirname(current) === current) return undefined;
  }
}

/** One copy of react, react-dom, @ap/ui, @ap/contracts and @eqv/core, as the consumer root and @eqv/platform-adapter resolve them. */
function assertSingleCopies(root) {
  const installedDir = (from) => {
    if (from === 'consumer') return root;
    if (from === '@ap/ui' || from === 'react-dom') return resolveFrom(root, from);
    return resolveFrom(join(root, 'node_modules', '@eqv', 'platform-adapter'), from);
  };
  const missing = ['@ap/ui', 'react-dom', ...RELEASE_PACKAGES.map((name) => `@eqv/${name}`)].filter((name) => !installedDir(name));
  if (missing.length > 0) fail(`not installed: ${missing.join(', ')}`);
  const mismatches = findCopyMismatches({
    release: RELEASE_PACKAGES,
    resolve: (from, name) => resolveFrom(installedDir(from), name),
    declared: (from) => {
      const manifest = readJson(join(installedDir(from), 'package.json'));
      return [...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.peerDependencies ?? {})];
    },
  });
  if (mismatches.length > 0) fail(mismatches.join('; '));
}

function javascriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return javascriptFiles(path);
    return entry.isFile() && entry.name.endsWith('.js') ? [path] : [];
  });
}

/** A class used only in one package's components must reach the built CSS through that package's `@source`. */
function builtCss(root, outDir) {
  const assets = join(root, outDir, 'assets');
  const cssFiles = existsSync(assets) ? readdirSync(assets).filter((file) => file.endsWith('.css')) : [];
  if (cssFiles.length === 0) fail(`vite build (${outDir}) emitted no CSS file`);
  return cssFiles.map((file) => readFileSync(join(assets, file), 'utf8')).join('\n');
}

/** The same build without the @eqv stylesheet: a class already there (from Tailwind or @ap/ui) proves nothing about @source. */
function buildBaselineCss(root) {
  writeFileSync(join(root, 'src', 'style.css'), APP_FILES['src/style.css'].replace(/^@import "@eqv\/.*\n/m, ''));
  run('pnpm', ['exec', 'vite', 'build', '--outDir', 'dist-base'], root);
  return builtCss(root, 'dist-base');
}

function assertCssProbes(root) {
  const css = builtCss(root, 'dist');
  const baseline = buildBaselineCss(root);
  const filesOf = {};
  const packages = RELEASE_PACKAGES.map((name) => {
    const installed = resolveFrom(join(root, 'node_modules', '@eqv', 'platform-adapter'), `@eqv/${name}`);
    filesOf[name] = javascriptFiles(join(installed, 'dist'));
    return { name, sourceText: filesOf[name].map((file) => readFileSync(file, 'utf8')).join('\n') };
  });
  const missing = [];
  for (const { name, classNames } of selectCssProbes(packages, PROBE_PACKAGES, 2, (token) => hasCssSelector(baseline, token))) {
    for (const className of classNames) {
      const source = filesOf[name].find((file) => readFileSync(file, 'utf8').includes(className));
      process.stdout.write(`  probe @eqv/${name} .${className} (from ${source ? relative(dirname(dirname(source)), source) : 'dist'})\n`);
      if (!hasCssSelector(css, className)) missing.push(`@eqv/${name} .${className}`);
    }
  }
  if (missing.length > 0) fail(`built CSS is missing classes used only by one package: ${missing.join(', ')}; check that package's styles.css @source line and the import order`);
}

function main() {
  const tarballArg = process.argv[2];
  if (!tarballArg) fail('usage: eqv:consumer-check <dir with the eqv-*.tgz files>');
  const tarballDir = resolve(tarballArg);
  if (!existsSync(tarballDir)) fail(`tarball directory ${tarballDir} does not exist`);
  const root = mkdtempSync(join(tmpdir(), 'eqv-consumer-'));
  try {
    const relativeRoot = relative(repoRoot, root);
    if (relativeRoot === '' || !relativeRoot.startsWith(`..${sep}`)) fail('consumer directory must be outside the repository');
    runStep('write consumer project', () => writeProject(root, tarballDir));
    runStep('pnpm install (tarballs, @ap/* URLs, tiptap pins, patches from pnpm-workspace.yaml)', () => run('pnpm', ['install', '--no-frozen-lockfile', ...(process.env.EQV_OFFLINE === '1' ? ['--offline'] : [])], root));
    runStep('single copy of react, react-dom, @ap/ui, @ap/contracts and @eqv/core', () => assertSingleCopies(root));
    runStep('tsc --noEmit (imports eqvManifest, eqvScreens from @eqv/platform-adapter)', () => run('pnpm', ['exec', 'tsc', '--noEmit', '-p', 'tsconfig.json'], root));
    runStep('vite build', () => run('pnpm', ['exec', 'vite', 'build'], root));
    runStep('built CSS carries a class from each of @eqv/ui, replay and views', () => assertCssProbes(root));
    process.stdout.write('eqv:consumer-check passed\n');
  } finally {
    if (process.env.EQV_KEEP === '1') process.stdout.write(`eqv:consumer-check kept ${root}\n`);
    else rmSync(root, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`eqv:consumer-check FAILED at step "${step}": ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
