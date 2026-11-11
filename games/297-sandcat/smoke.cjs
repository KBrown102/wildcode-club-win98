/* 297-sandcat《落沙 · 引猫夜》Node 冒烟测试 */
const G = require('./js/game.js');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; if (fail < 50) console.log('  x ' + m); } }
function sec(m) { console.log('- ' + m); }
const fin = v => typeof v === 'number' && isFinite(v);
const COL = G.COL, ROW = G.ROW;

function mk(lv, seed) {
  const geo = G.genLevel(lv, seed);
  const st = G.makeState(lv, geo, seed);
  st.sandMax = geo.quota; st.sandBase = geo.quota; st.sandLeft = geo.quota;
  return { geo, st };
}

/* ---------- 1. 模块与常量 ---------- */
sec('模块与常量');
ok(!!G && typeof G.genLevel === 'function', '导出 genLevel');
ok(G.LEVELS.length === 8, '8 关');
ok(G.COL === 30 && G.ROW === 18, '网格 30x18');
ok(G.STARS.length === 8 && G.STARS.every(s => s.length === 3 && s[0] <= s[1] && s[1] <= s[2]), '三星阈值递增');
for (let i = 0; i < 8; i++) ok(G.STARS[i][0] > 0, `L${i + 1} 一星阈值 > 0`);

/* ---------- 2. 关卡生成确定性 ---------- */
sec('关卡生成确定性 / 几何合法');
for (let lv = 0; lv < 8; lv++) {
  for (const s of [11, 20260911, 777]) {
    const a = G.genLevel(lv, s), b = G.genLevel(lv, s);
    ok(JSON.stringify(a.base) === JSON.stringify(b.base), `L${lv + 1}/${s} base 确定`);
    ok(JSON.stringify(a.homes) === JSON.stringify(b.homes), `L${lv + 1}/${s} homes 确定`);
    ok(JSON.stringify(a.starts) === JSON.stringify(b.starts), `L${lv + 1}/${s} starts 确定`);
    ok(a.quota === b.quota && a.par === b.par, `L${lv + 1}/${s} quota/par 确定`);
    ok(a.quota >= a.par, `L${lv + 1}/${s} quota >= par`);
    ok(a.base.length === COL, `L${lv + 1}/${s} base 长度`);
    for (let c = 0; c < COL; c++) {
      ok(a.base[c] >= 0 && a.base[c] <= ROW - 2, `L${lv + 1}/${s}/${c} base 在界内`);
    }
    ok(a.homes.length === G.LEVELS[lv].cats, `L${lv + 1}/${s} 猫数 = 家数`);
    ok(a.starts.length === G.LEVELS[lv].cats, `L${lv + 1}/${s} 出发点数`);
    for (let i = 0; i < a.homes.length; i++) {
      const h = a.homes[i];
      ok(h.c0 >= 0 && h.c1 < COL && h.c0 <= h.c1, `L${lv + 1}/${s} 家范围合法`);
      ok(h.y === a.base[h.c], `L${lv + 1}/${s} 家高 = 建筑顶`);
      ok(h.y - G.STREET >= 2, `L${lv + 1}/${s} 家高出街道 >=2（初始必拦住）`);
      ok(a.base[a.starts[i]] === G.STREET, `L${lv + 1}/${s} 猫出发在街道`);
      for (let j = 0; j < i; j++) ok(h.c0 !== a.homes[j].c0, `L${lv + 1}/${s} 家不重复`);
    }
    for (let i = 0; i < a.starts.length; i++)
      for (let j = 0; j < i; j++) ok(a.starts[i] !== a.starts[j], `L${lv + 1}/${s} 出发点不重复`);
  }
}

/* ---------- 3. noop = 0（核心机制必要性） ---------- */
sec('noop = 0 / 初始地形必拦住所有猫');
for (let lv = 0; lv < 8; lv++) {
  for (const s of [11, 22, 33, 44, 55, 66]) {
    const { st } = mk(lv, s);
    G.runAI(st, 'noop', 30);
    ok(G.homesCount(st) === 0, `L${lv + 1}/${s} noop 无猫到家`);
    ok(G.score(st) === 0, `L${lv + 1}/${s} noop 得分 0`);
    ok(st.litCount >= 0 && st.litCount < 12, `L${lv + 1}/${s} noop 点灯很少 (${st.litCount})`);
  }
}

