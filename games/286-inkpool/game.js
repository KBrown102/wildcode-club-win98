/* 286-inkpool《匀墨 · 五色池》· 纯逻辑层
   零 DOM / 零 Canvas，Node 可直接 require 冒烟
   墨分五色：0清 1淡 2重 3浓 4焦 */
(function (g) {
  'use strict';

  var BREATH_T = 4.4;                 // 一个呼吸周期（秒）
  var CALM_A = 0.58, CALM_B = 0.66, CALM_C = 0.94;

  // 空盂 ≥ 2 是硬约束：只有 1 只空盂时存在无解发牌（实测 8 个种子里 6 个解不开）
  // par 由求解器实测均值 ×1.5 校准（见 _smoke286.cjs 末端输出）
  var LEVELS = [
    { g: 3, cap: 3, empty: 2, lifts: 3, par: 11 },
    { g: 4, cap: 3, empty: 2, lifts: 3, par: 15 },
    { g: 3, cap: 4, empty: 2, lifts: 3, par: 15 },
    { g: 5, cap: 3, empty: 2, lifts: 3, par: 20 },
    { g: 4, cap: 4, empty: 2, lifts: 3, par: 22 },
    { g: 5, cap: 4, empty: 2, lifts: 2, par: 27 },
    { g: 4, cap: 5, empty: 2, lifts: 2, par: 29 },
    { g: 5, cap: 5, empty: 2, lifts: 1, par: 39 }
  ];

  var GNAME = ['清', '淡', '重', '浓', '焦'];

  function mulberry32(a) {
    a = a >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function topRun(p) {
    if (!p.length) return 0;
    var v = p[p.length - 1], n = 1;
    for (var i = p.length - 2; i >= 0 && p[i] === v; i--) n++;
    return n;
  }
  function uniform(p) {
    for (var i = 1; i < p.length; i++) if (p[i] !== p[0]) return false;
    return true;
  }
  function isDone(st, i) {
    var p = st.pools[i];
    return p.length === st.cap && uniform(p) && p[0] < st.ng;
  }
  function doneCount(st) {
    var n = 0;
    for (var i = 0; i < st.np; i++) if (isDone(st, i)) n++;
    return n;
  }

  // 静度 0..1：呼气后段墨面最沉
  function calmness(b) {
    if (b < CALM_A) return 0;
    if (b < CALM_B) return (b - CALM_A) / (CALM_B - CALM_A);
    if (b < CALM_C) return 1;
    return Math.max(0, (1 - b) / (1 - CALM_C));
  }
  function isCalm(st) { return !!st.calmLock || calmness(st.breath) > 0.5; }

  function deal(L, seed) {
    var rnd = mulberry32(seed), u = [], pools, i, j, k;
    for (i = 0; i < L.g; i++) for (j = 0; j < L.cap; j++) u.push(i);
    for (k = 0; k < 60; k++) {
      for (i = u.length - 1; i > 0; i--) {
        j = Math.floor(rnd() * (i + 1));
        var t = u[i]; u[i] = u[j]; u[j] = t;
      }
      pools = [];
      var ok = true;
      for (i = 0; i < L.g; i++) {
        var s = u.slice(i * L.cap, (i + 1) * L.cap);
        if (uniform(s)) ok = false;
        pools.push(s);
      }
      for (i = 0; i < L.empty; i++) pools.push([]);
      if (ok) return pools;
    }
    return pools;
  }

  function create(level, seed) {
    var L = LEVELS[level - 1] || LEVELS[0];
    var s = (seed == null) ? ((level * 7919 + 1301) >>> 0) : (seed >>> 0);
    var pools = deal(L, s);
    return {
      level: level, seed: s,
      pools: pools, np: pools.length, cap: L.cap, ng: L.g,
      par: L.par,
      lifts: L.lifts, liftsMax: L.lifts, relief: 0,
      sel: -1, cur: 0, liftMode: false, calmLock: false,
      moves: 0, pours: 0, time: 0, breath: 0.10,
      stamps: pools.map(function () { return false; }),
      phase: 'play', events: [], sandbox: false
    };
  }

  function syncStamps(st) {
    for (var i = 0; i < st.np; i++) {
      var d = isDone(st, i);
      if (d !== st.stamps[i]) {
        st.stamps[i] = d;
        st.events.push(d ? { t: 'unify', p: i, grade: st.pools[i][0] } : { t: 'unbreak', p: i });
      }
    }
  }

  function clearCheck(st) {
    if (st.phase !== 'play') return;
    if (doneCount(st) >= st.ng) {
      st.phase = 'clear';
      st.events.push({
        t: 'clear', level: st.level, moves: st.moves,
        time: st.time, lifts: st.lifts, relief: st.relief
      });
    }
  }

  // 一次倒墨能倒几格（不改状态，HUD 预览用）
  function preview(st, src, dst) {
    var S = st.pools[src], D = st.pools[dst];
    if (!S.length) return null;
    var n = topRun(S), room = st.cap - D.length;
    if (room <= 0) return null;
    var grade = S[S.length - 1];
    if (D.length && D[D.length - 1] !== grade) return null;
    var max = Math.min(n, room);
    var calm = isCalm(st);
    return {
      max: max, grade: grade, calm: calm,
      amount: calm ? max : Math.max(1, Math.ceil(max / 2))
    };
  }

  function pour(st, src, dst) {
    if (st.phase !== 'play') return { ok: false, why: 'phase' };
    if (src === dst) return { ok: false, why: 'same' };
    var S = st.pools[src], D = st.pools[dst];
    if (!S.length) return { ok: false, why: 'srcEmpty' };
    var n = topRun(S), room = st.cap - D.length;
    if (room <= 0) return { ok: false, why: 'full' };
    var grade = S[S.length - 1];
    if (D.length && D[D.length - 1] !== grade) return { ok: false, why: 'grade' };
    var max = Math.min(n, room);
    var calm = isCalm(st);
    var amt = calm ? max : Math.max(1, Math.ceil(max / 2));
    for (var i = 0; i < amt; i++) D.push(S.pop());
    st.moves++; st.pours++;
    st.events.push({ t: 'pour', src: src, dst: dst, grade: grade, amount: amt, of: max, calm: calm });
    syncStamps(st); clearCheck(st);
    return { ok: true, amount: amt };
  }

  // 提笔：无视同阶规则搬一整摞，应急兜底
  function lift(st, src, dst) {
    if (st.phase !== 'play') return { ok: false, why: 'phase' };
    if (st.lifts <= 0) return { ok: false, why: 'noLift' };
    if (src === dst) return { ok: false, why: 'same' };
    var S = st.pools[src], D = st.pools[dst];
    if (!S.length) return { ok: false, why: 'srcEmpty' };
    var n = topRun(S), room = st.cap - D.length;
    if (room <= 0) return { ok: false, why: 'full' };
    var amt = Math.min(n, room), grade = S[S.length - 1];
    for (var i = 0; i < amt; i++) D.push(S.pop());
    st.lifts--; st.moves++;
    st.events.push({ t: 'liftMove', src: src, dst: dst, grade: grade, amount: amt });
    syncStamps(st); clearCheck(st);
    return { ok: true, amount: amt };
  }

  function tap(st, idx) {
    if (st.phase !== 'play') return;
    if (idx < 0 || idx >= st.np) {
      if (st.sel >= 0) { st.sel = -1; st.events.push({ t: 'deselect' }); }
      return;
    }
    st.cur = idx;
    if (st.sel < 0) {
      if (!st.pools[idx].length) { st.events.push({ t: 'deny', p: idx, why: 'srcEmpty' }); return; }
      st.sel = idx; st.events.push({ t: 'select', p: idx });
      return;
    }
    if (st.sel === idx) { st.sel = -1; st.events.push({ t: 'deselect' }); return; }
    var src = st.sel;
    var r = st.liftMode ? lift(st, src, idx) : pour(st, src, idx);
    if (r.ok) {
      st.sel = -1;
      if (st.liftMode) st.liftMode = false;
    } else {
      st.events.push({ t: 'deny', p: idx, why: r.why });
    }
  }

  // 还有没有「不破坏已归一之池」的合法倒法
  function hasMove(st) {
    for (var i = 0; i < st.np; i++) {
      var A = st.pools[i];
      if (!A.length || isDone(st, i)) continue;
      var ga = A[A.length - 1];
      for (var j = 0; j < st.np; j++) {
        if (i === j) continue;
        var B = st.pools[j];
        if (B.length >= st.cap || isDone(st, j)) continue;
        if (B.length === 0 || B[B.length - 1] === ga) return true;
      }
    }
    return false;
  }

  function update(st, dt) {
    st.time += dt;
    st.breath += dt / BREATH_T;
    while (st.breath >= 1) st.breath -= 1;
    if (st.phase === 'play' && !st.sandbox) {
      // 充电宝：滞住且无提笔时，系统润一笔，永远不会真死
      if (!hasMove(st) && st.lifts === 0 && doneCount(st) < st.ng) {
        st.lifts++; st.relief++;
        st.events.push({ t: 'relief' });
      }
    }
  }

  function stars(st) {
    if (st.moves <= st.par) return 3;
    if (st.moves <= Math.round(st.par * 1.45)) return 2;
    return 1;
  }

  function restart(st, newSeed) {
    var L = LEVELS[st.level - 1] || LEVELS[0];
    var s = (newSeed == null) ? ((st.seed * 1103515245 + 12345) >>> 0) : (newSeed >>> 0);
    st.seed = s;
    st.pools = deal(L, s);
    st.np = st.pools.length; st.cap = L.cap; st.ng = L.g;
    st.lifts = L.lifts; st.liftsMax = L.lifts; st.relief = 0;
    st.sel = -1; st.cur = 0; st.liftMode = false;
    st.moves = 0; st.pours = 0; st.time = 0;
    st.stamps = st.pools.map(function () { return false; });
    st.phase = 'play';
    st.events.push({ t: 'restart' });
    return st;
  }

  function goto(st, level, seed) {
    var n = create(level, seed);
    n.calmLock = !!st.calmLock;
    return n;
  }

  g.InkPool = {
    BREATH_T: BREATH_T,
    LEVELS: LEVELS,
    GNAME: GNAME,
    CALM_A: CALM_A, CALM_C: CALM_C,
    create: create,
    restart: restart,
    goto: goto,
    update: update,
    tap: tap,
    pour: pour,
    lift: lift,
    preview: preview,
    topRun: topRun,
    uniform: uniform,
    isDone: isDone,
    doneCount: doneCount,
    hasMove: hasMove,
    calmness: calmness,
    isCalm: isCalm,
    stars: stars
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
