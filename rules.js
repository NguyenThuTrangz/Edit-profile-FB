// Làm sạch caption lấy từ nick cũ trước khi đưa sang nick mới.
// Quy tắc rút ra từ đợt thay bài SM04–SM08 (21–22/11/2026):
//  - mọi số WhatsApp / link wa.me của nick cũ → số chung (mặc định +84 855 555 490)
//  - "Contact Gracie/Cathie/Emily/Lily …" → "Contact <tên nick mới> at K-Embroidery"
//  - Facebook cá nhân của nick cũ → fanpage K-Embroidery Factory
//  - bỏ dòng Email, bỏ dòng Instagram cá nhân (giữ Instagram công ty k_embroidery…)
//  - tên nick cũ còn sót trong bài → cảnh báo để người dùng tự sửa

export const DEFAULTS = {
  wa: '+84 855 555 490',
  nickName: '',                         // tên smock của nick đang sửa, vd "Olivia"
  oldNames: ['Gracie', 'Cathie', 'Emily', 'Lily'],
  fanpageUrl: 'https://www.facebook.com/KEmbroideryFactory',
  fanpageName: 'K-Embroidery Factory',
  keepInstagram: 'k_embroidery',         // dòng Instagram chứa chuỗi này thì giữ
  custom: ''                             // mỗi dòng: biểu-thức => thay-bằng  (thay bằng rỗng = xoá đoạn khớp)
};

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const digits = s => s.replace(/\D/g, '');

export function parseCustom(text) {
  const rules = [], errors = [];
  for (const [i, raw] of String(text || '').split(/\r?\n/).entries()) {
    const line = raw.trim(); if (!line || line.startsWith('#')) continue;
    const k = line.indexOf('=>'); if (k < 0) { errors.push(`Dòng ${i + 1}: thiếu "=>"`); continue; }
    try { rules.push([new RegExp(line.slice(0, k).trim(), 'gi'), line.slice(k + 2).trim()]); }
    catch (e) { errors.push(`Dòng ${i + 1}: ${e.message}`); }
  }
  return { rules, errors };
}

export function cleanCaption(input, opt = {}) {
  const o = { ...DEFAULTS, ...opt };
  const waDigits = digits(o.wa);
  const changes = [];
  let t = String(input || '').replace(/\r\n?/g, '\n');
  const note = (what, before, after) => { if (before !== after) changes.push(what); return after; };

  // 1) wa.me/<số> và api.whatsapp.com/send?phone=<số>
  t = note('link WhatsApp → số chung', t, t.replace(/wa\.me\/\+?\d{9,15}/gi, 'wa.me/' + waDigits)
    .replace(/(api\.whatsapp\.com\/send\?phone=)\+?\d{9,15}/gi, '$1' + waDigits));
  // 2) số điện thoại VN dạng quốc tế: +84 xxx xxx xxx (khoảng trắng, chấm, gạch tuỳ ý)
  t = note('số điện thoại → số chung', t, t.replace(/\+\s?84[\s.\-]?\d{2,3}[\s.\-]?\d{3}[\s.\-]?\d{3,4}\b/g, o.wa));
  // 3) Contact <tên cũ> …
  if (o.nickName) {
    const names = o.oldNames.map(esc).join('|');
    t = note('"Contact <tên cũ>" → tên nick mới', t,
      t.replace(new RegExp(`\\b(contact|liên hệ)\\s+(${names})(\\s+(at\\s+)?k-?embroidery)?`, 'gi'), (_m, w) => `${w} ${o.nickName} at K-Embroidery`));
  }
  // 4) Facebook cá nhân → fanpage
  t = note('link Facebook cá nhân → fanpage', t, t.replace(/https?:\/\/(www\.|web\.|m\.)?facebook\.com\/(?!KEmbroideryFactory\b)[\w.\-/?=&]+/gi, o.fanpageUrl));
  const names2 = o.oldNames.map(esc).join('|');
  t = note('"Facebook: <tên cũ>" → fanpage', t, t.replace(new RegExp(`(facebook\\s*:\\s*)(${names2})[^\\n]*`, 'gi'), `$1${o.fanpageName}`));
  // 5) bỏ dòng Email, Instagram cá nhân
  const lines = t.split('\n'); const kept = [];
  for (const line of lines) {
    if (/^\W*e-?mail\s*:/i.test(line)) { changes.push('bỏ dòng Email'); continue; }
    if (/^\W*instagram\s*:/i.test(line) && !(o.keepInstagram && line.toLowerCase().includes(o.keepInstagram.toLowerCase()))) { changes.push('bỏ dòng Instagram cá nhân'); continue; }
    kept.push(line);
  }
  t = kept.join('\n');
  // 6) quy tắc riêng của người dùng
  const { rules, errors } = parseCustom(o.custom);
  for (const [re, rep] of rules) t = note('quy tắc riêng: ' + re.source, t, t.replace(re, rep));
  // 7) cảnh báo: tên cũ còn sót, số lạ còn sót
  const warnings = [...errors];
  for (const n of o.oldNames) if (new RegExp(`\\b${esc(n)}\\b`, 'i').test(t)) warnings.push(`Còn chữ "${n}" (tên nick cũ) — kiểm tra lại.`);
  for (const m of t.matchAll(/\+?\d[\d\s.\-]{8,}\d/g)) if (digits(m[0]).length >= 9 && digits(m[0]) !== waDigits) warnings.push(`Còn số lạ "${m[0].trim()}".`);
  if (/@[\w.\-]+\.(com|net|vn)\b/i.test(t)) warnings.push('Còn địa chỉ email trong bài.');
  return { text: t.replace(/\n{3,}/g, '\n\n').trim(), changes: [...new Set(changes)], warnings: [...new Set(warnings)] };
}

// Bài trên nick mới đã "chuẩn smock" chưa (để đánh dấu bài cần thay trong Nhật ký hoạt động)
export function looksStandard(text, opt = {}) {
  const o = { ...DEFAULTS, ...opt };
  const s = String(text || '');
  if (/tuyển|tuyển dụng|ứng tuyển|lương|việc làm|recruit|hiring|CV\b/i.test(s)) return false;
  return /smock|k-?embroidery|boutique|wholesale/i.test(s) || s.includes(digits(o.wa).slice(-9));
}
