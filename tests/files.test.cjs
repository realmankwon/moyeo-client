const { test } = require('node:test');
const assert = require('node:assert/strict');
const { classify, isText, previewType, canOpen } = require('../src/file-types.js');
const { MattermostClient } = require('../electron/client.cjs');
test('classifies common office, media, archive and source attachments', () => {
  for (const [name, expected] of Object.entries({ 'PHOTO.JPG': 'image', 'recording.MOV': 'video', 'voice.m4a': 'audio', 'report.hwpx': 'document', 'report.pdf': 'document', 'budget.xlsx': 'sheet', 'table.csv': 'sheet', 'pitch.pptx': 'slide', 'backup.tar.gz': 'archive', 'config.yaml': 'code', 'installer.exe': 'other' })) assert.equal(classify({ name }), expected, name);
  assert.equal(classify({ name: 'opaque', mime_type: 'image/png' }), 'image');
  assert.equal(isText({ name: 'README.md' }), true);
  assert.equal(isText({ name: 'report.pdf' }), false);
});
test('document preview and saved-file opening distinguish supported and executable formats',()=>{
  for(const extension of ['pdf','docx','xlsx','pptx','hwpx'])assert.equal(previewType({name:'test.'+extension}),extension);
  assert.equal(previewType({name:'notes.md'}),'text');assert.equal(previewType({name:'legacy.hwp'}),null);
  for(const extension of ['pdf','doc','hwp','xls','ppt','txt','png'])assert.equal(canOpen({name:'test.'+extension}),true);
  for(const extension of ['exe','bat','cmd','ps1','js','lnk','url','com','msi','html'])assert.equal(canOpen({name:'test.'+extension}),false);
});
test('file streams keep auth out of URLs and forward byte ranges', async () => {
  const calls = [], id = 'f'.repeat(26);
  const client = new MattermostClient(async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/info')) return new Response(JSON.stringify({ id, name: 'movie.webm', mime_type: 'video/webm' }));
    return new Response('video chunk', { status: 206, headers: { 'Content-Type': 'video/webm', 'Content-Range': 'bytes 0-10/100' } });
  });
  client.server = 'https://example.com'; client.token = 'secret';
  const file = await client.fileInfo(id), oldKey = client.mediaKey;
  assert.ok(file.url.startsWith(`moyeo-media://${oldKey}/`)); assert.ok(!JSON.stringify(file).includes('secret'));
  const response = await client.fileResponse(id, 'original', 'bytes=0-10');
  assert.equal(response.status, 206);
  assert.equal(calls.at(-1).options.headers.Authorization, 'Bearer secret');
  assert.equal(calls.at(-1).options.headers.Range, 'bytes=0-10');
  assert.equal(calls.at(-1).options.redirect, 'error');
  await assert.rejects(client.fileResponse('../escape'), /식별자/);
  await assert.rejects(client.fileResponse(id, 'original', 'bytes=0-1,2-3'), /범위/);
  client.clear(); assert.notEqual(client.mediaKey, oldKey);
  await assert.rejects(client.fileResponse(id), /먼저 연결/);
});
