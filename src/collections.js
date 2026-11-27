/* Recent mentions and saved (flagged) messages. */
const collections = (() => {
  let saved = new Set(), loadedFor = -1, ticket = 0, busy = new Set();
  const clean = error => error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
  const isSaved = id => saved.has(id);
  function load() {
    if (!state.me || state.demo || loadedFor === state.generation || !api?.savedPostIds) return;
    const epoch = loadedFor = state.generation;
    api.savedPostIds().then(ids => { if (epoch !== state.generation) return; saved = new Set(ids); if (saved.size && $('#messages')) repaint(); }).catch(() => { if (epoch === state.generation) loadedFor = -1; });
  }
  function repaint() {
    const area = $('#messages'); if (!area) return;
    const top = area.scrollTop, bottom = area.scrollHeight - area.scrollTop - area.clientHeight < 100;
    renderMessages(bottom); if (!bottom && $('#messages')) $('#messages').scrollTop = top;
  }
  async function toggle(id) {
    if (busy.has(id) || !state.me) return;
    busy.add(id); const epoch = state.generation, enabled = !saved.has(id);
    try {
      if (!state.demo) await api.setSavedPost(id, enabled);
      if (epoch !== state.generation) return;
      if (enabled) saved.add(id); else saved.delete(id);
      repaint(); toast(enabled ? '메시지를 저장했습니다. 왼쪽 ‘저장’에서 모아볼 수 있어요.' : '저장을 해제했습니다.');
      if ($('#collection-dialog').open && $('#collection-dialog').dataset.kind === 'saved') open('saved');
    } catch (error) { if (epoch === state.generation) toast(`저장 상태를 바꾸지 못했습니다. ${clean(error)}`); }
    finally { busy.delete(id); }
  }
  async function open(kind = 'mentions') {
    if (!state.me || state.demo) return;
    const current = ++ticket, epoch = state.generation, dialog = $('#collection-dialog');
    dialog.dataset.kind = kind;
    dialog.innerHTML = `<div class="dialog-head"><h2 id="collection-title">${kind === 'saved' ? '저장한 메시지' : '나를 멘션한 메시지'}</h2><button type="button" class="icon-btn" id="collection-close" aria-label="닫기">${icon('close')}</button></div><div class="search-tabs"><button type="button" data-collection="mentions" class="${kind === 'mentions' ? 'active' : ''}">멘션</button><button type="button" data-collection="saved" class="${kind === 'saved' ? 'active' : ''}">저장한 메시지</button></div><p id="collection-status" role="status">불러오는 중…</p><div id="collection-list" class="search-results"></div>`;
    $('#collection-close').onclick = () => dialog.close(); dialog.onclose = () => { ticket++; };
    dialog.querySelectorAll('[data-collection]').forEach(button => button.onclick = () => open(button.dataset.collection));
    if (!dialog.open) dialog.showModal();
    try {
      const result = kind === 'saved' ? await api.savedPosts()
        : await api.searchContent({ terms: '@' + state.me.username, mode: 'posts', page: 0, or: true, archived: false, timeZoneOffset: -new Date().getTimezoneOffset() * 60 });
      const posts = (result.order || Object.keys(result.posts || {})).map(id => result.posts?.[id]).filter(post => post && !post.delete_at).sort((a, b) => b.create_at - a.create_at);
      await hydrateUsers(posts.map(post => post.user_id));
      if (current !== ticket || epoch !== state.generation || !dialog.open) return;
      if (kind === 'saved') saved = new Set([...saved, ...posts.map(post => post.id)]);
      $('#collection-status').textContent = posts.length ? `${posts.length}개` : '';
      $('#collection-list').innerHTML = posts.map(post => { const channel = state.channels.find(item => item.id === post.channel_id); return `<article class="search-result"><div class="search-result-heading">${accountAvatar(post.user_id, true)}<strong>${esc(displayName(state.users[post.user_id]))}</strong><small>${esc(channel ? channelName(channel) : '다른 대화방')} · ${new Date(post.create_at).toLocaleString('ko-KR')}</small></div><div class="search-result-copy rich-text">${composer.format(post.message || '첨부 파일 메시지')}</div><div class="search-result-actions"><button type="button" class="secondary" data-collection-open="${esc(post.id)}">원문으로 이동</button>${kind === 'saved' ? `<button type="button" class="text-btn" data-collection-unsave="${esc(post.id)}">저장 해제</button>` : ''}</div></article>`; }).join('')
        || `<div class="empty">${kind === 'saved' ? '저장한 메시지가 없어요.<br>메시지를 우클릭해 ‘메시지 저장’을 눌러 보세요.' : '아직 나를 멘션한 메시지가 없어요.'}</div>`;
      $('#collection-list').querySelectorAll('[data-collection-open]').forEach(button => button.onclick = async () => {
        button.disabled = true;
        try { const address = await api.postLink(button.dataset.collectionOpen); dialog.close(); await messageNavigation.open(address); }
        catch (error) { toast(clean(error)); } finally { button.disabled = false; }
      });
      $('#collection-list').querySelectorAll('[data-collection-unsave]').forEach(button => button.onclick = () => toggle(button.dataset.collectionUnsave));
      mentions.paint($('#collection-list'));
    } catch (error) { if (current === ticket && dialog.open) $('#collection-status').textContent = clean(error); }
  }
  function reset() { saved = new Set(); loadedFor = -1; busy = new Set(); ticket++; $('#collection-dialog').close(); $('#collection-dialog').innerHTML = ''; }
  return { load, isSaved, toggle, open, reset };
})();
