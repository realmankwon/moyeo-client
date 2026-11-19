const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const asar = require('@electron/asar');
const yauzl = require('yauzl');
const plist = require('plist');
const { validRepository } = require('../electron/updates.cjs');
const pkg = require('../package.json');
const { releaseManifest } = require('./release-manifest.cjs');
const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2), preview = args.includes('--preview');
const output = path.join(root, 'dist', preview ? 'preview' : 'release');
const onlyWin = args.includes('--win'), onlyMac = args.includes('--mac');
async function sources(folder, prefix = '') {
  const files = [];
  for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue;
    if (entry.isDirectory()) files.push(...await sources(path.join(folder, entry.name), prefix + entry.name + '/'));
    else if (entry.isFile()) files.push(prefix + entry.name);
  }
  return files;
}
async function verifyApp(archive) {
  const extract=relative=>asar.extractFile(archive,relative.split('/').join(path.sep));
  const entries=asar.listPackage(archive).map(name=>name.replaceAll('\\','/'));
  const metadata = JSON.parse(extract('package.json'));
  assert.equal(metadata.version, pkg.version); assert.equal(metadata.moyeoUpdates.enabled, !preview);
  assert.equal(metadata.moyeoUpdates.mode, 'notify-download'); assert.ok(validRepository(metadata.moyeoUpdates.repository));
  assert.equal(JSON.parse(extract('node_modules/semver/package.json')).version, pkg.dependencies.semver);
  assert.ok(!entries.some(name => name.startsWith('/node_modules/electron-updater/')));
  for (const name of entries) assert.ok(!/(^|\/)(Data|login\.bin|\.env(?:\..*)?|\.DS_Store)$/.test(name), 'Private data in app: ' + name);
  let count = 0;
  for (const folder of ['electron', 'src']) for (const name of await sources(path.join(root, folder))) {
    const relative = folder + '/' + name;
    assert.deepEqual(extract(relative), await fs.readFile(path.join(root, relative)), relative); count++;
  }
  return count;
}
async function verifyZip(file, arch) {
  const zip = await new Promise((resolve, reject) => yauzl.open(file, { lazyEntries: true }, (e, value) => e ? reject(e) : resolve(value)));
  let links = 0, executable = false;
  await new Promise((resolve, reject) => {
    zip.on('error', reject); zip.on('end', resolve);
    zip.on('entry', entry => { (async () => {
      const name = entry.fileName, mode = entry.externalFileAttributes >>> 16;
      assert.ok(!name.startsWith('/') && !name.split('/').includes('..'));
      assert.ok(!/(^|\/)(Data|login\.bin|\.DS_Store)(\/|$)/.test(name));
      if ((mode & 0o170000) === 0o120000) links++;
      if (!name.endsWith('/')) {
        const stream = await new Promise((res, rej) => zip.openReadStream(entry, (e, value) => e ? rej(e) : res(value)));
        let crc = 0, length = 0, header;
        for await (const bytes of stream) { crc = zlib.crc32(bytes, crc); length += bytes.length; if (!header) header = bytes; }
        assert.equal(crc, entry.crc32, name); assert.equal(length, entry.uncompressedSize, name);
        if (name === 'Moyeo.app/Contents/MacOS/Moyeo') { assert.ok(mode & 0o111); assert.equal(header.readUInt32LE(4), arch === 'arm64' ? 0x0100000c : 0x01000007); executable = true; }
      }
      zip.readEntry();
    })().catch(error => { zip.close(); reject(error); }); });
    zip.readEntry();
  });
  assert.ok(executable && links > 5);
  return links;
}
async function verifyPkg(file, arch) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'moyeo-pkg-verify-'));
  try {
    const expanded = path.join(temporary, 'expanded');
    execFileSync('pkgutil', ['--expand-full', file, expanded]);
    const distribution = JSON.parse(execFileSync('python3', ['-c', `
import json,sys,xml.etree.ElementTree as E
r=E.parse(sys.argv[1]).getroot()
print(json.dumps({'mustClose':[e.attrib['id'] for e in r.findall('./pkg-ref/must-close/app')], 'architectures':r.find('options').attrib.get('hostArchitectures'), 'domains':r.find('domains').attrib}))
`, path.join(expanded, 'Distribution')], { encoding: 'utf8' }));
    assert.deepEqual(distribution.mustClose, ['com.moyeo.mattermost']);
    assert.equal(distribution.architectures, arch === 'arm64' ? 'arm64' : 'x86_64');
    assert.equal(distribution.domains.enable_currentUserHome, 'false');
    assert.equal(distribution.domains.enable_anywhere, 'false');
    assert.equal(distribution.domains.enable_localSystem, 'true');
    const component = path.join(expanded, 'com.moyeo.mattermost.pkg');
    const packageInfo = JSON.parse(execFileSync('python3', ['-c', `
import json,sys,xml.etree.ElementTree as E
r=E.parse(sys.argv[1]).getroot(); print(json.dumps({'attributes':r.attrib,'upgrade':[e.attrib['id'] for e in r.findall('./upgrade-bundle/bundle')],'strict':[e.attrib['id'] for e in r.findall('./strict-identifier/bundle')]}))
`, path.join(component, 'PackageInfo')], { encoding: 'utf8' }));
    assert.equal(packageInfo.attributes['install-location'], '/Applications'); assert.equal(packageInfo.attributes.version, pkg.version);
    assert.equal(packageInfo.attributes.relocatable, 'false');
    assert.deepEqual(packageInfo.upgrade, ['com.moyeo.mattermost']); assert.deepEqual(packageInfo.strict, ['com.moyeo.mattermost']);
    assert.deepEqual(await fs.readdir(path.join(component, 'Payload')), ['Moyeo.app']);
    const app = path.join(component, 'Payload/Moyeo.app');
    const executable = await fs.readFile(path.join(app, 'Contents/MacOS/Moyeo'));
    assert.equal(executable.readUInt32LE(4), arch === 'arm64' ? 0x0100000c : 0x01000007);
    assert.ok((await fs.stat(path.join(app, 'Contents/MacOS/Moyeo'))).mode & 0o111);
    const count = await verifyApp(path.join(app, 'Contents/Resources/app.asar'));
    execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
    // Installer evaluates the host CPU and target volume even for a read-only query.
    if (arch === process.arch) execFileSync('installer', ['-showChoicesXML', '-pkg', file, '-target', '/'], { stdio: 'ignore' });
    return count;
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
}
(async () => {
  if (!onlyWin && !onlyMac) assert.deepEqual(JSON.parse(await fs.readFile(path.join(output, 'moyeo-release.json'), 'utf8')), releaseManifest());
  if (!onlyMac) {
    const exe = await fs.readFile(path.join(output, `Moyeo-${pkg.version}-Setup-x64.exe`)); assert.equal(exe.toString('ascii', 0, 2), 'MZ');
    const runtime = await fs.readFile(path.join(output, 'win-unpacked/Moyeo.exe')); assert.equal(runtime.readUInt16LE(runtime.readUInt32LE(0x3c) + 4), 0x8664);
    const count = await verifyApp(path.join(output, 'win-unpacked/resources/app.asar'));
    await assert.rejects(fs.access(path.join(output, 'win-unpacked/portable.json')));
    console.log(`PASS: Windows x64 NSIS installer, runtime architecture, notification policy and ${count} matching source files (Windows execution unverified)`);
  }
  if (!onlyWin) {
    for (const arch of ['arm64', 'x64']) {
      const zip = path.join(output, `Moyeo-${pkg.version}-mac-${arch}.zip`), links = await verifyZip(zip, arch);
      if (process.platform !== 'darwin') throw Error('Final native Mac signature verification requires macOS.');
      const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'moyeo-release-verify-'));
      try {
        execFileSync('ditto', ['-x', '-k', zip, temporary]);
        const app = path.join(temporary, 'Moyeo.app'), count = await verifyApp(path.join(app, 'Contents/Resources/app.asar'));
        const info = plist.parse(await fs.readFile(path.join(app, 'Contents/Info.plist'), 'utf8'));
        assert.equal(info.CFBundleIdentifier, 'com.moyeo.mattermost'); assert.equal(info.CFBundleShortVersionString, pkg.version); assert.equal(info.CFBundleExecutable, 'Moyeo');
        execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
        execFileSync('hdiutil', ['verify', path.join(output, `Moyeo-${pkg.version}-mac-${arch}.dmg`)], { stdio: 'ignore' });
        console.log(`PASS: Mac ${arch} ZIP CRCs, architecture, executable permissions, ${links} symlinks, native signature, DMG and ${count} matching source files (execution not tested here)`);
        const pkgCount = await verifyPkg(path.join(output, `Moyeo-${pkg.version}-mac-${arch}.pkg`), arch);
        console.log(`PASS: Mac ${arch} PKG XML, ${arch === process.arch ? 'native Installer choices, ' : ''}must-close bundle ID, /Applications payload, architecture, signature and ${pkgCount} matching source files (actual replacement installation unverified)`);
      } finally { await fs.rm(temporary, { recursive: true, force: true }); }
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
