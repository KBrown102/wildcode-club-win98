/* 302 雪径 · 开路 — 纯逻辑层（零 DOM / 零 Canvas，可在 Node 里冒烟）
 * 核心：深雪里走路很贵很慢；踩过一遍就是路；反复走会压成硬路；硬路填平得慢。
 *       滑行（在已有的路上）又快又省，但会把路磨薄 —— 路是资产，也是消耗品。
 */
(function (g) {
  'use strict';

  var K = {
    W: 900, H: 600,
    CELL: 15, COLS: 60, ROWS: 40,
    PR: 9,                 // 玩家半径
    SPD: 172,              // 硬路上的速度
    DEEP_MUL: 0.22,        // 深雪速度系数（firm=0）→ 深雪几乎走不动
    FIRM_MUL: 0.78,        // + firm*FIRM_MUL（firm=1 时满速）
    COST: 0.110,           // 每像素体力（firm=0）—— 深雪是真的很贵：空手 900px 就把人走空
    COST_FIRM: 0.72,       // cost *= 1 - COST_FIRM*firm
    STAM: 100,
    REGEN: 1.00,           // 静止回体力
    LOW_SPD: 0.50,         // 体力见底后的速度（软兜底，不锁死）
    FILL: 0.030,           // 风雪填平基准速率
    FILL_FIRM: 0.86,       // rate *= 1 - FILL_FIRM*firm（硬路几乎填不平，浅痕会消失）
    PACK: 0.06,            // 正常走过时的压实速率（很慢：路是反复走出来的）
    PACK_PRESS: 7.0,       // 按住「压」时的压实速率
    PRESS_SPD: 0.70,       // 压实时走得慢
    PRESS_COST: 1.08,
    STAMP: 0.26,           // 一脚踩出的初始 trail（浅痕，不是路）
    SLIDE_FIRM: 0.30,      // 能滑行的最低 firm
    SLIDE_SPD: 1.72,
    SLIDE_COST: 0.52,
    SLIDE_WEAR: 0.0035,    // 滑行每像素磨掉的 trail（滑一趟，路就松了）
    SLIDE_TURN: 6.2,       // 滑行转向角速度 rad/s
    ICE_SPD: 1.05,
    ICE_COST: 0.34,
    FLAG_R: 24,
    HOME_R: 28,
    HOME_PACK_R: 42,       // 营地周围预压实半径
    DELIVER_GAIN: 20,
    LOAD: 0.95,               // 负重惩罚系数：cost *= 1 + LOAD*(bag/cap)*(1-firm)      // 送信回家回体力（充电宝）
    STAMP_R: 27,
    MOVE_EPS: 20           // 判定「在动」的速度下限（压实只在动的时候发生）
  };

  var LEVELS = [
    { flags: 5,  nc: 2, rocks: 0,  ice: 0, cap: 1, stam: 100, fill: 0.018, tmax: 64,  seed: 10411 },
    { flags: 6,  nc: 2, rocks: 3,  ice: 1, cap: 1, stam: 100, fill: 0.021, tmax: 70,  seed: 20837 },
    { flags: 7,  nc: 2, rocks: 5,  ice: 1, cap: 1, stam: 100, fill: 0.024, tmax: 78,  seed: 31219 },
    { flags: 8,  nc: 2, rocks: 7,  ice: 2, cap: 1, stam: 98,  fill: 0.027, tmax: 84,  seed: 41653 },
    { flags: 9,  nc: 3, rocks: 9,  ice: 2, cap: 1, stam: 96,  fill: 0.030, tmax: 92,  seed: 52071 },
    { flags: 10, nc: 3, rocks: 11, ice: 2, cap: 1, stam: 94,  fill: 0.033, tmax: 96,  seed: 62489 },
    { flags: 11, nc: 3, rocks: 12, ice: 3, cap: 1, stam: 92,  fill: 0.036, tmax: 100, seed: 72803 },
    { flags: 12, nc: 3, rocks: 14, ice: 3, cap: 1, stam: 90,  fill: 0.040, tmax: 104, seed: 83117 }
  ];

  // ---------- 工具 ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function dist(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }
  function cellOf(x, y) {
    var c = Math.floor(x / K.CELL), r = Math.floor(y / K.CELL);
    if (c < 0) c = 0; if (c >= K.COLS) c = K.COLS - 1;
    if (r < 0) r = 0; if (r >= K.ROWS) r = K.ROWS - 1;
    return r * K.COLS + c;
  }

  // ---------- 关卡生成 ----------
  function reachableFree(rocks, sx, sy) {
    // 以 (sx,sy) 为源在格网上 BFS，返回可达布尔数组
    var n = K.COLS * K.ROWS, free = new Uint8Array(n), seen = new Uint8Array(n);
    for (var i = 0; i < n; i++) {
      var cx = (i % K.COLS) * K.CELL + K.CELL / 2;
      var cy = Math.floor(i / K.COLS) * K.CELL + K.CELL / 2;
      var ok = 1;
      for (var j = 0; j < rocks.length; j++) {
        var d = dist(cx, cy, rocks[j].x, rocks[j].y);
        if (d < rocks[j].r + K.PR + 1) { ok = 0; break; }
      }
      free[i] = ok;
    }
    var s = cellOf(sx, sy);
    if (!free[s]) return { free: free, seen: seen, ok: false };
    var q = [s]; seen[s] = 1;
    for (var h = 0; h < q.length; h++) {
      var c0 = q[h], cx0 = c0 % K.COLS, cy0 = Math.floor(c0 / K.COLS);
      var nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (var k = 0; k < 4; k++) {
        var nx = cx0 + nb[k][0], ny = cy0 + nb[k][1];
        if (nx < 0 || ny < 0 || nx >= K.COLS || ny >= K.ROWS) continue;
        var ni = ny * K.COLS + nx;
        if (seen[ni] || !free[ni]) continue;
        seen[ni] = 1; q.push(ni);
      }
    }
    return { free: free, seen: seen, ok: true };
  }

  function genLevel(idx, seedSalt) {
    var L = LEVELS[idx];
    var salt = (seedSalt === undefined ? 0 : seedSalt) | 0;
    for (var attempt = 0; attempt < 240; attempt++) {
      var r = mulberry32(L.seed + salt * 7919 + attempt * 104729);
      var home = {
        x: K.W / 2 + (r() - 0.5) * 150,
        y: K.H / 2 + (r() - 0.5) * 120
      };
      home.x = clamp(home.x, 200, K.W - 200);
      home.y = clamp(home.y, 170, K.H - 170);

      // 障碍分区放块：6×4 格网，每格至多一个障碍 → 天然保证间距（比随机撒重试稳得多）
      var GX = 6, GY = 4, CW = K.W / GX, CH = K.H / GY;
      var cells = [];
      for (var gy = 0; gy < GY; gy++) for (var gx = 0; gx < GX; gx++) cells.push([gx, gy]);
      for (var s2 = cells.length - 1; s2 > 0; s2--) {
        var j3 = Math.floor(r() * (s2 + 1)); var tp = cells[s2]; cells[s2] = cells[j3]; cells[j3] = tp;
      }
      var ci = 0;
      function takeCell() { return ci < cells.length ? cells[ci++] : null; }

      // 冰面
      var ice = [];
      for (var i = 0; i < L.ice;) {
        var c0 = takeCell(); if (!c0) break;
        var ir = 34 + r() * 20;
        var ix = clamp((c0[0] + 0.5) * CW + (r() - 0.5) * 44, 40 + ir, K.W - 40 - ir);
        var iy = clamp((c0[1] + 0.5) * CH + (r() - 0.5) * 44, 40 + ir, K.H - 40 - ir);
        if (dist(ix, iy, home.x, home.y) < ir + 125) continue;
        ice.push({ x: ix, y: iy, r: ir }); i++;
      }
      if (ice.length < L.ice) continue;

      // 岩石
      var rocks = [];
      for (var j = 0; j < L.rocks;) {
        var c1 = takeCell(); if (!c1) break;
        var rr = 15 + r() * 11;
        var rx = clamp((c1[0] + 0.5) * CW + (r() - 0.5) * 44, 30 + rr, K.W - 30 - rr);
        var ry = clamp((c1[1] + 0.5) * CH + (r() - 0.5) * 44, 30 + rr, K.H - 30 - rr);
        if (dist(rx, ry, home.x, home.y) < rr + 105) continue;
        var bad2 = false;
        for (var c = 0; c < ice.length; c++) if (dist(rx, ry, ice[c].x, ice[c].y) < ice[c].r + rr + 16) { bad2 = true; break; }
        if (bad2) continue;
        for (var b = 0; b < rocks.length; b++) if (dist(rx, ry, rocks[b].x, rocks[b].y) < rr + rocks[b].r + 30) { bad2 = true; break; }
        if (bad2) continue;
        rocks.push({ x: rx, y: ry, r: rr }); j++;
      }
      if (rocks.length < L.rocks) continue;

      var rf = reachableFree(rocks, home.x, home.y);
      if (!rf.ok) continue;

      // 旗标：成簇布点（同簇共享一条主干道 = 修路才有意义）
      var nc = L.nc || clamp(Math.round(L.flags / 3), 2, 4);
      var per = [], left = L.flags;
      for (var q0 = 0; q0 < nc; q0++) { var base = Math.floor(L.flags / nc); per.push(q0 < (L.flags % nc) ? base + 1 : base); left -= per[q0]; }
      var flags = [], okAll = true;
      var b0 = r() * 6.283;
      for (var cl = 0; cl < nc && okAll; cl++) {
        var ang = b0 + cl / nc * 6.283 + (r() - 0.5) * 0.55;
        var rad = 172 + r() * 130;
        for (var f = 0, g2 = 0; f < per[cl] && g2 < 9000; g2++) {
          var ja = ang + (r() - 0.5) * 1.15, jr = rad + (r() - 0.5) * 95;
          var fx = clamp(home.x + Math.cos(ja) * jr, 54, K.W - 54);
          var fy = clamp(home.y + Math.sin(ja) * jr, 54, K.H - 54);
          if (dist(fx, fy, home.x, home.y) < 150) continue;
          var bad3 = false;
          for (var m = 0; m < flags.length; m++) if (dist(fx, fy, flags[m].x, flags[m].y) < 78) { bad3 = true; break; }
          if (bad3) continue;
          for (var q2 = 0; q2 < rocks.length; q2++) if (dist(fx, fy, rocks[q2].x, rocks[q2].y) < rocks[q2].r + K.PR + 22) { bad3 = true; break; }
          if (bad3) continue;
          var ci = cellOf(fx, fy);
          if (!rf.seen[ci]) continue;
          flags.push({ x: fx, y: fy, got: false, ph: r() * 6.28, cl: cl }); f++;
        }
        if (f < per[cl]) okAll = false;
      }
      if (flags.length < L.flags || !okAll) continue;

      return {
        idx: idx, home: home, rocks: rocks, ice: ice, flags: flags,
        stam: L.stam, fill: L.fill, tmax: L.tmax, cap: L.cap,
        nflags: L.flags
      };
    }
    // 兜底（几乎不可能）：无岩石
    var r2 = mulberry32(L.seed + salt * 31 + 7);
    var hm = { x: K.W / 2, y: K.H / 2 }, fl = [];
    for (var z = 0; z < L.flags; z++) {
      var ang = (z / L.flags) * 6.283 + r2() * 0.5;
      var rad = 200 + r2() * 120;
      fl.push({ x: clamp(hm.x + Math.cos(ang) * rad, 60, K.W - 60), y: clamp(hm.y + Math.sin(ang) * rad, 60, K.H - 60), got: false, ph: r2() * 6.28 });
    }
    return { idx: idx, home: hm, rocks: [], ice: [], flags: fl, stam: L.stam, fill: L.fill, tmax: L.tmax, cap: L.cap, nflags: L.flags };
  }

  // ---------- 状态 ----------
  function create(levelIdx, seedSalt) {
    var lv = genLevel(levelIdx, seedSalt);
    var st = {
      lv: lv, level: levelIdx, seed: seedSalt || 0,
      trail: new Float32Array(K.COLS * K.ROWS),
      x: lv.home.x, y: lv.home.y,
      vx: 0, vy: 0, sdx: 0, sdy: -1, sliding: false,
      stam: lv.stam, stamMax: lv.stam,
      bag: 0, delivered: 0, total: lv.flags.length,
      t: 0, tmax: lv.tmax,
      win: false, over: false, finalScore: 0,
      events: [], moved: 0, dist: 0, slides: 0, packed: 0
    };
    // 营地周围预算压实
    for (var i = 0; i < st.trail.length; i++) {
      var cx = (i % K.COLS) * K.CELL + K.CELL / 2, cy = Math.floor(i / K.COLS) * K.CELL + K.CELL / 2;
      var d = dist(cx, cy, lv.home.x, lv.home.y);
      if (d < K.HOME_PACK_R) st.trail[i] = 1.6 * (1 - d / K.HOME_PACK_R) + 0.4;
    }
    return st;
  }

  function iceAt(st, x, y) {
    for (var i = 0; i < st.lv.ice.length; i++) {
      var p = st.lv.ice[i];
      if ((x - p.x) * (x - p.x) + (y - p.y) * (y - p.y) < p.r * p.r) return true;
    }
    return false;
  }
  function solidAt(st, x, y) {
    for (var i = 0; i < st.lv.rocks.length; i++) {
      var p = st.lv.rocks[i], R = p.r + K.PR;
      if ((x - p.x) * (x - p.x) + (y - p.y) * (y - p.y) < R * R) return true;
    }
    return false;
  }
  function trailAt(st, x, y) {
    var fx = x / K.CELL - 0.5, fy = y / K.CELL - 0.5;
    var c0 = Math.floor(fx), r0 = Math.floor(fy);
    var tx = fx - c0, ty = fy - r0;
    function g(c, r) {
      if (c < 0 || r < 0 || c >= K.COLS || r >= K.ROWS) return 0;
      return st.trail[r * K.COLS + c];
    }
    var a = g(c0, r0), b = g(c0 + 1, r0), c = g(c0, r0 + 1), d = g(c0 + 1, r0 + 1);
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }
  function firmAt(st, x, y) {
    if (iceAt(st, x, y)) return 1;
    return clamp(trailAt(st, x, y) / 2, 0, 1);
  }

  // ---------- 主更新 ----------
  function update(st, dt, input) {
    if (st.over) return st;
    if (!isFinite(dt) || dt < 0) dt = 0;
    if (dt > 0.05) dt = 0.05;
    if (st.events.length > 48) st.events.length = 0;
    input = input || {};
    var ix = input.dx || 0, iy = input.dy || 0;
    var mag = Math.sqrt(ix * ix + iy * iy);
    if (mag > 1e-6) { ix /= mag; iy /= mag; } else { ix = 0; iy = 0; }

    st.t += dt;

    var onIce = iceAt(st, st.x, st.y);
    var firm = firmAt(st, st.x, st.y);

    // 是否滑行
    var pressing = !!input.pack && !onIce && !input.slide;
    var wantSlide = !!input.slide && !onIce && firm >= K.SLIDE_FIRM && !pressing;
    if (wantSlide && !st.sliding) { st.sliding = true; st.events.push({ t: 'slideon' }); }
    if (!wantSlide && st.sliding) { st.sliding = false; st.events.push({ t: 'slideoff' }); }

    var spd, costMul;
    if (onIce) { spd = K.SPD * K.ICE_SPD; costMul = K.ICE_COST; }
    else {
      spd = K.SPD * (K.DEEP_MUL + K.FIRM_MUL * firm);
      costMul = 1 - K.COST_FIRM * firm;
    }
    if (pressing) { spd *= K.PRESS_SPD; costMul *= K.PRESS_COST; }
    if (st.sliding) { spd *= K.SLIDE_SPD; costMul *= K.SLIDE_COST; }
    // 负重：背着信走松雪很累，走压实的路不累
    if (st.bag > 0 && !onIce) costMul *= 1 + K.LOAD * (st.bag / st.lv.cap) * (1 - firm);
    if (st.stam <= 0) { spd *= K.LOW_SPD; costMul = 0; }

    // 速度
    if (st.sliding) {
      if (mag > 1e-6) {
        var cur = Math.atan2(st.sdy, st.sdx), want = Math.atan2(iy, ix);
        var d = want - cur;
        while (d > Math.PI) d -= 6.283185307;
        while (d < -Math.PI) d += 6.283185307;
        var mx = K.SLIDE_TURN * dt;
        if (d > mx) d = mx; else if (d < -mx) d = -mx;
        var na = cur + d;
        st.sdx = Math.cos(na); st.sdy = Math.sin(na);
      }
      st.vx = st.sdx * spd; st.vy = st.sdy * spd;
    } else {
      st.vx = ix * spd; st.vy = iy * spd;
      if (mag > 1e-6) { st.sdx = ix; st.sdy = iy; }
    }

    // 位移（小步推进 + 岩石推出）
    var step = spd * dt;
    var nsub = Math.max(1, Math.ceil(step / 4));
    var sdt = dt / nsub;
    var moved = 0;
    for (var s = 0; s < nsub; s++) {
      var nx = st.x + st.vx * sdt, ny = st.y + st.vy * sdt;
      nx = clamp(nx, K.PR, K.W - K.PR); ny = clamp(ny, K.PR, K.H - K.PR);
      for (var i = 0; i < st.lv.rocks.length; i++) {
        var p = st.lv.rocks[i], R = p.r + K.PR + 0.5;   // +0.5：推出后严格落在体外，避免浮点误差被判成「穿进去了」
        var dx = nx - p.x, dy = ny - p.y, dd = Math.sqrt(dx * dx + dy * dy);
        if (dd < R) {
          if (dd < 1e-4) { dx = 1; dy = 0; dd = 1; }
          nx = p.x + dx / dd * R; ny = p.y + dy / dd * R;
          st.events.push({ t: 'bump', x: nx, y: ny });
        }
      }
      moved += dist(nx, ny, st.x, st.y);
      st.x = nx; st.y = ny;
    }
    st.moved = moved; st.dist += moved;

    // 体力
    if (costMul > 0) st.stam = Math.max(0, st.stam - K.COST * costMul * moved);
    if (moved < 0.4) st.stam = Math.min(st.stamMax, st.stam + K.REGEN * dt);
    else st.stam = Math.min(st.stamMax, st.stam);

    // 压实 / 滑行磨损（只在真的在动的时候）
    if (moved / Math.max(dt, 1e-4) > K.MOVE_EPS && !onIce) {
      var c = Math.floor(st.x / K.CELL), rr = Math.floor(st.y / K.CELL);
      var rad = 2;   // 破雪开路：一条路有真人那么宽，返程才踩得回来
      for (var cc = c - rad; cc <= c + rad; cc++) {
        for (var r2 = rr - rad; r2 <= rr + rad; r2++) {
          if (cc < 0 || r2 < 0 || cc >= K.COLS || r2 >= K.ROWS) continue;
          var cx = cc * K.CELL + K.CELL / 2, cy = r2 * K.CELL + K.CELL / 2;
          var dc = dist(cx, cy, st.x, st.y);
          if (dc > K.STAMP_R) continue;
          var wgt = dc < K.CELL ? 1 : 0.55;
          var id = r2 * K.COLS + cc;
          if (iceAt(st, cx, cy)) continue;
          if (st.sliding) {
            var before = st.trail[id];
            st.trail[id] = Math.max(0, st.trail[id] - K.SLIDE_WEAR * moved * wgt);
            if (before > 0.5 && st.trail[id] <= 0.5) st.events.push({ t: 'wear', x: cx, y: cy });
          } else {
            var pr = (pressing ? K.PACK_PRESS : K.PACK) * wgt;
            var base = K.STAMP * wgt;
            // 注意：trail 是 Float32Array，写进去会掉精度（0.26 → 0.25999999），
            // 所以「踩一脚」与「继续压实」必须是两个独立 if，不能写 else if —— 否则 base 判定恒真，路永远压不实。
            if (st.trail[id] < base) st.trail[id] = base;                                 // 踩一脚就有浅痕
            if (st.trail[id] < 2) { st.trail[id] = Math.min(2, st.trail[id] + pr * dt); st.packed += pr * dt; }
          }
        }
      }
      if (moved > 0.4 && !st.sliding) st.events.push({ t: 'step', firm: firm, x: st.x, y: st.y, ice: onIce, press: pressing });
      if (st.sliding) { st.slides += dt; st.events.push({ t: 'hiss', x: st.x, y: st.y, v: spd }); }
    }

    // 风雪填平
    var fill = st.lv.fill;
    var tr = st.trail;
    for (var q = 0; q < tr.length; q++) {
      var v = tr[q];
      if (v <= 0) continue;
      var fr = clamp(v / 2, 0, 1);
      tr[q] = Math.max(0, v - fill * (1 - K.FILL_FIRM * fr) * dt);
    }

    // 拾信
    for (var f = 0; f < st.lv.flags.length; f++) {
      var fg = st.lv.flags[f];
      if (fg.got) continue;
      if (dist(st.x, st.y, fg.x, fg.y) < K.FLAG_R && st.bag < st.lv.cap) {
        fg.got = true; st.bag++;
        st.events.push({ t: 'pick', x: fg.x, y: fg.y, n: st.bag });
      }
    }
    // 回家送信
    if (st.bag > 0 && dist(st.x, st.y, st.lv.home.x, st.lv.home.y) < K.HOME_R) {
      st.delivered += st.bag; st.bag = 0;
      st.stam = Math.min(st.stamMax, st.stam + K.DELIVER_GAIN);
      st.events.push({ t: 'deliver', n: st.delivered });
    }

    // 事件硬上限：一帧内 step/bump/wear 可能推很多条，收尾统一截断，保证永远 ≤48
    if (st.events.length > 48) st.events.splice(0, st.events.length - 48);

    // 结算：先置 win → 算分 → 再置 over
    if (st.delivered >= st.total && st.bag === 0) { st.win = true; }
    if (st.win) { st.finalScore = score(st); st.over = true; st.events.push({ t: 'win' }); }
    else if (st.t >= st.tmax) { st.over = true; st.finalScore = score(st); st.events.push({ t: 'timeout' }); }

    return st;
  }

  function score(st) {
    if (st.over && st.finalScore) return st.finalScore;
    var s = st.delivered * 70;
    if (st.win) {
      s += 240;
      s += Math.round(st.stam * 2.0);
      s += Math.round(Math.max(0, st.tmax - st.t) * 1.4);
    }
    return s;
  }

  // ---------- 供 AI / 渲染用的查询 ----------
  function costGrid(st) {
    var n = K.COLS * K.ROWS, out = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var cx = (i % K.COLS) * K.CELL + K.CELL / 2, cy = Math.floor(i / K.COLS) * K.CELL + K.CELL / 2;
      if (solidAt(st, cx, cy)) { out[i] = -1; continue; }
      var fr = firmAt(st, cx, cy);
      var cm = iceAt(st, cx, cy) ? K.ICE_COST : (1 - K.COST_FIRM * fr);
      out[i] = K.CELL * cm + 0.35;
    }
    return out;
  }

  var API = {
    K: K, LEVELS: LEVELS,
    mulberry32: mulberry32, clamp: clamp, dist: dist, cellOf: cellOf,
    genLevel: genLevel, create: create, update: update, score: score,
    iceAt: iceAt, solidAt: solidAt, trailAt: trailAt, firmAt: firmAt,
    costGrid: costGrid, reachableFree: reachableFree
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  g.SC302 = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
