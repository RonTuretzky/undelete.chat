import React from 'react';
import { ArrowRight, Check, Cpu, EyeOff, KeyRound, Mail, MessageCircle, ShieldCheck } from 'lucide-react';
import { HowItWorks } from './HowItWorks';
import { platformGuides, platformOrder } from './guides.mjs';
import './Landing.css';

const names = { discord: 'Discord', telegram: 'Telegram', signal: 'Signal', whatsapp: 'WhatsApp' };
export const inquiryEmail = 'turetzkyron@gmail.com';
const inquiryLink = `mailto:${inquiryEmail}?subject=${encodeURIComponent('Undelete Premium inquiry')}&body=${encodeURIComponent('Hi,\n\nI am interested in Undelete Premium with trusted execution environments.\n\nAccounts to link: \nApproximate number of users: \nAnything else: \n')}`;
export function Landing({ billing, onStart, onSignIn, onDemo, onGuide, Platform }) {
  const trial = billing?.enabled && billing.trialDays ? billing.trialDays : null;
  const price = billing?.priceLabel || null;
  const go = (e, href) => { e.preventDefault(); onGuide(href); };
  return <div className="landing">
    <header className="landing-nav">
      <button className="brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Undelete"><span className="brand-icon"><MessageCircle size={20}/></span>undelete<span className="brand-dot">.</span></button>
      <nav aria-label="Landing sections"><a href="#how">How it works</a><a href="#platforms">Platforms</a><a href="#privacy">Privacy</a><a href="#pricing">Pricing</a><a href="/docs" onClick={e => go(e, '/docs')}>Help</a></nav>
      <span className="spacer"/>
      <button className="text-button" onClick={onSignIn}>Sign in</button>
      <button className="button primary" onClick={onStart}>Start free<ArrowRight size={16}/></button>
    </header>
    <section className="landing-hero">
      <div>
        <div className="eyebrow">FOR WHATSAPP · TELEGRAM · SIGNAL · DISCORD</div>
        <h1>They deleted it.<br/>You still have it<span className="brand-dot">.</span></h1>
        <p className="lede">Undelete links to your own chat accounts and keeps the messages other people delete, with the edits they made before deleting. Nothing else is stored.</p>
        <div className="landing-cta">
          <button className="button primary" onClick={onStart}>Start free{trial ? `, ${trial}-day trial` : ''}<ArrowRight size={17}/></button>
          <button className="button secondary" onClick={onDemo}>See a live demo<ArrowRight size={16}/></button>
        </div>
        <p className="landing-fineprint">No card needed to start. Runs in the cloud, so your computer can be off. Cancel any time.</p>
      </div>
      <div className="hero-scene" aria-hidden="true"><HeroScene/></div>
    </section>
    <section className="landing-section" id="how"><HowItWorks/></section>
    <section className="landing-section" id="platforms">
      <h2>Works with the chats you already use<span className="brand-dot">.</span></h2>
      <p className="lede">Link a personal account in about a minute by scanning a code on your phone. No developer keys, no downloads.</p>
      <div className="platform-grid">{platformOrder.map(p => <div className="platform-tile" key={p}><Platform platform={p}/><strong>{names[p]}</strong><span className="capability-tag">{platformGuides[p].mode}</span><p>{platformGuides[p].coverage}</p><a className="card-guide-link" href={`/docs/${p}`} onClick={e => go(e, `/docs/${p}`)}>Setup guide<ArrowRight size={13}/></a></div>)}</div>
    </section>
    <section className="landing-section" id="privacy">
      <h2>Built to keep as little as possible<span className="brand-dot">.</span></h2>
      <p className="lede">Most archiving tools keep everything. Undelete is designed around the opposite promise.</p>
      <div className="pillars">
        <div className="pillar"><EyeOff size={22}/><h3>Only deleted messages are kept</h3><p>New messages are held privately for a watch window you control (1 to 30 days) and then discarded. If nobody deletes them, they are gone from Undelete too.</p></div>
        <div className="pillar"><KeyRound size={22}/><h3>Encrypted, account by account</h3><p>Message content and linked sessions are encrypted at rest with keys bound to your account. Passwords are hashed with scrypt; there are no analytics or tracking cookies.</p></div>
        <div className="pillar"><ShieldCheck size={22}/><h3>Yours to export or erase</h3><p>Export everything as JSON, remove single messages, disconnect an account, or delete your workspace in one click. No email required to sign up.</p></div>
      </div>
      <p className="landing-fineprint">Read the full <a href="/docs/privacy" onClick={e => go(e, '/docs/privacy')}>privacy policy</a>. Content is decrypted by the server to show it to you; this is not end-to-end encryption.</p>
    </section>
    <section className="landing-section" id="pricing">
      <h2>Two ways to run Undelete<span className="brand-dot">.</span></h2>
      <p className="lede">Start with the standard plan in a minute. Choose Premium when your messages must stay unreadable even to the people running the servers.</p>
      <div className="pricing tiers">
        <div className="price-card">
          <div className="eyebrow">STANDARD</div>
          <div className="price">{price || 'Simple monthly plan'}{price && <small>per month</small>}</div>
          <ul>
            <li><Check size={15}/>Up to four linked accounts across WhatsApp, Telegram, Signal, and Discord</li>
            <li><Check size={15}/>Deleted messages kept with every edit they had</li>
            <li><Check size={15}/>Adjustable watch window and retention</li>
            <li><Check size={15}/>Bookmarks, search across deleted messages, JSON export</li>
            <li><Check size={15}/>Hosted 24/7; nothing to install</li>
            <li><Check size={15}/>Encrypted at rest; the service can decrypt to show you your archive</li>
          </ul>
          <button className="button primary full" onClick={onStart}>{trial ? `Start your ${trial}-day free trial` : 'Get started'}<ArrowRight size={16}/></button>
          {trial && <p className="landing-fineprint">{trial} days free, no card on file. Cancel any time from Settings.</p>}
        </div>
        <div className="price-card premium">
          <div className="eyebrow">PREMIUM</div>
          <div className="price">Custom<small>by inquiry</small></div>
          <p className="premium-lede"><Cpu size={16}/>Your archive runs inside a trusted execution environment, so message content and linked sessions are processed only in hardware-isolated memory that operators cannot read.</p>
          <ul>
            <li><Check size={15}/>Everything in Standard</li>
            <li><Check size={15}/>Collectors and archive inside a confidential-computing enclave with remote attestation you can verify</li>
            <li><Check size={15}/>Keys sealed to the enclave; no operator, backup, or provider image can decrypt your data</li>
            <li><Check size={15}/>Dedicated capacity, more linked accounts, and a longer watch window on request</li>
            <li><Check size={15}/>Priority support and a written data-handling agreement</li>
          </ul>
          <a className="button secondary full" href={inquiryLink}><Mail size={16}/>Email {inquiryEmail}<ArrowRight size={16}/></a>
          <p className="landing-fineprint">Tell us which accounts you want to link and roughly how many people need it. We reply within two business days.</p>
        </div>
      </div>
      <div className="pricing-notes">
        <p>Payments for the Standard plan are handled by Stripe; Undelete never sees your card number. Your archive stays readable and exportable even without an active plan. See <a href="/docs/billing" onClick={e => go(e, '/docs/billing')}>plans, trials, and billing</a>.</p>
      </div>
    </section>
    <section className="landing-section" id="faq">
      <h2>Questions<span className="brand-dot">.</span></h2>
      <div className="faq">
        <details><summary>Can it recover messages deleted before I signed up?</summary><p>No. Undelete can only keep a message it received while your account was linked and still inside the watch window when the deletion happened. It cannot reach back into the past.</p></details>
        <details><summary>Does the other person know?</summary><p>Undelete appears on your account as a linked device, exactly like a desktop app. Nothing is sent to the other person, and nothing changes in the conversation.</p></details>
        <details><summary>What about messages I delete myself?</summary><p>Deletions on your own messages are captured the same way if the platform reports them to linked devices. You can remove anything from Undelete permanently at any time.</p></details>
        <details><summary>Is this allowed by WhatsApp, Telegram, Signal, and Discord?</summary><p>Telegram offers an official personal API. WhatsApp and Signal are linked through unofficial device clients, which their terms may restrict. Discord forbids automated personal accounts, so its connector is experimental and clearly labelled. Each platform guide explains the risks before you link.</p></details>
        <details><summary>Are photos, voice notes, and files kept?</summary><p>Only their names and types. File bodies, view-once media, and disappearing messages are never stored.</p></details>
        <details><summary>What does Premium with trusted execution environments add?</summary><p>On the Standard plan the server holds the key that decrypts your archive, so operators could technically read stored content. Premium runs the collectors and the archive inside a confidential-computing enclave: keys are sealed to attested hardware, memory is encrypted by the CPU, and neither operators, backups, nor the hosting provider can read your data. Email {inquiryEmail} to discuss it.</p></details>
        <details><summary>Who can read my messages?</summary><p>Content is encrypted at rest, and the server decrypts it only to show it to you. The people operating the server could technically access stored data, so this is not end-to-end encryption. The privacy policy spells out exactly what is stored and for how long.</p></details>
      </div>
    </section>
    <section className="landing-final">
      <h2>Stop losing the messages that mattered<span className="brand-dot">.</span></h2>
      <p className="lede" style={{ margin: '12px auto 22px' }}>Link an account in a minute. Keep only what they deleted.</p>
      <div className="landing-cta" style={{ justifyContent: 'center' }}><button className="button primary" onClick={onStart}>Start free<ArrowRight size={17}/></button><button className="button secondary" onClick={onDemo}>See a live demo<ArrowRight size={16}/></button></div>
    </section>
    <footer className="landing-footer">
      <span>undelete<span className="brand-dot">.</span> · They deleted it. You still have it.</span>
      <nav><a href="/docs" onClick={e => go(e, '/docs')}>Help & guides</a><a href="/docs/privacy" onClick={e => go(e, '/docs/privacy')}>Privacy policy</a><a href="/docs/terms" onClick={e => go(e, '/docs/terms')}>Terms</a><a href="/docs/billing" onClick={e => go(e, '/docs/billing')}>Billing</a></nav>
    </footer>
  </div>;
}

