const { chromium } = require('playwright');
const path = require('path');
const URL = 'file:///' + path.resolve(__dirname, 'index.html').split(path.sep).join('/');
(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 1180, height: 1000 } });
  const p = await c.newPage();
  await p.goto(URL); await p.waitForTimeout(600);
  await p.screenshot({ path: '_p298_start.png' });
  await p.click('#go'); await p.waitForTimeout(500);
  await p.screenshot({ path: '_p298_play.png' });
  await p.evaluate(() => window.__bd.input({ inflate: true }));
  await p.waitForTimeout(1600);
  await p.evaluate(() => window.__bd.release());
  await p.evaluate(() => window.__bd.input({ swim: 1 }));
  await p.waitForTimeout(700);
  await p.evaluate(() => window.__bd.release());
  await p.screenshot({ path: '_p298_big.png' });
  await p.evaluate(() => window.__bd.start(6, 6 * 1013 + 77));
  await p.waitForTimeout(300);
  await p.evaluate(() => window.__bd.input({ deflate: true }));
  await p.waitForTimeout(1200);
  await p.evaluate(() => window.__bd.release());
  await p.screenshot({ path: '_p298_deep.png' });
  await p.evaluate(() => window.__bd.start(1, 1 * 1013 + 77));
  await p.waitForTimeout(200);
  await p.evaluate(async () => {
    const B = window.BUBBLEDIVE, st = window.__bd.st;
    function near() { let b = null, bd = 1e9; for (const c of st.L.cre) { if (c.got) continue; const d = Math.abs(c.y - st.by) + Math.abs(c.x - st.bx) * .45 + (c.shy ? 40 : 0); if (d < bd) { bd = d; b = c; } } return b; }
    let g = 0;
    while (!st.over && g++ < 6000) {
      const c = near(); const dx = c ? c.x - st.bx : 0, dy = c ? c.y - st.by : -1e4;
      const swim = Math.abs(dx) > 14 ? (dx > 0 ? 1 : -1) : 0; let inp = { swim };
      if (!c) inp.inflate = st.tank > 0 && st.vy > -200;
      else { inp.inflate = dy < -20 && st.tank > 0; inp.deflate = dy > 20; }
      B.step(st, 1 / 60, inp); await new Promise(r => setTimeout(r, 0));
    }
    if (!st.over) B.finish(st, false);
  });
  await p.waitForTimeout(500);
  await p.screenshot({ path: '_p298_over.png' });
  await c.close();
  const mc = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const mp = await mc.newPage();
  await mp.goto(URL); await mp.waitForTimeout(600);
  await mp.click('#go'); await mp.waitForTimeout(400);
  await mp.evaluate(() => window.__bd.input({ inflate: true }));
  await mp.waitForTimeout(900);
  await mp.evaluate(() => window.__bd.release());
  await mp.screenshot({ path: '_p298_mobile.png' });
  await mc.close();
  await b.close();
  console.log('shots done');
})();
