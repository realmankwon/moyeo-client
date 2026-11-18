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
    this.repository = repository;
    this.request = request;
    this.openExternal = openExternal;
    this.platform = platform;
    this.arch = arch;
    const supported = platform === 'win32' && arch === 'x64' || platform === 'darwin' && ['arm64', 'x64'].includes(arch);
    this.state = { enabled: Boolean(app.isPackaged && enabled && validRepository(repository) && supported), phase: 'disabled', version: app.getVersion(), nextVersion: '', platformLabel: platform === 'win32' ? 'Windows x64' : arch === 'arm64' ? 'Mac Apple Silicon' : 'Mac Intel' };
    this.state.phase = this.state.enabled ? 'idle' : 'disabled';
    this.pending = null;
    app.on('before-quit', () => this.stop());
  }
  snapshot() { return { ...this.state }; }
  change(value) { Object.assign(this.state, value); this.emit('change', this.snapshot()); }
  start() {
    if (!this.state.enabled || this.timer) return;
    this.firstCheck = setTimeout(() => this.check(), 10000); this.firstCheck.unref?.();
    this.timer = setInterval(() => this.check(), 4 * 60 * 60 * 1000); this.timer.unref?.();
  }
  stop() { clearTimeout(this.firstCheck); clearInterval(this.timer); this.timer = null; }
  async check() {
    if (!this.state.enabled) return this.snapshot();
    if (this.pending) return this.pending;
    if (this.state.phase !== 'available') this.change({ phase: 'checking' });
    this.pending = Promise.resolve().then(async () => {
      const response = await this.request(`https://api.github.com/repos/${this.repository}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json' }, credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000)
      });
      if (response.status === 404) { this.downloadPage = null; this.change({ phase: 'unpublished', nextVersion: '' }); return; }
      if (!response.ok) throw Error('Release check failed');
      const text = await response.text();
      if (text.length > 2 * 1024 * 1024) throw Error('Release metadata too large');
      const release = JSON.parse(text), tag = release.tag_name;
      const next = typeof tag === 'string' ? semver.valid(tag.startsWith('v') ? tag.slice(1) : tag) : null;
      if (!next || release.draft !== false || release.prerelease !== false || semver.prerelease(next)) throw Error('Invalid stable release');
      this.downloadPage = null;
      if (!semver.gt(next, this.state.version)) { this.change({ phase: 'current', nextVersion: '' }); return; }
      const names = this.platform === 'win32' ? [`Moyeo-${next}-Setup-x64.exe`] : [`Moyeo-${next}-mac-${this.arch}.dmg`, `Moyeo-${next}-mac-${this.arch}.zip`];
      const ready = Array.isArray(release.assets) && release.assets.some(asset => names.includes(asset.name) && asset.state === 'uploaded');
      if (!ready) { this.change({ phase: 'pending', nextVersion: next }); return; }
      this.downloadPage = `https://github.com/${this.repository}/releases/tag/${encodeURIComponent(tag)}`;
      this.change({ phase: 'available', nextVersion: next });
    }).catch(() => { this.downloadPage = null; this.change({ phase: 'error', nextVersion: '' }); })
      .finally(() => { this.pending = null; }).then(() => this.snapshot());
    return this.pending;
  }
  async openDownload() {
    if (this.state.enabled && this.state.phase === 'available' && this.downloadPage) await this.openExternal(this.downloadPage);
    return this.snapshot();
  }
}
module.exports = { UpdateService, validRepository };