/* ---------- 4. 休止角松弛不变量 ---------- */
sec('休止角松弛');
{
  const st = G.makeState(0, G.genLevel(0, 11), 11);
  st.sandBase = 999; st.sandMax = 999; st.sandLeft = 999;
  for (let i = 0; i < 60; i++) G.pourInstant(st, 15);
  let sum = 0; for (let c = 0; c < COL; c++) sum += st.sand[c];
  ok(sum === 60, '沙粒守恒 60');
  /* 只要求「有沙的那一侧」不留下 >=2 的坡；基岩本身的断崖不受休止角约束 */
  for (let c = 0; c < COL; c++) {
    if (st.sand[c] <= 0) continue;
    if (c > 0) ok(G.top(st, c) - G.top(st, c - 1) <= 1, `有沙列不留下 >=2 坡(左) @${c}`);
    if (c < COL - 1) ok(G.top(st, c) - G.top(st, c + 1) <= 1, `有沙列不留下 >=2 坡(右) @${c}`);
  }
  let sumTop = 0; for (let c = 0; c < COL; c++) sumTop += G.top(st, c);
  const before = sumTop;
  G.pourInstant(st, 3);
  let sumTop2 = 0; for (let c = 0; c < COL; c++) sumTop2 += G.top(st, c);
  ok(sumTop2 === before + 1, '再倒一粒 = 总量 +1');
  ok(G.relaxStep(st) === false, '已稳定时松弛无动作');
}
{
  /* 松弛终止性：随机 400 粒不崩、不留 >1 高差 */
  const st = G.makeState(3, G.genLevel(3, 99), 99);
  st.sandBase = 9999; st.sandMax = 9999; st.sandLeft = 9999;
  const rnd = G.mulberry32(7);
  let landed = 0;
  for (let i = 0; i < 400; i++) if (G.pourInstant(st, Math.floor(rnd() * COL))) landed++;
  let bad = 0;
  for (let c = 0; c < COL; c++) {
    if (st.sand[c] <= 0) continue;
    if (c > 0 && G.top(st, c) - G.top(st, c - 1) > 1) bad++;
    if (c < COL - 1 && G.top(st, c) - G.top(st, c + 1) > 1) bad++;
  }
  ok(bad === 0, '大量随机倒沙后无 >1 的沙坡');
  let sum = 0; for (let c = 0; c < COL; c++) sum += st.sand[c];
  ok(sum === landed, `沙粒守恒 (${landed})`);
  ok(landed > 300, `大部分沙落得下 (${landed}/400)`);
  for (let c = 0; c < COL; c++) ok(G.top(st, c) <= ROW, `不溢出 @${c}`);
}

/* ---------- 5. 沙堆二次代价（爬高越贵） ---------- */
sec('爬高代价二次增长');
{
  const st = G.makeState(0, G.genLevel(0, 11), 11);
  st.sandBase = 9999; st.sandMax = 9999; st.sandLeft = 9999;
  const base = st.base.slice();
  /* 在平地上从街道爬到高度 k 所需粒数 */
  const flat = new Array(COL).fill(G.STREET);
  const costs = [];
  for (let k = 5; k <= 10; k++) {
    const s2 = { base: flat.slice(), sand: new Array(COL).fill(0), flip: false, events: [] };
    let used = 0;
    while (G.top(s2, 15) < k && used < 400) { s2.sand[15]++; used++; G.relaxAll(s2); }
    costs.push(used);
  }
  for (let i = 1; i < costs.length; i++) ok(costs[i] > costs[i - 1], `高度 ${i + 5} 比 ${i + 4} 更贵 (${costs[i - 1]}->${costs[i]})`);
  ok(costs[costs.length - 1] >= 3 * costs[0], `最高档代价 >= 3x 最低档 (${costs[0]} -> ${costs[costs.length - 1]})`);
  ok(costs[0] >= 3, `爬 2 格也要 >=3 粒 (${costs[0]})`);
  /* 二次性：逐档增量递增 */
  for (let i = 2; i < costs.length; i++) {
    ok(costs[i] - costs[i - 1] >= costs[i - 1] - costs[i - 2], `第 ${i + 5} 档增量不减 (${costs[i] - costs[i - 1]} >= ${costs[i - 1] - costs[i - 2]})`);
  }
}

