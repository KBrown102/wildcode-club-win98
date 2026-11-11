/* 297-sandcat《落沙 · 引猫夜》— 纯逻辑层（无 DOM，可 Node require）
 * 目录：js/game.js（逻辑） · js/render.js（画布） · js/audio.js（音频） · js/ui.js（交互）
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SANDCAT = factory();
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  var COL = 30, ROW = 18, CELL = 28;
  var W = COL * CELL, H = ROW * CELL;
  var STREET = 3;                 // 街道标高
  var MAXH = 11;                  // 建筑最高

  var CAT_STEP = 0.185;           // 猫每走一格的秒数
  var POUR_RATE = 14;             // 落沙 粒/秒（按住满速）
  var SHOVEL_RATE = 9;            // 铲沙 粒/秒（按住满速）
  /* 「点一下 = 一格」+「按住 = 连倒」的手感参数 */
  var HOLD_DELAY = 0.26;          // 按住多久才进入连倒（避免误触）
  var RAMP_T = 0.95;              // 从起速爬到满速的时间
  var POUR_RATE_MIN = 6.5, POUR_RATE_MAX = 16;
  var SHOVEL_RATE_MIN = 5, SHOVEL_RATE_MAX = 11;
  var RELAX_PER_FRAME = 18;       // 每帧休止角松弛步数
  var G_V0 = 140, G_G = 1700, G_VMAX = 1250;
  var MEOW_CD = 1.7;
  var REFUND = 4;                 // 每只猫到家返还的沙（充电宝）
  var CAT_PT = 40, LAMP_PT = 4, SAND_W = 300;

  /* ---------- 关卡配置 ---------- */
  var LEVELS = [
    { nb: 2, hb: [6, 8], wmax: 4, np: 0, cats: 1, slack: 1.90, gmin: 4, gmax: 18, md: 9 },
    { nb: 3, hb: [6, 8], wmax: 4, np: 1, cats: 1, slack: 1.80, gmin: 8, gmax: 26, md: 9 },
    { nb: 3, hb: [6, 9], wmax: 5, np: 1, cats: 1, slack: 1.74, gmin: 12, gmax: 32, md: 9 },
    { nb: 4, hb: [6, 9], wmax: 5, np: 1, cats: 2, slack: 1.68, gmin: 22, gmax: 52, md: 7 },
    { nb: 4, hb: [7, 10], wmax: 5, np: 2, cats: 2, slack: 1.62, gmin: 34, gmax: 68, md: 7 },
    { nb: 5, hb: [7, 10], wmax: 5, np: 2, cats: 2, slack: 1.56, gmin: 36, gmax: 70, md: 7 },
    { nb: 5, hb: [7, 11], wmax: 5, np: 2, cats: 3, slack: 1.52, gmin: 56, gmax: 95, md: 6 },
    { nb: 5, hb: [8, 11], wmax: 6, np: 3, cats: 3, slack: 1.48, gmin: 64, gmax: 105, md: 6 }
  ];

  /* 三星阈值（由 AI 实测标定，见 _cal297.cjs） */
  var STARS = [
    [57, 164, 252], [57, 141, 209], [53, 129, 192], [103, 176, 235],
    [99, 166, 220], [95, 160, 213], [144, 202, 250], [148, 199, 241]
  ];

  /* 每关结算文案（过关弹窗，八夜各不相同） */
  var CLEAR_TEXT = [
    { t: '第一夜 · 门槛', d: '你倒下的第一捧沙，替它垫平了那道门槛。它回头看了你一眼，才走进去。' },
    { t: '第二夜 · 缓坡', d: '沙不肯站直，只肯躺着。于是你给了它一条长长的缓坡——它走得比谁都稳。' },
    { t: '第三夜 · 填坑', d: '先填坑，再谈远方。它蹲在坑边等了一会儿，像是在确认你靠不靠得住。' },
    { t: '第四夜 · 两只', d: '两只猫，同一个方向。你第一次学会：先给谁铺路，是有讲究的。' },
    { t: '第五夜 · 高台', d: '越往上越贵。你开始数着粒数过日子，也开始懂得什么时候该收手。' },
    { t: '第六夜 · 取舍', d: '倒多了挡路，倒少了够不着。这一夜你终于在倒与不倒之间，找到了那条线。' },
    { t: '第七夜 · 三张嘴', d: '三只猫同时冲你叫。你第一次觉得，手里的沙好像永远差那么一点。' },
    { t: '第八夜 · 全城', d: '灯一盏不落，全亮了。你只是把沙挪了挪，整条街就醒了过来。' }
  ];

  /* ---------- 工具 ---------- */
  function mulberry32(a) {
    a = a >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* ---------- 地形 ---------- */
  function relaxStep(st) {
    var base = st.base, sand = st.sand;
    for (var pass = 0; pass < 2; pass++) {
      for (var i = 0; i < COL; i++) {
        var c = pass === 0 ? i : COL - 1 - i;
        if (sand[c] <= 0) continue;
        var t = base[c] + sand[c];
        var best = -1, bt = t;
        if (st.flip) {
          if (c < COL - 1 && base[c + 1] + sand[c + 1] < bt) { bt = base[c + 1] + sand[c + 1]; best = c + 1; }
          if (c > 0 && base[c - 1] + sand[c - 1] < bt) { bt = base[c - 1] + sand[c - 1]; best = c - 1; }
        } else {
          if (c > 0 && base[c - 1] + sand[c - 1] < bt) { bt = base[c - 1] + sand[c - 1]; best = c - 1; }
          if (c < COL - 1 && base[c + 1] + sand[c + 1] < bt) { bt = base[c + 1] + sand[c + 1]; best = c + 1; }
        }
        if (best >= 0 && t - bt >= 2) { sand[c]--; sand[best]++; st.flip = !st.flip; return true; }
      }
    }
    return false;
  }
  function relaxAll(st) {
    var g = 0;
    while (relaxStep(st) && g++ < 20000) { }
    return g;
  }

  /* ---------- 关卡几何生成 ---------- */
  function tryBuild(cfg, rng) {
    var base = new Array(COL);
    for (var i = 0; i < COL; i++) base[i] = STREET;

    /* 分区放置：每区一座楼，保证 nb 座且互不相邻（区之间必有 ≥2 格街道） */
    var blocks = [];
    var zoneW = (COL - 4) / cfg.nb;
    for (var b = 0; b < cfg.nb; b++) {
      var wCap = Math.max(2, Math.min(cfg.wmax, Math.floor(zoneW - 2)));
      var w = 2 + Math.floor(rng() * (wCap - 1));
      if (w < 2) w = 2;
      var zx = 2 + Math.floor(b * zoneW);
      var slackX = Math.max(0, Math.floor(zoneW - w - 1));
      var x = zx + Math.floor(rng() * (slackX + 1));
      if (x < 1) x = 1;
      if (x + w > COL - 2) x = COL - 2 - w;
      var bad = false;
      for (var k = 0; k < blocks.length; k++) {
        var o = blocks[k];
        if (x < o.x + o.w + 1 && o.x < x + w + 1) { bad = true; break; }
      }
      if (bad) continue;
      var h = cfg.hb[0] + Math.floor(rng() * (cfg.hb[1] - cfg.hb[0] + 1));
      blocks.push({ x: x, w: w, h: h });
    }
    if (blocks.length < Math.max(2, cfg.cats + 1)) return null;
    blocks.sort(function (a, c) { return a.x - c.x; });
    for (var bi = 0; bi < blocks.length; bi++) {
      var bb = blocks[bi];
      for (var c2 = bb.x; c2 < bb.x + bb.w; c2++) base[c2] = bb.h;
    }

    /* 坑：在足够长的街道段里挖 1–2 格到底 */
    var pits = [];
    for (var p = 0; p < cfg.np; p++) {
      var tries = 0, px = -1;
      while (tries++ < 40) {
        var cand = 2 + Math.floor(rng() * (COL - 4));
        var ok = (base[cand] === STREET && base[cand - 1] === STREET && base[cand + 1] === STREET);
        if (!ok) continue;
        var dup = false;
        for (var q = 0; q < pits.length; q++) if (Math.abs(pits[q] - cand) < 4) dup = true;
        if (dup) continue;
        px = cand; break;
      }
      if (px < 0) continue;
      base[px] = 0; pits.push(px);
    }

    /* 街道列（猫的出发点候选） */
    var street = [];
    for (var s = 0; s < COL; s++) if (base[s] === STREET) street.push(s);
    if (street.length < cfg.cats + 1) return null;

    /* 猫出发点：在街道列里均匀铺开 */
    var starts = [];
    for (var ci = 0; ci < cfg.cats; ci++) {
      var idx = Math.floor((ci + 0.5) / cfg.cats * street.length);
      idx = clamp(idx, 0, street.length - 1);
      var sc = street[idx];
      var clash = false;
      for (var z = 0; z < starts.length; z++) if (Math.abs(starts[z] - sc) < 2) clash = true;
      if (clash) return null;
      starts.push(sc);
    }

    /* 家：不同建筑顶部，且与出发点有足够距离（逐个尝试所有未用建筑） */
    var homes = [], usedB = [];
    var md = cfg.md || 7;
    for (var hi = 0; hi < cfg.cats; hi++) {
      var start = Math.floor((hi * 2 + 1) * blocks.length / (cfg.cats * 2));
      var picked = -1;
      for (var off = 0; off < blocks.length; off++) {
        var bidx = (start + off) % blocks.length;
        if (usedB.indexOf(bidx) >= 0) continue;
        var bl = blocks[bidx];
        var hc = bl.x + Math.floor(bl.w / 2);
        if (Math.abs(hc - starts[hi]) >= md) { picked = bidx; break; }
      }
      if (picked < 0) return null;
      usedB.push(picked);
      var bl2h = blocks[picked];
      homes.push({
        b: picked, c0: bl2h.x, c1: bl2h.x + bl2h.w - 1, y: bl2h.h,
        c: bl2h.x + Math.floor(bl2h.w / 2)
      });
    }

    /* 窗（静态，用于「揭示」） */
    var wins = [];
    for (var wi = 0; wi < blocks.length; wi++) {
      var bk = blocks[wi];
      for (var wc = bk.x; wc < bk.x + bk.w; wc++) {
        for (var wr = 1; wr < bk.h; wr++) {
          if ((wc * 7 + wr * 13 + wi * 5) % 5 < 3) wins.push({ c: wc, r: wr });
        }
      }
    }
    /* 街边小物（微极繁·城市边角料） */
    var props = [];
    var kinds = [0, 1, 2, 3, 4, 5];
    for (var pc = 0; pc < COL; pc++) {
      if (base[pc] !== STREET) continue;
      if ((pc * 11 + 3) % 4 === 0) props.push({ t: kinds[(pc * 5) % kinds.length], c: pc, r: base[pc] });
    }
    for (var pb = 0; pb < blocks.length; pb++) {
      var bl2 = blocks[pb];
      if ((pb * 3) % 2 === 0) props.push({ t: 6, c: bl2.x + (bl2.w > 2 ? 1 : 0), r: bl2.h });
      if (bl2.w >= 4) props.push({ t: 4, c: bl2.x + bl2.w - 1, r: bl2.h });
    }

    /* 地灯：所有街道列，猫经过即点亮 */
    var lamps = new Array(COL);
    for (var lc = 0; lc < COL; lc++) lamps[lc] = (base[lc] === STREET) ? 1 : 0;

    return {
      base: base, blocks: blocks, pits: pits, wins: wins, props: props,
      lamps: lamps, starts: starts, homes: homes
    };
  }

  /* ---------- 运行时状态 ---------- */
  function makeState(lv, geo, seed) {
    var st = {
      lv: lv, seed: seed, STREET: STREET,
      base: geo.base.slice(),
      sand: new Array(COL).fill(0),
      blocks: geo.blocks, pits: geo.pits, wins: geo.wins, props: geo.props,
      lamps: geo.lamps.slice(), lampsLit: new Array(COL).fill(0),
      litCount: 0,
      homes: geo.homes, starts: geo.starts,
      cats: [],
      grains: [], parts: [],
      sandMax: 0, sandBase: 0, sandLeft: 0, poured: 0,
      cursor: geo.starts[0],
      /* 落沙：pourReq = 点一下落一格（立即）；pouring = 按住连倒（带起速） */
      pouring: false, shoveling: false,
      pourReq: 0, shovelReq: 0,
      pourHoldT: 0, shovelHoldT: 0,
      pourAcc: 0, shovelAcc: 0,
      time: 0, over: false, flip: false,
      clearK: 0,               /* 过关演出的暖光进度 0→1 */
      finalScore: 0,           /* 过关瞬间冻结的分数（演出点灯不再影响） */
      events: []
    };
    for (var i = 0; i < geo.starts.length; i++) {
      var hm = geo.homes[i];
      st.cats.push({
        c: geo.starts[i], r: geo.base[geo.starts[i]],
        c0: hm.c0, c1: hm.c1, y: hm.y,
        state: 'walk', stepT: CAT_STEP, meowT: 0, home: false, face: 1,
        wob: 0, purr: 0
      });
    }
    return st;
  }

  function ev(st, type, a, b) { st.events.push({ t: type, a: a, b: b }); }
  function top(st, c) { return st.base[c] + st.sand[c]; }

  /* ---------- 落沙 / 铲沙 ---------- */
  function canPour(st, c) { return c >= 0 && c < COL && st.sandLeft > 0 && top(st, c) < ROW; }

  function spawnGrain(st, c) {
    if (!canPour(st, c)) return false;
    st.sandLeft--; st.poured++;
    st.grains.push({
      c: c, x: (c + 0.5) * CELL + (Math.random() - 0.5) * 12,
      y: -8, v: G_V0, lc: c
    });
    return true;
  }

  function pourInstant(st, c) {
    if (!canPour(st, c)) return false;
    st.sandLeft--; st.poured++;
    st.sand[c]++;
    relaxAll(st);
    ev(st, 'land', c, top(st, c));
    return true;
  }

  function shovelAt(st, c) {
    if (c < 0 || c >= COL) return false;
    if (st.sand[c] <= 0) return false;
    st.sand[c]--; st.sandLeft++;
    relaxAll(st);
    ev(st, 'shovel', c, top(st, c));
    return true;
  }

  /* 点一下 = 落一格（UI 调这个，不走加速度） */
  function tapPour(st, c) { st.pourReq++; if (typeof c === 'number') st.cursor = c; }
  function tapShovel(st, c) { st.shovelReq++; if (typeof c === 'number') st.cursor = c; }

  /* ---------- 猫 ---------- */
  function updateCat(st, cat, dt) {
    if (cat.home) { cat.r = Math.max(cat.y, top(st, cat.c)); return; }
    cat.r = top(st, cat.c);
    if (cat.c >= cat.c0 && cat.c <= cat.c1 && Math.abs(cat.r - cat.y) <= 1) {
      cat.home = true; cat.state = 'home'; cat.purr = 1.2;
      st.sandLeft += REFUND; st.sandMax += REFUND;   /* 充电宝：分母同步，不稀释效率分 */
      ev(st, 'home', cat.c, cat.y);
      return;
    }
    var dir = cat.c < cat.c0 ? 1 : (cat.c > cat.c1 ? -1 : 0);
    cat.stepT -= dt;
    if (cat.stepT > 0) return;
    cat.stepT = CAT_STEP;
    if (dir === 0) {
      cat.state = 'wait';
      cat.meowT -= CAT_STEP;
      if (cat.meowT <= 0) { cat.meowT = MEOW_CD; ev(st, 'meow', cat.c, cat.r); }
      return;
    }
    var nc = cat.c + dir;
    if (nc < 0 || nc >= COL) { cat.state = 'wait'; return; }
    if (Math.abs(top(st, nc) - top(st, cat.c)) <= 1) {
      cat.face = dir; cat.c = nc; cat.r = top(st, nc); cat.state = 'walk';
      if (st.lamps[nc] && !st.lampsLit[nc]) {
        st.lampsLit[nc] = 1; st.litCount++;
        ev(st, 'lamp', nc, cat.r);
      }
    } else {
      if (cat.state !== 'wait') { cat.state = 'wait'; cat.meowT = 0.35; }
      cat.meowT -= CAT_STEP;
      if (cat.meowT <= 0) { cat.meowT = MEOW_CD; ev(st, 'meow', cat.c, cat.r); }
    }
  }

  function allHome(st) {
    for (var i = 0; i < st.cats.length; i++) if (!st.cats[i].home) return false;
    return true;
  }
  function homesCount(st) {
    var n = 0; for (var i = 0; i < st.cats.length; i++) if (st.cats[i].home) n++;
    return n;
  }

  /* ---------- 主步进 ---------- */
  function step(st, dt) {
    if (!(dt > 0)) dt = 0;
    if (dt > 0.05) dt = 0.05;
    st.time += dt;

    if (!st.over) {
      /* ① 点一下 = 一格（立即结算，手感确定） */
      while (st.pourReq > 0) {
        st.pourReq--;
        if (!pourInstant(st, st.cursor)) { st.pourReq = 0; break; }
      }
      while (st.shovelReq > 0) {
        st.shovelReq--;
        if (!shovelAt(st, st.cursor)) { st.shovelReq = 0; break; }
      }
      /* ② 按住 = 连倒（先停顿 HOLD_DELAY，再起速爬到满速） */
      if (st.pouring) {
        st.pourHoldT += dt;
        if (st.pourHoldT >= HOLD_DELAY) {
          var k = clamp((st.pourHoldT - HOLD_DELAY) / RAMP_T, 0, 1);
          st.pourAcc += dt * (POUR_RATE_MIN + (POUR_RATE_MAX - POUR_RATE_MIN) * k);
          while (st.pourAcc >= 1) { st.pourAcc -= 1; if (!pourInstant(st, st.cursor)) break; }
        }
      } else { st.pourHoldT = 0; st.pourAcc = 0; }
      if (st.shoveling) {
        st.shovelHoldT += dt;
        if (st.shovelHoldT >= HOLD_DELAY) {
          var k2 = clamp((st.shovelHoldT - HOLD_DELAY) / RAMP_T, 0, 1);
          st.shovelAcc += dt * (SHOVEL_RATE_MIN + (SHOVEL_RATE_MAX - SHOVEL_RATE_MIN) * k2);
          while (st.shovelAcc >= 1) { st.shovelAcc -= 1; if (!shovelAt(st, st.cursor)) break; }
        }
      } else { st.shovelHoldT = 0; st.shovelAcc = 0; }
    } else {
      st.pourReq = 0; st.shovelReq = 0;
      st.pouring = false; st.shoveling = false;
    }

    /* 下落沙粒 */
    for (var i = st.grains.length - 1; i >= 0; i--) {
      var g = st.grains[i];
      g.v = Math.min(G_VMAX, g.v + G_G * dt);
      g.y += g.v * dt;
      if (top(st, g.c) >= ROW) {
        var alt = -1, at = 1e9;
        for (var d = 1; d <= 3; d++) {
          if (g.c - d >= 0 && top(st, g.c - d) < at) { at = top(st, g.c - d); alt = g.c - d; }
          if (g.c + d < COL && top(st, g.c + d) < at) { at = top(st, g.c + d); alt = g.c + d; }
        }
        if (alt >= 0 && at < ROW) g.c = alt;
        else { st.grains.splice(i, 1); st.sandLeft++; st.poured--; continue; }
      }
      var land = H - top(st, g.c) * CELL;
      if (g.y >= land) {
        st.sand[g.c]++;
        st.grains.splice(i, 1);
        ev(st, 'land', g.c, top(st, g.c));
        for (var q = 0; q < 3; q++) {
          st.parts.push({
            x: g.x, y: land, vx: (Math.random() - 0.5) * 70, vy: -Math.random() * 60,
            life: 0.42, max: 0.42, r: 1.4 + Math.random() * 1.6
          });
        }
      }
    }

    /* 休止角松弛 */
    for (var k3 = 0; k3 < RELAX_PER_FRAME; k3++) if (!relaxStep(st)) break;

    /* 粒子 */
    for (var p = st.parts.length - 1; p >= 0; p--) {
      var pa = st.parts[p];
      pa.life -= dt;
      if (pa.life <= 0) { st.parts.splice(p, 1); continue; }
      pa.vy += 220 * dt;
      pa.x += pa.vx * dt; pa.y += pa.vy * dt;
    }

    /* 猫 */
    for (var ci = 0; ci < st.cats.length; ci++) updateCat(st, st.cats[ci], dt);

    if (!st.over && allHome(st)) {
      st.over = true;
      st.finalScore = score(st);      /* 冻结：演出点灯不再改变分数 */
      ev(st, 'clear');
    }
  }

  /* ---------- 计分 ---------- */
  function score(st) {
    if (st.over && st.finalScore) return st.finalScore;
    var n = st.cats.length, home = homesCount(st);
    var ratio = n ? home / n : 0;                       /* 完成度：不操作 = 0 */
    var lampPt = Math.round(st.litCount * LAMP_PT * ratio);
    var denom = st.sandBase > 0 ? st.sandBase : 1;
    var eff = clamp(st.sandLeft / denom, 0, 1);
    var sandPt = Math.round(SAND_W * eff * ratio);      /* 溢价分必须随完成度缩放 */
    return home * CAT_PT + lampPt + sandPt;
  }
  function starThresholds(lv) { return STARS[lv] || [1, 1, 1]; }
  function starsOf(lv, sc) {
    var s = starThresholds(lv), n = 0;
    for (var i = 0; i < 3; i++) if (sc >= s[i]) n++;
    return n;
  }
  function clearText(lv) { return CLEAR_TEXT[lv] || CLEAR_TEXT[0]; }

  /* ---------- 求解器（关卡标定 + strong AI） ---------- */
  function scratch(st) {
    var s2 = {
      base: st.base.slice(), sand: st.sand.slice(), lamps: st.lamps,
      lampsLit: st.lampsLit.slice(), litCount: st.litCount, cats: [], flip: false, events: []
    };
    for (var i = 0; i < st.cats.length; i++) {
      var c0 = st.cats[i];
      s2.cats.push({
        c: c0.c, r: c0.r, c0: c0.c0, c1: c0.c1, y: c0.y,
        state: c0.state, stepT: c0.stepT, meowT: c0.meowT, home: c0.home, face: c0.face
      });
    }
    return s2;
  }

  function choosePour(s2, cat) {
    var dir = cat.c < cat.c0 ? 1 : (cat.c > cat.c1 ? -1 : 0);
    if (dir === 0) {
      var t = top(s2, cat.c);
      if (t > cat.y + 1) return -2;   /* 需要铲 */
      if (t < cat.y - 1) return cat.c;
      return -1;
    }
    var nc = cat.c + dir;
    if (nc < 0 || nc >= COL) return -1;
    var tc = top(s2, cat.c), tn = top(s2, nc);
    if (tn > tc + 1) return cat.c;
    if (tn < tc - 1) return nc;
    return -1;
  }

  function settleCats(s2, maxSteps) {
    var dt = 1 / 60;
    for (var i = 0; i < maxSteps; i++) {
      var moving = false;
      for (var c = 0; c < s2.cats.length; c++) {
        var cat = s2.cats[c];
        if (cat.home) continue;
        if (cat.state !== 'wait' || cat.stepT > 0) moving = true;
        updateCat(s2, cat, dt);
      }
      if (allHome(s2)) return true;
      if (!moving) {
        var anyWait = false;
        for (var c2 = 0; c2 < s2.cats.length; c2++) if (!s2.cats[c2].home) anyWait = true;
        if (!anyWait) return true;
        if (i > 6) return false;
      }
    }
    return allHome(s2);
  }

  function planSolve(st, budget) {
    var s2 = scratch(st);
    var used = 0;
    settleCats(s2, 400);
    if (allHome(s2)) return { ok: true, grains: 0, pours: [] };
    var pours = [];
    for (var it = 0; it < budget; it++) {
      var act = -1, shovel = false;
      for (var ci = 0; ci < s2.cats.length; ci++) {
        var cat = s2.cats[ci];
        if (cat.home) continue;
        var p = choosePour(s2, cat);
        if (p === -2) { act = cat.c; shovel = true; break; }
        if (p >= 0) { act = p; shovel = false; break; }
      }
      if (act < 0) break;
      if (shovel) {
        if (s2.sand[act] <= 0) break;
        s2.sand[act]--; used--; relaxAll(s2);
      } else {
        if (top(s2, act) >= ROW) break;
        s2.sand[act]++; used++; pours.push(act); relaxAll(s2);
      }
      settleCats(s2, 400);
      if (allHome(s2)) return { ok: true, grains: used, pours: pours };
    }
    return { ok: allHome(s2), grains: used, pours: pours };
  }

  /* ---------- 关卡组装（带可解性标定） ---------- */
  function genLevel(lv, seed) {
    var cfg = LEVELS[lv];
    var fallback = null, fbScore = 1e9;
    var mid = (cfg.gmin + cfg.gmax) / 2;
    for (var attempt = 0; attempt < 260; attempt++) {
      var rng = mulberry32((seed >>> 0) + attempt * 7919 + lv * 104729);
      var geo = tryBuild(cfg, rng);
      if (!geo) continue;
      var st = makeState(lv, geo, seed);
      /* noop 必须 0 分：初始地形必须拦住所有猫 */
      var s0 = scratch(st);
      settleCats(s0, 900);
      if (allHome(s0)) continue;
      var plan = planSolve(st, 420);
      if (!plan.ok) continue;
      if (plan.grains < cfg.gmin || plan.grains > cfg.gmax) {
        var d = Math.abs(plan.grains - mid);
        if (d < fbScore) { fbScore = d; fallback = { geo: geo, grains: plan.grains }; }
        continue;
      }
      geo.par = plan.grains;
      geo.quota = Math.max(6, Math.ceil(plan.grains * cfg.slack));
      geo.pours = plan.pours;
      return geo;
    }
    if (fallback) {
      fallback.geo.par = fallback.grains;
      fallback.geo.quota = Math.max(6, Math.ceil(fallback.grains * cfg.slack));
      return fallback.geo;
    }
    /* 极端兜底：平地 + 一座楼 */
    var base = new Array(COL).fill(STREET);
    var bh = 7, bx = COL - 8, bw = 3;
    for (var c = bx; c < bx + bw; c++) base[c] = bh;
    var geo2 = {
      base: base, blocks: [{ x: bx, w: bw, h: bh }], pits: [], wins: [], props: [],
      lamps: new Array(COL).fill(0), starts: [2], homes: [{ b: 0, c0: bx, c1: bx + bw - 1, y: bh, c: bx + 1 }],
      par: 10, quota: 18
    };
    for (var l = 0; l < COL; l++) geo2.lamps[l] = (base[l] === STREET) ? 1 : 0;
    return geo2;
  }

  /* ---------- AI 对照 ---------- */
  function runAI(st, kind, maxSec) {
    var t = 0, dt = 1 / 60, guard = 0;
    var rnd = mulberry32(99991 + st.lv * 31);
    var plan = null, pi = 0;
    if (kind === 'strong') { plan = planSolve(st, 420); pi = 0; }
    while (!st.over && t < (maxSec || 120) && guard++ < 200000) {
      if (kind === 'strong') {
        if (plan && pi < plan.pours.length && st.grains.length === 0) {
          pourInstant(st, plan.pours[pi++]);
        }
      } else if (kind === 'random') {
        if (Math.floor(t * 3) !== Math.floor((t - dt) * 3) && st.sandLeft > 0) {
          var c = Math.floor(rnd() * COL);
          for (var q = 0; q < 3; q++) pourInstant(st, (c + q) % COL);
        }
      } else if (kind === 'mid') {
        /* 新手直觉：猫卡在哪就往哪一列倒沙（不看坡度、不做规划） */
        if (Math.floor(t * 4) !== Math.floor((t - dt) * 4)) {
          for (var mi = 0; mi < st.cats.length; mi++) {
            var mc = st.cats[mi];
            if (mc.home) continue;
            pourInstant(st, clamp(mc.c + (rnd() < 0.5 ? 0 : (mc.c < mc.c0 ? 1 : -1)), 0, COL - 1));
            break;
          }
        }
      }
      step(st, dt);
      t += dt;
    }
    return st;
  }

  return {
    COL: COL, ROW: ROW, CELL: CELL, W: W, H: H, STREET: STREET, MAXH: MAXH,
    CAT_STEP: CAT_STEP, POUR_RATE: POUR_RATE, SHOVEL_RATE: SHOVEL_RATE,
    HOLD_DELAY: HOLD_DELAY, RAMP_T: RAMP_T,
    POUR_RATE_MIN: POUR_RATE_MIN, POUR_RATE_MAX: POUR_RATE_MAX,
    RELAX_PER_FRAME: RELAX_PER_FRAME,
    REFUND: REFUND, CAT_PT: CAT_PT, LAMP_PT: LAMP_PT, SAND_W: SAND_W,
    LEVELS: LEVELS, STARS: STARS, CLEAR_TEXT: CLEAR_TEXT,
    mulberry32: mulberry32, clamp: clamp,
    top: top, relaxStep: relaxStep, relaxAll: relaxAll,
    tryBuild: tryBuild, makeState: makeState, genLevel: genLevel,
    spawnGrain: spawnGrain, pourInstant: pourInstant, shovelAt: shovelAt, canPour: canPour,
    tapPour: tapPour, tapShovel: tapShovel,
    updateCat: updateCat, settleCats: settleCats, planSolve: planSolve, choosePour: choosePour,
    allHome: allHome, homesCount: homesCount, step: step,
    score: score, starsOf: starsOf, starThresholds: starThresholds, clearText: clearText,
    runAI: runAI, scratch: scratch
  };
});
