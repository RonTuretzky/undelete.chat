import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Bookmark, Check, FileText, History, LoaderCircle, LockKeyhole, Pencil, RefreshCw, Trash2, X } from 'lucide-react';
import { boundedDiff, demoHistory, historyComparisons } from './history-view.mjs';
import './MessageHistory.css';

const time = value => new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const date = value => new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric' });
const names = { telegram: 'Telegram', signal: 'Signal', whatsapp: 'WhatsApp' };

function Change({ before, after }) {
  const oldText = before.text || '', newText = after.text || '';
  const parts = useMemo(() => boundedDiff(oldText, newText), [oldText, newText]);
  return <div className="diff-block">
    <h3>Version {before.versionNumber} → {after.versionNumber}<small>{time(after.occurredAt)}</small></h3>
    {parts ? <>
      {oldText === newText && <p className="diff-explanation">Text did not change. See the timeline for attachment details.</p>}
      <p>{parts.map((part, index) => <span key={index} className={part.added ? 'diff-added' : part.removed ? 'diff-removed' : ''}>{part.value}</span>)}</p>
    </> : <>
      <p className="diff-explanation">These versions are long or very different. Both captured copies are shown below.</p>
      <div className="diff-full-copy"><strong>Before</strong><p>{oldText || 'No text content'}</p></div>
      <div className="diff-full-copy"><strong>After</strong><p>{newText || 'No text content'}</p></div>
    </>}
  </div>;
}

