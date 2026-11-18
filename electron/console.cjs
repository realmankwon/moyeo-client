const {randomUUID}=require('node:crypto');
function hasConsolePermission(roles,permissions=[]) { return roles.includes('system_admin') || permissions.some(permission=>permission==='manage_system'||/^sysconsole_(read|write)_/.test(permission)); }
class ConsoleService {
 constructor(electron,client,options={}){this.e=electron;this.client=client;this.options=options;this.window=null;this.consoleSession=null;this.serial=0;this.opening=null;}
 async access(){
  if(!this.client.me)return {available:false,roles:[]};
  const epoch=this.client.mediaKey,user=(await this.client.request('/users/me')).data;
  if(epoch!==this.client.mediaKey||user.id!==this.client.me?.id)throw Error('계정이 변경되었습니다. 다시 열어 주세요.');
  const roles=String(user.roles||'').split(/\s+/).filter(Boolean);let permissions=[];
  if(!roles.includes('system_admin')&&roles.some(role=>!['system_user','system_guest'].includes(role))){const result=(await this.client.request('/roles/names',{method:'POST',body:roles})).data;permissions=result.flatMap(role=>role.permissions||[]);}
  if(epoch!==this.client.mediaKey)throw Error('계정이 변경되었습니다. 다시 열어 주세요.');
  const available=hasConsolePermission(roles,permissions);if(!available&&this.window)this.close();
  return {available,roles};
 }
 async open(){if(this.opening)return this.opening;const task=this.createWindow();this.opening=task;try{return await task;}finally{if(this.opening===task)this.opening=null;}}
 async createWindow(){
  const epoch=this.client.mediaKey,serial=this.serial;if(!(await this.access()).available)throw Error('현재 계정에는 System Console 접근 권한이 없습니다.');
  if(epoch!==this.client.mediaKey)throw Error('계정이 변경되었습니다. 다시 열어 주세요.');
  if(this.window&&!this.window.isDestroyed()){this.window.show();this.window.focus();return;}
  const server=new URL(this.client.server),base=server.pathname.replace(/\/$/,''),cookiePath=base?base+'/':'/',token=this.client.token;
  const session=this.e.session.fromPartition('moyeo-console-'+randomUUID(),{cache:false});this.consoleSession=session;
  const trusted=address=>{try{const url=new URL(address);return url.origin===server.origin&&(url.pathname===base||url.pathname.startsWith(base+'/'));}catch{return false;}};
  const trustedNetwork=address=>{try{const url=new URL(address);if(url.protocol==='ws:')url.protocol='http:';else if(url.protocol==='wss:')url.protocol='https:';return trusted(url.href);}catch{return false;}};
  const current=()=>serial===this.serial&&epoch===this.client.mediaKey&&!!this.client.me;
  session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));session.setPermissionCheckHandler(()=>false);
  session.webRequest.onBeforeRequest({urls:['<all_urls>']},(details,callback)=>{
   if(!current()){callback({cancel:true});return;}
   if(details.method==='POST'&&trusted(details.url)&&new URL(details.url).pathname===base+'/api/v4/users/logout'){callback({cancel:true});setImmediate(()=>{this.close();this.options.onLogout?.();});return;}
   callback({cancel:false});
  });
  session.webRequest.onBeforeSendHeaders({urls:['<all_urls>']},(details,callback)=>{
   if(!current()){callback({cancel:true});return;}
   const headers={...details.requestHeaders};const url=new URL(details.url),same=trustedNetwork(details.url),api=same&&/^https?:$/.test(url.protocol)&&url.pathname.startsWith(base+'/api/');
   for(const key of Object.keys(headers)){
    if(key.toLowerCase()==='authorization')delete headers[key];
    if(key.toLowerCase()==='cookie'&&(!same||api)){headers[key]=String(headers[key]).split(';').filter(cookie=>!/^\s*(MMAUTHTOKEN|MMUSERID|MMCSRF)=/.test(cookie)).join(';');if(!headers[key])delete headers[key];}
   }
   if(api)headers.Authorization='Bearer '+token;
   callback({requestHeaders:headers});
  });
  await session.cookies.set({url:this.client.server+'/',name:'MMAUTHTOKEN',value:token,path:cookiePath,httpOnly:true,secure:server.protocol==='https:',sameSite:'lax'});
  await session.cookies.set({url:this.client.server+'/',name:'MMUSERID',value:this.client.me.id,path:cookiePath,httpOnly:false,secure:server.protocol==='https:',sameSite:'lax'});
  if(!current()){await session.clearStorageData();return;}
  const win=new this.e.BrowserWindow({title:'System Console · '+server.host,width:1280,height:900,minWidth:900,minHeight:620,show:false,autoHideMenuBar:true,webPreferences:{session,nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});this.window=win;
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.setUserAgent(win.webContents.getUserAgent().replace(/\b(?:Electron|moyeo-mattermost-client)\/[^\s]+/g,'').replace(/\s{2,}/g,' ').trim());
  win.webContents.on('will-navigate',(event,address)=>{if(!trusted(address))event.preventDefault();});
  win.webContents.on('will-redirect',(event,address)=>{if(!trusted(address))event.preventDefault();});
  win.webContents.on('will-attach-webview',event=>event.preventDefault());
  win.on('closed',()=>{if(this.window===win){this.window=null;this.serial++;}if(this.consoleSession===session)this.consoleSession=null;session.closeAllConnections().catch(()=>{});session.clearStorageData().catch(()=>{});session.clearCache().catch(()=>{});});
  win.once('ready-to-show',()=>{if(current())win.show();else win.destroy();});
  try{await win.loadURL(this.client.server+'/admin_console');if(!current()){win.destroy();return;}win.show();}
  catch(error){if(!win.isDestroyed())win.destroy();throw new Error('System Console을 불러오지 못했습니다. 서버의 웹 화면 제공 여부와 네트워크를 확인해 주세요.');}
 }
 close(){this.serial++;if(this.window&&!this.window.isDestroyed())this.window.destroy();this.window=null;}
}
module.exports={ConsoleService,hasConsolePermission};
