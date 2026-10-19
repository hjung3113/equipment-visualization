import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { generateDemo } from './generate.ts';

// Usage: node scripts/demo/write.ts <data-root>
const dataRoot = process.argv[2];
if (dataRoot === undefined) {
  console.error('usage: write.ts <data-root>');
  process.exit(2);
}
for (const [path, content] of await generateDemo()) {
  const target = resolve(dataRoot, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
  console.log(path);
}
