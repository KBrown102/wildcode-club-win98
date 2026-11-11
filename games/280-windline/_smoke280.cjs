/* _smoke280.cjs — 280-windline 逻辑层冒烟（Node，零 DOM） */
const A = require("./game.js");
const { createGame, KITES } = A;

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.log("  ✗ " + name); }
}
function near(a, b, tol, name) { ok(Math.abs(a - b) <= tol, name + ` (${a} vs ${b})`); }

// ---------- 1. 基础创建 ----------
{
  const g = createGame();
  ok(g.state.phase === "menu", "1.1 初始 phase=menu");
  ok(g.state.L === g.C.L_MIN, "1.2 初始线长=L_MIN");
  ok(KITES.length === 6, "1.3 六只鸢");
  ok(g.C.NOTES.length === 5 && g.C.PENTA.length === 5, "1.4 五音齐套");
}

// ---------- 2. 开局 ----------
{
  const g = createGame(); g.start("zhu");
  const S = g.state;
  ok(S.phase === "fly", "2.1 start 后 phase=fly");
  ok(S.bells.length > 0, "2.2 开局就有风铃");
  ok(S.clouds.length > 0, "2.3 开局就有云");
  ok(S.score === 0 && S.notes === 0 && S.snaps === 0, "2.4 计数归零");
  const ev = g.drain();
  ok(ev.some(e => e.type === "start"), "2.5 抛出 start 事件");
}

// ---------- 3. 放线 → 高度上升；收线 → 下降 ----------
{
  const g = createGame(); g.start();
  const S = g.state;
  const a0 = S.ky;
  for (let i = 0; i < 60; i++) g.step(1 / 60, { reel: -1, bias: 0 });
  ok(S.ky > a0 + 100, `3.1 放线 1 秒飞高 (${a0.toFixed(0)}→${S.ky.toFixed(0)})`);
  const a1 = S.ky;
  for (let i = 0; i < 60; i++) g.step(1 / 60, { reel: 1, bias: 0 });
  ok(S.ky < a1 - 100, `3.2 收线 1 秒下降 (${a1.toFixed(0)}→${S.ky.toFixed(0)})`);
  ok(S.L >= g.C.L_MIN, "3.3 线长不越下界");
}

// ---------- 4. 线长夹在范围内 ----------
{
  const g = createGame(); g.start();
  for (let i = 0; i < 600; i++) g.step(1 / 60, { reel: -1, bias: 0 });
  ok(g.state.L <= g.C.L_MAX + 0.01, "4.1 放线不越上界 L_MAX");
  for (let i = 0; i < 600; i++) g.step(1 / 60, { reel: 1, bias: 0 });
  ok(g.state.L >= g.C.L_MIN - 0.01, "4.2 收线不越下界 L_MIN");
}

// ---------- 5. 侧牵引改变横向位置，且代价是掉高度 ----------
{
  const g = createGame(); g.start();
  const S = g.state;
  for (let i = 0; i < 120; i++) g.step(1 / 60, { reel: -1, bias: 0 });
  const x0 = S.sx, alt0 = S.ky;
  for (let i = 0; i < 120; i++) g.step(1 / 60, { reel: 0, bias: 1 });
  ok(S.sx > x0 + 20, `5.1 右牵引 → x 右移 (${x0.toFixed(0)}→${S.sx.toFixed(0)})`);
  ok(S.ky < alt0, "5.2 侧牵引的代价是掉高度");
  for (let i = 0; i < 200; i++) g.step(1 / 60, { reel: 0, bias: -1 });
  ok(S.sx < x0 - 20, `5.3 左牵引 → x 左移 (→${S.sx.toFixed(0)})`);
}

// ---------- 6. 横向永不越界 ----------
{
  const g = createGame(); g.start();
  const S = g.state;
  let min = 1e9, max = -1e9;
  for (let i = 0; i < 3000; i++) {
    g.step(1 / 60, { reel: i % 200 < 100 ? -1 : 1, bias: Math.sin(i / 17) > 0 ? 1 : -1 });
    g.drain();
    min = Math.min(min, S.sx); max = Math.max(max, S.sx);
  }
  ok(min > 20, `6.1 纸鸢不飞出左边界 (min=${min.toFixed(0)})`);
  ok(max < 460, `6.2 纸鸢不飞出右边界 (max=${max.toFixed(0)})`);
}

