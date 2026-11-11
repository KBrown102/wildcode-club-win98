const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await c.newPage();
  p.on('pageerror', e => console.log('PAGEERROR:', String(e)));
  p.on('console', m => { if (m.type() === 'error') console.log('CONSOLE:', m.text()); });
  const U = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');
  await p.goto(U);
  await p.waitForTimeout(400);
  await p.evaluate(() => {
    localStorage.setItem('chalkflow.best.v1', JSON.stringify({ 0: 36 }));
    localStorage.setItem('chalkflow.unlock.v1', '2');
    localStorage.setItem('chalkflow.mute.v1', '0');
  });
  await p.reload();
  await p.waitForTimeout(1200);
  console.log('has hook', await p.evaluate(() => !!window.__CHALK__));
  await b.close();
})();
