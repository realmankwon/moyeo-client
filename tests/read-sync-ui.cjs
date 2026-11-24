const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {WebSocketServer}=require('ws');
const root=path.resolve(__dirname,'..'),me='a'.repeat(26),other='b'.repeat(26),team='c'.repeat(26),home='d'.repeat(26),chat='e'.repeat(26),third='f'.repeat(26);
(async()=>{
 const apps=[],devices=[],requests=[],members=new Map(),posts=new Map([[home,[]],[chat,[]],[third,[]]]);let next=100,emitReads=true;
 const now=Date.now(),rooms=[home,chat,third].map((id,index)=>({id,team_id:team,type:'O',name:'room-'+index,display_name:['대기 방','동기화 방','다른 방'][index],last_post_at:now-10000}));
 const send=(socket,event,data,user=me)=>{if(socket.readyState===1&&socket.authenticated)socket.send(JSON.stringify({event,data,broadcast:{user_id:user},seq:socket.sequence++}));};
 let websocket;
 const broadcast=(event,data,user=me)=>{for(const socket of websocket.clients)send(socket,event,data,user);};
 const post=(channel,message,time=now+next*10)=>{const item={id:String(next++).padStart(26,'0'),channel_id:channel,user_id:other,message,create_at:time};posts.get(channel).push(item);rooms.find(room=>room.id===channel).last_post_at=time;broadcast('posted',{post:JSON.stringify(item)});return item;};
 const server=http.createServer(async(req,res)=>{
  let raw='';for await(const part of req)raw+=part;const body=raw?JSON.parse(raw):{},url=new URL(req.url,'http://fixture'),route=url.pathname,token=req.headers.authorization?.slice(7);
  requests.push({route,method:req.method,body,token});res.setHeader('Content-Type','application/json');let data={};
  if(route==='/api/v4/users/login'){res.setHeader('Token',body.login_id);data={id:me,username:'tester'};}
  else if(route==='/api/v4/users/me')data={id:me,username:'tester',roles:'system_user'};
  else if(route==='/api/v4/users/me/channels')data=rooms;
  else if(route==='/api/v4/users/me/teams')data=[{id:team,display_name:'테스트 팀'}];
  else if(route==='/api/v4/users/me/preferences'||route==='/api/v4/emoji')data=[];
  else if(route==='/api/v4/users/ids')data=body.map(id=>({id,username:id===me?'tester':'friend'}));
  else if(route==='/api/v4/channels/members/me/view'){
   const id=body.channel_id,time=rooms.find(room=>room.id===id).last_post_at;members.set(id,time);
   const times={[id]:time};data={status:'OK',last_viewed_at_times:times};if(emitReads)broadcast('multiple_channels_viewed',{channel_times:times});
  }else if(/^\/api\/v4\/channels\/[a-z0-9]{26}\/members\/me$/.test(route)){
   const id=route.split('/')[4];data={channel_id:id,user_id:me,last_viewed_at:members.get(id)||0};
  }else if(/^\/api\/v4\/channels\/[a-z0-9]{26}\/posts$/.test(route)){
   const values=posts.get(route.split('/')[4])||[];data={order:values.map(item=>item.id),posts:Object.fromEntries(values.map(item=>[item.id,item]))};
  }else if(/^\/api\/v4\/channels\/[a-z0-9]{26}$/.test(route))data=rooms.find(room=>room.id===route.split('/')[4]);
  else if(route.endsWith('/reactions'))data=[];
  res.end(JSON.stringify(data));
 });
 websocket=new WebSocketServer({server});websocket.on('connection',socket=>{socket.sequence=0;socket.on('message',bytes=>{const value=JSON.parse(bytes);if(value.action==='authentication_challenge'){socket.authenticated=true;socket.token=value.data.token;send(socket,'hello',{});}else if(value.action==='ping')socket.send(JSON.stringify({seq_reply:value.seq,status:'OK'}));});});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const pending=(page,id)=>page.locator('#incoming-header [data-incoming-room="'+id+'"]');
 const viewCount=()=>requests.filter(item=>item.route==='/api/v4/channels/members/me/view').length;
 const snapshotCount=()=>requests.filter(item=>item.route.endsWith('/members/me')).length;
 try{
  for(const name of ['device-a','device-b']){
   const profile=await fs.mkdtemp(path.join(root,'test-results/read-sync-')),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
   const app=await electron.launch({args:[root,'--user-data-dir='+profile],env,timeout:30000});apps.push(app);const page=await app.firstWindow();
   await app.evaluate(({safeStorage,Tray,BrowserWindow})=>{safeStorage.isAsyncEncryptionAvailable=async()=>true;safeStorage.encryptStringAsync=async text=>Buffer.from('fixture:'+text);safeStorage.decryptStringAsync=async value=>({result:value.toString().slice(8),shouldReEncrypt:false});Tray.prototype.displayBalloon=function(){};const win=BrowserWindow.getAllWindows()[0];win.isFocused=()=>win.isVisible()&&!win.isMinimized();});
   page.setDefaultTimeout(15000);await page.evaluate(()=>{HTMLMediaElement.prototype.play=()=>Promise.resolve();});
   await page.locator('[name=server]').fill('127.0.0.1:'+server.address().port);await page.locator('[name=login]').fill(name);await page.locator('[name=password]').fill('fixture');await page.getByRole('button',{name:'연결하기',exact:true}).click();await expect(page.locator('.chat-header h2')).toHaveText('대기 방');
   await expect.poll(()=>page.evaluate(()=>realtime.isConnected())).toBe(true);devices.push({app,page});
  }
  const [a,b]=devices;
  await b.page.locator('#message-input').fill('다른 기기에서 읽어도 보관할 초안');await b.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].hide());
  await a.app.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];win.show();win.focus();});
  const first=post(chat,'양쪽 기기에서 받을 메시지'),otherPost=post(third,'아직 읽지 않은 다른 방');
  await expect(pending(a.page,chat)).toBeVisible();await expect(pending(b.page,chat)).toBeVisible();await expect(pending(b.page,third)).toBeVisible();
  await a.page.locator('[data-channel="'+chat+'"]').click();
  await expect(pending(b.page,chat)).toHaveCount(0);await expect(pending(b.page,third)).toBeVisible();await expect(b.page).toHaveTitle(/^\(1\)/);
  await expect(b.page.locator('.chat-header h2')).toHaveText('대기 방');await expect(b.page.locator('#message-input')).toHaveValue('다른 기기에서 읽어도 보관할 초안');
  const readRequests=viewCount();await b.page.waitForTimeout(250);assert.equal(viewCount(),readRequests,'Remote read updates must not send a view request back to the server');
  await a.page.locator('[data-channel="'+home+'"]').click();
  const newer=post(chat,'읽음 이후에 도착한 새 메시지');await expect(pending(b.page,chat)).toBeVisible();
  broadcast('multiple_channels_viewed',{channel_times:{[chat]:first.create_at}});await b.page.waitForTimeout(100);await expect(pending(b.page,chat)).toBeVisible();
  broadcast('multiple_channels_viewed',{channel_times:{[chat]:newer.create_at,[third]:otherPost.create_at}},other);await b.page.waitForTimeout(100);await expect(pending(b.page,chat)).toBeVisible();
  const beforeSnapshots=snapshotCount();members.set(chat,newer.create_at);members.set(third,otherPost.create_at);
  broadcast('multiple_channels_viewed',{channel_times:{[chat]:newer.create_at,[third]:otherPost.create_at}});
  await expect(b.page.locator('#incoming-header')).toBeHidden();await expect(b.page).not.toHaveTitle(/^\(/);assert.equal(snapshotCount(),beforeSnapshots,'Current read events need no membership/history polling');
  const delayedTime=now+next*10;members.set(chat,delayedTime);broadcast('multiple_channels_viewed',{channel_times:{[chat]:delayedTime}});await b.page.waitForTimeout(100);post(chat,'읽음 이벤트보다 늦게 배달된 같은 메시지',delayedTime);await b.page.waitForTimeout(150);await expect(b.page.locator('#incoming-header')).toBeHidden();
  const legacy=post(chat,'이전 서버의 읽음 형식');await expect(pending(b.page,chat)).toBeVisible();members.set(chat,legacy.create_at);broadcast('channel_viewed',{channel_id:chat});await expect(pending(b.page,chat)).toHaveCount(0);assert.ok(snapshotCount()>beforeSnapshots);
  const lost=post(chat,'연결이 끊기기 전에 받은 메시지');await expect(pending(b.page,chat)).toBeVisible();const oldSocket=[...websocket.clients].find(socket=>socket.token==='device-b');oldSocket.close();await expect(b.page.locator('#connection-label')).toContainText('재연결');
  await a.page.locator('[data-channel="'+chat+'"]').click();await expect.poll(()=>members.get(chat)).toBe(lost.create_at);
  await expect.poll(()=>b.page.evaluate(()=>realtime.isConnected()),{timeout:12000}).toBe(true);await expect(pending(b.page,chat)).toHaveCount(0);await expect(b.page.locator('#message-input')).toHaveValue('다른 기기에서 읽어도 보관할 초안');
  // Accelerate only the production 60-second unread fallback timer in this isolated fixture.
  await b.page.evaluate(()=>{const original=window.setTimeout;window.setTimeout=(callback,delay,...args)=>original(callback,delay===60000?1500:delay,...args);});
  await a.page.locator('[data-channel="'+home+'"]').click();emitReads=false;const fallback=post(third,'서버 읽음 이벤트를 끈 경우');await expect(pending(b.page,third)).toBeVisible();await a.page.locator('[data-channel="'+third+'"]').click();await expect.poll(()=>members.get(third)).toBe(fallback.create_at);await expect(pending(b.page,third)).toHaveCount(0);
  await expect(b.page.locator('#incoming-header')).toBeHidden();const quiet=snapshotCount();await b.page.waitForTimeout(1800);assert.equal(snapshotCount(),quiet,'No fallback reads after all unread notifications are cleared');
  console.log('PASS: two independent client processes share server read state; current/legacy events, own-user filtering, stale-read/new-post races, reordered events, no writeback loop, reconnect recovery, unread-only fallback and preserved peer chat/draft');
 }finally{for(const app of apps.reverse())await app.close();for(const socket of websocket.clients)socket.terminate();websocket.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