/* ---------- 6. 猫的攀爬规则 ---------- */
sec('猫的攀爬 / 到达规则');
{
  const geo = G.genLevel(0, 11);
  const st = G.makeState(0, geo, 11);
  st.sandBase = 9999; st.sandMax = 9999; st.sandLeft = 9999;
  const cat = st.cats[0];
  /* 人工把猫挪到能走的位置：|dt|<=1 才前进 */
  const saveC = cat.c;
  cat.c = 0; cat.r = G.top(st, 0);
  const t0 = G.top(st, 0), t1 = G.top(st, 1);
  G.updateCat(st, cat, 1);
  ok(cat.c === (Math.abs(t1 - t0) <= 1 ? 1 : 0), '|高差|<=1 才前进');
  cat.c = saveC;
  /* 到家判定：高度 tolerance +-1 */
  const h = st.homes[0];
  cat.c = h.c; cat.r = G.top(st, h.c);
  ok(Math.abs(cat.r - h.y) <= 1, '家列初始高度可达');
  G.updateCat(st, cat, 0.016);
  ok(cat.home === true, '到达家列即回家');
}

/* ---------- 7. 到达容差 ±1 / 屋顶倒沙会滑落 ---------- */
sec('到达容差 / 铲沙可救');
for (const lv of [0, 2, 5]) {
  const { st } = mk(lv, 33);
  const h = st.homes[0], cat = st.cats[0];
  /* 建筑顶倒沙会顺坡滑走 —— 家不会被误埋（无挫败点） */
  const before = G.top(st, h.c);
  for (let i = 0; i < 6; i++) G.pourInstant(st, h.c);
  const wide = (h.c1 - h.c0) >= 2;
  if (wide) ok(G.top(st, h.c) <= before + 2, `L${lv + 1} 宽屋顶堆沙有限 (+${G.top(st, h.c) - before})`);
  else ok(G.top(st, h.c) === before, `L${lv + 1} 窄屋顶倒沙会滑落，家不被垫高`);
  /* 容差 ±1：垫高 2 格则到不了 */
  const st2 = mk(lv, 33).st;
  const cat2 = st2.cats[0], h2 = st2.homes[0];
  st2.sand[h2.c] += 2;                      /* 强行垫高（模拟极端） */
  cat2.c = h2.c; cat2.r = G.top(st2, h2.c); cat2.home = false; cat2.state = 'walk'; cat2.stepT = G.CAT_STEP;
  G.updateCat(st2, cat2, 0.016);
  ok(cat2.home === false, `L${lv + 1} 高出 2 格到不了家`);
  ok(G.shovelAt(st2, h2.c) === true, `L${lv + 1} 铲沙可用`);
  G.shovelAt(st2, h2.c);
  G.updateCat(st2, cat2, 0.016);
  ok(cat2.home === true, `L${lv + 1} 铲平后能到家`);
}

/* ---------- 8. 求解器 / 关卡可解性 ---------- */
sec('求解器 / 可解性');
for (let lv = 0; lv < 8; lv++) {
  for (const s of [11, 22, 33, 44, 55, 66, 77, 88]) {
    const { geo, st } = mk(lv, s);
    const plan = G.planSolve(st, 460);
    ok(plan.ok, `L${lv + 1}/${s} 求解器成功`);
    ok(plan.grains === geo.par, `L${lv + 1}/${s} par 与求解一致`);
    ok(plan.grains <= geo.quota, `L${lv + 1}/${s} par <= quota`);
  }
}

