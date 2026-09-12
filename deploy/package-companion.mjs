import { mkdirSync, cpSync, writeFileSync, readFileSync, rmSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { zipSync } from 'fflate';
const temp = mkdtempSync(join(tmpdir(), 'afterword-package-'));
const dir = join(temp, 'afterword-companion');
mkdirSync(join(dir, 'server'), { recursive: true });
cpSync('companion', join(dir, 'companion'), { recursive: true, filter: source => !source.split(/[\\/]/).includes('node_modules') });
for (const f of ['crypto.mjs', 'store.mjs', 'archive-reader.mjs', 'archive-capacity.mjs', 'capacity.mjs', 'watch.mjs']) cpSync(join('server', f), join(dir, 'server', f));
for (const f of ['package.json', 'package-lock.json']) cpSync(join('companion', f), join(dir, f));
cpSync('docs/COMPANION.md', join(dir, 'README.md'));
cpSync('docs/guides', join(dir, 'guides'), { recursive: true });
mkdirSync('dist', { recursive: true });
execFileSync('tar', ['-czf', resolve('dist/afterword-companion.tar.gz'), '-C', temp, 'afterword-companion']);
const files = {};
function collect(folder, prefix) {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name), name = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) collect(path, name);
    else files[name] = readFileSync(path);
  }
}
collect(dir, 'afterword-companion');
writeFileSync(resolve('dist/afterword-companion.zip'), zipSync(files, { level: 6 }));
rmSync(temp, { recursive: true });
console.log('Companion package built.');
