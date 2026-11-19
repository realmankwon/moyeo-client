const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Data, NtExecutable, NtExecutableResource, Resource } = require('resedit');
const root = path.resolve(__dirname, '..');
const digest = value => crypto.createHash('sha256').update(Buffer.from(value)).digest('hex');
const iconBytes = icon => icon.isRaw() ? icon.bin : icon.generate();
const iconSize = icon => icon.width || icon.bitmapInfo?.width || Buffer.from(icon.bin).readUInt32BE(16);
function verifyWindowsIcon(file, { installer = false } = {}) {
  const expected = Data.IconFile.from(fs.readFileSync(path.join(root, 'build/icon.ico'))).icons.map(item => ({ size: iconSize(item.data), hash: digest(iconBytes(item.data)) }));
  const exe = NtExecutable.from(fs.readFileSync(file), { ignoreCert: true });
  const resources = NtExecutableResource.from(exe), groups = Resource.IconGroupEntry.fromEntries(resources.entries);
  assert.ok(groups.length, 'No executable icon resource');
  const actual = groups[0].getIconItemsFromEntries(resources.entries).map(item => ({ size: iconSize(item), hash: digest(iconBytes(item)) }));
  if (installer) assert.ok(actual.some(item => expected.some(source => source.size === item.size && source.hash === item.hash)), 'Installer retains a different icon');
  else assert.deepEqual(actual, expected, 'Executable icon differs from the shipped ICO');
}
function verifyMacIcon(app) {
  const file = require('node:child_process').execFileSync('plutil', ['-extract','CFBundleIconFile','raw',path.join(app,'Contents/Info.plist')], {encoding:'utf8'}).trim();
  assert.deepEqual(fs.readFileSync(path.join(app,'Contents/Resources',file.endsWith('.icns')?file:file+'.icns')), fs.readFileSync(path.join(root,'build/icon.icns')));
}
module.exports = { verifyWindowsIcon, verifyMacIcon };