/* ---------- 9. 主循环 step 稳定性 ---------- */
sec('主循环 step');
for (const lv of [0, 4, 7]) {
  const { st } = mk(lv, 42);
  st.pouring = true; st.cursor = 12;
  let bad = 0;
  for (let i = 0; i < 4000; i++) {
    G.step(st, 1 / 60);
    if (!fin(st.time) || !fin(st.sandLeft)) bad++;
    for (let c = 0; c < COL; c++) if (!(st.sand[c] >= 0)) bad++;
    for (const cat of st.cats) if (!fin(cat.r) || cat.c < 0 || cat.c >= COL) bad++;
  }
  ok(bad === 0, `L${lv + 1} 4000 帧无 NaN / 越界`);
  ok(st.sandLeft >= 0, `L${lv + 1} 沙不为负`);
  ok(st.grains.length < 400, `L${lv + 1} 下落沙粒不堆积 (${st.grains.length})`);
}
{
  const { st } = mk(0, 42);
  st.pouring = true; st.cursor = 5;
  for (let i = 0; i < 200; i++) G.step(st, 1 / 60);
  const t1 = st.time;
  G.step(st, NaN); G.step(st, -1); G.step(st, 99);
  ok(fin(st.time), 'dt NaN/负数/超大 守卫');
  ok(st.time - t1 < 0.2, 'dt 被 clamp 到 <=0.05');
}
{
  /* 沙用完不再生成 */
  const { st } = mk(0, 42);
  st.sandLeft = 0;
  st.pouring = true;
  for (let i = 0; i < 120; i++) G.step(st, 1 / 60);
  ok(st.sandLeft === 0, '沙为 0 时不透支');
  let sum = 0; for (let c = 0; c < COL; c++) sum += st.sand[c];
  ok(sum === 0, '沙为 0 时不产沙');
}
{
  /* 列被填满时沙粒改道 / 退还，不悬空 */
  const { st } = mk(0, 42);
  st.sandBase = 99999; st.sandMax = 99999; st.sandLeft = 99999;
  for (let c = 0; c < COL; c++) st.sand[c] = ROW - st.base[c];
  st.pouring = true; st.cursor = 10;
  for (let i = 0; i < 300; i++) G.step(st, 1 / 60);
  let bad = 0;
  for (let c = 0; c < COL; c++) if (G.top(st, c) > ROW) bad++;
  ok(bad === 0, '全满时沙粒不越界');
  ok(G.spawnGrain(st, 10) === false, '满列不可再落沙');
}

/* ---------- 10. 落沙与铲沙 ---------- */
sec('落沙 / 铲沙');
{
  const { st } = mk(1, 42);
  const s0 = st.sandLeft;
  ok(G.spawnGrain(st, 8) === true, '可落沙');
  ok(st.sandLeft === s0 - 1, '落沙扣 1 粒');
  for (let i = 0; i < 400 && st.grains.length; i++) G.step(st, 1 / 60);
  ok(st.sand[8] + st.sand[7] + st.sand[9] > 0, '沙粒落地成沙');
  const s1 = st.sandLeft;
  const okSh = G.shovelAt(st, 8);
  if (okSh) ok(st.sandLeft === s1 + 1, '铲沙返还 1 粒'); else ok(true, '该列无沙可铲');
  ok(G.shovelAt(st, -1) === false && G.shovelAt(st, COL) === false, '越界铲沙被拒');
  /* 铲不出的列 */
  const st2 = G.makeState(1, G.genLevel(1, 42), 42);
  ok(G.shovelAt(st2, 3) === false, '无沙列铲不动');
}

/* ---------- 11. AI 对照：技能梯度 ---------- */
sec('AI 对照（noop / random / mid / strong）');
const seeds = [11, 22, 33, 44, 55, 66];
const agg = [];
for (let lv = 0; lv < 8; lv++) {
  let n = 0, r = 0, m = 0, s = 0, okS = 0, okM = 0;
  for (const sd of seeds) {
    let a = mk(lv, sd); G.runAI(a.st, 'noop', 25); n += G.score(a.st);
    let b = mk(lv, sd); G.runAI(b.st, 'random', 120); r += G.score(b.st);
    let c = mk(lv, sd); G.runAI(c.st, 'mid', 160); m += G.score(c.st);
    if (G.homesCount(c.st) === c.st.cats.length) okM++;
    let d = mk(lv, sd); G.runAI(d.st, 'strong', 240); s += G.score(d.st);
    if (G.homesCount(d.st) === d.st.cats.length) okS++;
  }
  const k = seeds.length;
  agg.push({ lv: lv + 1, noop: n / k, random: r / k, mid: m / k, strong: s / k, okM: okM + '/' + k, okS: okS + '/' + k });
  ok(n === 0, `L${lv + 1} noop 均分 0`);
  ok(s / k > m / k, `L${lv + 1} strong > mid (${(s / k).toFixed(0)} vs ${(m / k).toFixed(0)})`);
  ok(s / k > r / k * 1.4, `L${lv + 1} strong > 1.4x random`);
  ok(okS === k, `L${lv + 1} strong 全通 (${okS}/${k})`);
}
console.table(agg.map(a => ({
  lv: a.lv, noop: a.noop.toFixed(0), random: a.random.toFixed(0),
  mid: a.mid.toFixed(0), strong: a.strong.toFixed(0), mid通: a.okM, strong通: a.okS
})));

