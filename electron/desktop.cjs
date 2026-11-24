const {messageNotificationId,notificationTarget,accountHash}=require('./notifications.cjs');
const {trayImage}=require('./icons.cjs');
class DesktopService {
  constructor(electron, win, options) {
    this.e = electron; this.win = win; this.options = options; this.settings = { name: '모여', soundEnabled: true }; this.count = 0; this.rooms = new Map(); this.notices = new Map(); this.quitting = false; this.lastSound = 0; this.brand = '';
    this.tray = new electron.Tray(this.image());
    this.tray.on('click', () => this.show()); this.tray.on('double-click', () => this.show());
    this.tray.on('balloon-click', () => { if (this.balloon?.update) this.show(); else if (this.balloon) this.open(this.balloon.channel, this.balloon.epoch); });
    this.tray.on('balloon-closed', () => { this.balloon = null; });
    win.on('close', event => { if (!this.quitting) { event.preventDefault(); win.hide(); } });
    win.on('query-session-end', () => { this.quitting = true; });
    win.on('session-end', () => { this.quitting = true; });
    win.on('focus', () => win.flashFrame(false));
    electron.app.on('before-quit', () => { this.quitting = true; });
    electron.app.on('will-quit', () => { this.updateNotice?.close(); for (const notice of this.notices.values()) notice.close(); this.tray.destroy(); });
    if(options.nativeNotifications!==false&&typeof electron.Notification.handleActivation==='function'){electron.Notification.handleActivation(details=>this.activate(details));electron.Notification.isSupported();}
    this.refresh();
  }
  image() {
    return trayImage(this.e.nativeImage,{unread:!!this.count,logo:this.brand});
  }
  configure(settings) { this.settings = { ...this.settings, ...settings }; this.brand = settings.logo || ''; this.refresh(); }
  show() { if (this.win.isDestroyed()) return; if (this.win.isMinimized()) this.win.restore(); this.win.show(); this.win.focus(); this.win.flashFrame(false); }
  open(channel, epoch) { if (epoch !== this.options.session()) return; this.show();if(this.options.ready&&!this.options.ready()){const account=this.options.account?.();if(account)this.pendingActivation={channel,account:accountHash(account)};return;}this.win.webContents.send('incoming:open', channel); }
  activate(details){if(details?.type&&details.type!=='click')return;const target=notificationTarget(details?.arguments);if(!target)return;if(target.update){this.show();return;}this.lastActivation={id:target.id,time:Date.now()};this.pendingActivation=target;this.show();this.flushActivation();}
  flushActivation(){const target=this.pendingActivation,account=this.options.account?.();if(!target||!account||(this.options.ready&&!this.options.ready()))return;this.pendingActivation=null;if(target.account===accountHash(account))this.open(target.channel,this.options.session());}
  resetActivation(){this.pendingActivation=null;}
  refresh() {
    const name = this.settings.name || '모여'; this.tray.setImage(this.image()); this.tray.setToolTip(`${name}${this.count ? ` · 새 메시지 ${this.count}개 대화방` : ' · 실행 중'}`);
    const menu = [ { label: `${name} 열기`, click: () => this.show() } ];
    if (this.rooms.size) { menu.push({ type: 'separator' }); for (const [channel, item] of [...this.rooms].slice(-10).reverse()) menu.push({ label: `새 메시지 · ${item.title.slice(0,60)}`, click: () => this.open(channel, item.epoch) }); }
    menu.push({ type: 'separator' }, { label: '알림 소리', type: 'checkbox', checked: this.settings.soundEnabled !== false, click: async item => { try { const settings = await this.options.saveSound(item.checked); this.configure(settings); this.win.webContents.send('incoming:sound-setting', item.checked); } catch { this.e.dialog.showErrorBox('알림 설정 저장 실패', '설정 폴더의 쓰기 권한을 확인해 주세요.'); this.refresh(); } } }, { label: '앱 데이터 폴더 열기', click: () => this.e.shell.openPath(this.e.app.getPath('userData')) }, { type: 'separator' }, { label: '완전히 종료', click: () => this.e.app.quit() });
    this.tray.setContextMenu(this.e.Menu.buildFromTemplate(menu));
  }
  notify(value, epoch, force=false) {
    this.rooms.delete(value.channel); this.rooms.set(value.channel, { title: value.title, epoch }); this.refresh();
    if (this.settings.soundEnabled !== false && Date.now() - this.lastSound > 1500) { this.lastSound = Date.now(); this.win.webContents.send('incoming:sound'); }
    if (force || !this.win.isFocused()) {
      this.win.flashFrame(true);
      const balloon = () => { this.balloon = { channel: value.channel, epoch }; this.tray.displayBalloon?.({ title: `${value.title.slice(0,80)} · 새 메시지`, content: '클릭하면 이 대화방으로 이동합니다.', noSound: true, respectQuietTime: true }); };
      if (this.options.nativeNotifications!==false&&this.e.Notification.isSupported()) {
        const notice = new this.e.Notification({ ...(this.options.account?.()?{id:messageNotificationId(this.options.account(),value.channel)}:{}),title: `${value.title.slice(0,80)} · 새 메시지`, body: '클릭하면 이 대화방으로 이동합니다.', silent: true });
        this.notices.get(value.channel)?.close(); this.notices.set(value.channel, notice);
        notice.on('click', () => {if(notice.id&&this.lastActivation?.id===notice.id&&Date.now()-this.lastActivation.time<1000)return;this.open(value.channel, epoch);}); notice.once('failed', balloon);
        try { notice.show(); } catch { balloon(); }
      } else balloon();
    }
  }
  notifyUpdate(value) {
    if (value.phase !== 'available' || !value.nextVersion || value.nextVersion === this.updateVersion) return;
    this.updateVersion = value.nextVersion;
    if (this.win.isFocused()) return;
    this.win.flashFrame(true);
    const title = `${this.settings.name || '모여'} 새 버전 ${value.nextVersion}`;
    const body = '클릭하면 메신저에서 새 버전 다운로드 안내를 확인할 수 있습니다.';
    const balloon = () => { this.balloon = { update: true }; this.tray.displayBalloon?.({ title, content: body, noSound: true, respectQuietTime: true }); };
    if (this.options.nativeNotifications===false||!this.e.Notification.isSupported()) { balloon(); return; }
    this.updateNotice?.close();
    try {
      const notice = new this.e.Notification({ id: 'moyeo-update', title, body, silent: true }); this.updateNotice = notice;
      notice.on('click', () => this.show()); notice.once('failed', balloon); notice.show();
    } catch { balloon(); }
  }
  read(channel) { if(this.balloon?.channel===channel){if(process.platform==='win32')this.tray.removeBalloon?.();this.balloon=null;}this.rooms.delete(channel); this.notices.get(channel)?.close(); this.notices.delete(channel); this.refresh(); }
  setCount(count) { this.count = count; if (!count) { this.rooms.clear(); for (const notice of this.notices.values()) notice.close(); this.notices.clear(); this.win.flashFrame(false); } this.refresh(); }
}
module.exports = { DesktopService };

