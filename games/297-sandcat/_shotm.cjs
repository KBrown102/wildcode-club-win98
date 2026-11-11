const { chromium } = require('playwright');
const path = require('path');
const URL = 'file:///' + path.resolve(__dirname, 'index.html').split(path.sep).join('/');
(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({ viewport:{width:844,height:390}, deviceScaleFactor:3, isMobile:true, hasTouch:true });
  const p = await c.newPage();
  await p.goto(URL); await p.waitForTimeout(700);
  await p.click('#bGo'); await p.waitForTimeout(400);
  await p.evaluate(async () => {
    const S = window.SC297, G = S.G, st = S.st;
    const plan = G.planSolve(st, 460);
    for (let i = 0; i < plan.pours.length; i++) { G.pourInstant(st, plan.pours[i]); await new Promise(r=>setTimeout(r,5)); }
  });
  await p.waitForTimeout(1800);
  await p.screenshot({ path: '_p297_mobile.png' });
  await b.close();
})();
