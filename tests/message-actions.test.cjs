const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MattermostClient } = require('../electron/client.cjs');
test('message actions preserve attachments and refuse edits/deletes for other authors', async () => {
  const me = 'a'.repeat(26), own = 'b'.repeat(26), other = 'c'.repeat(26), channel = 'd'.repeat(26), calls = [];
  const client = new MattermostClient(async (url, options) => {
    calls.push({ url, options });
    if (options.method === 'GET') return new Response(JSON.stringify({ id: url.includes(own) ? own : other, user_id: url.includes(own) ? me : 'e'.repeat(26), message: 'original', file_ids: ['f'.repeat(26)] }));
    return new Response(JSON.stringify({ status: 'OK' }));
  });
  client.server = 'https://example.com/chat'; client.me = { id: me }; client.token = 'secret';
  await client.editPost(own, 'updated');
  assert.equal(calls.at(-1).options.method, 'PUT');
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), { message: 'updated' });
  assert.ok(calls.at(-1).url.endsWith('/patch'));
  await assert.rejects(client.editPost(other, 'bad'), /내 메시지만/);
  await assert.rejects(client.deletePost(other), /내 메시지만/);
  assert.equal(calls.at(-1).options.method, 'GET');
  await client.deletePost(own); assert.equal(calls.at(-1).options.method, 'DELETE');
  await client.send(channel, 'reply', [], own); assert.equal(JSON.parse(calls.at(-1).options.body).root_id, own);
  await client.sharePost(other, channel); const shared = JSON.parse(calls.at(-1).options.body);
  assert.equal(shared.channel_id, channel); assert.ok(shared.message.includes('원본 메시지 보기')); assert.ok(shared.message.includes(`https://example.com/chat/_redirect/pl/${other}`));
});
