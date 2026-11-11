/* 238 守塔 · 一路挡住 —— 纯逻辑层（UMD，可在 Node 直接 require 做测试）
   坐标单位＝格（cell），敌人沿 path 的格中心行走；渲染层再乘 CELL 换成像素。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TD = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var COLS = 13, ROWS = 9;

  // ── 塔数据（三级成长） ────────────────────────────────────────────
  var TOWERS = {
    arrow: {
      name: '箭塔', cost: 60, color: '#7cc4ff', desc: '单体速射，通用',
      lv: [
        { dmg: 9, cd: 0.42, range: 2.7, shotSpeed: 12 },
        { dmg: 15, cd: 0.38, range: 3.0, shotSpeed: 13 },
        { dmg: 23, cd: 0.33, range: 3.4, shotSpeed: 14 }
      ]
    },
    cannon: {
      name: '炮塔', cost: 110, color: '#ffb26b', desc: '范围溅射，慢',
      lv: [
        { dmg: 24, cd: 1.15, range: 2.5, shotSpeed: 7.5, splash: 0.85 },
        { dmg: 40, cd: 1.05, range: 2.7, shotSpeed: 8, splash: 1.0 },
        { dmg: 62, cd: 0.95, range: 3.0, shotSpeed: 8.5, splash: 1.2 }
      ]
    },
    frost: {
      name: '霜塔', cost: 90, color: '#9fe8ff', desc: '减速，怕快的就靠它',
      lv: [
        { dmg: 5, cd: 0.75, range: 2.3, shotSpeed: 14, slow: 0.45, slowDur: 1.4 },
        { dmg: 8, cd: 0.68, range: 2.5, shotSpeed: 15, slow: 0.55, slowDur: 1.6 },
        { dmg: 12, cd: 0.60, range: 2.8, shotSpeed: 16, slow: 0.62, slowDur: 1.9 }
      ]
    }
  };

  // ── 敌人数据 ────────────────────────────────────────────────────
  var ENEMIES = {
    grunt: { name: '小卒', hpMul: 1.0, speed: 1.12, r: 0.30, gold: 7, leak: 1, armor: 0, color: '#e0a86a' },
    runner: { name: '快步', hpMul: 0.60, speed: 2.05, r: 0.24, gold: 9, leak: 1, armor: 0, color: '#8fd6a0' },
    tank: { name: '重甲', hpMul: 2.9, speed: 0.66, r: 0.38, gold: 18, leak: 2, armor: 4, color: '#9aa7c7' },
    boss: { name: '首领', hpMul: 11, speed: 0.72, r: 0.50, gold: 70, leak: 5, armor: 7, color: '#e2708a' }
  };

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* 生成一条从左边缘走到右边缘的简单折线路径：
     若干条水平段（行各不相同、相差≥2）用竖直段在严格递增的转角列相连，
     数学上保证不自交、必然连通，且两侧总留出可建造的空地。 */
  function makePath(seed) {
    var rnd = mulberry32(seed >>> 0);
    var k = 3 + Math.floor(rnd() * 3);           // 3~5 条水平段
    var turns = [], lo = 2, i;
    for (i = 0; i < k - 1; i++) {
      var remain = k - 1 - i;
      var hi = COLS - 3 - (remain - 1) * 2;
      if (hi < lo) hi = lo;
      var c = lo + Math.floor(rnd() * (hi - lo + 1));
      turns.push(c); lo = c + 2;
    }
    var rows = [1 + Math.floor(rnd() * (ROWS - 2))];
    for (i = 1; i < k; i++) {
      var prev = rows[i - 1], nr = prev, tries = 0;
      do { nr = Math.floor(rnd() * ROWS); tries++; } while (Math.abs(nr - prev) < 2 && tries < 60);
      if (Math.abs(nr - prev) < 2) nr = prev + 2 <= ROWS - 1 ? prev + 2 : prev - 2;
      rows.push(nr);
    }
    var cells = [];
    function push(x, y) {
      var last = cells[cells.length - 1];
      if (!last || last.x !== x || last.y !== y) cells.push({ x: x, y: y });
    }
    var cx = 0, cy = rows[0];
    push(cx, cy);
    for (i = 0; i < k; i++) {
      var targetCol = (i < k - 1) ? turns[i] : COLS - 1;
      while (cx < targetCol) { cx++; push(cx, cy); }
      if (i < k - 1) {
        var nr2 = rows[i + 1], step = nr2 > cy ? 1 : -1;
        while (cy !== nr2) { cy += step; push(cx, cy); }
      }
    }
    return cells;
  }

  function stat(type, lvl) { return TOWERS[type].lv[Math.max(0, Math.min(2, lvl - 1))]; }
  function upCost(type, lvl) { return Math.round(TOWERS[type].cost * (lvl === 1 ? 0.9 : 1.5)); }

  function Game(seed) { this.init(seed); }

  Game.prototype.init = function (seed) {
    if (seed == null) seed = (Date.now() % 1000000) >>> 0;
    this.seed = seed >>> 0;
    this.rnd = mulberry32(this.seed ^ 0x9e3779b9);
    this.path = makePath(this.seed);
    this.blocked = {};
    for (var i = 0; i < this.path.length; i++) this.blocked[this.path[i].y * COLS + this.path[i].x] = 1;
    this.towers = []; this.enemies = []; this.shots = []; this.events = [];
    this.gold = 180; this.lives = 20; this.wave = 0; this.kills = 0; this.leaked = 0;
    this.state = 'rest';       // rest（备战/间歇） | wave（出怪中） | over
    this.restT = 12;           // 开局备战时间
    this.spawnQueue = []; this.spawnT = 0; this.spawnGap = 0.9;
    this.time = 0; this._id = 1;
    return this;
  };

  Game.prototype.baseHp = function (w) { return Math.round(26 * Math.pow(1.15, w - 1) + w * 4); };
  Game.prototype.speedMul = function () { return 1 + Math.min(0.5, 0.012 * (this.wave - 1)); };

  Game.prototype.waveList = function (w) {
    var n = 5 + Math.floor(w * 1.3), out = [], i;
    for (i = 0; i < n; i++) {
      var r = this.rnd(), t = 'grunt';
      if (w >= 3 && r < 0.28) t = 'runner';
      else if (w >= 6 && r > 0.82) t = 'tank';
      out.push(t);
    }
    if (w % 5 === 0) out.push('boss');
    return out;
  };

  Game.prototype.posAt = function (t) {
    var n = this.path.length, i = Math.floor(t), f = t - i;
    if (i < 0) { i = 0; f = 0; }
    if (i > n - 1) { i = n - 1; f = 0; }
    var a = this.path[i], b = this.path[Math.min(i + 1, n - 1)];
    return { x: a.x + (b.x - a.x) * f + 0.5, y: a.y + (b.y - a.y) * f + 0.5 };
  };

  Game.prototype.spawn = function (type) {
    var def = ENEMIES[type];
    var hp = Math.round(this.baseHp(this.wave) * def.hpMul);
    var p = this.posAt(0);
    this.enemies.push({
      id: this._id++, type: type, def: def, hp: hp, maxHp: hp,
      t: 0, x: p.x, y: p.y, slow: 0, slowT: 0, hitT: 0, dead: false
    });
  };

  Game.prototype.canPlace = function (cx, cy) {
    if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return false;
    if (this.blocked[cy * COLS + cx]) return false;
    return !this.towerAt(cx, cy);
  };

  Game.prototype.towerAt = function (cx, cy) {
    for (var i = 0; i < this.towers.length; i++)
      if (this.towers[i].cx === cx && this.towers[i].cy === cy) return this.towers[i];
    return null;
  };

  Game.prototype.place = function (type, cx, cy) {
    if (this.state === 'over' || !TOWERS[type]) return false;
    if (!this.canPlace(cx, cy)) return false;
    var cost = TOWERS[type].cost;
    if (this.gold < cost) return false;
    this.gold -= cost;
    var tw = { type: type, cx: cx, cy: cy, lvl: 1, cd: 0, invested: cost, aim: -Math.PI / 2, flash: 0, target: 0 };
    this.towers.push(tw);
    this.events.push({ t: 'place', x: cx + 0.5, y: cy + 0.5, type: type });
    return tw;
  };

  Game.prototype.upgrade = function (tw) {
    if (!tw || tw.lvl >= 3 || this.state === 'over') return false;
    var cost = upCost(tw.type, tw.lvl);
    if (this.gold < cost) return false;
    this.gold -= cost; tw.lvl++; tw.invested += cost;
    this.events.push({ t: 'up', x: tw.cx + 0.5, y: tw.cy + 0.5, lvl: tw.lvl });
    return true;
  };

  Game.prototype.sell = function (tw) {
    var i = this.towers.indexOf(tw);
    if (i < 0) return 0;
    var back = Math.floor(tw.invested * 0.6);
    this.gold += back; this.towers.splice(i, 1);
    this.events.push({ t: 'sell', x: tw.cx + 0.5, y: tw.cy + 0.5, gold: back });
    return back;
  };

  Game.prototype.startWave = function () {
    if (this.state !== 'rest') return false;
    this.wave++;
    this.spawnQueue = this.waveList(this.wave);
    this.spawnGap = Math.max(0.30, 0.92 - this.wave * 0.02);
    this.spawnT = 0.3; this.state = 'wave';
    this.events.push({ t: 'wave', wave: this.wave });
    return true;
  };

  /* 提前召唤：备战时间没走完就点，拿一笔提前奖励 */
  Game.prototype.callEarly = function () {
    if (this.state !== 'rest') return false;
    var b = 8 + Math.floor(this.wave * 2 + this.restT);
    this.gold += b;
    this.events.push({ t: 'bonus', gold: b });
    this.startWave();
    return b;
  };

  Game.prototype.byId = function (id) {
    for (var i = 0; i < this.enemies.length; i++) if (this.enemies[i].id === id) return this.enemies[i];
    return null;
  };

  Game.prototype.pickTarget = function (tw, range) {
    var best = null, bx = tw.cx + 0.5, by = tw.cy + 0.5;
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (e.dead) continue;
      var dx = e.x - bx, dy = e.y - by;
      if (dx * dx + dy * dy <= (range + e.def.r) * (range + e.def.r)) {
        if (!best || e.t > best.t) best = e;
      }
    }
    return best;
  };

  Game.prototype.hurt = function (e, dmg) {
    if (e.dead) return;
    var d = Math.max(1, dmg - e.def.armor);
    e.hp -= d; e.hitT = 0.12;
    this.events.push({ t: 'dmg', x: e.x, y: e.y - 0.25, v: Math.round(d) });
    if (e.hp <= 0) {
      e.dead = true; this.kills++;
      var g = e.def.gold + Math.floor(this.wave * 0.5);
      this.gold += g;
      this.events.push({ t: 'kill', x: e.x, y: e.y, gold: g, type: e.type });
    }
  };

  Game.prototype.update = function (dt) {
    if (this.state === 'over') return;
    if (!(dt > 0)) return;
    if (dt > 0.05) dt = 0.05;
    this.time += dt;
    var i, e, tw, s;

    if (this.state === 'rest') {
      this.restT -= dt;
      if (this.restT <= 0) { this.restT = 0; this.startWave(); }
    }

    if (this.state === 'wave' && this.spawnQueue.length) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) { this.spawnT = this.spawnGap; this.spawn(this.spawnQueue.shift()); }
    }

    // 敌人前进
    var mul = this.speedMul(), n = this.path.length - 1;
    for (i = 0; i < this.enemies.length; i++) {
      e = this.enemies[i];
      if (e.dead) continue;
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) { e.slowT = 0; e.slow = 0; } }
      if (e.hitT > 0) e.hitT -= dt;
      var sp = e.def.speed * mul * (e.slowT > 0 ? (1 - e.slow) : 1);
      e.t += sp * dt;
      if (e.t >= n) {
        e.t = n; e.dead = true; this.leaked++;
        this.lives -= e.def.leak;
        var p0 = this.posAt(n);
        this.events.push({ t: 'leak', x: p0.x, y: p0.y, dmg: e.def.leak });
        if (this.lives <= 0) {
          this.lives = 0; this.state = 'over';
          this.events.push({ t: 'over', wave: this.wave, kills: this.kills });
        }
        continue;
      }
      var p = this.posAt(e.t); e.x = p.x; e.y = p.y;
    }

    // 塔开火
    for (i = 0; i < this.towers.length; i++) {
      tw = this.towers[i];
      var st = stat(tw.type, tw.lvl);
      if (tw.cd > 0) tw.cd -= dt;
      if (tw.flash > 0) tw.flash = Math.max(0, tw.flash - dt * 6);
      var tgt = this.pickTarget(tw, st.range);
      tw.target = tgt ? tgt.id : 0;
      if (tgt) tw.aim = Math.atan2(tgt.y - (tw.cy + 0.5), tgt.x - (tw.cx + 0.5));
      if (tgt && tw.cd <= 0) {
        tw.cd = st.cd; tw.flash = 1;
        this.shots.push({
          type: tw.type, lvl: tw.lvl, x: tw.cx + 0.5, y: tw.cy + 0.5,
          tid: tgt.id, tx: tgt.x, ty: tgt.y, sp: st.shotSpeed, dmg: st.dmg,
          splash: st.splash || 0, slow: st.slow || 0, slowDur: st.slowDur || 0,
          life: 2.2, dead: false
        });
        this.events.push({ t: 'shoot', type: tw.type, lvl: tw.lvl, x: tw.cx + 0.5, y: tw.cy + 0.5, aim: tw.aim });
      }
    }

    // 弹道飞行
    for (i = 0; i < this.shots.length; i++) {
      s = this.shots[i];
      if (s.dead) continue;
      s.life -= dt;
      var tE = this.byId(s.tid);
      if (tE && !tE.dead) { s.tx = tE.x; s.ty = tE.y; }
      var dx = s.tx - s.x, dy = s.ty - s.y, d = Math.sqrt(dx * dx + dy * dy);
      var step = s.sp * dt;
      if (d <= step || d < 0.06) {
        s.x = s.tx; s.y = s.ty; s.dead = true;
        this.impact(s);
      } else {
        s.x += dx / d * step; s.y += dy / d * step;
        if (s.life <= 0) { s.dead = true; }
      }
    }

    // 清理
    for (i = this.enemies.length - 1; i >= 0; i--) if (this.enemies[i].dead) this.enemies.splice(i, 1);
    for (i = this.shots.length - 1; i >= 0; i--) if (this.shots[i].dead) this.shots.splice(i, 1);

    // 一波清完 → 进入间歇
    if (this.state === 'wave' && !this.spawnQueue.length && !this.enemies.length) {
      var bonus = 22 + this.wave * 4;
      this.gold += bonus;
      this.events.push({ t: 'clear', wave: this.wave, gold: bonus });
      this.state = 'rest'; this.restT = 6;
    }
  };

  Game.prototype.impact = function (s) {
    if (s.splash > 0) {
      for (var i = 0; i < this.enemies.length; i++) {
        var e = this.enemies[i];
        if (e.dead) continue;
        var dx = e.x - s.x, dy = e.y - s.y;
        var rr = s.splash + e.def.r;
        if (dx * dx + dy * dy <= rr * rr) this.hurt(e, s.dmg);
      }
      this.events.push({ t: 'boom', x: s.x, y: s.y, r: s.splash });
    } else {
      var tE = this.byId(s.tid);
      if (tE && !tE.dead) {
        if (s.slow > 0) {
          if (s.slow >= tE.slow) tE.slow = s.slow;
          if (s.slowDur > tE.slowT) tE.slowT = s.slowDur;
        }
        this.hurt(tE, s.dmg);
        this.events.push({ t: 'hit', x: s.x, y: s.y, type: s.type });
      }
    }
  };

  return {
    COLS: COLS, ROWS: ROWS, TOWERS: TOWERS, ENEMIES: ENEMIES,
    Game: Game, makePath: makePath, mulberry32: mulberry32,
    stat: stat, upCost: upCost
  };
});
