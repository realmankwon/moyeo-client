const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { DesktopService } = require('../electron/desktop.cjs');
test('close hides to tray, notification restores its room, sound is controllable, quit exits', async () => {
  const app = new EventEmitter(), win = new EventEmitter(), notices = [], sent = [];
  let visible = true, focused = false, epoch = 'one';
  Object.assign(win, { isDestroyed: () => false, isMinimized: () => false, hide: () => { visible = false; }, show: () => { visible = true; }, focus: () => { focused = true; }, isFocused: () => focused, flashFrame: () => {}, webContents: { send: (...args) => sent.push(args) } });
  app.getPath = () => 'Data'; app.quit = () => app.emit('before-quit');
  class Tray extends EventEmitter { setImage() {} setToolTip(text) { this.tooltip = text; } setContextMenu(menu) { this.menu = menu; } destroy() { this.destroyed = true; } }
  class Notification extends EventEmitter { static isSupported() { return true; } constructor(options) { super(); this.options = options; notices.push(this); } show() {} close() {} }
  const image = { isEmpty: () => true };
  const desktop = new DesktopService({ app, Tray, Menu: { buildFromTemplate: value => value }, Notification, nativeImage: { createFromBitmap: () => image, createFromDataURL: () => image }, shell: { openPath() {} }, dialog: { showErrorBox() { throw new Error('unexpected storage failure'); } } }, win, { session: () => epoch, saveSound: async enabled => ({ name: '모여', soundEnabled: enabled }) });
  let prevented = false; win.emit('close', { preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true); assert.equal(visible, false);
  desktop.notify({ channel: 'a'.repeat(26), title: '팀 대화' }, epoch);
  assert.ok(sent.some(([event]) => event === 'incoming:sound'));
  assert.equal(notices[0].options.silent, true);
  notices[0].emit('click'); assert.equal(visible, true); assert.deepEqual(sent.at(-1), ['incoming:open', 'a'.repeat(26)]);
  focused = false; visible = false; const before = sent.length; epoch = 'two'; notices[0].emit('click'); assert.equal(sent.length,before); assert.equal(visible,false);
  const soundMenu = desktop.tray.menu.find(item => item.label === '알림 소리'); await soundMenu.click({ checked: false });
  const sounds = sent.filter(([event]) => event === 'incoming:sound').length;
  desktop.lastSound = 0; desktop.notify({ channel: 'b'.repeat(26), title: '새 대화' }, epoch);
  assert.equal(sent.filter(([event]) => event === 'incoming:sound').length, sounds);
  desktop.setCount(2); assert.match(desktop.tray.tooltip, /2개 대화방/);
  desktop.tray.menu.find(item => item.label === '완전히 종료').click();
  prevented = false; win.emit('close', { preventDefault: () => { prevented = true; } }); assert.equal(prevented, false);
  app.emit('will-quit'); assert.equal(desktop.tray.destroyed,true);
});
