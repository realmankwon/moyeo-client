const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { MattermostClient, normalizeServer } = require('../electron/client.cjs');
const me = 'a'.repeat(26), channel = 'b'.repeat(26);
test('server addresses reject credential-bearing and non-HTTP URLs', () => {
  assert.equal(normalizeServer('https://example.com/chat/'), 'https://example.com/chat');
  assert.equal(normalizeServer(' 192.168.0.10:8065 '), 'http://192.168.0.10:8065');
  assert.equal(normalizeServer('localhost:8065'), 'http://localhost:8065');
  assert.equal(normalizeServer('chat.example.com'), 'https://chat.example.com');
  for (const url of ['file:///tmp', 'https://user:secret@example.com', 'https://example.com/?token=secret']) assert.throws(() => normalizeServer(url));
});
test('network failures return actionable errors instead of a silent fetch failure', async () => {
  for (const [code, expected] of [['ECONNREFUSED', /연결을 거부/], ['ENOTFOUND', /서버 이름/], ['SELF_SIGNED_CERT_IN_CHAIN', /인증서/]]) {
    const client = new MattermostClient(async () => { throw new TypeError('fetch failed', { cause: { code } }); });
    await assert.rejects(client.connect({ server: 'localhost:8065', token: 'test' }), expected);
    assert.equal(client.token, '');
  }
  const client = new MattermostClient(async () => { throw new DOMException('timeout', 'TimeoutError'); });
  await assert.rejects(client.connect({ server: 'localhost:8065', token: 'test' }), /응답 시간이 초과/);
});
test('login, authenticated reads, posting and logout against HTTP fixture', async t => {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let text = ''; for await (const chunk of req) text += chunk;
    const body = text ? JSON.parse(text) : null;
    requests.push({ url: req.url, auth: req.headers.authorization, body });
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/v4/users/login') { res.setHeader('Token', 'session-secret'); res.end(JSON.stringify({ id: me })); }
    else if (req.headers.authorization !== 'Bearer session-secret') { res.statusCode = 401; res.end('{"message":"unauthorized"}'); }
    else if (req.url === '/api/v4/users/me') res.end(JSON.stringify({ id: me, username: 'tester' }));
    else if (req.url.startsWith('/api/v4/users/me/channels')) res.end(JSON.stringify([{ id: channel, display_name: 'Team', type: 'O' }]));
    else if (req.url === '/api/v4/posts') res.end(JSON.stringify({ id: 'c'.repeat(26), ...body }));
    else if (req.url === '/api/v4/users/logout') res.end('{"status":"OK"}');
    else { res.statusCode = 404; res.end('{"message":"missing"}'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const client = new MattermostClient();
  const user = await client.connect({ server: `http://127.0.0.1:${server.address().port}`, login: 'tester', password: 'secret', mfa: '123456' });
  assert.equal(user.id, me);
  assert.equal(requests[0].body.token, '123456');
  assert.equal((await client.channels())[0].id, channel);
  assert.equal((await client.send(channel, '<script>alert(1)</script>')).message, '<script>alert(1)</script>');
  await assert.rejects(client.send('../users', 'bad'), /식별자/);
  await assert.rejects(client.send(channel, ' '), /메시지/);
  await client.disconnect();
  assert.equal(client.token, '');
  assert.equal(requests.at(-1).url, '/api/v4/users/logout');
});
test('personal tokens are not revoked on local logout, failures clear credentials', async () => {
  const calls = [];
  const client = new MattermostClient(async (url, opts) => { calls.push(url); return new Response(JSON.stringify({ id: me }), { status: 200 }); });
  await client.connect({ server: 'https://example.com', token: 'personal' });
  await client.disconnect();
  assert.equal(calls.length, 1);
  const failed = new MattermostClient(async () => new Response('{"message":"로그인 실패"}', { status: 403 }));
  await assert.rejects(failed.connect({ server: 'https://example.com', token: 'bad' }), /로그인 실패/);
  assert.equal(failed.token, '');
});
