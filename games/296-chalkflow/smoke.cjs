/* 296-chalkflow《粉线 · 引珠坡》Node 冒烟测试 */
const C = require('./game.js');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; if (fail < 40) console.log('  ✗ ' + m); } }
function sec(m) { console.log('— ' + m); }
const finite = v => typeof v === 'number' && isFinite(v);

/* ---------- 1. 模块与常量 ---------- */
sec('模块与常量');
ok(!!C && typeof C.makeLevel === 'function', 'game.js 导出 makeLevel');
ok(C.LEVELS.length === 8, '8 个关卡');
ok(C.COLORS.length === 5, '5 色粉笔');
ok(C.BASE_W === 560, '世界宽 560');

/* ---------- 2. 关卡生成确定性 ---------- */
sec('关卡生成确定性 / 几何合法');
for (let lv = 0; lv < 8; lv++) {
  for (const H of [680, 760, 880, 980]) {
    const a = C.makeLevel(lv, 12345, H), b = C.makeLevel(lv, 12345, H);
    ok(JSON.stringify(a.bins) === JSON.stringify(b.bins), `L${lv + 1}/H${H} 桶确定`);
    ok(JSON.stringify(a.rocks.map(r => [r.x, r.y, r.r])) === JSON.stringify(b.rocks.map(r => [r.x, r.y, r.r])), `L${lv + 1}/H${H} 石确定`);
    a.bins.forEach(bn => {
      ok(bn.x >= 0 && bn.x + bn.w <= C.BASE_W + 0.01, `L${lv + 1}/H${H} 桶在纸内`);
      ok(bn.y + bn.h <= H + 0.01 && bn.y > H * 0.5, `L${lv + 1}/H${H} 桶贴底`);
    });
    a.rocks.forEach(rk => {
      ok(rk.x - rk.r >= 0 && rk.x + rk.r <= C.BASE_W, `L${lv + 1}/H${H} 石在纸内 x`);
      ok(rk.y - rk.r >= 0 && rk.y + rk.r <= H, `L${lv + 1}/H${H} 石在纸内 y`);
    });
    // 桶互不重叠
    for (let i = 0; i < a.bins.length; i++) for (let j = i + 1; j < a.bins.length; j++) {
      ok(a.bins[i].x + a.bins[i].w <= a.bins[j].x + 0.5 || a.bins[j].x + a.bins[j].w <= a.bins[i].x + 0.5, `L${lv + 1}/H${H} 桶不重叠`);
    }
    // 漏斗不在任何桶正上方（不操作 0 分的几何前提）
    a.bins.forEach(bn => ok(!(a.funnel.x > bn.x + 4 && a.funnel.x < bn.x + bn.w - 4), `L${lv + 1}/H${H} 漏斗不在桶正上方`));
  }
}

/* ---------- 3. 不操作 = 0 分（核心机制必要性） ---------- */
sec('不操作 = 0 分（8 关 × 4 种高度 × 3 种子）');
for (let lv = 0; lv < 8; lv++) {
  for (const H of [680, 760, 880, 980]) {
    for (const sd of [1, 7, 20260910]) {
      const st = C.runAI(lv, sd, 'noop', H);
      ok(st.score === 0, `L${lv + 1}/H${H}/s${sd} noop 0 分（实得 ${st.score}）`);
      ok(st.caught === 0, `L${lv + 1}/H${H}/s${sd} noop 0 进桶`);
    }
  }
}

