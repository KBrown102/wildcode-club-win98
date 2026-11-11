/* 293-scalebeam 冒烟测试（纯逻辑，Node 直跑） */
require('./game.js');
const G = globalThis.ScaleBeam;

let pass = 0, fail = 0;
function ok(c, msg) { if (c) pass++; else { fail++; console.log('  ✗ ' + msg); } }
function near(a, b, eps, msg) { ok(Math.abs(a - b) <= eps, msg + ' (got ' + a + ' want ' + b + ')'); }

const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const DT = 1 / 60;

/* ---------- 1. 关卡与晶簇几何 ---------- */
console.log('[1] 几何 / 晶簇');
for (let li = 0; li < G.LEVELS.length; li++) {
  const L = G.LEVELS[li];
  const st = G.newState(li, 20260909);
  ok(st.cr.length === L.n, 'L' + (li + 1) + ' 晶簇数量');
  ok(st.queue.length === L.quota, 'L' + (li + 1) + ' 星屑配额');
  for (const c of st.cr) {
    ok(c.x > 6 && c.x < G.W - 6, '晶簇 x 在画布内');
    ok(c.y > G.PY + 40 && c.y < G.BRINE_Y, '晶簇 y 在杆下方 / 水面之上');
    // 实际极角 = 请求极角
    const real = Math.atan2(c.x - G.PX, c.y - G.PY) * R2D;
    const want = c.phi * R2D;
    near(real, want, 0.6, '晶簇极角');
    ok(Math.abs(want) >= 11 && Math.abs(want) <= 60, '晶簇极角在可达范围');
  }
  // 同侧相邻晶簇角距 > 2*TOL
  const angs = st.cr.map(c => c.phi * R2D).sort((a, b) => a - b);
  for (let i = 1; i < angs.length; i++) {
    const d = angs[i] - angs[i - 1];
    ok(d > G.TOL * R2D * 2 - 0.01 || d < 0.001, 'L' + (li + 1) + ' 相邻晶簇角距 ' + d.toFixed(1) + '° > ' + (G.TOL * R2D * 2).toFixed(1) + '°');
  }
  ok(st.slots.length === L.slots, 'L' + (li + 1) + ' 落口数');
  for (const s of st.slots) ok(s > 8 && s < G.W - 8, '落口在画布内');
}

/* ---------- 2. 固定种子确定性 ---------- */
console.log('[2] 确定性');
{
  const a = G.newState(3, 777), b = G.newState(3, 777);
  ok(JSON.stringify(a.cr) === JSON.stringify(b.cr), '同种子晶簇一致');
  ok(JSON.stringify(a.queue) === JSON.stringify(b.queue), '同种子星屑队列一致');
  const c = G.newState(3, 778);
  ok(JSON.stringify(a.queue) !== JSON.stringify(c.queue), '不同种子队列不同');
}

/* ---------- 3. 物理：中性平衡 / 阻尼 / 倾覆 ---------- */
console.log('[3] 物理');
{
  const st = G.newState(0, 1); st.sandbox = true;
  for (let i = 0; i < 120; i++) { st.events.length = 0; G.update(st, DT); }
  near(st.th, 0, 1e-9, '空秤 2 秒不动');
  near(st.w, 0, 1e-9, '空秤角速度为 0');
}
{
  const st = G.newState(0, 1); st.sandbox = true;
  G.moveWeight(st, 1, 1.0);                 // 秤锤推到最右
  ok(Math.abs(st.wp - G.HL) < 1e-6, '秤锤右移到端点');
  G.moveWeight(st, 1, 1.0);
  ok(Math.abs(st.wp - G.HL) < 1e-6, '秤锤被夹在 HL');
  for (let i = 0; i < 60 * 12 && st.tips === 0; i++) { st.events.length = 0; G.update(st, DT); }
  ok(st.tips === 1, '净力矩持续 → 必倾覆');
  ok(st.loads.length === 0, '倾覆清空载荷');
  for (let i = 0; i < 60 * 2; i++) { st.events.length = 0; G.update(st, DT); }
  near(st.th, 0, 1e-6, '倾覆后回正到 0');
}
{
  const st = G.newState(0, 1); st.sandbox = true;
  st.wp = 40; st.th = 0.4; st.w = 0.9;      // 有力矩 + 有初速
  G.setBrake(st, true);
  let n = 0; while (Math.abs(st.w) > 0.05 && n++ < 600) { st.events.length = 0; G.update(st, DT); }
  ok(n < 600, '镇秤能把摆动吃掉（' + n + ' 帧）');
  ok(st.energy < 1, '镇秤消耗能量');
  G.setBrake(st, false);
}
{
  // 镇秤能量耗尽后自动松开
  const st = G.newState(0, 1); st.sandbox = true; st.th = 0.5; st.w = 1.2;
  G.setBrake(st, true);
  for (let i = 0; i < 60 * 5; i++) { st.events.length = 0; G.update(st, DT); }
  ok(st.energy === 0, '能量耗尽为 0');
  ok(st.brake === false, '能量耗尽自动松开镇');
}

