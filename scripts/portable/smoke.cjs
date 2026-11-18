const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const http = require('node:http');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function port() { const server = net.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const result = server.address().port; await new Promise(resolve => server.close(resolve)); return result; }
(async () => {
  const version = require('../../package.json').version;
  const alone = await fs.mkdtemp(path.join(root, 'test-results/portable-alone-'));
  const exe = path.join(alone, 'Moyeo.exe'), data = path.join(alone, 'Data');
  await fs.copyFile(path.join(root, `dist/portable/Moyeo-${version}-portable.exe`), exe);
  await fs.mkdir(data);
  for (const name of ['appearance.json','personal-settings.json','emoji-recents.json']) await fs.writeFile(path.join(data,name), '{}');
  const user = 'a'.repeat(26), room = 'c'.repeat(26);
  const server=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json'); let result={};
    if(req.url==='/api/v4/users/login'){res.setHeader('Token','portable-test-token');result={id:user};}
    else if(req.url==='/api/v4/users/me')result={id:user,username:'portable-test'};
    else if(req.url.startsWith('/api/v4/users/me/channels'))result=[{id:room,type:'O',name:'portable-room',display_name:'포터블 자동 로그인',last_post_at:1}];
    else if(req.url.includes('/posts'))result={order:[],posts:{}};
    else if(req.url==='/api/v4/users/ids')result=[{id:user,username:'portable-test'}];
    else if(req.url.endsWith('/teams')||req.url.endsWith('/preferences')||req.url.includes('/emoji'))result=[];
    res.end(JSON.stringify(result));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try { for(let attempt=0;attempt<2;attempt++) {
  const inspectPort = await port(), chromePort = await port();
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(exe, [`--inspect=127.0.0.1:${inspectPort}`, `--remote-debugging-port=${chromePort}`, ...(attempt ? ['--start-in-tray'] : [])], { env, windowsHide:true, stdio:'ignore' });
  let ws, browser, runtime, exited = false;
  child.on('exit', () => { exited = true; });
  try {
    let endpoint;
    for (let i=0;i<240;i++) { try { endpoint = (await (await fetch(`http://127.0.0.1:${inspectPort}/json/list`)).json())[0].webSocketDebuggerUrl; break; } catch {} await delay(500); }
    assert.ok(endpoint, 'Portable app inspector started');
    ws = new WebSocket(endpoint); await new Promise((resolve,reject) => { ws.onopen=resolve; ws.onerror=reject; });
    let id=0; const pending = new Map();
    ws.onmessage = event => { const value=JSON.parse(event.data); if(pending.has(value.id)) { pending.get(value.id)(value); pending.delete(value.id); } };
    async function evaluate(expression) { const request = ++id; const response = new Promise(resolve => pending.set(request,resolve)); ws.send(JSON.stringify({id:request,method:'Runtime.evaluate',params:{expression,returnByValue:true}})); const result=await response; if(result.result.exceptionDetails) throw Error(JSON.stringify(result.result.exceptionDetails)); return result.result.result.value; }
    const info=await evaluate("(()=>{const {app}=process.mainModule.require('electron');return {version:app.getVersion(),data:app.getPath('userData'),exe:app.getPath('exe')}})()");
    assert.equal(info.version,version); assert.equal(path.resolve(info.data), data); runtime=path.dirname(info.exe); assert.notEqual(runtime,alone);
    let chromeReady = false;
    for (let attempt=0;attempt<120;attempt++) { try { const response=await fetch(`http://127.0.0.1:${chromePort}/json/version`);if(response.ok){chromeReady=true;break;} } catch {} await delay(250); }
    assert.ok(chromeReady,'Electron browser debugger started');
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${chromePort}`);
    const page=browser.contexts()[0].pages()[0];
    if(attempt===0){
    await expect(page.getByRole('heading',{name:'반가워요'})).toBeVisible();
    await page.getByRole('button',{name:'데모로 체험하기'}).click();
    await expect(page.getByRole('heading',{name:'프로덕트 디자인'})).toBeVisible();
    await page.locator('#message-input').fill('포터블 실행 확인'); await page.locator('#send').click();
    await expect(page.locator('.bubble').filter({hasText:'포터블 실행 확인'})).toBeVisible();
    const heights=await page.evaluate(()=>({header:document.querySelector('.chat-header').getBoundingClientRect().height,row:document.querySelector('.chat-row').getBoundingClientRect().height}));
    assert.ok(heights.header<=70,JSON.stringify(heights)); assert.ok(heights.row<=72,JSON.stringify(heights));
    await page.screenshot({path:path.join(root,`test-results/portable-${version}-smoke.png`)});
    await page.locator('#logout').click();
    await expect(page.locator('#remember-login')).toBeEnabled();
    await page.locator('[name=server]').fill(`127.0.0.1:${server.address().port}`);await page.locator('[name=login]').fill('portable-test');await page.locator('[name=password]').fill('test-password');await page.getByRole('button',{name:'연결하기',exact:true}).click();
    } else {
      assert.equal(await evaluate("process.mainModule.require('electron').BrowserWindow.getAllWindows()[0].isVisible()"),false);
      await evaluate("process.mainModule.require('electron').BrowserWindow.getAllWindows()[0].show()");
    }
    await expect(page.locator('.chat-header h2')).toHaveText('포터블 자동 로그인');
    const launcher=await evaluate("process.env.PORTABLE_EXECUTABLE_FILE");assert.equal(launcher,exe);
    await evaluate("process.mainModule.require('electron').BrowserWindow.getAllWindows()[0].close()");
    assert.equal(await evaluate("process.mainModule.require('electron').BrowserWindow.getAllWindows()[0].isVisible()"),false);
    ws.send(JSON.stringify({id:++id,method:'Runtime.evaluate',params:{expression:"process.mainModule.require('electron').app.quit()"}}));
    await delay(200); ws.close();
    for(let i=0;i<40&&!exited;i++) await delay(500);
    assert.ok(exited,'Launcher exited');
    await expect.poll(async()=>{try{await fs.access(runtime);return true;}catch{return false;}},{timeout:15000}).toBe(false);
    assert.deepEqual((await fs.readdir(alone)).sort(),['Data','Moyeo.exe']);
    console.log('PASS: portable EXE, adjacent Data, demo/chat, compact heights, close to tray, runtime cleanup');
  } finally { ws?.close(); if(browser) await browser.close().catch(()=>{}); if(!exited) spawn('taskkill.exe',['/pid',String(child.pid),'/t','/f'],{windowsHide:true,stdio:'ignore'}); }
  } console.log('PASS: encrypted auto-login across separate portable extractions and hidden startup');
  } finally {server.closeAllConnections();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
