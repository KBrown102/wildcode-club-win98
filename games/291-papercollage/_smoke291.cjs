// 291-papercollage Node 冒烟：纯逻辑层 + AI 对照实验
const G = require('./game.js');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } }
function run(st, maxN) {
  let n = 0;
  while (st.phase !== 'aim' && st.phase !== 'over' && n++ < (maxN || 3000)) G.update(st, 1 / 60);
  return n;
}

console.log('=== 291-papercollage smoke ===');

// 1. 初始化
{
  const st = G.create({ seed: 12345 });
  ok(st.cols === 8 && st.rows === 9, '棋盘 8×9');
  ok(st.grid.length === 72, '格子数 72');
  ok(st.cur >= 1 && st.cur <= 3, '开局只出 1–3 级，实得 ' + st.cur);
  ok(st.holds === 3, '暂存 3 次');
  let sum = 0; for (let i = 0; i < 72; i++) sum += st.grid[i];
  ok(sum === 0, '开局空盘');
  ok(st.grid instanceof Int8Array, 'grid 是 Int8Array');
}

// 2. 落子 + 三连合并
{
  const st = G.create({ seed: 7 });
  st.grid.fill(0); st.ids.fill(0);
  st.grid[G.idx(0, 8)] = 1; st.ids[G.idx(0, 8)] = 101;
  st.grid[G.idx(1, 8)] = 1; st.ids[G.idx(1, 8)] = 102;
  st.cur = 1; st.col = 2;
  ok(G.canDrop(st), '可投放');
  ok(G.drop(st), '投放成功');
  ok(st.land === 8, '落到底行 r=8，实得 ' + st.land);
  run(st);
  ok(st.grid[G.idx(2, 8)] === 2, '三张一级合成二级（落在投放列），实得 ' + st.grid[G.idx(2, 8)]);
  ok(st.grid[G.idx(0, 8)] === 0 && st.grid[G.idx(1, 8)] === 0, '原格已清空');
  ok(st.score > 0, '得分 ' + st.score);
  ok(st.maxMade === 2, 'maxMade=2');
  ok(st.phase === 'aim', '回到瞄准态');
}

// 3. 两张不合并
{
  const st = G.create({ seed: 7 });
  st.grid.fill(0); st.ids.fill(0);
  st.grid[G.idx(0, 8)] = 1; st.ids[G.idx(0, 8)] = 1;
  st.cur = 1; st.col = 1;
  G.drop(st); run(st);
  ok(st.grid[G.idx(0, 8)] === 1 && st.grid[G.idx(1, 8)] === 1, '两张不合并');
  ok(st.score === 0, '不得分');
}

// 4. 连锁（cascade ≥ 2）
{
  const st = G.create({ seed: 7 });
  st.grid.fill(0); st.ids.fill(0);
  // 底行: 2 2 _ ，其上 (2,7)=1 (3,7)=1 ；投放 1 到 c=4 → 底行 2,2,1 不成组
  // 改造成：底行 c0=1 c1=1 c2=1? 直接构造垂直连锁
  st.grid[G.idx(3, 8)] = 1; st.ids[G.idx(3, 8)] = 1;
  st.grid[G.idx(3, 7)] = 2; st.ids[G.idx(3, 7)] = 2;
  st.grid[G.idx(4, 8)] = 2; st.ids[G.idx(4, 8)] = 3;
  st.grid[G.idx(5, 8)] = 2; st.ids[G.idx(5, 8)] = 4;
  st.grid[G.idx(5, 7)] = 1; st.ids[G.idx(5, 7)] = 5;
  st.grid[G.idx(6, 8)] = 1; st.ids[G.idx(6, 8)] = 6;
  st.grid[G.idx(7, 8)] = 1; st.ids[G.idx(7, 8)] = 7;
  st.cur = 1; st.col = 6; // 落不到，改 4? 用 c=6 会被占
  st.col = 4; st.cur = 1;
  // c4 列: r8=2 -> land=7
  st.grid[G.idx(4, 8)] = 2; st.ids[G.idx(4, 8)] = 3;
  G.drop(st);
  // 投放 1 到 (4,7)。此时 (4,7)=1 与 (3,7)=2 不同；(5,7)=1 相邻 → 只有 2 张，不成组
  run(st);
  ok(st.phase === 'aim', '构造局面可正常结算');
  // 再投一张 1 到 (6,7)：(4,7)(5,7)(6,7) 三张一级 → 合成二级，塌落后又与底行二级成组 → 连锁
  st.grid[G.idx(4, 7)] = 1; st.ids[G.idx(4, 7)] = 21;
  st.grid[G.idx(5, 7)] = 1; st.ids[G.idx(5, 7)] = 22;
  st.cur = 1; st.col = 6;
  G.drop(st); run(st);
  ok(st.bestCascade >= 2, '触发连锁 ≥2，实得 ' + st.bestCascade);
  ok(st.made[3] === 1, '连锁产出三级');
}

// 5. 合并后重力塌落
{
  const st = G.create({ seed: 7 });
  st.grid.fill(0); st.ids.fill(0);
  st.grid[G.idx(0, 8)] = 1; st.ids[G.idx(0, 8)] = 1;
  st.grid[G.idx(1, 8)] = 1; st.ids[G.idx(1, 8)] = 2;
  st.grid[G.idx(2, 7)] = 3; st.ids[G.idx(2, 7)] = 3;   // 悬空？先合法化
  // 直接测 gravity：把 (2,7) 视作已悬空
  st.grid[G.idx(2, 8)] = 0; st.ids[G.idx(2, 8)] = 0;
  const mv = G.gravity(st);
  ok(mv.length > 0, 'gravity 检测到悬空格');
  ok(st.grid[G.idx(2, 8)] === 3, '悬空格落到 r=8');
  ok(st.grid[G.idx(2, 7)] === 0, '原位清空');
}

