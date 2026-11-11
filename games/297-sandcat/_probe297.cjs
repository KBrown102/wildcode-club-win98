/* 297-sandcat《落沙 · 引猫夜》浏览器探针 v2
 * 覆盖：目录结构 / 四视口等比 / 点一下=一格 / 按住=连倒 / 过关演出延迟 / 音频层 / 移动端 / 性能
 */
const { chromium } = require('playwright');
const path = require('path');
const URL = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  x ' + m); } }
function sec(m) { console.log('- ' + m); }
/* 可选音频文件在本地 file:// 下必然 404，属预期，不算报错 */
const isNoise = s => /ERR_FILE_NOT_FOUND|Failed to load resource|net::ERR_/.test(s);

const sumSand = st => 'let n=0; for (const v of window.SC297.st.sand) n += v; return n;';

(async () => {
  const browser = await chromium.launch();

  /* ================= 桌面 ================= */
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => { if (!isNoise(String(e))) errs.push(String(e)); });
  page.on('console', m => { if (m.type() === 'error' && !isNoise(m.text())) errs.push(m.text()); });
  await page.goto(URL);
  await page.waitForTimeout(700);

  sec('启动 / 无报错 / 目录结构');
  ok(errs.length === 0, '无 JS 报错: ' + errs.slice(0, 3).join(' | '));
  ok(await page.evaluate(() => !!window.SC297), 'SC297 已暴露');
  ok(await page.evaluate(() => !!window.SANDCAT && !!window.SANDR && !!window.SANDA), '逻辑 + 渲染 + 音频 三层已加载');
  ok(await page.evaluate(() => document.scripts.length) === 4, '4 个脚本（game/render/audio/ui）');
  /* file:// 下读不到外部样式表的 cssRules（同源策略），改验「样式确实生效」 */
  const sheetOk = await page.evaluate(() => {
    const st = getComputedStyle(document.getElementById('stage'));
    const mk = getComputedStyle(document.getElementById('mask'));
    return { w: st.width, h: st.height, pos: mk.position, sw: document.styleSheets.length };
  });
  ok(sheetOk.w === '840px' && sheetOk.h === '550px', `外部样式表已生效 (${sheetOk.w}x${sheetOk.h})`);
  ok(sheetOk.pos === 'absolute' && sheetOk.sw >= 1, '遮罩样式来自外部表');
  ok(!(await page.evaluate(() => document.getElementById('mask').classList.contains('hide'))), '启动遮罩可见');
  ok(await page.evaluate(() => document.getElementById('cv').width > 0), 'canvas 有尺寸');

  await page.click('#bGo');
  await page.waitForTimeout(500);
  ok(await page.evaluate(() => document.getElementById('mask').classList.contains('hide')), '开始后遮罩隐藏');
  ok(await page.evaluate(() => !!window.SC297.st), '状态已建立');

  sec('HUD / 初始数据');
  ok(await page.evaluate(() => document.getElementById('hLv').textContent) === '1', '关卡显示 1');
  const hc = await page.evaluate(() => document.getElementById('hCat').textContent);
  ok(/^0\/\d+$/.test(hc), '猫到家 0/N (' + hc + ')');
  const hs = await page.evaluate(() => parseInt(document.getElementById('hSand').textContent, 10));
  ok(hs > 0, '沙余量 > 0 (' + hs + ')');

  /* ---------- 等比缩放：四视口 ---------- */
  sec('四视口等比缩放 + 底部操作带恒定');
  const vps = [[1280, 900], [1024, 700], [820, 560], [700, 420]];
  for (const [vw, vh] of vps) {
    await page.setViewportSize({ width: vw, height: vh });
    await page.waitForTimeout(240);
    const r = await page.evaluate(() => {
      const cv = document.getElementById('cv'), w = document.getElementById('stageWrap');
      const cr = cv.getBoundingClientRect(), wr = w.getBoundingClientRect();
      const bar = document.getElementById('bar').getBoundingClientRect();
      const sc = parseFloat(getComputedStyle(document.getElementById('stage')).transform.split('(')[1]);
      return { cw: cr.width, ch: cr.height, ww: wr.width, wh: wr.height, sc, bh: bar.height, pad: window.SC297.pad, ar: cr.width / cr.height };
    });
    ok(Math.abs(r.ww - r.cw) < 2.5 && Math.abs(r.wh - r.ch) < 2.5, `${vw}x${vh} 外套与画布等比 (${r.ww.toFixed(1)}x${r.wh.toFixed(1)} vs ${r.cw.toFixed(1)}x${r.ch.toFixed(1)})`);
    ok(Math.abs(r.ar - 840 / 550) < 0.02, `${vw}x${vh} 画幅比例不变 (${r.ar.toFixed(3)})`);
    ok(r.cw <= vw + 1 && r.ch <= vh + 1, `${vw}x${vh} 不溢出视口`);
    ok(r.bh >= 44 && r.bh <= 84, `${vw}x${vh} 操作带物理高度恒定 (${r.bh.toFixed(1)}px)`);
    ok(r.pad > 40, `${vw}x${vh} PAD 逻辑值合理 (${r.pad})`);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(260);

  async function fresh(lv) {
    await page.evaluate(l => window.SC297.start(l), lv || 0);
    await page.waitForTimeout(320);
  }
  const sandSum = () => page.evaluate(() => { let n = 0; for (const v of window.SC297.st.sand) n += v; return n; });

  /* ---------- 手感：点一下 = 一格 ---------- */
  sec('手感：点一下 = 落一格');
  await fresh(0);
  await page.evaluate(() => { const s = window.SC297.st; s.sandLeft = 90; s.sandMax = 90; s.sandBase = 90; });
  const box = await page.evaluate(() => {
    const r = document.getElementById('cv').getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
  const t0 = await sandSum();
  await page.mouse.click(box.x + box.w * 0.32, box.y + box.h * 0.45);
  await page.waitForTimeout(160);
  const t1 = await sandSum();
  ok(t1 - t0 === 1, `点一下落且只落一格 (${t0} -> ${t1})`);
  for (let i = 0; i < 3; i++) { await page.mouse.click(box.x + box.w * 0.32, box.y + box.h * 0.45); await page.waitForTimeout(90); }
  await page.waitForTimeout(150);
  const t2 = await sandSum();
  ok(t2 - t1 === 3, `连点三下 = 三格 (${t1} -> ${t2})`);

  sec('手感：按住 = 连续落沙');
  await fresh(0);
  await page.evaluate(() => { const s = window.SC297.st; s.sandLeft = 200; s.sandMax = 200; s.sandBase = 200; });
  const h0 = await sandSum();
  await page.mouse.move(box.x + box.w * 0.32, box.y + box.h * 0.45);
  await page.mouse.down();
  await page.waitForTimeout(1100);
  await page.mouse.up();
  await page.waitForTimeout(260);
  const h1 = await sandSum();
  ok(h1 - h0 >= 5, `按住 1.1s 连续落沙 ≥5 格 (${h0} -> ${h1})`);
  await page.waitForTimeout(420);
  const h2 = await sandSum();
  ok(h2 === h1, `松手即停 (${h1} -> ${h2})`);

  /* ---------- 键盘等价 ---------- */
  sec('键盘');
  await fresh(0);
  async function cur() { return page.evaluate(() => window.SC297.st.cursor); }
  async function setCur(v) { await page.evaluate(v => { window.SC297.st.cursor = v; }, v); }
  await setCur(10);
  await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(60);
  const a1 = await cur();
  await setCur(10);
  await page.keyboard.press('KeyA'); await page.waitForTimeout(60);
  const a2 = await cur();
  ok(a1 === a2 && a1 === 9, `A ≡ ← (${a2} vs ${a1})`);
  await setCur(10);
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(60);
  const b1 = await cur();
  await setCur(10);
  await page.keyboard.press('KeyD'); await page.waitForTimeout(60);
  const b2 = await cur();
  ok(b1 === b2 && b1 === 11, `D ≡ → (${b2} vs ${b1})`);

  async function pourTest(keyCode) {
    await fresh(0);
    await page.evaluate(() => { const s = window.SC297.st; s.sandLeft = 60; s.sandMax = 60; s.sandBase = 60; });
    const before = await sandSum();
    await page.keyboard.down(keyCode); await page.waitForTimeout(420); await page.keyboard.up(keyCode);
    await page.waitForTimeout(600);
    return (await sandSum()) - before;
  }
  const pDown = await pourTest('ArrowDown');
  const pS = await pourTest('KeyS');
  const pSp = await pourTest('Space');
  ok(pDown > 0 && pS > 0 && pSp > 0, `三种落沙键都能落沙 (${pDown}/${pS}/${pSp})`);
  ok(Math.abs(pDown - pS) <= 2 && Math.abs(pDown - pSp) <= 2, `↓ ≡ S ≡ 空格 等价 (${pDown}/${pS}/${pSp})`);

  async function shovelTest(keyCode) {
    await fresh(0);
    await page.evaluate(() => {
      const s = window.SC297.st;
      s.sandLeft = 60; s.sandMax = 60; s.sandBase = 60;
      for (let c = 0; c < s.base.length; c++) s.sand[c] = 0;
      s.sand[12] = 14; s.sand[13] = 13; s.sand[14] = 12; s.sand[15] = 11; s.sand[16] = 10;
      s.cursor = 13;
    });
    await page.waitForTimeout(140);
    const before = await sandSum();
    await page.keyboard.down(keyCode); await page.waitForTimeout(420); await page.keyboard.up(keyCode);
    await page.waitForTimeout(320);
    return before - (await sandSum());
  }
  const sUp = await shovelTest('ArrowUp');
  const sW = await shovelTest('KeyW');
  ok(sUp > 0 && sW > 0, `↑/W 都能铲沙 (${sUp}/${sW})`);
  ok(Math.abs(sUp - sW) <= 2, `↑ ≡ W 等价 (${sUp}/${sW})`);

  /* ---------- 底部带不抢光标 ---------- */
  await fresh(0);
  await page.evaluate(() => { window.SC297.st.cursor = 15; });
  await page.mouse.move(box.x + box.w * 0.30, box.y + box.h * 0.96);
  await page.mouse.down(); await page.waitForTimeout(150); await page.mouse.up();
  ok(await page.evaluate(() => window.SC297.st.cursor) === 15, '底部人行道带不抢光标');

  /* ---------- 音频层 ---------- */
  sec('音频层（合成音 + 可替换文件槽位）');
  const au = await page.evaluate(() => {
    const S = window.SANDA;
    if (!S) return null;
    const names = ['tap', 'land', 'shovel', 'lamp', 'meow', 'home', 'win', 'ui'];
    let threw = null;
    try { names.forEach(n => S.sfx(n, 1)); } catch (e) { threw = String(e); }
    let muteThrew = null;
    try { S.setMuted(true); S.setMuted(false); } catch (e) { muteThrew = String(e); }
    let unlockThrew = null;
    try { S.unlock(); } catch (e) { unlockThrew = String(e); }
    return {
      slots: Object.keys(S.FILES || {}).length,
      hasBgm: !!(S.FILES && S.FILES.bgm),
      threw, muteThrew, unlockThrew,
      muted: S.isMuted()
    };
  });
  ok(!!au, 'SANDA 音频层已加载');
  ok(au.slots === 8, `8 个可替换音频槽位 (${au.slots})`);
  ok(au.hasBgm, '含 bgm 槽位');
  ok(!au.threw, '全部音效可播放（合成音）: ' + au.threw);
  ok(!au.muteThrew && !au.unlockThrew, '静音 / 解锁不报错');
  ok(au.muted === false, '默认非静音');

  /* ---------- 按钮 ---------- */
  sec('按钮');
  await fresh(0);
  await page.click('#bShovM');
  ok(await page.evaluate(() => document.getElementById('bAct').textContent.indexOf('铲') >= 0), '切到铲沙模式');
  await page.click('#bPourM');
  ok(await page.evaluate(() => document.getElementById('bAct').textContent.indexOf('落') >= 0), '切回落沙模式');
  const m0 = await page.evaluate(() => localStorage.getItem('sandcat.mute.v1'));
  await page.click('#bMute'); await page.waitForTimeout(90);
  const m1 = await page.evaluate(() => localStorage.getItem('sandcat.mute.v1'));
  ok(m0 !== m1, '静音可切换并持久化');
  await page.click('#bMute'); await page.waitForTimeout(90);
  await page.evaluate(() => { window.SC297.st.cursor = 20; });
  await page.click('#bLeft'); ok(await page.evaluate(() => window.SC297.st.cursor) === 19, '◀ 左移');
  await page.click('#bRight'); await page.click('#bRight');
  ok(await page.evaluate(() => window.SC297.st.cursor) === 21, '▶ 右移');
  await page.click('#bReset'); await page.waitForTimeout(320);
  ok(await sandSum() === 0, '重来清空沙');

  /* ---------- 过关演出：先冻手 → 延迟 → 再弹窗 ---------- */
  sec('过关演出（冻结输入 → 逐盏点灯 → 弹窗，文案每关不同）');
  await fresh(0);
  await page.evaluate(() => {
    const S = window.SC297, G = S.G, st = S.st;
    const plan = G.planSolve(st, 460);
    for (const c of plan.pours) G.pourInstant(st, c);
  });
  await page.waitForFunction(() => window.SC297.st && window.SC297.st.over, null, { timeout: 25000 });
  const c1 = await page.evaluate(() => ({
    mask: !document.getElementById('mask').classList.contains('hide'),
    dead: window.SC297.dead, clearing: window.SC297.clearing, lit: window.SC297.st.litCount
  }));
  ok(c1.mask === false, '过关瞬间不立刻弹窗（先演出）');
  ok(c1.dead === true && c1.clearing === true, '过关即冻结输入');
  await page.waitForTimeout(400);
  const c2 = await page.evaluate(() => window.SC297.st.litCount);
  ok(c2 >= c1.lit, `演出中地灯逐盏亮起 (${c1.lit} -> ${c2})`);
  await page.waitForFunction(() => !document.getElementById('mask').classList.contains('hide'), null, { timeout: 9000 });
  const res = await page.evaluate(() => {
    const c = document.getElementById('card');
    return {
      sub: (c.querySelector('.sub') || {}).textContent || '',
      end: ((c.querySelector('.end') || {}).textContent || '').length,
      sc: parseInt((c.querySelector('.sc') || {}).textContent || '0', 10),
      stars: c.querySelectorAll('.stars b').length,
      finalScore: window.SC297.st.finalScore
    };
  });
  const wantT = await page.evaluate(() => window.SANDCAT.clearText(0).t);
  ok(res.sub === wantT, `弹窗标题用本关专属文案 (${res.sub})`);
  ok(res.end > 8, '弹窗有一段专属描述');
  ok(res.sc > 0 && res.sc === res.finalScore, `分数 = 过关冻结分 (${res.sc})`);
  ok(res.stars >= 1, '至少一星');
  ok(await page.evaluate(() => localStorage.getItem('sandcat.unlock.v1')) === '2', '解锁第 2 关');
  ok(await page.evaluate(() => !!localStorage.getItem('sandcat.best.v1')), '最佳分已存');
  await page.click('#bNext'); await page.waitForTimeout(520);
  ok(await page.evaluate(() => document.getElementById('hLv').textContent) === '2', '进入第 2 关');
  const uniq = await page.evaluate(() => {
    const t = window.SANDCAT.CLEAR_TEXT;
    const a = t.map(x => x.t).join('|'), b = t.map(x => x.d).join('|');
    return { n: t.length, u1: new Set(t.map(x => x.t)).size, u2: new Set(t.map(x => x.d)).size };
  });
  ok(uniq.n === 8 && uniq.u1 === 8 && uniq.u2 === 8, '八夜文案两两不同');

  /* ---------- 选关 ---------- */
  await page.reload(); await page.waitForTimeout(700);
  ok(await page.evaluate(() => localStorage.getItem('sandcat.unlock.v1')) === '2', '刷新后解锁保留');
  await page.click('#bLv2'); await page.waitForTimeout(260);
  ok(await page.evaluate(() => document.querySelectorAll('#lvGrid .lvcell').length) === 8, '选关 8 格');
  ok(await page.evaluate(() => document.querySelectorAll('#lvGrid .lvcell.lock').length) === 6, '锁定 6 关');

  /* ---------- 性能 ---------- */
  sec('性能（满负载 60fps）');
  await page.click('#bClose'); await page.waitForTimeout(240);
  await page.click('#bGo'); await page.waitForTimeout(420);
  await page.evaluate(() => {
    const st = window.SC297.st;
    st.sandLeft = 4000; st.sandMax = 4000; st.sandBase = 4000;
    st.pouring = true;
  });
  await page.waitForTimeout(1200);
  const fps = await page.evaluate(() => new Promise(res => {
    let n = 0; const t0 = performance.now();
    function f() { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(n / ((performance.now() - t0) / 1000)); }
    requestAnimationFrame(f);
  }));
  ok(fps > 50, `桌面满负载 fps = ${fps.toFixed(1)}`);
  await page.evaluate(() => { window.SC297.st.pouring = false; });

  /* ================= 移动端 ================= */
  sec('移动端（iPhone 13, dpr=3）');
  const mctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3,
    isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
  });
  const mp = await mctx.newPage();
  const merrs = [];
  mp.on('pageerror', e => { if (!isNoise(String(e))) merrs.push(String(e)); });
  mp.on('console', m => { if (m.type() === 'error' && !isNoise(m.text())) merrs.push(m.text()); });
  await mp.goto(URL);
  await mp.waitForTimeout(700);
  ok(await mp.evaluate(() => getComputedStyle(document.getElementById('portrait')).display !== 'none'), '竖屏给出软提示');
  await mp.click('#portrait'); await mp.waitForTimeout(160);
  ok(await mp.evaluate(() => getComputedStyle(document.getElementById('portrait')).display === 'none'), '软提示可关闭（不硬挡）');
  ok(merrs.length === 0, '移动端无 JS 报错: ' + merrs.slice(0, 2).join(' | '));
  await mp.click('#bGo'); await mp.waitForTimeout(420);
  ok(await mp.evaluate(() => !!window.SC297.st), '移动端状态建立');
  const mr = await mp.evaluate(() => {
    const cv = document.getElementById('cv'), r = cv.getBoundingClientRect();
    return { w: r.width, h: r.height, dpr: cv.width / 840 };
  });
  ok(mr.w <= 391 && mr.h <= 845, `移动端不溢出 (${mr.w.toFixed(0)}x${mr.h.toFixed(0)})`);
  ok(mr.dpr <= 2.25, `backing store 受限 (${mr.dpr.toFixed(2)})`);
  ok(mr.w > 200, `移动端画布够大 (${mr.w.toFixed(0)}px)`);

  /* 触摸点一下 = 一格 */
  const mb = await mp.evaluate(() => { const r = document.getElementById('cv').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  const mSum = () => mp.evaluate(() => { let n = 0; for (const v of window.SC297.st.sand) n += v; return n; });
  await mp.evaluate(() => { const s = window.SC297.st; s.sandLeft = 200; s.sandMax = 200; s.sandBase = 200; });
  const mt0 = await mSum();
  await mp.touchscreen.tap(mb.x + mb.w * 0.5, mb.y + mb.h * 0.45);
  await mp.waitForTimeout(200);
  const mt1 = await mSum();
  ok(mt1 - mt0 === 1, `移动端点一下 = 一格 (${mt0} -> ${mt1})`);

  /* 触摸按住 = 连倒 */
  await mp.evaluate(() => {
    const cv = document.getElementById('cv'), r = cv.getBoundingClientRect();
    cv.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + r.width * 0.5, clientY: r.top + r.height * 0.45, bubbles: true, pointerId: 1, pointerType: 'touch' }));
  });
  await mp.waitForTimeout(900);
  await mp.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', { clientX: 0, clientY: 0, bubbles: true, pointerId: 1 })));
  await mp.waitForTimeout(320);
  const mt2 = await mSum();
  ok(mt2 - mt1 >= 4, `移动端按住连倒 ≥4 格 (${mt1} -> ${mt2})`);

  /* 触控命中区 */
  const hit = await mp.evaluate(() => {
    const b = document.getElementById('bAct').getBoundingClientRect();
    const l = document.getElementById('bLeft').getBoundingClientRect();
    const fs = parseFloat(getComputedStyle(document.getElementById('hSand')).fontSize);
    const sc = parseFloat(getComputedStyle(document.getElementById('stage')).transform.split('(')[1]);
    return { bw: b.width, bh: b.height, lw: l.width, lh: l.height, fs: fs * sc, sc };
  });
  ok(hit.bh >= 40 && hit.lh >= 40 && hit.lw >= 40, `按钮触控区 ≥40px (${hit.bh.toFixed(0)}/${hit.lh.toFixed(0)}/${hit.lw.toFixed(0)})`);
  ok(hit.fs >= 13, `HUD 字号物理大小够看 (${hit.fs.toFixed(1)}px)`);

  await mp.evaluate(() => { const s = window.SC297.st; s.sandLeft = 3000; s.sandMax = 3000; s.pouring = true; });
  await mp.waitForTimeout(900);
  const mfps = await mp.evaluate(() => new Promise(res => {
    let n = 0; const t0 = performance.now();
    function f() { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(n / ((performance.now() - t0) / 1000)); }
    requestAnimationFrame(f);
  }));
  ok(mfps > 45, `移动端满负载 fps = ${mfps.toFixed(1)}`);

  /* 横屏 */
  await mp.setViewportSize({ width: 844, height: 390 });
  await mp.waitForTimeout(420);
  const lr = await mp.evaluate(() => {
    const r = document.getElementById('cv').getBoundingClientRect();
    return { w: r.width, h: r.height, pad: window.SC297.pad, bar: document.getElementById('bar').getBoundingClientRect().height };
  });
  ok(lr.w <= 845 && lr.h <= 391, `横屏不溢出 (${lr.w.toFixed(0)}x${lr.h.toFixed(0)})`);
  ok(lr.h > 200, `横屏画布够高 (${lr.h.toFixed(0)}px)`);
  ok(lr.pad > 46 && lr.bar >= 44 && lr.bar <= 84, `横屏操作带恒定 (pad=${lr.pad}, ${lr.bar.toFixed(0)}px)`);

  await browser.close();
  console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILED') + '  pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
