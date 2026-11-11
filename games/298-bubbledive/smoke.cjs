/* 298-bubbledive 冒烟测试 */
const B = require('./game.js');
const DT = 1 / 60;
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } }
function grp(t) { console.log('· ' + t); }

const clamp = B.clamp;

/* ---------- 1. 常量与配置 ---------- */
grp('配置自检');
ok(B.LEVELS.length === 8, '8 关');
ok(B.STARS.length === 8 && B.STARS.every(s => s[0] < s[1] && s[1] < s[2]), '三星阈值递增');
for (let i = 1; i < 8; i++) {
  ok(B.LEVELS[i].target >= B.LEVELS[i - 1].target, 'L' + (i + 1) + ' target 不递减');
  ok(B.LEVELS[i].wmin <= B.LEVELS[i - 1].wmin, 'L' + (i + 1) + ' 通道不增宽');
}
ok(B.N0 > B.NMIN && B.N0 < B.NMAX, 'N0 在量程内');

/* ---------- 2. 关卡生成确定性 & 结构 ---------- */
grp('关卡生成确定性 / 结构');
for (let lv = 1; lv <= 8; lv++) {
  for (const sd of [1, 7, 29, 53, 101, 777]) {
    const a = B.genLevel(lv, sd), b = B.genLevel(lv, sd);
    ok(JSON.stringify(a.cre.map(c => [c.x | 0, c.y | 0, c.shy])) === JSON.stringify(b.cre.map(c => [c.x | 0, c.y | 0, c.shy])),
      `L${lv}/${sd} 生成确定`);
    ok(a.cre.length === a.cfg.target + 1, `L${lv}/${sd} 生物数 = target+1`);
    ok(a.vents.length === a.cfg.vents, `L${lv}/${sd} 气穴数`);
    ok(a.cre.filter(c => c.shy).length === a.cfg.shy, `L${lv}/${sd} 害羞数`);
    // 通道恒正
    let bad = 0;
    for (let y = 0; y <= a.WH; y += 10) { const w = B.wallAt(a, y); if (w[1] - w[0] < 20) bad++; }
    ok(bad === 0, `L${lv}/${sd} 通道处处 > 20px`);
    // 起点在中部且是局部最宽
    ok(a.yStart > a.WH * 0.42 && a.yStart < a.WH * 0.68, `L${lv}/${sd} 起点在中部 ${a.yStart}/${a.WH}`);
  }
}

/* ---------- 3. noop 隔离（铁律：不操作不得分） ---------- */
grp('noop 恒 0 分（8 关 × 12 种子）');
for (let lv = 1; lv <= 8; lv++) {
  for (let sd = 1; sd <= 12; sd++) {
    const s = B.makeState(); B.start(s, lv, sd * 13);
    const y0 = s.by;
    let t = 0; while (!s.over && t < B.TLIM + 6) { B.step(s, DT, {}); t += DT; }
    ok(s.got === 0, `L${lv}/s${sd} noop 采集 0（实得 ${s.got}，漂移 ${(s.by - y0).toFixed(0)}px）`);
    ok(s.score === 0, `L${lv}/s${sd} noop 分数 0（实得 ${s.score}）`);
  }
}

/* ---------- 4. 物理：压力—体积耦合 ---------- */
grp('压力—体积耦合物理');
{
  const s = B.makeState(); B.start(s, 1, 5);
  ok(Math.abs(s.V - B.VN) < 1e-6, '起点体积 == 中性体积（noop 不动的根基）');
  // 同一气量下，越深体积越小
  s.n = 120; s.by = 100; B.syncBody(s); const Vhi = s.V;
  s.by = s.WH - 50; B.syncBody(s); const Vlo = s.V;
  ok(Vlo < Vhi, '深处气泡被压缩');
  // 上升自然膨胀 = 正反馈（核心张力）
  const s2 = B.makeState(); B.start(s2, 1, 5);
  let t = 0, v1 = 0, v2 = 0;
  while (t < 3) { B.step(s2, DT, { inflate: s2.tank > 0 }); t += DT; if (t < 1.2) v1 = s2.vy; v2 = s2.vy; }
  ok(v2 < v1, '上升过程中速度递增（自然膨胀正反馈）');
}
{
  // 放气 → 下沉
  const s = B.makeState(); B.start(s, 1, 5);
  let t = 0; while (t < 2.5) { B.step(s, DT, { deflate: true }); t += DT; }
  ok(s.vy > 20, '放气后下沉');
  ok(s.n < B.N0, '放气后气量下降');
}

