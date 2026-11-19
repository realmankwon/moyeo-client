const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawn,spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
async function run(file,args){return new Promise((resolve,reject)=>{const child=spawn(file,args,{windowsHide:true,stdio:'ignore'});child.once('error',reject);child.once('exit',code=>resolve(code));});}
(async()=>{
 if(process.platform!=='win32'){console.log('SKIP: Windows installer process integration');return;}
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),"moyeo setup's test-")),install=path.join(folder,'Moyeo'),other=path.join(folder,'Moyeo-other');const children=[];
 const powershell=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),fixtureExecutable=process.execPath;
 const check=mode=>run(powershell,['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'build/installer-close.ps1'),'-InstallDir',install,'-Mode',mode]);
 const alive=child=>child.exitCode===null&&child.signalCode===null;
 async function start(file){await fs.copyFile(fixtureExecutable,file);const child=spawn(file,['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:'ignore'});children.push(child);await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});return child;}
 try{
  await fs.mkdir(install);await fs.mkdir(other);
  const installer=await start(path.join(install,'Moyeo-Setup.exe')),sibling=await start(path.join(install,'Moyeo Helper.exe')),elsewhere=await start(path.join(other,'Moyeo.exe'));
  assert.equal(await check('Check'),0,'Setup/helper and folder prefix are not the app');
  const target=await start(path.join(install,'Moyeo.exe'));const detected=await check('Check');if(detected!==10){console.error({install,realPath:await fs.realpath(install),fixtureExecutable,exitCode:target.exitCode,signalCode:target.signalCode});console.error(spawnSync(powershell,['-NoProfile','-Command',"Get-CimInstance Win32_Process -Filter \"Name='Moyeo.exe'\" | Select-Object ProcessId,SessionId,ExecutablePath | ConvertTo-Json"],{encoding:'utf8',windowsHide:true}).stdout);}assert.equal(detected,10,'Exact installed app detected');
  assert.equal(await check('Close'),0,'Legacy leftover closes after graceful request');
  assert.equal(await check('Check'),0);assert.equal(alive(target),false);for(const child of [installer,sibling,elsewhere])assert.equal(alive(child),true,'Unrelated processes survive');
  console.log('PASS: exact path, apostrophe/spaces, same-name other folder, installer/helper exclusion, legacy-process cleanup');
 }finally{
  for(const child of children)if(alive(child)){child.kill();await new Promise(resolve=>child.once('exit',resolve));}
  const absolute=path.resolve(folder),base=path.resolve(os.tmpdir())+path.sep;assert.ok(absolute.startsWith(base));await fs.rm(absolute,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
