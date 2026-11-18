const { _electron: electron, expect } = require('@playwright/test');
const fs = require('node:fs/promises'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const root = path.resolve(__dirname,'..');
(async()=>{
 const profile=await fs.mkdtemp(path.join(root,'test-results/remember-'));
 const me='a'.repeat(26), room='c'.repeat(26); let invalid=false, app, logins=0, logouts=0;
 const server=http.createServer(async(req,res)=>{res.setHeader('Content-Type','application/json');let result={};
 if(req.url==='/api/v4/users/login'){logins++;res.setHeader('Token','remember-secret-token');result={id:me};}
 else if(req.url==='/api/v4/users/me'){if(invalid){res.statusCode=401;result={message:'session expired'};}else result={id:me,username:'remember-user'};}
 else if(req.url.startsWith('/api/v4/users/me/channels'))result=[{id:room,type:'O',name:'remember-room',display_name:'자동 로그인 검증',last_post_at:1}];
 else if(req.url==='/api/v4/users/me/teams'||req.url==='/api/v4/users/me/preferences')result=[];
 else if(req.url==='/api/v4/users/ids')result=[{id:me,username:'remember-user'}];
 else if(req.url.includes('/posts'))result={order:[],posts:{}};
 else if(req.url==='/api/v4/users/logout'){logouts++;}
 else if(req.url.includes('/emoji'))result=[];
 res.end(JSON.stringify(result)); });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 async function launch(hidden=false){app=await electron.launch({args:[root,`--user-data-dir=${profile}`,...(hidden?['--start-in-tray']:[])],env});return app.firstWindow();}
 try{
 let page=await launch();await expect(page.locator('#remember-login')).toBeEnabled();
 await page.locator('[name=server]').fill(`127.0.0.1:${server.address().port}`);await page.locator('[name=login]').fill('remember-user');await page.locator('[name=password]').fill('not-saved-password');await page.getByRole('button',{name:'연결하기',exact:true}).click();
 await expect(page.locator('.chat-header h2')).toHaveText('자동 로그인 검증');
 const bytes=await fs.readFile(path.join(profile,'login.bin'));assert.ok(!bytes.includes(Buffer.from('remember-secret-token')));assert.ok(!bytes.includes(Buffer.from('not-saved-password')));
 await app.close();app=null;
 page=await launch(true);await expect(page.locator('.chat-header h2')).toHaveText('자동 로그인 검증');assert.equal(logins,1);assert.equal(logouts,0);
 assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible()),false);
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].show());
 await app.evaluate(({app},root)=>{const {StartupService}=process.mainModule.require(root+'/electron/startup.cjs');const startup=new StartupService(app,{},process.execPath,'MoyeoStartupTest-'+process.pid);try{startup.set(true);if(!startup.get())throw Error('Startup registration not detected '+JSON.stringify(app.getLoginItemSettings(startup.options)));}finally{startup.set(false);}},root);
 await page.locator('#logout').click();await expect(page.locator('#remember-login')).toBeVisible();await expect.poll(async()=>{try{await fs.access(path.join(profile,'login.bin'));return true;}catch{return false;}}).toBe(false);assert.equal(logouts,1);
 await page.locator('[name=server]').fill(`127.0.0.1:${server.address().port}`);await page.locator('[name=login]').fill('remember-user');await page.locator('[name=password]').fill('not-saved-password');await page.getByRole('button',{name:'연결하기',exact:true}).click();await expect(page.locator('.chat-header h2')).toBeVisible();
 await app.close();app=null;invalid=true;page=await launch();await expect(page.locator('#login-error')).toContainText('session expired');await assert.rejects(fs.access(path.join(profile,'login.bin')));
 invalid=false;await page.locator('[name=server]').fill(`127.0.0.1:${server.address().port}`);await page.locator('[name=login]').fill('remember-user');await page.locator('[name=password]').fill('not-saved-password');await page.locator('#remember-login').uncheck();await page.getByRole('button',{name:'연결하기',exact:true}).click();await expect(page.locator('.chat-header h2')).toBeVisible();await assert.rejects(fs.access(path.join(profile,'login.bin')));
 await page.locator('#nav-settings').click();await expect(page.locator('#auto-login')).not.toBeChecked();await expect(page.locator('#start-at-login')).not.toBeChecked();await page.locator('#auto-login').check();await page.locator('#settings-form button[type=submit]').click();await fs.access(path.join(profile,'login.bin'));
 await page.locator('#nav-settings').click();await page.locator('#auto-login').uncheck();await page.locator('#settings-form button[type=submit]').click();await assert.rejects(fs.access(path.join(profile,'login.bin')));
 console.log('PASS: encrypted token, restart auto-login, hidden startup, real Windows startup registration/removal, logout clearing, expired session');
 }finally{if(app)await app.close();server.closeAllConnections();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});


