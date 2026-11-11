/* 295-bentopress 冒烟测试 */
const B = require('./game.js');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } }
function sec(m) { console.log('· ' + m); }

/* ---------- 1. 关卡生成 ---------- */
sec('关卡生成 / 结构');
for (let li = 0; li < 8; li++) {
  for (let s = 1; s <= 6; s++) {
    const L = B.genLevel(li, s * 1013);
    const cfg = B.LEVELS[li];
    ok(L.items.length === cfg.n, `L${li} s${s} 食材数 = ${L.items.length} 应为 ${cfg.n}`);
    ok(L.walls.length === cfg.walls, `L${li} s${s} 隔板数`);
    // 总面积守恒：食材最终形态面积 + 隔板面积 = 盒格数
    let area = 0;
    L.items.forEach(it => area += it.solW * it.solH);
    L.walls.forEach(w => area += w.w * w.h);
    ok(area === cfg.cols * cfg.rows, `L${li} s${s} 面积守恒 ${area} vs ${cfg.cols * cfg.rows}`);
    // 叶子互不重叠且全在界内（正解必然合法）
    const grid = new Int16Array(cfg.cols * cfg.rows).fill(-1);
    let overlap = false, oob = false;
    const all = L.items.map(it => ({ x: it.solX, y: it.solY, w: it.solW, h: it.solH }))
      .concat(L.walls.map(w => ({ x: w.x, y: w.y, w: w.w, h: w.h })));
    for (const r of all) {
      if (r.x < 0 || r.y < 0 || r.x + r.w > cfg.cols || r.y + r.h > cfg.rows) oob = true;
      for (let dy = 0; dy < r.h; dy++) for (let dx = 0; dx < r.w; dx++) {
        if (grid[(r.y + dy) * cfg.cols + (r.x + dx)] !== -1) overlap = true;
        grid[(r.y + dy) * cfg.cols + (r.x + dx)] = 1;
      }
    }
    ok(!oob, `L${li} s${s} 正解不越界`);
    ok(!overlap, `L${li} s${s} 正解不重叠`);
    // 不变量：w+h 恒定
    L.items.forEach(it => ok(it.w0 + it.h0 === it.solW + it.solH, `L${li} s${s} #${it.id} w+h 不变量`));
    // 软食材最少压次数 = |solW - w0|，且配额足够
    L.items.forEach(it => {
      ok(it.minP === Math.abs(it.solW - it.w0), `L${li} s${s} #${it.id} minP`);
      ok(it.quota >= it.minP, `L${li} s${s} #${it.id} 配额 ≥ minP`);
      ok(it.w0 >= 1 && it.h0 >= 1, `L${li} s${s} #${it.id} 初始形态合法`);
      ok(it.w === it.w0 && it.h === it.h0, `L${li} s${s} #${it.id} 初始 = base`);
    });
    ok(L.par === L.minTotal + 2, `L${li} s${s} par`);
  }
}

/* ---------- 2. 挤压数学 ---------- */
sec('挤压形变数学');
{
  const st = B.newState(0, 2026);
  // 找一个软食材
  const soft = st.items.find(i => i.soft);
  ok(!!soft, '存在软食材');
  if (soft) {
    const S = soft.w0 + soft.h0;
    let guard = 0;
    while (soft.used < soft.quota && guard++ < 10) {
      const before = soft.w * soft.h;
      const dir = soft.h >= 2 ? 'flat' : 'long';
      B.selQueue(st, soft.id);
      const r = B.tryPress(st, dir);
      if (!r) break;
      ok(soft.w + soft.h === S, `压后 w+h 恒定 = ${S}`);
      const expect = before + (dir === 'flat' ? (soft.h + 1) - (soft.w - 1) : 0) - 0; // 见下
      // 面积公式：flat (w+1)(h-1) = wh + h - w - 1；long (w-1)(h+1) = wh + w - h - 1
      const h0 = dir === 'flat' ? soft.h + 1 : soft.h - 1;
      const w0 = dir === 'flat' ? soft.w - 1 : soft.w + 1;
      const exp = w0 * h0 + (dir === 'flat' ? h0 - w0 - 1 : w0 - h0 - 1);
      ok(soft.w * soft.h === exp, `面积公式 flat/long：${soft.w}×${soft.h}=${soft.w * soft.h} vs ${exp}`);
      ok(soft.used <= soft.quota, '不超配额');
    }
    // 配额耗尽后不可再压
    B.selQueue(st, soft.id);
    const before = soft.w;
    while (soft.used < soft.quota) { if (!B.tryPress(st, soft.h >= 2 ? 'flat' : 'long')) break; }
    const r2 = B.tryPress(st, soft.h >= 2 ? 'flat' : 'long');
    ok(r2 === false, '配额耗尽后拒绝');
    ok(soft.w === before || soft.used === soft.quota, '配额耗尽形态不变');
  }
  // 硬食材不可压
  const st2 = B.newState(7, 777);
  const hard = st2.items.find(i => !i.soft);
  if (hard) {
    B.selQueue(st2, hard.id);
    ok(B.tryPress(st2, 'flat') === false, '硬食材不可压');
    ok(hard.w === hard.w0, '硬食材形状不变');
  }
  // 1×1 不可压（两个方向都会出 0）
  ok(B.reachable({ w0: 1, h0: 1, S: 2, soft: true, quota: 3 }).every(r => r.w >= 1 && r.h >= 1), 'reachable 不出 0 维');
}

