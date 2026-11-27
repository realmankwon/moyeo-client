const composer = (() => {
  let attachments = new Map(), busy = new Set(), custom = Object.create(null), recents = [], loaded = false, emojiPage = 0, hasMoreEmoji = true, emojiError = '', recentRevision = 0;
  let emojiCategory = 'smile', emojiQuery = '', emojiTab = 'emoji', loadJob = null;
  const aliases = { ...EmojiAliases, ...Object.fromEntries(EmojiData.map(item => [item.name, item.emoji])) };
  const cleanError = error => error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
  const list = channel => attachments.get(channel) || [];
  const format = message => RichText.render(message, custom, aliases);
  function load() {
    if (state.demo || !api) return Promise.resolve();
    if (loadJob) return loadJob;
    if (loaded) return Promise.resolve();
    const job = loadCatalog(); loadJob = job;
    job.finally(() => { if (loadJob === job) loadJob = null; }).catch(() => {});
    return job;
  }
  async function loadCatalog() {
    loaded = true; const epoch = state.generation, revision = recentRevision;
    const results = await Promise.allSettled([api.emojiList(0), api.getEmojiRecents()]);
    if (epoch !== state.generation) return;
    if (results[0].status === 'fulfilled') { results[0].value.forEach(item => { custom[item.name] = item; }); hasMoreEmoji = results[0].value.length === 200; }
    else { emojiError = '서버 이모지를 불러오지 못했습니다. 기본 이모지를 사용할 수 있습니다.'; loaded = false; }
    if (results[1].status === 'fulfilled') {
      recents = [...new Set([...recents, ...results[1].value])].slice(0, 30);
      if (revision !== recentRevision) api.saveEmojiRecents(recents).catch(() => {});
    }
    await loadEmojiNames(recents.map(value => /^:([a-zA-Z0-9_+-]{1,64}):$/.exec(value)?.[1]).filter(Boolean));
    if (epoch !== state.generation) return;
    document.querySelectorAll('.bubble[data-message]').forEach(el => { el.innerHTML = format(el.dataset.message); });
    messageActions.hydrateReferences().catch(() => {});
    if ($('#emoji-panel') && !$('#emoji-panel').hidden) renderPicker();
    userStatus.paint();mentions.paint();
  }
  function mount(channel) {
    const form = $('#composer');
    const tools = [['bold', '굵게', '<b>B</b>'], ['italic', '기울임', '<i>I</i>'], ['strike', '취소선', '<s>S</s>'], ['code', '인라인 코드', '&lt;/&gt;'], ['codeblock', '코드 블록', '{ }'], ['quote', '인용문', '❞'], ['list', '글머리 목록', '≡'], ['link', '링크', '↗']];
    form.insertAdjacentHTML('afterbegin', `<div class="format-toolbar" role="toolbar" aria-label="텍스트 효과">${tools.map(([key, label, content]) => `<button type="button" class="format-button" data-format="${key}" aria-label="${label}" title="${label}">${content}</button>`).join('')}<button type="button" class="preview-toggle" id="preview-toggle" aria-pressed="false">미리보기</button></div><div class="queued-files" id="queued-files"></div>`);
    $('#message-input').insertAdjacentHTML('afterend', '<div class="composer-preview rich-text" id="composer-preview" hidden></div>');
    $('.composer-bottom').insertAdjacentHTML('afterbegin', `<button type="button" class="icon-btn" id="attach-files" title="파일 첨부" aria-label="파일 첨부">${icon('attach')}</button>`);
    form.insertAdjacentHTML('beforeend', '<div class="send-status" id="send-status" role="status" aria-live="polite"></div><div id="emoji-panel" class="emoji-panel" role="dialog" aria-label="이모지 선택기" hidden></div>');
    form.querySelectorAll('[data-format]').forEach(button => button.onclick = () => applyFormat(button.dataset.format));
    $('#attach-files').onclick = () => choose();
    $('#emoji').title = '이모지 선택'; $('#emoji').setAttribute('aria-label', '이모지 선택');
    $('#emoji').onclick = () => { const panel = $('#emoji-panel'); panel.hidden = !panel.hidden; if (!panel.hidden) { emojiQuery = ''; emojiCategory = 'smile'; renderPicker(); load(); $('#emoji-search')?.focus(); } };
    $('#preview-toggle').onclick = () => {
      const preview = $('#composer-preview'), active = preview.hidden;
      preview.hidden = !active; $('#message-input').hidden = active; $('#preview-toggle').setAttribute('aria-pressed', String(active));
      preview.innerHTML = format($('#message-input').value) || '<span class="muted">메시지를 입력하면 텍스트 효과를 확인할 수 있어요.</span>';
      if (!active) $('#message-input').focus();
    };
    const input = $('#message-input');
    input.addEventListener('input', () => { $('#composer-preview').innerHTML = format(input.value); });
    input.addEventListener('paste', event => {
      const files = [...(event.clipboardData?.files || [])]; if (files.length) { event.preventDefault(); attachBrowserFiles(files); }
    });
    input.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && ['b', 'i'].includes(event.key.toLowerCase())) { event.preventDefault(); applyFormat(event.key.toLowerCase() === 'b' ? 'bold' : 'italic'); }
    });
    const pane = $('#chat-pane');
    pane.ondragover = event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); pane.classList.add('drag-active'); } };
    pane.ondragleave = event => { if (!pane.contains(event.relatedTarget)) pane.classList.remove('drag-active'); };
    pane.ondrop = event => { event.preventDefault(); pane.classList.remove('drag-active'); attachBrowserFiles([...event.dataTransfer.files]); };
    update(channel); load(); messageActions.mount(channel);
  }
  function update(channel = state.selected, label = '') {
    if (channel !== state.selected || !$('#queued-files')) return;
    const items = list(channel);
    $('#queued-files').innerHTML = items.map((item, index) => `<div class="queued-file"><span>📎</span><span class="queued-name">${esc(item.name)}<small>${item.id ? '업로드 완료' : '전송 대기'} · ${Math.max(1, Math.round(item.size / 1024))} KB</small></span><button type="button" data-remove-file="${index}" aria-label="${esc(item.name)} 첨부 취소" ${busy.has(channel) ? 'disabled' : ''}>×</button></div>`).join('');
    document.querySelectorAll('[data-remove-file]').forEach(button => button.onclick = () => { const [item] = items.splice(Number(button.dataset.removeFile), 1); if (item?.key) api?.discardAttachment(item.key).catch(() => {}); update(); });
    $('#send').disabled = busy.has(channel); $('#attach-files').disabled = busy.has(channel);
    $('#send').textContent = busy.has(channel) ? '전송 중…' : '전송';
    $('#send-status').textContent = label;
  }
  async function choose(options = {}) {
    if (state.demo) { toast('파일 전송은 Mattermost 서버에 연결한 뒤 사용할 수 있습니다.'); return; }
    const channel = state.selected, epoch = state.generation;
    if (busy.has(channel)) return;
    try {
      const items = await api.chooseAttachments(options);
      if (epoch !== state.generation) return;
      const existing = list(channel);
      if (items.length + existing.length > 10) { for (const item of items) await api.discardAttachment(item.key); throw new Error('한 메시지에 파일은 최대 10개까지 첨부할 수 있습니다.'); }
      attachments.set(channel, [...existing, ...items]); update(channel);
    } catch (error) { toast(cleanError(error)); }
  }
  async function attachBrowserFiles(files) {
    if (!files.length) return;
    if (state.demo) { toast('파일 전송은 서버 연결 후 사용할 수 있습니다.'); return; }
    const channel = state.selected, epoch = state.generation;
    if (busy.has(channel)) return;
    if (files.length + list(channel).length > 10) { toast('한 메시지에 파일은 최대 10개까지 첨부할 수 있습니다.'); return; }
    for (const file of files) {
      try {
        if (file.size > 25 * 1024 * 1024) throw new Error('25MB보다 큰 파일은 파일 선택 버튼으로 첨부해 주세요.');
        const bytes = await file.arrayBuffer();
        if (epoch !== state.generation) return;
        const item = await api.stageAttachment({ name: file.name || 'clipboard.png', type: file.type, bytes });
        if (epoch !== state.generation) return;
        attachments.set(channel, [...list(channel), item]); update(channel);
      } catch (error) { toast(cleanError(error)); }
    }
  }
  function insert(value) {
    const input = $('#message-input'); if (!input) return;
    if (input.hidden) $('#preview-toggle').click();
    input.setRangeText(value, input.selectionStart, input.selectionEnd, 'end');
    input.dispatchEvent(new Event('input', { bubbles: true })); input.focus();
  }
  function applyFormat(type) {
    const input = $('#message-input');
    if (input.hidden) $('#preview-toggle').click();
    const start = input.selectionStart, end = input.selectionEnd, selection = input.value.slice(start, end);
    const wraps = { bold: ['**', '**'], italic: ['*', '*'], strike: ['~~', '~~'], code: ['`', '`'], codeblock: ['```\n', '\n```'], quote: ['> ', ''], list: ['- ', ''], link: ['[', '](https://example.com)'] };
    const [before, after] = wraps[type], content = selection || (type === 'link' ? '링크 이름' : '텍스트');
    const replacement = ['quote', 'list'].includes(type) ? content.split('\n').map(line => before + line).join('\n') : before + content + after;
    input.setRangeText(replacement, start, end, 'end');
    if (!selection) input.setSelectionRange(start + before.length, start + before.length + content.length);
    input.dispatchEvent(new Event('input', { bubbles: true })); input.focus();
  }
  function renderPicker() {
    const panel = $('#emoji-panel'); if (!panel) return;
    const categories = [['recent', '🕘', '최근 사용'], ['favorites', '⭐', '즐겨찾기 이모지'], ['smile', '🙂', '표정'], ['people', '🙋', '사람·손'], ['nature', '🌿', '동물·자연'], ['food', '🍎', '음식'], ['travel', '✈️', '여행'], ['activity', '⚽', '활동'], ['objects', '💡', '사물'], ['symbols', '❤️', '기호'], ['flags', '🏳️', '깃발'], ['custom', '🧩', '서버 이모지']];
    panel.innerHTML = `<div class="emoji-tabs"><button type="button" data-emoji-tab="emoji" class="${emojiTab === 'emoji' ? 'active' : ''}">☺ 이모지</button><button type="button" data-emoji-tab="gif" class="${emojiTab === 'gif' ? 'active' : ''}">▧ GIFs</button><button type="button" id="emoji-close" aria-label="이모지 선택기 닫기">×</button></div>${emojiTab === 'emoji' ? `<div class="emoji-search-wrap"><input id="emoji-search" placeholder="이모지 검색 (웃음, heart, +1…)" aria-label="이모지 검색" value="${esc(emojiQuery)}"></div><div class="emoji-categories">${categories.map(([key, symbol, label]) => `<button type="button" data-emoji-category="${key}" class="${emojiCategory === key ? 'active' : ''}" title="${label}" aria-label="${label}">${symbol}</button>`).join('')}</div><div class="emoji-scroll" id="emoji-results"></div><div class="emoji-footer"><span id="emoji-hover">이모지를 선택하세요</span><button type="button" id="create-emoji">사용자 이모지 추가</button></div>` : '<div class="gif-panel"><span>🎞️</span><h3>움직이는 GIF 보내기</h3><p>컴퓨터에 있는 GIF 파일을 선택하세요.<br>첨부한 뒤 전송 버튼으로 보낼 수 있어요.</p><button type="button" class="primary" id="choose-gif">GIF 파일 선택</button></div>'}`;
    panel.querySelectorAll('[data-emoji-tab]').forEach(button => button.onclick = () => { emojiTab = button.dataset.emojiTab; renderPicker(); });
    $('#emoji-close').onclick = () => { panel.hidden = true; };
    if (emojiTab === 'gif') { panel.querySelector('.gif-panel').className = 'giphy-panel'; gifs.mount(panel.querySelector('.giphy-panel')); return; }
    panel.querySelectorAll('[data-emoji-category]').forEach(button => button.onclick = () => { emojiCategory = button.dataset.emojiCategory; emojiQuery = ''; renderPicker(); });
    $('#emoji-search').oninput = event => { emojiQuery = event.target.value; renderEmojiResults(); };
    $('#emoji-search').onkeydown = event => {
      if ((event.key === 'Enter' || event.key === 'ArrowDown') && !event.isComposing) { event.preventDefault(); const first = $('#emoji-results [data-emote]'); if (event.key === 'Enter') first?.click(); else first?.focus(); }
    };
    $('#create-emoji').onclick = createEmoji;
    renderEmojiResults();
  }
  function renderEmojiResults() {
    const area = $('#emoji-results'); if (!area) return;
    const customItems = Object.values(custom).map(item => ({ emoji: `:${item.name}:`, name: item.name, category: 'custom', image_url: item.image_url, keywords: '서버 사용자' }));
    const all = [...EmojiData, ...customItems];
    const recentItems = recentOptions();
    let items = emojiQuery ? all.filter(item => `${item.name} ${item.keywords} ${item.emoji}`.toLowerCase().includes(emojiQuery.toLowerCase().replace(/^:|:$/g, ''))) : ['recent','favorites'].includes(emojiCategory) ? (emojiCategory === 'recent' ? recentItems : personal.get('emojiFavorites').map(value => all.find(item => item.emoji === value)).filter(Boolean)) : all.filter(item => item.category === emojiCategory);
    if (emojiQuery) { const exact = emojiQuery.toLowerCase().replace(/^:|:$/g, ''); items.sort((a, b) => Number(b.name.toLowerCase() === exact) - Number(a.name.toLowerCase() === exact)); }
    const title = emojiQuery ? '검색 결과' : emojiCategory === 'recent' ? '최근 사용' : emojiCategory === 'favorites' ? '즐겨찾기' : emojiCategory === 'custom' ? '서버 이모지' : '이모지';
    const sections = [];
    const leadingRecents = emojiCategory === 'custom' ? recentItems.filter(item => item.category === 'custom') : recentItems;
    if (!emojiQuery && !['recent','favorites'].includes(emojiCategory) && leadingRecents.length) sections.push({ key: 'recent', title: '최근 사용', items: leadingRecents });
    sections.push({ key: emojiQuery ? 'search' : emojiCategory, title, items });
    let offset = 0;
    const markup = sections.map(section => {
      const start = offset; offset += section.items.length;
      return `<section class="emoji-result-section" data-emoji-section="${section.key}" aria-label="${section.title}"><p class="emoji-section-label">${section.title}</p><div class="emoji-grid">${section.items.map((item, index) => `<button type="button" data-emote="${start + index}" title=":${esc(item.name)}:" aria-label="${esc(item.name)}">${item.image_url ? `<img src="${esc(item.image_url)}" alt="${esc(item.name)}">` : item.emoji}</button>`).join('')}</div>${!section.items.length ? '<p class="empty">해당하는 이모지가 없어요.</p>' : ''}</section>`;
    }).join('');
    items = sections.flatMap(section => section.items);
    area.innerHTML = markup + (emojiError ? `<p class="emoji-warning">${esc(emojiError)}</p>` : '') + (emojiCategory === 'custom' && hasMoreEmoji && !state.demo ? '<button type="button" class="text-btn" id="more-emoji">서버 이모지 더 불러오기</button>' : '');
    area.querySelectorAll('[data-emote]').forEach(button => {
      const item = items[Number(button.dataset.emote)];
      const wrapper = document.createElement('span'); wrapper.className = 'emoji-cell'; button.replaceWith(wrapper); wrapper.append(button);
      const pinned = personal.get('emojiFavorites').includes(item.emoji);
      wrapper.insertAdjacentHTML('beforeend', `<button type="button" class="emoji-pin ${pinned ? 'pinned' : ''}" aria-label="${esc(item.name)} 즐겨찾기" aria-pressed="${pinned}">★</button>`);
      wrapper.lastElementChild.onclick = async () => { try { await personal.toggle('emojiFavorites', item.emoji); renderEmojiResults(); } catch (error) { toast(cleanError(error)); } };
      button.onmouseenter = () => { $('#emoji-hover').textContent = `:${item.name}:`; };
      button.onclick = () => {
        insert(item.emoji); rememberEmoji(item.emoji);
        $('#emoji-panel').hidden = true;
      };
    });
    if ($('#more-emoji')) $('#more-emoji').onclick = async () => {
      const button = $('#more-emoji'), epoch = state.generation; button.disabled = true;
      try { const items = await api.emojiList(emojiPage + 1); if (epoch !== state.generation) return; emojiPage++; items.forEach(item => { custom[item.name] = item; }); hasMoreEmoji = items.length === 200; renderEmojiResults(); }
      catch (error) { toast(cleanError(error)); button.disabled = false; }
    };
  }
  function createEmoji() {
    if (state.demo) { toast('사용자 이모지는 서버에 연결한 뒤 추가할 수 있습니다.'); return; }
    const dialog = $('#custom-emoji-dialog');
    dialog.innerHTML = `<form id="custom-emoji-form" novalidate><div class="dialog-head"><h2>사용자 이모지 추가</h2><button type="button" class="icon-btn" id="custom-emoji-close" aria-label="닫기">${icon('close')}</button></div><p class="dialog-intro">이름을 입력한 뒤 PNG·GIF·JPG 이미지를 선택하세요.<br>서버에서 허용된 계정만 추가할 수 있습니다.</p><label class="field"><span>이모지 이름</span><input id="custom-emoji-name" placeholder="team_hello" maxlength="64"></label><p id="custom-emoji-error" class="error" role="alert"></p><button type="submit" class="primary">이미지 선택 후 추가</button></form>`;
    $('#custom-emoji-close').onclick = () => dialog.close();
    $('#custom-emoji-form').onsubmit = async event => {
      event.preventDefault(); const button = $('button[type="submit"]', dialog); button.disabled = true;
      try { const item = await api.createEmoji($('#custom-emoji-name').value.trim()); if (item) { custom[item.name] = item; emojiCategory = 'custom'; emojiQuery = ''; dialog.close(); renderPicker(); toast('사용자 이모지를 추가했습니다.'); } }
      catch (error) { $('#custom-emoji-error').textContent = cleanError(error); }
      finally { button.disabled = false; }
    };
    dialog.showModal();
  }
  async function send(event) {
    event.preventDefault(); const channel = state.selected, epoch = state.generation;
    const input = $('#message-input'), message = input.value.trim(), items = [...list(channel)], rootId = messageActions.replyRoot(channel);
    if (busy.has(channel) || (!message && !items.length)) return;
    busy.add(channel); update(channel, items.length ? '첨부 파일 업로드 준비 중…' : '메시지 전송 중…');
    try {
      // Mattermost slash commands run on the server instead of being posted as text.
      if (!state.demo && !items.length && !rootId && /^\/[^\s/]/.test(message)) {
        const room = state.channels.find(item => item.id === channel);
        await api.executeCommand(channel, message, room?.team_id || Object.keys(state.teams)[0] || '');
        if (epoch !== state.generation) return;
        if (state.drafts[channel]?.trim() === message) delete state.drafts[channel];
        if (state.selected === channel && $('#message-input').value.trim() === message) $('#message-input').value = '';
        return;
      }
      for (let index = 0; index < items.length; index++) {
        if (epoch !== state.generation) return;
        update(channel, `파일 업로드 ${index + 1}/${items.length} · ${items[index].name}`);
        if (!items[index].id) { const result = await api.uploadAttachment(channel, items[index].key); items[index].id = result.id; }
      }
      if (epoch !== state.generation) return;
      const post = state.demo ? { id: crypto.randomUUID(), user_id: 'me', channel_id: channel, message, create_at: Date.now(), root_id: rootId } : await api.send(channel, message, items.map(item => item.id), rootId);
      if (epoch !== state.generation) return;
      if (state.demo) (state.demoPosts[channel] ||= []).push(post);
      incoming.noteOwn(post);
      messageActions.sent(channel, rootId);
      attachments.set(channel, list(channel).filter(item => !items.includes(item)));
      for (const item of items) if (item.key) api.discardAttachment(item.key).catch(() => {});
      if (state.drafts[channel]?.trim() === message) delete state.drafts[channel];
      if (state.selected === channel) {
        if (!state.posts.some(item => item.id === post.id)) state.posts.push(post);
        if ($('#message-input').value.trim() === message) $('#message-input').value = '';
        $('#composer-preview').innerHTML = ''; renderMessages(true);
      }
      state.previews[channel] = post.message || `첨부 파일 ${items.length}개`;
      const room = state.channels.find(item => item.id === channel); if (room) room.last_post_at = post.create_at;
      state.channels.sort((a, b) => b.last_post_at - a.last_post_at); renderChannelList();
    } catch (error) { if (epoch === state.generation) toast(`전송하지 못했습니다. ${cleanError(error)} 입력 내용과 첨부는 유지됩니다.`); }
    finally { if (epoch === state.generation) { busy.delete(channel); update(channel); if (state.selected === channel) $('#message-input')?.focus(); } }
  }
  document.addEventListener('pointerdown', event => { if ($('#emoji-panel') && !event.target.closest('#emoji-panel,#emoji,#custom-emoji-dialog')) $('#emoji-panel').hidden = true; });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && $('#emoji-panel') && !$('#emoji-panel').hidden) { event.preventDefault(); $('#emoji-panel').hidden = true; event.stopPropagation(); } });
  document.addEventListener('click', event => { const link = event.target.closest('[data-link]'); if (link) { event.preventDefault(); messageNavigation.open(link.dataset.link).catch(error => toast(cleanError(error))); } });
  function reset() { attachments = new Map(); busy = new Set(); custom = Object.create(null); recents = []; recentRevision = 0; loaded = false; loadJob = null; emojiPage = 0; emojiError = ''; hasMoreEmoji = true; emojiCategory = 'smile'; emojiQuery = ''; emojiTab = 'emoji'; $('#custom-emoji-dialog').close(); }
  async function queueGif(id) {
    const channel = state.selected, epoch = state.generation;
    if (busy.has(channel)) return;
    if (list(channel).length >= 10) { toast('첨부는 최대 10개까지 가능합니다.'); return; }
    try {
      toast('GIF를 가져오는 중…'); const item = await api.stageGif(id);
      if (epoch !== state.generation) return;
      if (list(channel).length >= 10) { await api.discardAttachment(item.key); throw new Error('첨부는 최대 10개까지 가능합니다.'); }
      attachments.set(channel, [...list(channel), item]); update(channel);
      await personal.save('gifRecents', [id, ...personal.get('gifRecents').filter(value => value !== id)].slice(0, 30));
      if (epoch !== state.generation) return;
      if ($('#emoji-panel')) $('#emoji-panel').hidden = true; toast('GIF를 첨부했습니다. 전송 버튼으로 보내세요.');
    } catch (error) { toast(cleanError(error)); }
  }
  async function loadEmojiNames(names){const epoch=state.generation;if(state.demo||!api?.emojiByName)return;const known=new Set([...Object.keys(aliases),...reactionOptions().map(item=>item.name)]);await Promise.allSettled([...new Set(names)].filter(name=>/^[a-zA-Z0-9_+-]{1,64}$/.test(name)&&!known.has(name)).slice(0,30).map(async name=>{const item=await api.emojiByName(name);if(epoch===state.generation)custom[item.name]=item;}));}
  async function rememberEmoji(value) {
    recentRevision++; recents = [value, ...recents.filter(item => item !== value)].slice(0, 30);
    const epoch = state.generation;
    if (!state.demo) try { await api.saveEmojiRecents(recents); }
    catch (error) { if (epoch === state.generation) toast('최근 사용 기록을 저장하지 못했습니다. ' + cleanError(error)); }
  }
  function rememberReaction(name) { return rememberEmoji(Object.hasOwn(custom, name) ? ':' + name + ':' : aliases[name] || ':' + name + ':'); }
  function recentOptions() {
    const options = reactionOptions();
    return recents.map(value => {
      const item = options.find(item => item.emoji === value); if (item) return item;
      const alias = Object.entries(aliases).find(([name, emoji]) => emoji === value && /^[a-zA-Z0-9_+-]{1,64}$/.test(name));
      return alias && { name: alias[0], emoji: value, category: 'standard', keywords: '' };
    }).filter(Boolean);
  }
  function reactionOptions() { return [...EmojiData, ...Object.values(custom).map(item => ({ name: item.name, emoji: `:${item.name}:`, image_url: item.image_url, category: 'custom', keywords: '서버 사용자' }))]; }
  function reactionEmoji(name) { const fallback = { thumbsup: '👍', thumbsdown: '👎', eyes: '👀' }; return Object.hasOwn(custom, name) ? `<img class="reaction-custom" src="${esc(custom[name].image_url)}" alt=":${esc(name)}:">` : esc(Object.hasOwn(aliases, name) ? aliases[name] : Object.hasOwn(fallback, name) ? fallback[name] : `:${name}:`); }
  return { mount, send, format, reset, load, loadEmojiNames, queueGif, reactionOptions, reactionEmoji, recentOptions, rememberReaction, chooseGifFile: () => { $('#emoji-panel').hidden = true; choose({ gifOnly: true }); } };
})();
