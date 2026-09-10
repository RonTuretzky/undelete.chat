import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, cpSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

test('the downloadable companion loads its complete dependency graph and help command', t => {
  const root = resolve('.'), dir = mkdtempSync(join(tmpdir(), 'afterword-package-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const folder of ['server', 'companion', 'docs']) cpSync(join(root, folder), join(dir, folder), { recursive: true, filter: path => !path.split(/[\\/]/).includes('node_modules') });
  execFileSync(process.execPath, [join(root, 'deploy/package-companion.mjs')], { cwd: dir, stdio: 'pipe' });
  execFileSync('tar', ['-xzf', join(dir, 'dist/afterword-companion.tar.gz'), '-C', dir]);
  const extracted = join(dir, 'afterword-companion');
  // Reuse the installed dependencies; the artifact must supply every own module.
  symlinkSync(join(root, 'node_modules'), join(extracted, 'node_modules'), 'dir');
  const output = execFileSync(process.execPath, ['companion/index.mjs', '--help'], { cwd: extracted, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  assert.match(output, /Afterword companion/); assert.match(output, /pair --server URL/);
});
