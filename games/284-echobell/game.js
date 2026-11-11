/* ============================================================
   284-echobell / game.js
   《回声 · 一室钟》—— 纯逻辑层：零 DOM、零 Canvas
   可在 Node 里直接 require 做冒烟测试
   核心：暗室弹射 + 光痕揭示 + 编钟连击
   ============================================================ */
(function (g) {
  'use strict';

  // ---------- 画布 / 石室布局 ----------
  var W = 480, H = 900;
  var RX0 = 26, RY0 = 150, RX1 = 454, RY1 = 812;
  var RW = RX1 - RX0, RH = RY1 - RY0;
  var LX = 240, LY = 774;              // 灯台（发射点）

  // ---------- 手感常量 ----------
  var ORB_R = 7;
  var SPEED = 430;                     // 光弹恒速 px/s
  var STEP_MAX = 3.5;                  // 子步进上限（防穿透）
  var REVEAL_R = 88;                   // 光弹照亮半径
  var MAXE = 8;                        // 光能上限
  var BOUNCE_CD = 0.02;                // 反弹去重
  var ORB_TIMEOUT = 26;                // 单发安全上限（秒）

  var TRAIL_LIFE = 7.5, TRAIL_MAX = 3, TRAIL_STEP = 5, TRAIL_CAP = 240;
  var BELL_R = 14, BELL_FORGIVE = 8;   // 宽容判定 → 29px 捕获半径
  var SETTLE = 0.62;                   // 光灭后到下一发的过渡

  var GUIDE_BUDGET = 660, GUIDE_BOUNCE = 4, GUIDE_STEP = 4;
  var AIM_MIN = -174, AIM_MAX = -6;    // 度；-90 = 正上

  var SHOT_BONUS = 150, CLEAR_BONUS = 300, BELL_SCORE = 100;
  var LAUNCH_LIGHT = 150;              // 灯台自带的初始照明（照亮脚边）

  // 宫商角徵羽（C D E G A）
  var PENTA = [523.25, 587.33, 659.25, 783.99, 880.00];

  // ---------- 关卡配置 ----------
  var LV = [
    { bells: 5, shots: 5, pillars: 4,  echo: 2, energy: 7 },
    { bells: 6, shots: 5, pillars: 6,  echo: 2, energy: 7 },
    { bells: 7, shots: 6, pillars: 8,  echo: 2, energy: 6 },
    { bells: 8, shots: 6, pillars: 10, echo: 1, energy: 6 },
    { bells: 9, shots: 7, pillars: 12, echo: 1, energy: 6 }
  ];
  function lvConf(level) {
    var i = Math.min(Math.max(level, 1) - 1, LV.length - 1);
    var b = LV[i], over = Math.max(0, level - LV.length);
    return {
      bells: Math.min(b.bells + over, 12),
      shots: b.shots,
      pillars: Math.min(b.pillars + over * 2, 16),
      echo: Math.max(1, b.echo - over),
      energy: b.energy
    };
  }

  // ---------- 工具 ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function d2(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
  function shuffle(arr, rnd) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1)); var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
  }

  // ---------- 石室生成 ----------
  function genRoom(level, seed) {
    var c = lvConf(level);
    var rnd = mulberry32((((seed >>> 0) ^ (level * 7919)) >>> 0) || 1);
    var bells = [], pillars = [], i, tries;

    // —— 钟：上半区铺开，彼此不挤、离灯台远 ——
    tries = 0;
    var need = c.bells;
    while (bells.length < need && tries < 9000) {
      tries++;
      var bx = RX0 + 52 + rnd() * (RW - 104);
      var by = RY0 + 52 + rnd() * (660 - (RY0 + 52));
      var ok = true;
      for (i = 0; i < bells.length; i++) if (d2(bx, by, bells[i].x, bells[i].y) < 80 * 80) { ok = false; break; }
      if (ok && d2(bx, by, LX, LY) < 132 * 132) ok = false;
      if (!ok) continue;
      bells.push({ x: bx, y: by, r: BELL_R, rung: false, lit: false, glow: 0, tone: 0, idx: bells.length });
    }

    // —— 石柱：躲开钟、躲开灯台 ——
    tries = 0;
    while (pillars.length < c.pillars && tries < 9000) {
      tries++;
      var pr = 17 + rnd() * 15;
      var px = RX0 + pr + 12 + rnd() * (RW - 2 * pr - 24);
      var py = RY0 + pr + 16 + rnd() * (700 - (RY0 + pr + 16));
      var ok2 = true;
      for (i = 0; i < pillars.length; i++) {
        var p = pillars[i], m = pr + p.r + 30;
        if (d2(px, py, p.x, p.y) < m * m) { ok2 = false; break; }
      }
      if (ok2) for (i = 0; i < bells.length; i++) {
        var b = bells[i], m2 = pr + b.r + 48;
        if (d2(px, py, b.x, b.y) < m2 * m2) { ok2 = false; break; }
      }
      if (ok2 && d2(px, py, LX, LY) < (pr + 120) * (pr + 120)) ok2 = false;
      if (!ok2) continue;
      pillars.push({ x: px, y: py, r: pr, echo: false, lit: false, hit: 0 });
    }

    // —— 挑几根做「鸣柱」（反弹回能）——
    var idx = [];
    for (i = 0; i < pillars.length; i++) idx.push(i);
    shuffle(idx, rnd);
    for (i = 0; i < Math.min(c.echo, idx.length); i++) pillars[idx[i]].echo = true;

    return { bells: bells, pillars: pillars, conf: c };
  }

  // ---------- 建局 ----------
  function create(level, seed) {
    level = Math.max(1, level | 0);
    seed = (seed >>> 0) || 1;
    var room = genRoom(level, seed);
    var c = room.conf;

    var st = {
      level: level, seed: seed, conf: c,
      bells: room.bells, pillars: room.pillars,
      score: 0,
      shots: c.shots, shotsMax: c.shots,
      energyMax: c.energy,
      phase: 'aim',            // aim | fly | settle | over
      orb: null,
      trails: [],
      aim: -Math.PI / 2,
      t: 0, settleT: 0,
      shotCombo: 0, bestCombo: 0,
      ringTotal: 0,
      result: null,
      events: []
    };
    revealAt(st, LX, LY, LAUNCH_LIGHT);
    return st;
  }

  // ---------- 揭示 ----------
  function revealAt(st, x, y, R) {
    var R2 = R * R, i;
    for (i = 0; i < st.pillars.length; i++) {
      var p = st.pillars[i];
      if (p.lit) continue;
      var lim = R + p.r;
      if (d2(x, y, p.x, p.y) < lim * lim) p.lit = true;
    }
    for (i = 0; i < st.bells.length; i++) {
      var b = st.bells[i];
      if (b.lit) continue;
      var lim2 = R + b.r;
      if (d2(x, y, b.x, b.y) < lim2 * lim2) b.lit = true;
    }
  }

  // ---------- 瞄准 ----------
  function clampAim(a) {
    var deg = a * 180 / Math.PI;
    // 归一化到 (-180,180]
    while (deg <= -180) deg += 360;
    while (deg > 180) deg -= 360;
    if (deg >= 0) deg = (deg < 90) ? AIM_MAX : AIM_MIN;   // 指向下方 → 贴边
    if (deg < AIM_MIN) deg = AIM_MIN;
    if (deg > AIM_MAX) deg = AIM_MAX;
    return deg * Math.PI / 180;
  }
  function aimAt(st, x, y) {
    if (st.phase !== 'aim') return false;
    var a = Math.atan2(y - LY, x - LX);
    st.aim = clampAim(a);
    return true;
  }
  function adjustAim(st, d) { st.aim = clampAim(st.aim + d); return st.aim; }

  // —— 瞄准引导线 ——
  // 设计核心：只在「已被照亮」的已知几何上反射，撞上未显形的石柱就截断。
  // 于是「揭示」直接兑换成「掌控」：探得越明白，下一发越能算得准。
  function guidePath(st) {
    var pts = [{ x: LX, y: LY }];
    var x = LX, y = LY;
    var dx = Math.cos(st.aim), dy = Math.sin(st.aim);
    var budget = GUIDE_BUDGET, bounces = 0, stopped = false, i;

    while (budget > 0 && bounces < GUIDE_BOUNCE) {
      x += dx * GUIDE_STEP; y += dy * GUIDE_STEP; budget -= GUIDE_STEP;

      // 四壁（永远已知）
      var nx = 0, ny = 0;
      if (x - ORB_R < RX0) { x = RX0 + ORB_R; nx = 1; }
      else if (x + ORB_R > RX1) { x = RX1 - ORB_R; nx = -1; }
      if (y - ORB_R < RY0) { y = RY0 + ORB_R; ny = 1; }
      else if (y + ORB_R > RY1) { y = RY1 - ORB_R; ny = -1; }
      if (nx || ny) {
        var dot = dx * nx + dy * ny;
        dx -= 2 * dot * nx; dy -= 2 * dot * ny;
        var nn = Math.sqrt(dx * dx + dy * dy) || 1; dx /= nn; dy /= nn;
        pts.push({ x: x, y: y }); bounces++;
        continue;
      }

      // 石柱
      var h = null;
      for (i = 0; i < st.pillars.length; i++) {
        var p = st.pillars[i], rr = p.r + ORB_R;
        if (d2(x, y, p.x, p.y) < rr * rr) { h = p; break; }
      }
      if (h) {
        pts.push({ x: x, y: y });
        if (!h.lit) { stopped = true; break; }        // 未知 → 到此为止
        var ex = x - h.x, ey = y - h.y, ed = Math.sqrt(ex * ex + ey * ey) || 0.0001;
        var ux = ex / ed, uy = ey / ed;
        var d3 = dx * ux + dy * uy;
        dx -= 2 * d3 * ux; dy -= 2 * d3 * uy;
        var nn2 = Math.sqrt(dx * dx + dy * dy) || 1; dx /= nn2; dy /= nn2;
        x = h.x + ux * (h.r + ORB_R + 0.8); y = h.y + uy * (h.r + ORB_R + 0.8);
        bounces++;
        continue;
      }
    }
    if (!stopped) pts.push({ x: x, y: y });
    return { pts: pts, stopped: stopped, bounces: bounces };
  }

  function guide(st) { return guidePath(st); }

  // ---------- 发射 ----------
  function fire(st) {
    if (st.phase !== 'aim' || st.shots <= 0) return false;
    st.shots--;
    st.shotCombo = 0;
    st.orb = {
      x: LX, y: LY,
      vx: Math.cos(st.aim) * SPEED,
      vy: Math.sin(st.aim) * SPEED,
      energy: st.energyMax,
      alive: true, life: 0, lastBounceT: -1,
      tail: 0
    };
    st.trails.push({ pts: [{ x: LX, y: LY }], live: true, age: 0 });
    while (st.trails.length > TRAIL_MAX) st.trails.shift();
    st.phase = 'fly';
    revealAt(st, LX, LY, REVEAL_R);
    st.events.push({ type: 'fire', x: LX, y: LY });
    return true;
  }

  // ---------- 物理 ----------
  function doBounce(st, o, x, y, echo, kind) {
    if (st.t - o.lastBounceT < BOUNCE_CD) return;
    o.lastBounceT = st.t;
    if (echo) o.energy = Math.min(MAXE, o.energy + 1);
    else o.energy -= 1;
    st.events.push({ type: 'bounce', x: x, y: y, echo: !!echo, kind: kind || 'wall', energy: o.energy });
    if (o.energy <= 0) killOrb(st);
  }

  function stepPhysics(st, o) {
    var r = ORB_R, i;

    // 四壁
    if (o.x - r < RX0) { o.x = RX0 + r; o.vx = Math.abs(o.vx); doBounce(st, o, RX0, o.y, false, 'wall'); }
    else if (o.x + r > RX1) { o.x = RX1 - r; o.vx = -Math.abs(o.vx); doBounce(st, o, RX1, o.y, false, 'wall'); }
    if (o.y - r < RY0) { o.y = RY0 + r; o.vy = Math.abs(o.vy); doBounce(st, o, o.x, RY0, false, 'wall'); }
    else if (o.y + r > RY1) { o.y = RY1 - r; o.vy = -Math.abs(o.vy); doBounce(st, o, o.x, RY1, false, 'wall'); }
    if (!o.alive) return;

    // 石柱
    for (i = 0; i < st.pillars.length; i++) {
      var p = st.pillars[i], rr = p.r + r;
      var dx = o.x - p.x, dy = o.y - p.y, dd = dx * dx + dy * dy;
      if (dd < rr * rr) {
        var d = Math.sqrt(dd) || 0.0001;
        var nx = dx / d, ny = dy / d;
        o.x = p.x + nx * (rr + 0.6);
        o.y = p.y + ny * (rr + 0.6);
        var dot = o.vx * nx + o.vy * ny;
        o.vx -= 2 * dot * nx;
        o.vy -= 2 * dot * ny;
        p.hit = 1;
        doBounce(st, o, p.x + nx * p.r, p.y + ny * p.r, p.echo, 'pillar');
        if (!o.alive) return;
      }
    }

    // 钟（宽容判定，穿过不反弹）
    var cap = BELL_R + r + BELL_FORGIVE;
    for (i = 0; i < st.bells.length; i++) {
      var b = st.bells[i];
      if (b.rung) continue;
      if (d2(o.x, o.y, b.x, b.y) < cap * cap) ringBell(st, b);
    }
  }

  function ringBell(st, b) {
    b.rung = true; b.lit = true; b.glow = 1; b.tone = 1;
    st.shotCombo++;
    st.ringTotal++;
    if (st.shotCombo > st.bestCombo) st.bestCombo = st.shotCombo;
    var gain = BELL_SCORE * st.shotCombo;
    st.score += gain;
    var oct = st.shotCombo > 5 ? 2 : 1;
    st.events.push({
      type: 'ring', x: b.x, y: b.y, idx: b.idx,
      combo: st.shotCombo, gain: gain,
      freq: PENTA[(st.shotCombo - 1) % 5] * oct
    });
    if (bellsLeft(st) === 0) {
      st.events.push({ type: 'clear' });
      killOrb(st);
    }
  }

  function bellsLeft(st) {
    var n = 0;
    for (var i = 0; i < st.bells.length; i++) if (!st.bells[i].rung) n++;
    return n;
  }

  function killOrb(st) {
    if (!st.orb || !st.orb.alive) return;
    st.orb.alive = false;
    st.events.push({ type: 'die', x: st.orb.x, y: st.orb.y, combo: st.shotCombo });
    for (var i = 0; i < st.trails.length; i++) st.trails[i].live = false;
    st.phase = 'settle';
    st.settleT = 0;
  }

  function pushTrail(st, x, y) {
    var t = st.trails[st.trails.length - 1];
    if (!t || !t.live) return;
    var last = t.pts[t.pts.length - 1];
    if (d2(x, y, last.x, last.y) < TRAIL_STEP * TRAIL_STEP) return;
    t.pts.push({ x: x, y: y });
    if (t.pts.length > TRAIL_CAP) t.pts.shift();
  }

  // ---------- 主循环 ----------
  function update(st, dt) {
    st.t += dt;
    var i;

    // 光痕老化
    for (i = st.trails.length - 1; i >= 0; i--) {
      var t = st.trails[i];
      if (t.live) continue;
      t.age += dt;
      if (t.age > TRAIL_LIFE) st.trails.splice(i, 1);
    }

    // 余辉衰减
    for (i = 0; i < st.bells.length; i++) {
      var b = st.bells[i];
      if (b.glow > 0) b.glow = Math.max(0, b.glow - dt * 1.5);
      if (b.tone > 0) b.tone = Math.max(0, b.tone - dt * 1.9);
    }
    for (i = 0; i < st.pillars.length; i++) {
      var p = st.pillars[i];
      if (p.hit > 0) p.hit = Math.max(0, p.hit - dt * 3.2);
    }

    // 飞行
    if (st.phase === 'fly') {
      var o = st.orb;
      o.life += dt;
      var remain = SPEED * dt, guard = 0;
      while (remain > 0 && o.alive && guard++ < 600) {
        var step = Math.min(STEP_MAX, remain);
        remain -= step;
        o.x += o.vx / SPEED * step;
        o.y += o.vy / SPEED * step;
        stepPhysics(st, o);
      }
      pushTrail(st, o.x, o.y);
      revealAt(st, o.x, o.y, REVEAL_R);
      if (o.life > ORB_TIMEOUT) killOrb(st);
    }

    // 落定
    if (st.phase === 'settle') {
      st.settleT += dt;
      if (st.settleT > SETTLE) {
        if (bellsLeft(st) === 0 || st.shots <= 0) finish(st);
        else { st.phase = 'aim'; st.orb = null; }
      }
    }
  }

  // ---------- 结算 ----------
  function finish(st) {
    var left = bellsLeft(st);
    var total = st.bells.length;
    var rung = total - left;
    var clear = left === 0;
    var bonus = st.shots * SHOT_BONUS + (clear ? CLEAR_BONUS : 0);
    st.score += bonus;
    var stars = 0;
    if (clear) stars = st.shots >= 1 ? 3 : 2;
    else if (rung >= Math.ceil(total / 2)) stars = 1;
    st.result = {
      level: st.level, rung: rung, total: total,
      shotsLeft: st.shots, clear: clear, stars: stars,
      bonus: bonus, bestCombo: st.bestCombo, score: st.score
    };
    st.phase = 'over';
    st.events.push({ type: 'over', result: st.result });
  }

  // ---------- 对外统计 ----------
  function stats(st) {
    return {
      level: st.level, phase: st.phase,
      score: st.score,
      rung: st.bells.length - bellsLeft(st),
      total: st.bells.length,
      shots: st.shots, shotsMax: st.shotsMax,
      energy: st.orb && st.orb.alive ? st.orb.energy : (st.phase === 'aim' ? st.energyMax : 0),
      energyMax: st.energyMax,
      combo: st.shotCombo, bestCombo: st.bestCombo,
      result: st.result, over: st.phase === 'over'
    };
  }

  // ---------- 导出 ----------
  g.Echo = {
    W: W, H: H,
    RX0: RX0, RY0: RY0, RX1: RX1, RY1: RY1, RW: RW, RH: RH,
    LX: LX, LY: LY,
    ORB_R: ORB_R, SPEED: SPEED, REVEAL_R: REVEAL_R,
    PENTA: PENTA, MAXE: MAXE,
    lvConf: lvConf,
    create: create,
    update: update,
    stats: stats,
    aimAt: aimAt,
    adjustAim: adjustAim,
    guide: guide,
    fire: fire,
    bellsLeft: bellsLeft,
    revealAt: revealAt
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);
