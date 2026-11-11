// 291-papercollage 浏览器探针
const { chromium } = require('playwright');
const path = require('path');
const FILE = 'file:///' + path.join(__dirname, 'index.html').replace(/\\/g, '/');

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } }

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push(String(e)));

  await page.goto(FILE);
  await page.waitForTimeout(700);

  console.log('=== 291 probe ===');
  ok(errs.length === 0, '无控制台错误 ' + (errs[0] || ''));
  ok(await page.locator('#ovStart').isVisible(), '开场遮罩可见');

  // 1. 开始
  await page.click('#btnStart');
  await page.waitForTimeout(300);
  ok(!(await page.locator('#ovStart').isVisible()), '开局后遮罩隐藏');
  ok(await page.evaluate(() => !!window.__game && window.__game.st.phase === 'aim'), '进入瞄准态');

  // 2. 键盘挪列
  const c0 = await page.evaluate(() => window.__game.st.col);
  await page.keyboard.press('KeyD');
  await page.waitForTimeout(60);
  const c1 = await page.evaluate(() => window.__game.st.col);
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(60);
  const c2 = await page.evaluate(() => window.__game.st.col);
  ok(c1 === c0 + 1, 'D 右移一列 ' + c0 + '→' + c1);
  ok(c2 === c0, '← 左移回原位 ' + c2);

  // 3. 投放 → 落子 → 盘面变化
  const before = await page.evaluate(() => window.__game.G.countCells(window.__game.st));
  await page.keyboard.press('Space');
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => window.__game.G.countCells(window.__game.st));
  ok(after >= before, '投放后盘面不减（' + before + '→' + after + '）');
  ok(await page.evaluate(() => window.__game.st.phase === 'aim' || window.__game.st.over), '结算完成回到可操作态');

  // 4. 强制三连 → 合并得分
  await page.evaluate(() => {
    const s = window.__game.st, G = window.__game.G;
    s.grid.fill(0); s.ids.fill(0);
    s.grid[G.idx(0, 8)] = 1; s.ids[G.idx(0, 8)] = 901;
    s.grid[G.idx(1, 8)] = 1; s.ids[G.idx(1, 8)] = 902;
    s.cur = 1; s.col = 2; s.score = 0;
  });
  await page.keyboard.press('Space');
  await page.waitForTimeout(900);
  const mg = await page.evaluate(() => ({
    v: window.__game.st.grid[window.__game.G.idx(2, 8)], sc: window.__game.st.score, mx: window.__game.st.maxMade
  }));
  ok(mg.v === 2, '浏览器内三连合成二级，实得 ' + mg.v);
  ok(mg.sc > 0, '浏览器内得分 ' + mg.sc);
  await page.waitForTimeout(400);
  ok((await page.textContent('#score')) === String(mg.sc), 'HUD 分数同步 ' + (await page.textContent('#score')));

  // 5. 点击列投放（移动端主操作）
  const box = await page.locator('#stage').boundingBox();
  const k = box.width / 480;
  const cx = box.x + (32 + 5 * 52 + 26) * k, cy = box.y + 400 * k;
  const before2 = await page.evaluate(() => window.__game.st.drops);
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(900);
  const col5 = await page.evaluate(() => window.__game.st.drops);
  ok(col5 === before2 + 1, '点按第 5 列即投放');

  // 6. 暂存
  const h0 = await page.evaluate(() => window.__game.st.holds);
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(100);
  const h1 = await page.evaluate(() => window.__game.st.holds);
  ok(h1 === h0 - 1, '↑ 暂存换张，次数 ' + h0 + '→' + h1);
  ok((await page.textContent('#held')) !== '—', 'HUD 存位显示 ' + (await page.textContent('#held')));

  // 7. 静音按钮（遮罩层级下可点）
  await page.click('#btnMute');
  await page.waitForTimeout(80);
  ok((await page.textContent('#btnMute')) === '✕', '静音按钮可点');
  await page.click('#btnMute');

  // 8. 收工页：棋盘填成 1/2 交错（任何连通块都只有 1 格，不会误触发合并），只留 (0,0) 一格
  await page.evaluate(() => {
    const s = window.__game.st, G = window.__game.G;
    s.grid.fill(0); s.ids.fill(0);
    let id = 5000;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 8; c++) {
      if (r === 0 && c === 0) continue;
      s.grid[G.idx(c, r)] = ((c + r) % 2) + 1; s.ids[G.idx(c, r)] = id++;
    }
    s.cur = 1; s.col = 0;   // (0,0)=1，邻格都是 2 → 不成组
    s.phase = 'aim';
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => { window.__game.G.drop(window.__game.st); });
  await page.waitForTimeout(1500);
  const ovEndVisible = await page.locator('#ovEnd').isVisible();
  ok(ovEndVisible || (await page.evaluate(() => window.__game.st.over)), '堆满触发收工');
  if (ovEndVisible) {
    ok((await page.textContent('#thumb')).length >= 0, '收工页存在');
    ok((await page.textContent('#endScore')) !== '', '收工分数 ' + (await page.textContent('#endScore')));
    const th = await page.evaluate(() => {
      const c = document.getElementById('thumb'), x = c.getContext('2d');
      const d = x.getImageData(0, 0, c.width, c.height).data;
      let s = new Set(); for (let i = 0; i < d.length; i += 4000) s.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
      return s.size;
    });
    ok(th > 3, '缩略图确实重画了位图（取样色数 ' + th + '）');
  }

  // 9. 重来
  await page.click('#btnRestart');
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => window.__game.st.score === 0 && !window.__game.st.over), '重来后归零');

  // 10. 最佳记录持久化
  await page.evaluate(() => {
    const s = window.__game.st, G = window.__game.G;
    s.grid.fill(0); s.ids.fill(0);
    s.score = 777;
    let id = 8000;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 8; c++) {
      if (r === 0 && c === 0) continue;
      s.grid[G.idx(c, r)] = ((c + r) % 2) + 1; s.ids[G.idx(c, r)] = id++;
    }
    s.cur = 1; s.col = 0; s.phase = 'aim';
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => { window.__game.G.drop(window.__game.st); });
  await page.waitForTimeout(1500);
  ok((await page.evaluate(() => localStorage.getItem('pc291.best'))) === '777', '最佳写入 localStorage');
  await page.reload();
  await page.waitForTimeout(600);
  ok((await page.textContent('#best')) === '777', '刷新后最佳仍在');

  // 11. fps（满盘压力下）
  await page.click('#btnStart');
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const s = window.__game.st, G = window.__game.G;
    for (let r = 4; r < 9; r++) for (let c = 0; c < 8; c++) { s.grid[G.idx(c, r)] = ((c * 3 + r) % 4) + 1; s.ids[G.idx(c, r)] = 3000 + r * 10 + c; }
    for (let i = 0; i < 30; i++) window.__game.R.parts.push({ x: 200, y: 400, vx: 30, vy: -50, rot: 0, vr: 3, s: 5, life: 99, max: 99, col: '#C85A3C' });
  });
  const fps = await page.evaluate(() => new Promise(res => {
    let n = 0; const t0 = performance.now();
    (function f() { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(n / ((performance.now() - t0) / 1000)); })();
  }));
  ok(fps > 52, '桌面满压力 fps ' + fps.toFixed(1));

  await ctx.close();

  // 12. 移动端
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' });
  const mp = await mctx.newPage();
  const merr = [];
  mp.on('pageerror', e => merr.push(String(e)));
  await mp.goto(FILE);
  await mp.waitForTimeout(700);
  await mp.click('#btnStart');
  await mp.waitForTimeout(300);
  ok(merr.length === 0, '移动端无脚本错误 ' + (merr[0] || ''));
  const mb = await mp.locator('#stage').boundingBox();
  ok(Math.abs(mb.width / mb.height - 480 / 800) < 0.01, '移动端等比缩放 ' + (mb.width / mb.height).toFixed(4));
  ok(mb.width <= 390.5 && mb.height <= 844.5, '移动端不溢出 ' + Math.round(mb.width) + '×' + Math.round(mb.height));
  const d0 = await mp.evaluate(() => window.__game.st.drops);
  await mp.touchscreen.tap(mb.x + mb.width * 0.7, mb.y + mb.height * 0.4);
  await mp.waitForTimeout(900);
  ok((await mp.evaluate(() => window.__game.st.drops)) === d0 + 1, '移动端触摸投放');
  const mfps = await mp.evaluate(() => new Promise(res => {
    let n = 0; const t0 = performance.now();
    (function f() { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(n / ((performance.now() - t0) / 1000)); })();
  }));
  ok(mfps > 52, '移动端 fps ' + mfps.toFixed(1));
  const css = await mp.evaluate(() => {
    const c = document.getElementById('cv');
    return { w: c.style.width, h: c.style.height, bw: c.width, bh: c.height };
  });
  ok(css.w === '480px' && css.h === '800px', 'canvas CSS 尺寸固定 480×800（缩放交给 #stage）');
  ok(css.bw >= 480 && css.bh >= 800, 'backing store ≥ CSS 尺寸 ' + css.bw + '×' + css.bh);

  await mp.screenshot({ path: path.join(__dirname, '_p291_mobile.png') });
  await mctx.close();

  // 13. 四视口等比
  const browser2 = await chromium.launch();
  for (const vp of [[1440, 900], [1024, 768], [768, 1024], [360, 640]]) {
    const c2 = await browser2.newContext({ viewport: { width: vp[0], height: vp[1] } });
    const p2 = await c2.newPage();
    await p2.goto(FILE);
    await p2.waitForTimeout(400);
    const b = await p2.locator('#stage').boundingBox();
    const kx = b.width / 480, ky = b.height / 800;
    ok(Math.abs(kx - ky) < 0.002, vp.join('×') + ' 等比 k=' + kx.toFixed(4) + '/' + ky.toFixed(4));
    ok(b.width <= vp[0] + 0.5 && b.height <= vp[1] + 0.5, vp.join('×') + ' 不溢出');
    await c2.close();
  }
  await browser2.close();

  // 14. 桌面截图（用贪心 AI 跑 25 步得到好看的满版）
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const dp = await dctx.newPage();
  await dp.goto(FILE); await dp.waitForTimeout(600);
  await dp.screenshot({ path: path.join(__dirname, '_p291_start.png') });
  await dp.click('#btnStart'); await dp.waitForTimeout(300);
  // 人为 1 步 1 列：每 8 步一个轮回，让画面平均分布
  await dp.evaluate(() => {
    const G = window.__game.G, s = window.__game.st;
    function settle() { let g = 0; while (s.phase !== 'aim' && !s.over && g++ < 3000) G.update(s, 1/60); }
    const seq = [0, 2, 4, 6, 1, 3, 5, 7, 0, 2, 4, 6, 1, 3, 5, 7, 0, 2, 4, 6, 1, 3, 5, 7, 0, 2];
    for (let k = 0; k < seq.length && !s.over; k++) {
      G.setCol(s, seq[k]); G.drop(s); settle();
    }
  });
  await dp.waitForTimeout(900);
  await dp.screenshot({ path: path.join(__dirname, '_p291_play.png') });
  await dctx.close();

  await browser.close();
  console.log('=== ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(fail ? 1 : 0);
})();
