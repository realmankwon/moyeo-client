const fs = require('node:fs/promises');
const path = require('node:path');
const pkg = require('../package.json');
function artifactNames(version = pkg.version) {
  return [`Moyeo-${version}-Setup-x64.exe`, ...['arm64', 'x64'].flatMap(arch => ['pkg', 'dmg', 'zip'].map(ext => `Moyeo-${version}-mac-${arch}.${ext}`))];
}
function releaseManifest(version = pkg.version, { windowsCombined = false } = {}) {
  const names = artifactNames(version);
  const assets = windowsCombined
    ? [...names.filter(name => name.endsWith('.exe') || name.endsWith('.zip')), 'Moyeo-' + version + '-portable-x64.exe']
    : names;
  return { tag_name: 'v' + version, draft: false, prerelease: false, assets: assets.map(name => ({ name, state: 'uploaded' })) };
}
async function writeManifest(folder, options) {
  const manifest = releaseManifest(pkg.version, options);
  for (const { name } of manifest.assets) if (!(await fs.stat(path.join(folder, name))).isFile()) throw Error('Missing release artifact: ' + name);
  await fs.writeFile(path.join(folder, 'moyeo-release.json'), JSON.stringify(manifest, null, 2) + '\n');
}
if (require.main === module) writeManifest(path.resolve(__dirname, '../dist/release')).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { artifactNames, releaseManifest, writeManifest };
