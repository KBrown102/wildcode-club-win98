// _smoke.cjs — 288-tidecall 冒烟 + 平衡对照
const G = require("./game.js");

let pass = 0, fail = 0, groups = {};
function ok(cond, msg) {
  if (cond) pass++; else { fail++; if (fail < 25) console.log("  FAIL: " + msg); }
  const key = (msg || "").split(":")[0];
  groups[key] = (groups[key] || 0) + 1;
}
function head(t) { console.log("\n== " + t + " =="); }

// ---------- 1. 基础构造 ----------
head("1. 构造 / 高程场");
for (let lv = 0; lv < G.LEVELS.length; lv++) {
  const st = G.create(lv, 1000 + lv);
  ok(st.field.length === G.COLS * G.ROWS, "field size L" + lv);
  ok(st.crabs.length === G.LEVELS[lv].burrows, "L" + lv + " 蟹数=" + st.crabs.length + " 期望" + G.LEVELS[lv].burrows);
  let mn = 9, mx = -9;
  for (let i = 0; i < st.field.length; i++) { mn = Math.min(mn, st.field[i]); mx = Math.max(mx, st.field[i]); }
  ok(mn >= 0 && mx <= 1, "L" + lv + " 高程归一 [" + mn.toFixed(2) + "," + mx.toFixed(2) + "]");
  // 顶部应显著高于底部
  let top = 0, bot = 0;
  for (let c = 0; c < G.COLS; c++) { top += st.field[2 * G.COLS + c]; bot += st.field[47 * G.COLS + c]; }
  ok(top / G.COLS > bot / G.COLS + 0.5, "L" + lv + " 岸高于海 " + (top / G.COLS).toFixed(2) + " vs " + (bot / G.COLS).toFixed(2));
  // 洞在高处且互不重叠
  for (const b of st.burrows) {
    ok(G.elevAt(st, b.x, b.y) > 0.5, "L" + lv + " 洞在高处 e=" + G.elevAt(st, b.x, b.y).toFixed(2));
    ok(b.y > 90, "L" + lv + " 洞避开 HUD y=" + b.y.toFixed(0));
  }
  for (let i = 0; i < st.burrows.length; i++)
    for (let j = i + 1; j < st.burrows.length; j++)
      ok(Math.hypot(st.burrows[i].x - st.burrows[j].x, st.burrows[i].y - st.burrows[j].y) >= 45,
        "L" + lv + " 洞间距 #" + i + "-" + j);
  // 每只蟹初始在自家洞
  for (const c of st.crabs) ok(Math.hypot(c.x - c.hx, c.y - c.hy) < 0.01, "L" + lv + " 蟹初始在洞");
}

// ---------- 2. 高程场单调性（solveY 依赖） ----------
head("2. 高程沿 y 大致递减（solveYForElev 前提）");
for (let sd = 0; sd < 6; sd++) {
  const st = G.create(0, 400 + sd * 31);
  let bad = 0, tot = 0;
  for (let c = 1; c < G.COLS; c += 3) {
    for (let r = 1; r < G.ROWS - 1; r++) {
      tot++;
      if (st.field[(r + 1) * G.COLS + c] > st.field[r * G.COLS + c] + 0.02) bad++;
    }
  }
  ok(bad / tot < 0.06, "seed" + sd + " 逆序格占比 " + (bad / tot * 100).toFixed(1) + "% < 6%");
}

