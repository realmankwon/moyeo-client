const media = (() => {
  new ResizeObserver(()=>document.documentElement.style.setProperty('--saved-file-height',document.querySelector('#saved-file-notice').getBoundingClientRect().height+'px')).observe(document.querySelector('#saved-file-notice'));
  let files = new Map(), pending = new Map(), libraries = new Map(), failedFiles = new Set();
  let activeChannel = null, filter = 'media', query = '', sort = 'newest', viewing = null, viewerTicket = 0;
  let animatedNodes=new Map(), zoomCleanup=()=>{};
  function keepAnimation(image,key){const old=animatedNodes.get(key);if(old&&old.src===image.src&&old!==image){image.replaceWith(old);image=old;}animatedNodes.delete(key);animatedNodes.set(key,image);while(animatedNodes.size>80)animatedNodes.delete(animatedNodes.keys().next().value);}
  const animationKey=element=>(element.closest('[data-message-id]')?.dataset.messageId||'')+':'+(element.closest('[data-reply-reference]')?.dataset.replyReference||'');
  const kind = file => FileTypes.classify(file);
  const isGif = file => /image\/gif/i.test(file.mime_type || '') || /\.gif$/i.test(file.name || '') || file.extension?.toLowerCase() === 'gif';
  const size = bytes => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round((bytes || 0) / 1024))} KB`;
  const errorText = error => error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
  function library(id) {
    if (!libraries.has(id)) libraries.set(id, { refs: new Map(), cursor: undefined, complete: false, checked: 0, loading: false, error: '' });
    return libraries.get(id);
  }
  function remember(posts, channel) {
    const lib = library(channel);
    for (const post of posts) {
      if (post.delete_at) continue;
      for (const id of post.file_ids || []) lib.refs.set(id, { id, post_id: post.id, create_at: post.create_at, user_id: post.user_id });
    }
  }
  function entries(channel = activeChannel) {
    return [...library(channel).refs.values()].sort((a, b) => b.create_at - a.create_at || a.id.localeCompare(b.id));
  }
  async function info(id) {
    if (files.has(id)) return files.get(id);
    if (pending.has(id)) return pending.get(id);
    const epoch = state.generation, currentPending = pending;
    const task = (async () => {
      try {
        const file = await api.fileInfo(id);
        if (epoch === state.generation) { files.set(id, file); failedFiles.delete(id); }
        return file;
      } catch (error) { if (epoch === state.generation) failedFiles.add(id); throw error;
      } finally { currentPending.delete(id); }
    })();
    pending.set(id, task); return task;
  }
  async function hydrate(ids) {
    const unique = [...new Set(ids)]; let index = 0;
    await Promise.all(Array.from({ length: Math.min(6, unique.length) }, async () => {
      while (index < unique.length) { const id = unique[index++]; try { await info(id); } catch { /* Each unavailable attachment retains a retry button. */ } }
    }));
  }
  function thumbnail(file, large = false) {
    const type = kind(file);
    if (type === 'image') {
      const animated = isGif(file);
      return `<img src="${esc(animated ? file.url : file.preview || file.url)}" ${animated ? 'data-animated="gif"' : `data-fallback="${esc(file.url)}"`} alt="${esc(file.name)}" loading="lazy" decoding="async">`;
    }
    if (type === 'video') return `<video src="${esc(file.url)}#t=0.1" muted preload="metadata" aria-label="${esc(file.name)}"></video><span class="play-overlay" aria-hidden="true">▶</span>`;
    if(file.program_icon?.startsWith('data:image/png;base64,'))return `<span class="file-symbol program-icon" aria-hidden="true"><img src="${esc(file.program_icon)}" alt=""></span>`;
    return `<span class="file-symbol ${type}" aria-hidden="true">${esc(FileTypes.ext(file).toUpperCase().slice(0, 5) || 'FILE')}</span>`;
  }
  function bindThumbnails(container) {
    container.querySelectorAll('.image-preview img').forEach(img=>{
      const fit=()=>{if(img.naturalWidth&&img.naturalHeight)img.style.width=Math.min(img.closest('.reply-reference')?240:520,(img.closest('.reply-reference')?260:640)*img.naturalWidth/img.naturalHeight)+'px';};
      img.onload=fit;if(img.complete)fit();
    });
    container.querySelectorAll('img[data-fallback]').forEach(img => {
      img.onerror = () => {
        if (img.dataset.fallback) { const url = img.dataset.fallback; delete img.dataset.fallback; img.src = url; }
        else { img.hidden = true; img.parentElement.classList.add('preview-unavailable'); }
      };
    });
    container.querySelectorAll('video').forEach(video => {
      video.onerror = () => { video.hidden = true; video.parentElement.classList.add('preview-unavailable'); };
    });
  }
  function attachments(post) {
    const urls = new Set(), text = (post.message || '').replace(/```[\s\S]*?```|`[^`]*`/g, '');
    const candidates = [...(text.match(/https:\/\/[^\s<>"')\]]+/gi) || []), ...(Array.isArray(post.props?.attachments) ? post.props.attachments.map(item => item.image_url).filter(Boolean) : [])];
    for (const address of candidates) {
      try { const url = new URL(address); if (/^(media\d*|i)\.giphy\.com$/i.test(url.hostname) && url.protocol === 'https:' && !url.username && !url.password && /\.(gif|webp)$/i.test(url.pathname)) urls.add(url.href); } catch { /* Ordinary links remain text links. */ }
    }
    let remote = '';
    if (state.me?.avatar_url) {
      const session = new URL(state.me.avatar_url).hostname;
      remote = [...urls].slice(0,5).map(address => { const encoded = btoa(address).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); return `<button type="button" class="inline-remote-gif" data-link="${esc(address)}" title="GIF 원본 열기"><img src="moyeo-media://${session}/giphy-url/${encoded}" alt="GIF" loading="lazy" decoding="async"></button>`; }).join('');
    }
    if (!post.file_ids?.length && !remote) return '';
    return `<div class="attachments">${(post.file_ids || []).map(id => `<div class="attachment-slot" data-attachment="${esc(id)}"><button class="attachment-loading" data-retry-file="${esc(id)}">첨부 파일 불러오기…</button></div>`).join('')}${remote}</div>`;
  }
  function paintAttachments() {
    document.querySelectorAll('[data-attachment]').forEach(slot => {
      const id = slot.dataset.attachment, file = files.get(id);
      if (!file) {
        slot.innerHTML = `<button class="attachment-loading" data-retry-file="${esc(id)}">파일 정보를 불러오지 못했어요 · 다시 시도</button>`;
        slot.firstElementChild.onclick = async () => { slot.firstElementChild.disabled = true; try { await info(id); paintAttachments(); } catch (error) { toast(errorText(error)); slot.firstElementChild.disabled = false; } };
        return;
      }
      const type = kind(file), visual = ['image', 'video'].includes(type);
      if(slot.dataset.renderedMedia===file.url&&slot.querySelector('[data-open-file]'))return;
      slot.innerHTML = `<button class="attachment-card ${visual ? 'visual' : ''} ${type==='image'?'image-only':''} ${isGif(file) ? 'gif-only' : ''}" aria-label="${esc(file.name)} 열기" data-open-file="${esc(id)}">${visual ? `<span class="attachment-preview ${type==='image'?'image-preview':''}">${thumbnail(file)}</span>` : thumbnail(file)}${type==='image' ? '' : `<span class="attachment-copy"><strong>${esc(file.name)}</strong><small>${esc(FileTypes.labels[type])} · ${size(file.size)}</small></span>`}</button>`;
      slot.firstElementChild.onclick = () => openViewer(id, state.selected);
      slot.dataset.renderedMedia=file.url;if(isGif(file))keepAnimation(slot.querySelector('img'),animationKey(slot)+':'+id);
      bindThumbnails(slot);
    });
    document.querySelectorAll('.attachments').forEach(container=>{
      const slots=[...container.querySelectorAll(':scope > .attachment-slot,:scope > .chat-image-grid > .attachment-slot')];
      const images=slots.filter(slot=>files.has(slot.dataset.attachment)&&kind(files.get(slot.dataset.attachment))==='image');
      let grid=container.querySelector(':scope > .chat-image-grid');
      if(images.length<2){if(grid){for(const slot of [...grid.children])container.insertBefore(slot,grid);grid.remove();}return;}
      if(!grid){grid=document.createElement('div');grid.className='chat-image-grid';grid.setAttribute('role','group');container.insertBefore(grid,images[0]);}
      grid.setAttribute('aria-label',`이미지 ${images.length}장`);grid.classList.toggle('many-images',images.length>=9);
      for(const slot of images)if(slot.parentElement!==grid)grid.append(slot);
    });
  }
  async function hydrateChat(posts, channel) {
    remember(posts, channel);
    const epoch = state.generation;
    await hydrate(posts.flatMap(p => p.file_ids || []));
    if (epoch !== state.generation || state.selected !== channel) return;
    const area = $('#messages'), bottom = area && area.scrollHeight - area.scrollTop - area.clientHeight < 120;
    paintAttachments();
    document.querySelectorAll('#messages .inline-remote-gif img').forEach(image=>keepAnimation(image,animationKey(image)+':'+image.src));
    if (bottom) area.scrollTop = area.scrollHeight;
    if ($('#library-dialog').open && activeChannel === channel) renderLibrary();
  }
  function scan(channel) {
    const lib = library(channel);
    if (lib.loading) return lib.job || Promise.resolve();
    const job = scanChunk(channel); lib.job = job; return job;
  }
  async function scanChunk(channel) {
    const lib = library(channel), epoch = state.generation;
    if (lib.loading || lib.complete || state.demo) return;
    lib.loading = true; lib.error = ''; renderLibrary();
    try {
      for (let batch = 0; batch < 5; batch++) {
        const result = await api.posts(channel, lib.cursor);
        if (epoch !== state.generation) return;
        const posts = Object.values(result.posts).sort((a, b) => a.create_at - b.create_at);
        remember(posts, channel); lib.checked += result.order.length;
        const cursor = posts[0]?.id;
        lib.complete = result.order.length < 60 || !cursor || cursor === lib.cursor;
        lib.cursor = cursor;
        await hydrate(posts.filter(p => !p.delete_at).flatMap(p => p.file_ids || []));
        if (epoch !== state.generation) return;
        renderLibrary();
        if (lib.complete || (!$('#library-dialog').open && !$('#viewer-dialog').open)) break;
      }
    } catch (error) { lib.error = errorText(error); }
    finally { lib.loading = false; if (epoch === state.generation) renderLibrary(); }
  }
  function matches(file, category) {
    return category === 'all' || (category === 'media' ? ['image', 'video'].includes(kind(file)) : kind(file) === category);
  }
  function openLibrary() {
    activeChannel = state.selected; filter = 'media'; query = ''; sort = 'newest';
    remember(state.posts, activeChannel);
    if (state.demo) library(activeChannel).complete = true;
    const dialog = $('#library-dialog');
    dialog.innerHTML = `<div class="dialog-head"><div><p class="eyebrow">SHARED IN THIS CHAT</p><h2 id="library-title">사진 · 동영상 · 파일</h2></div><button class="icon-btn" id="library-close" aria-label="모아보기 닫기">${icon('close')}</button></div><p class="dialog-intro">${esc(channelName(state.channels.find(c => c.id === activeChannel)))}에서 주고받은 자료</p><div id="library-tabs" class="library-tabs" role="group" aria-label="파일 종류"></div><div class="library-tools"><input id="file-search" placeholder="파일 이름 검색" aria-label="파일 이름 검색"><select id="file-sort" aria-label="파일 정렬"><option value="newest">최신순</option><option value="oldest">오래된순</option><option value="name">이름순</option></select></div><div id="library-content" class="library-content"></div><footer class="library-footer"><span id="library-status" role="status"></span><button class="secondary" id="library-more">이전 자료 더 불러오기</button></footer>`;
    $('#library-close').onclick = () => dialog.close();
    $('#file-search').oninput = event => { query = event.target.value; renderLibrary(); };
    $('#file-sort').onchange = event => { sort = event.target.value; renderLibrary(); };
    $('#library-more').onclick = () => scan(activeChannel);
    dialog.showModal(); renderLibrary();
    hydrate(entries().map(ref => ref.id)).then(() => { renderLibrary(); scan(activeChannel); });
  }
  function renderLibrary() {
    if (!$('#library-dialog').open || !$('#library-content')) return;
    const lib = library(activeChannel), all = entries();
    const categories = [['media', '사진·동영상'], ['all', '전체'], ...Object.entries(FileTypes.labels)];
    $('#library-tabs').innerHTML = categories.map(([key, label]) => {
      const count = all.filter(ref => files.has(ref.id) && matches(files.get(ref.id), key)).length;
      return `<button class="tab ${filter === key ? 'active' : ''}" data-file-filter="${key}" aria-pressed="${filter === key}">${label}<span>${count}</span></button>`;
    }).join('');
    document.querySelectorAll('[data-file-filter]').forEach(button => button.onclick = () => { filter = button.dataset.fileFilter; renderLibrary(); });
    const refs = all.filter(ref => {
      const file = files.get(ref.id); return file && matches(file, filter) && file.name.toLowerCase().includes(query.toLowerCase());
    });
    if (sort === 'oldest') refs.reverse();
    if (sort === 'name') refs.sort((a, b) => files.get(a.id).name.localeCompare(files.get(b.id).name, 'ko'));
    $('#library-content').className = `library-content ${['media', 'image', 'video'].includes(filter) ? 'media-grid' : 'file-list'}`;
    $('#library-content').innerHTML = refs.map(ref => {
      const file = files.get(ref.id), type = kind(file), visual = ['image', 'video'].includes(type);
      return `<button class="library-item ${visual ? 'visual' : ''}" data-library-file="${esc(file.id)}" aria-label="${esc(file.name)} 열기"><span class="library-thumb">${thumbnail(file, true)}</span><span class="library-item-copy"><strong>${esc(file.name)}</strong><small>${esc(FileTypes.labels[type])} · ${size(file.size)} · ${new Date(ref.create_at).toLocaleDateString('ko-KR')}</small></span></button>`;
    }).join('') || `<p class="empty">${lib.loading ? '대화에서 자료를 찾고 있어요…' : '해당하는 자료가 없어요.'}${!lib.complete ? '<br>이전 자료를 더 불러올 수 있습니다.' : ''}</p>`;
    bindThumbnails($('#library-content'));
    document.querySelectorAll('[data-library-file]').forEach(button => button.onclick = () => openViewer(button.dataset.libraryFile, activeChannel));
    const unavailable = all.filter(ref => failedFiles.has(ref.id)).length, checking = all.filter(ref => !files.has(ref.id) && !failedFiles.has(ref.id)).length;
    $('#library-status').textContent = lib.error || `${all.length}개 자료${unavailable ? ` · ${unavailable}개 정보 조회 실패` : ''}${checking ? ` · ${checking}개 정보 확인 중` : ''} · ${lib.complete ? '전체 대화 확인 완료' : `${lib.checked}개 메시지 확인${lib.loading ? ' 중…' : ''}`}`;
    $('#library-more').hidden = lib.complete;
    $('#library-more').disabled = lib.loading;
    $('#library-more').textContent = lib.loading ? '이전 자료 불러오는 중…' : lib.error ? '다시 시도' : '이전 자료 더 불러오기';
  }
  function sequence() {
    if (!viewing) return [];
    return entries(viewing.channel).filter(ref => files.has(ref.id) && matches(files.get(ref.id), viewing.category));
  }
  async function openViewer(id, channel) {
    remember(state.posts, channel);
    try { await info(id); } catch (error) { toast(errorText(error)); return; }
    const file = files.get(id); if (!file) return;
    if(!library(channel).refs.has(id))library(channel).refs.set(id,{id,create_at:file.create_at||Date.now()});
    viewing = { id, channel, category: ['image', 'video'].includes(kind(file)) ? 'media' : kind(file), loading: false };
    const dialog = $('#viewer-dialog');
    if (!dialog.open) dialog.showModal();
    dialog.onclose = () => { zoomCleanup(); stopPlayback(); viewing = null; viewerTicket++; dialog.innerHTML = ''; };
    dialog.onkeydown = event => {
      if (event.key === 'Escape' && !event.isComposing) { event.preventDefault(); event.stopPropagation(); dialog.close(); return; }
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'c' && !event.target.closest('input,textarea,select,.document-preview-host') && !window.getSelection()?.toString() && $('#viewer-copy')) { event.preventDefault(); $('#viewer-copy').click(); return; }
      if (!event.target.closest('input,textarea,select,.document-preview-host') && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) { event.preventDefault(); move(event.key === 'ArrowLeft' ? -1 : 1); }
    };
    renderViewer();
  }
  function stopPlayback() {
    documentPreview.stop();
    $('#viewer-dialog').querySelectorAll('video,audio').forEach(player => { player.pause(); player.removeAttribute('src'); player.load(); });
  }
  function renderViewer() {
    if (!viewing || !$('#viewer-dialog').open) return;
    zoomCleanup(); stopPlayback();
    const ticket = ++viewerTicket, file = files.get(viewing.id), type = kind(file), refs = sequence(), index = refs.findIndex(r => r.id === file.id);
    const lib = library(viewing.channel), ref = lib.refs.get(file.id);
    const dialog = $('#viewer-dialog');
    let stage;
    if (type === 'image') stage = `<img class="viewer-image" src="${esc(file.url)}" alt="${esc(file.name)}">`;
    else if (type === 'video') stage = `<video class="viewer-video" src="${esc(file.url)}" controls preload="metadata" playsinline></video>`;
    else if (type === 'audio') stage = `<div class="audio-preview">${thumbnail(file)}<h3>${esc(file.name)}</h3><audio src="${esc(file.url)}" controls preload="metadata"></audio></div>`;
    else if (FileTypes.previewType(file) && FileTypes.previewType(file)!=='text') stage = '<div id="document-preview-host" class="document-preview-host"></div>';
    else if (FileTypes.isText(file) && file.size <= 1048576) stage = '<pre id="text-preview" class="text-preview">텍스트를 불러오는 중…</pre>';
    else stage = `<div class="document-preview">${thumbnail(file)}<h3>${esc(file.name)}</h3><p>${esc(FileTypes.labels[type])} · ${size(file.size)}</p><p>이 형식은 저장 후 연결된 앱에서 열어보세요.</p><button class="primary" id="stage-download">파일 저장</button></div>`;
    dialog.innerHTML = `<header class="viewer-header"><div><h2 id="viewer-title">${esc(file.name)}</h2><p>${esc(FileTypes.labels[type])} · ${size(file.size)} · ${new Date(ref.create_at).toLocaleString('ko-KR')}</p></div><button class="secondary" id="viewer-download">저장</button>${FileTypes.canOpen(file)?'<button class="secondary" id="viewer-save-open">저장 후 열기</button>':''}${type === 'image' ? '<button class="secondary" id="viewer-copy" title="이미지를 클립보드에 복사 (Ctrl+C / ⌘C)">이미지 복사</button>' : ''}<button class="icon-btn" id="viewer-close" aria-label="미리보기 닫기" title="미리보기 닫기 (Esc)">${icon('close')}</button></header>${type === 'image' ? ImageZoom.controls() : ''}<div class="viewer-body"><button class="viewer-arrow" id="viewer-prev" aria-label="이전 미디어" ${index <= 0 ? 'disabled' : ''}>‹</button><div class="viewer-stage" id="viewer-stage">${stage}</div><button class="viewer-arrow" id="viewer-next" aria-label="다음 미디어" ${index === refs.length - 1 && lib.complete ? 'disabled' : ''}>›</button></div><p class="viewer-status" id="viewer-status" role="status"></p><footer class="viewer-footer"><div class="viewer-strip">${refs.filter(r => ['image', 'video'].includes(kind(files.get(r.id)))).map(r => `<button class="strip-item ${r.id === file.id ? 'active' : ''}" data-strip="${esc(r.id)}" aria-label="${esc(files.get(r.id).name)} 보기">${thumbnail(files.get(r.id))}</button>`).join('')}</div><span class="viewer-count">${index + 1} / ${refs.length}${lib.complete ? '' : '+'} · ← → 이동</span></footer>`;
    $('#viewer-close').onclick = () => dialog.close();
    $('#viewer-download').onclick = () => download(file.id);
    if ($('#viewer-copy')) $('#viewer-copy').onclick = async event => {
      const button=event.currentTarget,epoch=state.generation;button.disabled=true;
      try { await api.copyFileImage(file.id); if(epoch===state.generation&&ticket===viewerTicket)$('#viewer-status').textContent=isGif(file)?'이미지를 복사했습니다. GIF는 정지 이미지로 복사됩니다.':'이미지를 클립보드에 복사했습니다.'; }
      catch(error){if(epoch===state.generation&&ticket===viewerTicket)$('#viewer-status').textContent=errorText(error);}
      finally{if(button.isConnected)button.disabled=false;}
    };
    if($('#viewer-save-open'))$('#viewer-save-open').onclick=()=>download(file.id,true);
    if ($('#stage-download')) $('#stage-download').onclick = () => download(file.id);
    $('#viewer-prev').onclick = () => move(-1);
    $('#viewer-next').onclick = () => move(1);
    zoomCleanup = type === 'image' ? ImageZoom.mount(dialog) : () => {};
    dialog.querySelectorAll('[data-strip]').forEach(button => button.onclick = () => { viewing.id = button.dataset.strip; renderViewer(); });
    bindThumbnails($('.viewer-strip', dialog));
    const element = $('.viewer-stage img,.viewer-stage video,.viewer-stage audio', dialog);
    if (element) element.onerror = () => { if (ticket === viewerTicket) $('#viewer-status').textContent = '미리보기를 불러올 수 없거나 지원하지 않는 형식입니다. 저장해서 기본 앱에서 열어보세요.'; };
    if($('#document-preview-host'))documentPreview.mount(file,$('#document-preview-host'),()=>ticket===viewerTicket);
    if ($('#text-preview')) api.fileText(file.id).then(text => { if (ticket === viewerTicket && $('#text-preview')) $('#text-preview').textContent = text; }).catch(error => { if (ticket === viewerTicket && $('#text-preview')) $('#text-preview').textContent = errorText(error); });
    $('.strip-item.active', dialog)?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
  async function move(direction) {
    if (!viewing || viewing.loading) return;
    let refs = sequence(), index = refs.findIndex(ref => ref.id === viewing.id), target = index + direction;
    if (target >= refs.length && !library(viewing.channel).complete) {
      const current = viewing, originalId = current.id; current.loading = true;
      do {
        $('#viewer-status').textContent = `이전 대화에서 다음 자료를 찾고 있습니다… (${library(current.channel).checked}개 메시지 확인)`;
        await scan(current.channel);
        if (viewing !== current || current.id !== originalId) { current.loading = false; return; }
        refs = sequence(); index = refs.findIndex(ref => ref.id === current.id); target = index + direction;
      } while (target >= refs.length && !library(current.channel).complete && !library(current.channel).error);
      current.loading = false;
      if (target >= refs.length) { $('#viewer-status').textContent = library(current.channel).error || '마지막 자료입니다.'; return; }
    }
    if (target < 0 || target >= refs.length) return;
    viewing.id = refs[target].id; renderViewer();
  }
  function showSaved(result,error='') {
    const markup='<div><strong>'+esc(result.name)+' 저장 완료</strong><small title="'+esc(result.path||'')+'">'+esc(result.path||'')+'</small><p class="saved-file-status" role="status">'+esc(error)+'</p></div>'+(result.canOpen?'<button type="button" class="secondary" data-saved-open>파일 열기</button>':'')+'<button type="button" class="secondary" data-saved-folder>폴더 열기</button><button type="button" class="icon-btn" data-saved-close aria-label="저장 알림 닫기">×</button>';
    const notice=$('#saved-file-notice');notice.innerHTML=markup;notice.hidden=false;
    const hosts=[notice],owner=$('#viewer-dialog').open?$('#viewer-dialog'):$('#search-dialog').open?$('#search-dialog'):null;if(owner){$('#viewer-saved')?.remove();owner.querySelector('.viewer-header,.dialog-head').insertAdjacentHTML('afterend','<div class="viewer-saved-actions" id="viewer-saved"></div>');const local=$('#viewer-saved');local.innerHTML=markup;hosts.push(local);}
    for(const host of hosts){const action=async(name,button)=>{button.disabled=true;try{await api[name](result.savedId);host.querySelector('.saved-file-status').textContent='';}catch(error){host.querySelector('.saved-file-status').textContent=errorText(error);}finally{button.disabled=false;}};host.querySelector('[data-saved-open]')?.addEventListener('click',event=>action('openSavedFile',event.currentTarget));host.querySelector('[data-saved-folder]').onclick=event=>action('showSavedFile',event.currentTarget);host.querySelector('[data-saved-close]').onclick=()=>{notice.hidden=true;$('#viewer-saved')?.remove();};}
  }
  async function download(id,open=false) {
    if (state.demo) { toast('데모 파일은 저장할 수 없습니다.'); return; }
    const epoch=state.generation,buttons=[...document.querySelectorAll('#viewer-download,#viewer-save-open,#stage-download')];buttons.forEach(button=>button.disabled=true);
    try { toast('저장할 위치를 선택해 주세요.'); const result = await api.downloadFile(id);if(epoch!==state.generation||result.canceled)return;showSaved(result);toast(result.name+' 저장 완료');if(open&&result.canOpen){try{await api.openSavedFile(result.savedId);}catch(error){if(epoch===state.generation)showSaved(result,errorText(error));}} }
    catch (error) { if(epoch===state.generation)toast(errorText(error)); }
    finally{if(epoch===state.generation)buttons.forEach(button=>button.disabled=false);}
  }
  function reset() {
    animatedNodes.clear();documentPreview.stop();$('#saved-file-notice').hidden=true;$('#saved-file-notice').innerHTML='';
    $('#viewer-dialog').close(); $('#library-dialog').close();
    files = new Map(); pending = new Map(); libraries = new Map(); failedFiles = new Set(); viewing = null; activeChannel = null;
  }
  function forgetPost(id) { for (const lib of libraries.values()) for (const [file, ref] of lib.refs) if (ref.post_id === id) lib.refs.delete(file); renderLibrary(); }
  return { attachments, hydrateChat, openLibrary, reset, forgetPost, download, openFile:id=>openViewer(id,state.selected) };
})();
