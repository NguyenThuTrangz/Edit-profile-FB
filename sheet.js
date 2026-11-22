// Đọc kho content (Google Sheet công khai) + tải ảnh từ folder Drive công khai.
// Chạy trong side panel: trang extension có host_permissions nên không bị CORS chặn.
// Đọc file .xlsx xuất từ Google Sheet (thay vì CSV) vì chỉ bản xlsx giữ link folder ảnh
// ở các ô dạng chip (tab GRACIE/CATHIE/LILY/EMILY) — đã kiểm 22/11/2026.

export const KHO_DEFAULT = { sheet: '1mY_7HeFFokARzxwS9xCeby46cYGC5QpA_ju4jl5f-UA', tab: 'GRACIE' };

export const sheetId = s => (String(s).match(/\/d\/([\w-]{20,})/) || [])[1] || String(s).trim();

// ---------- giải nén zip tối thiểu (stored + deflate) ----------
async function inflate(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer());
}
export async function unzip(buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(buf);
  let e = u8.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw Error('File tải về không phải xlsx (sheet chưa chia sẻ công khai?).');
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
  const files = {}, dec = new TextDecoder();
  for (let i = 0; i < n; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
    const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
    files[name] = { method, data: u8.subarray(start, start + csize) };
    p += 46 + nl + xl + cl;
  }
  return async name => { const f = files[name]; if (!f) return null; const b = f.method === 8 ? await inflate(f.data) : f.data; return dec.decode(b); };
}

// ---------- đọc 1 tab của xlsx: [{row, cells:{A:{v,link}}}] ----------
const xml = s => new DOMParser().parseFromString(s, 'application/xml');
const kids = (el, tag) => Array.from(el.getElementsByTagNameNS('*', tag));
const textOf = si => kids(si, 't').filter(t => t.parentNode.localName !== 'rPh').map(t => t.textContent).join('');
const relTarget = t => t.startsWith('/') ? t.slice(1) : 'xl/' + t.replace(/^\.\.\//, '');

export async function readTab(sheet, tab) {
  const r = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId(sheet)}/export?format=xlsx`, { credentials: 'omit' });
  if (!r.ok) throw Error('Không tải được sheet (HTTP ' + r.status + '). Sheet phải để "Bất kỳ ai có đường liên kết".');
  const get = await unzip(await r.arrayBuffer());
  const wb = xml(await get('xl/workbook.xml'));
  const sheets = kids(wb, 'sheet').map(s => ({ name: s.getAttribute('name'), rid: s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || s.getAttribute('r:id') }));
  const want = sheets.find(s => s.name.trim().toLowerCase() === String(tab).trim().toLowerCase());
  if (!want) throw Error(`Không có tab "${tab}". Các tab: ${sheets.map(s => s.name).join(', ')}`);
  const rels = xml(await get('xl/_rels/workbook.xml.rels'));
  const path = relTarget(kids(rels, 'Relationship').find(x => x.getAttribute('Id') === want.rid).getAttribute('Target'));
  const sst = await get('xl/sharedStrings.xml'); const strings = sst ? kids(xml(sst), 'si').map(textOf) : [];
  const ws = xml(await get(path));
  const srels = await get(path.replace(/([^/]+)$/, '_rels/$1.rels'));
  const relMap = {}; if (srels) for (const x of kids(xml(srels), 'Relationship')) relMap[x.getAttribute('Id')] = x.getAttribute('Target');
  const links = {};
  for (const h of kids(ws, 'hyperlink')) {
    const id = h.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || h.getAttribute('r:id');
    if (relMap[id]) links[h.getAttribute('ref')] = relMap[id];
  }
  const rows = [];
  for (const row of kids(ws, 'row')) {
    const cells = {};
    for (const c of kids(row, 'c')) {
      const ref = c.getAttribute('r'), col = ref.replace(/\d+/g, ''), t = c.getAttribute('t');
      const v = kids(c, 'v')[0]?.textContent ?? '';
      const val = t === 's' ? strings[+v] ?? '' : t === 'inlineStr' ? textOf(c) : v;
      if (val !== '' || links[ref]) cells[col] = { v: val, link: links[ref] || (/^https?:\/\//.test(val) ? val.trim() : '') };
    }
    rows.push({ row: +row.getAttribute('r'), cells });
  }
  return { tabs: sheets.map(s => s.name), rows };
}

// Bài trong kho: dòng có cột A là số (STT) và có chữ dài. Cột chữ = cột có chuỗi dài nhất; cột ảnh = ô đầu tiên có link Drive.
export function postsOf(rows) {
  const out = [];
  for (const { row, cells } of rows) {
    const stt = String(cells.A?.v ?? '').trim().replace(/\.0+$/, ''); if (!/^\d+$/.test(stt)) continue;
    const cols = Object.entries(cells).filter(([k]) => k !== 'A');
    const textCol = cols.filter(([, c]) => !/^https?:\/\//.test(c.v)).sort((a, b) => b[1].v.length - a[1].v.length)[0];
    if (!textCol || textCol[1].v.length < 40) continue;
    const media = cols.find(([, c]) => /drive\.google\.com/.test(c.link));
    out.push({ row, stt: +stt, text: textCol[1].v.trim(), media: media ? media[1].link : '', mediaLabel: media ? media[1].v : '' });
  }
  return out;
}

// ---------- folder Drive công khai → danh sách id file (đúng thứ tự hiện trong folder) ----------
export const folderId = u => (String(u).match(/folders\/([\w-]{20,})/) || [])[1] || '';
export async function listFolder(url) {
  const id = folderId(url); if (!id) throw Error('Link không phải folder Drive.');
  const r = await fetch(`https://drive.google.com/drive/folders/${id}`, { credentials: 'omit' });
  if (!r.ok) throw Error('Không mở được folder ảnh (HTTP ' + r.status + ').');
  const html = await r.text();
  const ids = [];
  for (const m of html.matchAll(/data-id="([\w-]{20,})"/g)) if (m[1] !== id && !ids.includes(m[1])) ids.push(m[1]);
  if (!ids.length) throw Error('Folder trống hoặc chưa chia sẻ công khai (cần "Bất kỳ ai có đường liên kết").');
  return ids;
}
const toDataUrl = async blob => new Promise((res, rej) => { const f = new FileReader(); f.onload = () => res(f.result); f.onerror = rej; f.readAsDataURL(blob); });
// Tải 1 file Drive. Trả null nếu không phải ảnh (video, thư mục con…).
// Ảnh gốc Drive có khi 4000×5328 (~5 MB): thu về cạnh dài ≤ 2048 px (FB cũng tự thu về cỡ này) để gói nhẹ,
// gửi sang tab Facebook không vượt giới hạn tin nhắn của Chrome.
export const MAX_EDGE = 2048;
export async function driveImage(id) {
  const r = await fetch(`https://drive.usercontent.google.com/download?id=${id}&export=download`, { credentials: 'omit' });
  if (!r.ok) throw Error('Tải ảnh Drive lỗi HTTP ' + r.status);
  const blob = await r.blob();
  if (!/^image\/(jpe?g|png|webp|gif)$/i.test(blob.type)) return null;
  const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const k = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
  const size = `${Math.round(bmp.width * k)}×${Math.round(bmp.height * k)}`;
  if (k === 1 && blob.size < 4e6) { bmp.close(); return { dataUrl: await toDataUrl(blob), size }; }
  const c = new OffscreenCanvas(Math.round(bmp.width * k), Math.round(bmp.height * k));
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height); bmp.close();
  return { dataUrl: await toDataUrl(await c.convertToBlob({ type: 'image/jpeg', quality: 0.92 })), size };
}
