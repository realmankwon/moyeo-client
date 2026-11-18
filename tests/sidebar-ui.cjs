const { _electron: electron, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
(async () => {
  await fs.mkdir(path.join(root, 'test-results'), { recursive: true });
  const profile = await fs.mkdtemp(path.join(root, 'test-results/sidebar-ui-'));
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  let app;
  try {
    app = await electron.launch({ ...(env.MOYEO_EXECUTABLE ? { executablePath: env.MOYEO_EXECUTABLE } : {}), args: [...(!env.MOYEO_EXECUTABLE || env.MOYEO_UI_DEV ? [root] : []), `--user-data-dir=${profile}`], env });
    const page = await app.firstWindow(); const errors = []; page.on('pageerror', error => errors.push(error.stack || error.message));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1240, 840));
    await page.getByRole('button', { name: '데모로 체험하기' }).click();
    await page.evaluate(() => {
      const now = Date.now(); state.teams = { studio: { display_name: '스튜디오' }, operations: { display_name: '운영팀' } };
      const fixture = [
        { id: 'design', display_name: '프로덕트 디자인', type: 'G', header: '좋은 경험을 함께 만드는 사람들', last_post_at: now },
        { id: 'planning', display_name: '이번 주의 아이디어', type: 'P', team_id: 'studio', last_post_at: now - 180000 },
        { id: 'lounge', display_name: '우리 팀 라운지', type: 'O', team_id: 'studio', last_post_at: now - 600000 },
        { id: 'archive', display_name: '디자인 자료와 레퍼런스 모아보기', type: 'P', team_id: 'studio', last_post_at: now - 1200000 },
        { id: 'release', display_name: '서비스 출시 준비', type: 'P', team_id: 'studio', last_post_at: now - 2400000 },
        { id: 'updates', display_name: '프로젝트 소식', type: 'O', team_id: 'operations', last_post_at: now - 4800000 },
        { id: 'support', display_name: '서비스 운영', type: 'P', team_id: 'operations', last_post_at: now - 7200000 },
        { id: 'jieun', name: 'me__jieun', type: 'D', last_post_at: now - 120000 },
        { id: 'minsu', name: 'me__minsu', type: 'D', last_post_at: now - 3600000 }
      ];
      state.channels = fixture; state.favorites = new Set(['design', 'planning']);
      Object.assign(state.previews, { planning: '#### 새로운 아이디어 **같이 살펴볼까요?**', archive: '', release: '내일 오전에 일정 함께 정리해요', updates: '이번 주 업데이트를 공유했어요 ✨', support: '' });
      for (const item of fixture) if (!state.demoPosts[item.id]) state.demoPosts[item.id] = [];
      state.unread = { lounge: 2, jieun: 1 }; renderShell();
    });
    await expect(page.locator('[data-channel=planning] .row-preview')).toHaveText('새로운 아이디어 같이 살펴볼까요?');
    await expect(page.locator('[data-channel=planning]')).toContainText('스튜디오');
    await expect(page.locator('[data-channel=release]')).not.toContainText('스튜디오');
    await expect(page.locator('[data-channel=release] .channel-type-p svg')).toBeVisible();
    await expect(page.locator('[data-channel=design]')).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({ path: path.join(root, 'test-results/sidebar-refresh-full.png') });
    await page.locator('.conversation-list').screenshot({ path: path.join(root, 'test-results/sidebar-refresh.png') });
    const fixtureRows = await page.locator('#channel-list .conversation-row').count();
    await page.locator('[data-favorite=planning]').click();
    await expect(page.locator('[data-channel=planning]')).toHaveAttribute('aria-pressed', 'false');
    assert.equal(await page.locator('#channel-list .conversation-row').count(), fixtureRows);
    await page.locator('[data-favorite=planning]').click();
    await page.locator('#channel-search').fill('자료'); await expect(page.locator('.chat-row')).toHaveCount(1);
    await page.locator('#channel-search').fill('');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900, 680));
    await expect.poll(() => page.locator('.conversation-list').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: path.join(root, 'test-results/sidebar-refresh-narrow.png') });
    await page.evaluate(() => {
      for (let i = 0; i < 35; i++) state.channels.push({ id: 'extra-' + i, display_name: '추가 채널 ' + (i + 1), type: 'O', team_id: 'operations', last_post_at: Date.now() - 10000000 });
      renderChannelList();
    });
    const list = page.locator('#channel-list'); await list.hover(); await page.mouse.wheel(0, 520);
    await expect.poll(() => list.evaluate(el => el.scrollTop)).toBeGreaterThan(200);
    const top = await list.evaluate(el => el.scrollTop);
    await page.evaluate(() => { state.previews.release = '새로운 메시지 미리보기'; renderChannelList(); });
    await expect.poll(() => list.evaluate(el => el.scrollTop)).toBeCloseTo(top, 0);
    await list.focus(); await page.keyboard.press('ArrowDown'); await expect.poll(() => list.evaluate(el => el.scrollTop)).toBeGreaterThan(top);
    await page.locator('#channel-search').fill('추가 채널'); await expect.poll(() => list.evaluate(el => el.scrollTop)).toBeLessThanOrEqual(1);
    assert.deepEqual(errors, []);
    console.log('PASS: sidebar previews, team context, privacy icons, selection, favorites, search, narrow layout, wheel/keyboard scroll and position retention');
  } finally { if (app) await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
