import { mkdirSync, existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createStore } from './store.mjs';
import { createApp } from './app.mjs';
try { process.loadEnvFile('.env'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const production = process.env.NODE_ENV === 'production';
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
const store = createStore(resolve(dir, 'afterword.sqlite'), key);
chmodSync(resolve(dir, 'afterword.sqlite'), 0o600);
store.purge();
const timer = setInterval(() => store.purge(), 60 * 60_000).unref();
const origin = process.env.PUBLIC_ORIGIN || 'http://localhost:4318';
const app = createApp(store, { production, origin, origins: production ? [origin] : [origin, 'http://localhost:5178', 'http://127.0.0.1:5178', 'http://127.0.0.1:4318'], inviteCode: process.env.INVITE_CODE });
const server = app.listen(Number(process.env.PORT || 4318), process.env.BIND_HOST || '127.0.0.1', () => console.log(`Afterword listening on port ${process.env.PORT || 4318}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { clearInterval(timer); server.close(() => { store.close(); process.exit(0); }); setTimeout(() => process.exit(1), 10_000).unref(); });