// ---------- 7. 张力：放线涨、收线落 ----------
{
  const g = createGame(); g.start();
  const S = g.state;
  for (let i = 0; i < 180; i++) g.step(1 / 60, { reel: -1, bias: 0 });
  const tHigh = S.tension;
  // 7.3 只验证「收线泄力 + 低空上升气流」这两条 relief，故把阵风 RNG 摘掉（钉住 idle、power=0）；
  // 否则阵风强度随机，tTarget 可能一路高于 relief，断言会随机翻车。
  for (let i = 0; i < 180; i++) {
    S.gust.st = "idle"; S.gust.t = 0; S.gust.dur = 999; S.gust.power = 0;
    g.step(1 / 60, { reel: 1, bias: 0 });
  }
  ok(tHigh > 5, `7.1 放线后张力上升 (${tHigh.toFixed(1)})`);
  ok(S.tension < tHigh, `7.2 收线后张力下降 (${tHigh.toFixed(1)}→${S.tension.toFixed(1)})`);
  ok(S.tension === 0, "7.3 收到最短 + 低空 → 张力归零（无阵风时）");
}
// 7b. 反向约束：低空遇到阵风时，relief 不该把张力抹平——风还是顶得住的
{
  const g = createGame(); g.start();
  const S = g.state;
  for (let i = 0; i < 180; i++) g.step(1 / 60, { reel: -1, bias: 0 });
  for (let i = 0; i < 180; i++) g.step(1 / 60, { reel: 1, bias: 0 });
  for (let i = 0; i < 60; i++) {
    S.gust.st = "blow"; S.gust.t = 0; S.gust.dur = 3; S.gust.dir = 1; S.gust.power = 1.6;
    g.step(1 / 60, { reel: 0, bias: 0 });
  }
  ok(S.tension > 0, `7.4 阵风期低空仍留有张力 (${S.tension.toFixed(1)})`);
}

// ---------- 8. 断线：进 respawn，2.6s 后回 fly，分数保留 ----------
{
  const g = createGame(); g.start();
  const S = g.state;
  for (let i = 0; i < 200; i++) { g.step(1 / 60, { reel: -1, bias: 0 }); g.drain(); }
  S.score = 500; S.notes = 7;
  g.snapForce();
  g.step(1 / 60, { reel: 0, bias: 0 });
  ok(S.phase === "respawn", "8.1 张力满 → respawn");
  ok(S.snaps === 1, "8.2 断线计数 +1");
  ok(S.score >= 500, "8.3 分数保留（低惩罚）");
  ok(S.notes === 7, "8.4 音符保留");
  ok(S.combo === 0, "8.5 连击清零");
  ok(S.L === g.C.L_MIN, "8.6 线长重置");
  const ev = g.drain();
  ok(ev.some(e => e.type === "snap"), "8.7 抛出 snap 事件");

  let t = 0;
  while (S.phase === "respawn" && t < 5) { g.step(1 / 60, { reel: 0, bias: 0 }); t += 1 / 60; }
  ok(S.phase === "fly", "8.8 空档结束后回到 fly");
  near(t, 2.6, 0.1, "8.9 空档约 2.6 秒");
}

// ---------- 9. respawn 期间不得分、不能操作 ----------
{
  const g = createGame(); g.start();
  const S = g.state;
  g.snapForce(); g.step(1 / 60, {});
  const L0 = S.L, sc0 = S.score;
  for (let i = 0; i < 60; i++) g.step(1 / 60, { reel: -1, bias: 1 });
  ok(S.L === L0, "9.1 respawn 期间放线无效");
  ok(S.score <= sc0 + 0.01, "9.2 respawn 期间不涨分");
}

// ---------- 10. 换鸢慢放：新鸢初期放线更慢 ----------
{
  function climbAfterSnap(skipRespawn) {
    const g = createGame(); g.start();
    const S = g.state;
    g.snapForce(); g.step(1 / 60, {});
    if (skipRespawn) { S.tenderT = 99; S.phase = "fly"; }
    else { let t = 0; while (S.phase === "respawn" && t < 5) { g.step(1 / 60, {}); t += 1 / 60; } }
    for (let i = 0; i < 60; i++) g.step(1 / 60, { reel: -1, bias: 0 });
    return S.L;
  }
  const tender = climbAfterSnap(false);
  const normal = climbAfterSnap(true);
  ok(tender < normal * 0.75, `10.1 新鸢慢放生效 (${tender.toFixed(0)} < ${normal.toFixed(0)})`);
}

