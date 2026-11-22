import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDay, wallKind, groupKind, tally } from '../count.js';

const now = new Date(2026, 10, 22, 17, 0);

test('đọc ngày tiếng Việt / tiếng Anh', () => {
  assert.equal(parseDay('18 November 2026', now), '2026-11-18');
  assert.equal(parseDay('November 18, 2026', now), '2026-11-18');
  assert.equal(parseDay('9 June 2016', now), '2016-06-09');
  assert.equal(parseDay('18 tháng 11, 2026', now), '2026-11-18');
  assert.equal(parseDay('3 tháng 12', now), '2025-12-03');   // không có năm, tương lai → năm trước
  assert.equal(parseDay('5 tháng 11', now), '2026-11-05');
  assert.equal(parseDay('Hôm qua', now), '2026-11-21');
  assert.equal(parseDay('Today', now), '2026-11-22');
  assert.equal(parseDay('Public group', now), '');
});

test('phân loại dòng tường', () => {
  assert.equal(wallKind('Sophie Embroidery added 4 new photos.'), 'post');
  assert.equal(wallKind('Sophie Embroidery updated her status.'), 'post');
  assert.equal(wallKind('Sophie Embroidery updated her profile picture.'), 'profile');
  assert.equal(wallKind('Nguyễn Thương đã cập nhật ảnh bìa của cô ấy.'), 'profile');
  assert.equal(wallKind('Sophie Embroidery added a life event: Started new job at K-Embroidery.'), 'profile');
});

test('phân loại dòng group', () => {
  assert.deepEqual(groupKind('Sophie Embroidery posted in SMOCK DRESS FOR SALE UK OR IRELAND.'), { type: 'post', group: 'SMOCK DRESS FOR SALE UK OR IRELAND' });
  assert.deepEqual(groupKind('Rosie Smocking đã đăng trong Smocks for sale.'), { type: 'post', group: 'Smocks for sale' });
  assert.equal(groupKind("Sophie Embroidery commented on Whitney Ann Ball's post.").type, 'comment');
  assert.equal(groupKind('Rosie Smocking đã bình luận về bài viết của Lan.').type, 'comment');
});

test('cộng theo tháng, bỏ trước mốc', () => {
  const r = tally({
    wall: [{ day: '2026-11-18', head: 'added 4 new photos.' }, { day: '2026-11-02', head: 'updated her profile picture.' }, { day: '2026-10-30', head: 'added 5 new photos.' }, { day: '2026-08-01', head: 'x' }],
    group: [{ day: '2026-11-18', head: 'posted in A.' }, { day: '2026-11-17', head: 'posted in A.' }, { day: '2026-11-17', head: 'posted in B.' }, { day: '2026-11-16', head: 'commented on X.' }, { day: '', head: 'posted in C.' }]
  }, '2026-10-01');
  assert.deepEqual(r.months, [
    { month: '2026-11', wall: 1, profile: 1, groupPosts: 3, comments: 1, other: 0, groups: 2 },
    { month: '2026-10', wall: 1, profile: 0, groupPosts: 0, comments: 0, other: 0, groups: 0 }
  ]);
  assert.equal(r.undated, 1);
});

test('ngày kiểu "21 Tháng 11, 2026" (FB tiếng Việt viết hoa)', () => {
  assert.equal(parseDay('21 Tháng 11, 2026', now), '2026-11-21');
});

test('cộng dồn và đếm theo group', async () => {
  const { sum, byGroup } = await import('../count.js');
  assert.deepEqual(sum([{ wall: 1, profile: 0, groupPosts: 2, comments: 1, other: 0 }, { wall: 2, profile: 1, groupPosts: 0, comments: 0, other: 1 }]), { wall: 3, profile: 1, groupPosts: 2, comments: 1, other: 1 });
  assert.deepEqual(byGroup([{ day: '2026-11-18', head: 'X posted in A.' }, { day: '2026-11-17', head: 'X posted in A.' }, { day: '2026-11-17', head: 'X posted in B.' }, { day: '2026-01-01', head: 'X posted in C.' }], '2026-10-01'), [['A', 2], ['B', 1]]);
});
