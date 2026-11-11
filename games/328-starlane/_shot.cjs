// 真实浏览器冒烟：加载 file://，截开始/游玩两帧，抓 pageerror/console.error
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const url = 'file://' + path.join(__dirname, 'index.html');
  let browser;
  try {
    browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
  } catch (e) {
    console.log('launch失败(无 chromium):', e.message); process.exit(2);
  }
  const page = await browser.newPage({ viewport: { width: 900, height: 1500 }, deviceScaleFactor: 2 });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });

  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(__dirname, '_shot_start.png') });

  // 开始游戏
  await page.evaluate(() => window.__STARLANE.start());
  await page.waitForTimeout(300);
  // 放一个光环在星屑正上方并竖直发射，验证穿环 + 渲染
  await page.evaluate(() => {
    const G = window.__STARLANE, s = G.state;
    const pad = { x: window.innerWidth*0.5, y: window.innerHeight - Math.max(70, window.innerHeight*0.12) };
    s.rings[0] = { x: pad.x, y: pad.y - 280, r: 46, active: true, respawnT: 0, ph: 0, got: false };
    G.fire(0, -560);
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(__dirname, '_shot_play.png') });

  // 检查 canvas 是否真的画了东西（非纯黑/纯白）
  const info = await page.evaluate(() => {
    const cv = document.getElementById('game');
    const c = cv.getContext('2d');
    const w = cv.width, h = cv.height;
    const d = c.getImageData(0, 0, w, h).data;
    let lit = 0, n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] + d[i+1] + d[i+2] > 40) lit++;
    }
    return { w, h, litRatio: lit / n, mode: window.__STARLANE.state.mode, score: window.__STARLANE.state.score };
  });
  console.log('canvas:', info.w + 'x' + info.h, '| 非黑像素比:', info.litRatio.toFixed(3),
    '| mode:', info.mode, '| score:', info.score);
  console.log('pageerror/console.error 数:', errs.length);
  if (errs.length) console.log(errs.join('\n'));

  await browser.close();

  const ok = errs.length === 0 && info.litRatio > 0.02 && info.mode === 'play';
  console.log(ok ? '\n真实渲染冒烟通过 ✓' : '\n真实渲染冒烟未通过 ✗');
  process.exit(ok ? 0 : 1);
})();