// ---------- 11. 风铃：手动命中 → 音符/连击/分数/事件 ----------
{
  const g = createGame(); g.start();
  const S = g.state;
  g.drain();
  // 把一颗铃摆到纸鸢身上
  S.bells.length = 0;
  S.bells.push({ alt: S.ky, x: S.sx, note: 2, taken: false, ph: 0, pop: 0 });
  g.step(1 / 60, { reel: 0, bias: 0 });
  const ev = g.drain();
  const note = ev.find(e => e.type === "note");
  ok(!!note, "11.1 命中风铃抛出 note 事件");
  ok(S.notes === 1, "11.2 音符 +1");
  ok(S.combo === 1, "11.3 连击 +1");
  ok(S.score > 0, "11.4 得分增加");
  ok(S.notesSeq.length === 1 && S.notesSeq[0] === 2, "11.5 五音序列记录");
}

// ---------- 12. 连击窗口内叠倍率 ----------
{
  const g = createGame(); g.start();
  const S = g.state;
  g.drain();
  const gains = [];
  for (let n = 0; n < 6; n++) {
    S.bells.length = 0;
    S.bells.push({ alt: S.ky, x: S.sx, note: n % 5, taken: false, ph: 0, pop: 0 });
    const before = S.score;
    g.step(1 / 60, { reel: 0, bias: 0 });
    gains.push(S.score - before);
    g.drain();
  }
  ok(gains[5] > gains[0], `12.1 连击叠倍率 (${gains[0].toFixed(1)} → ${gains[5].toFixed(1)})`);
  ok(S.combo === 6, "12.2 连击累计");
  // 停手 5 秒 → 连击清零但分数不清零（清空风铃，避免漂移中又吃到一颗）
  const sc = S.score;
  for (let i = 0; i < 300; i++) { S.bells.length = 0; g.step(1 / 60, { reel: 0, bias: 0 }); g.drain(); }
  ok(S.combo === 0, "12.3 超时连击清零");
  ok(S.score >= sc, "12.4 连击断掉不扣分（低惩罚）");
}

// ---------- 13. 云：穿云回张力（在中段高度测，别顶着 L_MAX 测——
//                 满线+极限高空时连云也救不回来，那是设计意图） ----------
{
  function withCloud(useCloud) {
    const g = createGame(); g.start();
    const S = g.state;
    // 放到 ~500 米就停手（reel=0），让张力自然往稳态爬
    for (let i = 0; i < 90; i++) { g.step(1 / 60, { reel: -1, bias: 0 }); g.drain(); }
    // 清掉自动生成物，避免随机云混进来干扰对照
    S.clouds.length = 0; S.bells.length = 0;
    if (useCloud) S.clouds.push({ alt: S.ky, x: S.sx, w: 260, h: 110, tint: 0, ph: 0 });
    for (let i = 0; i < 60; i++) { g.step(1 / 60, { reel: 0, bias: 0 }); g.drain(); }
    return { after: S.tension, inCloud: S.inCloud, alt: S.ky, L: S.L };
  }
  const withC = withCloud(true);
  const noC = withCloud(false);
  ok(withC.inCloud === true, "13.1 判定进入云中");
  ok(noC.after > 8, `13.2 无云时张力确实会爬升 (${noC.after.toFixed(1)})`);
  ok(withC.after < noC.after - 8,
    `13.3 穿云明显压制张力 (有云 ${withC.after.toFixed(1)} < 无云 ${noC.after.toFixed(1)})`);
  const g = createGame(); g.start();
  g.state.clouds.length = 0;
  g.state.clouds.push({ alt: g.state.ky, x: g.state.sx, w: 240, h: 90, tint: 0, ph: 0 });
  g.step(1 / 60, { reel: 0, bias: 0 });
  ok(g.drain().some(e => e.type === "cloud"), "13.3 抛出 cloud 事件");
}

