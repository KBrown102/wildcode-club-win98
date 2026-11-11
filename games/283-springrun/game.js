/* ============================================================
   283-springrun / game.js
   《引泉 · 石上苔》—— 纯逻辑层：零 DOM、零 Canvas
   可在 Node 里直接 require 做冒烟测试
   ============================================================ */
(function (g) {
  'use strict';

  // ---------- 画布局部常量 ----------
  var W = 480, H = 900;
  var COLS = 7, ROWS = 10, CELL = 54;
  var BX = 51, BY = 160;
  var POOL_Y = BY + ROWS * CELL;   // 700 潭面
  var POOL_BOT = 818;

  // ---------- 方向：0=N 1=E 2=S 3=W ----------
  var BIT = [1, 2, 4, 8];
  var OPP = [2, 3, 0, 1];
  var DC = [0, 1, 0, -1];
  var DR = [-1, 0, 1, 0];

  // ---------- 手感常量 ----------
  var EMIT_INTERVAL = 0.42;   // 泉眼出滴间隔
  var T_DRY = 0.52;           // 干石渠：每格耗时
  var T_MOSS = 0.19;          // 苔上：湿滑加速
  var T_SEED = 0.30;          // 石碗
  var MOSS_TIME = 1.6;        // 湿 → 苔长成
  var SEED_NEED = 5;          // 一朵花需要几滴
  var FALL_SPEED = 640;       // 自由落体 px/s
  var MAX_STEPS = 80;         // 单滴最多穿过的格子数（防死循环）
  var MOSS_SCORE = 2;
  var BLOOM_SCORE = 60;
  var COMBO_WINDOW = 1.5, COMBO_BONUS = 20, COMBO_MAX = 5;
  var GRACE = 1.2;            // 开局蓄势

  // 宫商角徵羽（C D E G A）
  var PENTA = [523.25, 587.33, 659.25, 783.99, 880.00];
  var PITCH_BY_COL = [0, 1, 2, 3, 4, 3, 2];

  var BASE = { straight: 5, elbow: 3, tee: 7, cross: 15 };

  // ---------- 工具 ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function rotMask(m, r) {
    r = ((r % 4) + 4) % 4;
    for (var i = 0; i < r; i++) m = ((m << 1) | (m >> 3)) & 15;
    return m;
  }
  function openings(c) {
    if (!c || c.kind === 'rock') return 0;
    return rotMask(BASE[c.shape], c.rot);
  }

  function cellX(c) { return BX + c * CELL + CELL / 2; }
  function cellY(r) { return BY + r * CELL + CELL / 2; }

  // ---------- 关卡生成 ----------
  function genLevel(level, seed) {
    var rnd = mulberry32(((seed >>> 0) ^ (level * 7919)) >>> 0);
    var springCol = 1 + Math.floor(rnd() * (COLS - 2));
    var rocks = Math.min(3 + Math.floor(level * 0.7), 15);
    var seeds = Math.min(3 + Math.floor(level / 2), 6);
    var fixed = level >= 4 ? Math.min(level - 3, 5) : 0;
    var supply = Math.min(90 + (level - 1) * 10, 170);

    var cells = new Array(COLS * ROWS);
    var i;
    for (i = 0; i < COLS * ROWS; i++) {
      var p = rnd();
      var shape = p < 0.46 ? 'elbow' : (p < 0.78 ? 'straight' : 'tee');
      cells[i] = {
        kind: 'pipe', shape: shape, rot: Math.floor(rnd() * 4), fixed: false,
        wet: false, moss: 0, mossy: false, counted: false, glow: 0, alt: 0,
        fill: 0, bloom: 0, bloomed: false, pitch: 0, lit: 0
      };
    }

    // 候选池
    var idx = [];
    for (i = 0; i < COLS * ROWS; i++) idx.push(i);
    for (i = idx.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var tmp = idx[i]; idx[i] = idx[j]; idx[j] = tmp;
    }
    var cur = 0;

    // 泉眼正上方不许是整石
    function take(kindFn) {
      while (cur < idx.length) {
        var k = idx[cur++];
        var c = k % COLS, r = (k / COLS) | 0;
        if (r === 0 && c === springCol) continue;
        if (kindFn(k, c, r)) return k;
      }
      return -1;
    }

    for (i = 0; i < rocks; i++) {
      var kk = take(function (k, c, r) { return cells[k].kind === 'pipe' && !cells[k].fixed; });
      if (kk < 0) break;
      cells[kk].kind = 'rock'; cells[kk].shape = 'cross';
    }
    for (i = 0; i < seeds; i++) {
      var ks = take(function (k, c, r) { return cells[k].kind === 'pipe' && r >= 1; });
      if (ks < 0) break;
      var cell = cells[ks];
      cell.kind = 'seed'; cell.shape = 'cross'; cell.rot = 0;
      cell.pitch = PITCH_BY_COL[ks % COLS];
    }
    for (i = 0; i < fixed; i++) {
      var kf = take(function (k, c, r) { return cells[k].kind === 'pipe'; });
      if (kf < 0) break;
      cells[kf].fixed = true;
    }

    var wettable = 0;
    for (i = 0; i < COLS * ROWS; i++) if (cells[i].kind !== 'rock') wettable++;

    return {
      cells: cells, springCol: springCol, supply: supply,
      wettable: wettable, rockCount: rocks, seedCount: seeds
    };
  }

  // ---------- 建局 ----------
  function create(level, seed) {
    var cfg = genLevel(level, seed === undefined ? 1 : seed);
    var st = {
      level: level,
      cells: cfg.cells,
      springCol: cfg.springCol,
      supply: cfg.supply,
      wettable: cfg.wettable,
      seedTotal: cfg.seedCount,
      drops: [],
      events: [],
      time: 0,
      emitT: -GRACE,
      emitted: 0,
      left: cfg.supply,
      score: 0,
      mossCount: 0,
      blooms: 0,
      lost: 0,
      sipped: 0,
      combo: 0,
      bestCombo: 0,
      lastBloomT: -99,
      over: false,
      bonus: 0,
      coverage: 0,
      nextId: 1
    };
    return st;
  }

  function ev(st, type, a, b, c, d, f) {
    var e = { type: type, a: a, b: b, c: c, d: d, f: f };
    st.events.push(e);
    return e;
  }

  function cellAt(st, c, r) {
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return null;
    return st.cells[r * COLS + c];
  }

  // ---------- 进入一格 ----------
  function enterCell(st, d, c, r, side) {
    var cell = st.cells[r * COLS + c];
    d.c = c; d.r = r; d.side = side; d.mode = 'flow'; d.t = 0; d.steps++;
    d.exit = -1;

    if (d.steps > MAX_STEPS) { d.alive = false; ev(st, 'soak', cellX(c), cellY(r)); return; }

    if (!cell.wet) { cell.wet = true; ev(st, 'wet', c, r); }
    cell.glow = 1;

    // 未开的石碗会把水吸住
    if (cell.kind === 'seed' && !cell.bloomed) {
      cell.fill++;
      st.sipped++;
      ev(st, 'sip', c, r, cell.fill / SEED_NEED);
      if (cell.fill >= SEED_NEED) bloom(st, cell, c, r);
      d.alive = false;
      return;
    }

    var open = openings(cell);
    var cand = open & ~BIT[side];
    var outs = [];
    for (var s = 0; s < 4; s++) if (cand & BIT[s]) outs.push(s);
    if (!outs.length) { d.alive = false; ev(st, 'splash', cellX(c), cellY(r)); return; }

    var ex;
    if (outs.length === 1) ex = outs[0];
    else { ex = outs[cell.alt % outs.length]; cell.alt = (cell.alt + 1) % outs.length; }

    d.exit = ex;
    d.dur = cell.mossy ? T_MOSS : (cell.kind === 'seed' ? T_SEED : T_DRY);
  }

  function bloom(st, cell, c, r) {
    cell.bloomed = true; cell.bloom = 0.0001;
    st.blooms++;
    if (st.time - st.lastBloomT <= COMBO_WINDOW) st.combo = Math.min(st.combo + 1, COMBO_MAX);
    else st.combo = 1;
    st.lastBloomT = st.time;
    if (st.combo > st.bestCombo) st.bestCombo = st.combo;
    var gain = BLOOM_SCORE + (st.combo - 1) * COMBO_BONUS;
    st.score += gain;
    ev(st, 'bloom', c, r, cell.pitch, st.combo, gain);
  }

  // ---------- 水滴 ----------
  function spawn(st) {
    var d = {
      id: st.nextId++, mode: 'fall', c: st.springCol,
      y: BY - 10, lastRow: -2, alive: true,
      t: 0, dur: T_DRY, side: 0, exit: -1, steps: 0, r: -1
    };
    st.drops.push(d);
    st.emitted++;
    st.left = st.supply - st.emitted;
    ev(st, 'emit', cellX(st.springCol), BY - 10);
    return d;
  }

  function updateFall(st, d, dt) {
    d.y += FALL_SPEED * dt;
    if (d.y >= POOL_Y + 6) {
      d.alive = false; st.lost++;
      ev(st, 'plink', cellX(d.c), POOL_Y + 4);
      return;
    }
    var rr = Math.floor((d.y - BY) / CELL);
    while (rr > d.lastRow) {
      d.lastRow++;
      var r2 = d.lastRow;
      if (r2 >= ROWS) break;
      if (r2 >= 0) {
        var cell = st.cells[r2 * COLS + d.c];
        if (openings(cell) & BIT[0]) { enterCell(st, d, d.c, r2, 0); return; }
      }
    }
  }

  function updateFlow(st, d, dt) {
    d.t += dt / d.dur;
    var cell = st.cells[d.r * COLS + d.c];
    if (cell) cell.glow = Math.max(cell.glow, 1 - d.t * 0.55);
    if (d.t < 1) return;
    var nc = d.c + DC[d.exit], nr = d.r + DR[d.exit];
    if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) {
      if (d.exit === 2) {                       // 向下出界 → 落潭
        d.mode = 'fall'; d.y = POOL_Y - 3; d.lastRow = ROWS - 1;
      } else {
        d.alive = false; st.lost++;
        ev(st, 'splash', cellX(d.c) + DC[d.exit] * CELL * 0.5, cellY(d.r) + DR[d.exit] * CELL * 0.5);
      }
      return;
    }
    var nb = st.cells[nr * COLS + nc];
    if (openings(nb) & BIT[OPP[d.exit]]) {
      enterCell(st, d, nc, nr, OPP[d.exit]);
    } else {
      d.mode = 'fall';
      d.c = nc;
      d.y = BY + nr * CELL - 1;
      d.lastRow = nr - 1;
    }
  }

  // ---------- 主更新 ----------
  function update(st, dt) {
    if (dt > 0.05) dt = 0.05;
    if (st.over) return st;
    st.time += dt;

    // 泉眼出滴
    st.emitT += dt;
    while (st.emitT >= EMIT_INTERVAL && st.emitted < st.supply) {
      st.emitT -= EMIT_INTERVAL;
      spawn(st);
    }

    // 水滴推进
    var i, d;
    for (i = 0; i < st.drops.length; i++) {
      d = st.drops[i];
      if (!d.alive) continue;
      if (d.mode === 'fall') updateFall(st, d, dt);
      else updateFlow(st, d, dt);
    }
    for (i = st.drops.length - 1; i >= 0; i--) {
      if (!st.drops[i].alive) st.drops.splice(i, 1);
    }

    // 石面：湿 → 苔
    var cs = st.cells;
    for (i = 0; i < cs.length; i++) {
      var c = cs[i];
      if (c.wet && c.moss < 1) {
        c.moss += dt / MOSS_TIME;
        if (c.moss >= 1) {
          c.moss = 1; c.mossy = true;
          if (!c.counted) {
            c.counted = true; st.mossCount++;
            st.score += MOSS_SCORE;
            ev(st, 'moss', i % COLS, (i / COLS) | 0);
          }
        }
      }
      if (c.glow > 0) c.glow = Math.max(0, c.glow - dt * 2.2);
      if (c.lit > 0) c.lit = Math.max(0, c.lit - dt * 1.8);
      if (c.kind === 'seed' && c.bloomed && c.bloom < 1) {
        c.bloom = Math.min(1, c.bloom + dt / 0.55);
      }
    }

    // 收泉
    if (st.emitted >= st.supply && st.drops.length === 0) {
      st.over = true;
      st.coverage = st.wettable ? st.mossCount / st.wettable : 0;
      st.bonus = Math.round(st.coverage * 200);
      st.score += st.bonus;
      ev(st, 'over');
    }
    return st;
  }

  // ---------- 操作 ----------
  function rotate(st, c, r) {
    if (st.over) return false;
    var cell = cellAt(st, c, r);
    if (!cell || cell.kind !== 'pipe' || cell.fixed) return false;
    cell.rot = (cell.rot + 1) % 4;
    cell.lit = 1;
    ev(st, 'turn', c, r);
    return true;
  }

  function hitTest(st, x, y) {
    var c = Math.floor((x - BX) / CELL);
    var r = Math.floor((y - BY) / CELL);
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return null;
    return { c: c, r: r };
  }

  function stats(st) {
    return {
      score: st.score, moss: st.mossCount, wettable: st.wettable,
      blooms: st.blooms, seedTotal: st.seedTotal,
      left: st.left, supply: st.supply, lost: st.lost,
      level: st.level, over: st.over, bestCombo: st.bestCombo,
      coverage: st.coverage, bonus: st.bonus
    };
  }

  var API = {
    W: W, H: H, COLS: COLS, ROWS: ROWS, CELL: CELL, BX: BX, BY: BY,
    POOL_Y: POOL_Y, POOL_BOT: POOL_BOT, EMIT_INTERVAL: EMIT_INTERVAL, SEED_NEED: SEED_NEED,
    PENTA: PENTA, MOSS_TIME: MOSS_TIME, GRACE: GRACE,
    create: create, update: update, rotate: rotate, hitTest: hitTest,
    stats: stats, cellAt: cellAt, openings: openings,
    cellX: cellX, cellY: cellY, rotMask: rotMask, BIT: BIT, DC: DC, DR: DR
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  g.SpringGame = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
