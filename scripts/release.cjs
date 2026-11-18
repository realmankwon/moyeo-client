const { build, Platform, Arch } = require('electron-builder');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { createConfig, assertMacCredentials } = require('./release-config.cjs');
const root = path.resolve(__dirname, '..');

(async () => {
  const args = process.argv.slice(2);
  for (const arg of args) if (!['--all', '--win', '--mac', '--preview', '--dir'].includes(arg)) throw Error('Unknown release option: ' + arg);
  const preview = args.includes('--preview');
  const mac = args.includes('--mac') || args.includes('--all');
  const win = args.includes('--win') || args.includes('--all');
  if (!mac && !win) throw Error('Choose --win, --mac or --all.');
  const config = createConfig(process.env, { preview });
  if (mac && process.platform !== 'darwin') throw Error('Mac packages must be built on macOS for native signing and verification.');
  if (mac && process.env.MOYEO_MAC_SIGNED === '1') assertMacCredentials();
  for (const script of ['generate-emoji.cjs', 'generate-preview.cjs']) execFileSync(process.execPath, [path.join(__dirname, script)], { cwd: root, stdio: 'inherit' });
  if (win) await build({ projectDir: root, config: structuredClone(config), publish: 'never', targets: Platform.WINDOWS.createTarget(args.includes('--dir') ? 'dir' : 'nsis', Arch.x64) });
  if (mac) await build({ projectDir: root, config: structuredClone(config), publish: 'never', targets: Platform.MAC.createTarget(args.includes('--dir') ? 'dir' : ['pkg', 'dmg', 'zip'], Arch.arm64, Arch.x64) });
  console.log(preview ? 'Preview artifacts: release notifications are disabled.' : 'Installers created with new-version notifications and browser download guidance. Upload all platform artifacts before publishing the GitHub release.');
})().catch(error => { console.error(error); process.exitCode = 1; });
