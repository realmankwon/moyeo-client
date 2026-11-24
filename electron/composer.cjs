const { dialog, shell, app } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function registerComposer(client, handle, getWindow, giphy) {
  const staged = new Map();
  let session = client.mediaKey;
  function current() { if (session !== client.mediaKey) { staged.clear(); session = client.mediaKey; } if (!client.me) throw new Error('먼저 로그인해 주세요.'); }
  function add(entry) { const key = randomUUID(); staged.set(key, entry); return { key, name: entry.name, size: entry.size }; }
  handle('stageGif', async id => { current(); const epoch = client.mediaKey; const item = await giphy.download(id); if (epoch !== client.mediaKey) throw new Error('서버 연결이 변경되었습니다.'); return add(item); });
  handle('chooseAttachments', async options => {
    current(); const key = client.mediaKey;
    const result = await dialog.showOpenDialog(getWindow(), { title: options?.gifOnly ? 'GIF 파일 선택' : '보낼 파일 선택', properties: ['openFile', 'multiSelections'], ...(options?.gifOnly ? { filters: [{ name: 'GIF', extensions: ['gif'] }] } : {}) });
    if (key !== client.mediaKey) throw new Error('서버 연결이 변경되었습니다.');
    if (result.canceled) return [];
    if (result.filePaths.length > 10) throw new Error('한 메시지에 최대 10개 파일을 선택해 주세요.');
    const items = [];
    for (const file of result.filePaths) { const stat = await fsp.stat(file); if (!stat.isFile()) continue; items.push(add({ path: file, name: path.basename(file), size: stat.size })); }
    return items;
  });
  handle('stageAttachment', data => {
    current();
    const bytes = data?.bytes;
    if (!(bytes instanceof ArrayBuffer) && !ArrayBuffer.isView(bytes)) throw new Error('파일 데이터를 읽을 수 없습니다.');
    if (bytes.byteLength > 25 * 1024 * 1024) throw new Error('25MB보다 큰 파일은 파일 선택 버튼으로 첨부해 주세요.');
    const name = path.basename(String(data.name || 'clipboard.png').replace(/[/\\]/g, '_')).slice(0, 255);
    return add({ bytes: Buffer.from(bytes), name, size: bytes.byteLength, type: String(data.type || 'application/octet-stream') });
  });
  handle('discardAttachment', key => { current(); staged.delete(key); });
  handle('uploadAttachment', async (channel, key) => {
    current(); const item = staged.get(key), epoch = client.mediaKey;
    if (!item) throw new Error('첨부 파일을 다시 선택해 주세요.');
    if (item.uploaded?.[channel]) return item.uploaded[channel];
    const blob = item.path ? await fs.openAsBlob(item.path) : new Blob([item.bytes], { type: item.type });
    const uploaded = await client.upload(channel, item.name, blob);
    if (epoch !== client.mediaKey) throw new Error('서버 연결이 변경되었습니다.');
    (item.uploaded ||= {})[channel] = uploaded;
    return uploaded;
  });
  handle('emojiList', page => client.emojiList(page));
  handle('emojiByName', name => client.emojiByName(name));
  handle('createEmoji', async name => {
    current();
    if (typeof name !== 'string' || !/^[a-z0-9_-]{2,64}$/.test(name)) throw new Error('이름은 영문 소문자·숫자·밑줄·하이픈 2~64자로 입력해 주세요.');
    const epoch = client.mediaKey;
    const result = await dialog.showOpenDialog(getWindow(), { title: '사용자 이모지 이미지 선택', filters: [{ name: '이모지 이미지', extensions: ['png', 'gif', 'jpg', 'jpeg'] }], properties: ['openFile'] });
    if (result.canceled) return null;
    if (epoch !== client.mediaKey) throw new Error('서버 연결이 변경되었습니다.');
    return client.createEmoji(name, await fs.openAsBlob(result.filePaths[0]));
  });
  const recentPath = path.join(app.getPath('userData'), 'emoji-recents.json');
  const accountKey = () => JSON.stringify([client.server, client.me?.id]);
  async function readRecent() { try { return JSON.parse(await fsp.readFile(recentPath, 'utf8')); } catch { return {}; } }
  handle('getEmojiRecents', async () => { current(); const key = accountKey(); return (await readRecent())[key] || []; });
  let saveQueue = Promise.resolve();
  handle('saveEmojiRecents', values => {
    current(); const key = accountKey();
    if (!Array.isArray(values) || values.length > 30 || values.some(value => typeof value !== 'string' || value.length > 100)) throw new Error('잘못된 최근 사용 이모지입니다.');
    const task = saveQueue.catch(() => {}).then(async () => { const data = await readRecent(); data[key] = values; await fsp.writeFile(recentPath, JSON.stringify(data)); });
    saveQueue = task; return task;
  });
  handle('openLink', value => { const url = new URL(value); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('이 링크는 열 수 없습니다.'); return shell.openExternal(url.href); });
  return () => { staged.clear(); };
}
module.exports = { registerComposer };
