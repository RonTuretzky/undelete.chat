import { readdir, readFile, writeFile, mkdir, rm, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { DatabaseSync, backup } from 'node:sqlite';
import { capacityError, MiB } from '../capacity.mjs';

// signal-cli needs regular files. Keep its working files in the container's tmpfs;
// persist only authenticated ciphertext in the connection's encrypted queue.
export async function signalVault(directory, queue) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const saved = queue.get('signal-session-files') || {};
  for (const [name, value] of Object.entries(saved)) {
    const file = resolve(directory, name);
    if (!name || name.includes('\\') || !file.startsWith(resolve(directory) + '/')) throw new Error('Invalid saved Signal path');
    await mkdir(join(file, '..'), { recursive: true, mode: 0o700 });
    await writeFile(file, Buffer.from(value, 'base64'), { mode: 0o600 });
  }
  let pending;
  async function snapshot() {
    const files = {}; let bytes = 0;
    async function visit(dir) {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) { if (entry.name !== 'attachments' && entry.name !== 'avatars' && entry.name !== 'stickers') await visit(path); continue; }
        if (!entry.isFile() || /(?:-wal|-shm|\.lock|\.backup)$/.test(entry.name)) continue;
        if (bytes + (await stat(path)).size > 16 * MiB) throw capacityError('collector_capacity');
        let data = await readFile(path);
        if (data.subarray(0, 16).toString() === 'SQLite format 3\0') {
          const temp = path + '.backup';
          const db = new DatabaseSync(path, { readOnly: true });
          try {
            const projected = db.prepare('PRAGMA page_count').get().page_count * db.prepare('PRAGMA page_size').get().page_size;
            if (bytes + projected > 16 * MiB) throw capacityError('collector_capacity');
            await backup(db, temp); if (bytes + (await stat(temp)).size > 16 * MiB) throw capacityError('collector_capacity'); data = await readFile(temp);
          }
          finally { db.close(); await rm(temp, { force: true }); }
        }
        bytes += data.length;
        if (bytes > 16 * MiB) throw capacityError('collector_capacity');
        files[relative(directory, path)] = data.toString('base64');
      }
    }
    await visit(directory);
    queue.set('signal-session-files', files);
  }
  return { checkpoint() { if (!pending) pending = snapshot().finally(() => { pending = null; }); return pending; } };
}
