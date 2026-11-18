const personal = (() => {
  const empty = () => ({ emojiFavorites: [], gifFavorites: [], gifRecents: [], roomThemes: {} });
  let data = empty(), ready = false, profileTicket = 0;
  let toggleQueue = Promise.resolve();
  const err = error => error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
  async function load() { const epoch = state.generation; try { const value = await api.getPersonalSettings(); if (epoch !== state.generation) return; data = value; ready = true; } catch (error) { toast(err(error)); } }
  async function save(field, value) {
    const epoch = state.generation;
    if (state.demo) { data[field] = value; return; }
    if (!ready) { await load(); if (!ready) throw new Error('개인 설정을 읽을 수 없어 저장하지 못했습니다.'); }
    const result = await api.savePersonalSettings(field, value);
    if (epoch === state.generation) data = result;
  }
  const get = field => data[field];
  function toggle(field, value) { const epoch = state.generation; const task = toggleQueue.catch(() => {}).then(async () => { if (epoch !== state.generation) return; const values = data[field]; await save(field, values.includes(value) ? values.filter(item => item !== value) : [value, ...values]); }); toggleQueue = task; return task; }
  const base = () => ({ background: state.settings.chatBackground, accent: state.settings.accent, selfText: '#302b16', otherBubble: '#ffffff', otherText: '#252a33', surface: '#ffffff', text: '#252a33', fontSize: 13, pattern: 'none' });
  function apply(override) {
    const pane = $('#chat-pane'); if (!pane) return;
    const theme = override || data.roomThemes[state.selected];
    for (const variable of ['--chat-background', '--accent', '--accent-ink', '--bubble-bg', '--bubble-ink', '--pane-surface', '--pane-ink', '--message-size']) pane.style.removeProperty(variable);
    pane.style.removeProperty('background-image');
    if (!theme) return;
    for (const [name, value] of Object.entries({ '--chat-background': theme.background, '--accent': theme.accent, '--accent-ink': theme.selfText, '--bubble-bg': theme.otherBubble, '--bubble-ink': theme.otherText, '--pane-surface': theme.surface, '--pane-ink': theme.text, '--message-size': `${theme.fontSize}px` })) pane.style.setProperty(name, value);
    if (theme.pattern === 'dots') pane.style.backgroundImage = 'radial-gradient(#8390a530 1px, transparent 1px)', pane.style.backgroundSize = '16px 16px';
    else pane.style.backgroundSize = '';
  }
  function openTheme() {
    const room = state.selected, dialog = $('#theme-dialog'), saved = data.roomThemes[room];
    let draft = { ...base(), ...saved };
    const presets = { 기본: base(), 민트: { ...base(), background: '#e3efea', accent: '#7bc6a2' }, 라벤더: { ...base(), background: '#eee9f7', accent: '#cab9eb' }, 로즈: { ...base(), background: '#f6e9ed', accent: '#efb6c7' }, 밤: { ...base(), background: '#1a2431', accent: '#758fc6', selfText: '#ffffff', otherBubble: '#2c3a4d', otherText: '#e8eef7', surface: '#222f40', text: '#e8eef7' } };
    dialog.innerHTML = `<form id="theme-form"><div class="dialog-head"><h2 id="theme-title">대화방 꾸미기</h2><button type="button" id="theme-close" class="icon-btn" aria-label="테마 닫기">${icon('close')}</button></div><p class="dialog-intro">${esc(channelName(state.channels.find(c => c.id === room)))}<br>이 PC의 현재 계정에만 적용됩니다. 다른 참여자의 화면은 바뀌지 않습니다.</p><div class="theme-presets">${Object.entries(presets).map(([name, theme]) => `<button type="button" data-theme-preset="${name}"><span style="background:${theme.background};border-color:${theme.accent}"></span>${name}</button>`).join('')}</div><div class="theme-colors">${[['background', '채팅 배경'], ['accent', '내 말풍선'], ['selfText', '내 글자색'], ['otherBubble', '상대 말풍선'], ['otherText', '상대 글자색'], ['surface', '입력창·헤더'], ['text', '헤더 글자색']].map(([key, name]) => `<label>${name}<input type="color" name="${key}" value="${draft[key]}"></label>`).join('')}</div><div class="theme-options"><label>글자 크기<select name="fontSize">${[12,13,14,15,16,18,20].map(n => `<option ${n === draft.fontSize ? 'selected' : ''}>${n}</option>`).join('')}</select></label><label>배경 무늬<select name="pattern"><option value="none">없음</option><option value="dots" ${draft.pattern === 'dots' ? 'selected' : ''}>도트</option></select></label></div><div class="theme-sample"><span>이렇게 보입니다</span><span>우리 대화방에 맞게 ✨</span></div><div class="dialog-footer"><button type="button" id="theme-reset" class="text-btn">이 방의 설정 초기화</button><button class="primary" type="submit">테마 저장</button></div><p id="theme-error" class="error" role="alert"></p></form>`;
    const sync = () => { draft = Object.fromEntries(new FormData($('#theme-form'))); draft.fontSize = Number(draft.fontSize); apply(draft); const sample = $('.theme-sample'); sample.style.background = draft.background; sample.firstElementChild.style.background = draft.otherBubble; sample.firstElementChild.style.color = draft.otherText; sample.lastElementChild.style.background = draft.accent; sample.lastElementChild.style.color = draft.selfText; sample.style.fontSize = `${draft.fontSize}px`; };
    $('#theme-form').oninput = sync;
    dialog.querySelectorAll('[data-theme-preset]').forEach(button => button.onclick = () => { for (const [key, value] of Object.entries(presets[button.dataset.themePreset])) { if ($('#theme-form').elements[key]) $('#theme-form').elements[key].value = value; } sync(); });
    $('#theme-close').onclick = () => dialog.close(); dialog.onclose = () => apply();
    $('#theme-form').onsubmit = async event => { event.preventDefault(); try { await save('roomThemes', { ...data.roomThemes, [room]: draft }); dialog.close(); toast('이 대화방의 테마를 저장했습니다.'); } catch (error) { $('#theme-error').textContent = err(error); } };
    $('#theme-reset').onclick = async () => { try { const next = { ...data.roomThemes }; delete next[room]; await save('roomThemes', next); dialog.close(); toast('대화방 기본 테마로 되돌렸습니다.'); } catch (error) { $('#theme-error').textContent = err(error); } };
    dialog.showModal(); sync();
  }
  async function profile(id) {
    const ticket = ++profileTicket, epoch = state.generation, dialog = $('#profile-dialog');
    const paint = (user, status = null, error = '') => {
      if (ticket !== profileTicket || epoch !== state.generation) return;
      if (!user) return;
      let custom = ''; try { custom = JSON.parse(user.props?.customStatus || '{}').text || ''; } catch { /* Optional server field. */ }
      const statuses = { online: '온라인', away: '자리 비움', dnd: '방해 금지', offline: '오프라인' };
      dialog.innerHTML = `<div class="dialog-head"><h2 id="profile-title">프로필</h2><button class="icon-btn" id="profile-close" aria-label="프로필 닫기">${icon('close')}</button></div><div class="profile-hero">${accountAvatar(user.id)}<h3>${esc(displayName(user))}</h3><p>@${esc(user.username || '')}</p><span class="profile-status">${esc(statuses[status?.status] || (error ? '정보를 불러오지 못했습니다' : '상태 정보 없음'))}</span>${custom ? `<p>${esc(custom)}</p>` : ''}</div><dl class="profile-details">${[['이름', [user.first_name, user.last_name].filter(Boolean).join(' ')], ['별명', user.nickname], ['이메일', user.email], ['직책', user.position], ['언어', user.locale], ['계정 생성', user.create_at ? new Date(user.create_at).toLocaleDateString('ko-KR') : '']].filter(([, value]) => value).map(([name, value]) => `<div><dt>${name}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>${error ? `<p class="error">${esc(error)}</p>` : ''}<p class="profile-note">서버에서 공개된 정보만 표시합니다.</p>${user.id !== state.me.id ? '<button class="primary profile-dm" id="profile-dm">개인 메시지 보내기</button>' : '<p class="profile-note">내 프로필입니다.</p>'}`;
      $('#profile-close').onclick = () => dialog.close();
      if ($('#profile-dm')) $('#profile-dm').onclick = async event => {
        event.target.disabled = true;
        try {
          const room = state.demo ? state.channels.find(c => c.type === 'D' && c.name.includes(id)) || { id, name: `me__${id}`, type: 'D', last_post_at: Date.now() } : await api.direct(id);
          if (epoch !== state.generation) return;
          if (!state.channels.some(c => c.id === room.id)) state.channels.unshift(room);
          dialog.close(); state.filter = 'all'; state.search = ''; renderShell(); await selectChannel(room.id);
        } catch (error) { toast(err(error)); event.target.disabled = false; }
      };
    };
    const cached = state.users[id] || (id === state.me.id ? state.me : { id, username: '불러오는 중…' });
    paint(cached); if (!dialog.open) dialog.showModal();
    dialog.onclose = () => { profileTicket++; };
    if (!state.demo) try { const result = await api.userProfile(id); if (epoch !== state.generation || ticket !== profileTicket) return; state.users[id] = result.user; paint(result.user, result.status); } catch (error) { paint(cached, null, err(error)); }
  }
  document.addEventListener('click', event => { const target = event.target.closest('[data-profile]'); if (target && !target.closest('#profile-dialog')) { event.preventDefault(); event.stopPropagation(); profile(target.dataset.profile); } }, true);
  document.addEventListener('keydown', event => { const target = event.target.closest('[data-profile]'); if (target && !target.closest('#profile-dialog') && ['Enter',' '].includes(event.key)) { event.preventDefault(); event.stopPropagation(); profile(target.dataset.profile); } }, true);
  function reset() { data = empty(); ready = false; profileTicket++; $('#profile-dialog').close(); $('#theme-dialog').close(); }
  return { load, save, get, toggle, apply, openTheme, reset };
})();
