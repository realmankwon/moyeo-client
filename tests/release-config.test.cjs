const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createConfig, assertMacCredentials, normalizeSigningEnvironment } = require('../scripts/release-config.cjs');
test('releases use GitHub version notices and manual download without update-install metadata', () => {
  const config = createConfig({});
  assert.equal(config.publish, null); assert.equal(config.extraMetadata.moyeoUpdates.repository, require('../package.json').releaseRepository);
  assert.equal(config.extraMetadata.moyeoUpdates.mode, 'notify-download'); assert.equal(config.extraMetadata.moyeoUpdates.enabled, true);
  assert.equal(config.nsis.deleteAppDataOnUninstall, false); assert.ok(config.nsis.include.endsWith('installer.nsh'));  assert.equal(config.mac.forceCodeSigning, false);
  assert.equal(config.mac.notarize, false); assert.equal(config.mac.identity, '-');
  assert.deepEqual(config.win.target, [{ target: 'nsis', arch: ['x64'] }]);
  assert.equal(config.win.signAndEditExecutable, true, 'Cross-built EXE resources must keep the new app icon');
  assert.ok(config.win.icon.endsWith('icon.ico')); assert.ok(config.mac.icon.endsWith('icon.icns'));
  assert.deepEqual(config.pkg.mustClose, ['com.moyeo.mattermost']);
  assert.equal(config.pkg.isRelocatable, false); assert.equal(config.pkg.overwriteAction, 'upgrade');
  assert.equal(config.pkg.allowCurrentUserHome, false); assert.equal(config.pkg.installLocation, '/Applications');
  assert.ok(config.mac.target.some(item => item.target === 'pkg'));
  assert.equal(createConfig({ MOYEO_UPDATE_REPOSITORY: 'other/releases' }).extraMetadata.moyeoUpdates.repository, 'other/releases');
  assert.throws(() => createConfig({ MOYEO_UPDATE_REPOSITORY: 'https://github.com/owner/repo' }), /owner\/repo/);
});
test('preview notices are disabled while optional signed Mac builds still require credentials', () => {
  assert.equal(createConfig({}, { preview: true }).extraMetadata.moyeoUpdates.enabled, false);
  const signed = createConfig({ MOYEO_MAC_SIGNED: '1' }); assert.equal(signed.mac.forceCodeSigning, true); assert.equal(signed.mac.notarize, true);
  assert.throws(() => assertMacCredentials({}), /Developer ID/);
});

test('unset GitHub certificate secrets stay absent instead of importing the working directory',()=>{
  const env={CSC_LINK:'',WIN_CSC_LINK:'   ',CSC_KEY_PASSWORD:'',MOYEO_MAC_SIGNED:''};normalizeSigningEnvironment(env);assert.equal('CSC_LINK' in env,false);assert.equal('WIN_CSC_LINK' in env,false);assert.equal(env.CSC_KEY_PASSWORD,'');
  const configured={CSC_LINK:'real-certificate.p12'};normalizeSigningEnvironment(configured);assert.equal(configured.CSC_LINK,'real-certificate.p12');
});
