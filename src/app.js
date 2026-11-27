/* The renderer only uses the narrow, context-isolated preload bridge. */
const $ = (selector, root = document) => root.querySelector(selector);
const root = $('#app');
const api = window.messenger;
const isFloating = new URLSearchParams(location.search).has('floating');
document.body.classList.toggle('floating',isFloating);
api?.onAccountLogout(()=>logout());
api?.onAccountCleared(()=>logout(true));
const state = { demo: false, me: null, channels: [], users: {}, posts: [], selected: null, filter: 'all', search: '', settings: { name: '모여', accent: '#fee34a', chatBackground: '#e8eef3' }, drafts: {}, previews: {}, unread: {}, polling: false, generation: 0, hasMore: true };
Object.assign(state, { teams: {}, favorites: new Set(), favoritePending: new Set(), favoritesReady: false, ready: false });
const icons = {
  chat: '<path d="M20 11a8 8 0 0 1-8 8H8l-5 3 1-6a8 8 0 1 1 16-5Z"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2m2-15a3 3 0 0 1 0 6m2 9v-2a6 6 0 0 0-2-4"/>',
  settings: '<path d="m10 3-1 3-3 1-3 3 2 2-1 4 3 3 3-1 2 3 4-1 1-3 3-2-1-4 1-3-3-2-3 1-2-2Z"/><circle cx="12" cy="12" r="3"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  logout: '<path d="M10 4H4v16h6m5-12 4 4-4 4m-7-4h11"/>',
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8 14a4 4 0 0 0 8 0M8 9h.1M16 9h.1"/>',
  refresh: '<path d="M20 8a8 8 0 1 0 0 8m0-13v5h-5"/>',
  arrow: '<path d="m9 5 7 7-7 7"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/>',
  attach: '<path d="m8 13 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l9-9m-6 12 7-7"/>'
};
icons.lock = '<rect x="5.5" y="10" width="13" height="10" rx="2.5"/><path d="M8.5 10V7a3.5 3.5 0 0 1 7 0v3m-3.5 4v2"/>';
icons.moon = '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>';
icons.sun = '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/>';
icons.hash = '<path d="m10 4-3 16M17 4l-3 16M5 9h15M4 15h15"/>';
icons.palette = '<path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-.9 2-1.8 0-1.5-1.1-1.7-1.1-3 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4c0-4.2-4-7.5-9-7.5Z"/><path d="M7.5 12h.1M9.5 8h.1M14 7.5h.1"/>';
icons.popout = '<path d="M14 5h5v5M19 5l-8 8M11 6H6a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-5"/>';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = key => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[key] || icons.chat}</svg>`;
const imageOrIcon = (key, fallback) => state.settings[key] ? `<img src="${esc(state.settings[key])}" alt="">` : key === 'logo' ? '<img class="default-brand" src="assets/icons/brand.svg" alt="">' : icon(fallback);
const brand = () => `<div class="brand"><span class="brandmark">${imageOrIcon('logo', 'chat')}</span><span>${esc(state.settings.name)}</span></div>`;
const displayName = user => user ? (user.nickname?.trim() || user.username || [user.first_name, user.last_name].filter(Boolean).join(' ')) : '알 수 없는 사용자';
const avatar = (name, color = 0, small = false) => `<span class="avatar color-${color % 5}${small ? ' small' : ''}" aria-hidden="true">${esc([...name][0] || '?')}</span>`;
function accountAvatar(id, small = false) {
  const user = state.users[id] || (state.me?.id === id ? state.me : null), name = displayName(user);
  const color = [...String(id)].reduce((sum, c) => sum + c.codePointAt(0), 0) % 5;
  return `<span class="avatar account-avatar color-${color}${small ? ' small' : ''}" data-profile="${esc(id)}" role="button" tabindex="0" aria-label="${esc(name)} 프로필 보기" title="${esc(name)} 프로필 보기"><span aria-hidden="true">${esc([...name][0] || '?')}</span>${user?.avatar_url ? `<img data-avatar="${esc(id)}" src="${esc(user.avatar_url)}" alt="${esc(name)} 프로필" loading="lazy">` : ''}${small&&id===state.me?.id?userStatus.badge(user):''}</span>`;
}
function directUserId(channel) { return (channel.name || '').split('__').find(id => id !== state.me.id) || state.me.id; }
function conversationAvatar(channel, small = false) {
  if (channel.type === 'D') return accountAvatar(directUserId(channel), small);
  const label = channel.type === 'G' ? '그룹 대화' : channel.type === 'P' ? '비공개 채널' : '공개 채널';
  const name = channelName(channel), initial = [...name.replace(/^[#@\s]+/, '')][0] || '#';
  const tone = [...String(channel.id || name)].reduce((sum, letter) => sum * 31 + letter.codePointAt(0) >>> 0, 0) % 6;
  return `<span class="avatar channel-avatar channel-tone-${tone} channel-type-${esc(String(channel.type || 'O').toLowerCase())}${small ? ' small' : ''}" title="${esc(name)} · ${label}" aria-hidden="true"><span class="channel-monogram">${esc(initial.toLocaleUpperCase())}</span><span class="channel-type-badge">${icon(channel.type === 'G' ? 'people' : channel.type === 'P' ? 'lock' : 'hash')}</span></span>`;
}
document.addEventListener('error', event => { if (event.target.matches?.('img[data-avatar]')) event.target.remove(); }, true);
const clock = value => value ? new Date(value).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '';
let toastTimer;
function toast(message) { const el = $('#toast'); el.textContent = message; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 4500); }
const themeQuery = matchMedia('(prefers-color-scheme: dark)');
const DEFAULT_CHAT_BACKGROUND = '#e8eef3';
function activeTheme() { const choice = state.settings.theme || 'system'; return choice === 'system' ? (themeQuery.matches ? 'dark' : 'light') : choice; }
async function setTheme(choice) {
  try { state.settings = api ? await api.saveSettings({ theme: choice }) : { ...state.settings, theme: choice }; }
  catch (error) { toast(error.message); return; }
  applySettings();
}
function paintThemeToggle() {
  const button = $('#theme-toggle'); if (!button) return;
  const dark = activeTheme() === 'dark', label = dark ? '라이트 모드로 전환' : '다크 모드로 전환';
  button.innerHTML = icon(dark ? 'sun' : 'moon'); button.title = label; button.setAttribute('aria-label', label);
}
themeQuery.addEventListener('change', () => applySettings());
api?.onTheme?.(theme => { state.settings.theme = theme; applySettings(); });
function applySettings() {
  const dark = activeTheme() === 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.style.setProperty('--accent', state.settings.accent);
  // A chat background the user never changed follows the theme; a chosen color is kept as is.
  document.documentElement.style.setProperty('--chat-background', dark && String(state.settings.chatBackground).toLowerCase() === DEFAULT_CHAT_BACKGROUND ? '#14161a' : state.settings.chatBackground);
  paintThemeToggle();
  if (typeof personal !== 'undefined' && $('#chat-pane')) personal.apply();
  const hex = state.settings.accent.slice(1);
  const rgb = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
  document.documentElement.style.setProperty('--accent-ink', (rgb[0] * .299 + rgb[1] * .587 + rgb[2] * .114) > 150 ? '#302b16' : '#ffffff');
  document.title = `${state.settings.name} · Mattermost`;
}
function renderLogin() {
  root.innerHTML = `<main class="login-page"><section class="login-story">${brand()}<div><p class="eyebrow">A LITTLE CLOSER, TOGETHER</p><h1>일하는 사이도,<br>대화는 편하게.</h1><p class="intro">익숙한 메신저의 편안함으로<br>우리 팀의 이야기를 이어가세요.</p><div class="sample"><div class="sample-line">${avatar('지은', 1, true)}<div class="sample-bubble">새로운 아이디어가 떠올랐어요 💡<br>잠깐 이야기 나눌까요?</div></div><div class="sample-line right"><div class="sample-bubble">좋아요! 여기서 함께 이야기해요.</div></div></div></div><small>YOUR TEAM. YOUR SPACE. &nbsp; Powered by Mattermost</small></section><section class="login-form-wrap"><form class="login-form"><h2>반가워요 👋</h2><p>사용 중인 Mattermost 서버에 연결하세요.</p><label class="field"><span>서버 주소</span><input name="server" type="url" placeholder="https://mattermost.company.com" required></label><div class="mode-select"><button type="button" class="active" data-mode="password">계정 로그인</button><button type="button" data-mode="token">액세스 토큰</button></div><div id="credentials"><label class="field"><span>이메일 또는 아이디</span><input name="login" autocomplete="username" required placeholder="name@company.com"></label><label class="field"><span>비밀번호</span><input name="password" type="password" autocomplete="current-password" required placeholder="비밀번호 입력"></label><label class="field"><span>인증 코드 <small>(MFA 사용 시)</small></span><input name="mfa" inputmode="numeric" autocomplete="one-time-code" placeholder="선택 사항"></label></div><p class="error" role="alert" id="login-error"></p><button class="primary" type="submit">연결하기</button><div class="or">먼저 둘러보고 싶다면</div><button type="button" class="demo-btn" id="demo-start">데모로 체험하기 →</button><div style="text-align:center;margin-top:20px"><button type="button" class="text-btn" id="login-settings">${icon('settings')} 화면 및 브랜드 설정</button></div></form></section></main>`;
  const form = $('.login-form');
  // Chromium's native validation bubbles are easy to miss in desktop windows.
  // Validate explicitly so every click produces visible feedback in the page.
  form.noValidate = true;
  form.elements.server.type = 'text';
  form.elements.server.inputMode = 'url';
  $('#login-error').insertAdjacentHTML('beforebegin', '<p id="login-progress" class="muted" role="status" aria-live="polite"></p>');
  $('#login-progress').insertAdjacentHTML('beforebegin', `<label class="sound-setting"><input type="checkbox" id="remember-login" ${state.settings.autoLogin !== false ? 'checked' : ''}> 로그인 기억 · 다음 실행 시 자동 로그인</label>`);
  let mode = 'password', connecting = false;
  document.querySelectorAll('[data-mode]').forEach(button => button.onclick = () => {
    mode = button.dataset.mode;
    document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('active', b === button));
    $('#credentials').innerHTML = mode === 'token' ? '<label class="field"><span>개인 액세스 토큰</span><input type="password" name="token" autocomplete="off" required placeholder="Mattermost에서 발급한 토큰"></label><small>SSO 계정은 관리자가 허용한 개인 액세스 토큰을 사용하세요.</small>' : '<label class="field"><span>이메일 또는 아이디</span><input name="login" autocomplete="username" required></label><label class="field"><span>비밀번호</span><input name="password" type="password" autocomplete="current-password" required></label><label class="field"><span>인증 코드 (선택)</span><input name="mfa" inputmode="numeric" autocomplete="one-time-code"></label>';
  });
  $('.login-form').onsubmit = async event => {
    event.preventDefault();
    if (connecting) return;
    const data = Object.fromEntries(new FormData(form));
    data.remember = $('#remember-login').checked;
    data.server = data.server.trim();
    if (data.login) data.login = data.login.trim();
    const missing = !data.server ? ['server', 'Mattermost 서버 주소를 입력해 주세요.']
      : mode === 'token' && !data.token?.trim() ? ['token', '개인 액세스 토큰을 입력해 주세요.']
      : mode === 'password' && !data.login ? ['login', '이메일 또는 아이디를 입력해 주세요.']
      : mode === 'password' && !data.password ? ['password', '비밀번호를 입력해 주세요.'] : null;
    $('#login-error').textContent = '';
    if (missing) { $('#login-error').textContent = missing[1]; form.elements[missing[0]].focus(); return; }
    connecting = true;
    const controls = [...form.querySelectorAll('input, button')];
    controls.forEach(control => { control.disabled = true; });
    const button = $('button[type="submit"]'); button.textContent = '연결 중…';
    $('#login-progress').textContent = '서버에 연결하고 있습니다. 응답은 최대 20초 정도 걸릴 수 있습니다.';
    try {
      if (!api) throw new Error('실제 서버 연결은 데스크톱 앱에서 사용할 수 있습니다.');
      state.me = await api.connect(data);
      state.settings = await api.getSettings();
      state.users[state.me.id] = state.me;
      state.demo = false; state.generation++;
      $('#login-progress').textContent = '로그인되었습니다. 대화 목록을 불러오고 있습니다…';
      await refreshChannels();
      await loadNavigation();
      await personal.load();
      incoming.start();
      event.target.reset(); renderShell();
      if (state.channels.length) await selectChannel(state.channels[0].id);
    } catch (error) {
      state.me = null;
      $('#login-progress').textContent = '';
      $('#login-error').textContent = error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
      // Display the error before waiting for a server-side session cleanup.
      await api?.disconnect().catch(() => {});
    }
    finally { connecting = false; controls.forEach(control => { control.disabled = false; }); button.textContent = '연결하기'; }
  };
  $('#demo-start').onclick = startDemo;
  $('#login-settings').onclick = openSettings;
}
function startDemo() {
  state.demo = true; state.generation++;
  state.me = { id: 'me', username: '나', first_name: '나' };
  state.users = { me: state.me, jieun: { id: 'jieun', first_name: '김지은', username: 'jieun' }, minsu: { id: 'minsu', first_name: '박민수', username: 'minsu' }, seoyeon: { id: 'seoyeon', first_name: '이서연', username: 'seoyeon' } };
  Object.values(state.users).forEach(user => { user.nickname = user.first_name; });
  state.teams = {}; state.favorites = new Set(); state.favoritesReady = true;
  const now = Date.now();
  state.channels = [
    { id: 'design', display_name: '프로덕트 디자인', type: 'G', header: '좋은 경험을 함께 만드는 사람들', last_post_at: now },
    { id: 'jieun', name: 'me__jieun', display_name: '', type: 'D', last_post_at: now - 120000 },
    { id: 'lounge', display_name: '우리 팀 라운지', type: 'O', header: '가벼운 인사부터 새로운 소식까지', last_post_at: now - 600000 },
    { id: 'minsu', name: 'me__minsu', display_name: '', type: 'D', last_post_at: now - 3600000 },
    { id: 'release', display_name: '서비스 출시 준비', type: 'P', last_post_at: now - 7200000 }
  ];
  state.demoPosts = {
    design: [
      { id: 'd1', user_id: 'jieun', message: '좋은 아침이에요! ☀️\n오늘 새로운 메신저 화면 같이 살펴볼까요?', create_at: now - 600000 },
      { id: 'd2', user_id: 'minsu', message: '좋아요. 채팅 목록이 한눈에 들어와서 편하네요.', create_at: now - 500000 },
      { id: 'd3', user_id: 'me', message: '맞아요! 익숙한 말풍선 형태로 구성했어요.\n로고랑 아이콘도 설정에서 바꿀 수 있어요 ✨', create_at: now - 400000 },
      { id: 'd4', user_id: 'jieun', message: '우리 팀 색상으로 바꾸면 더 좋겠어요 😊', create_at: now - 300000 },
      { id: 'd5', user_id: 'me', message: '왼쪽 아래 설정에서 바로 바꿔보세요!', create_at: now - 200000 }
    ],
    jieun: [{ id: 'j1', user_id: 'jieun', message: '오후 회의는 3시에 시작해요. 이따 봬요!', create_at: now - 120000 }],
    lounge: [{ id: 'l1', user_id: 'seoyeon', message: '오늘도 즐거운 하루 보내세요 🌿', create_at: now - 600000 }],
    minsu: [{ id: 'm1', user_id: 'minsu', message: '공유해 주신 내용 확인했어요. 감사합니다!', create_at: now - 3600000 }],
    release: [{ id: 'r1', user_id: 'seoyeon', message: '출시 일정은 다음 주에 함께 정리해요.', create_at: now - 7200000 }]
  };
  state.unread = { jieun: 1, lounge: 2 };
  state.previews = Object.fromEntries(Object.entries(state.demoPosts).map(([id, posts]) => [id, posts.at(-1).message]));
  renderShell(); selectChannel('design');
}
function channelName(channel) {
  if (channel.type === 'D') return displayName(state.users[directUserId(channel)]);
  return channel.display_name || channel.name || '대화';
}
async function hydrateUsers(ids, refresh = false) {
  const epoch = state.generation;
  const missing = [...new Set(ids)].filter(id => id && (refresh || !state.users[id]));
  for (let i = 0; i < missing.length; i += 200) {
    const users = await api.users(missing.slice(i, i + 200));
    if (epoch !== state.generation) return;
    for (const user of users) state.users[user.id] = user;
  }
}
async function refreshChannels() {
  const epoch = state.generation;
  const channels = (await api.channels()).filter(c => !c.delete_at);
  await hydrateUsers(channels.filter(c => c.type === 'D').flatMap(c => c.name.split('__')));
  if (epoch !== state.generation) return;
  state.channels = channels.sort((a, b) => b.last_post_at - a.last_post_at);
  // Counts arrive separately so a slow or unsupported endpoint never delays the room list.
  unreads.loadStatus();
  unreads.load().then(() => { if (epoch === state.generation && $('#channel-list')) renderChannelList(); });
}
async function loadNavigation() {
  const epoch = state.generation;
  const [teams, favorites] = await Promise.allSettled([api.teams(), api.favorites()]);
  if (epoch !== state.generation) return;
  if (teams.status === 'fulfilled') state.teams = Object.fromEntries(teams.value.map(team => [team.id, team]));
  if (favorites.status === 'fulfilled') { state.favorites = new Set(favorites.value); state.favoritesReady = true; }
  else toast('즐겨찾기를 불러오지 못했습니다. 별을 누르면 다시 시도합니다.');
}
function favoriteButton(channel, header = false) {
  const saved = state.favorites.has(channel.id), label = `${channelName(channel)} 즐겨찾기 ${saved ? '해제' : '추가'}`;
  return `<button class="icon-btn favorite-toggle ${saved ? 'saved' : ''} ${header ? 'header-favorite' : ''}" data-favorite="${esc(channel.id)}" aria-pressed="${saved}" aria-label="${esc(label)}" title="${esc(label)}" ${state.favoritePending.has(channel.id) ? 'disabled' : ''}>${icon('star')}</button>`;
}
function bindFavorites() {
  document.querySelectorAll('[data-favorite]').forEach(button => button.onclick = () => toggleFavorite(button.dataset.favorite));
}
async function toggleFavorite(id) {
  if (state.favoritePending.has(id)) return;
  const epoch = state.generation;
  state.favoritePending.add(id); refreshFavoriteButtons();
  try {
    if (!state.favoritesReady && !state.demo) { const saved = await api.favorites(); if (epoch !== state.generation) return; state.favorites = new Set(saved); state.favoritesReady = true; }
    const enabled = !state.favorites.has(id);
    if (!state.demo) await api.setFavorite(id, enabled);
    if (epoch !== state.generation) return;
    if (enabled) state.favorites.add(id); else state.favorites.delete(id);
    toast(enabled ? '즐겨찾기에 추가했습니다.' : '즐겨찾기에서 해제했습니다.');
  } catch (error) { if (epoch === state.generation) toast(`즐겨찾기를 저장하지 못했습니다. ${error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')}`); }
  finally { if (epoch === state.generation) { state.favoritePending.delete(id); renderChannelList(); refreshFavoriteButtons(); } }
}
function refreshFavoriteButtons() {
  document.querySelectorAll('[data-favorite]').forEach(button => {
    const channel = state.channels.find(c => c.id === button.dataset.favorite);
    if (channel) button.outerHTML = favoriteButton(channel, button.classList.contains('header-favorite'));
  });
  bindFavorites();
}
function renderShell() {
  root.innerHTML = `<main class="shell"><aside class="rail" aria-label="주 메뉴"><span class="brandmark" title="${esc(state.settings.name)}">${imageOrIcon('logo', 'chat')}</span><nav class="rail-nav"><button class="nav-button" id="nav-people" title="사용자 찾기">${imageOrIcon('peopleIcon', 'people')}<span>사람</span></button><button class="nav-button active" id="nav-chats" title="채팅 목록">${imageOrIcon('chatIcon', 'chat')}<span>채팅</span></button></nav><div class="rail-bottom"><button class="icon-btn" id="theme-toggle"></button><button class="nav-button" id="nav-settings" title="설정">${imageOrIcon('settingsIcon', 'settings')}<span>설정</span></button><button class="icon-btn" id="logout" title="${state.demo ? '데모 나가기' : '로그아웃'}" aria-label="로그아웃">${icon('logout')}</button>${avatar(displayName(state.me), 3, true)}</div></aside><section class="conversation-list"><header class="list-head"><div class="heading-row"><h1>채팅<span>${state.channels.length}</span></h1><button class="icon-btn" id="new-chat" title="새 개인 대화" aria-label="새 개인 대화">${icon('plus')}</button></div><div class="search">${icon('search')}<input id="channel-search" placeholder="대화방, 이름 검색" aria-label="대화방 검색" value="${esc(state.search)}"></div><div class="tabs"><button class="tab ${state.filter === 'all' ? 'active' : ''}" data-filter="all">전체</button><button class="tab ${state.filter === 'direct' ? 'active' : ''}" data-filter="direct">개인</button><button class="tab ${state.filter === 'group' ? 'active' : ''}" data-filter="group">그룹 · 채널</button></div></header><div class="list-scroll" id="channel-list"></div><footer class="list-footer"><span class="status-dot"></span><span id="connection-label">${state.demo ? '데모 공간 · 서버 연결 없음' : '실시간 연결됨'}</span></footer></section><section class="chat-pane" id="chat-pane"></section></main>`;
  state.ready = true;
  $('.rail-bottom > .avatar').outerHTML = accountAvatar(state.me.id, true);
  $('.tabs').innerHTML = [['all', '전체'], ['channel', '채널'], ['direct', 'DM'], ['group', '그룹'], ['favorite', '★']].map(([key, label]) => `<button class="tab ${state.filter === key ? 'active' : ''}" data-filter="${key}" aria-label="${key === 'favorite' ? '즐겨찾기만 보기' : label}">${label}</button>`).join('');
  $('#theme-toggle').onclick = () => setTheme(activeTheme() === 'dark' ? 'light' : 'dark'); paintThemeToggle();
  $('#nav-settings').onclick = openSettings;
  $('#new-chat').onclick = $('#nav-people').onclick = openPeople;
  $('#nav-chats').onclick = () => $('#channel-search').focus();
  $('#logout').onclick = logout;
  $('#channel-search').oninput = event => { state.search = event.target.value; renderChannelList(); };
  document.querySelectorAll('[data-filter]').forEach(button => button.onclick = () => {
    state.filter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(b => b.classList.toggle('active', b === button));
    renderChannelList();
  });
  rooms.mountShell();
  renderChannelList(); renderChat(); incoming.render();
}
let channelListView = '';
function renderChannelList() {
  const list = $('#channel-list'); if (!list) return;
  const view = JSON.stringify([state.generation, state.filter, state.search]);
  const oldTop = view === channelListView ? list.scrollTop : 0;
  channelListView = view;
  const focused = list.contains(document.activeElement) ? document.activeElement : null;
  const focusKey = focused?.dataset.favorite ? ['favorite', focused.dataset.favorite] : focused?.dataset.channel ? ['channel', focused.dataset.channel] : null;
  const channels = state.channels.filter(c => (state.filter === 'all' || (state.filter === 'favorite' ? state.favorites.has(c.id) : state.filter === 'direct' ? c.type === 'D' : state.filter === 'group' ? c.type === 'G' : ['O', 'P'].includes(c.type))) && `${channelName(c)} ${c.type === 'D' ? state.users[directUserId(c)]?.username || '' : ''}`.toLowerCase().includes(state.search.toLowerCase()));
  const renderRow = (c, showTeam) => {
    const name = channelName(c);
    const account = c.type === 'D' ? state.users[directUserId(c)] : null;
    const teamLabel = ['O', 'P'].includes(c.type) ? state.teams[c.team_id]?.display_name : '';
    const rawPreview = RichText.preview(state.previews[c.id] || c.header || '');
    const preview = /^(?:비공개 채널|공개 채널|그룹 대화|개인 DM)$/.test(rawPreview) ? '' : rawPreview;
    const kind = c.type === 'P' ? '비공개 채널' : c.type === 'O' ? '공개 채널' : c.type === 'G' ? '그룹 대화' : '개인 DM';
    const context = account && !preview ? `@${account.username}` : showTeam && teamLabel ? teamLabel : '';
    const date = new Date(c.last_post_at), validDate = c.last_post_at && Number.isFinite(date.getTime());
    const time = validDate ? date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
    return `<div class="conversation-row ${state.selected === c.id ? 'is-selected' : ''} ${state.unread[c.id] || unreads.any(c.id) ? 'has-unread' : ''} ${unreads.level(c.id) === 'mute' ? 'is-muted' : ''}"><button class="chat-row ${state.selected === c.id ? 'selected' : ''}" data-channel="${esc(c.id)}" aria-pressed="${state.selected === c.id}" aria-description="${kind}">${conversationAvatar(c)}<span class="summary"><span class="row-heading"><span class="row-title" title="${esc(name)}">${account?userStatus.name(account):esc(name)}${unreads.level(c.id) === 'mute' ? '<span class="row-muted" title="알림 끔" aria-label="알림 끔">🔕</span>' : ''}</span><time class="row-time" ${validDate ? `datetime="${date.toISOString()}" title="${esc(date.toLocaleString('ko-KR'))}"` : ''}>${time}</time></span>${context || preview || state.unread[c.id] || unreads.any(c.id) ? `<span class="row-detail">${context ? `<span class="row-context ${account ? 'is-account' : ''}" title="${esc(context)}">${esc(context)}</span>` : ''}${preview ? `<span class="row-preview" title="${esc(preview)}">${esc(preview)}</span>` : ''}${unreads.badge(c.id)}</span>` : ''}</span></button>${favoriteButton(c)}</div>`;
  };
  const sections = [];
  const append = (label, items, key) => {
    if (!items.length) return;
    const symbol = key === 'favorites' ? 'star' : key === 'groups' ? 'people' : ['direct', 'new-messages'].includes(key) ? 'chat' : 'hash';
    sections.push(`<section class="list-section" data-section="${esc(key)}"><h2 class="list-section-title">${icon(symbol)}<span class="section-name">${esc(label)}</span><span class="section-count">${items.length}</span></h2>${items.map(c => renderRow(c, ['favorites', 'new-messages'].includes(key))).join('')}</section>`);
  };
  append('새 메시지', channels.filter(c => incoming.has(c.id)), 'new-messages');
  append('즐겨찾기', channels.filter(c => state.favorites.has(c.id) && !incoming.has(c.id)), 'favorites');
  const rest = channels.filter(c => !state.favorites.has(c.id) && !incoming.has(c.id));
  const teamIds = [...new Set(rest.filter(c => ['O', 'P'].includes(c.type)).map(c => c.team_id || ''))];
  for (const teamId of teamIds) append(`${state.teams[teamId]?.display_name || '팀'} · 채널`, rest.filter(c => ['O', 'P'].includes(c.type) && (c.team_id || '') === teamId), `team-${teamId}`);
  append('그룹 대화', rest.filter(c => c.type === 'G'), 'groups');
  append('개인 DM', rest.filter(c => c.type === 'D'), 'direct');
  list.innerHTML = sections.join('') || `<p class="empty">${state.filter === 'favorite' ? '채널이나 대화의 별을 눌러<br>즐겨찾기에 추가해 보세요.' : '표시할 대화방이 없어요.'}</p>`;
  list.setAttribute('tabindex', '0'); list.setAttribute('role', 'region'); list.setAttribute('aria-label', '대화 목록');
  document.querySelectorAll('[data-channel]').forEach(button => button.onclick = () => selectChannel(button.dataset.channel));
  bindFavorites();
  list.scrollTo({ top: oldTop, behavior: 'instant' });
  if (focusKey) list.querySelector(`[data-${focusKey[0]}="${CSS.escape(focusKey[1])}"]`)?.focus({ preventScroll: true });
}
async function selectChannel(id) {
  historyPositionCleanup();
  const loading=state.loadingTicket=(state.loadingTicket||0)+1;state.channelLoading=true;
  state.postFocus = null; state.unreadMarker = null;
  const pending = unreads.pending(id);
  incoming.markRead(id);
  state.selected = id; state.posts = []; state.hasMore = true;state.historyLoading=false;state.historyCursor=null; delete state.unread[id];
  if(!state.demo)api?.setCurrentChannel(id,channelName(state.channels.find(channel=>channel.id===id))).catch(()=>{});
  renderChannelList(); renderChat();
  if (state.demo) { state.posts = state.demoPosts[id] || []; state.hasMore = false; showLatestOrUnread(id, pending);state.channelLoading=false; return; }
  try {
    const epoch = state.generation;
    const result = await api.posts(id);
    await hydrateUsers(Object.values(result.posts).map(p => p.user_id));
    if (state.selected !== id || epoch !== state.generation || loading!==state.loadingTicket) return;
    state.posts = Object.values(result.posts).filter(p => !p.delete_at).sort((a, b) => a.create_at - b.create_at);
    state.hasMore = result.order.length === 60;
    state.previews[id] = state.posts.at(-1)?.message || botAttachments.summary(state.posts.at(-1)) || '';
    showLatestOrUnread(id, pending); renderChannelList();
    await api.view(id);
  } catch (error) { if (state.selected === id) toast(error.message); }
  finally{if(loading===state.loadingTicket){state.channelLoading=false;if(!isFloating)api?.incomingReady().catch(()=>{});if(typeof realtime!=='undefined')realtime.ready();}}
}
// A room with unread messages opens at the first of them; a fully read room opens at the bottom.
function showLatestOrUnread(id, pending) {
  let first = null;
  if (pending?.count > 0 && state.posts.length) {
    if (pending.since) first = state.posts.find(post => post.create_at > pending.since && post.user_id !== state.me.id);
    first ||= state.posts[Math.max(0, state.posts.length - pending.count)];
  }
  if (!first) { renderMessages(true); return; }
  state.unreadMarker = { channel: id, post: first.id };
  renderMessages();
  const area = $('#messages'), divider = $('#unread-divider');
  if (!area || !divider) { if (area) area.scrollTop = area.scrollHeight; return; }
  const top = area.getBoundingClientRect().top;
  area.scrollTop += divider.getBoundingClientRect().top - top - 10;
  const anchor = area.querySelector(`[data-message-id="${CSS.escape(first.id)}"]`);
  // Keeps the first unread message in place while late images above or below it load.
  if (anchor) retainHistoryPosition(area, { id: first.id, offset: (anchor.querySelector('.bubble-row') || anchor).getBoundingClientRect().top - top });
}
function renderChat() {
  const channel = state.channels.find(c => c.id === state.selected);
  if (!channel) { $('#chat-pane').innerHTML = `<div class="empty-pane"><div><span class="brandmark">${imageOrIcon('logo', 'chat')}</span><h2>이야기가 모이는 곳</h2><p>왼쪽에서 대화를 선택하거나<br>새 개인 대화를 시작해 보세요.</p></div></div>`; return; }
  const name = channelName(channel);
  $('#chat-pane').innerHTML = `<header class="chat-header">${avatar(name, state.channels.indexOf(channel), true)}<div><h2>${channel.type==='D'?userStatus.name(state.users[directUserId(channel)]):esc(name)}</h2><p>${esc(channel.header || (channel.type === 'D' ? '개인 대화' : channel.type === 'G' ? '그룹 대화' : '팀 채널'))}</p></div><div class="header-actions"><button class="icon-btn" id="refresh" aria-label="대화 새로고침" title="새로고침">${icon('refresh')}</button></div></header>${state.demo ? '<div class="demo-banner">데모 모드입니다. 메시지는 이 화면에서만 보관됩니다.</div>' : ''}<div class="messages" id="messages" aria-label="메시지 목록"></div><form class="composer-wrap" id="composer"><textarea id="message-input" aria-label="메시지 입력" maxlength="16000" placeholder="메시지를 입력하세요"></textarea><div class="composer-bottom"><button class="icon-btn" id="emoji" type="button" title="웃는 이모지 추가" aria-label="웃는 이모지 추가">${icon('smile')}</button><span class="hint">Enter로 전송 · Shift + Enter로 줄바꿈</span><button class="primary send-btn" id="send" type="submit">전송</button></div></form>`;
  $('.header-actions').insertAdjacentHTML('afterbegin', `<button class="secondary library-open" id="open-library" title="사진·동영상·파일 모아보기">사진·파일</button>`);
  $('.chat-header > .avatar').outerHTML = conversationAvatar(channel, true);
  $('.header-actions').insertAdjacentHTML('afterbegin', favoriteButton(channel, true)); bindFavorites();
  $('.header-actions').insertAdjacentHTML('afterbegin', '<button class="icon-btn" id="room-theme" title="대화방 꾸미기" aria-label="대화방 꾸미기">' + icon('palette') + '</button>');
  if(!state.demo){$('.header-actions').insertAdjacentHTML('afterbegin',`<button class="icon-btn" id="message-search" title="메시지·파일 검색 (Ctrl+F)" aria-label="메시지·파일 검색">${icon('search')}</button>`);$('#message-search').onclick=()=>messageSearch.open();}
  if(!state.demo&&!isFloating){$('.header-actions').insertAdjacentHTML('afterbegin','<button class="icon-btn" id="open-floating" title="이 채팅방을 별도 창으로 열기" aria-label="채팅방 별도 창으로 열기">'+icon('popout')+'</button>');$('#open-floating').onclick=async event=>{const button=event.currentTarget;button.disabled=true;try{await api.openFloatingChat(channel.id);}catch(error){toast(error.message);}finally{button.disabled=false;}};}
  if(isFloating){$('.header-actions').insertAdjacentHTML('afterbegin','<button class="icon-btn" id="float-pin" aria-label="항상 위에 표시" title="항상 위에 표시" aria-pressed="'+(state.floatingTop?'true':'false')+'">📌</button>');$('#float-pin').onclick=async event=>{const button=event.currentTarget;try{const enabled=await api.setFloatingTop(button.getAttribute('aria-pressed')!=='true');state.floatingTop=enabled;button.setAttribute('aria-pressed',String(enabled));}catch(error){toast(error.message);}};}
  $('#room-theme').onclick = personal.openTheme;
  messagePins.mount();
  rooms.mountHeader(channel);
  personal.apply();
  messageNavigation.paint();
  $('#open-library').onclick = media.openLibrary;
  const input = $('#message-input'); input.value = state.drafts[channel.id] || '';
  $('#composer').insertAdjacentHTML('beforebegin','<div id="typing-indicator" class="typing-indicator" role="status" aria-live="polite" hidden></div>'); if (typeof typingIndicator !== 'undefined') typingIndicator.paint();
  input.oninput = () => { state.drafts[channel.id] = input.value; };
  input.onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); $('#composer').requestSubmit(); } };
  $('#composer').onsubmit = sendMessage;
  $('#emoji').onclick = () => { input.setRangeText('😊', input.selectionStart, input.selectionEnd, 'end'); state.drafts[channel.id] = input.value; input.focus(); };
  $('#refresh').onclick = async event => {
    const epoch = state.generation;
    if (state.demo) return selectChannel(channel.id);
    event.currentTarget.disabled = true;
    try {
      await hydrateUsers([state.me.id, ...state.posts.map(post => post.user_id), ...(channel.type === 'D' ? [directUserId(channel)] : [])], true);
      await loadNavigation();
      if (epoch !== state.generation || state.selected !== channel.id) return;
      state.me = state.users[state.me.id]; renderShell(); await selectChannel(channel.id);
    } catch (error) { if (epoch === state.generation) toast(error.message); }
    finally { if (epoch === state.generation && $('#refresh')) $('#refresh').disabled = false; }
  };
  composer.mount(channel.id);
  renderMessages(true);
}
let scrollCleanup = () => {};
let historyCleanup = () => {};
let historyPositionCleanup = () => {};
function retainHistoryPosition(area,saved){
  historyPositionCleanup();followMessageScroll(area,false);
  const position=()=>{const anchor=area.querySelector(`[data-message-id="${CSS.escape(saved.id)}"]`);if(anchor)area.scrollTop+=(anchor.querySelector('.bubble-row')||anchor).getBoundingClientRect().top-area.getBoundingClientRect().top-saved.offset;};
  position();const observer=new ResizeObserver(position);observer.observe(area);for(const child of area.children)observer.observe(child);
  const stop=()=>{observer.disconnect();clearTimeout(timer);for(const event of ['wheel','pointerdown','touchstart','keydown'])area.removeEventListener(event,stop);};
  const timer=setTimeout(stop,10000);for(const event of ['wheel','pointerdown','touchstart','keydown'])area.addEventListener(event,stop,{passive:true});historyPositionCleanup=stop;
}
function watchHistory(area){historyCleanup();if(!state.hasMore||state.demo)return;const sentinel=$('#history-sentinel');if(!sentinel)return;const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)&&area.isConnected&&!state.channelLoading&&!state.historyLoading)loadMore();},{root:area,rootMargin:'100px 0px 0px 0px'});observer.observe(sentinel);historyCleanup=()=>observer.disconnect();}
function followMessageScroll(area, follow) {
  scrollCleanup();
  if (typeof typingIndicator !== 'undefined') typingIndicator.reset();
  let pinned = follow, frame = 0, intent = 0, dragging = false;
  const bottom = () => area.scrollHeight - area.scrollTop - area.clientHeight < 100;
  // Late images and previews grow the list and fire scroll events of their own. Only scrolling
  // the user started may release the bottom lock, otherwise the view is left stranded above it.
  const onScroll = () => { if (bottom()) pinned = true; else if (dragging || performance.now() - intent < 1200) pinned = false; };
  const onWheel = event => { intent = performance.now(); if (event.deltaY < 0) pinned = false; };
  const onIntent = () => { intent = performance.now(); };
  const onDown = () => { dragging = true; intent = performance.now(); };
  const onUp = () => { dragging = false; intent = performance.now(); };
  const settle = () => { if (!pinned) return; cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { if (pinned && area.isConnected) area.scrollTop = area.scrollHeight; }); };
  const observer = new ResizeObserver(settle);
  observer.observe(area); for (const child of area.children) observer.observe(child);
  area.addEventListener('scroll', onScroll, { passive: true });
  area.addEventListener('wheel', onWheel, { passive: true });
  area.addEventListener('touchmove', onIntent, { passive: true }); area.addEventListener('keydown', onIntent);
  area.addEventListener('pointerdown', onDown, { passive: true }); addEventListener('pointerup', onUp, { passive: true });
  area.addEventListener('load', settle, true); area.addEventListener('loadedmetadata', settle, true);
  scrollCleanup = () => { observer.disconnect(); cancelAnimationFrame(frame); area.removeEventListener('scroll', onScroll); area.removeEventListener('wheel', onWheel); area.removeEventListener('touchmove', onIntent); area.removeEventListener('keydown', onIntent); area.removeEventListener('pointerdown', onDown); removeEventListener('pointerup', onUp); area.removeEventListener('load', settle, true); area.removeEventListener('loadedmetadata', settle, true); };
}
function renderMessages(scroll = false) {
  const area = $('#messages'); if (!area) return;
  const oldHeight = area.scrollHeight, oldTop = area.scrollTop, atBottom = oldHeight - oldTop - area.clientHeight < 100;
  let lastDate = '', lastMinute = null, lastAuthor = null, lastAt = 0;
  const unreadFrom = state.unreadMarker?.channel === state.selected ? state.unreadMarker.post : null;
  area.innerHTML = `${state.hasMore && !state.demo ? '<div class="history-sentinel" id="history-sentinel" role="status">이전 대화</div>' : ''}` + state.posts.map(post => {
    const date = new Date(post.create_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    const divider = date !== lastDate ? `<div class="date-divider">${esc(date)}</div>` : ''; lastDate = date;
    const self = post.user_id === state.me.id, name = displayName(state.users[post.user_id]);
    const attachmentMarkup = media.attachments(post), cards = botAttachments.markup(post);
    const message = post.message || (attachmentMarkup || cards ? '' : '(시스템 메시지)');
    const minute = Math.floor(post.create_at / 60000), showTime = minute !== lastMinute; lastMinute = minute;
    const fresh = post.id === unreadFrom ? '<div class="unread-divider" id="unread-divider" role="separator"><span>여기부터 읽지 않은 메시지</span></div>' : '';
    const continued = !divider && !fresh && post.user_id === lastAuthor && post.create_at - lastAt < 300000; lastAuthor = post.user_id; lastAt = post.create_at;
    return `${divider}${fresh}<article class="message ${self ? 'self' : ''} ${continued ? 'continued' : ''} ${post.type === 'system_ephemeral' ? 'ephemeral' : ''}" data-message-id="${esc(post.id)}" tabindex="0">${self ? '' : accountAvatar(post.user_id, true)}<div class="message-content">${self ? '' : `<div class="sender">${userStatus.name(state.users[post.user_id])}</div>`}${messageActions.reference(post)}<div class="bubble-row ${message ? '' : 'media-only'}">${message ? `<div class="bubble rich-text" data-message="${esc(message)}">${composer.format(message)}</div>` : attachmentMarkup}${showTime ? `<time datetime="${new Date(post.create_at).toISOString()}">${clock(post.create_at)}</time>` : ''}</div>${message ? attachmentMarkup : ''}${cards}${post.type === 'system_ephemeral' ? '<span class="ephemeral-label">나에게만 보이는 메시지</span>' : ''}${linkPreviews.markup(post)}${messageActions.annotation(post)}${reactions.markup(post)}</div></article>`;
  }).join('') || '<div class="empty">아직 메시지가 없어요.<br>첫 인사를 건네보세요.</div>';
  if (scroll) area.scrollTop = area.scrollHeight;
  else area.scrollTop = oldTop + area.scrollHeight - oldHeight;
  followMessageScroll(area, scroll || atBottom);
  watchHistory(area);
  media.hydrateChat(state.posts, state.selected);
  messageActions.hydrateReferences().catch(() => {});
  reactions.hydrate(state.posts).catch(() => {});
  linkPreviews.hydrate(state.posts).catch(() => {});
  mentions.paint(area);
}
async function loadMore() {
  if(state.historyLoading||state.channelLoading||!state.hasMore||!state.posts.length)return;
  const id = state.selected, epoch = state.generation;
  state.historyLoading=true;const sentinel=$('#history-sentinel');if(sentinel)sentinel.textContent='이전 메시지를 불러오는 중…';
  try {
    const cursor=state.historyCursor||state.posts[0]?.id;
    const result = await api.posts(id, cursor);
    await hydrateUsers(Object.values(result.posts).map(p => p.user_id));
    if (state.selected !== id || epoch !== state.generation) return;
    const area=$('#messages'),top=area.getBoundingClientRect().top,anchor=[...area.querySelectorAll('[data-message-id]')].find(element=>element.getBoundingClientRect().bottom>top),saved=anchor&&{id:anchor.dataset.messageId,offset:(anchor.querySelector('.bubble-row')||anchor).getBoundingClientRect().top-top};
    state.posts = [...new Map([...Object.values(result.posts), ...state.posts].map(p => [p.id, p])).values()].filter(p => !p.delete_at).sort((a, b) => a.create_at - b.create_at);
    const oldest=Object.values(result.posts).sort((a,b)=>a.create_at-b.create_at)[0]?.id;
    state.historyCursor=oldest;state.hasMore = result.order.length === 60&&!!oldest&&oldest!==cursor; renderMessages();if(saved)retainHistoryPosition(area,saved);
  } catch (error) { if(epoch===state.generation)toast(error.message); }
  finally{if(epoch===state.generation&&state.selected===id){state.historyLoading=false;if($('#history-sentinel'))$('#history-sentinel').textContent='이전 대화';}}
}
async function sendMessage(event) {
  return composer.send(event);
}
async function openPeople() {
  const dialog = $('#people-dialog');
  dialog.innerHTML = `<div class="dialog-head"><h2 id="people-title">새로운 대화</h2><button class="icon-btn" id="people-close" aria-label="닫기">${icon('close')}</button></div><p class="dialog-intro">이름이나 아이디로 팀원을 찾아보세요.</p><input id="people-search" class="people-search" placeholder="두 글자 이상 입력 후 Enter" aria-label="사용자 검색"><div class="people-result" id="people-result"><p class="empty">함께 이야기할 사람을 찾아보세요.</p></div>`;
  $('#people-close').onclick = () => dialog.close();
  let request = 0;
  $('#people-search').onkeydown = async event => {
    if (event.key !== 'Enter' || event.isComposing) return;
    const term = event.target.value.trim(), seq = ++request, epoch = state.generation;
    if (term.length < 2) return;
    $('#people-result').innerHTML = '<p class="empty">검색 중…</p>';
    try {
      const users = state.demo ? Object.values(state.users).filter(u => displayName(u).includes(term) || u.username.includes(term)) : await api.searchUsers(term);
      if (seq !== request || epoch !== state.generation || !dialog.open) return;
      users.forEach(user => { state.users[user.id] = user; });
      $('#people-result').innerHTML = users.filter(u => u.id !== state.me.id).map(user => `<button class="person-row" data-person="${esc(user.id)}">${accountAvatar(user.id)}<span class="person-copy"><span>${userStatus.name(user)}</span><small>@${esc(user.username)}</small></span>${icon('arrow')}</button>`).join('') || '<p class="empty">검색 결과가 없어요.</p>';
      dialog.querySelectorAll('[data-person]').forEach(button => button.onclick = async () => {
        button.disabled = true;
        try {
          const userId = button.dataset.person;
          const channel = state.demo ? state.channels.find(c => c.type === 'D' && c.name.includes(userId)) || { id: userId, type: 'D', name: `me__${userId}`, last_post_at: Date.now() } : await api.direct(userId);
          if (!state.channels.some(c => c.id === channel.id)) state.channels.unshift(channel);
          state.filter = 'all'; state.search = ''; dialog.close(); renderShell(); await selectChannel(channel.id);
        } catch (error) { toast(error.message); button.disabled = false; }
      });
    } catch (error) { if (seq === request) $('#people-result').textContent = error.message; }
  };
  dialog.showModal(); $('#people-search').focus();
}
function openSettings() {
  const dialog = $('#settings-dialog');
  const imageRows = [['logo', '앱 로고', 'chat'], ['chatIcon', '채팅 메뉴 아이콘', 'chat'], ['peopleIcon', '사람 메뉴 아이콘', 'people'], ['settingsIcon', '설정 메뉴 아이콘', 'settings']];
  dialog.innerHTML = `<form id="settings-form"><div class="dialog-head"><h2 id="settings-title">우리 팀에 맞게</h2><button type="button" class="icon-btn" id="settings-close" aria-label="닫기">${icon('close')}</button></div><p class="dialog-intro">이름부터 작은 아이콘까지, 원하는 모습으로 꾸며보세요.<br>이 설정은 이 PC에 저장됩니다.</p><label class="field"><span>앱 이름</span><input name="name" maxlength="24" value="${esc(state.settings.name)}" required></label><section class="settings-section"><p class="section-label">LOGO & ICONS</p>${imageRows.map(([key, label, fallback]) => `<div class="image-setting"><div class="image-preview" id="preview-${key}">${imageOrIcon(key, fallback)}</div><span>${label}</span><button type="button" data-image="${key}">이미지 가져오기</button></div>`).join('')}<small>PNG, JPG, WebP, ICO · 최대 5MB</small></section><section class="settings-section"><p class="section-label">THEME</p><div class="segmented theme-choice" role="group" aria-label="화면 테마">${[['system', '시스템 설정', '운영체제를 따름'], ['light', '라이트', '밝은 화면'], ['dark', '다크', '어두운 화면']].map(([value, label, hint]) => `<button type="button" data-theme-choice="${value}" aria-pressed="${(state.settings.theme || 'system') === value}"><strong>${label}</strong><small>${hint}</small></button>`).join('')}</div></section><section class="settings-section"><p class="section-label">COLORS</p><div class="colors"><label class="color-setting">강조색<input name="accent" type="color" value="${esc(state.settings.accent)}"></label><label class="color-setting">채팅 배경<input name="chatBackground" type="color" value="${esc(state.settings.chatBackground)}"></label></div></section><div class="dialog-footer"><button class="text-btn" type="button" id="reset-settings">기본값으로 되돌리기</button><button class="primary" type="submit">설정 저장</button></div></form>`;
  $('#settings-close').onclick = () => dialog.close();
  dialog.querySelectorAll('[data-theme-choice]').forEach(button => button.onclick = async () => { await setTheme(button.dataset.themeChoice); dialog.querySelectorAll('[data-theme-choice]').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.themeChoice === (state.settings.theme || 'system')))); });
  if (state.me) {
    $('.dialog-footer', dialog).insertAdjacentHTML('beforebegin', '<section class="settings-section"><p class="section-label">대화창 테마</p><button type="button" class="secondary" id="all-chat-theme">전체 대화창 꾸미기</button><p class="dialog-intro" style="margin-top:9px;margin-bottom:0">배경·말풍선·글자색을 모든 대화창에 한 번에 적용합니다.</p></section>');
    $('#all-chat-theme').onclick = () => personal.openTheme('all');
  }
  if (typeof appUpdates !== 'undefined') appUpdates.mount(dialog);
  if (api?.importLegacyData && !isFloating) {
    $('.dialog-footer', dialog).insertAdjacentHTML('beforebegin', `<section class="settings-section"><button type="button" class="secondary" id="import-legacy-data" ${state.me ? 'disabled' : ''}>이전 포터블 데이터 가져오기</button><p class="dialog-intro" style="margin-top:8px;margin-bottom:0">로그아웃 상태에서 기존 EXE 옆 Data 폴더를 선택하세요.<br>현재 설정은 덮어쓰지 않습니다. 로그인 정보는 같은 운영체제 사용자 계정에서만 복원할 수 있습니다.</p></section>`);
    $('#import-legacy-data').onclick = async () => {
      try {
        const result = await api.importLegacyData(); if (!result) return;
        state.settings = await api.getSettings(); applySettings(); dialog.close(); renderLogin();
        toast(result.imported.length ? '이전 데이터를 가져왔습니다. 자동 로그인은 앱을 재시작하면 적용됩니다.' : '현재 데이터가 있어 덮어쓰지 않았습니다.');
      } catch (error) { toast(error.message); }
    };
  }
  serverSettings.mount(dialog);
  if(state.me&&!state.demo&&!isFloating){$('.dialog-footer',dialog).insertAdjacentHTML('beforebegin','<section class="settings-section"><button type="button" class="secondary" id="test-notification">알림 테스트</button><p class="dialog-intro">작업표시줄의 Moyeo 알림을 클릭해 현재 대화방으로 돌아오는지 확인합니다.</p></section>');$('#test-notification').onclick=async()=>{try{await api.testNotification(state.selected);dialog.close();toast('Moyeo 테스트 알림을 표시했습니다.');}catch(error){toast(error.message);}};}
  $('.dialog-footer', dialog).insertAdjacentHTML('beforebegin', `<section class="settings-section"><label class="sound-setting"><input id="sound-enabled" type="checkbox" ${state.settings.soundEnabled !== false ? 'checked' : ''}> 새 메시지 알림 소리</label><p class="dialog-intro" style="margin-top:10px;margin-bottom:0">창을 닫으면 트레이에서 계속 실행됩니다.<br>완전히 끝내려면 트레이 메뉴에서 ‘완전히 종료’를 선택하세요.</p></section>`);
  $('.dialog-footer', dialog).insertAdjacentHTML('beforebegin', `<section class="settings-section"><label class="sound-setting"><input id="auto-login" type="checkbox" ${state.settings.autoLogin !== false ? 'checked' : ''}> 로그인 기억 · 다음 실행 시 자동 로그인</label><label class="sound-setting" style="margin-top:12px"><input id="start-at-login" type="checkbox" ${state.settings.startAtLogin ? 'checked' : ''}> ${state.settings.platform === 'darwin' ? 'Mac 로그인 시 메뉴 막대로 실행' : '윈도우 시작 시 트레이로 실행'}</label><p class="dialog-intro" style="margin-top:10px;margin-bottom:0">자동 로그인은 이 운영체제 사용자 계정에서 사용할 수 있습니다.<br>앱을 이동하면 시작 실행 옵션을 다시 저장하세요.</p></section>`);
  dialog.querySelectorAll('[data-image]').forEach(button => button.onclick = async () => {
    try {
      if (!api) throw new Error('이미지 가져오기는 데스크톱 앱에서 사용할 수 있습니다.');
      const settings = await api.pickImage(button.dataset.image);
      if (settings) { state.settings = settings; $(`#preview-${button.dataset.image}`).innerHTML = imageOrIcon(button.dataset.image, 'chat'); toast('이미지를 가져왔습니다.'); }
    } catch (error) { toast(error.message); }
  });
  $('#settings-form').onsubmit = async event => {
    event.preventDefault();
    try {
      const values = Object.fromEntries(new FormData(event.target));
      values.soundEnabled = $('#sound-enabled').checked;
      values.autoLogin = $('#auto-login').checked;
      values.startAtLogin = $('#start-at-login').checked;
      state.settings = api ? await api.saveSettings(values) : { ...state.settings, ...values };
      applySettings(); dialog.close(); if (state.me) renderShell(); else renderLogin(); toast('설정을 저장했습니다.');
    } catch (error) { toast(error.message); }
  };
  $('#reset-settings').onclick = async () => {
    try {
      state.settings = api ? await api.saveSettings({ reset: true }) : { name: '모여', accent: '#fee34a', chatBackground: '#e8eef3' };
      applySettings(); dialog.close(); if (state.me) renderShell(); else renderLogin(); toast('기본 설정으로 되돌렸습니다.');
    } catch (error) { toast(error.message); }
  };
  dialog.showModal();
}
async function logout(skipServer = false) {
  serverSettings.reset();messagePins.reset();rooms.reset();collections.reset();
  historyCleanup();historyPositionCleanup();state.historyLoading=false;
  if(typeof mentions!=='undefined')mentions.reset();
  if(typeof realtime!=='undefined')realtime.reset();
  if(typeof messageSearch!=='undefined')messageSearch.reset();
  messageNavigation.reset();
  scrollCleanup();
  media.reset();linkPreviews.reset();
  composer.reset();
  personal.reset(); gifs.reset();
  messageActions.reset();
  reactions.reset();
  incoming.reset(); unreads.reset();
  state.ready = false; state.teams = {}; state.favorites = new Set(); state.favoritePending = new Set(); state.favoritesReady = false;
  state.generation++; state.me = null; state.selected = null; state.channels = []; state.posts = []; state.users = {}; state.drafts = {}; state.previews = {}; state.unread = {}; state.search = ''; state.filter = 'all';
  const wasDemo = state.demo; state.demo = false;
  renderLogin();
  if (!wasDemo && skipServer !== true) try { await api.disconnect(); } catch (error) { toast(`로컬 로그아웃 완료. 서버 세션 해제 실패: ${error.message}`); }
}
async function poll() {
  if (!state.ready || !state.me || state.demo || state.polling || !api) return;
  state.polling = true;
  const epoch = state.generation, id = state.selected;
  try {
    const channels = (await api.channels()).filter(c => !c.delete_at);
    if (epoch !== state.generation) return;
    const previousChannels = state.channels;
    await hydrateUsers(channels.filter(c => c.type === 'D').flatMap(c => c.name.split('__')));
    if (epoch !== state.generation) return;
    state.channels = channels.sort((a, b) => b.last_post_at - a.last_post_at);
    unreads.load().then(() => { if (epoch === state.generation && $('#channel-list')) renderChannelList(); });
    const windowActive = await api.isWindowActive();
    if (epoch !== state.generation) return;
    const activeChannels=await api.getActiveChannels();
    if(epoch!==state.generation)return;
    incoming.receive(channels, previousChannels, windowActive,activeChannels);
    incoming.reconcile();
    renderChannelList();
    if (id) {
      const result = await api.posts(id);
      await hydrateUsers(Object.values(result.posts).map(p => p.user_id));
      if (epoch !== state.generation || state.selected !== id) return;
      const area = $('#messages'), nearBottom = area && area.scrollHeight - area.scrollTop - area.clientHeight < 100;
      const fresh = Object.values(result.posts);
      // Keep older pages, replace the latest page so edits and deletions are reflected.
      const cutoff = Math.min(...fresh.map(p => p.create_at));
      const older = result.order.length === 60 || state.postFocus ? state.posts.filter(p => p.create_at < cutoff) : [];
      const posts = (state.postFocus ? state.posts.map(post => fresh.find(item => item.id === post.id) || post) : [...new Map([...older, ...fresh].map(p => [p.id, p])).values()]).filter(p => !p.delete_at).sort((a, b) => a.create_at - b.create_at);
      if (JSON.stringify(posts) !== JSON.stringify(state.posts)) { state.posts = posts; const oldTop = area.scrollTop; renderMessages(nearBottom); if (!nearBottom) area.scrollTop = oldTop; }
      state.previews[id] = state.posts.at(-1)?.message || '';
      reactions.hydrate(state.posts, true).catch(() => {});
      if (document.hasFocus() && !document.querySelector('dialog[open]') && area.scrollHeight - area.scrollTop - area.clientHeight < 100) await api.view(id);
    }
    if(typeof realtime!=='undefined')realtime.status();
  } catch (error) { if (epoch === state.generation && $('#connection-label')) $('#connection-label').textContent = `동기화 실패 · ${error.message}`; }
  finally { state.polling = false; }
}
(async () => {
  if (api) try { state.settings = await api.getSettings(); } catch (error) { toast(error.message); }
  applySettings();
  if(isFloating){
    root.innerHTML='<div class="empty">채팅방을 불러오는 중…</div>';
    try{const context=await api.getFloatingContext();state.me=context.user;state.floatingTop=context.alwaysOnTop;state.users[state.me.id]=state.me;state.generation++;await refreshChannels();if(!state.channels.some(channel=>channel.id===context.channel.id))state.channels.push(context.channel);await loadNavigation();await personal.load();renderShell();await selectChannel(context.channel.id);}
    catch(error){root.innerHTML=`<div class="empty">${esc(error.message)}<br><button class="secondary" id="retry-floating">다시 시도</button></div>`;$('#retry-floating').onclick=()=>location.reload();}
    return;
  }
  renderLogin();
  if (api) {
    const form = $('.login-form');
    form.querySelectorAll('input,button').forEach(control => { control.disabled = true; });
    $('#login-progress').textContent = '저장한 계정으로 자동 로그인 중…';
    try {
      const user = await api.restoreSession();
      if (!user) { renderLogin(); return; }
      state.me = user; state.users[user.id] = user; state.demo = false; state.generation++;
      await refreshChannels(); await loadNavigation(); await personal.load(); incoming.start(); renderShell();
      if (state.channels.length) await selectChannel(state.channels[0].id);
    } catch (error) {
      incoming.reset(); state.me = null; state.ready = false; state.users = {}; state.channels = []; state.selected = null; renderLogin();
      $('#login-error').textContent = `자동 로그인 실패: ${error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')}`;
      $('#login-progress').insertAdjacentHTML('beforebegin', '<button class="secondary" id="retry-login" type="button">자동 로그인 다시 시도</button>');
      $('#retry-login').onclick = () => location.reload();
    }
  }
})();


// Dialogs and picker handlers consume Escape before the chat window shortcut.
document.addEventListener('keydown',event=>{
  if(event.key!=='Escape'||event.defaultPrevented||event.isComposing||event.repeat||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey||!state.me||!state.selected||document.querySelector('dialog[open]'))return;
  event.preventDefault();api.closeChatWindow().catch(error=>toast(error.message));
});
