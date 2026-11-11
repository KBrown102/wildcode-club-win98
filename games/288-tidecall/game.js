/* 288-tidecall《潮信 · 招潮》 — 纯逻辑层（零 DOM / 零 Canvas，Node 可直接 require 冒烟）
 *
 * 玩家不是赶海的人，玩家就是「潮」本身。
 * 唯一控制量：潮位（一个标量）。滩涂上的招潮蟹自主生活，你只能改水位去影响它们。
 *
 * 核心张力：潮位这根轴同时是【觅食场】与【威胁源】
 *   退潮 → 露出肥泥（蟹想去吃、贝类冒头）… 但鸟专抓「贴着水线、已露出」的蟹
 *   涨潮 → 鸟全部失效（水下的抓不到）… 但蟹会被淹，憋气条归零就被冲走
 */
(function (g) {
  'use strict';

  var W = 480, H = 800, CS = 16, COLS = 30, ROWS = 50;

  // ---- 常数 ----
  var TIDE_SPEED = 0.46;      // 潮位变化速率 /s（走完全程约 2.2s，不能瞬移）
  var WATER_LO = -0.04, WATER_SPAN = 1.08;
  var CRAB_SPEED = 36;        // 基础速度 px/s
  var CRAB_WET = 0.62;        // 水中减速系数
  var FLEE_BOOST = 1.25;      // 逃命加速
  var FEED_TIME = 1.7;        // 一次滤食耗时
  var SAT_BITE = 0.45;        // 一次滤食基础回饱
  var FOOD_MIN = 0.12;        // 低于此值的泥蟹不屑去
  var FOOD_REGEN = 0.38;      // 被水淹着的泥回肥速度 /s（涨潮 = 补给）
  var FOOD_DEEP = 0.05;       // 得真·淹住（水面高出 0.05）才淤得上泥 —— 「刚好盖过鸟」不算补给
  var FOOD_BITE = 0.85;       // 滤食一口啃掉多少肥力（中心）
  var FOOD_RING1 = 0.55, FOOD_RING2 = 0.30;
  var FOOD_SEA = 0.78;        // 开局还泡在水里的泥 = 肥
  var FOOD_DRY = 0.20;        // 开局已露出的泥 = 早被啃过
  var TIDE_INIT = 0.34;
  var SAT_FROM_FOOD = 0.40, SAT_FOOD_GAIN = 1.30; // gain = SAT_BITE*(SAT_FROM_FOOD + SAT_FOOD_GAIN*food)
  var SAT_DECAY = 0.055;      // 洞里饱食衰减 /s
  var HUNGRY = 0.45;          // 低于此值出洞觅食
  var FEED_LO = 0.02, FEED_HI = 0.22; // 蟹想去的「肥泥带」= 水线露出侧这一段高程
  var AIR_BASE = 3.2, AIR_PER_SIZE = 0.9; // 憋气时长
  var AIR_RECOVER = 1.8;      // 露出后憋气恢复倍率
  var MAX_SIZE = 3;
  var BIRD_FLY = 1.35;        // 鸟俯冲耗时（留出反应窗口）
  var BIRD_MAX = 3;
  var CLAM_GAP = 0.55, CLAM_P = 0.34, CLAM_LIFE = 10, CLAM_MAX = 6;
  var CLAM_RIPE = 1.2;        // 冒头后要晾够时间才冲得走（逼「退—涨」吞吐）
  var GONG_COST = 5, GONG_TIME = 6;
  var REVIVE = 14;            // 被移除的蟹多少秒后回来
  var SIZE_PTS = 4;           // 生机只算蟹群：贝类是「手段」，蟹才是「目的」

  // goal 由「会调度的 AI 实测均值 × 0.62」标定（见 _smoke.cjs 第 14 节）
  var LEVELS = [
    { burrows: 4, birdGap: 9.0, time: 60, goal: 24 },
    { burrows: 5, birdGap: 7.6, time: 64, goal: 30 },
    { burrows: 6, birdGap: 6.4, time: 68, goal: 36 },
    { burrows: 7, birdGap: 5.5, time: 72, goal: 45 },
    { burrows: 8, birdGap: 4.7, time: 75, goal: 52 }
  ];
  var STAR2 = 1.22, STAR3 = 1.45;

  // ---- 工具 ----
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function h2(ix, iy, s) {
    var n = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(s, 982451653);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function vnoise(x, y, s) {
    var ix = Math.floor(x), iy = Math.floor(y);
    var fx = smooth(x - ix), fy = smooth(y - iy);
    var a = h2(ix, iy, s), b = h2(ix + 1, iy, s), c = h2(ix, iy + 1, s), d = h2(ix + 1, iy + 1, s);
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  }
  function fbm(x, y, s) { return vnoise(x, y, s) * 0.65 + vnoise(x * 2.3 + 5.1, y * 2.3 + 9.7, s + 3) * 0.35; }

  // ---- 高程场 ----
  function buildField(seed) {
    var f = new Float32Array(COLS * ROWS);
    var rnd = mulberry32(seed ^ 0x5f3a);
    var chs = [], nc = 3 + (rnd() * 2 | 0), i;
    for (i = 0; i < nc; i++) chs.push({ c: rnd() * COLS, w: 1.7 + rnd() * 1.5, d: 0.12 + rnd() * 0.09 });
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var e = 1 - r / (ROWS - 1);
        e += (fbm(c * 0.085, r * 0.085, seed) - 0.5) * 0.34;
        var ch = 0;
        for (i = 0; i < chs.length; i++) {
          var d = c - chs[i].c;
          var fade = clamp((r - 8) / 14, 0, 1);
          ch += chs[i].d * Math.exp(-(d * d) / (2 * chs[i].w * chs[i].w)) * fade;
        }
        e -= ch;
        e += (fbm(c * 0.25 + 31, r * 0.25 + 17, seed + 7) - 0.5) * 0.08;
        f[r * COLS + c] = clamp(e, 0, 1);
      }
    }
    return f;
  }

  function elevAt(st, x, y) {
    var gx = clamp(x / CS - 0.5, 0, COLS - 1.001);
    var gy = clamp(y / CS - 0.5, 0, ROWS - 1.001);
    var ix = Math.floor(gx), iy = Math.floor(gy);
    var fx = gx - ix, fy = gy - iy, F = st.field, C = COLS;
    var a = F[iy * C + ix], b = F[iy * C + ix + 1], c = F[(iy + 1) * C + ix], d = F[(iy + 1) * C + ix + 1];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  }

  // ---- 肥力场：泥会被吃薄，只有被水淹过才回肥（这是「潮汐吞吐」的根据） ----
  function foodAt(st, x, y) {
    var gx = clamp(x / CS - 0.5, 0, COLS - 1.001);
    var gy = clamp(y / CS - 0.5, 0, ROWS - 1.001);
    var ix = Math.floor(gx), iy = Math.floor(gy);
    var fx = gx - ix, fy = gy - iy, F = st.food, C = COLS;
    var a = F[iy * C + ix], b = F[iy * C + ix + 1], c = F[(iy + 1) * C + ix], d = F[(iy + 1) * C + ix + 1];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  }

  function regenFood(st, dt) {
    var F = st.food, E = st.field, n = COLS * ROWS, w = st.waterE - FOOD_DEEP, add = FOOD_REGEN * dt;
    for (var i = 0; i < n; i++) {
      if (E[i] < w && F[i] < 1) { F[i] += add; if (F[i] > 1) F[i] = 1; }
    }
  }

  // 一只蟹在一处滤食 = 啃掉半径 2 格（5×5）的一整片，画面上看得见那块泥变白
  function graze(st, x, y) {
    var c = clamp(Math.floor(x / CS), 0, COLS - 1);
    var r = clamp(Math.floor(y / CS), 0, ROWS - 1);
    var F = st.food, C = COLS;
    for (var dr = -2; dr <= 2; dr++) {
      for (var dc = -2; dc <= 2; dc++) {
        var d = Math.abs(dr) + Math.abs(dc);
        var w = d === 0 ? FOOD_BITE : (d === 1 ? FOOD_RING1 : (d === 2 ? FOOD_RING2 : 0));
        if (!w) continue;
        var cc = clamp(c + dc, 0, COLS - 1), rr = clamp(r + dr, 0, ROWS - 1);
        var v = F[rr * C + cc] - w;
        F[rr * C + cc] = v < 0 ? 0 : v;
      }
    }
  }

  // 沿列自下而上找高程首次超过 e 的 y（elev 大致随 y 递增）
  function solveYForElev(st, x, e) {
    for (var r = ROWS - 1; r >= 1; r--) {
      var y = (r + 0.5) * CS;
      if (elevAt(st, x, y) >= e) return clamp(y, 0, H);
    }
    return null;
  }

  // 梯度上升方向（被淹的蟹往高处逃）
  function ascendDir(st, x, y) {
    var d = 6;
    var ex = elevAt(st, x + d, y) - elevAt(st, x - d, y);
    var ey = elevAt(st, x, y + d) - elevAt(st, x, y - d);
    // y 越大高程越低 → 上升方向是 -y
    var vx = ex, vy = -ey;
    var m = Math.hypot(vx, vy);
    if (m < 1e-6) return { x: 0, y: -1 };
    return { x: vx / m, y: vy / m };
  }

  function pickBurrows(f, n, rnd) {
    var cand = [], r, c;
    for (r = 6; r < 18; r++) for (c = 1; c < COLS - 1; c++) {
      var e = f[r * COLS + c];
      if (e > 0.66) cand.push({ x: (c + 0.5) * CS, y: (r + 0.5) * CS, e: e });
    }
    for (var i = cand.length - 1; i > 0; i--) {
      var j = (rnd() * (i + 1)) | 0, t = cand[i]; cand[i] = cand[j]; cand[j] = t;
    }
    var out = [], MIND = 46;
    for (i = 0; i < cand.length && out.length < n; i++) {
      var ok = true;
      for (var k = 0; k < out.length; k++) {
        if (Math.hypot(cand[i].x - out[k].x, cand[i].y - out[k].y) < MIND) { ok = false; break; }
      }
      if (ok) out.push(cand[i]);
    }
    while (out.length < n) out.push({ x: 40 + rnd() * (W - 80), y: 110 + rnd() * 120, e: 0.7 });
    return out;
  }

  // ---- 建局 ----
  function create(level, seed) {
    level = clamp(level | 0, 0, LEVELS.length - 1);
    var L = LEVELS[level];
    var sd = (seed == null) ? (level * 9176 + 1234) : seed;
    var rnd = mulberry32(sd);
    var st = {
      level: level, seed: sd, rnd: rnd,
      field: buildField(sd),
      food: null,
      W: W, H: H, CS: CS, COLS: COLS, ROWS: ROWS,
      t: 0, timeLeft: L.time, duration: L.time,
      over: false, result: null,
      tide: TIDE_INIT, waterE: 0, prevWaterE: 0,
      inUp: false, inDown: false,
      burrows: [], crabs: [], birds: [], clams: [],
      nextId: 1,
      birdTimer: L.birdGap * 0.7, birdGap: L.birdGap, noBirdT: 0,
      clamT: 0,
      oyster: 0, clamCount: 0, moltCount: 0, washed: 0, eaten: 0, scared: 0,
      goal: L.goal, sandbox: false,
      events: [],
      __airMax: airMax, __feedTime: FEED_TIME, __maxSize: MAX_SIZE
    };
    st.waterE = WATER_LO + st.tide * WATER_SPAN;
    st.prevWaterE = st.waterE;
    // 开局：水线以下还是肥泥，以上早被啃薄了 —— 第一件事是退潮开饭
    var F = new Float32Array(COLS * ROWS);
    for (var i = 0; i < F.length; i++) F[i] = st.field[i] < st.waterE ? FOOD_SEA : FOOD_DRY;
    st.food = F;
    st.burrows = pickBurrows(st.field, L.burrows, rnd);
    for (var i = 0; i < st.burrows.length; i++) st.crabs.push(newCrab(st, i));
    return st;
  }

  function newCrab(st, bi) {
    var b = st.burrows[bi % st.burrows.length];
    return {
      id: st.nextId++, burrow: bi % st.burrows.length,
      x: b.x, y: b.y, hx: b.x, hy: b.y,
      state: 'burrow', sat: 0.62 + st.rnd() * 0.2,
      air: airMax(1), size: 1, meals: 0,
      tx: b.x, ty: b.y, feedT: 0,
      waveT: st.rnd() * 6.28, alive: true, respawn: 0, wet: false
    };
  }
  function airMax(size) { return AIR_BASE + (size - 1) * AIR_PER_SIZE; }

  function ev(st, t, x, y, extra) {
    var e = { t: t, x: x, y: y };
    if (extra) for (var k in extra) e[k] = extra[k];
    st.events.push(e);
  }

  // 蟹想去「水线露出侧那条泥带」里的【肥地】—— 潮位牵着蟹走，肥力牵着产量
  function pickFeedTarget(st, cr) {
    var lo = st.waterE + FEED_LO, hi = st.waterE + FEED_HI;
    var best = null, bestScore = -1e9;
    for (var i = 0; i < 30; i++) {
      var x = 22 + st.rnd() * (W - 44);
      var y = cr.hy + 44 + st.rnd() * (H - cr.hy - 100);
      var e = elevAt(st, x, y);
      if (e < lo || e > hi) continue;
      var fd = foodAt(st, x, y);
      if (fd < FOOD_MIN) continue;
      var d = Math.hypot(x - cr.x, y - cr.y);
      var score = fd - d * 0.0007;   // 要肥，但也别舍近求远
      if (score > bestScore) { bestScore = score; best = { x: x, y: y, e: e, f: fd }; }
    }
    return best;
  }

  function moveToward(st, cr, tx, ty, dt, speed) {
    var dx = tx - cr.x, dy = ty - cr.y;
    var m = Math.hypot(dx, dy);
    if (m < 2.5) return true;
    var v = speed * (cr.wet ? CRAB_WET : 1);
    var step = Math.min(m, v * dt);
    cr.x += dx / m * step;
    cr.y += dy / m * step;
    return false;
  }

  // ---- 主更新 ----
  function update(st, dt) {
    if (!(dt > 0)) dt = 0;          // 防 NaN / 负数
    dt = dt > 0.05 ? 0.05 : dt;     // 防长帧穿透
    if (st.over) return st;
    st.t += dt;
    st.timeLeft -= dt;
    st.prevWaterE = st.waterE;

    // 潮位：玩家是唯一推手，速率有上限
    var dir = (st.inUp ? 1 : 0) - (st.inDown ? 1 : 0);
    var before = st.tide;
    st.tide = clamp(st.tide + dir * TIDE_SPEED * dt, 0, 1);
    st.waterE = WATER_LO + st.tide * WATER_SPAN;
    if (Math.abs(st.tide - before) > 1e-6 && Math.abs(st.tide - before) > 0.0008) {
      st.tideDir = dir;
    }

    if (st.noBirdT > 0) st.noBirdT -= dt;

    regenFood(st, dt);          // 水淹到哪里，哪里的泥就回肥 —— 涨潮即补给
    updateClams(st, dt);
    updateCrabs(st, dt);
    updateBirds(st, dt);

    if (st.timeLeft <= 0) finish(st);
    return st;
  }

  function updateClams(st, dt) {
    st.clamT += dt;
    // 只有【退潮】才会把新泥翻出来（涨潮冲的是上一轮退潮留下的）
    if (st.clamT >= CLAM_GAP && st.waterE < st.prevWaterE - 1e-7) {
      st.clamT = 0;
      if (st.clams.length < CLAM_MAX && st.rnd() < CLAM_P) {
        var x = 18 + st.rnd() * (W - 36);
        var y = solveYForElev(st, x, st.waterE + 0.014);
        if (y != null && y < H - 8) {
          st.clams.push({ x: x, y: y, e: elevAt(st, x, y), life: CLAM_LIFE, age: 0 });
          ev(st, 'bubble', x, y);
        }
      }
    }
    for (var i = st.clams.length - 1; i >= 0; i--) {
      var c = st.clams[i];
      c.age += dt;
      c.ripe = c.age >= CLAM_RIPE;
      // 涨潮扫过（且晾够了）→ 冲刷收集
      if (c.ripe && st.prevWaterE < c.e && st.waterE >= c.e) {
        st.oyster++; st.clamCount++;
        ev(st, 'clam', c.x, c.y, { n: st.oyster });
        st.clams.splice(i, 1);
        continue;
      }
      if (c.age > c.life) { ev(st, 'clamGone', c.x, c.y); st.clams.splice(i, 1); }
    }
  }

  function updateCrabs(st, dt) {
    var i, cr;
    for (i = 0; i < st.crabs.length; i++) {
      cr = st.crabs[i];
      if (!cr.alive) {
        cr.respawn -= dt;
        if (cr.respawn <= 0) {
          var nb = newCrab(st, cr.burrow);
          nb.id = st.nextId++;
          nb.sat = 0.72;
          st.crabs[i] = nb;
          ev(st, 'arrive', nb.x, nb.y);
        }
        continue;
      }
      cr.waveT += dt * (2.1 + cr.size * 0.3);
      var e = elevAt(st, cr.x, cr.y);
      cr.wet = e < st.waterE;

      // 憋气
      if (cr.wet) {
        cr.air -= dt;
        if (cr.air <= 0) {
          cr.alive = false; cr.respawn = REVIVE;
          st.washed++;
          ev(st, 'wash', cr.x, cr.y);
          continue;
        }
      } else if (cr.air < airMax(cr.size)) {
        cr.air = Math.min(airMax(cr.size), cr.air + dt * AIR_RECOVER);
      }

      var speed = CRAB_SPEED + cr.size * 5;

      // 被淹 → 强制往高处逃（自主反应，玩家指挥不了）
      if (cr.wet) {
        if (cr.state !== 'flee') { cr.state = 'flee'; ev(st, 'startled', cr.x, cr.y); }
        var d = ascendDir(st, cr.x, cr.y);
        cr.x = clamp(cr.x + d.x * speed * CRAB_WET * FLEE_BOOST * dt, 8, W - 8);
        cr.y = clamp(cr.y + d.y * speed * CRAB_WET * FLEE_BOOST * dt, 8, H - 8);
        continue;
      }
      if (cr.state === 'flee') {
        // 出水了：饿就继续找吃的，饱了就回洞
        cr.state = cr.sat >= 0.95 ? 'up' : 'down';
        if (cr.state === 'down') {
          var t0 = pickFeedTarget(st, cr);
          if (!t0) { cr.state = 'up'; }
          else { cr.tx = t0.x; cr.ty = t0.y; }
        }
      }

      switch (cr.state) {
        case 'burrow':
          cr.sat -= SAT_DECAY * dt;
          cr.x = cr.hx; cr.y = cr.hy;
          if (cr.sat < HUNGRY) {
            var t1 = pickFeedTarget(st, cr);
            if (t1) { cr.tx = t1.x; cr.ty = t1.y; cr.state = 'down'; ev(st, 'out', cr.x, cr.y); }
          }
          break;

        case 'down': {
          // 目标被水淹了 → 重选（贴着水线的肥泥带会随潮位移动）
          var te = elevAt(st, cr.tx, cr.ty);
          if (te < st.waterE + FEED_LO * 0.5) {
            var t2 = pickFeedTarget(st, cr);
            if (t2) { cr.tx = t2.x; cr.ty = t2.y; }
            else { cr.state = 'up'; break; }
          }
          if (moveToward(st, cr, cr.tx, cr.ty, dt, speed)) {
            cr.state = 'feed'; cr.feedT = 0;
            cr.feedF = foodAt(st, cr.x, cr.y);   // 到了才知道还剩多少肥（路上可能被别只吃薄）
          }
          break;
        }

        case 'feed':
          cr.feedT += dt;
          if (cr.feedT >= FEED_TIME) {
            var got = cr.feedF == null ? 0.5 : cr.feedF;
            cr.sat = Math.min(1, cr.sat + SAT_BITE * (SAT_FROM_FOOD + SAT_FOOD_GAIN * got));
            graze(st, cr.x, cr.y);
            ev(st, 'bite', cr.x, cr.y, { sat: cr.sat, rich: got });
            if (cr.sat >= 0.95) cr.state = 'up';
            else {
              var t3 = pickFeedTarget(st, cr);
              if (t3) { cr.tx = t3.x; cr.ty = t3.y; cr.state = 'down'; }
              else cr.state = 'up';
            }
          }
          break;

        case 'up':
          if (moveToward(st, cr, cr.hx, cr.hy, dt, speed * 1.1)) {
            cr.state = 'burrow';
            cr.meals++;
            ev(st, 'home', cr.x, cr.y, { meals: cr.meals });
            if (cr.size < MAX_SIZE && cr.meals >= cr.size * 2) {
              cr.size++; cr.moltCount = cr.moltCount || 0;
              st.moltCount++;
              cr.air = airMax(cr.size);
              ev(st, 'molt', cr.x, cr.y, { size: cr.size });
            }
          }
          break;
      }
    }
  }

  function updateBirds(st, dt) {
    var i, b;
    // 生成（sandbox 下彻底无鸟，便于单验蟹群力学）
    if (!st.sandbox && st.noBirdT <= 0) {
      st.birdTimer -= dt;
      if (st.birdTimer <= 0) {
        st.birdTimer = st.birdGap * (0.8 + st.rnd() * 0.4);
        if (st.birds.length < BIRD_MAX) {
          var taken = st.birds.map(function (x) { return x.tid; });
          var tgt = pickPrey(st, taken);
          if (tgt) {
            var bx = 30 + st.rnd() * (W - 60);
            st.birds.push({
              x: bx, y: -34, ox: bx, oy: -34,
              tid: tgt.id, t: 0, dur: BIRD_FLY, flap: st.rnd() * 6.28
            });
            ev(st, 'birdIn', tgt.x, tgt.y);
          }
        }
      }
    }
    // 飞行
    for (i = st.birds.length - 1; i >= 0; i--) {
      b = st.birds[i];
      var prey = null;
      for (var k = 0; k < st.crabs.length; k++) if (st.crabs[k].id === b.tid && st.crabs[k].alive) prey = st.crabs[k];
      b.flap += dt * 9;
      if (!prey) { // 猎物没了 → 撤
        b.y -= 140 * dt; b.x += 40 * dt;
        if (b.y < -60) st.birds.splice(i, 1);
        continue;
      }
      var px = prey.x, py = prey.y;
      var pe = elevAt(st, px, py);
      // 猎物进了水里 → 扑空（涨潮驱鸟的正反馈）。每只鸟只记一次，不刷帧
      if (pe < st.waterE) {
        if (!b.gave) { b.gave = true; st.scared++; ev(st, 'scared', px, py); }
        b.y -= 200 * dt; b.x += 60 * dt;
        if (b.y < -60) st.birds.splice(i, 1);
        continue;
      }
      b.t += dt;
      var u = clamp(b.t / b.dur, 0, 1);
      var ease = u * u * (3 - 2 * u);
      b.x = b.ox + (px - b.ox) * ease;
      b.y = b.oy + (py - b.oy) * ease;
      if (u >= 1) {
        if (elevAt(st, prey.x, prey.y) < st.waterE) {
          if (!b.gave) { b.gave = true; st.scared++; ev(st, 'scared', prey.x, prey.y); }
        } else {
          prey.alive = false; prey.respawn = REVIVE;
          st.eaten++;
          ev(st, 'eaten', prey.x, prey.y);
        }
        st.birds.splice(i, 1);
      }
    }
  }

  // 鸟锁定：已露出、不在洞里、高程最低（最贴水线、最暴露）的那只；已被别的鸟盯上的尽量不重复
  function pickPrey(st, taken) {
    var best = null, be = 2, bestTaken = null, beTaken = 2;
    for (var i = 0; i < st.crabs.length; i++) {
      var c = st.crabs[i];
      if (!c.alive || c.state === 'burrow') continue;
      var e = elevAt(st, c.x, c.y);
      if (e < st.waterE) continue;
      var busy = taken && taken.indexOf(c.id) >= 0;
      if (busy) { if (e < beTaken) { beTaken = e; bestTaken = c; } }
      else if (e < be) { be = e; best = c; }
    }
    return best || bestTaken;
  }

  // 生机只算蟹群 —— 贝类是「手段」（换鸣锣），蟹才是「目的」
  function vitality(st) {
    var v = 0;
    for (var i = 0; i < st.crabs.length; i++) if (st.crabs[i].alive) v += st.crabs[i].size * SIZE_PTS;
    return v;
  }

  function gong(st) {
    if (st.over || st.oyster < GONG_COST) return false;
    st.oyster -= GONG_COST;
    st.noBirdT = GONG_TIME;
    st.birds.length = 0;
    ev(st, 'gong', W * 0.5, H * 0.34);
    return true;
  }

  function finish(st) {
    st.over = true;
    var v = vitality(st);
    var star = v >= st.goal ? (v >= st.goal * STAR3 ? 3 : (v >= st.goal * STAR2 ? 2 : 1)) : 0;
    var alive = 0, big = 0;
    for (var i = 0; i < st.crabs.length; i++) if (st.crabs[i].alive) { alive++; big += st.crabs[i].size; }
    st.result = {
      vitality: v, goal: st.goal, star: star, alive: alive, avgSize: alive ? big / alive : 0,
      molt: st.moltCount, clam: st.clamCount, washed: st.washed, eaten: st.eaten,
      scared: st.scared, level: st.level
    };
    ev(st, 'over', W * 0.5, H * 0.5);
  }

  var API = {
    W: W, H: H, CS: CS, COLS: COLS, ROWS: ROWS,
    LEVELS: LEVELS, STAR2: STAR2, STAR3: STAR3,
    TIDE_SPEED: TIDE_SPEED, GONG_COST: GONG_COST, GONG_TIME: GONG_TIME,
    REVIVE: REVIVE, FEED_TIME: FEED_TIME, MAX_SIZE: MAX_SIZE,
    create: create, update: update, elevAt: elevAt, foodAt: foodAt,
    vitality: vitality, gong: gong, finish: finish, airMax: airMax,
    _buildField: buildField, _pickBurrows: pickBurrows, _mulberry32: mulberry32,
    _ascendDir: ascendDir, _pickPrey: pickPrey, _solveY: solveYForElev, _graze: graze
  };
  g.Tidecall = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
