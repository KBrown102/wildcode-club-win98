// _bal289.cjs — 平衡性 / 可解性校准
const G = require('./game.js');

function run(li, seed, policy, T = 120) {
  const st = G.newState(li, seed);
  const dt = 1 / 60;
  for (let f = 0; f < T * 60 && !st.done; f++) {
    policy(st);
    G.tick(st, dt);
  }
  return st;
}

// 裸点击：随便点一个在窗内的柱子（模拟乱点）
function rndAI(st) {
  if (st.cd > 0 || st.waves <= 0) return;
  const b = G.bands(st);
  if (!b.length) return;
  const [s, e] = b[Math.floor(Math.random() * b.length)];
  G.launch(st, s + Math.floor(Math.random() * (e - s + 1)));
}

// 前缘点击（错误策略）：点最右侧
function frontAI(st, minB) {
  if (st.cd > 0 || st.waves <= 0) return;
  const b = G.bands(st).filter(x => x[1] - x[0] + 1 >= minB);
  if (!b.length) return;
  b.sort((a, c) => (c[1] - c[0]) - (a[1] - a[0]));
  G.launch(st, b[0][1]);
}

// 后缘点击（正确策略）：点亮带最左侧，且等宽涌浪
function rearAI(st, minB) {
  if (st.cd > 0 || st.waves <= 0) return;
  const b = G.bands(st).filter(x => x[1] - x[0] + 1 >= minB);
  if (!b.length) return;
  b.sort((a, c) => (c[1] - c[0]) - (a[1] - a[0]));
  G.launch(st, b[0][0]);
}

// 统计某关的「最宽亮带」分布
function bandStats(li, seed) {
  const st = G.newState(li, seed);
  const dt = 1 / 60;
  let mx = 0, hist = [];
  for (let f = 0; f < 60 * 60; f++) {
    G.tick(st, dt);
    for (const [s, e] of G.bands(st)) mx = Math.max(mx, e - s + 1);
    if (f % 60 === 0) hist.push(G.bands(st).reduce((m, x) => Math.max(m, x[1] - x[0] + 1), 0));
  }
  return { max: mx, avgPerSec: (hist.reduce((a, b) => a + b, 0) / hist.length).toFixed(2) };
}

console.log('=== 亮带宽度统计（柱） ===');
for (let li = 0; li < 5; li++) {
  const L = G.LEVELS[li];
  let mxAll = 0, acc = 0;
  for (let s = 0; s < 6; s++) {
    const r = bandStats(li, s * 7919 + 11);
    mxAll = Math.max(mxAll, r.max); acc += +r.avgPerSec;
  }
  console.log(`L${li + 1} n=${L.n} waves=${L.waves} band目标=${L.band} → 实测最宽=${mxAll} 平均每秒最宽=${(acc / 6).toFixed(2)}`);
}

console.log('\n=== 策略对照（5 seeds × 5 关） ===');
const seeds = [1, 2, 3, 4, 5];
for (let li = 0; li < 5; li++) {
  const row = { rear3: [], rear2: [], front3: [], rnd: [], pat5: [] };
  for (const s of seeds) {
    let a = run(li, s, st => rearAI(st, 3)); row.rear3.push([a.lit, a.n, a.score, a.maxChain, a.cleared, a.waves]);
    let b = run(li, s, st => rearAI(st, 2)); row.rear2.push([b.lit, b.n, b.score, b.maxChain, b.cleared, b.waves]);
    let c = run(li, s, st => frontAI(st, 3)); row.front3.push([c.lit, c.n, c.score, c.maxChain, c.cleared, c.waves]);
    let d = run(li, s, st => rndAI(st)); row.rnd.push([d.lit, d.n, d.score, d.maxChain, d.cleared, d.waves]);
    let e = run(li, s, st => rearAI(st, 5)); row.pat5.push([e.lit, e.n, e.score, e.maxChain, e.cleared, e.waves]);
  }
  const fmt = arr => {
    const lit = arr.map(x => x[0]), N = arr[0][1];
    const sc = arr.map(x => x[2]), mc = arr.map(x => x[3]);
    const cl = arr.filter(x => x[4]).length;
    const avg = a2 => (a2.reduce((p, q) => p + q, 0) / a2.length).toFixed(0);
    return `点亮 ${avg(lit)}/${N} (${cl}/5通关) 分${avg(sc)} 最大连锁${avg(mc)}`;
  };
  console.log(`L${li + 1} 后缘≥3: ${fmt(row.rear3)}`);
  console.log(`     后缘≥2: ${fmt(row.rear2)}`);
  console.log(`     前缘≥3: ${fmt(row.front3)}`);
  console.log(`     乱点  : ${fmt(row.rnd)}`);
  console.log(`     后缘≥5(耐心): ${fmt(row.pat5)}`);
}
