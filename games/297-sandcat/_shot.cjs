const { chromium } = require('playwright');
const path = require('path');
const URL = 'file:///' + path.resolve(__dirname, 'index.html').split(path.sep).join('/');
(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2 });
  const p = await c.newPage();
  await p.goto(URL); await p.waitForTimeout(700);
  await p.screenshot({ path: '_p297_start.png' });
  await p.click('#bGo'); await p.waitForTimeout(600);
  await p.screenshot({ path: '_p297_play.png' });
  await p.evaluate(async () => {
    const S = window.SC297, G = S.G, st = S.st;
    const plan = G.planSolve(st, 460);
    const n = Math.floor(plan.pours.length * 0.62);
    for (let i = 0; i < n; i++) { G.pourInstant(st, plan.pours[i]); await new Promise(r => setTimeout(r, 6)); }
  });
  await p.waitForTimeout(1400);
  await p.screenshot({ path: '_p297_mid.png' });
  await p.evaluate(() => window.SC297.start(6)); await p.waitForTimeout(500);
  await p.evaluate(async () => {
    const S = window.SC297, G = S.G, st = S.st;
    const plan = G.planSolve(st, 460);
    const n = Math.floor(plan.pours.length * 0.7);
    for (let i = 0; i < n; i++) { G.pourInstant(st, plan.pours[i]); await new Promise(r => setTimeout(r, 4)); }
  });
  await p.waitForTimeout(1600);
  await p.screenshot({ path: '_p297_l7.png' });
  await p.evaluate(async () => {
    const S = window.SC297, G = S.G, st = S.st;
    const plan = G.planSolve(st, 460);
    for (let i = 0; i < plan.pours.length; i++) { G.pourInstant(st, plan.pours[i]); await new Promise(r => setTimeout(r, 3)); }
  });
  await p.waitForTimeout(2200);
  await p.screenshot({ path: '_p297_clear.png' });
  await b.close();
})();
