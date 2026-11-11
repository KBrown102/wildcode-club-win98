/* 277-dewfall · 坠露 · 落进那片绿
 * game.js —— 零 DOM / 零 Canvas 纯逻辑层，Node 可直接 require 冒烟
 * 机制元链：位移 → 消耗 → 合并 → 标量调整 → 揭示
 */
(function (g) {
  'use strict';

  var CFG = {
    VW: 360,                 // 世界宽（虚拟像素，跨端一致）
    HOME_DEPTH: 340,         // 到家深度（米）——可达成的终点，给「这一趟走完」的闭环
    PX_PER_M: 10,            // 10 虚拟像素 = 1 米

    R_MIN: 5.5,
    R_MAX: 17.5,             // 顶格也不能大到过不去窄缝（缝宽最小 70 → 容差 ≥17px）
    VOL0: 0.55,

    GRAV: 980,
    VMAX_BASE: 205,          // vmax = VMAX_BASE + vol * VMAX_VOL（越大落越快）
    VMAX_VOL: 250,
    MOVE_ACC: 2100,
    MOVE_MAX: 320,
    SLIDE_MAX: 235,          // 贴叶时最大横移（摩擦感）

    LAYER_TH: 11,            // 叶片厚度
    LAYER_GAP0: 94,          // 初始层间距
    LAYER_GAP_MIN: 68,
    GAP_W0: 118,             // 初始缝宽
    GAP_W_MIN: 54,
    SHIFT_EASY: 56,          // 相邻层缝隙最大横向偏移（前期，保证够得着）
    SHIFT_HARD: 86,          // 深处偏移（层更密、落更快，靠难度自然爬升）
    DEEP_FULL: 340,          // 到达此深度后难度参数压满

    LEAF_SINK: 0.085,        // 贴叶每秒流失体积（再乘体积系数：大水珠摊得开、散得快）
    POOL_RATE: 0.55,         // 层间出水洼的概率
    LEAF_FLOW: 78,           // 叶面导流：水往最近的缝隙方向淌（弱，玩家可抵抗）
    LEAF_FLOW_DELAY: 0.55,   // 贴上后给玩家 0.55s 反应时间才开始导流
    GRAZE_BAND: 0.82,        // 离段边缘 < r*GRAZE_BAND 算擦边（宽容：多数撞击只是蹭到）
    GRAZE_COST: 0.088,       // 擦边损失
    HIT_COST: 0.205,         // 正面撞损失
    BRANCH_COST: 0.34,       // 撞枯枝
    POOL_GAIN: 0.120,        // 吃水洼（收益随体积递减，避免顶格后必死）
    POOL_MAX_VOL: 0.34,      // 单口水洼上限
    PERFECT_GAIN: 0.036,     // 完美穿缝蹭到叶上的露水——打得好才走得远（陪练续航）
    MERGE_CAP: 0.98,

    HITSTOP: 0.075,          // 定格时长（慢动作窗口，不是死冻）
    HITSTOP_SLOW: 0.18,      // 定格期间的时间缩放：留顿感、不留卡顿
    FLOWER_EVERY: 5,         // 每 5 层一朵花
    BRANCH_FROM: 180,        // 180 米后开始出现枯枝
    BRANCH_CHANCE: 0.16,

    PENTA: [0, 2, 4, 7, 9],  // 五声音阶半音
    BASE_MIDI: 60
  };

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function rndInt(a, b) { return Math.floor(rnd(a, b + 1)); }

  // 深度难度比 0..1（陪练：越深越紧，但不碾压）
  function deepRatio(depthM) { return clamp(depthM / CFG.DEEP_FULL, 0, 1); }

  function radiusOf(vol) { return lerp(CFG.R_MIN, CFG.R_MAX, clamp(vol, 0, 1)); }
  function vmaxOf(vol) { return CFG.VMAX_BASE + clamp(vol, 0, 1) * CFG.VMAX_VOL; }
  // 体积 → 分数倍率（标量调整核心）：大水珠值钱，值得为它冒险
  function multOf(vol) { return 1 + clamp(vol, 0, 1) * 3.5; }
  // 收益递减：越接近满，吃进去的越少（防止「越顺越大→大到过不去」的死亡螺旋）
  function gainDiminish(gain, vol, k) { return gain * Math.max(0.18, 1 - clamp(vol, 0, 1) * k); }

  // —— 层生成 ——
  function makeLayer(y, idx, prevC) {
    var t = clamp(idx / 42, 0, 1);
    var gw = lerp(CFG.GAP_W0, CFG.GAP_W_MIN, Math.min(1, t * 1.15));
    var kind = 'leaf';
    if (idx > 0 && idx % CFG.FLOWER_EVERY === 0) kind = 'flower';
    else if (idx * 9 > CFG.BRANCH_FROM && Math.random() < CFG.BRANCH_CHANCE && kind === 'leaf') kind = 'branch';

    // 公平性约束：相邻层缝隙的横向偏移必须「够得着」
    // 层间可飞行时间 ≈ 层距 / 落速，按此反推本层能横移多少，绝不生成必撞层
    var shift = lerp(CFG.SHIFT_EASY, CFG.SHIFT_HARD, t);
    if (prevC === undefined || prevC === null) prevC = CFG.VW / 2;

    var segs = [];
    // 深处偶尔双缝（三段），增加变化
    var twin = t > 0.45 && Math.random() < 0.3;
    if (twin) {
      var w1 = gw * 0.78, w2 = gw * 0.78;
      var g1 = clamp(prevC + rnd(-shift, shift), w1 / 2 + 12, CFG.VW * 0.42);
      var g2 = clamp(g1 + rnd(CFG.VW * 0.34, CFG.VW * 0.56), CFG.VW * 0.58, CFG.VW - w2 / 2 - 12);
      segs = [
        { x0: 0, x1: g1 - w1 / 2 },
        { x0: g1 + w1 / 2, x1: g2 - w2 / 2 },
        { x0: g2 + w2 / 2, x1: CFG.VW }
      ];
    } else {
      var lo = gw / 2 + 12, hi = CFG.VW - gw / 2 - 12;
      var c = hi > lo ? clamp(prevC + rnd(-shift, shift), lo, hi) : CFG.VW / 2;
      segs = [
        { x0: 0, x1: c - gw / 2 },
        { x0: c + gw / 2, x1: CFG.VW }
      ];
    }
    // 缝隙中心列表（供判定与 AI 提示）
    var gaps = [];
    for (var i = 0; i < segs.length - 1; i++) {
      gaps.push({ c: (segs[i].x1 + segs[i + 1].x0) / 2, w: segs[i + 1].x0 - segs[i].x1 });
    }

    return {
      y: y, idx: idx, kind: kind, segs: segs, gaps: gaps, gw: gw,
      passed: false, hit: false,
      bend: 0,           // 叶片下压量（触感：下压回弹）
      bendV: 0,
      bloom: 0           // 花开程度 0..1
    };
  }

  function layerGapAt(idx) {
    var t = clamp(idx / 42, 0, 1);
    return lerp(CFG.LAYER_GAP0, CFG.LAYER_GAP_MIN, t);
  }

  function makePool(x, y) {
    return { x: x, y: y, v: rnd(0.12, CFG.POOL_MAX_VOL), taken: false, wob: rnd(0, 6.28), born: 0 };
  }

  function createGame(opts) {
    opts = opts || {};
    var viewH = opts.viewH || 640;
    var S = {
      viewH: viewH,
      phase: 'ready',        // ready | play | over
      t: 0,
      slowT: 0,              // 定格（慢动作）累计时长，渲染层做平滑过渡用
      hitstop: 0,
      drop: { x: CFG.VW / 2, y: 0, vx: 0, vy: 0, vol: CFG.VOL0, r: radiusOf(CFG.VOL0), sq: 0, sqv: 0, spin: 0 },
      camY: -viewH * 0.32,
      layers: [],
      pools: [],
      layerIdx: 0,
      nextLayerY: 160,
      lastGapC: CFG.VW / 2,  // 上一层主缝中心（生成约束用）
      slideLayer: null,      // 当前贴着的层
      slideT: 0,             // 贴叶时长（导流延迟用）
      lastLayerIdx: -1,
      depth: 0,
      maxDepth: 0,
      layersPassed: 0,
      perfect: 0,
      combo: 0,
      maxCombo: 0,
      score: 0,
      maxVol: CFG.VOL0,
      poolsEaten: 0,
      grazes: 0,
      hits: 0,
      over: false,
      overReason: '',
      events: [],
      rainbow: false,
      nearHome: 0,
      input: { dir: 0, targetX: null },   // dir: -1/0/1；targetX: 指针绝对跟随
      best: null
    };

    function emit(e) { S.events.push(e); }

    function note(step, oct) {
      emit({ t: 'note', midi: CFG.BASE_MIDI + (oct || 0) * 12 + CFG.PENTA[((step % 5) + 5) % 5] });
    }

    function reset() {
      S.viewH = opts.viewH || S.viewH || 640;
      S.phase = 'ready'; S.t = 0; S.slowT = 0; S.hitstop = 0;
      S.drop = { x: CFG.VW / 2, y: 0, vx: 0, vy: 0, vol: CFG.VOL0, r: radiusOf(CFG.VOL0), sq: 0, sqv: 0, spin: 0 };
      S.camY = -S.viewH * 0.32;
      S.layers = []; S.pools = [];
      S.layerIdx = 0; S.nextLayerY = 160; S.lastGapC = CFG.VW / 2;
      S.slideLayer = null; S.slideT = 0; S.lastLayerIdx = -1;
      S.depth = 0; S.maxDepth = 0; S.layersPassed = 0; S.perfect = 0;
      S.combo = 0; S.maxCombo = 0; S.score = 0; S.maxVol = CFG.VOL0;
      S.poolsEaten = 0; S.grazes = 0; S.hits = 0;
      S.over = false; S.overReason = ''; S.events.length = 0;
      S.rainbow = false; S.nearHome = 0;
      S.input.dir = 0; S.input.targetX = null;
      ensure();
      return api;
    }

    function start() {
      if (S.phase === 'ready') { S.phase = 'play'; emit({ t: 'start' }); }
      return api;
    }

    function ensure() {
      var need = S.camY + S.viewH + 260;
      var guard = 0;
      while (S.nextLayerY < need && guard++ < 400) {
        var L = makeLayer(S.nextLayerY, S.layerIdx, S.lastGapC);
        // 记住本层主缝中心，供下一层做「够得着」约束
        S.lastGapC = L.gaps.length
          ? L.gaps.reduce(function (a, b) {
              return Math.abs(b.c - (S.lastGapC === null ? CFG.VW / 2 : S.lastGapC)) <
                     Math.abs(a.c - (S.lastGapC === null ? CFG.VW / 2 : S.lastGapC)) ? b : a;
            }).c
          : S.lastGapC;
        S.layers.push(L);
        // 层间塞水洼（充电宝：可存的余量）
        // 关键：沿本层缝隙的延长线生成 ——「顺路就能吃到」是自然行为，「绕一点」才是主动取舍
        var nPools = Math.random() < CFG.POOL_RATE ? (Math.random() < 0.3 ? 2 : 1) : 0;
        var gapRef = L.gaps[rndInt(0, L.gaps.length - 1)];
        for (var i = 0; i < nPools; i++) {
          var px = gapRef.c + rnd(-L.gw * 0.62, L.gw * 0.62);
          px = clamp(px, 24, CFG.VW - 24);
          var py = S.nextLayerY + rnd(22, Math.max(30, layerGapAt(S.layerIdx) - 22));
          S.pools.push(makePool(px, py));
        }
        S.layerIdx++;
        S.nextLayerY += layerGapAt(S.layerIdx);
      }
      // 回收上方远处的层与水洼
      var cut = S.camY - 240;
      if (S.layers.length > 24) {
        S.layers = S.layers.filter(function (L) { return L.y > cut; });
      }
      if (S.pools.length > 40) {
        S.pools = S.pools.filter(function (p) { return p.y > cut; });
      }
    }

    // 露珠中心 x 是否落在某个实心段内（考虑半径收缩系数 k）
    function segAt(L, x, k) {
      var r = S.drop.r * (k === undefined ? 1 : k);
      for (var i = 0; i < L.segs.length; i++) {
        var s = L.segs[i];
        if (x + r > s.x0 && x - r < s.x1) return s;
      }
      return null;
    }

    function nearestGap(L, x) {
      var best = null, bd = 1e9;
      for (var i = 0; i < L.gaps.length; i++) {
        var d = Math.abs(x - L.gaps[i].c);
        if (d < bd) { bd = d; best = L.gaps[i]; }
      }
      return best;
    }

    function lose(vol, kind, x, y) {
      S.drop.vol = clamp(S.drop.vol - vol, 0, CFG.MERGE_CAP);
      S.drop.sqv += kind === 'branch' ? 34 : (kind === 'hit' ? 20 : 9);
      if (kind === 'graze') S.grazes++;
      else if (kind === 'branch') S.hits++;
      else S.hits++;
    }

    function finish(reason) {
      if (S.over) return;
      S.over = true; S.phase = 'over'; S.overReason = reason;
      S.drop.vy = 0; S.drop.vx = 0;   // 到家了就停住（渗进土里的那一瞬）
      emit({ t: 'over', reason: reason });
    }

    function update(dt) {
      if (!isFinite(dt) || dt <= 0) return;   // 防御：NaN / 负值 / 零 dt 不污染状态
      if (dt > 0.05) dt = 0.05;           // 防御：切后台/卡顿
      S.t += dt;

      // HIROSTOPTIME 定格 —— 用「慢动作」而非「完全冻结」：
      // 完全冻结会让每三次完美穿缝就卡住一帧多，实测定格帧占比高达 34%，肉眼就是一顿一顿。
      // 改成把时间缩放到 0.18 倍，保留打击顿感，画面却始终连续。
      var slowing = false;
      if (S.hitstop > 0) {
        S.hitstop -= dt;
        dt *= CFG.HITSTOP_SLOW;
        slowing = true;
      }
      if (slowing) S.slowT += dt;   // 供渲染层做平滑的顿感过渡

      if (S.phase === 'ready') { ensure(); return; }
      if (S.phase !== 'play') { return; }

      var D = S.drop;

      // —— 输入：位移 ——
      var maxV = S.slideLayer ? CFG.SLIDE_MAX : CFG.MOVE_MAX;
      if (S.input.targetX !== null) {
        var dx = S.input.targetX - D.x;
        var want = clamp(dx * 12, -maxV, maxV);
        D.vx += (want - D.vx) * clamp(dt * 16, 0, 1);
      } else if (S.input.dir !== 0) {
        D.vx += S.input.dir * CFG.MOVE_ACC * dt;
        D.vx = clamp(D.vx, -maxV, maxV);
      } else {
        D.vx *= Math.pow(0.0016, dt);     // 阻尼
      }
      D.x += D.vx * dt;

      // 撞左右壁：反弹并略失水（低惩罚）
      if (D.x < D.r) { D.x = D.r; D.vx = Math.abs(D.vx) * 0.42; D.sqv += 6; }
      if (D.x > CFG.VW - D.r) { D.x = CFG.VW - D.r; D.vx = -Math.abs(D.vx) * 0.42; D.sqv += 6; }

      // —— 贴叶 vs 自由落体 ——
      D.r = radiusOf(D.vol);
      if (S.slideLayer) {
        var SL = S.slideLayer;
        D.vy = 0;
        D.y = SL.y - D.r + 1.2;
        // 消耗（体积越大摊得越开、散得越快 → 只惩罚失误，不惩罚打得好）
        S.drop.vol = clamp(D.vol - CFG.LEAF_SINK * (0.65 + D.vol * 0.7) * dt, 0, CFG.MERGE_CAP);
        S.slideT += dt;
        // 叶面导流：贴上片刻后，水自己往最近的缝隙淌一点（玩家反向操作可抵抗）
        if (S.slideT > CFG.LEAF_FLOW_DELAY) {
          var gp0 = nearestGap(SL, D.x);
          if (gp0) {
            var sgn = gp0.c > D.x ? 1 : -1;
            D.vx += sgn * CFG.LEAF_FLOW * dt * Math.min(1, (S.slideT - CFG.LEAF_FLOW_DELAY) * 2.5);
          }
        }
        // 滑到缝里就脱附
        if (!segAt(SL, D.x, 0.62)) {
          S.slideLayer = null;
          S.slideT = 0;
          D.vy = 40;
          emit({ t: 'slipoff', x: D.x, y: D.y });
        }
      } else {
        D.vy += CFG.GRAV * dt;
      }
      // 落速上限统一在此收紧：体积骤降后 vy 不会残留超速（贴叶脱附 / 擦边同理）
      var vmLimit = vmaxOf(D.vol);
      if (D.vy > vmLimit) D.vy = vmLimit;

      var prevY = D.y;
      D.y += D.vy * dt;
      if (D.vol > S.maxVol) S.maxVol = D.vol;
      if (D.vol <= 0.0001) { D.vol = 0; emit({ t: 'soak', x: D.x, y: D.y }); finish('dry'); return; }

      // 表面张力：squash & stretch（触感）
      D.sqv += -D.sq * 150 * dt;
      D.sqv *= Math.pow(0.02, dt);
      D.sq += D.sqv * dt;
      D.sq = clamp(D.sq, -0.42, 0.42);

      // —— 层碰撞 ——
      for (var i = 0; i < S.layers.length; i++) {
        var L = S.layers[i];
        if (L.hit) continue;            // 每层只结算一次：否则擦边后会在同一层反复扣水
        var top = L.y;
        if (prevY + D.r <= top + 0.5 && D.y + D.r > top) {
          // 本帧刚跨过层顶面
          var inSeg = segAt(L, D.x, L.kind === 'branch' ? 0.8 : 1);
          if (!inSeg) {
            // 从缝里过 —— 完全通过，不阻拦
            if (!L.passed) {
              L.passed = true;
              S.layersPassed++;
              var gp = nearestGap(L, D.x);
              var off = gp ? Math.abs(D.x - gp.c) / Math.max(1, gp.w / 2) : 1;
              if (off < 0.34) {
                S.perfect++; S.combo++;
                if (S.combo > S.maxCombo) S.maxCombo = S.combo;
                // 蹭到叶沿的露水——打得准就有续航（体积大=分高但也更快更难，天然自我平衡）
                D.vol = clamp(D.vol + gainDiminish(CFG.PERFECT_GAIN * (1 + S.combo * 0.05), D.vol, 0.5), 0, CFG.MERGE_CAP);
                S.score += Math.round(14 * multOf(D.vol) * (1 + S.combo * 0.12));
                S.hitstop = CFG.HITSTOP;
                emit({ t: 'perfect', x: D.x, y: L.y, combo: S.combo });
                note(S.combo, L.kind === 'flower' ? 1 : 0);
              } else {
                S.score += Math.round(7 * multOf(D.vol));
                emit({ t: 'pass', x: D.x, y: L.y });
              }
              if (L.kind === 'flower') {
                L.bloom = 1;
                S.hitstop = Math.max(S.hitstop, CFG.HITSTOP * 1.5);
                emit({ t: 'flower', x: D.x, y: L.y });
              }
              if (S.combo >= 8) S.rainbow = true;
            }
          } else {
            // 撞上叶面
            var edges = [inSeg.x0, inSeg.x1];
            var dEdge = Math.min(Math.abs(D.x - edges[0]), Math.abs(D.x - edges[1]));
            var graze = dEdge < D.r * CFG.GRAZE_BAND;
            L.bendV += graze ? 62 : 140;
            L.bend = Math.max(L.bend, graze ? 3.2 : 6.5);
            S.combo = 0;
            if (L.kind === 'branch') {
              lose(CFG.BRANCH_COST, 'branch', D.x, L.y);
              emit({ t: 'branch', x: D.x, y: L.y });
              note(4, -1);
            } else if (graze) {
              lose(CFG.GRAZE_COST, 'graze', D.x, L.y);
              emit({ t: 'graze', x: D.x, y: L.y });
              note(1, -1);
            } else {
              lose(CFG.HIT_COST, 'hit', D.x, L.y);
              emit({ t: 'hit', x: D.x, y: L.y });
              note(0, -1);
            }
            if (D.vol <= 0.0001) { D.vol = 0; emit({ t: 'soak', x: D.x, y: D.y }); finish('dry'); return; }
            L.hit = true;
            // 擦边只是蹭掉一点水、继续往下淌（保节奏）；正面撞才被叶面托住
            if (L.kind === 'branch' || graze) {
              if (L.kind === 'branch') { D.vy = 60; }
              else { D.vy *= 0.78; }     // 不改 y：让它顺势穿过，不回头再判一次
            } else {
              S.slideLayer = L;
              S.slideT = 0;
              D.y = top - D.r + 1.2;
              D.vy = 0;
            }
          }
        }
      }

      // —— 水洼：合并 ——
      for (var p = 0; p < S.pools.length; p++) {
        var P = S.pools[p];
        if (P.taken) continue;
        var ddx = D.x - P.x, ddy = D.y - P.y;
        var rr = D.r + 12;             // 拾取略微宽容，鼓励"顺路喝一口"
        if (ddx * ddx + ddy * ddy < rr * rr) {
          P.taken = true;
          var gain = gainDiminish(Math.min(P.v, CFG.POOL_MAX_VOL), D.vol, 0.62);
          D.vol = clamp(D.vol + gain, 0, CFG.MERGE_CAP);
          S.poolsEaten++;
          S.score += Math.round(5 * multOf(D.vol));
          D.sqv += 14;
          emit({ t: 'absorb', x: P.x, y: P.y, v: gain, full: P.v });
          note(S.poolsEaten, 0);
        }
      }

      // 碰撞会削体积 → 落速上限同步下调，避免该帧残留超速
      D.r = radiusOf(D.vol);
      var vmEnd = vmaxOf(D.vol);
      if (D.vy > vmEnd) D.vy = vmEnd;

      // —— 相机 & 进度 ——
      var targetCam = D.y - S.viewH * 0.34;
      S.camY += (targetCam - S.camY) * clamp(dt * 7, 0, 1);
      S.depth = Math.max(0, (D.y - 0) / CFG.PX_PER_M);
      if (S.depth > S.maxDepth) S.maxDepth = S.depth;

      S.nearHome = clamp(1 - (CFG.HOME_DEPTH - S.depth) / 120, 0, 1);

      // 叶片回弹
      for (var b = 0; b < S.layers.length; b++) tickBend(S.layers[b], dt);

      ensure();

      if (S.depth >= CFG.HOME_DEPTH) { finish('home'); return; }
    }

    function tickBend(L, dt) {
      if (L.bend !== 0 || L.bendV !== 0) {
        L.bendV += -L.bend * 620 * dt;
        L.bendV *= Math.pow(0.006, dt);
        L.bend += L.bendV * dt;
        if (Math.abs(L.bend) < 0.02 && Math.abs(L.bendV) < 0.2) { L.bend = 0; L.bendV = 0; }
      }
      if (L.bloom > 0) L.bloom = Math.max(0, L.bloom - dt * 0.55);
    }

    var api = {
      state: S, CFG: CFG,
      reset: reset, start: start, update: update, finish: finish,
      radiusOf: radiusOf, vmaxOf: vmaxOf, multOf: multOf, deepRatio: deepRatio,
      setViewH: function (h) { S.viewH = h; opts.viewH = h; ensure(); },
      setDir: function (d) { S.input.dir = d; if (d !== 0) S.input.targetX = null; },
      setTargetX: function (x) { S.input.targetX = x; },
      clearTargetX: function () { S.input.targetX = null; },
      drain: function () { var e = S.events.slice(); S.events.length = 0; return e; },
      summary: function () {
        return {
          depth: Math.floor(S.maxDepth), score: S.score, layers: S.layersPassed,
          perfect: S.perfect, maxCombo: S.maxCombo, maxVol: S.maxVol,
          pools: S.poolsEaten, reason: S.overReason, rainbow: S.rainbow
        };
      }
    };

    reset();
    return api;
  }

  g.DewGame = {
    createGame: createGame, CFG: CFG,
    radiusOf: radiusOf, vmaxOf: vmaxOf, multOf: multOf
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = g.DewGame;
})(typeof globalThis !== 'undefined' ? globalThis : this);
