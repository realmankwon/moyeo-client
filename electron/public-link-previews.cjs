const http = require('node:http');
const https = require('node:https');
const dns = require('node:dns');
const { BlockList, isIP } = require('node:net');
const { randomUUID } = require('node:crypto');
const { Parser } = require('htmlparser2');

const rasterImage = /^image\/(?:png|jpe?g|gif|webp|avif)$/i;
const htmlType = /^(?:text\/html|application\/xhtml\+xml)$/i;
const privateAddresses = new BlockList();
for (const [network, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 3],
]) privateAddresses.addSubnet(network, bits);

function publicUrl(value, base, excludedHost = '') {
  if (typeof value !== 'string' || !value.trim() || value.length > 4096) return null;
  try {
    const url = new URL(value, base);
    const host = url.hostname.replace(/\.$/, '').toLowerCase();
    if (!['http:', 'https:'].includes(url.protocol) || url.port || url.username || url.password ||
      host === excludedHost || !host.includes('.') || isIP(host) ||
      /(?:^|\.)(?:localhost|local|lan|internal|home\.arpa|onion)$/.test(host)) return null;
    url.hash = '';
    return url;
  } catch { return null; }
}

function publicLookup(hostname, options, callback) {
  // Connect to the validated IPv4 answer directly. Every redirect gets a fresh check.
  dns.lookup(hostname, { family: 4, all: true }, (error, answers) => {
    if (error) return callback(error);
    if (!answers.length || answers.some(({ address, family }) => family !== 4 || privateAddresses.check(address))) {
      return callback(new Error('Preview host did not resolve to a public address'));
    }
    callback(null, answers[0].address, 4);
  });
}

function openResponse(url, accept, signal) {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const request = transport.get(url, {
      agent: false, lookup: publicLookup, family: 4, autoSelectFamily: false, signal,
      headers: { Accept: accept, 'Accept-Encoding': 'identity', 'User-Agent': 'Moyeo Link Preview' },
    }, resolve);
    request.on('error', reject);
  });
}

async function fetchPublic(value, { excludedHost, signal, imageOnly }) {
  let url = publicUrl(value, undefined, excludedHost);
  for (let hop = 0; url && hop <= 4; hop++) {
    signal.throwIfAborted();
    const response = await openResponse(url, imageOnly ? 'image/*' : 'text/html, application/xhtml+xml, image/*;q=0.5', signal);
    const location = response.headers.location;
    if ([301, 302, 303, 307, 308].includes(response.statusCode) && location) {
      response.destroy();
      const next = publicUrl(location, url, excludedHost);
      if (url.protocol === 'https:' && next?.protocol === 'http:') return null;
      url = next;
      continue;
    }
    const contentType = String(response.headers['content-type'] || '');
    const type = contentType.split(';')[0].trim().toLowerCase();
    if (response.statusCode !== 200 || (imageOnly ? !rasterImage.test(type) : !htmlType.test(type) && !rasterImage.test(type))) {
      response.destroy();
      return null;
    }
    if (!imageOnly && rasterImage.test(type)) {
      response.destroy();
      return { url: url.href, type };
    }
    const limit = imageOnly ? 4 * 1024 * 1024 : 384 * 1024;
    if (imageOnly && Number(response.headers['content-length']) > limit) {
      response.destroy();
      return null;
    }
    const chunks = [];
    let bytes = 0;
    for await (const chunk of response) {
      chunks.push(chunk.subarray(0, limit - bytes));
      bytes += chunk.length;
      if (bytes >= limit) {
        if (imageOnly && bytes > limit) return null;
        if (!imageOnly) break;
      }
    }
    return { url: url.href, type, contentType, bytes: Buffer.concat(chunks) };
  }
  return null;
}

