/* 305-shadowyard · game.js
 * 《移荫 · 一日阴》—— 纯逻辑层，零 DOM 零 Canvas，可被 Node 直接 require 做冒烟。
 * 核心：太阳自己走一天，影子跟着扫过院子。你挪不动太阳，只能挪物件。
 *      需要荫的地方（庇格）必须在指定时辰落在影里；需要晒的地方（晒格）必须一整天都见光。
 *      唯一动词＝摆放（位置 + 朝向），第二动词＝收回，第三动词＝拨时辰预览。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SC305 = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------- 常量 ----------------
  var W = 900, H = 620;
  var CELL = 30, COLS = 26, ROWS = 13;
  var YX0 = 60, YY0 = 58;
  var YW = COLS * CELL, YH = ROWS * CELL;          // 780 x 390
  var TRAY_Y = 456, TRAY_H = 148;
  var CARD_W = 96, CARD_H = 128, CARD_GAP = 8;
  var DAY_SEC = 15.5;                              // 一天走完的秒数
  var D2R = Math.PI / 180;

  var KINDS = [
    { id: 'tree', name: '槐', shape: 'circle', rx: 26 },
    { id: 'bamboo', name: '竹', shape: 'circle', rx: 16 },
    { id: 'wall', name: '墙', shape: 'rect', rx: 40, ry: 11 },
    { id: 'shed', name: '棚', shape: 'rect', rx: 30, ry: 30 },
    { id: 'pav', name: '亭', shape: 'rect', rx: 33, ry: 33 },
    { id: 'rock', name: '石', shape: 'circle', rx: 19 }
  ];

  var SHADE_ICONS = ['茶', '棋', '榻', '药', '瓮', '书', '弦', '笼'];
  var SUN_ICONS = ['谷', '衣', '椒', '笺', '菇', '漆', '姜', '锦'];

  // run = 庇格要求「连续几个时辰都得荫着」的长度（1 = 只求一时辰，3 = 得让影子扫过它三段）
  var LEVELS = [
    { name: '小院', nSol: 2, extra: 1, T: 4, nShade: 2, nSun: 1, run: 1, hMin: 46, hMax: 68, Emin: 18, Emax: 70, az0: 0 },
    { name: '井台', nSol: 2, extra: 1, T: 5, nShade: 2, nSun: 2, run: 2, hMin: 46, hMax: 72, Emin: 17, Emax: 71, az0: -5 },
    { name: '东厢', nSol: 3, extra: 1, T: 5, nShade: 3, nSun: 2, run: 2, hMin: 46, hMax: 78, Emin: 16, Emax: 72, az0: 4 },
    { name: '晒场', nSol: 3, extra: 1, T: 6, nShade: 3, nSun: 3, run: 2, hMin: 48, hMax: 84, Emin: 15, Emax: 73, az0: -3 },
    { name: '后圃', nSol: 4, extra: 2, T: 6, nShade: 4, nSun: 3, run: 2, hMin: 48, hMax: 90, Emin: 15, Emax: 74, az0: 6 },
    { name: '药畦', nSol: 4, extra: 2, T: 6, nShade: 4, nSun: 3, run: 2, hMin: 50, hMax: 96, Emin: 14, Emax: 75, az0: -6 },
    { name: '长昼', nSol: 5, extra: 2, T: 7, nShade: 5, nSun: 4, run: 2, hMin: 50, hMax: 102, Emin: 14, Emax: 76, az0: 3 },
    { name: '伏暑', nSol: 5, extra: 2, T: 7, nShade: 6, nSun: 4, run: 2, hMin: 52, hMax: 108, Emin: 13, Emax: 77, az0: -4 }
  ];

  // ---------------- 工具 ----------------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function popcount(m) { var c = 0; while (m) { m &= m - 1; c++; } return c; }

  function inPoly(px, py, pts) {
    var inside = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
      if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  function convexHull(pts) {
    var p = pts.slice().sort(function (a, b) { return a.x - b.x || a.y - b.y; });
    if (p.length < 3) return p;
    var cross = function (o, a, b) { return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x); };
    var lo = [], i;
    for (i = 0; i < p.length; i++) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p[i]) <= 0) lo.pop(); lo.push(p[i]); }
    var up = [];
    for (i = p.length - 1; i >= 0; i--) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p[i]) <= 0) up.pop(); up.push(p[i]); }
    lo.pop(); up.pop();
    return lo.concat(up);
  }

  function segInt(ax, ay, bx, by, cx, cy, dx, dy) {
    var d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    var d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
    var d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
    var d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
    return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
  }
  function polyRectOverlap(poly, x0, y0, x1, y1) {
    var i, n = poly.length, r = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
    for (i = 0; i < n; i++) if (poly[i].x >= x0 && poly[i].x <= x1 && poly[i].y >= y0 && poly[i].y <= y1) return true;
    for (i = 0; i < 4; i++) if (inPoly(r[i].x, r[i].y, poly)) return true;
    for (i = 0; i < n; i++) {
      var a = poly[i], b = poly[(i + 1) % n], j;
      for (j = 0; j < 4; j++) {
        var c = r[j], d = r[(j + 1) % 4];
        if (segInt(a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y)) return true;
      }
    }
    return false;
  }
  function polysOverlap(A, B) {
    var i, j, na = A.length, nb = B.length;
    for (i = 0; i < na; i++) if (inPoly(A[i].x, A[i].y, B)) return true;
    for (i = 0; i < nb; i++) if (inPoly(B[i].x, B[i].y, A)) return true;
    for (i = 0; i < na; i++) for (j = 0; j < nb; j++) {
      var a = A[i], b = A[(i + 1) % na], c = B[j], d = B[(j + 1) % nb];
      if (segInt(a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y)) return true;
    }
    return false;
  }

  // ---------------- 日与影 ----------------
  // 日晷模型：日自东（+x）经南（+y）至西（−x），走 180°；影子恒指日的反方向：西 → 北 → 东。
  var AZ_SPAN = 182;
  function sunAt(t, cfg) {
    t = clamp(t, 0, 1);
    var az = ((cfg.az0 || 0) + AZ_SPAN * t) * D2R;
    var el = (cfg.Emin + (cfg.Emax - cfg.Emin) * Math.sin(Math.PI * t)) * D2R;
    return { az: az, el: el, t: t };
  }
  function shadowOffset(sun, h) {
    var len = h / Math.max(0.12, Math.tan(sun.el));
    return { dx: -Math.cos(sun.az) * len, dy: -Math.sin(sun.az) * len, len: len };
  }
  function momentsOf(T) {
    var m = [];
    for (var k = 0; k < T; k++) m.push(0.06 + 0.88 * (T > 1 ? k / (T - 1) : 0));
    return m;
  }
  // mask 里最长的一段连续 1（返回起点与长度）
  function longestRun(mask, T) {
    var bs = -1, bl = 0, s = -1, l = 0;
    for (var k = 0; k < T; k++) {
      if (mask & (1 << k)) { if (s < 0) s = k; l++; if (l > bl) { bl = l; bs = s; } }
      else { s = -1; l = 0; }
    }
    return { start: bs, len: bl };
  }
  var SHICHEN = ['辰', '巳', '午正', '未', '申', '酉', '戌'];
  function momentName(k, T) {
    if (T <= 4) return ['辰', '午', '未', '酉'][k] || '辰';
    if (T === 5) return ['辰', '巳', '午', '未', '酉'][k] || '辰';
    if (T === 6) return ['辰', '巳', '午', '未', '申', '酉'][k] || '辰';
    return SHICHEN[k] || '辰';
  }

  // 底面：圆用外接 12 边形（保证多边形 ⊇ 真圆，判定才不会比画出来的小）
  var CIRC_N = 12, CIRC_K = 1 / Math.cos(Math.PI / CIRC_N);
  function footPoly(o) {
    var k = KINDS[o.kind], pts = [], i;
    if (k.shape === 'circle') {
      var R = k.rx * o.sc * CIRC_K;
      for (i = 0; i < CIRC_N; i++) { var a = i / CIRC_N * Math.PI * 2; pts.push({ x: o.x + Math.cos(a) * R, y: o.y + Math.sin(a) * R }); }
    } else {
      var c = Math.cos(o.ang), s = Math.sin(o.ang), rx = k.rx * o.sc, ry = k.ry * o.sc;
      var cs = [[-rx, -ry], [rx, -ry], [rx, ry], [-rx, ry]];
      for (i = 0; i < 4; i++) pts.push({ x: o.x + cs[i][0] * c - cs[i][1] * s, y: o.y + cs[i][0] * s + cs[i][1] * c });
    }
    return pts;
  }
  function shadowPoly(o, sun) {
    var f = footPoly(o), off = shadowOffset(sun, o.h);
    var pts = f.slice(), i;
    for (i = 0; i < f.length; i++) pts.push({ x: f[i].x + off.dx, y: f[i].y + off.dy });
    return convexHull(pts);
  }
  // 形状描述：圆 = 胶囊（与 coversPoint 完全一致），矩形 = 凸包
  function shadowShape(o, sun) {
    var k = KINDS[o.kind], off = shadowOffset(sun, o.h);
    if (k.shape === 'circle') return { t: 'cap', x: o.x, y: o.y, dx: off.dx, dy: off.dy, r: k.rx * o.sc };
    return { t: 'poly', pts: shadowPoly(o, sun) };
  }
  // 快速点判定：圆走胶囊（不求凸包），矩形走凸包
  function coversPoint(o, sun, px, py) {
    var k = KINDS[o.kind], off = shadowOffset(sun, o.h);
    if (k.shape === 'circle') {
      var r = k.rx * o.sc;
      var ax = o.x, ay = o.y, bx = o.x + off.dx, by = o.y + off.dy;
      var vx = bx - ax, vy = by - ay, wx = px - ax, wy = py - ay;
      var L2 = vx * vx + vy * vy;
      var tt = L2 > 0 ? (wx * vx + wy * vy) / L2 : 0;
      tt = tt < 0 ? 0 : (tt > 1 ? 1 : tt);
      var dx2 = wx - vx * tt, dy2 = wy - vy * tt;
      return dx2 * dx2 + dy2 * dy2 <= r * r;
    }
    return inPoly(px, py, shadowPoly(o, sun));
  }
  function boundR(o) {
    var k = KINDS[o.kind];
    return k.shape === 'circle' ? k.rx * o.sc : Math.sqrt(k.rx * k.rx + k.ry * k.ry) * o.sc;
  }

  // ---------------- 关卡生成（可解性逆推） ----------------
  function cellCenter(cx, cy) { return { x: YX0 + (cx + 0.5) * CELL, y: YY0 + (cy + 0.5) * CELL }; }

  function genLevel(li, seed) {
    var cfg = LEVELS[li];
    var T = cfg.T;
    var moments = momentsOf(T);
    var rng = mulberry32(((seed | 0) * 7919 + li * 104729 + 12345) | 0);
    var best = null;

    for (var attempt = 0; attempt < 1500; attempt++) {
      // 1) 参考解布局：分区布点（保证物件散开，庇格才有得挑）
      var objs = [], i, ok = true;
      var zn = Math.ceil(Math.sqrt(cfg.nSol));
      var zones = [];
      for (i = 0; i < zn * zn; i++) zones.push(i);
      for (i = zones.length - 1; i > 0; i--) { var zj = Math.floor(rng() * (i + 1)); var zt = zones[i]; zones[i] = zones[zj]; zones[zj] = zt; }
      var zw = YW / zn, zh = YH / zn;
      for (i = 0; i < cfg.nSol; i++) {
        var ki = Math.floor(rng() * KINDS.length);
        var kk = KINDS[ki];
        var br = kk.shape === 'circle' ? kk.rx : Math.sqrt(kk.rx * kk.rx + kk.ry * kk.ry);
        var o = null;
        for (var tr = 0; tr < 120; tr++) {
          var zid = zones[(i + Math.floor(rng() * zn * zn)) % zones.length];
          var zx = YX0 + (zid % zn) * zw, zy = YY0 + Math.floor(zid / zn) * zh;
          var x = clamp(zx + 26 + rng() * Math.max(1, zw - 52), YX0 + 30, YX0 + YW - 30);
          var y = clamp(zy + 26 + rng() * Math.max(1, zh - 52), YY0 + 30, YY0 + YH - 30);
          var good = true;
          for (var j = 0; j < objs.length; j++) {
            var p = objs[j], d = Math.hypot(x - p.x, y - p.y);
            if (d < boundR(p) + br + 26) { good = false; break; }
          }
          if (good) { o = { kind: ki, x: x, y: y, ang: Math.floor(rng() * 8) * Math.PI / 4, h: cfg.hMin + rng() * (cfg.hMax - cfg.hMin), sc: 1 }; break; }
        }
        if (!o) { ok = false; break; }
        objs.push(o);
      }
      if (!ok) continue;

      // 2) 逐格算全日掩码（与 simulate 共用 coversPoint，判定必须同源）
      var mask = new Int32Array(COLS * ROWS);
      var sunK = [];
      for (var k = 0; k < T; k++) sunK.push(sunAt(moments[k], cfg));
      for (var cy = 0; cy < ROWS; cy++) for (var cx = 0; cx < COLS; cx++) {
        var c = cellCenter(cx, cy), m = 0;
        for (k = 0; k < T; k++) for (i = 0; i < objs.length; i++) {
          if (coversPoint(objs[i], sunK[k], c.x, c.y)) { m |= (1 << k); break; }
        }
        mask[cy * COLS + cx] = m;
      }
      // 被底座压住的格子标记
      var onBase = new Uint8Array(COLS * ROWS);
      for (cy = 0; cy < ROWS; cy++) for (cx = 0; cx < COLS; cx++) {
        var cc = cellCenter(cx, cy);
        for (i = 0; i < objs.length; i++) if (inPoly(cc.x, cc.y, footPoly(objs[i]))) { onBase[cy * COLS + cx] = 1; break; }
      }

      // 3) 庇格候选：参考解下「连续荫着 ≥ min(run,2) 个时辰」、且不被底座压住的格子
      var needRun = Math.min(cfg.run, 2);
      var shadeCand = [];
      for (cy = 1; cy < ROWS - 1; cy++) for (cx = 1; cx < COLS - 1; cx++) {
        var id = cy * COLS + cx, m2 = mask[id];
        if (onBase[id]) continue;
        var lr = longestRun(m2, T);
        if (lr.len < needRun) continue;
        var need = Math.min(cfg.run, lr.len), req = 0;
        for (var q = 0; q < need; q++) req |= (1 << (lr.start + q));
        shadeCand.push({ cx: cx, cy: cy, m: m2, req: req });
      }
      if (shadeCand.length < cfg.nShade) continue;

      // 4) 晒格候选：全日无荫
      var sunCand = [];
      for (cy = 1; cy < ROWS - 1; cy++) for (cx = 1; cx < COLS - 1; cx++) {
        var id2 = cy * COLS + cx;
        if (mask[id2] !== 0) continue;
        sunCand.push({ cx: cx, cy: cy });
      }
      if (sunCand.length < cfg.nSun) continue;

      // 5) 挑点（互相隔开；间距自适应收紧，避免随机重挑挑不满）
      function shuffle(a) { for (var q = a.length - 1; q > 0; q--) { var w = Math.floor(rng() * (q + 1)); var t2 = a[q]; a[q] = a[w]; a[w] = t2; } return a; }
      function cheb(a, b) { return Math.max(Math.abs(a.cx - b.cx), Math.abs(a.cy - b.cy)); }
      function pickSep(cand, need, sep, avoid, avoidSep) {
        var used = [], i, j;
        for (i = 0; i < cand.length; i++) {
          var s = cand[i], bad = false;
          for (j = 0; j < used.length; j++) if (cheb(used[j], s) < sep) bad = true;
          if (avoid) for (j = 0; j < avoid.length; j++) if (cheb(avoid[j], s) < avoidSep) bad = true;
          if (!bad) used.push(s);
          if (used.length >= need) return used;
        }
        return null;
      }
      shuffle(shadeCand); shuffle(sunCand);
      var pickedS = null, j2;
      for (j2 = 3; j2 >= 1 && !pickedS; j2--) pickedS = pickSep(shadeCand, cfg.nShade, j2, null, 0);
      if (!pickedS) continue;
      var pickedU = null;
      for (j2 = 3; j2 >= 1 && !pickedU; j2--) pickedU = pickSep(sunCand, cfg.nSun, j2, pickedS, 2);
      if (!pickedU) continue;

      best = { objs: objs, shade: pickedS, sun: pickedU, cfg: cfg, moments: moments };
      break;
    }
    if (!best) return null;

    // 6) 组装：参考解物件 + 干扰件
    var list = [];
    for (i = 0; i < best.objs.length; i++) {
      var b = best.objs[i];
      list.push({ id: i, kind: b.kind, h: b.h, sc: 1, ang: b.ang, x: b.x, y: b.y, placed: false, sol: true, solX: b.x, solY: b.y, solAng: b.ang });
    }
    for (i = 0; i < cfg.extra; i++) {
      var ke = Math.floor(mulberry32(seed * 31 + li * 7 + i * 101)() * KINDS.length);
      list.push({ id: best.objs.length + i, kind: ke, h: cfg.hMin + mulberry32(seed * 17 + i * 53)() * (cfg.hMax - cfg.hMin), sc: 1, ang: 0, x: 0, y: 0, placed: false, sol: false });
    }

    var cells = [];
    for (i = 0; i < best.shade.length; i++) {
      var sc2 = best.shade[i], ctr = cellCenter(sc2.cx, sc2.cy);
      cells.push({ i: cells.length, type: 'shade', cx: sc2.cx, cy: sc2.cy, wx: ctr.x, wy: ctr.y, req: sc2.req, got: 0, done: false, icon: SHADE_ICONS[i % SHADE_ICONS.length], hitAt: -1 });
    }
    for (i = 0; i < best.sun.length; i++) {
      var su = best.sun[i], ctr2 = cellCenter(su.cx, su.cy);
      cells.push({ i: cells.length, type: 'sun', cx: su.cx, cy: su.cy, wx: ctr2.x, wy: ctr2.y, req: 0, got: 0, done: false, icon: SUN_ICONS[i % SUN_ICONS.length], hitAt: -1 });
    }

    var maxExtra = 0;
    for (i = 0; i < cells.length; i++) if (cells[i].type === 'shade') maxExtra += (T - popcount(cells[i].req));
    var floorPt = cells.length ? 0 : 0;
    for (i = 0; i < cells.length; i++) floorPt += (cells[i].type === 'shade' ? 120 : 50);
    floorPt += 200;
    // 三星：① 全通即 1★（不焦虑）② 少用一件 → 2★ ③ 少用 + 余荫厚（庇格在额外时辰也荫着）→ 3★
    var V = maxExtra * 14 + cfg.extra * 70;
    var thresh = [
      Math.round(floorPt),
      Math.round(floorPt + cfg.extra * 70 * 0.6),
      Math.round(floorPt + cfg.extra * 70 + maxExtra * 14 * 0.45)
    ];

    return {
      li: li, seed: seed, cfg: cfg, T: T, moments: moments,
      objs: list, cells: cells,
      thresh: thresh, floorPt: floorPt, varMax: V,
      sunCfg: { A: cfg.A, Emin: cfg.Emin, Emax: cfg.Emax }
    };
  }

  // ---------------- 状态 ----------------
  function makeState(li, seed) {
    var L = genLevel(li, seed);
    var st = {
      li: li, seed: seed, L: L,
      cfg: L.cfg, T: L.T, moments: L.moments, sunCfg: L.sunCfg,
      objs: L.objs.map(function (o) { return Object.assign({}, o); }),
      cells: L.cells.map(function (c) { return Object.assign({}, c); }),
      phase: 'layout',           // layout | run | over
      t: 0, ti: 0, pi: 0,
      sel: -1, drag: null,
      win: false, over: false,
      finalScore: 0, stars: 0,
      extra: 0, unused: 0,
      events: [], sun: sunAt(L.moments[0], L.cfg),
      thresh: L.thresh, floorPt: L.floorPt, varMax: L.varMax,
      time: 0
    };
    for (var i = 0; i < st.objs.length; i++) { st.objs[i].x = 0; st.objs[i].y = 0; st.objs[i].placed = false; st.objs[i].ang = 0; }
    return st;
  }

  function reset(st) {
    for (var i = 0; i < st.objs.length; i++) { st.objs[i].x = 0; st.objs[i].y = 0; st.objs[i].placed = false; st.objs[i].ang = 0; }
    for (i = 0; i < st.cells.length; i++) { st.cells[i].got = 0; st.cells[i].done = false; st.cells[i].hitAt = -1; }
    st.phase = 'layout'; st.t = 0; st.ti = 0; st.pi = 0;
    st.sel = -1; st.drag = null; st.win = false; st.over = false;
    st.finalScore = 0; st.stars = 0; st.extra = 0; st.unused = 0; st.time = 0;
    st.sun = sunAt(st.moments[0], st.cfg);
    st.events.length = 0;
  }

  // ---------------- 放置合法性 ----------------
  function insideYard(poly) {
    for (var i = 0; i < poly.length; i++) {
      if (poly[i].x < YX0 + 2 || poly[i].x > YX0 + YW - 2 || poly[i].y < YY0 + 2 || poly[i].y > YY0 + YH - 2) return false;
    }
    return true;
  }
  function canPlace(st, id, x, y, ang) {
    var o = st.objs[id], ox = o.x, oy = o.y, oa = o.ang;
    o.x = x; o.y = y; o.ang = ang;
    var poly = footPoly(o), ok = insideYard(poly), i;
    if (ok) for (i = 0; i < st.cells.length; i++) {
      var c = st.cells[i];
      if (polyRectOverlap(poly, c.wx - CELL / 2, c.wy - CELL / 2, c.wx + CELL / 2, c.wy + CELL / 2)) { ok = false; break; }
    }
    if (ok) for (i = 0; i < st.objs.length; i++) {
      var p = st.objs[i];
      if (p.id === id || !p.placed) continue;
      if (polysOverlap(poly, footPoly(p))) { ok = false; break; }
    }
    o.x = ox; o.y = oy; o.ang = oa;
    return ok;
  }
  function place(st, id, x, y) {
    var o = st.objs[id];
    if (canPlace(st, id, x, y, o.ang)) { o.x = x; o.y = y; o.placed = true; st.sel = id; push(st, { type: 'place', id: id }); return true; }
    return false;
  }
  function unplace(st, id) {
    var o = st.objs[id];
    if (!o.placed) return false;
    o.placed = false; o.x = 0; o.y = 0;
    if (st.sel === id) st.sel = -1;
    push(st, { type: 'pick', id: id });
    return true;
  }
  function rotate(st, id, dir) {
    var o = st.objs[id], a = o.ang + (dir || 1) * Math.PI / 4;
    a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    if (canPlace(st, id, o.x, o.y, a)) { o.ang = a; push(st, { type: 'rot', id: id }); return true; }
    return false;
  }
  function push(st, e) { st.events.push(e); if (st.events.length > 48) st.events.splice(0, st.events.length - 48); }

  // ---------------- 模拟与判定 ----------------
  function shadowsAt(st, t) {
    var sun = sunAt(t, st.cfg), out = [], i;
    for (i = 0; i < st.objs.length; i++) if (st.objs[i].placed) out.push({ o: st.objs[i], poly: shadowPoly(st.objs[i], sun) });
    return { sun: sun, list: out };
  }
  function coveredAt(st, t, wx, wy) {
    var sun = sunAt(t, st.cfg);
    for (var i = 0; i < st.objs.length; i++) {
      var o = st.objs[i];
      if (!o.placed) continue;
      if (coversPoint(o, sun, wx, wy)) return true;
    }
    return false;
  }
  function simulate(st) {
    var T = st.T, cells = st.cells.map(function (c) { return { type: c.type, req: c.req, got: 0 }; });
    var i, k;
    for (k = 0; k < T; k++) {
      var sun = sunAt(st.moments[k], st.cfg);
      var polys = [];
      for (i = 0; i < cells.length; i++) {
        var c = st.cells[i];
        for (var j = 0; j < st.objs.length; j++) {
          if (!st.objs[j].placed) continue;
          if (coversPoint(st.objs[j], sun, c.wx, c.wy)) { cells[i].got |= (1 << k); break; }
        }
      }
    }
    var nShade = 0, nSun = 0, totShade = 0, totSun = 0, extra = 0, all = true;
    for (i = 0; i < cells.length; i++) {
      if (cells[i].type === 'shade') {
        totShade++;
        if ((cells[i].got & cells[i].req) === cells[i].req) nShade++; else all = false;
        extra += popcount(cells[i].got & ~cells[i].req);
      } else {
        totSun++;
        if (cells[i].got === 0) nSun++; else all = false;
      }
    }
    return { cells: cells, nShade: nShade, nSun: nSun, totShade: totShade, totSun: totSun, extra: extra, win: all };
  }

  // 铁律：晒格「什么都不摆」天然满足 → 晒格分必须挂 win，否则 noop 白拿 50~200 分
  function score(st) {
    if (st.over) return st.finalScore;
    var s = simulate(st), base = s.nShade * 120;   // 庇格分：必须真把影子投过去才拿得到
    if (s.win) {
      var unused = 0;
      for (var i = 0; i < st.objs.length; i++) if (!st.objs[i].placed) unused++;
      base += s.nSun * 50 + 200 + s.extra * 14 + unused * 70;
    }
    return base;
  }
  function starOf(st) {
    if (!st.win) return 0;
    var f = st.finalScore, t = st.thresh;
    return f >= t[2] ? 3 : (f >= t[1] ? 2 : (f >= t[0] ? 1 : 0));
  }

  function finish(st) {
    var s = simulate(st), i;
    for (i = 0; i < st.cells.length; i++) { st.cells[i].got = s.cells[i].got; st.cells[i].done = s.cells[i].type === 'shade' ? ((s.cells[i].got & s.cells[i].req) === s.cells[i].req) : (s.cells[i].got === 0); }
    st.win = s.win;                      // 铁律：先置 win
    st.extra = s.extra;
    var unused = 0;
    for (i = 0; i < st.objs.length; i++) if (!st.objs[i].placed) unused++;
    st.unused = unused;
    st.finalScore = score(st);            // 再算分
    st.stars = starOf(st);
    st.over = true; st.phase = 'over';    // 最后冻结
    push(st, { type: 'over', win: st.win, stars: st.stars });
  }

  function startRun(st) {
    if (st.phase === 'run' || st.phase === 'over') return false;
    var any = false;
    for (var i = 0; i < st.objs.length; i++) if (st.objs[i].placed) any = true;
    st.phase = 'run'; st.t = 0; st.ti = 0; st.time = 0;
    for (i = 0; i < st.cells.length; i++) { st.cells[i].got = 0; st.cells[i].hitAt = -1; }
    push(st, { type: 'start' });
    return true;
  }

  function update(st, dt) {
    if (!(dt > 0)) dt = 0;
    if (dt > 0.05) dt = 0.05;
    st.time += dt;
    if (st.phase === 'layout') {
      st.sun = sunAt(st.moments[clamp(st.pi, 0, st.T - 1)], st.cfg);
      return;
    }
    if (st.phase !== 'run') return;
    st.t += dt / DAY_SEC;
    st.sun = sunAt(st.t, st.cfg);
    while (st.ti < st.T && st.t >= st.moments[st.ti]) {
      var k = st.ti, i;
      for (i = 0; i < st.cells.length; i++) {
        var c = st.cells[i];
        var cov = coveredAt(st, st.moments[k], c.wx, c.wy);
        if (cov) {
          c.got |= (1 << k);
          if (c.hitAt < 0 && (c.type === 'sun' || ((c.got & c.req) === c.req))) c.hitAt = k;
        }
      }
      push(st, { type: 'tick', k: k });
      st.ti = k + 1;
    }
    if (st.t >= 1) { st.t = 1; finish(st); }
  }

  // ---------------- 托盘 / 命中 ----------------
  function slots(st) { return st.objs.length; }
  function cardRect(i, n) {
    var totalW = n * CARD_W + (n - 1) * CARD_GAP;
    var x0 = (W - totalW) / 2;
    return { x: x0 + i * (CARD_W + CARD_GAP), y: TRAY_Y + 20, w: CARD_W, h: CARD_H };
  }
  function ptInRect(px, py, r) { return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h; }
  function hitTest(st, px, py) {
    var i;
    for (i = st.objs.length - 1; i >= 0; i--) {
      var o = st.objs[i];
      if (!o.placed) continue;
      if (inPoly(px, py, footPoly(o))) return { type: 'obj', id: o.id };
    }
    for (i = 0; i < st.objs.length; i++) {
      if (st.objs[i].placed) continue;
      if (ptInRect(px, py, cardRect(i, st.objs.length))) return { type: 'card', id: st.objs[i].id };
    }
    return null;
  }
  function inYard(px, py) { return px >= YX0 && px <= YX0 + YW && py >= YY0 && py <= YY0 + YH; }

  var API = {
    W: W, H: H, CELL: CELL, COLS: COLS, ROWS: ROWS, YX0: YX0, YY0: YY0, YW: YW, YH: YH,
    TRAY_Y: TRAY_Y, TRAY_H: TRAY_H, CARD_W: CARD_W, CARD_H: CARD_H, CARD_GAP: CARD_GAP,
    DAY_SEC: DAY_SEC, KINDS: KINDS, LEVELS: LEVELS,
    mulberry32: mulberry32, clamp: clamp, popcount: popcount,
    inPoly: inPoly, convexHull: convexHull, polyRectOverlap: polyRectOverlap, polysOverlap: polysOverlap,
    sunAt: sunAt, shadowOffset: shadowOffset, momentsOf: momentsOf, momentName: momentName,
    longestRun: longestRun, AZ_SPAN: AZ_SPAN,
    footPoly: footPoly, shadowPoly: shadowPoly, coversPoint: coversPoint, shadowShape: shadowShape, boundR: boundR, cellCenter: cellCenter,
    genLevel: genLevel, makeState: makeState, reset: reset,
    canPlace: canPlace, place: place, unplace: unplace, rotate: rotate,
    shadowsAt: shadowsAt, coveredAt: coveredAt, simulate: simulate,
    score: score, starOf: starOf, finish: finish, startRun: startRun, update: update,
    hitTest: hitTest, cardRect: cardRect, ptInRect: ptInRect, inYard: inYard, slots: slots
  };
  return API;
});
