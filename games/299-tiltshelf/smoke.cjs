/* 299-tiltshelf《归架 · 轻重》 Node 冒烟 */
const G = require('./js/game.js');
let P = 0, F = 0;
function ok(c, m) { if (c) P++; else { F++; console.log('  ✗ ' + m); } }
function sec(n) { console.log('— ' + n); }

// ---------- 1. 关卡生成 ----------
sec('关卡生成');
for (let lv = 0; lv < 8; lv++) {
  const tolM = G.LEVELS[lv].tol / G.KT;
  for (let sd = 1; sd <= 6; sd++) {
    const L = G.genLevel(lv, sd);
    ok(!!L, `L${lv}/s${sd} 生成成功`);
    if (!L) continue;
    ok(L.items.length === G.LEVELS[lv].items, `L${lv}/s${sd} 件数=${G.LEVELS[lv].items}`);
    ok(L.solM <= tolM * 0.55 + 1e-9, `L${lv}/s${sd} 存在平衡解 solM=${L.solM.toFixed(2)} ≤ ${(tolM * 0.55).toFixed(2)}`);
    ok(L.naiveM > tolM * 1.02, `L${lv}/s${sd} 随便放必塌 naiveM=${L.naiveM.toFixed(2)} > ${(tolM * 1.02).toFixed(2)}`);
    // plan 合法
    let seen = new Set();
    for (let i = 0; i < L.items.length; i++) {
      const p = L.plan[i], it = L.items[i];
      ok(p && p.s >= 0 && p.s < L.shelves.length, `L${lv}/s${sd} i${i} plan 层合法`);
      ok(p.c >= 0 && p.c < L.shelves[p.s].cols, `L${lv}/s${sd} i${i} plan 列合法`);
      ok(L.shelves[p.s].zones[p.c] === it.kind, `L${lv}/s${sd} i${i} plan 落在自己色区`);
      const key = p.s + ':' + p.c;
      ok(!seen.has(key), `L${lv}/s${sd} i${i} plan 不重叠`);
      seen.add(key);
    }
    // 重量在类别区间内
    for (const it of L.items) {
      const K = G.KINDS[it.kind];
      ok(it.w >= K.wmin && it.w <= K.wmax, `L${lv}/s${sd} 重量 ${it.w} ∈ [${K.wmin},${K.wmax}]`);
    }
    // 支点范围
    for (const sh of L.shelves) {
      ok(sh.pivot >= 1 && sh.pivot <= sh.cols - 1, `L${lv}/s${sd} 支点 ${sh.pivot} ∈ [1,${sh.cols - 1}]`);
      ok(sh.zones.length === sh.cols, `L${lv}/s${sd} zones 长度`);
    }
  }
}
// 确定性
sec('生成确定性');
{
  const a = G.genLevel(4, 77), b = G.genLevel(4, 77);
  ok(JSON.stringify(a.plan) === JSON.stringify(b.plan), '同 seed 同 plan');
  ok(JSON.stringify(a.items.map(i => [i.kind, i.w])) === JSON.stringify(b.items.map(i => [i.kind, i.w])), '同 seed 同货物');
  ok(JSON.stringify(a.shelves.map(s => [s.pivot, s.zones])) === JSON.stringify(b.shelves.map(s => [s.pivot, s.zones])), '同 seed 同层');
  const c = G.genLevel(4, 78);
  ok(JSON.stringify(a.plan) !== JSON.stringify(c.plan) || JSON.stringify(a.shelves.map(s => s.zones)) !== JSON.stringify(c.shelves.map(s => s.zones)), '异 seed 不同');
}

// ---------- 2. 力矩 ----------
sec('力矩 / 倾角');
{
  const sh = { cols: 6, pivot: 3, zones: [0, 0, 0, 1, 1, 1], cells: new Array(6).fill(null), M: 0, theta: 0, tol: 14 };
  const it = { id: 0, kind: 1, w: 4, shelf: 0, col: 5 };
  sh.cells[5] = it;
  ok(G.torqueOf(sh) === 4 * (5.5 - 3), `力矩 = w·(x−pivot) = ${G.torqueOf(sh)}`);
  sh.cells[0] = { id: 1, kind: 0, w: 4, shelf: 0, col: 0 };
  ok(Math.abs(G.torqueOf(sh)) < 1e-9, '对称配重 → 力矩 0');
  sh.cells[5] = null; sh.cells[0] = null;
  sh.cells[5] = { id: 2, kind: 1, w: 9, shelf: 0, col: 5 };
  ok(G.targetTheta(sh) === G.MAXTILT, '大力矩被 clamp 到 MAXTILT');
  sh.cells[5] = null;
  sh.cells[0] = { id: 3, kind: 0, w: 9, shelf: 0, col: 0 };
  ok(G.targetTheta(sh) === -G.MAXTILT, '负向 clamp');
  ok(G.targetTheta(sh) === G.clamp(G.torqueOf(sh) * G.KT, -G.MAXTILT, G.MAXTILT), 'targetTheta 公式一致');
}

