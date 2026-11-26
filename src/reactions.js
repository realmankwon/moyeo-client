const reactions = (() => {
  let cache = new Map(), versions = new Map(), pending = new Map(), busy = new Set(), postsById = new Map(), detail = null, picker = null, viewTicket = 0;
  const errorText = error => error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
  const values = id => cache.get(id) || [];
  const grouped = id => [...new Set(values(id).map(r => r.emoji_name))].map(name => ({ name, rows: values(id).filter(r => r.emoji_name === name) }));
  function store(id, rows) { cache.set(id, [...new Map((rows || []).filter(r => !r.delete_at && r.post_id === id).map(r => [`${r.user_id}:${r.emoji_name}`, r])).values()]); }
  function body(id) {
    const groups = grouped(id);
    return groups.map(group => {
      const mine = group.rows.some(row => row.user_id === state.me.id), names = group.rows.map(row => displayName(state.users[row.user_id])).join(', ');
      return `<span class="reaction-pill ${mine ? 'mine' : ''}"><button type="button" data-react-toggle="${esc(group.name)}" data-react-post="${esc(id)}" aria-label="${esc(group.name)} 반응 ${mine ? '취소' : '추가'}" aria-pressed="${mine}" title="${esc(names)}" ${busy.has(id) ? 'disabled' : ''}>${composer.reactionEmoji(group.name)}<span>${group.rows.length}</span></button><button type="button" class="reaction-people" data-react-details="${esc(group.name)}" data-react-post="${esc(id)}" aria-label="${esc(group.name)} 반응한 사람 보기" title="반응한 사람 보기">⌄</button></span>`;
    }).join('') + `<button type="button" class="reaction-add" data-react-add="${esc(id)}" title="이모지 반응 추가" aria-label="이모지 반응 추가" ${busy.has(id) ? 'disabled' : ''}>☺＋</button>${groups.length ? `<button type="button" class="reaction-list" data-react-all="${esc(id)}">반응한 사람</button>` : ''}`;
  }
  function markup(post) { postsById.set(post.id, post); return `<div class="reaction-bar" data-reaction-slot="${esc(post.id)}" aria-label="메시지 이모지 반응">${body(post.id)}</div>`; }
  function paint(id) {
    document.querySelectorAll('[data-reaction-slot]').forEach(el => { if (el.dataset.reactionSlot === id) el.innerHTML = body(id); });
    if (detail?.id === id && $('#reaction-details-dialog').open) paintDetails();
  }
  async function read(id) {
    if (pending.has(id)) return pending.get(id);
    const requests = pending, task = api.reactions(id).finally(() => requests.delete(id)); requests.set(id, task); return task;
  }
  async function hydrate(posts, force = false) {
    const epoch = state.generation; let cursor = 0;
    const candidates = posts.filter(post => !post.delete_at);
    await Promise.all(Array.from({ length: Math.min(4, candidates.length) }, async () => {
      while (cursor < candidates.length) {
        const post = candidates[cursor++], id = post.id;
        if (epoch !== state.generation) return;
        postsById.set(id, post);
        if (!cache.has(id) && Array.isArray(post.metadata?.reactions)) store(id, post.metadata.reactions);
        if (state.demo) { paint(id); continue; }
        if (busy.has(id) || (cache.has(id) && !force)) { paint(id); continue; }
        if (!post.has_reactions && !values(id).length && !post.metadata?.reactions?.length) { store(id, []); paint(id); continue; }
        const version = versions.get(id) || 0;
        try {
          const rows = await read(id);
          if (epoch !== state.generation || busy.has(id) || (versions.get(id) || 0) !== version) continue;
          store(id, rows); await hydrateUsers(rows.map(r => r.user_id)).catch(() => {});
          if (epoch === state.generation) paint(id);
        } catch { /* Retain the last known state; opening details retries explicitly. */ }
      }
    }));
  }
  async function toggle(id, name) {
    if (busy.has(id)) return false;
    const epoch = state.generation, enabled = !values(id).some(row => row.user_id === state.me.id && row.emoji_name === name);
    busy.add(id); versions.set(id, (versions.get(id) || 0) + 1); paint(id);
    try {
      const result = state.demo ? { post_id: id, user_id: state.me.id, emoji_name: name, create_at: Date.now() } : await api.setReaction(id, name, enabled);
      if (epoch !== state.generation) return false;
      const next = values(id).filter(row => !(row.user_id === state.me.id && row.emoji_name === name));
      if (enabled) next.push({ ...result, post_id: id, user_id: state.me.id, emoji_name: name });
      store(id, next);
      const post = postsById.get(id); if (post) post.has_reactions = next.length > 0;
      if (!state.demo) {
        try { const rows = await api.reactions(id); if (epoch !== state.generation) return false; store(id, rows); await hydrateUsers(rows.map(r => r.user_id)).catch(() => {}); }
        catch { toast('반응은 저장했지만 목록을 갱신하지 못했습니다. 반응한 사람에서 다시 확인해 주세요.'); }
      }
      if (enabled) await composer.rememberReaction(name);
      if (epoch !== state.generation) return false;
      return true;
    } catch (error) { if (epoch === state.generation) toast(`반응을 저장하지 못했습니다. ${errorText(error)}`); return false; }
    finally { if (epoch === state.generation) { busy.delete(id); paint(id); } }
  }
  async function openPicker(id) {
    if (!postsById.has(id) && !state.posts.some(post => post.id === id)) return;
    picker = { id, query: '', category: 'all' };
    const dialog = $('#reaction-picker-dialog');
    dialog.innerHTML = `<div class="dialog-head"><h2 id="reaction-picker-title">이모지로 반응하기</h2><button class="icon-btn" id="reaction-picker-close" aria-label="반응 선택기 닫기">${icon('close')}</button></div><input id="reaction-search" class="reaction-search" placeholder="이모지 검색 (좋아요, heart, 웃음…)" aria-label="반응 이모지 검색"><div class="reaction-picker-tabs"><button data-reaction-category="recent">🕘 최근 사용</button><button data-reaction-category="all">전체</button><button data-reaction-category="favorite">★ 즐겨찾기</button><button data-reaction-category="custom">서버 이모지</button></div><div id="reaction-options" class="reaction-options"></div><p class="profile-note">이미 누른 반응을 다시 선택하면 취소됩니다.</p>`;
    $('#reaction-picker-close').onclick = () => dialog.close();
    $('#reaction-search').oninput = event => { picker.query = event.target.value; paintPicker(); };
    $('#reaction-search').onkeydown = event => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); $('#reaction-options button')?.click(); } };
    dialog.querySelectorAll('[data-reaction-category]').forEach(button => button.onclick = () => { picker.category = button.dataset.reactionCategory; paintPicker(); });
    if (!dialog.open) dialog.showModal(); paintPicker(); $('#reaction-search').focus();
    const current = picker; await composer.load(); if (picker === current && dialog.open) paintPicker();
  }
  function paintPicker() {
    if (!picker || !$('#reaction-options')) return;
    const query = picker.query.toLowerCase().replace(/^:|:$/g, ''), favorites = personal.get('emojiFavorites');
    document.querySelectorAll('[data-reaction-category]').forEach(button => { const active = button.dataset.reactionCategory === picker.category; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
    const recent = composer.recentOptions();
    let items = (picker.category === 'recent' ? recent : composer.reactionOptions()).filter(item => (['all', 'recent'].includes(picker.category) || (picker.category === 'custom' ? item.category === 'custom' : favorites.includes(item.emoji))) && `${item.name} ${item.keywords || ''} ${item.emoji}`.toLowerCase().includes(query));
    if (query) items.sort((a,b) => Number(b.name === query) - Number(a.name === query));
    const leading = !query && ['all', 'custom'].includes(picker.category) ? recent.filter(item => picker.category !== 'custom' || item.category === 'custom') : [];
    const leadingNames = new Set(leading.map(item => item.name));
    items = items.filter(item => !leadingNames.has(item.name));
    const tile = item => `<button type="button" data-pick-reaction="${esc(item.name)}" title=":${esc(item.name)}:" aria-label="${esc(item.name)}" aria-pressed="${values(picker.id).some(r => r.user_id === state.me.id && r.emoji_name === item.name)}">${composer.reactionEmoji(item.name)}</button>`;
    const recentSection = leading.length
      ? '<section class="reaction-recent-section" aria-label="최근 사용"><p class="emoji-section-label">최근 사용</p><div class="emoji-grid">' + leading.map(tile).join('') + '</div></section>'
      : '';
    const catalog = items.length ? '<div class="emoji-grid">' + items.map(tile).join('') + '</div>' : '';
    const emptyMessage = picker.category === 'recent' && !query ? '최근 사용한 이모지가 없습니다.' : '이모지가 없습니다.';
    $('#reaction-options').innerHTML = recentSection + catalog || '<p class="empty">' + emptyMessage + '</p>';
    document.querySelectorAll('[data-pick-reaction]').forEach(button => button.onclick = async () => { const current = picker; button.disabled = true; const success = await toggle(current.id, button.dataset.pickReaction); if (success && picker === current) $('#reaction-picker-dialog').close(); else button.disabled = false; });
  }

  async function openDetails(id, filter = '') {
    const seq = ++viewTicket, epoch = state.generation, version = versions.get(id) || 0;
    detail = { id, filter };
    const dialog = $('#reaction-details-dialog');
    dialog.innerHTML = `<div class="dialog-head"><h2 id="reaction-details-title">메시지 반응</h2><button class="icon-btn" id="reaction-details-close" aria-label="반응 목록 닫기">${icon('close')}</button></div><div id="reaction-detail-tabs" class="reaction-detail-tabs"></div><div id="reaction-people" class="reaction-people-list"></div><p id="reaction-detail-status" role="status" class="profile-note">최신 반응을 불러오는 중…</p>`;
    $('#reaction-details-close').onclick = () => dialog.close(); if (!dialog.open) dialog.showModal(); paintDetails();
    try {
      const rows = state.demo ? values(id) : await api.reactions(id);
      await hydrateUsers(state.demo ? [] : rows.map(row => row.user_id)).catch(() => {});
      if (seq !== viewTicket || epoch !== state.generation || !dialog.open) return;
      if (!busy.has(id) && (versions.get(id) || 0) === version) store(id, rows); paint(id); $('#reaction-detail-status').textContent = '반응한 사람을 누르면 프로필을 볼 수 있습니다.';
    } catch (error) { if (seq === viewTicket && epoch === state.generation && $('#reaction-detail-status')) $('#reaction-detail-status').textContent = errorText(error); }
  }
  function paintDetails() {
    if (!detail || !$('#reaction-people')) return;
    const groups = grouped(detail.id);
    $('#reaction-detail-tabs').innerHTML = `<button data-detail-filter="" class="${!detail.filter ? 'active' : ''}">전체 ${values(detail.id).length}</button>` + groups.map(group => `<button data-detail-filter="${esc(group.name)}" class="${detail.filter === group.name ? 'active' : ''}">${composer.reactionEmoji(group.name)} ${group.rows.length}</button>`).join('');
    const rows = values(detail.id).filter(row => !detail.filter || row.emoji_name === detail.filter);
    $('#reaction-people').innerHTML = rows.map(row => { const user = state.users[row.user_id]; return `<div class="reaction-person">${accountAvatar(row.user_id,true)}<button class="reaction-user" data-profile="${esc(row.user_id)}"><strong>${esc(displayName(user))}${row.user_id === state.me.id ? ' (나)' : ''}</strong><small>@${esc(user?.username || row.user_id)}</small></button><span class="reaction-person-emoji" title=":${esc(row.emoji_name)}:">${composer.reactionEmoji(row.emoji_name)}<small>:${esc(row.emoji_name)}:</small></span></div>`; }).join('') || '<p class="empty">아직 이 반응을 누른 사람이 없습니다.</p>';
    document.querySelectorAll('[data-detail-filter]').forEach(button => button.onclick = () => { detail.filter = button.dataset.detailFilter; paintDetails(); });
  }
  document.addEventListener('click', event => {
    const add = event.target.closest('[data-react-add]'), choice = event.target.closest('[data-react-toggle]'), people = event.target.closest('[data-react-details]'), all = event.target.closest('[data-react-all]');
    if (add) openPicker(add.dataset.reactAdd);
    else if (choice) toggle(choice.dataset.reactPost, choice.dataset.reactToggle);
    else if (people) openDetails(people.dataset.reactPost, people.dataset.reactDetails);
    else if (all) openDetails(all.dataset.reactAll);
  });
  function reset() { cache = new Map(); versions = new Map(); pending = new Map(); busy = new Set(); postsById = new Map(); detail = null; picker = null; viewTicket++; $('#reaction-picker-dialog').close(); $('#reaction-details-dialog').close(); }
  function receive(reaction,removed=false){const id=reaction.post_id;if(!postsById.has(id)&&!cache.has(id))return;const rows=values(id).filter(row=>row.user_id!==reaction.user_id||row.emoji_name!==reaction.emoji_name);if(!removed)rows.push(reaction);versions.set(id,(versions.get(id)||0)+1);store(id,rows);const post=postsById.get(id);if(post)post.has_reactions=rows.length>0;paint(id);const epoch=state.generation;hydrateUsers([reaction.user_id]).then(()=>{if(epoch===state.generation)paint(id);}).catch(()=>{});}
  return { markup, hydrate, openPicker, receive, reset };
})();
