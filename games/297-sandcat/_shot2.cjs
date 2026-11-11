const { chromium } = require('playwright');
const path = require('path');
const URL = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await p.goto(URL); await p.waitForTimeout(800);
  await p.screenshot({ path: '_v2_start.png' });
  await p.click('#bGo'); await p.waitForTimeout(600);
  await p.evaluate(() => { const s = window.SC297.st; s.sandLeft = 220; s.sandMax = 220; s.sandBase = 220; });
  await p.evaluate(() => {
    const S = window.SC297, G = S.G, st = S.st;
    const plan = G.planSolve(st, 460);
    plan.pours.slice(0, Math.ceil(plan.pours.length * 0.6)).forEach(c => G.pourInstant(st, c));
  });
  await p.waitForTimeout(900);
  await p.screenshot({ path: '_v2_play.png' });
  await p.evaluate(() => {
    const S = window.SC297, G = S.G, st = S.st;
    const plan = G.planSolve(st, 460);
    for (const c of plan.pours) G.pourInstant(st, c);
  });
  await p.waitForFunction(() => window.SC297.st && window.SC297.st.over, null, { timeout: 25000 }).catch(() => { });
  await p.waitForTimeout(700);
  await p.screenshot({ path: '_v2_clear.png' });
  await p.waitForFunction(() => !document.getElementById('mask').classList.contains('hide'), null, { timeout: 9000 }).catch(() => { });
  await p.waitForTimeout(400);
  await p.screenshot({ path: '_v2_card.png' });

  const m = await (await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
  await m.goto(URL); await m.waitForTimeout(700);
  await m.click('#bGo'); await m.waitForTimeout(600);
  await m.screenshot({ path: '_v2_mobile.png' });
  await b.close();
  console.log('shots done');
})();
