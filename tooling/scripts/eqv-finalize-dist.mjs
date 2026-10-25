// Second half of a package `build` (ADR-0014). Run from the package directory after `tsc -p tsconfig.build.json`:
// copies src/**/*.css into dist, keeping relative paths, so the `@source "./"` line in a package stylesheet still points at the
// emitted JS and the `@import`s between stylesheets still resolve. Relative imports in src already carry `.js` specifiers.
import { cpSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SKIP_DIR = new Set(['__tests__', '__fixtures__', 'node_modules']);

function* cssFiles(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (!SKIP_DIR.has(name)) yield* cssFiles(path);
    } else if (name.endsWith('.css')) {
      yield path;
    }
  }
}

const src = join(process.cwd(), 'src');
const dist = join(process.cwd(), 'dist');
for (const file of cssFiles(src)) cpSync(file, join(dist, relative(src, file)));
