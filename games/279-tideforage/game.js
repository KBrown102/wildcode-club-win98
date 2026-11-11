/* 赶海 · 潮退的一程 — 纯逻辑层
 * 零 DOM / 零 Canvas 依赖，Node 可直接 require 做冒烟测试。
 * 导出到 globalThis.TideForage
 */
(function (g) {
  'use strict';

  var W = 480, H = 800;
  var SHORE_Y = 686;   // y >= SHORE_Y 视为岸上：安全 + 自动卸货
  var HIGH_Y = 724;    // 涨满时水线
  var SEA_TOP = -60;
  var PICK_R = 26;     // 拾取半径
  var PLAYER_R = 12;
  var BASE_SPEED = 152;
  var BREATH_DELAY = 0.45;   // 静止多久进入「屏息」
  var COMBO_WINDOW = 3.5;
  var WET_H = 46;            // 湿滩厚度（渲染用）

  var SPECIES = [
    { id: 'pebble',     name: '卵石',   tier: 1, score: 6,   color: '#8C8577', flees: false, poem: '被浪磨圆了，就不硌手了。' },
    { id: 'clam',       name: '蛤蜊',   tier: 1, score: 10,  color: '#B9A88A', flees: false, poem: '闭着嘴，含着一口没说出的海。' },
    { id: 'snail',      name: '海螺',   tier: 1, score: 12,  color: '#C98C4E', flees: false, poem: '把浪声卷进去，就带得走了。' },
    { id: 'sanddollar', name: '沙钱',   tier: 1, score: 14,  color: '#E8E2D4', flees: false, poem: '一枚被海花掉的硬币。' },
    { id: 'hermit',     name: '寄居蟹', tier: 2, score: 30,  color: '#C96A3E', flees: true, alert: 62, speed: 78,  poem: '背着别人的家，走自己的路。' },
    { id: 'crab',       name: '沙蟹',   tier: 2, score: 26,  color: '#C7452E', flees: true, alert: 70, speed: 96,  poem: '横着走，也是往前。' },
    { id: 'mudskip',    name: '弹涂鱼', tier: 2, score: 34,  color: '#6E7B4A', flees: true, alert: 88, speed: 132, poem: '在滩上跳的鱼，也算两栖的勇气。' },
    { id: 'starfish',   name: '海星',   tier: 3, score: 55,  color: '#D9A441', flees: false, poem: '落下来的时候，还是星的形状。' },
    { id: 'abalone',    name: '鲍鱼',   tier: 3, score: 62,  color: '#4E7C78', flees: false, poem: '耳朵贴上去，能听见整片海。' },
    { id: 'anemone',    name: '海葵',   tier: 3, score: 70,  color: '#B05A78', flees: true, alert: 54, speed: 40,  poem: '看着像花，其实是只等着的手。' },
    { id: 'octopus',    name: '小章鱼', tier: 4, score: 120, color: '#7A4E8C', flees: true, alert: 100, speed: 150, poem: '八只手，也只抱得住一样东西。' },
    { id: 'moonbell',   name: '月光贝', tier: 4, score: 150, color: '#CFE3EF', flees: false, poem: '它只在最低的那一潮露面。' }
  ];
  var SP_BY_ID = {};
  SPECIES.forEach(function (s) { SP_BY_ID[s.id] = s; });

  var UNLOCKS = [
    { key: 'shoes',    name: '防滑草鞋', desc: '走得更快（+18%）',      hint: '累计拾取 30 件' },
    { key: 'bucket',   name: '大号木桶', desc: '桶容量 6 → 9',          hint: '单次卸货 6 件' },
    { key: 'lantern',  name: '提灯',     desc: '深水更亮、稀客更多',    hint: '图鉴集齐 6 种' },
    { key: 'raincoat', name: '蓑衣',     desc: '每潮首卷不失物',        hint: '走到第 4 潮' }
  ];

  // ---------- 工具 ----------
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function easeOutCubic(p) { p = clamp(p, 0, 1); return 1 - Math.pow(1 - p, 3); }
  function easeInQuad(p) { p = clamp(p, 0, 1); return p * p; }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function dist(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }

  // 低潮线：潮次越高退得越远；下限 190 保证顶部 HUD 区永远是海（不会被玩家挡住）
  function lowYFor(tide) { return clamp(300 - (tide - 1) * 14, 190, 300); }
  function dursFor(tide) {
    return {
      ebb: 6.5,
      low: clamp(14 - (tide - 1) * 0.35, 9.5, 14),
      rise: clamp(13 - (tide - 1) * 0.45, 8, 13),
      sweep: 2.6
    };
  }
  function capFor(st) { return st.unlocks.bucket ? 9 : 6; }
  function speedFor(st) { return BASE_SPEED * (st.unlocks.shoes ? 1.18 : 1); }

  // ---------- 生成 ----------
  function pickTier(tide, rnd, lantern) {
    var pool;
    if (tide <= 1) pool = [1, 1, 1, 1, 2, 2];
    else if (tide === 2) pool = [1, 1, 1, 2, 2, 2];
    else if (tide <= 4) pool = [1, 1, 2, 2, 2, 3, 3];
    else if (tide <= 7) pool = [1, 1, 2, 2, 3, 3, 3, 4];
    else pool = [1, 2, 2, 3, 3, 3, 4, 4];
    if (lantern && tide >= 3) pool = pool.concat([3, 4]);
    return pool[Math.floor(rnd() * pool.length)];
  }

  function bandFor(tier, rnd) {
    var r = rnd();
    if (tier === 1) return r < 0.6 ? 'shallow' : 'mid';
    if (tier === 2) return r < 0.25 ? 'shallow' : (r < 0.85 ? 'mid' : 'deep');
    if (tier === 3) return r < 0.35 ? 'mid' : 'deep';
    return 'deep';
  }

  function speciesOfTier(tier, rnd) {
    var list = SPECIES.filter(function (s) { return s.tier === tier; });
    return list[Math.floor(rnd() * list.length)];
  }

  function bandRange(lowY, band) {
    var h = SHORE_Y - lowY;
    if (band === 'deep') return [lowY + 14, lowY + h * 0.30];
    if (band === 'mid') return [lowY + h * 0.30, lowY + h * 0.66];
    return [lowY + h * 0.66, SHORE_Y - 8];
  }

  // ---------- 主体 ----------
  function createGame(opts) {
    opts = opts || {};
    var rnd = opts.rnd || mulberry32((opts.seed == null ? 20260901 : opts.seed) | 0);

    var s = {
      W: W, H: H, SHORE_Y: SHORE_Y, HIGH_Y: HIGH_Y, PICK_R: PICK_R, WET_H: WET_H,
      SPECIES: SPECIES, UNLOCKS: UNLOCKS,
      phase: 'ebb', phaseT: 0, phaseDur: 0,
      tide: 1, waterY: HIGH_Y, lowY: lowYFor(1),
      px: 240, py: 756, pdir: 1, walkPhase: 0, moving: false,
      breathT: 0, breath: false,
      bag: [], score: 0, combo: 0, comboT: 0, mult: 1,
      items: [], spawned: 0, pickedThisTide: 0, washed: 0,
      surgeT: 0, surgeAccum: 0, surgeWarn: false, surgeWarnY: 0,
      sweptThisTide: false,
      codex: {}, unlocks: {}, best: { score: 0, tide: 0 },
      totalPicks: 0, bestTide: 0,
      running: false, over: false, time: 0,
      events: []
    };

    function ev(o) { s.events.push(o); }

    function setPhase(p) {
      s.phase = p; s.phaseT = 0; s.phaseDur = dursFor(s.tide)[p];
      ev({ type: 'phase', phase: p, tide: s.tide });
    }

    function spawnTide() {
      s.items.length = 0;
      s.lowY = lowYFor(s.tide);
      var n = clamp(9 + s.tide, 9, 20);
      var lantern = !!s.unlocks.lantern;
      for (var i = 0; i < n; i++) {
        var tier = pickTier(s.tide, rnd, lantern);
        var sp = speciesOfTier(tier, rnd);
        var band = bandFor(tier, rnd);
        var rg = bandRange(s.lowY, band);
        var x = 26 + rnd() * (W - 52);
        var y = rg[0] + rnd() * Math.max(6, rg[1] - rg[0]);
        s.items.push({
          sp: sp, x: x, y: y, hx: x, hy: y,
          state: 'idle', wob: rnd() * 6.28, born: 0
        });
      }
      s.spawned = s.items.length;
      s.pickedThisTide = 0; s.washed = 0;
      s.surgeAccum = 0; s.surgeT = 4.5; s.surgeWarn = false;
      s.sweptThisTide = false;
      ev({ type: 'spawn', n: s.spawned, tide: s.tide });
    }

    function startTide(t) {
      s.tide = t;
      s.lowY = lowYFor(t);
      s.waterY = HIGH_Y;
      if (t > s.bestTide) s.bestTide = t;
      s.sweptThisTide = false;
      s.surgeAccum = 0; s.surgeT = 4.5; s.surgeWarn = false;
      setPhase('ebb');
      spawnTide();
    }

    function reset(keepMeta) {
      s.score = 0; s.bag.length = 0; s.combo = 0; s.comboT = 0; s.mult = 1;
      s.px = 240; s.py = 756; s.breath = false; s.breathT = 0;
      s.items.length = 0; s.time = 0; s.over = false; s.running = false;
      s.totalPicksThisRun = 0;
      if (!keepMeta) { s.tide = 1; }
      startTide(1);
    }

    function checkUnlocks() {
      UNLOCKS.forEach(function (u) {
        if (s.unlocks[u.key]) return;
        var ok = false;
        if (u.key === 'shoes') ok = s.totalPicks >= 30;
        else if (u.key === 'bucket') ok = s._maxUnload >= 6;
        else if (u.key === 'lantern') ok = Object.keys(s.codex).length >= 6;
        else if (u.key === 'raincoat') ok = s.bestTide >= 4;
        if (ok) {
          s.unlocks[u.key] = true;
          ev({ type: 'unlock', key: u.key, name: u.name, desc: u.desc });
        }
      });
    }

    function gain(sp) {
      s.combo++; s.comboT = COMBO_WINDOW;
      s.mult = 1 + Math.min(s.combo - 1, 5) * 0.2;
      var got = Math.round(sp.score * s.mult);
      s.score += got;
      s.totalPicks++;
      s.pickedThisTide++;
      var isNew = !s.codex[sp.id];
      if (isNew) s.codex[sp.id] = true;
      ev({ type: 'pick', x: s.px, y: s.py, sp: sp, gain: got, mult: s.mult, combo: s.combo, isNew: isNew });
      if (isNew) ev({ type: 'discover', sp: sp });
      checkUnlocks();
    }

    function unload() {
      if (!s.bag.length) return;
      var n = s.bag.length, sum = 0, i;
      for (i = 0; i < n; i++) sum += s.bag[i].score;
      var bonus = 0;
      if (n >= 6) bonus = Math.round(sum * 0.35);
      else if (n >= 4) bonus = Math.round(sum * 0.18);
      s.score += bonus;
      if (n > (s._maxUnload || 0)) s._maxUnload = n;
      s.bag.length = 0;
      ev({ type: 'unload', n: n, sum: sum, bonus: bonus });
      checkUnlocks();
    }

    function swept() {
      var lost = null;
      var canShield = s.unlocks.raincoat && !s.sweptThisTide;
      if (s.bag.length && !canShield) {
        var idx = 0;
        for (var i = 1; i < s.bag.length; i++) if (s.bag[i].score < s.bag[idx].score) idx = i;
        lost = s.bag.splice(idx, 1)[0];
      }
      s.sweptThisTide = true;
      s.combo = 0; s.comboT = 0; s.mult = 1;
      s.py = Math.max(s.py, SHORE_Y + 58);
      s.py = clamp(s.py, 0, H - PLAYER_R - 2);
      ev({ type: 'swept', lost: lost, shielded: canShield && s.bag.length > 0 });
      // 提前收潮
      s.phase = 'sweep'; s.phaseT = 0; s.phaseDur = dursFor(s.tide).sweep;
      ev({ type: 'phase', phase: 'sweep', tide: s.tide });
    }

    function updateWater(dt) {
      var d = dursFor(s.tide);
      var lowY = s.lowY;
      if (s.phase === 'ebb') {
        var p = s.phaseT / d.ebb;
        s.waterY = HIGH_Y + (lowY - HIGH_Y) * easeOutCubic(p);
      } else if (s.phase === 'low') {
        s.waterY = lowY + Math.sin(s.phaseT * 0.9) * 3;
      } else if (s.phase === 'rise') {
        var q = clamp(s.phaseT / d.rise, 0, 1);
        s.waterY = lowY + (HIGH_Y - lowY) * easeInQuad(q) + s.surgeAccum;
        if (s.waterY > HIGH_Y) s.waterY = HIGH_Y;
        // 浪涌：涨潮期周期性突然前推
        if (s.tide >= 2) {
          s.surgeT -= dt;
          var warnLead = 0.7;
          s.surgeWarn = s.surgeT <= warnLead && s.surgeT > 0;
          s.surgeWarnY = Math.min(HIGH_Y, s.waterY + clamp(14 + s.tide * 1.4, 14, 34));
          if (s.surgeT <= 0) {
            var amp = clamp(14 + s.tide * 1.4, 14, 34);
            s.surgeAccum = Math.min(s.surgeAccum + amp, HIGH_Y - lowY);
            s.surgeT = clamp(5.2 - s.tide * 0.12, 3.4, 5.2);
            s.surgeWarn = false;
            ev({ type: 'surge', y: s.waterY });
          }
        } else {
          s.surgeWarn = false;
        }
      } else if (s.phase === 'sweep') {
        s.waterY = HIGH_Y + Math.sin(s.phaseT * 6) * 3;
      }
    }

    function updatePlayer(dt, input) {
      var dx = input.dx || 0, dy = input.dy || 0;
      var mag = Math.sqrt(dx * dx + dy * dy);
      if (mag > 1) { dx /= mag; dy /= mag; mag = 1; }
      var moving = mag > 0.15;
      s.moving = moving;
      if (moving) {
        var sp = speedFor(s);
        s.px += dx * sp * dt;
        s.py += dy * sp * dt;
        if (Math.abs(dx) > 0.2) s.pdir = dx > 0 ? 1 : -1;
        s.walkPhase += dt * 9;
        s.breathT = 0; s.breath = false;
      } else {
        s.breathT += dt;
        s.breath = s.breathT >= BREATH_DELAY;
      }
      s.px = clamp(s.px, PLAYER_R + 4, W - PLAYER_R - 4);
      s.py = clamp(s.py, 28, H - PLAYER_R - 4);
    }

    function updateItems(dt) {
      var cap = capFor(s);
      for (var i = s.items.length - 1; i >= 0; i--) {
        var it = s.items[i], sp = it.sp;
        it.born += dt;
        // 还没被潮水让出来的：静静等着；涨潮时则被冲走
        if (it.y < s.waterY - 2) {
          if (s.phase === 'rise' || s.phase === 'sweep') {
            s.items.splice(i, 1); s.washed++;
            ev({ type: 'wash', x: it.x, y: it.y, sp: sp });
          }
          continue;
        }
        var d = dist(it.x, it.y, s.px, s.py);
        if (!sp.flees) {
          if (d <= PICK_R && s.bag.length < cap) {
            s.bag.push(sp); s.items.splice(i, 1); gain(sp);
          } else if (d <= PICK_R && s.bag.length >= cap) {
            if (!it._warned) { it._warned = true; ev({ type: 'bagfull', x: it.x, y: it.y }); }
          } else it._warned = false;
          continue;
        }
        // 会逃的
        if (s.breath) {
          it.state = 'curious';
          if (d < sp.alert * 1.8) {
            var ux = (s.px - it.x) / (d || 1), uy = (s.py - it.y) / (d || 1);
            var cs = 34;
            it.x += ux * cs * dt; it.y += uy * cs * dt;
          }
          if (d <= PICK_R && s.bag.length < cap) {
            s.bag.push(sp); s.items.splice(i, 1); gain(sp);
          } else if (d <= PICK_R && s.bag.length >= cap && !it._warned) {
            it._warned = true; ev({ type: 'bagfull', x: it.x, y: it.y });
          }
        } else {
          it._warned = false;
          if (d < sp.alert) {
            it.state = 'flee';
            var ax = (it.x - s.px) / (d || 1), ay = (it.y - s.py) / (d || 1);
            it.x += ax * sp.speed * dt; it.y += ay * sp.speed * dt;
          } else {
            it.state = 'idle';
            var hx = it.hx - it.x, hy = it.hy - it.y;
            var hd = Math.sqrt(hx * hx + hy * hy);
            if (hd > 2) { it.x += (hx / hd) * 26 * dt; it.y += (hy / hd) * 26 * dt; }
          }
        }
        // 约束在滩上
        var lo = Math.min(s.waterY + 6, SHORE_Y - 6);
        it.x = clamp(it.x, 14, W - 14);
        it.y = clamp(it.y, lo, SHORE_Y - 4);
        it.hy = clamp(it.hy, Math.min(s.waterY + 8, SHORE_Y - 8), SHORE_Y - 6);
      }
    }

    function update(dt, input) {
      input = input || {};
      dt = clamp(dt, 0, 0.05);
      if (!s.running || s.over) return s.events;
      s.time += dt;

      var d = dursFor(s.tide);
      s.phaseT += dt;
      updateWater(dt);
      updatePlayer(dt, input);
      updateItems(dt);

      // 桶满不再拾取；回岸自动卸货
      if (s.py >= SHORE_Y && s.bag.length) unload();

      // 被浪卷到
      if (s.py < s.waterY + 2 && s.phase !== 'sweep') swept();

      // 连击窗口
      if (s.comboT > 0) { s.comboT -= dt; if (s.comboT <= 0) { s.combo = 0; s.mult = 1; } }

      // 阶段推进
      if (s.phaseT >= s.phaseDur) {
        if (s.phase === 'ebb') setPhase('low');
        else if (s.phase === 'low') setPhase('rise');
        else if (s.phase === 'rise') setPhase('sweep');
        else {
          s.tide++;
          startTide(s.tide);
        }
      }
      return s.events;
    }

    function finish() {
      s.over = true; s.running = false;
      if (s.score > s.best.score) s.best.score = s.score;
      if (s.bestTide > s.best.tide) s.best.tide = s.bestTide;
      ev({ type: 'over', score: s.score, tide: s.tide, newBest: s.score >= s.best.score });
    }

    function serialize() {
      return {
        codex: s.codex, unlocks: s.unlocks, best: s.best,
        totalPicks: s.totalPicks, bestTide: s.bestTide, maxUnload: s._maxUnload || 0
      };
    }
    function hydrate(d) {
      if (!d) return;
      s.codex = d.codex || {}; s.unlocks = d.unlocks || {};
      s.best = d.best || { score: 0, tide: 0 };
      s.totalPicks = d.totalPicks || 0; s.bestTide = d.bestTide || 0;
      s._maxUnload = d.maxUnload || 0;
    }

    function drain() { var e = s.events; s.events = []; return e; }

    // 初始：先起潮，但不跑
    startTide(1);
    s.running = false;

    return {
      s: s,
      update: update,
      drain: drain,
      reset: function (keepMeta) { reset(keepMeta); s.running = true; },
      start: function () { s.running = true; s.over = false; },
      finish: finish,
      serialize: serialize,
      hydrate: hydrate,
      capNow: function () { return capFor(s); },
      speedNow: function () { return speedFor(s); },
      phaseLeft: function () { return Math.max(0, s.phaseDur - s.phaseT); },
      phaseP: function () { return s.phaseDur > 0 ? clamp(s.phaseT / s.phaseDur, 0, 1) : 0; },
      // 测试辅助
      _debug: { startTide: startTide, swept: swept, unload: unload, gain: gain }
    };
  }

  g.TideForage = {
    createGame: createGame,
    SPECIES: SPECIES,
    SP_BY_ID: SP_BY_ID,
    UNLOCKS: UNLOCKS,
    W: W, H: H, SHORE_Y: SHORE_Y, HIGH_Y: HIGH_Y, PICK_R: PICK_R, PLAYER_R: PLAYER_R,
    lowYFor: lowYFor, dursFor: dursFor, mulberry32: mulberry32
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
