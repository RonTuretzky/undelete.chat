import webPush from 'web-push';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

// Web Push notifications for recovered deletions. Payloads carry a count and a
// platform name only; message content never leaves the archive. Subscriptions
// are owned by an account and removed when the push service reports them gone.
export const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2048).refine(v => v.startsWith('https://'), 'Push endpoints must use HTTPS.'),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({ p256dh: z.string().min(16).max(256).regex(/^[A-Za-z0-9_-]+=*$/), auth: z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+=*$/) }),
}).strict();

export function loadVapidKeys(directory, env = process.env) {
  if (env.PUSH_VAPID_PUBLIC_KEY && env.PUSH_VAPID_PRIVATE_KEY) return { publicKey: env.PUSH_VAPID_PUBLIC_KEY, privateKey: env.PUSH_VAPID_PRIVATE_KEY };
  const file = resolve(directory, '.vapid.json');
  if (existsSync(file)) { const saved = JSON.parse(readFileSync(file, 'utf8')); if (saved.publicKey && saved.privateKey) return saved; }
  const keys = webPush.generateVAPIDKeys();
  writeFileSync(file, JSON.stringify(keys), { mode: 0o600 });
  return keys;
}

export function createPushService(store, { keys, subject, send = webPush.sendNotification, native = null, now = Date.now, coalesceMs = 60_000, log = console } = {}) {
  if (!/^(https:\/\/|mailto:)/.test(subject)) throw new Error('The push subject must be an HTTPS origin or a mailto address.');
  const options = { vapidDetails: { subject, publicKey: keys.publicKey, privateKey: keys.privateKey }, TTL: 6 * 3600, urgency: 'normal' };
  const pending = new Map(); // userId -> { count, platforms, timer, lastSentAt }
  let closed = false;
  async function deliver(userId, payload) {
    const subscriptions = store.pushSubscriptions(userId);
    let delivered = 0;
    for (const t of native ? store.nativePushTokens(userId) : []) {
      try { await native.send(t.platform, t.token, payload); store.touchNativePushToken(t.token); delivered++; }
      catch (error) {
        if (error?.statusCode === 410 || error?.statusCode === 404) store.dropNativePushToken(t.token);
        else if (error?.code !== 'unconfigured') { store.failNativePushToken(t.token); log.error('Native push delivery failed:', error?.statusCode || error?.code || error?.name || 'unknown'); }
      }
    }
    for (const s of subscriptions) {
      try {
        await send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), options);
        store.touchPushSubscription(s.endpoint); delivered++;
      } catch (error) {
        const status = error?.statusCode;
        if (status === 404 || status === 410) store.dropPushSubscription(s.endpoint);
        else { store.failPushSubscription(s.endpoint); log.error('Push delivery failed:', status || error?.code || error?.name || 'unknown'); }
      }
    }
    return delivered;
  }
  function flush(userId) {
    const entry = pending.get(userId);
    if (!entry || closed) return Promise.resolve(0);
    pending.delete(userId);
    const platforms = [...entry.platforms];
    return deliver(userId, { count: entry.count, platform: platforms.length === 1 ? platforms[0] : '', url: '/?source=push' }).catch(() => 0);
  }
  return {
    publicKey: keys.publicKey, nativePlatforms: native?.platforms || { ios: false, android: false },
    // Called when a deletion moves a message into the archive. Notifications
    // for one account are coalesced so a burst of deletions sends one alert.
    recovered(userId, platform) {
      if (closed || !store.pushSubscriptions(userId).length && !(native && store.nativePushTokens(userId).length)) return;
      const entry = pending.get(userId) || { count: 0, platforms: new Set(), timer: null };
      entry.count++; if (platform) entry.platforms.add(platform);
      if (!entry.timer) entry.timer = setTimeout(() => flush(userId), coalesceMs);
      entry.timer.unref?.();
      pending.set(userId, entry);
    },
    flush,
    test(userId) { return deliver(userId, { title: 'undelete.chat', body: 'Notifications are working. You will hear about recovered deletions here.', url: '/?source=push' }); },
    async close() { closed = true; for (const [userId, entry] of pending) { clearTimeout(entry.timer); pending.delete(userId); } },
  };
}
