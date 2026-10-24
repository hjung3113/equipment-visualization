// Builds the six @eqv/* release packages and packs them into tarballs (ADR-0014).
// Usage: pnpm eqv:pack --version X.Y.Z --out <dir>   (--version defaults to 0.0.0-ci)
//
// Builds each package in dependency order with its own `build` script (not turbo's cache), stages `dist` (and core's `schema/`) plus
// a generated release manifest in a temp directory outside the repo, runs `pnpm pack` there, writes SHA256SUMS and rejects archives
// that carry source, tests, tsconfigs or a workspace/loose @eqv/* version. `--out` must be absent or an empty directory (nothing in
// it is ever deleted); the tarballs are collected in the temp directory and copied into `--out` only after every step passed.
// Tracked files are never touched; the only repo writes are the git-ignored `packages/<name>/dist` folders.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { releaseManifest, releaseSet, validateArchive } from './eqv-release.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function fail(message) {
  throw new Error(message);
}

const oneLine = (value) => value.replace(/\s+/g, ' ').trim();

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error) fail(`${command} could not run: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = result.stderr || result.stdout || `exit ${result.status ?? 'unknown'}`;
    fail(`${command} ${args.join(' ')} failed (${result.status}): ${oneLine(detail).slice(0, 1500)}`);
  }
  return result.stdout;
}

function parseArgs(argv) {
  const options = { version: '0.0.0-ci', out: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--version' || flag === '--out') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) fail(`${flag} needs a value`);
      options[flag.slice(2)] = value;
      i += 1;
    } else {
      fail(`unknown argument ${flag} (usage: eqv-pack --version X.Y.Z --out <dir>)`);
    }
  }
  if (!options.out) fail('--out <dir> is required');
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(options.version)) fail(`--version ${options.version} is not a SemVer`);
  return options;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`cannot read ${path}: ${error.message}`);
  }
}

/** `--out` is never cleaned: it must be absent or an empty directory, so a failed run cannot destroy an earlier release. */
function assertOutDirFree(outDir) {
  if (!existsSync(outDir)) return;
  if (!statSync(outDir).isDirectory()) fail(`--out ${outDir} exists and is not a directory`);
  if (readdirSync(outDir).length > 0) fail(`--out ${outDir} is not empty; pass a new or empty directory (nothing is deleted)`);
}

function main() {
  const { version, out } = parseArgs(process.argv.slice(2));
  const outDir = resolve(out);
  const staging = mkdtempSync(join(tmpdir(), 'eqv-pack-'));
  try {
    const relativeStaging = relative(repoRoot, staging);
    if (relativeStaging === '' || !relativeStaging.startsWith(`..${sep}`)) fail('staging directory must be outside the repository');
    assertOutDirFree(outDir);
    const collected = join(staging, 'out');
    mkdirSync(collected);

    const manifests = Object.fromEntries(
      readdirSync(join(repoRoot, 'packages'), { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && existsSync(join(repoRoot, 'packages', entry.name, 'package.json')))
        .map((entry) => [entry.name, readJson(join(repoRoot, 'packages', entry.name, 'package.json'))]),
    );
    const tarballs = [];
    for (const name of releaseSet(manifests)) {
      const packageRoot = join(repoRoot, 'packages', name);
      const source = manifests[name];
      // dist is git-ignored; clearing it keeps a deleted source file from lingering in the tarball.
      rmSync(join(packageRoot, 'dist'), { recursive: true, force: true });
      process.stdout.write(`eqv:pack build ${source.name}\n`);
      run('pnpm', ['--filter', source.name, 'run', 'build'], repoRoot);
      if (!existsSync(join(packageRoot, 'dist'))) fail(`${source.name} build produced no dist`);

      const manifest = releaseManifest(source, version);
      const stage = join(staging, name);
      mkdirSync(stage);
      for (const folder of manifest.files) cpSync(join(packageRoot, folder), join(stage, folder), { recursive: true });
      writeFileSync(join(stage, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);

      const packDir = join(staging, `pack-${name}`);
      mkdirSync(packDir);
      run('pnpm', ['pack', '--pack-destination', packDir], stage);
      const packed = readdirSync(packDir).filter((file) => file.endsWith('.tgz'));
      if (packed.length !== 1) fail(`${source.name}: expected one tarball, found ${packed.length}`);
      const expectedName = `eqv-${name}-${version}.tgz`;
      if (packed[0] !== expectedName) fail(`${source.name}: pnpm pack wrote ${packed[0]}, expected ${expectedName}`);

      const archivePaths = run('tar', ['-tzf', join(packDir, packed[0])], staging).split(/\r?\n/).filter(Boolean);
      const extracted = join(staging, `extract-${name}`);
      mkdirSync(extracted);
      run('tar', ['-xzf', join(packDir, packed[0]), '-C', extracted], staging);
      validateArchive(name, archivePaths, readJson(join(extracted, 'package', 'package.json')), version);

      cpSync(join(packDir, packed[0]), join(collected, packed[0]));
      tarballs.push(packed[0]);
    }

    const sums = tarballs.map((file) => `${createHash('sha256').update(readFileSync(join(collected, file))).digest('hex')}  ${file}`);
    writeFileSync(join(collected, 'SHA256SUMS'), `${sums.join('\n')}\n`);
    assertOutDirFree(outDir);
    mkdirSync(outDir, { recursive: true });
    for (const file of readdirSync(collected)) cpSync(join(collected, file), join(outDir, file));
    process.stdout.write(`eqv:pack passed: ${tarballs.length} tarballs (${version}) + SHA256SUMS in ${outDir}\n`);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`eqv:pack FAILED: ${oneLine(error instanceof Error ? error.message : String(error))}\n`);
  process.exitCode = 1;
}
