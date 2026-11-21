// Service worker: mở side panel khi bấm biểu tượng, tải ảnh gốc từ fbcdn (content script bị CORS chặn).
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

const toDataUrl = async blob => {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 8192) bin += String.fromCharCode(...buf.subarray(i, i + 8192));
  return `data:${blob.type || 'image/jpeg'};base64,${btoa(bin)}`;
};

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type !== 'fetch-image') return false;
  (async () => {
    try {
      const u = new URL(msg.url);
      if (!/\.fbcdn\.net$/.test(u.hostname)) throw Error('Chỉ tải ảnh từ máy chủ ảnh Facebook (fbcdn.net).');
      const r = await fetch(u, { credentials: 'omit' });
      if (!r.ok) throw Error('Tải ảnh lỗi HTTP ' + r.status + ' (link ảnh có thể đã hết hạn — lấy lại ảnh nguồn).');
      const blob = await r.blob();
      reply({ ok: true, dataUrl: await toDataUrl(blob), size: blob.size, type: blob.type });
    } catch (e) { reply({ ok: false, error: e.message }); }
  })();
  return true;
});
