const encode = value => new TextEncoder().encode(value);
const request = r => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
const complete = tx => new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error || new Error('Local storage transaction failed.')); });

export async function openVault(factory = indexedDB, name = 'afterword-discord-v1') {
  const opening = factory.open(name, 1);
  opening.onupgradeneeded = () => { const db = opening.result; db.createObjectStore('private'); db.createObjectStore('queue'); db.createObjectStore('keys'); };
  const db = await request(opening);
  async function rawGet(store, id) { return request(db.transaction(store).objectStore(store).get(id)); }
  async function rawSet(store, id, value) { const tx = db.transaction(store, 'readwrite'), done = complete(tx); tx.objectStore(store).put(value, id); await done; }
  let key = await rawGet('keys', 'aes');
  if (!key) { key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']); await rawSet('keys', 'aes', key); }
  async function seal(value, context) { const iv = crypto.getRandomValues(new Uint8Array(12)); return { iv, ciphertext: await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encode(context) }, key, encode(JSON.stringify(value))) }; }
  async function open(value, context) { if (!value) return; return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: value.iv, additionalData: encode(context) }, key, value.ciphertext))); }
  async function remove(store, id) { const tx = db.transaction(store, 'readwrite'), done = complete(tx); tx.objectStore(store).delete(id); await done; }
  const vault = {
    async get(id) { return open(await rawGet('private', id), `private:${id}`); },
    async set(id, value) { await rawSet('private', id, await seal(value, `private:${id}`)); },
    async delete(id) { await remove('private', id); },
    async clearPrefix(prefix) { const keys = await request(db.transaction('private').objectStore('private').getAllKeys()); const tx = db.transaction('private', 'readwrite'), done = complete(tx); for (const k of keys) if (String(k).startsWith(prefix)) tx.objectStore('private').delete(k); await done; },
    async add(event) {
      // Duplicate delivery cannot erase a prior rejection or reorder the queue.
      if (await rawGet('queue', event.eventId)) return;
      if (await vault.count() >= 10000) throw new Error('The encrypted queue is full. Restore archive access before capturing more.');
      await rawSet('queue', event.eventId, { ...await seal(event, `queue:${event.eventId}`), created: Date.now() });
    },
    async count() { return request(db.transaction('queue').objectStore('queue').count()); },
    async pending() {
      const tx = db.transaction('queue'), table = tx.objectStore('queue');
      const [entries, keys] = await Promise.all([request(table.getAll()), request(table.getAllKeys())]);
      const rows = keys.map((id, i) => ({ id, ...entries[i] })).filter(e => !e.rejected).sort((a, b) => a.created - b.created).slice(0, 25);
      const events = []; let bytes = 0;
      for (const row of rows) {
        const event = await open(row, `queue:${row.id}`), size = encode(JSON.stringify(event)).byteLength;
        if (bytes + size > 1_500_000 && events.length) break;
        events.push(event); bytes += size;
      }
      return events;
    },
    async acknowledge(results, sent) {
      const allowed = new Set(sent.map(e => e.eventId));
      for (const result of results || []) {
        if (!allowed.has(result.eventId)) continue;
        if (result.error && result.retryable) continue;
        if (result.error) { const row = await rawGet('queue', result.eventId); if (row) await rawSet('queue', result.eventId, { ...row, rejected: true }); }
        else if (result.id || result.ignored || result.duplicate) await remove('queue', result.eventId);
      }
    },
    async rejected() { return (await request(db.transaction('queue').objectStore('queue').getAll())).filter(e => e.rejected).length; },
    async clear() { const tx = db.transaction(['private', 'queue'], 'readwrite'), done = complete(tx); tx.objectStore('private').clear(); tx.objectStore('queue').clear(); await done; },
    async prune() {
      const keys = await request(db.transaction('private').objectStore('private').getAllKeys());
      for (const id of keys) if (String(id).startsWith('message:')) { const m = await vault.get(id); if (m.updated < Date.now() - 7 * 86400_000) await vault.delete(id); }
    },
    close() { db.close(); }
  };
  return vault;
}

export function archiveOrigin(value) {
  const u = new URL(value);
  if (u.username || u.password || u.search || u.hash || u.pathname !== '/' || !(u.protocol === 'https:' || u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname))) throw new Error('Use your HTTPS Undelete server address, without a path or credentials.');
  return u.origin;
}
export async function archiveRequest(config, path, body, fetcher = fetch) {
  const response = await fetcher(archiveOrigin(config.server) + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}) }, body: JSON.stringify(body), credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (response.status === 401) throw Object.assign(new Error('Undelete pairing was revoked. Pair again to resume.'), { revoked: true });
  if (!response.ok) throw new Error(`Archive request failed (${response.status}). Check the server address and pairing code.`);
  return response.json();
}