/* ---------- 4. 星屑落点 ---------- */
console.log('[4] 落点');
{
  const st = G.newState(0, 1); st.sandbox = true; st.th = 0;
  const x = G.PX + 60;
  st.stars.push({ x: x, y: 0, m: 2, r: 8, vy: 200 });
  for (let i = 0; i < 120 && st.loads.length === 0; i++) { st.events.length = 0; G.update(st, DT); }
  ok(st.loads.length === 1, '星屑落到杆上');
  near(st.loads[0].s, 60, 0.8, '落点力臂 = x 差');
}
{
  // 倾斜时力臂放大
  const st = G.newState(0, 1); st.sandbox = true; st.th = 45 * D2R;
  const x = G.PX + 60;
  st.stars.push({ x: x, y: 0, m: 2, r: 8, vy: 200 });
  for (let i = 0; i < 200 && st.loads.length === 0; i++) { st.events.length = 0; G.update(st, DT); }
  ok(st.loads.length === 1, '倾斜时仍能落杆');
  ok(st.loads[0].s > 80, '倾斜 45° 力臂放大到 ' + st.loads[0].s.toFixed(1));
}
{
  // 落空 → 卤水
  const st = G.newState(0, 1); st.sandbox = true;
  st.stars.push({ x: 12, y: 0, m: 1, r: 6, vy: 300 });
  let miss = 0;
  for (let i = 0; i < 200; i++) { st.events.length = 0; G.update(st, DT); if (st.events.some(e => e.t === 'miss')) miss++; }
  ok(miss === 1 && st.loads.length === 0, '杆外的星屑落入卤水');
}

/* ---------- 5. 充能：必须「停得住」 ---------- */
console.log('[5] 充能');
{
  const st = G.newState(0, 1); st.sandbox = true;
  const c0 = st.cr[0];
  st.th = c0.phi; st.w = 0;
  st.wp = -(0) ;                       // 空秤，净力矩 0
  for (let i = 0; i < 90; i++) { st.events.length = 0; G.update(st, DT); }
  ok(c0.ch > 0.9, '停稳 1.5 秒 → 充满 (' + c0.ch.toFixed(2) + ')');
  ok(st.lit === 1, '充满即点亮');
  near(st.energy, 1, 1e-9, '点亮回满镇秤能量');
}
{
  const st = G.newState(0, 1); st.sandbox = true;
  const c0 = st.cr[0];
  st.th = c0.phi; st.w = 0.55;         // 晃着照
  for (let i = 0; i < 60 * 3; i++) { st.events.length = 0; G.update(st, DT); st.th = c0.phi; st.w = 0.55; }
  ok(c0.ch < 0.05, '晃动中几乎不充能 (' + c0.ch.toFixed(3) + ')');
}
{
  // 载重加速充能
  function chargeWith(mass) {
    const st = G.newState(0, 1); st.sandbox = true;
    const c0 = st.cr[0]; st.th = c0.phi; st.w = 0; st.wp = 0;
    if (mass) st.loads.push({ s: 0.0001, m: mass, r: 8, id: 1 });  // 力臂≈0 不产生力矩
    let f = 0; while (st.lit === 0 && f++ < 60 * 10) { st.events.length = 0; G.update(st, DT); st.th = c0.phi; st.w = 0; }
    return f / 60;
  }
  const t0 = chargeWith(0), t1 = chargeWith(12);
  ok(t1 < t0 * 0.75, '载重 12 充能更快 (' + t0.toFixed(2) + 's → ' + t1.toFixed(2) + 's)');
}
{
  // 角度偏出容差 → 不充能并缓慢回落
  const st = G.newState(0, 1); st.sandbox = true;
  const c0 = st.cr[0]; st.th = c0.phi + G.TOL + 0.12; st.w = 0; st.wp = 0;
  for (let i = 0; i < 60; i++) { st.events.length = 0; G.update(st, DT); st.th = c0.phi + G.TOL + 0.12; st.w = 0; }
  ok(c0.ch === 0, '偏出容差不充能');
  c0.ch = 0.5;
  for (let i = 0; i < 60; i++) { st.events.length = 0; G.update(st, DT); st.th = c0.phi + G.TOL + 0.12; st.w = 0; }
  ok(c0.ch < 0.5 && c0.ch > 0.02, '偏出后缓慢回落 (' + c0.ch.toFixed(2) + ')');
}

