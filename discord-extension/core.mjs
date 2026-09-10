import { Unzlib } from 'fflate';
import { Decompress } from 'fzstd';

export function discordPage(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && ['discord.com', 'ptb.discord.com', 'canary.discord.com'].includes(u.hostname); } catch { return false; }
}
export function gatewayOptions(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'wss:' || !/^gateway(?:-[a-z0-9-]+)?\.discord\.gg$/.test(u.hostname)) return null;
    return { encoding: u.searchParams.get('encoding') || 'json', compression: u.searchParams.get('compress') || '' };
  } catch { return null; }
}

// Incremental framing handles split UTF-8, compressed chunks, and joined packets.
// Raw packets exist only in memory; only allowlisted DM fields reach storage.
export function gatewayDecoder(options, receive) {
  if (options.encoding !== 'json') throw new Error('Unsupported Discord encoding. Capture has stopped.');
  let buffer = '', depth = 0, quoted = false, escaped = false;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  function text(chunk) {
    for (const char of chunk) {
      if (!depth && /\s/.test(char)) continue;
      if (!depth && char !== '{') throw new Error('Unsupported Discord packet.');
      buffer += char;
      if (buffer.length > 32 * 1024 * 1024) throw new Error('Discord packet exceeded the capture limit.');
      if (quoted) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') quoted = false; }
      else if (char === '"') quoted = true;
      else if (char === '{' || char === '[') depth++;
      else if (char === '}' || char === ']') depth--;
      if (!depth) { const packet = JSON.parse(buffer); buffer = ''; receive(packet); }
    }
  }
  const output = bytes => text(decoder.decode(bytes, { stream: true }));
  const inflate = options.compression === 'zlib-stream' ? new Unzlib(output) : options.compression === 'zstd-stream' ? new Decompress(output) : null;
  if (options.compression && !inflate) throw new Error('Unsupported Discord compression. Capture has stopped.');
  return frame => {
    if (frame.opcode === 1) { text(frame.payloadData); return; }
    if (frame.opcode !== 2) return;
    if (frame.payloadData.length > 48 * 1024 * 1024) throw new Error('Discord frame exceeded the capture limit.');
    const bytes = Uint8Array.from(atob(frame.payloadData), c => c.charCodeAt(0));
    if (inflate) inflate.push(bytes, false); else output(bytes);
  };
}

export { PersonalDiscord, AccountChanged } from '../companion/adapters/discord-personal.mjs';
