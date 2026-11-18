const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createConfig, assertMacCredentials } = require('../scripts/release-config.cjs');
test('releases use GitHub version notices and manual download without update-install metadata', () => {
  const config = createConfig({});
  assert.equal(config.publish, null); assert.equal(config.extraMetadata.moyeoUpdates.repository, require('../package.json').releaseRepository);
  assert.equal(config.extraMetadata.moyeoUpdates.mode, 'notify-download'); assert.equal(config.extraMetadata.moyeoUpdates.enabled, true);
  assert.equal(config.nsis.deleteAppDataOnUninstall, false); assert.equal(config.mac.forceCodeSigning, false);
  assert.equal(config.mac.notarize, false); assert.equal(config.mac.identity, '-');
  assert.deepEqual(config.win.target, [{ target: 'nsis', arch: ['x64'] }]);
  assert.equal(createConfig({ MOYEO_UPDATE_REPOSITORY: 'other/releases' }).extraMetadata.moyeoUpdates.repository, 'other/releases');
  assert.throws(() => createConfig({ MOYEO_UPDATE_REPOSITORY: 'https://github.com/owner/repo' }), /owner\/repo/);
});
test('preview notices are disabled while optional signed Mac builds still require credentials', () => {
  assert.equal(createConfig({}, { preview: true }).extraMetadata.moyeoUpdates.enabled, false);
  const signed = createConfig({ MOYEO_MAC_SIGNED: '1' }); assert.equal(signed.mac.forceCodeSigning, true); assert.equal(signed.mac.notarize, true);
  assert.throws(() => assertMacCredentials({}), /Developer ID/);
});