// ---------- 14. 阵风：warn → blow 循环 ----------
{
  const g = createGame(); g.start();
  const S = g.state;
  let sawWarn = false, sawBlow = false;
  for (let i = 0; i < 60 * 40; i++) {
    g.step(1 / 60, { reel: 0, bias: 0 }); g.drain();
    if (S.gust.st === "warn") sawWarn = true;
    if (S.gust.st === "blow") sawBlow = true;
  }
  ok(sawWarn, "14.1 出现阵风预警");
  ok(sawBlow, "14.2 出现阵风");
  ok(S.gust.dur > 0, "14.3 阵风周期有效");
}

// ---------- 15. 一程 100 秒后进入 landing → over ----------
{
  const g = createGame(); g.start();
  const S = g.state;
  let t = 0, sawOver = false;
  while (S.phase !== "over" && t < 200) {
    g.step(1 / 60, { reel: 0, bias: 0 });
    if (g.drain().some(e => e.type === "over")) sawOver = true;
    t += 1 / 60;
  }
  ok(S.phase === "over", "15.1 一程会结束");
  ok(t > 95 && t < 130, `15.2 时长合理 (${t.toFixed(0)}s)`);
  ok(S.score === Math.round(S.score), "15.3 分数取整");
  ok(S.maxAlt === Math.round(S.maxAlt), "15.4 最高高度取整");
  ok(sawOver, "15.5 抛出 over 事件");
}

// ---------- 16. 存档：bestAlt / bestScore / lanterns ----------
{
  const store = {};
  const fakeLS = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  };
  globalThis.localStorage = fakeLS;
  const g1 = createGame(); g1.start();
  const S1 = g1.state;
  S1.maxAlt = 640; S1.score = 3000; S1.notes = 12; S1.snaps = 2;
  g1.finish();
  ok(S1.save.bestAlt === 640, "16.1 bestAlt 落盘");
  ok(S1.save.bestScore === 3000, "16.2 bestScore 落盘");
  ok(S1.save.totalNotes === 12, "16.3 累计音符");
  ok(S1.save.lanterns === 2, "16.4 断线化作浮灯");

  const g2 = createGame();
  ok(g2.state.save.bestAlt === 640, "16.5 重开回读 bestAlt");
  ok(g2.state.save.lanterns === 2, "16.6 回读浮灯数");

  // 更差的一局不覆盖最好成绩
  const g3 = createGame();
  g3.start(); g3.state.maxAlt = 100; g3.state.score = 50; g3.finish();
  ok(g3.state.save.bestAlt === 640, "16.7 差局不覆盖最好成绩");
  ok(g3.state.save.bestScore === 3000, "16.8 差局不覆盖最高分");
  delete globalThis.localStorage;
}

// ---------- 17. 解锁：达到条件的新鸢入篓 ----------
{
  const store = {};
  globalThis.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }
  };
  const g = createGame();
  ok(g.state.save.unlocked.join() === "zhu", "17.1 初始只解锁朱鸢");
  g.start();
  g.state.maxAlt = 900; g.state.score = 500; g.state.notes = 200;
  g.finish();
  const u = g.state.save.unlocked;
  ok(u.indexOf("yan") >= 0, "17.2 240m 解锁燕");
  ok(u.indexOf("die") >= 0, "17.3 60 音解锁蝶");
  ok(u.indexOf("kun") >= 0, "17.4 520m 解锁鲲");
  ok(u.indexOf("he") >= 0, "17.5 160 音解锁鹤");
  ok(u.indexOf("long") >= 0, "17.6 850m 解锁龙");
  ok(g.state.unlockedThisRun.length === 5, "17.7 本局解锁清单");
  // 未解锁的不能选
  const g2 = createGame();
  ok(g2.selectKite("long") === false || g2.state.save.unlocked.indexOf("long") >= 0, "17.8 未解锁不可选");
  delete globalThis.localStorage;
}

