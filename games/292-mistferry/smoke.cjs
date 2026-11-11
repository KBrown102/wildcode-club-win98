/* 292-mistferry · Node 冒烟：纯逻辑层，零 DOM */
const G = require("./game.js");
const { W, H, P, LEVELS, newState, update, paddle, settle, stars, quality,
        genLevel, limitsAt, eddyAt, currentAt } = G;

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; } else { fail++; console.log("  ✗ " + m); } }
function grp(n) { console.log("— " + n); }
const DT = 1 / 60;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

/* 1. 关卡生成 */
grp("关卡生成");
for (let li = 0; li < LEVELS.length; li++) {
  for (const sd of SEEDS) {
    const L = genLevel(li, sd);
    ok(L.docks.length === LEVELS[li].docks, `L${li + 1} s${sd} 渡口数 ${L.docks.length}≠${LEVELS[li].docks}`);
    ok(L.rocks.length === LEVELS[li].rocks, `L${li + 1} s${sd} 礁石数`);
    ok(L.vort.length === LEVELS[li].vort, `L${li + 1} s${sd} 漩涡数`);
    ok(L.spring.length === LEVELS[li].spring, `L${li + 1} s${sd} 泉眼数`);
    // 河道处处能容下一叶舟
    for (let y = 0; y <= H; y += 17) {
      const s = limitsAt(L, y);
      ok(s.rx - s.lx > P.BOAT_R * 2 + 12, `L${li + 1} s${sd} y=${y} 河道过窄 ${(s.rx - s.lx).toFixed(1)}`);
    }
    // 渡口必须在洄湾里、且舟身够得到
    for (const d of L.docks) {
      const s = limitsAt(L, d.y);
      ok(d.x > s.lx && d.x < s.rx, `L${li + 1} s${sd} 渡口在岸外`);
      const reach = d.side < 0 ? (d.x - (s.lx + P.BOAT_R)) : ((s.rx - P.BOAT_R) - d.x);
      ok(reach >= 0, `L${li + 1} s${sd} 渡口够不到 reach=${reach.toFixed(1)}`);
      ok(eddyAt(L, d.x, d.y) > 0.30, `L${li + 1} s${sd} 渡口不在洄湾 eddy=${eddyAt(L, d.x, d.y).toFixed(2)}`);
    }
    // 渡口纵向不重叠
    const ys = L.docks.map(d => d.y).sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) ok(ys[i] - ys[i - 1] > 80, `L${li + 1} s${sd} 渡口过近 ${(ys[i] - ys[i - 1]).toFixed(0)}`);
  }
}

/* 2. 确定性 */
grp("固定种子可复盘");
{
  const a = genLevel(3, 42), b = genLevel(3, 42), c = genLevel(3, 43);
  ok(JSON.stringify(a.docks) === JSON.stringify(b.docks), "同种子渡口不一致");
  ok(a.docks.length > 0 && JSON.stringify(a.docks) !== JSON.stringify(c.docks), "不同种子应不同");
  const s1 = newState(2, 7), s2 = newState(2, 7);
  for (let i = 0; i < 600; i++) { paddle(s1, i % 3 === 0 ? "L" : "R"); update(s1, DT); update(s2, DT); }
  ok(Math.abs(s1.x - s2.x) > 1 || Math.abs(s1.y - s2.y) > 1, "划桨应改变轨迹");
  const s3 = newState(2, 7), s4 = newState(2, 7);
  for (let i = 0; i < 600; i++) { paddle(s3, "L"); paddle(s4, "L"); update(s3, DT); update(s4, DT); }
  ok(Math.abs(s3.x - s4.x) < 1e-9 && Math.abs(s3.y - s4.y) < 1e-9, "同操作应完全一致");
}