/* ---------- 6. 卸载 ---------- */
console.log('[6] 卸载');
{
  const st = G.newState(0, 1); st.sandbox = true;
  st.loads.push({ s: 20, m: 1, r: 6, id: 1 }, { s: -140, m: 4, r: 12, id: 2 }, { s: 90, m: 2, r: 8, id: 3 });
  const n0 = st.unloads;
  ok(G.unload(st) === true, '卸载成功');
  ok(st.loads.length === 2, '卸掉一颗');
  ok(st.loads.every(l => Math.abs(l.s) !== 140), '卸掉的是力臂最长的');
  ok(st.unloads === n0 - 1, '卸载次数 -1');
  st.unloads = 0;
  ok(G.unload(st) === false, '次数用尽后不能卸');
  st.unloads = 2; st.loads.length = 0;
  ok(G.unload(st) === false, '空杆不能卸');
}

/* ---------- 7. 结算与星级 ---------- */
console.log('[7] 结算');
{
  const st = G.newState(0, 1); st.sandbox = true;
  st.lit = 2; st.spawned = 4; st.tips = 0;
  const r = G.makeResult(st, 'clear');
  ok(r.score === 2 * 100 + (10 - 4) * 18 + 120, '结算分数 = ' + r.score);
  ok(G.starsOf(0, r) === 3, '满分 3 星');
  ok(G.starsOf(0, { score: 0 }) === 0, '0 分 0 星');
  ok(G.starsOf(0, { score: 300 }) === 2, '300 分 2 星');
}

/* ---------- 8. AI 可通关（全部关卡 × 6 种子） ---------- */
console.log('[8] AI 可通关性');
{
  const HL = G.HL, MW = G.MW;
  function ai(st) {
    let tg = -1, bd = 1e9;
    for (let i = 0; i < st.cr.length; i++) {
      if (st.cr[i].lit) continue;
      const d = Math.abs(st.th - st.cr[i].phi);
      if (d < bd) { bd = d; tg = i; }
    }
    if (tg < 0) { G.setBrake(st, false); return; }
    const err = st.cr[tg].phi - st.th;
    const n = G.net(st);
    const a = 6.2 * err - 3.6 * st.w;
    const Sreq = a * n.I / (215 * Math.max(0.25, Math.cos(st.th)));
    let wpWant = (Sreq - (n.S - MW * st.wp)) / MW;
    wpWant = Math.max(-HL, Math.min(HL, wpWant));
    const d = wpWant - st.wp;
    G.moveWeight(st, d > 1.5 ? 1 : (d < -1.5 ? -1 : 0), DT);
    G.setBrake(st, Math.abs(err) < 0.10 && Math.abs(st.w) > 0.22 && st.energy > 0.05);
    if (Math.abs(n.S) > MW * HL * 0.86 && st.unloads > 0) G.unload(st);
  }
  let cleared = 0, total = 0, sumLit = 0, sumNeed = 0;
  for (let li = 0; li < G.LEVELS.length; li++) {
    for (const sd of [1, 7, 91, 404, 2026, 31337]) {
      total++;
      const st = G.newState(li, sd);
      let g = 0;
      while (st.phase !== 'end' && g++ < 60 * 300) {
        st.events.length = 0; ai(st); G.update(st, DT);
      }
      sumLit += st.result.lit; sumNeed += st.result.n;
      if (st.result.lit >= st.result.n) cleared++;
    }
  }
  ok(cleared >= total * 0.85, 'AI 通关率 ' + cleared + '/' + total);
  ok(sumLit / sumNeed > 0.95, 'AI 点亮率 ' + (sumLit / sumNeed * 100).toFixed(1) + '%');
}

/* ---------- 9. 不操作 / 乱按 必然失败（核心机制必要性） ---------- */
console.log('[9] 对照');
{
  function run(li, sd, mode) {
    const st = G.newState(li, sd);
    let g = 0, dir = 0;
    while (st.phase !== 'end' && g++ < 60 * 300) {
      st.events.length = 0;
      if (mode === 'rand') { if (g % 18 === 0) dir = (Math.random() * 3 | 0) - 1; G.moveWeight(st, dir, DT); }
      G.update(st, DT);
    }
    return st.result;
  }
  let noopLit = 0, randLit = 0, n = 0;
  for (let li = 0; li < G.LEVELS.length; li++) {
    for (const sd of [1, 7, 91, 404]) { n++; noopLit += run(li, sd, 'noop').lit; randLit += run(li, sd, 'rand').lit; }
  }
  ok(noopLit / n < 0.15, '不操作点亮数 ' + (noopLit / n).toFixed(2) + ' / 关');
  ok(randLit / n < 0.35, '乱按点亮数 ' + (randLit / n).toFixed(2) + ' / 关');
}

/* ---------- 10. dt 守卫 ---------- */
console.log('[10] dt 守卫');
{
  const st = G.newState(0, 1); st.sandbox = true;
  G.update(st, NaN); G.update(st, -1); G.update(st, 9);
  ok(isFinite(st.th) && isFinite(st.w) && isFinite(st.t), 'NaN/负/超大 dt 不污染状态');
}

console.log('\n通过 ' + pass + ' / ' + (pass + fail) + (fail ? '  ✗ 失败 ' + fail : '  全部通过'));
process.exit(fail ? 1 : 0);
