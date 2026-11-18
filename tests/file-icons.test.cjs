const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {FileIcons}=require('../electron/file-icons.cjs');
test('OS file icons use an empty extension placeholder, cache concurrent reads and remove temporary files',async()=>{
 const folder=path.resolve('test-results');await fs.mkdir(folder,{recursive:true});let calls=0,placeholder;
 const icons=new FileIcons({getPath:()=>folder,getFileIcon:async file=>{calls++;placeholder=file;assert.equal(path.extname(file),'.docx');assert.equal((await fs.stat(file)).size,0);return {isEmpty:()=>false,toDataURL:()=>'data:image/png;base64,test'};}});
 assert.deepEqual(await Promise.all([icons.get({name:'report.docx'}),icons.get({name:'other.docx'})]),['data:image/png;base64,test','data:image/png;base64,test']);assert.equal(calls,1);await assert.rejects(fs.access(path.dirname(placeholder)));
 assert.equal(await icons.get({name:'image.png'}),'');assert.equal(await icons.get({extension:'../bad'}),'');assert.equal(calls,1);
 const failed=new FileIcons({getPath:()=>folder,getFileIcon:async()=>{throw Error('unavailable');}});assert.equal(await failed.get({name:'report.pdf'}),'');
});
