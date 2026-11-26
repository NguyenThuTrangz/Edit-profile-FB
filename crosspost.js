import { groupKind, wallKind } from './count.js';

export function captionKey(text) {
  return text.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

export function facebookUrl(href) {
  if (!href) return null;
  try {
    const url = new URL(href, 'https://www.facebook.com');
    return url.protocol === 'https:' && ['www.facebook.com', 'web.facebook.com'].includes(url.host) ? url : null;
  } catch {
    return null;
  }
}

export function wallPostId(href) {
  const url = facebookUrl(href);
  if (!url) return '';
  const path = url.pathname.match(/^\/[^/]+\/posts\/([\w-]+)\/?$/i);
  if (path && !/^\/(?:groups|pages)\//i.test(url.pathname)) return path[1];
  if (/^\/(?:permalink|story)\.php$/i.test(url.pathname)) return url.searchParams.get('story_fbid') || '';
  return '';
}

export function crosspostStats(rows, wall, since, month = '') {
  const captions = new Map();
  const seen = new Set();
  const wallIds = new Set((wall || []).filter(row => wallKind(row.head) === 'post').map(row => row.postId).filter(Boolean));
  let posts = 0;
  let checked = 0;
  let wallShares = 0;
  let read = 0;
  for (const row of rows) {
    if (!row.day || row.day < since || (month && !row.day.startsWith(`${month}-`))) continue;
    const { type, group } = groupKind(row.head);
    if (type !== 'post') continue;
    if (row.postKey && seen.has(row.postKey)) continue;
    if (row.postKey) seen.add(row.postKey);
    posts++;
    if (row.read) read++;
    if (row.sourceIds?.some(id => wallIds.has(id))) wallShares++;
    const caption = row.captionHash;
    if (!caption) continue;
    checked++;
    const entry = captions.get(caption) || { groups: new Set(), posts: 0 };
    entry.groups.add(row.groupKey || group.toLowerCase());
    entry.posts++;
    captions.set(caption, entry);
  }

  const matches = [...captions.values()].filter(entry => entry.groups.size > 1);
  return {
    crossposts: matches.reduce((total, entry) => total + entry.posts, 0),
    wallShares,
    read,
    hasWallIds: wallIds.size > 0,
    checked,
    posts
  };
}
