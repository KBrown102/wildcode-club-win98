/* 294-wintercache · game.js — 藏冬 · 松果纪 核心逻辑（纯逻辑，node 可直跑） */
(function (root) {
  'use strict';

  var COLS = 11, ROWS = 9, NC = COLS * ROWS;
  var START = 4 * COLS + 5;                 // 松鼠起点（林间空地正中）
  var SP_A = 5.4, SP_W = 6.6;               // 秋 / 冬 每秒走几格
  var T_PICK = 0.16, T_BURY = 0.34, T_DIG = 0.42, T_SNOW = 1.9;
  var SPROUT_PT = 5;   /* 不给「剩余配额」加分：否则什么都不埋也能拿分（noop 22 分） */

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* 五果齐套：松果/橡子/榛子/胡桃/栗子 */
  var KINDS = [
    { name: '松果', score: 8,  c1: '#C4553B', c2: '#7E3320' },
    { name: '橡子', score: 10, c1: '#B8944A', c2: '#6F5527' },
    { name: '榛子', score: 12, c1: '#9C7B3C', c2: '#5E4820' },
    { name: '胡桃', score: 16, c1: '#7C6038', c2: '#4A3719' },
    { name: '栗子', score: 20, c1: '#5E3B22', c2: '#33200F' }
  ];

  var LEVELS = [
    { name: '一 · 初霜', nuts: 5,  cap: 4, marks: 7, quota: 11, at: 45, wt: 36, th: [18, 33, 46] },
    { name: '二 · 拾穗', nuts: 7,  cap: 4, marks: 6, quota: 12, at: 44, wt: 34, th: [24, 44, 62] },
    { name: '三 · 满囊', nuts: 8,  cap: 5, marks: 6, quota: 12, at: 42, wt: 34, th: [26, 47, 67] },
    { name: '四 · 疏林', nuts: 9,  cap: 5, marks: 5, quota: 12, at: 42, wt: 32, th: [29, 53, 75] },
    { name: '五 · 藏锋', nuts: 10, cap: 6, marks: 4, quota: 12, at: 40, wt: 32, th: [33, 60, 85] },
    { name: '六 · 雪信', nuts: 11, cap: 6, marks: 4, quota: 12, at: 40, wt: 30, th: [36, 65, 93] },
    { name: '七 · 空林', nuts: 12, cap: 7, marks: 3, quota: 13, at: 38, wt: 30, th: [41, 74, 105] },
    { name: '八 · 长夜', nuts: 13, cap: 8, marks: 2, quota: 13, at: 36, wt: 28, th: [42, 76, 108] }
  ];

  function cx(i) { return i % COLS; }
  function cy(i) { return (i / COLS) | 0; }
  function idx(x, y) { return y * COLS + x; }

  function flood(grid, from) {
    var seen = new Uint8Array(NC), q = [from], head = 0;
    seen[from] = 1;
    while (head < q.length) {
      var c = q[head++], x = cx(c), y = cy(c);
      if (x > 0 && grid[c - 1] === 0 && !seen[c - 1]) { seen[c - 1] = 1; q.push(c - 1); }
      if (x < COLS - 1 && grid[c + 1] === 0 && !seen[c + 1]) { seen[c + 1] = 1; q.push(c + 1); }
      if (y > 0 && grid[c - COLS] === 0 && !seen[c - COLS]) { seen[c - COLS] = 1; q.push(c - COLS); }
      if (y < ROWS - 1 && grid[c + COLS] === 0 && !seen[c + COLS]) { seen[c + COLS] = 1; q.push(c + COLS); }
    }
    return seen;
  }

  /* ---------- 关卡生成（固定种子 = 错题本：同一关布局永远一样） ---------- */
  var genCache = {};
  function genLevel(li, baseSeed) {
    var key = li + '_' + baseSeed;
    if (genCache[key]) return genCache[key];
    var L = LEVELS[li], out = null;
    for (var tries = 0; tries < 60 && !out; tries++) {
      var r = mulberry32(baseSeed + li * 1013 + tries * 7717);
      var grid = new Uint8Array(NC);
      var marks = [], i, c, g, j;
      for (i = 0; i < L.marks; i++) {
        for (g = 0; g < 300; g++) {
          c = (r() * NC) | 0;
          if (c === START || grid[c]) continue;
          var ok = true;
          for (j = 0; j < marks.length; j++) {
            if (Math.abs(cx(marks[j]) - cx(c)) <= 1 && Math.abs(cy(marks[j]) - cy(c)) <= 1) { ok = false; break; }
          }
          if (!ok) continue;
          grid[c] = 1 + ((r() * 3) | 0);          // 1 树 2 石 3 灌木
          marks.push(c); break;
        }
      }
      var cells = [];
      for (i = 0; i < L.nuts; i++) {
        for (g = 0; g < 300; g++) {
          c = (r() * NC) | 0;
          if (grid[c] || c === START || cells.indexOf(c) >= 0) continue;
          cells.push(c); break;
        }
      }
      if (cells.length < L.nuts) continue;
      var reach = flood(grid, START), free = 0;
      for (i = 0; i < NC; i++) if (reach[i] && grid[i] === 0) free++;
      if (free < 36) continue;
      /* 五果齐套：循环取种再打乱 */
      var ks = [];
      for (i = 0; i < L.nuts; i++) ks.push(i % 5);
      for (i = ks.length - 1; i > 0; i--) { j = (r() * (i + 1)) | 0; var t = ks[i]; ks[i] = ks[j]; ks[j] = t; }
      var nuts = cells.map(function (cc, n) { return { cell: cc, k: ks[n], taken: false }; });
      out = { grid: grid, nuts: nuts, marks: marks, L: L };
    }
    genCache[key] = out;
    return out;
  }

  /* ---------- 状态 ---------- */
  function newState(li, seed) {
    var g = genLevel(li, seed), L = LEVELS[li];
    return {
      li: li, seed: seed, L: L, G: g,
      grid: g.grid,
      nuts: g.nuts.map(function (n) { return { cell: n.cell, k: n.k, taken: false }; }),
      pouch: [],
      buried: [], buriedMap: {},
      dug: new Uint8Array(NC),
      sq: { px: cx(START), py: cy(START), path: [], face: 1, walk: 0 },
      act: null,
      phase: 'autumn',                       // autumn → snow → winter → end
      snowT: 0,
      timeLeft: L.at,
      quota: L.quota, digLeft: L.quota,
      combo: 0, bestCombo: 0,
      found: 0, miss: 0,
      events: [],
      result: null,
      elapsed: 0
    };
  }

  function curCell(st) { return idx(Math.round(st.sq.px), Math.round(st.sq.py)); }

  function nutAt(st, cell) {
    for (var i = 0; i < st.nuts.length; i++) if (st.nuts[i].cell === cell && !st.nuts[i].taken) return i;
    return -1;
  }

  /* ---------- 寻路（BFS，绕开地标） ---------- */
  function pathTo(st, from, to) {
    if (from === to) return [];
    if (st.grid[to] !== 0) return null;
    var prev = new Int32Array(NC).fill(-1), seen = new Uint8Array(NC), q = [from], h = 0;
    seen[from] = 1;
    var nb = [-1, 1, -COLS, COLS];
    while (h < q.length) {
      var c = q[h++];
      if (c === to) break;
      var x = cx(c), y = cy(c);
      for (var d = 0; d < 4; d++) {
        var n = c + nb[d];
        if (d === 0 && x === 0) continue;
        if (d === 1 && x === COLS - 1) continue;
        if (d === 2 && y === 0) continue;
        if (d === 3 && y === ROWS - 1) continue;
        if (seen[n] || st.grid[n] !== 0) continue;
        seen[n] = 1; prev[n] = c; q.push(n);
      }
    }
    if (!seen[to]) return null;
    var out = [], c2 = to;
    while (c2 !== from) { out.unshift(c2); c2 = prev[c2]; if (c2 < 0) return null; }
    return out;
  }

  function gotoCell(st, cell) {
    if (st.phase !== 'autumn' && st.phase !== 'winter') return false;
    if (st.act) return false;
    if (cell < 0 || cell >= NC || st.grid[cell] !== 0) return false;
    var from = curCell(st);
    var p = pathTo(st, from, cell);
    if (p === null) return false;
    st.sq.path = p;
    if (!p.length) tryAct(st, from);
    return true;
  }

  function stepDir(st, dx, dy) {
    var c = curCell(st);
    if (st.act || st.sq.path.length) return false;
    var x = cx(c) + dx, y = cy(c) + dy;
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return false;
    var n = idx(x, y);
    if (st.grid[n] !== 0) return false;
    st.sq.path = [n];
    if (dx) st.sq.face = dx > 0 ? 1 : -1;
    return true;
  }

  /* ---------- 动作 ---------- */
  function tryAct(st, cell) {
    if (st.phase === 'autumn') {
      var ni = nutAt(st, cell);
      if (ni >= 0) {
        if (st.pouch.length >= st.L.cap) { st.events.push({ t: 'full' }); return; }
        st.act = { type: 'pick', t: T_PICK, cell: cell, ni: ni };
      }
    } else if (st.phase === 'winter') {
      if (!st.dug[cell] && st.digLeft > 0) st.act = { type: 'dig', t: T_DIG, cell: cell };
    }
  }

  function bury(st) {
    if (st.phase !== 'autumn' || st.act || st.sq.path.length || !st.pouch.length) return false;
    var cell = curCell(st);
    if (st.grid[cell] !== 0 || st.buriedMap[cell] || nutAt(st, cell) >= 0) return false;
    var k = st.pouch.shift();
    var b = { cell: cell, k: k, order: st.buried.length, found: false, t: 0 };
    st.buried.push(b); st.buriedMap[cell] = b;
    st.act = { type: 'bury', t: T_BURY, cell: cell, k: k };
    return true;
  }

  function digHere(st) {
    if (st.phase !== 'winter' || st.act || st.sq.path.length) return false;
    var cell = curCell(st);
    if (st.dug[cell] || st.digLeft <= 0) return false;
    st.act = { type: 'dig', t: T_DIG, cell: cell };
    return true;
  }

  function completeAct(st) {
    var a = st.act; st.act = null;
    if (a.type === 'pick') {
      var n = st.nuts[a.ni];
      if (n && !n.taken) { n.taken = true; st.pouch.push(n.k); st.events.push({ t: 'pick', k: n.k, cell: a.cell }); }
    } else if (a.type === 'bury') {
      st.events.push({ t: 'bury', k: a.k, cell: a.cell });
    } else if (a.type === 'dig') {
      st.dug[a.cell] = 1; st.digLeft--;
      var b = st.buriedMap[a.cell];
      if (b && !b.found) {
        b.found = true; st.found++; st.combo++;
        if (st.combo > st.bestCombo) st.bestCombo = st.combo;
        st.events.push({ t: 'hit', k: b.k, order: b.order, cell: a.cell });
        if (st.combo % 3 === 0) { st.digLeft++; st.events.push({ t: 'recharge', cell: a.cell }); }
      } else {
        st.combo = 0; st.miss++;
        st.events.push({ t: 'miss', cell: a.cell });
      }
    }
  }

  /* ---------- 主更新 ---------- */
  function update(st, dt) {
    if (!st || st.phase === 'end') return;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.05) dt = 0.05;
    st.elapsed += dt;

    if (st.phase === 'snow') {
      st.snowT += dt;
      if (st.snowT >= T_SNOW) { st.phase = 'winter'; st.timeLeft = st.L.wt; st.events.push({ t: 'winter' }); }
      return;
    }

    st.timeLeft -= dt;
    var sq = st.sq, speed = st.phase === 'winter' ? SP_W : SP_A;

    if (st.act) {
      st.act.t -= dt;
      if (st.act.t <= 0) completeAct(st);
    } else if (sq.path.length) {
      var tgt = sq.path[0], tx = cx(tgt), ty = cy(tgt);
      var dx = tx - sq.px, dy = ty - sq.py;
      var d = Math.sqrt(dx * dx + dy * dy);
      var sp = speed * dt;
      sq.walk += dt * 9;
      if (d <= sp || d < 1e-6) {
        sq.px = tx; sq.py = ty; sq.path.shift();
        if (!sq.path.length) tryAct(st, tgt);
      } else {
        sq.px += dx / d * sp; sq.py += dy / d * sp;
        if (Math.abs(dx) > 0.02) sq.face = dx > 0 ? 1 : -1;
      }
    } else {
      sq.walk *= 0.86;
    }

    if (st.timeLeft <= 0) {
      st.timeLeft = 0;
      if (st.phase === 'autumn') {
        st.phase = 'snow'; st.snowT = 0; st.events.push({ t: 'snow' });
      } else {
        finish(st);
      }
      return;
    }
    if (st.phase === 'winter' && st.digLeft <= 0 && !st.act) finish(st);
  }

  function finish(st) {
    var i, sp = [];
    for (i = 0; i < st.buried.length; i++) if (!st.buried[i].found) sp.push(st.buried[i].cell);
    var s = 0;
    for (i = 0; i < st.buried.length; i++) if (st.buried[i].found) s += KINDS[st.buried[i].k].score;
    s += sp.length * SPROUT_PT;
    st.phase = 'end';
    st.result = {
      kind: st.buried.length === 0 ? 'empty' : (st.found > 0 ? 'clear' : 'lost'),
      buried: st.buried.length, found: st.found, miss: st.miss,
      sprouts: sp.length, sproutCells: sp, digLeft: Math.max(0, st.digLeft),
      bestCombo: st.bestCombo, score: s,
      time: st.elapsed
    };
    st.events.push({ t: 'end', kind: st.result.kind });
  }

  function starsOf(li, r) {
    var th = LEVELS[li].th, s = 0;
    for (var i = 0; i < 3; i++) if (r.score >= th[i]) s++;
    return s;
  }

  var API = {
    COLS: COLS, ROWS: ROWS, NC: NC, START: START,
    KINDS: KINDS, LEVELS: LEVELS, T_SNOW: T_SNOW,
    mulberry32: mulberry32, genLevel: genLevel, newState: newState,
    update: update, gotoCell: gotoCell, stepDir: stepDir, bury: bury, digHere: digHere,
    curCell: curCell, nutAt: nutAt, cx: cx, cy: cy, idx: idx, starsOf: starsOf
  };
  root.WinterCache = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