// ---------- 3. 放置 / 撤下 ----------
sec('放置 / 撤下 / 边界');
{
  const st = G.makeState(); G.start(st, 0, 4211);
  const n0 = st.queue.length;
  ok(st.moves === 0 && st.maxMoves > st.par, `初始 moves=0 maxMoves=${st.maxMoves} > par=${st.par}`);
  ok(st.maxMoves === Math.ceil(st.par * G.LEVELS[0].slack), '工时 = ⌈par × slack⌉');
  ok(!G.place(st, -1, 0), '越界层被拒');
  ok(!G.place(st, 99, 0), '越界层被拒(右)');
  ok(!G.place(st, 0, -1), '越界列被拒');
  ok(!G.place(st, 0, 999), '越界列被拒(右)');
  ok(G.place(st, 0, 0), '放置成功');
  ok(st.moves === 1, '放置消耗 1 步');
  ok(!G.place(st, 0, 0), '占格被拒');
  ok(st.queue.length === n0 - 1, '队列 -1');
  ok(!G.pickup(st, 0, 1), '空格撤下被拒');
  ok(G.pickup(st, 0, 0), '撤下成功');
  ok(st.queue.length === n0, '撤下回队列');
  ok(st.moves === 1, '撤下不消耗步数（充电宝）');
  // 光标
  G.setCursor(st, 0, 999); ok(st.cursor.c === st.shelves[0].cols - 1, 'setCursor 列 clamp');
  G.setCursor(st, 99, 0); ok(st.cursor.s === st.shelves.length - 1, 'setCursor 层 clamp');
  G.moveCursor(st, -99, -99); ok(st.cursor.s === 0 && st.cursor.c === 0, 'moveCursor 下界');
  G.moveCursor(st, 99, 99); ok(st.cursor.s === st.shelves.length - 1 && st.cursor.c === st.shelves[0].cols - 1, 'moveCursor 上界');
}

// ---------- 4. 滑动 / 掉落 ----------
sec('滑动 / 掉落');
{
  const st = G.makeState(); G.start(st, 0, 4211);
  const sh = st.shelves[0];
  // 造一个确定的重件放在支点右侧 → M>0 → 向右逐格滑，滑出板沿掉落
  for (let c = 0; c < sh.cols; c++) sh.cells[c] = null;
  const heavy = st.items[st.queue[0]];
  heavy.w = 30;
  const startCol = Math.floor(sh.pivot) + 1;
  sh.cells[startCol] = heavy; heavy.shelf = 0; heavy.col = startCol;
  st.queue.splice(0, 1);
  sh.M = G.torqueOf(sh);
  const sl0 = st.slides, fa0 = st.falls;
  ok(sh.M > 0, '重物放右侧 → M>0');
  for (let i = 0; i < 90; i++) G.update(st, 1 / 60);
  ok(Math.abs(sh.theta) > sh.tol, '倾角超容差');
  for (let i = 0; i < 60 * 15; i++) G.update(st, 1 / 60);
  ok(st.slides > sl0, '向右逐格滑');
  ok(st.falls > fa0, '滑出板沿掉落');
  ok(st.queue.length + placedOn(st) === st.items.length, '总量守恒（队列 + 板上 = 总数）');
}
// 反向：M<0 时往左滑
{
  const st = G.makeState(); G.start(st, 0, 4211);
  const sh = st.shelves[0];
  for (let c = 0; c < sh.cols; c++) sh.cells[c] = null;
  const heavy = st.items[st.queue[0]];
  heavy.w = 30;
  const startCol = Math.floor(sh.pivot) - 1;
  sh.cells[startCol] = heavy; heavy.shelf = 0; heavy.col = startCol;
  st.queue.splice(0, 1);
  sh.M = G.torqueOf(sh);
  ok(sh.M < 0, '重物放左侧 → M<0');
  const f0 = st.falls, s0 = st.slides;
  for (let i = 0; i < 60 * 16; i++) G.update(st, 1 / 60);
  ok(st.slides > s0, '向左逐格滑');
  ok(st.falls > f0, '左端也掉落');
}
function placedOn(st) { let n = 0; for (const it of st.items) if (it.shelf >= 0) n++; return n; }

// ---------- 5. dt 守卫 ----------
sec('dt 守卫');
{
  const st = G.makeState(); G.start(st, 2, 4211);
  G.update(st, NaN); G.update(st, -1); G.update(st, 10); G.update(st, 0); G.update(st, undefined);
  ok(Number.isFinite(st.t), 't 有限');
  for (const sh of st.shelves) ok(Number.isFinite(sh.theta) && Number.isFinite(sh.M), 'theta/M 有限');
  ok(Number.isFinite(G.score(st)), 'score 有限');
}

