import { DEFAULTS, cleanCaption, looksStandard } from './rules.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = { get: async k => (await chrome.storage.local.get(k))[k], set: (k, v) => chrome.storage.local.set({ [k]: v }) };
const log = (t, err) => { const d = document.createElement('div'); d.textContent = new Date().toLocaleTimeString('vi-VN') + ' ' + t; if (err) d.className = 'err'; $('#log').prepend(d); };

// ---------- tabs giao diện ----------
document.querySelectorAll('nav button').forEach(b => b.onclick = () => {
  document.querySelectorAll('nav button, section').forEach(x => x.classList.remove('on'));
  b.classList.add('on'); $('#' + b.dataset.tab).classList.add('on');
});

// ---------- cài đặt ----------
let cfg = { ...DEFAULTS };
async function loadCfg() {
  cfg = { ...DEFAULTS, ...(await store.get('cfg') || {}) };
  $('#nickName').value = cfg.nickName; $('#wa').value = cfg.wa; $('#oldNames').value = cfg.oldNames.join(', ');
  $('#fanpageUrl').value = cfg.fanpageUrl; $('#custom').value = cfg.custom;
}
$('#saveCfg').onclick = async () => {
  const wa = $('#wa').value.trim();
  if (wa !== cfg.wa && !confirm(`Đổi số WhatsApp từ ${cfg.wa} sang ${wa}? (Quy định: đổi số phải hỏi người phụ trách trước.)`)) return;
  cfg = { ...cfg, nickName: $('#nickName').value.trim(), wa, oldNames: $('#oldNames').value.split(',').map(s => s.trim()).filter(Boolean),
    fanpageUrl: $('#fanpageUrl').value.trim() || DEFAULTS.fanpageUrl, custom: $('#custom').value };
  await store.set('cfg', cfg); log('Đã lưu cài đặt.'); renderPacks(); renderIntro();
};

// ---------- gửi lệnh tới tab Facebook ----------
const activeTab = async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
async function send(action, payload = {}) {
  const tab = await activeTab();
  if (!tab || !/^https:\/\/(www|web)\.facebook\.com\//.test(tab.url || '')) throw Error('Tab đang xem không phải Facebook.');
  try { return unwrap(await chrome.tabs.sendMessage(tab.id, { action, payload })); }
  catch (e) {
    if (!/Receiving end|Could not establish/i.test(e.message)) throw e;
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['fb-content.js'] });
    return unwrap(await chrome.tabs.sendMessage(tab.id, { action, payload }));
  }
}
const unwrap = r => { if (!r) throw Error('Tab không trả lời (trang đang tải?).'); if (!r.ok) throw Error(r.error); return r.data; };
const busy = async (btn, fn) => { btn.disabled = true; try { await fn(); } catch (e) { log(e.message, true); } finally { btn.disabled = false; } };

chrome.runtime.onMessage.addListener(m => {
  if (m?.type === 'progress') log(m.text);
  if (m?.type === 'saved') onSaved();
});
async function whereAmI() {
  try { const w = await send('whoami'); $('#where').textContent = (w.heading || w.title).slice(0, 60) + ' · ' + ({ activity: 'Nhật ký hoạt động', post: 'trang bài viết', profile: 'trang cá nhân', other: 'Facebook' }[w.page]) + (w.blocked ? ' · ⚠ FB đang cảnh báo' : ''); }
  catch (e) { $('#where').textContent = e.message; }
}
chrome.tabs.onActivated.addListener(whereAmI);
chrome.tabs.onUpdated.addListener((_id, info) => { if (info.status === 'complete') whereAmI(); });