// 6. 暂存换张
{
  const st = G.create({ seed: 99 });
  const c0 = st.cur, n0 = st.next;
  ok(G.hold(st), '首次暂存');
  ok(st.held === c0, '存入原张');
  ok(st.cur === n0, '换成下一张');
  ok(st.holds === 2, '次数 -1');
  const c1 = st.cur;
  G.hold(st);
  ok(st.cur === c0 && st.held === c1, '二次暂存＝交换');
  G.hold(st); G.hold(st);
  ok(st.holds === 0, '次数用尽');
  ok(!G.hold(st), '用尽后不能再存');
}

// 7. 列满 → 自动转移；全满 → 收工
{
  const st = G.create({ seed: 5 });
  for (let r = 0; r < 9; r++) { st.grid[G.idx(3, r)] = (r % 2) + 1; st.ids[G.idx(3, r)] = 100 + r; }
  st.col = 3;
  G.update(st, 1 / 60);
  ok(true, '满列不崩');
  // 全盘填满且刻意避免成组
  const st2 = G.create({ seed: 5 });
  const pat = [1, 2, 3, 1, 2, 3, 1, 2];
  for (let r = 0; r < 9; r++) for (let c = 0; c < 8; c++) { st2.grid[G.idx(c, r)] = pat[(c + r * 3) % 8]; }
  ok(G.boardFull(st2), 'boardFull 判定');
}

// 8. dt 守卫（NaN / 巨大值）
{
  const st = G.create({ seed: 3 });
  G.drop(st);
  const before = JSON.stringify(Array.from(st.grid));
  G.update(st, NaN);
  G.update(st, -1);
  G.update(st, 1e9);
  const after = JSON.stringify(Array.from(st.grid));
  ok(before === after, 'NaN/负/超大 dt 不改变盘面');
  ok(!Number.isNaN(st.fallY), 'fallY 未污染 ' + st.fallY);
  ok(st.fallY <= 9.001, 'fallY 有界 ' + st.fallY);
}

// 9. AI 对照：贪心 vs 随机
function playGreedy(seed, maxDrops) {
  const st = G.create({ seed });
  let n = 0;
  while (!st.over && n++ < (maxDrops || 400)) {
    if (st.phase !== 'aim') { G.update(st, 1 / 60); continue; }
    let best = null;
    for (let c = 0; c < 8; c++) {
      const r = G.simulateAfter(st, c);
      if (!r) continue;
      const v = r.score * 1000 - r.cells * 10 + r.maxMade * 5;
      if (!best || v > best.v) best = { v, c };
    }
    if (!best) break;
    G.setCol(st, best.c);
    G.drop(st);
    let guard = 0;
    while (st.phase !== 'aim' && !st.over && guard++ < 5000) G.update(st, 1 / 60);
  }
  return st;
}
function playRandom(seed, rnd) {
  const st = G.create({ seed });
  let n = 0;
  while (!st.over && n++ < 400) {
    if (st.phase !== 'aim') { G.update(st, 1 / 60); continue; }
    const cand = [];
    for (let c = 0; c < 8; c++) if (G.landRow(st, c) >= 0) cand.push(c);
    if (!cand.length) break;
    G.setCol(st, cand[Math.floor(rnd() * cand.length)]);
    G.drop(st);
    let guard = 0;
    while (st.phase !== 'aim' && !st.over && guard++ < 5000) G.update(st, 1 / 60);
  }
  return st;
}
{
  let gs = [], gm = [], gc = [], rs = [], rm = [];
  for (let s = 1; s <= 10; s++) {
    const a = playGreedy(s * 7919);
    gs.push(a.score); gm.push(a.maxMade); gc.push(a.bestCascade);
    ok(a.drops > 3, 'seed' + s + ' 贪心能持续投放 ' + a.drops);
    ok(a.score > 0, 'seed' + s + ' 贪心有分 ' + a.score);
  }
  let rnd = (function (a) { return function () { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; })(20260908);
  for (let s = 1; s <= 10; s++) {
    const b = playRandom(s * 7919, rnd);
    rs.push(b.score); rm.push(b.maxMade);
    ok(b.drops > 3, 'seed' + s + ' 随机能持续投放 ' + b.drops);
  }
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  console.log('  贪心  分数均值 ' + avg(gs).toFixed(0) + ' | 最高级均值 ' + avg(gm).toFixed(1) + ' | 最大连锁均值 ' + avg(gc).toFixed(1));
  console.log('  随机  分数均值 ' + avg(rs).toFixed(0) + ' | 最高级均值 ' + avg(rm).toFixed(1));
  ok(avg(gs) > avg(rs) * 2.5, 'greedy 显著强于 random（真技能差距）');
  ok(avg(gm) >= 4, '贪心能稳定合到 4 级以上，实得 ' + avg(gm).toFixed(1));
  ok(avg(gc) >= 1.5, '贪心能打出连锁，实得 ' + avg(gc).toFixed(1));
  ok(Math.max.apply(null, gm) >= 6, '十局里至少一局摸到 6 级，实得 ' + Math.max.apply(null, gm));
}

// 10. 长跑不崩：8000 帧
{
  const st = G.create({ seed: 424242 });
  for (let i = 0; i < 8000; i++) {
    if (st.phase === 'aim') { G.setCol(st, (i * 3) % 8); G.drop(st); }
    G.update(st, 1 / 60);
    if (st.events.length > 400) st.events.length = 0;
  }
  ok(true, '8000 帧长跑未抛错（终态 ' + st.phase + ' 分 ' + st.score + '）');
}

console.log('=== ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail ? 1 : 0);
