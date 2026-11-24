const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {WebSocketServer}=require('ws');
const root=path.resolve(__dirname,'..'),me='a'.repeat(26),other='b'.repeat(26),room='c'.repeat(26);
(async()=>{
 let app;const requests=[],errors=[],png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVRsAAAAASUVORK5CYII=','base64');
 const first=Array.from({length:200},(_,index)=>({id:String(index+100).padStart(26,'0'),name:'first_'+index}));
 const late={id:'e'.repeat(26),name:'late_wave'},newest={id:'f'.repeat(26),name:'new_wave'};
 const server=http.createServer(async(req,res)=>{
  const chunks=[];for await(const part of req)chunks.push(part);const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):{},url=new URL(req.url,'http://fixture'),route=url.pathname;
  requests.push(route+url.search);res.setHeader('Content-Type','application/json');let value={};const id=req.headers.authorization==='Bearer bob'?other:me;
  const user=id=>({id,username:id===me?'alice':'bob',roles:'system_user',props:{}});
  if(route==='/api/v4/users/login'){res.setHeader('Token',body.login_id);value=user(body.login_id==='bob'?other:me);}
  else if(route==='/api/v4/users/me')value=user(id);
  else if(route==='/api/v4/users/me/channels')value=[{id:room,type:'O',name:'test',display_name:'최근 이모지 검증'}];
  else if(route==='/api/v4/users/me/teams'||route==='/api/v4/users/me/preferences')value=[];
  else if(route==='/api/v4/users/ids')value=body.map(user);
  else if(route==='/api/v4/channels/'+room+'/posts')value={order:[],posts:{}};
  else if(route==='/api/v4/emoji')value=url.searchParams.get('page')==='1'?[late,newest]:first;
  else if(route.startsWith('/api/v4/emoji/name/')){const name=decodeURIComponent(route.split('/').at(-1));value=[late,newest].find(item=>item.name===name);if(!value){res.statusCode=404;value={message:'Emoji no longer exists'};}}
  else if(route.endsWith('/image')){res.setHeader('Content-Type','image/png');return res.end(png);}
  res.end(JSON.stringify(value));
 });const websocket=new WebSocketServer({server});websocket.on('connection',socket=>socket.on('message',raw=>{const value=JSON.parse(raw);if(value.action==='authentication_challenge')socket.send(JSON.stringify({event:'hello',seq:0,data:{}}));if(value.action==='ping')socket.send(JSON.stringify({seq_reply:value.seq,status:'OK'}));}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const address='http://127.0.0.1:'+server.address().port;
 const profile=await fs.mkdtemp(path.join(root,'test-results/emoji-recents-profile-'));
 const key=JSON.stringify([address,me]);await fs.writeFile(path.join(profile,'emoji-recents.json'),JSON.stringify({[key]:[':late_wave:','❤️',':gone_wave:']}));
 async function launch(){const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;app=await electron.launch({args:[root,'--user-data-dir='+profile],env});const page=await app.firstWindow();page.on('pageerror',error=>errors.push(error.message));await app.evaluate(({safeStorage,Tray})=>{safeStorage.isAsyncEncryptionAvailable=async()=>true;safeStorage.encryptStringAsync=async value=>Buffer.from('fixture:'+value);safeStorage.decryptStringAsync=async value=>({result:value.toString().slice(8),shouldReEncrypt:false});Tray.prototype.displayBalloon=function(){};});return page;}
 async function login(page,name='alice'){await page.locator('[name=server]').fill(address);await page.locator('[name=login]').fill(name);await page.locator('[name=password]').fill('fixture');await page.locator('#remember-login').uncheck();await page.getByRole('button',{name:'연결하기',exact:true}).click();await expect(page.locator('#message-input')).toBeVisible();}
 const recentNames=page=>page.locator('[data-emoji-section=recent] [data-emote]').evaluateAll(buttons=>buttons.map(button=>button.getAttribute('aria-label')));
 try{
  let page=await launch();await login(page);await page.locator('#emoji').click();await expect.poll(()=>recentNames(page)).toEqual(['late_wave','heart']);await expect(page.locator('[data-emoji-section=recent] img')).toHaveCount(1);
  assert.ok(requests.includes('/api/v4/emoji/name/late_wave'));assert.ok(!requests.some(route=>route.startsWith('/api/v4/emoji?')&&route.includes('page=1')),'Restore named recents without scanning all server pages');
  await page.locator('[data-emoji-category=custom]').click();await expect(page.locator('#emoji-results section').first()).toHaveAttribute('data-emoji-section','recent');assert.deepEqual(await recentNames(page),['late_wave']);
  await page.locator('#more-emoji').click();await page.locator('[data-emoji-section=custom] [aria-label=new_wave]').click();await expect(page.locator('#message-input')).toHaveValue(':new_wave:');
  await page.locator('#emoji').click();await expect.poll(()=>recentNames(page)).toEqual(['new_wave','late_wave','heart']);await page.locator('[data-emoji-category=custom]').click();await expect.poll(()=>recentNames(page)).toEqual(['new_wave','late_wave']);
  await page.locator('[data-emoji-section=recent] [aria-label=late_wave]').click();await page.locator('#emoji').click();await expect.poll(()=>recentNames(page)).toEqual(['late_wave','new_wave','heart']);
  await page.locator('#emoji-search').fill('new_wave');await expect(page.locator('[data-emoji-section=recent]')).toHaveCount(0);await expect(page.locator('[data-emote]')).toHaveCount(1);await page.locator('#emoji-search').fill('');
  await expect.poll(async()=>JSON.parse(await fs.readFile(path.join(profile,'emoji-recents.json'),'utf8'))[key].slice(0,3)).toEqual([':late_wave:',':new_wave:','❤️']);
  await app.close();app=null;page=await launch();await login(page);await page.locator('#emoji').click();await expect.poll(()=>recentNames(page)).toEqual(['late_wave','new_wave','heart']);await expect(page.locator('[data-emoji-section=recent] img')).toHaveCount(2);await page.locator('[data-emoji-category=custom]').click();await expect.poll(()=>recentNames(page)).toEqual(['late_wave','new_wave']);
  await expect.poll(()=>page.locator('[data-emoji-section=recent] img').evaluateAll(images=>images.every(image=>image.complete&&image.naturalWidth>0))).toBe(true);
  await page.screenshot({path:path.join(root,'test-results/server-emoji-recents.png')});await page.locator('#emoji-close').click();await page.locator('#logout').click();await login(page,'bob');await page.locator('#emoji').click();await expect(page.locator('[data-emoji-category=custom]')).toBeVisible();await page.locator('[data-emoji-category=custom]').click();await expect(page.locator('[data-emoji-section=recent]')).toHaveCount(0);await page.locator('[data-emoji-category=recent]').click();await expect(page.locator('#emoji-results [data-emote]')).toHaveCount(0);
  assert.deepEqual(errors,[]);console.log('PASS: server recents above custom grid, named restoration beyond first 200, deduplication/order, search, persistent restart, deleted emoji tolerance and account isolation');
 }finally{if(app)await app.close();for(const socket of websocket.clients)socket.terminate();websocket.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
