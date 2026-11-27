// Đếm bài tường / bài group theo tháng từ các dòng của Nhật ký hoạt động.
// Dùng chung cho fb-content.js (bản chép tay, không import được) và test. Giữ hàm thuần, không đụng DOM.

const EN_MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

// "18 tháng 11, 2026" · "18 tháng 11" · "18 November 2026" · "November 18, 2026" · "hôm nay" · "Yesterday" → "2026-11-18"
export function parseDay(s, now = new Date()) {
  const t = String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (/^(hôm nay|today)$/.test(t)) return iso(now);
  if (/^(hôm qua|yesterday)$/.test(t)) return iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  let d, m, y;
  let r = t.match(/^(\d{1,2}) tháng (\d{1,2})(?:,? (\d{4}))?$/);
  if (r) [, d, m, y] = r;
  else if ((r = t.match(/^(\d{1,2}) ([a-z]+)(?: (\d{4}))?$/)) && EN_MONTHS.includes(r[2])) { d = r[1]; m = EN_MONTHS.indexOf(r[2]) + 1; y = r[3]; }
  else if ((r = t.match(/^([a-z]+) (\d{1,2})(?:, (\d{4}))?$/)) && EN_MONTHS.includes(r[1])) { d = r[2]; m = EN_MONTHS.indexOf(r[1]) + 1; y = r[3]; }
  else return '';
  y = y ? +y : now.getFullYear();
  // không ghi năm = năm nay; nếu ra ngày ở tương lai thì là năm trước
  if (!r[3] && !/\d{4}/.test(t) && new Date(y, m - 1, d) > now) y--;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
const COMMENT_RE = /\b(?:commented|replied|reacted)\b|đã (?:bình luận|trả lời|phản hồi|bày tỏ cảm xúc)/i;
// "posted in G" · "shared a post in G" · "shared Lily's post to G" · "shared to G" · "added 3 photos to G"
const POST_EN = /\b(?:posted|shared|added|wrote|created)\b.*?\b(?:in|to)\s+(.+?)\.?$/i;
// "đã đăng trong G" · "đã chia sẻ bài viết vào nhóm G" · "đã chia sẻ một bài viết trong G" · "đã thêm 3 ảnh vào G"
const POST_VI = /đã (?:đăng|chia sẻ|thêm|viết|tạo)(?:.*?\s|\s)(?:trong|lên|vào|tại|với)(?: nhóm)?\s+(.+?)\.?$/i;
const POST_VERB = /\b(?:posted|shared|added|wrote|created|updated)\b|đã (?:đăng|chia sẻ|thêm|viết|tạo|cập nhật)/i;

// Dòng ở mục "Bài viết, ảnh và video của bạn": bài thật, cập nhật hồ sơ, hay bài tường chia sẻ vào group.
// groupHint = chữ của link /groups/ trong dòng (fb-content.js lấy). Chỉ coi là 'group' khi chữ đầu dòng
// nêu đúng group đó ("shared a post to <group>"), để "shared Lan's post." (chia sẻ bài group về tường) vẫn là bài tường.
export function wallKind(head, groupHint = '') {
  const h = norm(head);
  if (/ảnh đại diện|ảnh bìa|profile picture|cover photo|sự kiện trong đời|life event|tiểu sử|\bbio\b|avatar|khung ảnh|frame/i.test(h)) return 'profile';
  const hint = norm(groupHint).toLowerCase();
  if (hint && !COMMENT_RE.test(h)) {
    const r = h.match(POST_EN) || h.match(POST_VI);
    if (r && r[1].toLowerCase().includes(hint)) return 'group';
  }
  return 'post';
}

// Dòng ở mục "Bài viết và bình luận trong nhóm": đăng bài / chia sẻ / bình luận, tên group.
// Bình luận xét trước: "commented on a post shared to G" là bình luận, không phải bài.
export function groupKind(head, groupHint = '') {
  const h = norm(head), hint = norm(groupHint);
  if (COMMENT_RE.test(h)) return { type: 'comment', group: '' };
  const r = h.match(POST_EN) || h.match(POST_VI);
  if (r) return { type: 'post', group: hint || r[1].trim() };
  // "Lily shared a post." / "Lily đã chia sẻ một liên kết." — tên group không nằm trong câu, lấy từ link group của dòng
  if (POST_VERB.test(h)) return { type: 'post', group: hint || '(không rõ group)' };
  return { type: 'other', group: '' };
}

const GROUP_AUDIENCE = /^(nhóm công khai|nhóm riêng tư|public group|private group)$/i;
// Phân loại 1 dòng của mục group (dòng do fb-content.js đọc: head, audience, group, groupId, pending).
// FB tiếng Việt hiện bài chia sẻ vào group chỉ bằng caption + "Nhóm công khai" + nút Xem tới /groups/<id>/permalink/…,
// không có câu "đã chia sẻ". Dòng như vậy (không phải bình luận, có đối tượng là nhóm) là bài group, share = true.
// Bài đang chờ admin duyệt (link /pending_posts/) chưa lên nên không tính.
export function groupRow(r = {}) {
  if (r.pending) return { type: 'pending', group: '' };
  const hint = r.group || (r.groupId ? 'nhóm ' + r.groupId : '');
  const g = groupKind(r.head, hint);
  if (g.type === 'other' && GROUP_AUDIENCE.test(norm(r.audience)) && r.groupId) return { type: 'post', group: hint, share: true };
  return g;
}

// Danh sách bài group {day, group} từ cả hai mục. Bài tường chia sẻ vào group có thể hiện ở mục tường,
// mục group, hoặc cả hai: dòng ở mục tường chỉ được cộng khi mục group chưa có bài cùng ngày, cùng group.
export function groupPostList({ wall = [], group = [] }, since = '') {
  const inRange = r => r.day && !(since && r.day < since);
  const out = [], have = new Map();
  for (const r of group) {
    if (!inRange(r)) continue;
    const g = groupRow(r);
    if (g.type !== 'post') continue;
    out.push({ day: r.day, group: g.group });
    const k = r.day + '|' + g.group.toLowerCase(); have.set(k, (have.get(k) || 0) + 1);
  }
  for (const r of wall) {
    if (!inRange(r) || wallKind(r.head, r.group) !== 'group') continue;
    const k = r.day + '|' + norm(r.group).toLowerCase();
    if (have.get(k)) { have.set(k, have.get(k) - 1); continue; }
    out.push({ day: r.day, group: norm(r.group) });
  }
  return out;
}

// rows: [{day:'2026-11-18', head, group}] → [{month, wall, profile, groupPosts, comments, groups}]
export function tally({ wall = [], group = [] }, since = '') {
  const by = new Map();
  const get = m => { if (!by.has(m)) by.set(m, { month: m, wall: 0, profile: 0, groupPosts: 0, comments: 0, other: 0, groupSet: new Set() }); return by.get(m); };
  let undated = 0, pending = 0;
  for (const r of wall) {
    if (!r.day) { undated++; continue; } if (since && r.day < since) continue;
    const k = wallKind(r.head, r.group);
    if (k === 'profile') get(r.day.slice(0, 7)).profile++; else if (k === 'post') get(r.day.slice(0, 7)).wall++;
  }
  for (const r of group) {
    if (!r.day) { undated++; continue; } if (since && r.day < since) continue;
    const g = groupRow(r);
    if (g.type === 'pending') { pending++; continue; }
    const x = get(r.day.slice(0, 7));
    if (g.type === 'comment') x.comments++; else if (g.type === 'other') x.other++;
  }
  for (const p of groupPostList({ wall, group }, since)) { const x = get(p.day.slice(0, 7)); x.groupPosts++; x.groupSet.add(p.group); }
  const months = [...by.values()].sort((a, b) => b.month.localeCompare(a.month)).map(({ groupSet, ...x }) => ({ ...x, groups: groupSet.size }));
  return { months, undated, pending };
}

// Cộng dồn các tháng thành 1 dòng (vd "30 ngày gần nhất")
export function sum(months) {
  return months.reduce((a, m) => { for (const k of ['wall', 'profile', 'groupPosts', 'comments', 'other']) a[k] += m[k]; return a; }, { wall: 0, profile: 0, groupPosts: 0, comments: 0, other: 0 });
}

// Bài group theo từng group (từ ngày `since`), nhiều nhất trước. Nhận {wall, group} hoặc mảng dòng group.
export function byGroup(rows, since = '') {
  const c = new Map();
  for (const p of groupPostList(Array.isArray(rows) ? { group: rows } : rows, since)) c.set(p.group, (c.get(p.group) || 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1]);
}

export const isoDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
