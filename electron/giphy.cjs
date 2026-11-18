function mediaUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !/^(media\d*|i)\.giphy\.com$/i.test(url.hostname) || url.username || url.password || (url.port && url.port !== '443')) throw new Error('지원하지 않는 GIPHY 이미지 주소입니다.');
  return url.href;
}
class GiphyService {
  constructor(client, fetcher = fetch) { this.client = client; this.fetcher = fetcher; this.reset(); }
  reset() { this.config = null; this.items = new Map(); }
  async settings() {
    if (!this.config) {
      const session = this.client.mediaKey;
      const config = (await this.client.request('/config/client?format=old')).data;
      if (session !== this.client.mediaKey) throw new Error('서버 연결이 변경되었습니다.');
      if (config.EnableGifPicker === 'false' || config.EnableGifPicker === false) throw new Error('이 서버에서 GIF 선택기가 비활성화되어 있습니다. 관리자에게 GIF 설정을 확인해 주세요.');
      if (!config.GiphySdkKey) throw new Error('서버에 GIPHY 연결 키가 없습니다. Mattermost의 통합 > GIF 설정을 확인해 주세요.');
      this.config = { key: config.GiphySdkKey };
    } return this.config;
  }
  async api(endpoint, params = {}) {
    const session = this.client.mediaKey;
    const { key } = await this.settings();
    const url = new URL(`https://api.giphy.com/v1/gifs/${endpoint}`);
    url.search = new URLSearchParams({ api_key: key, rating: 'g', ...params });
    let response;
    try { response = await this.fetcher(url.href, { redirect: 'error', signal: AbortSignal.timeout(20000) }); }
    catch { throw new Error('GIPHY에 연결할 수 없습니다. 인터넷 연결과 방화벽 설정을 확인해 주세요.'); }
    if (!response.ok) throw new Error(response.status === 429 ? 'GIPHY 요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.' : `GIPHY 요청에 실패했습니다 (${response.status}). 서버 GIF 설정을 확인해 주세요.`);
    const data = await response.json();
    if (session !== this.client.mediaKey) throw new Error('서버 연결이 변경되었습니다.');
    return data;
  }
  remember(item) {
    if (!/^[a-zA-Z0-9]{1,80}$/.test(item.id)) throw new Error('잘못된 GIF입니다.');
    const original = mediaUrl(item.images?.original?.url || item.images?.fixed_height?.url);
    const preview = mediaUrl(item.images?.fixed_width?.url || original);
    const record = { id: item.id, title: String(item.title || 'GIF').slice(0, 200), original, preview };
    this.items.set(item.id, record);
    if (this.items.size > 1000) this.items.delete(this.items.keys().next().value);
    return { id: record.id, title: record.title, preview: `moyeo-media://${this.client.mediaKey}/giphy/${item.id}/preview` };
  }
  async search(term = '', offset = 0) {
    if (typeof term !== 'string' || term.length > 200 || !Number.isInteger(offset) || offset < 0 || offset > 4999) throw new Error('검색어를 확인해 주세요.');
    const data = await this.api(term.trim() ? 'search' : 'trending', { ...(term.trim() ? { q: term.trim(), lang: 'ko' } : {}), offset: String(offset), limit: '20' });
    return { items: data.data.map(item => this.remember(item)), more: offset + data.data.length < Number(data.pagination?.total_count || 0) };
  }
  async get(id) { if (!/^[a-zA-Z0-9]{1,80}$/.test(id)) throw new Error('잘못된 GIF입니다.'); if (this.items.has(id)) { const item = this.items.get(id); return { id, title: item.title, preview: `moyeo-media://${this.client.mediaKey}/giphy/${id}/preview` }; } const data = await this.api(id); return this.remember(data.data); }
  async response(id) {
    let item = this.items.get(id); if (!item) { await this.get(id); item = this.items.get(id); }
    const response = await this.fetcher(item.preview, { redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) { await response.body?.cancel(); throw new Error('GIF 미리보기를 불러올 수 없습니다.'); }
    return response;
  }
  async responseUrl(address) {
  if (typeof address !== 'string' || address.length > 2048) throw new Error('GIF 주소가 올바르지 않습니다.');
  const response = await this.fetcher(mediaUrl(address), { redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!response.ok || !/^image\/(gif|webp)(?:;|$)/i.test(response.headers.get('content-type') || '')) { await response.body?.cancel(); throw new Error('움직이는 GIF를 불러올 수 없습니다.'); }
  return response;
  }
  async download(id) {
    // Upload the original animated media, preserving its bytes.
    if (!this.items.has(id)) await this.get(id);
    const item = this.items.get(id);
    const response = await this.fetcher(item.original, { redirect: 'error', signal: AbortSignal.timeout(60000) });
    if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) { await response.body?.cancel(); throw new Error('GIF 파일을 가져오지 못했습니다.'); }
    const reader = response.body.getReader(); let size = 0; const chunks = [];
    try { while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.length; if (size > 25 * 1024 * 1024) throw new Error('25MB보다 큰 GIF는 첨부할 수 없습니다.'); chunks.push(Buffer.from(chunk.value)); } }
    finally { await reader.cancel(); }
    return { bytes: Buffer.concat(chunks), size, name: `giphy-${id}.gif`, type: 'image/gif' };
  }
}

module.exports = { GiphyService, mediaUrl };