/* ---------- 5. 通道约束三档 ---------- */
grp('通道约束：自由 / 挤压 / 阻断');
{
  const L = B.genLevel(1, 5);
  const s = B.makeState(); B.start(s, 1, 5);
  // 自由：
  s.n = B.NMIN; s.by = s.L.yStart; B.syncBody(s);
  const w = B.wallAt(s.L, s.by); s.bx = (w[0] + w[1]) / 2;
  B.step(s, DT, {}); ok(s.squeeze === 0, '最小气泡在起点自由通过');
  // 阻断：把气泡撑到远超通道
  const s3 = B.makeState(); B.start(s3, 1, 5);
  s3.n = B.NMAX; s3.by = s3.L.yStart; B.syncBody(s3);
  const w3 = B.wallAt(s3.L, s3.by);
  ok(2 * s3.r <= (w3[1] - w3[0]) * 1.5, '最大气泡直径与通道同量级（保证关卡有张力）');
  // 挤压：直接把大气泡送到窄缝口，必然进入挤压态且被限速
  let sawSq = false, sqSlow = false, sawBlock = false;
  for (const lv of [5, 6, 7, 8]) {
    for (const sd of [3, 11, 29, 47, 53, 71]) {
      const s4 = B.makeState(); B.start(s4, lv, sd);
      /* 找全局最窄处，把满气气泡送过去 */
      let minC = 1e9, minY = s4.L.yStart;
      for (let y = 60; y < s4.WH - 60; y += 4) { const c = B.chanAtY(s4, y); if (c < minC) { minC = c; minY = y; } }
      s4.by = minY; s4.n = B.NMAX; s4.vy = -260; s4.vx = 0;
      const w4 = B.wallAt(s4.L, s4.by); s4.bx = (w4[0] + w4[1]) / 2;
      B.syncBody(s4);
      for (let i = 0; i < 90; i++) {
        B.step(s4, DT, {});
        if (s4.squeeze > 0.05) { sawSq = true; if (Math.abs(s4.vy) < 480) sqSlow = true; }
        if (s4.squeeze >= 0.999) sawBlock = true;
      }
    }
  }
  ok(sawSq, '大气泡进窄缝必进入挤压态');
  ok(sqSlow, '挤压时速度被 vcap 限制');
  ok(sawBlock, '挤压到极限会进入阻断态（逼玩家放气缩小）');
}

/* ---------- 6. 机制必要性：一路充气冲顶不能通关 ---------- */
grp('机制必要性（不做取舍就赢不了）');
{
  let wins = 0, tot = 0;
  for (let lv = 1; lv <= 8; lv++) {
    for (const sd of [3, 11, 29, 47, 53, 71]) {
      const s = B.makeState(); B.start(s, lv, sd);
      let t = 0; while (!s.over && t < B.TLIM + 6) { B.step(s, DT, { inflate: s.tank > 0 }); t += DT; }
      if (s.win) wins++; tot++;
    }
  }
  ok(wins / tot < 0.25, `纯充气冲顶通关率 ${(wins / tot * 100).toFixed(0)}% < 25%`);
}

/* ---------- 7. 资源与边界 ---------- */
grp('资源边界 / 数值守卫');
{
  const s = B.makeState(); B.start(s, 3, 9);
  for (let i = 0; i < 4000; i++) {
    B.step(s, DT, { inflate: true, deflate: true, swim: 1 });
    if (!isFinite(s.by) || !isFinite(s.n) || !isFinite(s.r) || !isFinite(s.vy)) break;
  }
  ok(isFinite(s.by) && isFinite(s.n) && isFinite(s.r) && isFinite(s.vy), '4000 步长跑不崩');
  ok(s.n >= B.NMIN - 1e-6 && s.n <= B.NMAX + 1e-6, '气量恒在量程内');
  ok(s.tank >= 0, '储气罐非负');
  ok(s.by >= 0 && s.by <= s.WH, '气泡不出世界');
  ok(s.r > 0, '半径恒正');
}
{
  const s = B.makeState(); B.start(s, 1, 3);
  B.step(s, NaN, {}); ok(isFinite(s.by), 'dt=NaN 不污染状态');
  B.step(s, -1, {}); ok(isFinite(s.by), 'dt<0 不污染状态');
  B.step(s, 1e6, {}); ok(isFinite(s.by), 'dt 过大被钳制');
}

/* ---------- 8. 计分：完成度缩放（铁律） ---------- */
grp('计分随完成度缩放');
{
  const s = B.makeState(); B.start(s, 5, 3);
  s.got = 0; B.finish(s, false);
  ok(s.score === 0, 'got=0 → 0 分（溢价分被完成度清零）');
  const s2 = B.makeState(); B.start(s2, 5, 3);
  s2.got = s2.target; s2.n = 180; s2.tank = 180; s2.time = 10; B.finish(s2, true);
  ok(s2.score > 0 && s2.win, '满完成度通关有分');
  const s3 = B.makeState(); B.start(s3, 5, 3);
  s3.got = Math.max(1, Math.floor(s3.target / 2)); s3.n = 180; s3.tank = 180; s3.time = 10; B.finish(s3, false);
  ok(s3.score < s2.score, '半完成度得分低于满完成度');
}

/* ---------- 9. 沉底软兜底 ---------- */
grp('沉底软兜底（暗流回气）');
{
  const s = B.makeState(); B.start(s, 2, 7);
  s.n = B.NMIN; s.tank = 0; s.by = s.WH - 10; s.vy = 50;
  let got = false;
  for (let i = 0; i < 200; i++) { B.step(s, DT, {}); if (s.tank > 0) got = true; }
  ok(got, '气尽沉底后暗流回一点气（不会死锁）');
}

