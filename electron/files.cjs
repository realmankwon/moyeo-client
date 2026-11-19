const { protocol, dialog, shell, net, app } = require('electron');
const { FileIcons } = require('./file-icons.cjs');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { isText, ext, previewType, canOpen } = require('../src/file-types.js');

function registerFiles(client, handle, getWindow, giphy) {
  const icons=new FileIcons(app);
  const savedFiles=new Map();
  handle('copyFileImage',id=>require('./image-clipboard.cjs').copyFileImage(client,id,require('electron')));
  protocol.handle('moyeo-assets',request=>{
    const url=new URL(request.url);
    if(url.hostname!=='local'||url.search||request.method!=='GET'||!/^\/pdfjs\/(cmaps|standard_fonts|wasm)\/[a-zA-Z0-9_.-]+$/.test(url.pathname))return new Response(null,{status:403});
    return net.fetch(pathToFileURL(path.join(__dirname,'../src/vendor',url.pathname.slice(1))).href).then(response=>{const headers=new Headers(response.headers);headers.set('Access-Control-Allow-Origin','*');return new Response(response.body,{status:response.status,headers});});
  });
  handle('filePreview',async id=>{
    const epoch=client.mediaKey,info=await client.fileInfo(id);
    if(!previewType(info))throw Error('이 형식은 저장 후 연결된 앱에서 열어 주세요.');
    const limit=30*1024*1024;
    if(info.size>limit)throw Error('문서 미리보기는 30MB까지 지원합니다. 저장 후 열기를 이용해 주세요.');
    const response=await client.fileResponse(id);
    if(!response.ok){await response.body?.cancel();throw Error(`문서를 불러올 수 없습니다 (${response.status}).`);}
    const reader=response.body.getReader(),chunks=[];let length=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>limit)throw Error('문서 미리보기는 30MB까지 지원합니다.');chunks.push(Buffer.from(value));}
      if(epoch!==client.mediaKey)throw Error('서버 연결이 변경되었습니다.');return new Uint8Array(Buffer.concat(chunks));
    }finally{await reader.cancel();}
  });
  async function saved(token){const entry=savedFiles.get(token);if(!entry||entry.epoch!==client.mediaKey)throw Error('다시 파일을 저장한 뒤 열어 주세요.');try{if(!(await fsp.stat(entry.path)).isFile())throw Error();}catch{throw Error('저장한 파일이 이동되었거나 삭제되었습니다. 다시 저장해 주세요.');}return entry;}
  handle('openSavedFile',async token=>{const entry=await saved(token);if(!entry.canOpen)throw Error('이 파일은 저장 폴더에서 확인해 주세요.');const error=await shell.openPath(entry.path);if(error)throw Error('파일을 열 수 없습니다. 이 형식의 기본 앱을 확인하거나 저장 폴더에서 열어 주세요.');return true;});
  handle('showSavedFile',async token=>{const entry=await saved(token);shell.showItemInFolder(entry.path);return true;});
  protocol.handle('moyeo-media', async request => {
    try {
      const url = new URL(request.url);
      const match = /^\/([a-z0-9]{26})\/(original|thumbnail|preview)$/.exec(url.pathname);
      const avatar = /^\/avatars\/([a-z0-9]{26})\/\d{1,20}$/.exec(url.pathname);
      const emoji = /^\/emojis\/([a-z0-9]{26})$/.exec(url.pathname);
      const gif = /^\/giphy\/([a-zA-Z0-9]{1,80})\/preview$/.exec(url.pathname);
      const remoteGif = /^\/giphy-url\/([a-zA-Z0-9_-]{1,3000})$/.exec(url.pathname);
      if (url.hostname !== client.mediaKey || !client.me || (!match && !avatar && !emoji && !gif && !remoteGif) || url.search || request.method !== 'GET') return new Response(null, { status: 403 });
      const response = remoteGif ? await giphy.responseUrl(Buffer.from(remoteGif[1], 'base64url').toString('utf8')) : gif ? await giphy.response(gif[1]) : emoji ? await client.emojiResponse(emoji[1], request.signal) : avatar ? await client.avatarResponse(avatar[1], request.signal) : await client.fileResponse(match[1], match[2], request.headers.get('range'), request.signal);
      if (!response.ok) { await response.body?.cancel(); return new Response(null, { status: response.status }); }
      const type = (response.headers.get('content-type') || '').split(';')[0];
      if ((avatar || emoji) && !type.startsWith('image/')) { await response.body?.cancel(); return new Response(null, { status: 415 }); }
      if (!/^(image|video|audio)\//.test(type)) { await response.body?.cancel(); return new Response(null, { status: 415 }); }
      const headers = { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
      for (const key of ['content-length', 'content-range', 'accept-ranges']) if (response.headers.has(key)) headers[key] = response.headers.get(key);
      return new Response(response.body, { status: response.status, headers });
    } catch { return new Response(null, { status: 502 }); }
  });
  handle('fileInfo', async id => {const info=await client.fileInfo(id);return {...info,program_icon:await icons.get(info)};});
  handle('fileText', async id => {
    const info = await client.fileInfo(id);
    if (!isText(info) || info.size > 1024 * 1024) throw new Error('텍스트 미리보기는 1MB 이하 텍스트 파일을 지원합니다.');
    const response = await client.fileResponse(id);
    if (!response.ok) throw new Error(`파일을 읽을 수 없습니다 (${response.status}).`);
    const reader = response.body.getReader();
    let length = 0; const chunks = [];
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        length += value.length;
        if (length > 1024 * 1024) throw new Error('텍스트 미리보기는 1MB까지 지원합니다.');
        chunks.push(Buffer.from(value));
      }
      return Buffer.concat(chunks).toString('utf8');
    } finally { await reader.cancel(); }
  });
  handle('downloadFile', async id => {
    const session = client.mediaKey;
    const info = await client.fileInfo(id);
    const filename = path.basename(String(info.name || 'attachment').replace(/[/\\]/g, '_')).replace(/[<>:"|?*\x00-\x1f]/g, '_');
    const result = await dialog.showSaveDialog(getWindow(), { title: '첨부 파일 저장', defaultPath: filename });
    if (result.canceled || !result.filePath) return { canceled: true };
    if (session !== client.mediaKey) throw new Error('서버 연결이 변경되었습니다. 다시 시도해 주세요.');
    const target = result.filePath;
    const temp = path.join(path.dirname(target), `.moyeo-${randomUUID()}.part`);
    try {
      const response = await client.fileResponse(id);
      if (!response.ok) { await response.body?.cancel(); throw new Error(`파일을 저장할 수 없습니다 (${response.status}).`); }
      await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(temp, { flags: 'wx' }));
      if(session!==client.mediaKey)throw Error('서버 연결이 변경되었습니다. 다시 시도해 주세요.');
      await fsp.rename(temp, target);
      const token=randomUUID(),openable=canOpen(info)&&canOpen({name:target})&&ext(info)===ext({name:target});
      savedFiles.set(token,{path:target,epoch:session,canOpen:openable});while(savedFiles.size>100)savedFiles.delete(savedFiles.keys().next().value);
      return { canceled: false, name: path.basename(target), path:target, savedId:token, canOpen:openable };
    } finally { await fsp.unlink(temp).catch(() => {}); }
  });
}
module.exports = { registerFiles };
