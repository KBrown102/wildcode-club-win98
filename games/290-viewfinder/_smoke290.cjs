// _smoke290.cjs — 290-viewfinder 逻辑冒烟 + AI 对照 + par 标定
const fs = require("fs"), vm = require("vm");
const src = fs.readFileSync(__dirname + "/game.js", "utf-8");
const ctx = { console };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(src, ctx);
const VF = ctx.VF;
const { create, update, shoot, frameOf, objPos, idealFor, compose, occluded, clamp, clamp01 } = VF;

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log("  ✗ " + m); } }
function near(a, b, e, m) { ok(Math.abs(a - b) <= e, m + " (got " + a + " want " + b + ")"); }

// ---------- 1. 基础常量 / 取景盒可达性 ----------
ok(Object.keys(VF.KINDS).length >= 10, "景物种类 >= 10");
Object.keys(VF.KINDS).forEach(k => {
  const K = VF.KINDS[k];
  const need = Math.max(K.sw, K.sh / VF.ASPECT) / VF.IDEAL_R;
  ok(need >= VF.FW_MIN - 0.5 && need <= VF.FW_MAX + 0.5, k + " 理想框宽 " + need.toFixed(1) + " 落在 [56,400]");
  // 理想框高要能装进画布
  const fh = need * VF.ASPECT;
  ok(K.ry - 14 > fh / 2 + 6 - 1 && K.ry + 14 < VF.H - fh / 2 - 6 + 1,
    k + " 理想框心 y=" + K.ry + " 可放入画布 (fh=" + fh.toFixed(0) + ")");
});

// ---------- 2. 世界生成确定性 ----------
for (let lv = 0; lv < VF.LEVELS.length; lv++) {
  const a = VF.buildWorld(lv), b = VF.buildWorld(lv);
  ok(a.objs.length === b.objs.length, "L" + lv + " 重生成景物数一致");
  let same = true;
  for (let i = 0; i < a.objs.length; i++) {
    if (Math.abs(a.objs[i].x - b.objs[i].x) > 1e-9 || Math.abs(a.objs[i].y - b.objs[i].y) > 1e-9) same = false;
  }
  ok(same, "L" + lv + " 世界坐标确定（可预演 / 可比分）");
  ok(a.bs.length > 4, "L" + lv + " 楼群数量 " + a.bs.length);
  ok(a.humps.length >= 2, "L" + lv + " 山脊峰数 " + a.humps.length + " >= 2");
  const peaks = a.objs.filter(o => o.kind === "peak").length;
  ok(peaks <= a.humps.length, "L" + lv + " 山尖数 " + peaks + " <= 峰数 " + a.humps.length);
}

// ---------- 3. 构图评分单调性 ----------
{
  const st = create(0);
  // 同一景物：占框比例从 0.2 → 0.68 → 1.0，fit 应先升后降，峰值在 0.68
  const o = st.world.objs[0];
  let best = -1, bestR = 0;
  for (let r = 0.15; r <= 1.0; r += 0.01) {
    const need = Math.max(o.K.sw, o.K.sh / VF.ASPECT) / r;
    st.z = clamp01(Math.log(need / VF.FW_MIN) / Math.log(VF.FW_MAX / VF.FW_MIN));
    st.fcy = o.y; VF.clampFrame(st);
    const p = objPos(o, 0);
    // 强制把景物挪到正中（只验 fit 分量）
    o.x = VF.W / 2; o.y = st.fcy;
    const c = compose(st, o, objPos(o, 0));
    if (c.contained && c.fit > best) { best = c.fit; bestR = r; }
  }
  ok(Math.abs(bestR - VF.IDEAL_R) < 0.02, "fit 峰值出现在 r≈0.68（实测 " + bestR.toFixed(3) + "）");
}
{
  // 居中度：偏离越远越低，正中为 1
  const st = create(0);
  const o = st.world.objs.find(x => x.kind === "bike") || st.world.objs[0];
  const id = idealFor(o); st.z = id.z; st.fcy = id.fcy; VF.clampFrame(st);
  o.x = VF.W / 2; o.y = st.fcy;
  const c0 = compose(st, o, objPos(o, 0));
  near(c0.s, 1, 0.02, "完美取景时构图分 ≈ 1");
  o.x = VF.W / 2 + 200;
  const c1 = compose(st, o, objPos(o, 0));
  ok(c1.s < c0.s, "偏离中心后构图分下降");
}

// ---------- 4. 遮挡：远山会被楼挡住，且存在露出的窗口 ----------
{
  const st = create(4);
  const peak = st.world.objs.find(o => o.kind === "peak");
  ok(!!peak, "L5 有山尖");
  let vis = 0, hid = 0;
  for (let i = 0; i < 600; i++) {
    st.camX = st.world.camMax * (i / 600);
    const p = objPos(peak, st.camX);
    if (p.x < 0 || p.x > VF.W) continue;
    if (occluded(st, peak, p)) hid++; else vis++;
  }
  ok(vis > 20, "山尖有可见窗口 (" + vis + " 帧)");
  ok(hid > 20, "山尖会被楼挡 (" + hid + " 帧) —— 城市找山成立");
}

// ---------- 5. dt 守卫 ----------
{
  const st = create(0);
  update(st, NaN, { dz: 1 });
  ok(!(st.z !== st.z), "dt=NaN 不污染 z");
  ok(!(st.fcy !== st.fcy), "dt=NaN 不污染 fcy");
  update(st, -1, {});
  ok(st.t >= 0, "dt<0 被守卫");
  update(st, 999, {});
  ok(st.t <= 0.0501, "dt 上限 0.05（实测 " + st.t + "）");
}

