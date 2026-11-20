const messageActions = (() => {
  let replies = new Map(), ticket = 0;
  let originals = new Map(), originalRequests = new Map(), menuLink = null;
  const errorText = error => error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
  const replyRoot = channel => replies.get(channel)?.rootId || '';
  function paintReply(channel = state.selected) {
    if (channel !== state.selected || !$('#reply-banner')) return;
    const reply = replies.get(channel), banner = $('#reply-banner');
    banner.hidden = !reply;
    if (!reply) { banner.innerHTML = ''; return; }
    banner.innerHTML = `<div><strong>${esc(reply.name)}님에게 답장</strong><p>${esc(reply.preview.slice(0, 180) || '(첨부 파일)')}</p></div><button type="button" id="cancel-reply" aria-label="답장 취소">×</button>`;
    $('#cancel-reply').onclick = () => { replies.delete(channel); paintReply(channel); };
  }
  function mount(channel) { $('#composer').insertAdjacentHTML('afterbegin', '<div class="reply-banner" id="reply-banner" hidden></div>'); paintReply(channel); }
  function reply(post) {
    replies.set(state.selected, { rootId: post.root_id || post.id, name: displayName(state.users[post.user_id]), preview: post.message }); paintReply();
    if ($('#message-input').hidden) $('#preview-toggle').click(); $('#message-input').focus();
  }
  function sent(channel, root) { if (replyRoot(channel) === root) { replies.delete(channel); paintReply(channel); } }
  function controls() { return ''; }
  function closeMenu(focus = false) { const menu = $('#message-context-menu'); if (!menu) return; const id = menu.dataset.postId, link = menuLink; menuLink = null; menu.hidden = true; menu.innerHTML = ''; if (focus) { if (link?.isConnected) link.focus(); else if (id) document.querySelector(`[data-message-id="${id}"]`)?.focus(); } }
  function openMenu(post, x, y, link = null) {
    const menu = $('#message-context-menu'), own = post.user_id === state.me.id && !post.type?.startsWith('system_');
    menu.innerHTML = [['pin',post.is_pinned?'메시지 고정 해제':'메시지 고정'],['react','이모지 반응'],['reply','답장'],['share','공유'],['copy','내용 복사'],['link','원문 링크 복사'],...(own ? [['edit','수정'],['delete','삭제']] : [])].map(([action,label]) => `<button type="button" role="menuitem" data-post-action="${action}" data-post-id="${esc(post.id)}">${label}</button>`).join('');
    menuLink = link;
    if (link) menu.insertAdjacentHTML('afterbegin', `<button type="button" role="menuitem" data-copy-link="${esc(link.dataset.link)}">링크 주소 복사</button>`);
    menu.dataset.postId = post.id; menu.hidden = false;
    menu.style.left = `${Math.max(8, Math.min(x, innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, innerHeight - menu.offsetHeight - 8))}px`;
    menu.firstElementChild.focus();
  }
  document.addEventListener('contextmenu', event => { const element = event.target.closest('[data-message-id]'); if (!element) return; const post = state.posts.find(p => p.id === element.dataset.messageId); if (post) { event.preventDefault(); openMenu(post, event.clientX, event.clientY, event.target.closest('[data-link]')); } });
  document.addEventListener('pointerdown', event => { if (!event.target.closest('#message-context-menu')) closeMenu(); });
  document.addEventListener('keydown', event => {
    const menu = $('#message-context-menu');
    if (menu && !menu.hidden && ['Escape','ArrowDown','ArrowUp','Home','End'].includes(event.key)) { event.preventDefault(); if (event.key === 'Escape') { closeMenu(true); return; } const buttons = [...menu.querySelectorAll('button')], current = buttons.indexOf(document.activeElement), next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length-1 : (current + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length; buttons[next]?.focus(); return; }
    if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) { const element = event.target.closest('[data-message-id]'); const post = state.posts.find(p => p.id === element?.dataset.messageId); if (post) { event.preventDefault(); const link = event.target.closest('[data-link]'), rect = (link || element).getBoundingClientRect(); openMenu(post, rect.left + 25, rect.top + 25, link); } }
  });
  document.addEventListener('wheel', event => { if (!event.target.closest('#message-context-menu')) closeMenu(); }, { capture: true, passive: true });
  window.addEventListener('resize', () => closeMenu());
  function annotation(post) {
    const count = Math.max(post.reply_count || 0, state.posts.filter(item => item.root_id === post.id).length);
    return `${post.is_pinned?'<span class="post-pin-label">📌 고정된 메시지</span>':''}${post.edit_at ? '<span class="edited-label">수정됨</span>' : ''}${post.root_id || count ? `<button class="thread-link" data-post-action="thread" data-post-id="${esc(post.root_id || post.id)}">${post.root_id ? '↳ 원문·답글 보기' : `답글 ${count}개 보기`}</button>` : ''}`;
  }
  function referenceBody(root) {
    if (root.delete_at) return '<p class="reply-reference-missing">삭제된 원문입니다.</p>';
    return `<div class="reply-reference-heading"><strong class="reply-reference-author">↪ ${esc(displayName(state.users[root.user_id]))}님의 메시지</strong><button type="button" class="reply-reference-jump" data-post-action="original" data-post-id="${esc(root.id)}" aria-label="원본 메시지로 이동">원본으로 이동 ↗</button></div>${root.message ? `<div class="reply-reference-text rich-text">${composer.format(root.message)}</div>` : ''}${media.attachments(root)}${!root.message && !root.file_ids?.length ? '<p class="reply-reference-missing">내용이 없는 메시지입니다.</p>' : ''}`;
  }
  function reference(post) {
    if (!post.root_id) return '';
    const root = state.posts.find(item => item.id === post.root_id) || originals.get(post.root_id);
    return `<div class="reply-reference" data-reply-reference="${esc(post.root_id)}" aria-label="답장 원문"><div class="reply-reference-inner">${root ? referenceBody(root) : '<p class="reply-reference-missing">원문을 불러오는 중…</p>'}</div></div>`;
  }
  async function hydrateReferences() {
    const epoch = state.generation, channel = state.selected;
    const roots = [...new Set(state.posts.map(post => post.root_id).filter(Boolean))];
    for (const post of state.posts) originals.set(post.id, post);
    let index = 0;
    await Promise.all(Array.from({ length: Math.min(4, roots.length) }, async () => {
      while (index < roots.length) {
        const id = roots[index++]; let root = originals.get(id);
        if (!root) {
          try {
            let pending = originalRequests.get(id);
            if (!pending) { pending = state.demo ? Promise.resolve((state.demoPosts[channel] || []).find(post => post.id === id)) : api.post(id); originalRequests.set(id, pending); }
            root = await pending;
            if (epoch !== state.generation) return;
            if (root && root.channel_id && root.channel_id !== channel) root = null;
            if (root) originals.set(id, root);
          } catch { root = null; }
          finally { if (epoch === state.generation) originalRequests.delete(id); }
        }
        if (root && !root.delete_at) await hydrateUsers([root.user_id]).catch(() => {});
        if (epoch !== state.generation || channel !== state.selected) return;
        const area = $('#messages'), bottom = area && area.scrollHeight - area.scrollTop - area.clientHeight < 100;
        document.querySelectorAll('[data-reply-reference]').forEach(element => {
          if (element.dataset.replyReference !== id) return;
          element.firstElementChild.innerHTML = root ? referenceBody(root) : '<p class="reply-reference-missing">원문이 삭제되었거나 접근할 수 없습니다.</p>';
        });
        if (root?.file_ids?.length) await media.hydrateChat([root], channel);
        if (epoch === state.generation && channel === state.selected && bottom) area.scrollTop = area.scrollHeight;
      }
    }));
    if (originals.size > 1000) for (const id of originals.keys()) { if (!roots.includes(id)) originals.delete(id); if (originals.size <= 600) break; }
  }
  function modal(title, body, submit, label) {
    const dialog = $('#message-dialog');
    dialog.innerHTML = `<form id="message-action-form"><div class="dialog-head"><h2 id="message-dialog-title">${title}</h2><button type="button" class="icon-btn" id="message-dialog-close" aria-label="메시지 창 닫기">${icon('close')}</button></div>${body}<p class="error" id="message-action-error" role="alert"></p>${label ? `<div class="dialog-footer"><button type="button" class="secondary" id="message-dialog-cancel">취소</button><button class="primary ${label === '삭제' ? 'danger' : ''}" type="submit">${label}</button></div>` : ''}</form>`;
    $('#message-dialog-close').onclick = () => dialog.close(); if ($('#message-dialog-cancel')) $('#message-dialog-cancel').onclick = () => dialog.close();
    $('#message-action-form').onsubmit = async event => { event.preventDefault(); const button = $('button[type="submit"]', dialog); if (!submit || button.disabled) return; button.disabled = true; try { await submit(dialog); } catch (error) { if ($('#message-action-error')) $('#message-action-error').textContent = errorText(error); } finally { button.disabled = false; } };
    dialog.showModal(); return dialog;
  }
  async function run(action, id) {
    const post = state.posts.find(item => item.id === id), epoch = state.generation, channel = state.selected;
    try {
      if (action === 'pin') return messagePins.toggle(id);
      if (action === 'react') return reactions.openPicker(id);
      if (action === 'thread') return thread(id);
      if (action === 'original') return await messageNavigation.openPost(id);
      if (!post) return;
      if (action === 'reply') return reply(post);
      if (action === 'copy') { await api?.copyText(post.message || ''); toast('메시지 내용을 복사했습니다.'); return; }
      if (action === 'link') { if (state.demo) { toast('데모 메시지는 원문 링크가 없습니다.'); return; } await api.copyText(await api.postLink(id)); toast('원문 링크를 복사했습니다.'); return; }
      if (action === 'edit') {
        modal('메시지 수정', `<label class="field"><span>내용</span><textarea id="edit-message" maxlength="16000" rows="6">${esc(post.message)}</textarea></label><p class="dialog-intro">기존 첨부 파일은 유지됩니다. Ctrl+Enter로 저장할 수 있습니다.</p>`, async dialog => {
          const message = $('#edit-message').value;
          const result = state.demo ? { ...post, message, edit_at: Date.now() } : await api.editPost(id, message);
          if (epoch !== state.generation) return;
          const index = state.posts.findIndex(p => p.id === id); if (index >= 0) state.posts[index] = result;
          if (state.demo) state.demoPosts[channel] = state.posts;
          dialog.close(); if (state.selected === channel) renderMessages(); toast('메시지를 수정했습니다.');
        }, '수정 저장');
        $('#edit-message').onkeydown = event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing) { event.preventDefault(); $('#message-action-form').requestSubmit(); } };
        $('#edit-message').focus(); return;
      }
      if (action === 'delete') {
        modal('메시지를 삭제할까요?', `<p class="dialog-intro">서버에서 메시지가 삭제되어 다른 참여자에게도 적용됩니다.</p><div class="action-preview">${esc(post.message || '(첨부 파일 메시지)')}</div>`, async dialog => {
          if (!state.demo) await api.deletePost(id);
          if (epoch !== state.generation) return;
          originals.set(id, { ...post, delete_at: Date.now() });
          state.posts = state.posts.filter(item => item.id !== id);
          if (state.demo) state.demoPosts[channel] = state.posts;
          if (replyRoot(channel) === id) { replies.delete(channel); paintReply(); }
          media.forgetPost(id); dialog.close(); if (state.selected === channel) renderMessages(); toast('메시지를 삭제했습니다.');
        }, '삭제'); return;
      }
      if (action === 'share') {
        modal('다른 대화방으로 공유', `<p class="dialog-intro">내용과 원문 링크를 공유합니다. 첨부 파일은 원문에서 확인합니다.</p><label class="field"><span>보낼 대화방</span><select id="share-target">${state.channels.map(c => `<option value="${esc(c.id)}">${esc(channelName(c))}${c.type === 'D' ? ` · @${esc(state.users[directUserId(c)]?.username || '')}` : state.teams[c.team_id]?.display_name ? ` · ${esc(state.teams[c.team_id].display_name)}` : ''}</option>`).join('')}</select></label><div class="action-preview">${esc(post.message || '(첨부 파일 메시지)')}</div>`, async dialog => {
          const target = $('#share-target').value;
          const result = state.demo ? { id: crypto.randomUUID(), user_id: 'me', channel_id: target, create_at: Date.now(), message: `공유된 메시지\n${post.message}` } : await api.sharePost(id, target);
          if (epoch !== state.generation) return;
          if (state.demo) (state.demoPosts[target] ||= []).push(result);
          incoming.noteOwn(result);
          if (state.selected === target && !state.posts.some(p => p.id === result.id)) { state.posts.push(result); renderMessages(true); }
          dialog.close(); toast('선택한 대화방에 공유했습니다.');
        }, '공유하기');
      }
    } catch (error) { toast(errorText(error)); }
  }
  async function thread(id) {
    const seq = ++ticket, epoch = state.generation;
    const dialog = modal('원문과 답글', '<div id="thread-content" class="thread-content">불러오는 중…</div>', null, '');
    try {
      const result = state.demo ? { posts: Object.fromEntries(state.posts.filter(p => p.id === id || p.root_id === id).map(p => [p.id, p])) } : await api.thread(id);
      await hydrateUsers(Object.values(result.posts).map(p => p.user_id));
      if (seq !== ticket || epoch !== state.generation || !dialog.open) return;
      const posts = Object.values(result.posts).filter(p => !p.delete_at).sort((a,b) => a.create_at - b.create_at);
      $('#thread-content').innerHTML = posts.map(p => `<article class="thread-post">${accountAvatar(p.user_id,true)}<div><strong>${esc(displayName(state.users[p.user_id]))}</strong><small>${clock(p.create_at)}</small><div class="rich-text">${composer.format(p.message || '(첨부 파일)')}</div>${media.attachments(p)}<button type="button" class="text-btn" data-thread-reply="${esc(p.id)}">답장하기</button></div></article>`).join('') || '<p class="empty">표시할 답글이 없습니다.</p>';
      dialog.querySelectorAll('[data-thread-reply]').forEach(button => button.onclick = () => { const p = posts.find(item => item.id === button.dataset.threadReply); dialog.close(); reply(p); });
      media.hydrateChat(posts, state.selected);
    } catch (error) { if (dialog.open && $('#thread-content')) $('#thread-content').textContent = errorText(error); }
  }
  document.addEventListener('click', async event => {
    const link = event.target.closest('[data-copy-link]');
    if (link) { event.preventDefault(); const address = link.dataset.copyLink; closeMenu(true); try { await api.copyText(address); toast('링크 주소를 복사했습니다.'); } catch (error) { toast(errorText(error)); } return; }
    const button = event.target.closest('[data-post-action]'); if (button) { event.preventDefault(); closeMenu(); run(button.dataset.postAction, button.dataset.postId); }
  });
  function reset() { replies = new Map(); originals = new Map(); originalRequests = new Map(); ticket++; $('#message-dialog').close(); closeMenu(); }
  return { mount, paintReply, replyRoot, sent, controls, annotation, reference, hydrateReferences, reset };
})();
