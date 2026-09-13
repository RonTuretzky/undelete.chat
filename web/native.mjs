// Bridge to the native store apps. The apps load this same web app inside a
// Capacitor web view, which exposes window.Capacitor and the installed native
// plugins; in a browser everything here is a no-op.
export const isNativeApp = () => typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.();
export const nativePlatform = () => (isNativeApp() ? window.Capacitor.getPlatform() : null);
const plugin = name => window.Capacitor?.Plugins?.[name] || null;

// Registers this device for native push and hands the token to the server.
export async function registerNativePush(api) {
  const push = plugin('PushNotifications');
  if (!push) throw new Error('Push notifications are not available in this app build.');
  // Android 8+ groups notifications by channel; create ours before registering.
  if (nativePlatform() === 'android') await push.createChannel({ id: 'recovered', name: 'Recovered deletions', description: 'A deleted message was recovered', importance: 4, visibility: 1, vibration: true }).catch(() => {});
  const permission = await push.requestPermissions();
  if (permission.receive !== 'granted') throw new Error('Notifications were not allowed. You can change this in your phone settings.');
  const token = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The phone did not return a notification token. Try again.')), 20_000);
    push.addListener('registration', t => { clearTimeout(timer); resolve(t.value); });
    push.addListener('registrationError', () => { clearTimeout(timer); reject(new Error('Could not register for notifications on this phone.')); });
    push.register().catch(reject);
  });
  await api('/push/native', { method: 'POST', body: { platform: nativePlatform(), token } });
  return token;
}
export async function unregisterNativePush(api) {
  const push = plugin('PushNotifications');
  if (!push) return;
  const list = await push.getDeliveredNotifications().catch(() => ({ notifications: [] }));
  await push.removeAllDeliveredNotifications().catch(() => {});
  await push.unregister?.().catch(() => {});
  return list;
}
// Notification taps open the archive; the URL comes from our own payload.
export function onNativeNotificationTap(handler) {
  const push = plugin('PushNotifications');
  if (!push) return () => {};
  const listener = push.addListener('pushNotificationActionPerformed', event => handler(String(event.notification?.data?.url || '/')));
  return () => listener.then?.(l => l.remove()).catch?.(() => {});
}
// Native apps open external pages (Stripe portal, guides) in the system browser.
export async function openExternal(url) {
  const browser = plugin('Browser');
  if (browser) await browser.open({ url }); else window.open(url, '_blank', 'noopener');
}
