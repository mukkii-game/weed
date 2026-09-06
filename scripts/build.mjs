import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const runtimeFiles = ['index.html', 'game.js', 'style.css', 'manifest.webmanifest'];

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const file of runtimeFiles) {
  await cp(resolve(root, file), resolve(dist, file));
}
await cp(resolve(root, 'assets'), resolve(dist, 'assets'), { recursive: true });

const html = await readFile(resolve(dist, 'index.html'), 'utf8');
if (/(?:src|href)=["']\//.test(html)) {
  throw new Error('dist/index.html contains a root-absolute asset reference');
}

console.log(`Built ${dist} with ${runtimeFiles.length} entry files and assets/`);
