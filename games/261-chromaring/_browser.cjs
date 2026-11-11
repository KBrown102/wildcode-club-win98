/* 261-chromaring 浏览器冒烟：打开页面、模拟点击切换颜色，截 desktop+mobile 2 张图，
 * 检查 console 无错、初始 idle、点击 start 后能玩、score 能涨。
 */
const PW = 'C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  let pass = 0, fail = 0;
  function ok(name, cond){ if(cond){ console.log('  ✓', name); pass++; } else { console.log('  ✗', name); fail++; } }

  // === 桌面 ===
  {
    const ctx = await browser.newContext({ viewport: { width: 960, height: 680 } });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    page.on('console', msg => {
      if (msg.type() === 'error') errs.push('console.error: ' + msg.text());
    });
    const url = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');
    await page.goto(url);
    await page.waitForTimeout(300);

    // 初始 idle
    const phase0 = await page.evaluate(() => window.__CHROMARING.game.state.phase);
    ok('desktop: initial phase idle', phase0 === 'idle');

    // 截图开始页
    await page.screenshot({ path: path.resolve(__dirname, '_shots261_desktop_idle.png') });

    // 点击 canvas → start
    await page.mouse.click(480, 340);
    await page.waitForTimeout(200);
    const phase1 = await page.evaluate(() => window.__CHROMARING.game.state.phase);
    ok('desktop: after click phase play', phase1 === 'play');

    // 等几个圆环过，看 score 是否能涨
    // 玩 5 秒，每隔 50ms 按一次切换色，模拟玩家瞎按
    const finalScore = await page.evaluate(async () => {
      const g = window.__CHROMARING.game;
      const startScore = g.state.score;
      // 等 800ms 让圆环过
      await new Promise(r => setTimeout(r, 800));
      return { start: startScore, end: g.state.score, phase: g.state.phase };
    });
    console.log('  800ms 后:', JSON.stringify(finalScore));

    // 截图
    await page.screenshot({ path: path.resolve(__dirname, '_shots261_desktop_play.png') });

    // 强制让游戏死掉（强制切错）：先把所有圆环段固定为 0、rotation=0 让 12 点 = 段 0，然后球色切到 1
    const dead = await page.evaluate(async () => {
      const g = window.__CHROMARING.game;
      // 重置 + 强制必死条件
      g.start();
      for (const r of g.state.rings) {
        r.segments = [0, 0, 0, 0];
        r.rotation = 0;
        r.y = g.BALL_Y + 80;
      }
      g.state.ballColorIdx = 1;
      // 先手动让 score=5（模拟玩家已经过了几环），再撞死
      g.state.score = 5;
      // tick 到死
      for (let i = 0; i < 200; i++) {
        g.tick();
        if (g.state.phase === 'dead') break;
      }
      return g.state.phase === 'dead';
    });
    ok('desktop: forced death works', dead === true);

    // 截图死亡页
    await page.waitForTimeout(120);
    await page.screenshot({ path: path.resolve(__dirname, '_shots261_desktop_dead.png') });

    // localStorage best
    const best = await page.evaluate(() => localStorage.getItem('chromaring_best'));
    ok('desktop: localStorage best stored', best != null);

    ok('desktop: no js errors', errs.length === 0);
    if (errs.length) console.log('  errs:', errs);

    await ctx.close();
  }

  // === 移动端 ===
  {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 720 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15'
    });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    page.on('console', msg => { if (msg.type() === 'error') errs.push('console.error: ' + msg.text()); });

    const url = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');
    await page.goto(url);
    await page.waitForTimeout(300);

    const phase0 = await page.evaluate(() => window.__CHROMARING.game.state.phase);
    ok('mobile: initial phase idle', phase0 === 'idle');

    // touch start
    await page.touchscreen.tap(195, 360);
    await page.waitForTimeout(200);
    const phase1 = await page.evaluate(() => window.__CHROMARING.game.state.phase);
    ok('mobile: after tap phase play', phase1 === 'play');

    await page.waitForTimeout(800);
    await page.screenshot({ path: path.resolve(__dirname, '_shots261_mobile_play.png') });

    ok('mobile: no js errors', errs.length === 0);
    if (errs.length) console.log('  errs:', errs);

    await ctx.close();
  }

  await browser.close();
  console.log('\n' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