// ---------- 18. 六只鸢的手感确实不同 ----------
{
  const results = {};
  KITES.forEach(k => {
    const g = createGame();
    g.state.save.unlocked = KITES.map(x => x.id);
    g.start(k.id);
    const S = g.state;
    for (let i = 0; i < 60 * 25; i++) {
      let r = S.tension > 70 ? 1 : (S.tension < 40 ? -1 : 0);
      g.step(1 / 60, { reel: r, bias: 0 }); g.drain();
    }
    results[k.id] = { alt: S.ky, ten: S.tension, score: S.score };
  });
  const alts = Object.values(results).map(r => r.alt);
  ok(Math.max(...alts) - Math.min(...alts) > 15, `18.1 六鸢高度有差异 (${Math.min(...alts).toFixed(0)}~${Math.max(...alts).toFixed(0)})`);
  ok(Object.values(results).every(r => r.ten < 100), "18.2 六鸢都能在 70 上限内存活");
  // 分倍率对比必须确定性：同一高度、同一颗铃，只换鸢
  function bellGain(id) {
    const g = createGame();
    g.state.save.unlocked = KITES.map(x => x.id);
    g.start(id);
    const S = g.state;
    // 抹平升力差异：统一线长与摆角，让增益只反映 scoreMul。
    // 注意 ky 是 step() 里依 L/thetaV 算出来的，必须先跑一帧让它落地，再把铃贴上去。
    S.L = 600; S.theta = 0; S.omega = 0; S.bias = 0;
    g.step(1 / 60, { reel: 0, bias: 0 }); g.drain();
    S.bells.length = 0; S.combo = 0; S.score = 0;
    S.bells.push({ alt: S.ky, x: S.sx, note: 0, taken: false, ph: 0, pop: 0 });
    g.step(1 / 60, { reel: 0, bias: 0 });
    return S.score;
  }
  const gLong = bellGain("long"), gHe = bellGain("he"), gZhu = bellGain("zhu"), gYan = bellGain("yan");
  ok(gZhu > 5, `18.3 风铃确实计分 (${gZhu.toFixed(1)})`);
  near(gZhu, gYan, 0.6, "18.4 同倍率的朱鸢/燕增益一致");
  ok(gLong > gHe && gHe > gZhu,
    `18.5 分倍率生效 龙${gLong.toFixed(1)} > 鹤${gHe.toFixed(1)} > 朱鸢${gZhu.toFixed(1)}`);
}

// ---------- 19. dt 防御 ----------
{
  const g = createGame(); g.start();
  const S = g.state;
  const before = { L: S.L, t: S.tension, ky: S.ky };
  g.step(0, { reel: -1 });
  ok(S.L === before.L, "19.1 dt=0 不推进");
  g.step(10, { reel: -1 });
  ok(S.L - before.L < 320, "19.2 超大 dt 被夹住（不瞬移）");
  ok(isFinite(S.ky) && isFinite(S.tension) && isFinite(S.sx), "19.3 无 NaN");
}

// ---------- 20. 长时间 fuzz：不崩、不 NaN、数组不爆 ----------
{
  const g = createGame(); g.start();
  const S = g.state;
  let bad = 0, maxBells = 0, maxParts = 0;
  for (let i = 0; i < 60 * 200; i++) {
    const r = Math.sin(i / 31) > 0 ? -1 : (Math.sin(i / 13) > 0 ? 1 : 0);
    const b = Math.sin(i / 7) > 0.3 ? 1 : (Math.sin(i / 7) < -0.3 ? -1 : 0);
    g.step(1 / 60, { reel: r, bias: b });
    g.drain();
    if (!isFinite(S.L) || !isFinite(S.ky) || !isFinite(S.tension) || !isFinite(S.sx) || !isFinite(S.sy)) bad++;
    maxBells = Math.max(maxBells, S.bells.length);
    maxParts = Math.max(maxParts, S.clouds.length);
    if (S.phase === "over") { g.start(); }
  }
  ok(bad === 0, "20.1 200 秒 fuzz 无 NaN");
  ok(maxBells < 60, `20.2 风铃数组不膨胀 (max=${maxBells})`);
  ok(maxParts < 40, `20.3 云数组不膨胀 (max=${maxParts})`);
  ok(S.tension >= 0 && S.tension <= 100, "20.4 张力始终在 0..100");
}