// ---------- 3. 潮位控制 ----------
head("3. 潮位：玩家是唯一推手 + 速率上限 + 端点钳制");
{
  const st = G.create(0, 77);
  const t0 = st.tide;
  st.inUp = true;
  for (let i = 0; i < 60; i++) G.update(st, 1 / 60);   // 1s
  ok(Math.abs(st.tide - (t0 + G.TIDE_SPEED)) < 0.01, "1s 涨潮位移 ≈ TIDE_SPEED，实测 " + (st.tide - t0).toFixed(3));
  // 端点
  st.inUp = true;
  for (let i = 0; i < 600; i++) G.update(st, 1 / 60);
  ok(st.tide === 1, "涨到底钳制在 1");
  st.inUp = false; st.inDown = true;
  for (let i = 0; i < 600; i++) G.update(st, 1 / 60);
  ok(st.tide === 0, "退到底钳制在 0");
  // 不动 = 不动
  st.inDown = false;
  const tt = st.tide;
  for (let i = 0; i < 120; i++) G.update(st, 1 / 60);
  ok(Math.abs(st.tide - tt) < 1e-9, "松手后潮位不动");
  // 双向严格抵消
  const a = G.create(0, 77); a.inUp = true;
  for (let i = 0; i < 30; i++) G.update(a, 1 / 60);
  const b = G.create(0, 77); b.inDown = true;
  for (let i = 0; i < 30; i++) G.update(b, 1 / 60);
  ok(Math.abs((a.tide - 0.34) + (b.tide - 0.34)) < 1e-9, "涨/退 严格相加为 0");
}

// ---------- 4. 蟹自主循环 ----------
head("4. 蟹的自主生活：饿→下滩→滤食→回洞→蜕壳");
{
  const st = G.create(0, 2024);
  st.sandbox = true;
  st.tide = 0.30; st.waterE = -0.04 + st.tide * 1.08;
  st.birds.length = 0; st.birdTimer = 1e9;   // 关鸟，单验觅食循环
  const cr = st.crabs[0];
  cr.sat = 0.2;
  let sawDown = false, sawFeed = false, sawUp = false, sawHome = false, sawMolt = false;
  for (let i = 0; i < 60 * 300 && !sawMolt; i++) {
    st.clams.length = 0;
    G.update(st, 1 / 60);
    const c0 = st.crabs[0];
    if (c0.state === 'down') sawDown = true;
    if (c0.state === 'feed') sawFeed = true;
    if (c0.state === 'up') sawUp = true;
    for (const e of st.events) if (e.t === 'home') sawHome = true;
    for (const e of st.events) if (e.t === 'molt') sawMolt = true;
    st.events.length = 0;
  }
  ok(sawDown, "会下滩 (down)");
  ok(sawFeed, "会滤食 (feed)");
  ok(sawUp, "会回撤 (up)");
  ok(sawHome, "回过洞 (home 事件)");
  ok(sawMolt, "会蜕壳长大 (molt 事件), moltCount=" + st.moltCount);
  let mx = 1; for (const c of st.crabs) mx = Math.max(mx, c.size);
  ok(mx >= 2, "至少一只涨到 size " + mx);
}

// ---------- 4b. 肥力场：吃掉会变薄，被水淹过才回肥 ----------
head("4b. 泥会被吃薄、只有涨潮淹没才回肥（潮汐吞吐的根据）");
{
  const st = G.create(0, 7788);
  st.sandbox = true; st.birdTimer = 1e9;
  st.tide = 0.15; st.waterE = -0.04 + st.tide * 1.08;   // 低潮位
  // 取一个「露出、且原本泡在初始水线下（肥）」的样点
  let px = 240, py = 560, f0 = 0;
  for (let y = 300; y < 780; y += 8) {
    const e = G.elevAt(st, 240, y);
    if (e > st.waterE + 0.01 && G.foodAt(st, 240, y) > 0.6) { py = y; f0 = G.foodAt(st, 240, y); break; }
  }
  ok(f0 > 0.6, "找到一块肥泥 f=" + f0.toFixed(2));
  ok(G.elevAt(st, px, py) > st.waterE, "取样点已露出 e=" + G.elevAt(st, px, py).toFixed(2));
  G._graze(st, px, py);
  const e1 = G.foodAt(st, px, py);
  ok(e1 < f0 - 0.5, "滤食一口把肥力从 " + f0.toFixed(2) + " 啃到 " + e1.toFixed(2));
  ok(G.foodAt(st, px + 40, py) < 0.79, "啃是成片的：旁边 40px 处也变薄 " + G.foodAt(st, px + 40, py).toFixed(2));
  // 露出时不回肥
  st.crabs.length = 0;   // 清场，排除别的蟹来吃
  for (let i = 0; i < 60 * 5; i++) G.update(st, 1 / 60);
  ok(G.foodAt(st, px, py) <= e1 + 1e-6, "露着的泥不会自己回肥（" + G.foodAt(st, px, py).toFixed(3) + "）");
  // 淹没后回肥
  st.tide = 0.95; st.waterE = -0.04 + st.tide * 1.08;
  for (let i = 0; i < 60 * 6; i++) G.update(st, 1 / 60);
  ok(G.foodAt(st, px, py) > e1 + 0.3, "被水淹过后回肥到 " + G.foodAt(st, px, py).toFixed(2));
  // 上限
  for (let i = 0; i < 60 * 40; i++) G.update(st, 1 / 60);
  ok(G.foodAt(st, px, py) <= 1.0001, "肥力封顶 1.0，实测 " + G.foodAt(st, px, py).toFixed(3));
}

