const path = require('path');
const { chromium } = require('playwright-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');
(async () => {
  const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-gpu'] });
  // 桌面：游玩中（未通关）+ 通关（掀开浮层看棋盘）
  const p = await b.newPage({ viewport: { width: 960, height: 720 } });
  await p.goto(URL);
  await p.waitForFunction(() => window.__LIGHTPATH, null, { timeout: 10000 });
  await p.click('#btnStart');
  await p.evaluate(() => window.__LIGHTPATH.loadLevel(6));
  await p.waitForTimeout(60);
  await p.evaluate(() => {
    const G = window.GameModule, g = window.__LIGHTPATH.game;
    const sol = G.solve(g.level, g.level.budget);
    for (let i = 0; i < sol.placements.length - 1; i++) { const s = sol.placements[i]; g.movable[G.key(s.c, s.r)] = s.o; }
    g.beam = G.beamPath(g.level, g.movable);
  });
  await p.waitForTimeout(200);
  await p.screenshot({ path: path.resolve(__dirname, '_viz_play.png') });
  await p.evaluate(() => window.__LIGHTPATH.autosolve());
  await p.waitForTimeout(260);                       // 让 RAF 走一帧把 win 浮层置位
  await p.evaluate(() => document.getElementById('winOverlay').classList.add('hidden'));
  await p.waitForTimeout(160);
  await p.screenshot({ path: path.resolve(__dirname, '_viz_solved.png') });

  // 移动端：通关态（掀开浮层看棋盘）
  const m = await b.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 });
  await m.goto(URL);
  await m.waitForFunction(() => window.__LIGHTPATH, null, { timeout: 10000 });
  await m.click('#btnStart');
  await m.evaluate(() => window.__LIGHTPATH.loadLevel(4));
  await m.waitForTimeout(60);
  await m.evaluate(() => window.__LIGHTPATH.autosolve());
  await m.waitForTimeout(260);
  await m.evaluate(() => document.getElementById('winOverlay').classList.add('hidden'));
  await m.waitForTimeout(160);
  await m.screenshot({ path: path.resolve(__dirname, '_viz_mobile.png') });

  await b.close();
  console.log('viz shots done');
})().catch(e => { console.error(e); process.exit(1); });