// ---------- 6. 分数铁律 ----------
sec('分数铁律');
{
  for (let lv = 0; lv < 8; lv++) {
    for (let sd = 1; sd <= 4; sd++) {
      const st = G.makeState(); G.start(st, lv, 4211 + sd);
      ok(G.score(st) === 0, `L${lv}/s${sd} 开局 0 分`);
      for (let i = 0; i < 300; i++) G.update(st, 1 / 60);     // 完全不操作
      ok(G.score(st) === 0, `L${lv}/s${sd} 不操作恒 0 分`);
      ok(st.moves === 0, `L${lv}/s${sd} 不操作 0 步`);
    }
  }
}

// ---------- 7. AI 对照 ----------
sec('AI 对照');
const AI = require('./_ai299.cjs');
{
  const pol = ['noop', 'random', 'naive', 'greedy', 'strong'];
  const res = {};
  for (const p of pol) {
    let win = 0, sum = 0, tot = 0;
    for (let lv = 0; lv < 8; lv++) for (let sd = 1; sd <= 6; sd++) {
      const r = AI.run(lv, sd, p); sum += r.sc; tot++; if (r.win) win++;
    }
    res[p] = { win, avg: Math.round(sum / tot) };
  }
  console.log('   ', JSON.stringify(res));
  ok(res.noop.avg === 0, 'noop 0 分');
  ok(res.noop.win === 0, 'noop 0 通关');
  ok(res.naive.win <= 3, `随便放几乎不通关 (${res.naive.win}/48)`);
  ok(res.strong.win === 48, `完美解全通关 (${res.strong.win}/48)`);
  ok(res.strong.avg > res.greedy.avg * 1.4, `strong > greedy×1.4 (${res.strong.avg} vs ${res.greedy.avg})`);
  ok(res.strong.avg > res.random.avg * 3, `strong > random×3 (${res.strong.avg} vs ${res.random.avg})`);
  ok(res.strong.avg > res.naive.avg * 2, `strong > naive×2 (${res.strong.avg} vs ${res.naive.avg})`);
}

// ---------- 8. 三星阈值 ----------
sec('三星阈值');
{
  for (let lv = 0; lv < 8; lv++) {
    const thr = G.STARS[lv];
    ok(thr.length === 3 && thr[0] < thr[1] && thr[1] < thr[2], `L${lv} 阈值递增`);
    let s = 0, n = 0;
    for (let sd = 1; sd <= 6; sd++) { const r = AI.run(lv, sd, 'strong'); s += r.sc; n++; }
    const avg = s / n;
    ok(avg >= thr[2], `L${lv} strong 均分 ${Math.round(avg)} ≥ 三星线 ${thr[2]}`);
    ok(avg * 0.55 < thr[1] * 1.35, `L${lv} 二星线可达`);
  }
}

// ---------- 9. 长跑不崩 ----------
sec('长跑');
{
  for (let lv = 0; lv < 8; lv++) {
    const st = G.makeState(); G.start(st, lv, 999);
    let guard = 0;
    while (!st.over && guard++ < 4000) {
      if (st.queue.length) {
        const cand = [];
        for (let s = 0; s < st.shelves.length; s++)
          for (let c = 0; c < st.shelves[s].cols; c++) if (!st.shelves[s].cells[c]) cand.push({ s, c });
        if (cand.length) { const p = cand[(guard * 7) % cand.length]; G.place(st, p.s, p.c); }
      }
      G.update(st, 1 / 60);
    }
    ok(guard < 4000 || st.over || st.queue.length === 0,
      `L${lv} 4000 步内收敛（over=${st.over} queue=${st.queue.length}）`);
    ok(Number.isFinite(G.score(st)), `L${lv} 分数有限`);
    for (const it of st.items) {
      if (it.shelf >= 0) ok(st.shelves[it.shelf].cells[it.col] === it, `L${lv} 状态自洽`);
    }
  }
}

// ---------- 10. 工时上限 ----------
sec('工时上限');
{
  const st = G.makeState(); G.start(st, 0, 4211);
  let g = 0;
  while (!st.over && g++ < 600) {
    if (st.queue.length) {
      let done = false;
      for (let s = 0; s < st.shelves.length && !done; s++)
        for (let c = 0; c < st.shelves[s].cols && !done; c++) if (!st.shelves[s].cells[c]) done = G.place(st, s, c);
    } else {
      // 队列空了就撤一件再放，把工时耗光
      let last = null;
      for (let s = 0; s < st.shelves.length && !last; s++)
        for (let c = 0; c < st.shelves[s].cols; c++) if (st.shelves[s].cells[c]) { last = { s, c }; break; }
      if (last) G.pickup(st, last.s, last.c);
    }
    G.update(st, 1 / 60);
  }
  ok(st.moves <= st.maxMoves, `步数 ${st.moves} ≤ 上限 ${st.maxMoves}`);
  ok(st.over && st.moves === st.maxMoves, `用完工时即结束 (${st.moves}/${st.maxMoves})`);
}

console.log('\n' + (F === 0 ? '✅ 全部通过' : '❌ 有失败') + `：${P} 通过 / ${F} 失败`);
process.exit(F ? 1 : 0);