// ---------- 4c. 停着不动 → 啃到的是薄泥（不能挂机） ----------
head("4c. 潮位定死不动 → 啃到的泥越来越薄；吞吐补给能吃上肥的");
{
  const yieldOf = (mode) => {
    const st = G.create(1, 4242);
    st.sandbox = true; st.birdTimer = 1e9;
    let ph = 0, rich = 0, n = 0, h1 = 0, h2 = 0, r1 = 0, r2 = 0;
    const T = 60 * 90;
    for (let i = 0; i < T; i++) {
      st.inUp = false; st.inDown = false;
      let tg;
      if (mode === 'park') tg = 0.30;
      else { ph += (1 / 60) / 14; tg = 0.30 + 0.20 * Math.sin(ph * Math.PI * 2); }
      if (st.tide < tg - 0.008) st.inUp = true; else if (st.tide > tg + 0.008) st.inDown = true;
      G.update(st, 1 / 60);
      for (const e of st.events) {
        if (e.t === 'bite') {
          rich += e.rich; n++;
          if (i < T / 2) { h1++; r1 += e.rich; } else { h2++; r2 += e.rich; }
        }
      }
      st.events.length = 0;
    }
    return { avg: n ? rich / n : 0, n, early: h1 ? r1 / h1 : 0, late: h2 ? r2 / h2 : 0 };
  };
  const p = yieldOf('park'), b = yieldOf('cycle');
  ok(p.n > 3 && b.n > 3, "两档都有进食样本（挂机 " + p.n + " 口 / 吞吐 " + b.n + " 口）");
  ok(b.avg > p.avg * 1.15, "吞吐派平均啃到 " + b.avg.toFixed(2) + " 肥力 > 挂机派 " + p.avg.toFixed(2) + " 的 1.15 倍");
  ok(p.late < p.early, "挂机派啃到的泥后半程变薄 " + p.early.toFixed(2) + " → " + p.late.toFixed(2));
}

// ---------- 5. 蟹的觅食带贴着水线（核心耦合） ----------
head("5. 蟹想去的肥泥带 = 水线露出侧（潮位牵着蟹走）");
{
  for (let sd = 0; sd < 4; sd++) {
    const st = G.create(1, 555 + sd * 13);
    st.sandbox = true; st.birdTimer = 1e9;
    const stats = [[], []];
    const ysAvg = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
    for (let phase = 0; phase < 2; phase++) {
      st.tide = phase === 0 ? 0.20 : 0.58;
      st.waterE = -0.04 + st.tide * 1.08;
      for (const c of st.crabs) { c.sat = 0.1; c.state = 'burrow'; c.x = c.hx; c.y = c.hy; }
      const ys = [], es = [];
      for (let i = 0; i < 60 * 60; i++) {
        G.update(st, 1 / 60); st.events.length = 0;
        for (const c of st.crabs) {
          if (c.state === 'feed') { ys.push(c.y); es.push(c.feedE); }
        }
      }
      stats[phase] = ys;
      if (phase === 0) ok(es.length > 0, "seed" + sd + " 低潮位下有进食样本 " + es.length);
    }
    const lo = ysAvg(stats[0]), hi = ysAvg(stats[1]);
    ok(lo > hi + 40, "seed" + sd + " 潮退得越低，蟹在越下游进食 y=" + lo.toFixed(0) + " vs " + hi.toFixed(0));
  }
}

