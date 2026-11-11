/* 238 守塔 · 真机（Playwright Chromium）双端验证 + 截图 */
const { chromium, devices } = require('playwright');
const path = require('path');
const url = 'file://' + path.resolve(__dirname, 'index.html').split(path.sep).join('/');

let fail = 0;
function ok(c, m) { if (!c) { fail++; console.log('  ✗ ' + m); } }

async function hook(p) {
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });
  return errs;
}

async function cellCenter(p, cx, cy) {
  return await p.evaluate(([cx, cy]) => {
    const r = document.getElementById('board').getBoundingClientRect();
    const w = r.width / 13, h = r.height / 9;
    return { x: r.left + (cx + 0.5) * w, y: r.top + (cy + 0.5) * h };
  }, [cx, cy]);
}

async function buildSpots(p, n) {
  return await p.evaluate((n) => {
    const g = window.__GAME.g, out = [];
    for (const c of g.path) {
      for (const d of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const x = c.x + d[0], y = c.y + d[1];
        if (g.canPlace(x, y) && !out.some(o => o.x === x && o.y === y)) out.push({ x, y });
        if (out.length >= n) return out;
      }
    }
    return out;
  }, n);
}

(async () => {
  // ── 桌面端 ──
  const b = await chromium.launch({ headless: true });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 })).newPage();
  const errs = await hook(p);
  await p.goto(url);
  await p.waitForTimeout(500);

  let cs = await p.evaluate(() => {
    const c = document.getElementById('board');
    return { w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight };
  });
  ok(cs.w > 600 && cs.h > 400, '桌面 canvas 尺寸异常 ' + JSON.stringify(cs));
  await p.screenshot({ path: path.join(__dirname, '_s1_start.png') });

  await p.click('#btnStart');
  await p.waitForTimeout(300);
  ok(await p.evaluate(() => document.getElementById('startVeil').classList.contains('hide')), '开始后开场卡片没关');

  // 选箭塔 → 放 4 座
  await p.click('.tw[data-type="arrow"]');
  const spots = await buildSpots(p, 6);
  ok(spots.length >= 4, '找不到 4 个可建位');
  for (let i = 0; i < 3; i++) {
    const pt = await cellCenter(p, spots[i].x, spots[i].y);
    await p.mouse.move(pt.x, pt.y);
    await p.mouse.click(pt.x, pt.y);
    await p.waitForTimeout(80);
  }
  let st = await p.evaluate(() => window.__GAME.state());
  ok(st.towers >= 3, '真机点击没放下 3 座塔，towers=' + st.towers);
  ok(st.gold === 180 - 180, '金币扣除不对 gold=' + st.gold);
  await p.screenshot({ path: path.join(__dirname, '_s2_build.png') });

  // 提前召唤 + 打一波
  await p.click('#btnCall');
  await p.waitForTimeout(2500);
  st = await p.evaluate(() => window.__GAME.state());
  ok(st.wave === 1 && st.state === 'wave', '提前召唤没进第 1 波 ' + JSON.stringify(st));
  await p.waitForTimeout(4000);
  st = await p.evaluate(() => window.__GAME.state());
  ok(st.kills > 0, '打了 6 秒没有击杀 ' + JSON.stringify(st));
  await p.screenshot({ path: path.join(__dirname, '_s3_wave.png') });

  // 选中塔 → 升级
  const t0 = await p.evaluate(() => { const t = window.__GAME.g.towers[0]; return { x: t.cx, y: t.cy }; });
  const tp = await cellCenter(p, t0.x, t0.y);
  await p.mouse.click(tp.x, tp.y);
  await p.waitForTimeout(200);
  ok(!(await p.evaluate(() => document.getElementById('panel').classList.contains('hide'))), '点塔没弹出面板');
  const goldBefore = (await p.evaluate(() => window.__GAME.state())).gold;
  const upDisabled = await p.evaluate(() => document.getElementById('btnUp').disabled);
  if (!upDisabled) {
    await p.click('#btnUp');
    await p.waitForTimeout(200);
    const lv = await p.evaluate(() => window.__GAME.g.towers[0].lvl);
    ok(lv === 2, '升级后等级不是 2，lvl=' + lv);
    ok((await p.evaluate(() => window.__GAME.state())).gold < goldBefore, '升级没扣钱');
  }

  // 2 倍速 + 静音 + 长跑
  await p.click('#btnSpeed');
  ok((await p.textContent('#btnSpeed')).trim() === '2x', '倍速按钮没切到 2x');
  await p.click('#btnMute');
  await p.click('#btnMute');
  await p.waitForTimeout(6000);
  st = await p.evaluate(() => window.__GAME.state());
  ok(st.wave >= 1, '长跑后状态异常 ' + JSON.stringify(st));
  await p.screenshot({ path: path.join(__dirname, '_s4_late.png') });

  // 键盘选塔
  await p.keyboard.press('2');
  ok(await p.evaluate(() => document.querySelector('.tw[data-type="cannon"]').classList.contains('on')), '键盘 2 没选中炮塔');
  await p.keyboard.press('Escape');

  // 强制结算 → 覆盖 over 路径
  await p.evaluate(() => { const g = window.__GAME.g; g.lives = 1; });
  await p.waitForTimeout(20000);
  const over = await p.evaluate(() => ({
    hidden: document.getElementById('overVeil').classList.contains('hide'),
    st: window.__GAME.state(), best: localStorage.getItem('td_best_wave')
  }));
  ok(!over.hidden || over.st.state !== 'over', 'over 面板与状态不一致 ' + JSON.stringify(over));
  if (over.st.state === 'over') {
    ok(!over.hidden, '结算了但没弹面板');
    ok(over.best !== null, '结算没写 localStorage 最佳波次');
    await p.screenshot({ path: path.join(__dirname, '_s5_over.png') });
    await p.click('#btnRetry');
    await p.waitForTimeout(300);
    const re = await p.evaluate(() => window.__GAME.state());
    ok(re.wave === 0 && re.lives === 20 && re.towers === 0, '重开没归零 ' + JSON.stringify(re));
  }
  ok(errs.length === 0, '桌面端有报错：' + errs.join(' | '));
  await b.close();

  // ── 移动端 ──
  const m = await chromium.launch({ headless: true });
  const mp = await (await m.newContext({ ...devices['iPhone 12'] })).newPage();
  const merrs = await hook(mp);
  await mp.goto(url);
  await mp.waitForTimeout(500);
  const mcs = await mp.evaluate(() => {
    const c = document.getElementById('board');
    return { w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight, vw: innerWidth, vh: innerHeight };
  });
  ok(mcs.cw > 200 && mcs.cw <= mcs.vw, '移动端 canvas 宽度异常 ' + JSON.stringify(mcs));
  ok(mcs.ch <= mcs.vh, '移动端 canvas 高度溢出 ' + JSON.stringify(mcs));
  await mp.tap('#btnStart');
  await mp.waitForTimeout(200);
  await mp.tap('.tw[data-type="arrow"]');
  const msp = await buildSpots(mp, 3);
  for (let i = 0; i < 2; i++) {
    const pt = await cellCenter(mp, msp[i].x, msp[i].y);
    await mp.touchscreen.tap(pt.x, pt.y);
    await mp.waitForTimeout(120);
  }
  const mst = await mp.evaluate(() => window.__GAME.state());
  ok(mst.towers >= 2, '移动端触摸没放下塔 towers=' + mst.towers);
  await mp.tap('#btnCall');
  await mp.waitForTimeout(5000);
  const mst2 = await mp.evaluate(() => window.__GAME.state());
  ok(mst2.wave === 1, '移动端没进第 1 波');
  ok(mst2.kills > 0, '移动端没有击杀 ' + JSON.stringify(mst2));
  await mp.screenshot({ path: path.join(__dirname, '_s6_mobile.png') });
  ok(merrs.length === 0, '移动端有报错：' + merrs.join(' | '));
  await m.close();

  console.log(fail === 0 ? '\n真机双端验证：全部通过 ✅' : '\n真机验证失败 ' + fail + ' 项');
  process.exit(fail ? 1 : 0);
})();
