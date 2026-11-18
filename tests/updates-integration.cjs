// Real HTTP responses; requests are routed to a local fixture and no external browser is opened.
const assert = require('node:assert/strict');
const http = require('node:http');
const { EventEmitter } = require('node:events');
const { UpdateService } = require('../electron/updates.cjs');
(async () => {
  let mode = 'good', requests = [], opened = [];
  const server = http.createServer((req, res) => {
    requests.push(req.url); assert.equal(req.headers.authorization, undefined); assert.equal(req.headers.cookie, undefined);
    if (!['/repos/test/releases/releases/latest', '/test/releases/releases/latest/download/moyeo-release.json'].includes(req.url)) { res.writeHead(404); return res.end(); }
    if (mode === 'missing') { res.writeHead(404); return res.end(); }
    if (mode === 'invalid') return res.end('not JSON');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ tag_name: 'v0.15.0', draft: false, prerelease: false, html_url: 'file:///must-not-open', assets: ['Setup-x64.exe', 'mac-arm64.dmg', 'mac-x64.dmg'].map(suffix => ({ name: 'Moyeo-0.15.0-' + suffix, state: 'uploaded' })) }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    for (const [platform, arch] of [['win32', 'x64'], ['darwin', 'arm64'], ['darwin', 'x64']]) {
      const app = Object.assign(new EventEmitter(), { isPackaged: true, getVersion: () => '0.14.1' });
      const service = new UpdateService({ app, repository: 'test/releases', enabled: true, platform, arch,
        request: async (url, options) => { assert.ok(['github.com', 'api.github.com'].includes(new URL(url).hostname)); const response = await fetch(`http://127.0.0.1:${server.address().port}${new URL(url).pathname}`, options); Object.defineProperty(response, 'url', { value: url }); return response; },
        openExternal: async url => opened.push(url)
      });
      mode = 'good'; await service.check(); assert.equal(service.snapshot().phase, 'available');
      assert.equal(opened.length, 0); await service.openDownload(); assert.deepEqual(opened, ['https://github.com/test/releases/releases/tag/v0.15.0']); opened = [];
      mode = 'missing'; await service.check(); assert.equal(service.snapshot().phase, 'available'); assert.equal(service.snapshot().checkFailed, true);
      mode = 'invalid'; await service.check(); assert.equal(service.snapshot().phase, 'available');
      service.stop();
    }
    assert.equal(requests.length, 15); assert.ok(requests.every(value => value.endsWith('/releases/latest') || value.endsWith('/moyeo-release.json')));
    console.log('PASS: real HTTP metadata checks for Windows/Mac arm64/x64, REST compatibility fallback, trusted browser guidance and persistent notices on errors; no binary downloads or installation');
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
