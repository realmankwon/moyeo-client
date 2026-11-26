const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),zlib=require('node:zlib'),yauzl=require('yauzl'),plist=require('plist');
const root=path.resolve(__dirname,'..'),version=require('../package.json').version;
const releaseOutput = process.argv[2] ? path.resolve(process.argv[2]) : null;
(async()=>{for(const arch of ['arm64','x64']){
 const file=path.join(releaseOutput || path.join(root,'dist'),`Moyeo-${version}-mac-${arch}.zip`);
 const zip=await new Promise((resolve,reject)=>yauzl.open(file,{lazyEntries:true},(e,z)=>e?reject(e):resolve(z)));
 let links=0,main=false,info=false,appPackage=false,sourceCount=0,sealed=false,signed=false;
 await new Promise((resolve,reject)=>{zip.on('error',reject);zip.on('end',resolve);zip.on('entry',entry=>{(async()=>{
  const name=entry.fileName,mode=entry.externalFileAttributes>>>16;assert.ok(!name.includes('../'));assert.ok(!name.includes('/Data/'));assert.ok(!name.endsWith('.command'));
  if(!name.endsWith('/')){
   const stream=await new Promise((res,rej)=>zip.openReadStream(entry,(e,s)=>e?rej(e):res(s)));
   let crc=0,size=0;const chunks=[];const collect=name.endsWith('/Info.plist')||name.endsWith('/MacOS/Electron')||name.startsWith('Moyeo.app/Contents/Resources/app/')||name==='Moyeo.app/Contents/Resources/app.asar'||name==='SIGNING-INFO.json';
   for await(const chunk of stream){crc=zlib.crc32(chunk,crc);size+=chunk.length;if(collect)chunks.push(chunk);}
   assert.equal(crc,entry.crc32,name);assert.equal(size,entry.uncompressedSize,name);const bytes=Buffer.concat(chunks);
   if((mode&0o170000)===0o120000)links++;
   if(name==='Moyeo.app/Contents/MacOS/Electron'){assert.ok(mode&0o111);assert.equal(bytes.readUInt32LE(4),arch==='arm64'?0x0100000c:0x01000007);main=true;}
   if(name==='Moyeo.app/Contents/Info.plist'){const data=plist.parse(bytes.toString());assert.equal(data.CFBundleIdentifier,'com.moyeo.mattermost');assert.equal(data.CFBundleVersion,version);assert.equal(data.CFBundleExecutable,'Electron');assert.equal(data.ElectronAsarIntegrity,undefined);info=true;}
   if (releaseOutput && name === 'Moyeo.app/Contents/Resources/app.asar') {
    assert.deepEqual(bytes, await fs.readFile(path.join(releaseOutput, 'win-unpacked/resources/app.asar')), 'Matching Windows and Mac app archives');
    appPackage = true;
   }
   const prefix='Moyeo.app/Contents/Resources/app/';
   if(name===prefix+'package.json'){assert.equal(JSON.parse(bytes).version,version);appPackage=true;}
   else if(name.startsWith(prefix)){assert.deepEqual(bytes,await fs.readFile(path.join(root,name.slice(prefix.length))),name);sourceCount++;}
   if(name==='SIGNING-INFO.json'){const report=JSON.parse(bytes);assert.equal(report.kind,'ad-hoc');assert.ok(report.verifiedMachO.length>=10);signed=true;}
   if(name==='Moyeo.app/Contents/_CodeSignature/CodeResources')sealed=true;
  }zip.readEntry();
 })().catch(error=>{zip.close();reject(error);});});zip.readEntry();});
 assert.ok(main&&info&&appPackage&&sealed&&signed);if (!releaseOutput) assert.ok(sourceCount>25);assert.ok(links>5);console.log(`PASS: Mac ${arch}, all ZIP CRCs, Mach-O architecture, executable modes, ${links} symlinks, ${releaseOutput ? 'same app.asar as Windows' : sourceCount + ' matching source files'}`);
}})().catch(error=>{console.error(error);process.exitCode=1;});

