import React from 'react';
import './HowItWorks.css';

// Three looping scenes explain the product without a video: link a phone,
// watch recent messages for a limited window, keep only what gets deleted.
// Animations pause under prefers-reduced-motion and fall back to the final frame.
function Bubble({ x, y, w, mine, children, className = '' }) {
  return <g className={className} transform={`translate(${x} ${y})`}>
    <rect className={`bubble ${mine ? 'mine' : ''}`} width={w} height="22" rx="8"/>
    <text x="10" y="14">{children}</text>
  </g>;
}
export function HowItWorks({ compact = false, watchDays = 3 }) {
  return <section className="how-it-works" aria-labelledby="how-it-works-title">
    <div className="eyebrow">HOW IT WORKS</div>
    <h2 id="how-it-works-title">Only the messages they deleted<span className="brand-dot">.</span></h2>
    {!compact && <p>undelete.chat links to your own chat accounts, quietly watches new messages for a short window, and keeps only the ones the other person deleted. Everything else is discarded.</p>}
    <div className="how-steps">
      <div className="how-step">
        <span className="how-step-number">1</span>
        <div className="how-scene" role="img" aria-label="A phone scans a code shown by undelete.chat and reports that it is linked.">
          <svg viewBox="0 0 260 150" aria-hidden="true">
            <rect className="phone" x="28" y="18" width="62" height="114" rx="10"/>
            <rect x="40" y="30" width="38" height="70" rx="3" fill="#eef4f0"/>
            <rect x="52" y="122" width="14" height="3" rx="1.5" fill="#c9d6cf"/>
            <g className="how-qr" transform="translate(150 40)">
              <rect width="70" height="70" rx="6" fill="#fff" stroke="#d5dfda"/>
              {[[8,8],[44,8],[8,44],[26,26],[44,44],[30,8],[8,30],[52,30],[30,52]].map(([x, y], i) => <rect key={i} x={x} y={y} width="16" height="16" rx="2" fill={i < 3 ? '#207763' : '#2f3d39'} opacity={i < 3 ? 1 : .8}/>)}
            </g>
            <rect className="how-scan" x="146" y="75" width="78" height="2" fill="#207763" opacity=".9"/>
            <g className="how-linked" transform="translate(120 118)">
              <rect width="120" height="20" rx="10" fill="#207763"/>
              <text className="label" x="60" y="13" textAnchor="middle">LINKED · WATCHING</text>
            </g>
          </svg>
        </div>
        <h3>Link your account</h3>
        <p>Scan a code from WhatsApp, Telegram, or Signal on your phone. undelete.chat becomes a linked device, like a desktop app, and runs in the cloud so your computer can be off.</p>
      </div>
      <div className="how-step">
        <span className="how-step-number">2</span>
        <div className="how-scene" role="img" aria-label="Messages pass through a watch window and fade away when nothing happens to them.">
          <svg viewBox="0 0 260 150" aria-hidden="true">
            <rect className="how-window" x="70" y="14" width="120" height="122" rx="12" fill="none" stroke="#207763" strokeWidth="1.5" strokeDasharray="6 4"/>
            <text className="muted" x="130" y="30" textAnchor="middle">{watchDays}-day watch window</text>
            <g className="how-flow">
              <g className="bubble-row"><Bubble x={84} y={42} w={92}>see you at 7?</Bubble></g>
              <g className="bubble-row"><Bubble x={84} y={68} w={70} mine>yes!</Bubble></g>
              <g className="bubble-row"><Bubble x={84} y={94} w={92}>bring the docs</Bubble></g>
              <g className="bubble-row"><Bubble x={84} y={120} w={60} mine>ok</Bubble></g>
            </g>
            <text className="muted" x="228" y="80" textAnchor="middle">gone</text>
          </svg>
        </div>
        <h3>Recent messages are watched, not kept</h3>
        <p>New messages and their edits are held privately for your watch window. If nothing happens to them, they are discarded. Nothing is searchable, exported, or stored longer.</p>
      </div>
      <div className="how-step">
        <span className="how-step-number">3</span>
        <div className="how-scene" role="img" aria-label="A message is deleted in the chat and reappears in undelete.chat with its original text.">
          <svg viewBox="0 0 260 150" aria-hidden="true">
            <rect x="14" y="14" width="110" height="122" rx="10" fill="#fff" stroke="#d5dfda"/>
            <text className="muted" x="69" y="30" textAnchor="middle">Their chat</text>
            <Bubble x={22} y={40} w={94}>running late</Bubble>
            <g className="how-target"><Bubble x={22} y={68} w={94}>actually I lied</Bubble></g>
            <g className="how-tombstone" transform="translate(22 68)">
              <rect className="bubble" width="94" height="22" rx="8" strokeDasharray="3 3"/>
              <text className="muted" x="10" y="14">This message was deleted</text>
            </g>
            <Bubble x={22} y={96} w={70} mine>?</Bubble>
            <rect x="136" y="14" width="110" height="122" rx="10" fill="#fff" stroke="#bfdccd"/>
            <text x="191" y="30" textAnchor="middle" fill="#207763">undelete.chat</text>
            <circle className="how-pulse" cx="191" cy="80" r="26" fill="#207763"/>
            <g className="how-recovered" transform="translate(144 62)">
              <rect width="94" height="36" rx="8" fill="#eaf5ef" stroke="#207763"/>
              <text x="8" y="14">actually I lied</text>
              <text className="muted" x="8" y="28">deleted · 9:41</text>
            </g>
          </svg>
        </div>
        <h3>Deleted messages are undeleted</h3>
        <p>When the platform reports a deletion, the message and any edits it had are moved into your archive. That is the only way a message is ever kept.</p>
      </div>
    </div>
  </section>;
}