/* ---------- 4. 画线与粉笔账 ---------- */
sec('画线 / 粉笔账 / 擦除');
{
  const st = C.makeLevel(0, 1, 760); st.rndf = C.mulberry32(38);
  const c0 = st.chalk;
  const pts = C.resample([{ x: 40, y: 200 }, { x: 300, y: 320 }]);
  const r = C.addStroke(st, pts, 0);
  ok(r.ok === true, '画线成功');
  ok(Math.abs(st.chalk - (c0 - r.len)) < 1e-6, '粉笔按长度扣');
  ok(st.strokes.length === 1 && st.segs.length === pts.length - 1, '线段数 = 点数-1');
  const id = r.id;
  const before = st.chalk;
  ok(C.eraseStroke(st, id) === true, '按 id 擦除成功');
  ok(Math.abs(st.chalk - before - r.len * 0.6) < 1e-6 || st.chalk === st.chalkMax, '擦除返还 60%');
  ok(st.strokes.length === 0 && st.segs.length === 0, '擦除后清空');
  ok(C.eraseStroke(st, id) === false, '重复擦除返回 false');

  // 太短的线被拒
  const r2 = C.addStroke(st, [{ x: 10, y: 10 }, { x: 13, y: 12 }], 0);
  ok(r2.ok === false && r2.reason === 'short', '过短的线被拒');

  // 粉笔不足 → 截断
  const st2 = C.makeLevel(0, 1, 760); st2.rndf = C.mulberry32(38);
  st2.chalk = 60;
  const r3 = C.addStroke(st2, C.resample([{ x: 10, y: 300 }, { x: 500, y: 300 }]), 0);
  ok(r3.ok === true && r3.len <= 60.5, `粉笔不足时截断（len=${r3.len && r3.len.toFixed(1)}）`);
  ok(st2.chalk >= -1e-6, '粉笔不会变负');

  // 上限封顶
  const st3 = C.makeLevel(0, 1, 760); st3.rndf = C.mulberry32(38);
  C.addStroke(st3, C.resample([{ x: 20, y: 300 }, { x: 260, y: 340 }]), 0);
  C.clearStrokes(st3);
  ok(st3.chalk <= st3.chalkMax + 1e-6, '返还不超过上限');
  ok(st3.strokes.length === 0, '全擦清空');
  ok(C.clearStrokes(st3) === false, '空场全擦返回 false');
}

/* ---------- 5. 粉笔过不了墨石 ---------- */
sec('粉笔过不了墨石');
for (let lv = 0; lv < 8; lv++) {
  const st = C.makeLevel(lv, 1, 760); st.rndf = C.mulberry32(38);
  if (!st.rocks.length) continue;
  const rk = st.rocks[0];
  const r = C.addStroke(st, [{ x: rk.x, y: rk.y }, { x: rk.x + 4, y: rk.y + 4 }], 0);
  ok(r.ok === false && r.reason === 'rock', `L${lv + 1} 石内起笔被拒`);
  const r2 = C.addStroke(st, C.resample([{ x: 12, y: rk.y }, { x: C.BASE_W - 12, y: rk.y }]), 0);
  if (r2.ok) {
    const s = st.strokes[st.strokes.length - 1];
    let inside = 0;
    s.pts.forEach(p => { if (Math.hypot(p.x - rk.x, p.y - rk.y) < rk.r + C.SR - 0.01) inside++; });
    ok(inside === 0, `L${lv + 1} 线不穿过石头`);
  } else ok(true, `L${lv + 1} 线被石头挡住`);
}

/* ---------- 6. 命中测试 ---------- */
sec('命中测试 / 点线擦除');
{
  const st = C.makeLevel(0, 1, 760); st.rndf = C.mulberry32(38);
  C.addStroke(st, C.resample([{ x: 100, y: 300 }, { x: 400, y: 300 }]), 0);
  ok(C.strokeAt(st, 250, 300, 15) !== null, '线上可命中');
  ok(C.strokeAt(st, 250, 340, 15) === null, '线外不命中');
  ok(C.eraseAt(st, 250, 300) === true, '点线擦除成功');
  ok(st.strokes.length === 0, '点线擦除后为空');
  ok(C.eraseAt(st, 250, 300) === false, '空场点擦返回 false');
}

