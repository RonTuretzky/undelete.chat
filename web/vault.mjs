// Client side of zero-knowledge storage. The private key is created here,
// wrapped under the password and the recovery key before it ever leaves the
// device, and kept unlocked only as a non-extractable key in this browser.
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
export const passwordIterations = 600_000, recoveryIterations = 10_000;
export const isSealed = payload => typeof payload === 'string' && payload.startsWith('v1.');

async function keyFromSecret(secret, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', enc.encode(secret.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function generateKeys() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  return { publicKey: b64(await crypto.subtle.exportKey('raw', pair.publicKey)), privatePkcs8: new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey)) };
}
export async function wrap(privatePkcs8, secret, iterations) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFromSecret(secret, salt, iterations);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, privatePkcs8);
  return { salt: b64(salt), iv: b64(iv), ciphertext: b64(ciphertext), iterations };
}
export async function unwrap(blob, secret) {
  const key = await keyFromSecret(secret, unb64(blob.salt), blob.iterations || passwordIterations);
  const pkcs8 = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(blob.iv) }, key, unb64(blob.ciphertext));
  return new Uint8Array(pkcs8);
}
export function importPrivate(pkcs8) {
  return crypto.subtle.importKey('pkcs8', pkcs8, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
}
export async function open(privateKey, payload, context) {
  const bytes = unb64(payload.slice(3));
  const ephemeral = await crypto.subtle.importKey('raw', bytes.slice(0, 65), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: ephemeral }, privateKey, 256);
  const hkdf = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode(context) }, hkdf, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const body = new Uint8Array(bytes.length - 65 - 12);
  body.set(bytes.slice(93)); body.set(bytes.slice(77, 93), bytes.length - 65 - 12 - 16);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(65, 77), additionalData: enc.encode(context) }, key, body);
  return JSON.parse(dec.decode(plain));
}
// The unlocked key lives in IndexedDB as a non-extractable CryptoKey, so a page
// reload does not require the password again on this device.
const dbName = 'undelete-vault';
function withStore(mode, fn) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('keys');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { const db = request.result, tx = db.transaction('keys', mode), store = tx.objectStore('keys'); const result = fn(store); tx.oncomplete = () => { db.close(); resolve(result.result); }; tx.onerror = () => { db.close(); reject(tx.error); }; };
  });
}
export const rememberKey = (userId, key) => withStore('readwrite', s => s.put(key, userId)).catch(() => {});
export const recallKey = userId => withStore('readonly', s => s.get(userId)).catch(() => null);
export const forgetKey = userId => withStore('readwrite', s => s.delete(userId)).catch(() => {});
export function createDecryptor(privateKey, userId) {
  const cache = new Map();
  return async (messageId, sealed) => {
    if (!sealed) return null;
    const cacheKey = messageId + ':' + sealed.uid;
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    let value; try { value = await open(privateKey, sealed.payload, `${userId}:${messageId}:${sealed.uid}`); } catch { value = { text: '', authorName: 'Could not decrypt', chatName: '', undecryptable: true }; }
    if (cache.size > 5000) cache.clear();
    cache.set(cacheKey, value); return value;
  };
}
