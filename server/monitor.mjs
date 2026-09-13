import { DatabaseSync } from 'node:sqlite';
import { readFile, writeFile, rename, readdir, lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { freeBytes, MiB } from './capacity.mjs';

const minute = 60_000, hour = 60 * minute, maxSources = 128;
const snapshotName = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-f0-9]{8}$/;
const snapshotFile = /^(afterword\.sqlite|collectors\/[a-f0-9-]{36}\/queue\.sqlite)$/;
async function readJson(path) {
  const info = await lstat(path);
  if (!info.isFile() || info.size > 512 * 1024) throw new Error('Invalid monitoring metadata.');
  return JSON.parse(await readFile(path, 'utf8'));
}
function age(time, now) {
  const timestamp = typeof time === 'number' ? time : Date.parse(time);
  return Number.isFinite(timestamp) && timestamp > 0 && timestamp <= now + minute ? Math.max(0, now - timestamp) : Infinity;
}
async function latestBackup(directory) {
  const root = join(directory, 'backups');
  const entries = (await readdir(root, { withFileTypes: true })).filter(e => e.isDirectory() && snapshotName.test(e.name)).map(e => e.name).sort().reverse();
  if (!entries.length) return null;
  try {
    const path = join(root, entries[0]), manifest = await readJson(join(path, 'manifest.json'));
    if (manifest.format !== 1 || manifest.keyIncluded !== false || !Array.isArray(manifest.files) || manifest.files.length > 4096 || !manifest.files.includes('afterword.sqlite') || manifest.files.some(name => typeof name !== 'string' || !snapshotFile.test(name))) throw new Error('Invalid completed backup.');
    for (const name of manifest.files) {
      const file = await lstat(join(path, name));
      if (!file.isFile() || file.size < 1) throw new Error('Missing backup database.');
    }
    return { name: entries[0], createdAt: manifest.createdAt, files: manifest.files.length };
  } catch { throw new Error('Invalid completed backup.'); }
}
export function readQueueStatus(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    db.exec('PRAGMA busy_timeout=250');
    const hasTime = db.prepare('PRAGMA table_info(queue)').all().some(c => c.name === 'queued_at');
    const oldest = db.prepare(`SELECT id,${hasTime ? 'queued_at' : '0 AS queued_at'} FROM queue WHERE error IS NULL ORDER BY id LIMIT 1`).get();
    return { pending: db.prepare('SELECT count(*) AS n FROM queue WHERE error IS NULL').get().n,
      rejected: db.prepare('SELECT count(*) AS n FROM queue WHERE error IS NOT NULL').get().n,
      oldestId: oldest?.id ?? null, oldestQueuedAt: oldest?.queued_at || null };
  } finally { db.close(); }
}

