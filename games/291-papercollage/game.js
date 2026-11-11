/* 291-papercollage《拼贴 · 撕纸局》—— 纯逻辑层（零 DOM / 零 Canvas，Node 可直接 require 冒烟）
 *
 * 规则一句话：往 8×9 的拼贴板上投放手撕纸片，同等级四邻连通 ≥3 张即合并升级，
 * 合并后重力下落可再触发连锁；棋盘堆满即收工。
 *
 * 机制元：放置 / 生成 / 侦测 / 合并 / 转化 / 位移 / 耦合位移 / 消耗   （跨 建立·撤销·改写·转流·重构 五类）
 */
(function (g) {
  'use strict';

  var COLS = 8, ROWS = 9, MAXL = 7;
  var GRAV = 88;      // 下落加速度（行/秒²）
  var SETTLE = 0.13;  // 落定后的停顿（秒）
  var STEP = 0.19;    // 连锁每一级的间隔（秒）
  var HOLDS = 3;      // 暂存换张次数（充电宝）
  // 各等级出现权重（下标 = 等级）
  var W = [0, 32, 26, 18, 11, 7, 4, 2];

  function mulberry(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function idx(c, r) { return r * COLS + c; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function roll(st) {
    var cap = Math.max(3, Math.min(st.capMax, st.maxMade - 1));
    var tot = 0, i;
    for (i = 1; i <= cap; i++) tot += W[i];
    var r = st.rnd() * tot;
    for (i = 1; i <= cap; i++) { r -= W[i]; if (r <= 0) return i; }
    return cap;
  }

  function create(opt) {
    opt = opt || {};
    var seed = (opt.seed >>> 0) || 1;
    var st = {
      cols: COLS, rows: ROWS, maxl: MAXL, seed: seed,
      grid: new Int8Array(COLS * ROWS),
      ids: new Int32Array(COLS * ROWS),
      nextId: 1,
      rnd: mulberry(seed),
      col: 3,
      cur: 0, next: 0, held: 0,
      holds: opt.holds == null ? HOLDS : opt.holds,
      phase: 'aim',            // aim | fall | settle | resolve | over
      fallY: 0, fallV: 0, land: 0,
      t: 0,
      cascade: 0, bestCascade: 0,
      score: 0, best: opt.best || 0,
      maxMade: 0,              // 本局合成出的最高等级
      made: new Uint8Array(MAXL + 2),
      thresh: opt.thresh || 3,     // 成组所需张数
      capMax: opt.capMax || 4,     // 投放池最高等级（平衡扫描：4 时技能差距最大 3.14×）
      sp: opt.sp || 3.2,           // 分数底数：base = sp^(L-1) * n
      drops: 0, merges: 0, cleared: 0,
      shake: 0,
      lastPlace: { c: 3, r: 0 },
      events: [],
      over: false
    };
    st.cur = roll(st);
    st.next = roll(st);
    return st;
  }

  function clone(st) {
    var n = {
      cols: st.cols, rows: st.rows, maxl: st.maxl, seed: st.seed,
      grid: new Int8Array(st.grid), ids: new Int32Array(st.ids),
      nextId: st.nextId,
      rnd: mulberry(st.seed),
      col: st.col, cur: st.cur, next: st.next, held: st.held,
      holds: st.holds, phase: st.phase,
      fallY: st.fallY, fallV: st.fallV, land: st.land, t: st.t,
      cascade: st.cascade, bestCascade: st.bestCascade,
      score: st.score, best: st.best,
      maxMade: st.maxMade, made: new Uint8Array(st.made),
      thresh: st.thresh, capMax: st.capMax, sp: st.sp,
      drops: st.drops, merges: st.merges, cleared: st.cleared,
      shake: st.shake,
      lastPlace: { c: st.lastPlace.c, r: st.lastPlace.r },
      events: [], over: st.over
    };
    // rnd 状态无法直接复制，用一个与母局解耦的序列即可（AI 推演不要求与真实序列一致）
    return n;
  }

  function landRow(st, c) {
    var r = 0;
    while (r < ROWS && st.grid[idx(c, r)] === 0) r++;
    return r - 1;
  }
  function boardFull(st) {
    for (var c = 0; c < COLS; c++) if (st.grid[idx(c, 0)] === 0) return false;
    return true;
  }
  function nearestFree(st, from) {
    for (var d = 0; d < COLS; d++) {
      if (from - d >= 0 && landRow(st, from - d) >= 0) return from - d;
      if (from + d < COLS && landRow(st, from + d) >= 0) return from + d;
    }
    return -1;
  }

  function canDrop(st) { return st.phase === 'aim' && landRow(st, st.col) >= 0; }

  function moveCol(st, d) {
    if (st.phase !== 'aim') return false;
    var nc = clamp(st.col + d, 0, COLS - 1);
    if (nc === st.col) return false;
    st.col = nc;
    st.events.push({ t: 'move', c: nc });
    return true;
  }
  function setCol(st, c) {
    if (st.phase !== 'aim') return false;
    c = clamp(c | 0, 0, COLS - 1);
    if (c === st.col) return false;
    st.col = c;
    st.events.push({ t: 'move', c: c });
    return true;
  }

  function drop(st) {
    if (!canDrop(st)) return false;
    st.land = landRow(st, st.col);
    st.fallY = -1.25;
    st.fallV = 0;
    st.phase = 'fall';
    st.drops++;
    st.events.push({ t: 'drop', c: st.col, level: st.cur });
    return true;
  }

  function hold(st) {
    if (st.phase !== 'aim' || st.holds <= 0) return false;
    if (st.held === 0) { st.held = st.cur; st.cur = st.next; st.next = roll(st); }
    else { var t = st.held; st.held = st.cur; st.cur = t; }
    st.holds--;
    st.events.push({ t: 'hold', v: st.cur });
    return true;
  }

  function place(st) {
    var i = idx(st.col, st.land);
    st.grid[i] = st.cur;
    st.ids[i] = st.nextId++;
    st.lastPlace.c = st.col; st.lastPlace.r = st.land;
    st.events.push({ t: 'place', c: st.col, r: st.land, level: st.cur, id: st.ids[i] });
    st.cur = st.next;
    st.next = roll(st);
  }

  function gravity(st) {
    var moves = [];
    for (var c = 0; c < COLS; c++) {
      var w = ROWS - 1;
      for (var r = ROWS - 1; r >= 0; r--) {
        var lv = st.grid[idx(c, r)];
        if (lv === 0) continue;
        if (r !== w) {
          st.grid[idx(c, w)] = lv; st.ids[idx(c, w)] = st.ids[idx(c, r)];
          st.grid[idx(c, r)] = 0; st.ids[idx(c, r)] = 0;
          moves.push([c, r, w]);
        }
        w--;
      }
    }
    return moves;
  }

  function findGroups(st) {
    var seen = new Uint8Array(COLS * ROWS), out = [], stack = [];
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var i0 = idx(c, r), lv = st.grid[i0];
        if (lv === 0 || seen[i0]) continue;
        seen[i0] = 1; stack.length = 0; stack.push(i0);
        var cells = [i0];
        while (stack.length) {
          var i = stack.pop(), cc = i % COLS, rr = (i - cc) / COLS;
          var nb = [[cc - 1, rr], [cc + 1, rr], [cc, rr - 1], [cc, rr + 1]];
          for (var k = 0; k < 4; k++) {
            var nc = nb[k][0], nr = nb[k][1];
            if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
            var j = idx(nc, nr);
            if (seen[j] || st.grid[j] !== lv) continue;
            seen[j] = 1; stack.push(j); cells.push(j);
          }
        }
        if (cells.length >= st.thresh) out.push({ level: lv, cells: cells });
      }
    }
    return out;
  }

  function pickAnchor(st, cells) {
    var bestI = cells[0], bestR = -1, bestD = 1e9;
    for (var k = 0; k < cells.length; k++) {
      var i = cells[k], c = i % COLS, r = (i - c) / COLS;
      var d = Math.abs(c - st.lastPlace.c);
      if (r > bestR || (r === bestR && d < bestD)) { bestR = r; bestD = d; bestI = i; }
    }
    return bestI;
  }

  function gameOver(st) {
    st.phase = 'over'; st.over = true;
    if (st.score > st.best) st.best = st.score;
    st.events.push({ t: 'over' });
  }

  function endTurn(st) {
    if (boardFull(st)) { gameOver(st); return; }
    if (landRow(st, st.col) < 0) {
      var c = nearestFree(st, st.col);
      if (c < 0) { gameOver(st); return; }
      st.col = c;
    }
    st.phase = 'aim';
    st.cascade = 0;
  }

  function step(st) {
    var moves = gravity(st);
    if (moves.length) st.events.push({ t: 'gravity', moves: moves });

    var groups = findGroups(st);
    if (!groups.length) { endTurn(st); return; }

    st.cascade++;
    if (st.cascade > st.bestCascade) st.bestCascade = st.cascade;
    var mult = 1 + 0.5 * (st.cascade - 1);
    var gained = 0, shakeAdd = 0;

    for (var k = 0; k < groups.length; k++) {
      var gr = groups[k], L = gr.level, n = gr.cells.length;
      var anchor = pickAnchor(st, gr.cells);
      var ids = [];
      for (var m = 0; m < gr.cells.length; m++) ids.push(st.ids[gr.cells[m]]);
      for (var m2 = 0; m2 < gr.cells.length; m2++) { st.grid[gr.cells[m2]] = 0; st.ids[gr.cells[m2]] = 0; }
      st.cleared += n;

      var nl = L + 1, capped = nl > MAXL;
      var base = Math.round(Math.pow(st.sp, L - 1) * n);
      if (n >= st.thresh + 2) base = Math.round(base * 1.6);
      var sc = Math.round(base * mult);
      if (capped) { sc += 900 + 300 * st.cascade; }
      else {
        st.grid[anchor] = nl;
        st.ids[anchor] = st.nextId++;
        if (nl > st.maxMade) st.maxMade = nl;
        st.made[nl] = 1;
      }
      gained += sc;
      shakeAdd += 0.18 + Math.min(0.5, n * 0.06);
      st.events.push({
        t: 'merge', level: L, n: n, cells: gr.cells.slice(), ids: ids,
        anchor: anchor, nl: capped ? MAXL + 1 : nl, score: sc,
        cascade: st.cascade, capped: capped
      });
    }

    st.score += gained;
    st.merges++;
    st.shake = Math.min(1.4, st.shake + shakeAdd);
    st.t = STEP;
  }

  function update(st, dt) {
    if (!(dt > 0)) dt = 0;
    if (dt > 0.05) dt = 0.05;
    st.shake = st.shake > 0 ? Math.max(0, st.shake - dt * 3.4) : 0;

    if (st.phase === 'fall') {
      st.fallV += GRAV * dt;
      st.fallY += st.fallV * dt;
      if (st.fallY >= st.land) {
        st.fallY = st.land;
        place(st);
        st.phase = 'settle';
        st.t = SETTLE;
        st.cascade = 0;
      }
    } else if (st.phase === 'settle') {
      st.t -= dt;
      if (st.t <= 0) { st.phase = 'resolve'; st.t = 0; step(st); }
    } else if (st.phase === 'resolve') {
      st.t -= dt;
      if (st.t <= 0) step(st);
    }
    return st;
  }

  /* —— AI 推演用：把一次投放完整跑到底，返回分数增量 —— */
  function simulateAfter(st, c) {
    var s = clone(st);
    s.col = c;
    if (landRow(s, c) < 0) return null;
    var before = s.score;
    s.land = landRow(s, c);
    s.fallY = s.land;
    place(s);
    var guard = 0;
    s.phase = 'resolve';
    while (guard++ < 400) {
      var moves = gravity(s);
      var gr = findGroups(s);
      if (!gr.length) break;
      s.cascade++;
      var mult = 1 + 0.5 * (s.cascade - 1);
      for (var k = 0; k < gr.length; k++) {
        var G0 = gr[k], L = G0.level, n = G0.cells.length;
        var anchor = pickAnchor(s, G0.cells);
        for (var m = 0; m < n; m++) { s.grid[G0.cells[m]] = 0; s.ids[G0.cells[m]] = 0; }
        var nl = L + 1, base = Math.round(Math.pow(s.sp, L - 1) * n);
        if (n >= s.thresh + 2) base = Math.round(base * 1.6);
        var sc = Math.round(base * mult);
        if (nl > MAXL) sc += 900;
        else {
          s.grid[anchor] = nl; s.ids[anchor] = s.nextId++;
          if (nl > s.maxMade) s.maxMade = nl;
        }
        s.score += sc;
      }
      if (!moves.length && !gr.length) break;
    }
    return { score: s.score - before, maxMade: s.maxMade, cells: countCells(s), st: s };
  }
  function countCells(st) {
    var n = 0;
    for (var i = 0; i < st.grid.length; i++) if (st.grid[i]) n++;
    return n;
  }

  var API = {
    COLS: COLS, ROWS: ROWS, MAXL: MAXL, W: W, HOLDS: HOLDS,
    create: create, clone: clone, update: update,
    moveCol: moveCol, setCol: setCol, drop: drop, hold: hold,
    landRow: landRow, boardFull: boardFull, nearestFree: nearestFree,
    findGroups: findGroups, gravity: gravity, idx: idx,
    simulateAfter: simulateAfter, countCells: countCells, canDrop: canDrop
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  g.PaperGame = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
