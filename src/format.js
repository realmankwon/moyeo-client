(function (root) {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const mailHeader = /^[ \t]*(?:#{1,6}[ \t]+)?(?:(?:📩|📧|✉️?|:envelope_with_arrow:|:email:)[ \t]*)?새 메일 수신[ \t]*\r?\n[ \t]*\**발신\**:\**[ \t]*([^\r\n]+)\r?\n[ \t]*\**제목\**:\**[ \t]*([^\r\n]+)/;
  const isMailNotice = value => mailHeader.test(String(value ?? ''));

  function mailExcerpt(lines) {
    return lines.map(line => line.trim()
      .replace(/^(?:>\s*)+/, '')
      .replace(/(?:!\[[^\]\n]*\]\(https?:\/\/[^\s)]+\)|<img\b[^>]*>)/gi, '')
      .replace(/^.{1,40}(?:이미지|로고|아이콘|배너)\s*(?=\[https?:\/\/)/i, '')
      .replace(/\[([^\]\n]+)\]\(https?:\/\/[^\s)]+\)/gi, '$1')
      .replace(/[\[<]?https?:\/\/[^\s<>\[\]"'`]+[\]>]?/gi, '')
      .trim())
      .filter(line => /[\p{L}\p{N}]/u.test(line))
      .map(preview)
      .join('\n');
  }

  function renderMail(header, remainder) {
    const lines = remainder.trim().split('\n');
    const date = /^\**일시\**:\**[ \t]*(.+)$/.exec(lines[0])?.[1]?.trim();
    if (date) lines.shift();
    while (lines[0] !== undefined && !lines[0].trim()) lines.shift();
    if (/^(?:#{1,6}\s+)?\**미리보기\**\s*:?\s*$/.test(lines[0] || '')) lines.shift();

    // Only the explicit webmail action survives as a clickable link. The mail
    // excerpt and the action are both excluded from automatic link previews.
    const footer = /^\[웹메일에서 열기\]\(<?(https?:\/\/[^\s<>]+)>?\)$/i.exec(lines.at(-1)?.trim() || '');
    let webmail = '';
    if (footer) {
      lines.pop();
      try {
        const url = new URL(footer[1]);
        if (!url.username && !url.password) webmail = url.href;
      } catch { /* Invalid links do not produce an action. */ }
    }

    const sentBy = header[1].trim(), subject = header[2].trim(), excerpt = mailExcerpt(lines);
    const sender = /^"?([^"<>]+)"?\s+<([^<>]+)>$/.exec(sentBy);
    const label = sender ? sender[1].trim() : sentBy;
    return [
      '<section class="mail-notice" aria-label="새 메일 수신">',
      '<header class="mail-notice-header"><span class="mail-notice-icon" aria-hidden="true">✉</span>새 메일 수신</header>',
      `<h3 class="mail-notice-subject">${escape(subject || '(제목 없음)')}</h3>`,
      `<div class="mail-notice-meta"><strong>${escape(label)}</strong>${sender ? `<span>${escape(sender[2])}</span>` : ''}${date ? `<time>${escape(date)}</time>` : ''}</div>`,
      excerpt ? `<p class="mail-notice-excerpt">${escape(excerpt)}</p>` : '',
      webmail ? `<footer class="mail-notice-footer"><button type="button" class="mail-notice-open" data-link="${escape(webmail)}">웹메일에서 열기 <span aria-hidden="true">↗</span></button></footer>` : '',
      '</section>',
    ].join('');
  }

  function render(value, custom = {}, unicode = {}, onLink = null) {
    let text = String(value || '').replace(/\u0000/g, '').replace(/\r\n/g, '\n');
    const mail = mailHeader.exec(text);
    if (mail) return renderMail(mail, text.slice(mail[0].length));

    const tokens = [];
    const hold = html => `\u0000${tokens.push(html) - 1}\u0000`;
    text = text.replace(/```([^\n]*)\n([\s\S]*?)```/g, (_, lang, code) => hold(`<pre class="message-code"><code>${escape(code.replace(/\n$/, ''))}</code></pre>`));
    text = text.replace(/`([^`\n]+)`/g, (_, code) => hold(`<code class="inline-code">${escape(code)}</code>`));
    text = text.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (original, label, address) => {
      try { const url = new URL(address); if (url.username || url.password) return original; onLink?.(url.href); return hold(`<button type="button" class="message-link" data-link="${escape(url.href)}">${escape(label)}</button>`); } catch { return original; }
    });
    text = text.replace(/https?:\/\/[^\s<>"'\u0000]+/gi, address => {
      let suffix = '';
      while (/[.,!?;:\]\u3002\uff0c]$/.test(address) || (address.endsWith(')') && (address.match(/\)/g)?.length || 0) > (address.match(/\(/g)?.length || 0))) { suffix = address.slice(-1) + suffix; address = address.slice(0, -1); }
      try { const url = new URL(address); if (url.username || url.password) return address + suffix; onLink?.(url.href); return hold(`<button type="button" class="message-link" data-link="${escape(url.href)}">${escape(address)}</button>`) + suffix; } catch { return address + suffix; }
    });
    text = text.replace(/(^|[^\p{L}\p{N}_@./+\-])@([a-zA-Z0-9](?:[a-zA-Z0-9._-]{0,62}[a-zA-Z0-9_])?)/gu, (_, prefix, name) => {
      const group = ['all', 'here', 'channel'].includes(name.toLowerCase());
      return prefix + hold(group ? '<span class="message-mention mention-group">@' + escape(name) + '</span>' : '<button type="button" class="message-mention" data-user-mention="' + escape(name) + '" aria-label="@' + escape(name) + ' 프로필 보기">@' + escape(name) + '</button>');
    });
    // ~channel only becomes a link when the app confirms a joined channel with that handle.
    text = text.replace(/(^|[^\p{L}\p{N}_~./+\-])~([a-z0-9][a-z0-9_-]{1,63})/gu, (original, prefix, name) => {
      const label = typeof root.RichTextChannel === 'function' ? root.RichTextChannel(name) : null;
      return typeof label === 'string' && label ? prefix + hold('<button type="button" class="message-mention channel-mention" data-channel-mention="' + escape(name) + '">~' + escape(label) + '</button>') : original;
    });
    text = escape(text).replace(/\*\*([^\n]+?)\*\*/g, '<strong>$1</strong>').replace(/~~([^\n]+?)~~/g, '<s>$1</s>').replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>').replace(/(?<![\w])_([^_\n]+)_(?![\w])/g, '<em>$1</em>');
    text = text.replace(/:([a-zA-Z0-9_+-]+):/g, (original, name) => Object.hasOwn(custom, name) && custom[name]?.image_url ? `<img class="inline-emoji" src="${escape(custom[name].image_url)}" alt="${escape(original)}" title="${escape(original)}">` : Object.hasOwn(unicode, name) && typeof unicode[name] === 'string' ? unicode[name] : original);
    const lines = text.split('\n'), blocks = [];
    const cells = line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      // GitHub-style table: a header row followed by a |---|---| separator.
      if (line.includes('|') && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[index + 1] || '') && (lines[index + 1] || '').includes('-')) {
        const head = cells(line), align = cells(lines[index + 1]).map(cell => cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : '');
        if (head.length === align.length && head.length <= 20) {
          const rows = []; index += 2;
          while (index < lines.length && lines[index].includes('|') && lines[index].trim()) { rows.push(cells(lines[index])); index++; }
          index--;
          const cell = (tag, value, column) => `<${tag}${align[column] ? ` class="align-${align[column]}"` : ''}>${value ?? ''}</${tag}>`;
          blocks.push(`<div class="message-table-wrap"><table class="message-table"><thead><tr>${head.map((value, column) => cell('th', value, column)).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${head.map((_, column) => cell('td', row[column], column)).join('')}</tr>`).join('')}</tbody></table></div>`);
          continue;
        }
      }
      if (/^&gt;\s?/.test(line)) blocks.push(`<blockquote>${line.replace(/^&gt;\s?/, '')}</blockquote>`);
      else if (/^#{1,6}\s/.test(line)) { const level = /^#+/.exec(line)[0].length; blocks.push(`<strong class="message-heading heading-${level}">${line.replace(/^#{1,6}\s+/, '')}</strong>`); }
      else if (/^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) blocks.push('<hr class="message-rule">');
      else if (/^(\s*)[-*]\s\[([ xX])\]\s/.test(line)) blocks.push(line.replace(/^(\s*)[-*]\s\[([ xX])\]\s(.*)$/, (_, indent, mark, rest) => `<span class="message-list-item message-task${mark === ' ' ? '' : ' done'}">${indent}${mark === ' ' ? '☐' : '☑'} ${rest}</span>`));
      else if (/^[-*]\s/.test(line)) blocks.push(`<span class="message-list-item">• ${line.slice(2)}</span>`);
      else blocks.push(line);
    }
    // Block elements already break the line, so the newline after them would add a blank row.
    text = blocks.join('\n').replace(/(<\/table><\/div>|<hr class="message-rule">)\n/g, '$1');
    return text.replace(/\u0000(\d+)\u0000/g, (_, index) => tokens[Number(index)] || '');
  }
  function preview(value) {
    const mail = mailHeader.exec(String(value ?? ''));
    if (mail) return mail[2].trim() || '(제목 없음)';
    return String(value ?? '').replace(/\r\n/g, '\n')
      .replace(/```[^\n`]*\n([\s\S]*?)```/g, '$1')
      .replace(/^[ \t]*\|?[ \t]*:?-{2,}:?[ \t]*(?:\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/gm, '').replace(/^[ \t]*\|(.*)\|[ \t]*$/gm, (_, row) => row.replace(/\|/g, ' · '))
      .replace(/^(\s*)[-*]\s\[[ xX]\]\s/gm, '$1')
      .replace(/!\[([^\]\n]*)\]\([^\s)]+\)/g, (_, label) => label || '이미지')
      .replace(/\[([^\]\n]+)\]\(https?:\/\/[^\s)]+\)/g, '$1')
      .replace(/(^|\n)\s{0,3}(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+\.\s+)/g, '$1')
      .replace(/(\*\*|__|~~)([\s\S]+?)\1/g, '$2')
      .replace(/(^|[\s(])(?:\*([^*\n]+)\*|_([^_\n]+)_)/g, (_, prefix, a, b) => prefix + (a ?? b))
      .replace(/`([^`\n]+)`/g, '$1').replace(/\s+/g, ' ').trim();
  }
  function links(value) { const urls = []; render(value, {}, {}, url => urls.push(url)); return [...new Set(urls)]; }
  const api = { render, escape, preview, links, isMailNotice };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RichText = api;
})(globalThis);
