const fs = require('node:fs/promises');
const path = require('node:path');
const { createWriteStream } = require('node:fs');
const { pipeline } = require('node:stream/promises');
const { downloadArtifact } = require('@electron/get');
const yauzl = require('yauzl');
const yazl = require('yazl');
const plist = require('plist');
const { execFileSync } = require('node:child_process');
const { tool } = require('./mac-sign-tool.cjs');
const root = path.resolve(__dirname, '..');
const pkg = require('../package.json');
const electronVersion = require('electron/package.json').version;
const openZip = file => new Promise((resolve,reject) => yauzl.open(file,{lazyEntries:true},(error,zip)=>error?reject(error):resolve(zip)));
const streamEntry = (zip,entry) => new Promise((resolve,reject)=>zip.openReadStream(entry,(error,stream)=>error?reject(error):resolve(stream)));
async function bytes(stream) { const chunks=[];for await(const chunk of stream)chunks.push(chunk);return Buffer.concat(chunks); }
async function sourceFiles(directory,prefix='') { let result=[];for(const entry of await fs.readdir(directory,{withFileTypes:true})){const relative=prefix+entry.name; if(entry.isDirectory())result.push(...await sourceFiles(path.join(directory,entry.name),relative+'/'));else if(entry.isFile()) result.push([path.join(directory,entry.name),relative]);}return result; }
async function build(arch,runtime) {
 const target=path.join(root,'dist','mac-staging',`Moyeo-${pkg.version}-mac-${arch}-unsigned.zip`);
 await fs.mkdir(path.dirname(target),{recursive:true});
 const output=new yazl.ZipFile(); const completed=pipeline(output.outputStream,createWriteStream(target));
 // Failures in the writer must close the reader as well.
 let failure;completed.catch(error=>{failure=error;});
 const input=await openZip(runtime);
 await new Promise((resolve,reject)=>{
  input.on('error',reject);input.on('end',resolve);
  input.on('entry',entry=>{(async()=>{
   if(failure)throw failure;
   if(!entry.fileName.startsWith('Electron.app/')) {
    if(!entry.fileName.endsWith('/')) { const stream=await streamEntry(input,entry);const drained=new Promise((res,rej)=>{stream.on('end',res);stream.on('error',rej);});output.addReadStream(stream,'runtime-notices/'+entry.fileName,{mode:0o100644});await drained; }
    input.readEntry();return;
   }
   const name=entry.fileName.replace(/^Electron\.app\//,'Moyeo.app/');
   if(name.startsWith('Moyeo.app/Contents/_CodeSignature/')||name==='Moyeo.app/Contents/Resources/default_app.asar'){input.readEntry();return;}
   const mode=entry.externalFileAttributes>>>16;
   const options={mode:mode||0o100644,mtime:entry.getLastModDate(),compress:true};
   if(name.endsWith('/')) output.addEmptyDirectory(name,{mtime:options.mtime,mode:mode||0o40755});
   else if(name==='Moyeo.app/Contents/Info.plist') {
    const info=plist.parse((await bytes(await streamEntry(input,entry))).toString());
    delete info.ElectronAsarIntegrity;
    Object.assign(info,{CFBundleIdentifier:'com.moyeo.mattermost',CFBundleName:'Moyeo',CFBundleDisplayName:'Moyeo',CFBundleShortVersionString:pkg.version,CFBundleVersion:pkg.version,NSMicrophoneUsageDescription:'채팅에서 음성 및 영상 기능을 사용할 때 마이크 접근이 필요합니다.'});
    output.addBuffer(Buffer.from(plist.build(info)),name,options);
   } else { const stream=await streamEntry(input,entry); const drained=new Promise((res,rej)=>{stream.on('end',res);stream.on('error',rej);});output.addReadStream(stream,name,options);await drained; }
   input.readEntry();
  })().catch(error=>{input.close();reject(error);});});
  input.readEntry();
 });
 const app='Moyeo.app/Contents/Resources/app/';
 for(const folder of ['electron','src'])for(const [file,name]of await sourceFiles(path.join(root,folder)))output.addFile(file,app+folder+'/'+name,{mode:0o100644});
 output.addBuffer(Buffer.from(JSON.stringify({name:pkg.name,version:pkg.version,main:pkg.main,description:pkg.description})),app+'package.json',{mode:0o100644});
 const guide=`모여 ${pkg.version} · macOS ${arch}\n\nZIP을 Mac에서 풀고 Moyeo.app을 응용 프로그램으로 옮긴 뒤 더블클릭하세요. 별도 준비 스크립트는 필요하지 않습니다.\n\n앱과 중첩 실행 파일은 배포 전에 ad-hoc 서명했습니다. Developer ID 서명 및 Apple 공증은 아직 없으므로 최초 실행이 차단되면 시스템 설정 > 개인정보 보호 및 보안에서 이 앱의 실행을 허용해야 할 수 있습니다. 실제 실행 테스트 여부는 배포 시 제공하는 검증 결과를 확인하세요.\n\n설정과 암호화 로그인 정보는 ~/Library/Application Support/${pkg.name}에 저장됩니다.\n`;
 output.addBuffer(Buffer.from(guide),'README-MAC.txt',{mode:0o100644});
 output.end();await completed;return target;
}
const linuxPath = value => { const absolute=path.resolve(value); const match=absolute.match(/^([a-z]):[\\/](.*)$/i); if(!match)throw Error('Unsupported WSL path'); return '/mnt/'+match[1].toLowerCase()+'/'+match[2].replaceAll('\\','/'); };
(async()=>{
 if(!['win32','darwin'].includes(process.platform))throw Error('Mac packaging requires Windows with WSL or macOS.');
 await fs.mkdir(path.join(root,'dist'),{recursive:true});
 const arches=['arm64','x64'];
 const signer=process.platform==='win32'?await tool():null;
 const downloads=await Promise.all(arches.map(arch=>downloadArtifact({version:electronVersion,platform:'darwin',arch,artifactName:'electron',cacheRoot:path.join(root,'dist','runtime-cache')})));
 for(let i=0;i<arches.length;i++){
  const unsigned=await build(arches[i],downloads[i]);
  const target=path.join(root,'dist',`Moyeo-${pkg.version}-mac-${arches[i]}.zip`);
  const script=path.join(root,'scripts/sign-mac.py');
  if(process.platform==='darwin')execFileSync('python3',[script,unsigned,target,'--native'],{stdio:'inherit'});
  else execFileSync('wsl.exe',['-d',process.env.MOYEO_WSL_DISTRO||'Ubuntu','--','python3',linuxPath(script),linuxPath(unsigned),linuxPath(target),linuxPath(signer)],{stdio:'inherit',windowsHide:true});
  console.log('macOS '+arches[i]+': '+target);
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