/* ---------- 10. AI 四档对照（技能梯度） ---------- */
grp('AI 四档对照');
function nearestCre(s) {
  var best = null, bd = 1e9;
  for (var i = 0; i < s.L.cre.length; i++) {
    var c = s.L.cre[i]; if (c.got) continue;
    var d = Math.abs(c.y - s.by) + Math.abs(c.x - s.bx) * 0.45 + (c.shy ? 40 : 0);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
function nearestVent(s) {
  var best = null, bd = 1e9;
  for (var i = 0; i < s.L.vents.length; i++) {
    var v = s.L.vents[i]; if (v.cd > 0) continue;
    var d = Math.abs(v.y - s.by) + Math.abs(v.x - s.bx) * 0.4;
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}
const AI = {
  noop: () => ({}),
  random: (s, rnd) => ({ inflate: rnd() < 0.30, deflate: rnd() < 0.26, swim: rnd() < 0.2 ? (rnd() < 0.5 ? -1 : 1) : 0 }),
  mid: (s) => {
    var c = nearestCre(s);
    if (!c) return { inflate: s.tank > 0 && s.vy > -200 };
    var dx = c.x - s.bx, dy = c.y - s.by;
    var swim = Math.abs(dx) > 14 ? (dx > 0 ? 1 : -1) : 0;
    if (s.tank <= 6) {
      var v = nearestVent(s);
      if (v) {
        var vdx = v.x - s.bx, vdy = v.y - s.by;
        swim = Math.abs(vdx) > 14 ? (vdx > 0 ? 1 : -1) : 0;
        return { inflate: vdy < 0 && s.tank > 0, deflate: vdy > 60, swim: swim };
      }
    }
    return { inflate: dy < -20 && s.tank > 0, deflate: dy > 20, swim: swim };
  },
  strong: (s) => {
    const G = B.G, DAMP = 2.40, VN = B.VN, KR = B.KR;
    function drive(des, swim, capV) {
      var Vt = VN * (1 - des * DAMP / G);
      if (capV !== undefined) Vt = Math.min(Vt, capV);
      var nT = clamp(Vt * s.P, B.NMIN, B.NMAX);
      if (nT < s.n - 1.5) return { deflate: true, swim: swim };
      if (nT > s.n + 1.5 && s.tank > 0) return { inflate: true, swim: swim };
      return { swim: swim };
    }
    if (s.tank <= 8) {
      var v = nearestVent(s);
      if (v) {
        var vdx = v.x - s.bx, vdy = v.y - s.by;
        var vs = Math.abs(vdx) > 12 ? (vdx > 0 ? 1 : -1) : 0;
        return drive(clamp(vdy * 1.6, -200, 200), vs);
      }
    }
    var c = nearestCre(s);
    if (!c) return drive(-235, 0);
    var dx = c.x - s.bx, dy = c.y - s.by;
    var swim = Math.abs(dx) > 10 ? (dx > 0 ? 1 : -1) : 0;
    var ady = Math.abs(dy);
    var des = ady < 42 ? clamp(dy * 2.1, -110, 110)
      : (dy > 0 ? clamp(75 + ady * 0.9, 0, 215) : clamp(-75 - ady * 0.9, -240, 0));
    var ahead = clamp(s.by + (des < 0 ? -46 : 46), 0, s.WH);
    var chan = Math.min(B.chanAtY(s, s.by), B.chanAtY(s, ahead));
    var capV = Math.pow(chan * 1.38 / 2 / KR, 2);
    if (c.shy && ady < 300) capV = Math.min(capV, Math.pow((B.RSHY - 2) / KR, 2));
    var hardCap = VN * (1 + 235 * DAMP / G);
    return drive(clamp(des, -235, 220), swim, Math.min(capV, hardCap));
  }
};
function play(lv, seed, kind) {
  const s = B.makeState(); B.start(s, lv, seed);
  const rnd = B.mulberry32(lv * 977 + seed * 31 + 7);
  let t = 0;
  while (!s.over && t < B.TLIM + 5) { B.step(s, DT, AI[kind](s, rnd)); t += DT; }
  if (!s.over) B.finish(s, false);
  return s.score;
}
{
  const SEEDS = [3, 11, 29, 47, 53, 71];
  const avg = { noop: 0, random: 0, mid: 0, strong: 0 };
  for (let lv = 1; lv <= 8; lv++) for (const sd of SEEDS) {
    for (const k of Object.keys(avg)) avg[k] += play(lv, sd, k) / (8 * SEEDS.length);
  }
  console.log(`    noop ${avg.noop.toFixed(1)} | random ${avg.random.toFixed(1)} | mid ${avg.mid.toFixed(1)} | strong ${avg.strong.toFixed(1)}`);
  ok(avg.noop === 0, 'noop 均分 0');
  ok(avg.random > avg.noop, 'random > noop');
  ok(avg.mid > avg.random * 2.2, `mid 是 random 的 ${(avg.mid / avg.random).toFixed(1)} 倍（>2.2×）`);
  ok(avg.strong > avg.random * 2.2, `strong 是 random 的 ${(avg.strong / avg.random).toFixed(1)} 倍（>2.2×）`);
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
