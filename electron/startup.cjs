const path = require('node:path');
class StartupService {
  constructor(app, env = process.env, exe = process.execPath, name = 'MoyeoMattermost', platform = process.platform) {
    this.app = app;
    this.platform = platform;
    this.options = { name, path: `"${env.PORTABLE_EXECUTABLE_FILE || exe}"`, args: [...(!app.isPackaged ? [`"${path.resolve(__dirname, '..')}"`] : []), '--start-in-tray'] };
  }
  get() { const settings = this.app.getLoginItemSettings(this.platform === 'darwin' ? {} : this.options); return this.platform === 'darwin' ? settings.openAtLogin : settings.launchItems?.some(item => item.name === this.options.name && item.enabled) || false; }
  set(enabled) { this.app.setLoginItemSettings(this.platform === 'darwin' ? { openAtLogin: enabled, openAsHidden: true } : { ...this.options, openAtLogin: enabled, enabled }); return this.get(); }
}
module.exports = { StartupService };
