/* Room info and notification level, channel browsing/creation, group chats and the quick switcher. */
const rooms = (() => {
  let ticket = 0;
  const clean = error => error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
  const kind = channel => channel.type === 'D' ? '개인 대화' : channel.type === 'G' ? '그룹 대화' : channel.type === 'P' ? '비공개 채널' : '공개 채널';
  const teamList = () => Object.values(state.teams);
  const teamSelect = id => `<select id="${id}" aria-label="팀 선택" ${teamList().length < 2 ? 'hidden' : ''}>${teamList().map(team => `<option value="${esc(team.id)}">${esc(team.display_name || team.name || '팀')}</option>`).join('')}</select>`;
  icons.info = '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.1"/>';
  icons.bell = '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4Zm4 4a2 2 0 0 0 4 0"/>';
  icons.bellOff = '<path d="M6 16V11a6 6 0 0 1 9-5m3 5v5l2 2H8m2 2a2 2 0 0 0 4 0M4 4l16 16"/>';
  icons.at = '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a2.5 2.5 0 0 0 5 0v-1a9 9 0 1 0-4 7.5"/>';
  icons.bookmark = '<path d="M7 4h10v16l-5-4-5 4Z"/>';
  icons.compass = '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5Z"/>';

  async function enter(channel) {
    if (!state.channels.some(item => item.id === channel.id)) state.channels.unshift(channel);
    document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
    state.filter = 'all'; state.search = ''; renderShell(); await selectChannel(channel.id);
  }

  /* ---------- Shell and header entry points ---------- */
  function mountShell() {
    if (isFloating || !$('.heading-row')) return;
    if (!state.demo) {
      $('#new-chat').insertAdjacentHTML('beforebegin', `<button class="icon-btn list-action" id="browse-channels" title="채널 찾기 · 채널·그룹 대화 만들기" aria-label="채널 찾기와 만들기">${icon('compass')}</button>`);
      $('#browse-channels').onclick = () => openBrowse();
      $('.rail-nav').insertAdjacentHTML('beforeend', `<button class="nav-button" id="nav-mentions" title="나를 멘션한 메시지">${icon('at')}<span>멘션</span></button><button class="nav-button" id="nav-saved" title="저장한 메시지">${icon('bookmark')}<span>저장</span></button>`);
      $('#nav-mentions').onclick = () => collections.open('mentions');
      $('#nav-saved').onclick = () => collections.open('saved');
      collections.load();
    }
    const search = $('#channel-search');
    if (search) search.title = `빠른 전환: ${state.settings.platform === 'darwin' ? '⌘K' : 'Ctrl+K'}`;
  }
  function mountHeader(channel) {
    if (state.demo || !$('.header-actions')) return;
    const muted = unreads.level(channel.id) === 'mute';
    $('#refresh').insertAdjacentHTML('beforebegin', `<button class="icon-btn ${muted ? 'is-muted' : ''}" id="room-info" title="대화방 정보 · 알림 설정" aria-label="대화방 정보와 알림 설정">${icon(muted ? 'bellOff' : 'info')}</button>`);
    $('#room-info').onclick = () => openInfo(channel.id);
  }

  /* ---------- Room info ---------- */
  async function openInfo(id) {
    const channel = state.channels.find(item => item.id === id); if (!channel || state.demo) return;
    const current = ++ticket, epoch = state.generation, dialog = $('#room-dialog'), team = ['O', 'P'].includes(channel.type);
    const levels = [['all', '모든 메시지', '새 글마다 알림'], ['mention', '멘션만', '나를 부를 때만 알림'], ['mute', '알림 끄기', '배지만 조용히 표시']];
    dialog.innerHTML = `<div class="dialog-head"><h2 id="room-title">대화방 정보</h2><button type="button" class="icon-btn" id="room-close" aria-label="대화방 정보 닫기">${icon('close')}</button></div>
      <div class="room-summary">${conversationAvatar(channel)}<div><strong>${esc(channelName(channel))}</strong><small id="room-kind">${esc(kind(channel))}${team && state.teams[channel.team_id]?.display_name ? ` · ${esc(state.teams[channel.team_id].display_name)}` : ''}</small></div></div>
      <section class="settings-section"><p class="section-label">알림</p><div class="segmented" id="room-levels" role="group" aria-label="이 대화방 알림">${levels.map(([value, label, hint]) => `<button type="button" data-room-level="${value}" aria-pressed="${unreads.level(id) === value}"><strong>${label}</strong><small>${hint}</small></button>`).join('')}</div><p class="dialog-intro room-note">Mattermost 계정에 저장되어 다른 기기에도 적용됩니다.</p></section>
      ${channel.type === 'D' ? '' : `<section class="settings-section"><p class="section-label">소개</p><form id="room-about"><label class="field"><span>헤더</span><textarea id="room-header" rows="2" maxlength="1024" placeholder="대화방 위에 표시할 안내나 링크">${esc(channel.header || '')}</textarea></label>${team ? `<label class="field"><span>목적</span><input id="room-purpose" maxlength="250" value="${esc(channel.purpose || '')}" placeholder="이 채널을 어떻게 쓰는지 적어 주세요"></label>` : ''}<div class="room-row-actions"><button class="secondary" type="submit">소개 저장</button></div></form></section>`}
      <section class="settings-section"><p class="section-label">멤버 <span id="room-count"></span></p>${team ? `<div class="room-invite"><input id="room-invite-search" placeholder="초대할 사람 이름 입력 후 Enter" aria-label="초대할 사용자 검색"><div id="room-invite-result"></div></div>` : ''}<div id="room-members" class="room-members"><p class="empty">멤버를 불러오는 중…</p></div></section>
      ${team ? '<div class="dialog-footer"><button type="button" class="text-btn danger-text" id="room-leave">채널 나가기</button></div>' : ''}`;
    $('#room-close').onclick = () => dialog.close(); dialog.onclose = () => { ticket++; };
    dialog.querySelectorAll('[data-room-level]').forEach(button => button.onclick = async () => {
      const value = button.dataset.roomLevel; if (button.getAttribute('aria-pressed') === 'true') return;
      dialog.querySelectorAll('[data-room-level]').forEach(item => { item.disabled = true; });
      try {
        await unreads.setLevel(id, value); if (epoch !== state.generation) return;
        dialog.querySelectorAll('[data-room-level]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
        if (state.selected === id && $('#room-info')) { $('#room-info').innerHTML = icon(value === 'mute' ? 'bellOff' : 'info'); $('#room-info').classList.toggle('is-muted', value === 'mute'); }
        toast(value === 'mute' ? '이 대화방 알림을 껐습니다.' : value === 'mention' ? '멘션될 때만 알립니다.' : '모든 새 메시지를 알립니다.');
      } catch (error) { if (epoch === state.generation) toast(`알림 설정을 저장하지 못했습니다. ${clean(error)}`); }
      finally { dialog.querySelectorAll('[data-room-level]').forEach(item => { item.disabled = false; }); }
    });
    if ($('#room-about')) $('#room-about').onsubmit = async event => {
      event.preventDefault(); const button = event.submitter; if (button) button.disabled = true;
      try {
        const updated = await api.patchChannel(id, { header: $('#room-header').value, ...($('#room-purpose') ? { purpose: $('#room-purpose').value } : {}) });
        if (epoch !== state.generation) return;
        Object.assign(channel, { header: updated.header ?? channel.header, purpose: updated.purpose ?? channel.purpose });
        if (state.selected === id && $('.chat-header p')) $('.chat-header p').textContent = channel.header || (channel.type === 'G' ? '그룹 대화' : '팀 채널');
        renderChannelList(); toast('대화방 소개를 저장했습니다.');
      } catch (error) { if (epoch === state.generation) toast(`소개를 저장하지 못했습니다. ${clean(error)}`); }
      finally { if (button) button.disabled = false; }
    };
    if ($('#room-leave')) $('#room-leave').onclick = async event => {
      const button = event.currentTarget;
      if (button.dataset.confirm !== 'yes') { button.dataset.confirm = 'yes'; button.textContent = '한 번 더 누르면 채널에서 나갑니다'; setTimeout(() => { if (button.isConnected) { delete button.dataset.confirm; button.textContent = '채널 나가기'; } }, 4000); return; }
      button.disabled = true;
      try {
        await api.leaveChannel(id); if (epoch !== state.generation) return;
        state.channels = state.channels.filter(item => item.id !== id); state.favorites.delete(id); incoming.markRead(id);
        dialog.close(); if (state.selected === id) state.selected = null; renderShell();
        if (!state.selected && state.channels.length) await selectChannel(state.channels[0].id);
        toast('채널에서 나갔습니다.');
      } catch (error) { if (epoch === state.generation) { toast(`채널에서 나가지 못했습니다. ${clean(error)}`); button.disabled = false; } }
    };
    const paintMembers = detail => {
      const admins = new Set(detail.admins || []);
      detail.users.forEach(user => { state.users[user.id] = { ...state.users[user.id], ...user }; });
      $('#room-count').textContent = `${detail.count}명`;
      const users = [...detail.users].sort((a, b) => displayName(a).localeCompare(displayName(b), 'ko'));
      $('#room-members').innerHTML = users.map(user => `<div class="room-member">${accountAvatar(user.id, true)}<span class="person-copy"><span>${esc(displayName(user))}${user.id === state.me.id ? ' <em>나</em>' : ''}</span><small>@${esc(user.username)}</small></span>${admins.has(user.id) ? '<span class="room-role">관리자</span>' : ''}</div>`).join('') + (detail.count > users.length ? `<p class="dialog-intro room-note">처음 ${users.length}명을 표시합니다.</p>` : '') || '<p class="empty">멤버 정보를 볼 수 없습니다.</p>';
    };
    const loadMembers = async () => {
      try { const detail = await api.channelDetail(id); if (current === ticket && epoch === state.generation && dialog.open) paintMembers(detail); }
      catch (error) { if (current === ticket && dialog.open) $('#room-members').innerHTML = `<p class="empty">${esc(clean(error))}</p>`; }
    };
    if ($('#room-invite-search')) $('#room-invite-search').onkeydown = async event => {
      if (event.key !== 'Enter' || event.isComposing) return;
      event.preventDefault(); const term = event.target.value.trim(), box = $('#room-invite-result'); if (term.length < 2) return;
      box.innerHTML = '<p class="empty">검색 중…</p>';
      try {
        const users = (await api.searchUsers(term)).filter(user => user.id !== state.me.id);
        if (current !== ticket || !dialog.open) return;
        users.forEach(user => { state.users[user.id] = { ...state.users[user.id], ...user }; });
        box.innerHTML = users.map(user => `<div class="room-member">${accountAvatar(user.id, true)}<span class="person-copy"><span>${esc(displayName(user))}</span><small>@${esc(user.username)}</small></span><button type="button" class="secondary" data-room-invite="${esc(user.id)}">초대</button></div>`).join('') || '<p class="empty">검색 결과가 없어요.</p>';
        box.querySelectorAll('[data-room-invite]').forEach(button => button.onclick = async () => {
          button.disabled = true;
          try { await api.addChannelMember(id, button.dataset.roomInvite); if (current !== ticket) return; button.textContent = '초대됨'; loadMembers(); }
          catch (error) { toast(`초대하지 못했습니다. ${clean(error)}`); button.disabled = false; }
        });
      } catch (error) { if (current === ticket && dialog.open) box.innerHTML = `<p class="empty">${esc(clean(error))}</p>`; }
    };
    dialog.showModal(); loadMembers();
  }

  /* ---------- Browse, create channel, create group ---------- */
  function openBrowse(tab = 'browse') {
    if (!state.me || state.demo) return;
    const current = ++ticket, epoch = state.generation, dialog = $('#browse-dialog');
    const alive = () => current === ticket && epoch === state.generation && dialog.open;
    dialog.innerHTML = `<div class="dialog-head"><h2 id="browse-title">채널과 대화 만들기</h2><button type="button" class="icon-btn" id="browse-close" aria-label="닫기">${icon('close')}</button></div><div class="search-tabs browse-tabs">${[['browse', '채널 찾기'], ['create', '채널 만들기'], ['group', '그룹 대화']].map(([key, label]) => `<button type="button" data-browse-tab="${key}">${label}</button>`).join('')}</div><div id="browse-body"></div>`;
    $('#browse-close').onclick = () => dialog.close(); dialog.onclose = () => { ticket++; };
    const body = $('#browse-body');
    const noTeam = '<p class="empty">가입한 팀이 없어 채널을 사용할 수 없습니다.</p>';
    const views = {
      browse() {
        if (!teamList().length) { body.innerHTML = noTeam; return; }
        body.innerHTML = `<div class="browse-query">${teamSelect('browse-team')}<input id="browse-search" placeholder="공개 채널 이름 검색" aria-label="공개 채널 검색"></div><div id="browse-result" class="browse-result"><p class="empty">불러오는 중…</p></div>`;
        let request = 0, timer = 0;
        const run = async () => {
          const seq = ++request;
          try {
            const channels = await api.browseChannels($('#browse-team').value, $('#browse-search').value);
            if (!alive() || seq !== request) return;
            $('#browse-result').innerHTML = channels.map(channel => { const joined = state.channels.some(item => item.id === channel.id); return `<div class="browse-row">${conversationAvatar(channel, true)}<span class="person-copy"><span>${esc(channel.display_name || channel.name)}</span><small>${esc(channel.purpose || channel.header || '공개 채널')}</small></span><button type="button" class="${joined ? 'secondary' : 'primary'}" data-browse-join="${esc(channel.id)}">${joined ? '열기' : '참여'}</button></div>`; }).join('') || '<p class="empty">조건에 맞는 공개 채널이 없어요.</p>';
            $('#browse-result').querySelectorAll('[data-browse-join]').forEach(button => button.onclick = async () => {
              button.disabled = true;
              try {
                const existing = state.channels.find(item => item.id === button.dataset.browseJoin);
                const channel = existing || await api.joinChannel(button.dataset.browseJoin);
                if (epoch !== state.generation) return;
                await enter(channel); if (!existing) toast('채널에 참여했습니다.');
              } catch (error) { toast(`채널에 참여하지 못했습니다. ${clean(error)}`); button.disabled = false; }
            });
          } catch (error) { if (alive() && seq === request) $('#browse-result').innerHTML = `<p class="empty">${esc(clean(error))}</p>`; }
        };
        $('#browse-team').onchange = run;
        $('#browse-search').oninput = () => { clearTimeout(timer); timer = setTimeout(run, 250); };
        run(); $('#browse-search').focus();
      },
      create() {
        if (!teamList().length) { body.innerHTML = noTeam; return; }
        body.innerHTML = `<form id="create-channel-form"><label class="field" ${teamList().length < 2 ? 'hidden' : ''}><span>팀</span>${teamSelect('create-team')}</label><label class="field"><span>채널 이름</span><input id="create-name" maxlength="64" required placeholder="예: 신규 프로젝트"></label><div class="segmented" role="group" aria-label="공개 범위"><button type="button" data-create-type="O" aria-pressed="true"><strong>공개 채널</strong><small>팀원 누구나 찾아서 참여</small></button><button type="button" data-create-type="P" aria-pressed="false"><strong>비공개 채널</strong><small>초대한 사람만 참여</small></button></div><label class="field"><span>목적 <small>(선택)</small></span><input id="create-purpose" maxlength="250" placeholder="이 채널을 어떻게 쓰는지 적어 주세요"></label><p class="error" id="create-error" role="alert"></p><div class="dialog-footer"><button class="primary" type="submit">채널 만들기</button></div></form>`;
        body.querySelectorAll('[data-create-type]').forEach(button => button.onclick = () => body.querySelectorAll('[data-create-type]').forEach(item => item.setAttribute('aria-pressed', String(item === button))));
        $('#create-channel-form').onsubmit = async event => {
          event.preventDefault(); const button = event.submitter; if (button) button.disabled = true; $('#create-error').textContent = '';
          try {
            const channel = await api.createChannel({ team: $('#create-team').value, displayName: $('#create-name').value, type: body.querySelector('[data-create-type][aria-pressed="true"]').dataset.createType, purpose: $('#create-purpose').value });
            if (epoch !== state.generation) return;
            await enter(channel); toast('채널을 만들었습니다.');
          } catch (error) { if (alive()) $('#create-error').textContent = clean(error); }
          finally { if (button) button.disabled = false; }
        };
        $('#create-name').focus();
      },
      group() {
        const picked = new Map();
        body.innerHTML = `<p class="dialog-intro">2~7명을 골라 그룹 대화를 시작하세요.</p><div id="group-picked" class="group-picked"></div><input id="group-search" class="people-search" placeholder="이름이나 아이디 입력 후 Enter" aria-label="그룹에 넣을 사용자 검색"><div id="group-result" class="browse-result"><p class="empty">함께 이야기할 사람을 찾아보세요.</p></div><p class="error" id="group-error" role="alert"></p><div class="dialog-footer"><button class="primary" type="button" id="group-create" disabled>그룹 대화 만들기</button></div>`;
        const paintPicked = () => {
          $('#group-picked').innerHTML = [...picked.values()].map(user => `<button type="button" class="group-chip" data-group-remove="${esc(user.id)}" title="빼기">${esc(displayName(user))} ×</button>`).join('');
          $('#group-picked').querySelectorAll('[data-group-remove]').forEach(button => button.onclick = () => { picked.delete(button.dataset.groupRemove); paintPicked(); body.querySelector(`[data-group-pick="${CSS.escape(button.dataset.groupRemove)}"]`)?.setAttribute('aria-pressed', 'false'); });
          $('#group-create').disabled = picked.size < 2 || picked.size > 7;
          $('#group-create').textContent = picked.size ? `그룹 대화 만들기 (${picked.size + 1}명)` : '그룹 대화 만들기';
        };
        let request = 0;
        $('#group-search').onkeydown = async event => {
          if (event.key !== 'Enter' || event.isComposing) return;
          event.preventDefault(); const term = event.target.value.trim(), seq = ++request; if (term.length < 2) return;
          $('#group-result').innerHTML = '<p class="empty">검색 중…</p>';
          try {
            const users = (await api.searchUsers(term)).filter(user => user.id !== state.me.id);
            if (!alive() || seq !== request) return;
            users.forEach(user => { state.users[user.id] = { ...state.users[user.id], ...user }; });
            $('#group-result').innerHTML = users.map(user => `<button type="button" class="person-row" data-group-pick="${esc(user.id)}" aria-pressed="${picked.has(user.id)}">${accountAvatar(user.id, true)}<span class="person-copy"><span>${esc(displayName(user))}</span><small>@${esc(user.username)}</small></span><span class="group-check" aria-hidden="true">✓</span></button>`).join('') || '<p class="empty">검색 결과가 없어요.</p>';
            $('#group-result').querySelectorAll('[data-group-pick]').forEach(button => button.onclick = event => {
              if (event.target.closest('[data-profile]')) return;
              const user = state.users[button.dataset.groupPick];
              if (picked.has(user.id)) picked.delete(user.id); else if (picked.size < 7) picked.set(user.id, user); else { toast('그룹 대화는 최대 8명까지 가능합니다.'); return; }
              button.setAttribute('aria-pressed', String(picked.has(user.id))); paintPicked();
            });
          } catch (error) { if (alive() && seq === request) $('#group-result').innerHTML = `<p class="empty">${esc(clean(error))}</p>`; }
        };
        $('#group-create').onclick = async event => {
          const button = event.currentTarget; button.disabled = true; $('#group-error').textContent = '';
          try { const channel = await api.createGroup([...picked.keys()]); if (epoch !== state.generation) return; await enter(channel); }
          catch (error) { if (alive()) { $('#group-error').textContent = clean(error); button.disabled = false; } }
        };
        $('#group-search').focus();
      }
    };
    const show = key => { dialog.querySelectorAll('[data-browse-tab]').forEach(button => button.classList.toggle('active', button.dataset.browseTab === key)); views[key](); };
    dialog.querySelectorAll('[data-browse-tab]').forEach(button => button.onclick = () => show(button.dataset.browseTab));
    dialog.showModal(); show(tab);
  }

  /* ---------- Quick switcher ---------- */
  function openSwitcher() {
    if (!state.me || !state.ready || isFloating) return;
    const dialog = $('#switcher-dialog'); let matches = [], selected = 0;
    dialog.innerHTML = `<div class="switcher-box"><div class="search switcher-search">${icon('search')}<input id="switcher-input" placeholder="대화방이나 사람 이름으로 이동" aria-label="빠른 전환" autocomplete="off" role="combobox" aria-expanded="true" aria-controls="switcher-list"></div><div id="switcher-list" class="switcher-list" role="listbox" aria-label="대화방"></div><p class="switcher-hint">↑↓ 이동 · Enter 열기 · Esc 닫기</p></div>`;
    const paint = () => {
      const term = $('#switcher-input').value.trim().toLowerCase();
      matches = state.channels.filter(channel => `${channelName(channel)} ${channel.name || ''} ${channel.type === 'D' ? state.users[directUserId(channel)]?.username || '' : ''}`.toLowerCase().includes(term))
        .sort((a, b) => Number(unreads.any(b.id) || !!state.unread[b.id]) - Number(unreads.any(a.id) || !!state.unread[a.id]) || (b.last_post_at || 0) - (a.last_post_at || 0)).slice(0, 30);
      selected = Math.min(selected, Math.max(0, matches.length - 1));
      $('#switcher-list').innerHTML = matches.map((channel, index) => `<button type="button" role="option" id="switcher-item-${index}" data-switch="${index}" aria-selected="${index === selected}" class="${index === selected ? 'active' : ''}">${conversationAvatar(channel, true)}<span class="person-copy"><span>${esc(channelName(channel))}</span><small>${esc(kind(channel))}${['O', 'P'].includes(channel.type) && state.teams[channel.team_id]?.display_name ? ` · ${esc(state.teams[channel.team_id].display_name)}` : channel.type === 'D' ? ` · @${esc(state.users[directUserId(channel)]?.username || '')}` : ''}</small></span>${unreads.badge(channel.id)}</button>`).join('') || '<p class="empty">일치하는 대화방이 없어요.</p>';
      $('#switcher-input').setAttribute('aria-activedescendant', matches.length ? 'switcher-item-' + selected : '');
      $('#switcher-list').querySelectorAll('[data-switch]').forEach(button => button.onclick = () => go(Number(button.dataset.switch)));
      $('#switcher-list .active')?.scrollIntoView({ block: 'nearest' });
    };
    const go = async index => { const channel = matches[index]; if (!channel) return; dialog.close(); await selectChannel(channel.id); $('#message-input')?.focus(); };
    $('#switcher-input').oninput = () => { selected = 0; paint(); };
    $('#switcher-input').onkeydown = event => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); if (matches.length) { selected = (selected + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length; paint(); } }
      else if (event.key === 'Enter') { event.preventDefault(); go(selected); }
    };
    dialog.onclick = event => { if (event.target === dialog) dialog.close(); };
    dialog.showModal(); paint(); $('#switcher-input').focus();
  }
  document.addEventListener('keydown', event => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'k' || !state.me || !state.ready || isFloating) return;
    if ($('#switcher-dialog').open) { event.preventDefault(); $('#switcher-dialog').close(); return; }
    if (document.querySelector('dialog[open]')) return;
    event.preventDefault(); openSwitcher();
  });

  /* ---------- ~channel links ---------- */
  globalThis.RichTextChannel = name => {
    if (typeof state === 'undefined' || !state.me) return null;
    const channel = state.channels.find(item => item.name === name && ['O', 'P'].includes(item.type));
    return channel ? channelName(channel) : null;
  };
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-channel-mention]'); if (!button || !state.me) return;
    event.preventDefault();
    const channel = state.channels.find(item => item.name === button.dataset.channelMention && ['O', 'P'].includes(item.type));
    if (!channel) { toast('참여 중인 채널이 아닙니다.'); return; }
    if (isFloating) { api.openFloatingChat(channel.id).catch(error => toast(clean(error))); return; }
    document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close()); selectChannel(channel.id);
  });
  function reset() { ticket++; for (const id of ['#room-dialog', '#browse-dialog', '#switcher-dialog']) { $(id).close(); $(id).innerHTML = ''; } }
  return { mountShell, mountHeader, openInfo, openBrowse, openSwitcher, reset };
})();
