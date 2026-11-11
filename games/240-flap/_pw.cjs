/* 240-flap 真机验证：Playwright 桌面 + 移动端，真实点击拍翼，抓 pageerror / console.error，出截图。
   运行：NODE_PATH=<workspace>/node_modules node _pw.cjs */
'use strict';
const { chromium, devices } = require('playwright');
const path = require('path');

const URL = 'file:///' + path.join(__dirname, 'index.html').replace(/\\/g, '/');
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('  FAIL ' + n + (e !== undefined ? ' -> ' + e : '')); } };

(async () => {
  const browser = await chromium.launch();

  for (const cfg of [
    { name: '桌面 1280x860 DPR2', ctx: { viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 }, tag: 'desktop' },
    { name: 'iPhone 12', ctx: devices['iPhone 12'], tag: 'mobile' },
  ]) {
    console.log('\n===== ' + cfg.name + ' =====');
    const context = await browser.newContext(cfg.ctx);
    const page = await context.newPage();
    const errs = [], cerrs = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error') cerrs.push(m.text()); });

    await page.goto(URL);
    await page.waitForTimeout(600);

    const hook = await page.evaluate(() => !!window.__GAME);
    ok('__GAME 钩子就绪', hook);
    const st0 = await page.evaluate(() => window.__GAME.state);
    ok('初始 ready 并渲染开始页', st0 === 'ready', st0);
    const cs = await page.evaluate(() => { const c = document.getElementById('c'); return { w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight }; });
    ok('canvas 尺寸按 DPR 放大', cs.w >= cs.cw && cs.h >= cs.ch, JSON.stringify(cs));
    await page.screenshot({ path: path.join(__dirname, '_s_' + cfg.tag + '_start.png') });

    // 真实点击中央 -> 起飞
    const box = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
    await page.mouse.click(box.w * 0.5, box.h * 0.75);
    await page.waitForTimeout(200);
    const st1 = await page.evaluate(() => window.__GAME.state);
    ok('真实点击后进入 playing', st1 === 'playing', st1);

    // 真机自动驾驶：页内定时器按隙心决策点击（用 __GAME.flap 模拟持续拍翼）
    const res = await page.evaluate(async () => {
      const G = window.__GAME;
      let maxScore = 0;
      for (let i = 0; i < 240; i++) {
        const ps = G.pipes; let target = G.H * 0.42, bestDx = 1e9;
        for (const p of ps) { const dx = p.x + 62 - G.birdX; if (dx > -20 && dx < bestDx) { bestDx = dx; target = p.cy + 20; } }
        if (G.bird.y > target) G.flap();
        maxScore = Math.max(maxScore, G.score);
        if (G.state !== 'playing') break;
        await new Promise(r => requestAnimationFrame(r));
      }
      return { maxScore, state: G.state, motes: G.motes, y: G.bird.y };
    });
    ok('真机运行中分数增长', res.maxScore >= 1, JSON.stringify(res));
    ok('真机坐标有限', Number.isFinite(res.y), res.y);
    await page.screenshot({ path: path.join(__dirname, '_s_' + cfg.tag + '_play.png') });

    // 静音键
    await page.mouse.click(box.w - 29, 29);
    await page.waitForTimeout(120);
    const muted = await page.evaluate(() => window.__GAME.isMuted());
    ok('点右上角切换静音', muted === true, muted);
    await page.mouse.click(box.w - 29, 29);

    // 结算页渲染
    await page.evaluate(() => { const G = window.__GAME; G.bird.y = G.H - G.GROUND; G.update(1 / 60); });
    await page.waitForTimeout(300);
    const st2 = await page.evaluate(() => window.__GAME.state);
    ok('强制落地进入 over 并渲染结算页', st2 === 'over', st2);
    await page.screenshot({ path: path.join(__dirname, '_s_' + cfg.tag + '_over.png') });

    // 冷却后重开
    await page.waitForTimeout(700);
    await page.mouse.click(box.w * 0.5, box.h * 0.6);
    await page.waitForTimeout(200);
    const st3 = await page.evaluate(() => window.__GAME.state);
    ok('冷却后点击重开', st3 === 'playing', st3);

    ok('0 个 pageerror', errs.length === 0, errs.join(' | '));
    ok('0 个 console.error', cerrs.length === 0, cerrs.join(' | '));
    await context.close();
  }

  await browser.close();
  console.log('\n===============================');
  console.log('真机验证 通过 ' + pass + ' / 失败 ' + fail);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('运行异常:', e); process.exit(1); });
