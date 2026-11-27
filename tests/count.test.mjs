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
    { month: '2026-11', wall: 1, profile: 1, groupPosts: 3, groupShares: 0, groupOwn: 0, groupUnknown: 3, comments: 1, other: 0, groups: 2 },
    { month: '2026-10', wall: 1, profile: 0, groupPosts: 0, groupShares: 0, groupOwn: 0, groupUnknown: 0, comments: 0, other: 0, groups: 0 }
  ]);
  assert.equal(r.undated, 1);
});

test('ngày kiểu "21 Tháng 11, 2026" (FB tiếng Việt viết hoa)', () => {
  assert.equal(parseDay('21 Tháng 11, 2026', now), '2026-11-21');
});

test('cộng dồn và đếm theo group', async () => {
  const { sum, byGroup } = await import('../count.js');
  assert.deepEqual(sum([{ wall: 1, profile: 0, groupPosts: 2, comments: 1, other: 0 }, { wall: 2, profile: 1, groupPosts: 0, comments: 0, other: 1 }]), { wall: 3, profile: 1, groupPosts: 2, groupShares: 0, groupOwn: 0, groupUnknown: 0, comments: 1, other: 1 });
  assert.deepEqual(byGroup([{ day: '2026-11-18', head: 'X posted in A.' }, { day: '2026-11-17', head: 'X posted in A.' }, { day: '2026-11-17', head: 'X posted in B.' }, { day: '2026-01-01', head: 'X posted in C.' }], '2026-10-01'), [['A', 2], ['B', 1]]);
});

test('bài tường chia sẻ vào group (mục group) được tính là bài group', async () => {
  const { groupKind } = await import('../count.js');
  // FB tiếng Anh
  assert.deepEqual(groupKind('Lily Smocking shared a post in SMOCK DRESS FOR SALE UK.'), { type: 'post', group: 'SMOCK DRESS FOR SALE UK' });
  assert.deepEqual(groupKind("Lily Smocking shared Lily Smocking's post to Smocks for sale."), { type: 'post', group: 'Smocks for sale' });
  assert.deepEqual(groupKind('Lily Smocking shared to Smocked Dresses Mums.'), { type: 'post', group: 'Smocked Dresses Mums' });
  assert.deepEqual(groupKind('Lily Smocking shared a link in Smocks in UK.'), { type: 'post', group: 'Smocks in UK' });
  // tên group không có trong câu → lấy từ link group của dòng
  assert.deepEqual(groupKind('Lily Smocking shared a post.', 'Smocks for sale'), { type: 'post', group: 'Smocks for sale' });
  assert.deepEqual(groupKind('Lily Smocking shared a post.'), { type: 'post', group: '(không rõ group)' });
  // FB tiếng Việt
  assert.deepEqual(groupKind('Rosie Smocking đã chia sẻ bài viết vào nhóm Smocks for sale.'), { type: 'post', group: 'Smocks for sale' });
  assert.deepEqual(groupKind('Rosie Smocking đã chia sẻ một bài viết trong Smocks for sale.'), { type: 'post', group: 'Smocks for sale' });
  assert.deepEqual(groupKind('Rosie Smocking đã chia sẻ một liên kết.', 'Smocks for sale'), { type: 'post', group: 'Smocks for sale' });
  // bình luận dưới bài đã chia sẻ vẫn là bình luận
  assert.equal(groupKind('Lily Smocking commented on a post shared to Smocks for sale.').type, 'comment');
  assert.equal(groupKind('Rosie Smocking đã bình luận về bài viết được chia sẻ trong Smocks for sale.').type, 'comment');
  // link group được ưu tiên hơn chữ trong câu
  assert.equal(groupKind('Lily shared a post in Smocks in UK.', 'Smocks in UK').group, 'Smocks in UK');
});

test('mục tường: dòng chia sẻ vào group không cộng vào bài tường', async () => {
  const { wallKind } = await import('../count.js');
  assert.equal(wallKind('Lily Smocking shared a post to Smocks for sale.', 'Smocks for sale'), 'group');
  assert.equal(wallKind('Lily Smocking đã chia sẻ bài viết vào nhóm Smocks for sale.', 'Smocks for sale'), 'group');
  // chia sẻ bài của group về tường mình → vẫn là bài tường
  assert.equal(wallKind("Lily Smocking shared Lan's post.", 'Smocks for sale'), 'post');
  // không có link group → không đoán
  assert.equal(wallKind('Lily Smocking shared a memory to her story.'), 'post');
  assert.equal(wallKind('Lily Smocking added 4 new photos.'), 'post');
});

