import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCheck, ChevronRight, Cloud, LoaderCircle, Radio, RefreshCw, ShieldCheck } from 'lucide-react';
import { LocalConnectionWizard } from './ConnectionWizard.jsx';
import { platformGuides } from './guides.mjs';

const phoneSteps = {
  whatsapp: 'WhatsApp → Settings (iPhone) or ⋮ (Android) → Linked devices → Link a device.',
  signal: 'Signal → your profile / Settings → Linked devices → Link a new device (or +).',
  telegram: 'Telegram → Settings → Devices → Link Desktop Device.'
};
export function ConnectionWizard(props) {
  const [capabilities, setCapabilities] = useState(null), [error, setError] = useState('');
  const [platform, setPlatform] = useState(props.initialConnection?.platform || props.initialPlatform || null);
  useEffect(() => { let active = true; props.api('/capabilities').then(r => { if (active) setCapabilities(r.hosted); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, []);
  const { Modal, Platform, onClose } = props;
  if (!capabilities) return <Modal title="Connect an account" onClose={onClose}>{error ? <p className="form-error" role="alert">{error}</p> : <p className="modal-description"><LoaderCircle size={18} className="spin"/> Checking connection options…</p>}</Modal>;
  if (!capabilities.enabled || platform === 'discord') return <LocalConnectionWizard {...props} initialPlatform={platform} />;
  if (!platform) return <Modal title="Connect an account" wide onClose={onClose}>
    <p className="modal-description">Link your phone once. Afterword captures on the server, even when your computer is off.</p>
    <div className="platform-choices">{['whatsapp', 'telegram', 'signal', 'discord'].map(p => <button key={p} onClick={() => setPlatform(p)}><Platform platform={p}/><span><strong>{platformGuides[p].name}</strong><small>{p === 'discord' ? 'Browser extension only · requires an open tab' : capabilities.platforms[p] ? 'Cloud capture · scan a QR code' : 'Cloud setup not configured'}</small></span><ChevronRight size={18}/></button>)}</div>
    <div className="setup-footnote"><Cloud size={17}/><span>WhatsApp, Telegram, and Signal run in the cloud. Discord does not currently support hosted capture.</span></div>
  </Modal>;
  return <HostedSetup {...props} key={platform} platform={platform} available={capabilities.platforms[platform]} onBack={() => setPlatform(null)}/>;
}
function HostedSetup({ platform, available, initialConnection, Modal, Platform, api, onClose, onFinish, onChanged, onBack }) {
  const info = platformGuides[platform];
  const [connection, setConnection] = useState(initialConnection || null);
  const [setup, setSetup] = useState(null), [name, setName] = useState(initialConnection?.name || `My ${info.name}`);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [reply, setReply] = useState('');
  const [relink, setRelink] = useState(false), [now, setNow] = useState(Date.now());
  const hosted = setup?.mode === 'hosted' || connection?.collector === 'hosted';
  const connected = hosted && setup?.running && setup.health === 'connected';
  const hasCapture = connection?.last_message_at && connection.last_message_at >= connection.paired_at;
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { setReply(''); }, [setup?.prompt?.id]);
  useEffect(() => {
    if (!connection?.id) return;
    let active = true;
    const poll = async () => {
      try {
        const [result, list] = await Promise.all([api(`/connections/${connection.id}/hosted`), api('/connections')]);
        if (!active) return;
        setSetup(result.setup); const updated = list.connections.find(c => c.id === connection.id);
        if (updated) setConnection(updated);
      } catch (e) { if (active) setError(e.message); }
    };
    poll(); const timer = setInterval(poll, 2000);
    return () => { active = false; clearInterval(timer); };
  }, [connection?.id]);
  async function start(options = {}) {
    setBusy(true); setError('');
    try {
      const c = connection || (await api('/connections', { method: 'POST', body: { platform, name } })).connection;
      setConnection(c);
      const result = await api(`/connections/${c.id}/hosted/start`, { method: 'POST', body: { consent: true, ...options } });
      setSetup(result.setup); setRelink(false); onChanged();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function respond(e) {
    e.preventDefault(); setBusy(true); setError('');
    try { await api(`/connections/${connection.id}/hosted/reply`, { method: 'POST', body: { promptId: setup.prompt.id, value: reply } }); setReply(''); setSetup(s => ({ ...s, prompt: null })); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const qr = setup?.qr && now < Date.parse(setup.qr.expiresAt) ? setup.qr : null;
  return <Modal title={connected ? `${info.name} is connected` : `Connect ${info.name}`} wide onClose={onClose}>
    <div className="wizard-platform"><Platform platform={platform}/><div><strong>{info.name}</strong><span><Cloud size={14}/> Hosted account connection</span></div><a href={`/docs/${platform}`} target="_blank" rel="noreferrer">Setup guide</a></div>
    {!available ? <><div className="info-strip">This platform needs server configuration before you can connect. Your account has not been linked.</div><button className="button secondary" onClick={onBack}><ArrowLeft size={15}/>Choose another platform</button></> : !hosted ? <>
      <p className="modal-description">{info.coverage}</p>
      <div className="prerequisite-card"><h3>Have your phone ready</h3><p>Open {info.name} on your primary phone. You’ll scan a code here{platform === 'telegram' ? ' and enter your two-step verification password if you use one' : ' and approve a new linked device'}.</p><p>No downloads, terminal commands, or computer left running.</p></div>
      <form onSubmit={e => { e.preventDefault(); start(); }}>
        <label>Connection name<input value={name} onChange={e => setName(e.target.value)} maxLength={100} required disabled={!!connection}/></label>
        <label className="checkbox-label"><input type="checkbox" required/><span>I authorize Afterword to connect to this account on its server and store copies of conversations I’m authorized to retain. Copies can remain after messages are edited or deleted.</span></label>
        {connection?.collector && <div className="info-strip">Moving this source to the cloud stops its old local collector from uploading. Your existing archive stays available.</div>}
        <div className="wizard-actions"><button type="button" className="button secondary" onClick={onBack}><ArrowLeft size={15}/>Back</button><button className="button primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16}/> : <Cloud size={16}/>} {connection?.collector ? 'Move connection to cloud' : 'Show my QR code'}</button></div>
      </form>
      <p className="wizard-smallprint">Your linked session and messages are stored on Afterword’s server. Saved credentials and message content are encrypted at rest; the server can decrypt them to provide the service.</p>
    </> : connected ? <>
      <div className="hosted-success"><CheckCheck size={30}/><h3>{setup.paused ? 'Connected, with capture paused' : 'Your cloud connection is running'}</h3><p>{setup.paused ? 'Resume capture in Connections when you are ready.' : 'You can close this page and turn off your computer. Afterword will keep receiving messages on the server.'}</p></div>
      <div className="verification-check"><Check size={16}/><span>Platform sign-in complete</span></div>
      <div className="verification-check">{hasCapture ? <Check size={16}/> : <Radio size={16}/>}<span>{hasCapture ? 'A message has reached your archive' : 'Waiting for the first captured message'}</span></div>
      <p className="modal-description">Send a harmless message to your own chat, then check your archive. Edit and delete it to verify the history that this platform delivers.</p>
      <div className="wizard-actions"><button className="button secondary" onClick={onClose}>Manage connections</button><button className="button primary" onClick={onFinish}>Open my archive<ArrowRight size={16}/></button></div>
    </> : <>
      {setup?.prompt ? <form onSubmit={respond} className="hosted-prompt"><h3>One more step</h3><label>{setup.prompt.label}<input key={setup.prompt.id} type={setup.prompt.secret ? 'password' : 'text'} value={reply} onChange={e => setReply(e.target.value)} autoComplete="off" maxLength={256} required autoFocus/></label><p className="wizard-smallprint">This response is used for this sign-in step and is not saved in Afterword’s logs.</p><button className="button primary" disabled={busy}>Continue<ArrowRight size={16}/></button></form> : qr ? <div className="hosted-qr-layout"><div className="hosted-qr"><img src={qr.image} width="320" height="320" alt={`${info.name} account linking QR code`}/><span>Expires in {Math.max(1, Math.ceil((Date.parse(qr.expiresAt) - now) / 1000))} seconds</span></div><div><h3>Scan with {info.name}</h3><ol><li>On your phone, open <strong>{phoneSteps[platform]}</strong></li><li>Use the scanner inside {info.name} to scan this code.</li><li>Approve the device link. This page will confirm when it’s connected.</li></ol><p className="wizard-smallprint">Keep this code private. It links your account to Afterword.</p></div></div> : <div className={`pairing-status ${setup?.health === 'error' ? 'attention' : ''}`} role="status">{setup?.running && setup.health !== 'error' ? <LoaderCircle className="spin" size={21}/> : <Radio size={21}/>}<div><strong>{setup?.health === 'error' ? 'Let’s reconnect' : setup?.running ? 'Preparing your connection' : 'Ready when you are'}</strong><p>{setup?.detail || 'Starting the hosted collector…'}</p></div></div>}
      {!qr && !setup?.prompt && <button className="button secondary" disabled={busy} onClick={() => start({ restart: true })}><RefreshCw size={15}/>{setup?.running ? 'Get a fresh code' : 'Try again'}</button>}
      <details className="resume-help"><summary>Connection options</summary><p>Try again resumes your saved cloud session. Relink clears this source’s saved platform login and asks you to scan a new code; your archived messages remain.</p>{relink ? <div className="info-strip"><p>Replace the saved {info.name} login for this connection?</p><button className="button secondary" disabled={busy} onClick={() => start({ relink: true })}>Confirm relink</button><button className="button secondary" onClick={() => setRelink(false)}>Cancel</button></div> : <button className="button secondary" onClick={() => setRelink(true)}>Relink account</button>}</details>
      <div className="wizard-actions"><a href={`/docs/${platform}#fixes`} target="_blank" rel="noreferrer">Troubleshooting</a><button className="button secondary" onClick={onClose}>Finish later</button></div>
    </>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="setup-footnote"><ShieldCheck size={16}/><span>{info.exclusions}</span></div>
  </Modal>;
}
