const ID = /^[a-z0-9]{26}$/;
const { randomUUID } = require('node:crypto');
function validId(value) {
  if (!ID.test(value)) throw new Error('올바르지 않은 식별자입니다.');
  return value;
}
function normalizeServer(value) {
  const address = String(value || '').trim();
  if (!address) throw new Error('Mattermost 서버 주소를 입력해 주세요.');
  // Internal servers are commonly entered as 192.168.0.10:8065 or localhost:8065.
  const local = /^(localhost|\d{1,3}(?:\.\d{1,3}){3}|\[[a-f\d:]+\])(?=[:/]|$)/i.test(address);
  let url;
  try { url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(address) ? address : `${local ? 'http' : 'https'}://${address}`); }
  catch { throw new Error('서버 주소를 확인해 주세요. 예: http://192.168.0.10:8065'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('http 또는 https 서버 주소를 입력해 주세요.');
  }
  return url.href.replace(/\/$/, '');
}
class MattermostClient {
  constructor(fetcher = fetch) { this.fetcher = fetcher; this.clear(); }
  clear() { this.server = ''; this.token = ''; this.me = null; this.ownedSession = false; this.mediaKey = randomUUID(); }
  async request(path, { method = 'GET', body } = {}) {
    if (!this.server) throw new Error('서버에 먼저 연결해 주세요.');
    let response;
    try { response = await this.fetcher(`${this.server}/api/v4${path}`, {
      method, redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    }); } catch (error) {
      const code = error.cause?.code || error.code || '';
      if (error.name === 'TimeoutError' || error.name === 'AbortError' || code.includes('TIMEOUT')) throw new Error('서버 응답 시간이 초과되었습니다. 서버 주소와 포트, VPN 연결을 확인해 주세요.');
      if (/CERT|TLS|SSL|SELF_SIGNED/.test(code)) throw new Error('서버 인증서를 신뢰할 수 없습니다. 서버 인증서 또는 사내 인증서 설정을 확인해 주세요.');
      if (/ENOTFOUND|EAI_AGAIN/.test(code)) throw new Error('서버 이름을 찾을 수 없습니다. 서버 주소나 사내 DNS/VPN 연결을 확인해 주세요.');
      if (/ECONNREFUSED/.test(code)) throw new Error('서버가 연결을 거부했습니다. 서버 주소와 포트, Mattermost 실행 상태를 확인해 주세요.');
      throw new Error('서버에 연결할 수 없습니다. 서버 주소와 포트, 네트워크/VPN 연결을 확인해 주세요.');
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(data.message || `서버 요청에 실패했습니다 (${response.status}).`); error.status = response.status; throw error; }
    return { data, headers: response.headers };
  }
  async connect({ server, login, password, mfa, token }) {
    this.clear();
    this.server = normalizeServer(server);
    try {
      if (token) { this.token = token.trim(); }
      else {
        const result = await this.request('/users/login', { method: 'POST', body: { login_id: login, password, ...(mfa ? { token: mfa } : {}) } });
        this.token = result.headers.get('token');
        this.ownedSession = true;
        if (!this.token) throw new Error('로그인 토큰을 받지 못했습니다. 서버 설정을 확인해 주세요.');
      }
      this.me = (await this.request('/users/me')).data;
      return this.withAvatar(this.me);
    } catch (error) { this.clear(); throw error; }
  }
  async channels() {
    return (await this.request(`/users/me/channels?page=0&per_page=200`)).data;
  }
  withAvatar(user) {
    return { ...user, avatar_url: `moyeo-media://${this.mediaKey}/avatars/${validId(user.id)}/${Math.max(0, Number(user.last_picture_update) || 0)}` };
  }
  async avatarResponse(id, signal) {
    if (!this.server || !this.token) throw new Error('서버에 먼저 연결해 주세요.');
    return this.fetcher(`${this.server}/api/v4/users/${validId(id)}/image`, {
      headers: { Authorization: `Bearer ${this.token}` }, redirect: 'error',
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000)
    });
  }
  async teams() { return (await this.request('/users/me/teams')).data; }
  async favorites() {
    const preferences = (await this.request('/users/me/preferences')).data;
    return preferences.filter(p => p.category === 'favorite_channel' && p.value === 'true').map(p => p.name);
  }
  async setFavorite(id, enabled) {
    if (!this.me) throw new Error('서버에 먼저 연결해 주세요.');
    if (typeof enabled !== 'boolean') throw new Error('즐겨찾기 설정값이 올바르지 않습니다.');
    return (await this.request('/users/me/preferences', { method: 'PUT', body: [{ user_id: this.me.id, category: 'favorite_channel', name: validId(id), value: String(enabled) }] })).data;
  }
  async users(ids) {
    if (!Array.isArray(ids) || ids.length > 200) throw new Error('사용자 요청 범위를 초과했습니다.');
    ids.forEach(validId);
    if (!ids.length) return [];
    return (await this.request('/users/ids', { method: 'POST', body: ids })).data.map(user => this.withAvatar(user));
  }
  async posts(id, before) {
    return (await this.request(`/channels/${validId(id)}/posts?per_page=60${before ? `&before=${validId(before)}` : ''}`)).data;
  }
  async searchContent(options={}) {
    const {terms,page=0,mode='posts',team='',or=false,archived=false,timeZoneOffset=0}=options;
    if(typeof terms!=='string'||!terms.trim()||terms.length>2000||!Number.isInteger(page)||page<0||page>1000||!['posts','files'].includes(mode)||typeof or!=='boolean'||typeof archived!=='boolean'||!Number.isInteger(timeZoneOffset)||Math.abs(timeZoneOffset)>86400)throw Error('검색 조건을 확인해 주세요.');
    if(team)validId(team);
    const body={terms:terms.trim(),page,per_page:60,is_or_search:or,include_deleted_channels:archived,time_zone_offset:timeZoneOffset};
    const route=team?`/teams/${team}/${mode}/search`:`/${mode}/search`;
    try{return (await this.request(route,{method:'POST',body})).data;}
    catch(error){
      if(team||![404,405,501].includes(error.status))throw error;
      const teams=await this.teams();
      if(!teams.length)throw error;
      const results=await Promise.allSettled(teams.map(item=>this.request(`/teams/${validId(item.id)}/${mode}/search`,{method:'POST',body}).then(result=>result.data)));
      const values=results.filter(result=>result.status==='fulfilled').map(result=>result.value);
      if(!values.length)throw results.find(result=>result.status==='rejected').reason;
      if(mode==='posts'){const posts=Object.assign({},...values.map(result=>result.posts||{})),matches=Object.assign({},...values.map(result=>result.matches||{}));return {posts,matches,order:Object.keys(posts).sort((a,b)=>posts[b].create_at-posts[a].create_at),partial:values.length<teams.length};}
      const infos=Object.assign({},...values.map(result=>result.file_infos||{}));return {file_infos:infos,order:Object.keys(infos).sort((a,b)=>infos[b].create_at-infos[a].create_at),partial:values.length<teams.length};
    }
  }
  async mentionUsers(channel,term='',team='') {
    validId(channel);if(team)validId(team);
    if(typeof term!=='string'||term.length>100)throw Error('추천할 계정 이름을 확인해 주세요.');
    const query=new URLSearchParams({in_channel:channel,name:term,limit:'20',...(team?{in_team:team}:{})});
    const data=(await this.request('/users/autocomplete?'+query)).data;
    return {users:(data.users||[]).map(user=>this.withAvatar(user)),out_of_channel:(data.out_of_channel||[]).map(user=>this.withAvatar(user))};
  }
  async fileInfo(id) {
    const info = (await this.request(`/files/${validId(id)}/info`)).data;
    return { ...info, id, url: `moyeo-media://${this.mediaKey}/${id}/original`, thumbnail: `moyeo-media://${this.mediaKey}/${id}/thumbnail`, preview: `moyeo-media://${this.mediaKey}/${id}/preview` };
  }
  async fileResponse(id, variant = 'original', range, signal) {
    validId(id);
    if (!['original', 'thumbnail', 'preview'].includes(variant)) throw new Error('지원하지 않는 미디어 요청입니다.');
    if (!this.token || !this.server) throw new Error('서버에 먼저 연결해 주세요.');
    if (range && !/^bytes=\d*-\d*$/.test(range)) throw new Error('올바르지 않은 미디어 범위입니다.');
    const headers = { Authorization: `Bearer ${this.token}` };
    if (range) headers.Range = range;
    return this.fetcher(`${this.server}/api/v4/files/${id}${variant === 'original' ? '' : `/${variant}`}`, {
      headers, redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120000)]) : AbortSignal.timeout(120000)
    });
  }
  async send(id, message, fileIds = [], rootId = '') {
    if (!Array.isArray(fileIds) || fileIds.length > 10) throw new Error('한 메시지에 최대 10개 파일을 보낼 수 있습니다.');
    fileIds.forEach(validId);
    if (typeof message !== 'string' || (!message.trim() && !fileIds.length) || message.length > 16000) throw new Error('메시지 또는 첨부 파일을 입력해 주세요. 텍스트는 16,000자까지 보낼 수 있습니다.');
    return (await this.request('/posts', { method: 'POST', body: { channel_id: validId(id), message, ...(fileIds.length ? { file_ids: fileIds } : {}), ...(rootId ? { root_id: validId(rootId) } : {}) } })).data;
  }
  async post(id) { return (await this.request(`/posts/${validId(id)}`)).data; }
  async resolvePostLink(address) {
    let url; try { url = new URL(address); } catch { return null; }
    if (!this.server || url.username || url.password) return null;
    const server = new URL(this.server), base = server.pathname.replace(/\/$/, '');
    if (url.origin !== server.origin || !url.pathname.startsWith(base + '/')) return null;
    const match = /^\/(?:[^/]+\/)?pl\/([a-z0-9]{26})\/?$/.exec(url.pathname.slice(base.length));
    if (!match) return null;
    const post = await this.post(match[1]);
    if (post.delete_at) throw new Error('삭제된 메시지입니다.');
    const channelId = validId(post.channel_id);
    const [channel, before, after] = await Promise.all([
      this.request(`/channels/${channelId}`).then(result => result.data),
      this.request(`/channels/${channelId}/posts?before=${post.id}&per_page=30`).then(result => result.data),
      this.request(`/channels/${channelId}/posts?after=${post.id}&per_page=30`).then(result => result.data)
    ]);
    return { post, channel, posts: [...new Map([...Object.values(before.posts), post, ...Object.values(after.posts)].filter(item => item.channel_id === channelId && !item.delete_at).map(item => [item.id,item])).values()] };
  }
  async reactions(id) { const data = (await this.request(`/posts/${validId(id)}/reactions`)).data; if (data === null) return []; if (!Array.isArray(data)) throw new Error('반응 목록을 읽을 수 없습니다.'); return data; }
  async setReaction(id, name, enabled) {
    validId(id);
    if (!this.me) throw new Error('먼저 로그인해 주세요.');
    if (typeof name !== 'string' || !/^[a-zA-Z0-9_+-]{1,64}$/.test(name) || typeof enabled !== 'boolean') throw new Error('올바르지 않은 이모지 반응입니다.');
    if (enabled) return (await this.request('/reactions', { method: 'POST', body: { post_id: id, user_id: this.me.id, emoji_name: name } })).data;
    return (await this.request(`/users/${validId(this.me.id)}/posts/${id}/reactions/${encodeURIComponent(name)}`, { method: 'DELETE' })).data;
  }
  async thread(id) { return (await this.request(`/posts/${validId(id)}/thread`)).data; }
  async editPost(id, message) {
    const post = await this.post(id);
    if (post.user_id !== this.me?.id) throw new Error('내 메시지만 수정할 수 있습니다.');
    if (typeof message !== 'string' || message.length > 16000 || (!message.trim() && !post.file_ids?.length)) throw new Error('수정할 내용을 입력해 주세요.');
    return (await this.request(`/posts/${validId(id)}/patch`, { method: 'PUT', body: { message } })).data;
  }
  async deletePost(id) {
    const post = await this.post(id);
    if (post.user_id !== this.me?.id) throw new Error('내 메시지만 삭제할 수 있습니다.');
    return (await this.request(`/posts/${validId(id)}`, { method: 'DELETE' })).data;
  }
  postLink(id) { validId(id); if (!this.me) throw new Error('먼저 로그인해 주세요.'); return `${this.server}/_redirect/pl/${id}`; }
  async sharePost(id, channel) {
    const post = await this.post(id);
    const message = `**공유된 메시지**\n${(post.message || '(첨부 파일 메시지)').slice(0, 14000).split('\n').map(line => `> ${line}`).join('\n')}\n${post.file_ids?.length ? `첨부 ${post.file_ids.length}개는 원문에서 확인하세요.\n` : ''}[원본 메시지 보기](${this.postLink(id)})`;
    return this.send(channel, message);
  }
  async multipart(path, form) {
    if (!this.token) throw new Error('먼저 로그인해 주세요.');
    const response = await this.fetcher(`${this.server}/api/v4${path}`, { method: 'POST', redirect: 'error', headers: { Authorization: `Bearer ${this.token}` }, body: form, signal: AbortSignal.timeout(600000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `업로드에 실패했습니다 (${response.status}).`);
    return data;
  }
  async upload(channel, name, blob) {
    const form = new FormData(); form.set('channel_id', validId(channel)); form.set('files', blob, name);
    const data = await this.multipart('/files', form);
    if (!data.file_infos?.[0]?.id) throw new Error('업로드한 파일 정보를 받지 못했습니다.');
    return data.file_infos[0];
  }
  withEmojiImage(emoji) { return { ...emoji, image_url: `moyeo-media://${this.mediaKey}/emojis/${validId(emoji.id)}` }; }
  async emojiList(page = 0) {
    if (!Number.isInteger(page) || page < 0 || page > 1000) throw new Error('잘못된 이모지 페이지입니다.');
    return (await this.request(`/emoji?page=${page}&per_page=200&sort=name`)).data.map(emoji => this.withEmojiImage(emoji));
  }
  async emojiResponse(id, signal) {
    if (!this.token) throw new Error('먼저 로그인해 주세요.');
    return this.fetcher(`${this.server}/api/v4/emoji/${validId(id)}/image`, { headers: { Authorization: `Bearer ${this.token}` }, redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) });
  }
  async createEmoji(name, blob) {
    const form = new FormData(); form.set('emoji', JSON.stringify({ name, creator_id: this.me.id })); form.set('image', blob, `${name}.png`);
    return this.withEmojiImage(await this.multipart('/emoji', form));
  }
  async searchUsers(term) {
    if (typeof term !== 'string' || term.trim().length < 2) return [];
    return (await this.request('/users/search', { method: 'POST', body: { term: term.trim(), limit: 30 } })).data.map(user => this.withAvatar(user));
  }
  async direct(userId) {
    return (await this.request('/channels/direct', { method: 'POST', body: [this.me.id, validId(userId)] })).data;
  }
  async view(id) {
    return (await this.request('/channels/members/me/view', { method: 'POST', body: { channel_id: validId(id) } })).data;
  }
  async disconnect() {
    try { if (this.token && this.ownedSession) await this.request('/users/logout', { method: 'POST' }); }
    finally { this.clear(); }
  }
}
module.exports = { MattermostClient, normalizeServer, validId };
