import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function serverOrigin(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Enter the full server URL shown in Connections, beginning with https://.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw new Error('Use HTTPS for your archive server. HTTP is allowed only on localhost.');
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Enter only the server address, without a path, password, or query.');
  return url.origin;
}

export async function redeemCode(server, code, fetcher = fetch) {
  const response = await fetcher(`${serverOrigin(server)}/api/pair`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }), signal: AbortSignal.timeout(20_000) });
  let data;
  try { data = await response.json(); } catch { throw new Error('The server did not return a pairing response. Check its address in your browser.'); }
  if (!response.ok) throw new Error(data.error || 'Pairing failed. Generate a new code in Connections and try again.');
  const c = data.connection;
  if (!c || !['telegram', 'signal', 'whatsapp'].includes(c.platform) || !/^[a-z]+-[a-f0-9]{8}$/.test(c.profile) || !/^aw_[a-zA-Z0-9_-]{43}$/.test(c.token) || typeof c.connectionId !== 'string') throw new Error('The archive returned an invalid connection. Check the server address.');
  return c;
}

export function savePairedProfile(baseDirectory, server, connection) {
  const directory = join(baseDirectory, connection.profile);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = join(directory, 'config.json');
  const previous = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  if (previous.connectionId && (previous.connectionId !== connection.connectionId || previous.server !== serverOrigin(server))) throw new Error('This profile belongs to another source. Its existing data has been preserved.');
  const config = { ...previous, server: serverOrigin(server), token: connection.token, platform: connection.platform, connectionId: connection.connectionId };
  writeFileSync(file, JSON.stringify(config, null, 2), { mode: 0o600 });
  return { directory, config };
}
