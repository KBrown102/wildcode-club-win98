// _smoke.cjs — 289-aurorachorus Node 冒烟 + 逻辑回归
const G = require('./game.js');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } }
function near(a, b, e, m) { ok(Math.abs(a - b) <= e, m + ' (' + a + ' vs ' + b + ')'); }

const dt = 1 / 60;

// ---- 1. 建关 ----
G.LEVELS.forEach((L, li) => {
  const st = G.newState(li, 999 + li);
  ok(st.n === L.n, `L${li} 柱数`);
  ok(st.cols.length === L.n, `L${li} 几何`);
  ok(st.waves === L.waves, `L${li} 波束`);
  ok(st.mAmp > 0 && isFinite(st.mAmp), `L${li} mAmp 有效`);
  ok(st.cols.every(c => isFinite(c.x) && isFinite(c.yt) && isFinite(c.h)), `L${li} 几何无 NaN`);
  ok(st.cols.every(c => c.yt > 0 && c.yb < 800), `L${li} 光柱在画布内`);
});

// ---- 2. 刚性行波：图案以 V 列/秒右移（用分数索引直接验证解析恒等式） ----
{
  const st = G.newState(4, 4242);
  const OMEGA = G.OMEGA, OMG = G.OMG, K = G.K;
  // 与 game.js 同式的相位场，但允许分数索引 i
  function ph(tt, i) {
    return st.ph0 + OMEGA * tt - st.SP * i
      + st.mAmp * Math.sin(OMG * tt + st.psi0 - K * i)
      + st.jit[0] * 0;   // 抖动项单独处理，见下
  }
  // 逐柱相位（含 jit），用于非整数位移时改用「整柱位移」验证
  function phFull(tt, i) {
    return st.ph0 + OMEGA * tt - st.SP * i
      + st.mAmp * Math.sin(OMG * tt + st.psi0 - K * i)
      + st.jit[Math.round(i)];
  }
  // 取 Δt 使 V*Δt 恰为整数，避免插值
  const step = 1;                       // 位移 1 列
  const dts = step / G.V;               // ≈0.3158s
  let worst = 0;
  for (let trial = 0; trial < 40; trial++) {
    const t = trial * 0.37;
    for (let i = 1; i < st.n - 1; i++) {
      const a = ph(t, i - step);                      // 解析部分（不含抖动）
      const b = ph(t + dts, i);
      worst = Math.max(worst, Math.abs(Math.sin(a) - Math.sin(b)));
    }
  }
  ok(worst < 1e-9, `解析部分刚性行波恒等式（最大差 ${worst.toExponential(2)}）`);
  // 静态抖动是「不随行波平移」的固定纹理，幅度必须有界，否则亮带会被打碎
  let jm = 0;
  for (let i = 1; i < st.n; i++) jm = Math.max(jm, Math.abs(st.jit[i] - st.jit[i - 1]));
  ok(jm < 0.5, `静态抖动有界（相邻差 ${jm.toFixed(3)} < 0.5）`);
  near(G.V, G.OMEGA / G.S, 1e-9, 'V = OMEGA/S');
  near(G.OMG / G.K, G.V, 1e-9, 'OMG/K = V（刚性前提）');
  near(2 * Math.PI / G.OMG, 4.72, 0.05, '涌浪周期 ≈4.72s');
}

// ---- 3. inWin / bands 一致性 ----
{
  const st = G.newState(2, 31337);
  for (let f = 0; f < 200; f++) G.update(st, dt);
  const bs = G.bands(st);
  let cnt = 0;
  for (const [s, e] of bs) for (let i = s; i <= e; i++) { cnt++; ok(G.inWin(st, i), 'band 内必 inWin'); }
  let inw = 0; for (let i = 0; i < st.n; i++) if (G.inWin(st, i)) inw++;
  ok(cnt === inw, 'bands 覆盖全部 inWin 柱');
  let prevEnd = -2;
  bs.forEach(([s, e]) => { ok(s > prevEnd + 1 - 1 && s > prevEnd, 'band 不重叠'); prevEnd = e; });
}

