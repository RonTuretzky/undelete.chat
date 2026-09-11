import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHmac, randomBytes } from 'node:crypto';
import { createStore } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
import { billingConfig, createBilling, verifyStripeSignature, billingMessages } from '../server/billing.mjs';

const day = 86400_000;
const validEnv = { STRIPE_SECRET_KEY: 'sk_test_abc123', STRIPE_WEBHOOK_SECRET: 'whsec_secret123', STRIPE_PRICE_ID: 'price_123' };
function sign(payload, secret, at = Date.now()) {
  const t = Math.floor(at / 1000);
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.`).update(payload).digest('hex')}`;
}
async function fakeStripe(t) {
  const requests = [];
  let subscription = { id: 'sub_1', customer: 'cus_1', status: 'active', cancel_at_period_end: false, items: { data: [{ current_period_end: Math.floor((Date.now() + 30 * day) / 1000) }] } };
  const server = createServer((req, res) => {
    let body = ''; req.on('data', d => body += d); req.on('end', () => {
      requests.push({ method: req.method, url: req.url, auth: req.headers.authorization, idempotency: req.headers['idempotency-key'], body: Object.fromEntries(new URLSearchParams(body)) });
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/v1/checkout/sessions') return res.end(JSON.stringify({ id: 'cs_1', url: 'https://checkout.stripe.com/c/pay/cs_1' }));
      if (req.url === '/v1/billing_portal/sessions') return res.end(JSON.stringify({ id: 'bps_1', url: 'https://billing.stripe.com/p/session/bps_1' }));
      if (req.url === '/v1/subscriptions/sub_1') return res.end(JSON.stringify(subscription));
      res.statusCode = 404; res.end(JSON.stringify({ error: { type: 'invalid_request_error' } }));
    });
  }).listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  t.after(() => new Promise(r => server.close(r)));
  return { requests, base: `http://127.0.0.1:${server.address().port}`, setSubscription(next) { subscription = next; } };
}
async function fixture(t, options = {}) {
  const stripe = await fakeStripe(t);
  const store = createStore(':memory:', randomBytes(32).toString('hex'));
  const lapsed = [];
  const config = billingConfig({ ...validEnv, STRIPE_API_BASE: stripe.base, BILLING_TRIAL_DAYS: '14', ...options.env });
  let clock = Date.now();
  const billing = createBilling(store, { config, origin: 'https://archive.example', now: () => clock, log: { info() {}, error() {} }, onLapse: id => lapsed.push(id) });
  const server = createApp(store, { billing, origins: ['https://archive.example'] }).listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  t.after(async () => { await new Promise(r => server.close(r)); store.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = (path, { method = 'GET', body, cookie, headers = {}, raw } = {}) => fetch(base + path, { method, headers: { ...(body !== undefined || raw ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), Origin: 'https://archive.example', ...headers }, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined) });
  const registered = await call('/auth/register', { method: 'POST', body: { username: 'customer', password: 'a-long-customer-password' } });
  assert.equal(registered.status, 201);
  const cookie = registered.headers.get('set-cookie').split(';')[0], user = (await registered.json()).user;
  return { store, billing, stripe, lapsed, call, cookie, user, now: () => clock, tick(ms) { clock += ms; } };
}

test('billing configuration validates identifiers and is optional', () => {
  assert.equal(billingConfig({}), null);
  assert.equal(billingConfig(validEnv).trialDays, 14);
  assert.throws(() => billingConfig({ ...validEnv, STRIPE_SECRET_KEY: 'nope' }), /STRIPE_SECRET_KEY/);
  assert.throws(() => billingConfig({ ...validEnv, STRIPE_PRICE_ID: '' }), /STRIPE_PRICE_ID/);
  assert.throws(() => billingConfig({ ...validEnv, STRIPE_WEBHOOK_SECRET: '' }), /STRIPE_WEBHOOK_SECRET/);
  assert.throws(() => billingConfig({ ...validEnv, BILLING_TRIAL_DAYS: '1.5' }), /BILLING_TRIAL_DAYS/);
  assert.deepEqual(billingConfig({ ...validEnv, BILLING_EXEMPT_USERS: ' Owner ,ops' }).exemptUsers, ['owner', 'ops']);
});

test('webhook signatures require a fresh timestamp and a matching digest', () => {
  const payload = Buffer.from('{"id":"evt_1"}'), secret = 'whsec_x';
  assert.equal(verifyStripeSignature(payload, sign(payload, secret), secret), true);
  assert.equal(verifyStripeSignature(payload, sign(payload, 'whsec_other'), secret), false);
  assert.equal(verifyStripeSignature(payload, sign(payload, secret, Date.now() - 10 * 60_000), secret), false);
  assert.equal(verifyStripeSignature(Buffer.from('{"id":"evt_2"}'), sign(payload, secret), secret), false);
  assert.equal(verifyStripeSignature(payload, undefined, secret), false);
  assert.equal(verifyStripeSignature(payload, 't=abc,v1=zz', secret), false);
});

test('new accounts get a trial, exempt operators never lapse, and lapsed accounts are paused without losing data', async t => {
  const f = await fixture(t), { store, billing, call, cookie, user } = f;
  let me = await (await call('/me', { cookie })).json();
  assert.equal(me.billing.entitled, true); assert.equal(me.billing.reason, 'trial');
  assert.ok(Date.parse(me.billing.trialEndsAt) - Date.now() > 13 * day);
  const owner = await store.createUser('owner', 'operator-password-long');
  assert.equal(billing.summary(owner.id).reason, 'exempt');
  const legacy = await store.createUser('legacy', 'legacy-password-long'); // no trial_ends_at, as for pre-billing accounts
  assert.equal(billing.summary(legacy.id).reason, 'trial', 'existing accounts get the trial from their creation date');
  f.tick(15 * day);
  me = await (await call('/me', { cookie })).json();
  assert.equal(me.billing.entitled, false); assert.equal(me.billing.reason, 'trial_ended');
  assert.equal(billing.summary(owner.id).entitled, true);
  const connection = store.createConnection(user.id, 'telegram', 'Phone'), source = store.connectionByToken(connection.token);
  const event = { kind: 'create', eventId: 'e1', externalId: 'm1', scope: 'chat', chatId: 'chat', chatName: 'Chat', authorName: 'A', text: 'hello', occurredAt: new Date().toISOString() };
  const ingest = await call('/ingest', { method: 'POST', body: { events: [event] }, headers: { Authorization: `Bearer ${connection.token}` } });
  assert.equal(ingest.status, 200);
  const [result] = (await ingest.json()).results;
  assert.equal(result.code, 'subscription_required'); assert.equal(result.retryable, true);
  assert.equal(store.messages(user.id).length, 0);
  assert.equal((await call('/messages', { cookie })).status, 200, 'the archive stays readable');
  assert.equal((await call('/export', { cookie })).status, 200, 'exports keep working');
  const hosted = await call(`/connections/${connection.id}/hosted/start`, { method: 'POST', body: { consent: true }, cookie });
  assert.equal(hosted.status, 402);
  assert.equal((await hosted.json()).error, billingMessages.subscription_required);
  store.ingest(source, event); // direct delivery paths are unaffected by the HTTP gate in tests
  assert.equal(store.messages(user.id).length, 1);
});

test('checkout, webhook confirmation, and portal use Stripe identifiers only', async t => {
  const f = await fixture(t), { store, stripe, call, cookie, user, lapsed } = f;
  assert.equal((await call('/billing/portal', { method: 'POST', body: {}, cookie })).status, 409, 'no customer yet');
  const checkout = await call('/billing/checkout', { method: 'POST', body: {}, cookie });
  assert.equal(checkout.status, 200);
  assert.deepEqual(await checkout.json(), { url: 'https://checkout.stripe.com/c/pay/cs_1' });
  const request = stripe.requests.at(-1);
  assert.equal(request.auth, 'Bearer sk_test_abc123'); assert.match(request.idempotency, /^[0-9a-f-]{36}$/);
  assert.equal(request.body.mode, 'subscription'); assert.equal(request.body['line_items[0][price]'], 'price_123');
  assert.equal(request.body.client_reference_id, user.id); assert.equal(request.body['subscription_data[metadata][userId]'], user.id);
  assert.ok(Number(request.body['subscription_data[trial_end]']) * 1000 > Date.now() + 13 * day, 'the remaining app trial carries into Stripe');
  assert.equal(request.body.success_url, 'https://archive.example/?billing=success');
  const completed = Buffer.from(JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed', data: { object: { mode: 'subscription', client_reference_id: user.id, customer: 'cus_1', subscription: 'sub_1' } } }));
  assert.equal((await call('/billing/webhook', { method: 'POST', raw: completed, headers: { 'stripe-signature': sign(completed, 'whsec_other') } })).status, 400, 'bad signature');
  assert.equal((await call('/billing/webhook', { method: 'POST', raw: completed })).status, 400, 'missing signature');
  const ok = await call('/billing/webhook', { method: 'POST', raw: completed, headers: { 'stripe-signature': sign(completed, 'whsec_secret123') } });
  assert.deepEqual(await ok.json(), { received: true, type: 'checkout.session.completed', handled: true });
  assert.equal(stripe.requests.at(-1).url, '/v1/subscriptions/sub_1', 'the subscription is fetched, not trusted from the session');
  let me = await (await call('/me', { cookie })).json();
  assert.equal(me.billing.status, 'active'); assert.equal(me.billing.reason, 'active'); assert.equal(me.billing.customer, true);
  assert.ok(Date.parse(me.billing.periodEnd) > Date.now() + 29 * day);
  const record = store.billingRecord(user.id);
  assert.equal(record.billing_customer_id, 'cus_1'); assert.equal(record.billing_subscription_id, 'sub_1');
  assert.equal((await call('/billing/checkout', { method: 'POST', body: {}, cookie })).status, 409, 'already subscribed');
  const portal = await call('/billing/portal', { method: 'POST', body: {}, cookie });
  assert.deepEqual(await portal.json(), { url: 'https://billing.stripe.com/p/session/bps_1' });
  assert.equal(stripe.requests.at(-1).body.customer, 'cus_1');
  f.tick(15 * day);
  const cancelling = Buffer.from(JSON.stringify({ id: 'evt_2', type: 'customer.subscription.updated', data: { object: { id: 'sub_1', customer: 'cus_1', status: 'active', cancel_at_period_end: true, current_period_end: Math.floor((Date.now() + 30 * day) / 1000), metadata: { userId: user.id } } } }));
  await call('/billing/webhook', { method: 'POST', raw: cancelling, headers: { 'stripe-signature': sign(cancelling, 'whsec_secret123', f.now()) } });
  me = await (await call('/me', { cookie })).json();
  assert.equal(me.billing.entitled, true); assert.equal(me.billing.cancelAtPeriodEnd, true);
  assert.equal(lapsed.length, 0);
  const stale = Buffer.from(JSON.stringify({ id: 'evt_3', type: 'customer.subscription.deleted', data: { object: { id: 'sub_old', customer: 'cus_1', status: 'canceled' } } }));
  assert.equal((await (await call('/billing/webhook', { method: 'POST', raw: stale, headers: { 'stripe-signature': sign(stale, 'whsec_secret123', f.now()) } })).json()).handled, false, 'an older subscription cannot cancel the current one');
  const deleted = Buffer.from(JSON.stringify({ id: 'evt_4', type: 'customer.subscription.deleted', data: { object: { id: 'sub_1', customer: 'cus_1', status: 'canceled' } } }));
  await call('/billing/webhook', { method: 'POST', raw: deleted, headers: { 'stripe-signature': sign(deleted, 'whsec_secret123', f.now()) } });
  me = await (await call('/me', { cookie })).json();
  assert.equal(me.billing.entitled, false); assert.equal(me.billing.reason, 'canceled');
  assert.deepEqual(lapsed, [user.id]);
  assert.equal((await call('/billing/checkout', { method: 'POST', body: {}, cookie })).status, 200, 'a cancelled customer can subscribe again');
  assert.equal(stripe.requests.at(-1).body.customer, 'cus_1');
  assert.equal(stripe.requests.at(-1).body['subscription_data[trial_end]'], undefined, 'no trial after it has been used');
  const unknown = Buffer.from(JSON.stringify({ id: 'evt_5', type: 'customer.subscription.updated', data: { object: { id: 'sub_9', customer: 'cus_unknown', status: 'active' } } }));
  assert.equal((await (await call('/billing/webhook', { method: 'POST', raw: unknown, headers: { 'stripe-signature': sign(unknown, 'whsec_secret123', f.now()) } })).json()).handled, false);
});

test('billing endpoints are absent when billing is disabled', async t => {
  const store = createStore(':memory:', randomBytes(32).toString('hex'));
  const server = createApp(store, { origins: ['https://archive.example'] }).listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  t.after(async () => { await new Promise(r => server.close(r)); store.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const me = await (await fetch(base + '/me')).json();
  assert.deepEqual(me.billing, { enabled: false, trialDays: null, priceLabel: null });
  assert.equal((await fetch(base + '/billing/webhook', { method: 'POST', body: '{}' })).status, 404);
});