function parsePage(bytes, contentType, url, excludedHost) {
  const charset = (contentType.match(/charset\s*=\s*["']?([\w-]+)/i) ||
    bytes.subarray(0, 4096).toString('latin1').match(/<meta[^>]+charset\s*=\s*["']?([\w-]+)/i))?.[1];
  let html;
  try { html = new TextDecoder(charset || 'utf-8').decode(bytes); }
  catch { html = bytes.toString('utf8'); }
  const tags = new Map();
  let title = '', inTitle = false, reachedBody = false, imageLink = '';
  new Parser({
    onopentag(name, attrs) {
      if (name === 'body') reachedBody = true;
      if (reachedBody) return;
      if (name === 'title') inTitle = true;
      if (name === 'meta') {
        const key = (attrs.property || attrs.name || '').toLowerCase();
        const content = attrs.content?.trim();
        if (key && content && !tags.has(key)) tags.set(key, content);
      }
      if (name === 'link' && attrs.rel?.toLowerCase() === 'image_src') imageLink ||= attrs.href || '';
    },
    ontext(value) { if (inTitle && title.length < 512) title += value; },
    onclosetag(name) { if (name === 'title') inTitle = false; },
  }).end(html);
  const compact = (value, limit) => (value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
  const image = ['og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src']
    .map(key => tags.get(key)).concat(imageLink).map(value => publicUrl(value, url, excludedHost)).find(Boolean);
  return {
    title: compact(tags.get('og:title') || tags.get('twitter:title') || title, 300),
    description: compact(tags.get('og:description') || tags.get('twitter:description') || tags.get('description'), 600),
    site: compact(tags.get('og:site_name'), 100),
    image: image?.href || '',
  };
}

class PublicLinkPreviews {
  constructor(client, fetchPage = fetchPublic) {
    this.client = client;
    this.fetchPage = fetchPage;
    this.reset();
  }

  reset() {
    this.session?.abort();
    this.session = new AbortController();
    this.results = new Map();
    this.images = new Map();
  }

  options(imageOnly = false, requestSignal) {
    const serverHost = new URL(this.client.server).hostname.replace(/\.$/, '').toLowerCase();
    const signals = [this.session.signal, AbortSignal.timeout(7000)];
    if (requestSignal) signals.push(requestSignal);
    return { excludedHost: serverHost, signal: AbortSignal.any(signals), imageOnly };
  }

  lookup(address) {
    if (!this.client.me) return null;
    const options = this.options();
    const url = publicUrl(address, undefined, options.excludedHost);
    if (!url) return null;
    const cached = this.results.get(url.href);
    if (cached && cached.expires > Date.now()) return cached.task;
    if (this.results.size >= 150) this.results.delete(this.results.keys().next().value);
    const entry = { expires: Date.now() + 300_000, task: null };
    entry.task = this.load(url, options).catch(() => null).then(metadata => {
      if (metadata) entry.expires = Date.now() + 3_600_000;
      return metadata;
    });
    this.results.set(url.href, entry);
    return entry.task;
  }

  async load(url, options) {
    const page = await this.fetchPage(url.href, options);
    if (!page) return null;
    options.signal.throwIfAborted();
    const metadata = page.bytes ? parsePage(page.bytes, page.contentType, page.url, options.excludedHost) :
      { title: '', site: '', description: '', image: page.url };
    if (!metadata.title && !metadata.description && !metadata.image) return null;
    if (metadata.image) {
      const id = randomUUID();
      if (this.images.size >= 300) this.images.delete(this.images.keys().next().value);
      this.images.set(id, metadata.image);
      metadata.image = 'moyeo-media://' + this.client.mediaKey + '/public-preview/' + id;
    }
    return metadata;
  }

  async image(id, signal) {
    const url = this.images.get(id);
    if (!url) return new Response(null, { status: 404 });
    const options = this.options(true, signal);
    const image = await this.fetchPage(url, options);
    options.signal.throwIfAborted();
    if (!image?.bytes || !rasterImage.test(image.type)) return new Response(null, { status: 404 });
    return new Response(image.bytes, { headers: { 'Content-Type': image.type, 'Cache-Control': 'private, max-age=600', 'X-Content-Type-Options': 'nosniff' } });
  }
}

module.exports = { PublicLinkPreviews, publicUrl, publicLookup, parsePage };