// ---------- 6. 淹没 → 憋气 → 冲走 ----------
head("6. 被淹：憋气条归零即冲走，出水后恢复");
{
  const st = G.create(0, 313);
  st.sandbox = true; st.birdTimer = 1e9;
  const cr = st.crabs[0];
  st.tide = 0.20; st.waterE = -0.04 + st.tide * 1.08;
  for (let i = 0; i < 30; i++) { G.update(st, 1 / 60); st.events.length = 0; }
  ok(cr.air === G.airMax(cr.size), "露出时憋气全满");
  // 强行淹掉它
  st.tide = 0.99; st.waterE = -0.04 + st.tide * 1.08;
  let airSeen = [];
  for (let i = 0; i < 60 * 10; i++) {
    G.update(st, 1 / 60);
    airSeen.push(cr.air);
    if (!cr.alive) break;
    st.events.length = 0;
  }
  ok(!cr.alive, "淹久了被冲走");
  ok(st.washed === st.crabs.length, "满潮把全部 " + st.crabs.length + " 只都冲走，washed=" + st.washed);
  const dur = airSeen.length / 60;
  ok(dur > 2 && dur < 8, "憋气时长 " + dur.toFixed(1) + "s 在 2–8s");
  // 复活
  for (let i = 0; i < 60 * (G.REVIVE + 1); i++) { G.update(st, 1 / 60); st.events.length = 0; }
  ok(st.crabs[0].alive, "REVIVE=" + G.REVIVE + "s 后新蟹入住");
  ok(st.crabs[0].size === 1, "复活蟹从 size1 重来");
}

// ---------- 7. 涨潮驱鸟（核心正反馈） ----------
head("7. 涨潮驱鸟：猎物入水 → 鸟扑空");
{
  const st = G.create(2, 909);
  st.tide = 0.22; st.waterE = -0.04 + st.tide * 1.08;
  st.noBirdT = 0; st.birdTimer = 0.01;
  let birdSeen = false, scaredSeen = false;
  for (let i = 0; i < 60 * 30 && !scaredSeen; i++) {
    G.update(st, 1 / 60);
    if (st.birds.length) birdSeen = true;
    for (const e of st.events) if (e.t === 'scared') scaredSeen = true;
    st.events.length = 0;
    // 有鸟就猛涨潮
    if (st.birds.length) { st.inUp = true; st.inDown = false; } else { st.inUp = false; st.inDown = true; }
  }
  ok(birdSeen, "鸟会来");
  ok(scaredSeen, "涨潮能把鸟逼退（scared 事件）");
  ok(st.scared > 0, "scared 计数 " + st.scared);
}
{
  // 反向：不操作 → 鸟真吃到
  const st = G.create(2, 909);
  st.tide = 0.22; st.waterE = -0.04 + st.tide * 1.08;
  st.birdTimer = 1;
  for (let i = 0; i < 60 * 40; i++) { G.update(st, 1 / 60); st.events.length = 0; }
  ok(st.eaten > 0, "不操作会被吃到 " + st.eaten + " 只");
}

