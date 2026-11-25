const linkPreviews = (() => {
  let postCache = new Map(), postJobs = new Map(), publicCache = new Map();
  let visible = new Set(), publicJobs = new Set(), observer, activeLookups = 0;
  const signature = post => String(post.edit_at || 0) + '\n' + post.message;
  const hasEmbeds = post => Object.hasOwn(post.metadata || {}, 'embeds');
  const cachedPost = post => postCache.get(post.id)?.signature === signature(post);
  const cards = post => LinkPreviewData.cards(
    !hasEmbeds(post) && cachedPost(post) ? { ...post, metadata: postCache.get(post.id).metadata } : post,
    url => publicCache.get(url),
  );

  function imageSource(card) {
    if (!card.image || !state.me?.avatar_url) return '';
    const session = new URL(state.me.avatar_url).hostname;
    if (card.image.startsWith('moyeo-media://' + session + '/public-preview/')) return card.image;
    const encoded = btoa(card.image).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return 'moyeo-media://' + session + '/link-preview/' + encoded;
  }

  function body(post) {
    return cards(post).map(card => {
      const image = imageSource(card);
      const thumbnail = image ? '<span class="link-preview-image"><img src="' + esc(image) +
        '" alt="' + esc(card.title) + ' 대표 이미지" loading="lazy" decoding="async"></span>' : '';
      const description = card.description ? '<span>' + esc(card.description) + '</span>' : '';
      return '<button type="button" class="message-link-preview" data-link="' + esc(card.url) +
        '" aria-label="' + esc(card.title) + ' 링크 열기">' + thumbnail + '<span class="link-preview-copy"><small>' +
        esc(card.site) + '</small><strong>' + esc(card.title) + '</strong>' + description +
        '<small class="link-preview-address">' + esc(card.url) + '</small></span></button>';
    }).join('');
  }

  function markup(post) {
    const content = body(post);
    return content ? '<div class="message-link-previews" data-preview-post="' + esc(post.id) + '">' + content + '</div>' : '';
  }

  function repaint(predicate) {
    const area = $('#messages');
    if (!area) return;
    const nearBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 100;
    const top = area.getBoundingClientRect().top;
    const anchor = !nearBottom && [...area.querySelectorAll('[data-message-id]')]
      .find(node => node.getBoundingClientRect().bottom > top);
    const offset = anchor && anchor.getBoundingClientRect().top;
    let changed = false;
    for (const node of area.querySelectorAll('[data-preview-post]')) {
      const post = state.posts.find(item => item.id === node.dataset.previewPost);
      if (!post || !predicate(post)) continue;
      const html = body(post);
      if (node.innerHTML !== html) {
        node.innerHTML = html;
        changed = true;
      }
    }
    if (!changed) return;
    if (nearBottom) area.scrollTop = area.scrollHeight;
    else if (anchor?.isConnected) area.scrollTop += anchor.getBoundingClientRect().top - offset;
  }

  function drainPublicQueue() {
    while (activeLookups < 3) {
      let next;
      for (const node of visible) {
        if (!node.isConnected) continue;
        const post = state.posts.find(item => item.id === node.dataset.previewPost);
        if (!post || (!hasEmbeds(post) && !cachedPost(post))) continue;
        next = cards(post).find(card => !publicCache.has(card.url) && !publicJobs.has(card.url) &&
          (!card.image || card.title === new URL(card.url).hostname));
        if (next) break;
      }
      if (!next) return;
      const { url } = next;
      const jobs = publicJobs;
      const epoch = state.generation;
      jobs.add(url);
      activeLookups++;
      api.publicLinkPreview(url).catch(() => null).then(metadata => {
        if (epoch !== state.generation) return;
        if (publicCache.size >= 150) publicCache.delete(publicCache.keys().next().value);
        publicCache.set(url, metadata);
        if (metadata) repaint(post => cards(post).some(card => card.url === url));
      }).finally(() => {
        jobs.delete(url);
        if (epoch === state.generation) {
          activeLookups--;
          drainPublicQueue();
        }
      });
    }
  }

  function observe() {
    observer?.disconnect();
    visible.clear();
    const area = $('#messages');
    if (!area || !api?.publicLinkPreview) return;
    const current = new IntersectionObserver(entries => {
      if (observer !== current) return;
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target);
        else visible.delete(entry.target);
      }
      drainPublicQueue();
    }, { root: area, rootMargin: '180px 0px' });
    observer = current;
    for (const node of area.querySelectorAll('[data-preview-post]')) observer.observe(node);
  }

  async function hydrate(posts) {
    if (state.demo || !api?.post) return;
    observe();
    const candidates = posts.filter(post => !hasEmbeds(post) && !cachedPost(post) && cards(post).length);
    let cursor = 0;
    const epoch = state.generation;
    await Promise.all(Array.from({ length: Math.min(3, candidates.length) }, async () => {
      while (cursor < candidates.length && epoch === state.generation) {
        const post = candidates[cursor++];
        const key = post.id + ':' + signature(post);
        const jobs = postJobs;
        let task = jobs.get(key);
        if (!task) {
          task = api.post(post.id).catch(() => null);
          jobs.set(key, task);
        }
        const full = await task;
        jobs.delete(key);
        if (epoch !== state.generation || cachedPost(post)) continue;
        if (postCache.size >= 300) postCache.delete(postCache.keys().next().value);
        postCache.set(post.id, { signature: signature(post), metadata: full?.metadata || { embeds: [] } });
        repaint(item => item.id === post.id && signature(item) === signature(post));
        drainPublicQueue();
      }
    }));
  }

  document.addEventListener('error', event => {
    if (!event.target.matches?.('.link-preview-image img')) return;
    event.target.style.visibility = 'hidden';
    event.target.parentElement.classList.add('image-unavailable');
  }, true);

  function reset() {
    observer?.disconnect();
    observer = null;
    visible = new Set();
    postCache = new Map();
    postJobs = new Map();
    publicCache = new Map();
    publicJobs = new Set();
    activeLookups = 0;
  }

  return { markup, hydrate, reset };
})();
