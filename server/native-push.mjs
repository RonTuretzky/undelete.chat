import { createSign, createPrivateKey } from 'node:crypto';
import http2 from 'node:http2';
import { z } from 'zod';

// Native push for the store apps: Apple Push Notification service for iOS
// (direct HTTP/2 with a token key) and Firebase Cloud Messaging v1 for
// Android (service account). Both are configured privately by the operator.
// Payloads mirror Web Push: a count and a platform name, never message text.
export const nativeTokenSchema = z.object({
  platform: z.enum(['ios', 'android']),
  token: z.string().min(16).max(4096).regex(/^[A-Za-z0-9:_-]+$/),
}).strict();

const base64url = input => Buffer.from(input).toString('base64url');
function signJwt(header, claims, privateKeyPem, algorithm) {
  const segment = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signer = createSign(algorithm === 'ES256' ? 'SHA256' : 'RSA-SHA256');
  signer.update(segment);
  const signature = signer.sign(algorithm === 'ES256' ? { key: createPrivateKey(privateKeyPem), dsaEncoding: 'ieee-p1363' } : privateKeyPem);
  return `${segment}.${signature.toString('base64url')}`;
}

export function nativePushConfig(env = process.env) {
  const apns = env.APNS_KEY_ID && env.APNS_TEAM_ID && env.APNS_PRIVATE_KEY && env.APNS_BUNDLE_ID ? {
    keyId: env.APNS_KEY_ID, teamId: env.APNS_TEAM_ID, privateKey: env.APNS_PRIVATE_KEY.replace(/\\n/g, '\n'), bundleId: env.APNS_BUNDLE_ID,
    host: env.APNS_SANDBOX === 'true' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com',
  } : null;
  let fcm = null;
  if (env.FCM_SERVICE_ACCOUNT) {
    try { const account = JSON.parse(env.FCM_SERVICE_ACCOUNT); if (account.project_id && account.client_email && account.private_key) fcm = { projectId: account.project_id, clientEmail: account.client_email, privateKey: account.private_key }; }
    catch { throw new Error('FCM_SERVICE_ACCOUNT must be the JSON of a Firebase service account.'); }
  }
  if (apns && !/^[A-Z0-9]{10}$/.test(apns.keyId)) throw new Error('APNS_KEY_ID must be the ten-character key identifier.');
  if (apns && !/^[A-Z0-9]{10}$/.test(apns.teamId)) throw new Error('APNS_TEAM_ID must be the ten-character team identifier.');
  return apns || fcm ? { apns, fcm } : null;
}

export function createNativePush(config, { fetch = globalThis.fetch, connect = http2.connect, now = Date.now, log = console } = {}) {
  let apnsToken = { value: null, issued: 0 }, fcmToken = { value: null, expires: 0 };
  function apnsBearer() {
    // Apple accepts a provider token for up to an hour; refresh every 50 minutes.
    if (!apnsToken.value || now() - apnsToken.issued > 50 * 60_000) {
      apnsToken = { value: signJwt({ alg: 'ES256', kid: config.apns.keyId }, { iss: config.apns.teamId, iat: Math.floor(now() / 1000) }, config.apns.privateKey, 'ES256'), issued: now() };
    }
    return apnsToken.value;
  }
  async function fcmBearer() {
    if (fcmToken.value && now() < fcmToken.expires - 60_000) return fcmToken.value;
    const iat = Math.floor(now() / 1000);
    const assertion = signJwt({ alg: 'RS256', typ: 'JWT' }, { iss: config.fcm.clientEmail, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600 }, config.fcm.privateKey, 'RS256');
    const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${assertion}`, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw Object.assign(new Error('FCM token exchange failed'), { statusCode: response.status });
    const body = await response.json();
    fcmToken = { value: body.access_token, expires: now() + (Number(body.expires_in) || 3600) * 1000 };
    return fcmToken.value;
  }
  function sendApns(token, payload) {
    return new Promise((resolve, reject) => {
      const client = connect(config.apns.host);
      const timer = setTimeout(() => { client.close(); reject(Object.assign(new Error('APNs timeout'), { code: 'ETIMEDOUT' })); }, 15_000);
      client.on('error', error => { clearTimeout(timer); reject(error); });
      const body = JSON.stringify({ aps: { alert: { title: payload.title || 'undelete.chat', body: payload.body }, sound: 'default', 'thread-id': 'undelete-recovered', badge: payload.count || undefined }, url: payload.url || '/' });
      const request = client.request({ ':method': 'POST', ':path': `/3/device/${token}`, authorization: `bearer ${apnsBearer()}`, 'apns-topic': config.apns.bundleId, 'apns-push-type': 'alert', 'apns-priority': '10', 'apns-expiration': String(Math.floor(now() / 1000) + 6 * 3600), 'content-type': 'application/json' });
      let status = 0, data = '';
      request.on('response', headers => { status = headers[':status']; });
      request.on('data', chunk => { data += chunk; });
      request.on('end', () => { clearTimeout(timer); client.close(); if (status === 200) resolve(); else { let reason = ''; try { reason = JSON.parse(data).reason; } catch { /* no body */ } reject(Object.assign(new Error('APNs ' + status), { statusCode: status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered' ? 410 : status, reason })); } });
      request.on('error', error => { clearTimeout(timer); client.close(); reject(error); });
      request.end(body);
    });
  }
  async function sendFcm(token, payload) {
    const bearer = await fcmBearer();
    const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(config.fcm.projectId)}/messages:send`, {
      method: 'POST', headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({ message: { token, notification: { title: payload.title || 'undelete.chat', body: payload.body }, data: { url: payload.url || '/', count: String(payload.count || 0) }, android: { priority: 'high', notification: { channel_id: 'recovered', tag: 'undelete-recovered' } } } }),
    });
    if (response.ok) return;
    let reason = ''; try { reason = (await response.json()).error?.details?.find(d => d.errorCode)?.errorCode || ''; } catch { /* no body */ }
    throw Object.assign(new Error('FCM ' + response.status), { statusCode: response.status === 404 || reason === 'UNREGISTERED' ? 410 : response.status, reason });
  }
  return {
    platforms: { ios: !!config.apns, android: !!config.fcm },
    send(platform, token, payload) {
      const text = payload.body || (payload.count === 1 ? `A deleted ${payload.platform || ''} message was recovered.`.replace('  ', ' ') : `${payload.count} deleted messages were recovered.`);
      const message = { ...payload, body: text };
      if (platform === 'ios' && config.apns) return sendApns(token, message);
      if (platform === 'android' && config.fcm) return sendFcm(token, message);
      return Promise.reject(Object.assign(new Error('Native push is not configured for this platform.'), { code: 'unconfigured' }));
    },
  };
}
