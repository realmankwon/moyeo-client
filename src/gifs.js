const gifs = (() => {
  let query = '', mode = 'search', items = [], more = false, offset = 0, request = 0, timer, loading = false, initialized = false;
  const errorText = error => error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
  function mount(panel) {
    panel.innerHTML = `<div class="giphy-search"><input id="giphy-search" placeholder="Search GIPHY" aria-label="GIPHY 검색" value="${esc(query)}"><span>POWERED BY<br><b>GIPHY</b></span></div><div class="giphy-modes"><button type="button" data-gif-mode="search">검색</button><button type="button" data-gif-mode="favorites">★ 즐겨찾기</button><button type="button" data-gif-mode="recent">최근 사용</button><button type="button" id="choose-gif">파일 첨부</button></div><div class="giphy-results" id="giphy-results"></div><p id="giphy-status" role="status"></p><div class="giphy-footer"><button type="button" id="giphy-more" class="text-btn">더 보기</button><button type="button" id="giphy-retry" class="text-btn">연결 새로고침</button></div>`;
    $('#giphy-search').oninput = event => { query = event.target.value; mode = 'search'; clearTimeout(timer); timer = setTimeout(() => search(), 400); };
    $('#giphy-search').onkeydown = event => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); clearTimeout(timer); search(); } };
    panel.querySelectorAll('[data-gif-mode]').forEach(button => button.onclick = () => { mode = button.dataset.gifMode; search(); });
    $('#choose-gif').onclick = () => composer.chooseGifFile();
    $('#giphy-more').onclick = () => search(true);
    $('#giphy-retry').onclick = async () => { await api.gifReload(); initialized = false; search(); };
    paint();
    if (!initialized || mode !== 'search') search();
  }
  async function search(append = false) {
    const seq = ++request, epoch = state.generation;
    loading = true; if (!append) { items = []; offset = 0; } paint();
    if (state.demo) { loading = false; paint(); $('#giphy-status').textContent = 'GIPHY 검색은 서버에 연결한 뒤 사용할 수 있습니다.'; return; }
    try {
      if (mode === 'search') {
        const result = await api.gifSearch(query, append ? offset : 0);
        if (seq !== request || epoch !== state.generation) return;
        items = append ? [...items, ...result.items] : result.items; offset += result.items.length; more = result.more;
      } else {
        const ids = personal.get(mode === 'favorites' ? 'gifFavorites' : 'gifRecents');
        const result = [];
        for (let start = 0; start < ids.length; start += 4) { result.push(...await Promise.allSettled(ids.slice(start, start + 4).map(id => api.gifById(id)))); if (seq !== request || epoch !== state.generation) return; }
        if (seq !== request || epoch !== state.generation) return;
        items = result.filter(r => r.status === 'fulfilled').map(r => r.value); more = false;
        if (result.some(r => r.status === 'rejected')) toast('일부 GIF를 불러오지 못했습니다. 연결 새로고침으로 다시 시도할 수 있습니다.');
      }
      initialized = true; loading = false; paint();
    } catch (error) { if (seq !== request || epoch !== state.generation) return; loading = false; more = false; paint(); if ($('#giphy-status')) $('#giphy-status').textContent = errorText(error); }
  }
  function paint() {
    if (!$('#giphy-results')) return;
    document.querySelectorAll('[data-gif-mode]').forEach(button => button.classList.toggle('active', button.dataset.gifMode === mode));
    $('#giphy-results').innerHTML = items.map(item => `<div class="giphy-cell"><button type="button" class="giphy-select" data-gif="${esc(item.id)}" aria-label="${esc(item.title)} 첨부"><img src="${esc(item.preview)}" alt="${esc(item.title)}" loading="lazy"></button><button type="button" class="gif-pin ${personal.get('gifFavorites').includes(item.id) ? 'pinned' : ''}" data-pin-gif="${esc(item.id)}" aria-label="${esc(item.title)} GIF 즐겨찾기" aria-pressed="${personal.get('gifFavorites').includes(item.id)}">★</button></div>`).join('') || `<p class="empty">${loading ? 'GIPHY에서 가져오는 중…' : mode === 'search' ? '검색 결과가 없어요.' : '등록한 GIF가 없어요.'}</p>`;
    document.querySelectorAll('[data-gif]').forEach(button => button.onclick = async () => { button.disabled = true; try { await composer.queueGif(button.dataset.gif); } finally { button.disabled = false; } });
    document.querySelectorAll('[data-pin-gif]').forEach(button => button.onclick = async () => { button.disabled = true; try { await personal.toggle('gifFavorites', button.dataset.pinGif); if (mode === 'favorites') { items = items.filter(item => personal.get('gifFavorites').includes(item.id)); } paint(); } catch (error) { toast(errorText(error)); button.disabled = false; } });
    $('#giphy-status').textContent = loading ? 'GIPHY에서 가져오는 중…' : `${items.length}개 GIF · 선택하면 첨부 대기 목록에 추가됩니다.`;
    $('#giphy-more').hidden = mode !== 'search' || !more; $('#giphy-more').disabled = loading;
  }
  function reset() { clearTimeout(timer); request++; query = ''; mode = 'search'; items = []; offset = 0; more = false; initialized = false; loading = false; }
  return { mount, reset };
})();
