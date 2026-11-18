const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { configurePortable } = require('../electron/portable.cjs');
test('portable data stays next to the launcher and imports only missing preference files', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'moyeo-portable-')), legacy = path.join(root,'legacy'), portable = path.join(root,'portable');
  fs.mkdirSync(legacy); fs.writeFileSync(path.join(legacy,'appearance.json'), '{"name":"old"}');
  const paths = { userData: legacy }, app = { commandLine: { hasSwitch: () => false }, getPath: name => paths[name], setPath: (name,value) => { paths[name] = value; }, setAppLogsPath: value => { paths.logs = value; } };
  t.after(() => { for (const file of ['portable/Data/appearance.json','legacy/appearance.json']) fs.rmSync(path.join(root,file),{force:true}); for (const folder of ['portable/Data/Session','portable/Data/CrashDumps','portable/Data','portable','legacy']) fs.rmdirSync(path.join(root,folder)); fs.rmdirSync(root); });
  const target = configurePortable(app, { PORTABLE_EXECUTABLE_DIR: portable });
  assert.equal(target,path.join(portable,'Data')); assert.equal(paths.userData,target);
  assert.equal(fs.readFileSync(path.join(target,'appearance.json'),'utf8'),'{"name":"old"}');
  fs.writeFileSync(path.join(target,'appearance.json'),'{"name":"new"}');
  paths.userData = legacy; configurePortable(app,{PORTABLE_EXECUTABLE_DIR:portable});
  assert.equal(fs.readFileSync(path.join(target,'appearance.json'),'utf8'),'{"name":"new"}');
  app.commandLine.hasSwitch = () => true; assert.equal(configurePortable(app,{PORTABLE_EXECUTABLE_DIR:portable}),null);
});
