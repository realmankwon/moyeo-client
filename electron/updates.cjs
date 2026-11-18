const { EventEmitter } = require('node:events');
const semver = require('semver');

function validRepository(value) {
  if (typeof value !== 'string') return false;
  const parts = value.split('/');
  return parts.length === 2 && /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(parts[0]) && /^[A-Za-z0-9_.-]{1,100}$/.test(parts[1]) && !['.', '..'].includes(parts[1]);
}

class UpdateService extends EventEmitter {
  constructor({ app, repository, enabled = false, request = fetch, openExternal, platform = process.platform, arch = process.arch }) {
    super();
    this.app = app;
    this.repository = repository;
    this.request = request;
    this.openExternal = openExternal;
    this.platform = platform;
    this.arch = arch;
    const supported = platform === 'win32' && arch === 'x64' || platform === 'darwin' && ['arm64', 'x64'].includes(arch);
    this.state = { enabled: Boolean(app.isPackaged && enabled && validRepository(repository) && supported), phase: 'disabled', version: app.getVersion(), nextVersion: '', platformLabel: platform === 'win32' ? 'Windows x64' : arch === 'arm64' ? 'Mac Apple Silicon' : 'Mac Intel' };
    this.state.phase = this.state.enabled ? 'idle' : 'disabled';
    this.pending = null; this.lastCheckAt = null; this.nextApiCheckAt = 0; this.apiBlockedUntil = 0; this.lifecycle = [];
    app.on('before-quit', () => this.stop());
  }
  snapshot() { return { ...this.state }; }
  change(value) { Object.assign(this.state, value); this.emit('change', this.snapshot()); }
  start({ window, powerMonitor } = {}) {
    if (!this.state.enabled || this.timer) return;
    const check = () => this.checkIfDue();
    for (const [emitter, events] of [[window, ['focus', 'show', 'restore']], [this.app, ['activate']], [powerMonitor, ['resume']]]) {
      if (!emitter) continue;
      for (const event of events) { emitter.on(event, check); this.lifecycle.push(() => emitter.removeListener(event, check)); }
    }
    this.firstCheck = setTimeout(check, 2000); this.firstCheck.unref?.();
    this.timer = setInterval(check, 60000); this.timer.unref?.();
  }
  stop() { clearTimeout(this.firstCheck); clearInterval(this.timer); this.timer = null; for (const remove of this.lifecycle.splice(0)) remove(); }
  checkIfDue() {
    if (this.lastCheckAt !== null && Date.now() - this.lastCheckAt < 30000) return Promise.resolve(this.snapshot());
    return this.check({ automatic: true });
  }
  async readRelease(url, asset = false) {
    const response = await this.request(url, {
      headers: { Accept: 'application/json' }, credentials: 'omit', cache: 'no-store', redirect: asset ? 'follow' : 'error', signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) {
      if (!asset && [403, 429].includes(response.status)) this.apiBlockedUntil = Math.max(Date.now() + 60000, Date.now() + (Number(response.headers.get('retry-after')) || 0) * 1000, (Number(response.headers.get('x-ratelimit-reset')) || 0) * 1000);
      throw Object.assign(Error('Release check failed'), { status: response.status });
    }
    if (asset && response.url) {
      const final = new URL(response.url);
      if (final.protocol !== 'https:' || !['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(final.hostname)) throw Error('Unexpected metadata host');
    }
    let text = '', length = 0;
    const decoder = new TextDecoder();
    for await (const chunk of response.body) {
      length += chunk.length;
      if (length > 256 * 1024) throw Error('Release metadata too large');
      text += decoder.decode(chunk, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  }
  async latest(automatic) {
    try { return await this.readRelease(`https://github.com/${this.repository}/releases/latest/download/moyeo-release.json`, true); }
    catch (error) {
      // Releases from older builds have no manifest. Keep REST fallback infrequent
      // because unauthenticated API limits are shared by a company's public IP.
      if (Date.now() < this.apiBlockedUntil || automatic && Date.now() < this.nextApiCheckAt) throw error;
      this.nextApiCheckAt = Date.now() + 30 * 60000;
      return this.readRelease(`https://api.github.com/repos/${this.repository}/releases/latest`);
    }
  }
  async check({ automatic = false } = {}) {
    if (!this.state.enabled) return this.snapshot();
    if (this.pending) return this.pending;
    this.lastCheckAt = Date.now();
    if (this.state.phase !== 'available') this.change({ phase: 'checking' });
    this.pending = Promise.resolve().then(async () => {
      const release = await this.latest(automatic), tag = release.tag_name;
      const next = typeof tag === 'string' ? semver.valid(tag.startsWith('v') ? tag.slice(1) : tag) : null;
      if (!next || release.draft !== false || release.prerelease !== false || semver.prerelease(next)) throw Error('Invalid stable release');
      this.downloadPage = null;
      if (!semver.gt(next, this.state.version)) { this.change({ phase: 'current', nextVersion: '', checkFailed: false }); return; }
      const names = this.platform === 'win32' ? [`Moyeo-${next}-Setup-x64.exe`] : ['pkg', 'dmg', 'zip'].map(ext => `Moyeo-${next}-mac-${this.arch}.${ext}`);
      const ready = Array.isArray(release.assets) && release.assets.some(asset => names.includes(asset.name) && asset.state === 'uploaded');
      if (!ready) { this.change({ phase: 'pending', nextVersion: next }); return; }
      this.downloadPage = `https://github.com/${this.repository}/releases/tag/${encodeURIComponent(tag)}`;
      this.change({ phase: 'available', nextVersion: next, checkFailed: false });
    }).catch(error => {
      if (this.state.phase === 'available' && this.downloadPage) { this.change({ checkFailed: true }); return; }
      this.downloadPage = null; this.change({ phase: error.status === 404 ? 'unpublished' : 'error', nextVersion: '' });
    })
      .finally(() => { this.pending = null; }).then(() => this.snapshot());
    return this.pending;
  }
  async openDownload() {
    if (this.state.enabled && this.state.phase === 'available' && this.downloadPage) await this.openExternal(this.downloadPage);
    return this.snapshot();
  }
}
module.exports = { UpdateService, validRepository };
