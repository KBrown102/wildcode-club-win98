const path = require('path');
const { chromium } = require('playwright');
const GAME = path.join(__dirname, 'index.html');
const SHOT = path.join(__dirname, '_preview.png');
(async () => {
  const browser = await chromium.launch({ args:['--no-sandbox','--disable-gpu'] });
  const page = await browser.newPage({ viewport:{width:440,height:780}, deviceScaleFactor:2 });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: '+e.message));
  page.on('console', m => { if(m.type()==='error') errors.push('CONSOLE: '+m.text()); });
  await page.goto('file://'+GAME, { waitUntil:'load' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(__dirname,'_shot_menu.png') });
  await page.click('#startBtn');
  await page.waitForTimeout(400);
  // hold to lift the orb and play a bit
  await page.mouse.move(220, 400); await page.mouse.down();
  await page.waitForTimeout(1800);
  // release, then tap to dodge
  await page.mouse.up();
  await page.waitForTimeout(400);
  await page.mouse.down(); await page.waitForTimeout(800); await page.mouse.up();
  await page.waitForTimeout(300);
  const state = await page.evaluate(() => { const g=window.__GAME.state(); return {score:Math.round(g.score), combo:g.combo, motes:g.motes.length, shards:g.shards.length, running:g.running}; });
  await page.screenshot({ path: SHOT });
  console.log('STATE', JSON.stringify(state));
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch(e => { console.error('SHOT_FAIL', e.message); process.exit(2); });