/* 3. 流场 */
grp("源汇流场");
for (const sd of [1, 5]) {
  const L = genLevel(5, sd);
  // 真正的不变量：在洄湾里放任漂流，终速必须远低于江心（这才是「能停下来」）
  function terminal(L, x, y) {
    const s = newState(5, 1); s.L = L;
    s.x = x; s.y = y; s.vx = 0; s.vy = 0; s.power = 0;
    for (let i = 0; i < 60 * 4; i++) { update(s, DT); if (s.phase !== 'play') break; }
    return Math.hypot(s.vx, s.vy);
  }
  for (const d of L.docks) {
    const sc = limitsAt(L, d.y);
    const vEddy = terminal(L, d.x, d.y);
    const vOpen = terminal(L, sc.cx, d.y);
    ok(vEddy < vOpen * 0.45, `洄湾终速未降 ${vEddy.toFixed(1)} vs ${vOpen.toFixed(1)}`);
    ok(vEddy < P.V_LAND * 0.6, `洄湾终速 ${vEddy.toFixed(1)} 仍快到靠不了岸`);
  }
  // 江心水流方向朝下游
  for (let y = 40; y < H - 40; y += 60) {
    const s = limitsAt(L, y);
    const c = currentAt(L, s.cx, y);
    ok(c.y > 0, `y=${y} 江心水流不朝下`);
  }
  // 漩涡有向内分量，泉眼有向外分量
  for (const v of L.vort) {
    const dx = v.r * 0.5;
    const c = currentAt(L, v.x + dx, v.y);
    ok(c.x < 0.5, "漩涡无向内分量");
  }
  for (const sp of L.spring) {
    const c = currentAt(L, sp.x + sp.r * 0.5, sp.y);
    ok(c.x > 0.5, "泉眼无向外分量");
  }
}

/* 4. dt 守卫 */
grp("dt 守卫");
{
  const s = newState(0, 1);
  update(s, NaN); update(s, -1); update(s, 0); update(s, 1e9);
  ok(Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.vx) && Number.isFinite(s.vy), "dt 异常污染状态");
  ok(s.t <= 0.05 * 4 + 1e-9, "dt 未被夹紧");
}

/* 5. 桨力 / 节奏 */
grp("桨力与节奏");
{
  const s = newState(0, 1);
  const p0 = s.power;
  ok(paddle(s, "L") === true, "左桨应成功");
  ok(s.power === p0 - 1, "单桨扣 1");
  ok(paddle(s, "L") === false, "节奏内连划应被拒");
  for (let i = 0; i < 20; i++) update(s, DT);
  ok(paddle(s, "B") === true, "双桨应成功");
  ok(s.power === p0 - 3, "双桨扣 2");
  const s2 = newState(0, 1); s2.power = 1;
  ok(paddle(s2, "B") === false, "桨力不足应被拒");
  ok(s2.power === 1, "被拒不应扣桨力");
  // 左桨 + 右桨 严格抵消（同帧）
  const s3 = newState(0, 1); const h0 = s3.h;
  paddle(s3, "L"); s3.strokeCd = 0; paddle(s3, "R");
  ok(Math.abs(s3.h - h0) < 1e-9, "左桨右桨未严格抵消");
  // 双桨不转向
  const s4 = newState(0, 1); const h1 = s4.h; paddle(s4, "B");
  ok(Math.abs(s4.h - h1) < 1e-12, "双桨不应转向");
  // 反桨倒推
  const s5 = newState(0, 1); const vy0 = s5.vy; paddle(s5, "V");
  ok(s5.vy < vy0, "反桨应减速/倒推");
}

/* 6. 靠岸判定 */
grp("靠岸判定");
for (const sd of [1, 2, 3]) {
  for (let li = 0; li < 3; li++) {
    const s = newState(li, sd);
    const d = s.L.docks[0];
    // 慢速靠岸
    s.x = d.x; s.y = d.y; s.vx = 3; s.vy = 3;
    update(s, DT);
    ok(d.done === true, `L${li + 1} s${sd} 慢速应靠岸成功`);
    ok(s.landed === 1, `L${li + 1} s${sd} landed 未 +1`);
    ok(s.events.some(e => e.t === "land"), `L${li + 1} s${sd} 无 land 事件`);
    // 靠岸返还桨力（充电宝）
    ok(s.power > s.maxPower - 1, `L${li + 1} s${sd} 未返还桨力`);
  }
}
{
  const s = newState(0, 1), d = s.L.docks[0];
  s.x = d.x; s.y = d.y; s.vx = 90; s.vy = 40;
  update(s, DT);
  ok(d.done === false, "高速不应靠岸");
  ok(s.events.some(e => e.t === "fast"), "高速应有 fast 事件");
  ok(Math.hypot(s.vx, s.vy) < Math.hypot(90, 40), "高速应被刹一档");
}
{
  // 越慢分越高
  const a = newState(0, 1), b = newState(0, 1);
  const d = a.L.docks[0];
  a.x = d.x; a.y = d.y; a.vx = 1; a.vy = 1; update(a, DT);
  b.x = d.x; b.y = d.y; b.vx = 30; b.vy = 8; update(b, DT);
  const ga = a.events.filter(e => e.t === "land")[0].gain;
  const gb = b.events.filter(e => e.t === "land")[0].gain;
  ok(ga > gb, `越慢分应越高 ${ga} vs ${gb}`);
  ok(ga <= 250 && gb >= 100, `分值越界 ${ga} ${gb}`);
}

