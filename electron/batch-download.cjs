const fs=require('node:fs'),fsp=fs.promises,path=require('node:path'),{randomUUID}=require('node:crypto'),{Readable}=require('node:stream'),{pipeline}=require('node:stream/promises');
const {validId}=require('./client.cjs');
function safeName(value){let name=String(value||'attachment').replace(/[/\\<>:"|?*\x00-\x1f\x7f]/g,'_').replace(/[. ]+$/g,'').trim();if(!name||name==='.'||name==='..')name='attachment';if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))name='_'+name;const extension=path.extname(name).slice(0,24),stem=name.slice(0,name.length-path.extname(name).length).slice(0,150)||'attachment';return stem+extension;}
async function publish(temp,folder,name){const extension=path.extname(name),stem=name.slice(0,name.length-extension.length);for(let index=0;index<10000;index++){const target=path.join(folder,index?stem+' ('+(index+1)+')'+extension:name);try{try{await fsp.link(temp,target);}catch(error){if(['EPERM','ENOTSUP','EOPNOTSUPP','ENOSYS','EXDEV'].includes(error.code))await fsp.copyFile(temp,target,fs.constants.COPYFILE_EXCL);else throw error;}return target;}catch(error){if(error.code!=='EEXIST')throw error;}}throw Error('같은 이름의 파일이 너무 많습니다. 다른 폴더를 선택해 주세요.');}
async function saveBatch(client,ids,folder,{signal,isCurrent=()=>true,onProgress=()=>{}}={}){
 if(!Array.isArray(ids)||!ids.length||ids.length>500)throw Error('한 번에 1~500개 파일을 선택해 주세요.');ids.forEach(validId);ids=[...new Set(ids)];
 const saved=[],failed=[];let next=0,completed=0,canceled=false;const check=()=>{if(signal?.aborted||!isCurrent()){canceled=true;throw Error('파일 저장이 취소되었습니다.');}};
 await Promise.all(Array.from({length:Math.min(3,ids.length)},async()=>{while(next<ids.length){if(signal?.aborted||!isCurrent()){canceled=true;return;}const id=ids[next++];let info,temp;
  try{check();info=await client.fileInfo(id,signal);check();onProgress({completed,total:ids.length,failed:failed.length,name:info.name||'파일'});temp=path.join(folder,'.moyeo-'+randomUUID()+'.part');const response=await client.fileResponse(id,'original',undefined,signal);if(!response.ok){await response.body?.cancel();throw Error('파일을 저장할 수 없습니다 ('+response.status+').');}
   await pipeline(Readable.fromWeb(response.body),fs.createWriteStream(temp,{flags:'wx'}),{signal});check();if(Number.isSafeInteger(info.size)&&info.size>=0&&(await fsp.stat(temp)).size!==info.size)throw Error('전송된 파일 크기가 일치하지 않습니다. 다시 저장해 주세요.');const target=await publish(temp,folder,safeName(info.name));saved.push({id,name:path.basename(target)});
  }catch(error){if(signal?.aborted||!isCurrent())canceled=true;else failed.push({id,name:info?.name||id,error:error.message});}
  finally{if(temp)await fsp.unlink(temp).catch(()=>{});completed++;onProgress({completed,total:ids.length,failed:failed.length,name:info?.name||''});}
 }}));return {saved,failed,canceled,total:ids.length};
}
module.exports={saveBatch,safeName};
