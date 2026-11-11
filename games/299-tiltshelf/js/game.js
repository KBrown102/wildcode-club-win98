/* 299-tiltshelf《归架 · 轻重》 —— 逻辑层（无 DOM，可 node require） */
(function (root) {
  'use strict';

  // ---------- 常量 ----------
  var KINDS = [
    { key: 'porcelain', name: '瓷', wmin: 1, wmax: 3, cn: '瓷' },
    { key: 'wood', name: '木', wmin: 3, wmax: 6, cn: '木' },
    { key: 'stone', name: '石', wmin: 6, wmax: 9, cn: '石' }
  ];

  var KT = 2.2;          // 度 / (格·重)
  var MAXTILT = 26;      // 度
  var SLIDE_T = 1.1;     // 超容差后每 1.1s 滑一格
  var STABLE_T = 1.2;    // 保持水平多久算收工
  var SMOOTH = 11;       // 倾角平滑速率

  var LEVELS = [
    { sh: 1, cols: 6, kinds: 2, items: 4, tol: 16, slack: 1.90, pivOff: 0.0, name: '一格' },
    { sh: 1, cols: 7, kinds: 2, items: 5, tol: 15, slack: 1.80, pivOff: 0.5, name: '偏支' },
    { sh: 2, cols: 6, kinds: 2, items: 6, tol: 14, slack: 1.75, pivOff: 0.5, name: '两层' },
    { sh: 2, cols: 7, kinds: 3, items: 7, tol: 13, slack: 1.65, pivOff: 0.5, name: '三色' },
    { sh: 2, cols: 8, kinds: 3, items: 9, tol: 12, slack: 1.55, pivOff: 1.0, name: '长板' },
    { sh: 3, cols: 7, kinds: 3, items: 10, tol: 11, slack: 1.50, pivOff: 1.0, name: '三层' },
    { sh: 3, cols: 8, kinds: 3, items: 12, tol: 10, slack: 1.42, pivOff: 1.5, name: '斜支' },
    { sh: 3, cols: 9, kinds: 3, items: 14, tol: 9, slack: 1.35, pivOff: 1.5, name: '满架' }
  ];

  // 三星阈值 = strong AI（完美解）各关均分 × [0.30, 0.52, 0.72]，6 种子实测标定
  var STARS = [
    [260, 450, 620], [280, 490, 670], [330, 580, 800], [340, 590, 810],
    [390, 670, 930], [430, 750, 1030], [470, 810, 1120], [500, 870, 1200]
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

  // ---------- 力矩 ----------
  function torqueOf(sh) {
    var M = 0;
    for (var c = 0; c < sh.cols; c++) {
      var it = sh.cells[c];
      if (it) M += it.w * ((c + 0.5) - sh.pivot);
    }
    return M;
  }
  function targetTheta(sh) { return clamp(torqueOf(sh) * KT, -MAXTILT, MAXTILT); }

  // ---------- 生成 ----------
  function splitZones(cols, k, rng) {
    var me = (cols >= k * 2) ? 2 : 1;
    var sizes = new Array(k), i;
    for (i = 0; i < k; i++) sizes[i] = me;
    var rest = cols - k * me;
    while (rest > 0) { sizes[Math.floor(rng() * k)]++; rest--; }
    var order = [];
    for (i = 0; i < k; i++) order.push(i);
    for (i = k - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1)), t = order[i]; order[i] = order[j]; order[j] = t;
    }
    var z = [], seg = 0, cnt = 0;
    for (i = 0; i < cols; i++) {
      z.push(order[seg]); cnt++;
      if (cnt >= sizes[seg]) { seg++; cnt = 0; if (seg >= k) seg = k - 1; }
    }
    return z;
  }

  function buildShelves(cfg, rng) {
    var out = [];
    for (var s = 0; s < cfg.sh; s++) {
      var cols = cfg.cols;
      var pv = cols / 2 + (rng() * 2 - 1) * cfg.pivOff;
      pv = clamp(Math.round(pv * 2) / 2, 1, cols - 1);
      out.push({
        cols: cols, pivot: pv, zones: splitZones(cols, cfg.kinds, rng),
        cells: new Array(cols).fill(null), M: 0, theta: 0, tol: cfg.tol, slideT: 0
      });
    }
    return out;
  }

  // 求解：每件放到「任一层的自己色区」内，最小化 max|M|
  function solve(items, shelves, rng, iters, restarts) {
    var slots = items.map(function (it) {
      var zs = [];
      for (var s = 0; s < shelves.length; s++) {
        for (var c = 0; c < shelves[s].cols; c++) if (shelves[s].zones[c] === it.kind) zs.push({ s: s, c: c });
      }
      return zs;
    });
    var N = items.length;
    if (!N) return { assign: [], maxM: 0 };

    function clearCells() {
      for (var s = 0; s < shelves.length; s++) shelves[s].cells = new Array(shelves[s].cols).fill(null);
    }
    function apply(a) {
      clearCells();
      for (var i = 0; i < N; i++) { shelves[a[i].s].cells[a[i].c] = items[i]; items[i].col = a[i].c; items[i].shelf = a[i].s; }
    }
    function energy() {
      var mx = 0;
      for (var s = 0; s < shelves.length; s++) mx = Math.max(mx, Math.abs(torqueOf(shelves[s])));
      return mx;
    }
    function randAssign() {
      var used = shelves.map(function (s) { return new Array(s.cols).fill(false); });
      var a = new Array(N);
      for (var i = 0; i < N; i++) {
        var free = slots[i].filter(function (p) { return !used[p.s][p.c]; });
        var p = free.length ? free[Math.floor(rng() * free.length)] : slots[i][0];
        used[p.s][p.c] = true; a[i] = { s: p.s, c: p.c };
      }
      return a;
    }
    function freeSlotsOf(i) {
      return slots[i].filter(function (p) { return !shelves[p.s].cells[p.c]; });
    }
    var best = null, bestE = Infinity;
    for (var r = 0; r < restarts; r++) {
      var a = randAssign();
      apply(a);
      var e = energy();
      if (e < bestE) { bestE = e; best = a.map(function (p) { return { s: p.s, c: p.c }; }); }
      for (var it = 0; it < iters; it++) {
        var i = Math.floor(rng() * N);
        var old = a[i];
        var undo = null, o = -1, oOld = null;
        if (rng() < 0.55) {
          var free = freeSlotsOf(i);
          if (!free.length) continue;
          var np = free[Math.floor(rng() * free.length)];
          shelves[old.s].cells[old.c] = null;
          shelves[np.s].cells[np.c] = items[i];
          a[i] = np; undo = 'move';
        } else {
          var same = [];
          for (var q = 0; q < N; q++) if (q !== i && items[q].kind === items[i].kind) same.push(q);
          if (!same.length) continue;
          o = same[Math.floor(rng() * same.length)];
          oOld = a[o];
          if (slots[i].indexOf(oOld) < 0 && !slots[i].some(function (p) { return p.s === oOld.s && p.c === oOld.c; })) continue;
          shelves[old.s].cells[old.c] = items[o]; items[o].col = old.c; items[o].shelf = old.s; a[o] = { s: old.s, c: old.c };
          shelves[oOld.s].cells[oOld.c] = items[i]; items[i].col = oOld.c; items[i].shelf = oOld.s; a[i] = { s: oOld.s, c: oOld.c };
          undo = 'swap';
        }
        var ne = energy();
        if (ne <= e || rng() < 0.05) {
          e = ne;
          if (e < bestE) { bestE = e; best = a.map(function (p) { return { s: p.s, c: p.c }; }); }
        } else if (undo === 'move') {
          shelves[a[i].s].cells[a[i].c] = null;
          shelves[old.s].cells[old.c] = items[i]; items[i].col = old.c; items[i].shelf = old.s; a[i] = old;
        } else {
          var x = a[i], y = a[o];
          shelves[x.s].cells[x.c] = items[o]; items[o].col = x.c; items[o].shelf = x.s; a[o] = x;
          shelves[y.s].cells[y.c] = items[i]; items[i].col = y.c; items[i].shelf = y.s; a[i] = y;
        }
      }
    }
    apply(best);
    return { assign: best, maxM: bestE };
  }

  // 顺序填充（naive）：按队列顺序，每件放进「最靠上、最靠左」的自己色区空格
  function naiveAssign(items, shelves) {
    for (var s = 0; s < shelves.length; s++) shelves[s].cells = new Array(shelves[s].cols).fill(null);
    var a = [];
    for (var i = 0; i < items.length; i++) {
      var put = null;
      for (var s2 = 0; s2 < shelves.length && !put; s2++) {
        for (var c = 0; c < shelves[s2].cols; c++) {
          if (shelves[s2].zones[c] === items[i].kind && !shelves[s2].cells[c]) { put = { s: s2, c: c }; break; }
        }
      }
      if (!put) { a.push(null); continue; }
      shelves[put.s].cells[put.c] = items[i]; items[i].col = put.c; items[i].shelf = put.s;
      a.push(put);
    }
    var mx = 0;
    for (var k = 0; k < shelves.length; k++) mx = Math.max(mx, Math.abs(torqueOf(shelves[k])));
    return { assign: a, maxM: mx };
  }

  function genLevel(lv, seed) {
    var cfg = LEVELS[lv];
    var tolM = cfg.tol / KT;
    var goodM = tolM * 0.55;
    var lastTry = null;
    for (var attempt = 0; attempt < 120; attempt++) {
      var rng = mulberry32(((seed >>> 0) * 7919 + lv * 104729 + attempt * 2654435761) >>> 0);
      var shelves = buildShelves(cfg, rng);
      // 每 kind 的格位数
      var slotsK = new Array(cfg.kinds).fill(0);
      for (var s = 0; s < shelves.length; s++)
        for (var c = 0; c < shelves[s].cols; c++) slotsK[shelves[s].zones[c]]++;
      var total = slotsK.reduce(function (a, b) { return a + b; }, 0);
      var n = Math.min(cfg.items, total, cfg.sh * cfg.cols);
      // 各 kind 件数：均分 + 随机，且 ≤ 格位数
      var want = new Array(cfg.kinds).fill(0);
      var placedN = 0;
      for (var i = 0; i < n; i++) { want[i % cfg.kinds]++; placedN++; }
      for (var k = 0; k < cfg.kinds; k++) {
        while (want[k] > slotsK[k]) {
          var moved = false;
          for (var k2 = 0; k2 < cfg.kinds; k2++) {
            if (k2 !== k && want[k2] < slotsK[k2]) { want[k]--; want[k2]++; moved = true; break; }
          }
          if (!moved) break;
        }
      }
      if (want.reduce(function (a, b) { return a + b; }, 0) !== n) continue;
      var items = [];
      for (var kk = 0; kk < cfg.kinds; kk++) {
        for (var m = 0; m < want[kk]; m++) {
          var K = KINDS[kk];
          items.push({ id: items.length, kind: kk, w: K.wmin + Math.floor(rng() * (K.wmax - K.wmin + 1)), shelf: -1, col: -1 });
        }
      }
      // 打乱（= 队列顺序）
      for (var q = items.length - 1; q > 0; q--) {
        var jj = Math.floor(rng() * (q + 1)), tt = items[q]; items[q] = items[jj]; items[jj] = tt;
      }
      // ⚠️ 打乱后必须重排 id，使 items[id] === 该件（否则 st.items[id] 全错位）
      for (var i5 = 0; i5 < items.length; i5++) items[i5].id = i5;
      var sol = solve(items, shelves, rng, 700, 5);
      if (!(sol.maxM <= goodM)) { lastTry = { why: 'nosol', m: sol.maxM }; continue; }
      var nv = naiveAssign(items, shelves);
      if (nv.maxM <= tolM * 1.02) { lastTry = { why: 'tooeasy', m: nv.maxM }; continue; }
      for (var s2 = 0; s2 < shelves.length; s2++) shelves[s2].cells = new Array(shelves[s2].cols).fill(null);
      for (var i2 = 0; i2 < items.length; i2++) { items[i2].shelf = -1; items[i2].col = -1; }
      return {
        lv: lv, cfg: cfg, shelves: shelves, items: items, plan: sol.assign,
        par: items.length, maxMoves: Math.ceil(items.length * cfg.slack),
        tolM: tolM, solM: sol.maxM, naiveM: nv.maxM, attempt: attempt
      };
    }
    // 兜底：放宽 naive 约束
    for (var a2 = 0; a2 < 120; a2++) {
      var rng2 = mulberry32(((seed >>> 0) * 7919 + lv * 104729 + 90000 + a2 * 40503) >>> 0);
      var sh2 = buildShelves(cfg, rng2);
      var it2 = [];
      for (var m2 = 0; m2 < Math.min(cfg.items, cfg.sh * cfg.cols); m2++)
        it2.push({ id: m2, kind: m2 % cfg.kinds, w: 2 + (m2 % 5), shelf: -1, col: -1 });
      var s3 = solve(it2, sh2, rng2, 700, 5);
      for (var s4 = 0; s4 < sh2.length; s4++) sh2[s4].cells = new Array(sh2[s4].cols).fill(null);
      for (var i4 = 0; i4 < it2.length; i4++) { it2[i4].shelf = -1; it2[i4].col = -1; }
      return {
        lv: lv, cfg: cfg, shelves: sh2, items: it2, plan: s3.assign,
        par: it2.length, maxMoves: Math.ceil(it2.length * cfg.slack),
        tolM: tolM, solM: s3.maxM, naiveM: -1, attempt: 900 + a2
      };
    }
    return null;
  }

  // ---------- 状态 ----------
  function makeState() {
    return {
      lv: 0, seed: 1, cfg: null, shelves: [], items: [], plan: [],
      queue: [], hold: 0, cursor: { s: 0, c: 0 },
      moves: 0, maxMoves: 0, slides: 0, falls: 0,
      stableT: 0, t: 0, over: false, win: false, finalScore: 0,
      events: [], par: 0
    };
  }

  function start(st, lv, seed) {
    var L = genLevel(lv, seed >>> 0);
    st.lv = lv; st.seed = seed >>> 0;
    st.cfg = L.cfg; st.shelves = L.shelves; st.items = L.items; st.plan = L.plan;
    st.par = L.par; st.maxMoves = L.maxMoves; st.solM = L.solM; st.naiveM = L.naiveM;
    st.queue = L.items.map(function (it) { return it.id; });
    for (var i = 0; i < L.items.length; i++) { L.items[i].shelf = -1; L.items[i].col = -1; }
    st.hold = 0; st.cursor = { s: 0, c: 0 };
    st.moves = 0; st.slides = 0; st.falls = 0; st.stableT = 0; st.t = 0;
    st.over = false; st.win = false; st.finalScore = 0; st.events = [];
    for (var s = 0; s < st.shelves.length; s++) {
      var sh = st.shelves[s]; sh.cells = new Array(sh.cols).fill(null); sh.M = 0; sh.theta = 0; sh.slideT = 0;
    }
    for (var k = 0; k < st.shelves.length; k++) st.shelves[k].theta = targetTheta(st.shelves[k]);
    return st;
  }

  function itemById(st, id) { return st.items[id]; }
  function heldItem(st) {
    if (!st.queue.length) return null;
    st.hold = clamp(st.hold, 0, st.queue.length - 1);
    return st.items[st.queue[st.hold]];
  }
  function cycleHold(st, d) {
    if (!st.queue.length) return;
    st.hold = (st.hold + d + st.queue.length) % st.queue.length;
    st.events.push({ t: 'hold', id: st.queue[st.hold] });
  }
  function setHold(st, idx) {
    if (idx < 0 || idx >= st.queue.length) return false;
    st.hold = idx;
    st.events.push({ t: 'hold', id: st.queue[idx] });
    return true;
  }
  function holdIndexById(st, id) {
    for (var i = 0; i < st.queue.length; i++) if (st.queue[i] === id) return i;
    return -1;
  }
  function moveCursor(st, ds, dc) {
    if (!st.shelves.length) return;
    st.cursor.s = clamp(st.cursor.s + ds, 0, st.shelves.length - 1);
    st.cursor.c = clamp(st.cursor.c + dc, 0, st.shelves[st.cursor.s].cols - 1);
  }
  function setCursor(st, s, c) {
    if (s < 0 || s >= st.shelves.length) return;
    st.cursor.s = s; st.cursor.c = clamp(c, 0, st.shelves[s].cols - 1);
  }
  function refresh(st) {
    for (var s = 0; s < st.shelves.length; s++) st.shelves[s].M = torqueOf(st.shelves[s]);
  }
  function place(st, s, c) {
    if (st.over) return false;
    if (s < 0 || s >= st.shelves.length) return false;
    var sh = st.shelves[s];
    if (c < 0 || c >= sh.cols) return false;
    if (sh.cells[c]) return false;
    if (st.moves >= st.maxMoves) return false;
    var it = heldItem(st);
    if (!it) return false;
    sh.cells[c] = it; it.shelf = s; it.col = c;
    st.queue.splice(st.hold, 1);
    if (st.hold >= st.queue.length) st.hold = 0;
    st.moves++;
    st.events.push({ t: 'place', id: it.id, s: s, c: c, kind: it.kind, w: it.w });
    refresh(st);
    return true;
  }
  function pickup(st, s, c) {
    if (st.over) return false;
    if (s < 0 || s >= st.shelves.length) return false;
    var sh = st.shelves[s];
    if (c < 0 || c >= sh.cols) return false;
    var it = sh.cells[c];
    if (!it) return false;
    sh.cells[c] = null;
    it.shelf = -1; it.col = -1;
    st.queue.push(it.id);
    st.hold = st.queue.length - 1;
    st.events.push({ t: 'pick', id: it.id, s: s, c: c });
    refresh(st);
    return true;
  }
  function tapCell(st, s, c) {
    var sh = st.shelves[s];
    if (!sh) return false;
    if (sh.cells[c]) return pickup(st, s, c);
    return place(st, s, c);
  }

  // ---------- 滑动 ----------
  function moveTo(st, sh, from, to) {
    var it = sh.cells[from];
    sh.cells[from] = null; sh.cells[to] = it; it.col = to;
    st.slides++;
    st.events.push({ t: 'slide', id: it.id, s: st.shelves.indexOf(sh), from: from, to: to });
    refresh(st);
  }
  function dropItem(st, sh, c) {
    var it = sh.cells[c];
    sh.cells[c] = null; it.shelf = -1; it.col = -1;
    st.queue.push(it.id);
    st.falls++;
    st.events.push({ t: 'fall', id: it.id, s: st.shelves.indexOf(sh), c: c });
    refresh(st);
  }
  function slideShelf(st, sh) {
    var dir = sh.M > 0 ? 1 : -1;
    if (dir > 0) {
      for (var c = 0; c < sh.cols; c++) {
        if (!sh.cells[c]) continue;
        if (c + 1 >= sh.cols) { dropItem(st, sh, c); return true; }
        if (!sh.cells[c + 1]) { moveTo(st, sh, c, c + 1); return true; }
      }
    } else {
      for (var c2 = sh.cols - 1; c2 >= 0; c2--) {
        if (!sh.cells[c2]) continue;
        if (c2 - 1 < 0) { dropItem(st, sh, c2); return true; }
        if (!sh.cells[c2 - 1]) { moveTo(st, sh, c2, c2 - 1); return true; }
      }
    }
    return false;
  }

  // ---------- 分数 ----------
  function placedCount(st) {
    var n = 0;
    for (var i = 0; i < st.items.length; i++) if (st.items[i].shelf >= 0) n++;
    return n;
  }
  function zonedCount(st) {
    var n = 0;
    for (var i = 0; i < st.items.length; i++) {
      var it = st.items[i];
      if (it.shelf >= 0 && st.shelves[it.shelf].zones[it.col] === it.kind) n++;
    }
    return n;
  }
  function score(st) {
    if (st.over) return st.finalScore;
    var total = st.items.length || 1;
    var comp = placedCount(st) / total;
    var zone = 55 * zonedCount(st);
    var bal = 0;
    for (var s = 0; s < st.shelves.length; s++) {
      var sh = st.shelves[s];
      var f = Math.max(0, 1 - Math.min(1, Math.abs(sh.theta) / sh.tol));
      bal += 140 * f * f;
    }
    bal *= comp;
    var eff = st.win ? Math.round(300 * clamp(st.par / Math.max(1, st.moves), 0, 1) * comp) : 0;
    var clear = st.win ? 220 : 0;
    return Math.round(zone + bal + eff + clear);
  }
  function starsOf(sc, thr) {
    var n = 0;
    for (var i = 0; i < thr.length; i++) if (sc >= thr[i]) n++;
    return n;
  }

  // ---------- 主循环 ----------
  function update(st, dt) {
    st.events.length = 0;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.05) dt = 0.05;
    st.t += dt;
    var s, sh;
    for (s = 0; s < st.shelves.length; s++) {
      sh = st.shelves[s];
      sh.M = torqueOf(sh);
      var tgt = clamp(sh.M * KT, -MAXTILT, MAXTILT);
      sh.theta += (tgt - sh.theta) * Math.min(1, dt * SMOOTH);
      if (Math.abs(sh.theta - tgt) < 0.02) sh.theta = tgt;
    }
    if (!st.over) {
      for (s = 0; s < st.shelves.length; s++) {
        sh = st.shelves[s];
        if (Math.abs(sh.theta) > sh.tol) {
          sh.slideT += dt;
          if (sh.slideT >= SLIDE_T) { sh.slideT = 0; slideShelf(st, sh); }
        } else sh.slideT = 0;
      }
    }
    var placed = placedCount(st), zoned = zonedCount(st), balanced = true;
    for (s = 0; s < st.shelves.length; s++) if (Math.abs(st.shelves[s].theta) > st.shelves[s].tol) balanced = false;
    var done = (placed === st.items.length && zoned === st.items.length && balanced);
    if (done && !st.over) {
      st.stableT += dt;
      if (st.stableT >= STABLE_T) {
        st.win = true;                    // ⚠️ 先置 win（eff/clear 要算）→ 再算分 → 最后才置 over 冻结
        var fs1 = score(st);
        st.over = true;
        st.finalScore = fs1;
        st.events.push({ t: 'clear', score: st.finalScore });
      }
    } else st.stableT = 0;

    if (!st.over && st.moves >= st.maxMoves) {
      var fs2 = score(st);
      st.over = true; st.win = false;
      st.finalScore = fs2;
      st.events.push({ t: 'end', score: st.finalScore });
    }
    return st;
  }

  var API = {
    KINDS: KINDS, LEVELS: LEVELS, STARS: STARS, KT: KT, MAXTILT: MAXTILT, SLIDE_T: SLIDE_T, STABLE_T: STABLE_T,
    mulberry32: mulberry32, clamp: clamp,
    genLevel: genLevel, makeState: makeState, start: start,
    torqueOf: torqueOf, targetTheta: targetTheta, solve: solve, naiveAssign: naiveAssign,
    heldItem: heldItem, cycleHold: cycleHold, setHold: setHold, holdIndexById: holdIndexById,
    moveCursor: moveCursor, setCursor: setCursor,
    place: place, pickup: pickup, tapCell: tapCell,
    placedCount: placedCount, zonedCount: zonedCount, score: score, starsOf: starsOf, update: update
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.SC299 = API;
})(typeof window !== 'undefined' ? window : globalThis);
