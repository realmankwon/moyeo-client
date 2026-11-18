const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { importLegacyData } = require('../electron/migrate-data.cjs');
test('legacy preferences and encrypted session migrate without overwriting current data or copying caches', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'moyeo-import-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'Data'), target = path.join(root, 'installed');
  await fs.mkdir(source); await fs.mkdir(target);
  await fs.writeFile(path.join(source, 'appearance.json'), '{"name":"old"}'); await fs.writeFile(path.join(target, 'appearance.json'), '{"name":"current"}');
  await fs.writeFile(path.join(source, 'personal-settings.json'), '{"favorites":{}}');
  await fs.writeFile(path.join(source, 'login.bin'), Buffer.from([0, 1, 2, 255])); await fs.writeFile(path.join(source, 'cache'), 'do not copy');
  const result = await importLegacyData(source, target);
  assert.deepEqual(result.imported, ['personal-settings.json', 'login.bin']); assert.deepEqual(result.skipped, ['appearance.json']);
  assert.equal(await fs.readFile(path.join(target, 'appearance.json'), 'utf8'), '{"name":"current"}');
  assert.deepEqual(await fs.readFile(path.join(target, 'login.bin')), Buffer.from([0, 1, 2, 255]));
  assert.deepEqual((await fs.readdir(target)).sort(), ['appearance.json', 'login.bin', 'personal-settings.json']);
});
test('malformed and symlinked legacy files are refused before copying', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'moyeo-import-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const target = path.join(root, 'installed'); await fs.writeFile(path.join(root, 'appearance.json'), 'invalid');
  await assert.rejects(importLegacyData(root, target)); await assert.rejects(fs.access(target));
  await fs.unlink(path.join(root, 'appearance.json')); await fs.writeFile(path.join(root, 'outside'), '{}'); await fs.symlink(path.join(root, 'outside'), path.join(root, 'appearance.json'));
  await assert.rejects(importLegacyData(root, target), /형식/); await assert.rejects(fs.access(target));
});
