const { chromium } = require('playwright');
const path = require('path');
const URL = 'file:///' + path.resolve(__dirname, 'index.html').split(path.sep).join('/');
(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 520, height: 840 }, deviceScaleFactor: 2 });
  const p = await c.newPage();
  await p.goto(URL); await p.waitForTimeout(600);
  await p.screenshot({ path: '_p295_start.png' });
  await p.click('#goPlay'); await p.waitForTimeout(500);
  await p.evaluate(() => {
    const st = window.__BENTO__.st, B = window.BENTO;
    for (let k = 0; k < 2; k++) {
      if (!st.queue.length) break;
      const it = B.itemById(st, st.queue[0]);
      B.selQueue(st, it.id);
      let done = false;
      for (let y = 0; y <= st.rows - it.h && !done; y++) {
        for (let x = 0; x <= st.cols - it.w && !done; x++) {
          if (B.canPlace(st, x, y, it.w, it.h, -1)) { B.placeAt(st, x, y); done = true; }
        }
      }
    }
    const s2 = st.items.find(i => i.soft && !i.placed);
    if (s2) { B.selQueue(st, s2.id); B.tryPress(st, 'flat'); }
  });
  await p.waitForTimeout(400);
  await p.screenshot({ path: '_p295_play.png' });
  await p.evaluate(() => {
    window.__BENTO__.startLevel(0);
    const s = window.__BENTO__.st, B = window.BENTO;
    for (const it of s.items) {
      B.selQueue(s, it.id);
      let g = 0;
      while (it.w !== it.solW && g++ < 6) { if (!B.tryPress(s, it.w < it.solW ? 'flat' : 'long')) break; }
      B.placeAt(s, it.solX, it.solY);
    }
  });
  await p.waitForTimeout(1900);
  await p.screenshot({ path: '_p295_result.png' });
  await b.close(); console.log('shots done');
})();
