// Render the checked-in SVG with Chromium so all exported sizes share one source.
const fs = require('node:fs/promises');
const path = require('node:path');
const { _electron: electron } = require('@playwright/test');
const root = path.resolve(__dirname, '..');
function icoBitmap(size, rgba) {
  const maskStride = Math.ceil(size / 32) * 4, pixels = Buffer.alloc(size * size * 4), mask = Buffer.alloc(maskStride * size), header = Buffer.alloc(40);
  header.writeUInt32LE(40); header.writeInt32LE(size,4); header.writeInt32LE(size*2,8); header.writeUInt16LE(1,12); header.writeUInt16LE(32,14); header.writeUInt32LE(pixels.length,20);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){const src=(y*size+x)*4,dst=((size-1-y)*size+x)*4;pixels[dst]=rgba[src+2];pixels[dst+1]=rgba[src+1];pixels[dst+2]=rgba[src];pixels[dst+3]=rgba[src+3];if(!rgba[src+3])mask[(size-1-y)*maskStride+(x>>3)]|=128>>(x%8);}
  return Buffer.concat([header,pixels,mask]);
}
(async()=>{
  const output=path.join(root,'src/assets/icons'),work=path.join(root,'dist/icon-renderer');await fs.mkdir(output,{recursive:true});await fs.mkdir(work,{recursive:true});
  await fs.writeFile(path.join(work,'main.cjs'),`const {app,BrowserWindow}=require('electron');app.setName('moyeo-icon-builder');app.whenReady().then(()=>{const win=new BrowserWindow({show:false,width:1100,height:1100,webPreferences:{sandbox:true,contextIsolation:true}});win.loadURL('about:blank');});`);
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const app=await electron.launch({...(process.env.MOYEO_ICON_ELECTRON?{executablePath:process.env.MOYEO_ICON_ELECTRON}:{}),args:[path.join(work,'main.cjs')],env});
  try{
    const page=await app.firstWindow();
    async function render(svg,size){return page.evaluate(async({svg,size})=>{const image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);await image.decode();const canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,size,size);return{png:canvas.toDataURL('image/png').split(',')[1],rgba:size<=128?Array.from(ctx.getImageData(0,0,size,size).data):null};},{svg,size});}
    const svg=await fs.readFile(path.join(root,'build/icon.svg'),'utf8'),tray=await fs.readFile(path.join(root,'build/tray.svg'),'utf8');
    const exports=new Map();
    for(const size of [16,24,32,48,64,128,256,512,1024]){const value=await render(svg,size);exports.set(size,value);await fs.writeFile(path.join(output,`icon${size}.png`),Buffer.from(value.png,'base64'));}
    await fs.copyFile(path.join(output,'icon1024.png'),path.join(root,'build/icon.png'));
    await fs.writeFile(path.join(output,'brand.svg'),svg.replace('viewBox="0 0 1024 1024"','viewBox="96 96 832 832"'));
    for(const [name,source,size] of [ ['trayTemplate.png',tray,18],['trayTemplate@2x.png',tray,36],['tray-unreadTemplate.png',tray.replace('</svg>','<circle cx="19.5" cy="4" r="3" fill="#000"/></svg>'),18],['tray-unreadTemplate@2x.png',tray.replace('</svg>','<circle cx="19.5" cy="4" r="3" fill="#000"/></svg>'),36],['tray.png',svg,32],['tray@2x.png',svg,64],['tray-unread.png',svg.replace('</svg>','<circle cx="818" cy="209" r="127" fill="#fff"/><circle cx="818" cy="209" r="92" fill="#ee777e"/></svg>'),32],['tray-unread@2x.png',svg.replace('</svg>','<circle cx="818" cy="209" r="127" fill="#fff"/><circle cx="818" cy="209" r="92" fill="#ee777e"/></svg>'),64] ])await fs.writeFile(path.join(output,name),Buffer.from((await render(source,size)).png,'base64'));
    const sizes=[16,24,32,48,64,128,256],header=Buffer.alloc(6+16*sizes.length);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);const chunks=[];let offset=header.length;
    sizes.forEach((size,i)=>{const data=size===256?Buffer.from(exports.get(size).png,'base64'):icoBitmap(size,exports.get(size).rgba);const at=6+i*16;header[at]=header[at+1]=size===256?0:size;header.writeUInt16LE(1,at+4);header.writeUInt16LE(32,at+6);header.writeUInt32LE(data.length,at+8);header.writeUInt32LE(offset,at+12);offset+=data.length;chunks.push(data);});
    await fs.writeFile(path.join(root,'build/icon.ico'),Buffer.concat([header,...chunks]));
    const icnsChunks=[]; for(const [type,size] of [['icp4',16],['icp5',32],['icp6',64],['ic07',128],['ic08',256],['ic09',512],['ic10',1024],['ic11',32],['ic12',64],['ic13',256],['ic14',512]]){const png=Buffer.from(exports.get(size).png,'base64'),chunk=Buffer.alloc(8);chunk.write(type);chunk.writeUInt32BE(8+png.length,4);icnsChunks.push(chunk,png);}const icnsHeader=Buffer.alloc(8);icnsHeader.write('icns');icnsHeader.writeUInt32BE(8+icnsChunks.reduce((total,b)=>total+b.length,0),4);await fs.writeFile(path.join(root,'build/icon.icns'),Buffer.concat([icnsHeader,...icnsChunks]));
    console.log('Generated app PNG, multi-size Windows ICO, Mac ICNS and monochrome Retina tray icons.');
  }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