// ---------- 8. 鸟只抓「露出且贴水线」的蟹 ----------
head("8. 鸟的猎物选择：露出 + 高程最低");
{
  const st = G.create(3, 1717);
  st.sandbox = true;
  st.tide = 0.30; st.waterE = -0.04 + st.tide * 1.08;
  for (const c of st.crabs) { c.state = 'down'; c.sat = 0.3; }
  for (let i = 0; i < 60 * 3; i++) { G.update(st, 1 / 60); st.events.length = 0; }
  let checked = 0;
  for (let k = 0; k < 40; k++) {
    const p = G._pickPrey(st);
    if (!p) continue;
    checked++;
    ok(G.elevAt(st, p.x, p.y) >= st.waterE, "猎物必须是露出的");
    let anyLower = false;
    for (const c of st.crabs) {
      if (!c.alive || c.state === 'burrow') continue;
      if (G.elevAt(st, c.x, c.y) >= st.waterE && G.elevAt(st, c.x, c.y) < G.elevAt(st, p.x, p.y)) anyLower = true;
    }
    ok(!anyLower, "猎物是露出里高程最低的那只");
    for (let i = 0; i < 12; i++) { G.update(st, 1 / 60); st.events.length = 0; }
  }
  ok(checked > 5, "至少验了 5 次锁定，实际 " + checked);
}

// ---------- 9. 贝类：退潮揭示 → 涨潮冲刷 ----------
head("9. 贝类：退潮冒头、涨潮冲刷入囤");
{
  const st = G.create(0, 4242);
  st.sandbox = true; st.birdTimer = 1e9;
  let maxClams = 0;
  // 三个完整吞吐：退（冒头）→ 涨（冲刷）
  for (let cyc = 0; cyc < 4; cyc++) {
    st.inDown = true; st.inUp = false;
    for (let i = 0; i < 60 * 4; i++) {
      G.update(st, 1 / 60); st.events.length = 0;
      maxClams = Math.max(maxClams, st.clams.length);
      if (st.tide <= 0.12) break;
    }
    st.inDown = false; st.inUp = true;
    for (let i = 0; i < 60 * 4; i++) {
      G.update(st, 1 / 60); st.events.length = 0;
      if (st.tide >= 0.62) break;
    }
  }
  ok(maxClams > 0, "退潮会冒出贝类，峰值 " + maxClams);
  ok(maxClams <= 6, "同时存在不超过 6（CLAM_MAX），实际 " + maxClams);
  ok(st.oyster > 0, "完整吞吐后收进蚝囤 = " + st.oyster);
  ok(st.clamCount === st.oyster, "clamCount 与 oyster 一致");
}
{
  // 只涨不退 → 一滴都收不到（必须先退潮翻出新泥）
  const st = G.create(0, 4242);
  st.sandbox = true; st.birdTimer = 1e9;
  st.tide = 0.05; st.waterE = -0.04 + st.tide * 1.08;
  st.inUp = true;
  for (let i = 0; i < 60 * 25; i++) { G.update(st, 1 / 60); st.events.length = 0; }
  ok(st.oyster === 0, "只涨潮收不到贝（必须先退再涨），实际 " + st.oyster);
  ok(st.clamCount === 0, "只涨潮连贝都不冒");
}
{
  // 只退不涨 → 冒了但收不走
  const st = G.create(0, 4242);
  st.sandbox = true; st.birdTimer = 1e9;
  st.tide = 0.95; st.waterE = -0.04 + st.tide * 1.08;
  st.inDown = true;
  let saw = 0;
  for (let i = 0; i < 60 * 30; i++) { G.update(st, 1 / 60); saw = Math.max(saw, st.clams.length); st.events.length = 0; }
  ok(saw > 0 && st.oyster === 0, "只退不涨：冒了 " + saw + " 个但一个也收不走（" + st.oyster + "）");
}

