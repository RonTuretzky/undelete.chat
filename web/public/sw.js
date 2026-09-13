// undelete.chat service worker: caches the app shell for fast, offline-tolerant
// launches and shows push notifications. It never caches anything under /api,
// so message content is never written to the browser cache.
const VERSION = 'v1';
const SHELL = `shell-${VERSION}`, ASSETS = `assets-${VERSION}`;
self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL).then(cache => cache.addAll(['/', '/manifest.webmanifest', '/icons/icon-192.png'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => ![SHELL, ASSETS].includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (event.request.mode === 'navigate') {
    // Network first so deploys are picked up; fall back to the cached shell offline.
    event.respondWith(fetch(event.request).then(response => { const copy = response.clone(); caches.open(SHELL).then(c => c.put('/', copy)); return response; }).catch(() => caches.match('/')));
    return;
  }
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest') {
    // Hashed assets are immutable: cache first, refresh in the background.
    event.respondWith(caches.open(ASSETS).then(async cache => {
      const cached = await cache.match(event.request);
      const network = fetch(event.request).then(response => { if (response.ok) cache.put(event.request, response.clone()); return response; }).catch(() => cached);
      return cached || network;
    }));
  }
});
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  // Payloads carry counts and platform names only, never message content.
  const count = Number(data.count) || 1, platform = data.platform ? String(data.platform) : '';
  const title = data.title ? String(data.title).slice(0, 80) : 'undelete.chat';
  const body = data.body ? String(data.body).slice(0, 160) : (count === 1 ? `A deleted ${platform} message was recovered.` : `${count} deleted messages were recovered.`);
  event.waitUntil(self.registration.showNotification(title, { body, icon: '/icons/icon-192.png', badge: '/icons/badge-96.png', tag: 'undelete-recovered', renotify: true, data: { url: data.url || '/' } }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => c.url.startsWith(self.location.origin));
    if (open) { open.navigate(target); return open.focus(); }
    return self.clients.openWindow(target);
  }));
});