test('1 bài tường chia sẻ vào 3 group: 1 bài tường + 3 bài group, không đếm trùng', async () => {
  const { tally, byGroup } = await import('../count.js');
  const wall = [
    { day: '2026-11-20', head: 'Lily Smocking added 4 new photos.' },
    { day: '2026-11-20', head: 'Lily Smocking shared a post to Smocks A.', group: 'Smocks A' }, // cũng có ở mục group → bỏ
    { day: '2026-11-20', head: 'Lily Smocking shared a post to Smocks C.', group: 'Smocks C' }  // chỉ có ở mục tường → cộng
  ];
  const group = [
    { day: '2026-11-20', head: 'Lily Smocking shared a post.', group: 'Smocks A' },
    { day: '2026-11-20', head: 'Lily Smocking shared a post in Smocks B.' },
    { day: '2026-11-21', head: 'Lily Smocking commented on a post in Smocks B.' }
  ];
  const r = tally({ wall, group }, '2026-11-01');
  assert.deepEqual(r.months, [{ month: '2026-11', wall: 1, profile: 0, groupPosts: 3, groupShares: 3, groupOwn: 0, groupUnknown: 0, comments: 1, other: 0, groups: 3 }]);
  assert.deepEqual(byGroup({ wall, group }, '2026-11-01').map(x => x[0]).sort(), ['Smocks A', 'Smocks B', 'Smocks C']);
  // kết quả lưu từ bản cũ (không có trường group) vẫn đếm được
  assert.equal(tally({ group: [{ day: '2026-11-20', head: 'X shared a post in Smocks B.' }] }).months[0].groupPosts, 1);
});

// Dòng thật từ Nhật ký → "Bài viết và bình luận trong nhóm" (FB tiếng Việt, 27/11/2026), tên người đã thay.
// Dòng có nút Xem (view) = bài đã lên nhóm; "đã đăng trong" không có nút Xem = chưa duyệt; /pending_posts/ = chờ duyệt.
// read/isShare/groupName là kết quả readGroupDetails mở từng bài: 3 bài đã lên đều là bài chia sẻ (có bài gốc của PEACE.K2).
test('FB tiếng Việt: tách bài chia sẻ / tự đăng đã duyệt, bỏ bài chưa duyệt', async () => {
  const { tally, byGroup, groupRow } = await import('../count.js');
  const share = (head, groupId, groupName) => ({ day: '2026-11-27', head, audience: 'Nhóm công khai', groupId, view: true, read: true, isShare: true, groupName });
  const group = [
    share('test 1', '1029147452879484', 'Nhóm test chức năng'),
    { day: '2026-11-27', head: 'An Nguyễn đã đăng trong Dr. Aarambhi 💕.', audience: 'Nhóm công khai', view: false },
    share('“Đậm cũng là trà, nhạt cũng là trà.”', '186383999665307', 'Actors & Actress'),
    { day: '2026-11-27', head: 'An Nguyễn đã đăng trong Retro Video Gamers.', audience: 'Nhóm công khai', view: false },
    share('cho tot ha noi', '1281335429297794', 'CHỢ TỐT HÀ NỘI'),
    { day: '2026-11-27', head: 'Bán bàn phím cũ', audience: 'Nhóm công khai', groupId: '77', view: true, read: true, isShare: false, groupName: 'Chợ phím' },
    { day: '2026-11-26', head: '“Đậm cũng là trà, nhạt cũng là trà.”', audience: 'Nhóm công khai', groupId: 'dayxahoi', view: true },
    { day: '2026-11-26', head: '“Đậm cũng là trà, nhạt cũng là trà.”', audience: 'Nhóm riêng tư', groupId: '1046218992825575', view: true, pending: true },
    { day: '2026-11-20', head: 'An Nguyễn đã bình luận về bài viết của Bình.', audience: 'Nhóm riêng tư', groupId: '5', view: true },
    { day: '2026-11-19', head: 'An Nguyễn đã phản hồi bình luận của Chi.', audience: 'Nhóm công khai', view: false }
  ];
  assert.deepEqual(groupRow(group[0]), { type: 'post', group: 'Nhóm test chức năng', kind: 'share' });
  assert.equal(groupRow(group[1]).type, 'pending');
  assert.deepEqual(groupRow(group[5]), { type: 'post', group: 'Chợ phím', kind: 'own' });
  assert.deepEqual(groupRow(group[6]), { type: 'post', group: 'nhóm dayxahoi', kind: 'unknown' });
  assert.equal(groupRow(group[7]).type, 'pending');
  assert.equal(groupRow(group[9]).type, 'comment');   // bình luận không có nút Xem vẫn là bình luận
  assert.equal(groupRow({ head: 'abc', audience: 'Công khai' }).type, 'other');
  const r = tally({ group }, '2026-11-01');
  assert.deepEqual(r.months, [{ month: '2026-11', wall: 0, profile: 0, groupPosts: 5, groupShares: 3, groupOwn: 1, groupUnknown: 1, comments: 2, other: 0, groups: 5 }]);
  assert.equal(r.pending, 3);   // 2 bài "đã đăng trong" chưa duyệt + 1 bài pending_posts
  assert.equal(byGroup(group, '2026-11-01').length, 5);
});
