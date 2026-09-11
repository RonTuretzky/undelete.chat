import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';

// Subscription billing through Stripe Checkout and the customer portal. The
// server never sees card details; it stores only Stripe identifiers, the
// subscription status, and period boundaries. Entitlement is evaluated from
// the local record so a Stripe outage cannot interrupt capture.
export const billingMessages = {
  subscription_required: 'Capture is paused until your subscription is active. Open Settings → Plan to continue.',
};
export const subscriptionError = () => Object.assign(new Error(billingMessages.subscription_required), {
  code: 'subscription_required', retryable: true, public: true, status: 402,
});
export const entitledStatuses = ['active', 'trialing', 'past_due'];
const day = 86400_000;

export function billingConfig(env = process.env) {
  if (!env.STRIPE_SECRET_KEY) return null;
  const config = {
    secretKey: env.STRIPE_SECRET_KEY, webhookSecret: env.STRIPE_WEBHOOK_SECRET || '', priceId: env.STRIPE_PRICE_ID || '',
    trialDays: env.BILLING_TRIAL_DAYS === undefined ? 14 : Number(env.BILLING_TRIAL_DAYS),
    exemptUsers: (env.BILLING_EXEMPT_USERS ?? 'owner').split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
    apiBase: env.STRIPE_API_BASE || 'https://api.stripe.com',
  };
  if (!/^[rs]k_(live|test)_[A-Za-z0-9]+$/.test(config.secretKey)) throw new Error('STRIPE_SECRET_KEY must be a Stripe secret or restricted key.');
  if (!/^price_[A-Za-z0-9]+$/.test(config.priceId)) throw new Error('STRIPE_PRICE_ID must be a Stripe price identifier.');
  if (!/^whsec_[A-Za-z0-9]+$/.test(config.webhookSecret)) throw new Error('STRIPE_WEBHOOK_SECRET must be a Stripe webhook signing secret.');
  if (!Number.isInteger(config.trialDays) || config.trialDays < 0 || config.trialDays > 365) throw new Error('BILLING_TRIAL_DAYS must be a whole number of days up to 365.');
  if (!/^https:\/\/[a-z0-9.-]+$/.test(config.apiBase) && !/^http:\/\/127\.0\.0\.1:\d+$/.test(config.apiBase)) throw new Error('STRIPE_API_BASE must be an HTTPS origin.');
  return config;
}

