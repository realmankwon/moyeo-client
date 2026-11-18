const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname,'..'), version = require('../package.json').version;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid version.');
const target = path.join(root,'dist',`moyeo-${version}-win32-x64`);
if (!fs.existsSync(path.join(target,'Moyeo.exe'))) throw new Error('Run npm run pack first.');
if (fs.existsSync(path.join(target,'Data'))) throw new Error('Build input contains portable user data. Use a fresh package folder.');
execFileSync(process.env.ComSpec || 'cmd.exe', ['/d','/s','/c',`npm exec --yes --package=electron-builder@26.18.0 -- electron-builder --config scripts/portable-builder.json --win portable --x64 --prepackaged dist/moyeo-${version}-win32-x64`], { cwd:root, stdio:'inherit', windowsHide:true, env: { ...process.env, ELECTRON_BUILDER_COMPRESSION_LEVEL: process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL || '5' } });
