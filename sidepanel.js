import { DEFAULTS, cleanCaption, looksStandard } from './rules.js';
import { KHO_DEFAULT, readTab, postsOf, listFolder, driveImage } from './sheet.js';
import { parseDay, tally, sum, byGroup, groupKind, isoDay } from './count.js';
import { captionKey, crosspostStats, facebookUrl, wallPostId } from './crosspost.js';

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
const EXTRA = { nickLabel: '', company: 'K-Embroidery Factory', position: 'Sales', website: 'https://www.k-embroidery.com/', khoSheet: KHO_DEFAULT.sheet, khoTab: KHO_DEFAULT.tab };
let cfg = { ...DEFAULTS, ...EXTRA };
async function loadCfg() {
  cfg = { ...DEFAULTS, ...EXTRA, ...(await store.get('cfg') || {}) };
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
async function send(action, payload = {}, tabId) {
  const tab = tabId == null ? await activeTab() : await chrome.tabs.get(tabId);
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
  await savePack({ source: post.source, idx, raw: post.text, images, sizes: post.images.map(x => `${x.w}×${x.h}`) });
}
async function savePack({ source, idx, raw, images, sizes }) {
  const c = cleanCaption(raw, cfg);
  const pack = { id: Date.now().toString(36), source, idx, raw, text: c.text, changes: c.changes, warnings: c.warnings,
    images, sizes, createdAt: new Date().toISOString(), usedOn: [] };
  const packs = await store.get('packs') || []; packs.unshift(pack); await store.set('packs', packs);
  log(`Đã lưu gói #${idx}: ${images.length} ảnh${c.warnings.length ? ' · ⚠ ' + c.warnings.length + ' cảnh báo' : ''}.`);
  renderPacks();
}

// ---------- 1b. kho content (Google Sheet + folder ảnh Drive) ----------
$('#khoLoad').onclick = e => busy(e.target, async () => {
  const sheet = $('#khoSheet').value.trim() || KHO_DEFAULT.sheet, tab = $('#khoTab').value.trim() || KHO_DEFAULT.tab;
  cfg = { ...cfg, khoSheet: sheet, khoTab: tab }; await store.set('cfg', cfg);
  log('Đang tải sheet…');
  const { tabs, rows } = await readTab(sheet, tab);
  $('#khoTabs').innerHTML = tabs.map(t => `<option value="${esc(t)}">`).join('');
  const posts = postsOf(rows), packs = await store.get('packs') || [], src = 'kho:' + tab;
  $('#khoList').innerHTML = posts.map(p => {
    const had = packs.find(x => x.source === src && x.idx === p.stt);
    return `<li><div>STT ${p.stt} ${p.media ? '· 📁 ' + esc(p.mediaLabel.slice(0, 30)) : '<span class="warn">· không có link folder ảnh</span>'} ${had ? '<span class="tag std">đã lấy</span>' : ''}${had?.usedOn.length ? ' <span class="tag prof">đã dùng</span>' : ''}</div>
      <div class="muted">${esc(p.text.split('\n')[0].slice(0, 120))}</div><button data-stt="${p.stt}">Tạo gói</button></li>`; }).join('') || '<li>Tab này không có dòng bài (cột A = STT, có chữ).</li>';
  $('#khoList').querySelectorAll('button').forEach(b => b.onclick = () => busy(b, () => fromKho(tab, posts.find(p => p.stt === +b.dataset.stt))));
  log(`Tab ${tab}: ${posts.length} bài.`);
});
async function fromKho(tab, p) {
  const packs = await store.get('packs') || [];
  if (packs.some(x => x.source === 'kho:' + tab && x.idx === p.stt) && !confirm(`Đã có gói ${tab} STT ${p.stt}. Tạo thêm gói nữa?`)) return;
  const images = [], sizes = [];
  if (p.media) {
    const ids = await listFolder(p.media); log(`Folder có ${ids.length} file, đang tải…`);
    for (const [i, id] of ids.entries()) {
      const im = await driveImage(id);
      if (!im) { log(`File ${i + 1} không phải ảnh (video?) — bỏ qua, tự thêm tay nếu cần.`, true); continue; }
      images.push(im.dataUrl); sizes.push(im.size); log(`Tải ảnh ${images.length}/${ids.length} (${im.size})`);
    }
  }
  if (!images.length && !confirm('Bài này không lấy được ảnh nào. Vẫn lưu gói?')) return;
  await savePack({ source: 'kho:' + tab, idx: p.stt, raw: p.text, images, sizes });
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
  $('#inNick').value = cfg.nickLabel || (cfg.nickName ? cfg.nickName + ' Smocking' : '');
  $('#inCompany').value = cfg.company; $('#inPosition').value = cfg.position; $('#inWeb').value = cfg.website; $('#inWa').textContent = cfg.wa;
  $('#khoSheet').value = cfg.khoSheet; $('#khoTab').value = cfg.khoTab;
}
// Trang Giới thiệu của chính nick đang mở: profile.php?id=… → &sk=<mục>, tên riêng → /<tên>/<mục>
const SECTION = { nickname: 'about_details', work: 'about_work_and_education', wa: 'about_contact_and_basic_info', web: 'about_contact_and_basic_info' };
const STEP_NAME = { nickname: 'biệt danh', work: 'công việc', wa: 'WhatsApp', web: 'trang web' };
function aboutUrl(url, sk) {
  const u = new URL(url); const id = u.searchParams.get('id'); const seg = u.pathname.split('/').filter(Boolean)[0];
  if (u.pathname === '/profile.php' && id) return `https://${u.host}/profile.php?id=${id}&sk=${sk}`;
  if (!seg || /^(home|groups|watch|marketplace|photo|permalink\.php|story\.php|notifications|messages|friends|reel|stories)/.test(seg)) throw Error('Mở trang cá nhân của nick này trước (bấm vào tên / ảnh đại diện).');
  return `https://${u.host}/${seg}/${sk}`;
}
const onSection = (url, sk) => { const u = new URL(url); return u.searchParams.get('sk') === sk || u.pathname.endsWith('/' + sk); };
const loaded = tabId => new Promise(res => {
  const done = () => { chrome.tabs.onUpdated.removeListener(f); clearTimeout(t); res(); };
  const f = (id, info) => { if (id === tabId && info.status === 'complete') done(); };
  const t = setTimeout(done, 20000); chrome.tabs.onUpdated.addListener(f);
});
async function introStep(step, autoSave) {
  cfg = { ...cfg, nickLabel: $('#inNick').value.trim(), company: $('#inCompany').value.trim(), position: $('#inPosition').value.trim(), website: $('#inWeb').value.trim() };
  await store.set('cfg', cfg);
  const payload = { nickname: { step: 'nickname', value: cfg.nickLabel }, work: { step: 'work', company: cfg.company, position: cfg.position },
    wa: { step: 'link', platform: 'WhatsApp', value: cfg.wa }, web: { step: 'link', platform: 'Trang web', value: cfg.website } }[step];
  if (!payload.value && !payload.company) throw Error('Chưa điền giá trị cho mục ' + STEP_NAME[step] + '.');
  const tab = await activeTab(); const sk = SECTION[step];
  if (!onSection(tab.url, sk)) {
    await chrome.tabs.update(tab.id, { url: aboutUrl(tab.url, sk) }); await loaded(tab.id); await new Promise(r => setTimeout(r, 3500));
  }
  const r = await send('introStep', { ...payload, autoSave });
  log(r.skipped ? `Bỏ qua: ${r.skipped}.` : r.saved ? `✅ Đã lưu ${STEP_NAME[step]}.` : `Đã điền ${STEP_NAME[step]}, chờ bạn bấm Lưu.`);
  return r;
}
document.querySelectorAll('[data-step]').forEach(b => b.onclick = () => busy(b, () => introStep(b.dataset.step, $('#introAuto').checked)));
$('#introAll').onclick = e => busy(e.target, async () => {
  if (!$('#introAuto').checked) throw Error('Làm cả 4 mục cần tick “Tự bấm Lưu”. Không tick thì bấm từng mục rồi tự Lưu.');
  for (const st of ['nickname', 'work', 'wa', 'web']) await introStep(st, true);
  log('✅ Xong phần Giới thiệu.');
});

// ---------- 5. đếm bài (nick bất kỳ) ----------
const CAT = {
  wall: { key: 'MANAGEPOSTSPHOTOSANDVIDEOS', name: 'bài tường', title: /^(your posts, photos and videos|bài viết, ảnh và video của bạn)$/i },
  group: { key: 'GROUPPOSTS', name: 'bài group', title: /^(group posts and comments|bài viết và bình luận trong nhóm)$/i }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
let demStop = false, counting = false, dem = { name: '', since: '', wall: null, group: null, at: '' };
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return isoDay(d); };
async function go(tabId, url) { await chrome.tabs.update(tabId, { url }); await loaded(tabId); await sleep(2500); }
// Mở đúng mục Nhật ký của NICK ĐANG ĐĂNG NHẬP. /me/allactivity tự chuyển sang tên riêng; nick kiểu profile.php?id=
// thì Facebook bỏ qua bộ lọc mục (hiện cả lượt like) → mở lại bằng /<id>/allactivity. Luôn kiểm tên mục trước khi đếm.
async function openCat(kind) {
  const tab = await activeTab();
  if (!/^https:\/\/(www|web)\.facebook\.com\//.test(tab.url || '')) throw Error('Mở facebook.com ở tab đang xem trước (đã đăng nhập nick cần đếm).');
  const host = new URL(tab.url).host, q = `allactivity?activity_history=false&category_key=${CAT[kind].key}&manage_mode=false&should_load_landing_page=false`;
  await go(tab.id, `https://${host}/me/${q}`);
  const u = new URL((await chrome.tabs.get(tab.id)).url), id = u.searchParams.get('id');
  if (u.pathname === '/profile.php' && id) await go(tab.id, `https://${host}/${id}/${q}`);
  let w; for (let i = 0; i < 12; i++) { w = await send('whoami', {}, tab.id).catch(() => null); if (w?.section && CAT[kind].title.test(w.section)) return tab.id; await sleep(1000); }
  throw Error(`Facebook mở "${w?.section || '?'}", không phải mục ${CAT[kind].name} — dừng để khỏi đếm nhầm. Vào Nhật ký hoạt động chọn tay mục này rồi thử lại.`);
}
async function countKind(kind, since) {
  const tabId = await openCat(kind);
  const rows = []; let reset = true;
  while (!demStop) {
    const r = await send('logChunk', { reset, rounds: 6 }, tabId); reset = false;
    const now = new Date();
    rows.push(...r.rows.map(x => ({ day: parseDay(x.date, now), head: x.head, href: x.href, group: x.group || '' })));
    const days = rows.map(x => x.day).filter(Boolean).sort(), oldest = days[0];
    log(`Đếm ${CAT[kind].name}: đã đọc ${rows.length} mục, tới ngày ${oldest || '?'}…`);
    if (r.end || (oldest && oldest < since)) break;
  }
  if (kind === 'group' && !demStop) await readGroupDetails(rows, since);
  return rows.map(({ href, ...row }) => kind === 'wall' ? { ...row, postId: wallPostId(href) } : row);
}

function groupPostUrl(href) {
  const url = facebookUrl(href);
  if (!url) return '';
  const path = url.pathname.match(/^\/groups\/([^/]+)(?:\/(?:posts|permalink)\/([\w-]+))?\/?$/);
  const id = path?.[2] || url.searchParams.get('multi_permalinks');
  return path && id && /^[\w-]+$/.test(id) ? `${url.origin}/groups/${path[1]}/posts/${id}/` : '';
}

async function readGroupDetails(rows, since) {
  const candidates = rows.filter(row => row.day >= since && groupKind(row.head, row.group).type === 'post' && groupPostUrl(row.href));
  if (!candidates.length) return;
  const tab = await chrome.tabs.create({ active: false });
  const visited = new Map();
  try {
    for (const [i, row] of candidates.entries()) {
      if (demStop) break;
      const url = groupPostUrl(row.href);
      const [, , groupKey, , postKey] = new URL(url).pathname.split('/');
      Object.assign(row, { groupKey, postKey });
      log(`Đọc nội dung bài group ${i + 1}/${candidates.length}…`);
      try {
        if (!visited.has(url)) {
          await chrome.tabs.update(tab.id, { url });
          if ((await chrome.tabs.get(tab.id)).status !== 'complete') await loaded(tab.id);
          if (demStop) break;
          const current = await chrome.tabs.get(tab.id);
          if (!groupPostUrl(current.url).endsWith(`/posts/${postKey}/`)) continue;
          const post = await send('readGroupPost', { shared: /\bshared\b|đã chia sẻ/i.test(row.head) }, tab.id);
          const caption = captionKey(post.caption);
          const digest = caption && await crypto.subtle.digest('SHA-256', new TextEncoder().encode(caption));
          const captionHash = digest ? Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('') : '';
          const sourceIds = [...new Set(post.sourceLinks.map(wallPostId).filter(Boolean))];
          visited.set(url, { captionHash, sourceIds, read: true });
        }
        Object.assign(row, visited.get(url));
      } catch (e) {
        if (/Facebook đang cảnh báo/.test(e.message)) { demStop = true; log(e.message, true); break; }
        visited.set(url, {});
      }
    }
  } finally {
    await chrome.tabs.remove(tab.id).catch(() => {});
  }
}

async function runCount(kinds) {
  if (counting) return;
  counting = true;
  try {
    demStop = false;
    const name = $('#demName').value.trim() || cfg.nickName || 'nick';
    const since = $('#demSince').value || daysAgo(180);
    const next = dem.name === name && dem.since === since ? { ...dem } : { name, since, wall: null, group: null };
    for (const k of kinds) { if (demStop) break; next[k] = await countKind(k, since); }
    next.at = new Date().toISOString();
    const all = await store.get('counts') || {};
    await store.set('counts', { ...all, [name]: next });
    dem = next;
    renderCount(); log(demStop ? 'Đã dừng. Kết quả có thể chưa đầy đủ.' : '✅ Đếm xong.', demStop);
  } finally { counting = false; }
}
const COLS = [['wall', 'Bài tường'], ['groupPosts', 'Bài group'], ['groups', 'Số group khác nhau'], ['comments', 'Bình luận trong group'], ['profile', 'Cập nhật hồ sơ (không tính bài)'], ['crossposts', 'Bài trùng caption qua group'], ['wallShares', 'Chia sẻ từ tường vào group']];
function countTable() {
  const r = tally({ wall: dem.wall || [], group: dem.group || [] }, dem.since);
  const s30 = daysAgo(30), crossSince = dem.since > s30 ? dem.since : s30;
  const last30 = tally({ wall: dem.wall || [], group: dem.group || [] }, s30);
  const t30 = { month: `30 ngày (${s30} → nay)`, ...sum(last30.months), groups: byGroup({ wall: dem.wall || [], group: dem.group || [] }, s30).length };
  const rows = [
    { ...t30, ...crosspostStats(dem.group || [], dem.wall, crossSince) },
    ...r.months.map(m => ({ ...m, ...crosspostStats(dem.group || [], dem.wall, dem.since, m.month) }))
  ];
  const na = k => (k === 'wall' || k === 'profile') ? !dem.wall : !dem.group;
  const cell = (x, k) => {
    if (k === 'crossposts' && !x.checked) return '—';
    if (k === 'wallShares' && !(x.hasWallIds && x.read)) return '—';
    return na(k) ? '—' : x[k];
  };
  return { rows, cell, undated: r.undated, other: sum(r.months).other };
}
function renderCount() {
  if (!dem.wall && !dem.group) { $('#demOut').innerHTML = ''; return; }
  const { rows, cell, undated, other } = countTable();
  $('#demOut').innerHTML = `<p><b>${esc(dem.name)}</b> · từ ${esc(dem.since)} · đếm lúc ${esc(dem.at.slice(0, 16).replace('T', ' '))}</p>
    <div class="table-scroll"><table><tr><td><b>Tháng</b></td>${COLS.map(([, h]) => `<td><b>${h}</b></td>`).join('')}</tr>
    ${rows.map(x => `<tr><td>${esc(x.month)}</td>${COLS.map(([k]) => `<td>${cell(x, k)}</td>`).join('')}</tr>`).join('')}</table></div>
    ${dem.group ? `<p class="muted">Trong dòng 30 ngày, đọc được ${rows[0].read}/${rows[0].posts} bài group và ${rows[0].checked} caption. Dấu — nghĩa là thiếu dữ liệu để tính. Dùng “Đếm cả hai” để đối chiếu bài chia sẻ với bài gốc.</p>` : ''}
    ${undated ? `<div class="warn">⚠ ${undated} mục không đọc được ngày (không tính).</div>` : ''}
    ${other ? `<div class="warn">⚠ ${other} mục trong mục group không nhận ra là bài hay bình luận (không tính) — báo người làm extension.</div>` : ''}`;
  $('#demGroups').innerHTML = byGroup({ wall: dem.wall || [], group: dem.group || [] }, daysAgo(30)).map(([g, n]) => `<div>${n} · ${esc(g)}</div>`).join('') || 'Chưa có.';
}
const countTsv = sep => { const { rows, cell } = countTable(); const q = v => sep === ',' ? `"${String(v).replace(/"/g, '""')}"` : String(v);
  return [['Nick', 'Tháng', ...COLS.map(c => c[1])], ...rows.map(x => [dem.name, x.month, ...COLS.map(([k]) => cell(x, k))])].map(r => r.map(q).join(sep)).join('\n'); };
$('#demWall').onclick = e => busy(e.target, () => runCount(['wall']));
$('#demGroup').onclick = e => busy(e.target, () => runCount(['group']));
$('#demBoth').onclick = e => busy(e.target, () => runCount(['wall', 'group']));
$('#demStop').onclick = () => { demStop = true; log('Đang dừng…'); };
$('#demCopy').onclick = () => { if (!dem.at) return log('Chưa có kết quả.', true); navigator.clipboard.writeText(countTsv('\t')).then(() => log('Đã chép bảng — dán vào Google Sheet.')); };
$('#demCsv').onclick = () => { if (!dem.at) return log('Chưa có kết quả.', true);
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + countTsv(',')], { type: 'text/csv' }));
  a.download = `dem-bai-${dem.name}-${isoDay(new Date())}.csv`; a.click(); };
async function loadCount() {
  const d = new Date(); d.setMonth(d.getMonth() - 6, 1); $('#demSince').value = isoDay(d);
  const all = await store.get('counts') || {}; const last = Object.values(all).sort((a, b) => (b.at || '').localeCompare(a.at || ''))[0];
  if (last) { dem = last; $('#demName').value = last.name; $('#demSince').value = last.since; renderCount(); }
}

await loadCfg(); renderPacks(); renderIntro(); whereAmI(); loadCount();
