import React, { useEffect, useState } from 'react';
import { ArrowRight, Bell, BellOff, Smartphone } from 'lucide-react';
import { registerNativePush, unregisterNativePush, nativePlatform } from './native.mjs';

// Install the web app to the home screen and manage push notifications for
// recovered deletions. Works as a Progressive Web App on Android (Chrome) and
// on iOS 16.4+ once added to the Home Screen.
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const toKey = base64 => { const padded = (base64 + '='.repeat((4 - base64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/'); const raw = atob(padded); return Uint8Array.from(raw, c => c.charCodeAt(0)); };
export function usePwaInstall() {
  const [prompt, setPrompt] = useState(null), [installed, setInstalled] = useState(standalone());
  useEffect(() => {
    const before = e => { e.preventDefault(); setPrompt(e); };
    const done = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener('beforeinstallprompt', before); window.addEventListener('appinstalled', done);
    return () => { window.removeEventListener('beforeinstallprompt', before); window.removeEventListener('appinstalled', done); };
  }, []);
  return { prompt, installed, install: async () => { if (!prompt) return false; prompt.prompt(); const { outcome } = await prompt.userChoice; if (outcome === 'accepted') setPrompt(null); return outcome === 'accepted'; } };
}
export function PhoneAppCard({ api, isDemo, notify, busy, perform, native = false }) {
  if (native) return <NativeNotificationsCard api={api} isDemo={isDemo} notify={notify} busy={busy} perform={perform}/>;
  return <BrowserPhoneCard api={api} isDemo={isDemo} notify={notify} busy={busy} perform={perform}/>;
}
function NativeNotificationsCard({ api, isDemo, notify, busy, perform }) {
  const [push, setPush] = useState(null), [registered, setRegistered] = useState(false);
  const platform = nativePlatform();
  useEffect(() => { if (isDemo) return; let alive = true; api('/push').then(d => { if (alive) { setPush(d); setRegistered(d.devices.some(x => x.platform === platform)); } }).catch(() => {}); return () => { alive = false; }; }, [isDemo]);
  const enable = () => perform(async () => { await registerNativePush(api); setRegistered(true); notify('Notifications are on for this phone.'); });
  const disable = () => perform(async () => { await unregisterNativePush(api); const d = await api('/push'); for (const _ of d.devices.filter(x => x.platform === platform)) { /* tokens are removed server-side when they stop delivering */ } setRegistered(false); notify('Notifications are off for this phone.'); });
  const test = () => perform(async () => { const { delivered } = await api('/push/test', { method: 'POST', body: {} }); notify(delivered ? 'Test notification sent.' : 'No registered phone received it. Turn notifications on first.'); });
  const configured = push?.native?.[platform];
  return <section className="settings-card"><div className="section-icon"><Bell size={20}/></div><h2>Notifications</h2>
    {isDemo ? <p>Sign in to turn on notifications for recovered deletions.</p>
      : push && !configured ? <p>Notifications for this app are not switched on by the operator yet.</p>
      : <><p>Get a notification when a deleted message is recovered. Notifications never include message content, only the platform and a count.</p>
        <div className="plan-actions">{registered ? <><button className="button secondary" disabled={busy} onClick={disable}><BellOff size={16}/>Turn off on this phone</button><button className="button secondary" disabled={busy} onClick={test}>Send a test</button></> : <button className="button primary" disabled={busy || !push} onClick={enable}><Bell size={16}/>Turn on notifications</button>}</div></>}
  </section>;
}
function BrowserPhoneCard({ api, isDemo, notify, busy, perform }) {
  const { prompt, installed, install } = usePwaInstall();
  const [push, setPush] = useState(null), [permission, setPermission] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
  const [subscribed, setSubscribed] = useState(false);
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined';
  useEffect(() => {
    if (isDemo) return;
    let alive = true;
    api('/push').then(async data => {
      if (!alive) return; setPush(data);
      if (supported && data.enabled) { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); if (alive) setSubscribed(!!sub && data.subscriptions.some(s => s.endpoint === sub.endpoint)); }
    }).catch(() => {});
    return () => { alive = false; };
  }, [isDemo]);
  const enable = () => perform(async () => {
    const result = await Notification.requestPermission(); setPermission(result);
    if (result !== 'granted') throw new Error('Notifications were not allowed. You can change this in your browser or phone settings.');
    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(push.publicKey) });
    await api('/push/subscribe', { method: 'POST', body: { subscription: subscription.toJSON() } });
    setSubscribed(true); notify('Notifications are on for this device.');
  });
  const disable = () => perform(async () => {
    const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription();
    if (sub) { await api('/push/subscribe', { method: 'DELETE', body: { endpoint: sub.endpoint } }); await sub.unsubscribe(); }
    setSubscribed(false); notify('Notifications are off for this device.');
  });
  const test = () => perform(async () => { const { delivered } = await api('/push/test', { method: 'POST', body: {} }); notify(delivered ? 'Test notification sent.' : 'No subscribed device received it. Turn notifications on first.'); });
  return <section className="settings-card"><div className="section-icon"><Smartphone size={20}/></div><h2>Phone app</h2>
    {installed ? <p>You are using the installed app. Recovered deletions can notify you here even when the app is closed.</p>
      : prompt ? <><p>Install undelete.chat on this device for a full-screen app with its own icon.</p><button className="button primary" onClick={install}><Smartphone size={16}/>Install app<ArrowRight size={16}/></button></>
      : isIOS() ? <p>On iPhone or iPad, open this page in Safari, tap the Share button, then <strong>Add to Home Screen</strong>. The installed app supports notifications on iOS 16.4 and later.</p>
      : <p>On Android, open this page in Chrome and choose <strong>Install app</strong> from the menu. On desktop Chrome, use the install icon in the address bar.</p>}
    <div className="settings-divider"/><h2>Notifications</h2>
    {isDemo ? <p>Sign in to turn on notifications for recovered deletions.</p>
      : !supported ? <p>This browser does not support push notifications. {isIOS() && !installed ? 'Add the app to your Home Screen first, then enable them from there.' : ''}</p>
      : push && !push.enabled ? <p>Notifications are not enabled on this server.</p>
      : <><p>Get a notification when a deleted message is recovered. Notifications never include message content, only the platform and a count.</p>
        <div className="plan-actions">{subscribed ? <><button className="button secondary" disabled={busy} onClick={disable}><BellOff size={16}/>Turn off on this device</button><button className="button secondary" disabled={busy} onClick={test}>Send a test</button></> : <button className="button primary" disabled={busy || permission === 'denied' || !push} onClick={enable}><Bell size={16}/>Turn on notifications</button>}</div>
        {permission === 'denied' && <p className="form-error">Notifications are blocked for this site. Allow them in your browser or phone settings, then try again.</p>}
        {!!push?.subscriptions?.length && <p className="wizard-smallprint">{push.subscriptions.length} device{push.subscriptions.length === 1 ? '' : 's'} subscribed on this account.</p>}</>}
  </section>;
}