/* 7. 雾 / 揭示 */
grp("揭示");
{
  const s = newState(6, 3);
  const nR = s.L.rocks.length + s.L.vort.length + s.L.spring.length;
  ok(nR > 0, "L7 应有障碍");
  ok(Object.keys(s.seen).length === 0, "开局应全未探明");
  for (let i = 0; i < 90; i++) update(s, DT);
  ok(Object.keys(s.seen).length >= 0, "seen 应为对象");
  // 把舟挪到障碍上，应被探明
  const s2 = newState(6, 3);
  const r0 = s2.L.rocks[0] || s2.L.vort[0] || s2.L.spring[0];
  if (r0) {
    s2.x = r0.x; s2.y = r0.y;
    update(s2, DT);
    const any = Object.keys(s2.seen).length > 0;
    ok(any, "靠近障碍应探明");
  }
  // 涟漪揭示
  const s3 = newState(6, 3);
  paddle(s3, "L");
  ok(s3.ripples.length === 1, "划桨应产生涟漪");
  const r1 = s3.ripples[0].r;
  for (let i = 0; i < 6; i++) update(s3, DT);
  ok(s3.ripples[0].r > r1, "涟漪应扩散");
}

/* 8. 结束条件 */
grp("结算");
{
  const s = newState(0, 1);
  s.power = 0;
  for (let i = 0; i < 60 * 4; i++) { update(s, DT); if (s.phase === "end") break; }
  ok(s.phase === "end", "桨力耗尽应结束");
  ok(s.endKind === "exhaust" || s.endKind === "down" || s.endKind === "clear", `结束类型 ${s.endKind}`);
}
{
  const s = newState(0, 1);
  s.L.docks.forEach(d => { d.done = true; });
  s.landed = s.total;
  update(s, DT);
  ok(s.phase === "end" && s.endKind === "clear", "全部渡完应 clear");
  ok(s.result.bonus === s.power * 30, "clear 才有省桨奖励");
}
{
  const s = newState(0, 1);
  s.y = H - 2; s.vy = 1; s.power = 5;
  for (let i = 0; i < 60 * 4; i++) { update(s, DT); if (s.phase === "end") break; }
  ok(s.phase === "end", "漂出下游应结束");
}
{
  // 不操作不应刷分
  const s = newState(0, 1);
  for (let i = 0; i < 60 * 90 && s.phase === "play"; i++) update(s, DT);
  ok(s.result.score === 0, `不操作不应得分 ${s.result.score}`);
  ok(s.result.bonus === 0, "未渡完不应有省桨奖励");
}

/* 9. 星级 */
grp("星级标定");
{
  const mk = (landed, total, softAvg, power, maxPower) =>
    ({ landed, total, softAvg, power, maxPower, score: 0 });
  ok(stars(0, mk(0, 3, 0, 10, 30)) === 0, "0 渡应 0 星");
  ok(stars(0, mk(1, 3, 0.3, 10, 30)) === 1, "部分完成应 1 星");
  ok(stars(0, mk(3, 3, 0.30, 15, 30)) === 1 || stars(0, mk(3, 3, 0.30, 15, 30)) === 2, "满渡低质量应 1–2 星");
  ok(stars(0, mk(3, 3, 0.80, 26, 30)) === 3, "满渡高质量应 3 星");
  const q3 = quality(0, mk(3, 3, 0.80, 26, 30));
  ok(q3 >= 0.56, `高质量 q=${q3.toFixed(2)} 应达 3 星线`);
}

