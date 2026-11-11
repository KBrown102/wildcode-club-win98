/* 308-stonestack · 叠石 · 一溪
 * 纯逻辑层：零 DOM / 零 Canvas，可在 Node 里 require 做冒烟与 AI 对照。
 * 核心机制：重心必须落在支撑区间内 + 溪水横推（浸没越深推力越大）+ 石形歪斜累积倾斜。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SS308 = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var W = 900, H = 600;
  var BED_Y = 452;        // 基石顶面
  var CX = 372;           // 塔中心线
  var XMIN = 52, XMAX = 688;
  var MIN_OVERLAP = 15;    // 接触面最小重叠
  var K_FLOW = 0.020;     // 水推力系数（全塔受力，浸没越深力越大）
  var BASKET = 3;
  var STABLE_FULL = 26;   // 稳定度满分余量
  var COLLAPSE_TIME = 5;  // 塌一次扣时
  var MAX_TILT = 0.24;

  // ── 关卡表 ──────────────────────────────────────────
  var LEVELS = [
    { name: '浅濑', goalY: 356, waterY: 462, flow: 0.26, bw: 164, wMin: 52, wMax: 100, slope: 0.000, tmax: 60 },
    { name: '过膝', goalY: 330, waterY: 450, flow: 0.30, bw: 168, wMin: 52, wMax: 102, slope: 0.012, tmax: 70 },
    { name: '渐深', goalY: 306, waterY: 438, flow: 0.46, bw: 158, wMin: 48, wMax: 96,  slope: 0.020, tmax: 80 },
    { name: '中流', goalY: 282, waterY: 426, flow: 0.60, bw: 148, wMin: 44, wMax: 90,  slope: 0.028, tmax: 90 },
    { name: '洄湾', goalY: 258, waterY: 414, flow: 0.72, bw: 138, wMin: 40, wMax: 84,  slope: 0.036, tmax: 100 },
    { name: '急湍', goalY: 240, waterY: 402, flow: 0.82, bw: 128, wMin: 38, wMax: 80,  slope: 0.044, tmax: 112 },
    { name: '穿石', goalY: 220, waterY: 392, flow: 0.92, bw: 120, wMin: 36, wMax: 76,  slope: 0.052, tmax: 124 },
    { name: '一柱', goalY: 200, waterY: 382, flow: 1.00, bw: 112, wMin: 34, wMax: 74,  slope: 0.060, tmax: 136 }
  ];
  // 石堆总量 = 目标层数 + 余量（塌一次就少一块，余量是唯一的容错）
  var SLACK = [3, 3, 3, 3, 2, 2, 2, 2];

  var POEMS = [
    '一块石，压住一寸急流',
    '水深没膝，石自岿然',
    '渐深之处，重心要低',
    '中流最急，宽石在下',
    '洄湾回头，塔往上游偏',
    '急湍之下，一寸不让',
    '水滴石穿，也是这样叠起来的',
    '一柱擎起，溪声自远'
  ];

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function goalLayers(L) { return Math.max(1, Math.ceil((BED_Y - L.goalY) / 25)); }

  // ── 随机数 ──────────────────────────────────────────
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // ── 石块几何 ────────────────────────────────────────
  // 以「底面中心」为锚：th 是相对竖直的累计倾角（右倾为正）
  function geom(t, topY, prevTh) {
    t.y = topY;
    t.th = clamp(prevTh + t.s, -MAX_TILT, MAX_TILT);
    var c = Math.cos(t.th), sn = Math.sin(t.th);
    t.ty = t.y - t.h * c;          // 顶面中心 y
    t.tx = t.x + t.h * sn;         // 顶面中心 x
    t.cx = t.x + (t.h * 0.5) * sn; // 重心 x
    t.cy = t.y - (t.h * 0.5) * c;  // 重心 y
    var hw = (t.w * 0.5) * c;
    t.bL = t.x - hw; t.bR = t.x + hw;
    t.tL = t.tx - hw; t.tR = t.tx + hw;
    t.m = t.w * t.h / 1000;
    return t;
  }

  function makeStone(id, rnd, L) {
    var w = Math.round(L.wMin + (L.wMax - L.wMin) * rnd());
    var h = Math.round(21 + 10 * rnd());
    // 歪斜带「顺流」偏置：水把石头都往同一边冲歪，倾斜会一层层累积
    var s = ((rnd() * 2 - 1) + 0.35) * L.slope;
    return {
      id: id, w: w, h: h, s: s, tone: (rnd() * 4) | 0,
      rough: rnd(), x: 0, y: 0, th: 0, tx: 0, ty: 0, cx: 0, cy: 0,
      bL: 0, bR: 0, tL: 0, tR: 0, m: 0
    };
  }

  // ── 关卡生成 ────────────────────────────────────────
  function genPool(li, seed) {
    var L = LEVELS[li], rnd = mulberry32(seed * 7919 + li * 131 + 17);
    var n = goalLayers(L) + SLACK[li];
    var arr = [], i;
    for (i = 0; i < n; i++) arr.push(makeStone(i, rnd, L));
    // 洗牌
    for (i = arr.length - 1; i > 0; i--) {
      var j = (rnd() * (i + 1)) | 0, t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    for (i = 0; i < arr.length; i++) arr[i].id = i;
    return arr;
  }

  function newState(li, seed) {
    var L = LEVELS[li];
    var st = {
      li: li, seed: seed, L: L,
      goalY: L.goalY, waterY: L.waterY, flow: L.flow, bw: L.bw,
      tmax: L.tmax, time: L.tmax, t: 0,
      pool: genPool(li, seed), pnext: 0,
      basket: [], tower: [], sel: 0,
      lost: 0, collapses: 0, used: 0,
      margin: 999, margins: [], weak: -1,
      win: false, over: false, finalScore: 0,
      ev: []
    };
    for (var i = 0; i < BASKET; i++) st.basket.push(nextStone(st));
    st.sel = firstBasket(st);
    analyze(st);
    return st;
  }

  function nextStone(st) {
    if (st.pnext >= st.pool.length) return null;
    return st.pool[st.pnext++];
  }
  function firstBasket(st) {
    for (var i = 0; i < BASKET; i++) if (st.basket[i]) return i;
    return 0;
  }

  // ── 水推力 ──────────────────────────────────────────
  // 整座塔都受横推：浸在水里的吃水推，露出水面的吃溪风（更弱）。
  // 力臂 = 接触面到该石块重心的垂直距离 → 底层承受的倾覆力矩最大。
  function flowForce(st, t) {
    if (st.flow <= 0) return 0;
    var sub = clamp((t.cy - st.waterY) / (t.h * 0.5) + 0.5, 0, 1);
    return K_FLOW * st.flow * t.w * (0.35 + 0.65 * sub);
  }

  // ── 稳定分析 ────────────────────────────────────────
  // 对每个接触面 j：其上方所有石块的合成重心（含水推力的等效偏移）必须落在支撑区间内
  function analyze(st) {
    var T = st.tower, n = T.length, i, j;
    st.margins = [];
    st.weak = -1;
    if (!n) { st.margin = 999; st.layers = 0; st.topY = BED_Y; return st; }
    var F = new Array(n);
    for (i = 0; i < n; i++) F[i] = flowForce(st, T[i]);
    var worst = 1e9;
    for (j = 0; j < n; j++) {
      var sL, sR;
      if (j === 0) { sL = CX - st.bw / 2; sR = CX + st.bw / 2; }
      else { sL = T[j - 1].tL; sR = T[j - 1].tR; }
      var oL = Math.max(T[j].bL, sL), oR = Math.min(T[j].bR, sR);
      if (oR - oL < MIN_OVERLAP) { st.margins.push(-999); if (-999 < worst) { worst = -999; st.weak = j; } continue; }
      var M = 0, sx = 0, mf = 0, yc = T[j].y;
      for (i = j; i < n; i++) {
        var t = T[i]; M += t.m; sx += t.m * t.cx; mf += F[i] * (yc - t.cy);
      }
      var xc = sx / M, dx = mf / Math.max(M, 1e-6), xe = xc + dx;
      var mg = Math.min(xe - oL, oR - xe);
      st.margins.push(mg);
      if (mg < worst) { worst = mg; st.weak = j; }
    }
    st.margin = worst;
    st.layers = n;
    st.topY = T[n - 1].ty;
    return st;
  }

  // 试放：不改动 st，返回放置后的关键指标（供 AI / 预览）
  function probe(st, stone, x) {
    var prev = st.tower.length ? st.tower[st.tower.length - 1] : null;
    var topY = prev ? prev.ty : BED_Y, prevTh = prev ? prev.th : 0;
    var t = {};
    for (var k in stone) t[k] = stone[k];
    t.x = x;
    geom(t, topY, prevTh);
    var sL, sR;
    if (prev) { sL = prev.tL; sR = prev.tR; } else { sL = CX - st.bw / 2; sR = CX + st.bw / 2; }
    var oL = Math.max(t.bL, sL), oR = Math.min(t.bR, sR);
    if (oR - oL < MIN_OVERLAP) return { ok: false, margin: -999, overlap: oR - oL, topY: topY };
    // 构建一个临时塔做完整分析
    var bak = st.tower;
    st.tower = bak.concat([t]);
    analyze(st);
    var r = { ok: st.margin >= 0, margin: st.margin, margins: st.margins.slice(), weak: st.weak, topY: st.topY, overlap: oR - oL };
    st.tower = bak;
    analyze(st);
    return r;
  }

  function dropFrom(st, j) {
    var gone = st.tower.splice(j, st.tower.length - j);
    st.lost += gone.length;
    var snap = gone.map(function (t) { return { x: t.cx, y: t.cy, w: t.w, h: t.h, th: t.th, tone: t.tone, rough: t.rough }; });
    st.ev.push({ t: 'collapse', y: gone[0].y, stones: snap });
    analyze(st);
  }

  // ── 操作 ────────────────────────────────────────────
  function place(st, bi, x) {
    if (st.over) return { ok: false, why: 'over' };
    var b = st.basket[bi];
    if (!b) return { ok: false, why: 'empty' };
    x = clamp(x, XMIN, XMAX);
    var prev = st.tower.length ? st.tower[st.tower.length - 1] : null;
    var topY = prev ? prev.ty : BED_Y, prevTh = prev ? prev.th : 0;
    var t = {};
    for (var k in b) t[k] = b[k];
    t.x = x;
    geom(t, topY, prevTh);
    var sL, sR;
    if (prev) { sL = prev.tL; sR = prev.tR; } else { sL = CX - st.bw / 2; sR = CX + st.bw / 2; }
    var oL = Math.max(t.bL, sL), oR = Math.min(t.bR, sR);
    st.basket[bi] = nextStone(st);
    st.used++;
    if (oR - oL < MIN_OVERLAP) {
      // 没搭住，直接滑进水里
      st.collapses++; st.time -= 3;
      st.ev.push({ t: 'slip', stones: [{ x: t.cx, y: t.cy, w: t.w, h: t.h, th: t.th, tone: t.tone, rough: t.rough }] });
      st.lost++;
      st.sel = firstBasket(st);
      analyze(st); checkOver(st);
      return { ok: false, why: 'slip' };
    }
    st.tower.push(t);
    st.ev.push({ t: 'place', y: t.y, tone: t.tone });
    analyze(st);
    st.sel = firstBasket(st);
    if (st.margin < 0 && st.weak >= 0) {
      dropFrom(st, st.weak);
      st.collapses++; st.time -= COLLAPSE_TIME;
      st.sel = firstBasket(st);
      checkOver(st);
      return { ok: true, why: 'collapse' };
    }
    checkWin(st); checkOver(st);
    return { ok: true, why: 'ok' };
  }

  function undo(st) {
    if (st.over) return false;
    if (!st.tower.length) return false;
    var t = st.tower.pop();
    // 撤下的石头回到第一个格子（试菜：免费修正）
    var slot = -1;
    for (var i = 0; i < BASKET; i++) if (!st.basket[i]) { slot = i; break; }
    if (slot < 0) { slot = 0; st.pool.splice(st.pnext, 0, st.basket[0]); }
    st.basket[slot] = t;
    st.sel = slot;
    st.ev.push({ t: 'undo' });
    analyze(st);
    return true;
  }

  function checkWin(st) {
    if (st.win) return;
    if (st.tower.length && st.tower[st.tower.length - 1].ty <= st.goalY) {
      st.win = true;
      st.ev.push({ t: 'win' });
      finish(st);
    }
  }

  function checkOver(st) {
    if (st.over) return;
    if (st.win) return;
    if (st.time <= 0) { st.time = 0; finish(st); return; }
    var any = false;
    for (var i = 0; i < BASKET; i++) if (st.basket[i]) { any = true; break; }
    if (!any && st.pnext >= st.pool.length) finish(st);
  }

  function finish(st) {
    if (st.over) return;
    st.finalScore = score(st);
    st.over = true;
    st.ev.push({ t: 'over' });
  }

  // ── 计分 ────────────────────────────────────────────
  // 铁律：不操作（noop）= 0 层 = 0 分；所有溢价分必须挂 win
  function score(st) {
    if (st.over) return st.finalScore;
    var layers = st.tower.length;
    var s = layers * 32;
    if (!st.win) return Math.round(s);
    var gl = goalLayers(st.L);
    var left = (st.pool.length - st.pnext) + st.basket.filter(Boolean).length;
    var stab = 200 * clamp((st.margin >= 900 ? STABLE_FULL : st.margin) / STABLE_FULL, 0, 1);
    var save = 220 * clamp(left / Math.max(1, st.pool.length - gl), 0, 1);
    var tim = 180 * clamp(st.time / st.tmax, 0, 1);
    s += 300 + stab + save + tim;
    return Math.round(s);
  }

  function stars(li) {
    var L = LEVELS[li], gl = goalLayers(L);
    var floor = gl * 32 + 300, varMax = 600;
    return [Math.round(floor + varMax * 0.08), Math.round(floor + varMax * 0.30), Math.round(floor + varMax * 0.48)];
  }

  function rank(li, sc) {
    var s = stars(li);
    if (sc >= s[2]) return 3; if (sc >= s[1]) return 2; if (sc >= s[0]) return 1; return 0;
  }

  // ── 主循环 ──────────────────────────────────────────
  function update(st, dt) {
    if (!(dt > 0)) dt = 0;
    if (dt > 0.05) dt = 0.05;
    if (st.over) return st;
    st.t += dt;
    st.time -= dt;
    if (st.ev.length > 40) st.ev.splice(0, st.ev.length - 40);
    if (st.time <= 0) { st.time = 0; finish(st); return st; }
    checkOver(st);
    return st;
  }

  // ── AI 对照 ─────────────────────────────────────────
  function pick(st, policy, rnd) {
    var b = [], i;
    for (i = 0; i < BASKET; i++) if (st.basket[i]) b.push(i);
    if (!b.length) return null;
    var prev = st.tower.length ? st.tower[st.tower.length - 1] : null;
    var anchor = prev ? prev.tx : CX;
    if (policy === 'random') {
      return { bi: b[(rnd() * b.length) | 0], x: clamp(anchor + (rnd() * 2 - 1) * 74, XMIN, XMAX) };
    }
    if (policy === 'naive') {
      return { bi: b[0], x: clamp(anchor, XMIN, XMAX) };
    }
    if (policy === 'mid') {
      var bw = b[0], w = -1;
      for (i = 0; i < b.length; i++) if (st.basket[b[i]].w > w) { w = st.basket[b[i]].w; bw = b[i]; }
      // 水流把塔往右推？预补偿：往上游（左）偏一点
      return { bi: bw, x: clamp(anchor - 6 * st.flow, XMIN, XMAX) };
    }
    // strong：对每块石头 × 每个落点做一步前瞻，选「稳定余量最大」的
    var best = null, bestScore = -1e9;
    for (i = 0; i < b.length; i++) {
      var stone = st.basket[b[i]];
      for (var d = -12; d <= 12; d++) {
        var x = clamp(anchor + d * 6, XMIN, XMAX);
        var r = probe(st, stone, x);
        if (!r.ok) continue;
        // 越稳越好 + 略微偏好宽石（给上层留支撑）+ 讨厌塌
        var v = Math.min(r.margin, 40) * 3 + stone.w * 0.12 + r.overlap * 0.05;
        if (v > bestScore) { bestScore = v; best = { bi: b[i], x: x }; }
      }
    }
    if (!best) return { bi: b[0], x: clamp(anchor, XMIN, XMAX) };
    return best;
  }

  function runAI(li, seed, policy, opt) {
    opt = opt || {};
    var st = newState(li, seed);
    var rnd = mulberry32(seed * 104729 + 7);
    var stepT = opt.stepT || 0.5;
    var maxStep = opt.maxStep || 400;
    var guard = 0;
    while (!st.over && guard++ < maxStep) {
      if (policy === 'noop') { update(st, 0.5); st.ev.length = 0; continue; }
      var a = pick(st, policy, rnd);
      if (!a) { update(st, 0.5); st.ev.length = 0; continue; }
      place(st, a.bi, a.x);
      st.ev.length = 0;
      update(st, stepT);
      st.ev.length = 0;
    }
    if (!st.over) finish(st);
    return { score: st.finalScore, layers: st.tower.length, win: st.win, collapses: st.collapses, used: st.used, timeLeft: st.time };
  }

  return {
    W: W, H: H, BED_Y: BED_Y, CX: CX, XMIN: XMIN, XMAX: XMAX,
    MIN_OVERLAP: MIN_OVERLAP, K_FLOW: K_FLOW, BASKET: BASKET, STABLE_FULL: STABLE_FULL,
    LEVELS: LEVELS, POEMS: POEMS, MAX_TILT: MAX_TILT,
    clamp: clamp, goalLayers: goalLayers, mulberry32: mulberry32,
    geom: geom, makeStone: makeStone, genPool: genPool,
    newState: newState, analyze: analyze, probe: probe, place: place, undo: undo,
    update: update, score: score, stars: stars, rank: rank, pick: pick, runAI: runAI,
    flowForce: flowForce
  };
});
