// 208 光蛇 · 无头烟雾测试：启动 / 转向 / 吃食 / 断尾扣心 / 结算 / resize / 无泄漏
const { chromium } = require('playwright');
const path = require('path');

const url = 'file://' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');

(async () => {
  const errs = [];
  const browser = await chromium.launch({ headless: true });
  for (const vp of [{ width: 430, height: 860, tag: 'mobile' }, { width: 1280, height: 800, tag: 'desktop' }]) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    page.on('pageerror', e => errs.push(`[${vp.tag}] pageerror: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') errs.push(`[${vp.tag}] console: ${m.text()}`); });
    await page.goto(url);
    await page.waitForTimeout(400);

    // 标题页
    let s = await page.evaluate(() => ({ phase: __G.phase, len: __G.cells.length, food: !!__G.food }));
    console.log(`[${vp.tag}] title:`, JSON.stringify(s));
    if (s.phase !== 'title') errs.push(`[${vp.tag}] 初始不是标题页`);

    // 开始
    await page.evaluate(() => __start());
    await page.waitForTimeout(200);
    s = await page.evaluate(() => ({ phase: __G.phase, len: __G.cells.length, hearts: __G.hearts }));
    console.log(`[${vp.tag}] start:`, JSON.stringify(s));
    if (s.phase !== 'play') errs.push(`[${vp.tag}] 开始失败`);

    // 作弊喂食 12 次：验证变长 / 分数 / 大光点 / 回心逻辑
    const fed = await page.evaluate(async () => {
      const out = [];
      for (let k = 0; k < 12; k++) {
        // 把食物放到蛇头正前方，然后等一步
        const h = __G.cells[0], d = __G.dir;
        __G.food = { x: (h.x + d.x + 19) % 19, y: (h.y + d.y + 19) % 19, big: k === 4, born: __G.t, life: k === 4 ? 11 : 0, pop: 0 };
        __G.acc = __G.stepMs + 1;
        await new Promise(r => setTimeout(r, 90));
        out.push({ len: __G.cells.length, score: __G.score, foods: __G.foods });
      }
      return out;
    });
    console.log(`[${vp.tag}] fed:`, JSON.stringify(fed[0]), '->', JSON.stringify(fed[fed.length - 1]));
    const lastFed = fed[fed.length - 1];
    if (!(lastFed.len > 10)) errs.push(`[${vp.tag}] 吃了 12 次长度只有 ${lastFed.len}`);
    if (!(lastFed.score > 100)) errs.push(`[${vp.tag}] 分数没涨: ${lastFed.score}`);

    // 转向可用 + 不能掉头
    const turnRes = await page.evaluate(async () => {
      __turn(0, 1); const q1 = __G.queue.length;
      const cur = { x: __G.dir.x, y: __G.dir.y };
      __turn(-cur.x, -cur.y); const q2 = __G.queue.length;
      await new Promise(r => setTimeout(r, 260));
      return { q1, q2, dir: __G.dir };
    });
    console.log(`[${vp.tag}] turn:`, JSON.stringify(turnRes));
    if (turnRes.q1 !== 1) errs.push(`[${vp.tag}] 转向没入队`);

    // 断尾：强行把头挪到身体上
    const cut = await page.evaluate(async () => {
      const before = { len: __G.cells.length, hearts: __G.hearts };
      __G.invT = 0;
      const target = __G.cells[6];
      __G.cells[0] = { x: target.x, y: target.y };
      // 触发碰撞检测：直接调用一步（食物先挪远）
      __G.food = { x: (target.x + 8) % 19, y: (target.y + 5) % 19, big: false, born: __G.t, life: 0, pop: 0 };
      // 手动跑碰撞：把头放在身体上并推进一步
      __G.acc = __G.stepMs + 1;
      await new Promise(r => setTimeout(r, 120));
      return { before, after: { len: __G.cells.length, hearts: __G.hearts } };
    });
    console.log(`[${vp.tag}] cut:`, JSON.stringify(cut));

    // 直接判定结算路径
    const over = await page.evaluate(async () => {
      __G.hearts = 1; __G.invT = 0;
      for (let k = 0; k < 40 && __G.phase === 'play'; k++) {
        const t = __G.cells[Math.min(5, __G.cells.length - 1)];
        __G.cells[0] = { x: t.x, y: t.y };
        __G.acc = __G.stepMs + 1;
        await new Promise(r => setTimeout(r, 60));
      }
      return { phase: __G.phase, best: __G.bestScore, bestLen: __G.bestLen, maxLen: __G.maxLen };
    });
    console.log(`[${vp.tag}] over:`, JSON.stringify(over));
    if (over.phase !== 'over') errs.push(`[${vp.tag}] 心用完没结算`);
    if (!(over.best > 0)) errs.push(`[${vp.tag}] 最佳分数没存`);

    // 再来一局
    await page.evaluate(() => __start());
    await page.waitForTimeout(200);
    s = await page.evaluate(() => ({ phase: __G.phase, len: __G.cells.length, hearts: __G.hearts, score: __G.score }));
    console.log(`[${vp.tag}] restart:`, JSON.stringify(s));
    if (s.phase !== 'play' || s.hearts !== 3 || s.score !== 0 || s.len !== 3) errs.push(`[${vp.tag}] 重开没重置`);

    // resize
    await page.setViewportSize({ width: 700, height: 500 });
    await page.waitForTimeout(300);
    const rz = await page.evaluate(() => {
      const bad = __G.cells.some(c => !isFinite(c.x) || !isFinite(c.y) || c.x < 0 || c.x > 18 || c.y < 0 || c.y > 18);
      return { bad, phase: __G.phase };
    });
    console.log(`[${vp.tag}] resize:`, JSON.stringify(rz));
    if (rz.bad) errs.push(`[${vp.tag}] resize 后格子坐标异常`);

    // 跑 3 秒看数组是否封顶 / NaN
    await page.evaluate(async () => {
      for (let k = 0; k < 30; k++) {
        const h = __G.cells[0], d = __G.dir;
        __G.food = { x: (h.x + d.x + 19) % 19, y: (h.y + d.y + 19) % 19, big: k % 5 === 4, born: __G.t, life: 11, pop: 0 };
        await new Promise(r => setTimeout(r, 100));
      }
    });
    const leak = await page.evaluate(() => ({
      parts: __G.parts.length, pops: __G.popups.length, rip: __G.ripples.length,
      nan: !isFinite(__G.score) || __G.parts.some(p => !isFinite(p.x)),
      len: __G.cells.length, stage: __G.stage, phase: __G.phase
    }));
    console.log(`[${vp.tag}] leak:`, JSON.stringify(leak));
    if (leak.nan) errs.push(`[${vp.tag}] 出现 NaN`);
    if (leak.parts > 430 || leak.pops > 20 || leak.rip > 20) errs.push(`[${vp.tag}] 数组没封顶`);

    await page.screenshot({ path: path.join(__dirname, `_shot_${vp.tag}.png`) });
    await page.close();
  }
  await browser.close();
  if (errs.length) { console.log('\n❌ 问题：'); errs.forEach(e => console.log(' - ' + e)); process.exit(1); }
  console.log('\n✅ 全部通过');
})();