/* ---------- 12. 计分 ---------- */
sec('计分 / 完成度缩放');
for (let lv = 0; lv < 8; lv++) {
  const { st } = mk(lv, 11);
  G.runAI(st, 'noop', 20);
  ok(G.score(st) === 0, `L${lv + 1} noop 0 分`);
  /* 沙全在但一只猫没到 → 仍 0 分（溢价分随完成度缩放） */
  const st2 = mk(lv, 11).st;
  ok(G.score(st2) === 0, `L${lv + 1} 满沙未通关 0 分`);
}
{
  const { st } = mk(0, 11);
  G.runAI(st, 'strong', 200);
  const sc = G.score(st);
  ok(sc > 0, '通关有分');
  ok(G.starsOf(0, sc) >= 1, `通关至少 1 星 (${sc} -> ${G.starsOf(0, sc)})`);
  ok(G.starsOf(0, 0) === 0, '0 分 0 星');
  ok(G.starsOf(0, 1e9) === 3, '高分 3 星');
  const th = G.starThresholds(0);
  ok(G.starsOf(0, th[0]) === 1 && G.starsOf(0, th[1]) === 2 && G.starsOf(0, th[2]) === 3, '阈值边界正确');
  ok(G.starsOf(0, th[2] - 1) === 2, '差 1 分只 2 星');
}

/* ---------- 13. 充电宝返还 ---------- */
sec('充电宝：猫到家返还沙');
{
  const { st } = mk(0, 11);
  const before = st.sandLeft;
  G.runAI(st, 'strong', 200);
  ok(G.homesCount(st) === 1, 'strong 送猫到家');
  ok(st.sandMax > before, 'sandMax 同步增加（不稀释效率分）');
  ok(st.sandLeft >= 0, '沙不为负');
}

/* ---------- 14. 事件 ---------- */
sec('事件');
{
  const { st } = mk(2, 11);
  G.runAI(st, 'noop', 12);
  ok(st.events.some(e => e.t === 'meow'), '卡住会喵（反馈）');
  const st2 = mk(2, 11).st;
  G.runAI(st2, 'strong', 200);
  ok(st2.events.some(e => e.t === 'lamp'), '点灯事件');
  ok(st2.events.some(e => e.t === 'home'), '到家事件');
  ok(st2.events.some(e => e.t === 'clear'), '通关事件');
  ok(st2.over === true, 'over 置位');
}

/* ---------- 15. 猫永远在地表 ---------- */
sec('猫永远站在地表');
for (const lv of [0, 3, 6]) {
  const { st } = mk(lv, 55);
  st.pouring = true;
  let bad = 0;
  for (let i = 0; i < 3000; i++) {
    st.cursor = Math.floor((i / 7) % COL);
    G.step(st, 1 / 60);
    for (const cat of st.cats) {
      const want = cat.home ? Math.max(cat.y, G.top(st, cat.c)) : G.top(st, cat.c);
      if (cat.r !== want) bad++;
    }
  }
  ok(bad === 0, `L${lv + 1} 猫始终在地表（沙涨猫跟着涨）`);
}

/* ---------- 16. 点一下 = 落一格 ---------- */
sec('点一下 = 一格（tapPour / tapShovel）');
for (const lv of [0, 3, 7]) {
  const { st } = mk(lv, 31);
  const c = st.cursor;
  const before = st.sandLeft;
  G.tapPour(st, c);
  G.step(st, 1 / 60);
  ok(st.sandLeft === before - 1, `L${lv + 1} 点一下只扣 1 粒`);
  const tot = st.sand.reduce((a, b) => a + b, 0);
  ok(tot === 1, `L${lv + 1} 点一下只多 1 粒沙（实际 ${tot}）`);
  G.tapShovel(st, c);
  G.step(st, 1 / 60);
  ok(st.sandLeft === before, `L${lv + 1} 铲一下返还 1 粒`);
  ok(st.sand.reduce((a, b) => a + b, 0) === 0, `L${lv + 1} 铲一下铲干净`);
}
{
  /* 连点 5 下 = 5 粒，不丢不重 */
  const { st } = mk(1, 77);
  for (let i = 0; i < 5; i++) G.tapPour(st, 6);
  G.step(st, 1 / 60);
  ok(st.sand.reduce((a, b) => a + b, 0) === 5, '连点 5 下 = 5 粒');
  ok(st.poured === 5, 'poured 计数正确');
}

