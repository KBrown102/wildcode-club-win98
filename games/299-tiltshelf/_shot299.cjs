/* 299 截图 */
const { chromium } = require('playwright');
const path = require('path');
const URL = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 1180, height: 820 } });
  const p = await c.newPage();
  await p.goto(URL); await sleep(600);
  await p.screenshot({ path: '_p299_start.png' });
  await p.click('#btnStart'); await sleep(500);
  await p.screenshot({ path: '_p299_play.png' });

  // 放两件制造倾斜
  await p.evaluate(async () => {
    const G = window.SC299, UI = window.SC299UI, st = UI.state();
    const sh = st.shelves[0];
    for (let k = 0; k < 2; k++) { G.setHold(st, 0); UI.doCell(0, sh.cols - 1 - k); await new Promise(r => setTimeout(r, 260)); }
  });
  await sleep(1500);
  await p.screenshot({ path: '_p299_tilt.png' });

  // 第 8 关满架（完美解）
  await p.evaluate(() => window.SC299UI.startLevel(7)); await sleep(400);
  await p.evaluate(async () => {
    const G = window.SC299, UI = window.SC299UI, st = UI.state();
    let g = 0;
    while (st.queue.length && g++ < 40) {
      let did = false;
      for (let qi = 0; qi < st.queue.length; qi++) {
        const id = st.queue[qi], pl = st.plan[id];
        if (pl && !st.shelves[pl.s].cells[pl.c]) { G.setHold(st, qi); UI.doCell(pl.s, pl.c); did = true; break; }
      }
      if (!did) break;
      await new Promise(r => setTimeout(r, 45));
    }
  });
  await sleep(600);
  await p.screenshot({ path: '_p299_full.png' });
  await sleep(2600);
  await p.screenshot({ path: '_p299_result.png' });

  // 移动端
  const mc = await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const mp = await mc.newPage();
  await mp.goto(URL); await sleep(600);
  await mp.click('#btnStart'); await sleep(400);
  await mp.evaluate(async () => {
    const G = window.SC299, UI = window.SC299UI, st = UI.state();
    let g = 0;
    while (st.queue.length && g++ < 20) {
      let did = false;
      for (let qi = 0; qi < st.queue.length; qi++) {
        const id = st.queue[qi], pl = st.plan[id];
        if (pl && !st.shelves[pl.s].cells[pl.c]) { G.setHold(st, qi); UI.doCell(pl.s, pl.c); did = true; break; }
      }
      if (!did) break; await new Promise(r => setTimeout(r, 50));
    }
  });
  await sleep(700);
  await mp.screenshot({ path: '_p299_mobile.png' });

  await b.close();
  console.log('shots done');
})().catch(e => { console.error(e); process.exit(1); });