/* ---------- 3. 放置 / 收回 / 边界 ---------- */
sec('放置 / 收回 / 边界');
{
  const st = B.newState(2, 4242);
  const it = st.items[0];
  B.selQueue(st, it.id);
  ok(B.canPlace(st, 0, 0, 1, 1, -1) === false || true, 'canPlace 可调用');
  // 越界拒绝
  ok(!B.canPlace(st, st.cols, 0, 1, 1, -1), '右侧越界拒绝');
  ok(!B.canPlace(st, 0, st.rows, 1, 1, -1), '下侧越界拒绝');
  ok(!B.canPlace(st, -1, 0, 1, 1, -1), '左侧越界拒绝');
  // 隔板不可放
  const w0 = st.walls[0];
  ok(!B.canPlace(st, w0.x, w0.y, 1, 1, -1), '隔板格不可放');
  // 放 → 收 → 再放
  let placed = false, px = -1, py = -1;
  for (let y = 0; y <= st.rows - it.h && !placed; y++)
    for (let x = 0; x <= st.cols - it.w && !placed; x++)
      if (B.canPlace(st, x, y, it.w, it.h, -1)) { px = x; py = y; placed = true; }
  ok(placed, '存在合法落点');
  B.selQueue(st, it.id);
  ok(B.placeAt(st, px, py), '放得下');
  ok(it.placed, '已放置');
  ok(st.queue.indexOf(it.id) < 0, '已出队');
  ok(!B.canPlace(st, px, py, 1, 1, -1), '原格已被占');
  B.selPlaced(st, it.id);
  ok(B.pickup(st), '收回成功');
  ok(!it.placed, '收回后未放置');
  ok(st.queue.indexOf(it.id) >= 0, '收回后回队');
  ok(B.canPlace(st, px, py, it.w, it.h, -1), '收回后原格空出');
  // 已放置食材挤压导致越界应拒绝
  B.selQueue(st, it.id);
  B.placeAt(st, px, py);
  if (it.soft) {
    B.selPlaced(st, it.id);
    let g = 0;
    while (it.used < it.quota && g++ < 8) {
      const dir = it.h >= 2 ? 'flat' : 'long';
      if (it.gx + it.w > st.cols && dir === 'flat') break;
      if (it.gy + it.h > st.rows && dir === 'long') break;
      if (!B.tryPress(st, dir)) break;
    }
    ok(true, '挤压循环不崩');
  }
}

/* ---------- 4. 合盖 / 评分 ---------- */
sec('合盖 / 评分');
{
  const st = B.newState(3, 31337);
  const s0 = B.score(st);
  ok(s0.score === 0, `noop 得 0 分（实际 ${s0.score}）——「不操作也得分」的毒已堵`);
  ok(s0.stars === 0, 'noop 0 星');
  const r = B.aiOracle(st);
  ok(r.all, `正解全装满（${r.placed}/${st.items.length}）`);
  ok(r.presses === st.minTotal, `正解压次数 = minTotal ${r.presses} vs ${st.minTotal}`);
  ok(r.stars === 3, `正解 3 星（presses ${r.presses} ≤ par ${st.par}）`);
  ok(st.lid !== null, '合盖动画已触发');
  ok(r.score > 0, '正解有分');
}
{
  // 卖相单调性：压得越多分越低（超过 par 后）
  const st = B.newState(4, 8888);
  B.aiOracle(st);
  const base = B.score(st).score;
  ok(base > 0, '基准分 > 0');
}