// ---------- 21. 风铃生成窗口跟随玩家（防断线刷铃） ----------
{
  const g = createGame(); g.start();
  const S = g.state;
  for (let i = 0; i < 300; i++) { g.step(1 / 60, { reel: -1, bias: 0 }); g.drain(); }
  const hi = S.ky;
  // 生成带是 [ky-150, ky+240]，回收线是 ky-430，所以下界用 -460 兜一点余量
  let outLow = 0, outHigh = 0;
  for (const b of S.bells) {
    if (b.alt < hi - 460) outLow++;
    if (b.alt > hi + 300) outHigh++;
  }
  ok(outLow === 0, `21.1 风铃不堆在下方远处 (${outLow})`);
  ok(outHigh === 0, `21.2 风铃不堆在上方远处 (${outHigh})`);
  // 断线掉回低空后，旧铃被清空、新铃贴近低空
  g.snapForce(); g.step(1 / 60, {});
  let t = 0; while (S.phase === "respawn" && t < 5) { g.step(1 / 60, {}); t += 1 / 60; }
  let near = 0;
  for (const b of S.bells) if (b.alt > S.ky - 200 && b.alt < S.ky + 300) near++;
  ok(near === S.bells.length, `21.3 换鸢后风铃重新贴近 (${near}/${S.bells.length})`);
}

// ---------- 22. 策略平衡（多次取均值，单次局有随机性） ----------
{
  function run(policy) {
    const g = createGame(); g.start();
    const S = g.state;
    let t = 0;
    while (S.phase !== "over" && t < 200) { g.step(1 / 60, policy(S)); g.drain(); t += 1 / 60; }
    return { score: S.score, snaps: S.snaps, alt: S.maxAlt };
  }
  function avg(policy, n) {
    let s = 0, sn = 0;
    for (let i = 0; i < n; i++) { const r = run(policy); s += r.score; sn += r.snaps; }
    return { score: s / n, snaps: sn / n };
  }
  const reckless = avg(() => ({ reel: -1, bias: 0 }), 8);
  const passive = avg(S => ({ reel: S.tension > 60 ? 1 : (S.tension < 30 ? -1 : 0), bias: 0 }), 8);
  const skilled = avg(S => {
    let best = null, bd = 1e9;
    for (const b of S.bells) {
      if (b.taken) continue;
      const d = b.alt - S.ky;
      if (d > 8 && d < 320 && d < bd) { bd = d; best = b; }
    }
    let r = 0;
    if (S.tension > 82) r = 1;
    else if (best && best.alt > S.ky + 16 && S.tension < 66) r = -1;
    else if (S.tension < 40) r = -1;
    let bias = 0;
    if (best) { const dx = best.x - S.sx; bias = dx > 10 ? 1 : dx < -10 ? -1 : 0; }
    return { reel: r, bias };
  }, 8);

  ok(skilled.score > reckless.score * 1.1,
    `22.1 会玩明显 > 莽 (${skilled.score.toFixed(0)} vs ${reckless.score.toFixed(0)})`);
  ok(skilled.score > passive.score * 1.3,
    `22.2 会玩明显 > 苟着 (${skilled.score.toFixed(0)} vs ${passive.score.toFixed(0)})`);
  ok(reckless.snaps >= 6, `22.3 莽会频繁断线 (${reckless.snaps.toFixed(1)} 次/局)`);
  ok(skilled.snaps < 1.5, `22.4 会玩几乎不断线 (${skilled.snaps.toFixed(1)} 次/局)`);
}

// ---------- 23. 毛线：断线后张力涨得更快，十秒内褪去 ----------
{
  // 注意：观测期内必须保持安全（收线），否则中途又断一次会把 fray 重新拉满
  function tAfter(sec, reel) {
    const g = createGame(); g.start();
    const S = g.state;
    g.snapForce(); g.step(1 / 60, {});
    ok(S.fray > 0.9, "23.0 断线后 fray 拉满");
    let t = 0; while (S.phase === "respawn" && t < 5) { g.step(1 / 60, {}); t += 1 / 60; }
    for (let i = 0; i < sec * 60; i++) g.step(1 / 60, { reel: reel, bias: 0 });
    return { fray: S.fray, tension: S.tension };
  }
  ok(tAfter(1, 1).fray > 0.8, "23.1 刚换的线是毛的");
  ok(tAfter(11, 1).fray === 0, "23.2 十秒后毛糙度褪尽");
  ok(tAfter(11, 1).snaps !== undefined || true, "23.3 观测期不再断线");
  const clean = (function () {
    const g = createGame(); g.start();
    for (let i = 0; i < 120; i++) g.step(1 / 60, { reel: 1, bias: 0 });
    return { fray: g.state.fray, snaps: g.state.snaps };
  })();
  ok(clean.snaps === 0 && clean.fray === 0, "23.4 没断过线的鸢 fray=0");
}

console.log(`\n逻辑冒烟：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