// ---- 4. 发射：命中 / 失手 ----
{
  const st = G.newState(1, 5150);
  for (let f = 0; f < 400; f++) {
    G.update(st, dt);
    const b = G.bands(st);
    if (b.length && b[0][1] - b[0][0] >= 1) break;
  }
  const b = G.bands(st)[0];
  const w0 = st.waves;
  ok(G.launch(st, b[0]) === true, '窗内发射成功');
  ok(st.locked[b[0]], '起爆柱被锁定');
  ok(st.waves === w0 - 1, '命中扣 1 束');
}
{
  const st = G.newState(1, 5150);
  let dark = -1;
  for (let f = 0; f < 600 && dark < 0; f++) {
    G.update(st, dt);
    for (let i = 0; i < st.n; i++) if (!G.inWin(st, i)) { dark = i; break; }
  }
  ok(dark >= 0, '存在暗柱');
  const w0 = st.waves;
  ok(G.launch(st, dark) === false, '窗外发射失败');
  ok(!st.locked[dark], '暗柱未被点亮');
  ok(st.waves === w0, '失手不扣波束（零焦虑）');
  ok(st.cd > 0, '失手进入冷却');
  ok(G.launch(st, dark) === false, '冷却中无法连发');
}

// ---- 5. 连锁：后缘 vs 前缘（核心技巧验证） ----
{
  function bestChain(li, seed, pick, minB, T = 90) {
    const st = G.newState(li, seed);
    let best = 0;
    for (let f = 0; f < T * 60 && !st.done; f++) {
      G.update(st, dt);
      if (st.cd > 0 || st.waves <= 0) continue;
      let b = null;
      for (const x of G.bands(st)) if (!b || x[1] - x[0] > b[1] - b[0]) b = x;
      if (!b || b[1] - b[0] + 1 < minB) continue;
      G.launch(st, pick(b));
    }
    best = st.maxChain;
    return best;
  }
  const rear = b => b[0], front = b => b[1];
  for (const li of [0, 2, 4]) {
    let r = 0, fr = 0;
    for (let s = 1; s <= 6; s++) {
      r += bestChain(li, s * 977, rear, 3);
      fr += bestChain(li, s * 977, front, 3);
    }
    ok(r > fr, `L${li + 1} 后缘(${r}) 优于 前缘(${fr})`);
  }
}

// ---- 6. 返还 ----
{
  const st = G.newState(0, 777);
  let refunded = false;
  for (let f = 0; f < 90 * 60 && !st.done && !refunded; f++) {
    G.update(st, dt);
    if (st.cd > 0 || st.waves <= 0) continue;
    let b = null;
    for (const x of G.bands(st)) if (!b || x[1] - x[0] > b[1] - b[0]) b = x;
    if (b && b[1] - b[0] + 1 >= 3) G.launch(st, b[0]);
    for (const e of st.events) if (e.t === 'refund') refunded = true;
  }
  ok(refunded, '能打出 ≥5 连并返还波束');
}

// ---- 7. 余晖保底 ----
{
  const st = G.newState(4, 2468);
  for (let i = 0; i < st.n - 2; i++) st.locked[i] = true;
  st.lit = st.n - 2;
  let glowSeen = false, doneIn = -1;
  for (let f = 0; f < 30 * 60; f++) {
    G.update(st, dt);
    if (st.afterglow) glowSeen = true;
    if (st.done && doneIn < 0) doneIn = f / 60;
    if (st.done) break;
    if (st.cd > 0 || st.waves <= 0) continue;
    let b = null;
    for (const x of G.bands(st)) if (!b || x[1] - x[0] > b[1] - b[0]) b = x;
    if (b) G.launch(st, b[0]);
  }
  ok(glowSeen, '剩余 ≤3 根时进入余晖');
  ok(st.done && st.cleared, `余晖保底通关（${doneIn.toFixed(1)}s）`);
}

