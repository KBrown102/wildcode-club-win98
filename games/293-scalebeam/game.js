/* 秤星 · 悬衡谷 — 纯逻辑层（零 DOM / 零 Canvas，Node 可直接 require 冒烟） */
(function (g) {
  'use strict';

  var W = 480, H = 740;
  var PX = 240, PY = 252, HL = 168;          // 支点 / 秤杆半长
  var MAXTILT = 60 * Math.PI / 180;
  var GK = 215, I0 = 26000, DAMP = 21000, MW = 4.6;   // 力矩增益 / 杆自身转动惯量 / 阻尼 / 秤锤质量
  var BRAKE_MUL = 6.0, BRAKE_COST = 0.50;    // 镇秤：阻尼倍率 / 能耗
  var WP_SPEED = 215;                        // 秤锤滑动速度 px/s
  var TOL = 5.0 * Math.PI / 180;             // 光柱命中容差
  var STABLE_W = 0.30;                       // 充能要求的「稳」：角速度超过它就不进光
  var RECOVER_T = 1.15;
  var CHARGE_BASE = 1.15, MASS_GAIN = 0.115, MASS_GAIN_MAX = 2.3, DECAY = 0.34;
  var BRINE_Y = 664;
  var WALL_AX = 220, WALL_Y0 = 440, WALL_YD = 250;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* 谷壁曲线：u∈[-1,1]，u=0 谷底最深，u=±1 壁顶 */
  function wallPt(u) { return { x: PX + u * WALL_AX, y: WALL_Y0 + WALL_YD * (1 - u * u) }; }
  function wallAng(u) { return Math.atan2(u * WALL_AX, (WALL_Y0 + WALL_YD * (1 - u * u)) - PY); }
  var U_MAX_ANG = wallAng(1);
  function uForPhi(phi) {
    var s = phi < 0 ? -1 : 1, a = Math.abs(phi);
    if (a >= U_MAX_ANG) return s;
    var lo = 0, hi = 1, mid;
    for (var i = 0; i < 44; i++) { mid = (lo + hi) / 2; if (wallAng(mid) < a) lo = mid; else hi = mid; }
    return s * ((lo + hi) / 2);
  }
  function crystalPos(phi) { var u = uForPhi(phi); return wallPt(u); }

  /* ---------------- 关卡表 ---------------- */
  var LEVELS = [
    { name: '一秤 · 试星', n: 2, phi: 20, masses: [1, 2], quota: 10, interval: 2.8, speed: 158, slots: 2, spread: 62, unload: 3, par: [130, 232, 334] },
    { name: '二秤 · 侧谷', n: 3, phi: 27, masses: [1, 2, 3], quota: 12, interval: 2.5, speed: 172, slots: 3, spread: 100, unload: 3, par: [162, 290, 418] },
    { name: '三秤 · 沉辉', n: 3, phi: 34, masses: [1, 2, 3, 4], quota: 13, interval: 2.3, speed: 186, slots: 3, spread: 132, unload: 3, par: [162, 290, 418] },
    { name: '四秤 · 双悬', n: 4, phi: 40, masses: [1, 2, 3, 4], quota: 15, interval: 2.1, speed: 198, slots: 4, spread: 152, unload: 3, par: [195, 349, 503] },
    { name: '五秤 · 深壁', n: 5, phi: 45, masses: [1, 2, 3, 4, 5], quota: 17, interval: 1.95, speed: 208, slots: 4, spread: 176, unload: 3, par: [226, 404, 581] },
    { name: '六秤 · 长影', n: 5, phi: 48, masses: [2, 3, 4, 5], quota: 18, interval: 1.8, speed: 218, slots: 5, spread: 196, unload: 2, par: [199, 356, 512] },
    { name: '七秤 · 逆光', n: 6, phi: 50, masses: [2, 3, 4, 5], quota: 20, interval: 1.66, speed: 228, slots: 5, spread: 206, unload: 2, par: [217, 387, 557] },
    { name: '八秤 · 悬衡', n: 6, phi: 50, masses: [2, 3, 4, 5], quota: 21, interval: 1.52, speed: 238, slots: 5, spread: 214, unload: 2, par: [209, 374, 538] }
  ];

  var STAR_COL = ['#CFE9E4', '#9FD8CE', '#7FC3C6', '#A9B6E8', '#E8C87A'];

  function buildCrystals(L, rnd) {
    var n = L.n, lo = 12, hi = L.phi, cr = [];
    for (var i = 0; i < n; i++) {
      var mag = n === 1 ? hi : lo + (hi - lo) * i / (n - 1);
      var sgn = (i % 2 === 0) ? 1 : -1;
      var phi = sgn * mag * Math.PI / 180;
      var p = crystalPos(phi);
      cr.push({
        phi: phi, x: p.x, y: p.y, ch: 0, lit: false,
        sz: 18 + rnd() * 6, sp: [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28], cnt: 3 + ((rnd() * 3) | 0)
      });
    }
    return cr;
  }

  function buildQueue(L, rnd) {
    var slots = [], i;
    if (L.slots === 1) slots.push(PX);
    else for (i = 0; i < L.slots; i++) slots.push(PX - L.spread + (2 * L.spread) * i / (L.slots - 1));
    var q = [];
    for (i = 0; i < L.quota; i++) {
      var si = (rnd() * slots.length) | 0;
      var m = L.masses[(rnd() * L.masses.length) | 0];
      if (i === 0) m = L.masses[0];
      q.push({ x: slots[si], m: m, slot: si });
    }
    return { queue: q, slots: slots };
  }

  function newState(li, seed) {
    li = clamp(li | 0, 0, LEVELS.length - 1);
    var L = LEVELS[li];
    seed = (seed | 0) || 20260909;
    var rnd = mulberry32(seed * 7919 + li * 104729 + 12345);
    var bq = buildQueue(L, rnd);
    return {
      L: L, li: li, seed: seed,
      th: 0, w: 0, wp: 0, brake: false,
      loads: [], _id: 0,
      cr: buildCrystals(L, rnd),
      stars: [], queue: bq.queue, slots: bq.slots,
      spawned: 0, spawnT: 1.1, outT: 0,
      unloads: L.unload, energy: 1,
      tips: 0, recover: 0, tipFrom: 0,
      lit: 0, n: L.n,
      t: 0, phase: 'play', result: null, clearT: 0,
      events: [], sandbox: false
    };
  }

  /* 净力矩 / 转动惯量 / 梁上总质量 */
  function net(st) {
    var S = MW * st.wp, I = I0 + MW * st.wp * st.wp, M = 0;
    for (var i = 0; i < st.loads.length; i++) {
      var l = st.loads[i];
      S += l.m * l.s; I += l.m * l.s * l.s; M += l.m;
    }
    return { S: S, I: I, M: M };
  }
  function torqueFrac(st) { var n = net(st); return clamp(n.S / (MW * HL), -1, 1); }

  function massOf(loads) { var m = 0; for (var i = 0; i < loads.length; i++) m += loads[i].m; return m; }

  function stepPhysics(st, dt) {
    if (st.recover > 0) {                       // 倾覆后回正
      st.w += (-8.2 * st.th - 4.4 * st.w) * dt;
      st.th += st.w * dt;
      st.recover -= dt;
      if (st.recover <= 0) { st.th = 0; st.w = 0; st.recover = 0; }
      return;
    }
    var n = net(st);
    var dmp = DAMP * ((st.brake && st.energy > 0) ? BRAKE_MUL : 1);
    var acc = (n.S * Math.cos(st.th) * GK - dmp * st.w) / n.I;
    st.w += acc * dt;
    st.th += st.w * dt;
    if (st.th > MAXTILT) { st.th = MAXTILT; tip(st); }
    else if (st.th < -MAXTILT) { st.th = -MAXTILT; tip(st); }
  }

  function tip(st) {
    st.tips++;
    st.events.push({ t: 'tip', n: st.loads.length, side: st.th > 0 ? 1 : -1 });
    for (var i = 0; i < st.loads.length; i++) {
      var l = st.loads[i];
      st.events.push({ t: 'drop', s: l.s, m: l.m, x: PX + l.s * Math.cos(st.th), y: PY + l.s * Math.sin(st.th) });
    }
    st.loads.length = 0;
    st.tipFrom = st.th; st.recover = RECOVER_T; st.w = 0; st.wp = 0;   // 秤锤一并归位，给个干净的重新开始
  }

  function moveWeight(st, dir, dt) {
    if (st.phase !== 'play') return;
    if (!dir) return;
    st.wp = clamp(st.wp + dir * WP_SPEED * dt, -HL, HL);
  }
  function setBrake(st, on) { st.brake = !!on; }

  function unload(st) {
    if (st.phase !== 'play' || st.recover > 0) return false;
    if (st.unloads <= 0 || st.loads.length === 0) return false;
    var k = 0, bs = -1;
    for (var i = 0; i < st.loads.length; i++) { var a = Math.abs(st.loads[i].s); if (a > bs) { bs = a; k = i; } }
    var l = st.loads.splice(k, 1)[0];
    st.unloads--;
    st.events.push({ t: 'unload', s: l.s, m: l.m, x: PX + l.s * Math.cos(st.th), y: PY + l.s * Math.sin(st.th) });
    return true;
  }

  function makeResult(st, kind) {
    var remain = Math.max(0, st.L.quota - st.spawned);
    var score = st.lit * 100 + remain * 18 - st.tips * 15;
    if (st.lit >= st.n && st.tips === 0) score += 120;
    if (score < 0) score = 0;
    return {
      kind: kind, lit: st.lit, n: st.n, tips: st.tips, remain: remain,
      unloads: st.L.unload - st.unloads, time: st.t, score: score,
      stars: 0
    };
  }

  function update(st, dt) {
    if (!(dt > 0)) dt = 0;
    if (dt > 0.05) dt = 0.05;
    if (st.phase === 'end') return st;
    st.t += dt;
    var ev = st.events, i;

    if (st.phase === 'clear') {
      stepPhysics(st, dt);
      st.clearT -= dt;
      if (st.clearT <= 0) { st.phase = 'end'; st.result = makeResult(st, 'clear'); ev.push({ t: 'end', kind: 'clear' }); }
      return st;
    }

    if (st.brake && st.energy > 0) {
      st.energy -= BRAKE_COST * dt;
      if (st.energy <= 0) { st.energy = 0; st.brake = false; }
    }

    if (!st.sandbox) {
      if (st.spawned < st.L.quota) {
        st.spawnT -= dt;
        if (st.spawnT <= 0) {
          var q = st.queue[st.spawned++];
          st.stars.push({ x: q.x, y: -14, m: q.m, r: 5 + q.m * 1.6, vy: st.L.speed, ph: (st._id++) * 1.7 });
          st.spawnT = st.L.interval;
          ev.push({ t: 'spawn', x: q.x, m: q.m });
        }
      }
    }

    var cs = Math.cos(st.th), sn = Math.sin(st.th);
    for (i = st.stars.length - 1; i >= 0; i--) {
      var s0 = st.stars[i];
      s0.y += s0.vy * dt;
      var sa = (s0.x - PX) / cs;
      if (Math.abs(sa) <= HL) {
        var yh = PY + sa * sn;
        if (s0.y + s0.r * 0.45 >= yh) {
          st.loads.push({ s: sa, m: s0.m, r: s0.r, id: (++st._id) });
          ev.push({ t: 'land', s: sa, m: s0.m, x: PX + sa * cs, y: yh });
          st.stars.splice(i, 1);
          continue;
        }
      }
      if (s0.y > BRINE_Y) { ev.push({ t: 'miss', x: s0.x, m: s0.m }); st.stars.splice(i, 1); }
    }

    stepPhysics(st, dt);

    /* 照射充能 */
    var gain = Math.min(MASS_GAIN_MAX, 1 + massOf(st.loads) * MASS_GAIN);
    var add = gain / CHARGE_BASE;
    var best = -1, bd = 1e9;
    for (i = 0; i < st.cr.length; i++) {
      if (st.cr[i].lit) continue;
      var d = Math.abs(st.th - st.cr[i].phi);
      if (d < bd) { bd = d; best = i; }
    }
    var hold = (best >= 0 && bd < TOL && st.recover <= 0) ? best : -1;
    if (hold >= 0) {
      var c = st.cr[hold];
      var prev = c.ch;
      var steady = clamp(1 - Math.abs(st.w) / STABLE_W, 0, 1);   // 晃着照不进光
      c.ch = Math.min(1, c.ch + add * steady * dt);
      if (c.ch >= 1 && prev < 1) {
        c.lit = true; st.lit++; st.energy = 1;
        ev.push({ t: 'lit', i: hold, x: c.x, y: c.y, n: st.lit });
        if (st.lit >= st.n) { st.phase = 'clear'; st.clearT = 1.05; }
      }
    }
    for (i = 0; i < st.cr.length; i++) {          // 光没照住的，都在退
      if (!st.cr[i].lit && i !== hold) st.cr[i].ch = Math.max(0, st.cr[i].ch - DECAY * dt);
    }

    if (!st.sandbox && st.spawned >= st.L.quota && st.stars.length === 0) {
      st.outT += dt;
      if (st.outT > 2.6) { st.phase = 'end'; st.result = makeResult(st, 'out'); ev.push({ t: 'end', kind: 'out' }); }
    }
    return st;
  }

  function starsOf(li, r) {
    var p = LEVELS[clamp(li | 0, 0, LEVELS.length - 1)].par;
    if (r.score >= p[2]) return 3;
    if (r.score >= p[1]) return 2;
    if (r.score >= p[0]) return 1;
    return 0;
  }

  g.ScaleBeam = {
    W: W, H: H, PX: PX, PY: PY, HL: HL, MAXTILT: MAXTILT, MW: MW,
    BRINE_Y: BRINE_Y, TOL: TOL, LEVELS: LEVELS, STAR_COL: STAR_COL,
    WALL_AX: WALL_AX, WALL_Y0: WALL_Y0, WALL_YD: WALL_YD,
    wallPt: wallPt, crystalPos: crystalPos,
    newState: newState, update: update,
    moveWeight: moveWeight, setBrake: setBrake, unload: unload,
    net: net, torqueFrac: torqueFrac, massOf: massOf,
    starsOf: starsOf, makeResult: makeResult
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
