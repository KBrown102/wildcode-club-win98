// _shot.cjs — 截图（桌面开始页 / 游戏中 / 移动端）
const { chromium } = require('playwright');
const path = require('path');
const URL = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');

(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 1200, height: 880 }, deviceScaleFactor: 2 });
  const p = await c.newPage();
  await p.goto(URL);
  await p.waitForTimeout(800);
  await p.screenshot({ path: path.resolve(__dirname, '_p289_start.png') });

  await p.locator('#bStart').click();
  await p.waitForTimeout(400);
  await p.evaluate(() => window.__game.newRun(4));   // 用第 5 关(26柱)避免截到结算页
  await p.waitForTimeout(400);
  // 打几发，制造连锁与粒子
  await p.evaluate(async () => {
    const G = window.__game.G, st = window.__game.st;
    for (let k = 0; k < 4; k++) {
      let bb = null;
      for (let t = 0; t < 600; t++) {
        for (const x of G.bands(st)) if (!bb || x[1] - x[0] > bb[1] - bb[0]) bb = x;
        if (bb && bb[1] - bb[0] + 1 >= 3) break;
        await new Promise(r => requestAnimationFrame(r)); bb = null;
      }
      if (bb) G.launch(st, bb[0]);
      await new Promise(r => setTimeout(r, 400));
    }
  });
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.resolve(__dirname, '_p289_play.png') });

  const m = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const mp = await m.newPage();
  await mp.goto(URL); await mp.waitForTimeout(700);
  await mp.locator('#bStart').click(); await mp.waitForTimeout(300);
  await mp.evaluate(() => window.__game.newRun(4)); await mp.waitForTimeout(1600);
  await mp.screenshot({ path: path.resolve(__dirname, '_p289_mobile.png') });

  await b.close();
  console.log('shots done');
})();
