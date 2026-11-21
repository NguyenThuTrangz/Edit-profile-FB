// Chạy trong tab Facebook. Chỉ thao tác giao diện như người thật: không dùng API riêng, token hay cookie.
// Mọi thao tác ghi (sửa bài, sửa tiểu sử) mặc định DỪNG trước nút Lưu để người dùng kiểm tra.
(() => {
  if (window.__epfbLoaded) return; window.__epfbLoaded = true;

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const clean = s => String(s || '').normalize('NFKC').replace(/[​-‏‪-‮⁦-⁩͏]/g, '').replace(/\s+/g, ' ').trim();
  const visible = e => !!(e && e.isConnected && !e.closest('[hidden],[inert],[aria-hidden="true"]') && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
  const label = e => clean(e.getAttribute('aria-label') || e.getAttribute('title') || e.innerText || e.value || '');
  const all = (sel, root = document) => [...root.querySelectorAll(sel)].filter(visible);
  const buttons = (root = document) => all('button,[role="button"],[role="menuitem"],[role="link"],a', root);
  const findBtn = (re, root = document) => buttons(root).filter(e => re.test(label(e)));
  const progress = text => { try { chrome.runtime.sendMessage({ type: 'progress', text, at: Date.now() }); } catch (e) {} };
  const wait = async (fn, timeout = 15000, what = 'Facebook phản hồi chậm hoặc giao diện không khớp') => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) { const r = fn(); if (r) return r; await sleep(250); }
    throw Error(what);
  };
  // Bấm: click() như FB Desk; nếu không thấy kết quả thì thử chuỗi sự kiện chuột đầy đủ.
  const fire = el => { const r = el.getBoundingClientRect(); const o = { bubbles: true, cancelable: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
    for (const t of ['pointerover', 'pointerdown', 'mousedown', 'pointerup', 'mouseup']) el.dispatchEvent(new (t.startsWith('pointer') ? PointerEvent : MouseEvent)(t, o));
    el.dispatchEvent(new MouseEvent('click', o)); };
  const press = async (el, ok, timeout = 5000) => {
    el.scrollIntoView({ block: 'center', inline: 'nearest' }); await sleep(250);
    el.click();
    if (!ok) return true;
    try { return await wait(ok, timeout / 2); } catch (e) {}
    fire(el);
    return wait(ok, timeout, 'Bấm "' + label(el).slice(0, 40) + '" nhưng Facebook không phản hồi');
  };
  const blocked = () => /tạm thời bị chặn|temporarily blocked|xác nhận danh tính|confirm (your )?identity|we suspended|tài khoản của bạn đã bị khóa|checkpoint/i.test(document.body.innerText.slice(0, 20000));
  const assertNotBlocked = () => { if (blocked()) throw Error('Facebook đang cảnh báo / yêu cầu xác minh. Dừng lại, xử lý tay trước.'); };
  const dialogs = () => all('[role="dialog"]');

  // ---------- Caption của một bài: ghép từng khối dòng, emoji ảnh → alt ----------
  const msgEl = p => p.querySelector('[data-ad-rendering-role="story_message"],[data-ad-preview="message"],[data-ad-comet-preview="message"]');
  const captionOf = node => {
    const c = node.cloneNode(true);
    c.querySelectorAll('img[alt]').forEach(i => i.replaceWith(document.createTextNode(i.alt)));
    c.querySelectorAll('[role="button"]').forEach(b => { if (/^(ẩn bớt|see less|xem thêm|see more)$/i.test(clean(b.textContent))) b.remove(); });
    const leaves = [...c.querySelectorAll('div[dir="auto"]')].filter(d => !d.querySelector('div[dir="auto"]')).map(d => d.textContent.replace(/ /g, ' ').trim());
    const text = leaves.length ? leaves.join('\n') : c.innerText;
    return text.replace(/\n{3,}/g, '\n\n').trim();
  };
  const expand = async p => { const m = findBtn(/^(xem thêm|see more)$/i, p)[0]; if (m) { m.click(); await sleep(900); } };

  // ---------- Quét bài trên trang nick nguồn ----------
  async function scanSource({ rounds = 25 } = {}) {
    const seen = new Map();
    for (let i = 0; i < rounds; i++) {
      for (const p of document.querySelectorAll('div[aria-posinset]')) {
        const n = +p.getAttribute('aria-posinset'); const m = msgEl(p); if (!m || seen.has(n)) continue;
        const photos = [...p.querySelectorAll('a[href*="/photo"],a[href*="photo.php"]')].filter(a => a.querySelector('img'));
        const more = (p.innerText.match(/^\+(\d+)$/m) || [])[1];
        seen.set(n, { idx: n, text: clean(m.innerText).slice(0, 160), tiles: photos.length, more: more ? +more : 0 });
      }
      progress(`Đang quét… ${seen.size} bài`);
      scrollBy(0, 1400); await sleep(1300);
    }
    return [...seen.values()].sort((a, b) => a.idx - b.idx);
  }
  const postByIdx = async idx => {
    let p = document.querySelector(`div[aria-posinset="${idx}"]`);
    for (let i = 0; i < 40 && !p; i++) { scrollBy(0, i < 20 ? -1400 : 1400); await sleep(900); p = document.querySelector(`div[aria-posinset="${idx}"]`); }
    if (!p) throw Error('Không thấy lại bài số ' + idx + ' trên trang. Quét lại rồi chọn.');
    p.scrollIntoView({ block: 'center' }); await sleep(1200); return p;
  };
  // ---------- Lấy caption đầy đủ + toàn bộ ảnh gốc của 1 bài (đi qua trình xem ảnh) ----------
  const viewerImg = () => all('img[data-visualcompletion="media-vc-image"]')[0];
  const fbidOf = () => new URL(location.href).searchParams.get('fbid') || (location.pathname.match(/\/photos\/[^/]+\/(\d+)/) || [])[1] || location.href;
  async function grabPost({ idx }) {
    assertNotBlocked();
    const p = await postByIdx(idx); await expand(p);
    const m = msgEl(p); if (!m) throw Error('Bài này không có chữ.');
    const text = captionOf(m);
    const first = [...p.querySelectorAll('a[href*="/photo"],a[href*="photo.php"]')].find(a => a.querySelector('img') && visible(a));
    const images = [];
    if (first) {
      const startUrl = location.href;
      progress('Mở trình xem ảnh…');
      await press(first, () => viewerImg() && location.href !== startUrl, 10000);
      const ids = [];
      for (let i = 0; i < 40; i++) {
        // chờ ảnh gốc tải xong và ổn định (tránh lấy nhầm ảnh xem trước độ phân giải thấp)
        let last = '', stable = 0;
        await wait(() => { const im = viewerImg(); if (!im || !im.complete || !im.naturalWidth) { stable = 0; return false; }
          if (im.src === last) stable++; else { last = im.src; stable = 0; } return stable >= 4; }, 15000, 'Ảnh trong trình xem không tải được');
        const id = fbidOf(); if (ids.includes(id)) break;
        ids.push(id); images.push({ url: viewerImg().src, w: viewerImg().naturalWidth, h: viewerImg().naturalHeight });
        progress(`Đã lấy ${images.length} ảnh…`);
        const next = findBtn(/^(ảnh tiếp theo|next photo|next)$/i)[0]; if (!next) break;
        const before = id; next.click();
        try { await wait(() => fbidOf() !== before, 6000); } catch (e) { break; }
      }
      // đóng trình xem ảnh: nút Đóng, không có thì quay lại trang trước
      const close = findBtn(/^(đóng|close)$/i).find(b => !b.closest('[role="dialog"][aria-label*="Messenger"]'));
      if (close) { close.click(); await sleep(1500); }
      for (let k = 0; k < ids.length + 1 && viewerImg(); k++) { history.back(); await sleep(1200); }
    }
    return { text, images, source: location.href.split('?')[0], idx };
  }

  // ---------- Nhật ký hoạt động: danh sách bài của nick đang mở ----------
  const DATE_RE = /^(\d{1,2} tháng \d{1,2}(,? \d{4})?|(january|february|march|april|may|june|july|august|september|october|november|december) \d{1,2}(, \d{4})?|hôm nay|hôm qua|today|yesterday)$/i;
  async function scanActivity({ rounds = 20 } = {}) {
    const main = document.querySelector('[role="main"]') || document.body;
    let lastH = 0;
    for (let i = 0; i < rounds; i++) { scrollBy(0, 2500); await sleep(1300); const h = document.body.scrollHeight; if (h === lastH && i > 3) break; lastH = h; progress(`Đang tải nhật ký… (${i + 1})`); }
    const views = [...main.querySelectorAll('a,[role="link"]')].filter(a => /^(xem|view)$/i.test(clean(a.innerText)));
    const isView = e => /^(xem|view)$/i.test(clean(e.innerText));
    // ngày: tiêu đề nằm trước mục theo thứ tự DOM
    const heads = [...main.querySelectorAll('span,h2,h3,div')].filter(e => e.childElementCount === 0 && DATE_RE.test(clean(e.textContent)));
    window.__epfbViews = views;
    return views.map((v, i) => {
      let row = v; while (row.parentElement && row.parentElement !== main && [...row.parentElement.querySelectorAll('a,[role="link"]')].filter(isView).length === 1) row = row.parentElement;
      const lines = row.innerText.split('\n').map(clean).filter(Boolean).filter(s => !/^(xem|view|·)$/i.test(s) && !DATE_RE.test(s));
      const audience = lines.find(s => /^(công khai|bạn bè|chỉ mình tôi|public|friends|only me|tùy chỉnh|custom)$/i.test(s)) || '';
      const time = lines.find(s => /^\d{1,2}:\d{2}( ?[ap]m)?$/i.test(s)) || '';
      const body = lines.filter(s => s !== audience && s !== time);
      let date = ''; for (const h of heads) if (h.compareDocumentPosition(v) & Node.DOCUMENT_POSITION_FOLLOWING) date = clean(h.textContent);
      const head = body[0] || '';
      const kind = /ảnh đại diện|ảnh bìa|profile picture|cover photo|sự kiện trong đời|life event|tiểu sử|bio/i.test(head) ? 'profile' : 'post';
      return { i, date, time, audience, head: head.slice(0, 90), text: body.slice(1).join(' ').slice(0, 300), kind, href: v.href || '' };
    });
  }
  async function openActivity({ i }) { const v = (window.__epfbViews || [])[i]; if (!v || !v.isConnected) throw Error('Danh sách đã cũ, quét lại.'); v.click(); return true; }

  // ---------- Thay bài đang mở ----------
  const dataUrlToFile = (u, name) => { const [h, b] = u.split(','); const type = (h.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
    const bin = atob(b); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new File([a], name, { type }); };
  const editorText = el => el.innerText.replace(/ /g, ' ').replace(/\n{2,}/g, '\n').trim();
  const sameText = (a, b) => clean(a).replace(/\s/g, '') === clean(b).replace(/\s/g, '');
  // Ô chữ của FB (Lexical) bỏ qua execCommand('delete'); sự kiện beforeinput deleteContentBackward thì xoá được
  // (đã thử trên FB thật 22/11/2026). Phải chờ ~300ms sau khi chọn để FB nhận vùng chọn.
  async function clearEditor(el) {
    for (let k = 0; k < 3 && editorText(el); k++) {
      el.focus(); const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      await sleep(300);
      if (k < 2) el.dispatchEvent(new InputEvent('beforeinput', { inputType: 'deleteContentBackward', bubbles: true, cancelable: true }));
      else document.execCommand('delete');
      await sleep(500);
    }
    if (editorText(el)) throw Error('Không xoá được chữ cũ. Bấm vào ô chữ, Ctrl+A, Delete rồi chạy lại.');
  }
  async function fillEditor(el, text) {
    el.focus();
    const dt = new DataTransfer(); dt.setData('text/plain', text);
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    await sleep(600);
    if (!sameText(editorText(el), text)) {
      await clearEditor(el); el.focus();
      for (const [i, line] of text.split('\n').entries()) { if (i) document.execCommand('insertParagraph'); if (line) document.execCommand('insertText', false, line); }
      await sleep(600);
    }
    if (!sameText(editorText(el), text)) throw Error(`Chữ trong ô chưa khớp (${editorText(el).length}/${text.length} ký tự). Kiểm tra tay.`);
  }
  const editDialog = () => dialogs().find(d => /chỉnh sửa bài viết|edit post/i.test(d.innerText.slice(0, 200)) && d.querySelector('[contenteditable="true"]'));
  async function editPost({ text, images = [], autoSave = false }) {
    assertNotBlocked();
    let dlg = editDialog();
    if (!dlg) {
      progress('Mở menu bài viết…');
      const menus = findBtn(/^(hành động đối với bài viết này|actions for this post)/i);
      const inDlg = menus.filter(b => b.closest('[role="dialog"]'));
      const menu = (inDlg.length ? inDlg : menus)[0];
      if (!menu) throw Error('Không thấy nút "…" của bài. Mở đúng trang bài viết (từ Nhật ký hoạt động bấm Xem).');
      const item = await press(menu, () => findBtn(/^(chỉnh sửa bài viết|edit post)$/i).find(e => e.getAttribute('role') === 'menuitem' || e.closest('[role="menu"]')) , 8000);
      progress('Mở hộp Chỉnh sửa bài viết…');
      dlg = await press(item, editDialog, 10000);
    }
    await sleep(800);
    // 1) gỡ ảnh/video cũ
    for (let k = 0; k < 5; k++) {
      const rm = findBtn(/gỡ file đính kèm|remove (post )?attachment|xoá ảnh|xóa ảnh|remove photo|remove all/i, dlg)[0];
      if (!rm) break; progress('Gỡ ảnh cũ…'); rm.click(); await sleep(1200);
    }
    // 2) chữ
    const ed = all('[contenteditable="true"][role="textbox"],[contenteditable="true"][data-lexical-editor="true"]', dlg)[0] || all('[contenteditable="true"]', dlg)[0];
    if (!ed) throw Error('Không thấy ô chữ trong hộp sửa bài.');
    progress('Thay chữ…'); await clearEditor(ed); await fillEditor(ed, text);
    // 3) ảnh mới
    if (images.length) {
      progress(`Tải ${images.length} ảnh lên…`);
      const files = images.map((u, i) => dataUrlToFile(u, String(i + 1).padStart(2, '0') + '.jpg'));
      let inp = dlg.querySelector('input[type="file"]');
      if (!inp) { const op = findBtn(/^(ảnh\/video|photo\/video)$/i, dlg)[0]; if (op) { op.click(); inp = await wait(() => dlg.querySelector('input[type="file"]'), 6000).catch(() => null); } }
      const before = new Set([...dlg.querySelectorAll('img')].map(i => i.src));
      const dt = () => { const d = new DataTransfer(); files.forEach(f => d.items.add(f)); return d; };
      const took = () => { const fresh = new Set([...dlg.querySelectorAll('img')].filter(i => !before.has(i.src) && i.getBoundingClientRect().width >= 40).map(i => i.src)); return fresh.size >= Math.min(files.length, 4) || /\+\d+/.test(dlg.innerText); };
      if (inp) { inp.files = dt().files; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); }
      let ok = await wait(took, 20000).then(() => true, () => false);
      if (!ok) { for (const t of ['dragenter', 'dragover', 'drop']) ed.dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt() })); ok = await wait(took, 20000).then(() => true, () => false); }
      if (!ok) throw Error('Facebook chưa nhận ảnh. Bấm "Ảnh/video" chọn tay các ảnh (đã lưu trong gói) rồi Lưu.');
      await sleep(3000);
    }
    // 4) Lưu
    const save = await wait(() => findBtn(/^(lưu|save)$/i, dlg).find(b => b.getAttribute('aria-disabled') !== 'true'), 30000, 'Nút Lưu chưa bấm được (ảnh còn đang tải?)');
    if (!autoSave) {
      save.style.outline = '4px solid #e8590c'; save.scrollIntoView({ block: 'center' });
      progress('Đã điền xong. Kiểm tra chữ + ảnh rồi tự bấm LƯU (viền cam).');
      watchSaved(dlg);
      return { ok: true, saved: false };
    }
    progress('Bấm Lưu…'); save.click();
    await wait(() => !dlg.isConnected || !visible(dlg), 60000, 'Đã bấm Lưu nhưng hộp sửa chưa đóng');
    progress('Đã lưu bài.');
    return { ok: true, saved: true };
  }
  const watchSaved = dlg => { (async () => { const t0 = Date.now(); while (Date.now() - t0 < 15 * 60e3) { await sleep(1000); if (!dlg.isConnected || !visible(dlg)) { try { chrome.runtime.sendMessage({ type: 'saved' }); } catch (e) {} return; } } })(); };

  // ---------- Tiểu sử (bio) ----------
  async function editBio({ text, autoSave = false }) {
    assertNotBlocked();
    if ([...text].length > 101) throw Error('Tiểu sử tối đa 101 ký tự.');
    const btn = findBtn(/^(chỉnh sửa tiểu sử|thêm tiểu sử|edit bio|add bio)$/i)[0];
    if (!btn) throw Error('Không thấy nút "Chỉnh sửa tiểu sử". Mở trang cá nhân của chính nick này.');
    const had = new Set(document.querySelectorAll('textarea'));   // chỉ lấy ô MỚI mở ra sau khi bấm (tránh ô chat/ô khác)
    const ta = await press(btn, () => all('textarea').find(t => !had.has(t)), 8000);
    await sleep(600); ta.focus(); ta.select();
    if (!document.execCommand('insertText', false, text) || ta.value !== text) {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, text);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await sleep(800);
    if (ta.value !== text) throw Error('Facebook chưa nhận chữ tiểu sử. Dán tay vào ô.');
    // nút thật: aria-label "Lưu phần tiểu sử trên trang cá nhân" / "Hủy chỉnh sửa tiểu sử" (đã kiểm 22/11/2026)
    const SAVE = /^(lưu|save)\b/i;
    let box = ta; for (let i = 0; i < 10 && box.parentElement; i++) { box = box.parentElement; if (findBtn(SAVE, box).length) break; }
    const save = findBtn(SAVE, box)[0]; if (!save) throw Error('Không thấy nút Lưu của tiểu sử.');
    if (!autoSave) { save.style.outline = '4px solid #e8590c'; progress('Đã điền tiểu sử. Kiểm tra rồi bấm LƯU.'); return { ok: true, saved: false }; }
    save.click(); await wait(() => !ta.isConnected, 10000); progress('Đã lưu tiểu sử.'); return { ok: true, saved: true };
  }

  function whoami() {
    const h1 = all('h1')[0];
    return { url: location.href, title: document.title, heading: h1 ? clean(h1.innerText) : '', blocked: blocked(),
      page: /allactivity/.test(location.href) ? 'activity' : /permalink|\/posts\/|story_fbid|\/photo/.test(location.href) || editDialog() ? 'post' : h1 ? 'profile' : 'other' };
  }

  const ACTIONS = { whoami, scanSource, grabPost, scanActivity, openActivity, editPost, editBio };
  chrome.runtime.onMessage.addListener((msg, _s, reply) => {
    const fn = ACTIONS[msg?.action]; if (!fn) return false;
    Promise.resolve().then(() => fn(msg.payload || {})).then(data => reply({ ok: true, data }), e => reply({ ok: false, error: e.message }));
    return true;
  });
})();