// ---------- 1. bài nguồn ----------
$('#scanSrc').onclick = e => busy(e.target, async () => {
  const list = await send('scanSource', { rounds: 20 });
  const packs = await store.get('packs') || [];
  const tab = await activeTab(); const src = (tab.url || '').split('?')[0];
  $('#srcList').innerHTML = list.map(p => {
    const had = packs.find(x => x.source === src && x.idx === p.idx);
    return `<li><div>#${p.idx} · ${p.tiles} ô ảnh${p.more ? ' +' + p.more : ''} ${had ? '<span class="tag std">đã lấy</span>' : ''}</div>
      <div class="muted">${esc(p.text)}</div><button data-idx="${p.idx}">Lấy bài này</button></li>`; }).join('') || '<li>Không thấy bài có chữ. Mở trang cá nhân nick nguồn rồi thử lại.</li>';
  $('#srcList').querySelectorAll('button').forEach(b => b.onclick = () => busy(b, () => grab(+b.dataset.idx)));
  log(`Thấy ${list.length} bài.`);
});
async function grab(idx) {
  const post = await send('grabPost', { idx });
  if (!post.images.length && !confirm('Bài này không có ảnh. Vẫn lưu gói?')) return;
  const images = [];
  for (const [i, im] of post.images.entries()) {
    const r = await chrome.runtime.sendMessage({ type: 'fetch-image', url: im.url });
    if (!r?.ok) throw Error(`Ảnh ${i + 1}: ${r?.error || 'lỗi tải'}`);
    images.push(r.dataUrl); log(`Tải ảnh ${i + 1}/${post.images.length} (${im.w}×${im.h})`);
  }
  const c = cleanCaption(post.text, cfg);
  const pack = { id: Date.now().toString(36), source: post.source, idx, raw: post.text, text: c.text, changes: c.changes, warnings: c.warnings,
    images, sizes: post.images.map(x => `${x.w}×${x.h}`), createdAt: new Date().toISOString(), usedOn: [] };
  const packs = await store.get('packs') || []; packs.unshift(pack); await store.set('packs', packs);
  log(`Đã lưu gói #${idx}: ${images.length} ảnh${c.warnings.length ? ' · ⚠ ' + c.warnings.length + ' cảnh báo' : ''}.`);
  renderPacks();
}

// ---------- 2. gói bài ----------
async function renderPacks() {
  const packs = await store.get('packs') || [];
  $('#packs').innerHTML = packs.map(p => `<div class="pack ${p.usedOn.length ? 'used' : ''}" data-id="${p.id}">
    <div><b>${esc(p.source.replace(/^https:\/\/(www|web)\.facebook\.com\//, ''))} #${p.idx}</b> · ${p.images.length} ảnh
      ${p.usedOn.length ? `<span class="tag prof">đã dùng ${p.usedOn.length} lần</span>` : ''}</div>
    <div class="thumbs">${p.images.map(u => `<img src="${u}">`).join('')}</div>
    <textarea rows="7">${esc(p.text)}</textarea>
    ${p.changes.length ? `<div class="ok">✓ ${esc(p.changes.join(' · '))}</div>` : ''}
    ${p.warnings.map(w => `<div class="warn">⚠ ${esc(w)}</div>`).join('')}
    ${p.usedOn.map(u => `<div class="muted">Đã thay: ${esc(u.nick)} · ${esc(u.at.slice(0, 16).replace('T', ' '))}</div>`).join('')}
    <button data-act="reclean">Làm sạch lại từ bản gốc</button> <button data-act="del">Xoá gói</button></div>`).join('') || '<p class="muted">Chưa có gói. Vào “1. Bài nguồn” để lấy.</p>';
  $('#packs').querySelectorAll('.pack').forEach(el => {
    const id = el.dataset.id;
    el.querySelector('textarea').onchange = async e => { await updatePack(id, p => { p.text = e.target.value; p.warnings = cleanCaption(p.text, cfg).warnings; }); log('Đã lưu chữ của gói.'); renderPacks(); };
    el.querySelector('[data-act=reclean]').onclick = async () => { await updatePack(id, p => { const c = cleanCaption(p.raw, cfg); Object.assign(p, { text: c.text, changes: c.changes, warnings: c.warnings }); }); renderPacks(); };
    el.querySelector('[data-act=del]').onclick = async () => { if (!confirm('Xoá gói này?')) return; await store.set('packs', (await store.get('packs')).filter(p => p.id !== id)); renderPacks(); };
  });
  $('#packPick').innerHTML = packs.map(p => `<option value="${p.id}">${p.usedOn.length ? '(đã dùng) ' : ''}#${p.idx} · ${esc(p.text.split('\n')[0].slice(0, 50))} · ${p.images.length} ảnh</option>`).join('');
}
async function updatePack(id, fn) { const packs = await store.get('packs') || []; const p = packs.find(x => x.id === id); if (p) fn(p); await store.set('packs', packs); }