export function MessageHistory({ messageId, demoMessage, refresh, request, onClose, onSave, onDelete, Platform, Status }) {
  const [data, setData] = useState(null), [busy, setBusy] = useState(true), [error, setError] = useState('');
  const [offset, setOffset] = useState(0), [retry, setRetry] = useState(0), [tab, setTab] = useState('timeline');
  const [pageInput, setPageInput] = useState('1');
  const frozenSnapshot = useRef(), loaded = useRef(null), panel = useRef(), scroll = useRef(), close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const previousFocus = document.activeElement, previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current.querySelector('[aria-label="Close history"]').focus();
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow; previousFocus?.focus?.();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // Background refresh must not replace the timeline with a loading state:
    // collapsing its height would reset the reader's scroll position.
    setBusy(!loaded.current || loaded.current.history.offset !== offset || frozenSnapshot.current === undefined);
    setError('');
    const params = new URLSearchParams({ offset: String(offset) });
    if (frozenSnapshot.current !== undefined) params.set('snapshot', String(frozenSnapshot.current));
    const pending = demoMessage ? Promise.resolve(demoHistory(demoMessage, offset, frozenSnapshot.current))
      : request(`/messages/${messageId}?${params}`, { signal: controller.signal });
    pending.then(result => {
      if (controller.signal.aborted) return;
      if (!loaded.current || loaded.current.history.offset !== result.history.offset || frozenSnapshot.current === undefined) {
        setPageInput(String(Math.floor(result.history.offset / result.history.pageSize) + 1));
      }
      frozenSnapshot.current = result.history.snapshot;
      loaded.current = result;
      setData(result);
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [messageId, demoMessage, offset, refresh, retry, request]);

  useEffect(() => { if (scroll.current) scroll.current.scrollTop = 0; }, [offset, tab]);
  useEffect(() => {
    if (!busy && !document.querySelector('dialog[open]') && (!panel.current.contains(document.activeElement) || document.activeElement.disabled)) {
      panel.current.querySelector('[aria-label="History page"], [aria-label="Close history"]').focus();
    }
  }, [busy]);

  function handleKey(event) {
    if (document.querySelector('dialog[open]')) return;
    if (event.key === 'Escape') { event.preventDefault(); close.current(); }
    if (event.key !== 'Tab') return;
    const focusable = [...panel.current.querySelectorAll('button,a[href],input,select,[tabindex="0"]')].filter(element => !element.disabled && element.getClientRects().length);
    const first = focusable[0], last = focusable.at(-1);
    if (!panel.current.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
    else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }

  function refreshHistory() { frozenSnapshot.current = undefined; if (scroll.current) scroll.current.scrollTop = 0; setOffset(0); setRetry(value => value + 1); }
  const message = data?.message, history = data?.history;
  const pages = Math.max(1, Math.ceil((history?.total || 0) / (history?.pageSize || 30)));
  const comparisons = useMemo(() => data ? historyComparisons(data.message.versions, data.history.previousVersion) : [], [data]);
  function goToPage(event) {
    event.preventDefault();
    const page = Number(pageInput);
    if (Number.isInteger(page) && page >= 1 && page <= pages) setOffset((page - 1) * history.pageSize);
  }

  return <>
    <div className="detail-backdrop" onClick={onClose}/>
    <aside ref={panel} className="detail-panel" role="dialog" aria-modal="true" aria-label="Message history">
      <header><div><History size={18}/><strong>Message history</strong></div><button className="icon-button" aria-label="Close history" onClick={onClose}><X size={20}/></button></header>
      {message && <>
        <div className="detail-intro">
          <div className="detail-source"><Platform platform={message.platform}/><div><strong>{message.authorName}</strong><span>{message.chatName}</span></div><button className={`icon-button ${message.saved ? 'is-saved' : ''}`} aria-label={message.saved ? 'Unsave selected message' : 'Save selected message'} onClick={() => onSave(message)}><Bookmark size={19} fill={message.saved ? 'currentColor' : 'none'}/></button></div>
          <div className="detail-meta"><Status status={message.status}/><span>{message.versionCount} captured {message.versionCount === 1 ? 'version' : 'versions'}</span></div>
        </div>
        {message.status === 'deleted' && <div className="deleted-notice"><Trash2 size={16}/><div><strong>Deleted from {names[message.platform]}</strong><p>{message.originalMissing ? 'The original content was not captured. This happens when the message arrived before this account was linked or while the connection was offline, or when it was sent in a chat with disappearing messages, which undelete.chat does not keep.' : 'Your captured copy is still in your archive.'}</p></div></div>}
        {message.originalMissing && message.status !== 'deleted' && <div className="info-strip">The original message was not captured. History starts with the first revision received.</div>}
        {history.latestSequence > history.snapshot && <div className="history-new-activity" role="status"><span>New activity available</span><button disabled={busy} onClick={refreshHistory}><RefreshCw size={13}/>Refresh history</button></div>}
        <div className="detail-tabs"><button className={tab === 'timeline' ? 'active' : ''} onClick={() => setTab('timeline')}>Timeline</button><button className={tab === 'compare' ? 'active' : ''} disabled={history.versionCount < 2} onClick={() => setTab('compare')}>Compare changes</button></div>
        {history.total > history.pageSize && <div className="history-pagination" aria-label="History pages">
          <div className="history-range"><span>Showing {Math.min(history.offset + 1, history.total)}–{Math.min(history.offset + message.versions.length, history.total)} of {history.total} events</span><span>Newest first</span></div>
          <div className="history-page-controls">
            <button className="button secondary compact" disabled={busy || !history.hasNewer} onClick={() => setOffset(Math.max(0, offset - history.pageSize))}><ArrowLeft size={14}/>Newer</button>
            <form onSubmit={goToPage}><label>Page<input aria-label="History page" type="number" min="1" max={pages} step="1" required disabled={busy} value={pageInput} onChange={event => setPageInput(event.target.value)}/><span>of {pages}</span></label><button className="button secondary compact" disabled={busy} type="submit">Go</button></form>
            <button className="button secondary compact" disabled={busy || !history.hasOlder} onClick={() => setOffset(offset + history.pageSize)}>Older<ArrowRight size={14}/></button>
          </div>
          <div className="history-jumps"><button disabled={busy || !history.hasNewer} onClick={() => setOffset(0)}>Latest activity</button><button disabled={busy || !history.hasOlder} onClick={() => setOffset((pages - 1) * history.pageSize)}>First captured activity</button></div>
        </div>}
      </>}
      {error && <div className="history-error" role="alert"><p>{error}</p><button className="button secondary compact" onClick={() => setRetry(value => value + 1)}>Retry</button></div>}
      <div className="detail-scroll" ref={scroll} aria-busy={busy}>
        {busy && !data ? <div className="detail-loading" role="status"><LoaderCircle className="spin"/><span>Loading history…</span></div> : busy ? <div className="history-loading" role="status"><LoaderCircle className="spin" size={17}/>Loading history…</div> : message && (tab === 'timeline' ?
          <div className="timeline">{[...message.versions].reverse().map(version => <div className={`timeline-item ${version.kind}`} key={version.sequence}>
            <span className="timeline-dot">{version.kind === 'delete' ? <Trash2 size={13}/> : version.kind === 'edit' ? <Pencil size={13}/> : <Check size={13}/>}</span>
            <div className="timeline-label"><strong>{version.kind === 'delete' ? 'Message deleted' : version.kind === 'edit' ? `Message edited · Version ${version.versionNumber}` : 'Original message'}</strong><span>{date(version.occurredAt)} · {time(version.occurredAt)}</span></div>
            {version.kind !== 'delete' && <div className="message-bubble"><p>{version.text || 'No text content'}</p>{version.attachments?.map((attachment, index) => <span className="attachment" key={index}><FileText size={16}/>{attachment.name}<small>Metadata only</small></span>)}</div>}
            <small className="capture-time">Captured {time(version.receivedAt)}</small>
          </div>)}{!message.versions.length && <p className="history-empty">No activity on this page. Choose the latest activity to return to the history.</p>}</div> :
          <div className="comparison"><div className="comparison-legend"><span><i className="removed"/>Removed</span><span><i className="added"/>Added</span></div>{comparisons.map(pair => <Change key={pair.after.sequence} {...pair}/>)}{!comparisons.length && <p className="history-empty">There are no text revisions to compare on this page. Browse another page to see more changes.</p>}</div>)}
      </div>
      {message && <footer className="detail-footer"><span><LockKeyhole size={13}/>Only visible in your archive</span><button className="icon-button" aria-label="Permanently delete archived message" onClick={() => onDelete(message)}><Trash2 size={17}/></button></footer>}
    </aside>
  </>;
}
