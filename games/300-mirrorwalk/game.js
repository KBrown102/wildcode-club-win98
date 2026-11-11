/* 300-mirrorwalk《倒影 · 影随形》— 纯逻辑层（零 DOM / 零 Canvas，供 Node 冒烟）
   核心：倒影 = 本体关于水面的刚性镜像。本体跳得越高，影子沉得越深。 */
(function (root) {
  'use strict';

  var CELL = 30, COLS = 30, ROWS = 20;
  var W = COLS * CELL, H = ROWS * CELL;          // 900 x 600
  var SURF_ROW = 11, SURF_Y = SURF_ROW * CELL;   // 水面 y = 330

  var BW = 19, BH = 44;                          // 本体尺寸
  var GRAV_UP = 1250, GRAV_DN = 1850;
  var JUMP_V = 600, JUMP_CUT = 300;              // 满跳 144px / 最小跳 24px
  var JUMP_MAX = 144;
  var VX = 200, ACC = 1700, AIR_ACC = 1000, FRIC = 2000;
  var LR = 16, PAD = 4;                          // 莲碰撞半径 / 倒影判定外扩
  var TUNE = { qiRegen: 1.0, vx: 200, grow: 0.36 };
  var HP_CAP = 220;                              // 倒影底不超出世界
  var COMBO_STEP = 0.25;
  var DECAY_TIME = 0.22;   // 影子要把花含住一会儿，花才开（扫过不算）

  var LEVELS = [
    { lotus: 2, maxD: 2, branch: 0, rock: 0, qi: 16, tmax: 36, plat: 1 },
    { lotus: 3, maxD: 2, branch: 1, rock: 1, qi: 15, tmax: 39, plat: 1 },
    { lotus: 4, maxD: 3, branch: 1, rock: 1, qi: 15, tmax: 44, plat: 2 },
    { lotus: 5, maxD: 3, branch: 2, rock: 2, qi: 14, tmax: 49, plat: 2 },
    { lotus: 5, maxD: 4, branch: 2, rock: 2, qi: 14, tmax: 53, plat: 2 },
    { lotus: 6, maxD: 4, branch: 3, rock: 3, qi: 13, tmax: 58, plat: 3 },
    { lotus: 7, maxD: 5, branch: 3, rock: 3, qi: 13, tmax: 63, plat: 3 },
    { lotus: 8, maxD: 6, branch: 3, rock: 3, qi: 12, tmax: 70, plat: 3 }
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

  // ---------- 关卡生成 ----------
  function makeLevel(level, seed) {
    var cfg = LEVELS[clamp(level, 1, LEVELS.length) - 1];
    var rnd = mulberry32(((level * 7919 + (seed || 0) * 104729 + 20260913) >>> 0));
    var grid = new Uint8Array(ROWS * COLS);
    var groundTop = new Int8Array(COLS);
    var c, r;

    for (c = 0; c < COLS; c++) groundTop[c] = SURF_ROW - 1;   // 基准岸（1 格高）
    groundTop[0] = SURF_ROW - 1;

    // 抬高的石台
    var plats = [];
    for (var p = 0; p < cfg.plat; p++) {
      var pw = 2 + Math.floor(rnd() * 4);
      var pc = 3 + Math.floor(rnd() * (COLS - 6 - pw));
      var ph = 1;              // 额外抬高 1~2 格
      var top = SURF_ROW - 1 - ph;
      var ok = pc >= 5;
      if (ok) for (c = pc - 1; c <= pc + pw; c++) { if (c < 5 || c >= COLS - 2 || groundTop[c] <= top) { ok = false; break; } }
      if (!ok) continue;
      for (c = pc; c < pc + pw; c++) groundTop[c] = top;
      plats.push({ c0: pc, c1: pc + pw - 1, h: ph });
    }
    for (c = 0; c < COLS; c++) for (r = groundTop[c]; r < SURF_ROW; r++) grid[r * COLS + c] = 1;

    // 深度工具（只依赖 groundTop / grid）
    function baseAt(cc) { return SURF_Y - groundTop[cc] * CELL; }
    function hpMaxAt(cc) {
      var base = baseAt(cc);
      var ceilR = -1;
      for (var rr = groundTop[cc] - 1; rr >= 0; rr--) { if (grid[rr * COLS + cc] === 1) { ceilR = rr; break; } }
      var lim = ceilR < 0 ? 9999 : (SURF_Y - BH - (ceilR + 1) * CELL);
      return Math.min(base + JUMP_MAX, lim, HP_CAP);
    }
    function reflBlockedAt(cc, hp) {
      var ry = SURF_Y + hp, x = cc * CELL + 5;
      var c0 = Math.floor(x / CELL), c1 = Math.floor((x + BW - 0.001) / CELL);
      var r0 = Math.floor(ry / CELL), r1 = Math.floor((ry + BH - 0.001) / CELL);
      for (var rr = r0; rr <= r1; rr++) for (var cq = c0; cq <= c1; cq++) {
        if (cq < 0 || cq >= COLS) return true;
        if (rr >= ROWS) return true;
        if (rr >= SURF_ROW && grid[rr * COLS + cq] === 2) return true;
      }
      return false;
    }
    function colHasFreeHp(cc) { return freeRun(cc) >= 2; }
    // 最长连续可通行深度（px）—— 太窄的缝是「静默卡死」，必须保证 ≥ 45px
    function freeRun(cc) {
      var lo = baseAt(cc), hi = Math.max(lo, hpMaxAt(cc));
      var best = 0, cur = 0;
      for (var hp = lo; hp <= hi + 0.001; hp += 2) {
        if (!reflBlockedAt(cc, hp)) { cur += 2; if (cur > best) best = cur; } else cur = 0;
      }
      return best;
    }
    function vertClear(cc, d) {
      for (var r2 = SURF_ROW; r2 <= Math.min(ROWS - 1, SURF_ROW + d + 1); r2++) {
        if (grid[r2 * COLS + cc] === 2) return false;
        if (cc + 1 < COLS && grid[r2 * COLS + cc + 1] === 2) return false;
      }
      return true;
    }

    // 岸上横枝（限制跳跃高度的唯一天花板）
    var branches = [];
    for (var b = 0; b < cfg.branch; b++) {
      var bw2 = 1 + Math.floor(rnd() * 3);
      var bc = 3 + Math.floor(rnd() * (COLS - 6 - bw2));
      var k = 4 + Math.floor(rnd() * (level >= 5 ? 4 : 3));   // 离地格数：4→+46px、5→+76px、6→+106px、7→+136px（k=3 只剩 16px 窗口 = 静默卡死）
      var okb = true, row = -99;
      for (c = bc; c < bc + bw2; c++) {
        var gt = groundTop[c];
        var rr = gt - k;
        if (rr < 1) { okb = false; break; }
        if (row === -99) row = rr; else row = Math.min(row, rr);
      }
      if (!okb) continue;
      for (c = bc; c < bc + bw2; c++) {
        for (r = row; r < row + 1; r++) grid[r * COLS + c] = 1;
      }
      branches.push({ c0: bc, c1: bc + bw2 - 1, row: row });
    }

    // 水下礁石
    var rocks = [];
    for (var k2 = 0; k2 < cfg.rock; k2++) {
      var rc = 3 + Math.floor(rnd() * (COLS - 6));
      // 深度偏向浅中层（rows 12~14）：正好卡住「站着不动时」的倒影 → 逼玩家跳起来把影子沉下去绕行
      var rd = rnd() < 0.75 ? (1 + Math.floor(rnd() * 3)) : (4 + Math.floor(rnd() * 2));
      var vert = rnd() < 0.4;
      var len = 1 + Math.floor(rnd() * 3);
      for (var i = 0; i < len; i++) {
        var cc = vert ? rc : rc + i;
        var rr2 = SURF_ROW + rd + (vert ? i : 0);
        if (cc < 0 || cc >= COLS || rr2 >= ROWS) break;
        grid[rr2 * COLS + cc] = 2;
        rocks.push({ c: cc, r: rr2 });
      }
    }

    // 可通行性修复：任何一列都必须存在「倒影不撞礁」的深度，否则整条岸走不过去
    for (c = 0; c < COLS; c++) {
      var guard = 0;
      while (freeRun(c) < 46 && guard++ < 30) {
        var deep = -1;
        for (r = ROWS - 1; r >= SURF_ROW; r--) if (grid[r * COLS + c] === 2) { deep = r; break; }
        if (deep < 0) break;
        grid[deep * COLS + c] = 0;
      }
    }

    var L = { cfg: cfg, grid: grid, groundTop: groundTop, plats: plats, branches: branches, rocks: rocks };

    // 莲
    var lotus = [], goldenLeft = level >= 3 ? Math.min(2, Math.floor(level / 3)) : 0;
    var slots = [];
    for (c = 3; c < COLS - 2; c++) slots.push(c);
    for (var i2 = slots.length - 1; i2 > 0; i2--) { var j2 = Math.floor(rnd() * (i2 + 1)); var t2 = slots[i2]; slots[i2] = slots[j2]; slots[j2] = t2; }
    var used = {};
    for (var n = 0; n < cfg.lotus && slots.length; n++) {
      var placed = false;
      for (var tryI = 0; tryI < slots.length && !placed; tryI++) {
        var lc = slots[(n * 7 + tryI) % slots.length];
        if (used[lc]) continue;
        for (var dTry = 0; dTry < 30 && !placed; dTry++) {
          var d = 2 + Math.floor(rnd() * (cfg.maxD - 1));       // 最浅 2 格（站着就能含住）
          var Dc = d * CELL - 15;
          var needLo = Math.max(0, Dc - (BH + PAD));             // 倒影顶必须不高于花
          var needHi = Dc + PAD;
          if (baseAt(lc) > needHi) continue;                     // 站着就已经太深
          if (hpMaxAt(lc) < Math.max(baseAt(lc), needLo) + 8) continue;   // 够不到
          if (!vertClear(lc, d)) continue;
          var golden = goldenLeft > 0 && d >= cfg.maxD - 1 && rnd() < 0.5;
          if (golden) goldenLeft--;
          lotus.push({ c: lc, d: d, kind: golden ? 1 : 0, taken: false, grow: 0, pop: 0, x: lc * CELL + CELL / 2, y: SURF_Y + d * CELL - CELL / 2 });
          used[lc] = 1; placed = true;
        }
      }
    }

    // 气穴（水面下第一格，倒影贴水面时自动吸到）
    var bubbles = [];
    var nb = cfg.rock >= 3 ? 2 : 1;
    for (var q = 0; q < nb; q++) {
      for (var tq = 0; tq < 40; tq++) {
        var qc = 2 + Math.floor(rnd() * (COLS - 4));
        if (grid[(SURF_ROW + 1) * COLS + qc] === 2) continue;
        if (grid[(SURF_ROW + 2) * COLS + qc] === 2) continue;
        var dup = false;
        for (var z = 0; z < bubbles.length; z++) if (Math.abs(bubbles[z].c - qc) < 4) dup = true;
        if (dup) continue;
        bubbles.push({ c: qc, r: SURF_ROW + 1, cool: 0, used: 0 });
        break;
      }
    }

    L.lotus = lotus; L.bubbles = bubbles;
    L.startC = 1;
    L.hpMaxAt = hpMaxAt; L.baseAt = baseAt;
    return L;
  }

  // ---------- 状态 ----------
  function createState(level, seed) {
    var L = makeLevel(level, seed);
    var st = {
      level: level, seed: seed | 0, L: L,
      t: 0, over: false, win: false,
      qiMax: L.cfg.qi, qi: L.cfg.qi, qiTimer: 0,
      tmax: L.cfg.tmax,
      body: { x: L.startC * CELL + 5, y: L.groundTop[L.startC] * CELL - BH, w: BW, h: BH, vx: 0, vy: 0, onGround: true, coyote: 0, face: 1, sq: 0, walk: 0 },
      combo: 0, bestCombo: 0,
      lotusPt: 0, taken: 0, total: L.lotus.length,
      jumps: 0, hits: 0,
      events: [], finalScore: 0, score: 0
    };
    st.body.y = L.groundTop[L.startC] * CELL - BH;
    return st;
  }

  function solidBody(st, c, r) {
    if (c < 0 || c >= COLS) return true;
    if (r < 0) return true;
    if (r >= SURF_ROW) return false;
    return st.L.grid[r * COLS + c] === 1;
  }
  function solidRefl(st, c, r) {
    if (c < 0 || c >= COLS) return true;
    if (r < SURF_ROW) return false;
    if (r >= ROWS) return true;
    return st.L.grid[r * COLS + c] === 2;
  }
  function rectHits(st, x, y, w, h, isRefl) {
    var c0 = Math.floor(x / CELL), c1 = Math.floor((x + w - 0.001) / CELL);
    var r0 = Math.floor(y / CELL), r1 = Math.floor((y + h - 0.001) / CELL);
    for (var r = r0; r <= r1; r++) for (var c = c0; c <= c1; c++) {
      if (isRefl ? solidRefl(st, c, r) : solidBody(st, c, r)) return true;
    }
    return false;
  }
  function reflY(y) { return 2 * SURF_Y - y - BH; }
  function bodyFree(st, x, y) { return !rectHits(st, x, y, BW, BH, false); }
  function reflFree(st, x, y) { return !rectHits(st, x, reflY(y), BW, BH, true); }

  function hpOf(st) { return SURF_Y - (st.body.y + BH); }

  // ---------- 主步进 ----------
  function step(st, dt, input) {
    if (!(dt > 0)) dt = 0;
    if (!isFinite(dt)) dt = 0;
    if (dt > 0.05) dt = 0.05;
    input = input || {};
    if (st.over) return st;

    var b = st.body, L = st.L;
    var left = !!input.left, right = !!input.right, jump = !!input.jump;

    // 水平
    var dir = (right ? 1 : 0) - (left ? 1 : 0);
    var acc = b.onGround ? ACC : AIR_ACC;
    if (dir !== 0) {
      b.vx += dir * acc * dt;
      b.vx = clamp(b.vx, -TUNE.vx, TUNE.vx);
      b.face = dir;
    } else {
      var f = FRIC * dt;
      if (Math.abs(b.vx) <= f) b.vx = 0; else b.vx -= Math.sign(b.vx) * f;
    }

    // 跳跃
    if (b.onGround) b.coyote = 0.1; else b.coyote = Math.max(0, b.coyote - dt);
    if (jump && b.coyote > 0 && st.qi > 0 && b.vy >= -1) {
      b.vy = -JUMP_V; b.onGround = false; b.coyote = 0;
      st.qi--; st.jumps++; st.combo = 0;
      b.sq = -0.9;
      st.events.push({ t: 'jump', x: b.x + BW / 2, y: SURF_Y });
    }
    if (!jump && b.vy < -JUMP_CUT) b.vy = -JUMP_CUT;

    var g = (b.vy < 0 && jump) ? GRAV_UP : GRAV_DN;
    b.vy += g * dt;
    if (b.vy > 900) b.vy = 900;

    // 位移 + 双向碰撞（本体撞岸上 / 倒影撞水下，二者都合法才算合法）
    var nx = b.x + b.vx * dt;
    if (bodyFree(st, nx, b.y) && reflFree(st, nx, b.y)) b.x = nx;
    else { if (b.vx !== 0) { st.hits++; st.events.push({ t: 'block', x: b.x + BW / 2, y: b.y + BH / 2 }); } b.vx = 0; }
    b.x = clamp(b.x, 0, W - BW);

    var ny = b.y + b.vy * dt;
    if (bodyFree(st, b.x, ny) && reflFree(st, b.x, ny)) b.y = ny;
    else {
      if (b.vy > 0) {
        if (!b.onGround) { st.events.push({ t: 'land', x: b.x + BW / 2, y: b.y + BH }); b.sq = 0.55; }
        b.onGround = true;
      } else {
        st.events.push({ t: 'bonk', x: b.x + BW / 2, y: b.y });
      }
      b.vy = 0;
    }
    if (!bodyFree(st, b.x, b.y + 1.5)) { if (!b.onGround && b.vy >= 0) { st.events.push({ t: 'land', x: b.x + BW / 2, y: b.y + BH }); b.sq = 0.55; } b.onGround = true; }
    else if (b.vy > 40) b.onGround = false;
    if (b.onGround && b.vy > 0) b.vy = 0;

    // 气恢复
    if (b.onGround) {
      st.qiTimer += dt;
      while (st.qiTimer >= TUNE.qiRegen && st.qi < st.qiMax) { st.qiTimer -= TUNE.qiRegen; st.qi++; }
      if (st.qi >= st.qiMax) st.qiTimer = 0;
    } else st.qiTimer = 0;

    // 采集（倒影才是那只手）
    var ry = reflY(b.y), i, lo;
    for (i = 0; i < L.lotus.length; i++) {
      lo = L.lotus[i];
      if (lo.taken) { if (lo.pop > 0) lo.pop = Math.max(0, lo.pop - dt * 1.6); continue; }
      var cx = clamp(lo.x, b.x - PAD, b.x + BW + PAD);
      var cy = clamp(lo.y, ry - PAD, ry + BH + PAD);
      var ddx = lo.x - cx, ddy = lo.y - cy;
      if (ddx * ddx + ddy * ddy <= LR * LR) {
        // 影子要把花「含住」一会儿才开 —— 一扫而过不算
        if (lo.grow < 1) {
          lo.grow = Math.min(1, lo.grow + dt / TUNE.grow);
          if (lo.grow >= 1) { /* 本帧绽放 */ } else continue;
        }
        lo.taken = true; lo.pop = 1; st.taken++; st.combo++;
        if (st.combo > st.bestCombo) st.bestCombo = st.combo;
        var mult = 1 + COMBO_STEP * (st.combo - 1);
        var base = lo.kind ? 100 : 55;
        st.lotusPt += Math.round(base * mult);
        if (lo.kind) { st.qi = Math.min(st.qiMax, st.qi + 3); }
        st.events.push({ t: 'lotus', x: lo.x, y: lo.y, kind: lo.kind, combo: st.combo });
      } else if (lo.grow > 0) {
        lo.grow = Math.max(0, lo.grow - dt / DECAY_TIME);
      }
    }

    // 气穴
    for (i = 0; i < L.bubbles.length; i++) {
      var bu = L.bubbles[i];
      if (bu.cool > 0) { bu.cool -= dt; continue; }
      var bx = bu.c * CELL + CELL / 2, by = SURF_Y + 1.5 * CELL;
      if (bx > b.x - 14 && bx < b.x + BW + 14 && by > ry - 14 && by < ry + BH + 14) {
        bu.cool = 5; bu.used++;
        st.qi = Math.min(st.qiMax, st.qi + 3);
        st.events.push({ t: 'bubble', x: bx, y: by });
      }
    }

    // 演出衰减
    if (b.sq !== 0) { b.sq -= Math.sign(b.sq) * Math.min(Math.abs(b.sq), dt * 4.2); }
    b.walk += Math.abs(b.vx) * dt * 0.06;

    st.t += dt;

    // 结束
    if (st.taken >= st.total && st.total > 0) { st.win = true; finish(st); }
    else if (st.t >= st.tmax) { finish(st); }
    st.score = score(st);
    return st;
  }

  function completion(st) { return st.total ? st.taken / st.total : 0; }

  function score(st) {
    if (st.over) return st.finalScore;
    var k = completion(st);
    var qiPt = Math.round(300 * (st.qi / st.qiMax) * k);
    var timePt = Math.round(420 * (Math.max(0, st.tmax - st.t) / st.tmax) * k);
    var winPt = st.win ? Math.round(200 * k) : 0;
    return st.lotusPt + qiPt + timePt + winPt;
  }

  function finish(st) {
    if (st.over) return;
    st.win = st.taken >= st.total && st.total > 0;
    // 顺序铁律：先置 win → 算分 → 再置 over 冻结（反了会读到未初始化的 0）
    var k = completion(st);
    var qiPt = Math.round(220 * (st.qi / st.qiMax) * k);
    var timePt = Math.round(Math.max(0, st.tmax - st.t) * 2.2 * k);
    var winPt = st.win ? Math.round(180 * k) : 0;
    st.finalScore = st.lotusPt + qiPt + timePt + winPt;
    st.over = true;
    st.score = st.finalScore;
  }

  function drain(st) { var e = st.events; st.events = []; return e; }

  var API = {
    CELL: CELL, COLS: COLS, ROWS: ROWS, W: W, H: H,
    SURF_ROW: SURF_ROW, SURF_Y: SURF_Y, BW: BW, BH: BH, LR: LR,
    JUMP_MAX: JUMP_MAX, VX: VX, HP_CAP: HP_CAP, TUNE: TUNE,
    LEVELS: LEVELS, mulberry32: mulberry32, clamp: clamp,
    makeLevel: makeLevel, createState: createState, step: step,
    score: score, completion: completion, finish: finish, drain: drain,
    hpOf: hpOf, reflY: reflY, hpMaxAtOf: function (st, c) { return st.L.hpMaxAt(c); },
    baseAtOf: function (st, c) { return st.L.baseAt(c); }
  };

  API.TUNE = TUNE;
  root.MW = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : this);
