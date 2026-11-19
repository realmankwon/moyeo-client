const {validId}=require('./client.cjs');
async function copyFileImage(client,id,{nativeImage,clipboard,ClipboardItem}){
 validId(id);const epoch=client.mediaKey,limit=30*1024*1024,info=await client.fileInfo(id);
 const current=()=>{if(epoch!==client.mediaKey||!client.me)throw Error('서버 연결이 변경되었습니다.');};current();
 if(!String(info.mime_type||'').startsWith('image/'))throw Error('이미지 파일만 복사할 수 있습니다.');
 if(info.size>limit)throw Error('이미지 복사는 30MB까지 지원합니다.');
 const response=await client.fileResponse(id);current();
 if(!response.ok){await response.body?.cancel();throw Error('이미지를 불러올 수 없습니다 ('+response.status+').');}
 if(!String(response.headers.get('content-type')||'').startsWith('image/')){await response.body?.cancel();throw Error('이미지 응답 형식을 확인해 주세요.');}
 const reader=response.body.getReader(),chunks=[];let length=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>limit)throw Error('이미지 복사는 30MB까지 지원합니다.');chunks.push(Buffer.from(value));}current();const image=nativeImage.createFromBuffer(Buffer.concat(chunks));if(image.isEmpty())throw Error('이 이미지 형식은 클립보드로 복사할 수 없습니다. 저장 후 열기를 이용해 주세요.');const bytes=image.toPNG();if(bytes.length>limit)throw Error('변환된 이미지가 너무 큽니다. 저장 후 열기를 이용해 주세요.');current();await clipboard.write([new ClipboardItem({'image/png':new Blob([bytes],{type:'image/png'})})]);return true;}finally{await reader.cancel();}
}
module.exports={copyFileImage};
