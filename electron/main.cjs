const electron = require('electron');
const { app, BrowserWindow, ipcMain, dialog, nativeImage, protocol, net, clipboard } = electron;
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { MattermostClient } = require('./client.cjs');
const { registerFiles } = require('./files.cjs');
const { PublicLinkPreviews } = require('./public-link-previews.cjs');
const { registerComposer } = require('./composer.cjs');
const { PersonalStore } = require('./personal.cjs');
const { GiphyService } = require('./giphy.cjs');
const { configurePortable } = require('./portable.cjs');
const { DesktopService } = require('./desktop.cjs');
const { SessionStore } = require('./session.cjs');
const { StartupService } = require('./startup.cjs');
const { TypingService } = require('./typing.cjs');
const { ConsoleService } = require('./console.cjs');
const { ChatWindows } = require('./chat-windows.cjs');
const { UpdateService } = require('./updates.cjs');
const { importLegacyData } = require('./migrate-data.cjs');
const { quitForInstall } = require('./install-exit.cjs');
const { AccountService } = require('./account.cjs');
const { AdminService } = require('./admin.cjs');
const { configureNotifications } = require('./notifications.cjs');
const { appIconPath } = require('./icons.cjs');
// Keep the existing app-data path and macOS encryption identity across installer builds.
app.setName('moyeo-mattermost-client');
if (!app.commandLine.hasSwitch('user-data-dir')) {
  const data = path.join(app.getPath('appData'), 'moyeo-mattermost-client');
  require('node:fs').mkdirSync(data, { recursive: true });
  app.setPath('userData', data);
}
configurePortable(app);
const singleInstance = app.requestSingleInstanceLock();
const installationExit = process.platform === 'win32' && app.commandLine.hasSwitch('quit-for-install');
if (!singleInstance) app.quit();
if (singleInstance && installationExit) app.exit(0);
protocol.registerSchemesAsPrivileged([{ scheme: 'moyeo-media', privileges: { standard: true, secure: true, stream: true } },{scheme:'moyeo-assets',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
const client = new MattermostClient();
const page = pathToFileURL(path.join(__dirname, '../src/index.html')).href;
const chatWindows = new ChatWindows(electron,client,page);
let win, desktop;
const defaults = { name: '모여', accent: '#fee34a', chatBackground: '#e8eef3', logo: '', chatIcon: '', peopleIcon: '', settingsIcon: '', soundEnabled: true, autoLogin: true, theme: 'system' };
const themeSource = value => ['light', 'dark'].includes(value) ? value : 'system';
// The native window color shows during load and resize, so it follows the theme too.
const paintWindows = () => { const color = electron.nativeTheme.shouldUseDarkColors ? '#1c1f25' : '#f8f9fb'; for (const item of BrowserWindow.getAllWindows()) if (!item.isDestroyed()) item.setBackgroundColor(color); };
app.whenReady().then(() => { electron.nativeTheme.on('updated', paintWindows); paintWindows(); });
app.on('browser-window-created', () => { if (app.isReady()) setImmediate(paintWindows); });
app.on('second-instance', (_event, argv) => { if (process.platform === 'win32' && argv.includes('--quit-for-install')) app.quit(); else desktop?.show(); });
app.on('activate', () => desktop?.show());
function handle(name, fn) {
  ipcMain.handle(name, async (event, ...args) => {
    return chatWindows.invoke(event,()=>fn(...args));
  });
}
async function readSettings() {
  try { return { ...defaults, ...JSON.parse(await fs.readFile(path.join(app.getPath('userData'), 'appearance.json'), 'utf8')) }; }
  catch { return { ...defaults }; }
}
if (singleInstance) app.whenReady().then(async () => {
  if (process.platform === 'darwin') app.dock.setIcon(appIconPath);
  const sessions = new SessionStore(path.join(app.getPath('userData'), 'login.bin'), electron.safeStorage);
  const notificationPolicy=await configureNotifications(electron);
  const startup = new StartupService(app,process.env,process.execPath,notificationPolicy.startupName);
  let incomingReady=false;
  const startHidden = app.commandLine.hasSwitch('start-in-tray') || (process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAtLogin);
  win = new BrowserWindow({ skipTaskbar:false, show: !startHidden, width: 1180, height: 800, minWidth: 860, minHeight: 620, backgroundColor: '#f8f9fb',
    title: '모여 · Mattermost', icon: appIconPath, autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' } });
  chatWindows.register(win);
  require('./context-menu.cjs').attachContextMenu(electron, win);
  handle('openFloatingChat',channel=>chatWindows.open(channel));
  handle('closeChatWindow',()=>{const owner=chatWindows.owner();setImmediate(()=>{if(owner&&!owner.isDestroyed())owner.close();});return true;});
  handle('getFloatingContext',()=>chatWindows.floatingContext());
  handle('setCurrentChannel',(channel,title)=>chatWindows.setChannel(channel,title));
  handle('getActiveChannels',()=>chatWindows.activeChannels());
  handle('setFloatingTop',value=>chatWindows.setTop(value));
  desktop = new DesktopService(electron, win, { session: () => client.mediaKey,nativeNotifications:notificationPolicy.native,ready:()=>incomingReady,account:()=>client.me?JSON.stringify([client.server,client.me.id]):null, saveSound: async enabled => {
    const settings = await readSettings(); settings.soundEnabled = enabled;
    await fs.writeFile(path.join(app.getPath('userData'), 'appearance.json'), JSON.stringify(settings)); return settings;
  } });
  handle('incomingReady',()=>{if(chatWindows.actor()?.floating)return;incomingReady=!!client.me;desktop.flushActivation();});
  handle('testNotification',async channel=>{if(chatWindows.actor()?.floating||!client.me)throw Error('먼저 로그인해 주세요.');const room=(await client.request('/channels/'+require('./client.cjs').validId(channel))).data;desktop.notify({channel,title:(room.display_name||'Moyeo')+' · 알림 테스트'},client.mediaKey,true);return true;});
  const updatePolicy = require('../package.json').moyeoUpdates || {};
  const updates = new UpdateService({ app, enabled: updatePolicy.enabled, repository: updatePolicy.repository,
    request: (url, options) => net.fetch(url, options), openExternal: url => electron.shell.openExternal(url)
  });
  const mainOnly = callback => { if (chatWindows.actor()?.floating) throw Error('업데이트와 데이터 가져오기는 메인 창에서 해주세요.'); return callback(); };
  handle('updates:state', () => updates.snapshot());
  handle('updates:check', () => mainOnly(() => updates.check()));
  handle('updates:openDownload', () => mainOnly(() => updates.openDownload()));
  handle('updates:quitForInstall', () => mainOnly(() => {
    if (updates.snapshot().phase !== 'available') return false;
    return quitForInstall({ app, dialog, win });
  }));
  updates.on('change', value => { chatWindows.broadcast('updates:state', value); desktop.notifyUpdate(value); });
  updates.start({ window: win, powerMonitor: electron.powerMonitor });
  handle('settings:importLegacy', () => mainOnly(async () => {
    if (client.me) throw Error('로그아웃 후 이전 데이터를 가져와 주세요.');
    const result = await dialog.showOpenDialog(win, { title: '기존 포터블 EXE 옆 Data 폴더 선택', properties: ['openDirectory'] });
    if (result.canceled) return null;
    return importLegacyData(result.filePaths[0], app.getPath('userData'));
  }));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const typing = new TypingService(client,data=>chatWindows.broadcast('chat:typing',data),WebSocket,event=>chatWindows.broadcast('chat:realtime',event));
  handle('getRealtimeStatus',()=>({connected:typing.connected}));
  const systemConsole = new ConsoleService(electron,client,{requireSystemAdmin:true,onLogout:()=>{if(!win.isDestroyed())win.webContents.send('account:logout');}});
  handle('getConsoleAccess',()=>systemConsole.access());
  handle('openSystemConsole',section=>systemConsole.open(section));
  const adminService=new AdminService(client);
  handle('admin',(action,params)=>{if(chatWindows.actor()?.floating)throw Error('서버 관리는 메인 창에서 열어 주세요.');return adminService.run(action,params);});
  const accountService=new AccountService(client);
  handle('accountProfile',()=>accountService.profile());
  handle('saveAccountProfile',async values=>{const user=await accountService.save(values);chatWindows.broadcast('account:profile-updated',user);return user;});
  handle('chooseProfileImage',async()=>{const {epoch,id}=await accountService.current();const result=await dialog.showOpenDialog(chatWindows.owner()||win,{title:'프로필 사진 선택',properties:['openFile'],filters:[{name:'이미지',extensions:['png','jpg','jpeg','webp','gif','bmp']}]});accountService.assert(epoch,id);if(result.canceled||!result.filePaths[0])return null;const stat=await fs.stat(result.filePaths[0]);if(!stat.isFile()||stat.size>10*1024*1024)throw Error('프로필 사진은 10MB 이하의 이미지를 선택해 주세요.');const image=nativeImage.createFromBuffer(await fs.readFile(result.filePaths[0]));if(image.isEmpty())throw Error('이 이미지 형식을 읽을 수 없습니다. PNG나 JPG 파일을 선택해 주세요.');const size=image.getSize();if(size.width*size.height>40000000)throw Error('이미지 해상도가 너무 큽니다. 작은 이미지로 다시 선택해 주세요.');const side=Math.min(size.width,size.height),bytes=image.crop({x:Math.floor((size.width-side)/2),y:Math.floor((size.height-side)/2),width:side,height:side}).resize({width:512,height:512,quality:'best'}).toPNG();return accountService.stagePicture(bytes,epoch,id);});
  for(const [name,method]of [['saveProfileImage','savePicture'],['resetProfileImage','resetPicture'],['saveCustomStatus','customStatus'],['clearCustomStatus','clearCustomStatus']])handle(name,async value=>{const user=await accountService[method](value);chatWindows.broadcast('account:profile-updated',user);return user;});
  handle('changeAccountPassword',(currentPassword,newPassword)=>accountService.password(currentPassword,newPassword));
  handle('pinnedPosts',channel=>client.request('/channels/'+require('./client.cjs').validId(channel)+'/pinned').then(result=>result.data));
  handle('setPostPin',async(id,pinned)=>{if(typeof pinned!=='boolean')throw Error('핀 상태를 확인해 주세요.');const epoch=client.mediaKey;require('./client.cjs').validId(id);await client.request('/posts/'+id+(pinned?'/pin':'/unpin'),{method:'POST'});if(epoch!==client.mediaKey)throw Error('계정이 변경되었습니다.');const post=await client.post(id);if(epoch!==client.mediaKey)throw Error('계정이 변경되었습니다.');chatWindows.broadcast('chat:realtime',{type:'post_edited',post});return post;});
  app.on('before-quit',()=>systemConsole.close());
  app.on('before-quit', () => typing.stop());
  handle('sendTyping', (channel,parent) => typing.send(channel,parent));
  win.webContents.on('will-navigate', event => event.preventDefault());
  const publicLinkPreviews = new PublicLinkPreviews(client);
  handle('publicLinkPreview', address => publicLinkPreviews.lookup(address));
  app.on('before-quit', () => publicLinkPreviews.reset());
  const giphy = new GiphyService(client, (...args) => net.fetch(...args));
  const personal = new PersonalStore(path.join(app.getPath('userData'), 'personal-settings.json'));
  const account = () => { if (!client.me) throw new Error('먼저 로그인해 주세요.'); return JSON.stringify([client.server, client.me.id]); };
  handle('getPersonalSettings', () => personal.get(account()));
  handle('savePersonalSettings', (field, value) => personal.update(account(), field, value));
  const saveTheme = async change => {
    const owner = account(), userId = client.me.id;
    const settings = await change(owner);
    if (client.me && account() === owner) chatWindows.broadcast('personal:themes', { userId, settings });
    return settings;
  };
  handle('theme:room', (id, theme) => saveTheme(owner => personal.setRoomTheme(owner, id, theme)));
  handle('theme:global', (theme, replaceRooms) => saveTheme(owner => personal.setGlobalTheme(owner, theme, replaceRooms)));
  handle('gifSearch', (term, offset) => { account(); return giphy.search(term, offset); });
  handle('gifById', id => { account(); return giphy.get(id); });
  handle('gifReload', () => { giphy.reset(); });
  for (const method of ['post', 'thread', 'editPost', 'deletePost', 'postLink', 'sharePost']) handle(method, (...args) => client[method](...args));
  for (const method of ['reactions', 'setReaction']) handle(method, (...args) => client[method](...args));
  handle('copyText', text => { if (typeof text !== 'string' || text.length > 100000) throw new Error('복사할 내용을 확인해 주세요.'); clipboard.writeText(text); });
  let incomingCount = 0;
  handle('notifyIncoming', value => {
    if(chatWindows.actor()?.floating)return;
    if (!client.me || typeof value?.title !== 'string') return;
    require('./client.cjs').validId(value.channel);
    if(chatWindows.activeChannels().includes(value.channel))return;
    chatWindows.flash(value.channel);desktop.notify(value, client.mediaKey);
  });
  handle('clearIncoming', id => { require('./client.cjs').validId(id); desktop.read(id); });
  handle('isWindowActive', () => {const owner=chatWindows.owner()||win;return owner.isVisible()&&owner.isFocused()&&!owner.isMinimized();});
  handle('resolvePostLink', address => client.resolvePostLink(address));
  handle('searchContent',options=>client.searchContent(options));
  handle('mentionUsers',(...args)=>client.mentionUsers(...args));
  handle('userByUsername',name=>client.userByUsername(name));
  handle('setIncomingCount', async count => {
    if(chatWindows.actor()?.floating)return;
    if (!Number.isInteger(count) || count < 0 || count > 10000) return;
    incomingCount = count; const settings = await readSettings(); if (win.isDestroyed() || incomingCount !== count) return;
    win.setTitle(`${count ? `(${count}) ` : ''}${settings.name} · Mattermost`); app.setBadgeCount(count);
    desktop.setCount(count);
  });
  handle('connect', async data => {
    incomingReady=false;
    if(chatWindows.actor()?.floating)throw Error('계정 변경은 메인 창에서 해주세요.');
    chatWindows.closeFloating();
    systemConsole.close(); typing.stop(); resetComposer(); giphy.reset(); publicLinkPreviews.reset(); await sessions.clear();
    const user = await client.connect(data);
    const settings = await readSettings(); settings.autoLogin = data.remember !== false;
    await fs.writeFile(path.join(app.getPath('userData'), 'appearance.json'), JSON.stringify(settings));
    if (settings.autoLogin) await sessions.save(client);
    typing.start();
    return user;
  });
  handle('restoreSession', async () => {
    if(client.me)return client.withAvatar(client.me);
    if (!(await readSettings()).autoLogin) return null;
    const saved = await sessions.load(); if (!saved) return null;
    try { const user = await client.connect(saved); client.ownedSession = saved.ownedSession; typing.start(); return user; }
    catch (error) { if (error.status === 401 || error.status === 403) await sessions.clear(); throw error; }
  });
  registerFiles(client, handle, () => chatWindows.owner()||win, giphy, publicLinkPreviews);
  const resetComposer = registerComposer(client, handle, () => chatWindows.owner()||win, giphy);
  handle('disconnect', async () => {incomingReady=false;desktop.resetActivation(); chatWindows.closeFloating();systemConsole.close(); typing.stop(); await sessions.clear(); resetComposer(); giphy.reset(); publicLinkPreviews.reset(); const connected=!!client.me;try{return await client.disconnect();}finally{if(connected)chatWindows.broadcast('account:cleared');} });
  for (const method of ['channelMembers', 'setChannelNotify', 'myStatus', 'browseChannels', 'joinChannel', 'createChannel', 'createGroup', 'channelDetail', 'addChannelMember', 'leaveChannel', 'patchChannel', 'savedPostIds', 'savedPosts', 'setSavedPost', 'executeCommand', 'postAction']) handle(method, (...args) => client[method](...args));
  handle('channelReadStates',ids=>client.channelReadStates(ids));
  handle('view',async channel=>{const epoch=client.mediaKey,result=await client.view(channel);if(epoch!==client.mediaKey)throw Error('계정이 변경되었습니다.');if(result.last_viewed_at_times&&typeof result.last_viewed_at_times==='object')chatWindows.broadcast('chat:realtime',{type:'channels_viewed',times:result.last_viewed_at_times});else chatWindows.read(channel);return result;});
  handle('send',async(...args)=>{const result=await client.send(...args);chatWindows.broadcast('chat:posted',result);return result;});
  for (const method of ['channels', 'users', 'posts', 'searchUsers', 'direct', 'teams', 'favorites', 'setFavorite']) handle(method, (...args) => client[method](...args));
  handle('userProfile', async id => {
    const user = client.withAvatar((await client.request(`/users/${require('./client.cjs').validId(id)}`)).data);
    let status = null; try { status = (await client.request(`/users/${id}/status`)).data; } catch { /* Status may be hidden by server policy. */ }
    return { user, status };
  });
  handle('settings:get', async () => ({ ...await readSettings(), startAtLogin: startup.get(), platform: process.platform }));
  handle('settings:save', async value => {
    const settings = await readSettings();
    if (typeof value.name === 'string') settings.name = value.name.trim().slice(0, 24) || defaults.name;
    for (const key of ['accent', 'chatBackground']) if (/^#[a-f\d]{6}$/i.test(value[key])) settings[key] = value[key];
    if (typeof value.soundEnabled === 'boolean') settings.soundEnabled = value.soundEnabled;
    if (typeof value.autoLogin === 'boolean') settings.autoLogin = value.autoLogin;
    if (['system', 'light', 'dark'].includes(value.theme)) settings.theme = value.theme;
    if (value.reset) Object.assign(settings, defaults);
    electron.nativeTheme.themeSource = themeSource(settings.theme);
    chatWindows.broadcast('settings:theme', themeSource(settings.theme));
    if (typeof value.startAtLogin === 'boolean') startup.set(value.startAtLogin);
    if (!settings.autoLogin) await sessions.clear();
    else if (client.me) await sessions.save(client);
    await fs.writeFile(path.join(app.getPath('userData'), 'appearance.json'), JSON.stringify(settings), { mode: 0o600 });
    win.setTitle(`${settings.name} · Mattermost`);
    desktop.configure(settings);
    return { ...settings, startAtLogin: startup.get(), platform: process.platform };
  });
  handle('settings:image', async key => {
    if (!['logo', 'chatIcon', 'peopleIcon', 'settingsIcon'].includes(key)) throw new Error('지원하지 않는 이미지입니다.');
    const result = await dialog.showOpenDialog(win, { title: '로고 또는 아이콘 가져오기', filters: [{ name: '이미지', extensions: ['png', 'jpg', 'jpeg', 'webp', 'ico'] }], properties: ['openFile'] });
    if (result.canceled) return null;
    const file = result.filePaths[0];
    if ((await fs.stat(file)).size > 5 * 1024 * 1024) throw new Error('5MB 이하 이미지를 선택해 주세요.');
    const img = nativeImage.createFromPath(file);
    if (img.isEmpty()) throw new Error('이미지를 읽을 수 없습니다.');
    const settings = await readSettings();
    settings[key] = img.resize({ width: 192, height: 192, quality: 'best' }).toDataURL();
    await fs.writeFile(path.join(app.getPath('userData'), 'appearance.json'), JSON.stringify(settings), { mode: 0o600 });
    if (key === 'logo') win.setIcon(nativeImage.createFromDataURL(settings.logo));
    desktop.configure(settings);
    return { ...settings, startAtLogin: startup.get(), platform: process.platform };
  });
  readSettings().then(settings => {
    electron.nativeTheme.themeSource = themeSource(settings.theme);
    if (win.isDestroyed()) return;
    win.setTitle(`${settings.name} · Mattermost`);
    desktop.configure(settings);
    if (settings.logo) win.setIcon(nativeImage.createFromDataURL(settings.logo));
  });
  win.loadFile(path.join(__dirname, '../src/index.html'));
});
app.on('window-all-closed', () => { if (desktop?.quitting || !desktop) app.quit(); });
