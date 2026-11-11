/* 296-chalkflow《粉线 · 引珠坡》— 纯逻辑层（无 DOM，可 Node require） */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CHALK = factory();
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  var BASE_W = 560;

  /* ---------- 物理常量 ---------- */
  var G = 1050;      // 重力 px/s^2
  var BR = 7;        // 弹珠半径
  var SR = 3.2;      // 粉笔线半宽
  var REST = 0.20;   // 法向恢复
  var FRIC = 1.7;    // 切向摩擦（每秒衰减系数）
  var AIR = 0.22;    // 空气阻尼
  var VMAX = 1250;
  var WEAR = 0.0125; // 磨损系数：球沿线段每滑过 1px 磨掉 1/80 的 hp（滑动距离型磨损）
  var SUB = 5;       // 子步
  var IDLE_MAX = 2.4;

  var BIN_H = 64, BIN_PAD = 26;
  var SAMPLE_MIN = 9, STROKE_MIN = 14;
  var MAX_FIELD = 12;

  var COLORS = ['#F7F3E8', '#C4553B', '#3E6B8F', '#E0A93B', '#6E8B5B'];

  /* ---------- 关卡（归一化：x 相对 W，y 相对 H） ---------- */
  var LEVELS = [
    { nx: 0.22, bins: [{ nx: 0.60, nw: 0.19, val: 3 }], rocks: [], N: 12, T: 1.9, chalk: 2.4 },
    { nx: 0.47, bins: [{ nx: 0.06, nw: 0.19, val: 2 }, { nx: 0.72, nw: 0.19, val: 5 }], rocks: [], N: 14, T: 1.8, chalk: 2.3 },
    { nx: 0.50, bins: [{ nx: 0.05, nw: 0.19, val: 2 }, { nx: 0.74, nw: 0.19, val: 6 }], rocks: [{ nx: 0.255, ny: 0.686, nr: 0.075 }], N: 15, T: 1.7, chalk: 2.2 },
    { nx: 0.20, bins: [{ nx: 0.40, nw: 0.18, val: 3 }, { nx: 0.75, nw: 0.19, val: 6 }], rocks: [{ nx: 0.378, ny: 0.586, nr: 0.065 }, { nx: 0.912, ny: 0.614, nr: 0.07 }], N: 17, T: 1.6, chalk: 2.1 },
    { nx: 0.80, bins: [{ nx: 0.02, nw: 0.16, val: 8 }, { nx: 0.32, nw: 0.19, val: 5 }, { nx: 0.60, nw: 0.17, val: 3 }], rocks: [{ nx: 0.107, ny: 0.522, nr: 0.07 }, { nx: 0.701, ny: 0.638, nr: 0.055 }], N: 18, T: 1.5, chalk: 1.9 },
    { nx: 0.32, bins: [{ nx: 0.05, nw: 0.17, val: 2 }, { nx: 0.36, nw: 0.19, val: 5 }, { nx: 0.72, nw: 0.20, val: 8 }], rocks: [{ nx: 0.147, ny: 0.633, nr: 0.06 }, { nx: 0.640, ny: 0.421, nr: 0.075 }, { nx: 0.785, ny: 0.283, nr: 0.05 }], N: 20, T: 1.45, chalk: 1.9 },
    { nx: 0.34, bins: [{ nx: 0.04, nw: 0.17, val: 3 }, { nx: 0.44, nw: 0.18, val: 6 }, { nx: 0.80, nw: 0.18, val: 8 }], rocks: [{ nx: 0.196, ny: 0.380, nr: 0.055 }, { nx: 0.525, ny: 0.684, nr: 0.07 }, { nx: 0.711, ny: 0.385, nr: 0.06 }], N: 21, T: 1.35, chalk: 1.8 },
    { nx: 0.20, bins: [{ nx: 0.02, nw: 0.13, val: 4 }, { nx: 0.30, nw: 0.17, val: 2 }, { nx: 0.56, nw: 0.18, val: 5 }, { nx: 0.82, nw: 0.16, val: 8 }], rocks: [{ nx: 0.081, ny: 0.310, nr: 0.06 }, { nx: 0.435, ny: 0.607, nr: 0.07 }, { nx: 0.583, ny: 0.320, nr: 0.065 }, { nx: 0.773, ny: 0.241, nr: 0.05 }], N: 24, T: 1.2, chalk: 1.8 }
  ];

  /* 每关三星阈值（由 AI 实测标定，见 smoke.cjs） */
  var STARS = [
    [13, 20, 27], [26, 42, 56], [31, 49, 66], [37, 60, 80],
    [58, 92, 124], [63, 101, 136], [65, 103, 139], [75, 120, 162]
  ];

  /* 三星阈值 = 理论满分（N × 最高桶分值）的固定比例 → 与设备高度无关，公平可比 */
  var STAR_F = [0.35, 0.58, 0.78];
  function starThresholds(st) {
    var mx = 0;
    for (var i = 0; i < st.bins.length; i++) mx = Math.max(mx, st.bins[i].val);
    var M = st.N * mx;
    return [Math.round(STAR_F[0] * M), Math.round(STAR_F[1] * M), Math.round(STAR_F[2] * M)];
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* ---------- 建关 ---------- */
  function makeLevel(idx, seed, H) {
    H = H || 760;
    var cfg = LEVELS[idx];
    var rnd = mulberry32((seed >>> 0) * 7919 + idx * 104729 + 20260910);
    var W = BASE_W;
    var st = {
      lv: idx, seed: seed, W: W, H: H, cfg: cfg,
      funnel: { x: cfg.nx * W, y: 0.09 * H },
      bins: [], rocks: [], balls: [], strokes: [], segs: [],
      color: 0,
      chalk: cfg.chalk * W, chalkMax: cfg.chalk * W,
      toSpawn: cfg.N, spawned: 0, N: cfg.N, interval: cfg.T,
      spawnTimer: 1.8,
      score: 0, caught: 0, lost: 0, time: 0,
      done: false, events: [], dirty: false, nextId: 1
    };
    for (var i = 0; i < cfg.bins.length; i++) {
      var b = cfg.bins[i];
      var bw = b.nw * W, bx = b.nx * W;
      st.bins.push({
        x: bx, w: bw, h: BIN_H, y: H - BIN_PAD - BIN_H,
        val: b.val, cx: bx + bw / 2, count: 0, flash: 0,
        tint: b.val >= 8 ? '#B0763A' : (b.val >= 5 ? '#8A6A3E' : '#6B6A5E')
      });
    }
    for (var k = 0; k < cfg.rocks.length; k++) {
      var r = cfg.rocks[k];
      var rr = r.nr * W;
      var pts = [], n = 9;
      for (var p = 0; p < n; p++) {
        var ang = p / n * Math.PI * 2;
        pts.push({ a: ang, m: 0.86 + rnd() * 0.28 });
      }
      st.rocks.push({ x: r.nx * W, y: r.ny * H, r: rr, pts: pts, seedk: rnd() });
    }
    return st;
  }

  /* ---------- 画线 / 擦线 ---------- */
  function strokeLength(pts) {
    var L = 0;
    for (var i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    return L;
  }

  function buildSegs(st) {
    st.segs.length = 0;
    for (var i = 0; i < st.strokes.length; i++) {
      var s = st.strokes[i];
      for (var j = 0; j < s.segs.length; j++) {
        var g = s.segs[j];
        st.segs.push(g);
      }
    }
  }

  function inRock(st, x, y, pad) {
    pad = pad == null ? SR : pad;
    for (var i = 0; i < st.rocks.length; i++) {
      var r = st.rocks[i];
      if (Math.hypot(x - r.x, y - r.y) < r.r + pad) return true;
    }
    return false;
  }

  function addStroke(st, pts, color) {
    if (!pts || pts.length < 2) return { ok: false, reason: 'short' };
    // 粉笔过不了墨石：起点在石头里直接拒绝，途中撞到石头就地截断
    if (inRock(st, pts[0].x, pts[0].y)) { st.events.push({ t: 'deny', x: pts[0].x, y: pts[0].y }); return { ok: false, reason: 'rock' }; }
    var cut = [pts[0]], blocked = false;
    for (var q = 1; q < pts.length; q++) {
      if (inRock(st, pts[q].x, pts[q].y)) { blocked = true; break; }
      cut.push(pts[q]);
    }
    pts = cut;
    if (blocked && pts.length < 2) { st.events.push({ t: 'deny', x: pts[0].x, y: pts[0].y, rock: 1 }); return { ok: false, reason: 'rock' }; }
    var len = strokeLength(pts);
    if (len < STROKE_MIN) return { ok: false, reason: 'short' };
    if (len > st.chalk) {
      // 粉笔不够：截断到能画的长度
      var acc = 0, cut = [pts[0]];
      for (var i = 1; i < pts.length; i++) {
        var d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        if (acc + d > st.chalk) break;
        acc += d; cut.push(pts[i]);
      }
      if (cut.length < 2) { st.events.push({ t: 'deny', x: pts[0].x, y: pts[0].y }); return { ok: false, reason: 'chalk' }; }
      pts = cut; len = acc;
      st.events.push({ t: 'deny', x: pts[pts.length - 1].x, y: pts[pts.length - 1].y });
    }
    var segs = [];
    for (var k = 1; k < pts.length; k++) {
      var a = pts[k - 1], b = pts[k];
      segs.push({
        ax: a.x, ay: a.y, bx: b.x, by: b.y, hp: 1, dead: 0, si: st.strokes.length,
        minx: Math.min(a.x, b.x) - SR, maxx: Math.max(a.x, b.x) + SR,
        miny: Math.min(a.y, b.y) - SR, maxy: Math.max(a.y, b.y) + SR
      });
    }
    var stroke = { id: st.nextId++, color: color == null ? st.color : color, pts: pts.slice(), segs: segs, len: len };
    st.strokes.push(stroke);
    st.chalk -= len;
    buildSegs(st);
    st.events.push({ t: 'draw', x: pts[0].x, y: pts[0].y, len: len });
    return { ok: true, id: stroke.id, len: len };
  }

  function strokeAt(st, x, y, tol) {
    tol = tol || 15;
    var best = null, bd = tol;
    for (var i = 0; i < st.segs.length; i++) {
      var g = st.segs[i];
      if (g.dead) continue;
      var dx = g.bx - g.ax, dy = g.by - g.ay, L2 = dx * dx + dy * dy;
      var t = L2 < 1e-9 ? 0 : ((x - g.ax) * dx + (y - g.ay) * dy) / L2;
      t = t < 0 ? 0 : (t > 1 ? 1 : t);
      var d = Math.hypot(x - (g.ax + t * dx), y - (g.ay + t * dy));
      if (d < bd) { bd = d; best = g.si; }
    }
    return best;
  }

  function eraseStroke(st, id) {
    for (var i = 0; i < st.strokes.length; i++) {
      if (st.strokes[i].id === id) {
        var s = st.strokes[i];
        st.chalk = Math.min(st.chalkMax, st.chalk + s.len * 0.6);
        st.events.push({ t: 'erase', x: s.pts[0].x, y: s.pts[0].y });
        st.strokes.splice(i, 1);
        reindex(st); buildSegs(st);
        return true;
      }
    }
    return false;
  }

  function eraseAt(st, x, y) {
    var si = strokeAt(st, x, y, 15);
    if (si == null) return false;
    return eraseStroke(st, st.strokes[si].id);
  }

  function clearStrokes(st) {
    if (!st.strokes.length) return false;
    var back = 0;
    for (var i = 0; i < st.strokes.length; i++) back += st.strokes[i].len;
    st.chalk = Math.min(st.chalkMax, st.chalk + back * 0.6);
    st.strokes.length = 0; buildSegs(st);
    st.events.push({ t: 'erase', x: st.W / 2, y: st.H / 2, all: true });
    return true;
  }

  function reindex(st) {
    for (var i = 0; i < st.strokes.length; i++) {
      for (var j = 0; j < st.strokes[i].segs.length; j++) st.strokes[i].segs[j].si = i;
    }
  }

  /* ---------- 发球 ---------- */
  function spawn(st) {
    if (st.toSpawn <= 0) return false;
    if (st.balls.length >= MAX_FIELD) return false;
    st.toSpawn--; st.spawned++;
    st.balls.push({
      x: st.funnel.x, y: st.funnel.y,
      vx: (st.rndf ? st.rndf() : 0.5) * 36 - 18, vy: 20,
      r: BR, idle: 0, spin: 0, born: st.time, id: st.nextId++,
      hue: Math.floor((st.spawned * 2.7) % 5)
    });
    st.events.push({ t: 'spawn', x: st.funnel.x, y: st.funnel.y });
    return true;
  }

  function spawnNow(st) {
    if (st.toSpawn <= 0) return false;
    var did = spawn(st);
    if (did) st.spawnTimer = st.interval;
    return did;
  }

  /* ---------- 碰撞 ---------- */
  function collideSeg(b, g, h) {
    if (g.dead) return false;
    if (b.x + b.r < g.minx || b.x - b.r > g.maxx || b.y + b.r < g.miny || b.y - b.r > g.maxy) return false;
    var dx = g.bx - g.ax, dy = g.by - g.ay;
    var L2 = dx * dx + dy * dy;
    if (L2 < 1e-9) return false;
    var t = ((b.x - g.ax) * dx + (b.y - g.ay) * dy) / L2;
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    var px = g.ax + t * dx, py = g.ay + t * dy;
    var nx = b.x - px, ny = b.y - py;
    var d = Math.hypot(nx, ny);
    var R = b.r + SR;
    if (d >= R) return false;
    if (d < 1e-6) { nx = 0; ny = -1; d = 1e-6; }
    nx /= d; ny /= d;
    b.x += nx * (R - d); b.y += ny * (R - d);
    var vn = b.vx * nx + b.vy * ny;
    if (vn < 0) { b.vx -= (1 + REST) * vn * nx; b.vy -= (1 + REST) * vn * ny; }
    var tx = -ny, ty = nx;
    var vt = b.vx * tx + b.vy * ty;
    var k = Math.max(0, 1 - FRIC * h);
    var nvt = vt * k;
    b.vx += (nvt - vt) * tx; b.vy += (nvt - vt) * ty;
    b.spin += (vt * h) / b.r;
    // 磨损：按「滑过的距离」计，滚得快磨得快，滚得多磨得多
    g.hp -= Math.abs(vt) * h * WEAR;
    if (g.hp <= 0) {
      g.hp = 0; g.dead = 1;
      return true;
    }
    return false;
  }

  function collideRock(b, rk) {
    var dx = b.x - rk.x, dy = b.y - rk.y;
    var d = Math.hypot(dx, dy);
    var R = b.r + rk.r;
    if (d >= R) return;
    if (d < 1e-6) { dx = 0; dy = -1; d = 1e-6; }
    var nx = dx / d, ny = dy / d;
    b.x = rk.x + nx * R; b.y = rk.y + ny * R;
    var vn = b.vx * nx + b.vy * ny;
    if (vn < 0) { b.vx -= (1 + 0.34) * vn * nx; b.vy -= (1 + 0.34) * vn * ny; }
    var tx = -ny, ty = nx;
    var vt = b.vx * tx + b.vy * ty * 1;
    var nvt = vt * 0.94;
    b.vx += (nvt - vt) * tx; b.vy += (nvt - vt) * ty;
  }

  function collideBalls(a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var d = Math.hypot(dx, dy), R = a.r + b.r;
    if (d >= R || d < 1e-6) return;
    var nx = dx / d, ny = dy / d;
    var push = (R - d) * 0.5;
    a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
    var rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (rel < 0) {
      var j = -(1 + 0.36) * rel * 0.5;
      a.vx -= j * nx; a.vy -= j * ny; b.vx += j * nx; b.vy += j * ny;
    }
  }

  /* ---------- 积分 ---------- */
  function substep(st, h) {
    var bs = st.balls, i, j;
    for (i = 0; i < bs.length; i++) {
      var b = bs[i];
      b.vy += G * h;
      var d = 1 - AIR * h;
      b.vx *= d; b.vy *= d;
      var sp = Math.hypot(b.vx, b.vy);
      if (sp > VMAX) { b.vx *= VMAX / sp; b.vy *= VMAX / sp; }
      b.x += b.vx * h; b.y += b.vy * h;
      b.spin += (b.vx * h) / b.r * 0.35;
    }
    var segs = st.segs;
    for (i = 0; i < bs.length; i++) {
      var bb = bs[i];
      for (j = 0; j < segs.length; j++) {
        if (collideSeg(bb, segs[j], h)) {
          st.dirty = true;
          st.events.push({ t: 'break', x: (segs[j].ax + segs[j].bx) / 2, y: (segs[j].ay + segs[j].by) / 2 });
        }
      }
    }
    for (i = 0; i < bs.length; i++) {
      for (j = 0; j < st.rocks.length; j++) collideRock(bs[i], st.rocks[j]);
    }
    for (i = 0; i < bs.length; i++) {
      for (j = i + 1; j < bs.length; j++) collideBalls(bs[i], bs[j]);
    }
  }

  function postStep(st, dt) {
    var bs = st.balls, i;
    // 进桶
    for (i = bs.length - 1; i >= 0; i--) {
      var b = bs[i], got = false;
      for (var k = 0; k < st.bins.length; k++) {
        var bn = st.bins[k];
        if (b.x > bn.x + 4 && b.x < bn.x + bn.w - 4 && b.y > bn.y + 6 && b.y < bn.y + bn.h) {
          st.score += bn.val; st.caught++; bn.count++; bn.flash = 1;
          if (bn.val >= 5) st.chalk = Math.min(st.chalkMax, st.chalk + 20);
          st.events.push({ t: 'score', x: bn.cx, y: bn.y - 6, val: bn.val, bin: k });
          got = true; break;
        }
      }
      if (got) { bs.splice(i, 1); continue; }
      // 出界 / 卡死
      if (b.y > st.H + 60 || b.x < -70 || b.x > st.W + 70) {
        st.lost++; st.events.push({ t: 'lost', x: Math.max(6, Math.min(st.W - 6, b.x)), y: st.H - 18 });
        bs.splice(i, 1); continue;
      }
      if (Math.hypot(b.vx, b.vy) < 7) { b.idle += dt; } else { b.idle = 0; }
      if (b.idle > IDLE_MAX) { st.lost++; st.events.push({ t: 'lost', x: b.x, y: b.y, stuck: 1 }); bs.splice(i, 1); }
    }
    // 发球
    if (st.toSpawn > 0) {
      st.spawnTimer -= dt;
      if (st.spawnTimer <= 0) { spawn(st); st.spawnTimer = st.interval; }
    }
    // 桶闪光衰减
    for (i = 0; i < st.bins.length; i++) if (st.bins[i].flash > 0) st.bins[i].flash = Math.max(0, st.bins[i].flash - dt * 2.2);
    // 结束
    if (!st.done && st.toSpawn <= 0 && st.balls.length === 0 && st.time > 1.0) {
      st.done = true;
      var th = starThresholds(st);
      st.star = st.score >= th[2] ? 3 : (st.score >= th[1] ? 2 : (st.score >= th[0] ? 1 : 0));
      st.events.push({ t: 'end', score: st.score, star: st.star });
    }
  }

  function step(st, dt) {
    if (!(dt > 0) || !isFinite(dt)) dt = 0;
    if (dt > 0.05) dt = 0.05;
    if (st.done) { st.time += dt; return st; }
    st.time += dt;
    if (!st.rndf) st.rndf = mulberry32(st.seed * 31 + 7);
    var h = dt / SUB;
    for (var s = 0; s < SUB; s++) substep(st, h);
    postStep(st, dt);
    if (st.dirty) { buildSegs(st); st.dirty = false; }
    return st;
  }

  /* ---------- AI 对照（平衡标定用） ---------- */
  function rampTo(st, bin, fromX, fromY) {
    // 从漏斗下方画一条斜坡到目标桶口上方（末段放缓，便于落入）
    var tx = bin.cx - bin.w * 0.18;
    var ty = bin.y - 30;
    var pts = [{ x: fromX, y: fromY }];
    var mx = (fromX + tx) / 2, my = (fromY + ty) / 2 + 26;
    pts.push({ x: mx, y: my });
    pts.push({ x: tx, y: ty });
    return addStroke(st, resample(pts), 0).ok;
  }

  function resample(pts) {
    var out = [pts[0]];
    for (var i = 1; i < pts.length; i++) {
      var a = out[out.length - 1], b = pts[i];
      var d = Math.hypot(b.x - a.x, b.y - a.y);
      var n = Math.max(1, Math.ceil(d / SAMPLE_MIN));
      for (var k = 1; k <= n; k++) out.push({ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n });
    }
    return out;
  }

  function backboard(st, bin) {
    var x = bin.x + bin.w + 9;
    var pts = resample([{ x: x, y: bin.y - 52 }, { x: x, y: bin.y + 26 }]);
    return addStroke(st, pts, 1).ok;
  }

  function aiDir(st, bin) { return bin.cx > st.funnel.x ? 1 : -1; }
  function aiPath(st, bin) {
    var dir = aiDir(st, bin);
    var tx = bin.cx - dir * bin.w * 0.30;           // 落点在桶口靠「来向」一侧
    var sx = st.funnel.x - dir * 16;                 // 起点越过漏斗，保证珠子一定落在这段上
    return resample([{ x: sx, y: st.funnel.y + 40 }, { x: tx, y: bin.y - 28 }]);
  }
  function aiBB(st, bin) {
    var dir = aiDir(st, bin), bx = bin.cx + dir * (bin.w / 2 + 9);
    return resample([{ x: bx, y: bin.y - 52 }, { x: bx, y: bin.y + 26 }]);
  }

  /* AI：维持「漏斗 → 最高分桶」的引桥，磨到阈值以下就擦掉重画 */
  function aiDraw(st, kind) {
    if (!st.bins.length) return;
    var memo = st._ai || (st._ai = { ids: [] });
    var order = st.bins.slice().sort(function (a, b) { return b.val - a.val; });
    var thr = kind === 'strong' ? 0.60 : 0.32;
    var withBB = kind === 'strong';

    if (kind === 'random') {
      var rr = st.rndf ? st.rndf() : 0.5, r2 = st.rndf ? st.rndf() : 0.5, r3 = st.rndf ? st.rndf() : 0.5;
      var x0 = 0.1 * st.W + rr * 0.8 * st.W, y0 = (0.24 + r2 * 0.42) * st.H;
      var p2 = [{ x: x0, y: y0 }, { x: Math.max(12, Math.min(st.W - 12, x0 + (r3 - 0.5) * 240)), y: y0 + 70 + r3 * 60 }];
      addStroke(st, resample(p2), 2);
      return;
    }

    var need = true;
    if (memo.ids.length) {
      var alive = 0, total = 0;
      for (var i = 0; i < memo.ids.length; i++) {
        var s = null;
        for (var k = 0; k < st.strokes.length; k++) if (st.strokes[k].id === memo.ids[i]) s = st.strokes[k];
        if (!s) continue;
        for (var j = 0; j < s.segs.length; j++) { total++; if (!s.segs[j].dead) alive++; }
      }
      if (total > 0 && alive / total >= thr) need = false;
      else {
        for (var m = 0; m < memo.ids.length; m++) eraseStroke(st, memo.ids[m]);
        memo.ids = [];
      }
    }
    if (!need) return;

    // 先把手上的线擦掉回血，再挑「当前粉笔画得起」的最高分桶
    if (st.strokes.length) { clearStrokes(st); memo.ids = []; }
    var pick = null, pp = null, pbb = null;
    for (var bi = 0; bi < order.length; bi++) {
      var cand = order[bi];
      var q = aiPath(st, cand), qb = withBB ? aiBB(st, cand) : null;
      var c = strokeLength(q) + (qb ? strokeLength(qb) : 0);
      if (c <= st.chalk + 1) { pick = cand; pp = q; pbb = qb; break; }
    }
    if (!pick) return;
    var r = addStroke(st, pp, 0);
    if (r.ok) memo.ids.push(r.id);
    if (pbb) { var rb = addStroke(st, pbb, 1); if (rb.ok) memo.ids.push(rb.id); }
  }

  function runAI(lv, seed, kind, H) {
    var st = makeLevel(lv, seed, H);
    st.rndf = mulberry32(seed * 31 + 7);
    var acc = 0, guard = 0;
    var period = kind === 'strong' ? 0.35 : (kind === 'mid' ? 0.7 : 1.2);
    acc = period;
    while (!st.done && guard < 26000) {
      if (kind !== 'noop') {
        acc += 1 / 60;
        if (acc >= period) { acc = 0; aiDraw(st, kind); }
      }
      step(st, 1 / 60);
      guard++;
    }
    return st;
  }

  return {
    BASE_W: BASE_W, LEVELS: LEVELS, STARS: STARS, COLORS: COLORS,
    G: G, BR: BR, SR: SR, WEAR: WEAR, BIN_H: BIN_H, BIN_PAD: BIN_PAD,
    SAMPLE_MIN: SAMPLE_MIN, MAX_FIELD: MAX_FIELD,
    makeLevel: makeLevel, step: step, spawn: spawn, spawnNow: spawnNow,
    starThresholds: starThresholds, STAR_F: STAR_F,
    addStroke: addStroke, eraseStroke: eraseStroke, eraseAt: eraseAt,
    clearStrokes: clearStrokes, strokeAt: strokeAt, strokeLength: strokeLength,
    resample: resample, runAI: runAI, aiDraw: aiDraw, mulberry32: mulberry32
  };
});
