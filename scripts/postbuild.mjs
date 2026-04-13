import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

const filesToRemove = [
  'dist/virtual:temp.js.js',
  'dist/tsconfig.tsbuildinfo',
];

for (const relativePath of filesToRemove) {
  rmSync(resolve(process.cwd(), relativePath), { force: true, recursive: true });
}