// ---------- 6. 快门：低分不消耗胶片 ----------
{
  const st = create(0);
  st.live = null;
  const f0 = st.film;
  shoot(st);
  ok(st.film === f0, "无景时按快门不消耗胶片");
  ok(st.events[st.events.length - 1].t === "empty", "产生 empty 事件");
}
{
  const st = create(0);
  // 造一个高分情境
  const o = st.world.objs[0];
  const id = idealFor(o); st.z = id.z; st.fcy = id.fcy; VF.clampFrame(st);
  o.x = VF.W / 2; o.y = st.fcy; st.camX = 0;
  st.live = { o, p: objPos(o, 0), s: 0.95, fit: 1, c: 1, contained: true };
  const f0 = st.film; shoot(st);
  ok(st.film === f0 - 1, "有效拍摄消耗 1 张胶片");
  ok(st.score > 0, "得分增加 " + st.score);
  ok(st.shots.length === 1, "相册 +1");
}

// ---------- 7. 连拍奖励 ----------
{
  const st = create(0, { film: 20 });
  for (let i = 0; i < 3; i++) {
    const o = st.world.objs[i];
    st.live = { o, p: objPos(o, 0), s: 0.95, fit: 1, c: 1, contained: true };
    shoot(st);
  }
  ok(st.events.some(e => e.t === "bonus"), "连拍 3 张完美 → 返还胶片");
  ok(st.film === 20 - 3 + 1, "胶片净变化 = -3 +1（实测 " + (st.film - 20) + "）");
}

// ---------- 8. AI 对照实验 ----------
function runAI(lv, mode, seedJit) {
  const st = create(lv);
  const dt = 1 / 60;
  let target = null;
  let jit = seedJit || 0;
  while (st.phase === "play") {
    let inp = { dz: 0, dy: 0 };
    if (mode === "noop") {
      // 什么都不做
    } else if (mode === "lazy") {
      st.z = 0.42; st.fcy = 380; VF.clampFrame(st);
      update(st, dt, inp);
      if (st.live && st.live.s > 0.5 && st.film > 0) shoot(st);
      continue;
    } else {
      // smart：锁定「即将到达画面中心且价值最高」的未拍景物，预调框，等峰值
      let best = null, bestPr = -1;
      for (const o of st.world.objs) {
        if (o.used || o.passed) continue;
        const p = objPos(o, st.camX);
        const ahead = p.x - VF.W / 2;          // >0 表示还没到中心
        if (ahead < -220 || ahead > 1100) continue;
        if (VF.occluded(st, o, p)) continue;
        const pr = o.K.v / (1 + Math.max(0, ahead) / 300);
        if (pr > bestPr) { bestPr = pr; best = o; }
      }
      target = best;
      if (target) {
        const id = idealFor(target);
        const dz = id.z - st.z, dy = id.fcy - st.fcy;
        inp.dz = Math.abs(dz) < 0.004 ? 0 : (dz > 0 ? 1 : -1);
        inp.dy = Math.abs(dy) < 3 ? 0 : (dy > 0 ? 1 : -1);
      }
      update(st, dt, inp);
      jit += 0.017;
      const jitter = mode === "smartJ" ? Math.sin(jit * 5.3) * 0.025 : 0;
      const thr = mode === "smartJ" ? 0.86 : 0.90;
      if (st.live && st.film > 0) {
        const isTarget = target && st.live.o === target;
        if ((isTarget && st.live.s + jitter > thr) || st.live.s + jitter > 0.96) shoot(st);
      }
      continue;
    }
    update(st, dt, inp);
  }
  return st;
}

console.log("\n=== AI 对照（每关）===");
const smartScores = [];
for (let lv = 0; lv < VF.LEVELS.length; lv++) {
  const noop = runAI(lv, "noop");
  const lazy = runAI(lv, "lazy");
  const smart = runAI(lv, "smart");
  const sj = runAI(lv, "smartJ");
  smartScores.push(smart.score);
  ok(smart.score > lazy.score, "L" + lv + " smart(" + smart.score + ") > lazy(" + lazy.score + ")");
  ok(smart.score > noop.score, "L" + lv + " smart > noop");
  ok(smart.themeDone, "L" + lv + " smart 拍到主题景");
  ok(smart.shots.length <= smart.filmMax + 4, "L" + lv + " 出片数受胶片约束 (" + smart.shots.length + ")");
  console.log("  L" + lv + " " + VF.LEVELS[lv].name +
    "  noop=" + noop.score + "  lazy=" + lazy.score +
    "  smart=" + smart.score + " (张数" + smart.shots.length + "/" + smart.filmMax +
    " 完美" + smart.shots.filter(s => s.grade === 3).length + ")" +
    "  smartJ=" + sj.score);
}

console.log("\n=== par 建议（smart ×0.80）===");
console.log(smartScores.map(s => Math.round(s * 0.80 / 10) * 10).join(", "));
console.log("=== 3星建议（smart ×1.15 / 2星 ×0.95）===");
console.log(smartScores.map(s => Math.round(s * 1.15 / 10) * 10).join(", "));

console.log("\n冒烟：" + pass + " 通过 / " + fail + " 失败");
process.exit(fail ? 1 : 0);
