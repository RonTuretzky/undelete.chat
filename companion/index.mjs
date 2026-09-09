#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { openQueue, deliverBatch } from './queue.mjs';
import { eventSchema } from '../server/store.mjs';

process.umask(0o077);
const [command = 'run', profile = 'default'] = process.argv.slice(2);
if (command === 'help' || command === '--help') {
  console.log('Afterword companion\n\nsetup [profile]  Pair a platform with your archive\nrun [profile]    Resume an existing connection\nhelp             Show this help\n\nUse one profile per connection, e.g. setup telegram or setup whatsapp.\nLeave each companion process running to capture new messages.'); process.exit(0);
}
if (!['setup', 'run'].includes(command) || !/^[a-z0-9_-]{1,60}$/i.test(profile)) throw new Error('Use setup or run, followed by a simple profile name.');
let muted = false;
const output = new Writable({ write(chunk, _encoding, callback) { if (!muted) process.stdout.write(chunk); callback(); } });
const rl = createInterface({ input: process.stdin, output, terminal: !!process.stdin.isTTY });
const ask = async (prompt, secret = false) => {
  if (secret && process.stdin.isTTY) { process.stdout.write(prompt); muted = true; }
  try { return (await rl.question(secret && process.stdin.isTTY ? '' : prompt)).trim(); }
  finally { muted = false; if (secret && process.stdin.isTTY) process.stdout.write('\n'); }
};
const directory = resolve(process.env.AFTERWORD_COMPANION_DIR || join(homedir(), '.afterword'), profile);
mkdirSync(directory, { recursive: true, mode: 0o700 });
const configFile = join(directory, 'config.json');
let config = existsSync(configFile) ? JSON.parse(readFileSync(configFile, 'utf8')) : {};
const save = patch => { config = { ...config, ...patch }; writeFileSync(configFile, JSON.stringify(config, null, 2), { mode: 0o600 }); };
console.log(`\nAfterword companion · ${profile}\n`);
if (command === 'setup' || !config.server || !config.token) {
  const server = new URL(await ask('Archive server URL: '));
  if (server.protocol !== 'https:' && !(server.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(server.hostname))) throw new Error('An HTTPS server URL is required (except localhost).');
  if (server.username || server.password || server.pathname !== '/') throw new Error('Enter only the archive origin, without credentials or a path.');
  const token = await ask('Connection key from your dashboard: ', true);
  const res = await fetch(`${server.origin}/api/heartbeat`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ health: 'waiting', detail: 'Companion setup in progress' }), signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Connection key could not be verified (HTTP ${res.status}).`);
  const { platform } = await res.json();
  if (config.token && config.token !== token) throw new Error('This profile already belongs to a connection. Use a new profile name to avoid mixing queued messages.');
  save({ server: server.origin, token, platform });
}
const queue = openQueue(directory);
let state = { health: 'waiting', detail: 'Starting companion' }, flushing = false, stopped = false, stopAdapter, heartbeatTimer, flushTimer;
let consecutiveFailures = 0, failedUntil = 0;
const health = (health, detail = '') => { const changed = state.health !== health; state = { health, detail }; if (changed) console.log(`${health}: ${detail}`); };
const capture = input => { if (stopped) return; try { const event = eventSchema.parse(input); if (!event.ephemeral) queue.add(event); } catch { health('error', 'An event could not be normalized. Update the companion.'); } };
async function heartbeat() {
  if (stopped) return;
  try {
    const rejected = queue.rejected();
    const reported = rejected ? { health: 'error', detail: `${rejected} events were rejected by the archive. Update the companion; events remain in the local queue.` } : state;
    const res = await fetch(`${config.server}/api/heartbeat`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.token}` }, body: JSON.stringify({ ...reported, queued: queue.count() }), signal: AbortSignal.timeout(12_000) });
    if (res.status === 401) { console.error('Connection revoked. Stopping capture.'); await shutdown(1); }
  } catch { /* Server unavailable: keep collecting into the durable queue. */ }
}
async function flush() {
  if (flushing || stopped || Date.now() < failedUntil) return;
  flushing = true;
  try { await deliverBatch({ queue, server: config.server, token: config.token }); consecutiveFailures = 0; }
  catch (error) { if (error.status === 401) { console.error('Connection revoked. Stopping capture.'); await shutdown(1); } else { failedUntil = Date.now() + Math.min(60_000, 2000 * 2 ** consecutiveFailures++); } }
  finally { flushing = false; }
}
async function shutdown(code = 0) {
  if (stopped) return;
  stopped = true; clearInterval(heartbeatTimer); clearInterval(flushTimer);
  await stopAdapter?.(); rl.close();
  console.log(`Stopped. ${queue.count()} unsent events remain in the encrypted local queue.`);
  queue.close(); process.exit(code);
}
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => shutdown());
try {
  const ctx = { config, directory, queue, ask, save, capture, health };
  heartbeatTimer = setInterval(heartbeat, 25_000); flushTimer = setInterval(flush, 2000);
  const adapters = { discord: 'startDiscord', telegram: 'startTelegram', signal: 'startSignal', whatsapp: 'startWhatsApp' };
  if (!adapters[config.platform]) throw new Error('Unknown platform in connection configuration.');
  const module = await import(`./adapters/${config.platform}.mjs`);
  stopAdapter = await module[adapters[config.platform]](ctx);
  rl.close(); await heartbeat();
  console.log('Capturing. Keep this process running; Ctrl+C stops it.\nPlatform sessions and encrypted retry data are stored locally.');
} catch (error) { console.error(error.message); health('error', 'Setup failed. Check your companion terminal.'); await heartbeat(); await shutdown(1); }
