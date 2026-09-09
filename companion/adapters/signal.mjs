import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import qr from 'qrcode-terminal';
import { signalEvent } from './normalize.mjs';

export async function startSignal(ctx) {
  const directory = join(ctx.directory, 'signal-session');
  const child = spawn('signal-cli', ['--config', directory, 'jsonRpc'], { stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map();
  let counter = 0, stopped = false;
  const rpc = (method, params = {}) => new Promise((resolve, reject) => {
    const id = String(++counter);
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Signal request timed out. Restart setup to try again.')); }, 180_000);
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
  child.stdin.on('error', () => {});
  const failed = message => { ctx.health('error', message); for (const p of pending.values()) p.reject(new Error(message)); pending.clear(); };
  child.on('error', () => failed('signal-cli is unavailable. Install it and restart the companion.'));
  child.on('exit', () => { if (!stopped) failed('signal-cli stopped. Restart the companion to resume capture.'); });
  // Never forward raw signal-cli diagnostics: they can contain message/account data.
  child.stderr.on('data', () => {});
  const lines = createInterface({ input: child.stdout });
  lines.on('line', line => {
    let message; try { message = JSON.parse(line); } catch { return; }
    if (message.id && pending.has(String(message.id))) {
      const item = pending.get(String(message.id)); pending.delete(String(message.id));
      if (message.error) item.reject(new Error(`Signal RPC ${message.error.code}; check your linked device.`)); else item.resolve(message.result);
    }
    if (message.method === 'receive') {
      const envelope = message.params?.envelope || message.params?.result?.envelope;
      if (envelope) {
        const event = signalEvent(envelope, id => ctx.queue.get(`signal-alias:${id}`) || id, (alias, id) => ctx.queue.set(`signal-alias:${alias}`, id));
        if (event) ctx.capture(event);
      }
    }
  });
  const ready = await new Promise(resolve => { child.once('spawn', () => resolve(true)); child.once('error', () => resolve(false)); });
  if (!ready) throw new Error('Install signal-cli, then run the companion again.');
  try {
    const accounts = await rpc('listAccounts');
    if (!accounts?.length) {
      const { deviceLinkUri } = await rpc('startLink');
      console.log('Scan in Signal → Settings → Linked devices:'); qr.generate(deviceLinkUri, { small: true });
      ctx.health('waiting', 'Scan the QR code in your companion terminal');
      await rpc('finishLink', { deviceLinkUri, deviceName: 'Afterword companion' });
    }
    ctx.health('connected', 'Signal linked device connected');
  } catch (error) { child.kill('SIGTERM'); throw error; }
  return () => { stopped = true; for (const p of pending.values()) p.reject(new Error('Shutting down')); pending.clear(); lines.close(); child.kill('SIGTERM'); };
}
