import { readdir, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { DatabaseSync, backup } from 'node:sqlite';

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
        if (entry.isDirectory()) { await visit(path); continue; }
        if (!entry.isFile() || /(?:-wal|-shm|\.lock|\.backup)$/.test(entry.name)) continue;
        let data = await readFile(path);
        if (data.subarray(0, 16).toString() === 'SQLite format 3\0') {
          const temp = path + '.backup';
          const db = new DatabaseSync(path, { readOnly: true });
          try { await backup(db, temp); data = await readFile(temp); }
          finally { db.close(); await rm(temp, { force: true }); }
        }
        bytes += data.length;
        if (bytes > 64 * 1024 * 1024) throw new Error('Signal session exceeds storage limit');
        files[relative(directory, path)] = data.toString('base64');
      }
    }
    await visit(directory);
    queue.set('signal-session-files', files);
  }
  return { checkpoint() { if (!pending) pending = snapshot().finally(() => { pending = null; }); return pending; } };
}
