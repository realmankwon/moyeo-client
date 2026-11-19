const { _electron: electron, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname,'..');
(async()=>{
  await fs.mkdir(path.join(root,'test-results'),{recursive:true});
  const profile=await fs.mkdtemp(path.join(root,'test-results/icons-'));
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  let app;
  try{
    app=await electron.launch({...(env.MOYEO_EXECUTABLE?{executablePath:env.MOYEO_EXECUTABLE}:{}),args:[...(!env.MOYEO_EXECUTABLE||env.MOYEO_UI_DEV?[root]:[]),`--user-data-dir=${profile}`],env});
    const page=await app.firstWindow();
    const result=await app.evaluate(({app,nativeImage})=>{
      const icons=process.mainModule.require(app.getAppPath()+'/electron/icons.cjs');
      const normal=icons.trayImage(nativeImage),unread=icons.trayImage(nativeImage,{unread:true}),main=nativeImage.createFromPath(icons.appIconPath),retina=normal.toPNG({scaleFactor:2});
      return {mainEmpty:main.isEmpty(),mainSize:main.getSize(),template:normal.isTemplateImage(),unreadTemplate:unread.isTemplateImage(),size:normal.getSize(),scales:normal.getScaleFactors(),retina:[retina.readUInt32BE(16),retina.readUInt32BE(20)],different:!normal.toPNG().equals(unread.toPNG())};
    });
    assert.equal(result.mainEmpty,false);assert.deepEqual(result.mainSize,{width:256,height:256});
    if(process.platform==='darwin'){assert.equal(result.template,true);assert.equal(result.unreadTemplate,true);assert.deepEqual(result.size,{width:18,height:18});assert.ok(result.scales.includes(2));assert.deepEqual(result.retina,[36,36]);}
    assert.equal(result.different,true);
    await expect(page.locator('.brandmark .default-brand').first()).toBeVisible();
    await expect.poll(()=>page.locator('.brandmark .default-brand').first().evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
    await page.screenshot({path:path.join(root,'test-results/new-brand-icon-ui.png')});
    console.log('PASS: packaged app icon, real Retina tray images, native template flags, unread indicator and renderer brand artwork');
  }finally{if(app)await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
