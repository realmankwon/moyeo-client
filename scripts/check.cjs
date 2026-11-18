const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
for (const folder of ['electron', 'src', 'scripts']) {
  for (const item of fs.readdirSync(path.join(root, folder), { withFileTypes: true })) {
    if (item.isFile() && /\.(cjs|js)$/.test(item.name)) execFileSync(process.execPath, ['--check', path.join(root, folder, item.name)], { stdio: 'inherit', windowsHide: true });
  }
}
console.log('JavaScript syntax checks passed.');
