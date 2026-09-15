import { generateKeyPairSync, createPublicKey, createPrivateKey, diffieHellman, hkdfSync, createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { z } from 'zod';

// Zero-knowledge storage. Each account owns a P-256 key pair generated in the
// browser. The server keeps only the public key and the private key wrapped
// under the password and under the recovery key, so it can seal archive events
// as they arrive but can never open them again. Sealing: ephemeral ECDH with
// the account key, HKDF-SHA256 bound to the record's context, AES-256-GCM.
export const sealedPrefix = 'v1.';
const publicKeyPattern = /^[A-Za-z0-9+/]{86,90}={0,2}$/; // 65-byte uncompressed P-256 point in base64
const blob = z.object({ salt: z.string().min(16).max(128), iv: z.string().min(16).max(32), ciphertext: z.string().min(32).max(8192), iterations: z.number().int().min(1).max(5_000_000).optional() }).strict();
export const wrappedSchema = z.object({ password: blob, recovery: blob }).strict();
export const setupSchema = z.object({ publicKey: z.string().regex(publicKeyPattern), wrapped: wrappedSchema }).strict();

const rawToKey = raw => createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: raw.subarray(1, 33).toString('base64url'), y: raw.subarray(33, 65).toString('base64url') }, format: 'jwk' });
function deriveKey(privateKey, publicKey, context) {
  const shared = diffieHellman({ privateKey, publicKey });
  return Buffer.from(hkdfSync('sha256', shared, Buffer.alloc(0), Buffer.from(context), 32));
}
export function isSealed(payload) { return typeof payload === 'string' && payload.startsWith(sealedPrefix); }
export function sealTo(publicKeyBase64, value, context) {
  const recipient = rawToKey(Buffer.from(publicKeyBase64, 'base64'));
  const ephemeral = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const key = deriveKey(ephemeral.privateKey, recipient, context);
  const iv = randomBytes(12), enc = createCipheriv('aes-256-gcm', key, iv);
  enc.setAAD(Buffer.from(context));
  const body = Buffer.concat([enc.update(JSON.stringify(value), 'utf8'), enc.final()]);
  const jwk = ephemeral.publicKey.export({ format: 'jwk' });
  const ephemeralRaw = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]);
  return sealedPrefix + Buffer.concat([ephemeralRaw, iv, enc.getAuthTag(), body]).toString('base64');
}
// Only tests and the account owner's device can open sealed records; the server never holds a private key.
export function openSealed(privateKeyPem, payload, context) {
  const bytes = Buffer.from(payload.slice(sealedPrefix.length), 'base64');
  const key = deriveKey(createPrivateKey(privateKeyPem), rawToKey(bytes.subarray(0, 65)), context);
  const dec = createDecipheriv('aes-256-gcm', key, bytes.subarray(65, 77));
  dec.setAAD(Buffer.from(context)); dec.setAuthTag(bytes.subarray(77, 93));
  return JSON.parse(Buffer.concat([dec.update(bytes.subarray(93)), dec.final()]).toString('utf8'));
}
export function generateAccountKeys() {
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = pair.publicKey.export({ format: 'jwk' });
  return { publicKey: Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]).toString('base64'), privateKeyPem: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }) };
}
// A keyed digest of an event's content lets the server detect unchanged edits
// without being able to read the content it compares.
export function contentHash(serverKeyHex, event) {
  return createHmac('sha256', Buffer.from(serverKeyHex, 'hex')).update(JSON.stringify([event.text ?? null, event.attachments || []])).digest('hex');
}
