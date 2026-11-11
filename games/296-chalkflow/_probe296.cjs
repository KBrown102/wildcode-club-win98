/* 296-chalkflow《粉线 · 引珠坡》浏览器探针 */
const { chromium } = require('playwright');
const path = require('path');
const URL = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }
function sec(m) { console.log('— ' + m); }

(async () => {
  const browser = await chromium.launch();

  /* ============ 桌面 ============ */
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(URL);
  await page.waitForTimeout(600);

  sec('启动 / 无报错');
  ok(errs.length === 0, '无 JS 报错: ' + errs.slice(0, 3).join(' | '));
  ok(await page.evaluate(() => !!window.__CHALK__), '__CHALK__ 已暴露');
  ok(await page.evaluate(() => !!window.CHALK && !!window.CHALK_R), '逻辑层 + 渲染层已加载');
  ok(!(await page.evaluate(() => document.getElementById('ovStart').classList.contains('hide'))), '启动遮罩可见');
  ok(await page.evaluate(() => document.querySelectorAll('#lvGrid .lvcell').length) === 8, '8 个关卡格');
  ok(await page.evaluate(() => document.querySelectorAll('#lvGrid .lvcell.lock').length) === 7, '初始只解锁第 1 关');

  await page.click('#goPlay');
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.getElementById('ovStart').classList.contains('hide')), '遮罩已关闭');

  sec('画布 / 等比缩放');
  const geo = await page.evaluate(() => {
    const c = document.getElementById('cv').getBoundingClientRect();
    const s = window.__CHALK__.scale();
    return { cw: c.width, ch: c.height, W: s.W, H: s.H, SC: s.SC, BS: s.BS, bw: document.getElementById('cv').width };
  });
  ok(Math.abs(geo.cw / geo.ch - geo.W / geo.H) < 0.02, '画布宽高比 = 世界宽高比');
  ok(Math.abs(geo.cw - geo.W * geo.SC) < 2, '画布 CSS 宽 = 世界宽 × 缩放');
  ok(geo.bw >= Math.round(geo.W * Math.min(2, geo.SC)) - 1, 'backing store ≥ CSS 尺寸');
  ok(geo.BS <= 2.4 + 1e-6, 'backing 上限 2.4');

  sec('四视口等比');
  for (const vp of [[1440, 900], [1024, 768], [820, 1180], [600, 900]]) {
    await page.setViewportSize({ width: vp[0], height: vp[1] });
    await page.waitForTimeout(220);
    const g = await page.evaluate(() => {
      const c = document.getElementById('cv').getBoundingClientRect();
      const s = window.__CHALK__.scale();
      return { r: c.width / c.height, w: s.W / s.H, cw: c.width, ch: c.height, W: s.W, SC: s.SC };
    });
    ok(Math.abs(g.r - g.w) < 0.02, `视口 ${vp[0]}×${vp[1]} 等比`);
    ok(g.cw > 100 && g.ch > 100, `视口 ${vp[0]}×${vp[1]} 画布可见`);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(250);

  sec('拖动画线');
  const box = await page.evaluate(() => { const r = document.getElementById('cv').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const P = (nx, ny) => ({ x: box.x + box.w * nx, y: box.y + box.h * ny });
  const before = await page.evaluate(() => ({ n: window.__CHALK__.state().strokes.length, c: window.__CHALK__.state().chalk }));
  let p0 = P(0.12, 0.25);
  await page.mouse.move(p0.x, p0.y); await page.mouse.down();
  for (let i = 1; i <= 18; i++) { const q = P(0.12 + i * 0.035, 0.25 + i * 0.032); await page.mouse.move(q.x, q.y); }
  await page.mouse.up();
  await page.waitForTimeout(120);
  const after = await page.evaluate(() => ({ n: window.__CHALK__.state().strokes.length, c: window.__CHALK__.state().chalk, segs: window.__CHALK__.state().segs.length }));
  ok(after.n === before.n + 1, '拖动新增 1 笔');
  ok(after.c < before.c - 10, '画线扣粉笔');
  ok(after.segs > 5, '线段已建立');

  sec('粉笔 HUD 同步');
  const hudW = await page.evaluate(() => document.getElementById('chalkFill').style.width);
  ok(/%$/.test(hudW) && parseFloat(hudW) < 100, '粉笔条宽度已更新（' + hudW + '）');

  sec('点线擦除');
  const c1 = await page.evaluate(() => window.__CHALK__.state().chalk);
  let pm = P(0.12 + 9 * 0.035, 0.25 + 9 * 0.032);
  await page.mouse.move(pm.x, pm.y); await page.mouse.down(); await page.waitForTimeout(40); await page.mouse.up();
  await page.waitForTimeout(120);
  const c2 = await page.evaluate(() => ({ chalk: window.__CHALK__.state().chalk, n: window.__CHALK__.state().strokes.length }));
  ok(c2.n === after.n - 1, '轻点擦掉整笔');
  ok(c2.chalk > c1, '擦除返还粉笔');

  sec('粉笔换色');
  await page.click('.sw[data-c="2"]');
  ok(await page.evaluate(() => window.__CHALK__.state().color === 2), '切到第 3 色');
  ok(await page.evaluate(() => document.querySelector('.sw[data-c="2"]').classList.contains('on')), '色板高亮');
  await page.keyboard.press('Digit1');
  ok(await page.evaluate(() => window.__CHALK__.state().color === 0), '数字键 1 切回第 1 色');

  sec('发球 / 空格');
  const s0 = await page.evaluate(() => window.__CHALK__.state().balls.length + window.__CHALK__.state().toSpawn);
  await page.click('#bSpawn');
  await page.waitForTimeout(80);
  const s1 = await page.evaluate(() => ({ b: window.__CHALK__.state().balls.length, t: window.__CHALK__.state().toSpawn }));
  ok(s1.b >= 1, '发球按钮出球');
  ok(s1.b + s1.t === s0, '配额守恒');
  const t0 = s1.t;
  await page.keyboard.press('Space');
  await page.waitForTimeout(80);
  ok(await page.evaluate(() => window.__CHALK__.state().toSpawn) < t0, '空格提前发球');

  sec('全擦 / 重来');
  await page.click('#bErase');
  await page.waitForTimeout(80);
  ok(await page.evaluate(() => window.__CHALK__.state().strokes.length) === 0, '全擦清空');
  await page.click('#bRetry');
  await page.waitForTimeout(200);
  const rs = await page.evaluate(() => ({ s: window.__CHALK__.state().score, c: window.__CHALK__.state().caught, t: window.__CHALK__.state().toSpawn, n: window.__CHALK__.state().strokes.length }));
  ok(rs.s === 0 && rs.c === 0, '重来后分数归零');
  ok(rs.t === await page.evaluate(() => window.__CHALK__.state().N), '重来后配额满');
  ok(rs.n === 0, '重来后无线');

  sec('静音持久化');
  ok(await page.evaluate(() => document.getElementById('muteBtn').textContent.length > 0), '静音按钮有字');
  await page.click('#muteBtn');
  ok(await page.evaluate(() => localStorage.getItem('chalkflow.mute.v1') === '1'), '静音写入 localStorage');
  await page.keyboard.press('KeyM');
  ok(await page.evaluate(() => localStorage.getItem('chalkflow.mute.v1') === '0'), 'M 键取消静音');

  sec('整局跑完 / 结算 / 解锁');
  await page.evaluate(async () => {
    const G = window.__CHALK__;
    G.start(0);
    const st = G.state();
    // 画一条从漏斗到桶的引桥
    const b = st.bins[0];
    G.draw(window.CHALK.resample([{ x: st.funnel.x - 16, y: st.funnel.y + 40 }, { x: b.cx - b.w * 0.3, y: b.y - 28 }]));
  });
  await page.evaluate(() => new Promise(res => {
    const t0 = performance.now();
    (function spin() {
      const st = window.__CHALK__.state();
      if (st.done || performance.now() - t0 > 60000) return res();
      requestAnimationFrame(spin);
    })();
  }));
  await page.waitForTimeout(400);
  const fin = await page.evaluate(() => ({
    done: window.__CHALK__.state().done,
    score: window.__CHALK__.state().score,
    caught: window.__CHALK__.state().caught,
    ov: !document.getElementById('ovEnd').classList.contains('hide'),
    best: localStorage.getItem('chalkflow.best.v1'),
    un: localStorage.getItem('chalkflow.unlock.v1')
  }));
  ok(fin.done === true, '整局跑完');
  ok(fin.caught > 0, `引桥生效，进桶 ${fin.caught} 颗`);
  ok(fin.ov === true, '结算遮罩弹出');
  ok(!!fin.best && JSON.parse(fin.best)['0'] > 0, '最佳成绩写入 localStorage');
  ok(parseInt(fin.un, 10) >= 2, '解锁下一关');

  sec('刷新保留');
  await page.reload();
  await page.waitForFunction(() => !!window.__CHALK__, null, { timeout: 8000 });
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => document.querySelectorAll('#lvGrid .lvcell.lock').length) <= 6, '刷新后解锁保留');
  ok(await page.evaluate(() => localStorage.getItem('chalkflow.mute.v1') === '0'), '刷新后静音设置保留');

  sec('桌面帧率');
  await page.evaluate(() => window.__CHALK__.start(7));
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const st = window.__CHALK__.state();
    // 铺满线：制造最坏渲染负载
    for (let i = 0; i < 6; i++) {
      window.__CHALK__.draw(window.CHALK.resample([{ x: 20, y: 120 + i * 90 }, { x: 540, y: 200 + i * 90 }]));
    }
    for (let i = 0; i < 8; i++) window.__CHALK__.spawn();
  });
  const fps = await page.evaluate(() => new Promise(res => {
    let n = 0; const t0 = performance.now();
    (function f() { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(n / ((performance.now() - t0) / 1000)); })();
  }));
  ok(fps > 50, `桌面满负载 ${fps.toFixed(1)}fps`);
  await ctx.close();

  /* ============ 移动端 ============ */
  sec('移动端 iPhone13 / 触摸 / 帧率');
  const mctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
  });
  const mp = await mctx.newPage();
  const merrs = [];
  mp.on('pageerror', e => merrs.push(String(e)));
  await mp.goto(URL);
  await mp.waitForTimeout(600);
  ok(merrs.length === 0, '移动端无 JS 报错: ' + merrs.slice(0, 2).join('|'));
  await mp.click('#goPlay');
  await mp.waitForTimeout(300);
  const mg = await mp.evaluate(() => {
    const c = document.getElementById('cv').getBoundingClientRect(); const s = window.__CHALK__.scale();
    return { r: c.width / c.height, w: s.W / s.H, cw: c.width, ch: c.height, vw: innerWidth, vh: innerHeight, BS: s.BS };
  });
  ok(Math.abs(mg.r - mg.w) < 0.02, '移动端等比');
  ok(mg.cw <= mg.vw + 1 && mg.ch <= mg.vh + 1, '画布不溢出视口');
  ok(mg.BS <= 2.4 + 1e-6, '移动端 backing 上限 2.4');

  const mbox = await mp.evaluate(() => { const r = document.getElementById('cv').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const n0 = await mp.evaluate(() => window.__CHALK__.state().strokes.length);
  await mp.touchscreen.tap(mbox.x + mbox.w * 0.3, mbox.y + mbox.h * 0.4);
  await mp.waitForTimeout(80);
  ok(await mp.evaluate(() => window.__CHALK__.state().strokes.length) === n0, '轻点不画线（进入擦除判定）');
  // 触摸拖动
  await mp.evaluate(() => {
    const cv = document.getElementById('cv');
    const r = cv.getBoundingClientRect();
    const mk = (t, x, y) => cv.dispatchEvent(new PointerEvent(t, { pointerId: 1, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true }));
    mk('pointerdown', r.x + r.width * 0.15, r.y + r.height * 0.2);
    for (let i = 1; i <= 16; i++) mk('pointermove', r.x + r.width * (0.15 + i * 0.04), r.y + r.height * (0.2 + i * 0.035));
    mk('pointerup', r.x + r.width * (0.15 + 16 * 0.04), r.y + r.height * (0.2 + 16 * 0.035));
  });
  await mp.waitForTimeout(120);
  ok(await mp.evaluate(() => window.__CHALK__.state().strokes.length) === n0 + 1, '触摸拖动画线成功');

  await mp.evaluate(() => {
    window.__CHALK__.start(7);
    const st = window.__CHALK__.state();
    for (let i = 0; i < 6; i++) window.__CHALK__.draw(window.CHALK.resample([{ x: 20, y: 120 + i * 90 }, { x: 540, y: 200 + i * 90 }]));
    for (let i = 0; i < 8; i++) window.__CHALK__.spawn();
  });
  const mfps = await mp.evaluate(() => new Promise(res => {
    let n = 0; const t0 = performance.now();
    (function f() { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(n / ((performance.now() - t0) / 1000)); })();
  }));
  ok(mfps > 50, `移动端满负载 ${mfps.toFixed(1)}fps`);
  ok((await mp.evaluate(() => window.__CHALK__.state().balls.every(b => isFinite(b.x) && isFinite(b.y)))), '移动端物理无 NaN');
  await mctx.close();

  await browser.close();
  console.log(`\n探针结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