/* ---------- 7. 物理：不穿透 / 不 NaN / 不崩 ---------- */
sec('物理：不穿透 / 不 NaN');
{
  // 水平线挡住高速下落珠（防穿透）
  const st = C.makeLevel(0, 1, 760); st.rndf = C.mulberry32(38);
  C.addStroke(st, C.resample([{ x: 20, y: 500 }, { x: 540, y: 500 }]), 0);
  st.balls.push({ x: 280, y: 60, vx: 0, vy: 0, r: C.BR, idle: 0, spin: 0, born: 0, id: 99, hue: 0 });
  let above = true;
  for (let i = 0; i < 600; i++) { C.step(st, 1 / 60); if (st.balls.length && st.balls[0].y > 520) above = false; }
  ok(above || st.balls.length === 0, '高速下落不穿透水平线');

  // 长跑不崩、不出 NaN
  const st2 = C.makeLevel(7, 3, 900); st2.rndf = C.mulberry32(100);
  C.addStroke(st2, C.resample([{ x: 20, y: 400 }, { x: 300, y: 560 }]), 1);
  C.addStroke(st2, C.resample([{ x: 300, y: 560 }, { x: 520, y: 640 }]), 2);
  let bad = 0;
  for (let i = 0; i < 4000; i++) {
    C.step(st2, 1 / 60);
    st2.balls.forEach(b => { if (!finite(b.x) || !finite(b.y) || !finite(b.vx) || !finite(b.vy)) bad++; });
    if (bad) break;
  }
  ok(bad === 0, '4000 步长跑无 NaN');
  ok(st2.balls.every(b => b.x > -200 && b.x < C.BASE_W + 200), '球不出横向安全范围');

  // dt 守卫
  const st3 = C.makeLevel(1, 5, 760); st3.rndf = C.mulberry32(5);
  const t0 = st3.time;
  C.step(st3, NaN); C.step(st3, -1); C.step(st3, 999);
  ok(finite(st3.time) && st3.time - t0 <= 0.05 + 1e-9, 'dt 异常被夹紧');
  ok(st3.balls.every(b => finite(b.x) && finite(b.y)), 'dt 异常后球仍有限');
}

/* ---------- 8. 磨损 ---------- */
sec('磨损机制');
{
  const st = C.makeLevel(0, 1, 760); st.rndf = C.mulberry32(38);
  C.addStroke(st, C.resample([{ x: 60, y: 260 }, { x: 420, y: 600 }]), 0);
  const segs = st.strokes[0].segs;
  ok(segs.every(s => s.hp === 1), '新线 hp 全 1');
  // 反复放珠冲同一条线
  for (let k = 0; k < 14; k++) {
    st.balls.push({ x: 70, y: 200, vx: 0, vy: 0, r: C.BR, idle: 0, spin: 0, born: 0, id: 1000 + k, hue: k % 5 });
    for (let i = 0; i < 200; i++) C.step(st, 1 / 60);
  }
  const deadN = segs.filter(s => s.hp <= 0).length;
  ok(deadN > 0, `反复滚压后线段被磨穿（${deadN}/${segs.length}）`);
  ok(segs.every(s => s.hp >= 0 && s.hp <= 1), 'hp 始终在 [0,1]');
  const st2 = C.makeLevel(0, 1, 760); st2.rndf = C.mulberry32(38);
  C.addStroke(st2, C.resample([{ x: 60, y: 260 }, { x: 420, y: 600 }]), 0);
  ok(st2.strokes[0].segs.every(s => s.hp === 1), '不滚就不磨（静止不磨损）');
}

/* ---------- 9. 进桶计分 / 高分桶回粉笔 ---------- */
sec('进桶计分 / 充电宝回血');
for (let lv = 0; lv < 8; lv++) {
  const st = C.makeLevel(lv, 1, 760); st.rndf = C.mulberry32(38);
  const bn = st.bins[0];
  st.chalk = st.chalkMax - 120;
  const c0 = st.chalk, s0 = st.score;
  st.balls.push({ x: bn.cx, y: bn.y + 20, vx: 0, vy: 60, r: C.BR, idle: 0, spin: 0, born: 0, id: 7, hue: 0 });
  C.step(st, 1 / 60);
  ok(st.score === s0 + bn.val, `L${lv + 1} 进桶加分 ${bn.val}`);
  ok(st.caught === 1 && st.balls.length === 0, `L${lv + 1} 进桶后移除`);
  if (bn.val >= 5) ok(st.chalk > c0, `L${lv + 1} 高分桶回粉笔`);
}

/* ---------- 10. 发球规则 ---------- */
sec('发球 / 提前发球');
{
  const st = C.makeLevel(0, 1, 760); st.rndf = C.mulberry32(38);
  ok(C.spawnNow(st) === true, '可提前发球');
  ok(st.balls.length === 1 && st.toSpawn === st.N - 1, '提前发球扣配额');
  for (let i = 0; i < 40; i++) C.spawnNow(st);
  ok(st.balls.length <= C.MAX_FIELD, `场上球不超过 ${C.MAX_FIELD}`);
  st.balls.length = 0;
  for (let i = 0; i < 400 && st.toSpawn > 0; i++) C.spawnNow(st), st.balls.length = 0;
  ok(st.toSpawn === 0, '配额发完为止');
  ok(C.spawnNow(st) === false, '发完后不能再发');
}

