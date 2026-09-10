import { readFile, writeFile, rename, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createBackup } from './backup.mjs';
import { offsiteConfig, offsiteClient, replicateBackup, pruneRemoteBackups } from './offsite.mjs';

const day = 24 * 60 * 60_000;
export function createBackupService(directory, { key, minimumFreeBytes, config = offsiteConfig(), client = config && offsiteClient(config),
  snapshot = createBackup, replicate = replicateBackup, prune = pruneRemoteBackups, now = Date.now, log = console } = {}) {
  let running = null, stopping = false, latest = null;
  const controller = new AbortController(), statusFile = join(directory, 'backup-status.json');
  const persist = async status => {
    const temporary = statusFile + '.partial';
    await writeFile(temporary, JSON.stringify(status), { mode: 0o600 }); await rename(temporary, statusFile);
  };
  const run = () => {
    if (stopping) return Promise.resolve();
    if (running) return running;
    running = (async () => {
      let previous = {};
      try { previous = JSON.parse(await readFile(statusFile, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') log.error('Backup status could not be read.'); }
      const status = { ...previous, offsiteConfigured: !!config, lastAttemptAt: new Date(now()).toISOString(), state: 'running' };
      const target = config ? { endpoint: config.endpoint, bucket: config.bucket } : null;
      if (status.offsiteTarget?.endpoint !== target?.endpoint || status.offsiteTarget?.bucket !== target?.bucket) {
        delete status.lastOffsiteAt; delete status.offsiteSnapshot;
      }
      status.offsiteTarget = target;
      let phase = 'snapshot';
      try {
        if (!latest || now() - Date.parse(latest.createdAt) >= day) {
          latest = await snapshot(directory, { minimumFreeBytes });
          status.lastSnapshotAt = latest.createdAt;
        }
        if (config && !stopping) {
          phase = 'offsite';
          // A failed upload is retried every 15 minutes from the same complete
          // local snapshot. No new collector or archive process is started.
          const receipt = await replicate(latest.directory, { config, client, key, minimumFreeBytes,
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10 * 60_000)]) });
          status.lastOffsiteAt = receipt.verifiedAt; status.offsiteSnapshot = receipt.snapshot;
          phase = 'cleanup';
          await prune({ config, client, protectedReceipt: receipt, now: now(), signal: controller.signal });
        }
        status.state = config ? 'complete' : 'local_only'; delete status.failure;
        log.info(config ? 'Archive backup and offsite verification completed.' : 'Archive backup completed; offsite storage is not configured.');
      } catch (e) {
        status.state = stopping ? 'interrupted' : 'failed';
        status.failure = e.code === 'disk_capacity' ? 'disk_capacity' : phase + '_failed';
        log.error('Archive backup did not complete (' + status.failure + ').');
      }
      await persist(status);
      return status;
    })().catch(() => { log.error('Backup status could not be saved.'); }).finally(() => { running = null; });
    return running;
  };
  return { run, async close() { stopping = true; controller.abort(); await running; client?.destroy?.(); } };
}

// Interrupted encrypted staging files can occupy the archive disk after a
// forced restart. This only removes our staging directories, never snapshots.
export async function clearBackupStaging(directory) {
  let entries = []; try { entries = await readdir(join(directory, 'backups'), { withFileTypes: true }); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  for (const entry of entries) if (entry.isDirectory() && /^\d{4}-\d{2}-\d{2}T/.test(entry.name)) {
    const root = join(directory, 'backups', entry.name);
    for (const child of await readdir(root, { withFileTypes: true })) if (child.isDirectory() && /^\.upload-[a-zA-Z0-9]{6}$/.test(child.name)) await rm(join(root, child.name), { recursive: true, force: true });
  }
}
