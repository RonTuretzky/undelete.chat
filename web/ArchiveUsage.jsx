import React from 'react';
import { ArrowRight, HardDrive } from 'lucide-react';
import './ArchiveUsage.css';

const size = bytes => bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 ** 2).toFixed(bytes % (1024 ** 2) ? 1 : 0)} MB`;
export function ArchiveUsage({ usage, compact = false, onManage, onConnections }) {
  if (!usage) return null;
  const blocked = usage.captureBlocks.length > 0, percent = Math.min(100, Math.round(usage.usedBytes / usage.limitBytes * 100));
  const title = blocked ? 'Capture stopped' : usage.full ? 'Archive allowance reached' : usage.nearLimit ? 'Your archive is nearly full' : 'Archive storage';
  const message = blocked ? usage.captureBlocks[0].message : 'Free space by deleting archived messages or choosing a shorter retention period.';
  if (compact) return <div className={`archive-capacity-banner ${blocked || usage.full ? 'full' : ''}`} role="status">
    <HardDrive size={20}/><div><strong>{title}</strong><p>{message}</p></div>
    <button className="button secondary compact" onClick={onManage}>Manage storage<ArrowRight size={14}/></button>
  </div>;
  return <section className={`settings-card archive-usage ${blocked || usage.full ? 'full' : ''}`}>
    <div className="section-icon"><HardDrive size={20}/></div><h2>{title}</h2>
    <div className="archive-usage-numbers"><strong>{size(usage.usedBytes)}</strong><span>of {size(usage.limitBytes)} used</span></div>
    <div className="archive-usage-meter" role="meter" aria-label="Archive allowance used" aria-valuemin="0" aria-valuemax="100" aria-valuenow={percent} aria-valuetext={`${size(usage.usedBytes)} of ${size(usage.limitBytes)}`}><span style={{ width: `${percent}%` }}/></div>
    <p>Stored messages and every captured revision count toward your allowance. Exporting makes a copy; it does not free space.</p>
    {blocked ? <><p className="archive-capacity-detail">{message}</p><button className="button secondary" onClick={onConnections}>Review stopped connections<ArrowRight size={14}/></button></> : <p>Capture stops if the next event will not fit. After freeing space, resume stopped connections. Activity during a stop may not be recoverable.</p>}
    <a className="card-guide-link" href="/docs/privacy#allowance">How storage and deletion work<ArrowRight size={13}/></a>
  </section>;
}
