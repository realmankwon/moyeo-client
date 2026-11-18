const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
(async () => {
  if (process.platform !== 'win32') throw new Error('이 패키징 스크립트는 Windows용입니다.');
  const electron = require('electron');
  const pkg = require('../package.json');
  const target = path.join(root, 'dist', `moyeo-${pkg.version}-win32-${process.arch}`);
  await fs.mkdir(target, { recursive: true });
  await fs.cp(path.dirname(electron), target, { recursive: true, force: true });
  // Preserve Chromium/Electron licenses and all runtime files beside the executable.
  await fs.copyFile(path.join(target, 'electron.exe'), path.join(target, 'Moyeo.exe'));
  await fs.unlink(path.join(target, 'electron.exe'));
  const resources = path.join(target, 'resources');
  await fs.unlink(path.join(resources, 'default_app.asar')).catch(() => {});
  const app = path.join(resources, 'app');
  await fs.mkdir(app, { recursive: true });
  for (const dir of ['electron', 'src']) await fs.cp(path.join(root, dir), path.join(app, dir), { recursive: true, force: true });
  await fs.writeFile(path.join(app, 'package.json'), JSON.stringify({ name: pkg.name, version: pkg.version, main: pkg.main, description: pkg.description }, null, 2));
  await fs.copyFile(path.join(root, 'README.md'), path.join(target, 'README.md'));
  await fs.writeFile(path.join(target, 'portable.json'), JSON.stringify({ portable: true }));
  console.log(`실행 파일: ${path.join(target, 'Moyeo.exe')}`);
  if (process.argv.includes('--zip')) {
    const zip = `${target}.zip`;
    execFileSync('tar.exe', ['-a', '-c', '-f', zip, '--exclude', `${path.basename(target)}/Data`, '-C', path.dirname(target), path.basename(target)], { windowsHide: true, stdio: 'inherit' });
    console.log(`배포 파일: ${zip}`);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
