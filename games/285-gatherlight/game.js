/* ============================================================
   285-gatherlight / game.js
   《引灯 · 洄游夜》—— 纯逻辑层：零 DOM、零 Canvas
   可在 Node 里直接 require 做冒烟测试
   核心：转动灯锥 → 把洄游客卷进光带 → 顺光滑回店里
   ============================================================ */
(function (g) {
  'use strict';

  // ---------- 世界尺度 ----------
  var W = 480, H = 900;
  var SEA_X0 = 26, SEA_Y0 = 196, SEA_X1 = 454, SEA_Y1 = 756;
  var SHOP_X = 240, SHOP_Y = 796;
  var HOME_R0 = 62, HOME_R_MAX = 126;

  // ---------- 灯锥两种形态 ----------
  // 散光＝「归拢」：横向收拢极强、纵向只余一丝暖流 —— 把散客排成一条线，但拖不回来。免费。
  // （一丝暖流是刻意的：门口那一小段自己会漂进来，远处的必须靠聚光。）
  var CONE_W = { len: 470, half: 21 * Math.PI / 180, pull: 34, cross: 340 };
  // 聚光＝「收网」：纵向回流暴涨 —— 真把这条线拽回家。耗光能。礁岩蟹非它不可。
  var CONE_F = { len: 600, half: 10.5 * Math.PI / 180, pull: 420, cross: 430 };

  // ---------- 手感常量 ----------
  var DAMP = 1.95;     // 水的阻尼
  var FLOW_ACC = 78;   // 洋流基准加速度（乘以 wave.flow）—— 纯摆动，不产生净漂移
  var E_MAX = 100, DRAIN = 26, REGEN = 17, REST_T = 1.0;
  var COMBO_WIN = 3.2, COMBO_STEP = 0.22, COMBO_CAP = 3.0;
  var WAVE_BONUS = 300, ENERGY_BONUS = 2;   // 每剩 1 点光能 +2 分
  var BUMP_E = 8;      // 撞礁扣光能
  var SEAT_CAP = 24;

  var PENTA = [261.63, 293.66, 329.63, 392.00, 440.00]; // 宫商角徵羽

  var KIND = {
    lamp: { mass: 1.0, r: 9,  score: 100, jitter: 20,  label: '灯眼鱼' },
    dart: { mass: 0.8, r: 8,  score: 140, jitter: 104, label: '急流鮨' },
    crab: { mass: 2.6, r: 13, score: 180, jitter: 12,  label: '礁岩蟹' },
    fry:  { mass: 0.6, r: 6,  score: 90,  jitter: 26,  label: '幼灯' }
  };

  // ---------- 五波 ----------
  var WAVES = [
    { mix: ['lamp', 'lamp', 'lamp'],                                            flow: 0.30, patience: 26, maxAlive: 4 },
    { mix: ['lamp', 'lamp', 'lamp', 'dart', 'dart'],                             flow: 0.42, patience: 25, maxAlive: 5 },
    { mix: ['lamp', 'lamp', 'lamp', 'dart', 'dart', 'crab'],                     flow: 0.52, patience: 24, maxAlive: 6 },
    { mix: ['lamp', 'lamp', 'lamp', 'dart', 'dart', 'crab', 'fry'],              flow: 0.62, patience: 23, maxAlive: 7 },
    { mix: ['lamp', 'lamp', 'lamp', 'lamp', 'dart', 'dart', 'crab', 'crab', 'fry'], flow: 0.72, patience: 22, maxAlive: 8 }
  ];

  // ---------- 工具 ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function d2(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
  function shuffle(arr, rnd) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1)); var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
  }
  function waveConf(w) {
    var i = clamp(w, 1, WAVES.length) - 1;
    return WAVES[i];
  }

  // ---------- 礁石（整夜固定 → 值得记住的海图） ----------
  // 两条硬约束：① 离店 ≤ 455（宽光锥 470 够得着，不靠聚光也能摸清海图）
  //            ② 从店看过去角度不重叠（任何一块都不会被另一块永久挡死）
  function angOf(x, y) { return Math.atan2(y - SHOP_Y, x - SHOP_X); }
  function genReefs(rnd) {
    var reef = [], tries = 0;
    while (reef.length < 6 && tries < 20000) {
      tries++;
      var r = 17 + rnd() * 17;
      var x = SEA_X0 + r + 22 + rnd() * (SEA_X1 - SEA_X0 - 2 * r - 44);
      var y = 330 + rnd() * 350;
      if (y + r > SEA_Y1 - 10) continue;
      var dist = Math.sqrt(d2(x, y, SHOP_X, SHOP_Y));
      if (dist < 128 + r || dist > 452) continue;
      var ang = angOf(x, y), angR = Math.asin(Math.min(1, r / dist));
      var ok = true, i;
      for (i = 0; i < reef.length; i++) {
        var p = reef[i];
        if (d2(x, y, p.x, p.y) < (r + p.r + 46) * (r + p.r + 46)) { ok = false; break; }
        var da = ang - p.ang;
        while (da > Math.PI) da -= 2 * Math.PI;
        while (da < -Math.PI) da += 2 * Math.PI;
        if (Math.abs(da) < angR + p.angR + 0.035) { ok = false; break; }
      }
      if (!ok) continue;
      reef.push({ x: x, y: y, r: r, lit: false, seed: rnd(), ang: ang, angR: angR, dist: dist });
    }
    return reef;
  }

  // ---------- 建局 ----------
  function create(seed) {
    seed = (seed >>> 0) || 1;
    var rnd = mulberry32(seed);
    return {
      seed: seed, rnd: rnd,
      t: 0, phase: 'play',          // play | over
      sandbox: false,               // 测试用：不推进波次、不结算
      wave: 0, waveTotal: 0, waveDone: 0, waveDelivered: 0,
      reefs: genReefs(rnd),
      guests: [], clusters: [], seats: [],
      queue: [], spawnT: 0, nextId: 1,
      aim: -Math.PI / 2, focus: false, focusHeld: false,
      energy: E_MAX, restT: 0,
      flowBase: rnd() * Math.PI * 2,
      delivered: 0, lost: 0, combo: 0, comboT: 0, bestCombo: 0,
      score: 0, result: null,
      events: []
    };
  }

  function homeR(st) {
    return Math.min(HOME_R_MAX, HOME_R0 + Math.min(st.delivered, 20) * 3.2);
  }

  // ---------- 波次 ----------
  function startWave(st, w) {
    st.wave = w;
    var c = waveConf(w);
    var q = [], i;
    for (i = 0; i < c.mix.length; i++) {
      if (c.mix[i] === 'fry') { q.push('fry', 'fry', 'fry'); }
      else q.push(c.mix[i]);
    }
    shuffle(q, st.rnd);
    st.queue = q;
    st.waveTotal = q.length;
    st.waveDone = 0;
    st.waveDelivered = 0;
    st.spawnT = 0.35;
    st.events.push({ type: 'wave', wave: w, total: q.length });
  }

  function aliveCount(st) {
    var n = 0;
    for (var i = 0; i < st.guests.length; i++) if (!st.guests[i].leaving) n++;
    return n;
  }

  function spawnOne(st) {
    var kind = st.queue.shift();
    if (!kind) return false;
    var c = waveConf(st.wave), K = KIND[kind];
    var rnd = st.rnd, x = 0, y = 0, tries = 0, ok;
    do {
      tries++;
      x = SEA_X0 + 34 + rnd() * (SEA_X1 - SEA_X0 - 68);
      y = 232 + rnd() * 400;
      ok = d2(x, y, SHOP_X, SHOP_Y) > 215 * 215;
      var i;
      if (ok) for (i = 0; i < st.reefs.length; i++) {
        var rf = st.reefs[i], m = rf.r + K.r + 30;
        if (d2(x, y, rf.x, rf.y) < m * m) { ok = false; break; }
      }
      if (ok) for (i = 0; i < st.guests.length; i++) {
        var gs = st.guests[i];
        if (d2(x, y, gs.x, gs.y) < 46 * 46) { ok = false; break; }
      }
    } while (!ok && tries < 400);

    var gs = {
      id: st.nextId++, kind: kind, x: x, y: y,
      vx: 0, vy: 0, r: K.r, mass: K.mass,
      lit: false, inBeam: false, leaving: false,
      age: 0, patience: c.patience,
      ph: rnd() * 6.283, startle: 0, cl: -1,
      wob: rnd() * 6.283, caught: 0, bumpCd: 0
    };
    if (kind === 'fry') {
      // 找同一簇（本波内刚生成的 fry 归为一簇）
      var cl = null;
      for (var i = 0; i < st.clusters.length; i++) {
        if (st.clusters[i].wave === st.wave && st.clusters[i].n < 3) { cl = st.clusters[i]; break; }
      }
      if (!cl) { cl = { wave: st.wave, n: 0, x: x, y: y }; st.clusters.push(cl); }
      cl.n++; gs.cl = st.clusters.indexOf(cl);
    }
    st.guests.push(gs);
    st.events.push({ type: 'spawn', x: x, y: y, kind: kind });
    return true;
  }

  // ---------- 遮挡：店 → 客人的线段是否穿过礁石 ----------
  function shadowed(st, x, y) {
    var ax = SHOP_X, ay = SHOP_Y, dx = x - ax, dy = y - ay;
    var L2 = dx * dx + dy * dy;
    if (L2 < 1) return false;
    for (var i = 0; i < st.reefs.length; i++) {
      var rf = st.reefs[i];
      var t = ((rf.x - ax) * dx + (rf.y - ay) * dy) / L2;
      if (t < 0.03 || t > 0.97) continue;
      var px = ax + dx * t, py = ay + dy * t;
      if (d2(px, py, rf.x, rf.y) < rf.r * rf.r) return true;
    }
    return false;
  }

  // ---------- 光锥：客人是否被卷住 ----------
  function cone() { return null; }
  function beam(st, gs, out) {
    out.x = 0; out.y = 0; out.on = false;
    var c = st.focus ? CONE_F : CONE_W;
    var dx = gs.x - SHOP_X, dy = gs.y - SHOP_Y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d > c.len || d < 1) return false;
    var ax = Math.cos(st.aim), ay = Math.sin(st.aim);
    var proj = dx * ax + dy * ay;
    if (proj <= 0) return false;
    var perpX = -ay, perpY = ax;
    var lat = dx * perpX + dy * perpY;
    var halfW = proj * Math.tan(c.half) + gs.r * 0.75;   // 边缘宽容
    if (Math.abs(lat) > halfW) return false;
    if (shadowed(st, gs.x, gs.y)) return false;

    var fall = 1 - 0.5 * (proj / c.len);
    var latN = Math.min(1, Math.abs(lat) / Math.max(halfW, 1));
    var m1 = c.pull * fall * (1 - 0.35 * latN);
    out.x += -ax * m1; out.y += -ay * m1;

    var sgn = lat > 0 ? -1 : 1;
    var m2 = c.cross * fall * latN;
    out.x += perpX * sgn * m2; out.y += perpY * sgn * m2;

    out.on = true;
    return true;
  }

  // ---------- 礁石 / 客人的「被照亮」标记（记忆海图） ----------
  function markLit(st) {
    var c = st.focus ? CONE_F : CONE_W;
    var ax = Math.cos(st.aim), ay = Math.sin(st.aim);
    var px = -ay, py = ax, i;
    var tanH = Math.tan(c.half);
    for (i = 0; i < st.reefs.length; i++) {
      var rf = st.reefs[i];
      if (rf.lit) continue;
      var dx = rf.x - SHOP_X, dy = rf.y - SHOP_Y;
      var proj = dx * ax + dy * ay;
      if (proj <= 0 || proj > c.len) continue;
      var lat = Math.abs(dx * px + dy * py);
      if (lat > proj * tanH + rf.r) continue;
      if (shadowed(st, rf.x, rf.y)) continue;
      rf.lit = true;
    }
    // 礁石背面被别的东西挡住时，用「边缘也算照到」兜底，避免永远点不亮
    for (i = 0; i < st.reefs.length; i++) {
      var rf2 = st.reefs[i];
      if (rf2.lit) continue;
      var dx2 = rf2.x - SHOP_X, dy2 = rf2.y - SHOP_Y;
      var dd = Math.sqrt(dx2 * dx2 + dy2 * dy2);
      if (dd - rf2.r > c.len) continue;
      var pr2 = dx2 * ax + dy2 * ay;
      if (pr2 <= 0) continue;
      var lt2 = Math.abs(dx2 * px + dy2 * py);
      if (lt2 - rf2.r * 0.5 > pr2 * tanH) continue;
      if (!shadowed(st, rf2.x + (dx2 / dd) * rf2.r * 0.6, rf2.y + (dy2 / dd) * rf2.r * 0.6)) rf2.lit = true;
    }
    // 店门口那一圈永远是亮的
    var hr = homeR(st);
    for (i = 0; i < st.reefs.length; i++) {
      var rf3 = st.reefs[i], lim = rf3.r + hr;
      if (d2(rf3.x, rf3.y, SHOP_X, SHOP_Y) < lim * lim) rf3.lit = true;
    }
  }

  // ---------- 送达 / 流失 ----------
  function deliver(st, gs) {
    st.combo++;
    if (st.combo > st.bestCombo) st.bestCombo = st.combo;
    st.comboT = COMBO_WIN;
    var mul = Math.min(COMBO_CAP, 1 + COMBO_STEP * (st.combo - 1));
    var gain = Math.round(KIND[gs.kind].score * mul);
    st.score += gain;
    st.delivered++;
    st.waveDelivered++;
    if (st.seats.length < SEAT_CAP) {
      st.seats.push({ kind: gs.kind, ph: st.rnd() * 6.283, born: st.t });
    }
    st.events.push({
      type: 'deliver', x: gs.x, y: gs.y, kind: gs.kind,
      combo: st.combo, gain: gain, mul: mul,
      freq: PENTA[(st.delivered - 1) % 5] * 2,
      home: homeR(st)
    });
    st.events.push({ type: 'seat', n: st.seats.length });
  }

  function loseGuest(st, gs) {
    st.lost++;
    st.events.push({ type: 'leave', x: gs.x, y: gs.y, kind: gs.kind });
  }

  // ---------- 物理 ----------
  var _f = { x: 0, y: 0, on: false };
  function stepGuest(st, gs, dt) {
    var K = KIND[gs.kind];
    var ax = 0, ay = 0, i;

    if (gs.leaving) {
      var ox = gs.x - SHOP_X, oy = gs.y - SHOP_Y;
      var od = Math.sqrt(ox * ox + oy * oy) || 1;
      ax += ox / od * 78; ay += oy / od * 78;
      gs.x += gs.vx * dt; gs.y += gs.vy * dt;
      gs.vx = (gs.vx + ax * dt) * Math.exp(-0.5 * dt);
      gs.vy = (gs.vy + ay * dt) * Math.exp(-0.5 * dt);
      return;
    }

    // 洋流：整片水在缓慢摆动 —— 零均值，不会把客人白送到门口，只是让他们待不住
    var fa = st.t * 0.29 + gs.ph * 0.7 + gs.x * 0.0042;
    var fb = st.t * 0.23 + gs.wob + gs.y * 0.0038;
    var fl = waveConf(Math.max(1, st.wave)).flow * FLOW_ACC;
    ax += Math.cos(fa) * fl;
    ay += Math.sin(fb) * fl * 0.72;

    // 自身游荡
    var jt = K.jitter * (gs.startle > 0 ? 3.0 : 1);
    ax += Math.sin(st.t * 1.7 + gs.ph) * jt * 0.55 + Math.sin(st.t * 4.3 + gs.wob) * jt * 0.45;
    ay += Math.cos(st.t * 1.3 + gs.ph * 1.7) * jt * 0.5 + Math.cos(st.t * 3.1 + gs.wob) * jt * 0.4;

    // 灯锥
    var on = beam(st, gs, _f);
    gs.inBeam = on;
    if (on) { ax += _f.x / gs.mass; ay += _f.y / gs.mass; gs.lit = true; }

    // 幼灯群：互相聚拢
    if (gs.cl >= 0 && st.clusters[gs.cl]) {
      var cl = st.clusters[gs.cl];
      ax += (cl.x - gs.x) * 2.4;
      ay += (cl.y - gs.y) * 2.4;
      for (i = 0; i < st.guests.length; i++) {
        var o = st.guests[i];
        if (o === gs || o.cl !== gs.cl) continue;
        var sx = gs.x - o.x, sy = gs.y - o.y, sd = Math.sqrt(sx * sx + sy * sy);
        if (sd > 0.01 && sd < 15) { ax += sx / sd * (15 - sd) * 11; ay += sy / sd * (15 - sd) * 11; }
      }
    }

    // 进了暖光圈就算看见你了（不额外吸——把人带回来是光的事，不是店的事）
    var hd2 = d2(gs.x, gs.y, SHOP_X, SHOP_Y), hr = homeR(st);
    if (hd2 < hr * hr) gs.lit = true;

    // 积分
    gs.vx = (gs.vx + ax * dt) * Math.exp(-DAMP * dt);
    gs.vy = (gs.vy + ay * dt) * Math.exp(-DAMP * dt);
    gs.x += gs.vx * dt;
    gs.y += gs.vy * dt;

    // 边界
    if (gs.x - gs.r < SEA_X0) { gs.x = SEA_X0 + gs.r; gs.vx = Math.abs(gs.vx) * 0.45; }
    else if (gs.x + gs.r > SEA_X1) { gs.x = SEA_X1 - gs.r; gs.vx = -Math.abs(gs.vx) * 0.45; }
    if (gs.y - gs.r < SEA_Y0) { gs.y = SEA_Y0 + gs.r; gs.vy = Math.abs(gs.vy) * 0.45; }
    else if (gs.y + gs.r > SEA_Y1) { gs.y = SEA_Y1 - gs.r; gs.vy = -Math.abs(gs.vy) * 0.45; }

    // 礁石
    for (i = 0; i < st.reefs.length; i++) {
      var rf = st.reefs[i], lim = rf.r + gs.r;
      var rx = gs.x - rf.x, ry = gs.y - rf.y, rd2 = rx * rx + ry * ry;
      if (rd2 < lim * lim) {
        var rd = Math.sqrt(rd2) || 0.001;
        var nx = rx / rd, ny = ry / rd;
        gs.x = rf.x + nx * lim;
        gs.y = rf.y + ny * lim;
        var vn = gs.vx * nx + gs.vy * ny;
        if (vn < 0) { gs.vx -= 1.5 * vn * nx; gs.vy -= 1.5 * vn * ny; }
        gs.vx *= 0.55; gs.vy *= 0.55;
        gs.startle = 0.9;
        // 客人自己撞的礁石不该算在你账上：只有你正按着聚光收网时才付这笔光能
        // （另外加冷却，免得贴着礁石每帧都扣一次）
        if (!(gs.bumpCd > 0)) {
          gs.bumpCd = 0.45;
          var cost = st.focus ? BUMP_E : 0;
          if (cost > 0) st.energy = Math.max(0, st.energy - cost);
          st.events.push({
            type: 'bump', x: rf.x + nx * rf.r, y: rf.y + ny * rf.r,
            kind: gs.kind, cost: cost
          });
        }
      }
    }

    if (gs.startle > 0) gs.startle -= dt;
    if (gs.bumpCd > 0) gs.bumpCd -= dt;
    gs.age += dt;

    // 送达
    if (d2(gs.x, gs.y, SHOP_X, SHOP_Y) < hr * hr) { gs.caught = 1; deliver(st, gs); return; }
    // 耐心耗尽 → 转身游走
    if (gs.age > gs.patience) { gs.leaving = true; loseGuest(st, gs); }
  }

  // ---------- 主循环 ----------
  function update(st, dt) {
    if (st.phase === 'over') return;
    if (dt > 0.05) dt = 0.05;
    st.t += dt;

    var i, gs;

    // 光能
    if (st.restT > 0) { st.restT -= dt; st.focus = false; }
    else st.focus = st.focusHeld && st.energy > 0;
    if (st.focus) {
      st.energy -= DRAIN * dt;
      if (st.energy <= 0) {
        st.energy = 0; st.focus = false; st.restT = REST_T;
        st.events.push({ type: 'exhaust' });
      }
    } else if (st.restT <= 0) {
      st.energy = Math.min(E_MAX, st.energy + REGEN * dt);
    }

    // 波次推进
    if (st.wave === 0) startWave(st, 1);
    var wc = waveConf(st.wave);
    if (st.queue.length) {
      st.spawnT -= dt;
      if (st.spawnT <= 0 && aliveCount(st) < wc.maxAlive) {
        spawnOne(st);
        st.spawnT = 0.9;
      }
    }

    // 客人
    for (i = st.guests.length - 1; i >= 0; i--) {
      gs = st.guests[i];
      stepGuest(st, gs, dt);
      if (gs.caught) { st.guests.splice(i, 1); st.waveDone++; continue; }
      if (gs.leaving) {
        if (gs.x < SEA_X0 - 60 || gs.x > SEA_X1 + 60 || gs.y < SEA_Y0 - 60 || gs.y > SEA_Y1 + 90) {
          st.guests.splice(i, 1); st.waveDone++;
        }
      }
    }

    // 簇心
    for (i = 0; i < st.clusters.length; i++) {
      var cl = st.clusters[i], n = 0, sx = 0, sy = 0;
      for (var j = 0; j < st.guests.length; j++) if (st.guests[j].cl === i) { n++; sx += st.guests[j].x; sy += st.guests[j].y; }
      if (n) { cl.x = sx / n; cl.y = sy / n; }
    }

    // 连击窗口
    if (st.combo > 0) { st.comboT -= dt; if (st.comboT <= 0) st.combo = 0; }

    // 照亮标记（只在灯真的亮着时）
    if (st.energy > 0 || st.restT <= 0) markLit(st);

    // 波次结束（sandbox 模式下不推进，供单元测试钉住单只客人）
    if (!st.sandbox && !st.queue.length && st.guests.length === 0) {
      if (st.waveDelivered === st.waveTotal) {
        st.score += WAVE_BONUS;
        st.events.push({ type: 'perfect', wave: st.wave, bonus: WAVE_BONUS });
      }
      if (st.wave >= WAVES.length) finish(st);
      else startWave(st, st.wave + 1);
    }
  }

  function finish(st) {
    var eb = Math.round(st.energy) * ENERGY_BONUS;
    st.score += eb;
    var total = st.delivered + st.lost;
    var rate = total ? st.delivered / total : 0;
    var stars = rate >= 0.85 ? 3 : (rate >= 0.65 ? 2 : (rate >= 0.42 ? 1 : 0));
    st.result = {
      delivered: st.delivered, lost: st.lost, total: total, rate: rate,
      bestCombo: st.bestCombo, energyBonus: eb, score: st.score, stars: stars
    };
    st.phase = 'over';
    st.events.push({ type: 'over', result: st.result });
  }

  // ---------- 输入 ----------
  function aimAt(st, x, y) {
    if (st.phase !== 'play') return false;
    var a = Math.atan2(y - SHOP_Y, x - SHOP_X);
    // 归一化到 (-180,180]
    var deg = a * 180 / Math.PI;
    while (deg <= -180) deg += 360;
    while (deg > 180) deg -= 360;
    if (deg >= 0) deg = deg < 90 ? -5 : -175;   // 指向下方 → 贴边
    if (deg < -175) deg = -175;
    if (deg > -5) deg = -5;
    st.aim = deg * Math.PI / 180;
    return true;
  }
  function adjustAim(st, d) {
    if (st.phase !== 'play') return st.aim;
    var deg = st.aim * 180 / Math.PI + d * 180 / Math.PI;
    if (deg < -175) deg = -175;
    if (deg > -5) deg = -5;
    st.aim = deg * Math.PI / 180;
    return st.aim;
  }
  function setFocus(st, on) { st.focusHeld = !!on; }

  // ---------- 对外统计 ----------
  function stats(st) {
    var wc = waveConf(Math.max(1, st.wave));
    return {
      wave: st.wave, waves: WAVES.length, phase: st.phase,
      score: st.score,
      delivered: st.delivered, lost: st.lost,
      waveTotal: st.waveTotal, waveDone: st.waveDone, waveDelivered: st.waveDelivered,
      energy: Math.round(st.energy), focus: st.focus, rest: st.restT > 0,
      combo: st.combo, bestCombo: st.bestCombo,
      seats: st.seats.length, home: homeR(st),
      result: st.result, over: st.phase === 'over'
    };
  }

  g.Gather = {
    W: W, H: H,
    SEA_X0: SEA_X0, SEA_Y0: SEA_Y0, SEA_X1: SEA_X1, SEA_Y1: SEA_Y1,
    SHOP_X: SHOP_X, SHOP_Y: SHOP_Y, HOME_R0: HOME_R0, HOME_R_MAX: HOME_R_MAX,
    CONE_W: CONE_W, CONE_F: CONE_F,
    E_MAX: E_MAX, BUMP_E: BUMP_E, PENTA: PENTA, KIND: KIND, WAVES: WAVES, SEAT_CAP: SEAT_CAP,
    create: create, update: update, stats: stats,
    aimAt: aimAt, adjustAim: adjustAim, setFocus: setFocus,
    homeR: homeR, waveConf: waveConf, shadowed: shadowed, beam: beam,
    aliveCount: aliveCount
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
