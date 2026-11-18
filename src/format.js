(function (root) {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function render(value, custom = {}, unicode = {}) {
    const tokens = [];
    const hold = html => `\u0000${tokens.push(html) - 1}\u0000`;
    let text = String(value || '').replace(/\u0000/g, '').replace(/\r\n/g, '\n');
    text = text.replace(/```([^\n]*)\n([\s\S]*?)```/g, (_, lang, code) => hold(`<pre class="message-code"><code>${escape(code.replace(/\n$/, ''))}</code></pre>`));
    text = text.replace(/`([^`\n]+)`/g, (_, code) => hold(`<code class="inline-code">${escape(code)}</code>`));
    text = text.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (original, label, address) => {
      try { const url = new URL(address); if (url.username || url.password) return original; return hold(`<button type="button" class="message-link" data-link="${escape(url.href)}">${escape(label)}</button>`); } catch { return original; }
    });
    text = text.replace(/https?:\/\/[^\s<>"'\u0000]+/gi, address => {
      let suffix = '';
      while (/[.,!?;:\]\u3002\uff0c]$/.test(address) || (address.endsWith(')') && (address.match(/\)/g)?.length || 0) > (address.match(/\(/g)?.length || 0))) { suffix = address.slice(-1) + suffix; address = address.slice(0, -1); }
      try { const url = new URL(address); if (url.username || url.password) return address + suffix; return hold(`<button type="button" class="message-link" data-link="${escape(url.href)}">${escape(address)}</button>`) + suffix; } catch { return address + suffix; }
    });
    text = escape(text).replace(/\*\*([^\n]+?)\*\*/g, '<strong>$1</strong>').replace(/~~([^\n]+?)~~/g, '<s>$1</s>').replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>').replace(/(?<![\w])_([^_\n]+)_(?![\w])/g, '<em>$1</em>');
    text = text.replace(/:([a-zA-Z0-9_+-]+):/g, (original, name) => Object.hasOwn(custom, name) && custom[name]?.image_url ? `<img class="inline-emoji" src="${escape(custom[name].image_url)}" alt="${escape(original)}" title="${escape(original)}">` : Object.hasOwn(unicode, name) && typeof unicode[name] === 'string' ? unicode[name] : original);
    text = text.split('\n').map(line => {
      if (/^&gt;\s?/.test(line)) return `<blockquote>${line.replace(/^&gt;\s?/, '')}</blockquote>`;
      if (/^#{1,3}\s/.test(line)) return `<strong class="message-heading">${line.replace(/^#{1,3}\s/, '')}</strong>`;
      if (/^[-*]\s/.test(line)) return `<span class="message-list-item">• ${line.slice(2)}</span>`;
      return line;
    }).join('\n');
    return text.replace(/\u0000(\d+)\u0000/g, (_, index) => tokens[Number(index)] || '');
  }
  const api = { render, escape };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RichText = api;
})(globalThis);
