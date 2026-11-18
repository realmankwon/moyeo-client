const incoming = (() => {
  let rooms = new Map(), ownTimes = new Map(), connectedAt = 0, dismissed = false;
  const roomTitle = channel => channel.type === 'D' ? `${channelName(channel)} · @${state.users[directUserId(channel)]?.username || ''}` : `${state.teams[channel.team_id]?.display_name ? `${state.teams[channel.team_id].display_name} · ` : ''}${channelName(channel)}`;
  function start() { connectedAt = Date.now(); }
  function noteOwn(post) { ownTimes.set(post.channel_id, Math.max(ownTimes.get(post.channel_id) || 0, post.create_at || 0)); }
  function receive(channels, previous, windowActive, activeChannels=[]) {
    if (!state.me || state.demo || isFloating) return;
    let changed = false;
    for (const channel of channels) {
      const old = previous.find(item => item.id === channel.id);
      if (!channel.last_post_at || channel.last_post_at <= (old?.last_post_at || connectedAt) || channel.last_post_at <= (ownTimes.get(channel.id) || 0)) continue;
      if ((channel.id === state.selected && windowActive) || activeChannels.includes(channel.id)) { markRead(channel.id); continue; }
      rooms.set(channel.id, { time: channel.last_post_at }); state.unread[channel.id] = '새 글'; changed = true;
      api.notifyIncoming({ channel: channel.id, title: roomTitle(channel) }).catch(() => {});
    }
    if (changed) { dismissed = false; render(); const header = $('#incoming-header'); header.classList.remove('new-arrival'); requestAnimationFrame(() => header.classList.add('new-arrival')); }
    else if (rooms.size) render();
  }
  function render() {
    const header = $('#incoming-header'); if (!header) return;
    if(isFloating){header.hidden=true;return;}
    for (const id of rooms.keys()) if (!state.channels.some(channel => channel.id === id)) rooms.delete(id);
    const entries = [...rooms].sort((a,b) => b[1].time-a[1].time);
    header.hidden = !state.me || dismissed || !entries.length;
    if (!header.hidden) {
      header.innerHTML = `<div class="incoming-label"><span class="incoming-bell">●</span><strong>새 메시지</strong><small>${entries.length}개 대화방</small></div><div class="incoming-rooms">${entries.map(([id, item]) => { const channel = state.channels.find(c => c.id === id); return `<button data-incoming-room="${esc(id)}" title="${esc(roomTitle(channel))} 대화로 이동"><strong>${esc(roomTitle(channel))}</strong><span>${clock(item.time)}</span><b>바로 가기 →</b></button>`; }).join('')}</div><button id="incoming-dismiss" aria-label="새 메시지 알림 숨기기" title="알림 숨기기">×</button>`;
      header.querySelectorAll('[data-incoming-room]').forEach(button => button.onclick = () => open(button.dataset.incomingRoom));
      $('#incoming-dismiss').onclick = () => { dismissed = true; render(); };
    } else header.innerHTML = '';
    document.documentElement.style.setProperty('--incoming-height', `${header.hidden ? 0 : header.offsetHeight}px`);
    document.title = `${entries.length ? `(${entries.length}) ` : ''}${state.settings.name} · Mattermost`;
    api?.setIncomingCount(entries.length).catch(() => {});
  }
  function markRead(id) {
    const changed = rooms.delete(id), unread = state.unread[id];
    delete state.unread[id];
    if (!state.demo && changed) api.clearIncoming(id).catch(() => {});
    if (changed) render();
    if ((changed || unread) && $('#channel-list')) renderChannelList();
  }
  async function open(id) {
    if (!state.me || !state.channels.some(channel => channel.id === id)) return;
    document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
    $('#message-context-menu').hidden = true;
    state.search = ''; state.filter = 'all'; renderShell(); await selectChannel(id); $('#message-input')?.focus();
  }
  function reset() { rooms = new Map(); ownTimes = new Map(); connectedAt = 0; dismissed = false; render(); }
  const has = id => rooms.has(id);
  window.addEventListener('resize', render);
  document.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !event.target.closest('#messages, #composer') || !state.selected) return;
    const id = state.selected; markRead(id);
    if (state.me && !state.demo) api.view(id).catch(() => {});
  });
  api?.onIncomingOpen(id => open(id));
  api?.onChannelRead(id=>markRead(id));
  api?.onPostSent(post=>noteOwn(post));
  const sound = new Audio('assets/message.wav'); sound.preload = 'auto'; sound.volume = .65;
  api?.onIncomingSound(() => { sound.currentTime = 0; sound.play().catch(() => {}); });
  api?.onSoundSetting(enabled => { state.settings.soundEnabled = enabled; if ($('#sound-enabled')) $('#sound-enabled').checked = enabled; });
  return { start, noteOwn, receive, render, markRead, reset, has };
})();
