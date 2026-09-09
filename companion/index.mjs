#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import { serverOrigin, redeemCode, savePairedProfile } from './pairing.mjs';
import { openQueue, deliverBatch } from './queue.mjs';
import { eventSchema } from '../server/store.mjs';

process.umask(0o077);
const { values: flags, positionals } = parseArgs({ allowPositionals: true, options: { server: { type: 'string' }, help: { type: 'boolean' } } });
const [command = 'run', requestedProfile = 'default'] = positionals;
let profile = requestedProfile;
if (command === 'help' || flags.help) {
  console.log('Afterword companion\n\npair --server URL   Pair using a short code from Connections\nrun PROFILE         Resume a paired connection\ncredentials PROFILE Replace saved platform credentials\nrelink PROFILE      Reset a platform login while keeping your queue\ndoctor              Check your computer\nsetup PROFILE       Advanced: pair with a long-lived connection key\n\nNew here? Open Connections in your archive and follow the guided setup.'); process.exit(0);
}
if (command === 'doctor') {
  console.log(`Node.js ${process.versions.node} — Node 22.13 or newer required.`);
  const result = spawnSync('signal-cli', ['--version'], { encoding: 'utf8', timeout: 10000 });
  console.log(result.status === 0 ? 'signal-cli is available.' : 'signal-cli is not available (needed only for Signal).');
  console.log('Next: open Connections in your archive, choose a platform, and copy its pairing command.'); process.exit(0);
}
if (!['setup', 'run', 'pair', 'credentials', 'relink'].includes(command) || !/^[a-z0-9_-]{1,60}$/i.test(profile)) {
  console.error('Unknown command or profile. Run npm start -- help for instructions.'); process.exit(1);
}
let muted = false;
const output = new Writable({ write(chunk, _encoding, callback) { if (!muted) process.stdout.write(chunk); callback(); } });
const rl = createInterface({ input: process.stdin, output, terminal: !!process.stdin.isTTY });
const ask = async (prompt, secret = false) => {
  if (secret && process.stdin.isTTY) { process.stdout.write(prompt); muted = true; }
  try { return (await rl.question(secret && process.stdin.isTTY ? '' : prompt)).trim(); }
  finally { muted = false; if (secret && process.stdin.isTTY) process.stdout.write('\n'); }
};
const baseDirectory = resolve(process.env.AFTERWORD_COMPANION_DIR || join(homedir(), '.afterword'));
if (command === 'pair') {
  try {
    console.log('\nPair Afterword with your computer\nKeep the setup page open in your browser.\n');
    const server = serverOrigin(flags.server || await ask('Archive server URL from Connections: '));
    const code = await ask('Pairing code from your browser: ', true);
    const connection = await redeemCode(server, code);
    savePairedProfile(baseDirectory, server, connection);
    profile = connection.profile;
    console.log(`\nPaired with ${connection.name || connection.platform}.\nYour profile: ${profile}\nNext, finish ${connection.platform} sign-in below.\n`);
  } catch (error) {
    console.error(error.cause ? 'Could not reach the archive. Check its HTTPS address and your internet connection.' : error.message);
    console.error('If the code may have been used, generate another one in Connections.'); rl.close(); process.exit(1);
  }
}
const directory = join(baseDirectory, profile);
mkdirSync(directory, { recursive: true, mode: 0o700 });
const configFile = join(directory, 'config.json');
let config = existsSync(configFile) ? JSON.parse(readFileSync(configFile, 'utf8')) : {};
const save = patch => { config = { ...config, ...patch }; writeFileSync(configFile, JSON.stringify(config, null, 2), { mode: 0o600 }); };
console.log(`\nAfterword companion · ${profile}\n`);
if (command === 'setup') {
  try {
    const server = serverOrigin(await ask('Archive server URL: '));
    const token = await ask('Connection key from your dashboard: ', true);
    const res = await fetch(`${server}/api/heartbeat`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ health: 'waiting', detail: 'Companion setup in progress' }), signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`Connection key could not be verified (HTTP ${res.status}).`);
    const { platform } = await res.json();
    if (config.token && config.token !== token) throw new Error('This profile already belongs to a connection. Use a new profile name.');
    save({ server, token, platform });
  } catch (error) { console.error(error.message); rl.close(); process.exit(1); }
}
if (!config.server || !config.token) {
  console.error('This profile has not been paired. Open Connections in your archive and copy its pairing command.'); rl.close(); process.exit(1);
}
if (command === 'credentials') {
  if (config.platform === 'discord') save({ botToken: await ask('New Discord bot token: ', true) });
  else if (config.platform === 'telegram') {
    const apiId = Number(await ask('Telegram application API ID: '));
    const apiHash = await ask('Telegram application API hash: ', true);
    if (!Number.isInteger(apiId) || apiId <= 0 || !/^[a-f0-9]{32}$/i.test(apiHash)) { console.error('Invalid API ID/hash. Existing settings are unchanged.'); rl.close(); process.exit(1); }
    save({ apiId, apiHash });
  } else { console.log('This platform uses QR pairing. Use relink if its session was revoked.'); rl.close(); process.exit(0); }
  console.log(`Saved. Resume with: npm start -- run ${profile}`); rl.close(); process.exit(0);
}
if (command === 'relink') {
  if (config.platform === 'discord') { console.log(`Use: npm start -- credentials ${profile}`); rl.close(); process.exit(0); }
  console.log(`Stop any other companion for ${profile} before continuing. This clears its ${config.platform} login, but preserves your queued events and archive.`);
  if (await ask('Type RELINK to continue: ') !== 'RELINK') { console.log('No changes made.'); rl.close(); process.exit(0); }
  if (config.platform === 'telegram') { const q = openQueue(directory); q.delete('telegram-session'); q.close(); }
  else rmSync(join(directory, `${config.platform}-session`), { recursive: true, force: true });
  console.log(`Session cleared. Now run: npm start -- run ${profile}`); rl.close(); process.exit(0);
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
  console.log(`Companion is running. Follow any QR or sign-in prompts above.\nYour browser setup page will confirm the connection.\nKeep this terminal open; Ctrl+C stops capture.\nTo resume later: npm start -- run ${profile}`);
} catch (error) { console.error(error.message); health('error', 'Setup failed. Check your companion terminal.'); await heartbeat(); await shutdown(1); }
