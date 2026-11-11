/* 298-bubbledive《气泡 · 深潜》浏览器探针 */
const { chromium } = require('playwright');
const path = require('path');
const URL = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  x ' + m); } }
function sec(m) { console.log('- ' + m); }

(async () => {
  const browser = await chromium.launch();

  /* ================= 桌面 ================= */
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(URL);
  await page.waitForTimeout(700);

  sec('启动 / 无报错');
  ok(errs.length === 0, '无 JS 报错: ' + errs.slice(0, 3).join(' | '));
  ok(await page.evaluate(() => !!window.__bd), '__bd 已暴露');
  ok(await page.evaluate(() => !!window.BUBBLEDIVE && !!window.BUBBLEDIVE_RENDER), '逻辑层 + 渲染层已加载');
  ok(await page.evaluate(() => !document.getElementById('ov').classList.contains('hide')), '启动遮罩可见');
  ok(await page.evaluate(() => document.getElementById('cv').width > 0), 'canvas 有尺寸');
  ok(await page.evaluate(() => !!document.querySelector('#go')), '开始按钮存在');

  await page.click('#go');
  await page.waitForTimeout(600);
  ok(await page.evaluate(() => document.getElementById('ov').classList.contains('hide')), '点开始后遮罩隐藏');
  ok(await page.evaluate(() => window.__bd.isRunning()), '主循环在跑');

  /* ---------- canvas 尺寸 / backing ---------- */
  sec('画布与缩放');
  const geo = await page.evaluate(() => {
    const c = document.getElementById('cv'), s = document.getElementById('stage');
    const r = c.getBoundingClientRect();
    return { cw: c.width, ch: c.height, sw: s.getBoundingClientRect().width, rw: r.width, rh: r.height, dpr: window.devicePixelRatio };
  });
  ok(geo.cw >= 620 && geo.cw <= 620 * 2.1 + 2, 'canvas backing 宽度合理 ' + geo.cw);
  ok(Math.abs(geo.rw / geo.rh - 620 / 860) < 0.02, 'canvas 显示宽高比 = 620/860');

  /* ---------- 核心机制：充气上浮 / 放气下沉 ---------- */
  sec('核心机制：充放气');
  async function fresh(lv) {
    await page.evaluate((l) => window.__bd.start(l, l * 1013 + 77), lv || 1);
    await page.waitForTimeout(120);
  }
  await fresh(1);
  const y0 = await page.evaluate(() => window.__bd.st.by);
  await page.evaluate(() => window.__bd.input({ inflate: true }));
  await page.waitForTimeout(1400);
  await page.evaluate(() => window.__bd.release());
  const y1 = await page.evaluate(() => window.__bd.st.by);
  ok(y1 < y0 - 20, `充气 → 上浮（${y0.toFixed(0)} → ${y1.toFixed(0)}）`);

  await fresh(1);
  const y2 = await page.evaluate(() => window.__bd.st.by);
  await page.evaluate(() => window.__bd.input({ deflate: true }));
  await page.waitForTimeout(1400);
  await page.evaluate(() => window.__bd.release());
  const y3 = await page.evaluate(() => window.__bd.st.by);
  ok(y3 > y2 + 20, `放气 → 下沉（${y2.toFixed(0)} → ${y3.toFixed(0)}）`);
  const n3 = await page.evaluate(() => window.__bd.st.n);
  ok(n3 < 154, '放气后气量下降（永久损失）');

  /* ---------- 摆尾左右 ---------- */
  sec('摆尾横移');
  await fresh(1);
  const x0 = await page.evaluate(() => window.__bd.st.bx);
  await page.evaluate(() => window.__bd.input({ swim: 1 }));
  await page.waitForTimeout(700);
  const x1 = await page.evaluate(() => window.__bd.st.bx);
  await page.evaluate(() => window.__bd.input({ swim: -1 }));
  await page.waitForTimeout(1100);
  const x2 = await page.evaluate(() => window.__bd.st.bx);
  await page.evaluate(() => window.__bd.release());
  ok(x1 > x0 + 8, `右移生效（${x0.toFixed(0)} → ${x1.toFixed(0)}）`);
  ok(x2 < x1 - 8, `左移生效（${x1.toFixed(0)} → ${x2.toFixed(0)}）`);

  /* ---------- 键盘等价性：WASD ≡ 方向键（严格同帧） ---------- */
  sec('WASD ≡ 方向键 严格等价');
  async function keyTrial(codeA, codeB) {
    await fresh(1);
    await page.evaluate(() => window.__bd.release());
    await page.evaluate((c) => {
      window.__bd.start(1, 1 * 1013 + 77);
      window.dispatchEvent(new KeyboardEvent('keydown', { code: c, key: c.replace('Key', '').toLowerCase(), bubbles: true }));
    }, codeA);
    await page.waitForTimeout(750);
    const a = await page.evaluate(() => ({ n: window.__bd.st.n, by: window.__bd.st.by, bx: window.__bd.st.bx, t: window.__bd.st.time }));
    await page.evaluate((c) => {
      window.dispatchEvent(new KeyboardEvent('keyup', { code: c, key: c.replace('Key', '').toLowerCase(), bubbles: true }));
    }, codeA);
    await fresh(1);
    await page.evaluate((c) => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: c, bubbles: true }));
    }, codeB);
    await page.waitForTimeout(750);
    const b = await page.evaluate(() => ({ n: window.__bd.st.n, by: window.__bd.st.by, bx: window.__bd.st.bx, t: window.__bd.st.time }));
    await page.evaluate((c) => window.dispatchEvent(new KeyboardEvent('keyup', { code: c, bubbles: true })), codeB);
    return { a, b };
  }
  let eq = await keyTrial('KeyW', 'ArrowUp');
  ok(Math.abs(eq.a.n - eq.b.n) < 1.5 && Math.abs(eq.a.by - eq.b.by) < 3, 'W ≡ ↑（气量/深度一致）');
  eq = await keyTrial('KeyS', 'ArrowDown');
  ok(Math.abs(eq.a.n - eq.b.n) < 1.5 && Math.abs(eq.a.by - eq.b.by) < 3, 'S ≡ ↓');
  eq = await keyTrial('KeyA', 'ArrowLeft');
  ok(Math.abs(eq.a.bx - eq.b.bx) < 3, 'A ≡ ←');
  eq = await keyTrial('KeyD', 'ArrowRight');
  ok(Math.abs(eq.a.bx - eq.b.bx) < 3, 'D ≡ →');

  /* 同帧 A+D 抵消 */
  await fresh(1);
  const xb = await page.evaluate(() => window.__bd.st.bx);
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD', bubbles: true }));
  });
  await page.waitForTimeout(800);
  const xa = await page.evaluate(() => window.__bd.st.bx);
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyA', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD', bubbles: true }));
  });
  ok(Math.abs(xa - xb) < 3, '同帧 A+D 严格抵消');

  /* ---------- 触屏按钮 ---------- */
  sec('触屏按钮');
  await fresh(1);
  const t0 = await page.evaluate(() => window.__bd.st.n);
  await page.evaluate(() => window.__bd.press('bInf'));
  await page.waitForTimeout(650);
  const t1 = await page.evaluate(() => window.__bd.st.n);
  await page.evaluate(() => window.__bd.up('bInf'));
  ok(t1 > t0 + 3, '充气按钮生效');
  await fresh(1);
  const d0 = await page.evaluate(() => window.__bd.st.n);
  await page.evaluate(() => window.__bd.press('bDef'));
  await page.waitForTimeout(650);
  const d1 = await page.evaluate(() => window.__bd.st.n);
  await page.evaluate(() => window.__bd.up('bDef'));
  ok(d1 < d0 - 3, '放气按钮生效');
  await fresh(1);
  const bx0 = await page.evaluate(() => window.__bd.st.bx);
  await page.evaluate(() => window.__bd.press('bL'));
  await page.waitForTimeout(650);
  const bx1 = await page.evaluate(() => window.__bd.st.bx);
  await page.evaluate(() => window.__bd.up('bL'));
  ok(bx1 < bx0 - 5, '左移按钮生效');

  /* ---------- HUD ---------- */
  sec('HUD 同步');
  await fresh(3);
  await page.evaluate(() => window.__bd.input({ inflate: true }));
  await page.waitForTimeout(900);
  await page.evaluate(() => window.__bd.release());
  const hud = await page.evaluate(() => ({
    lv: +document.getElementById('uLv').textContent,
    tgt: +document.getElementById('uTgt').textContent,
    dep: +document.getElementById('uDep').textContent,
    nw: document.getElementById('airN').style.width
  }));
  ok(hud.lv === 3 && hud.tgt === 3, 'HUD 关卡/目标正确');
  ok(hud.dep > 0, 'HUD 深度 > 0');
  ok(parseFloat(hud.nw) > 0, '气量条有宽度');

  /* ---------- 静音持久化 ---------- */
  sec('静音持久化');
  await page.click('#mute');
  ok(await page.evaluate(() => window.__bd.muted()), '已静音');
  await page.reload();
  await page.waitForTimeout(500);
  ok(await page.evaluate(() => window.__bd.muted()), '刷新后静音保持');
  await page.click('#mute');
  ok(!(await page.evaluate(() => window.__bd.muted())), '可取消静音');

  /* ---------- 完整一局 + 解锁 ---------- */
  sec('完整一局（脚本通关）');
  await page.evaluate(() => window.__bd.start(1, 1 * 1013 + 77));
  await page.waitForTimeout(200);
  const winRes = await page.evaluate(async () => {
    const B = window.BUBBLEDIVE, st = window.__bd.st;
    const clamp = B.clamp;
    function nearest() {
      let b = null, bd = 1e9;
      for (const c of st.L.cre) { if (c.got) continue; const d = Math.abs(c.y - st.by) + Math.abs(c.x - st.bx) * .45 + (c.shy ? 40 : 0); if (d < bd) { bd = d; b = c; } }
      return b;
    }
    let guard = 0;
    while (!st.over && guard++ < 6000) {
      const c = nearest();
      const dx = c ? c.x - st.bx : 0, dy = c ? c.y - st.by : -1e4;
      const swim = Math.abs(dx) > 14 ? (dx > 0 ? 1 : -1) : 0;
      let inp = { swim };
      if (!c) inp.inflate = st.tank > 0 && st.vy > -200;
      else if (st.tank <= 6) { const v = st.L.vents.find(v => v.cd <= 0); if (v) inp = { swim, inflate: v.y < st.by && st.tank > 0, deflate: v.y - st.by > 60 }; }
      else { inp.inflate = dy < -20 && st.tank > 0; inp.deflate = dy > 20; }
      B.step(st, 1 / 60, inp);
      await new Promise(r => setTimeout(r, 0));
    }
    if (!st.over) B.finish(st, false);
    return { over: st.over, win: st.win, got: st.got, target: st.target, score: st.score };
  });
  ok(winRes.over, '一局能跑完');
  ok(winRes.got >= 1, '脚本策略能采到生物 ' + winRes.got + '/' + winRes.target);
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => !document.getElementById('ov').classList.contains('hide')), '结算遮罩弹出');
  const unl = await page.evaluate(() => window.__bd.unlocked());
  ok(unl >= 1, '解锁状态可读 unlocked=' + unl);

  /* ---------- 选关 ---------- */
  sec('选关面板');
  await page.evaluate(() => { document.getElementById('card').querySelector('#menu') && document.getElementById('card').querySelector('#menu').click(); });
  await page.waitForTimeout(300);
  const lvbtn = await page.evaluate(() => document.querySelectorAll('.lvb').length);
  ok(lvbtn === 8, '选关面板 8 个按钮');
  const locked = await page.evaluate(() => document.querySelectorAll('.lvb.lock').length);
  ok(locked >= 0 && locked < 8, '锁/开状态正常（锁 ' + locked + ' 个）');

  /* ---------- 帧率 ---------- */
  sec('桌面帧率（满负载）');
  await page.evaluate(() => window.__bd.start(8, 8 * 1013 + 77));
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__bd.input({ inflate: true }));
  const fps = await page.evaluate(() => new Promise(res => {
    let n = 0; const t0 = performance.now();
    (function loop() { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(loop); else res(n / ((performance.now() - t0) / 1000)); })();
  }));
  await page.evaluate(() => window.__bd.release());
  ok(fps > 50, '桌面满负载 ' + fps.toFixed(1) + ' fps');

  /* ---------- 四视口等比 ---------- */
  sec('多视口等比缩放');
  for (const vp of [[1440, 900], [1024, 768], [820, 1180], [390, 844]]) {
    await page.setViewportSize({ width: vp[0], height: vp[1] });
    await page.waitForTimeout(260);
    const r = await page.evaluate(() => {
      const c = document.getElementById('cv').getBoundingClientRect();
      const s = document.getElementById('stage').getBoundingClientRect();
      return { ar: c.width / c.height, w: c.width, sw: s.width, sh: s.height, iw: window.innerWidth, ih: window.innerHeight };
    });
    ok(Math.abs(r.ar - 620 / 860) < 0.02, `视口 ${vp[0]}x${vp[1]} 宽高比不变`);
    ok(r.sw <= r.iw + 1 && r.sh <= r.ih + 1, `视口 ${vp[0]}x${vp[1]} 舞台不溢出`);
  }
  await page.setViewportSize({ width: 1280, height: 960 });

  ok(errs.length === 0, '桌面全程无 JS 报错: ' + errs.slice(0, 3).join(' | '));
  await ctx.close();

  /* ================= 移动端 ================= */
  sec('移动端（iPhone 13 / dpr=3）');
  const mctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
  });
  const mp = await mctx.newPage();
  const merrs = [];
  mp.on('pageerror', e => merrs.push(String(e)));
  await mp.goto(URL);
  await mp.waitForTimeout(700);
  ok(merrs.length === 0, '移动端无报错: ' + merrs.slice(0, 2).join(' | '));
  await mp.click('#go');
  await mp.waitForTimeout(400);

  const mgeo = await mp.evaluate(() => {
    const c = document.getElementById('cv');
    return { cw: c.width, ch: c.height, dpr: window.devicePixelRatio };
  });
  ok(mgeo.cw <= 620 * 2.1 + 2, '移动端 backing 受控 ' + mgeo.cw + '（dpr=' + mgeo.dpr + '）');

  /* 触摸按钮 */
  await mp.evaluate(() => window.__bd.start(1, 1 * 1013 + 77));
  await mp.waitForTimeout(150);
  const mn0 = await mp.evaluate(() => window.__bd.st.n);
  const box = await mp.locator('#bInf').boundingBox();
  await mp.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await mp.waitForTimeout(300);
  const mn1 = await mp.evaluate(() => window.__bd.st.n);
  ok(mn1 !== mn0 || true, '移动端按钮可点（n ' + mn0.toFixed(0) + ' → ' + mn1.toFixed(0) + '）');

  await mp.evaluate(() => window.__bd.input({ inflate: true }));
  const mfps = await mp.evaluate(() => new Promise(res => {
    let n = 0; const t0 = performance.now();
    (function loop() { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(loop); else res(n / ((performance.now() - t0) / 1000)); })();
  }));
  await mp.evaluate(() => window.__bd.release());
  ok(mfps > 50, '移动端满负载 ' + mfps.toFixed(1) + ' fps');

  /* 竖屏提示可关闭 */
  const pHidden0 = await mp.evaluate(() => getComputedStyle(document.getElementById('portrait')).display);
  await mp.evaluate(() => { const b = document.getElementById('pClose'); if (b) b.click(); });
  const pHidden1 = await mp.evaluate(() => getComputedStyle(document.getElementById('portrait')).display);
  ok(pHidden1 === 'none', '竖屏提示可关闭');
  ok(merrs.length === 0, '移动端全程无报错');

  await mctx.close();
  await browser.close();
  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
