const { chromium } = require('playwright');
const path = require('path');
const URL = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  p.on('pageerror', e => console.log('PAGEERROR:', JSON.stringify(String(e))));
  p.on('console', m => console.log('CONSOLE[' + m.type() + ']:', JSON.stringify(m.text())));
  p.on('requestfailed', r => console.log('REQFAIL:', r.url().slice(-40), r.failure() && r.failure().errorText));
  await p.goto(URL);
  await p.waitForTimeout(1200);
  console.log('SC297:', await p.evaluate(() => typeof window.SC297));
  await b.close();
})();
