// Generates src/mock-data/cluster-single.generated.ts from fixtures/cluster-single (synthetic data).
// `node scripts/gen-mock-data.mjs` writes the file; `--stdout` prints it (the drift test compares the two).
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(here, '../../../fixtures/cluster-single');
const target = resolve(here, '../src/mock-data/cluster-single.generated.ts');
const json = (path) => JSON.parse(readFileSync(resolve(fixtures, path), 'utf8'));

const bindings = json('onboarding/bindings/eq-synth-01.bindings.json');
const mappings = bindings.bindings.map(({ mappingHash }) =>
  json(`onboarding/mappings/eq-synth-01/${mappingHash.slice('sha256:'.length)}.mapping.json`));
const constant = (name, type, value) => `export const ${name}: ${type} = ${JSON.stringify(value, null, 2)};\n`;

export const render = () => [
  '// generated — do not edit. Source: fixtures/cluster-single (synthetic). Regenerate: pnpm --filter @eqv/platform-adapter gen:mock-data\n',
  "import type { BindingsFile, EquipmentLayoutDocument, MappingVersion, OccurrenceBatch } from '@eqv/core';\n",
  constant('layouts', 'EquipmentLayoutDocument[]', [json('layout.json')]),
  constant('bindings', 'BindingsFile', bindings),
  constant('mappings', 'MappingVersion[]', mappings),
  constant('batch', 'OccurrenceBatch', json('occurrence-batch.json')),
].join('\n');

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--stdout')) process.stdout.write(render());
  else writeFileSync(target, render());
}
