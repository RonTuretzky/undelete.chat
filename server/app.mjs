import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { z, ZodError } from 'zod';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { checkPassword, passwordHash, hash } from './crypto.mjs';
import { platforms } from './store.mjs';

export function createApp(store, config = {}) {
  const app = express();
  const production = config.production ?? false;
  const cookieOptions = { httpOnly: true, sameSite: 'strict', secure: production, path: '/', maxAge: 30 * 86400_000 };
  if (production) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:'], connectSrc: ["'self'"], fontSrc: ["'self'"], frameAncestors: ["'none'"], upgradeInsecureRequests: production ? [] : null } } }));
  app.use(express.json({ limit: '2mb' }));
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many requests. Try again shortly.' } }));
  app.use((req, res, next) => {
    // Browser mutations require the configured or same origin. Companion requests have no cookies.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !req.path.startsWith('/api/ingest') && !req.path.startsWith('/api/heartbeat') && req.path !== '/api/pair') {
      const origin = req.get('origin');
      const allowed = config.origins || [config.origin].filter(Boolean);
      if (origin && !allowed.includes(origin)) return res.status(403).json({ error: 'Request origin is not allowed.' });
      if (req.get('sec-fetch-site') === 'cross-site') return res.status(403).json({ error: 'Cross-site request rejected.' });
    }
    req.sessionToken = req.headers.cookie?.split(';').map(x => x.trim()).find(x => x.startsWith('afterword='))?.slice(10);
    req.user = store.authenticate(req.sessionToken);
    next();
  });
  const auth = (req, res, next) => req.user ? next() : res.status(401).json({ error: 'Sign in to continue.' });
  const source = (req, res, next) => {
    req.connection = store.connectionByToken(req.get('authorization')?.replace(/^Bearer /, ''));
    return req.connection ? next() : res.status(401).json({ error: 'Invalid or revoked connection key.' });
  };
  const credentials = z.object({ username: z.string().min(3).max(100).regex(/^[a-zA-Z0-9@._+-]+$/), password: z.string().min(12).max(128) });
  const authLimit = rateLimit({ windowMs: 15 * 60_000, limit: 25, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many sign-in attempts. Try again in 15 minutes.' } });
  app.get('/api/health', (_req, res) => { store.db.prepare('SELECT 1').get(); res.json({ ok: true, service: 'afterword' }); });
  app.get('/api/me', (req, res) => res.json({ user: req.user || null, inviteRequired: !!config.inviteCode }));
  app.post('/api/auth/register', authLimit, async (req, res) => {
    const input = credentials.parse(req.body);
    if (config.inviteCode && hash(String(req.body.inviteCode || '')) !== hash(config.inviteCode)) return res.status(403).json({ error: 'Enter a valid invitation code.' });
    if (store.userByName(input.username)) return res.status(409).json({ error: 'That username is unavailable.' });
    const user = await store.createUser(input.username, input.password);
    res.cookie('afterword', store.session(user.id), cookieOptions).status(201).json({ user });
  });
  app.post('/api/auth/login', authLimit, async (req, res) => {
    const { username, password } = credentials.parse(req.body);
    const user = store.userByName(username);
    const valid = user && await checkPassword(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Username or password is incorrect.' });
    res.cookie('afterword', store.session(user.id), cookieOptions).json({ user: store.getUser(user.id) });
  });
  app.post('/api/auth/logout', auth, (req, res) => { store.endSession(req.sessionToken); res.clearCookie('afterword', cookieOptions).json({ ok: true }); });
  app.post('/api/auth/password', auth, authLimit, async (req, res) => {
    const input = z.object({ currentPassword: z.string(), password: z.string().min(12).max(128) }).parse(req.body);
    if (!await checkPassword(input.currentPassword, store.userByName(req.user.username).password)) return res.status(403).json({ error: 'Current password is incorrect.' });
    store.db.prepare('UPDATE users SET password=? WHERE id=?').run(await passwordHash(input.password), req.user.id);
    store.db.prepare('DELETE FROM sessions WHERE user_id=?').run(req.user.id);
    res.cookie('afterword', store.session(req.user.id), cookieOptions).json({ ok: true });
  });
  app.get('/api/connections', auth, (req, res) => res.json({ connections: store.connections(req.user.id) }));
  app.post('/api/connections', auth, (req, res) => {
    const input = z.object({ platform: z.enum(platforms), name: z.string().trim().min(1).max(100) }).parse(req.body);
    if (store.connections(req.user.id).filter(c => !c.revoked).length >= 20) return res.status(409).json({ error: 'Maximum of 20 connections per account.' });
    res.status(201).json({ connection: store.createConnection(req.user.id, input.platform, input.name) });
  });
  app.post('/api/connections/:id/pairing', auth, (req, res) => {
    const pairing = store.createPairing(req.params.id, req.user.id);
    return pairing ? res.json({ pairing }) : res.status(404).json({ error: 'Connection not found.' });
  });
  const pairLimit = rateLimit({ windowMs: 15 * 60_000, limit: 15, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'Too many pairing attempts. Wait 15 minutes, then generate a new code in Connections.' } });
  app.post('/api/pair', pairLimit, (req, res) => {
    // Pairing uses a one-time secret, never cookies. Extension-origin requests
    // are allowed here; account mutations still enforce the same-origin check.
    const { code, platform } = z.object({ code: z.string().min(1).max(30), platform: z.enum(platforms).optional() }).parse(req.body);
    const connection = store.redeemPairing(code, platform);
    return connection ? res.json({ connection }) : res.status(400).json({ error: 'This pairing code is invalid, expired, or already used. Generate a new code in Connections.' });
  });
  app.patch('/api/connections/:id', auth, (req, res) => {
    const { paused } = z.object({ paused: z.boolean() }).parse(req.body);
    const c = store.connection(req.params.id, req.user.id);
    if (!c || c.revoked) return res.status(404).json({ error: 'Connection not found.' });
    store.db.prepare('UPDATE connections SET paused=? WHERE id=? AND user_id=?').run(+paused, c.id, req.user.id);
    res.json({ ok: true });
  });
  app.delete('/api/connections/:id', auth, (req, res) => {
    store.db.prepare("UPDATE connections SET revoked=1,token_hash=NULL,health='disconnected' WHERE id=? AND user_id=?").run(req.params.id, req.user.id);
    res.json({ ok: true });
  });
  app.post('/api/heartbeat', source, (req, res) => {
    const input = z.object({ health: z.enum(['connected', 'reconnecting', 'error', 'waiting']), detail: z.string().max(300).default(''), queued: z.number().int().nonnegative().max(10_000_000).default(0) }).parse(req.body);
    store.db.prepare('UPDATE connections SET last_seen=?,health=?,detail=?,queued=? WHERE id=?').run(new Date().toISOString(), input.health, input.detail, input.queued, req.connection.id);
    res.json({ ok: true, paused: !!req.connection.paused, platform: req.connection.platform });
  });
  app.post('/api/ingest', source, (req, res) => {
    const events = z.array(z.unknown()).min(1).max(100).parse(req.body.events);
    // Results acknowledge each event individually, making batch retries safe.
    const results = events.map(event => {
      try { return { eventId: event?.eventId, ...store.ingest(req.connection, event) }; }
      catch (error) { return { eventId: event?.eventId, error: error instanceof ZodError ? 'Invalid event payload.' : error.message }; }
    });
    res.json({ results });
  });
  app.get('/api/messages', auth, (req, res) => {
    store.purge();
    const q = String(req.query.q || '').slice(0, 300).toLowerCase();
    const all = store.messages(req.user.id);
    let rows = all.filter(m => (!req.query.platform || m.platform === req.query.platform) && (!req.query.status || m.status === req.query.status) && (!req.query.saved || m.saved));
    if (q) rows = rows.filter(m => `${m.authorName} ${m.chatName} ${m.versions.map(v => v.text || '').join(' ')}`.toLowerCase().includes(q));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    res.json({ messages: rows.slice(offset, offset + 50).map(({ versions, ...m }) => m), total: rows.length,
      stats: { total: all.length, edited: all.filter(m => m.status === 'edited').length, edits: all.reduce((n, m) => n + m.versions.filter(v => v.kind === 'edit').length, 0), deleted: all.filter(m => m.status === 'deleted').length, saved: all.filter(m => m.saved).length, versions: all.reduce((n, m) => n + m.versionCount, 0) } });
  });
  app.get('/api/messages/:id', auth, (req, res) => {
    store.purge();
    const message = store.message(req.params.id, req.user.id);
    return message ? res.json({ message }) : res.status(404).json({ error: 'Message not found.' });
  });
  app.patch('/api/messages/:id', auth, (req, res) => {
    const { saved } = z.object({ saved: z.boolean() }).parse(req.body);
    const result = store.db.prepare('UPDATE messages SET saved=? WHERE id=? AND user_id=?').run(+saved, req.params.id, req.user.id);
    return result.changes ? res.json({ ok: true }) : res.status(404).json({ error: 'Message not found.' });
  });
  app.delete('/api/messages/:id', auth, (req, res) => {
    store.forgetMessage(req.params.id, req.user.id);
    res.json({ ok: true });
  });
  app.get('/api/export', auth, (req, res) => {
    store.purge();
    res.attachment('afterword-archive.json').json({ exportedAt: new Date().toISOString(), version: 1, messages: store.messages(req.user.id) });
  });
  app.patch('/api/settings', auth, (req, res) => {
    const { retentionDays } = z.object({ retentionDays: z.union([z.literal(7), z.literal(30), z.literal(90), z.literal(365), z.literal(0)]) }).parse(req.body);
    store.db.prepare('UPDATE users SET retention_days=? WHERE id=?').run(retentionDays, req.user.id);
    store.purge();
    res.json({ user: store.getUser(req.user.id) });
  });
  app.delete('/api/account', auth, authLimit, async (req, res) => {
    const { password } = z.object({ password: z.string().max(128) }).parse(req.body);
    if (!await checkPassword(password, store.userByName(req.user.username).password)) return res.status(403).json({ error: 'Password is incorrect.' });
    store.db.prepare('DELETE FROM users WHERE id=?').run(req.user.id);
    res.clearCookie('afterword', cookieOptions).json({ ok: true });
  });
  app.get('/api/companion/download', auth, (req, res) => {
    const path = resolve(req.query.format === 'zip' ? 'dist/afterword-companion.zip' : 'dist/afterword-companion.tar.gz');
    if (!existsSync(path)) return res.status(503).json({ error: 'Companion package is not available on this build.' });
    res.download(path);
  });
  app.get('/api/discord/extension', auth, (_req, res) => {
    const path = resolve('dist/afterword-discord-extension.zip');
    if (!existsSync(path)) return res.status(503).json({ error: 'The Discord extension is not available on this build.' });
    res.download(path);
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint not found.' }));
  app.use(express.static(resolve('dist'), { index: false, maxAge: '1h' }));
  app.get('/{*path}', (_req, res) => res.sendFile(resolve('dist/index.html')));
  app.use((error, _req, res, _next) => {
    if (error instanceof ZodError) return res.status(400).json({ error: error.issues[0]?.message || 'Invalid request.' });
    if (error.status === 413) return res.status(413).json({ error: 'Request is too large.' });
    if (error instanceof SyntaxError) return res.status(400).json({ error: 'Invalid JSON.' });
    console.error('Request failed:', error.code || error.name);
    res.status(500).json({ error: 'The request could not be completed. Please try again.' });
  });
  return app;
}
