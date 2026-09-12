import { mkdirSync, existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createStore } from './store.mjs';
import { createApp } from './app.mjs';
import { createBackupService, clearBackupStaging } from './backup-service.mjs';
import { offsiteConfig } from './offsite.mjs';
import { createOperationsMonitor } from './monitor.mjs';
import { billingConfig, createBilling, billingMessages } from './billing.mjs';
import { createCollectorManager } from './hosted/manager.mjs';
import { MiB, positiveBytes } from './capacity.mjs';
process.umask(0o077);
try { process.loadEnvFile('.env'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const production = process.env.NODE_ENV === 'production';
const backupConfig = production ? offsiteConfig() : null;
const dir = resolve(process.env.DATA_DIR || 'data');
mkdirSync(dir, { recursive: true, mode: 0o700 });
let key = process.env.ARCHIVE_KEY;
if (!key) {
  if (production) throw new Error('Set ARCHIVE_KEY before starting in production.');
  const file = resolve(dir, '.archive-key');
  if (!existsSync(file)) writeFileSync(file, randomBytes(32).toString('hex'), { mode: 0o600 });
  key = readFileSync(file, 'utf8').trim();
}
if (production && !process.env.PUBLIC_ORIGIN?.startsWith('https://')) throw new Error('Set an HTTPS PUBLIC_ORIGIN.');
const store = createStore(resolve(dir, 'afterword.sqlite'), key, {
  accountLimitBytes: positiveBytes(process.env.ARCHIVE_ACCOUNT_BYTES, 128 * MiB, 'ARCHIVE_ACCOUNT_BYTES'),
  serverLimitBytes: positiveBytes(process.env.ARCHIVE_SERVER_BYTES, 1024 * MiB, 'ARCHIVE_SERVER_BYTES'),
  minimumFreeBytes: production ? positiveBytes(process.env.ARCHIVE_MIN_FREE_BYTES, 2048 * MiB, 'ARCHIVE_MIN_FREE_BYTES') : 0,
});
chmodSync(resolve(dir, 'afterword.sqlite'), 0o600);
store.purge();
const timer = setInterval(() => { try { store.purge(); } catch (error) { console.error('Retention purge failed:', error.code || error.name); } }, 60 * 60_000).unref();
const origin = process.env.PUBLIC_ORIGIN || 'http://localhost:4318';
const collectors = process.env.HOSTED_COLLECTORS === 'true' ? createCollectorManager(store, {
  key, directory: dir, maxCollectors: Number(process.env.HOSTED_MAX_COLLECTORS || 4),
  runtimeDirectory: process.env.COLLECTOR_RUNTIME_DIR,
  telegramApiId: Number(process.env.TELEGRAM_API_ID), telegramApiHash: process.env.TELEGRAM_API_HASH,
  signalAvailable: process.env.SIGNAL_AVAILABLE !== 'false',
  signalNativeDirectory: process.env.SIGNAL_NATIVE_DIR
}) : null;
const monitor = production ? createOperationsMonitor(store, { directory: dir, offsiteConfigured: !!backupConfig,
  offsiteTarget: backupConfig && { endpoint: backupConfig.endpoint, bucket: backupConfig.bucket }, hostedEnabled: !!collectors }) : null;
const billing = billingConfig() ? createBilling(store, { config: billingConfig(), origin, onLapse: async userId => {
  // A lapsed subscription stops hosted capture; encrypted sessions and queues stay in place for resumption.
  for (const c of store.hostedConnections().filter(c => c.user_id === userId && c.enabled)) {
    await collectors?.suspend(c.id);
    store.db.prepare("UPDATE connections SET detail=? WHERE id=? AND revoked=0").run(billingMessages.subscription_required, c.id);
  }
} }) : null;
if (production && !billing) console.warn('Billing is not configured: every account is entitled without a subscription.');
const app = createApp(store, { collectors, monitor, billing, production, origin, origins: production ? [origin] : [origin, 'http://localhost:5178', 'http://127.0.0.1:5178', 'http://127.0.0.1:4318'], inviteCode: process.env.INVITE_CODE });
const server = app.listen(Number(process.env.PORT || 4318), process.env.BIND_HOST || '127.0.0.1', () => console.log(`undelete.chat listening on port ${process.env.PORT || 4318}`));
await collectors?.restore();
const backups = production ? createBackupService(dir, { key, config: backupConfig, minimumFreeBytes: store.capacity.limits.minimumFreeBytes }) : null;
if (production) await clearBackupStaging(dir);
const backupTimer = backups ? setInterval(() => backups.run(), 15 * 60_000).unref() : null;
backups?.run();
const monitorTimer = monitor ? setInterval(() => monitor.run(), 15_000).unref() : null;
monitor?.run();
let stopping = false;
async function shutdown(code = 0) {
  if (stopping) return; stopping = true; clearInterval(timer); clearInterval(backupTimer); clearInterval(monitorTimer);
  // Never hang on a stuck worker or connection; Docker restarts a clean process.
  setTimeout(() => process.exit(code), 25_000).unref();
  const closed = new Promise(resolve => server.close(resolve));
  try { await Promise.all([collectors?.close(), backups?.close(), monitor?.close()]); await closed; store.close(); }
  catch (error) { console.error('Shutdown step failed:', error?.code || error?.name); code ||= 1; }
  process.exit(code);
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => shutdown(0));
// A stray rejection in a timer or IPC listener must not take every customer's
// hosted session down. Only error codes are logged; never payloads or secrets.
process.on('unhandledRejection', error => console.error('Unhandled rejection:', error?.code || error?.name || 'unknown'));
process.on('uncaughtException', error => { console.error('Uncaught exception:', error?.code || error?.name || 'unknown'); shutdown(1); });
