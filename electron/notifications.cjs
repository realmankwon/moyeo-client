const path=require('node:path');
const fs=require('node:fs/promises');
const {createHash,randomUUID}=require('node:crypto');
const {execFile}=require('node:child_process');
const APP_ID='com.moyeo.mattermost';
const TOAST_CLSID='{9A6812F1-7503-4E7A-BA50-8B20FD9E483D}';
function notificationPolicy(app,platform=process.platform,installed=true){const production=(platform!=='win32'||installed)&&!!app.isPackaged&&!app.commandLine.hasSwitch('user-data-dir');const suffix=createHash('sha256').update(app.getPath('userData')).digest('hex').slice(0,12);return {native:production,appId:production?APP_ID:APP_ID+'.dev.'+suffix,startupName:production?'MoyeoMattermost':'MoyeoMattermostDev-'+suffix,platform};}
function accountHash(account){return createHash('sha256').update(String(account)).digest('hex').slice(0,16);}
function messageNotificationId(account,channel){if(typeof account!=='string'||!account||! /^[a-z0-9]{26}$/.test(channel))throw Error('Invalid notification target');return 'moyeo-'+accountHash(account)+'-'+channel;}
function notificationTarget(argumentsText){if(typeof argumentsText!=='string'||argumentsText.length>1024)return null;const fields=new URLSearchParams(argumentsText);if(fields.get('type')&&fields.get('type')!=='click')return null;const id=fields.get('tag');if(id==='moyeo-update')return {update:true};const match=/^moyeo-([a-f0-9]{16})-([a-z0-9]{26})$/.exec(id||'');return match?{id,account:match[1],channel:match[2]}:null;}
async function configureNotifications(electron,{exe=process.execPath,platform=process.platform,files=fs,clearHistory}={}){
 const {app,shell}=electron;let installed=true;if(platform==='win32'&&app.isPackaged){try{await files.access(path.join(path.dirname(exe),'Uninstall Moyeo.exe'));}catch{installed=false;}}const policy=notificationPolicy(app,platform,installed);if(platform!=='win32')return policy;
 app.setAppUserModelId(policy.appId);
 if(!policy.native)return policy; // Even isSupported()/the constructor registers native shortcuts.
 try{
  app.setToastActivatorCLSID(TOAST_CLSID);
  const programs=path.join(app.getPath('appData'),'Microsoft/Windows/Start Menu/Programs');await files.mkdir(programs,{recursive:true});
  const shortcut=path.join(programs,'Moyeo.lnk');let existing;try{existing=shell.readShortcutLink(shortcut);}catch{}
  if(existing&&existing.appUserModelId!==APP_ID&&existing.target.toLowerCase()!==exe.toLowerCase())throw Error('Unrelated Moyeo shortcut');
  if(!shell.writeShortcutLink(shortcut,existing?'update':'create',{target:exe,cwd:path.dirname(exe),args:'',description:'Moyeo',icon:exe,iconIndex:0,appUserModelId:APP_ID,toastActivatorClsid:TOAST_CLSID}))throw Error('Could not register Moyeo notifications');
  const legacy=path.join(programs,'Electron.lnk');let old;try{old=shell.readShortcutLink(legacy);}catch{}
  if(old?.appUserModelId===APP_ID&&/[\\/]node_modules[\\/]electron[\\/]dist[\\/]electron[.]exe$/i.test(old.target)){
   const backups=path.join(app.getPath('userData'),'windows-notification-backups');await files.mkdir(backups,{recursive:true});await files.copyFile(legacy,path.join(backups,'Electron-'+randomUUID()+'.lnk'));await files.unlink(legacy);
   const clear=clearHistory||(()=>new Promise(resolve=>execFile(path.join(process.env.WINDIR,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command','[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime]::History.Clear("com.moyeo.mattermost")'],{windowsHide:true,timeout:10000},()=>resolve())));await clear();
  }
 }catch(error){policy.native=false;console.warn('Moyeo notification registration failed:',error.message);}
 return policy;
}
module.exports={APP_ID,TOAST_CLSID,notificationPolicy,configureNotifications,accountHash,messageNotificationId,notificationTarget};
