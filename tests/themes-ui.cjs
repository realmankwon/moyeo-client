const { _electron: electron, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { WebSocketServer } = require('ws');
const root = path.resolve(__dirname,'..'), me='a'.repeat(26), other='b'.repeat(26), team='t'.repeat(26);
const rooms=['c','d','e'].map((letter,i)=>({id:letter.repeat(26),name:'room-'+i,display_name:['디자인 이야기','프로젝트 소식','새로운 대화방'][i],team_id:team,type:'O',last_post_at:Date.now()-i*1000}));
(async()=>{
  await fs.mkdir(path.join(root,'test-results'),{recursive:true});
  const profile=await fs.mkdtemp(path.join(root,'test-results/themes-'));
  const server=http.createServer(async(req,res)=>{
    const bytes=[];for await(const chunk of req)bytes.push(chunk);const raw=Buffer.concat(bytes).toString(),body=raw?JSON.parse(raw):null;
    const route=new URL(req.url,'http://localhost').pathname;let value={};
    if(route==='/api/v4/users/me')value={id:me,username:'theme_tester',nickname:'테스트 사용자',roles:'system_user'};
    else if(route==='/api/v4/users/me/teams')value=[{id:team,display_name:'디자인 스튜디오'}];
    else if(route==='/api/v4/users/me/channels')value=rooms;
    else if(route==='/api/v4/users/me/preferences')value=[];
    else if(route==='/api/v4/users/ids')value=body.map(id=>({id,username:id===me?'theme_tester':'teammate',nickname:id===me?'테스트 사용자':'동료'}));
    else if(/^\/api\/v4\/channels\/[a-z0-9]{26}\/posts$/.test(route)){const id=route.split('/')[4],posts=[{id:'f'.repeat(26),channel_id:id,user_id:other,message:'모든 대화창을 원하는 색으로 꾸며보세요.',create_at:Date.now()-5000},{id:'g'.repeat(26),channel_id:id,user_id:me,message:'이 색상으로 함께 적용해 볼게요.',create_at:Date.now()}];value={order:posts.map(p=>p.id).reverse(),posts:Object.fromEntries(posts.map(p=>[p.id,p]))};}
    else if(/^\/api\/v4\/channels\/[a-z0-9]{26}$/.test(route))value=rooms.find(c=>c.id===route.split('/')[4]);
    else if(route==='/api/v4/channels/members/me/view')value={status:'OK'};
    else if(route==='/api/v4/config/client')value={EnableGifPicker:'false'};
    else if(route.endsWith('/reactions'))value=[];
    else if(route.endsWith('/image')){res.writeHead(404);return res.end();}
    else {res.writeHead(404);return res.end('{}');}
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));
  });
  const sockets=new WebSocketServer({server});sockets.on('connection',socket=>socket.on('message',bytes=>{const message=JSON.parse(bytes);if(message.action==='authentication_challenge')socket.send(JSON.stringify({event:'hello',seq:0,data:{}}));}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;let app;
  const launch=()=>electron.launch({...(env.MOYEO_EXECUTABLE?{executablePath:env.MOYEO_EXECUTABLE}:{}),args:[...(!env.MOYEO_EXECUTABLE||env.MOYEO_UI_DEV?[root]:[]),`--user-data-dir=${profile}`],env});
  async function login(){const page=await app.firstWindow();await page.locator('[data-mode=token]').click();await page.locator('[name=server]').fill(`http://127.0.0.1:${server.address().port}`);await page.locator('[name=token]').fill('theme-fixture-token');await page.locator('#remember-login').uncheck();await page.getByRole('button',{name:'연결하기',exact:true}).click();await expect(page.locator('#message-input')).toBeVisible();return page;}
  async function floating(id){const created=app.waitForEvent('window');await main.evaluate(id=>window.messenger.openFloatingChat(id),id);const page=await created;await expect(page.locator('#message-input')).toBeVisible();return page;}
  async function globalDialog(page=main){if(page===main){await page.locator('#nav-settings').click();await page.locator('#all-chat-theme').click();}else{await page.locator('#room-theme').click();await page.locator('[data-theme-scope=all]').click();}await expect(page.locator('#theme-title')).toHaveText('전체 대화창 꾸미기');}
  async function closeSettings(page=main){if(await page.locator('#settings-dialog').evaluate(el=>el.open))await page.locator('#settings-close').click();}
  const background=(page,color)=>expect(page.locator('#chat-pane')).toHaveCSS('background-color',color);
  let main;
  try{
    app=await launch();main=await login();
    await main.locator('#message-input').fill('아직 전송하지 않은 초안');
    await main.locator('#room-theme').click();await main.locator('[data-theme-preset=로즈]').click();await main.locator('#theme-form').getByRole('button',{name:'테마 저장',exact:true}).click();
    await background(main,'rgb(246, 233, 237)');
    const first=await floating(rooms[0].id),second=await floating(rooms[1].id);await first.locator('#message-input').fill('별도 창의 초안');
    await background(first,'rgb(246, 233, 237)');
    await globalDialog();await main.locator('[data-theme-preset=민트]').click();await main.locator('#theme-close').click();await closeSettings();await background(main,'rgb(246, 233, 237)');await background(first,'rgb(246, 233, 237)');
    await globalDialog();await main.locator('[data-theme-preset=밤]').click();await main.locator('#theme-form [name=background]').fill('#203044');await main.locator('#theme-form [name=accent]').fill('#8d92ed');await main.locator('#theme-form [name=pattern]').selectOption('dots');await main.locator('#theme-form [name=fontSize]').selectOption('16');
    await main.screenshot({path:path.join(root,'test-results/global-theme-settings.png')});
    await main.getByRole('button',{name:'모든 대화창에 적용',exact:true}).click();await closeSettings();
    for(const page of [main,first,second]){await background(page,'rgb(32, 48, 68)');await expect(page.locator('.self .bubble')).toHaveCSS('background-color','rgb(141, 146, 237)');}
    assert.equal(await main.locator('#message-input').inputValue(),'아직 전송하지 않은 초안');assert.equal(await first.locator('#message-input').inputValue(),'별도 창의 초안');
    const third=await floating(rooms[2].id);await background(third,'rgb(32, 48, 68)');
    await main.screenshot({path:path.join(root,'test-results/global-theme-applied.png')});
    await main.locator('#room-theme').click();await main.locator('#theme-form [name=background]').fill('#445566');await main.getByRole('button',{name:'테마 저장',exact:true}).click();await background(first,'rgb(68, 85, 102)');await background(second,'rgb(32, 48, 68)');
    await globalDialog(second);await second.locator('[data-theme-preset=라벤더]').click();await second.locator('#theme-replace').uncheck();await second.getByRole('button',{name:'모든 대화창에 적용',exact:true}).click();
    await background(main,'rgb(68, 85, 102)');await background(first,'rgb(68, 85, 102)');await background(third,'rgb(238, 233, 247)');
    await main.locator('#room-theme').click();await main.locator('#theme-reset').click();await background(main,'rgb(238, 233, 247)');await background(first,'rgb(238, 233, 247)');
    const saved=await main.evaluate(()=>window.messenger.getPersonalSettings());assert.equal(saved.globalTheme.background,'#eee9f7');assert.deepEqual(saved.roomThemes,{});
    await app.close();app=null;app=await launch();main=await login();await background(main,'rgb(238, 233, 247)');
    await globalDialog();await main.locator('#theme-reset').click();await closeSettings();await background(main,'rgb(232, 238, 243)');
    const reset=await main.evaluate(()=>window.messenger.getPersonalSettings());assert.equal(reset.globalTheme,null);assert.deepEqual(reset.roomThemes,{});
    console.log('PASS: global-theme UI, preview cancel, existing override replacement, main/floating live sync, new-window inheritance, draft preservation, opt-in room exceptions, restart persistence and reset');
  }finally{if(app)await app.close();for(const socket of sockets.clients)socket.terminate();await new Promise(resolve=>sockets.close(resolve));server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
