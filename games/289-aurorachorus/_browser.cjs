// _browser.cjs — 289-aurorachorus 浏览器探针
const { chromium } = require('playwright');
const path = require('path');

const URL = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');
let pass = 0, fail = 0;
const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); console.log('  X ' + m); } }

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));

  await page.goto(URL);
  await page.waitForTimeout(700);

  ok(errs.length === 0, '无控制台报错' + (errs.length ? ': ' + errs[0] : ''));
  ok(await page.evaluate(() => !!window.__game), '探针句柄 window.__game 已挂');
  ok(await page.locator('#ovStart').evaluate(e => e.classList.contains('on')), '开始遮罩可见');

  // ---- 画布尺寸纪律 ----
  const dims = await page.evaluate(() => {
    const cv = document.getElementById('cv');
    const r = cv.getBoundingClientRect();
    return { cssW: r.width, cssH: r.height, bw: cv.width, bh: cv.height };
  });
  ok(Math.abs(dims.cssW / dims.cssH - 480 / 800) < 0.01, 'canvas 显示比例 = 480:800');
  ok(dims.bw >= Math.round(dims.cssW), 'backing 宽 >= CSS 宽 (' + dims.bw + ' >= ' + Math.round(dims.cssW) + ')');
  ok(dims.bh >= Math.round(dims.cssH), 'backing 高 >= CSS 高 (' + dims.bh + ' >= ' + Math.round(dims.cssH) + ')');

  // ---- 四视口等比缩放 ----
  const views = [[1280, 900], [900, 700], [600, 760], [420, 640]];
  const ks = [];
  for (const v of views) {
    await page.setViewportSize({ width: v[0], height: v[1] });
    await page.waitForTimeout(180);
    const r = await page.evaluate(() => {
      const s = document.getElementById('stage').getBoundingClientRect();
      return { w: s.width, h: s.height, l: s.left, rr: s.right };
    });
    const kx = r.w / 480, ky = r.h / 800;
    ks.push(kx);
    ok(Math.abs(kx - ky) < 0.02, '视口 ' + v[0] + 'x' + v[1] + ' 等比缩放 (kx=' + kx.toFixed(3) + ' ky=' + ky.toFixed(3) + ')');
    ok(r.l >= -1 && r.rr <= v[0] + 1, '视口 ' + v[0] + 'x' + v[1] + ' 水平不溢出');
    ok(Math.abs((r.l + r.rr) / 2 - v[0] / 2) < 2, '视口 ' + v[0] + 'x' + v[1] + ' 水平居中');
  }
  ok(ks[0] > ks[3], '视口变大 -> 缩放变大');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(150);

  // ---- 开始 ----
  await page.locator('#bStart').click();
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => window.__game.mode === 'play'), '进入游戏模式');
  ok(!(await page.locator('#ovStart').evaluate(e => e.classList.contains('on'))), '开始遮罩已隐藏');
  ok(await page.evaluate(() => window.__game.st.n === 13), '第 1 关 13 根柱');

  const t0 = await page.evaluate(() => window.__game.st.time);
  await page.waitForTimeout(500);
  ok(await page.evaluate(() => window.__game.st.time) > t0, '主循环推进');

  // ---- 连锁 ----
  const chainRes = await page.evaluate(async () => {
    const G = window.__game.G, st = window.__game.st;
    for (let tries = 0; tries < 1200; tries++) {
      let b = null;
      for (const x of G.bands(st)) if (!b || x[1] - x[0] > b[1] - b[0]) b = x;
      if (b && b[1] - b[0] + 1 >= 3) {
        const before = st.lit, w0 = st.waves, l0 = st.launches;
        G.launch(st, b[0]);
        await new Promise(r => setTimeout(r, 900));
        return { gained: st.lit - before, used: w0 - st.waves, launched: st.launches - l0, waves: st.waves };
      }
      await new Promise(r => requestAnimationFrame(r));
    }
    return null;
  });
  ok(chainRes && chainRes.gained >= 2, '点击产生连锁 (+' + (chainRes && chainRes.gained) + ' 根)');
  ok(chainRes && chainRes.launched === 1 && chainRes.used <= 1, '命中扣 1 束波 (used=' + (chainRes && chainRes.used) + ', 返还可抵消)');

  // ---- 真实指针点击 ----（重开大关，避免前序测试把小关打完）
  await page.evaluate(() => window.__game.newRun(4));
  await page.waitForTimeout(300);
  const beforeLit = await page.evaluate(() => window.__game.st.lit);
  const box = await page.locator('#cv').boundingBox();
  const winCol = await page.evaluate(async () => {
    const st = window.__game.st, G = window.__game.G;
    for (let tries = 0; tries < 900; tries++) {
      let best = -1, bw = 0;
      for (const x of G.bands(st)) if (x[1] - x[0] > bw) { bw = x[1] - x[0]; best = x[0]; }
      if (best >= 0) return st.cols[best].x;
      await new Promise(r => requestAnimationFrame(r));
    }
    return null;
  });
  if (winCol != null) {
    await page.mouse.click(box.x + (winCol / 480) * box.width, box.y + (300 / 800) * box.height);
    await page.waitForTimeout(500);
    const afterLit = await page.evaluate(() => window.__game.st.lit);
    ok(afterLit >= beforeLit, '真实点击命中 (' + beforeLit + ' -> ' + afterLit + ')');
  } else ok(false, '找到可点击亮带');

  // ---- 键盘 ----
  await page.evaluate(() => { window.__game.newRun(4); });
  await page.waitForTimeout(260);
  await page.evaluate(() => { window.__game.st.cursor = 6; window.__game.st.__cursorVisible = true; });
  const c0 = 6;
  await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(220); await page.keyboard.up('ArrowLeft');
  const c1 = await page.evaluate(() => window.__game.st.cursor);
  ok(c1 < c0, '左方向键左移光标 (' + c0 + ' -> ' + c1.toFixed(2) + ')');
  await page.keyboard.down('KeyD'); await page.waitForTimeout(220); await page.keyboard.up('KeyD');
  const c2 = await page.evaluate(() => window.__game.st.cursor);
  ok(c2 > c1, 'D 右移光标 (' + c1.toFixed(2) + ' -> ' + c2.toFixed(2) + ')');
  await page.keyboard.down('KeyA'); await page.waitForTimeout(220); await page.keyboard.up('KeyA');
  const c3 = await page.evaluate(() => window.__game.st.cursor);
  ok(c3 < c2, 'A 左移光标 (' + c2.toFixed(2) + ' -> ' + c3.toFixed(2) + ')');
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(220); await page.keyboard.up('ArrowRight');
  const c4 = await page.evaluate(() => window.__game.st.cursor);
  ok(c4 > c3, '右方向键右移光标 (' + c3.toFixed(2) + ' -> ' + c4.toFixed(2) + ')');
  ok(Math.abs(c4 - c2) < 0.6, 'D 与右方向键位移一致');
  ok(Math.abs(c3 - c1) < 0.6, 'A 与左方向键位移一致');

  const litBeforeK = await page.evaluate(() => window.__game.st.lit);
  await page.evaluate(() => {
    const st = window.__game.st, G = window.__game.G;
    let b = null; for (const x of G.bands(st)) if (!b || x[1] - x[0] > b[1] - b[0]) b = x;
    if (b) st.cursor = b[0];
  });
  await page.keyboard.press('Space');
  await page.waitForTimeout(600);
  ok(await page.evaluate(() => window.__game.st.lit) > litBeforeK, '空格发射生效');

  // ---- HUD ----
  const hud = await page.evaluate(() => ({
    prog: document.getElementById('hProgL').textContent,
    wv: document.querySelectorAll('#hWv .wd').length,
    wvOn: document.querySelectorAll('#hWv .wd.on').length,
    waves: window.__game.st.waves
  }));
  ok(/点亮 \d+ \/ \d+/.test(hud.prog), '进度文案正确: ' + hud.prog);
  ok(hud.wv > 0 && hud.wvOn === hud.waves, '波束图标数与实一致 (' + hud.wvOn + '/' + hud.wv + ')');

  // ---- 静音 ----
  const muteOk = await page.evaluate(() => {
    const b = document.getElementById('mute');
    const r = b.getBoundingClientRect();
    return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === b;
  });
  ok(muteOk, '静音按钮未被遮罩挡住');
  await page.locator('#mute').click(); await page.waitForTimeout(120);
  ok(await page.evaluate(() => window.__game.save.mute === true), '静音开启并写入存档');
  await page.locator('#mute').click(); await page.waitForTimeout(120);
  ok(await page.evaluate(() => window.__game.save.mute === false), '静音可关闭');

  // ---- 音效节点计数 ----
  const oscCount = await page.evaluate(async () => {
    window.__game.newRun(4);
    await new Promise(r => setTimeout(r, 260));
    let n = 0;
    const P = (window.AudioContext || window.webkitAudioContext).prototype;
    const orig = P.createOscillator;
    P.createOscillator = function () { n++; return orig.apply(this, arguments); };
    const G = window.__game.G, st = window.__game.st;
    for (let k = 0; k < 3; k++) {
      let b = null;
      for (let tries = 0; tries < 400; tries++) {
        for (const x of G.bands(st)) if (!b || x[1] - x[0] > b[1] - b[0]) b = x;
        if (b && b[1] - b[0] + 1 >= 2) break;
        await new Promise(r => requestAnimationFrame(r));
        b = null;
      }
      if (b) G.launch(st, b[0]);
      await new Promise(r => setTimeout(r, 700));
    }
    P.createOscillator = orig;
    return n;
  });
  ok(oscCount >= 6, '音效被触发 (振荡器 ' + oscCount + ' 个, 期望 >=6)');

  // ---- 帧率 ----
  const fps = await page.evaluate(async () => {
    const st = window.__game.st, G = window.__game.G;
    for (let k = 0; k < 6; k++) {
      let b = null; for (const x of G.bands(st)) if (!b || x[1] - x[0] > b[1] - b[0]) b = x;
      if (b) G.launch(st, b[0]);
      await new Promise(r => setTimeout(r, 120));
    }
    let n = 0; const t0 = performance.now();
    await new Promise(res => {
      function f() { n++; if (performance.now() - t0 < 2500) requestAnimationFrame(f); else res(); }
      requestAnimationFrame(f);
    });
    return n / ((performance.now() - t0) / 1000);
  });
  ok(fps > 52, '满压力帧率 ' + fps.toFixed(1) + 'fps');

  // ---- 移动端 ----
  const m = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true
  });
  const mp = await m.newPage();
  const merrs = [];
  mp.on('pageerror', e => merrs.push(e.message));
  await mp.goto(URL);
  await mp.waitForTimeout(600);
  ok(merrs.length === 0, '移动端无报错' + (merrs.length ? ': ' + merrs[0] : ''));
  await mp.locator('#bStart').click();
  await mp.waitForTimeout(400);
  const mBefore = await mp.evaluate(() => window.__game.st.lit);
  const mbox = await mp.locator('#cv').boundingBox();
  const mcol = await mp.evaluate(() => {
    const st = window.__game.st, G = window.__game.G;
    let best = -1, bw = -1;
    for (const x of G.bands(st)) if (x[1] - x[0] > bw) { bw = x[1] - x[0]; best = x[0]; }
    return best >= 0 ? st.cols[best].x : 240;
  });
  await mp.touchscreen.tap(mbox.x + (mcol / 480) * mbox.width, mbox.y + (320 / 800) * mbox.height);
  await mp.waitForTimeout(600);
  ok(await mp.evaluate(() => window.__game.st.lit) >= mBefore, '移动端触摸发射');
  const mdim = await mp.evaluate(() => {
    const cv = document.getElementById('cv'), s = document.getElementById('stage').getBoundingClientRect();
    return { bw: cv.width, k: s.width / 480 };
  });
  ok(mdim.bw / 480 <= 2.11, '移动端 backing 倍率 ' + (mdim.bw / 480).toFixed(2) + ' <= 2.1');
  const mfps = await mp.evaluate(async () => {
    let n = 0; const t0 = performance.now();
    await new Promise(res => {
      function f() { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(); }
      requestAnimationFrame(f);
    });
    return n / ((performance.now() - t0) / 1000);
  });
  ok(mfps > 50, '移动端帧率 ' + mfps.toFixed(1) + 'fps (dpr=3, headless 阈值 50)');

  // ---- 结算 ----（回到第 1 关，验证解锁链路）
  await page.evaluate(() => window.__game.newRun(0));
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const st = window.__game.st;
    st.lit = st.n; for (let i = 0; i < st.n; i++) st.locked[i] = true;
    st.maxChain = 9; st.score = 520;
  });
  await page.waitForTimeout(1400);
  ok(await page.locator('#ovEnd').evaluate(e => e.classList.contains('on')), '结算遮罩弹出');
  const endInfo = await page.evaluate(() => ({
    title: document.getElementById('eTitle').textContent,
    stars: document.getElementById('eStars').textContent,
    unlocked: window.__game.save.unlocked,
    best: window.__game.save.best[0]
  }));
  ok(endInfo.title.indexOf('极') >= 0, '通关标题: ' + endInfo.title);
  ok(endInfo.unlocked >= 2, '解锁第 2 关 (unlocked=' + endInfo.unlocked + ')');
  ok(endInfo.best > 0, '最佳分写入 ' + endInfo.best);
  ok((endInfo.stars.match(/★/g) || []).length === 3, '星级显示 3 颗');

  // ---- 选关 ----
  await page.locator('#bLv2').click();
  await page.waitForTimeout(300);
  ok(await page.locator('#ovLevels').evaluate(e => e.classList.contains('on')), '选关遮罩可见');
  const cards = await page.locator('.lvcard').count();
  ok(cards === 5, '选关有 ' + cards + ' 张卡');
  const lockedN = await page.locator('.lvcard.lock').count();
  ok(lockedN === 3, '未解锁关卡 ' + lockedN + ' 张 (应为 3)');
  await page.locator('.lvcard').nth(1).click();
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => window.__game.li === 1 && window.__game.mode === 'play'), '进入第 2 关');

  // ---- 刷新存档 ----
  await page.reload();
  await page.waitForTimeout(500);
  ok(await page.evaluate(() => window.__game.save.unlocked >= 2), '刷新后解锁进度保留');

  await browser.close();
  console.log('\n浏览器探针：' + pass + ' 通过 / ' + fail + ' 失败');
  if (fail) { console.log('失败项：'); fails.forEach(f => console.log('  - ' + f)); process.exit(1); }
})().catch(e => { console.error('PROBE ERROR', e); process.exit(1); });