// ---------- 10. 鸣锣 ----------
head("10. 鸣锣（充电宝）");
{
  const st = G.create(1, 606);
  st.sandbox = true;
  ok(!G.gong(st), "蚝囤不足时鸣锣失败（当前 " + st.oyster + "）");
  st.oyster = G.GONG_COST;
  st.birds.push({ x: 10, y: 10, ox: 10, oy: 10, tid: -1, t: 0, dur: 1, flap: 0 });
  ok(G.gong(st), "满 5 可鸣锣");
  ok(st.oyster === 0, "鸣锣扣 5 蚝");
  ok(st.birds.length === 0, "鸣锣清空全场鸟");
  ok(Math.abs(st.noBirdT - G.GONG_TIME) < 1e-9, "静默 " + G.GONG_TIME + "s");
  st.birdTimer = 0;
  for (let i = 0; i < 60 * 3; i++) { G.update(st, 1 / 60); st.events.length = 0; }
  ok(st.birds.length === 0, "静默期内不生成鸟");
}

// ---------- 11. 结算 / 星级 ----------
head("11. 结算与星级");
{
  const st = G.create(0, 88);
  st.sandbox = true; st.birdTimer = 1e9;
  st.timeLeft = 0.001;
  G.update(st, 1 / 60);
  ok(st.over, "时间到即结算");
  ok(st.result && typeof st.result.vitality === 'number', "产出 result");
  ok(st.result.star >= 0 && st.result.star <= 3, "星级 0–3：" + st.result.star);
  const before = st.tide;
  for (let i = 0; i < 60; i++) G.update(st, 1 / 60);
  ok(st.tide === before && st.crabs.every(c => true), "结算后不再推进");
  // 星级阈值（生机只算蟹群）
  const mk = (v) => {
    const s = G.create(0, 88); s.timeLeft = 0.001; s.goal = 20; s.crabs = [];
    const n = Math.round(v / 4);
    for (let i = 0; i < n; i++) s.crabs.push({ alive: true, size: 1 });
    G.update(s, 1 / 60); return s.result.star;
  };
  ok(mk(20) === 1, "刚好达标 = 1 星");
  ok(mk(26) === 2, "1.3× = 2 星");
  ok(mk(32) === 3, "1.6× = 3 星");
  ok(mk(16) === 0, "未达标 = 0 星（16 < 20）");
  // 生机不含贝类
  {
    const s = G.create(0, 88); s.timeLeft = 0.001;
    const base = s.result ? 0 : 0;
    const st2 = G.create(0, 88); st2.crabs = []; st2.oyster = 50; st2.timeLeft = 0.001;
    G.update(st2, 1 / 60);
    ok(st2.result.vitality === 0, "贝类不计入生机（只作鸣锣燃料），实测 " + st2.result.vitality);
  }
}

// ---------- 12. dt 防御 ----------
head("12. dt 防御 / 随机乱打不崩");
{
  const st = G.create(4, 31);
  st.inUp = true;
  G.update(st, 0);           // dt=0
  G.update(st, -5);          // 负 dt
  G.update(st, 1e9);         // 巨大 dt
  G.update(st, NaN);         // NaN
  ok(isFinite(st.tide) && st.tide >= 0 && st.tide <= 1, "极端 dt 后潮位仍合法 " + st.tide);
  let bad = 0;
  for (let i = 0; i < 4000; i++) {
    st.inUp = Math.random() < 0.4; st.inDown = Math.random() < 0.4;
    if (Math.random() < 0.02) st.inUp = st.inDown = true;
    if (Math.random() < 0.01) G.gong(st);
    G.update(st, Math.random() * 0.05);
    st.events.length = 0;
    for (const c of st.crabs) {
      if (!isFinite(c.x) || !isFinite(c.y) || c.x < -50 || c.x > G.W + 50 || c.y < -50 || c.y > G.H + 50) bad++;
      if (c.size < 1 || c.size > G.MAX_SIZE) bad++;
      if (c.sat < -0.01 || c.sat > 1.01) bad++;
    }
  }
  ok(bad === 0, "4000 步随机乱打无越界/无非法值（bad=" + bad + "）");
  ok(st.t >= 0 && isFinite(st.t), "时间累计合法 " + st.t.toFixed(1));
}

