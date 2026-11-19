const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Data } = require('resedit');
const { trayImage } = require('../electron/icons.cjs');
const root = path.resolve(__dirname, '..');
test('desktop icon containers include small and Retina sizes from the same artwork', () => {
  const ico = Data.IconFile.from(fs.readFileSync(path.join(root,'build/icon.ico')));
  assert.deepEqual(ico.icons.map(item => item.data.width), [16,24,32,48,64,128,256]);
  const icns=fs.readFileSync(path.join(root,'build/icon.icns'));assert.equal(icns.toString('ascii',0,4),'icns');assert.equal(icns.readUInt32BE(4),icns.length);
  const sizes=new Map();for(let at=8;at<icns.length;){const n=icns.readUInt32BE(at+4);assert.ok(n>=8);sizes.set(icns.toString('ascii',at,at+4),icns.subarray(at+8,at+n));at+=n;}
  assert.deepEqual(sizes.get('ic10'),fs.readFileSync(path.join(root,'src/assets/icons/icon1024.png')));
  for(const [name,size] of [['trayTemplate.png',18],['trayTemplate@2x.png',36],['tray.png',32],['tray@2x.png',64]]){const png=fs.readFileSync(path.join(root,'src/assets/icons',name));assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size);}
});
test('Mac status images use native templates; Windows keeps colored artwork and unread state', () => {
  const nativeImage={createFromPath(file){return {file,template:false,setTemplateImage(value){this.template=value;}};}};
  const normal=trayImage(nativeImage,{platform:'darwin'}),unread=trayImage(nativeImage,{platform:'darwin',unread:true});
  assert.equal(normal.template,true);assert.equal(unread.template,true);assert.notEqual(normal.file,unread.file);
  const windows=trayImage(nativeImage,{platform:'win32',unread:true});assert.equal(windows.template,false);assert.ok(windows.file.endsWith('tray-unread.png'));
});
