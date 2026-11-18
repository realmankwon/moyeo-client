const path = require('node:path');
const { validRepository } = require('../electron/updates.cjs');
const pkg = require('../package.json');

function createConfig(env = process.env, { preview = false } = {}) {
  if (env.MOYEO_UPDATE_URL) throw Error('Use MOYEO_UPDATE_REPOSITORY=owner/repo for GitHub release notifications.');
  const repository = env.MOYEO_UPDATE_REPOSITORY || pkg.releaseRepository;
  if (!validRepository(repository)) throw Error('MOYEO_UPDATE_REPOSITORY must be a public GitHub owner/repo.');
  const signed = env.MOYEO_MAC_SIGNED === '1';
  const base = {
    appId: 'com.moyeo.mattermost', productName: 'Moyeo', asar: true,
    directories: { output: preview ? 'dist/preview' : 'dist/release', buildResources: 'build' },
    files: ['electron/**/*', 'src/**/*', 'package.json', '!**/.DS_Store', '!**/Data/**', '!**/login.bin', '!**/.env*'],
    extraMetadata: { moyeoUpdates: { enabled: !preview, mode: 'notify-download', repository } },
    publish: null,
    win: { target: [{ target: 'nsis', arch: ['x64'] }], artifactName: 'Moyeo-${version}-Setup-${arch}.${ext}', signAndEditExecutable: Boolean(env.WIN_CSC_LINK || process.platform === 'win32') },
    nsis: { oneClick: false, perMachine: false, allowElevation: true, allowToChangeInstallationDirectory: true, deleteAppDataOnUninstall: false, createDesktopShortcut: true, shortcutName: '모여', runAfterFinish: true, differentialPackage: false },
    pkg: {
      artifactName: 'Moyeo-${version}-mac-${arch}.${ext}',
      mustClose: ['com.moyeo.mattermost'],
      installLocation: '/Applications', allowAnywhere: false, allowCurrentUserHome: false, allowRootDirectory: true,
      isRelocatable: false, isVersionChecked: true, hasStrictIdentifier: true, overwriteAction: 'upgrade',
      welcome: 'installer-welcome.html', conclusion: 'installer-conclusion.html'
    },
    mac: {
      target: [{ target: 'pkg', arch: ['arm64', 'x64'] }, { target: 'dmg', arch: ['arm64', 'x64'] }, { target: 'zip', arch: ['arm64', 'x64'] }],
      artifactName: 'Moyeo-${version}-mac-${arch}.${ext}', minimumSystemVersion: '13.0',
      category: 'public.app-category.social-networking',
      hardenedRuntime: signed, notarize: signed,
      ...(!signed ? { identity: '-', entitlements: path.resolve(__dirname, '../build/entitlements.mac.plist'), entitlementsInherit: path.resolve(__dirname, '../build/entitlements.mac.plist') } : {}),
      forceCodeSigning: signed,
      extendInfo: { NSMicrophoneUsageDescription: '채팅에서 음성 및 영상 기능을 사용할 때 마이크 접근이 필요합니다.' }
    }
  };
  return base;
}

function assertMacCredentials(env = process.env) {
  if (!(env.CSC_LINK || env.CSC_NAME)) throw Error('MOYEO_MAC_SIGNED=1 requires CSC_LINK or CSC_NAME for a Developer ID Application certificate. Omit MOYEO_MAC_SIGNED for an ad-hoc signed build.');
  if (env.CSC_NAME === '-' || env.CSC_IDENTITY_AUTO_DISCOVERY === 'false') throw Error('Ad-hoc or disabled signing cannot be used for Mac production updates.');
  const appleId = env.APPLE_ID && env.APPLE_APP_SPECIFIC_PASSWORD && env.APPLE_TEAM_ID;
  const apiKey = env.APPLE_API_KEY && env.APPLE_API_KEY_ID && env.APPLE_API_ISSUER;
  if (!appleId && !apiKey) throw Error('Mac production builds require Apple notarization credentials (APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID or App Store Connect API credentials).');
}
module.exports = { createConfig, assertMacCredentials };
