import { createHash, generateKeyPairSync, privateDecrypt, constants } from 'node:crypto';
import WebSocket from 'ws';

export class DiscordSignInError extends Error {}
export const discordClient = Object.freeze({ os: 'Linux', browser: 'Afterword', device: 'Afterword Cloud' });
export const discordAgent = 'Afterword/0.1 (personal archive; experimental)';
const authGateway = 'wss://remote-auth-gateway.discord.gg/?v=2';
const loginEndpoint = 'https://discord.com/api/v9/users/@me/remote-auth/login';

// The account holder approves this session on their own phone. No browser
// cookies, password collection, token extraction, or CAPTCHA solving is used.
export function linkDiscord({ signal, onQR, onWaiting = () => {}, socketFactory = (url, options) => new WebSocket(url, options), fetcher = fetch }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DiscordSignInError('Discord sign-in cancelled.'));
    const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const socket = socketFactory(authGateway, { headers: { Origin: 'https://discord.com', 'User-Agent': discordAgent }, handshakeTimeout: 15_000, maxPayload: 64 * 1024, perMessageDeflate: false, followRedirects: false });
    let finished = false, heartbeat, expiry = Date.now() + 180_000, accountId, sequence = Promise.resolve();
    const controller = new AbortController();
    const timeout = setTimeout(() => finish(new DiscordSignInError('Discord sign-in expired. Request a fresh QR code.')), 180_000);
    const send = value => { if (!finished && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value)); };
    const decrypt = value => {
      if (typeof value !== 'string' || value.length > 2000) throw new DiscordSignInError('Discord returned an invalid login response.');
      return privateDecrypt({ key: keys.privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(value, 'base64'));
    };
    function finish(error, result) {
      if (finished) return;
      finished = true; clearTimeout(timeout); clearInterval(heartbeat); signal?.removeEventListener('abort', abort); controller.abort();
      socket.close(); const kill = setTimeout(() => socket.terminate(), 1500).unref(); socket.once('close', () => clearTimeout(kill));
      error ? reject(error) : resolve(result);
    }
    const abort = () => finish(new DiscordSignInError('Discord sign-in cancelled.'));
    signal?.addEventListener('abort', abort, { once: true });
    socket.on('error', () => finish(new DiscordSignInError('Could not reach Discord sign-in. Try again later.')));
    socket.on('close', () => { if (!finished) finish(new DiscordSignInError('Discord closed sign-in. Request a fresh QR code.')); });
    socket.on('message', data => {
      sequence = sequence.then(async () => {
        if (finished) return;
        const message = JSON.parse(data.toString());
        switch (message.op) {
          case 'hello': {
            if (heartbeat || !Number.isFinite(message.heartbeat_interval) || message.heartbeat_interval < 1000) throw new DiscordSignInError('Discord changed its sign-in protocol.');
            expiry = Date.now() + Math.min(180_000, Math.max(1000, Number(message.timeout_ms) || 180_000));
            heartbeat = setInterval(() => send({ op: 'heartbeat' }), Math.min(message.heartbeat_interval, 60_000));
            send({ op: 'init', encoded_public_key: keys.publicKey.export({ type: 'spki', format: 'der' }).toString('base64') });
            break;
          }
          case 'nonce_proof': send({ op: 'nonce_proof', proof: createHash('sha256').update(decrypt(message.encrypted_nonce)).digest('base64url') }); break;
          case 'pending_remote_init':
            if (typeof message.fingerprint !== 'string' || !/^[A-Za-z0-9_-]{16,256}$/.test(message.fingerprint)) throw new DiscordSignInError('Discord returned an invalid QR code.');
            onQR('https://discord.com/ra/' + message.fingerprint, expiry); break;
          case 'pending_ticket': {
            accountId = decrypt(message.encrypted_user_payload).toString().split(':')[0];
            if (!/^\d{1,24}$/.test(accountId)) throw new DiscordSignInError('Discord did not identify the approving account.');
            onWaiting(); break;
          }
          case 'cancel': finish(new DiscordSignInError('Discord sign-in was cancelled on your phone.')); break;
          case 'pending_login': {
            if (!accountId || typeof message.ticket !== 'string' || message.ticket.length > 4096) throw new DiscordSignInError('Discord returned an incomplete approval.');
            const response = await fetcher(loginEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://discord.com', 'User-Agent': discordAgent, 'X-Super-Properties': Buffer.from(JSON.stringify(discordClient)).toString('base64') }, body: JSON.stringify({ ticket: message.ticket }), redirect: 'error', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
            const result = await response.json();
            if (!response.ok || !result.encrypted_token) throw new DiscordSignInError(result.captcha_key || result.captcha_sitekey ? 'Discord requires additional verification that this experimental connector cannot complete. No session was saved.' : 'Discord did not approve this connection. No session was saved.');
            const token = decrypt(result.encrypted_token).toString();
            if (!token || token.length > 2048 || /\s/.test(token)) throw new DiscordSignInError('Discord returned an invalid session.');
            finish(null, { token, accountId }); break;
          }
        }
      }).catch(error => finish(error));
    });
  });
}