// ---------- 3. thay bài ----------
$('#openLog').onclick = async () => {
  const tab = await activeTab(); let base = 'https://www.facebook.com/me';
  try { const u = new URL(tab.url); const id = u.searchParams.get('id'); const seg = u.pathname.split('/').filter(Boolean)[0];
    if (u.pathname === '/profile.php' && id) base = 'https://www.facebook.com/' + id; else if (seg && !/^(home|groups|watch|marketplace|photo|permalink\.php|story\.php)/.test(seg)) base = 'https://www.facebook.com/' + seg; } catch (e) {}
  await chrome.tabs.update(tab.id, { url: base + '/allactivity?activity_history=false&category_key=MANAGEPOSTSPHOTOSANDVIDEOS&manage_mode=false&should_load_landing_page=false' });
  log('Đang mở Nhật ký bài viết… đợi tải xong rồi bấm “Quét danh sách bài”.');
};
$('#scanLog').onclick = e => busy(e.target, async () => {
  const rows = await send('scanActivity', { rounds: 20 });
  let need = 0;
  $('#logTable').innerHTML = rows.map(r => {
    const priv = /chỉ mình tôi|only me/i.test(r.audience);
    const std = r.kind === 'profile' ? 'prof' : looksStandard(r.head + ' ' + r.text, cfg) ? 'std' : priv ? 'priv' : 'need';
    if (std === 'need') need++;
    return `<tr><td>${esc(r.date)}<br><span class="muted">${esc(r.time)}</span></td>
      <td><span class="tag ${std === 'priv' ? 'prof' : std}">${{ prof: 'cập nhật hồ sơ', std: 'chuẩn', need: 'cần thay', priv: 'riêng tư' }[std]}</span> <span class="muted">${esc(r.audience)}</span><br>${esc(r.head)}<div class="muted">${esc(r.text.slice(0, 120))}</div></td>
      <td><button data-i="${r.i}" data-href="${esc(r.href)}">Mở</button></td></tr>`; }).join('');
  $('#logTable').querySelectorAll('button').forEach(b => b.onclick = async () => {
    try { if (b.dataset.href) await chrome.tabs.update((await activeTab()).id, { url: b.dataset.href }); else await send('openActivity', { i: +b.dataset.i }); } catch (err) { log(err.message, true); } });
  log(`${rows.length} mục · ${need} bài công khai cần thay (mục “Chỉ mình tôi” không hiện ra ngoài).`);
});
let pending = null;
$('#doReplace').onclick = e => busy(e.target, async () => {
  const packs = await store.get('packs') || []; const p = packs.find(x => x.id === $('#packPick').value);
  if (!p) throw Error('Chưa chọn gói.');
  if (p.usedOn.length && !confirm(`Gói này đã dùng cho: ${p.usedOn.map(u => u.nick).join(', ')}. Mỗi caption chỉ nên dùng 1 lần. Vẫn dùng?`)) return;
  const warn = cleanCaption(p.text, cfg).warnings; if (warn.length && !confirm('Còn cảnh báo:\n- ' + warn.join('\n- ') + '\nVẫn thay?')) return;
  const tab = await activeTab();
  pending = { id: p.id, url: tab.url, nick: cfg.nickName || '(chưa đặt tên nick)' };
  const r = await send('editPost', { text: p.text, images: p.images, autoSave: $('#autoSave').checked });
  if (r.saved) onSaved();
});
async function onSaved() {
  if (!pending) return; const x = pending; pending = null;
  await updatePack(x.id, p => p.usedOn.push({ nick: x.nick, url: x.url, at: new Date().toISOString() }));
  log('✅ Đã lưu bài, đánh dấu gói đã dùng.'); renderPacks();
}

// ---------- 4. tiểu sử ----------
const bioTpl = () => `Sales at K-Embroidery | Classic smocking for shops 🧵\nWhatsApp: ${cfg.wa} | k-embroidery.com`;
const count = () => { const n = [...$('#bioText').value].length; $('#bioCount').textContent = n; $('#bioCount').className = n > 101 ? 'warn' : ''; };
$('#bioText').oninput = count;
$('#bioTpl').onclick = e => { e.preventDefault(); $('#bioText').value = bioTpl(); count(); };
$('#doBio').onclick = e => busy(e.target, async () => { const r = await send('editBio', { text: $('#bioText').value.trim(), autoSave: $('#bioAuto').checked }); if (r.saved) log('✅ Đã lưu tiểu sử.'); });
function renderIntro() {
  const n = cfg.nickName || '<tên smock>';
  const items = [['Biệt danh (tick “Hiển thị ở đầu trang cá nhân”)', `${n} Smocking`], ['Công việc', 'Sales tại K-Embroidery Factory'], ['Trang web', 'k-embroidery.com'], ['WhatsApp', cfg.wa]];
  $('#introTpl').innerHTML = items.map(([k, v]) => `<div><span class="muted">${esc(k)}:</span><code>${esc(v)}</code><button data-v="${esc(v)}">Chép</button></div>`).join('');
  $('#introTpl').querySelectorAll('button').forEach(b => b.onclick = () => navigator.clipboard.writeText(b.dataset.v).then(() => log('Đã chép: ' + b.dataset.v)));
}

await loadCfg(); renderPacks(); renderIntro(); whereAmI();
