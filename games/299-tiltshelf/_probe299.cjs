/* 299-tiltshelf《归架 · 轻重》浏览器探针 */
const { chromium } = require('playwright');
const path = require('path');
const URL = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  x ' + m); } }
function sec(m) { console.log('- ' + m); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();

  /* ================= 桌面 ================= */
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(URL);
  await sleep(600);

  sec('启动 / 无报错');
  ok(errs.length === 0, '无 JS 报错: ' + errs.slice(0, 3).join(' | '));
  ok(await page.evaluate(() => !!window.SC299), '逻辑层 SC299');
  ok(await page.evaluate(() => !!window.SC299R), '渲染层 SC299R');
  ok(await page.evaluate(() => !!window.SC299A), '音频层 SC299A');
  ok(await page.evaluate(() => !!window.SC299UI), 'UI 层 SC299UI');
  ok(await page.locator('#start').isVisible(), '开始蒙层可见');

  sec('开始第一关');
  await page.click('#btnStart');
  await sleep(400);
  ok(!(await page.locator('#start').isVisible()), '开始蒙层已隐藏');
  ok(await page.locator('#tray .card').count() > 0, '队列卡片已渲染');
  {
    const s = await page.evaluate(() => {
      const st = window.SC299UI.state();
      return { n: st.items.length, q: st.queue.length, sh: st.shelves.length, mm: st.maxMoves };
    });
    ok(s.n > 0 && s.q === s.n, `开局 ${s.q}/${s.n} 件在队列`);
    ok(s.mm > s.n, `工时 ${s.mm} > 件数 ${s.n}`);
  }

  sec('画布 / 缩放');
  {
    const r = await page.evaluate(() => {
      const cv = document.getElementById('cv');
      return { w: cv.width, h: cv.height, cw: cv.clientWidth, ch: cv.clientHeight, dpr: window.devicePixelRatio };
    });
    ok(r.w >= r.cw * Math.min(2, r.dpr) - 2, `backing ${r.w} ≥ CSS ${r.cw} × dpr`);
    ok(r.ch > 200, `canvas CSS 高 ${r.ch}`);
  }

  sec('点击放置 / 再点撤下');
  {
    // 按 (s,c) 换算屏幕坐标（含板旋转）
    const posOf = (s, c) => page.evaluate(([s2, c2]) => {
      const R = window.SC299R, st = window.SC299UI.state(), cv = document.getElementById('cv');
      const L = R.layout(st), sh = st.shelves[s2];
      const a = sh.theta * Math.PI / 180;
      const px = L.x0 + sh.pivot * L.CW, y = L.ys[s2];
      const rx = (c2 + 0.5 - sh.pivot) * L.CW, ry = -L.itemH * 0.4;
      const lx = px + rx * Math.cos(a) - ry * Math.sin(a);
      const ly = y + rx * Math.sin(a) + ry * Math.cos(a);
      const b = cv.getBoundingClientRect();
      return { sx: b.left + lx * b.width / cv.clientWidth, sy: b.top + ly * b.height / cv.clientHeight };
    }, [s, c]);

    const before = await page.evaluate(() => window.SC299UI.state().moves);
    let geo = await posOf(0, 0);
    await page.mouse.click(geo.sx, geo.sy);
    await sleep(200);
    const after = await page.evaluate(() => window.SC299UI.state().moves);
    ok(after >= 1, `点击放下 moves ${before} → ${after}`);
    // 再点同一格（重新换算，因为板已经倾斜）撤下
    geo = await posOf(0, 0);
    await page.mouse.click(geo.sx, geo.sy);
    await sleep(200);
    const st3 = await page.evaluate(() => { const s = window.SC299UI.state(); return { m: s.moves, q: s.queue.length, n: s.items.length }; });
    ok(st3.q === st3.n, '撤下后回到队列');
    ok(st3.m === after, '撤下不消耗步数');
  }

  sec('键盘：WASD ≡ 方向键（严格等价）');
  {
    const keyTest = async (k1, k2, ds, dc) => {
      await page.evaluate(() => { const G = window.SC299, st = window.SC299UI.state(); G.setCursor(st, 0, 2); });
      await page.keyboard.press(k1);
      const a = await page.evaluate(() => { const c = window.SC299UI.state().cursor; return c.s + ',' + c.c; });
      await page.evaluate(() => { const G = window.SC299, st = window.SC299UI.state(); G.setCursor(st, 0, 2); });
      await page.keyboard.press(k2);
      const b = await page.evaluate(() => { const c = window.SC299UI.state().cursor; return c.s + ',' + c.c; });
      ok(a === b, `${k1} ≡ ${k2} (${a} vs ${b})`);
      void ds; void dc;
    };
    await page.evaluate(() => { window.SC299UI.startLevel(5); });   // 3 层，方便测上下
    await sleep(300);
    await page.evaluate(() => { const G = window.SC299, st = window.SC299UI.state(); G.setCursor(st, 1, 3); });
    await keyTest('ArrowLeft', 'KeyA', 0, -1);
    await keyTest('ArrowRight', 'KeyD', 0, 1);
    await keyTest('ArrowUp', 'KeyW', -1, 0);
    await keyTest('ArrowDown', 'KeyS', 1, 0);
    // 同帧抵消
    const r2 = await page.evaluate(() => {
      const G = window.SC299, st = window.SC299UI.state();
      G.setCursor(st, 1, 3);
      const before = st.cursor.c;
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft', bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', bubbles: true }));
      return { before, after: st.cursor.c };
    });
    ok(r2.before === r2.after, `同帧 ←+→ 抵消 (${r2.before} → ${r2.after})`);
  }

  sec('换货 / 撤下按钮');
  {
    await page.evaluate(() => window.SC299UI.startLevel(3));
    await sleep(300);
    const h0 = await page.evaluate(() => window.SC299UI.state().hold);
    await page.click('#btnNextItem');
    await sleep(120);
    const h1 = await page.evaluate(() => window.SC299UI.state().hold);
    ok(h1 !== h0, `换货 ${h0} → ${h1}`);
    await page.click('#btnPrev');
    await sleep(120);
    ok(await page.evaluate(() => window.SC299UI.state().hold) === h0, '换货可回退');
    // 队列卡片点击
    const n = await page.locator('#tray .card').count();
    if (n >= 2) { await page.locator('#tray .card').nth(1).click(); await sleep(120); ok(await page.evaluate(() => window.SC299UI.state().hold) === 1, '点卡片切手持'); }
    else ok(true, '卡片不足跳过');
    // 放一件再撤
    await page.evaluate(() => { const G = window.SC299, st = window.SC299UI.state(); G.place(st, 0, 0); });
    await sleep(150);
    await page.click('#btnUndo');
    await sleep(150);
    ok(await page.evaluate(() => window.SC299UI.state().queue.length) === await page.evaluate(() => window.SC299UI.state().items.length), '撤下一件回队列');
  }

  sec('四视口等比缩放');
  {
    for (const vp of [[1440, 900], [1024, 768], [820, 620], [390, 844]]) {
      await page.setViewportSize({ width: vp[0], height: vp[1] });
      await sleep(260);
      const m = await page.evaluate(() => {
        const s = document.getElementById('stage').getBoundingClientRect();
        const cv = document.getElementById('cv').getBoundingClientRect();
        return { w: s.width, h: s.height, cw: cv.width, ch: cv.height, ratio: s.width / s.height };
      });
      ok(Math.abs(m.ratio - 900 / 660) < 0.02, `${vp[0]}x${vp[1]} stage 比例 ${m.ratio.toFixed(3)}`);
      ok(m.w <= vp[0] + 1 && m.h <= vp[1] + 1, `${vp[0]}x${vp[1]} 不溢出 (${m.w.toFixed(0)}x${m.h.toFixed(0)})`);
      ok(m.cw > 0 && m.ch > 0, `${vp[0]}x${vp[1]} canvas 有尺寸`);
    }
    await page.setViewportSize({ width: 1280, height: 960 });
    await sleep(260);
  }

  sec('完整通关 → 结算 → 解锁 → 存档');
  {
    await page.evaluate(() => { localStorage.removeItem('sc299.v1'); });
    await page.reload(); await sleep(500);
    await page.click('#btnStart'); await sleep(400);
    const win = await page.evaluate(async () => {
      const G = window.SC299, UI = window.SC299UI, st = UI.state();
      // 按 plan 放置（上帝视角强策略）
      let guard = 0;
      while (st.queue.length && guard++ < 60) {
        let did = false;
        for (let qi = 0; qi < st.queue.length; qi++) {
          const id = st.queue[qi], p = st.plan[id];
          if (p && !st.shelves[p.s].cells[p.c]) { G.setHold(st, qi); UI.doCell(p.s, p.c); did = true; break; }
        }
        if (!did) break;
        await new Promise(r => setTimeout(r, 40));
      }
      return { placed: G.placedCount(st), total: st.items.length, moves: st.moves };
    });
    ok(win.placed === win.total, `全部放上板 ${win.placed}/${win.total}`);
    await sleep(2600);   // 稳定 1.2s + 演出 1.15s
    ok(await page.locator('#result').isVisible(), '结算弹窗出现');
    const res = await page.evaluate(() => ({
      title: document.getElementById('resTitle').textContent,
      star: document.getElementById('resStar').textContent,
      score: window.SC299UI.state().finalScore,
      win: window.SC299UI.state().win,
      unlocked: window.SC299UI.save().unlocked
    }));
    ok(res.win === true, 'win = true');
    ok(res.score > 0, `得分 ${res.score}`);
    ok(res.star.length === 3, `星级显示 ${res.star}`);
    ok(res.unlocked >= 1, `解锁到第 ${res.unlocked + 1} 关`);
    // 刷新保留
    await page.reload(); await sleep(500);
    const keep = await page.evaluate(() => { const s = window.SC299UI.save(); return { u: s.unlocked, b: s.best[0] || 0 }; });
    ok(keep.u >= 1, `刷新后解锁保留 ${keep.u}`);
    ok(keep.b > 0, `刷新后最佳分保留 ${keep.b}`);
  }

  sec('选关 / 静音 / 竖屏 toast');
  {
    await page.click('#btnStart'); await sleep(300);
    await page.click('#btnLevels2'); await sleep(300);
    ok(await page.locator('#levels').isVisible(), '选关蒙层可见');
    ok(await page.locator('#lvGrid .lvCard').count() === 8, '8 个关卡卡片');
    const dis = await page.locator('#lvGrid .lvCard[disabled]').count();
    ok(dis < 8, `已解锁 ${8 - dis} 关`);
    await page.click('#lvBack'); await sleep(250);
    ok(await page.locator('#start').isVisible(), '返回开始页');
    // 静音
    await page.click('#btnStart'); await sleep(300);
    const m0 = await page.evaluate(() => window.SC299UI.save().muted);
    await page.click('#mute'); await sleep(150);
    const m1 = await page.evaluate(() => window.SC299UI.save().muted);
    ok(m0 !== m1, `静音切换 ${m0} → ${m1}`);
    await page.reload(); await sleep(450);
    ok(await page.evaluate(() => window.SC299UI.save().muted) === m1, '静音持久化');
    // 竖屏 toast 可关
    await page.setViewportSize({ width: 420, height: 900 }); await sleep(350);
    ok(await page.locator('#portrait').isVisible(), '竖屏提示出现');
    await page.click('#portraitClose'); await sleep(200);
    ok(!(await page.locator('#portrait').isVisible()), '竖屏提示可关闭');
    await page.setViewportSize({ width: 1280, height: 960 }); await sleep(250);
  }

  sec('桌面帧率');
  {
    await page.evaluate(() => window.SC299UI.startLevel(7));
    await sleep(700);
    const fps = await page.evaluate(() => new Promise(res => {
      let n = 0; const t0 = performance.now();
      (function loop() { n++; if (performance.now() - t0 < 1500) requestAnimationFrame(loop); else res(n / ((performance.now() - t0) / 1000)); })();
    }));
    ok(fps > 50, `桌面 ${fps.toFixed(1)} fps`);
  }
  await ctx.close();

  /* ================= 移动端 ================= */
  const mctx = await browser.newContext({
    viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
  });
  const mp = await mctx.newPage();
  const merrs = [];
  mp.on('pageerror', e => merrs.push(String(e)));
  await mp.goto(URL);
  await sleep(700);
  sec('移动端');
  ok(merrs.length === 0, '移动端无报错: ' + merrs.slice(0, 2).join(' | '));
  await mp.click('#btnStart'); await sleep(500);
  ok(await mp.locator('#tray .card').count() > 0, '移动端队列已渲染');
  {
    const box = await mp.locator('#cv').boundingBox();
    const pt = await mp.evaluate(() => {
      const R = window.SC299R, st = window.SC299UI.state();
      const L = R.layout(st); return { x: L.x0 + 1.5 * L.CW, y: L.ys[0] - L.itemH * 0.4, ch: document.getElementById('cv').clientHeight, cw: document.getElementById('cv').clientWidth };
    });
    const sx = box.x + pt.x * box.width / pt.cw, sy = box.y + pt.y * box.height / pt.ch;
    await mp.touchscreen.tap(sx, sy);
    await sleep(250);
    ok(await mp.evaluate(() => window.SC299UI.state().moves) >= 1, '触摸可放置');
  }
  {
    const fps = await mp.evaluate(() => new Promise(res => {
      let n = 0; const t0 = performance.now();
      (function loop() { n++; if (performance.now() - t0 < 1500) requestAnimationFrame(loop); else res(n / ((performance.now() - t0) / 1000)); })();
    }));
    ok(fps > 50, `移动端 dpr=3 ${fps.toFixed(1)} fps`);
  }
  {
    const ui = await mp.evaluate(() => {
      const b = document.getElementById('btns').getBoundingClientRect();
      const t = document.getElementById('tray').getBoundingClientRect();
      return { bh: b.height, th: t.height, ph: document.getElementById('panel').getBoundingClientRect().height };
    });
    ok(ui.bh >= 22 && ui.bh <= 70, `按钮带屏幕高 ${ui.bh.toFixed(0)}px`);
    ok(ui.ph >= 90 && ui.ph <= 220, `面板屏幕高 ${ui.ph.toFixed(0)}px`);
  }
  await mp.screenshot({ path: '_p299_mobile.png' });

  await browser.close();
  console.log('\n' + (fail === 0 ? '[OK] 全部通过' : '[FAIL]') + `：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('PROBE ERROR', e); process.exit(2); });
