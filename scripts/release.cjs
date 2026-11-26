const { build, Platform, Arch } = require('electron-builder');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { createConfig, assertMacCredentials, normalizeSigningEnvironment } = require('./release-config.cjs');
const { writeManifest } = require('./release-manifest.cjs');
const { prepareNsis } = require('./prepare-nsis.cjs');
const { verifyInstaller } = require('./nsis-integrity.cjs');
const root = path.resolve(__dirname, '..');

(async () => {
  normalizeSigningEnvironment(process.env);
  const args = process.argv.slice(2);
  for (const arg of args) if (!['--all', '--win', '--mac', '--preview', '--dir'].includes(arg)) throw Error('Unknown release option: ' + arg);
  const preview = args.includes('--preview');
  const mac = args.includes('--mac') || args.includes('--all');
  const win = args.includes('--win') || args.includes('--all');
  if (!mac && !win) throw Error('Choose --win, --mac or --all.');
  const config = createConfig(process.env, { preview });
  const windowsCombined = mac && win && process.platform === 'win32';
  if (mac && !windowsCombined && process.platform !== 'darwin') throw Error('Run the combined release on Windows with WSL, or build Mac packages on macOS.');
  if (windowsCombined && (args.includes('--dir') || process.env.MOYEO_MAC_SIGNED === '1')) throw Error('The combined Windows build produces ad-hoc signed Mac ZIPs. Use macOS for Mac directory or Developer ID builds.');
  if (mac && process.env.MOYEO_MAC_SIGNED === '1') assertMacCredentials();
  if (windowsCombined) config.portable = { artifactName: '${productName}-${version}-portable-${arch}.${ext}', requestExecutionLevel: 'user' };
  for (const script of ['generate-emoji.cjs', 'generate-preview.cjs']) execFileSync(process.execPath, [path.join(__dirname, script)], { cwd: root, stdio: 'inherit' });
  if (win) prepareNsis();
  if (win) {
    const targets = args.includes('--dir') ? 'dir' : windowsCombined ? ['nsis', 'portable'] : 'nsis';
    await build({ projectDir: root, config: structuredClone(config), publish: 'never', targets: Platform.WINDOWS.createTarget(targets, Arch.x64) });
  }
  if (win && !args.includes('--dir')) verifyInstaller(path.join(root,config.directories.output,`Moyeo-${require('../package.json').version}-Setup-x64.exe`));
  if (windowsCombined) {
    const output = path.join(root, config.directories.output);
    const options = { cwd: root, stdio: 'inherit' };
    execFileSync(process.execPath, [path.join(__dirname, 'verify-release.cjs'), '--win', ...(preview ? ['--preview'] : [])], options);
    execFileSync(process.execPath, [path.join(__dirname, 'package-mac.cjs'), output], options);
    execFileSync(process.execPath, [path.join(__dirname, 'verify-mac.cjs'), output], options);
    await writeManifest(output, { windowsCombined: true });
  } else {
    if (mac) await build({ projectDir: root, config: structuredClone(config), publish: 'never', targets: Platform.MAC.createTarget(args.includes('--dir') ? 'dir' : ['pkg', 'dmg', 'zip'], Arch.arm64, Arch.x64) });
    if (win && mac && !args.includes('--dir')) await writeManifest(path.join(root, config.directories.output));
  }
  console.log(preview ? 'Preview artifacts: release notifications are disabled.' : 'Installers created with new-version notifications and browser download guidance. Upload all platform artifacts before publishing the GitHub release.');
})().catch(error => { console.error(error); process.exitCode = 1; });
