const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MattermostClient } = require('../electron/client.cjs');
test('reaction reads/adds/removes use the logged-in user and validate emoji names', async () => {
  const me = 'a'.repeat(26), id = 'b'.repeat(26), calls = [];
  const client = new MattermostClient(async (url, options) => { calls.push({ url, options }); return new Response(options.method === 'GET' ? '[]' : '{"status":"OK"}'); });
  client.me = { id: me }; client.server = 'https://example.com'; client.token = 'secret';
  assert.deepEqual(await client.reactions(id), []);
  assert.ok(calls.at(-1).url.endsWith(`/posts/${id}/reactions`));
  await client.setReaction(id, 'heart', true);
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), { user_id: me, post_id: id, emoji_name: 'heart' });
  await client.setReaction(id, '+1', false);
  assert.equal(calls.at(-1).options.method, 'DELETE');
  assert.ok(calls.at(-1).url.endsWith(`/users/${me}/posts/${id}/reactions/%2B1`));
  const count = calls.length;
  await assert.rejects(client.setReaction(id, '../other', false), /이모지/);
  await assert.rejects(client.setReaction('../post', 'heart', true), /식별자/);
  assert.equal(calls.length, count);
});
