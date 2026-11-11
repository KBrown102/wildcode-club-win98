/* 292-mistferry《雾江 · 无刹渡》 — 纯逻辑层：零 DOM / 零 Canvas，Node 可直接 require 冒烟 */
(function (g) {
  'use strict';

  var W = 600, H = 760;

  var P = {
    W: W, H: H,
    BOAT_R: 9,
    YAW: 0.44,          // 单桨转向 ~25°
    IMP: 118,           // 单桨冲量
    IMP2: 250,          // 双桨（耗 2）
    IMPR: 100,          // 反桨（耗 2）
    DRAG: 1.35,         // 开放水面阻力系数（指数）
    DRAG_EDDY: 4.6,     // 洄湾阻力
    EDDY_FLOW: 0.08,    // 洄湾水流衰减
    V_LAND: 46,         // 靠岸速度上限
    DOCK_R: 40,         // 靠岸判定半径
    BUMP_CD: 0.42,
    BUMP_COST: 1,
    STROKE_CD: 0.26,        // 划桨节奏：连点无效，逼出「何时收桨」
    LAND_GAIN: 5,       // 靠岸返还桨力（充电宝）
    REVEAL_R: 92,       // 舟周围常显半径
    RIPPLE_MAX: 300,    // 桨声涟漪最大半径
    RIPPLE_SPD: 340,
    REFOG: 0.003,       // 雾层每帧回涌
    VOID_R: 46,         // 漩涡核心半径（进入扣桨力）
    EXHAUST_T: 2.5,     // 力竭后漂流时间
    OUT_Y: H + 70
  };

  var LEVELS = [
    { name: '一渡 · 试水', docks: 2, power: 30, rocks: 0, vort: 0, spring: 0, flow: 28, hwr: 1.00 },
    { name: '二渡 · 回湾', docks: 3, power: 42, rocks: 0, vort: 0, spring: 0, flow: 31, hwr: 0.97 },
    { name: '三渡 · 暗礁', docks: 3, power: 42, rocks: 2, vort: 0, spring: 0, flow: 33, hwr: 0.95 },
    { name: '四渡 · 涡心', docks: 3, power: 40, rocks: 1, vort: 2, spring: 0, flow: 35, hwr: 0.94 },
    { name: '五渡 · 石乱', docks: 4, power: 52, rocks: 3, vort: 2, spring: 0, flow: 37, hwr: 0.92 },
    { name: '六渡 · 泉涌', docks: 4, power: 50, rocks: 2, vort: 2, spring: 2, flow: 39, hwr: 0.90 },
    { name: '七渡 · 峡江', docks: 5, power: 62, rocks: 3, vort: 3, spring: 2, flow: 42, hwr: 0.88 },
    { name: '八渡 · 雾锁', docks: 5, power: 58, rocks: 4, vort: 3, spring: 2, flow: 45, hwr: 0.86 }
  ];

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function angNorm(a) { while (a > Math.PI) a -= 6.283185307179586; while (a < -Math.PI) a += 6.283185307179586; return a; }
  function angDiff(a, b) { return angNorm(a - b); }

  // ---------- 关卡生成（固定种子，可复盘） ----------
  function genLevel(li, seed) {
    var L0 = LEVELS[li];
    var R = mulberry32(((seed | 0) * 7919 + li * 104729 + 20260908) | 0);
    var N = 100, step = H / (N - 1);
    var cx = new Float64Array(N), hw = new Float64Array(N);
    var amp = 58 + R() * 34 + li * 3;
    var p1 = R() * 6.2832, p2 = R() * 6.2832, p3 = R() * 6.2832;
    var baseHW = 118 * L0.hwr;

    for (var i = 0; i < N; i++) {
      var t = i / (N - 1);
      cx[i] = W / 2 + amp * Math.sin(t * 3.05 + p1) + amp * 0.42 * Math.sin(t * 6.6 + p2);
      hw[i] = baseHW + 26 * Math.sin(t * 4.4 + p3) + 12 * Math.sin(t * 9.1 + p1 * 1.7);
    }
    // 平滑 hw，避免过窄卡死
    for (var s = 0; s < 2; s++) {
      var cp = hw.slice();
      for (var j = 1; j < N - 1; j++) hw[j] = (cp[j - 1] + cp[j] * 2 + cp[j + 1]) / 4;
    }
    var minHW = 64;
    for (var k = 0; k < N; k++) if (hw[k] < minHW) hw[k] = minHW;

    var L = { li: li, name: L0.name, N: N, step: step, cx: cx, hw: hw, flow: L0.flow, power: L0.power,
              coves: [], docks: [], rocks: [], vort: [], spring: [] };

    // 洄湾 + 渡口：分层定点（保证数量恒定，可复盘）
    var ys = [];
    for (var di = 0; di < L0.docks; di++) {
      var frac = (di + 0.5 + (R() * 0.5 - 0.25)) / L0.docks;
      ys.push(H * (0.10 + 0.82 * frac));
    }
    ys.sort(function (a, b) { return a - b; });
    for (var d = 0; d < ys.length; d++) {
      var cy = ys[d];
      var side = (d % 2 === 0) ? -1 : 1;
      if (R() < 0.25) side = -side;
      var depth = 76 + R() * 26;
      var hh = 64 + R() * 22;
      L.coves.push({ y: cy, side: side, depth: depth, hh: hh });
      var li2 = limitsAt(L, cy);
      var outerX = side < 0 ? li2.lx : li2.rx;
      L.docks.push({
        id: d, x: outerX - side * 30, y: cy, side: side,
        note: [0, 2, 4, 7, 9, 11, 12, 14][d % 8], done: false, landed: 0
      });
    }

    function farFromDocks(x, y, m) {
      for (var a = 0; a < L.docks.length; a++) {
        var dx = L.docks[a].x - x, dy = L.docks[a].y - y;
        if (dx * dx + dy * dy < m * m) return false;
      }
      return true;
    }
    function inChannel(x, y, pad) {
      var s2 = limitsAt(L, y);
      return x > s2.lx + pad && x < s2.rx - pad;
    }

    // 障碍投放：约束逐级放宽，保证数量恒定（否则关卡会缺件、难度失控）
    function place(want, opts) {
      var out = [], relax = [1, 0.82, 0.64, 0.46, 0.3];
      for (var rl = 0; rl < relax.length && out.length < want; rl++) {
        var dd = opts.dockDist * relax[rl], sd = opts.sep * relax[rl];
        for (var t = 0; t < 260 && out.length < want; t++) {
          var c = opts.mk(R);
          if (!c) continue;
          if (!farFromDocks(c.x, c.y, dd)) continue;
          if (!inChannel(c.x, c.y, opts.pad + (c.r || 0))) continue;
          var bad = false;
          for (var i = 0; i < out.length; i++) {
            var need = sd + (opts.useR ? (out[i].r + c.r) : 0);
            if (Math.hypot(out[i].x - c.x, out[i].y - c.y) < need) { bad = true; break; }
          }
          if (bad) continue;
          c.id = out.length; out.push(c);
        }
      }
      return out;
    }

    L.rocks = place(L0.rocks, {
      dockDist: 92, sep: 56, pad: 24, useR: true,
      mk: function (R) {
        var ry = H * (0.10 + 0.80 * R());
        var s3 = limitsAt(L, ry);
        return { x: s3.cx + (R() * 2 - 1) * s3.hw * 0.52, y: ry, r: 15 + R() * 8, kind: 'rock' };
      }
    });
    L.vort = place(L0.vort, {
      dockDist: 96, sep: 190, pad: 30, useR: false,
      mk: function (R) {
        var vy = H * (0.10 + 0.80 * R());
        var s4 = limitsAt(L, vy);
        return { x: s4.cx + (R() * 2 - 1) * s4.hw * 0.45, y: vy, r: 62 + R() * 26, s: 34 + R() * 16, kind: 'vort' };
      }
    });
    L.spring = place(L0.spring, {
      dockDist: 96, sep: 200, pad: 30, useR: false,
      mk: function (R) {
        var py = H * (0.10 + 0.80 * R());
        var s5 = limitsAt(L, py);
        return { x: s5.cx + (R() * 2 - 1) * s5.hw * 0.5, y: py, r: 74 + R() * 22, s: 40 + R() * 14, kind: 'spring' };
      }
    });
    return L;
  }

  function limitsAt(L, y) {
    var t = y / L.step;
    var i = Math.floor(t);
    if (i < 0) i = 0; if (i > L.N - 2) i = L.N - 2;
    var f = clamp(t - i, 0, 1);
    var cx = L.cx[i] + (L.cx[i + 1] - L.cx[i]) * f;
    var hw = L.hw[i] + (L.hw[i + 1] - L.hw[i]) * f;
    var lx = cx - hw, rx = cx + hw, eddy = 0;
    for (var c = 0; c < L.coves.length; c++) {
      var cv = L.coves[c];
      var dd = (y - cv.y) / cv.hh;
      var b = Math.exp(-2 * dd * dd);
      if (cv.side < 0) lx -= cv.depth * b; else rx += cv.depth * b;
      if (b > eddy) eddy = b;
    }
    return { cx: cx, hw: hw, lx: lx, rx: rx, eddy: eddy };
  }

  // 是否在洄湾内（越过基础岸线、且处于洄湾纵向影响范围）
  function eddyAt(L, x, y) {
    var s = limitsAt(L, y);
    for (var c = 0; c < L.coves.length; c++) {
      var cv = L.coves[c];
      var dd = (y - cv.y) / cv.hh;
      var b = Math.exp(-2 * dd * dd);
      if (b < 0.30) continue;
      if (cv.side < 0 && x < s.lx + cv.depth * b + 6) return b;
      if (cv.side > 0 && x > s.rx - cv.depth * b - 6) return b;
    }
    return 0;
  }

  var _cur = { x: 0, y: 0 };
  function currentAt(L, x, y) {
    var s = limitsAt(L, y);
    var y2 = Math.min(H - 1, y + 7);
    var s2 = limitsAt(L, y2);
    var tx = s2.cx - s.cx, ty = y2 - y;
    var m = Math.hypot(tx, ty) || 1;
    tx /= m; ty /= m;
    var vx = tx * L.flow, vy = ty * L.flow;
    var eb = eddyAt(L, x, y);
    var k = eb > 0 ? (P.EDDY_FLOW + (1 - eb) * (1 - P.EDDY_FLOW)) : 1;
    vx *= k; vy *= k;

    // 洄吸：越靠近洄湾一侧，横向水势越往湾里带（江自己会带你过去，但你也可以挣开）
    for (var ci = 0; ci < L.coves.length; ci++) {
      var cv = L.coves[ci];
      var cd = (y - cv.y) / cv.hh;
      var cb = Math.exp(-2 * cd * cd);
      if (cb < 0.14) continue;
      var w = clamp((cv.side < 0 ? (s.cx - x) : (x - s.cx)) / s.hw, 0, 1);
      vx += cv.side * 20 * cb * w * w;
    }
    var i, dx, dy2, d, u;
    for (i = 0; i < L.vort.length; i++) {
      var v = L.vort[i];
      dx = x - v.x; dy2 = y - v.y; d = Math.hypot(dx, dy2);
      if (d < v.r && d > 0.5) {
        u = v.s * (1 - d / v.r);
        vx += (-dx / d) * u + (-dy2 / d) * u * 0.78;
        vy += (-dy2 / d) * u + (dx / d) * u * 0.78;
      }
    }
    for (i = 0; i < L.spring.length; i++) {
      var sp = L.spring[i];
      dx = x - sp.x; dy2 = y - sp.y; d = Math.hypot(dx, dy2);
      if (d < sp.r && d > 0.5) {
        u = sp.s * (1 - d / sp.r);
        vx += (dx / d) * u; vy += (dy2 / d) * u;
      }
    }
    _cur.x = vx; _cur.y = vy;
    return _cur;
  }

  // ---------- 状态 ----------
  function newState(li, seed) {
    var L = genLevel(li, seed);
    var s0 = limitsAt(L, 26);
    var st = {
      L: L, li: li, seed: seed,
      x: s0.cx, y: 30,
      vx: 0, vy: 0,
      h: Math.PI / 2,          // 船头朝下（顺流）
      power: L.power, maxPower: L.power,
      score: 0, landed: 0, total: L.docks.length,
      softest: 0, softSum: 0,  // 最慢那一靠 / 累计柔和度
      strokes: 0, bumps: 0,
      t: 0, bumpCd: 0, strokeCd: 0, exhaust: -1,
      phase: 'play', endKind: '',
      ripples: [], seen: {}, events: [],
      wake: []
    };
    return st;
  }

  function ev(st, o) { st.events.push(o); }

  function canPaddle(st, cost) { return st.phase === 'play' && st.power >= cost; }

  function emitRipple(st, x, y) {
    st.ripples.push({ x: x, y: y, r: 18, max: P.RIPPLE_MAX, alive: true });
    if (st.ripples.length > 14) st.ripples.shift();
  }

  // 四个动词：左桨 / 右桨 / 双桨 / 反桨
  function paddle(st, kind) {
    if (st.phase !== 'play') return false;
    var cost = (kind === 'L' || kind === 'R') ? 1 : 2;
    if (st.strokeCd > 0) { ev(st, { t: 'cd' }); return false; }
    if (st.power < cost) { ev(st, { t: 'nopower' }); return false; }
    st.strokeCd = P.STROKE_CD;
    st.power -= cost; st.strokes++;
    if (kind === 'L') { st.h += P.YAW; impulse(st, P.IMP); }
    else if (kind === 'R') { st.h -= P.YAW; impulse(st, P.IMP); }
    else if (kind === 'B') { impulse(st, P.IMP2); }
    else { impulse(st, -P.IMPR); }
    st.h = angNorm(st.h);
    emitRipple(st, st.x, st.y);
    ev(st, { t: 'paddle', kind: kind, x: st.x, y: st.y });
    return true;
  }

  function impulse(st, mag) {
    st.vx += Math.cos(st.h) * mag;
    st.vy += Math.sin(st.h) * mag;
  }

  function revealAround(st, x, y, r) {
    var L = st.L, i;
    var r2 = r * r;
    for (i = 0; i < L.rocks.length; i++) {
      var a = L.rocks[i]; if (st.seen['r' + i]) continue;
      if ((a.x - x) * (a.x - x) + (a.y - y) * (a.y - y) < r2) st.seen['r' + i] = 1;
    }
    for (i = 0; i < L.vort.length; i++) {
      var b = L.vort[i]; if (st.seen['v' + i]) continue;
      if ((b.x - x) * (b.x - x) + (b.y - y) * (b.y - y) < r2) st.seen['v' + i] = 1;
    }
    for (i = 0; i < L.spring.length; i++) {
      var c = L.spring[i]; if (st.seen['s' + i]) continue;
      if ((c.x - x) * (c.x - x) + (c.y - y) * (c.y - y) < r2) st.seen['s' + i] = 1;
    }
  }

  function settle(st, kind) {
    if (st.phase !== 'play') return;
    st.phase = 'end'; st.endKind = kind;
    // 剩余桨力奖励只在「渡完」时兑现 —— 不操作刷不了分
    var bonus = (kind === 'clear') ? st.power * 30 : 0;
    var pen = st.bumps * 10;
    st.score += bonus - pen;
    if (st.score < 0) st.score = 0;
    var res = {
      kind: kind, landed: st.landed, total: st.total, score: st.score,
      softest: st.softest, softAvg: st.landed > 0 ? st.softSum / st.landed : 0,
      power: st.power, maxPower: st.maxPower, strokes: st.strokes,
      bumps: st.bumps, bonus: bonus, pen: pen
    };
    st.result = res;
    ev(st, { t: 'end', kind: kind });
  }

  function update(st, dt) {
    if (!(dt > 0)) dt = 0;
    if (dt > 0.05) dt = 0.05;
    if (st.phase !== 'play') return st;
    st.t += dt;
    if (st.bumpCd > 0) st.bumpCd -= dt;
    if (st.strokeCd > 0) st.strokeCd -= dt;

    var L = st.L;
    var c = currentAt(L, st.x, st.y);
    var eb = eddyAt(L, st.x, st.y);
    var k = eb > 0 ? (P.DRAG + (P.DRAG_EDDY - P.DRAG) * eb) : P.DRAG;

    // 相对水的速度衰减
    var vrx = st.vx - c.x, vry = st.vy - c.y;
    var f = Math.exp(-k * dt);
    vrx *= f; vry *= f;
    st.vx = vrx + c.x; st.vy = vry + c.y;

    st.x += st.vx * dt;
    st.y += st.vy * dt;

    // 尾迹
    st.wake.push({ x: st.x, y: st.y, a: 1 });
    if (st.wake.length > 46) st.wake.shift();
    for (var w = 0; w < st.wake.length; w++) st.wake[w].a -= dt * 1.15;

    // 涟漪推进 + 揭示
    for (var i = st.ripples.length - 1; i >= 0; i--) {
      var rp = st.ripples[i];
      rp.r += P.RIPPLE_SPD * dt;
      revealAround(st, rp.x, rp.y, rp.r);
      if (rp.r >= rp.max) st.ripples.splice(i, 1);
    }
    revealAround(st, st.x, st.y, P.REVEAL_R);

    // 岸线碰撞
    var s = limitsAt(L, st.y);
    var r = P.BOAT_R;
    if (st.x < s.lx + r) {
      st.x = s.lx + r;
      if (st.vx < 0) st.vx = -st.vx * 0.34;
      if (st.bumpCd <= 0) { st.bumpCd = P.BUMP_CD; st.bumps++; if (st.power > 0) st.power -= P.BUMP_COST; ev(st, { t: 'bump', x: st.x, y: st.y, what: 'bank' }); }
    } else if (st.x > s.rx - r) {
      st.x = s.rx - r;
      if (st.vx > 0) st.vx = -st.vx * 0.34;
      if (st.bumpCd <= 0) { st.bumpCd = P.BUMP_CD; st.bumps++; if (st.power > 0) st.power -= P.BUMP_COST; ev(st, { t: 'bump', x: st.x, y: st.y, what: 'bank' }); }
    }
    if (st.y < r) { st.y = r; if (st.vy < 0) st.vy = -st.vy * 0.34; }
    if (st.y > H - r) { st.y = H - r; if (st.vy > 0) st.vy = 0; }

    // 礁石碰撞
    for (var a = 0; a < L.rocks.length; a++) {
      var rk = L.rocks[a];
      var dx = st.x - rk.x, dy = st.y - rk.y;
      var d = Math.hypot(dx, dy) || 0.001;
      var need = rk.r + r;
      if (d < need) {
        var nx = dx / d, ny = dy / d;
        st.x = rk.x + nx * need; st.y = rk.y + ny * need;
        var vn = st.vx * nx + st.vy * ny;
        if (vn < 0) { st.vx -= 1.34 * vn * nx; st.vy -= 1.34 * vn * ny; }
        if (st.bumpCd <= 0) { st.bumpCd = P.BUMP_CD; st.bumps++; if (st.power > 0) st.power -= P.BUMP_COST; ev(st, { t: 'bump', x: st.x, y: st.y, what: 'rock' }); }
      }
    }

    // 漩涡核心：穿越扣桨力（不致命）
    for (var b2 = 0; b2 < L.vort.length; b2++) {
      var vv = L.vort[b2];
      var ddx = st.x - vv.x, ddy = st.y - vv.y;
      var dd = Math.hypot(ddx, ddy);
      if (dd < P.VOID_R) {
        if (!vv._in) {
          vv._in = true;
          if (st.power > 0) st.power -= 1;
          ev(st, { t: 'vortex', x: vv.x, y: vv.y });
        }
      } else if (dd > P.VOID_R * 1.35) vv._in = false;
    }

    // 靠岸判定
    var speed = Math.hypot(st.vx, st.vy);
    for (var d2 = 0; d2 < L.docks.length; d2++) {
      var dk = L.docks[d2];
      if (dk.done) continue;
      var ex = st.x - dk.x, ey = st.y - dk.y;
      var ed = Math.hypot(ex, ey);
      if (ed > P.DOCK_R) continue;
      if (speed < P.V_LAND) {
        dk.done = true;
        st.landed++;
        var ratio = 1 - speed / P.V_LAND;          // 越慢越高
        st.softSum += ratio;
        if (ratio > st.softest) st.softest = ratio;
        var gain = Math.round(100 + ratio * 150);
        st.score += gain;
        st.power += P.LAND_GAIN;
        emitRipple(st, dk.x, dk.y);
        ev(st, { t: 'land', x: dk.x, y: dk.y, gain: gain, note: dk.note, idx: d2, ratio: ratio });
      } else {
        // 太快：不弹飞（弹飞会把人甩出洄湾、陷入死循环），只刹一档 + 扣桨力 + 明确反馈
        st.vx *= 0.74; st.vy *= 0.74;
        if (st.bumpCd <= 0) {
          st.bumpCd = P.BUMP_CD; st.bumps++;
          if (st.power > 0) st.power -= P.BUMP_COST;
          ev(st, { t: 'fast', x: dk.x, y: dk.y, v: speed });
        }
      }
    }

    // 结束判定
    if (st.landed >= st.total) { settle(st, 'clear'); return st; }
    if (st.power <= 0) {
      if (st.exhaust < 0) st.exhaust = 0;
      st.exhaust += dt;
      if (st.exhaust > P.EXHAUST_T) { settle(st, 'exhaust'); return st; }
    }
    if (st.y > H - P.BOAT_R - 1 && st.vy >= 0) {
      st._out = (st._out || 0) + dt;
      if (st._out > 1.6) { settle(st, 'down'); return st; }
    } else st._out = 0;

    return st;
  }

  function quality(li, res) {
    return res.softAvg * 0.55 + clamp(res.power / res.maxPower, 0, 1.3) * 0.45;
  }
  // 阈值按 AI 实测标定（8 关 × 6 种子 × 4 档收桨激进度）：
  //   乱划 q≈0.1 / 会收桨 q 0.37–0.51（2 星）/ 耐心且会省桨 q 0.56–0.60（3 星）
  //   过犹不及：收桨过早（k=0.5）船根本到不了渡口，通关率掉到 1–2/6 —— 耐心是有上限的
  function stars(li, res) {
    if (!(res.landed >= res.total)) return res.landed > 0 ? 1 : 0;
    var q = quality(li, res);
    if (q >= 0.56) return 3;
    if (q >= 0.44) return 2;
    return 1;
  }

  var API = {
    W: W, H: H, P: P, LEVELS: LEVELS,
    mulberry32: mulberry32, clamp: clamp, angNorm: angNorm, angDiff: angDiff,
    genLevel: genLevel, limitsAt: limitsAt, eddyAt: eddyAt, currentAt: currentAt,
    newState: newState, update: update, paddle: paddle, settle: settle, stars: stars, quality: quality
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  g.MistFerry = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
