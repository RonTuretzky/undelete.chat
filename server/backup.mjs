import { DatabaseSync, backup } from 'node:sqlite';
import { mkdir, readdir, rename, rm, chmod, writeFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { capacityError, freeBytes, MiB, positiveBytes } from './capacity.mjs';

export async function createBackup(directory, { keep = 7, minimumFreeBytes = 64 * MiB, availableBytes = freeBytes } = {}) {
  const root = resolve(directory), backups = join(root, 'backups');
  await mkdir(backups, { recursive: true, mode: 0o700 });
  const name = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8);
  const stage = join(backups, '.' + name + '.partial'), destination = join(backups, name), files = [];
  await mkdir(stage, { mode: 0o700 });
  const copy = async name => {
    const target = join(stage, name); await mkdir(join(target, '..'), { recursive: true, mode: 0o700 });
    const source = new DatabaseSync(join(root, name), { readOnly: true });
    try {
      const bytes = source.prepare('PRAGMA page_count').get().page_count * source.prepare('PRAGMA page_size').get().page_size;
      if (availableBytes(root) < minimumFreeBytes + bytes) throw capacityError('disk_capacity');
      await backup(source, target); await chmod(target, 0o600); files.push(name);
    }
    finally { source.close(); }
  };
  try {
    let sources = []; try { sources = await readdir(join(root, 'collectors'), { withFileTypes: true }); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    // Queue snapshots precede the archive: events acknowledged during the
    // snapshot can still be recovered from the later archive copy or replayed.
    for (const source of sources) if (source.isDirectory() && /^[a-f0-9-]{36}$/.test(source.name)) {
      const file = `collectors/${source.name}/queue.sqlite`;
      try { await stat(join(root, file)); await copy(file); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    }
    await copy('afterword.sqlite');
    const manifest = { format: 1, createdAt: new Date().toISOString(), files, keyIncluded: false };
    await writeFile(join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 });
    await rename(stage, destination);
    const old = (await readdir(backups, { withFileTypes: true })).filter(e => e.isDirectory() && /^\d{4}-\d{2}-\d{2}T/.test(e.name)).map(e => e.name).sort().reverse();
    for (const name of old.slice(Math.max(1, keep))) await rm(join(backups, name), { recursive: true, force: true });
    return { directory: destination, ...manifest };
  } catch (error) { await rm(stage, { recursive: true, force: true }); throw error; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await createBackup(process.env.DATA_DIR || 'data', { minimumFreeBytes: positiveBytes(process.env.ARCHIVE_MIN_FREE_BYTES, 64 * MiB, 'ARCHIVE_MIN_FREE_BYTES') });
  console.log(JSON.stringify(result));
}
