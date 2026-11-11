const { chromium } = require('playwright');
const path = require('path');
const FILE = 'file:///' + path.join(__dirname, 'index.html').replace(/\\/g, '/');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  p.on('pageerror', e => console.log('PAGEERROR', String(e)));
  p.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
  await p.goto(FILE); await p.waitForTimeout(600);
  console.log('before class=', await p.getAttribute('#ovStart', 'class'));
  await p.click('#btnStart'); await p.waitForTimeout(400);
  console.log('after class=', await p.getAttribute('#ovStart', 'class'));
  console.log('display=', await p.evaluate(() => getComputedStyle(document.getElementById('ovStart')).display));
  console.log('visible=', await p.locator('#ovStart').isVisible());
  console.log('bbox=', JSON.stringify(await p.locator('#ovStart').boundingBox()));
  await b.close();
})();
