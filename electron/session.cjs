const fs = require('node:fs/promises');
class SessionStore {
  constructor(file, storage) { this.file = file; this.storage = storage; }
  async save(client) {
    if (!await this.storage.isAsyncEncryptionAvailable()) throw new Error('운영체제의 로그인 정보 암호화를 사용할 수 없습니다.');
    const data = { server: client.server, token: client.token, ownedSession: client.ownedSession };
    await fs.writeFile(this.file, await this.storage.encryptStringAsync(JSON.stringify(data)), { mode: 0o600 });
  }
  async load() {
    let encrypted;
    try { encrypted = await fs.readFile(this.file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    if (!await this.storage.isAsyncEncryptionAvailable()) throw new Error('운영체제의 로그인 정보 암호화를 사용할 수 없습니다.');
    try {
      const decrypted = await this.storage.decryptStringAsync(encrypted);
      const data = JSON.parse(decrypted.result);
      if (typeof data.server !== 'string' || !data.token || typeof data.token !== 'string' || typeof data.ownedSession !== 'boolean') throw Error();
      if (decrypted.shouldReEncrypt) await fs.writeFile(this.file, await this.storage.encryptStringAsync(decrypted.result), { mode: 0o600 });
      return data;
    } catch { await this.clear(); throw new Error('저장한 로그인 정보를 사용할 수 없습니다. 다시 로그인해 주세요.'); }
  }
  async clear() { await fs.unlink(this.file).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}
module.exports = { SessionStore };