export function createOperationsMonitor(store, { directory, offsiteConfigured = false, offsiteTarget = null, hostedEnabled = true, now = Date.now,
  availableBytes = freeBytes, queueStatus = readQueueStatus, startupGraceMs = 15 * minute,
  collectorGraceMs = 2 * minute, queueMaxAgeMs = 5 * minute, log = console } = {}) {
  const statusFile = join(directory, 'operations-status.json'), startedAt = now();
  let current = null, previous = null, running = null, stopped = false, loaded = false, lastSignature;
  const run = () => {
    if (stopped) return Promise.resolve(current);
    if (running) return running;
    running = (async () => {
      if (!loaded) {
        loaded = true;
        try { previous = await readJson(statusFile); } catch { /* Fresh checks rebuild an absent or damaged report. */ }
      }
      const time = now(), starting = time - startedAt < startupGraceMs, issues = [], trackers = {}, metrics = {}, collectors = [];
      let established = 0, down = 0;
      const issue = (code, severity, fields = {}) => issues.push({ code, severity, ...fields });
      const firstObserved = key => {
        const saved = previous?.trackers?.[key];
        const first = Number.isFinite(saved) && saved > 0 && saved <= time ? saved : time;
        trackers[key] = first; return first;
      };
      const delayed = (code, connectionId, grace = collectorGraceMs) => {
        const since = firstObserved(code + ':' + (connectionId || 'service'));
        issue(code, time - since >= grace ? 'critical' : 'warning', { ...(connectionId ? { connectionId } : {}), since: new Date(since).toISOString() });
      };
      try { store.db.prepare('SELECT 1').get(); }
      catch { issue('database_unavailable', 'critical'); }
      try {
        metrics.freeDiskBytes = availableBytes(directory); metrics.diskReserveBytes = store.capacity.limits.minimumFreeBytes;
        if (!Number.isFinite(metrics.freeDiskBytes) || metrics.freeDiskBytes < 0) throw new Error('Invalid disk reading.');
        if (metrics.freeDiskBytes < metrics.diskReserveBytes) issue('disk_reserve', 'critical');
        else if (metrics.freeDiskBytes < metrics.diskReserveBytes + 256 * MiB) issue('disk_low', 'warning');
        metrics.archiveBytes = store.db.prepare('SELECT used_bytes FROM archive_usage WHERE id=1').get().used_bytes;
        metrics.archiveLimitBytes = store.capacity.limits.serverLimitBytes;
        if (metrics.archiveBytes >= metrics.archiveLimitBytes) issue('archive_full', 'critical');
        else if (metrics.archiveBytes >= metrics.archiveLimitBytes * .85) issue('archive_near_limit', 'warning');
      } catch { issue('storage_check_failed', 'critical'); }
      try {
        const backup = await latestBackup(directory);
        metrics.latestLocalBackup = backup;
        if (!backup) issue('local_backup_missing', starting ? 'warning' : 'critical');
        else if (age(backup.createdAt, time) > 26 * hour) issue('local_backup_stale', 'critical');
      } catch (error) { issue(error.code === 'ENOENT' ? 'local_backup_missing' : 'local_backup_invalid', starting && error.code === 'ENOENT' ? 'warning' : 'critical'); }
      try {
        const backup = await readJson(join(directory, 'backup-status.json'));
        const targetMatches = !offsiteTarget || backup.offsiteTarget?.endpoint === offsiteTarget.endpoint && backup.offsiteTarget?.bucket === offsiteTarget.bucket;
        metrics.backupLastAttemptAt = backup.lastAttemptAt || null; metrics.lastOffsiteAt = targetMatches ? backup.lastOffsiteAt || null : null;
        if (age(backup.lastAttemptAt, time) > 45 * minute) issue('backup_scheduler_stale', 'critical');
        if (backup.state === 'failed' || backup.state === 'interrupted') delayed('backup_job_failed', null, 20 * minute);
        if (offsiteConfigured && age(metrics.lastOffsiteAt, time) > 26 * hour) issue('offsite_backup_stale', !metrics.lastOffsiteAt && starting ? 'warning' : 'critical');
      } catch (error) { issue('backup_status_unavailable', starting && error.code === 'ENOENT' ? 'warning' : 'critical'); }
      if (!offsiteConfigured) issue('offsite_unconfigured', 'warning');
      try {
        const rows = store.db.prepare(`SELECT c.id,c.platform,c.health,c.last_seen,c.connected_at,c.paused,c.capacity_reason,h.enabled
          FROM hosted_collectors h JOIN connections c ON c.id=h.connection_id
          WHERE c.revoked=0 AND c.collector='hosted' AND (h.enabled=1 OR c.capacity_reason IN ('server_capacity','disk_capacity','collector_capacity'))
          ORDER BY c.id LIMIT ?`).all(maxSources + 1);
        if (rows.length > maxSources) issue('collector_monitor_limit', 'critical');
        if (!hostedEnabled && rows.some(c => c.enabled)) issue('hosted_collectors_disabled', 'critical');
        for (const c of rows.slice(0, maxSources)) {
          if (!/^[a-f0-9-]{36}$/.test(c.id)) { issue('collector_identifier_invalid', 'critical'); continue; }
          const observation = { id: c.id, platform: c.platform, enabled: !!c.enabled, paused: !!c.paused,
            connectedAt: c.connected_at, health: c.health, lastSeen: c.last_seen, capacityReason: c.capacity_reason || null };
          collectors.push(observation);
          // One customer's stopped or unlinked source is their problem to fix from
          // Connections and is reported as a warning. Only server-side capacity or
          // every established source failing at once is an operator emergency.
          if (c.capacity_reason) { issue('collector_storage_stopped', ['server_capacity', 'disk_capacity'].includes(c.capacity_reason) ? 'critical' : 'warning', { connectionId: c.id, reason: c.capacity_reason }); continue; }
          if (c.enabled && !c.paused && c.connected_at) {
            established++;
            if (age(c.last_seen, time) > collectorGraceMs) { issue('collector_heartbeat_stale', 'warning', { connectionId: c.id }); down++; }
            else if (c.health !== 'connected') {
              const since = firstObserved('collector_unavailable:' + c.id);
              issue('collector_unavailable', 'warning', { connectionId: c.id, since: new Date(since).toISOString() });
              if (time - since >= collectorGraceMs) down++;
            }
          }
          try {
            // Queue headers and timestamps suffice; monitor never decrypts a
            // message, account token, or saved platform session.
            const path = join(directory, 'collectors', c.id, 'queue.sqlite');
            const file = await lstat(path);
            if (!file.isFile()) throw new Error('Invalid collector queue file.');
            const queue = queueStatus(path); observation.queue = queue;
            if (queue.rejected) issue('collector_rejected_events', 'warning', { connectionId: c.id, count: queue.rejected });
            if (queue.pending && queue.oldestId !== null) {
              const queuedAt = queue.oldestQueuedAt || firstObserved('oldest:' + c.id + ':' + queue.oldestId);
              if (age(queuedAt, time) >= queueMaxAgeMs) issue('collector_delivery_stalled', 'critical', { connectionId: c.id });
            }
          } catch (error) {
            if (error.code !== 'ENOENT' || c.connected_at) delayed('collector_queue_unreadable', c.id);
          }
        }
        if (established > 0 && down === established) issue('collectors_all_unavailable', 'critical', { count: established });
      } catch { issue('collector_check_failed', 'critical'); }
      const result = { format: 1, checkedAt: new Date(time).toISOString(), status: issues.some(i => i.severity === 'critical') ? 'critical' : issues.length ? 'warning' : 'healthy',
        coverage: { hostedEnabled, offsiteConfigured, maxSources }, issues, metrics, collectors, trackers };
      try {
        const temporary = statusFile + '.partial';
        await writeFile(temporary, JSON.stringify(result), { mode: 0o600 }); await rename(temporary, statusFile);
      } catch { issue('monitor_report_write_failed', 'critical'); result.status = 'critical'; }
      current = result; previous = result;
      const signature = result.status + ':' + issues.map(i => i.code + ':' + (i.connectionId || '') + ':' + i.severity).join(',');
      if (signature !== lastSignature) {
        lastSignature = signature;
        log.info('Service monitor: ' + result.status + (issues.length ? ' (' + [...new Set(issues.map(i => i.code))].join(', ') + ')' : '') + '.');
      }
      return result;
    })().catch(() => {
      current = { checkedAt: new Date(now()).toISOString(), status: 'critical', issues: [{ code: 'monitor_failed', severity: 'critical' }] };
      return current;
    }).finally(() => { running = null; });
    return running;
  };
  return { run, snapshot: () => current,
    publicState: () => ({ ok: !!current && current.status !== 'critical' && age(current.checkedAt, now()) <= minute, service: 'afterword' }),
    async close() { stopped = true; await running; } };
}

export async function readOperationsStatus(directory, time = Date.now()) {
  try {
    const status = await readJson(join(directory, 'operations-status.json'));
    const stale = age(status.checkedAt, time) > minute;
    const { trackers, ...report } = status;
    return { ...report, stale, ...(stale ? { status: 'critical', issues: [...(report.issues || []), { code: 'monitor_report_stale', severity: 'critical' }] } : {}) };
  } catch { return { status: 'critical', stale: true, issues: [{ code: 'monitor_report_unavailable', severity: 'critical' }] }; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv[2] !== 'status') { console.error('Usage: node server/monitor.mjs status'); process.exitCode = 1; }
  else console.log(JSON.stringify(await readOperationsStatus(resolve(process.env.DATA_DIR || 'data'))));
}
