// Fast typing with Enter: every message leaves the input at once, is delivered in order,
// and a failed message returns to the input in front of what was typed afterwards.
const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {WebSocketServer}=require('ws');
const root=path.resolve(__dirname,'..'),id=letter=>letter.repeat(26),me=id('a'),team=id('t'),home=id('h');
(async()=>{
 let next=100,app,websocket,delay=300;const received=[],posts=[];
 const rooms=[{id:home,team_id:team,type:'O',name:'home',display_name:'홈',last_post_at:Date.now()-1000,total_msg_count:0}];
 const server=http.createServer(async(req,res)=>{
  let raw='';for await(const part of req)raw+=part;const body=raw?JSON.parse(raw):{},route=new URL(req.url,'http://fixture').pathname.replace('/api/v4','');res.setHeader('Content-Type','application/json');let data={};
  if(route==='/users/login'){res.setHeader('Token','fixture');data={id:me,username:'tester'};}
  else if(route==='/users/me')data={id:me,username:'tester',roles:'system_user'};
  else if(route==='/users/me/channels')data=rooms;
  else if(route==='/users/me/teams')data=[{id:team,display_name:'테스트 팀'}];
  else if(route==='/users/me/preferences'||route==='/emoji')data=[];
  else if(route==='/users/ids')data=body.map(key=>({id:key,username:'tester'}));
  else if(route==='/posts'&&req.method==='POST'){
   received.push(body.message);await new Promise(resolve=>setTimeout(resolve,delay));
   if(body.message.startsWith('실패')){res.statusCode=500;data={message:'fixture failure'};}
   else{const item={id:String(next++).padStart(26,'0'),channel_id:home,user_id:me,message:body.message,create_at:Date.now()};posts.push(item);data=item;}
  }
  else if(route.endsWith('/posts'))data={order:posts.map(item=>item.id),posts:Object.fromEntries(posts.map(item=>[item.id,item]))};
  else if(route==='/channels/members/me/view')data={status:'OK',last_viewed_at_times:{[home]:Date.now()}};
  else if(route.endsWith('/pinned'))data={posts:{}};
  else if(route.endsWith('/reactions'))data=[];
  else if(route==='/channels/'+home)data=rooms[0];
  res.end(JSON.stringify(data));
 });
 websocket=new WebSocketServer({server});websocket.on('connection',socket=>{let sequence=0;socket.on('message',bytes=>{const value=JSON.parse(bytes);if(value.action==='authentication_challenge')socket.send(JSON.stringify({event:'hello',data:{},broadcast:{},seq:sequence++}));else if(value.action==='ping')socket.send(JSON.stringify({seq_reply:value.seq,status:'OK'}));});});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  await fs.mkdir(path.join(root,'test-results'),{recursive:true});
  const profile=await fs.mkdtemp(path.join(root,'test-results/send-queue-')),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({args:[root,'--user-data-dir='+profile],env,timeout:30000});const page=await app.firstWindow();page.setDefaultTimeout(15000);
  await app.evaluate(({safeStorage,Tray})=>{safeStorage.isAsyncEncryptionAvailable=async()=>true;safeStorage.encryptStringAsync=async text=>Buffer.from('fixture:'+text);safeStorage.decryptStringAsync=async value=>({result:value.toString().slice(8),shouldReEncrypt:false});Tray.prototype.displayBalloon=function(){};});
  await page.locator('[name=server]').fill('127.0.0.1:'+server.address().port);await page.locator('[name=login]').fill('tester');await page.locator('[name=password]').fill('fixture');await page.getByRole('button',{name:'연결하기',exact:true}).click();
  await expect(page.locator('.chat-header h2')).toHaveText('홈');
  const input=page.locator('#message-input'),bubbles=page.locator('.message.self .bubble');await input.click();
  const burst=async words=>{for(const word of words){await page.keyboard.type(word,{delay:10});await page.keyboard.press('Enter');}};

  // Slow server: three messages typed before the first answer arrives.
  await burst(['first','second','third']);
  await expect(input).toHaveValue('');
  await expect.poll(()=>received.join('|')).toBe('first|second|third');
  await expect(bubbles).toHaveText(['first','second','third']);

  // Fast server: the same burst must not glue messages together either.
  delay=0;received.length=0;await burst(['넷','다섯','여섯']);
  await expect.poll(()=>received.join('|')).toBe('넷|다섯|여섯');await expect(input).toHaveValue('');
  await expect(bubbles).toHaveText(['first','second','third','넷','다섯','여섯']);

  // A failed message comes back in front of what was typed while it was being sent.
  delay=300;received.length=0;await page.keyboard.type('실패할 글',{delay:10});await page.keyboard.press('Enter');
  await expect(input).toHaveValue('');await page.keyboard.type('이어서 쓰던 글',{delay:10});
  await expect(input).toHaveValue('실패할 글\n이어서 쓰던 글');await expect(page.locator('#toast')).toContainText('전송하지 못했습니다');
  assert.deepEqual(received,['실패할 글']);await expect(bubbles).toHaveCount(6);
  console.log('Send queue UI checks passed.');
 }finally{await app?.close().catch(()=>{});for(const socket of websocket.clients)socket.terminate();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exit(1);});
