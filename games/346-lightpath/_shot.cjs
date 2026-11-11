/**
 * _shot.cjs —— 真浏览器集成测试（playwright-core + 本机 Chrome）
 * 验证：加载与初始化无 pageerror；开始→逐关 autosolve 全部点亮；真实指针点击能放置镜面；
 *      桌面 + 移动视口各截一张图。
 */
const path = require('path');
const { chromium } = require('playwright-core');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-gpu'] });
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(URL);
  await page.waitForFunction(() => window.__LIGHTPATH && window.GameModule, null, { timeout: 10000 });
  await page.click('#btnStart');
  await page.waitForTimeout(200);

  let wonAll = true;
  const N = await page.evaluate(() => window.__LIGHTPATH.game.levels.length);
  for (let i = 0; i < N; i++) {
    await page.evaluate(idx => window.__LIGHTPATH.loadLevel(idx), i);
    await page.waitForTimeout(40);
    const won = await page.evaluate(() => window.__LIGHTPATH.autosolve());
    const st = await page.evaluate(() => window.__LIGHTPATH.state());
    if (!won || !st.won) { wonAll = false; console.log('  ✗ L' + (i + 1) + ' 未点亮'); }
  }
  console.log('逐关 autosolve 全亮：' + (wonAll ? '通过' : '失败'));

  // 真实指针点击放置（验证坐标映射 + handleTap）
  await page.evaluate(() => window.__LIGHTPATH.loadLevel(0));
  await page.waitForTimeout(40);
  const placed = await page.evaluate(() => {
    const G = window.GameModule, R = window.Render, g = window.__LIGHTPATH.game;
    const sol = G.solve(g.level, g.level.budget);
    const p = sol.placements[0];
    const lay = R.layout, cell = lay.cell;
    const cx = lay.ox + p.c * cell + cell / 2, cy = lay.oy + p.r * cell + cell / 2;
    const rect = document.getElementById('game').getBoundingClientRect();
    const cv = document.getElementById('game');
    const tap = () => cv.dispatchEvent(new PointerEvent('pointerdown', { clientX: rect.left + cx, clientY: rect.top + cy, bubbles: true, pointerId: 1 }));
    tap();                                   // 放置（默认 '/'）
    if (g.movable[G.key(p.c, p.r)] !== p.o) tap(); // 再点旋转到目标朝向
    return !!g.movable[G.key(p.c, p.r)] && g.movable[G.key(p.c, p.r)] === p.o;
  });
  console.log('真实指针放置镜面：' + (placed ? '通过' : '失败'));

  // 截图：桌面通关态 + 移动端
  await page.evaluate(() => window.__LIGHTPATH.loadLevel(11));
  await page.waitForTimeout(40);
  await page.evaluate(() => window.__LIGHTPATH.autosolve());
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.resolve(__dirname, '_shot_desktop.png') });

  const mpage = await browser.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 });
  mpage.on('pageerror', e => errors.push('mobile pageerror: ' + e.message));
  await mpage.goto(URL);
  await mpage.waitForFunction(() => window.__LIGHTPATH, null, { timeout: 10000 });
  await mpage.click('#btnStart');
  await mpage.evaluate(() => window.__LIGHTPATH.loadLevel(0));
  await mpage.waitForTimeout(40);
  await mpage.evaluate(() => window.__LIGHTPATH.autosolve());
  await mpage.waitForTimeout(300);
  await mpage.screenshot({ path: path.resolve(__dirname, '_shot_mobile.png') });

  await browser.close();
  console.log('pageerror 数量：' + errors.length);
  errors.slice(0, 10).forEach(e => console.log('  ! ' + e));
  const ok = wonAll && placed && errors.length === 0;
  console.log('\n集成测试：' + (ok ? '通过 ✅' : '失败 ❌'));
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
