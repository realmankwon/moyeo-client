/* Mattermost message attachments sent by bots and incoming webhooks. */
const botAttachments = (() => {
  const busy = new Set();
  const clean = error => error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
  const tones = { good: '#2fa66a', warning: '#e0a526', danger: '#d9534f' };
  const text = value => typeof value === 'string' ? value.slice(0, 8000) : typeof value === 'number' ? String(value) : '';
  function link(address) {
    try { const url = new URL(address); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; } catch { return ''; }
  }
  function list(post) {
    const items = post?.props?.attachments;
    return Array.isArray(items) ? items.filter(item => item && typeof item === 'object').slice(0, 10) : [];
  }
  const has = post => list(post).length > 0;
  function card(post, item) {
    const color = tones[item.color] || (/^#[0-9a-f]{3,8}$/i.test(item.color || '') ? item.color : '#c3cbd8');
    const titleLink = link(item.title_link), authorLink = link(item.author_link), image = link(item.image_url);
    const title = text(item.title), author = text(item.author_name), body = text(item.text), footer = text(item.footer);
    const fields = (Array.isArray(item.fields) ? item.fields : []).filter(field => field && (text(field.title) || text(field.value))).slice(0, 30);
    const actions = (Array.isArray(item.actions) ? item.actions : []).filter(action => action && /^[a-zA-Z0-9_-]{1,64}$/.test(action.id || '') && text(action.name) && (action.type || 'button') === 'button').slice(0, 10);
    const parts = [
      author ? `<div class="bot-card-author">${authorLink ? `<button type="button" class="message-link" data-link="${esc(authorLink)}">${esc(author)}</button>` : esc(author)}</div>` : '',
      title ? `<div class="bot-card-title">${titleLink ? `<button type="button" class="message-link" data-link="${esc(titleLink)}">${esc(title)}</button>` : esc(title)}</div>` : '',
      body ? `<div class="bot-card-text rich-text">${composer.format(body)}</div>` : '',
      fields.length ? `<dl class="bot-card-fields">${fields.map(field => `<div class="${field.short ? 'is-short' : ''}"><dt>${esc(text(field.title))}</dt><dd class="rich-text">${composer.format(text(field.value))}</dd></div>`).join('')}</dl>` : '',
      image ? `<button type="button" class="message-link bot-card-image" data-link="${esc(image)}">첨부 이미지 열기 ↗</button>` : '',
      actions.length ? `<div class="bot-card-actions">${actions.map(action => `<button type="button" class="secondary bot-card-action ${['primary', 'good', 'success'].includes(action.style) ? 'is-primary' : ['danger'].includes(action.style) ? 'is-danger' : ''}" data-bot-action="${esc(action.id)}" data-bot-post="${esc(post.id)}" ${busy.has(post.id + ':' + action.id) ? 'disabled' : ''}>${esc(text(action.name).slice(0, 80))}</button>`).join('')}</div>` : '',
      footer ? `<div class="bot-card-footer">${esc(footer.slice(0, 300))}</div>` : ''
    ].join('');
    const pretext = text(item.pretext);
    if (!parts && !pretext) return '';
    return `${pretext ? `<div class="bot-card-pretext rich-text">${composer.format(pretext)}</div>` : ''}${parts ? `<section class="bot-card" style="--bot-card-color:${esc(color)}">${parts}</section>` : ''}`;
  }
  function markup(post) {
    const html = list(post).map(item => card(post, item)).join('');
    return html ? `<div class="bot-cards">${html}</div>` : '';
  }
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-bot-action]');
    if (!button || !state.me) return;
    event.preventDefault();
    if (state.demo) { toast('데모에서는 버튼을 실행하지 않습니다.'); return; }
    const key = button.dataset.botPost + ':' + button.dataset.botAction, epoch = state.generation;
    if (busy.has(key)) return;
    busy.add(key); button.disabled = true;
    try { await api.postAction(button.dataset.botPost, button.dataset.botAction); }
    catch (error) { if (epoch === state.generation) toast(`버튼을 실행하지 못했습니다. ${clean(error)}`); }
    finally { busy.delete(key); if (button.isConnected) button.disabled = false; }
  });
  // One-line text for the room list when a bot post has no message body.
  const summary = post => { const item = list(post)[0]; return item ? text(item.title) || text(item.pretext) || text(item.text) || text(item.fallback) : ''; };
  return { markup, has, summary };
})();
