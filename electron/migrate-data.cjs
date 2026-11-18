const fs = require('node:fs/promises');
const path = require('node:path');
const allowed = ['appearance.json', 'personal-settings.json', 'emoji-recents.json', 'login.bin'];

async function importLegacyData(source, destination) {
  if (path.resolve(source) === path.resolve(destination)) throw Error('현재 앱 데이터 폴더는 가져올 수 없습니다.');
  const pending = [];
  for (const name of allowed) {
    const file = path.join(source, name);
    let info;
    try { info = await fs.lstat(file); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (!info.isFile() || info.isSymbolicLink() || info.size > 5 * 1024 * 1024) throw Error('이전 데이터 파일의 형식이나 크기를 확인해 주세요.');
    const bytes = await fs.readFile(file);
    if (name.endsWith('.json')) { const data = JSON.parse(bytes.toString('utf8')); if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('이전 설정 파일의 형식이 올바르지 않습니다.'); }
    pending.push({ name, bytes });
  }
  if (!pending.length) throw Error('선택한 폴더에 이전 모여 설정이 없습니다. 기존 EXE 옆 Data 폴더를 선택하세요.');
  await fs.mkdir(destination, { recursive: true });
  const imported = [], skipped = [];
  for (const { name, bytes } of pending) {
    try { await fs.writeFile(path.join(destination, name), bytes, { flag: 'wx', mode: 0o600 }); imported.push(name); }
    catch (error) { if (error.code === 'EEXIST') skipped.push(name); else throw error; }
  }
  return { imported, skipped };
}
module.exports = { importLegacyData };
