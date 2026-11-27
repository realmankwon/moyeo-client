// Unread/mention badges, room notification levels, bot cards, channel management,
// quick switcher, saved messages and slash commands against a local fixture server.
const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {WebSocketServer}=require('ws');
const root=path.resolve(__dirname,'..'),id=letter=>letter.repeat(26);
const me=id('a'),other=id('b'),third=id('c'),team=id('t'),home=id('h'),busy=id('u'),called=id('m'),muted=id('q'),mentionOnly=id('o'),open=id('p');
(async()=>{
 const requests=[],now=Date.now();let next=100,app,websocket;
 const users={[me]:{id:me,username:'tester',nickname:'테스터'},[other]:{id:other,username:'friend',nickname:'친구'},[third]:{id:third,username:'third',nickname:'셋째'}};
 const room=(key,name,title,total,extra={})=>({id:key,team_id:team,type:'O',name,display_name:title,last_post_at:now-60000,total_msg_count:total,header:'',purpose:'',...extra});
 const rooms=[room(home,'home','홈',2,{header:'처음 열리는 방',last_post_at:now-1000}),room(busy,'busy','밀린 방',10),room(called,'called','호출된 방',9),room(muted,'muted','조용한 방',4),room(mentionOnly,'mention-only','멘션만 방',4)];
 const publicRooms=[room(open,'open-room','열린 채널',1,{purpose:'누구나 참여하는 채널'})];
 const members=new Map([[home,{msg_count:2,mention_count:0}],[busy,{msg_count:7,mention_count:0}],[called,{msg_count:4,mention_count:2}],[muted,{msg_count:4,mention_count:0,notify_props:{desktop:'default',mark_unread:'mention'}}],[mentionOnly,{msg_count:4,mention_count:0,notify_props:{desktop:'mention',mark_unread:'all'}}]]);
 const posts=new Map(rooms.map(item=>[item.id,[]]));posts.set(open,[]);
 const card={id:'0'.repeat(25)+'1',channel_id:home,user_id:other,message:'',create_at:now-5000,props:{attachments:[{color:'#2fa66a',pretext:'배포 알림',author_name:'CI 봇',title:'배포 완료',title_link:'https://example.org/build/1',text:'**main** 브랜치를 배포했습니다.',fields:[{title:'환경',value:'운영',short:true},{title:'소요',value:'3분',short:true}],footer:'ci.example',actions:[{id:'approve',name:'승인',style:'primary'},{id:'reject',name:'반려',style:'danger'}]}]}};
 const table={id:'0'.repeat(25)+'2',channel_id:home,user_id:other,message:'| 항목 | 값 |\n|---|--:|\n| 요청 | 12 |\n\n- [x] 확인 ~busy',create_at:now-4000};
 posts.get(home).push(card,table);
 // 호출된 방: four posts already read, five unread ones after the last view time.
 const tall=label=>label+'\n'+Array.from({length:7},(_,line)=>'줄 '+(line+1)).join('\n');
 for(let index=0;index<9;index++)posts.get(called).push({id:'1'.repeat(25)+index,channel_id:called,user_id:other,message:tall((index<4?'읽은 글 ':'새 글 ')+(index+1)),create_at:now-90000+index*5000});
 rooms.find(item=>item.id===called).last_post_at=now-90000+8*5000;members.get(called).last_viewed_at=now-90000+3*5000;
 for(let index=0;index<8;index++)posts.get(home).unshift({id:'2'.repeat(25)+index,channel_id:home,user_id:other,message:tall('홈 글 '+index),create_at:now-200000+index*1000});
 const flagged=new Set();
 const send=(socket,event,data)=>{if(socket.readyState===1&&socket.authenticated)socket.send(JSON.stringify({event,data,broadcast:{},seq:socket.sequence++}));};
 const broadcast=(event,data)=>{for(const socket of websocket.clients)send(socket,event,data);};
 const post=(channel,message,mentions=[])=>{const item={id:String(next++).padStart(26,'0'),channel_id:channel,user_id:other,message,create_at:Date.now()};posts.get(channel).push(item);const target=rooms.find(value=>value.id===channel);target.last_post_at=item.create_at;target.total_msg_count++;broadcast('posted',{post:JSON.stringify(item),mentions:JSON.stringify(mentions)});return item;};
 const server=http.createServer(async(req,res)=>{
  let raw='';for await(const part of req)raw+=part;const body=raw?JSON.parse(raw):{},url=new URL(req.url,'http://fixture'),route=url.pathname.replace('/api/v4',''),parts=route.split('/');
  requests.push({route,method:req.method,body});res.setHeader('Content-Type','application/json');let data={};
  if(route==='/users/login'){res.setHeader('Token','fixture-token');data=users[me];}
  else if(route==='/users/me')data={...users[me],roles:'system_user'};
  else if(route==='/users/me/status')data={user_id:me,status:'online'};
  else if(route==='/users/me/channels')data=rooms;
  else if(route==='/users/me/teams')data=[{id:team,display_name:'테스트 팀'}];
  else if(route==='/users/me/teams/'+team+'/channels/members')data=rooms.filter(item=>members.has(item.id)).map(item=>({channel_id:item.id,user_id:me,last_viewed_at:0,notify_props:{desktop:'default',mark_unread:'all'},...members.get(item.id)}));
  else if(route==='/users/me/preferences'&&req.method==='GET')data=[...flagged].map(name=>({user_id:me,category:'flagged_post',name,value:'true'}));
  else if(route==='/users/me/preferences'){for(const item of body)if(item.category==='flagged_post')flagged.add(item.name);data={status:'OK'};}
  else if(route==='/users/me/preferences/delete'){for(const item of body)flagged.delete(item.name);data={status:'OK'};}
  else if(route==='/users/me/posts/flagged'){const all=[...posts.values()].flat().filter(item=>flagged.has(item.id));data={order:all.map(item=>item.id),posts:Object.fromEntries(all.map(item=>[item.id,item]))};}
  else if(route==='/emoji')data=[];
  else if(route==='/users/ids')data=body.map(key=>users[key]||{id:key,username:'unknown'});
  else if(route==='/users/search')data=Object.values(users).filter(user=>user.username.includes(body.term)||user.nickname.includes(body.term));
  else if(route==='/posts/search'){const all=[...posts.values()].flat().filter(item=>item.message.includes('@tester'));data={order:all.map(item=>item.id),posts:Object.fromEntries(all.map(item=>[item.id,item]))};}
  else if(route==='/commands/execute')data={response_type:'ephemeral'};
  else if(route==='/channels/members/me/view'){const target=rooms.find(item=>item.id===body.channel_id);data={status:'OK',last_viewed_at_times:{[body.channel_id]:target?.last_post_at||Date.now()}};}
  else if(route==='/channels'&&req.method==='POST'){const made={...body,id:id('n'),last_post_at:Date.now(),total_msg_count:0};rooms.push(made);posts.set(made.id,[]);data=made;}
  else if(route==='/channels/group'){const made={id:id('g'),type:'G',name:'group',display_name:'친구, 셋째',last_post_at:Date.now(),total_msg_count:0};rooms.push(made);posts.set(made.id,[]);data=made;}
  else if(route==='/teams/'+team+'/channels'||route==='/teams/'+team+'/channels/search')data=publicRooms.filter(item=>!body.term||item.display_name.includes(body.term));
  else if(parts[1]==='posts'&&parts[3]==='actions')data={status:'OK'};
  else if(parts[1]==='posts'&&parts.length===3)data=[...posts.values()].flat().find(item=>item.id===parts[2])||{};
  else if(parts[1]==='channels'&&parts[3]==='posts'){const values=posts.get(parts[2])||[];data={order:values.map(item=>item.id),posts:Object.fromEntries(values.map(item=>[item.id,item]))};}
  else if(parts[1]==='channels'&&parts[3]==='stats')data={member_count:2};
  else if(parts[1]==='channels'&&parts[3]==='pinned')data={posts:{}};
  else if(parts[1]==='channels'&&parts[3]==='members'&&parts[5]==='notify_props'){members.set(parts[2],{...members.get(parts[2]),notify_props:{desktop:body.desktop,mark_unread:body.mark_unread}});data={status:'OK'};}
  else if(parts[1]==='channels'&&parts[3]==='members'&&parts[4]==='me')data={channel_id:parts[2],user_id:me,last_viewed_at:0};
  else if(parts[1]==='channels'&&parts[3]==='members'&&req.method==='DELETE'){rooms.splice(rooms.findIndex(item=>item.id===parts[2]),1);data={status:'OK'};}
  else if(parts[1]==='channels'&&parts[3]==='members'&&req.method==='POST'){if(body.user_id===me&&parts[2]===open)rooms.push(publicRooms[0]);data={channel_id:parts[2],user_id:body.user_id};}
  else if(parts[1]==='channels'&&parts[3]==='members')data=[{user_id:me,scheme_admin:true},{user_id:other}];
  else if(parts[1]==='channels'&&parts[3]==='patch'){const target=rooms.find(item=>item.id===parts[2]);Object.assign(target,body);data=target;}
  else if(parts[1]==='channels'&&parts.length===3)data=[...rooms,...publicRooms].find(item=>item.id===parts[2])||{};
  else if(route.endsWith('/reactions'))data=[];
  res.end(JSON.stringify(data));
 });
 websocket=new WebSocketServer({server});websocket.on('connection',socket=>{socket.sequence=0;socket.on('message',bytes=>{const value=JSON.parse(bytes);if(value.action==='authentication_challenge'){socket.authenticated=true;send(socket,'hello',{});}else if(value.action==='ping')socket.send(JSON.stringify({seq_reply:value.seq,status:'OK'}));});});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const made=(method,route)=>requests.filter(item=>item.method===method&&item.route===route);
 try{
  await fs.mkdir(path.join(root,'test-results'),{recursive:true});
  const profile=await fs.mkdtemp(path.join(root,'test-results/rooms-')),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({args:[root,'--user-data-dir='+profile],env,timeout:30000});const page=await app.firstWindow();
  await app.evaluate(({safeStorage,Tray,BrowserWindow})=>{safeStorage.isAsyncEncryptionAvailable=async()=>true;safeStorage.encryptStringAsync=async text=>Buffer.from('fixture:'+text);safeStorage.decryptStringAsync=async value=>({result:value.toString().slice(8),shouldReEncrypt:false});Tray.prototype.displayBalloon=function(){};const win=BrowserWindow.getAllWindows()[0];win.isFocused=()=>win.isVisible()&&!win.isMinimized();});
  page.setDefaultTimeout(15000);await page.evaluate(()=>{HTMLMediaElement.prototype.play=()=>Promise.resolve();});
  const shot=async name=>{await page.waitForTimeout(300);await page.screenshot({path:path.join(profile,name+'.png')});}; // lets the dialog fade-in finish
  await page.locator('[name=server]').fill('127.0.0.1:'+server.address().port);await page.locator('[name=login]').fill('tester');await page.locator('[name=password]').fill('fixture');await page.getByRole('button',{name:'연결하기',exact:true}).click();
  await expect(page.locator('.chat-header h2')).toHaveText('홈');await expect.poll(()=>page.evaluate(()=>realtime.isConnected())).toBe(true);
  const row=key=>page.locator('.conversation-row:has([data-channel="'+key+'"])');

  // Server unread and mention counts are visible right after login.
  await expect(row(busy).locator('.badge')).toHaveText('3');
  await expect(row(called).locator('.badge')).toHaveText('@ 5');await expect(row(called).locator('.badge')).toHaveClass(/badge-mention/);
  await expect(row(home).locator('.badge')).toHaveCount(0);await expect(row(muted)).toHaveClass(/is-muted/);
  await expect(page.locator('#incoming-header')).toBeHidden();

  // A fully read room opens at the very bottom and stays there when late content grows it.
  const gap=()=>page.evaluate(()=>{const area=document.querySelector('#messages');return Math.round(area.scrollHeight-area.scrollTop-area.clientHeight);});
  await expect.poll(gap).toBeLessThan(3);await expect(page.locator('#unread-divider')).toHaveCount(0);
  await page.evaluate(()=>{const area=document.querySelector('#messages'),block=document.createElement('div');block.style.height='400px';area.querySelector('.message').append(block);area.dispatchEvent(new Event('scroll'));});
  await expect.poll(gap).toBeLessThan(3);
  // Bot card, table, task item and ~channel link.
  await expect(page.locator('.bot-card-title')).toHaveText('배포 완료');await expect(page.locator('.bot-card-fields dt')).toHaveText(['환경','소요']);
  await expect(page.locator('.message-table td').first()).toHaveText('요청');await expect(page.locator('.message-task.done')).toContainText('확인');
  await expect(page.locator('[data-channel-mention="busy"]')).toHaveText('~밀린 방');
  await page.locator('[data-bot-action="approve"]').click();await expect.poll(()=>made('POST','/posts/'+card.id+'/actions/approve').length).toBe(1);
  await shot('01-chat');

  // Muted rooms only count; mention-only rooms alert when mentioned.
  post(muted,'조용히 쌓이는 글');await expect(row(muted).locator('.badge')).toHaveText('1');await expect(row(muted).locator('.badge')).toHaveClass(/badge-muted/);
  post(mentionOnly,'멘션 없는 글');await expect(row(mentionOnly).locator('.badge')).toHaveText('1');
  await page.waitForTimeout(200);await expect(page.locator('#incoming-header')).toBeHidden();
  post(mentionOnly,'@tester 확인 부탁',[me]);await expect(page.locator('#incoming-header [data-incoming-room="'+mentionOnly+'"]')).toBeVisible();
  await expect(row(mentionOnly).locator('.badge')).toHaveText('@ 2');

  // Opening a room clears its count.
  await page.locator('[data-channel="'+busy+'"]').click();await expect(page.locator('.chat-header h2')).toHaveText('밀린 방');await expect(row(busy).locator('.badge')).toHaveCount(0);

  // Notification level is stored on the server.
  await page.locator('#room-info').click();await expect(page.locator('#room-members .room-member')).toHaveCount(2);await expect(page.locator('#room-count')).toHaveText('2명');await shot('02-room-info');
  await page.locator('[data-room-level="mute"]').click();
  await expect.poll(()=>made('PUT','/channels/'+busy+'/members/'+me+'/notify_props').at(-1)?.body).toMatchObject({desktop:'none',mark_unread:'mention',channel_id:busy,user_id:me});
  await expect(row(busy)).toHaveClass(/is-muted/);await expect(page.locator('#room-info')).toHaveClass(/is-muted/);
  await page.locator('#room-header').fill('새 헤더');await page.getByRole('button',{name:'소개 저장'}).click();
  await expect.poll(()=>made('PUT','/channels/'+busy+'/patch').at(-1)?.body.header).toBe('새 헤더');await expect(page.locator('.chat-header p')).toHaveText('새 헤더');
  await page.locator('#room-invite-search').fill('third');await page.locator('#room-invite-search').press('Enter');await page.locator('[data-room-invite="'+third+'"]').click();
  await expect.poll(()=>made('POST','/channels/'+busy+'/members').at(-1)?.body.user_id).toBe(third);
  await page.locator('#room-close').click();

  // Quick switcher.
  await page.keyboard.press('ControlOrMeta+k');await expect(page.locator('#switcher-dialog')).toBeVisible();await shot('03-switcher');
  await page.locator('#switcher-input').fill('호출');await expect(page.locator('#switcher-list [data-switch]')).toHaveCount(1);await page.locator('#switcher-input').press('Enter');
  await expect(page.locator('.chat-header h2')).toHaveText('호출된 방');await expect(row(called).locator('.badge')).toHaveCount(0);

  // A room with unread messages opens at the first unread one, under a marker.
  await expect(page.locator('#unread-divider')).toBeVisible();
  await expect(page.locator('#unread-divider + .message .bubble')).toContainText('새 글 5');
  const place=await page.evaluate(()=>{const area=document.querySelector('#messages'),box=area.getBoundingClientRect(),mark=document.querySelector('#unread-divider').getBoundingClientRect();return {top:Math.round(mark.top-box.top),gap:Math.round(area.scrollHeight-area.scrollTop-area.clientHeight)};});
  assert.ok(place.top>=0&&place.top<40,'unread marker should sit at the top of the view: '+JSON.stringify(place));assert.ok(place.gap>100,'view must not jump to the newest message: '+JSON.stringify(place));
  await shot('03b-unread-entry');
  await page.locator('[data-channel="'+home+'"]').click();await expect(page.locator('.chat-header h2')).toHaveText('홈');await page.locator('[data-channel="'+called+'"]').click();await expect(page.locator('.chat-header h2')).toHaveText('호출된 방');
  await expect(page.locator('#unread-divider')).toHaveCount(0);await expect.poll(gap).toBeLessThan(3);

  // Browse and join, create a private channel, create a group chat.
  await page.locator('#browse-channels').click();await expect(page.locator('#browse-result .browse-row')).toHaveCount(1);await shot('04-browse');
  await page.locator('[data-browse-join="'+open+'"]').click();await expect(page.locator('.chat-header h2')).toHaveText('열린 채널');
  assert.equal(made('POST','/channels/'+open+'/members').at(-1).body.user_id,me);
  await page.locator('#browse-channels').click();await page.locator('[data-browse-tab="create"]').click();await page.locator('#create-name').fill('비밀 프로젝트');await page.locator('[data-create-type="P"]').click();await page.getByRole('button',{name:'채널 만들기',exact:true}).last().click();
  await expect(page.locator('.chat-header h2')).toHaveText('비밀 프로젝트');
  const created=made('POST','/channels').at(-1).body;assert.equal(created.type,'P');assert.equal(created.team_id,team);assert.match(created.name,/^ch-[a-f0-9]{8}$/);
  await page.locator('#browse-channels').click();await page.locator('[data-browse-tab="group"]').click();
  for(const term of ['friend','third']){await page.locator('#group-search').fill(term);await page.locator('#group-search').press('Enter');await page.locator('[data-group-pick]').first().click();}
  await expect(page.locator('#group-picked .group-chip')).toHaveCount(2);await shot('05-group');await page.locator('#group-create').click();
  await expect.poll(()=>made('POST','/channels/group').at(-1)?.body).toEqual([me,other,third]);await expect(page.locator('.chat-header h2')).toHaveText('친구, 셋째');

  // Saved messages and mentions.
  await page.locator('[data-channel="'+mentionOnly+'"]').click();const target=page.locator('.message',{hasText:'확인 부탁'});
  await target.locator('.bubble').click({button:'right'});await page.getByRole('menuitem',{name:'메시지 저장'}).click();
  await expect(target.locator('.post-saved-label')).toBeVisible();await expect.poll(()=>flagged.size).toBe(1);
  await page.locator('#nav-saved').click();await expect(page.locator('#collection-list .search-result')).toHaveCount(1);await shot('06-saved');
  await page.locator('[data-collection="mentions"]').click();await expect(page.locator('#collection-list .search-result')).toHaveCount(1);await expect(page.locator('#collection-title')).toHaveText('나를 멘션한 메시지');
  assert.equal(made('POST','/posts/search').at(-1).body.terms,'@tester');
  await page.locator('[data-collection="saved"]').click();await page.locator('[data-collection-unsave]').click();await expect.poll(()=>flagged.size).toBe(0);
  await page.locator('#collection-close').click();

  // Slash commands run on the server instead of being posted.
  const before=made('POST','/posts').length;await page.locator('#message-input').fill('/away 잠시 자리 비움');await page.locator('#message-input').press('Enter');
  await expect.poll(()=>made('POST','/commands/execute').at(-1)?.body).toMatchObject({channel_id:mentionOnly,command:'/away 잠시 자리 비움',team_id:team});
  await expect(page.locator('#message-input')).toHaveValue('');assert.equal(made('POST','/posts').length,before);

  // Leaving needs a second click.
  await page.locator('#room-info').click();await page.locator('#room-leave').click();assert.equal(made('DELETE','/channels/'+mentionOnly+'/members/'+me).length,0);
  await page.locator('#room-leave').click();await expect.poll(()=>made('DELETE','/channels/'+mentionOnly+'/members/'+me).length).toBe(1);await expect(row(mentionOnly)).toHaveCount(0);
  // Dark mode: the rail switch applies at once and is remembered.
  const savedTheme=async()=>{try{return JSON.parse(await fs.readFile(path.join(profile,'appearance.json'),'utf8')).theme;}catch{return null;}}; // the file may be mid-write
  await app.evaluate(({nativeTheme})=>{nativeTheme.themeSource='light';});
  const surface=()=>page.evaluate(()=>getComputedStyle(document.querySelector('.conversation-list')).backgroundColor);
  await page.locator('#nav-settings').click();await page.locator('[data-theme-choice="light"]').click();await expect(page.locator('html')).toHaveAttribute('data-theme','light');await page.locator('#settings-close').click();
  assert.equal(await surface(),'rgb(255, 255, 255)');
  await page.locator('#theme-toggle').click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  assert.equal(await surface(),'rgb(28, 31, 37)');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--chat-background').trim()),'#14161a');
  await expect.poll(savedTheme).toBe('dark');
  await page.locator('[data-channel="'+home+'"]').click();await expect(page.locator('.bot-card-title')).toBeVisible();await shot('07-dark-chat');
  assert.notEqual(await page.evaluate(()=>getComputedStyle(document.querySelector('.message:not(.self) .bubble, .bot-card')).backgroundColor),'rgb(255, 255, 255)');
  // A room theme saved with the stock light colors follows dark mode; a customized one keeps its colors.
  const paneColors=()=>page.evaluate(()=>({pane:getComputedStyle(document.querySelector('#chat-pane')).backgroundColor,bubble:getComputedStyle(document.querySelector('.message:not(.self) .bubble, .bot-card')).backgroundColor,header:getComputedStyle(document.querySelector('.chat-header')).backgroundColor}));
  const stock={background:'#e8eef3',accent:'#fee34a',selfText:'#302b16',otherBubble:'#ffffff',otherText:'#252a33',surface:'#ffffff',text:'#252a33',fontSize:13,pattern:'none'};
  await page.evaluate(([room,theme])=>window.messenger.setRoomTheme(room,theme),[home,stock]);
  await expect.poll(async()=>(await paneColors()).header).toBe('rgb(28, 31, 37)');assert.equal((await paneColors()).pane,'rgb(20, 22, 26)');
  await page.locator('#theme-toggle').click();await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await expect.poll(async()=>(await paneColors()).header).toBe('rgb(255, 255, 255)');assert.equal((await paneColors()).pane,'rgb(232, 238, 243)');
  await page.evaluate(([room,theme])=>window.messenger.setRoomTheme(room,theme),[home,{...stock,background:'#ffd0d0'}]);
  await expect.poll(async()=>(await paneColors()).pane).toBe('rgb(255, 208, 208)');
  await page.locator('#theme-toggle').click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  assert.equal((await paneColors()).pane,'rgb(255, 208, 208)');assert.equal((await paneColors()).header,'rgb(255, 255, 255)');
  await page.evaluate(room=>window.messenger.setRoomTheme(room,null),home);await expect.poll(async()=>(await paneColors()).pane).toBe('rgb(20, 22, 26)');
  await page.locator('#room-info').click();await expect(page.locator('#room-members .room-member')).toHaveCount(2);await shot('08-dark-room-info');await page.locator('#room-close').click();
  await page.locator('#nav-settings').click();await expect(page.locator('[data-theme-choice="dark"]')).toHaveAttribute('aria-pressed','true');await page.locator('[data-theme-choice="system"]').click();
  await expect.poll(savedTheme).toBe('system');await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  console.log('Rooms UI checks passed. Screenshots: '+profile);
 }finally{await app?.close().catch(()=>{});await new Promise(resolve=>{for(const socket of websocket.clients)socket.terminate();server.close(resolve);});}
})().catch(error=>{console.error(error);process.exit(1);});
