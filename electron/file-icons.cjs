const fs=require('node:fs/promises'),path=require('node:path');
const {ext,classify}=require('../src/file-types.js');
class FileIcons {
 constructor(app){this.app=app;this.cache=new Map();}
 async get(info){const extension=ext(info);if(!/^[a-z0-9]{1,12}$/.test(extension)||['image','video'].includes(classify(info)))return '';
  if(this.cache.has(extension))return this.cache.get(extension);
  const task=this.load(extension);this.cache.set(extension,task);while(this.cache.size>100)this.cache.delete(this.cache.keys().next().value);return task;
 }
 async load(extension){let folder;try{folder=await fs.mkdtemp(path.join(this.app.getPath('temp'),'moyeo-file-icon-'));const file=path.join(folder,'attachment.'+extension);await fs.writeFile(file,'',{flag:'wx'});try{const icon=await this.app.getFileIcon(file,{size:process.platform==='darwin'?'normal':'large'});return icon.isEmpty()?'':icon.toDataURL();}finally{await fs.unlink(file);}}catch{return '';}finally{if(folder)await fs.rmdir(folder).catch(()=>{});}}
}
module.exports={FileIcons};