// Hero illustration: a deleted chat bubble reappears in Undelete. Reuses the
// third how-it-works scene at a larger size so the two stay consistent.
function HeroScene() {
  return <div className="how-scene">
    <svg viewBox="0 0 520 300" aria-hidden="true">
      <rect x="24" y="24" width="220" height="252" rx="16" fill="#f6f8f7" stroke="#d5dfda"/>
      <text className="muted" x="134" y="52" textAnchor="middle" style={{ fontSize: 12 }}>Their chat</text>
      <g transform="translate(40 72)"><rect className="bubble" width="188" height="40" rx="12"/><text x="16" y="25" style={{ fontSize: 13 }}>running late, sorry</text></g>
      <g className="how-target" transform="translate(40 124)"><rect className="bubble" width="188" height="40" rx="12"/><text x="16" y="25" style={{ fontSize: 13 }}>I never agreed to that</text></g>
      <g className="how-tombstone" transform="translate(40 124)"><rect className="bubble" width="188" height="40" rx="12" strokeDasharray="4 4"/><text className="muted" x="16" y="25" style={{ fontSize: 12 }}>This message was deleted</text></g>
      <g transform="translate(40 176)"><rect className="bubble mine" width="120" height="40" rx="12"/><text x="16" y="25" style={{ fontSize: 13 }}>wait, what?</text></g>
      <rect x="276" y="24" width="220" height="252" rx="16" fill="#fff" stroke="#bfdccd"/>
      <text x="386" y="52" textAnchor="middle" fill="#207763" style={{ fontSize: 12, fontWeight: 700 }}>undelete.</text>
      <circle className="how-pulse" cx="386" cy="150" r="54" fill="#207763"/>
      <g className="how-recovered" transform="translate(292 112)">
        <rect width="188" height="76" rx="12" fill="#eaf5ef" stroke="#207763"/>
        <text x="16" y="26" style={{ fontSize: 13 }}>I never agreed to that</text>
        <text className="muted" x="16" y="46" style={{ fontSize: 11 }}>Maya · deleted at 9:41</text>
        <text className="muted" x="16" y="62" style={{ fontSize: 11 }}>1 version kept</text>
      </g>
    </svg>
  </div>;
}