export function verifyStripeSignature(payload, header, secret, { now = Date.now, toleranceMs = 5 * 60_000 } = {}) {
  if (typeof header !== 'string' || !Buffer.isBuffer(payload)) return false;
  const parts = Object.groupBy(header.split(',').map(p => p.trim().split('=')), ([key]) => key);
  const timestamp = Number(parts.t?.[0]?.[1]), signatures = (parts.v1 || []).map(([, value]) => value).filter(v => /^[a-f0-9]{64}$/.test(v));
  if (!Number.isFinite(timestamp) || Math.abs(now() - timestamp * 1000) > toleranceMs || !signatures.length) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.`).update(payload).digest();
  return signatures.some(signature => timingSafeEqual(Buffer.from(signature, 'hex'), expected));
}

function form(params, prefix = '') {
  const pairs = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === 'object') pairs.push(form(value, name)); else pairs.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
  }
  return pairs.filter(Boolean).join('&');
}

export function createBilling(store, { config, origin, fetch = globalThis.fetch, now = Date.now, log = console, onLapse = () => {} }) {
  if (!config) throw new Error('Billing requires configuration.');
  const periodEnd = subscription => {
    const seconds = subscription.current_period_end ?? subscription.items?.data?.[0]?.current_period_end;
    return Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : null;
  };
  function trialEnd(record) {
    const explicit = Date.parse(record.trial_ends_at);
    if (Number.isFinite(explicit)) return explicit;
    return Date.parse(record.created_at) + config.trialDays * day;
  }
  function entitlement(record) {
    if (!record) return { enabled: true, entitled: false, reason: 'unknown_account' };
    const base = { enabled: true, status: record.billing_status || 'none', periodEnd: record.billing_period_end || null,
      cancelAtPeriodEnd: !!record.billing_cancel_at_period_end, customer: !!record.billing_customer_id, trialEndsAt: new Date(trialEnd(record)).toISOString() };
    if (config.exemptUsers.includes(record.username)) return { ...base, entitled: true, reason: 'exempt' };
    if (entitledStatuses.includes(base.status)) return { ...base, entitled: true, reason: base.status };
    if (trialEnd(record) > now()) return { ...base, entitled: true, reason: 'trial' };
    return { ...base, entitled: false, reason: base.status === 'none' ? 'trial_ended' : base.status };
  }
  async function stripe(method, path, params) {
    const headers = { Authorization: `Bearer ${config.secretKey}` };
    if (method === 'POST') { headers['Content-Type'] = 'application/x-www-form-urlencoded'; headers['Idempotency-Key'] = randomUUID(); }
    let response;
    try { response = await fetch(`${config.apiBase}${path}`, { method, headers, body: method === 'POST' ? form(params || {}) : undefined, signal: AbortSignal.timeout(20_000) }); }
    catch { throw Object.assign(new Error('The billing provider is not reachable right now. Please try again shortly.'), { public: true, status: 503 }); }
    let body = null; try { body = await response.json(); } catch { /* handled below */ }
    if (!response.ok || !body || body.error) {
      // Log only the Stripe error type; request bodies can include customer identifiers.
      log.error('Stripe request failed:', response.status, body?.error?.type || 'unknown');
      throw Object.assign(new Error('The billing provider rejected the request. Please try again shortly.'), { public: true, status: 503 });
    }
    return body;
  }
  function apply(record, subscription) {
    const before = entitlement(record).entitled;
    const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
    store.applySubscription(record.id, { customerId, subscriptionId: subscription.id, status: subscription.status, periodEnd: periodEnd(subscription), cancelAtPeriodEnd: !!subscription.cancel_at_period_end });
    const after = entitlement(store.billingRecord(record.id));
    if (before && !after.entitled) { log.info('Subscription lapsed for an account; pausing hosted capture.'); Promise.resolve(onLapse(record.id)).catch(error => log.error('Could not pause capture after a lapse:', error?.code || error?.name)); }
    return after;
  }
  return {
    entitlement, trialDays: config.trialDays,
    summary(userId) { return entitlement(store.billingRecord(userId)); },
    entitled(userId) { return entitlement(store.billingRecord(userId)).entitled; },
    async checkout(userId) {
      const record = store.billingRecord(userId);
      const current = entitlement(record);
      if (entitledStatuses.includes(current.status) && current.status !== 'past_due') throw Object.assign(new Error('This account already has a subscription. Use Manage billing instead.'), { public: true, status: 409 });
      const trialSeconds = Math.floor(trialEnd(record) / 1000);
      const session = await stripe('POST', '/v1/checkout/sessions', {
        mode: 'subscription', client_reference_id: record.id, allow_promotion_codes: 'true',
        success_url: `${origin}/?billing=success`, cancel_url: `${origin}/?billing=cancelled`,
        ...(record.billing_customer_id ? { customer: record.billing_customer_id } : {}),
        line_items: { 0: { price: config.priceId, quantity: 1 } },
        subscription_data: { metadata: { userId: record.id }, ...(trialEnd(record) - now() > 2 * day ? { trial_end: trialSeconds } : {}) },
        metadata: { userId: record.id },
      });
      if (typeof session.url !== 'string' || !/^https:\/\/([a-z0-9-]+\.)*stripe\.com\//.test(session.url) && !session.url.startsWith(config.apiBase)) throw Object.assign(new Error('The billing provider returned an unexpected checkout address.'), { public: true, status: 503 });
      return { url: session.url };
    },
    async portal(userId) {
      const record = store.billingRecord(userId);
      if (!record.billing_customer_id) throw Object.assign(new Error('Start a subscription before opening the billing portal.'), { public: true, status: 409 });
      const session = await stripe('POST', '/v1/billing_portal/sessions', { customer: record.billing_customer_id, return_url: `${origin}/?billing=portal` });
      if (typeof session.url !== 'string' || !/^https:\/\/([a-z0-9-]+\.)*stripe\.com\//.test(session.url) && !session.url.startsWith(config.apiBase)) throw Object.assign(new Error('The billing provider returned an unexpected portal address.'), { public: true, status: 503 });
      return { url: session.url };
    },
    async webhook(payload, signature) {
      if (!verifyStripeSignature(payload, signature, config.webhookSecret, { now })) throw Object.assign(new Error('Invalid webhook signature.'), { public: true, status: 400 });
      let event; try { event = JSON.parse(payload.toString('utf8')); } catch { throw Object.assign(new Error('Invalid webhook payload.'), { public: true, status: 400 }); }
      const type = String(event?.type || ''), object = event?.data?.object;
      if (!object || typeof object !== 'object') return { received: true, type, handled: false };
      if (type === 'checkout.session.completed' && object.mode === 'subscription') {
        const userId = object.client_reference_id || object.metadata?.userId, subscriptionId = typeof object.subscription === 'string' ? object.subscription : object.subscription?.id;
        const record = userId && store.billingRecord(userId);
        if (!record || !subscriptionId) return { received: true, type, handled: false };
        const customerId = typeof object.customer === 'string' ? object.customer : object.customer?.id;
        if (customerId) store.setBillingCustomer(record.id, customerId);
        // Fetch the subscription from Stripe rather than trusting the session's snapshot.
        const subscription = await stripe('GET', `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`);
        apply(store.billingRecord(record.id), subscription);
        return { received: true, type, handled: true };
      }
      if (/^customer\.subscription\.(created|updated|deleted|paused|resumed)$/.test(type)) {
        const customerId = typeof object.customer === 'string' ? object.customer : object.customer?.id;
        const record = (object.metadata?.userId && store.billingRecord(object.metadata.userId)) || (customerId && store.userByCustomer(customerId));
        if (!record) return { received: true, type, handled: false };
        // Ignore an older subscription's events once a newer one is recorded.
        if (record.billing_subscription_id && record.billing_subscription_id !== object.id && object.status !== 'active' && object.status !== 'trialing') return { received: true, type, handled: false };
        apply(record, object);
        return { received: true, type, handled: true };
      }
      return { received: true, type, handled: false };
    },
  };
}
