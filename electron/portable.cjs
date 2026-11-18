const fs = require('node:fs');
const path = require('node:path');
function configurePortable(app, env = process.env) {
  if (app.commandLine.hasSwitch('user-data-dir')) return null;
  const exeDir = path.dirname(process.execPath);
  const base = env.PORTABLE_EXECUTABLE_DIR || (fs.existsSync(path.join(exeDir, 'portable.json')) ? exeDir : null);
  if (!base) return null;
  const data = path.join(path.resolve(base), 'Data'), previous = app.getPath('userData');
  fs.mkdirSync(data, { recursive: true });
  for (const name of ['appearance.json', 'personal-settings.json', 'emoji-recents.json']) {
    const target = path.join(data, name), source = path.join(previous, name);
    if (!fs.existsSync(target) && fs.existsSync(source)) fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
  }
  const session = path.join(data, 'Session'), crashes = path.join(data, 'CrashDumps');
  fs.mkdirSync(session, { recursive: true }); fs.mkdirSync(crashes, { recursive: true });
  app.setPath('userData', data); app.setPath('sessionData', session); app.setPath('crashDumps', crashes);
  app.setAppLogsPath(path.join(data, 'Logs'));
  return data;
}
module.exports = { configurePortable };
