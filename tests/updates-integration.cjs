// Real HTTP responses; requests are routed to a local fixture and no external browser is opened.
const assert = require('node:assert/strict');
const http = require('node:http');
const { EventEmitter } = require('node:events');
const { UpdateService } = require('../electron/updates.cjs');
(async () => {
  let mode = 'good', requests = [], opened = [];
  const server = http.createServer((req, res) => {
    requests.push(req.url); assert.equal(req.headers.authorization, undefined); assert.equal(req.headers.cookie, undefined);
    if (req.url !== '/repos/test/releases/releases/latest') { res.writeHead(404); return res.end(); }
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
        request: (url, options) => { assert.equal(new URL(url).hostname, 'api.github.com'); return fetch(`http://127.0.0.1:${server.address().port}${new URL(url).pathname}`, options); },
        openExternal: async url => opened.push(url)
      });
      mode = 'good'; await service.check(); assert.equal(service.snapshot().phase, 'available');
      assert.equal(opened.length, 0); await service.openDownload(); assert.deepEqual(opened, ['https://github.com/test/releases/releases/tag/v0.15.0']); opened = [];
      mode = 'missing'; await service.check(); assert.equal(service.snapshot().phase, 'unpublished');
      mode = 'invalid'; await service.check(); assert.equal(service.snapshot().phase, 'error');
      service.stop();
    }
    assert.equal(requests.length, 9); assert.ok(requests.every(value => value.endsWith('/releases/latest')));
    console.log('PASS: real HTTP version checks for Windows/Mac arm64/x64, trusted browser download guidance, missing-release and malformed-response handling; no binary downloads or installation');
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
