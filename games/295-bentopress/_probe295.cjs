/* 295-bentopress 浏览器探针 */
const { chromium } = require('playwright');
const path = require('path');
const URL = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }
function sec(m) { console.log('· ' + m); }

(async () => {
  const browser = await chromium.launch();

  /* ============ 桌面 ============ */
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(URL);
  await page.waitForTimeout(700);

  sec('启动 / 无报错');
  ok(errs.length === 0, '无 JS 报错: ' + errs.slice(0, 3).join(' | '));
  ok(await page.evaluate(() => !!window.__BENTO__), '__BENTO__ 已暴露');
  ok(await page.evaluate(() => !!window.BENTO && !!window.BENTO_R), '逻辑层与渲染层已加载');
  ok(!(await page.evaluate(() => document.getElementById('ovStart').classList.contains('hide'))), '启动遮罩可见');

  sec('选关网格 / 解锁');
  ok(await page.evaluate(() => document.querySelectorAll('#lvGrid .lvcell').length) === 8, '8 个关卡格');
  ok(await page.evaluate(() => document.querySelectorAll('#lvGrid .lvcell.lock').length) === 7, '初始只解锁第 1 盒');

  // 开始
  await page.click('#goPlay');
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => document.getElementById('ovStart').classList.contains('hide')), '遮罩已关闭');

  sec('画布 / 视口等比缩放');
  const geo = await page.evaluate(() => {
    const s = document.getElementById('stage').getBoundingClientRect();
    const c = document.getElementById('cv').getBoundingClientRect();
    return { sw: s.width, sh: s.height, cw: c.width, ch: c.height, ratio: c.width / 480 };
  });
  ok(Math.abs(geo.cw / geo.ch - 480 / 648) < 0.01, `画布等比 ${(geo.cw / geo.ch).toFixed(4)} vs ${(480 / 648).toFixed(4)}`);
  ok(Math.abs(geo.cw / 480 - geo.ch / 648) < 0.01, '横纵缩放系数一致');

  const scales = [];
  for (const vp of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 780 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(vp);
    await page.waitForTimeout(160);
    const r = await page.evaluate(() => {
      const c = document.getElementById('cv').getBoundingClientRect();
      const s = document.getElementById('stage').getBoundingClientRect();
      return { cw: c.width, ch: c.height, sw: s.width, sh: s.height };
    });
    ok(Math.abs(r.cw / r.ch - 480 / 648) < 0.02, `视口 ${vp.width}×${vp.height} 等比`);
    ok(r.sw <= vp.width + 1 && r.sh <= vp.height + 1, `视口 ${vp.width}×${vp.height} 不溢出`);
    scales.push(r.cw / 480);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(200);

  sec('键盘：A≡← / D≡→ / W≡↑ / S≡↓');
  // 取当前选中食材的形态，用两套键各压一次，结果必须完全一致
  async function shapeNow() { return await page.evaluate(() => { const it = window.BENTO.selected(window.__BENTO__.st); return it ? [it.w, it.h, it.used] : null; }); }
  // 同一件软食材连按 W 与 ↑，各增宽 1 —— 证明两键做同一件事
  const wid = await page.evaluate(() => {
    const st = window.__BENTO__.st;
    const s2 = st.items.find(i => i.soft && !i.placed && i.h >= 3 && (i.quota - i.used) >= 2);
    if (s2) { window.BENTO.selQueue(st, s2.id); return s2.id; }
    return -1;
  });
  ok(wid >= 0, '找到可连压两次的软食材');
  if (wid >= 0) {
    const g = async () => await page.evaluate(id => { const i = window.BENTO.itemById(window.__BENTO__.st, id); return [i.w, i.h]; }, wid);
    const g0 = await g();
    await page.keyboard.press('KeyW'); await page.waitForTimeout(90);
    const g1 = await g();
    await page.keyboard.press('ArrowUp'); await page.waitForTimeout(90);
    const g2 = await g();
    ok(g1[0] === g0[0] + 1 && g1[1] === g0[1] - 1, `W 压扁生效 ${g0}→${g1}`);
    ok(g2[0] === g1[0] + 1 && g2[1] === g1[1] - 1, `↑ 压扁生效（≡ W）${g1}→${g2}`);
    ok(g2[0] === g0[0] + 2 && g2[1] === g0[1] - 2, 'W 与 ↑ 严格等价（同一件连压各 +1/−1）');
    ok(g2[0] + g2[1] === g0[0] + g0[1], '宽+高 不变量成立');
  }

  // S ≡ ↓：同一件食材连按两次，各减宽 1，证明两键做同一件事
  const sid = await page.evaluate(() => {
    const st = window.__BENTO__.st;
    const s2 = st.items.find(i => i.soft && !i.placed && i.w >= 3 && (i.quota - i.used) >= 2);
    if (s2) { window.BENTO.selQueue(st, s2.id); return s2.id; }
    return -1;
  });
  if (sid >= 0) {
    const w0 = await page.evaluate(id => window.BENTO.itemById(window.__BENTO__.st, id).w, sid);
    await page.keyboard.press('KeyS'); await page.waitForTimeout(90);
    const w1 = await page.evaluate(id => window.BENTO.itemById(window.__BENTO__.st, id).w, sid);
    await page.keyboard.press('ArrowDown'); await page.waitForTimeout(90);
    const w2 = await page.evaluate(id => window.BENTO.itemById(window.__BENTO__.st, id).w, sid);
    ok(w1 === w0 - 1, `S 压长生效 ${w0}→${w1}`);
    ok(w2 === w1 - 1, `↓ 压长生效（≡ S）${w1}→${w2}`);
    ok(w2 === w0 - 2, 'S 与 ↓ 严格等价（同一件连压各 −1）');
  } else { ok(false, '找不到可连压两次的软食材'); }

  // A ≡ ←  / D ≡ →
  await page.evaluate(() => { window.__BENTO__.cycle(1); });
  const q1 = await page.evaluate(() => window.__BENTO__.st.sel.id);
  await page.keyboard.press('KeyD'); await page.waitForTimeout(60);
  const q2 = await page.evaluate(() => window.__BENTO__.st.sel.id);
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(60);
  const q3 = await page.evaluate(() => window.__BENTO__.st.sel.id);
  ok(q1 !== q2, 'D 切换食材');
  ok(q2 !== q3, '→ 切换食材（≡ D）');
  // A 与 ← 同帧严格抵消（dispatchEvent 同帧按下）
  const cancel = await page.evaluate(() => {
    const st = window.__BENTO__.st;
    const id0 = st.sel.id, qi0 = st.queue.indexOf(id0);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', code: 'KeyD', bubbles: true }));
    return { qi0, qi1: st.queue.indexOf(st.sel.id) };
  });
  ok(cancel.qi0 === cancel.qi1, 'A + D 同帧严格抵消');

  sec('鼠标放置 / 队列点击');
  const placeOK = await page.evaluate(() => {
    const st = window.__BENTO__.st, R = window.BENTO_R, B = window.BENTO;
    if (!st.queue.length) return 'noqueue';
    B.selQueue(st, st.queue[0]);
    const it = B.selected(st);
    for (let y = 0; y <= st.rows - it.h; y++) for (let x = 0; x <= st.cols - it.w; x++) {
      if (B.canPlace(st, x, y, it.w, it.h, -1)) { B.placeAt(st, x, y); return 'ok'; }
    }
    return 'nofit';
  });
  ok(placeOK === 'ok', '逻辑放置成功');
  const cnt0 = await page.evaluate(() => window.__BENTO__.score().placed);
  ok(cnt0 >= 1, `已放 ${cnt0} 件`);

  // 真实点击画布
  const clicked = await page.evaluate(async () => {
    const st = window.__BENTO__.st, R = window.BENTO_R, B = window.BENTO;
    if (!st.queue.length) return 'noqueue';
    const it = B.itemById(st, st.queue[0]);
    B.selQueue(st, it.id);
    // 找一个合法落点
    let cell = null;
    for (let y = 0; y <= st.rows - it.h; y++) for (let x = 0; x <= st.cols - it.w; x++)
      if (B.canPlace(st, x, y, it.w, it.h, -1) && !cell) cell = { x, y };
    if (!cell) return 'nofit';
    const br = R.boardRect(st);
    const cv = document.getElementById('cv');
    const rect = cv.getBoundingClientRect();
    const sc = rect.width / R.W;
    const cx = rect.left + (br.x + (cell.x + 0.5) * R.CELL) * sc;
    const cy = rect.top + (br.y + (cell.y + 0.5) * R.CELL) * sc;
    cv.dispatchEvent(new PointerEvent('pointerdown', { clientX: cx, clientY: cy, bubbles: true, cancelable: true }));
    return it.placed ? 'ok' : 'fail';
  });
  ok(clicked === 'ok', '画布点击放置生效');

  sec('按钮 / 静音 / 重来');
  await page.click('#bFlat'); await page.waitForTimeout(80);
  ok(await page.evaluate(() => !!window.__BENTO__.st), '压扁按钮不崩');
  await page.click('#mute'); await page.waitForTimeout(80);
  ok(await page.evaluate(() => window.__BENTO__.save.mute === true), '静音已开');
  ok(await page.evaluate(() => localStorage.getItem('bento295v1') !== null), 'localStorage 已写');
  await page.click('#mute'); await page.waitForTimeout(80);
  ok(await page.evaluate(() => window.__BENTO__.save.mute === false), '静音已关');

  sec('整局：正解跑完 → 合盖 → 结算 → 解锁');
  const runRes = await page.evaluate(async () => {
    window.__BENTO__.startLevel(0);           // 重开，清掉前面测试点歪的占位
    const st = window.__BENTO__.st, B = window.BENTO;
    // 用正解装满
    for (const it of st.items) {
      if (it.placed) continue;
      B.selQueue(st, it.id);
      let g = 0;
      while (it.w !== it.solW && g++ < 6) { if (!B.tryPress(st, it.w < it.solW ? 'flat' : 'long')) break; }
      B.placeAt(st, it.solX, it.solY);
    }
    return { all: st.items.every(i => i.placed), lid: !!st.lid };
  });
  ok(runRes.all, '全部装满');
  ok(runRes.lid, '合盖动画已触发');
  await page.waitForTimeout(1600);
  ok(await page.evaluate(() => document.getElementById('ovResult').classList.contains('hide')) === false, '结算页已弹出');
  const res = await page.evaluate(() => ({
    stars: window.__BENTO__.score().stars,
    unlocked: window.__BENTO__.save.unlocked,
    best1: window.__BENTO__.save.best[0],
    rows: document.querySelectorAll('#rData tr').length,
    verse: document.getElementById('rVerse').textContent.length,
  }));
  ok(res.stars >= 1, `拿到星级 ${res.stars}`);
  ok(res.unlocked >= 2, `解锁到第 ${res.unlocked} 盒`);
  ok(res.best1 >= 1, '最佳已写入');
  ok(res.rows === 5, '结算数据表 5 行');
  ok(res.verse > 3, '收尾短句非空');

  await page.click('#rNext'); await page.waitForTimeout(400);
  ok(await page.evaluate(() => window.__BENTO__.li) === 1, '进入第 2 盒');
  ok(await page.evaluate(() => document.getElementById('ovResult').classList.contains('hide')), '结算页已关');

  sec('刷新后存档保留');
  await page.reload(); await page.waitForTimeout(600);
  const after = await page.evaluate(() => ({ u: window.__BENTO__.save.unlocked, b: window.__BENTO__.save.best[0] }));
  ok(after.u >= 2, `刷新后解锁保留 ${after.u}`);
  ok(after.b >= 1, '刷新后最佳保留');

  sec('性能（桌面）');
  const fpsDesk = await page.evaluate(() => new Promise(res => {
    let n = 0; const t0 = performance.now();
    (function l() { n++; if (performance.now() - t0 < 1500) requestAnimationFrame(l); else res(n / ((performance.now() - t0) / 1000)); })();
  }));
  console.log('  桌面 fps ≈ ' + fpsDesk.toFixed(1));
  ok(fpsDesk > 45, '桌面 >45fps');
  await ctx.close();

  /* ============ 移动端 ============ */
  sec('移动端 iPhone13 dpr=3');
  const mctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  });
  const mp = await mctx.newPage();
  const merrs = [];
  mp.on('pageerror', e => merrs.push(String(e)));
  await mp.goto(URL);
  await mp.waitForTimeout(600);
  await mp.click('#goPlay'); await mp.waitForTimeout(400);
  ok(merrs.length === 0, '移动端无报错: ' + merrs.slice(0, 2).join('|'));
  const backing = await mp.evaluate(() => { const c = document.getElementById('cv'); return c.width * c.height; });
  console.log('  移动端 backing px = ' + backing);
  ok(backing < 2.6e6, `backing 在预算内 ${backing}`);

  // 触摸放置
  const touched = await mp.evaluate(() => {
    const st = window.__BENTO__.st, R = window.BENTO_R, B = window.BENTO;
    if (!st.queue.length) return 'noqueue';
    const it = B.itemById(st, st.queue[0]); B.selQueue(st, it.id);
    let cell = null;
    for (let y = 0; y <= st.rows - it.h; y++) for (let x = 0; x <= st.cols - it.w; x++)
      if (B.canPlace(st, x, y, it.w, it.h, -1) && !cell) cell = { x, y };
    if (!cell) return 'nofit';
    const br = R.boardRect(st), cv = document.getElementById('cv'), rect = cv.getBoundingClientRect();
    const sc = rect.width / R.W;
    cv.dispatchEvent(new PointerEvent('pointerdown', {
      clientX: rect.left + (br.x + (cell.x + .5) * R.CELL) * sc,
      clientY: rect.top + (br.y + (cell.y + .5) * R.CELL) * sc,
      bubbles: true, cancelable: true, pointerType: 'touch',
    }));
    return it.placed ? 'ok' : 'fail';
  });
  ok(touched === 'ok', '移动端触摸放置生效');

  // 触摸按钮
  await mp.tap('#bFlat'); await mp.waitForTimeout(120);
  await mp.tap('#bLong'); await mp.waitForTimeout(120);
  ok(await mp.evaluate(() => !!window.__BENTO__.st), '移动端按钮可用');

  const fpsM = await mp.evaluate(() => new Promise(res => {
    let n = 0; const t0 = performance.now();
    (function l() { n++; if (performance.now() - t0 < 1500) requestAnimationFrame(l); else res(n / ((performance.now() - t0) / 1000)); })();
  }));
  console.log('  移动端 fps ≈ ' + fpsM.toFixed(1));
  ok(fpsM > 45, '移动端 >45fps');
  await mctx.close();

  await browser.close();
  console.log(`\n=== PROBE: ${pass} pass / ${fail} fail ===`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('PROBE ERROR', e); process.exit(1); });
