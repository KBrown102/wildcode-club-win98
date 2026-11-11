/* 298-bubbledive《气泡 · 深潜》— 纯逻辑层（无 DOM，可 Node require） */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BUBBLEDIVE = factory();
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  /* ================= 常量 ================= */
  var VW = 620;                 // 视口宽 = 世界宽
  var VH = 860;                 // 视口高
  var PMAX = 1.75;              // 底部水压倍数
  var KR = 3.05;                // r = KR * sqrt(V)
  var VN = 95;                  // 中性体积（浮力 == 重力）
  var G = 560;                  // 重力加速度 px/s^2
  var DAMP = 2.40;              // 垂直阻尼
  var DAMPX = 2.60, SWIM = 430; // 横向摆尾
  var INF = 30, DEF = 34;       // 充气 / 放气 速率（气量 /s）
  var NMIN = 30, NMAX = 190;    // 气泡气量上下限
  var TANK0 = 78;               // 储气罐初始
  var N0 = 154;                 // 气泡初始气量（起点处恰好中性 → noop 恒 0 分）
  var VY_MAX = 620, VX_MAX = 300;
  var SQ_MIN = 0.68;            // chan/D < 0.68 → 硬阻断
  var SQ_LEAK = 6.0;            // 挤压漏气 /s（满挤压时）
  var BUMP_LEAK = 0.045, BUMP_MAX = 9, BUMP_CD = 0.42;
  var SURFACE_Y = 56;           // 海面线
  var PICK_R = 16;              // 收集判定附加半径
  var GLOW = 3.20;              // 光晕半径 = GLOW * r（视野由体积决定）
  var RSHY = 22;                // 害羞生物要求的气泡半径上限（≈ 中性半径的 74%）
  var CRE_PT = 60, AIR_W = 0.90, TIME_W = 3, TLIM = 78;
  var VENT_GAIN = 72, VENT_CD = 4.5, VENT_R = 30;
  var RESCUE_CD = 9.0, RESCUE_GAIN = 34;   // 沉底软兜底（暗流回气）

  /* 8 关递进：目标生物 / 采样层数 / 通道宽 / 气穴 / 害羞 / 世界高 */
  var LEVELS = [
    { target: 2, layers: 5,  wmin: 140, wmax: 200, vents: 3, shy: 0, WH:  900 },
    { target: 3, layers: 6,  wmin: 128, wmax: 190, vents: 3, shy: 0, WH:  990 },
    { target: 3, layers: 7,  wmin: 118, wmax: 178, vents: 2, shy: 1, WH: 1080 },
    { target: 4, layers: 7,  wmin: 108, wmax: 166, vents: 2, shy: 1, WH: 1170 },
    { target: 5, layers: 8,  wmin: 106, wmax: 158, vents: 2, shy: 2, WH: 1260 },
    { target: 5, layers: 9,  wmin:  98, wmax: 148, vents: 1, shy: 2, WH: 1370 },
    { target: 6, layers: 9,  wmin:  90, wmax: 134, vents: 2, shy: 3, WH: 1480 },
    { target: 7, layers: 10, wmin:  82, wmax: 124, vents: 1, shy: 3, WH: 1600 }
  ];

  /* 三星阈值（由 _cal298.cjs AI 实测标定后回填） */
  var STARS = [
    [248, 437, 612], [269, 475, 665], [235, 415, 580], [268, 473, 662],
    [287, 507, 709], [184, 324, 454], [255, 451, 631], [162, 286, 400]
  ];

  /* ================= 工具 ================= */
  function clamp(v, a, b) { v = (v !== v) ? a : v; return v < a ? a : (v > b ? b : v); }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function dist2(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }

  /* ================= 关卡生成 ================= */
  function genLevel(lv, seed) {
    var cfg = LEVELS[clamp(lv, 1, 8) - 1];
    var rnd = mulberry32((seed >>> 0) * 2654435761 + lv * 7919 + 20260911);
    var WH = cfg.WH, NL = cfg.layers;

    var wy = [], wl = [], wr = [], cx = VW / 2;
    for (var i = 0; i < NL; i++) {
      var y = Math.round(i * (WH - 1) / (NL - 1));
      var w = cfg.wmin + rnd() * (cfg.wmax - cfg.wmin);
      if (i > 0 && i < NL - 1) cx += (rnd() * 2 - 1) * VW * 0.20;
      cx = clamp(cx, w / 2 + 30, VW - w / 2 - 30);
      wy.push(y); wl.push(cx - w / 2); wr.push(cx + w / 2);
    }

    /* 窄缝（瓶颈）：索引间隔 ≥2，避免连成死路 */
    var nb = 1 + Math.floor((lv - 1) / 3);
    if (cfg.shy > nb) nb = cfg.shy;
    var picks = [], guard = 0;
    while (picks.length < nb && guard++ < 400) {
      var idx = 1 + Math.floor(rnd() * (NL - 2));
      var okp = true;
      for (var p = 0; p < picks.length; p++) if (Math.abs(picks[p] - idx) < 2) { okp = false; break; }
      if (okp) picks.push(idx);
    }
    picks.sort(function (a, b) { return a - b; });
    var narrow = [];
    picks.forEach(function (idx) {
      var c = (wl[idx] + wr[idx]) / 2;
      var w = Math.max(cfg.wmin * 0.52, (wr[idx] - wl[idx]) * 0.50);
      wl[idx] = c - w / 2; wr[idx] = c + w / 2;
      narrow.push({ y: wy[idx], w: w, cx: c });
    });

    /* ★ 起点：在深渊中部区间里挑【通道最宽】处。
       若起点落在窄缝里，静止气泡会被持续挤压漏气 → 下沉 → 压力升高 → 正反馈漂移 → noop 也能采到东西。
       选最宽处 + 「静止不漏气」双保险，把 noop 钉死在 0 分。 */
    var yStart = Math.round(WH * 0.55);
    var loS = Math.round(WH * 0.44), hiS = Math.round(WH * 0.64), bestW = -1;
    function chanOf(y) {
      var n = wy.length;
      if (y <= wy[0]) return wr[0] - wl[0];
      if (y >= wy[n - 1]) return wr[n - 1] - wl[n - 1];
      var i = 0;
      while (i < n - 2 && y > wy[i + 1]) i++;
      var t = (y - wy[i]) / (wy[i + 1] - wy[i]);
      return (wr[i] + (wr[i + 1] - wr[i]) * t) - (wl[i] + (wl[i + 1] - wl[i]) * t);
    }
    for (var sy = loS; sy <= hiS; sy += 4) {
      var cw2 = chanOf(sy);
      if (cw2 > bestW) { bestW = cw2; yStart = sy; }
    }

    /* ---- 生物分布：起点在深渊中部，生物分居上下两侧 ----
       ★ 关键约束：上方生物数 < target → 玩家【必须下沉】才凑得齐，
       而下沉＝放气（永久损失），上浮＝充气（消耗储量）→ 往返是真成本 */
    var TOP = SURFACE_Y + 90, BOT = WH - 90;
    var upSlots = [], deepSlots = [];
    for (var q = 0; q < NL; q++) {
      var cy = wy[q], cw = wr[q] - wl[q], cc = (wl[q] + wr[q]) / 2;
      var slot = { y: cy, cx: cc, w: cw };
      /* ★ 生物必须离起点足够远（>90px），否则 noop 一动不动就能采集 —— 违反「不操作不得分」铁律 */
      if (cy >= TOP && cy <= yStart - 125) upSlots.push(slot);
      if (cy >= yStart + 125 && cy <= BOT) deepSlots.push(slot);
    }
    if (!upSlots.length) upSlots.push({ y: TOP, cx: (wl[0] + wr[0]) / 2, w: wr[0] - wl[0] });
    if (!deepSlots.length) deepSlots.push({ y: BOT, cx: (wl[NL - 1] + wr[NL - 1]) / 2, w: wr[NL - 1] - wl[NL - 1] });

    var total = cfg.target + 1;
    var nDeep = Math.min(total, Math.max(2, Math.ceil(total * 0.5)));
    var nUp = total - nDeep;

    function mkCand(list, cnt, shy, kindBase) {
      var out = [];
      for (var i = 0; i < cnt; i++) {
        var px = 0, py = 0, s = null;
        /* 最多 60 次重掷，强制满足「离起点 > 92px」的 noop 隔离约束 */
        for (var tryN = 0; tryN < 60; tryN++) {
          s = list[Math.floor(rnd() * list.length)];
          py = clamp(s.y + (rnd() * 2 - 1) * 25, TOP, BOT);
          if (Math.abs(py - yStart) > 94) break;
        }
        if (Math.abs(py - yStart) <= 94) py = clamp(yStart + (py > yStart ? 150 : -150), TOP, BOT);
        px = clamp(s.cx + (rnd() * 2 - 1) * s.w * 0.26, 40, VW - 40);
        out.push({ x: px, y: py, kind: (kindBase + i) % 6, shy: shy, got: false, scared: 0 });
      }
      return out;
    }

    /* 害羞生物只放在【窄缝】里 —— 又小又暗，缩小是唯一正解 */
    narrow.sort(function (a, b) { return (b.y > yStart ? 1 : 0) - (a.y > yStart ? 1 : 0); });
    var narrowSlots = narrow.map(function (nn) { return { y: nn.y, cx: nn.cx, w: nn.w }; });
    if (!narrowSlots.length) narrowSlots = deepSlots.slice();

    var cre = [];
    for (var s = 0; s < cfg.shy; s++) cre.push(mkCand(narrowSlots, 1, true, 3)[0]);
    cre = cre.concat(mkCand(deepSlots, Math.max(0, nDeep - cfg.shy), false, 0));
    cre = cre.concat(mkCand(upSlots, nUp, false, 0));
    while (cre.length < total) cre.push(mkCand(deepSlots, 1, false, 0)[0]);
    for (var z = 0; z < cre.length; z++) cre[z].idx = z;

    /* 气穴（充电宝）：沿通道均匀分布 */
    var vents = [];
    for (var v = 0; v < cfg.vents; v++) {
      var vi = 1 + Math.floor((v + 0.5) * (NL - 2) / cfg.vents);
      vi = clamp(vi, 1, NL - 2);
      vents.push({ x: (wl[vi] + wr[vi]) / 2, y: wy[vi], cd: 0, used: 0 });
    }

    return { wy: wy, wl: wl, wr: wr, cre: cre, vents: vents, narrow: narrow, WH: WH, cfg: cfg, yStart: yStart };
  }

  /* 通道左右壁（线性插值） */
  function wallAt(L, y) {
    var n = L.wy.length;
    if (y <= L.wy[0]) return [L.wl[0], L.wr[0]];
    if (y >= L.wy[n - 1]) return [L.wl[n - 1], L.wr[n - 1]];
    var i = 0;
    while (i < n - 2 && y > L.wy[i + 1]) i++;
    var t = (y - L.wy[i]) / (L.wy[i + 1] - L.wy[i]);
    return [L.wl[i] + (L.wl[i + 1] - L.wl[i]) * t, L.wr[i] + (L.wr[i + 1] - L.wr[i]) * t];
  }
  /* [y-r, y+r] 内最窄的【横截面】。
     ⚠️ 不能取「左壁最大 ∩ 右壁最小」：通道蜿蜒时不同深度的通道横向错开，
     交集会被算成几十像素而实际每处都很宽 —— 气泡会被永久卡死（298 踩过的坑）。
     正确做法是取最窄那一处的左右壁（整对一起取，不跨深度交叉）。 */
  function chanRange(L, y, r) {
    var w0 = wallAt(L, y);
    var lo = w0[0], hi = w0[1], bw = hi - lo;
    for (var k = -2; k <= 2; k++) {
      if (k === 0) continue;
      var w = wallAt(L, y + r * 0.5 * k);
      var wd = w[1] - w[0];
      if (wd < bw) { bw = wd; lo = w[0]; hi = w[1]; }
    }
    return [lo, hi];
  }

  /* ================= 状态 ================= */
  function makeState() {
    return {
      lv: 1, seed: 1, L: null, WH: 900, cfg: LEVELS[0],
      bx: VW / 2, by: 0, vx: 0, vy: 0,
      n: N0, tank: TANK0, r: 30, P: 1, V: N0,
      squeeze: 0, bumpCd: 0, rescueCd: 0,
      got: 0, target: 2, time: 0, score: 0, best: 0,
      inflating: false, deflating: false, swim: 0,
      win: false, over: false, dead: false,
      events: [], stars: 0, surf: 0
    };
  }

  function start(st, lv, seed) {
    lv = clamp(lv | 0, 1, 8);
    var s = (seed === undefined || seed === null) ? (lv * 1013 + 77) : (seed | 0);
    var L = genLevel(lv, s);
    st.lv = lv; st.seed = s; st.L = L; st.WH = L.WH; st.cfg = L.cfg;
    st.by = clamp(L.yStart || Math.round(L.WH * 0.55), 120, L.WH - 120);   // 起点＝沉船，位于深渊中部最宽处
    var w0 = wallAt(L, st.by);
    st.bx = (w0[0] + w0[1]) / 2;
    st.vx = 0; st.vy = 0;
    /* 起点处恰好中性（noop 恒 0 分）→ 气量随起点水压反算，自动适配各关 */
    st.n = clamp(VN * (1 + (st.by / L.WH) * (PMAX - 1)), NMIN, NMAX);
    st.tank = TANK0;
    st.squeeze = 0; st.bumpCd = 0; st.rescueCd = 0;
    st.got = 0; st.target = L.cfg.target; st.time = 0; st.score = 0;
    st.inflating = false; st.deflating = false; st.swim = 0;
    st.win = false; st.over = false; st.dead = false;
    st.events = []; st.stars = 0; st.surf = 0;
    syncBody(st);
    return st;
  }

  function syncBody(st) {
    st.n = clamp(st.n, NMIN, NMAX);
    st.P = 1 + (clamp(st.by, 0, st.WH) / st.WH) * (PMAX - 1);
    st.V = st.n / st.P;
    st.r = KR * Math.sqrt(Math.max(1, st.V));
  }

  function bump(st, speed, tag) {
    if (st.bumpCd > 0) return;
    st.bumpCd = BUMP_CD;
    var lose = Math.min(BUMP_MAX, speed * BUMP_LEAK);
    st.n -= lose;
    if (st.n < NMIN) st.n = NMIN;
    st.events.push({ t: 'bump', x: st.bx, y: st.by, v: speed, tag: tag || 'wall' });
    syncBody(st);
  }

  /* ================= 主更新 ================= */
  function step(st, dt, input) {
    if (!dt || dt !== dt || dt < 0) dt = 0;
    if (dt > 0.05) dt = 0.05;
    if (!st.L || st.over) return st;
    input = input || {};

    st.inflating = !!input.inflate;
    st.deflating = !!input.deflate;
    st.swim = input.swim ? clamp(input.swim, -1, 1) : 0;

    st.time += dt;
    if (st.bumpCd > 0) st.bumpCd -= dt;
    if (st.rescueCd > 0) st.rescueCd -= dt;

    /* --- 充 / 放气（唯一核心动词） --- */
    if (st.inflating && st.tank > 0 && st.n < NMAX) {
      var add = Math.min(INF * dt, st.tank, NMAX - st.n);
      st.n += add; st.tank -= add;
      st.events.push({ t: 'inflate', x: st.bx, y: st.by, v: add });
    }
    if (st.deflating && st.n > NMIN) {
      var sub = Math.min(DEF * dt, st.n - NMIN);
      st.n -= sub;
      st.events.push({ t: 'deflate', x: st.bx, y: st.by, v: sub, dir: st.swim });
    }

    syncBody(st);

    /* --- 压力—体积耦合：a = G*(1 - V/VN) --- */
    var B = G * (st.V / VN);
    st.vy += (G - B) * dt;
    st.vy -= st.vy * DAMP * dt;
    st.vy = clamp(st.vy, -VY_MAX, VY_MAX);

    st.vx += st.swim * SWIM * dt;
    st.vx -= st.vx * DAMPX * dt;
    st.vx = clamp(st.vx, -VX_MAX, VX_MAX);

    var prevY = st.by, prevX = st.bx;
    st.by += st.vy * dt;
    st.bx += st.vx * dt;

    /* --- 通道约束：自由 / 挤压 / 阻断 三档 --- */
    syncBody(st);
    var D = 2 * st.r;
    var rg = chanRange(st.L, st.by, st.r);
    var chan = rg[1] - rg[0];
    st.squeeze = 0;

    if (chan >= D) {
      /* 自由：软钳位 + 擦壁破气 */
      var loB = rg[0] + st.r, hiB = rg[1] - st.r;
      if (st.bx < loB) {
        var nv = -st.vx; st.bx = loB;
        if (nv > 40) bump(st, Math.abs(st.vx), 'wall');
        st.vx = nv > 0 ? nv * 0.22 : st.vx * 0.5;
      } else if (st.bx > hiB) {
        var nv2 = st.vx; st.bx = hiB;
        if (nv2 > 40) bump(st, Math.abs(st.vx), 'wall');
        st.vx = nv2 > 0 ? -nv2 * 0.22 : st.vx * 0.5;
      }
    } else if (chan >= D * SQ_MIN) {
      /* 挤压：果冻压扁挤过去 —— 限速度上限（dt 无关）+ 持续漏气，通道替你扶正 */
      st.squeeze = 1 - chan / D;
      st.bx = (rg[0] + rg[1]) / 2;
      st.vx *= Math.pow(0.35, dt * 8);
      var vcap = VY_MAX * (0.22 + 0.78 * (chan / D));
      if (Math.abs(st.vy) > vcap) st.vy = (st.vy < 0 ? -1 : 1) * vcap;
      /* 漏气只跟「挤过去」这个动作有关，静止待着不漏 —— 否则静止在缝边的中性气泡会被慢慢放血后沉下去 */
      st.n -= SQ_LEAK * st.squeeze * Math.min(1, Math.abs(st.vy) / 100) * dt;
      syncBody(st);
    } else {
      /* 硬阻断：沿运动方向回退到最近的可容身处（不瞬移），弹回 —— 逼玩家放气缩小 */
      var dir = st.vy < 0 ? -1 : (st.vy > 0 ? 1 : 0);
      var yy = st.by, gd = 0;
      while (gd++ < 240) {
        var rg2 = chanRange(st.L, yy, st.r);
        if (rg2[1] - rg2[0] >= D * SQ_MIN) break;
        yy -= dir * 2;
        if (yy <= 8 || yy >= st.WH - 4) { yy = prevY; break; }
      }
      st.by = clamp(yy, 8, st.WH - 4);
      st.squeeze = 1;
      var sp = Math.abs(st.vy);
      st.vy = -st.vy * 0.18;
      st.vx *= 0.30;
      if (sp > 30) bump(st, sp, 'block');
    }

    /* 世界上下边界 */
    if (st.by > st.WH - 4) { st.by = st.WH - 4; if (st.vy > 0) st.vy = 0; }
    if (st.by < 8) { st.by = 8; if (st.vy < 0) st.vy = 0; }

    /* --- 沉底软兜底：气全空时暗流回一点气（noop 到不了这个状态） --- */
    if (st.by >= st.WH - 24 && st.n <= NMIN + 1 && st.tank <= 0.5 && st.rescueCd <= 0) {
      st.tank += RESCUE_GAIN; st.rescueCd = RESCUE_CD;
      st.events.push({ t: 'rescue', x: st.bx, y: st.by });
    }

    /* --- 气穴（充电宝） --- */
    for (var v = 0; v < st.L.vents.length; v++) {
      var vt = st.L.vents[v];
      if (vt.cd > 0) vt.cd -= dt;
      if (vt.cd <= 0 && dist2(st.bx, st.by, vt.x, vt.y) < (VENT_R + st.r) * (VENT_R + st.r)) {
        st.tank = Math.min(TANK0 * 3, st.tank + VENT_GAIN);
        vt.cd = VENT_CD; vt.used++;
        st.events.push({ t: 'vent', x: vt.x, y: vt.y });
      }
    }

    /* --- 采集（害羞生物：气泡太大 = 太亮 = 吓退） --- */
    for (var c = 0; c < st.L.cre.length; c++) {
      var cr = st.L.cre[c];
      if (cr.got) continue;
      if (cr.scared > 0) { cr.scared -= dt; continue; }
      var dd = Math.sqrt(dist2(st.bx, st.by, cr.x, cr.y));
      if (cr.shy && st.r > RSHY) {
        if (dd < st.r * GLOW * 0.55) {
          cr.scared = 0.7;
          st.events.push({ t: 'scare', x: cr.x, y: cr.y });
        }
        continue;
      }
      if (dd < st.r + PICK_R) {
        cr.got = true; st.got++;
        st.tank = Math.min(TANK0 * 3, st.tank + 10);
        st.events.push({ t: 'pick', x: cr.x, y: cr.y, kind: cr.kind, idx: st.got });
      }
    }

    /* --- 海面出口：采够了才出得去 --- */
    if (st.by <= SURFACE_Y + st.r) {
      if (st.got >= st.target) { finish(st, true); return st; }
      st.by = SURFACE_Y + st.r;
      if (st.vy < 0) st.vy = 0;
      st.surf = 0.6;
    }
    if (st.surf > 0) st.surf -= dt;

    if (st.time >= TLIM) { finish(st, false); return st; }
    return st;
  }

  function finish(st, win) {
    st.win = !!win; st.over = true; st.dead = true;
    var ratio = st.target > 0 ? clamp(st.got / st.target, 0, 1) : 0;
    var airPt = Math.round((st.n + st.tank) * AIR_W * ratio);
    var timePt = Math.round(Math.max(0, TLIM - st.time) * TIME_W * ratio);
    st.score = st.got * CRE_PT + airPt + timePt;
    var th = STARS[clamp(st.lv, 1, 8) - 1];
    st.stars = st.score >= th[2] ? 3 : (st.score >= th[1] ? 2 : (st.score >= th[0] ? 1 : 0));
    st.events.push({ t: 'over', win: st.win, score: st.score, stars: st.stars });
  }

  /* ================= 查询辅助（渲染 / AI 用） ================= */
  function glowR(st) { return st.r * GLOW; }
  function chanAtY(st, y) { var w = wallAt(st.L, y); return w[1] - w[0]; }
  function progress(st) { return st.target > 0 ? st.got / st.target : 0; }

  return {
    VW: VW, VH: VH, PMAX: PMAX, KR: KR, VN: VN, G: G,
    NMIN: NMIN, NMAX: NMAX, N0: N0, TANK0: TANK0,
    SURFACE_Y: SURFACE_Y, GLOW: GLOW, RSHY: RSHY, TLIM: TLIM,
    VENT_R: VENT_R, SQ_MIN: SQ_MIN, LEVELS: LEVELS, STARS: STARS,
    clamp: clamp, mulberry32: mulberry32,
    genLevel: genLevel, wallAt: wallAt, chanRange: chanRange,
    makeState: makeState, start: start, step: step, finish: finish,
    syncBody: syncBody, glowR: glowR, chanAtY: chanAtY, progress: progress
  };
});
