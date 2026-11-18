const { _electron: electron, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
(async () => {
  await fs.mkdir(path.join(root, 'test-results'), { recursive: true });
  const profile = await fs.mkdtemp(path.join(root, 'test-results/update-ui-'));
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  let app;
  try {
    app = await electron.launch({ ...(env.MOYEO_EXECUTABLE ? { executablePath: env.MOYEO_EXECUTABLE } : {}), args: [...(env.MOYEO_EXECUTABLE ? [] : [root]), `--user-data-dir=${profile}`], env });
    const page = await app.firstWindow();
    await app.evaluate(({ app, net, shell }) => {
      const policy = process.mainModule.require(app.getAppPath() + '/package.json').moyeoUpdates;
      if (!policy?.enabled) throw Error('Use a release build with version notifications enabled');
      const original = net.fetch.bind(net);
      globalThis.__releaseRequests = []; globalThis.__downloadPages = []; globalThis.__releaseVersion = '0.15.0';
      globalThis.__exitConfirmations = 0; globalThis.__exitResponse = 0;
      net.fetch = (url, options) => {
        if (String(url) !== `https://api.github.com/repos/${policy.repository}/releases/latest`) return original(url, options);
        globalThis.__releaseRequests.push({ url, credentials: options.credentials, headers: options.headers });
        const version = globalThis.__releaseVersion;
        return Promise.resolve(Response.json({ tag_name: 'v' + version, draft: false, prerelease: false, html_url: 'file:///ignored', assets: ['Setup-x64.exe', 'mac-arm64.dmg', 'mac-x64.dmg'].map(suffix => ({ name: `Moyeo-${version}-${suffix}`, state: 'uploaded' })) }));
      };
      shell.openExternal = async url => { globalThis.__downloadPages.push(url); };
    });
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async (_win, options) => {
        if (options.title !== '새 버전 설치 준비') throw Error('Unexpected dialog');
        globalThis.__exitConfirmations++;
        return { response: globalThis.__exitResponse };
      };
    });
    assert.equal(await page.evaluate(() => window.messenger.quitForUpdateInstall()), false);
    await page.locator('#login-settings').click();
    await expect(page.locator('#update-status')).toContainText(require('../package.json').version);
    await expect(page.locator('#update-action')).toBeEnabled();
    await page.locator('#update-action').click();
    await expect(page.locator('#update-banner')).toContainText('0.15.0');
    await expect(page.locator('#update-status')).toContainText('PKG');
    await page.locator('#update-quit').click();
    assert.equal(await app.evaluate(() => globalThis.__exitConfirmations), 1);
    assert.equal(app.windows().length, 1, 'Cancel must keep the messenger running');
    await page.locator('#settings-close').click();
    await expect(page.locator('#update-banner-action')).toHaveText('다운로드 페이지 열기');
    assert.equal(await app.evaluate(() => globalThis.__downloadPages.length), 0);
    await page.locator('#update-banner-action').click();
    const pages = await app.evaluate(() => globalThis.__downloadPages);
    assert.equal(pages.length, 1); assert.match(pages[0], /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/releases\/tag\/v0\.15\.0$/);
    assert.equal(await page.evaluate(() => typeof window.messenger.installUpdate), 'undefined');
    assert.equal(await page.evaluate(() => typeof window.messenger.downloadUpdate), 'undefined');
    assert.equal(app.windows().length, 1, 'Opening a download page must not restart the app');
    await page.getByRole('button', { name: '데모로 체험하기' }).click();
    await expect(page.locator('#update-banner')).toBeVisible();
    await expect.poll(() => page.evaluate(() => Math.abs(document.querySelector('.shell').getBoundingClientRect().bottom - innerHeight))).toBeLessThan(2);
    await page.evaluate(() => {
      state.posts = Array.from({ length: 60 }, (_, i) => ({ id: 'scroll-' + i, user_id: state.me.id, channel_id: state.selected, message: `Mac 스크롤 검증 ${i}\n두 번째 줄`, create_at: Date.now() + i * 1000 }));
      renderMessages(true);
    });
    const messages = page.locator('#messages'); await messages.hover();
    const bottom = await messages.evaluate(el => el.scrollTop);
    await page.mouse.wheel(0, -450);
    await expect.poll(() => messages.evaluate(el => el.scrollTop)).toBeLessThan(bottom - 100);
    await messages.locator('.message').filter({ hasText: 'Mac 스크롤 검증 55' }).click();
    const top = await messages.evaluate(el => el.scrollTop);
    await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp');
    await expect.poll(() => messages.evaluate(el => el.scrollTop)).toBeLessThan(top);
    const input = page.locator('#message-input'); await input.fill('가나다라'); await input.press('End'); await input.press('ArrowLeft');
    assert.equal(await input.evaluate(el => el.selectionStart), 3);
    await app.evaluate(({ app }) => { globalThis.__releaseVersion = app.getVersion(); });
    await page.evaluate(() => window.messenger.checkForUpdates());
    await expect(page.locator('#update-banner')).toBeHidden();
    await page.screenshot({ path: path.join(root, 'test-results/manual-download-mac-ui.png') });
    await app.evaluate(() => { globalThis.__releaseVersion = '0.15.0'; globalThis.__exitResponse = 1; });
    await page.evaluate(() => window.messenger.checkForUpdates());
    await expect(page.locator('#update-banner-quit')).toBeVisible();
    await page.screenshot({ path: path.join(root, 'test-results/install-exit-mac-ui.png') });
    const closed = new Promise(resolve => app.once('close', resolve));
    await page.locator('#update-banner-quit').click();
    await closed; app = null;
    console.log('PASS: actual release checker and IPC, version notification, trusted browser page, no install/restart API, wheel/arrow input, canceled exit keeps app running and confirmed installation exit closes process (HTTP, browser and dialog response mocked)');
  } finally { if (app) await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
