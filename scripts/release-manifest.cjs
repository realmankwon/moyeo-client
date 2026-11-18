const fs = require('node:fs/promises');
const path = require('node:path');
const pkg = require('../package.json');
function artifactNames(version = pkg.version) {
  return [`Moyeo-${version}-Setup-x64.exe`, ...['arm64', 'x64'].flatMap(arch => ['pkg', 'dmg', 'zip'].map(ext => `Moyeo-${version}-mac-${arch}.${ext}`))];
}
function releaseManifest(version = pkg.version) {
  return { tag_name: 'v' + version, draft: false, prerelease: false, assets: artifactNames(version).map(name => ({ name, state: 'uploaded' })) };
}
async function writeManifest(folder) {
  for (const name of artifactNames()) if (!(await fs.stat(path.join(folder, name))).isFile()) throw Error('Missing release artifact: ' + name);
  await fs.writeFile(path.join(folder, 'moyeo-release.json'), JSON.stringify(releaseManifest(), null, 2) + '\n');
}
if (require.main === module) writeManifest(path.resolve(__dirname, '../dist/release')).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { artifactNames, releaseManifest, writeManifest };
