const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 1180, height: 860 } });
  const p = await c.newPage();
  const U = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');
  await p.goto(U); await p.waitForTimeout(500);
  await p.screenshot({ path: '_p296_start.png' });
  await p.click('#goPlay'); await p.waitForTimeout(300);
  await p.evaluate(() => {
    const G = window.__CHALK__, st = G.state(), C = window.CHALK;
    const bn = st.bins[0], dir = bn.cx > st.funnel.x ? 1 : -1;
    G.draw(C.resample([{ x: st.funnel.x - dir * 16, y: st.funnel.y + 40 }, { x: bn.cx - dir * bn.w * 0.3, y: bn.y - 28 }]));
    for (let i = 0; i < 3; i++) G.spawn();
  });
  await p.waitForTimeout(2600);
  await p.screenshot({ path: '_p296_play.png' });
  await p.evaluate(() => window.__CHALK__.start(7));
  await p.waitForTimeout(200);
  await p.evaluate(() => {
    const st = window.__CHALK__.state(), C = window.CHALK;
    const o = st.bins.slice().sort((a, b) => b.val - a.val)[0];
    window.__CHALK__.draw(C.resample([{ x: st.funnel.x - 16, y: st.funnel.y + 40 }, { x: o.cx - o.w * 0.3, y: o.y - 28 }]));
  });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: '_p296_l8.png' });
  await b.close();
  console.log('shots ok');
})();
