/* =============================================================
 * 放鸢 · 把线放长一点 —— 逻辑层（零 DOM、零 Canvas，Node 可直接 require）
 * -------------------------------------------------------------
 * 核心动词：收线 / 放线（连续量 L）  —— 决定高度、张力、倍率
 * 辅助动词：侧牵引（bias）          —— 决定横向位置，代价是掉高度
 * 世界：竖版天空，锚点在水面 alt=0，纸鸢由一根线牵着
 * ============================================================= */
(function (g) {
  "use strict";

  /* ---------------- 常量 ---------------- */
  var W = 480, H = 800;

  var PX_PER_M = 1.15;   // 纵向：1 米 = 1.15 px
  var ANCHOR_SX = 240;   // 锚点屏幕 x（横向中心）
  var ANCHOR_SY = 670;   // camY = 0 时，alt = 0 的屏幕 y

  var L_MIN = 60, L_MAX = 1100;           // 线长（米）
  var REEL_OUT = 300, REEL_IN = 380;      // 放线 / 收线速度（米/秒）
  var THETA_MAX = 0.52;                   // 物理摆角上限（rad）
  var BIAS_MAX = 0.30;                    // 侧牵引上限（rad）
  var TENSION_MAX = 100;

  var WIND_K = 0.85, LIFT_K = 3.4, DAMP_K = 2.4;
  var SPREAD_MIN = 110, SPREAD_MAX = 300;  // 横向像素铺展（随线长）
  var BELL_X0 = 138, BELL_X1 = 342;        // 风铃横向可生成范围

    var RUN_TIME = 100;      // 一程时长（秒）
    var COMBO_WINDOW = 4.5;  // 连击窗口（秒）
    var RESPAWN_TIME = 2.6;  // 断线后换鸢的空档（秒）
    var TENDER_TIME = 2.5;   // 换鸢后「新鸢慢放」期（秒），放线速度打折

  var NOTES = ["宫", "商", "角", "徵", "羽"];
  var NOTE_COLORS = ["#E8C27E", "#EDE7DC", "#7FA88C", "#D9603B", "#6E7CA8"];
  var PENTA = [261.63, 293.66, 329.63, 392.00, 440.00];

  var KITES = [
    { id: "zhu", name: "朱鸢", desc: "最初的一只，什么都不偏", shape: "diamond", color: "#D9603B",
      lift: 1.00, windMul: 1.00, tensionMul: 1.00, reelMul: 1.00, biasMul: 1.00, scoreMul: 1.00,
      unlock: null },
    { id: "yan", name: "燕", desc: "好控，就是拉不太紧", shape: "swallow", color: "#46536B",
      lift: 1.18, windMul: 0.90, tensionMul: 0.90, reelMul: 1.12, biasMul: 1.10, scoreMul: 1.00,
      unlock: { type: "alt", v: 240, label: "飞到 240 米" } },
    { id: "die", name: "蝶", desc: "飞得高，怕阵风", shape: "wing", color: "#C77BA8",
      lift: 1.30, windMul: 1.20, tensionMul: 1.00, reelMul: 1.00, biasMul: 1.00, scoreMul: 1.06,
      unlock: { type: "notes", v: 60, label: "奏满 60 个音" } },
    { id: "kun", name: "鲲", desc: "线很结实，收得慢", shape: "fish", color: "#3E7CA1",
      lift: 0.96, windMul: 1.00, tensionMul: 0.80, reelMul: 0.78, biasMul: 0.92, scoreMul: 1.00,
      unlock: { type: "alt", v: 520, label: "飞到 520 米" } },
    { id: "he", name: "鹤", desc: "一牵就荡得远", shape: "crane", color: "#EFE7D6",
      lift: 1.06, windMul: 1.00, tensionMul: 1.00, reelMul: 1.00, biasMul: 1.45, scoreMul: 1.08,
      unlock: { type: "notes", v: 160, label: "奏满 160 个音" } },
    { id: "long", name: "龙", desc: "分数翻倍，也断得更快", shape: "dragon", color: "#C9A227",
      lift: 1.10, windMul: 1.08, tensionMul: 1.24, reelMul: 1.00, biasMul: 1.00, scoreMul: 1.38,
      unlock: { type: "alt", v: 850, label: "飞到 850 米" } }
  ];

  var STORE_KEY = "windline.save.v1";

  /* ---------------- 小工具 ---------------- */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function approach(cur, tgt, rate, dt) { return cur + (tgt - cur) * Math.min(1, rate * dt); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function rndi(a, b) { return Math.floor(rnd(a, b + 1)); }

  /* ---------------- 存档 ---------------- */
  function defaultSave() {
    return {
      bestAlt: 0, bestScore: 0, totalNotes: 0, runs: 0,
      unlocked: ["zhu"], kite: "zhu", lanterns: 0, muted: false
    };
  }
  function loadSave() {
    try {
      if (typeof g.localStorage === "undefined" || !g.localStorage) return defaultSave();
      var raw = g.localStorage.getItem(STORE_KEY);
      if (!raw) return defaultSave();
      var d = JSON.parse(raw);
      var s = defaultSave();
      for (var k in s) if (Object.prototype.hasOwnProperty.call(d, k)) s[k] = d[k];
      if (!s.unlocked || !s.unlocked.length) s.unlocked = ["zhu"];
      if (s.unlocked.indexOf("zhu") < 0) s.unlocked.unshift("zhu");
      return s;
    } catch (e) { return defaultSave(); }
  }
  function writeSave(s) {
    try {
      if (typeof g.localStorage === "undefined" || !g.localStorage) return false;
      g.localStorage.setItem(STORE_KEY, JSON.stringify(s));
      return true;
    } catch (e) { return false; }
  }

  /* ---------------- 建局 ---------------- */
  function createGame(opts) {
    opts = opts || {};
    var save = opts.save || loadSave();

    var S = {
      phase: "menu",          // menu | fly | landing | over
      t: 0,                   // 局内时间
      timeLeft: RUN_TIME,
      kiteId: save.kite || "zhu",
      L: L_MIN,
      theta: 0,
      omega: 0,
      bias: 0,
      biasInput: 0,           // -1 | 0 | 1
      tension: 0,
      score: 0,
      combo: 0,
      comboT: 0,
      bestCombo: 0,
      notes: 0,
      notesSeq: [],
      snaps: 0,               // 本局断线数
      respawnT: 0,            // 换鸢动画计时（仅 respawn 期间）
      tenderT: 99,            // 换鸢后「慢放」计时（仅 fly 期间）
      fray: 0,                // 线的毛糙度：断一次涨起来，十秒内慢慢褪掉
      maxAlt: 0,
      camY: 0,
      windX: 0.75,
      gust: { st: "idle", t: 0, dur: 3.5, dir: 1, power: 0 },
      bells: [],
      clouds: [],
      events: [],
      perf: 0,                // 陪练：最近表现（0..1）
      scoreRate: 0,
      lastScore: 0,
      unlockedThisRun: [],
      // 派生（供渲染直接读）
      kx: L_MIN, ky: L_MIN, sx: ANCHOR_SX, sy: ANCHOR_SY - L_MIN * PX_PER_M,
      spread: SPREAD_MIN,
      thetaV: 0,
      inCloud: false,
      save: save
    };

    function kiteDef() {
      for (var i = 0; i < KITES.length; i++) if (KITES[i].id === S.kiteId) return KITES[i];
      return KITES[0];
    }

    /* ---------- 风 ---------- */
    function windAt(alt) { return 0.75 + Math.max(0, alt) / 700; }

    function stepGust(dt) {
      var gu = S.gust;
      gu.t += dt;
      if (gu.st === "idle") {
        if (gu.t >= gu.dur) {
          gu.st = "warn"; gu.t = 0; gu.dur = 1.0;
          gu.dir = Math.random() < 0.32 ? -1 : 1;
          // 陪练：表现越好，阵风越强、越密
          gu.power = rnd(0.75, 1.25) + S.perf * rnd(0.35, 0.85);
          S.events.push({ type: "gustWarn", dir: gu.dir });
        }
      } else if (gu.st === "warn") {
        if (gu.t >= gu.dur) { gu.st = "blow"; gu.t = 0; gu.dur = rnd(1.2, 2.6); }
      } else {
        if (gu.t >= gu.dur) {
          gu.st = "idle"; gu.t = 0;
          gu.dur = rnd(3.6, 6.6) - S.perf * 1.3;
          if (gu.dur < 2.2) gu.dur = 2.2;
        }
      }
    }

    function gustValue() {
      var gu = S.gust;
      if (gu.st !== "blow") return 0;
      // 起落包络，避免生硬开关
      var p = gu.t / gu.dur;
      var env = Math.sin(Math.PI * clamp(p, 0, 1));
      return gu.dir * gu.power * (0.35 + 0.65 * env);
    }

    /* ---------- 生成物 ---------- */
    function spawnAhead() {
      // 风铃生成在「玩家高度周围的一条带」里（下方 -140 ～ 上方 +400）。
      // 关键：必须围在玩家身边生成，而不是一味往绝对高空铺——
      //   · 若按绝对高度向上铺 → 断线掉回低空再爬升时会横穿一整片旧铃，形成刷分漏洞；
      //   · 若只铺在头顶 → 顶着 L_MAX 不动的玩家会被活活饿死（这是有意的）：
      //     想收割就必须上下往复，而这恰好就是「收放线」这个核心动词该有的节奏。
      // 带子偏窄（+240 而非 +400）：爬升时前方可供扫过的铃更有限，
      // 否则「一路放线猛冲」会靠横穿整片新铃刷出远高于稳健打法的分。
      var lo = S.ky - 150, hi = S.ky + 240;
      var live = 0, i;
      for (i = 0; i < S.bells.length; i++) if (!S.bells[i].taken) live++;
      var guard = 0;
      while (live < 14 && guard++ < 2) {
        S.bells.push({
          alt: rnd(lo, hi),
          x: rnd(BELL_X0, BELL_X1),
          note: rndi(0, 4),
          taken: false,
          ph: rnd(0, 6.28),
          pop: 0
        });
        live++;
      }
      // 云：维持前方 ~5 朵
      var cl = 0;
      for (i = 0; i < S.clouds.length; i++) if (S.clouds[i].alt > S.ky - 300) cl++;
      guard = 0;
      while (cl < 5 && guard++ < 12) {
        S.clouds.push({
          alt: rnd(S.ky + 200, S.ky + 760),
          x: rnd(-40, W + 40),
          w: rnd(150, 280),
          h: rnd(46, 82),
          tint: rndi(0, 3),
          ph: rnd(0, 6.28)
        });
        cl++;
      }
    }

    function cullBehind() {
      var cut = S.ky - 430, i, n = [], c = [];
      for (i = 0; i < S.bells.length; i++) {
        var b = S.bells[i];
        if (b.alt > cut && !(b.taken && b.pop > 1.2)) n.push(b);
      }
      S.bells = n;
      for (i = 0; i < S.clouds.length; i++) if (S.clouds[i].alt > S.ky - 900) c.push(S.clouds[i]);
      S.clouds = c;
    }

    /* ---------- 断线 ---------- */
    function snap() {
      S.snaps++;
      S.combo = 0; S.comboT = 0;
      S.L = L_MIN; S.theta = 0; S.omega = 0; S.bias = 0; S.biasInput = 0;
      S.tension = 0; S.ky = L_MIN; S.kx = 0;
      S.bells.length = 0;
      S.gust.st = "idle"; S.gust.t = 0; S.gust.dur = rnd(3.4, 5.2);
      S.events.push({ type: "snap", x: S.sx, y: S.sy, alt: S.maxAlt });
      // 换鸢空档：这段时间飘走、不能操作、不得分
      S.phase = "respawn";
      S.respawnT = 0;
      S.tenderT = 0;
      S.fray = 1;               // 接过的线是毛的，张力涨得更快，逼你慢下来
      spawnAhead();
    }

    /* ---------- 主步进 ---------- */
    function step(dt, input) {
      if (dt > 0.05) dt = 0.05;   // dt 防御
      if (dt <= 0) return S;
      input = input || {};

      if (S.phase === "menu" || S.phase === "over") return S;

      var K = kiteDef();
      S.t += dt;
      S.timeLeft = Math.max(0, RUN_TIME - S.t);
      // 「新鸢慢放」必须用独立的计时器：respawnT 在空档里就已经走满 2.6s，
      // 若复用它，慢放窗口会在起飞前就被耗光，等于没有。
      if (S.phase === "fly" && S.tenderT < TENDER_TIME + 1) S.tenderT += dt;

      /* --- 0. 强制断线（测试钩子）---
             必须放在张力重算之前：否则 tension 会先被 approach 拉回目标值以下，
             「>= TENSION_MAX」永远触发不到。 */
      if (S.forceSnap) { S.forceSnap = false; snap(); return S; }

      /* --- 0b. 换鸢空档：飘走、不能操作、不得分 --- */
      if (S.phase === "respawn") {
        S.respawnT += dt;
        S.L = L_MIN; S.ky = L_MIN; S.kx = 0; S.theta = 0; S.omega = 0; S.bias = 0;
        S.tension = 0;
        S.camY = approach(S.camY, 0, 2.4, dt);
        S.sx = ANCHOR_SX;
        S.sy = ANCHOR_SY - (S.ky - S.camY) * PX_PER_M;
        S.spread = SPREAD_MIN; S.thetaV = 0; S.inCloud = false;
        if (S.respawnT >= RESPAWN_TIME) {
          S.phase = "fly";
          S.events.push({ type: "rekit" });
        }
        if (S.t >= RUN_TIME + RESPAWN_TIME) finish();
        return S;
      }

      /* --- 1. 收放线（核心动词） --- */
      var reel = clamp(input.reel || 0, -1, 1);   // -1 放线 / +1 收线
      if (S.phase === "landing") {
        S.L = Math.max(L_MIN, S.L - 260 * dt);
      } else {
        if (reel < 0) {
          // 刚换的新鸢要慢慢放，急不得（也让断线的恢复期更实感）
          var tender = S.tenderT < TENDER_TIME ? 0.55 : 1;
          S.L += (-reel) * REEL_OUT * K.reelMul * tender * dt;
        }
        else if (reel > 0) S.L -= reel * REEL_IN * K.reelMul * dt;
        S.L = clamp(S.L, L_MIN, L_MAX);
      }

      /* --- 2. 侧牵引 --- */
      S.biasInput = clamp(input.bias || 0, -1, 1);
      var biasTgt = S.biasInput * BIAS_MAX * K.biasMul;
      S.bias = approach(S.bias, biasTgt, 7.5, dt);

      /* --- 3. 风与摆动 --- */
      stepGust(dt);
      var landFade = S.phase === "landing" ? 0.35 : 1;
      var base = windAt(S.ky) * K.windMul * landFade;
      S.windX = base + gustValue();

      var Tn = (S.L - L_MIN) / (L_MAX - L_MIN);
      var inertia = 0.75 + 0.90 * Tn;                 // 线越长越笨重
      var windAcc = WIND_K * S.windX * Math.cos(S.theta) / inertia;
      var liftAcc = -LIFT_K * K.lift * Math.sin(S.theta) * (1 + 0.5 * Tn);
      var dampAcc = -DAMP_K * S.omega * (0.6 + 0.6 * Tn);
      S.omega += (windAcc + liftAcc + dampAcc) * dt;
      S.theta += S.omega * dt;
      if (S.theta > THETA_MAX) { S.theta = THETA_MAX; if (S.omega > 0) S.omega *= -0.28; }
      if (S.theta < -THETA_MAX) { S.theta = -THETA_MAX; if (S.omega < 0) S.omega *= -0.28; }

      S.thetaV = clamp(S.theta + S.bias, -0.60, 0.60);

      /* --- 4. 位置 --- */
      S.spread = lerp(SPREAD_MIN, SPREAD_MAX, Tn);
      S.ky = S.L * Math.cos(S.thetaV);
      S.kx = Math.sin(S.thetaV) * S.spread;
      S.sx = ANCHOR_SX + S.kx;
      S.sy = ANCHOR_SY - (S.ky - S.camY) * PX_PER_M;
      if (S.ky > S.maxAlt) S.maxAlt = S.ky;

      /* --- 5. 相机 --- */
      var camTgt = Math.max(0, S.ky * 0.72 - 40);
      S.camY = approach(S.camY, camTgt, 3.0, dt);

      /* --- 6. 碰撞：云（要先于张力结算，穿云的泄力才能当帧生效） --- */
      S.inCloud = false;
      var i, c;
      for (i = 0; i < S.clouds.length; i++) {
        c = S.clouds[i];
        var cy = ANCHOR_SY - (c.alt - S.camY) * PX_PER_M;
        if (Math.abs(S.sx - c.x) < c.w * 0.5 && Math.abs(S.sy - cy) < c.h * 0.5) {
          S.inCloud = true;
          if (!c.touched) { c.touched = true; S.events.push({ type: "cloud", x: S.sx, y: S.sy }); }
        }
      }

      /* --- 7. 张力 --- */
      var windAbs = Math.abs(S.windX);
      var tTarget = 24 * windAbs * (0.34 + 0.95 * Tn) *
        (1 + 0.45 * Math.abs(S.thetaV) / THETA_MAX + 0.35 * Math.min(1, Math.abs(S.omega) / 2.2));
      tTarget += 16 * Math.max(0, (S.ky - 380) / 720);
      tTarget *= K.tensionMul;
      tTarget *= 1 + 0.55 * S.fray;   // 毛线吃不住力
      if (S.phase === "landing") tTarget *= 0.25;

      S.tension = approach(S.tension, tTarget, 1.6, dt);
      var relief = 0;
      if (reel > 0.25) relief += 34 * dt;                       // 收线泄力
      if (S.ky < 130) relief += 16 * dt;                        // 水面上升气流
      if (S.inCloud) relief += 40 * dt;                         // 穿云
      S.tension = clamp(S.tension - relief, 0, TENSION_MAX);

      /* --- 8. 碰撞：风铃 --- */
      for (i = 0; i < S.bells.length; i++) {
        var b = S.bells[i];
        b.ph += dt;
        if (b.taken) { b.pop += dt; continue; }
        var by = ANCHOR_SY - (b.alt - S.camY) * PX_PER_M + Math.sin(b.ph * 1.7) * 3;
        if (Math.abs(S.sx - b.x) < 30 && Math.abs(S.sy - by) < 30) {
          b.taken = true; b.pop = 0;
          S.combo++; S.comboT = 0;
          if (S.combo > S.bestCombo) S.bestCombo = S.combo;
          S.notes++;
          S.notesSeq.push(b.note);
          if (S.notesSeq.length > 8) S.notesSeq.shift();
          var mul = 1 + Math.min(S.combo, 20) * 0.08;
          var gain = (8 + S.ky / 100) * mul * K.scoreMul;
          S.score += gain;
          S.tension = clamp(S.tension - 5, 0, TENSION_MAX);
          S.events.push({
            type: "note", note: b.note, x: b.x, y: by,
            combo: S.combo, gain: Math.round(gain)
          });
        }
      }

      /* --- 9b. 线的毛糙度自然褪去 --- */
      if (S.fray > 0) S.fray = Math.max(0, S.fray - dt / 10);

      /* --- 9. 生成与回收（放在碰撞之后） --- */
      spawnAhead();
      cullBehind();

      /* --- 10. 连击窗口 --- */
      if (S.combo > 0) {
        S.comboT += dt;
        if (S.comboT > COMBO_WINDOW) { S.combo = 0; S.comboT = 0; }
      }

      /* --- 11. 高度持续得分 + 走钢丝奖励 --- */
      // 高度分：稳在高空本身就是收益，断线掉回低空会实打实地亏。
      S.score += (S.ky / 60) * 2.2 * dt;
      // 走钢丝奖励：贴着断线边缘飞才拿得到，二次曲线让「压线」明显优于「苟着」。
      if (S.phase === "fly") {
        var risk = S.tension / TENSION_MAX;
        S.score += risk * risk * 15 * dt;
      }

      /* --- 12. 陪练自适应 --- */
      var rate = (S.score - S.lastScore) / dt;
      S.lastScore = S.score;
      S.scoreRate = lerp(S.scoreRate, rate, 0.05);
      S.perf = clamp(S.scoreRate / 42, 0, 1);

      /* --- 13. 断线 --- */
      if (S.tension >= TENSION_MAX) snap();

      /* --- 14. 收尾 --- */
      if (S.phase === "fly" && S.t >= RUN_TIME) {
        S.phase = "landing";
        S.events.push({ type: "landing" });
      }
      if (S.phase === "landing" && S.L <= L_MIN + 1) finish();

      return S;
    }

    function finish() {
      S.phase = "over";
      S.score = Math.round(S.score);
      S.maxAlt = Math.round(S.maxAlt);
      var sv = S.save;
      sv.runs++;
      sv.totalNotes += S.notes;
      sv.lanterns += S.snaps;
      if (S.maxAlt > sv.bestAlt) sv.bestAlt = S.maxAlt;
      if (S.score > sv.bestScore) sv.bestScore = S.score;

      // 解锁检查
      S.unlockedThisRun = [];
      for (var i = 0; i < KITES.length; i++) {
        var k = KITES[i];
        if (!k.unlock) continue;
        if (sv.unlocked.indexOf(k.id) >= 0) continue;
        var v = k.unlock.type === "alt" ? sv.bestAlt : sv.totalNotes;
        if (v >= k.unlock.v) {
          sv.unlocked.push(k.id);
          S.unlockedThisRun.push(k.id);
        }
      }
      writeSave(sv);
      S.events.push({ type: "over", score: S.score, alt: S.maxAlt, notes: S.notes, snaps: S.snaps });
    }

    function start(kiteId) {
      if (kiteId) S.kiteId = kiteId;
      S.save.kite = S.kiteId;
      writeSave(S.save);

      S.phase = "fly";
      S.t = 0; S.timeLeft = RUN_TIME;
      S.L = L_MIN; S.theta = 0; S.omega = 0; S.bias = 0; S.biasInput = 0;
      S.tension = 0; S.score = 0; S.combo = 0; S.comboT = 0; S.bestCombo = 0;
      S.notes = 0; S.notesSeq = [];
      S.snaps = 0; S.maxAlt = 0; S.camY = 0; S.kx = 0; S.ky = L_MIN;
      S.respawnT = 0; S.tenderT = 99; S.fray = 0;
      S.sx = ANCHOR_SX; S.sy = ANCHOR_SY - L_MIN * PX_PER_M;
      S.spread = SPREAD_MIN; S.thetaV = 0; S.inCloud = false;
      S.bells.length = 0; S.clouds.length = 0;
      S.lastScore = 0; S.scoreRate = 0; S.perf = 0;
      S.unlockedThisRun = [];
      S.gust = { st: "idle", t: 0, dur: rnd(4, 6), dir: 1, power: 0 };
      spawnAhead();
      S.events.push({ type: "start", kite: S.kiteId });
      return S;
    }

    function selectKite(id) {
      if (S.save.unlocked.indexOf(id) < 0) return false;
      S.kiteId = id; S.save.kite = id; writeSave(S.save);
      return true;
    }

    function drain() {
      var e = S.events;
      S.events = [];
      return e;
    }

    /* ---------------- 对外 API ---------------- */
    return {
      state: S,
      start: start,
      step: step,
      drain: drain,
      selectKite: selectKite,
      kiteDef: kiteDef,
      windAt: windAt,
      finish: finish,
      snapForce: function () { S.forceSnap = true; },
      // 常量外泄给渲染层
      C: {
        W: W, H: H, PX_PER_M: PX_PER_M, ANCHOR_SX: ANCHOR_SX, ANCHOR_SY: ANCHOR_SY,
        L_MIN: L_MIN, L_MAX: L_MAX, TENSION_MAX: TENSION_MAX, RUN_TIME: RUN_TIME,
        THETA_MAX: THETA_MAX, BIAS_MAX: BIAS_MAX,
        NOTES: NOTES, NOTE_COLORS: NOTE_COLORS, PENTA: PENTA, KITES: KITES
      }
    };
  }

  var API = {
    createGame: createGame,
    KITES: KITES, NOTES: NOTES, NOTE_COLORS: NOTE_COLORS, PENTA: PENTA,
    STORE_KEY: STORE_KEY, defaultSave: defaultSave, loadSave: loadSave, writeSave: writeSave,
    W: W, H: H
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  g.Windline = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
