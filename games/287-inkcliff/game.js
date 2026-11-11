/* 287-inkcliff《断崖 · 墨阶》· 纯逻辑层
   零 DOM / 零 Canvas，Node 可直接 require 冒烟

   墨分八阶（0 纸白 → 7 焦墨）。
   顺阶滑行：只能滑进高度 ≤ 当前格的邻格，一路滑到撞上更高的阶或边界才停。
   断崖：落差 ≥ CLIFF(3) 时不是滑下去，而是坠落，落点触发「跃迁爆发」夷平四周——
         高的崩 -2、低的填 +1，都以落点高度为界。
   势差：全场 max-min。夷平会削平它，而断崖需要 ≥3 的落差才能触发；
         削得太狠就再也炸不出断崖。每一次坠落都在花掉自己的地形预算。
*/
(function (g) {
  'use strict';

  var N = 10, HMAX = 7, CLIFF = 3;
  var DR = [-1, 0, 1, 0], DC = [0, 1, 0, -1];

  // targets / par 由 _solve287.cjs 烘焙（保证每关可解 + par 可达）
  var LEVELS = [
    { seed: 80711, bumps: 3, rough: 0.04, k: 3, targets: [78, 0, 17], par: 11, tip: '能平走、能下坡、最多爬一阶 · 两阶以上的陡崖爬不上去' },
    { seed: 41223, bumps: 4, rough: 0.10, k: 4, targets: [82, 9, 10, 78], par: 13, tip: '落差 ≥3 就是断崖 · 落点炸开，四周高地一起矮到你脚下' },
    { seed: 88129, bumps: 4, rough: 0.18, k: 4, targets: [82, 19, 20, 78], par: 15, tip: '摔下去，脚下的碎石还会把你垫高两阶' },
    { seed: 33061, bumps: 5, rough: 0.22, k: 5, targets: [8, 90, 76, 11, 43], par: 18, tip: '' },
    { seed: 66249, bumps: 5, rough: 0.30, k: 5, targets: [81, 9, 56, 12, 95], par: 20, tip: '' },
    { seed: 15487, bumps: 6, rough: 0.34, k: 6, targets: [80, 9, 77, 23, 94, 52], par: 26, tip: '' },
    { seed: 72833, bumps: 6, rough: 0.42, k: 7, targets: [1, 99, 36, 80, 75, 62, 14], par: 29, tip: '' },
    { seed: 28109, bumps: 7, rough: 0.50, k: 8, targets: [99, 1, 37, 75, 44, 58, 13, 66], par: 29, tip: '势用完了，山就定了' }
  ];

  function mulberry32(a) {
    a = a >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function clampi(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function smoothstep(x) { x = clampi(x, 0, 1); return x * x * (3 - 2 * x); }

  /* ---------------- 地形生成 ---------------- */
  function genH(seed, bumps, rough) {
    var rnd = mulberry32(seed), f = new Float64Array(N * N), i, r, c, b;
    for (b = 0; b < bumps; b++) {
      var pr = (0.18 + rnd() * 0.64) * (N - 1);
      var pc = (0.18 + rnd() * 0.64) * (N - 1);
      var amp = 0.75 + rnd() * 0.75;
      var sg = 0.70 + rnd() * 0.85;          // 更紧的峰 → 更陡的壁，才有需要炸开的墙
      var i2 = 1 / (2 * sg * sg);
      for (r = 0; r < N; r++) for (c = 0; c < N; c++) {
        var dr = r - pr, dc = c - pc;
        f[r * N + c] += amp * Math.exp(-(dr * dr + dc * dc) * i2);
      }
    }
    // 径向收边 → 四角归零，墨山浮在纸上（留白纵深）
    var cx = (N - 1) / 2, R = (N - 1) / 2 * 1.08;
    for (r = 0; r < N; r++) for (c = 0; c < N; c++) {
      var dx = c - cx, dy = r - cx;
      var d = Math.sqrt(dx * dx + dy * dy) / R;
      f[r * N + c] *= 1 - smoothstep((d - 0.74) / 0.34);
    }
    var mn = Infinity, mx = -Infinity;
    for (i = 0; i < N * N; i++) { if (f[i] < mn) mn = f[i]; if (f[i] > mx) mx = f[i]; }
    var span = (mx - mn) || 1;
    var h = new Int8Array(N * N);
    for (i = 0; i < N * N; i++) {
      var q = Math.round((f[i] - mn) / span * HMAX);
      if (rough > 0 && rnd() < rough) q += (rnd() < 0.5 ? -1 : 1);
      h[i] = clampi(q, 0, HMAX);
    }
    return h;
  }

  // 起点取最高的一小撮里的一格（山顶出发，顺流而下）
  function pickStart(h, seed) {
    var rnd = mulberry32((seed * 2654435761) >>> 0);
    var idx = [], i;
    for (i = 0; i < N * N; i++) idx.push(i);
    idx.sort(function (a, b) { return h[b] - h[a]; });
    var top = Math.min(5, idx.length);
    return idx[Math.floor(rnd() * top)];
  }

  /* ---------------- 状态 ---------------- */
  function create(level, seed) {
    var L = LEVELS[level - 1] || LEVELS[0];
    var s = (seed == null) ? (L.seed >>> 0) : (seed >>> 0);
    var h = genH(s, L.bumps, L.rough);
    var pos = pickStart(h, s);
    var isT = new Uint8Array(N * N), i;
    for (i = 0; i < L.targets.length; i++) isT[L.targets[i]] = 1;
    var lit = new Uint8Array(N * N), vis = new Uint8Array(N * N);
    vis[pos] = 1;
    return {
      level: level, seed: s, N: N,
      h: h, pos: pos, start: pos,
      isTarget: isT, targets: L.targets.slice(),
      lit: lit, visited: vis,
      moves: 0, bursts: 0, relief: 0, time: 0,
      par: L.par, tip: L.tip,
      phase: 'play', events: [], hist: [], sandbox: false
    };
  }

  /* ---------------- 滑行（纯函数，不改状态） ---------------- */
  function simSlide(h, pos, dir) {
    var path = [], cur = pos, r = (pos / N) | 0, c = pos % N;
    var dr = DR[dir], dc = DC[dir];
    for (;;) {
      var nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= N || nc < 0 || nc >= N) break;
      var ni = nr * N + nc, nh = h[ni];
      if (nh > h[cur] + 1) break;                          // 陡崖（≥2 阶）爬不上去
      path.push(ni);
      if (h[cur] - nh >= CLIFF) return { path: path, fall: true };   // 断崖坠落
      cur = ni; r = nr; c = nc;
    }
    return { path: path, fall: false };
  }

  /* ---------------- 跃迁爆发（夷平） ---------------- */
  function burstAt(st, idx) {
    var hLand = st.h[idx], cells = [], r0 = (idx / N) | 0, c0 = idx % N;
    for (var dr = -2; dr <= 2; dr++) for (var dc = -2; dc <= 2; dc++) {
      var r = r0 + dr, c = c0 + dc;
      if (r < 0 || r >= N || c < 0 || c >= N) continue;
      var i = r * N + c;
      if (i === idx) continue;
      var near = (Math.abs(dr) <= 1 && Math.abs(dc) <= 1);   // 内圈 9 格
      var from = st.h[i], to = from;
      if (from > hLand) to = near ? hLand : Math.max(hLand, from - 2);   // 崩：内圈直接压到落点高度
      else if (from < hLand) to = Math.min(hLand, from + 1);              // 填
      if (to !== from) { st.h[i] = to; cells.push({ i: i, from: from, to: to }); }
    }
    // 落点堆高：崩下来的碎石垫在脚下 —— 摔一次反而站高一点，
    // 而且脚下这 2 阶就是下一道断崖的势，不用靠「起势」兜底爬升
    var nl = Math.min(HMAX, hLand + 2);
    if (nl !== hLand) { st.h[idx] = nl; cells.push({ i: idx, from: hLand, to: nl }); }
    return { i: idx, hLand: hLand, landTo: nl, cells: cells };
  }

  /* ---------------- 走一步 ---------------- */
  function move(st, dir) {
    if (st.phase !== 'play') return { ok: false, why: 'phase' };
    var res = simSlide(st.h, st.pos, dir);
    if (!res.path.length) { st.events.push({ t: 'blocked', dir: dir }); return { ok: false, why: 'blocked' }; }

    st.hist.push(snapshot(st));
    if (st.hist.length > 90) st.hist.shift();

    var newly = [], i;
    for (i = 0; i < res.path.length; i++) {
      var p = res.path[i];
      st.visited[p] = 1;
      if (st.isTarget[p] && !st.lit[p]) { st.lit[p] = 1; newly.push(p); }
    }
    st.pos = res.path[res.path.length - 1];
    st.moves++;

    var burst = null;
    if (res.fall && !st.noBurst) { burst = burstAt(st, st.pos); st.bursts++; }

    st.events.push({ t: 'slide', dir: dir, path: res.path, fall: res.fall, lit: newly, burst: burst });
    checkClear(st);
    if (st.phase === 'play') ensureProgress(st);
    return { ok: true, path: res.path, fall: res.fall, burst: burst };
  }

  /* ---------------- 可达性 / 起势 ---------------- */
  // 只沿「滑行停靠点」做 BFS：滑行不能中途停，所以可达集不是简单 flood fill
  function explore(st) {
    var seen = new Uint8Array(N * N), cover = new Uint8Array(N * N);
    var q = [st.pos], head = 0, d, i;
    seen[st.pos] = 1; cover[st.pos] = 1;
    while (head < q.length) {
      var p = q[head++];
      for (d = 0; d < 4; d++) {
        var res = simSlide(st.h, p, d);
        if (!res.path.length) continue;
        for (i = 0; i < res.path.length; i++) cover[res.path[i]] = 1;
        var land = res.path[res.path.length - 1];
        if (!seen[land]) { seen[land] = 1; q.push(land); }
      }
    }
    return { seen: seen, cover: cover };
  }

  function canProgress(st) {
    var e = explore(st), i, d, p;
    for (i = 0; i < st.targets.length; i++) {
      var t = st.targets[i];
      if (!st.lit[t] && e.cover[t]) return true;   // 还有谱眼走得到
    }
    for (p = 0; p < N * N; p++) {                  // 或者还能炸出断崖
      if (!e.seen[p]) continue;
      var r = (p / N) | 0, c = p % N, hp = st.h[p];
      for (d = 0; d < 4; d++) {
        var nr = r + DR[d], nc = c + DC[d];
        if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;
        if (hp - st.h[nr * N + nc] >= CLIFF) return true;
      }
    }
    return false;
  }

  // 起势：脚下自己长起来（或四周塌下去），永远不把人困死
  function doRelief(st) {
    var i = st.pos, before = st.h[i], mode;
    if (before < HMAX) {
      st.h[i] = Math.min(HMAX, before + 3); mode = 'rise';
    } else {
      var r = (i / N) | 0, c = i % N, d;
      for (d = 0; d < 4; d++) {
        var nr = r + DR[d], nc = c + DC[d];
        if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;
        var nb = nr * N + nc;
        st.h[nb] = Math.max(0, st.h[nb] - 3);
      }
      mode = 'sink';
    }
    st.relief++;
    st.events.push({ t: 'relief', i: i, from: before, to: st.h[i], mode: mode });
  }

  function ensureProgress(st) {
    if (st.sandbox) return;
    // 一次起势未必够（墙可能比「抬高 3 阶」还高），最多连补 6 次
    for (var n = 0; n < 6; n++) {
      if (canProgress(st)) return;
      doRelief(st);
    }
  }

  /* ---------------- 快照 / 回溯 ---------------- */
  function snapshot(st) {
    return {
      h: st.h.slice(), pos: st.pos, lit: st.lit.slice(), visited: st.visited.slice(),
      moves: st.moves, bursts: st.bursts, relief: st.relief, phase: st.phase
    };
  }
  function restore(st, s) {
    st.h.set(s.h); st.lit.set(s.lit); st.visited.set(s.visited);
    st.pos = s.pos; st.moves = s.moves; st.bursts = s.bursts;
    st.relief = s.relief; st.phase = s.phase;
  }
  function undo(st) {
    if (!st.hist.length) return false;
    restore(st, st.hist.pop());
    st.events.push({ t: 'undo' });
    return true;
  }
  function restart(st, newSeed) {
    var L = LEVELS[st.level - 1] || LEVELS[0];
    var s = (newSeed == null) ? st.seed : (newSeed >>> 0);
    var h = genH(s, L.bumps, L.rough);
    var pos = pickStart(h, s);
    st.seed = s; st.h = h; st.pos = pos; st.start = pos;
    st.lit = new Uint8Array(N * N);
    st.visited = new Uint8Array(N * N); st.visited[pos] = 1;
    st.moves = 0; st.bursts = 0; st.relief = 0; st.time = 0;
    st.phase = 'play'; st.hist.length = 0;
    st.events.push({ t: 'restart' });
    return st;
  }

  /* ---------------- 杂项 ---------------- */
  function checkClear(st) {
    if (st.phase !== 'play' || !st.targets.length) return;
    for (var i = 0; i < st.targets.length; i++) if (!st.lit[st.targets[i]]) return;
    st.phase = 'clear';
    st.events.push({
      t: 'clear', level: st.level, moves: st.moves, time: st.time,
      bursts: st.bursts, relief: st.relief, par: st.par
    });
  }
  function litCount(st) {
    var n = 0;
    for (var i = 0; i < st.targets.length; i++) if (st.lit[st.targets[i]]) n++;
    return n;
  }
  function reliefOf(h) {
    var mn = HMAX, mx = 0;
    for (var i = 0; i < N * N; i++) { if (h[i] < mn) mn = h[i]; if (h[i] > mx) mx = h[i]; }
    return mx - mn;
  }
  function stars(st) {
    if (st.moves <= st.par) return 3;
    if (st.moves <= Math.ceil(st.par * 1.45)) return 2;
    return 1;
  }
  function clone(st) {
    return {
      level: st.level, seed: st.seed, N: N,
      h: st.h.slice(), pos: st.pos, start: st.start,
      isTarget: st.isTarget.slice(), targets: st.targets.slice(),
      lit: st.lit.slice(), visited: st.visited.slice(),
      moves: st.moves, bursts: st.bursts, relief: st.relief, time: st.time,
      par: st.par, tip: st.tip, phase: st.phase, events: [], hist: [], sandbox: true
    };
  }

  g.InkCliff = {
    N: N, HMAX: HMAX, CLIFF: CLIFF, DR: DR, DC: DC, LEVELS: LEVELS,
    mulberry32: mulberry32,
    genH: genH, pickStart: pickStart,
    create: create, restart: restart, move: move, undo: undo,
    update: function (st, dt) { st.time += dt; },
    simSlide: simSlide, burstAt: burstAt, explore: explore,
    canProgress: canProgress, doRelief: doRelief,
    litCount: litCount, reliefOf: reliefOf, stars: stars, clone: clone
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
