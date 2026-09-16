import React, { useEffect, useRef, useState } from 'react';
import { CircleHelp, Smartphone, X } from 'lucide-react';
import { DeviceArchive } from './DeviceArchive';
import { Docs } from './Docs';
import { platformOrder } from './guides.mjs';
import './style.css';

// The phone-only app. The interface is bundled inside the app and nothing here
// talks to a server: no account, no sign-in, no network. Messages come from
// this phone's notifications and stay in its own database.
function Modal({ children, title, onClose, wide = false }) {
  const ref = useRef();
  useEffect(() => { ref.current.showModal(); }, []);
  return <dialog ref={ref} className={`modal ${wide ? 'wide' : ''}`} onCancel={onClose} onClick={e => { if (e.target === ref.current) onClose(); }}><header className="modal-header"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={20}/></button></header>{children}</dialog>;
}
const names = { telegram: 'Telegram', signal: 'Signal', whatsapp: 'WhatsApp' };
function Platform({ platform, small = false }) { return <span className={`platform-icon ${platform} ${small ? 'small' : ''}`} title={names[platform]}>{platform[0].toUpperCase()}</span>; }
export function LocalApp() {
  const [view, setView] = useState('device'), [guide, setGuide] = useState(''), [notice, setNotice] = useState('');
  useEffect(() => { document.documentElement.classList.add('native'); }, []);
  useEffect(() => { if (notice) { const t = setTimeout(() => setNotice(''), 4000); return () => clearTimeout(t); } }, [notice]);
  const openGuide = href => { const slug = new URL(href, 'https://local').pathname.split('/')[2] || ''; setGuide(slug); setView('docs'); window.scrollTo(0, 0); };
  return <div className="app-shell local-app">
    <div className="main-shell">
      <header className="topbar"><div className="brand" style={{ fontSize: 20 }}>undelete<span className="brand-dot">.chat</span></div><div className="top-actions"><span className="capture-indicator live"><span/>Phone only · no server</span>{view === 'docs' ? <button className="text-button" onClick={() => setView('device')}><Smartphone size={14}/> Back to messages</button> : <button className="text-button" onClick={() => openGuide('/docs/getting-started#device-mode')}><CircleHelp size={14}/> Help</button>}</div></header>
      <main>
        {view === 'docs' ? <Docs slug={guide} onNavigate={openGuide} onConnect={() => setView('device')} Platform={Platform}/> : <>
          <div className="page-heading"><div><div className="eyebrow">DEVICE MODE</div><h1>On this phone<span>.</span></h1><p>Messages read from this phone’s notifications. Nothing leaves the device, and there is no account.</p></div></div>
          <DeviceArchive Modal={Modal} notify={setNotice}/>
        </>}
      </main>
      <footer className="app-footer"><span>undelete<span className="brand-dot">.chat</span></span><span>Phone-only edition · {platformOrder.map(p => names[p]).join(', ')} notifications</span></footer>
    </div>
    {notice && <div className="toast" role="status">{notice}</div>}
  </div>;
}
