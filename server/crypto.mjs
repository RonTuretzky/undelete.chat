import { randomBytes, createCipheriv, createDecipheriv, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
export const token = () => randomBytes(32).toString('base64url');
export const hash = value => createHash('sha256').update(value).digest('hex');
export async function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}
export async function checkPassword(password, stored) {
  const [salt, expected] = stored.split(':');
  const result = await derive(password, salt, 64);
  return timingSafeEqual(result, Buffer.from(expected, 'hex'));
}
export function cipher(key) {
  if (!/^[a-f0-9]{64}$/i.test(key)) throw new Error('ARCHIVE_KEY must be 64 hex characters.');
  const secret = Buffer.from(key, 'hex');
  return {
    seal(value, context) {
      const iv = randomBytes(12);
      const enc = createCipheriv('aes-256-gcm', secret, iv);
      enc.setAAD(Buffer.from(context));
      const body = Buffer.concat([enc.update(JSON.stringify(value), 'utf8'), enc.final()]);
      return Buffer.concat([iv, enc.getAuthTag(), body]).toString('base64');
    },
    open(value, context) {
      const bytes = Buffer.from(value, 'base64');
      const dec = createDecipheriv('aes-256-gcm', secret, bytes.subarray(0, 12));
      dec.setAAD(Buffer.from(context));
      dec.setAuthTag(bytes.subarray(12, 28));
      return JSON.parse(Buffer.concat([dec.update(bytes.subarray(28)), dec.final()]).toString('utf8'));
    }
  };
}