/* ---------- 11. 三星阈值 ---------- */
sec('三星阈值');
for (let lv = 0; lv < 8; lv++) {
  const st = C.makeLevel(lv, 1, 760);
  const th = C.starThresholds(st);
  ok(th[0] < th[1] && th[1] < th[2], `L${lv + 1} 阈值递增`);
  const mx = Math.max.apply(null, st.bins.map(b => b.val)) * st.N;
  ok(th[2] <= mx, `L${lv + 1} 三星不超过理论满分`);
  ok(th[0] > 0, `L${lv + 1} 一星 > 0`);
}

/* ---------- 12. AI 对照：技能差距 ---------- */
sec('AI 对照（技能差距）');
{
  const seeds = [1, 2, 3, 4, 5];
  const sum = { noop: 0, random: 0, mid: 0, strong: 0 };
  for (let lv = 0; lv < 8; lv++) {
    const got = { noop: 0, random: 0, mid: 0, strong: 0 };
    for (const sd of seeds) for (const k in got) got[k] += C.runAI(lv, sd, k, 760).score;
    for (const k in got) { got[k] /= seeds.length; sum[k] += got[k]; }
    ok(got.noop === 0, `L${lv + 1} noop 0`);
    ok(got.strong > got.mid, `L${lv + 1} strong(${got.strong.toFixed(0)}) > mid(${got.mid.toFixed(0)})`);
    ok(got.mid > got.random, `L${lv + 1} mid > random(${got.random.toFixed(0)})`);
    ok(got.strong >= got.random * 1.8, `L${lv + 1} strong ≥ 1.8× random`);
  }
  ok(sum.random > 0, 'random 有分（说明不是全 0 的死关）');
  ok(sum.strong > sum.mid * 1.1, `总 strong(${sum.strong.toFixed(0)}) > 1.1× mid(${sum.mid.toFixed(0)})`);
  console.log(`  合计 noop ${sum.noop} / random ${sum.random.toFixed(0)} / mid ${sum.mid.toFixed(0)} / strong ${sum.strong.toFixed(0)}`);
}

/* ---------- 13. 结算与结束条件 ---------- */
sec('结算 / 结束条件');
for (let lv = 0; lv < 8; lv++) {
  const st = C.runAI(lv, 2, 'noop', 760);
  ok(st.done === true, `L${lv + 1} 会自然结束`);
  ok(st.star === 0, `L${lv + 1} 0 分 = 0 星`);
  ok(st.spawned === st.N && st.toSpawn === 0, `L${lv + 1} 全部发完`);
  ok(st.caught + st.lost === st.N, `L${lv + 1} 进桶+丢失 = 总数`);
  const st2 = C.runAI(lv, 2, 'strong', 760);
  ok(st2.done === true, `L${lv + 1} strong 跑完`);
  ok(st2.star >= 1, `L${lv + 1} strong 至少 1 星（实得 ${st2.star}）`);
}

/* ---------- 14. 边界与鲁棒 ---------- */
sec('边界与鲁棒');
{
  const st = C.makeLevel(3, 9, 760); st.rndf = C.mulberry32(9);
  ok(C.addStroke(st, null, 0).ok === false, 'null 输入被拒');
  ok(C.addStroke(st, [{ x: 1, y: 1 }], 0).ok === false, '单点被拒');
  const r = C.addStroke(st, C.resample([{ x: -50, y: 300 }, { x: 600, y: 300 }]), 0);
  ok(r.ok === true, '越界坐标也能画（不做硬裁剪）');
  st.balls.push({ x: -60, y: 300, vx: -400, vy: 0, r: C.BR, idle: 0, spin: 0, born: 0, id: 5, hue: 0 });
  for (let i = 0; i < 120; i++) C.step(st, 1 / 60);
  ok(st.balls.every(b => b.x > -80), '左侧飞出的球被回收');
  // 场上无球无配额立即结束
  const st2 = C.makeLevel(0, 1, 760); st2.rndf = C.mulberry32(1);
  st2.toSpawn = 0; st2.time = 2; st2.balls.length = 0;
  C.step(st2, 1 / 60);
  ok(st2.done === true, '无球无配额 → 结束');
}

console.log(`\n冒烟结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