// ---------- 13. 确定性 ----------
head("13. 同种子同输入 → 同结果");
{
  const run = () => {
    const st = G.create(2, 31415);
    for (let i = 0; i < 60 * 40; i++) {
      st.inUp = (i % 200) < 90; st.inDown = (i % 200) >= 130;
      G.update(st, 1 / 60); st.events.length = 0;
    }
    return [st.tide.toFixed(6), G.vitality(st), st.eaten, st.washed, st.clamCount].join("|");
  };
  ok(run() === run(), "两次相同输入结果一致: " + run());
}

// ---------- 14. 平衡：四档 AI 对照 ----------
head("14. 平衡对照（每档 ×5 关 ×6 种子）");

function runAI(lv, seed, mode) {
  const st = G.create(lv, seed);
  const dt = 1 / 60;
  let ph = 0;
  while (!st.over) {
    st.inUp = false; st.inDown = false;
    let target = null;
    if (mode === 'noop') target = st.tide;                 // 一次都不碰
    else if (mode === 'park') target = 0.34;               // 停在中潮位挂机
    else if (mode === 'low') target = 0.15;                // 一味退潮
    else if (mode === 'high') target = 0.70;               // 一味涨潮
    else if (mode === 'breath') {                          // 盲目大幅吞吐，不看鸟不看蟹
      ph += dt / 10;
      target = 0.40 + 0.24 * Math.sin(ph * Math.PI * 2);
    } else if (mode === 'soft') {                          // 温和吞吐（新手节奏）
      ph += dt / 16;
      target = 0.40 + 0.15 * Math.sin(ph * Math.PI * 2);
    } else if (mode === 'smartNF') {                       // 会驱鸟，但不管泥薄不薄（对照：肥力机制是否必要）
      if (st.birds.length) {
        let need = -1;
        for (const b of st.birds) for (const c of st.crabs) {
          if (c.alive && c.id === b.tid) need = Math.max(need, G.elevAt(st, c.x, c.y));
        }
        target = (need + 0.05 + 0.04) / 1.08;
        if (st.oyster >= G.GONG_COST && st.birds.length >= 2) G.gong(st);
      } else target = 0.16;   // 一味趴在低位，永不涨潮补给
    } else if (mode === 'smart') {
      // ① 有鸟 → 只涨到「刚好淹过被盯上的那只」，不多涨一分
      // ② 无鸟 → 退到低位开饭（退潮翻新泥 + 冒贝）
      // ③ 泥吃薄了 → 涨回去淹一轮补给
      if (st.birds.length) {
        let need = -1;
        for (const b of st.birds) for (const c of st.crabs) {
          if (c.alive && c.id === b.tid) need = Math.max(need, G.elevAt(st, c.x, c.y));
        }
        target = (need + 0.05 + 0.04) / 1.08;
        if (st.oyster >= G.GONG_COST && st.birds.length >= 2) G.gong(st);
      } else {
        // 评估当前泥带肥力：抽样水线露出侧
        let fs = 0, n = 0;
        for (let k = 0; k < 12; k++) {
          const x = 30 + (k * 37) % (G.W - 60);
          const y = 240 + ((k * 53) % 400);
          const e = G.elevAt(st, x, y);
          if (e > st.waterE + 0.02 && e < st.waterE + 0.18) { fs += G.foodAt(st, x, y); n++; }
        }
        const thin = n === 0 || fs / n < 0.42;
        target = thin ? 0.62 : 0.16;     // 薄了就涨潮补给，够了就退潮开饭
      }
    }
    if (target != null) {
      if (st.tide < target - 0.008) st.inUp = true;
      else if (st.tide > target + 0.008) st.inDown = true;
    }
    G.update(st, dt);
    st.events.length = 0;
  }
  return st.result;
}

