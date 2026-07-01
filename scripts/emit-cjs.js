// Simple CJS emitter: duplicates .js outputs as .cjs with same content.
// Keeps tree-shaking and ESM defaults for bundlers while offering
// require() compatibility. Same script used by @page-speed/img and
// @page-speed/video for consistency across the ecosystem.
import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

const DIST = 'dist';

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

const files = walk(DIST).filter((f) => f.endsWith('.js'));
for (const file of files) {
  const cjsPath = file.replace(/\.js$/, '.cjs');
  mkdirSync(dirname(cjsPath), { recursive: true });
  const src = readFileSync(file);
  writeFileSync(cjsPath, src);
}
console.log(`Emitted ${files.length} CJS files.`);
