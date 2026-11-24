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
  const image = { isEmpty: () => true, setTemplateImage() {} };
  const desktop = new DesktopService({ app, Tray, Menu: { buildFromTemplate: value => value }, Notification, nativeImage: { createFromPath: () => image, createFromBitmap: () => image, createFromDataURL: () => image }, shell: { openPath() {} }, dialog: { showErrorBox() { throw new Error('unexpected storage failure'); } } }, win, { session: () => epoch, saveSound: async enabled => ({ name: '모여', soundEnabled: enabled }) });
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
  desktop.balloon={channel:'b'.repeat(26),epoch};let removedBalloon=0;desktop.tray.removeBalloon=()=>removedBalloon++;desktop.read('b'.repeat(26));assert.equal(desktop.balloon,null);assert.equal(desktop.rooms.has('b'.repeat(26)),false);assert.equal(removedBalloon,process.platform==='win32'?1:0);
  const updateCount = notices.length;
  desktop.notifyUpdate({ phase: 'available', nextVersion: '0.15.0' });
  desktop.notifyUpdate({ phase: 'available', nextVersion: '0.15.0' });
  assert.equal(notices.length, updateCount + 1, 'Only one background notification per release');
  assert.match(notices.at(-1).options.title, /새 버전 0\.15\.0/);
  notices.at(-1).emit('click'); assert.equal(visible, true); assert.equal(focused, true);
  desktop.notifyUpdate({ phase: 'available', nextVersion: '0.16.0' });
  assert.equal(notices.length, updateCount + 1, 'Foreground discovery uses the in-app banner');
  desktop.tray.menu.find(item => item.label === '완전히 종료').click();
  prevented = false; win.emit('close', { preventDefault: () => { prevented = true; } }); assert.equal(prevented, false);
  app.emit('will-quit'); assert.equal(desktop.tray.destroyed,true);
});

test('Windows activation waits for login/UI, rejects another account and does not double-open a live notification',()=>{const account=JSON.stringify(['https://chat.example','a'.repeat(26)]),channel='b'.repeat(26),{messageNotificationId}=require('../electron/notifications.cjs'),sent=[];let ready=false,current=null,callback;const app=new EventEmitter(),win=new EventEmitter();Object.assign(win,{isDestroyed:()=>false,isMinimized:()=>false,isFocused:()=>false,show(){},focus(){},flashFrame(){},webContents:{send:(...args)=>sent.push(args)}});class Tray extends EventEmitter{setImage(){}setToolTip(){}setContextMenu(){}destroy(){}}class Notification extends EventEmitter{static isSupported(){return true;}static handleActivation(value){callback=value;}constructor(options){super();this.id=options.id;}show(){}close(){}}const e={app,Tray,Notification,Menu:{buildFromTemplate:value=>value},nativeImage:{createFromPath:()=>({setTemplateImage(){}}),createFromBitmap:()=>({})}};const desktop=new DesktopService(e,win,{session:()=>1,account:()=>current,ready:()=>ready,saveSound:async()=>({})});const args='type=click&tag='+messageNotificationId(account,channel);callback({type:'click',arguments:args});assert.equal(sent.length,0);current=account;desktop.flushActivation();assert.equal(sent.length,0);ready=true;desktop.flushActivation();assert.deepEqual(sent,[['incoming:open',channel]]);current='another account';callback({type:'click',arguments:args});assert.equal(sent.length,1);current=account;desktop.notify({channel,title:'test'},1);const notice=desktop.notices.get(channel);const before=sent.filter(row=>row[0]==='incoming:open').length;callback({type:'click',arguments:args});notice.emit('click');assert.equal(sent.filter(row=>row[0]==='incoming:open').length,before+1);const isolated=new DesktopService({...e,Notification:{isSupported(){throw Error('native presenter must stay untouched');}}},win,{session:()=>1,nativeNotifications:false,saveSound:async()=>({})});isolated.notify({channel,title:'isolated'},1);isolated.notifyUpdate({phase:'available',nextVersion:'1.0.0'});});
