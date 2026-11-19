const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const { validId } = require('./client.cjs');
const colors = ['background', 'accent', 'selfText', 'otherBubble', 'otherText', 'surface', 'text'];
function validateTheme(value) {
  if (!value || typeof value !== 'object') throw new Error('테마를 확인해 주세요.');
  const result = {};
  for (const name of colors) { if (!/^#[a-f\d]{6}$/i.test(value[name])) throw new Error('올바른 색상을 선택해 주세요.'); result[name] = value[name]; }
  result.fontSize = Number(value.fontSize);
  if (!Number.isInteger(result.fontSize) || result.fontSize < 12 || result.fontSize > 20) throw new Error('글자 크기는 12~20으로 선택해 주세요.');
  result.pattern = value.pattern === 'dots' ? 'dots' : 'none';
  return result;
}
class PersonalStore {
  constructor(file) { this.file = file; this.queue = Promise.resolve(); }
  async readAll() { try { return JSON.parse(await fs.readFile(this.file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return {}; throw new Error('개인 설정을 읽을 수 없습니다.'); } }
  async get(account) { const data = await this.readAll(); return { emojiFavorites: [], gifFavorites: [], gifRecents: [], globalTheme: null, roomThemes: {}, ...data[account] }; }
  mutate(account, change) {
    const task = this.queue.catch(() => {}).then(async () => {
      const data = await this.readAll(); data[account] = change({ ...data[account] });
      const temp = `${this.file}.${randomUUID()}.tmp`;
      try { await fs.writeFile(temp, JSON.stringify(data), { mode: 0o600 }); await fs.rename(temp, this.file); } finally { await fs.unlink(temp).catch(() => {}); }
      return this.get(account);
    }); this.queue = task; return task;
  }
  setRoomTheme(account, id, theme) {
    id = validId(id); theme = theme === null ? null : validateTheme(theme);
    return this.mutate(account, data => { const rooms = { ...data.roomThemes }; if (theme === null) delete rooms[id]; else rooms[id] = theme; if (Object.keys(rooms).length > 1000) throw Error('테마 저장 개수를 초과했습니다.'); return { ...data, roomThemes: rooms }; });
  }
  setGlobalTheme(account, theme, replaceRooms = false) {
    theme = theme === null ? null : validateTheme(theme);
    if (typeof replaceRooms !== 'boolean') throw Error('대화방 테마 적용 범위를 확인해 주세요.');
    return this.mutate(account, data => ({ ...data, globalTheme: theme, ...(replaceRooms ? { roomThemes: {} } : {}) }));
  }
  update(account, field, value) {
    if (!['emojiFavorites', 'gifFavorites', 'gifRecents', 'roomThemes'].includes(field)) throw new Error('지원하지 않는 개인 설정입니다.');
    if (field === 'emojiFavorites') { if (!Array.isArray(value) || value.length > 100 || value.some(v => typeof v !== 'string' || v.length > 100)) throw new Error('이모지는 최대 100개까지 등록할 수 있습니다.'); value = [...new Set(value)]; }
    if (field === 'gifFavorites' || field === 'gifRecents') { if (!Array.isArray(value) || value.length > 100 || value.some(v => typeof v !== 'string' || !/^[a-zA-Z0-9]{1,80}$/.test(v))) throw new Error('잘못된 GIF 목록입니다.'); value = [...new Set(value)]; }
    if (field === 'roomThemes') { const entries = Object.entries(value || {}); if (entries.length > 1000) throw new Error('테마 저장 개수를 초과했습니다.'); value = Object.fromEntries(entries.map(([id, theme]) => [validId(id), validateTheme(theme)])); }
    return this.mutate(account, data => ({ ...data, [field]: value }));
  }
}
module.exports = { PersonalStore, validateTheme };