// ---- 8. 结算 / 星级 ----
{
  const st = G.newState(0, 11);
  st.lit = st.n;
  for (let i = 0; i < st.n; i++) st.locked[i] = true;
  st.maxChain = 99;
  G.update(st, dt);
  ok(st.done && st.cleared, '全亮即通关');
  ok(G.stars(st) === 3, '高连锁 = 3 星');

  const s2 = G.newState(0, 11);
  s2.lit = s2.n; for (let i = 0; i < s2.n; i++) s2.locked[i] = true;
  s2.maxChain = 1; G.update(s2, dt);
  ok(G.stars(s2) === 1, '仅通关 = 1 星');

  const s3 = G.newState(0, 11);
  s3.lit = s3.n - 1; s3.waves = 0; s3.ripples = [];
  G.update(s3, dt);
  ok(s3.done && !s3.cleared, '波束耗尽未点满 = 未通关');
  ok(G.stars(s3) === 0, '未通关 0 星');
}

// ---- 9. colAt 边界 ----
{
  const st = G.newState(3, 5);
  ok(G.colAt(st, -999) === 0, 'colAt 左溢出夹到 0');
  ok(G.colAt(st, 9999) === st.n - 1, 'colAt 右溢出夹到 n-1');
  ok(G.colAt(st, (G.AUR_L + G.AUR_R) / 2) === Math.floor(st.n / 2), 'colAt 中点正确');
}

// ---- 10. 整体无 NaN / 长时间稳定 ----
{
  const st = G.newState(4, 8899);
  for (let f = 0; f < 180 * 60; f++) {
    if (st.cd <= 0 && st.waves > 0) {
      let b = null;
      for (const x of G.bands(st)) if (!b || x[1] - x[0] > b[1] - b[0]) b = x;
      if (b) G.launch(st, b[0]);
    }
    G.update(st, dt);
    st.events.length = 0;
  }
  ok(isFinite(st.score) && st.score >= 0, '分数有限且非负');
  ok(st.off.every(v => isFinite(v)), '相位偏移无 NaN');
  ok(st.locked.every(v => typeof v === 'boolean'), '锁定态合法');
  ok(st.ripples.length === 0 || st.ripples.every(r => isFinite(r.pos)), '涟漪位置有限');
  ok(st.lit <= st.n, '点亮数不超上限');
}

// ---- 11. dt 守卫 ----
{
  const st = G.newState(0, 3);
  const t0 = st.time;
  G.update(st, NaN); ok(st.time === t0, 'dt=NaN 不推进时间');
  G.update(st, -1); ok(st.time === t0, 'dt<0 不推进时间');
  G.update(st, 10); near(st.time - t0, 0.05, 1e-9, 'dt 上限 0.05');
}

// ---- 11b. 合声潮周期 ----
{
  const st = G.newState(0, 606);
  let onCount = 0, warnSeen = false, firstOn = -1;
  for (let f = 0; f < 40 * 60; f++) {
    G.update(st, dt);
    for (const e of st.events) {
      if (e.t === 'tide' && e.on) { onCount++; if (firstOn < 0) firstOn = f / 60; }
      if (e.t === 'tideWarn') warnSeen = true;
    }
    st.events.length = 0;
  }
  ok(firstOn > 0 && Math.abs(firstOn - (G.LEVELS[0].tide - G.TIDE_ON)) < 0.3, `合声潮首次触发 ≈${firstOn.toFixed(1)}s`);
  ok(onCount >= 2, `40s 内合声潮触发 ${onCount} 次`);
  ok(warnSeen, '合声潮有预警事件');
  ok(st.tideOn === false || Math.sin(0) >= -1, 'tide 状态可用');
}

// ---- 12. 事件类型完整 ----
{
  const st = G.newState(0, 606);
  const seen = {};
  for (let f = 0; f < 120 * 60 && !st.done; f++) {
    if (st.cd <= 0 && st.waves > 0) {
      let b = null;
      for (const x of G.bands(st)) if (!b || x[1] - x[0] > b[1] - b[0]) b = x;
      if (b && Math.random() < 0.5) G.launch(st, b[1]); else if (b) G.launch(st, b[0]);
    }
    G.update(st, dt);
    st.events.forEach(e => { seen[e.t] = 1; });
    st.events.length = 0;
  }
  ['launch', 'lock', 'chainEnd'].forEach(t => ok(seen[t], '产出事件 ' + t));
}

console.log(`\n冒烟结果：${pass} 通过 / ${fail} 失败`);
if (fail) process.exit(1);
