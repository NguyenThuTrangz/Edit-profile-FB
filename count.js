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

// Dòng ở mục "Bài viết, ảnh và video của bạn": bài thật hay chỉ là cập nhật hồ sơ
export function wallKind(head) {
  const h = String(head || '');
  if (/ảnh đại diện|ảnh bìa|profile picture|cover photo|sự kiện trong đời|life event|tiểu sử|\bbio\b|avatar|khung ảnh|frame/i.test(h)) return 'profile';
  return 'post';
}

// Dòng ở mục "Bài viết và bình luận trong nhóm": đăng bài / bình luận, tên group
export function groupKind(head) {
  const h = String(head || '').replace(/\s+/g, ' ').trim();
  const r = h.match(/(?:posted in|shared .*? (?:to|in)|đã đăng(?: bài)? (?:trong|vào)(?: nhóm)?|đã chia sẻ .*? (?:lên|vào|trong)(?: nhóm)?)\s+(.+?)\.?$/i);
  if (r) return { type: 'post', group: r[1].trim() };
  if (/commented|replied|bình luận|trả lời|phản hồi/i.test(h)) return { type: 'comment', group: '' };
  return { type: 'other', group: '' };
}

// rows: [{day:'2026-11-18', head, audience}] → [{month, wall, profile, groupPosts, comments, groups}]
export function tally({ wall = [], group = [] }, since = '') {
  const by = new Map();
  const get = m => { if (!by.has(m)) by.set(m, { month: m, wall: 0, profile: 0, groupPosts: 0, comments: 0, other: 0, groupSet: new Set() }); return by.get(m); };
  let undated = 0;
  for (const r of wall) {
    if (!r.day) { undated++; continue; } if (since && r.day < since) continue;
    const x = get(r.day.slice(0, 7)); wallKind(r.head) === 'profile' ? x.profile++ : x.wall++;
  }
  for (const r of group) {
    if (!r.day) { undated++; continue; } if (since && r.day < since) continue;
    const g = groupKind(r.head), x = get(r.day.slice(0, 7));
    if (g.type === 'post') { x.groupPosts++; x.groupSet.add(g.group); } else if (g.type === 'comment') x.comments++; else x.other++;
  }
  const months = [...by.values()].sort((a, b) => b.month.localeCompare(a.month)).map(({ groupSet, ...x }) => ({ ...x, groups: groupSet.size }));
  return { months, undated };
}

// Cộng dồn các tháng thành 1 dòng (vd "30 ngày gần nhất")
export function sum(months) {
  return months.reduce((a, m) => { for (const k of ['wall', 'profile', 'groupPosts', 'comments', 'other']) a[k] += m[k]; return a; }, { wall: 0, profile: 0, groupPosts: 0, comments: 0, other: 0 });
}

// Bài group theo từng group (từ ngày `since`), nhiều nhất trước
export function byGroup(group, since = '') {
  const c = new Map();
  for (const r of group) { if (!r.day || (since && r.day < since)) continue; const g = groupKind(r.head); if (g.type === 'post') c.set(g.group, (c.get(g.group) || 0) + 1); }
  return [...c.entries()].sort((a, b) => b[1] - a[1]);
}

export const isoDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
