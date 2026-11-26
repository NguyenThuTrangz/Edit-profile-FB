import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captionKey, crosspostStats, wallPostId } from '../crosspost.js';

test('chuẩn hoá caption và đọc ID bài tường', () => {
  assert.equal(captionKey('  Mẫu áo\n\n  mới '), 'Mẫu áo mới');
  assert.equal(wallPostId('https://web.facebook.com/nick/posts/pfbid123/?ref=log'), 'pfbid123');
  assert.equal(wallPostId('/permalink.php?story_fbid=456&id=999'), '456');
  assert.equal(wallPostId('https://www.facebook.com/groups/123/posts/456/'), '');
  assert.equal(wallPostId('https://example.com/nick/posts/456/'), '');
});

test('đếm caption ở nhiều group và đối chiếu bài tường trong kỳ', () => {
  const rows = [
    { day: '2026-11-03', head: 'A posted in Group A.', captionHash: 'same', groupKey: '1', postKey: 'a', read: true },
    { day: '2026-11-04', head: 'A đã chia sẻ bài viết vào nhóm Group B.', captionHash: 'same', groupKey: '2', postKey: 'b', read: true, sourceIds: ['own'] },
    { day: '2026-11-04', head: 'A đã chia sẻ bài viết vào nhóm Group B.', captionHash: 'same', groupKey: '2', postKey: 'b', read: true, sourceIds: ['own'] },
    { day: '2026-11-04', head: 'A posted in Group A.', captionHash: 'other', groupKey: '1', postKey: 'c', read: true, sourceIds: ['someone-else'] },
    { day: '2026-11-06', head: 'A posted in Group A.', captionHash: 'other', groupKey: '1', postKey: 'd', read: true },
    { day: '2026-11-07', head: 'A posted in Group C.' },
    { day: '2026-11-08', head: 'A commented on a post.', captionHash: 'same' },
    { day: '2026-10-29', head: 'A posted in Group C.', captionHash: 'other', groupKey: '3' }
  ];
  assert.deepEqual(crosspostStats(rows, [{ postId: 'own' }], '2026-10-25', '2026-11'), {
    crossposts: 2, wallShares: 1, read: 4, hasWallIds: true, checked: 4, posts: 5
  });
  assert.equal(crosspostStats(rows, null, '2026-11-04').crossposts, 0);
  assert.equal(crosspostStats(rows, null, '2026-10-25').crossposts, 5);
  assert.deepEqual(crosspostStats([rows[5]], [], '2026-11-01'), {
    crossposts: 0, wallShares: 0, read: 0, hasWallIds: false, checked: 0, posts: 1
  });
});
