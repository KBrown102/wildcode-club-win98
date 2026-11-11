/* 295-bentopress《便当 · 压格子》 — 纯逻辑层（零 DOM / 零 Canvas，Node 可 require 冒烟）
 * 核心机制：【挤压形变】—— 软食材可以在「宽/高」两轴之间互相兑换，
 *   压扁 = (w+1, h-1)；压长 = (w-1, h+1)。
 *   ★ 关键：这不是体积守恒！新面积 = w*h + (被压轴 - 另一轴 - 1)。
 *     越扁长的压了越大（1×3 → 2×2，3→4 格），越方正的压了越小（2×2 → 1×3，4→3 格）。
 *     于是「压几下、往哪个方向压」是真决策，形变路径本身就是谜题。
 *   ★ 不变量：w + h 恒定。所以某个食材的可达形状只有 (w, S-w) 这 S-1 种，
 *     从 base 走到 (W,H) 的最少压次数 = |W - w0|。
 */
(function (root, factory) {
  var API = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BENTO = API;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  /* ---------------- 关卡配置 ---------------- */
  // cols/rows 便当盒格数；n 食材数；walls 隔板数；soft 软食材占比；slack 揉捏配额余量
  var LEVELS = [
    { cols: 7, rows: 5, n: 6, walls: 1, soft: 1.00, slack: 2, name: '梅之盒' },
    { cols: 7, rows: 5, n: 6, walls: 2, soft: 0.90, slack: 2, name: '竹之盒' },
    { cols: 8, rows: 6, n: 8, walls: 2, soft: 0.85, slack: 2, name: '松之盒' },
    { cols: 8, rows: 6, n: 8, walls: 3, soft: 0.75, slack: 2, name: '樱之盒' },
    { cols: 9, rows: 6, n: 9, walls: 3, soft: 0.65, slack: 1, name: '枫之盒' },
    { cols: 9, rows: 6, n: 10, walls: 4, soft: 0.58, slack: 1, name: '月之盒' },
    { cols: 9, rows: 7, n: 11, walls: 5, soft: 0.52, slack: 1, name: '雪之盒' },
    { cols: 9, rows: 7, n: 12, walls: 6, soft: 0.45, slack: 1, name: '漆之盒' },
  ];

  /* ---------------- 食材目录（孔版印刷专色） ---------------- */
  var SOFT = [
    { n: '饭团', c: '#EADFC4', c2: '#CDBB96' },
    { n: '玉子', c: '#E0A93B', c2: '#BC8A22' },
    { n: '黄瓜', c: '#6E8B5B', c2: '#516B3F' },
    { n: '番茄', c: '#D8503A', c2: '#AE3B28' },
    { n: '海带', c: '#3E5A46', c2: '#2A4032' },
    { n: '鲑鱼', c: '#E27B5A', c2: '#BE5C3D' },
    { n: '煎蛋', c: '#F0C24B', c2: '#CE9F2C' },
  ];
  var HARD = [
    { n: '炸虾', c: '#E08A45', c2: '#BB6A2A' },
    { n: '鱼板', c: '#EFDCE2', c2: '#CBB2BC' },
    { n: '梅干', c: '#A63A4A', c2: '#822937' },
    { n: '唐扬', c: '#C98A3E', c2: '#A56B27' },
  ];

  var CELL = 46;

  /* ---------------- 随机数 ---------------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rnd) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* ---------------- 关卡生成：递归切分（保证必定有解） ----------------
   * 先把整个便当盒用「断头台切割」切成 n + walls 个矩形叶子（每次切面积最大的那块、
   * 沿长边切），其中 walls 块当木质隔板、其余 n 块就是食材的**最终形态**。
   * 于是：① 盒子一定装得满（面积严格相等）② 每个食材的最终形状已知
   *      ③ 由 w+h 不变量反推它的初始形状与最少压次数 → par 可精确计算。
   */
  function guillotine(W, H, target, rnd) {
    var leaves = [{ x: 0, y: 0, w: W, h: H }];
    var guard = 0;
    while (leaves.length < target && guard++ < 800) {
      var idx = -1, best = -1;
      for (var i = 0; i < leaves.length; i++) {
        var a = leaves[i].w * leaves[i].h;
        if (a > best + 1e-9) { best = a; idx = i; }
      }
      // 平局随机，避免总是切左上角
      for (var k = 0; k < leaves.length; k++) {
        if (Math.abs(leaves[k].w * leaves[k].h - best) < 1e-9 && rnd() < 0.35) { idx = k; break; }
      }
      var L = leaves[idx];
      var vert = L.w >= L.h;
      if (vert) {
        if (L.w < 2) return null;
        var ms = L.w >= 4 ? 2 : 1;
        if (L.w - ms < ms) return null;
        var cw = ms + Math.floor(rnd() * (L.w - 2 * ms + 1));
        leaves.splice(idx, 1,
          { x: L.x, y: L.y, w: cw, h: L.h },
          { x: L.x + cw, y: L.y, w: L.w - cw, h: L.h });
      } else {
        if (L.h < 2) return null;
        var ms2 = L.h >= 4 ? 2 : 1;
        if (L.h - ms2 < ms2) return null;
        var ch = ms2 + Math.floor(rnd() * (L.h - 2 * ms2 + 1));
        leaves.splice(idx, 1,
          { x: L.x, y: L.y, w: L.w, h: ch },
          { x: L.x, y: L.y + ch, w: L.w, h: L.h - ch });
      }
    }
    return leaves.length === target ? leaves : null;
  }

  function genLevel(li, seed) {
    var cfg = LEVELS[li];
    var target = cfg.n + cfg.walls;
    var leaves = null;
    for (var att = 0; att < 900; att++) {
      var rnd = mulberry32(seed * 7919 + li * 104729 + att * 31 + 1);
      var cand = guillotine(cfg.cols, cfg.rows, target, rnd);
      if (!cand) continue;
      var ok = true;
      for (var i = 0; i < cand.length; i++) {
        var l = cand[i];
        if (l.w * l.h < 2 || l.w > 4 || l.h > 4) { ok = false; break; }
      }
      if (ok) { leaves = cand; break; }
    }
    if (!leaves) {
      // 兜底：退化成条状切分，保证一定有产出
      leaves = [];
      var y = 0;
      for (var q = 0; q < target; q++) {
        var hh = q === target - 1 ? cfg.rows - y : Math.max(1, Math.floor(cfg.rows / target));
        leaves.push({ x: 0, y: y, w: cfg.cols, h: Math.max(1, hh) });
        y += hh;
      }
    }

    var rnd2 = mulberry32(seed * 2654435761 + li * 40503 + 17);
    // 最细长的几块当隔板（视觉上就是木条）
    var order = leaves.map(function (l, i) { return i; });
    order.sort(function (a, b) {
      var A = leaves[a], B = leaves[b];
      var ra = Math.max(A.w, A.h) / Math.min(A.w, A.h);
      var rb = Math.max(B.w, B.h) / Math.min(B.w, B.h);
      return rb - ra;
    });
    var wallSet = {};
    for (var wI = 0; wI < cfg.walls; wI++) wallSet[order[wI]] = 1;

    var items = [], minTotal = 0, id = 0, softIdx = 0, hardIdx = 0;
    for (var m = 0; m < leaves.length; m++) {
      var L = leaves[m];
      if (wallSet[m]) continue;
      var W = L.w, H = L.h, S = W + H;
      var isSoft = rnd2() < cfg.soft && S >= 3;
      var it;
      if (!isSoft) {
        var hd = HARD[(hardIdx++) % HARD.length];
        it = { name: hd.n, ink: hd.c, ink2: hd.c2, soft: false, w0: W, h0: H, minP: 0, quota: 0 };
      } else {
        var sf = SOFT[(softIdx++) % SOFT.length];
        // 想让它压 d 下：w0 = W ± d（夹到 [1, S-1]），h0 = S - w0
        var d = 1 + (rnd2() < 0.35 ? 1 : 0);
        var w0;
        if (W - d >= 1 && (rnd2() < 0.5 || W + d > S - 1)) w0 = W - d; else w0 = W + d;
        w0 = clamp(w0, 1, S - 1);
        d = Math.abs(W - w0);
        if (d === 0) { // 退化成硬食材
          it = { name: sf.n, ink: sf.c, ink2: sf.c2, soft: false, w0: W, h0: H, minP: 0, quota: 0 };
        } else {
          it = {
            name: sf.n, ink: sf.c, ink2: sf.c2, soft: true,
            w0: w0, h0: S - w0, minP: d, quota: Math.min(4, d + cfg.slack),
          };
        }
      }
      it.id = id++;
      it.S = it.w0 + it.h0;
      it.w = it.w0; it.h = it.h0;
      it.used = 0;
      it.placed = false; it.gx = 0; it.gy = 0;
      it.solX = L.x; it.solY = L.y; it.solW = W; it.solH = H;
      it.dots = Math.floor(rnd2() * 3) + 2;
      items.push(it);
      minTotal += it.minP;
    }

    var wallsArr = [];
    for (var m2 = 0; m2 < leaves.length; m2++) if (wallSet[m2]) wallsArr.push(leaves[m2]);

    return {
      li: li, seed: seed, cfg: cfg, cols: cfg.cols, rows: cfg.rows,
      items: items, walls: wallsArr, leaves: leaves,
      minTotal: minTotal, par: minTotal + 2,
      order: shuffle(items.map(function (it) { return it.id; }), mulberry32(seed * 97 + li * 13 + 5)),
    };
  }

  /* ---------------- 状态 ---------------- */
  function newState(li, seed) {
    var L = genLevel(li, seed);
    var occ = new Int16Array(L.cols * L.rows);
    occ.fill(-1);
    for (var i = 0; i < L.walls.length; i++) {
      var wl = L.walls[i];
      for (var y = wl.y; y < wl.y + wl.h; y++)
        for (var x = wl.x; x < wl.x + wl.w; x++) occ[y * L.cols + x] = -2;
    }
    return {
      li: li, seed: seed, L: L, cols: L.cols, rows: L.rows,
      occ: occ, items: L.items, walls: L.walls,
      queue: L.order.slice(),
      sel: { kind: null, id: -1 },
      par: L.par, minTotal: L.minTotal,
      presses: 0, t: 0, events: [],
      lid: null, finished: false,
    };
  }

  function itemById(st, id) { return st.items[id]; }

  function canPlace(st, x, y, w, h, ignoreId) {
    if (x < 0 || y < 0 || x + w > st.cols || y + h > st.rows) return false;
    for (var dy = 0; dy < h; dy++) {
      for (var dx = 0; dx < w; dx++) {
        var v = st.occ[(y + dy) * st.cols + (x + dx)];
        if (v !== -1 && v !== ignoreId) return false;
      }
    }
    return true;
  }

  function fill(st, x, y, w, h, v) {
    for (var dy = 0; dy < h; dy++)
      for (var dx = 0; dx < w; dx++) st.occ[(y + dy) * st.cols + (x + dx)] = v;
  }

  /* ---------------- 操作 ---------------- */
  function selQueue(st, iid) {
    if (st.queue.indexOf(iid) < 0) return false;
    st.sel = { kind: 'queue', id: iid };
    return true;
  }
  function selPlaced(st, iid) {
    var it = itemById(st, iid);
    if (!it || !it.placed) return false;
    st.sel = { kind: 'placed', id: iid };
    return true;
  }
  function selected(st) {
    if (!st.sel || st.sel.kind === null) return null;
    return itemById(st, st.sel.id) || null;
  }

  function placeAt(st, x, y) {
    var it = selected(st);
    if (!it) return false;
    var ignore = it.placed ? it.id : -1;
    if (!canPlace(st, x, y, it.w, it.h, ignore)) return false;
    if (it.placed) fill(st, it.gx, it.gy, it.w, it.h, -1);
    else {
      var qi = st.queue.indexOf(it.id);
      if (qi >= 0) st.queue.splice(qi, 1);
    }
    fill(st, x, y, it.w, it.h, it.id);
    it.placed = true; it.gx = x; it.gy = y;
    st.sel = { kind: 'placed', id: it.id };
    st.events.push({ t: 'place', id: it.id });
    checkDone(st);
    return true;
  }

  function pickup(st) {
    var it = selected(st);
    if (!it || !it.placed) return false;
    fill(st, it.gx, it.gy, it.w, it.h, -1);
    it.placed = false;
    st.queue.push(it.id);
    st.sel = { kind: 'queue', id: it.id };
    st.events.push({ t: 'pick' });
    return true;
  }

  // dir: 'flat' 压扁 (w+1,h-1) | 'long' 压长 (w-1,h+1)
  function tryPress(st, dir) {
    var it = selected(st);
    if (!it) { st.events.push({ t: 'refuse' }); return false; }
    if (!it.soft) { st.events.push({ t: 'refuse', why: 'hard' }); return false; }
    if (it.used >= it.quota) { st.events.push({ t: 'refuse', why: 'quota' }); return false; }
    var nw = dir === 'flat' ? it.w + 1 : it.w - 1;
    var nh = dir === 'flat' ? it.h - 1 : it.h + 1;
    if (nw < 1 || nh < 1) { st.events.push({ t: 'refuse', why: 'shape' }); return false; }
    if (it.placed && !canPlace(st, it.gx, it.gy, nw, nh, it.id)) {
      st.events.push({ t: 'refuse', why: 'space' }); return false;
    }
    if (it.placed) fill(st, it.gx, it.gy, it.w, it.h, -1);
    it.w = nw; it.h = nh; it.used++;
    st.presses++;
    if (it.placed) fill(st, it.gx, it.gy, it.w, it.h, it.id);
    st.events.push({ t: 'press', dir: dir, id: it.id });
    checkDone(st);
    return true;
  }

  // 键盘/无鼠标可用：扫到第一个合法位置就落（扫描序 = 行优先）
  function autoPlace(st) {
    var it = selected(st);
    if (!it) return false;
    for (var y = 0; y <= st.rows - it.h; y++)
      for (var x = 0; x <= st.cols - it.w; x++)
        if (canPlace(st, x, y, it.w, it.h, it.placed ? it.id : -1)) return placeAt(st, x, y);
    st.events.push({ t: 'refuse', why: 'space' });
    return false;
  }

  function checkDone(st) {
    var all = true;
    for (var i = 0; i < st.items.length; i++) if (!st.items[i].placed) { all = false; break; }
    if (all && !st.lid && !st.finished) {
      st.lid = { t: 0, dur: 0.95 };
      st.events.push({ t: 'lid' });
    }
  }

  /* ---------------- 评分 ---------------- */
  function score(st) {
    var placed = 0;
    for (var i = 0; i < st.items.length; i++) if (st.items[i].placed) placed++;
    var all = placed === st.items.length;
    var over = Math.max(0, st.presses - st.par);
    var look = clamp(100 - 8 * over, 35, 100);
    // ⚠️ 硬约束：卖相分必须随完成度缩放。否则「一个都没放」也能拿满卖相分
    //   = 不操作白拿分 = 核心机制必要性崩塌（项目 MEMORY 294 教训）。
    var lookPt = Math.round(look * 1.5 * placed / st.items.length);
    var total = placed * 10 + lookPt + (all ? 90 : 0);
    var stars = 0;
    if (all) stars = st.presses <= st.par ? 3 : (st.presses <= st.par + 4 ? 2 : 1);
    return { placed: placed, total: placed, all: all, look: Math.round(look), presses: st.presses, score: total, stars: stars };
  }

  /* ---------------- AI（供冒烟对照，不参与游戏） ---------------- */
  // 枚举某食材在配额内所有可达形状（w from max(1,w0-quota) .. min(S-1, w0+quota)）
  function reachable(it, quotaLimit) {
    var q = quotaLimit === undefined ? it.quota : quotaLimit;
    var out = [], S = it.S;
    var lo = Math.max(1, it.w0 - q), hi = Math.min(S - 1, it.w0 + q);
    for (var w = lo; w <= hi; w++) out.push({ w: w, h: S - w, k: Math.abs(w - it.w0) });
    return out;
  }

  function countFrag(st) {
    var frag = 0;
    for (var y = 0; y < st.rows; y++) for (var x = 0; x < st.cols; x++) {
      if (st.occ[y * st.cols + x] !== -1) continue;
      var n = 0;
      if (x > 0 && st.occ[y * st.cols + x - 1] === -1) n++;
      if (x < st.cols - 1 && st.occ[y * st.cols + x + 1] === -1) n++;
      if (y > 0 && st.occ[(y - 1) * st.cols + x] === -1) n++;
      if (y < st.rows - 1 && st.occ[(y + 1) * st.cols + x] === -1) n++;
      if (n <= 1) frag++;
    }
    return frag;
  }

  function contact(st, x, y, w, h, ignore) {
    var c = 0;
    for (var dy = -1; dy <= h; dy++) for (var dx = -1; dx <= w; dx++) {
      var inside = dx >= 0 && dx < w && dy >= 0 && dy < h;
      if (inside) continue;
      var nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= st.cols || ny >= st.rows) { c++; continue; }
      var v = st.occ[ny * st.cols + nx];
      if (v !== -1 && v !== ignore) c++;
    }
    return c;
  }

  function applyPressTo(st, it, targetW) {
    var dir = targetW > it.w ? 'flat' : 'long';
    var k = Math.abs(targetW - it.w);
    for (var i = 0; i < k; i++) if (!tryPress(st, dir)) return false;
    return true;
  }

  // 贪心 AI：按面积降序放，对每个食材枚举「可达形状 × 所有位置」，
  // 选 碎片最少 + 贴合度最高 的那个。quotaLimit=0 即「不准压」对照。
  function aiGreedy(st, opts) {
    opts = opts || {};
    var quotaLimit = opts.quotaLimit;
    var rnd = opts.rnd || mulberry32(12345);
    var pool = st.items.slice();
    pool.sort(function (a, b) { return b.w0 * b.h0 - a.w0 * a.h0; });
    if (opts.shuffleOrder) shuffle(pool, rnd);

    for (var p = 0; p < pool.length; p++) {
      var it = pool[p];
      st.sel = { kind: 'queue', id: it.id };
      var shapes = it.soft ? reachable(it, quotaLimit) : [{ w: it.w0, h: it.h0, k: 0 }];
      if (opts.shuffleOrder) shuffle(shapes, rnd);
      var best = null;
      for (var si = 0; si < shapes.length; si++) {
        var sh = shapes[si];
        for (var y = 0; y <= st.rows - sh.h; y++) {
          for (var x = 0; x <= st.cols - sh.w; x++) {
            if (!canPlace(st, x, y, sh.w, sh.h, -1)) continue;
            fill(st, x, y, sh.w, sh.h, -99);
            var frag = countFrag(st);
            fill(st, x, y, sh.w, sh.h, -1);
            var ct = contact(st, x, y, sh.w, sh.h, -99);
            var v = -frag * 12 + ct * 1.0 - sh.k * 1.2 + (opts.randomize ? rnd() * 6 : 0);
            if (!best || v > best.v) best = { v: v, w: sh.w, x: x, y: y };
          }
        }
      }
      if (!best) continue;
      if (!applyPressTo(st, it, best.w)) continue;
      if (!placeAt(st, best.x, best.y)) { /* 理论上不会失败 */ }
    }
    return score(st);
  }

  // 正解 AI：直接用生成时的摆放（par-2 次压，理论最优）
  function aiOracle(st) {
    for (var i = 0; i < st.items.length; i++) {
      var it = st.items[i];
      st.sel = { kind: 'queue', id: it.id };
      applyPressTo(st, it, it.solW);
      placeAt(st, it.solX, it.solY);
    }
    return score(st);
  }

  function aiNoop() { return { placed: 0, total: 0, all: false, look: 100, presses: 0, score: 0, stars: 0 }; }

  function aiRandom(st, opts) {
    opts = opts || {};
    var rnd = opts.rnd || mulberry32(999);
    var pool = st.items.slice();
    shuffle(pool, rnd);
    for (var p = 0; p < pool.length; p++) {
      var it = pool[p];
      st.sel = { kind: 'queue', id: it.id };
      var shapes = it.soft ? reachable(it, it.quota) : [{ w: it.w0, h: it.h0, k: 0 }];
      var sh = shapes[Math.floor(rnd() * shapes.length)];
      applyPressTo(st, it, sh.w);
      var tries = 0;
      while (tries++ < 24) {
        var x = Math.floor(rnd() * (st.cols - it.w + 1));
        var y = Math.floor(rnd() * (st.rows - it.h + 1));
        if (placeAt(st, x, y)) break;
      }
    }
    return score(st);
  }

  return {
    LEVELS: LEVELS, SOFT: SOFT, HARD: HARD, CELL: CELL,
    mulberry32: mulberry32, clamp: clamp,
    genLevel: genLevel, newState: newState,
    canPlace: canPlace, placeAt: placeAt, pickup: pickup, tryPress: tryPress,
    selQueue: selQueue, selPlaced: selPlaced, selected: selected, autoPlace: autoPlace,
    score: score, reachable: reachable, countFrag: countFrag,
    aiGreedy: aiGreedy, aiOracle: aiOracle, aiRandom: aiRandom, aiNoop: aiNoop,
    itemById: itemById,
  };
});