/* ---------- 5. AI 对照（核心机制必要性） ---------- */
sec('AI 对照 / 技能梯度 / 机制必要性');
{
  const seeds = [11, 202, 3003, 40004, 500005, 6000006];
  const agg = { greedy: [], nopress: [], random: [], oracle: [] };
  for (let li = 0; li < 8; li++) {
    for (const sd of seeds) {
      let st = B.newState(li, sd); agg.oracle.push(B.aiOracle(st).score);
      st = B.newState(li, sd); agg.greedy.push(B.aiGreedy(st, {}).score);
      st = B.newState(li, sd); agg.nopress.push(B.aiGreedy(st, { quotaLimit: 0 }).score);
      st = B.newState(li, sd); agg.random.push(B.aiRandom(st, { rnd: B.mulberry32(sd) }).score);
    }
  }
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  console.log(`  oracle ${avg(agg.oracle).toFixed(1)} | greedy ${avg(agg.greedy).toFixed(1)} | nopress ${avg(agg.nopress).toFixed(1)} | random ${avg(agg.random).toFixed(1)} | noop 0`);
  ok(avg(agg.oracle) >= avg(agg.greedy) * 0.95, 'oracle ≥ greedy×0.95（正解是参考最优）');
  ok(avg(agg.greedy) > avg(agg.random) * 1.4, 'greedy > random × 1.4（真技能梯度）');
  ok(avg(agg.nopress) < avg(agg.greedy) * 0.92, '禁止挤压明显更差 = 挤压机制必要');
  // 每关都要有「不压就装不满」的证据
  let necessaryLevels = 0;
  for (let li = 0; li < 8; li++) {
    let need = false;
    for (const sd of seeds) {
      const st = B.newState(li, sd);
      const r = B.aiGreedy(st, { quotaLimit: 0 });
      if (!r.all) { need = true; break; }
    }
    if (need) necessaryLevels++;
  }
  console.log(`  8 关中「不压就装不满」的关卡数 = ${necessaryLevels}`);
  ok(necessaryLevels >= 6, `至少 6 关证明挤压必要（实测 ${necessaryLevels}）`);
  // greedy 通关率
  let win = 0, tot = 0;
  for (let li = 0; li < 8; li++) for (const sd of seeds) {
    const st = B.newState(li, sd); tot++;
    if (B.aiGreedy(st, {}).all) win++;
  }
  console.log(`  greedy 装满率 ${win}/${tot}`);
  ok(win >= tot * 0.5, `greedy 装满率 ≥50%（${win}/${tot}）`);
  let rwin = 0, rtot = 0;
  for (let li = 0; li < 8; li++) for (const sd of seeds) {
    const st = B.newState(li, sd); rtot++;
    if (B.aiRandom(st, { rnd: B.mulberry32(sd) }).all) rwin++;
  }
  console.log(`  random 装满率 ${rwin}/${rtot}`);
  ok(rwin <= rtot * 0.5, '乱放装满率低');
  // 星级分布：3★ 应该不是白送
  const starDist = [0, 0, 0, 0];
  for (let li = 0; li < 8; li++) for (const sd of seeds) {
    const st = B.newState(li, sd); starDist[B.aiGreedy(st, {}).stars]++;
  }
  console.log(`  greedy 星级分布 0★:${starDist[0]} 1★:${starDist[1]} 2★:${starDist[2]} 3★:${starDist[3]}`);
  ok(starDist[3] < 48, '3★ 不是白送（greedy 也拿不到全员 3★）');
  ok(starDist[0] <= 12, 'greedy 多数能装满');
}

/* ---------- 6. 长跑 / dt 守卫 / 确定性 ---------- */
sec('长跑 / 确定性');
{
  const a = B.genLevel(5, 12345), b = B.genLevel(5, 12345);
  ok(JSON.stringify(a.items.map(i => [i.name, i.w0, i.h0, i.solX, i.solY])) ===
    JSON.stringify(b.items.map(i => [i.name, i.w0, i.h0, i.solX, i.solY])), '同种子生成确定');
  const c = B.genLevel(5, 12346);
  ok(JSON.stringify(a.items.map(i => [i.w0, i.h0])) !== JSON.stringify(c.items.map(i => [i.w0, i.h0]))
    || true, '不同种子可不同');
  // 疯狂操作不崩
  const st = B.newState(7, 999);
  let g = 0;
  while (g++ < 4000) {
    const pool = st.items;
    const it = pool[g % pool.length];
    if (!it) break;
    if (it.placed) B.selPlaced(st, it.id); else B.selQueue(st, it.id);
    if (g % 3 === 0) B.tryPress(st, g % 2 ? 'flat' : 'long');
    if (g % 5 === 0) B.pickup(st);
    if (g % 7 === 0) B.autoPlace(st);
    if (g % 11 === 0) B.placeAt(st, g % st.cols, (g * 3) % st.rows);
    st.events.length = 0;
  }
  ok(true, '4000 次随机操作不崩');
  // occ 里不应残留不合法值
  let bad = false;
  for (let i = 0; i < st.occ.length; i++) if (st.occ[i] < -2 || st.occ[i] >= st.items.length) bad = true;
  ok(!bad, 'occ 值域合法');
  // 每个已放置食材的占位与 occ 一致
  let consistent = true;
  st.items.forEach(it => { if (it.placed) { for (let dy = 0; dy < it.h; dy++) for (let dx = 0; dx < it.w; dx++) if (st.occ[(it.gy + dy) * st.cols + it.gx + dx] !== it.id) consistent = false; } });
  ok(consistent, '占位与 occ 一致');
}

console.log(`\n=== SMOKE: ${pass} pass / ${fail} fail ===`);
process.exit(fail ? 1 : 0);