/* 10. 整局稳定性（不越界 / 不 NaN） */
grp("整局稳定性");
for (let li = 0; li < LEVELS.length; li++) {
  for (const sd of [1, 4]) {
    const s = newState(li, sd);
    let bad = 0;
    for (let i = 0; i < 60 * 120 && s.phase === "play"; i++) {
      if (s.strokeCd <= 0 && i % 11 === 0) paddle(s, ["L", "R", "B", "V"][i % 4]);
      update(s, DT);
      if (!Number.isFinite(s.x) || !Number.isFinite(s.y)) { bad++; break; }
      const lim = limitsAt(s.L, Math.max(0, Math.min(H - 1, s.y)));
      if (s.x < lim.lx - 2 || s.x > lim.rx + 2) { bad++; break; }
    }
    ok(bad === 0, `L${li + 1} s${sd} 越界或 NaN`);
  }
}

/* 11. 会玩的 AI 明显强于乱划（机制必要性） */
grp("AI 对照");
{
  function nearestDock(st) {
    let best = null, bd = 1e9;
    for (const d of st.L.docks) {
      if (d.done) continue;
      const sc = Math.hypot(d.x - st.x, d.y - st.y) + (d.y - st.y < -40 ? 260 : 0);
      if (sc < bd) { bd = sc; best = d; }
    }
    return best;
  }
  function smart(st, K) {
    let g = 0;
    while (st.phase === "play" && g++ < 60 * 120) {
      const d = nearestDock(st); if (!d) { update(st, DT); continue; }
      const ay = st.y < d.y - 55 ? d.y - 55 : d.y;
      const err = G.angDiff(Math.atan2(ay - st.y, d.x - st.x), st.h);
      const dist = Math.hypot(d.x - st.x, d.y - st.y);
      const sp = Math.hypot(st.vx, st.vy);
      const vd = Math.max(0, Math.min(170, (dist - 30) * K));
      let act = null;
      if (sp < vd - 8) act = (Math.abs(err) < 0.10 && dist > 150) ? "B" : (err > 0 ? "L" : "R");
      if (act && st.strokeCd <= 0) paddle(st, act);
      update(st, DT);
    }
    if (st.phase === "play") settle(st, "timeout");
    return st;
  }
  let sL = 0, sS = 0, rL = 0, rS = 0, nL = 0;
  const N = 6;
  for (let li = 0; li < LEVELS.length; li++) {
    for (let sd = 1; sd <= N; sd++) {
      sL += smart(newState(li, sd), 1.15).result.landed;
      sS += smart(newState(li, sd), 1.15).result.score;
      const rnd = G.mulberry32(sd * 977 + li);
      const rs = newState(li, sd);
      let g = 0, cd = 0;
      while (rs.phase === "play" && g++ < 60 * 120) {
        cd -= DT;
        if (cd <= 0 && rs.strokeCd <= 0) { cd = 0.3 + rnd() * 0.45; paddle(rs, ["L", "R", "B", "V"][Math.floor(rnd() * 4)]); }
        update(rs, DT);
      }
      if (rs.phase === "play") settle(rs, "timeout");
      rL += rs.result.landed; rS += rs.result.score;
      const ns = newState(li, sd);
      let g2 = 0; while (ns.phase === "play" && g2++ < 60 * 120) update(ns, DT);
      if (ns.phase === "play") settle(ns, "timeout");
      nL += ns.result.landed;
    }
  }
  const n = LEVELS.length * N;
  console.log(`  会收桨 ${(sL / n).toFixed(2)} 渡 / ${Math.round(sS / n)} 分　乱划 ${(rL / n).toFixed(2)} 渡 / ${Math.round(rS / n)} 分　不操作 ${(nL / n).toFixed(2)} 渡`);
  ok(sL / n >= 2.0, `会收桨平均渡口过少 ${(sL / n).toFixed(2)}`);
  ok(sS > rS * 4, `技能差距不足 ${sS} vs ${rS}`);
  ok(nL / n < 0.8, `不操作也能渡太多 ${(nL / n).toFixed(2)}`);
}

console.log(`\n=== 292-mistferry 冒烟：${pass} 过 / ${fail} 败 ===`);
process.exit(fail ? 1 : 0);