/* ---------- 17. 按住 = 连倒（先停顿再起速） ---------- */
sec('按住连倒：HOLD_DELAY 停顿 + 起速爬坡');
{
  const { st } = mk(0, 91);
  st.cursor = 10; st.pouring = true;
  const dt = 1 / 60;
  let pouredAt = [];
  let last = 0;
  for (let i = 0; i < 60; i++) {                 /* 1 秒 */
    G.step(st, dt);
    if (st.poured !== last) { pouredAt.push(+(i * dt).toFixed(3)); last = st.poured; }
  }
  ok(G.HOLD_DELAY >= 0.2 && G.HOLD_DELAY <= 0.4, `HOLD_DELAY 合理 (${G.HOLD_DELAY})`);
  ok(pouredAt.length === 0 || pouredAt[0] >= G.HOLD_DELAY - 0.02,
    `按住后先停顿再连倒（首粒 @${pouredAt[0]}s）`);
  ok(st.poured >= 6, `1 秒内连倒 ${st.poured} 粒`);
  ok(st.poured <= G.POUR_RATE_MAX + 1, `不超满速 (${st.poured} <= ${G.POUR_RATE_MAX})`);
}
{
  /* 起速：后半段比前半段落得多 */
  const { st } = mk(0, 91);
  st.cursor = 10; st.pouring = true;
  const dt = 1 / 60;
  for (let i = 0; i < 30; i++) G.step(st, dt);   /* 0.5s */
  const half = st.poured;
  for (let i = 0; i < 30; i++) G.step(st, dt);
  ok(st.poured - half > half, `越按越快（后 0.5s ${st.poured - half} > 前 0.5s ${half}）`);
}
{
  /* 松手立刻停 */
  const { st } = mk(0, 91);
  st.cursor = 10; st.pouring = true;
  for (let i = 0; i < 60; i++) G.step(st, 1 / 60);
  st.pouring = false;
  const p = st.poured;
  for (let i = 0; i < 60; i++) G.step(st, 1 / 60);
  ok(st.poured === p, '松手后不再落沙');
}
{
  /* 铲沙同样有点按/连按两套 */
  const { st } = mk(0, 91);
  for (let i = 0; i < 12; i++) G.pourInstant(st, 12);
  st.cursor = 12; st.shoveling = true;
  const before = st.sand.reduce((a, b) => a + b, 0);
  for (let i = 0; i < 60; i++) G.step(st, 1 / 60);
  st.shoveling = false;
  const after = st.sand.reduce((a, b) => a + b, 0);
  ok(after < before, `按住连铲有效 (${before} -> ${after})`);
}

/* ---------- 18. 过关：文案各关不同 + 分数冻结 ---------- */
sec('过关文案 / 分数冻结');
ok(G.CLEAR_TEXT.length === 8, '8 关文案');
{
  const seenT = new Set(), seenD = new Set();
  for (let i = 0; i < 8; i++) {
    const t = G.clearText(i);
    ok(!!t && typeof t.t === 'string' && t.t.length > 2, `L${i + 1} 有标题`);
    ok(!!t && typeof t.d === 'string' && t.d.length > 8, `L${i + 1} 有描述`);
    ok(!seenT.has(t.t), `L${i + 1} 标题不重复`);
    ok(!seenD.has(t.d), `L${i + 1} 描述不重复`);
    seenT.add(t.t); seenD.add(t.d);
  }
}
{
  const { st } = mk(2, 11);
  G.runAI(st, 'strong', 220);
  ok(st.over === true, '通关 over=true');
  ok(st.finalScore > 0, `finalScore 已冻结 (${st.finalScore})`);
  const frozen = st.finalScore;
  /* 演出期间点亮的灯不能改分数 */
  let lit = 0;
  for (let c = 0; c < COL; c++) if (st.lamps[c] && !st.lampsLit[c]) { st.lampsLit[c] = 1; lit++; }
  for (let i = 0; i < 30; i++) G.step(st, 1 / 60);
  ok(G.score(st) === frozen, `演出点灯 ${lit} 盏后分数不变（${frozen}）`);
  ok(st.pouring === false && st.shoveling === false, '过关后禁止操作');
  const before = st.sand.reduce((a, b) => a + b, 0);
  G.tapPour(st, 5); G.step(st, 1 / 60);
  ok(st.sand.reduce((a, b) => a + b, 0) === before, '过关后落沙无效');
}

console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILED') + '  pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