const modes = ['noop', 'park', 'low', 'high', 'breath', 'soft', 'smartNF', 'smart'];
const seeds = [11, 202, 3003, 40004, 500005, 6000006];
const agg = {};
modes.forEach(m => agg[m] = { v: [], star: [], win: 0, n: 0, eat: 0, wash: 0, molt: 0 });
console.log("关卡 | " + modes.map(m => m.padStart(13)).join(" |"));
for (let lv = 0; lv < G.LEVELS.length; lv++) {
  const row = [];
  for (const m of modes) {
    let vs = 0, st3 = 0, win = 0;
    const stash = [];
    for (const sd of seeds) {
      const st0 = G.create(lv, sd * 7 + 1);
      const r = runAI(lv, sd * 7 + 1, m);
      vs += r.vitality; st3 += r.star; win += r.star >= 1 ? 1 : 0;
      agg[m].v.push(r.vitality); agg[m].star.push(r.star); agg[m].n++;
      if (r.star >= 1) agg[m].win++;
    }
    row.push((vs / seeds.length).toFixed(0) + "★" + (st3 / seeds.length).toFixed(1) + "/" + win);
  }
  console.log(" L" + (lv + 1) + "  | " + row.map(s => s.padStart(13)).join(" |") + "  goal=" + G.LEVELS[lv].goal);
}
console.log("\n汇总（生机均值 / 星级均值 / 达标率）:");
const mv = a => a.v.reduce((x, y) => x + y, 0) / a.v.length;
for (const m of modes) {
  const a = agg[m];
  const ms = a.star.reduce((x, y) => x + y, 0) / a.star.length;
  console.log("  " + m.padEnd(7) + " 生机 " + mv(a).toFixed(1).padStart(6) + " | 星级 " + ms.toFixed(2) + " | 达标率 " + (a.win / a.n * 100).toFixed(0) + "%");
}
console.log("\n各关容量参考（初始蟹群生机 = 洞数×4，全 size3 = 洞数×12）:");
G.LEVELS.forEach((L, i) => console.log("  L" + (i + 1) + " 洞" + L.burrows + " → 底 " + (L.burrows * 4) + " / 顶 " + (L.burrows * 12) + " / 现 goal " + L.goal));

ok(mv(agg['smart']) > mv(agg['noop']) * 1.5, "会调度 >> 不操作 (" + mv(agg['smart']).toFixed(1) + " vs " + mv(agg['noop']).toFixed(1) + ")");
ok(mv(agg['smart']) > mv(agg['park']) * 1.25, "会调度 > 挂机定潮位 (" + mv(agg['smart']).toFixed(1) + " vs " + mv(agg['park']).toFixed(1) + ")");
ok(mv(agg['smart']) > mv(agg['breath']), "会调度 > 盲目吞吐 (" + mv(agg['smart']).toFixed(1) + " vs " + mv(agg['breath']).toFixed(1) + ")");
ok(mv(agg['high']) < mv(agg['smart']), "一味涨潮不如会调度 (" + mv(agg['high']).toFixed(1) + " vs " + mv(agg['smart']).toFixed(1) + ")");
ok(mv(agg['smart']) > mv(agg['smartNF']) * 1.06,
  "会补给泥 >> 只驱鸟不补给 (" + mv(agg['smart']).toFixed(1) + " vs " + mv(agg['smartNF']).toFixed(1) +
  "，+" + ((mv(agg['smart']) / mv(agg['smartNF']) - 1) * 100).toFixed(0) + "%，肥力层确实加分)");
ok(agg['smart'].win / agg['smart'].n >= 0.75, "会调度达标率 ≥75%，实际 " + (agg['smart'].win / agg['smart'].n * 100).toFixed(0) + "%");
ok(agg['noop'].win / agg['noop'].n <= 0.25, "不操作达标率 ≤25%，实际 " + (agg['noop'].win / agg['noop'].n * 100).toFixed(0) + "%");

console.log("\n==== " + pass + " passed, " + fail + " failed ====");
process.exit(fail ? 1 : 0);
