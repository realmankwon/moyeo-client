const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { UpdateService, validRepository } = require('../electron/updates.cjs');

const release = (version = '0.15.0', assets = ['Setup-x64.exe', 'mac-arm64.dmg', 'mac-x64.dmg']) => ({
  tag_name: 'v' + version, draft: false, prerelease: false,
  html_url: 'https://untrusted.example.com/ignored',
  assets: assets.map(suffix => ({ name: `Moyeo-${version}-${suffix}`, state: 'uploaded' }))
});
function fixture(options = {}) {
  const app = Object.assign(new EventEmitter(), { isPackaged: true, getVersion: () => '0.14.1', quit: () => assert.fail('Version notices must not quit the app') });
  const opened = [], requests = [];
  const service = new UpdateService({ app, repository: 'owner/releases', enabled: true, platform: 'darwin', arch: 'arm64',
    request: async (url, init) => { requests.push({ url, init }); return Response.json(release()); },
    openExternal: async url => opened.push(url), ...options });
  return { app, service, opened, requests };
}
test('unpackaged, disabled and invalid-repository builds never request releases', async () => {
  for (const options of [{ enabled: false }, { repository: 'https://github.com/owner/repo' }, { app: Object.assign(new EventEmitter(), { isPackaged: false, getVersion: () => '0.14.1' }) }]) {
    const { service, requests, opened } = fixture(options);
    service.start(); await service.check(); await service.openDownload();
    assert.equal(service.snapshot().phase, 'disabled'); assert.equal(service.timer, undefined); assert.equal(requests.length, 0); assert.equal(opened.length, 0);
  }
});
test('Windows and both Mac architectures announce releases and open only the trusted GitHub page', async () => {
  for (const [platform, arch] of [['win32', 'x64'], ['darwin', 'arm64'], ['darwin', 'x64']]) {
    const { service, opened, requests } = fixture({ platform, arch });
    await service.openDownload(); assert.equal(opened.length, 0);
    await service.check(); assert.equal(service.snapshot().phase, 'available'); assert.equal(service.snapshot().nextVersion, '0.15.0');
    assert.equal(opened.length, 0, 'Checking must not open a browser');
    assert.equal(requests.length, 1); assert.equal(requests[0].url, 'https://github.com/owner/releases/releases/latest/download/moyeo-release.json');
    assert.equal(requests[0].init.credentials, 'omit'); assert.equal(requests[0].init.headers.Authorization, undefined);
    await service.openDownload(); assert.deepEqual(opened, ['https://github.com/owner/releases/releases/tag/v0.15.0']);
    assert.equal(requests.length, 1, 'Opening guidance must not fetch a binary');
    assert.equal(service.install, undefined); assert.equal(service.download, undefined);
  }
});
test('matching architecture must be ready before announcing a download', async () => {
  const { service, opened } = fixture({ request: async () => Response.json(release('0.15.0', ['mac-x64.dmg'])) });
  await service.check(); assert.equal(service.snapshot().phase, 'pending'); await service.openDownload(); assert.equal(opened.length, 0);
});
test('Mac PKG-only releases can be announced for the matching architecture', async () => {
  const { service } = fixture({ request: async () => Response.json(release('0.15.0', ['mac-arm64.pkg'])) });
  await service.check(); assert.equal(service.snapshot().phase, 'available');
});
test('semantic version comparison excludes current, older, draft and prerelease versions', async () => {
  for (const version of ['0.14.0', '0.14.1']) {
    const { service } = fixture({ request: async () => Response.json(release(version)) });
    await service.check(); assert.equal(service.snapshot().phase, 'current');
  }
  const { service } = fixture({ app: Object.assign(new EventEmitter(), { isPackaged: true, getVersion: () => '0.14.2' }), request: async () => Response.json(release('0.14.10')) });
  await service.check(); assert.equal(service.snapshot().phase, 'available');
  for (const value of [{ ...release(), draft: true }, { ...release(), prerelease: true }, release('0.16.0-beta.1'), release('bad/version')]) {
    const { service, opened } = fixture({ request: async () => Response.json(value) });
    await service.check(); assert.equal(service.snapshot().phase, 'error'); await service.openDownload(); assert.equal(opened.length, 0);
  }
});
test('concurrent checks share one request and later checks can discover another release', async () => {
  let calls = 0, finish, next = '0.15.0';
  const { service } = fixture({ request: () => { calls++; return new Promise(resolve => { finish = () => resolve(Response.json(release(next))); }); } });
  const first = service.check(), second = service.check(); await Promise.resolve(); assert.equal(calls, 1); finish(); await Promise.all([first, second]);
  next = '0.16.0'; const third = service.check(); await Promise.resolve(); finish(); await third;
  assert.equal(calls, 2); assert.equal(service.snapshot().nextVersion, '0.16.0');
});
test('missing releases, network errors and malformed metadata are safe and retryable', async () => {
  let mode = 'missing';
  const { service, opened } = fixture({ request: async () => {
    if (mode === 'missing') return new Response('', { status: 404 });
    if (mode === 'error') throw Error('private details must not reach renderer');
    if (mode === 'bad') return new Response('not JSON');
    return Response.json(release());
  } });
  await service.check(); assert.equal(service.snapshot().phase, 'unpublished');
  mode = 'error'; await service.check(); assert.equal(service.snapshot().phase, 'error'); assert.ok(!JSON.stringify(service.snapshot()).includes('private details'));
  mode = 'bad'; await service.check(); assert.equal(service.snapshot().phase, 'error');
  mode = 'good'; await service.check(); assert.equal(service.snapshot().phase, 'available'); await service.openDownload(); assert.equal(opened.length, 1);
});
test('repository validation refuses URL credentials and path traversal', () => {
  for (const value of ['../releases', 'owner/..', 'owner/repo/other', 'owner@evil/repo', 'https://github.com/a/b', 'owner/repo?token=x']) assert.equal(validRepository(value), false, value);
  assert.equal(validRepository('realmankwon/moyeo-client'), true);
});
test('startup, minute polling, focus and wake find releases without manual checks and detach on stop', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'], now: 0 });
  const window = new EventEmitter(), powerMonitor = new EventEmitter();
  let version = '0.14.1';
  const { service, app, requests } = fixture({ request: async (url, init) => { requests.push({ url, init }); return Response.json(release(version)); } });
  const settle = () => new Promise(resolve => setImmediate(resolve));
  service.start({ window, powerMonitor }); service.start({ window, powerMonitor });
  t.mock.timers.tick(2000); await settle(); assert.equal(service.snapshot().phase, 'current'); assert.equal(requests.length, 1);
  version = '0.15.0'; t.mock.timers.tick(58000); await settle();
  assert.equal(service.snapshot().phase, 'available'); assert.equal(requests.length, 2);
  window.emit('focus'); window.emit('show'); powerMonitor.emit('resume'); await settle(); assert.equal(requests.length, 2, 'burst events share the recent result');
  t.mock.timers.tick(31000); version = '0.16.0'; window.emit('focus'); await settle(); assert.equal(service.snapshot().nextVersion, '0.16.0');
  t.mock.timers.tick(31000); version = '0.17.0'; powerMonitor.emit('resume'); await settle(); assert.equal(service.snapshot().nextVersion, '0.17.0');
  const count = requests.length; app.emit('before-quit'); t.mock.timers.tick(120000); window.emit('restore'); powerMonitor.emit('resume'); await settle();
  assert.equal(requests.length, count); assert.equal(window.listenerCount('focus'), 0); assert.equal(app.listenerCount('activate'), 0);
});
test('temporary lookup failure keeps a previously discovered update visible and downloadable', async () => {
  let offline = false;
  const { service, opened } = fixture({ request: async () => { if (offline) throw Error('offline'); return Response.json(release()); } });
  await service.check(); offline = true; await service.check();
  assert.equal(service.snapshot().phase, 'available'); assert.equal(service.snapshot().checkFailed, true);
  await service.openDownload(); assert.deepEqual(opened, ['https://github.com/owner/releases/releases/tag/v0.15.0']);
});
test('missing manifests fall back to REST sparingly and respect server rate-limit reset', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 0 });
  let apiCalls = 0;
  const { service } = fixture({ request: async url => {
    if (url.startsWith('https://github.com/')) return new Response('', { status: 404 });
    apiCalls++; return new Response('', { status: 429, headers: { 'x-ratelimit-reset': '3600' } });
  } });
  await service.check({ automatic: true }); assert.equal(apiCalls, 1);
  t.mock.timers.tick(60000); await service.check({ automatic: true }); await service.check(); assert.equal(apiCalls, 1);
  t.mock.timers.tick(3600000); await service.check({ automatic: true }); assert.equal(apiCalls, 2);
});
test('metadata redirects outside GitHub are rejected and only the fixed REST fallback is requested', async () => {
  const urls = [];
  const { service } = fixture({ request: async url => {
    urls.push(url); const response = Response.json(release());
    if (url.startsWith('https://github.com/')) Object.defineProperty(response, 'url', { value: 'https://untrusted.example.com/feed' });
    return response;
  } });
  await service.check(); assert.equal(service.snapshot().phase, 'available');
  assert.deepEqual(urls.map(url => new URL(url).hostname), ['github.com', 'api.github.com']);
});
