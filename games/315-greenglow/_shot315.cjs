const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const url = 'file://' + path.resolve(__dirname, 'index.html');
  const browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await page.goto(url);
  await page.waitForTimeout(400);
  await page.screenshot({ path: __dirname + '/_shot_intro.png' });

  // 开始
  await page.click('#startBtn');
  await page.waitForTimeout(300);

  // 用浏览器内强档 AI 驱动一关，并截图中途与通关
  await page.evaluate(() => {
    // 暴露强档驱动：直接喂 target 到 game 并 step 已内置于 loop，但我们需要访问 game
    // 简单做法：模拟指针扫过所有节点并依次点（通过派发 pointer 事件）
    window.__test = true;
  });

  // 读取节点坐标并逐步点亮 + 连接
  const nodes = await page.evaluate(() => {
    // 通过 GreenGlow 新开一局取坐标（与当前关卡一致 level0）
    const g = new window.GreenGlow.Game(0);
    return g.nodes.map(n => ({ x: n.x, y: n.y, order: n.order }));
  });

  // 按 order 顺序：移动到节点直到显形，再点击
  const stage = await page.$('#stage');
  const box = await stage.boundingBox();
  const sc = box.width / 900;
  async function tap(node) {
    const cx = box.x + node.x * sc, cy = box.y + node.y * sc;
    // 先悬停点亮
    await page.mouse.move(cx, cy, { steps: 8 });
    await page.waitForTimeout(220);
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(150);
  }
  // 截图：扫过第一节点
  await page.mouse.move(box.x + nodes[0].x * sc, box.y + nodes[0].y * sc, { steps: 10 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: __dirname + '/_shot_reveal.png' });

  for (const n of nodes.slice().sort((a, b) => a.order - b.order)) {
    await tap(n);
  }
  await page.waitForTimeout(500);
  await page.screenshot({ path: __dirname + '/_shot_win.png' });

  const winVisible = await page.evaluate(() => !document.getElementById('win').classList.contains('hide'));
  const score = await page.evaluate(() => document.getElementById('score').textContent);
  const letter = await page.evaluate(() => document.getElementById('winLine').textContent);

  console.log('errors:', errors.length ? errors : 'none');
  console.log('winVisible:', winVisible, '| score:', score, '| letter:', letter);

  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
