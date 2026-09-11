import { archiveOrigin } from './storage.mjs';
const $ = id => document.getElementById(id);
async function send(action, data = {}) { const r = await chrome.runtime.sendMessage({ action, ...data }); if (!r?.ok) throw new Error(r?.error || 'The extension could not start. Reload it from Chrome Extensions.'); return r.data; }
function error(e) { $('error').textContent = e?.message || ''; $('error').hidden = !e; }
function paint(s) {
  $('pairing').hidden = s.paired; $('connection').hidden = !s.paired;
  $('connection-name').textContent = s.name || 'Your archive';
  $('identity').textContent = s.identity ? `Discord account: ${s.identity}` : s.server || '';
  $('status-title').textContent = s.paused ? 'Paused in Undelete' : s.health === 'connected' ? 'Capturing personal messages' : s.health === 'error' ? 'Needs attention' : s.active ? 'Waiting for Discord' : 'Ready to start';
  $('status-detail').textContent = s.uploadError || (s.paused ? 'Resume this source in Undelete. Activity received while paused is discarded.' : s.detail);
  $('light').classList.toggle('live', s.health === 'connected' && !s.paused);
  $('counts').textContent = `${s.captured} events captured this session · ${s.queued} queued${s.rejected ? ` · ${s.rejected} rejected` : ''}`;
  $('start-controls').hidden = s.active; $('stop').hidden = !s.active;
}
async function tabs() { const selected = $('tabs').value; const rows = await send('tabs'); $('tabs').replaceChildren(new Option('Choose a Discord tab', ''), ...rows.map(t => new Option(t.title, t.id))); if (rows.some(t => String(t.id) === selected)) $('tabs').value = selected; else if (rows.length === 1) $('tabs').value = String(rows[0].id); }
async function action(name, data = {}) { error(null); try { paint(await send(name, data)); } catch (e) { error(e); } }
$('pair-form').addEventListener('submit', async e => {
  e.preventDefault(); error(null);
  const button = e.target.querySelector('button'); button.disabled = true;
  try {
    const server = archiveOrigin(e.target.elements.server.value.trim());
    if (!await chrome.permissions.request({ origins: [server + '/*'] })) throw new Error('Allow your Undelete server so the extension can upload captured messages.');
    paint(await send('pair', { server, code: e.target.elements.code.value })); e.target.elements.code.value = ''; await tabs();
  } catch (e) { error(e); } finally { button.disabled = false; }
});
$('start').onclick = () => { const value = $('tabs').value; if (!value) return error(new Error('Open Discord Web, then choose its tab.')); action('start', { tabId: Number(value) }); };
$('stop').onclick = () => action('stop');
$('disconnect').onclick = () => action('disconnect');
$('refresh').onclick = () => tabs().catch(error);
Promise.all([send('status').then(paint), tabs()]).catch(error);
setInterval(() => send('status').then(paint).catch(error), 2000);
