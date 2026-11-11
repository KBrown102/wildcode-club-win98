/* 290-viewfinder《取景 · 一镜》 — 纯逻辑层（零 DOM / 零 Canvas，可在 Node 里跑冒烟）
   一镜到底的长镜头横移穿越城市边缘，玩家用固定 2:3 画幅的相机「合景」拍下掠过的景物。
   三个动词：A/D 推拉变焦、W/S 升降取景、空格按快门。
*/
(function (g) {
  'use strict';

  var W = 480, H = 800, HORIZON = 520;
  var FW_MIN = 56, FW_MAX = 400, ASPECT = 1.5;
  var ZOOM_RATE = 0.62;   // z 变化速度（每秒）
  var PAN_RATE = 300;     // 取景框中心升降速度（px/秒）
  var IDEAL_R = 0.68;     // 最佳占框比例
  var FIT_DIV = Math.log(2.0);
  var S_EMPTY = 0.20;     // 低于此分算「没按下去」，不消耗胶片
  var S_OKAY = 0.45, S_GOOD = 0.70, S_PERFECT = 0.90;

  // ---- 景物种类 ----------------------------------------------------------
  // sw/sh = 被摄主体的取景盒（画布像素），p = 视差系数，ry = 主体中心的画面 y
  var KINDS = {
    peak:       { n: '远山·峰', v: 120, sw: 250, sh: 150, p: 0.10, lay: 'far',  ry: 375 },
    cloud:      { n: '云',      v: 30,  sw: 170, sh: 70,  p: 0.13, lay: 'far',  ry: 228 },
    moon:       { n: '月',      v: 100, sw: 90,  sh: 90,  p: 0.06, lay: 'far',  ry: 140 },
    lighthouse: { n: '灯塔',    v: 90,  sw: 90,  sh: 210, p: 0.34, lay: 'mid',  ry: 430 },
    kite:       { n: '风筝',    v: 55,  sw: 46,  sh: 62,  p: 0.44, lay: 'mid',  ry: 215 },
    bird:       { n: '飞鸟',    v: 60,  sw: 58,  sh: 36,  p: 0.39, lay: 'mid',  ry: 258 },
    tree:       { n: '树',      v: 25,  sw: 104, sh: 172, p: 0.34, lay: 'mid',  ry: 438 },
    sign:       { n: '路牌',    v: 45,  sw: 74,  sh: 74,  p: 0.82, lay: 'near', ry: 468 },
    cat:        { n: '猫',      v: 60,  sw: 64,  sh: 48,  p: 0.94, lay: 'near', ry: 568 },
    flower:     { n: '花',      v: 20,  sw: 42,  sh: 40,  p: 1.02, lay: 'near', ry: 596 },
    lamp:       { n: '路灯',    v: 40,  sw: 48,  sh: 150, p: 0.74, lay: 'near', ry: 398 },
    bench:      { n: '长椅',    v: 30,  sw: 112, sh: 54,  p: 0.82, lay: 'near', ry: 582 },
    bike:       { n: '自行车',  v: 35,  sw: 122, sh: 80,  p: 0.82, lay: 'near', ry: 572 }
  };

  // ---- 关卡 --------------------------------------------------------------
  var LEVELS = [
    { name: '初见',     base: '#9FC7C4', film: 14, speed: 78,  dur: 34, theme: 'peak',
      mix: { peak: 1, cloud: 2, tree: 2, bike: 2, flower: 3 } },
    { name: '灯塔',     base: '#7E9A63', film: 13, speed: 88,  dur: 34, theme: 'lighthouse',
      mix: { peak: 1, cloud: 1, lighthouse: 1, tree: 2, lamp: 2, bench: 2, flower: 3 } },
    { name: '路牌',     base: '#E3B558', film: 12, speed: 96,  dur: 36, theme: 'sign',
      mix: { peak: 1, cloud: 1, sign: 3, tree: 2, lamp: 2, cat: 1, flower: 3 } },
    { name: '猫与花',   base: '#C9A97A', film: 12, speed: 104, dur: 36, theme: 'cat',
      mix: { peak: 1, cat: 3, flower: 4, sign: 2, lamp: 2, bike: 2, cloud: 1 } },
    { name: '楼隙',     base: '#9A7454', film: 11, speed: 112, dur: 38, theme: 'peak',
      mix: { peak: 2, cloud: 2, lighthouse: 1, tree: 3, sign: 2, cat: 2, flower: 3 } },
    { name: '风筝',     base: '#6FB6D8', film: 11, speed: 120, dur: 38, theme: 'kite',
      mix: { peak: 1, kite: 3, bird: 2, cloud: 2, sign: 3, cat: 2, flower: 3 } },
    { name: '月出',     base: '#3A3632', film: 10, speed: 128, dur: 40, theme: 'moon',
      mix: { moon: 1, peak: 1, kite: 2, bird: 2, lighthouse: 1, cat: 3, sign: 3, flower: 3, lamp: 2 } },
    { name: '一镜到底', base: '#E6DCCB', film: 10, speed: 136, dur: 40, theme: 'peak',
      mix: { peak: 2, moon: 1, kite: 2, bird: 2, lighthouse: 1, cat: 3, sign: 3, flower: 3, lamp: 2, bench: 2 } }
  ];
  // par 由 Node 冒烟里的 AI 对照标定（见 _smoke290.cjs），此处为实测值
  var TARGET = [230, 300, 320, 390, 310, 380, 450, 500];
  var STAR3 = 1.22, STAR2 = 1.05;

  // ---- 工具 --------------------------------------------------------------
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function mulberry(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hex2rgb(h) {
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }
  function shade(hex, k) {
    var c = hex2rgb(hex), t = k > 0 ? 255 : 0, a = Math.abs(k);
    return 'rgb(' + Math.round(lerp(c[0], t, a)) + ',' + Math.round(lerp(c[1], t, a)) + ',' +
      Math.round(lerp(c[2], t, a)) + ')';
  }
  function palette(base) {
    return {
      base: base,
      skyTop: shade(base, 0.44), skyMid: shade(base, 0.62), skyBot: shade(base, 0.76),
      far: shade(base, 0.16), far2: shade(base, 0.34),
      mid: shade(base, -0.08), mid2: shade(base, -0.24),
      near: shade(base, -0.44), near2: shade(base, -0.58),
      fore: shade(base, -0.76),
      ground: shade(base, -0.52), ground2: shade(base, -0.66),
      accent: '#E8B04B'
    };
  }

  // ---- 世界生成 ----------------------------------------------------------
  function buildWorld(lvIdx) {
    var cfg = LEVELS[lvIdx];
    var rnd = mulberry(0x5EED0000 + lvIdx * 7919 + 13);
    var camMax = cfg.speed * cfg.dur;
    var FAR = 0.10, MID = 0.34;

    // 景物列表先定（山尖要反过来决定山脊的峰在哪，否则山尖永远过不了画面中心）
    var list = [];
    Object.keys(cfg.mix).forEach(function (k) {
      for (var i = 0; i < cfg.mix[k]; i++) list.push(k);
    });
    for (var is = list.length - 1; is > 0; is--) {
      var js = Math.floor(rnd() * (is + 1)); var ts = list[is]; list[is] = list[js]; list[js] = ts;
    }
    var nPeak = 0, nAll = list.length;
    list.forEach(function (k) { if (k === 'peak') nPeak++; });

    // 山尖的正中时刻 → 反推山脊峰的世界坐标
    var humps = [];
    var pk = 0;
    for (var ip = 0; ip < list.length; ip++) {
      if (list[ip] !== 'peak') continue;
      var frac = nPeak === 1 ? 0.52 : (0.20 + 0.62 * (pk / (nPeak - 1)));
      pk++;
      var camAtP = clamp(camMax * frac, 0.08 * camMax, 0.92 * camMax);
      humps.push({ x: W / 2 + camAtP * FAR, top: 262 + rnd() * 44, amp: 92 + rnd() * 52, main: true });
    }
    // 补几座配峰做天际线
    var hx = -260;
    var x1 = camMax * FAR + W + 520;
    while (hx < x1) {
      if (humps.every(function (hp) { return Math.abs(hp.x - hx) > 250; })) {
        humps.push({ x: hx, top: 300 + rnd() * 70, amp: 70 + rnd() * 50, main: false });
      }
      hx += 300 + rnd() * 170;
    }
    humps.sort(function (a, b) { return a.x - b.x; });

    var x0 = -320;
    var ridge = [];
    for (var x = x0; x <= x1; x += 26) {
      var y = 560;
      for (var i = 0; i < humps.length; i++) {
        var hh = humps[i];
        var d = (x - hh.x) / 300;
        if (d < -3.4 || d > 3.4) continue;
        var yy = hh.top + hh.amp * (1 - Math.cos(clamp(d, -3.14, 3.14)));
        if (yy < y) y = yy;
      }
      y += 16 * Math.sin(x / 97) + 8 * Math.sin(x / 41 + 1.3);
      ridge.push({ x: x, y: y });
    }

    // 中景楼群
    var bs = [];
    var bx = -120;
    var bxEnd = camMax * MID + W + 260;
    while (bx < bxEnd) {
      var bw = 68 + rnd() * 88;
      var bh = 84 + rnd() * 226;
      bs.push({ x: bx, w: bw, h: bh, seed: rnd() });
      bx += bw + 34 + rnd() * 88;
    }

    // 前景（虚化暗角用）
    var fores = [];
    var fx = -80, fxEnd = camMax * 1.35 + W + 300;
    while (fx < fxEnd) {
      fores.push({ x: fx, w: 130 + rnd() * 120, h: 160 + rnd() * 200, s: rnd() });
      fx += 420 + rnd() * 380;
    }

    // 山尖绑定到山脊的峰（峰的坐标由「正中时刻」反推，保证一定会经过画面中心）
    var apexIdx = 0;
    var objs = [];
    var n = list.length;
    for (var i3 = 0; i3 < n; i3++) {
      var kind = list[i3], K = KINDS[kind];
      // 正中时刻均匀分布，留头留尾
      var tt = (i3 + 0.5) / n;
      var tHit = 0.10 * cfg.dur + 0.80 * cfg.dur * tt + (rnd() - 0.5) * 0.035 * cfg.dur;
      var camAt = cfg.speed * tHit;
      var ox, oy;
      if (kind === 'peak') {
        var mains = humps.filter(function (h) { return h.main; });
        var hp = mains[apexIdx % mains.length]; apexIdx++;
        ox = hp.x; oy = hp.top + 75;
        camAt = clamp((ox - W / 2) / K.p, 0, camMax);
        tHit = camAt / cfg.speed;
      } else {
        oy = K.ry + (rnd() - 0.5) * 28;
        ox = W / 2 + camAt * K.p;
      }
      objs.push({
        kind: kind, K: K, x: ox, y: oy, tHit: tHit,
        r: rnd(), s2: rnd(), used: false, passed: false, id: i3
      });
    }
    objs.sort(function (a, b) { return a.tHit - b.tHit; });
    objs.forEach(function (o, i) { o.id = i; });

    var order = objs.slice().sort(function (a, b) { return a.K.p - b.K.p; });
    return { cfg: cfg, camMax: camMax, ridge: ridge, humps: humps, bs: bs, fores: fores,
      objs: objs, order: order, pal: palette(cfg.base) };
  }

  // ---- 状态 --------------------------------------------------------------
  function frameOf(st) {
    var fw = FW_MIN * Math.pow(FW_MAX / FW_MIN, st.z);
    var fh = fw * ASPECT;
    return { w: fw, h: fh, x: W / 2 - fw / 2, y: st.fcy - fh / 2 };
  }
  function clampFrame(st) {
    var f = frameOf(st);
    var lo = f.h / 2 + 6, hi = H - f.h / 2 - 6;
    if (lo > hi) st.fcy = H / 2; else st.fcy = clamp(st.fcy, lo, hi);
  }
  function objPos(o, camX) {
    return { x: o.x - camX * o.K.p, y: o.y };
  }
  function occluded(st, o, p) {
    if (o.K.lay !== 'far') return false;
    for (var i = 0; i < st.world.bs.length; i++) {
      var b = st.world.bs[i];
      var bx = b.x - st.camX * 0.34;
      if (bx > p.x + 300) break;
      if (bx + b.w < p.x - 300) continue;
      var top = HORIZON - b.h;
      if (p.x > bx - 4 && p.x < bx + b.w + 4 && p.y > top + 6) return true;
    }
    return false;
  }
  function compose(st, o, p) {
    var f = frameOf(st);
    var rw = o.K.sw / f.w, rh = o.K.sh / f.h;
    var r = rw > rh ? rw : rh;
    if (r > 1) return { s: 0, contained: false, fit: 0, c: 0, r: r };
    var fit = clamp01(1 - Math.abs(Math.log(r / IDEAL_R)) / FIT_DIV);
    var dx = (p.x - W / 2) / (f.w / 2), dy = (p.y - st.fcy) / (f.h / 2);
    var c = clamp01(1 - (dx * dx + dy * dy) * 1.1);
    return { s: 0.5 * fit + 0.5 * c, contained: true, fit: fit, c: c, r: r };
  }
  function evaluate(st) {
    var best = null;
    for (var i = 0; i < st.world.objs.length; i++) {
      var o = st.world.objs[i];
      if (o.used) continue;
      var p = objPos(o, st.camX);
      if (p.x < -420 || p.x > W + 420) continue;
      if (occluded(st, o, p)) continue;
      var f = frameOf(st);
      if (p.x < f.x || p.x > f.x + f.w || p.y < f.y || p.y > f.y + f.h) continue;
      var c = compose(st, o, p);
      if (c.s <= 0) continue;
      if (!best || c.s > best.s) best = { o: o, p: p, s: c.s, fit: c.fit, c: c.c, contained: true };
    }
    return best;
  }

  function create(lvIdx, opts) {
    opts = opts || {};
    var world = buildWorld(lvIdx);
    var st = {
      lv: lvIdx, world: world, pal: world.pal, cfg: world.cfg,
      t: 0, camX: 0, z: 0.42, fcy: 380,
      film: opts.film || world.cfg.film, filmMax: opts.film || world.cfg.film,
      score: 0, shots: [], missed: [], events: [],
      live: null, themeDone: false, phase: 'play', combo: 0, bestCombo: 0,
      endT: 0, sandbox: !!opts.sandbox
    };
    clampFrame(st);
    return st;
  }

  function push(st, e) { st.events.push(e); }

  function shoot(st) {
    if (st.phase !== 'play') return null;
    var lv = st.live;
    if (!lv || lv.s < S_EMPTY) { push(st, { t: 'empty' }); return null; }
    var o = lv.o;
    var gain = Math.round(o.K.v * lv.s);
    st.film--;
    st.score += gain;
    o.used = true;
    if (o.kind === st.cfg.theme && lv.s >= S_OKAY) st.themeDone = true;
    var grade = lv.s >= S_PERFECT ? 3 : (lv.s >= S_GOOD ? 2 : (lv.s >= S_OKAY ? 1 : 0));
    if (grade === 3) { st.combo++; if (st.combo > st.bestCombo) st.bestCombo = st.combo; }
    else if (grade <= 1) st.combo = 0;
    if (st.combo > 0 && st.combo % 3 === 0) { st.film++; push(st, { t: 'bonus' }); }
    var shot = { kind: o.kind, name: o.K.n, s: lv.s, gain: gain, grade: grade, x: lv.p.x, y: lv.p.y };
    st.shots.push(shot);
    push(st, { t: 'shot', s: lv.s, gain: gain, grade: grade, name: o.K.n, x: lv.p.x, y: lv.p.y });
    if (st.film <= 0) finish(st);
    return shot;
  }

  function finish(st) {
    if (st.phase !== 'play') return;
    st.phase = 'over'; st.endT = 0;
    for (var i = 0; i < st.world.objs.length; i++) {
      var o = st.world.objs[i];
      if (!o.used) st.missed.push({ kind: o.kind, name: o.K.n });
    }
    var tgt = TARGET[st.lv];
    var pass = st.score >= tgt && st.themeDone;
    st.star = pass ? (st.score >= tgt * STAR3 ? 3 : (st.score >= tgt * STAR2 ? 2 : 1)) : 0;
    st.pass = pass;
    push(st, { t: 'over', star: st.star, pass: pass });
  }

  function update(st, dt, input) {
    if (!(dt > 0)) dt = 0;
    if (dt > 0.05) dt = 0.05;
    input = input || {};
    if (st.phase === 'over') { st.endT += dt; return st; }
    var dz = input.dz || 0, dy = input.dy || 0;
    if (dz) st.z = clamp(st.z + dz * ZOOM_RATE * dt, 0, 1);
    if (dy) st.fcy += dy * PAN_RATE * dt;
    clampFrame(st);
    st.t += dt;
    st.camX = st.cfg.speed * st.t;
    st.live = evaluate(st);
    for (var i = 0; i < st.world.objs.length; i++) {
      var o = st.world.objs[i];
      if (o.used || o.passed) continue;
      var p = objPos(o, st.camX);
      if (p.x < -160) { o.passed = true; push(st, { t: 'pass', name: o.K.n }); }
    }
    if (st.camX >= st.world.camMax) finish(st);
    return st;
  }

  // 理想取景（给 AI / 教学提示用）：返回该景物在完美合景时需要的 z 与 fcy
  function idealFor(o) {
    var need = Math.max(o.K.sw, o.K.sh / ASPECT) / IDEAL_R;
    var z = Math.log(need / FW_MIN) / Math.log(FW_MAX / FW_MIN);
    return { z: clamp01(z), fcy: o.y };
  }

  g.VF = {
    W: W, H: H, HORIZON: HORIZON, ASPECT: ASPECT, FW_MIN: FW_MIN, FW_MAX: FW_MAX,
    ZOOM_RATE: ZOOM_RATE, PAN_RATE: PAN_RATE, IDEAL_R: IDEAL_R,
    S_EMPTY: S_EMPTY, S_OKAY: S_OKAY, S_GOOD: S_GOOD, S_PERFECT: S_PERFECT,
    KINDS: KINDS, LEVELS: LEVELS, TARGET: TARGET,
    clamp: clamp, clamp01: clamp01, lerp: lerp, shade: shade, palette: palette,
    buildWorld: buildWorld, create: create, update: update, shoot: shoot, finish: finish,
    frameOf: frameOf, clampFrame: clampFrame, objPos: objPos, compose: compose,
    evaluate: evaluate, occluded: occluded, idealFor: idealFor
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
