/* ============================================================
   282-lanternrow / game.js
   《挑灯 · 一条街的光》—— 纯逻辑层：零 DOM、零 Canvas
   可在 Node 里直接 require 做冒烟测试
   ============================================================ */
(function (g) {
  'use strict';

  // ---------- 常量 ----------
  var W = 480, H = 900;
  var CEIL_Y = 46;                 // 屋檐（反弹顶）
  var GROUND_Y = 830;              // 越过此线即空放
  var ORIGIN = { x: 240, y: 700 }; // 挑杆头 / 发射点
  var GRAV = 1000;
  var SPEED_MIN = 680, SPEED_MAX = 1240;
  var MAX_BOUNCE = 3;
  var SEED_R = 7;
  var REST_WALL = 0.70, REST_CEIL = 0.64;
  var ROW_Y = [110, 176, 242, 308, 374, 440];
  var ROW_N = [7, 6, 7, 6, 7, 6];
  var ROW_X0 = [44, 76.5, 44, 76.5, 44, 76.5];
  var COL_STEP = 65;
  var LR = 17;
  var MAX_SHOTS = 11;
  var CHAIN_STEP = 0.17;           // 每跳传火延迟
  var ROPE_H = 0.62;               // 横绳连通率（调参得出：最大分量 ~16，余下 2-5）
  var ROPE_V = 0.26;               // 竖绳连通率
  var FUEL_TIME = 1.5;             // 火种燃尽时间（秒）——绕远路会烧到头
  var CAP = 12;                    // 挑子容量：挂不下的按 ×1 放到地上（不丢，只是没吃到倍率）

  var WORDS = ('糖画 面人 修伞 磨刀 评弹 馄饨 灯谜 剪纸 卖花 打铁 ' +
    '编竹 煮茶 说书 扎灯 写联 补锅 挑水 撑船 卜卦 刻章 ' +
    '画扇 剃头 织席 榨油 弹棉 磨镜 捏面 糊窗 烘糕 串珠 ' +
    '卖唱 修表 酿醋 秤糖 补鞋 变脸 烧陶 编绳 收摊 点灯').split(' ');

  var BANNER_WORDS = ['茶', '酒', '面', '药', '布', '酱', '灯', '糖'];

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

  // ---------- 拆大分量：在最大分量里找一条桥绳剪断，直到最大分量 <= cap ----------
  function components(adj, n) {
    var seen = new Array(n), out = [];
    for (var i = 0; i < n; i++) {
      if (seen[i]) continue;
      var q = [i]; seen[i] = true; var ids = [];
      while (q.length) { var v = q.pop(); ids.push(v); var nb = adj[v];
        for (var k = 0; k < nb.length; k++) if (!seen[nb[k]]) { seen[nb[k]] = true; q.push(nb[k]); } }
      out.push(ids);
    }
    return out;
  }
  function splitBig(adj, ropes, cap) {
    var n = adj.length, guard = 0;
    while (guard++ < 60) {
      var cs = components(adj, n), big = null;
      for (var i = 0; i < cs.length; i++) if (!big || cs[i].length > big.length) big = cs[i];
      if (!big || big.length <= cap) return;
      var inBig = new Set(big);
      var best = -1, bestScore = 1e9;
      for (var r = 0; r < ropes.length; r++) {
        var a = ropes[r].a, b = ropes[r].b;
        if (!inBig.has(a) || !inBig.has(b)) continue;
        // 暂时剪断
        cut(adj, a, b);
        var sa = flood(adj, n, a), sb = flood(adj, n, b);
        var score = Math.max(sa, sb);
        if (score < bestScore) { bestScore = score; best = r; }
        // 还原
        adj[a].push(b); adj[b].push(a);
      }
      if (best < 0) return;
      var e = ropes[best];
      cut(adj, e.a, e.b);
      ropes.splice(best, 1);
    }
  }
  function cut(adj, a, b) {
    var i = adj[a].indexOf(b); if (i >= 0) adj[a].splice(i, 1);
    i = adj[b].indexOf(a); if (i >= 0) adj[b].splice(i, 1);
  }
  function flood(adj, n, start) {
    var seen = new Array(n), q = [start], c = 0;
    seen[start] = true;
    while (q.length) { var v = q.pop(); c++; var nb = adj[v];
      for (var k = 0; k < nb.length; k++) if (!seen[nb[k]]) { seen[nb[k]] = true; q.push(nb[k]); } }
    return c;
  }

  // ---------- 建场 ----------
  function buildField(rand) {
    var lanterns = [], index = [], i, j;
    for (i = 0; i < ROW_Y.length; i++) {
      index[i] = [];
      for (j = 0; j < ROW_N[i]; j++) {
        index[i][j] = lanterns.length;
        lanterns.push({
          id: lanterns.length,
          row: i, col: j,
          x: ROW_X0[i] + j * COL_STEP + (rand() * 2 - 1) * 6,
          y: ROW_Y[i] + (rand() * 2 - 1) * 5,
          r: LR + (rand() * 2 - 1) * 2.4,
          lit: false, litAt: 0, word: '',
          sway: rand() * Math.PI * 2,
          depth: 0
        });
      }
    }
    var ropes = [];
    var adj = lanterns.map(function () { return []; });
    function link(a, b) {
      if (a === b) return;
      for (var k = 0; k < adj[a].length; k++) if (adj[a][k] === b) return;
      adj[a].push(b); adj[b].push(a);
      ropes.push({ a: a, b: b, sag: 3 + rand() * 4 });
    }
    // 横绳：并非每行都连满，断开处把一行切成若干段（火蔓延到此为止）
    for (i = 0; i < ROW_Y.length; i++) {
      for (j = 0; j + 1 < ROW_N[i]; j++) {
        if (rand() < ROPE_H) link(index[i][j], index[i][j + 1]);
      }
    }
    // 竖绳：只有一部分挂点垂下绳子，连到下一排最近的灯笼
    for (i = 0; i + 1 < ROW_Y.length; i++) {
      for (j = 0; j < ROW_N[i]; j++) {
        var best = -1, bd = 1e9;
        for (var k2 = 0; k2 < ROW_N[i + 1]; k2++) {
          var d = Math.abs(lanterns[index[i + 1][k2]].x - lanterns[index[i][j]].x);
          if (d < bd) { bd = d; best = index[i + 1][k2]; }
        }
        if (best >= 0 && bd <= 50 && rand() < ROPE_V) link(index[i][j], best);
      }
    }
    // 尾部保险：把过大的连通分量拆小（否则个别种子会一口气烧掉 30 盏）
    splitBig(adj, ropes, 16);

    // 背景建筑立面 + 幌子
    var buildings = [], bx = -20;
    while (bx < W + 20) {
      var bw = 52 + rand() * 46;
      var bh = 96 + rand() * 74;
      var b = { x: bx, w: bw, y: 620 - bh, h: bh, windows: [] };
      var cols = Math.max(1, Math.floor(bw / 26));
      var rows = Math.max(1, Math.floor(bh / 34));
      for (var c = 0; c < cols; c++) {
        for (var r2 = 0; r2 < rows; r2++) {
          b.windows.push({
            x: bx + 12 + c * 26,
            y: b.y + 18 + r2 * 34,
            w: 11, h: 15,
            thr: rand()
          });
        }
      }
      buildings.push(b);
      bx += bw + 3;
    }
    var banners = [];
    for (i = 0; i < 6; i++) {
      banners.push({
        x: 34 + i * 74 + rand() * 14,
        y: 486 + rand() * 26,
        w: 20, h: 62 + rand() * 18,
        word: BANNER_WORDS[(i + Math.floor(rand() * 3)) % BANNER_WORDS.length],
        sway: rand() * Math.PI * 2
      });
    }
    return { lanterns: lanterns, ropes: ropes, adj: adj, buildings: buildings, banners: banners };
  }

  // ---------- 创建 ----------
  function create(opts) {
    opts = opts || {};
    var seedNum = opts.seed != null ? opts.seed : (Date.now() & 0x7fffffff);
    var rand = mulberry32(seedNum);
    var f = buildField(rand);
    var bag = WORDS.slice();
    for (var i = bag.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var t = bag[i]; bag[i] = bag[j]; bag[j] = t;
    }

    var st = {
      W: W, H: H, CEIL_Y: CEIL_Y, GROUND_Y: GROUND_Y, ORIGIN: ORIGIN,
      rand: rand,
      lanterns: f.lanterns,
      ropes: f.ropes,
      adj: f.adj,
      buildings: f.buildings,
      banners: f.banners,
      bag: bag, bagI: 0,
      total: f.lanterns.length,
      litCount: 0,
      phase: 'aim',                 // aim | fly | over
      time: 0,
      acc: 0,
      seedObj: null,
      shotsUsed: 0,
      shots: MAX_SHOTS,
      score: 0,
      pending: 0,
      combo: 0,
      multiplier: 1,
      longest: 0,
      bankCount: 0,
      missCount: 0,
      hitCount: 0,
      lastChain: 0,
      cleared: false,
      overflow: 0,
      lostLanterns: 0,
      aim: { angle: 0, power: 0.72 },
      events: []
    };
    return st;
  }

  function nextWord(st) {
    var w = st.bag[st.bagI % st.bag.length];
    st.bagI++;
    return w;
  }

  // ---------- 传火（沿绳网 BFS，已点亮的灯是屏障） ----------
  function ignite(st, startId) {
    if (st.lanterns[startId].lit) return [];
    var out = [];
    var seen = new Set([startId]);
    var frontier = [{ id: startId, from: -1 }];
    var depth = 0;
    while (frontier.length) {
      var next = [];
      for (var i = 0; i < frontier.length; i++) {
        var id = frontier[i].id, from = frontier[i].from;
        var L = st.lanterns[id];
        if (L.lit) continue;
        L.lit = true;
        L.depth = depth;
        L.litAt = st.time + depth * CHAIN_STEP;
        L.word = nextWord(st);
        st.litCount++;
        out.push({ id: id, depth: depth, from: from });
        var nb = st.adj[id];
        for (var k = 0; k < nb.length; k++) {
          if (!seen.has(nb[k]) && !st.lanterns[nb[k]].lit) {
            seen.add(nb[k]); next.push({ id: nb[k], from: id });
          }
        }
      }
      frontier = next;
      depth++;
      if (depth > 64) break;
    }
    return out;
  }

  // ---------- 物理 ----------
  function stepSeed(s, dt) {
    if (s.fuel != null) s.fuel -= dt / FUEL_TIME;
    s.vy += GRAV * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.bounced = 0;
    if (s.x < SEED_R) { s.x = SEED_R; s.vx = -s.vx * REST_WALL; s.bounces++; s.bounced = 1; }
    else if (s.x > W - SEED_R) { s.x = W - SEED_R; s.vx = -s.vx * REST_WALL; s.bounces++; s.bounced = 1; }
    if (s.y < CEIL_Y + SEED_R) { s.y = CEIL_Y + SEED_R; s.vy = -s.vy * REST_CEIL; s.bounces++; s.bounced = 1; }
  }

  function hitTest(st, x, y) {
    for (var i = 0; i < st.lanterns.length; i++) {
      var L = st.lanterns[i];
      if (L.lit) continue;                    // 亮着的灯是"烧过的"，火种穿过去
      var dx = x - L.x, dy = y - L.y, rr = L.r + SEED_R;
      if (dx * dx + dy * dy <= rr * rr) return i;
    }
    return -1;
  }

  function launchDir(angleDeg) {
    var rad = angleDeg * Math.PI / 180;
    return { x: Math.sin(rad), y: -Math.cos(rad) };
  }

  // ---------- 玩家动作 ----------
  function launch(st) {
    if (st.phase !== 'aim' || st.shotsUsed >= st.shots) return false;
    var d = launchDir(st.aim.angle);
    var sp = SPEED_MIN + (SPEED_MAX - SPEED_MIN) * st.aim.power;
    st.seedObj = {
      x: ORIGIN.x, y: ORIGIN.y,
      vx: d.x * sp, vy: d.y * sp,
      bounces: 0, bounced: 0, age: 0, fuel: 1,
      trail: []
    };
    st.shotsUsed++;
    st.phase = 'fly';
    st.events.push({ type: 'launch', x: ORIGIN.x, y: ORIGIN.y, power: st.aim.power });
    return true;
  }

  function bank(st) {
    if (st.phase === 'over' || st.pending <= 0) return 0;
    var gained = Math.round(st.pending * st.multiplier * 10);
    st.score += gained;
    st.bankCount++;
    st.events.push({ type: 'bank', n: st.pending, mult: st.multiplier, gained: gained });
    st.pending = 0;
    st.combo = 0;
    st.multiplier = 1;
    return gained;
  }

  function finish(st) {
    st.lostLanterns = st.pending;
    st.pending = 0;
    st.phase = 'over';
    st.seedObj = null;
    if (st.litCount >= st.total) {
      st.cleared = true;
      st.score += Math.round(st.score * 0.5);
      st.events.push({ type: 'clear' });
    }
    st.events.push({ type: 'over' });
  }

  // ---------- 主循环 ----------
  function update(st, dt) {
    st.time += dt;
    if (st.phase !== 'fly' || !st.seedObj) return;
    var s = st.seedObj;
    st.acc += dt;
    var h = 1 / 120;
    var guard = 0;
    while (st.acc >= h && st.phase === 'fly' && guard++ < 40) {
      st.acc -= h;
      stepSeed(s, h);
      s.age += h;
      if (s.bounced) st.events.push({ type: 'bounce', x: s.x, y: s.y });
      s.trail.push(s.x, s.y);
      if (s.trail.length > 120) s.trail.splice(0, 2);

      if (s.fuel <= 0) {
        var lost3 = Math.floor(st.pending / 2);
        st.pending -= lost3;
        st.combo = 0; st.multiplier = 1; st.missCount++; st.lastChain = 0;
        st.events.push({ type: 'burnout', x: s.x, y: s.y, lost: lost3 });
        st.seedObj = null; st.acc = 0;
        if (st.shotsUsed >= st.shots) { finish(st); return; }
        st.phase = 'aim';
        return;
      }

      var hit = hitTest(st, s.x, s.y);
      if (hit >= 0) {
        var L = st.lanterns[hit];
        var chain = ignite(st, hit);
        st.lastChain = chain.length;
        st.pending += chain.length;
        st.hitCount++;
        st.combo++;
        st.multiplier = 1 + 0.5 * (st.combo - 1);
        if (chain.length > st.longest) st.longest = chain.length;
        st.events.push({
          type: 'hit', x: L.x, y: L.y, n: chain.length,
          chain: chain, mult: st.multiplier
        });
        // 挑子挂不下的，按 ×1 放到地上（不丢，只是没吃到倍率）
        if (st.pending > CAP) {
          var over = st.pending - CAP;
          st.pending = CAP;
          var g1 = over * 10;
          st.score += g1;
          st.overflow += over;
          st.events.push({ type: 'overflow', n: over, gained: g1 });
        }
        st.seedObj = null;
        st.acc = 0;
        if (st.litCount >= st.total) { finish(st); return; }
        if (st.shotsUsed >= st.shots) { finish(st); return; }
        st.phase = 'aim';
        return;
      }

      if (s.y > GROUND_Y) {
        var lost = Math.floor(st.pending / 2);
        st.pending -= lost;
        st.combo = 0;
        st.multiplier = 1;
        st.missCount++;
        st.lastChain = 0;
        st.events.push({ type: 'miss', x: s.x, y: GROUND_Y, lost: lost });
        st.seedObj = null;
        st.acc = 0;
        if (st.shotsUsed >= st.shots) { finish(st); return; }
        st.phase = 'aim';
        return;
      }
    }
    if (s.age > 12) { // 兜底：飞太久强制回收
      st.seedObj = null;
      if (st.shotsUsed >= st.shots) { finish(st); return; }
      st.phase = 'aim';
    }
  }

  // ---------- 预测轨迹（与物理同源） ----------
  function predict(st, angleDeg, power, maxT) {
    var d = launchDir(angleDeg);
    var sp = SPEED_MIN + (SPEED_MAX - SPEED_MIN) * power;
    var s = { x: ORIGIN.x, y: ORIGIN.y, vx: d.x * sp, vy: d.y * sp, bounces: 0, fuel: 1 };
    var pts = [], dt = 1 / 90, t = 0;
    maxT = maxT || 2.6;
    while (t < maxT) {
      stepSeed(s, dt); t += dt;
      pts.push(s.x, s.y);
      if (s.fuel <= 0) { pts.burn = true; break; }
      if (s.y > GROUND_Y) break;
      var ph = hitTest(st, s.x, s.y);
      if (ph >= 0) { pts.hit = true; pts.hitId = ph; break; }
    }
    return pts;
  }

  // ---------- 预演链长（不改状态，供瞄准预览用） ----------
  function chainSize(st, id) {
    if (!st.lanterns[id] || st.lanterns[id].lit) return { n: 0, ids: [] };
    var seen = new Set([id]);
    var ids = [id];
    var stack = [id];
    while (stack.length) {
      var v = stack.pop();
      var nb = st.adj[v];
      for (var i = 0; i < nb.length; i++) {
        var w = nb[i];
        if (!seen.has(w) && !st.lanterns[w].lit) { seen.add(w); ids.push(w); stack.push(w); }
      }
    }
    return { n: ids.length, ids: ids };
  }

  // ---------- 拖拽瞄准 ----------
  function aimFromPointer(st, px, py) {
    var dx = px - ORIGIN.x, dy = py - ORIGIN.y;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;
    if (dy > -0.12 * len) { //  constrain 到上半平面
      dy = -0.12 * len;
      len = Math.sqrt(dx * dx + dy * dy);
    }
    var ang = Math.atan2(dx, -dy) * 180 / Math.PI;
    st.aim.angle = clamp(ang, -78, 78);
    st.aim.power = clamp(len / 210, 0.2, 1);
  }

  // ---------- 统计 ----------
  function stats(st) {
    var words = [];
    for (var i = 0; i < st.lanterns.length; i++) {
      if (st.lanterns[i].lit) words.push(st.lanterns[i].word);
    }
    return {
      score: st.score,
      lit: st.litCount,
      total: st.total,
      longest: st.longest,
      bankCount: st.bankCount,
      missCount: st.missCount,
      lost: st.lostLanterns,
      cleared: st.cleared,
      words: words
    };
  }

  var API = {
    W: W, H: H, ORIGIN: ORIGIN, GROUND_Y: GROUND_Y, CEIL_Y: CEIL_Y,
    SEED_R: SEED_R, MAX_SHOTS: MAX_SHOTS, CAP: CAP, FUEL_TIME: FUEL_TIME,
    create: create, update: update, launch: launch, bank: bank,
    predict: predict, aimFromPointer: aimFromPointer, stats: stats, chainSize: chainSize,
    ignite: ignite, hitTest: hitTest
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  g.LanternGame = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
