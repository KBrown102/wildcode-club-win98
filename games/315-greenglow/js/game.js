/* 315-greenglow《暗绿 · 一笺光》——纯逻辑层（UMD：浏览器 <script> 与 Node require 双用）
 * 核心：在暗绿房间里，用一团暖光扫出隐藏的旧事信笺（揭示），按序把它们连成一条光链（连接），
 * 拼回一段被遗忘的信。光随指针移动；移动越快光越暗（消耗），停下光自己回来（充电宝）。零惩罚。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GreenGlow = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // —— 逻辑舞台尺寸（与渲染同源）——
  var W = 900, H = 560;

  // —— 八关，每关一句旧事，拆成 N 个信笺碎片（顺序 = 连线顺序）——
  var LEVELS_N = [4, 4, 5, 5, 6, 6, 7, 8];
  var LEVELS_FRAGS = [
    ['夜深了，', '我把灯', '留给你。', '别怕黑。'],
    ['房间很绿，', '像你走前', '说的那个', '夏天。'],
    ['影子在墙上', '走，', '它没有', '急着', '去哪。'],
    ['我把旧事', '一句句', '捡起来，', '连成', '一条线。'],
    ['你说过，', '慢一点', '也', '没关系。', '灯会', '自己亮。'],
    ['有些话', '来不及说，', '就先', '放在', '暗处，', '等风来读。'],
    ['等哪天', '你回来，', '顺着', '这缕光', '就能', '把信', '读完。'],
    ['读完', '就睡吧，', '灯', '我替你', '收好了。', '绿房间', '还暖着，', '我在。']
  ];
  var LEVELS = LEVELS_N.length;

  // —— 调参 ——
  var R0 = 120;            // 光最大半径
  var REVEAL = 2.4;        // 光照下显形速率
  var DECAY = 0.5;         // 光离开后记忆褪去速率（指数）
  var REGEN = 0.5;         // 静止时光量回充 /s
  var SPEEDCOST = 0.0009;  // 移动耗光（×速度）
  var LIGHT_RATE = 10;     // 光跟随指针的帧率无关逼近速率
  var TAP_LIT = 0.3;       // 可点击连接的最低亮度
  var CONNECT_PT = 100;    // 每连对一句
  var WIN_BONUS = 200;     // 通关
  var ENERGY_BONUS = 120;  // 通关时剩余光量奖励（×power）

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeLevel(L) {
    var N = LEVELS_N[L];
    var frags = LEVELS_FRAGS[L];
    var rng = mulberry32(1000 + L * 131 + 7);
    var nodes = [];
    var marginX = 130, marginY = 110, minDist = 110, tries = 0;
    while (nodes.length < N && tries < 6000) {
      tries++;
      var x = marginX + rng() * (W - 2 * marginX);
      var y = marginY + rng() * (H - 2 * marginY);
      var ok = true;
      for (var i = 0; i < nodes.length; i++) {
        if (Math.hypot(nodes[i].x - x, nodes[i].y - y) < minDist) { ok = false; break; }
      }
      if (ok) {
        var order = nodes.length + 1;
        nodes.push({ id: nodes.length, x: x, y: y, order: order, frag: frags[order - 1], lit: 0, connected: false });
      }
    }
    return { L: L, N: N, nodes: nodes };
  }

  function Game(level) {
    if (!(this instanceof Game)) return new Game(level);
    this.reset(level || 0);
  }
  Game.prototype.reset = function (level) {
    level = clamp(level | 0, 0, LEVELS - 1);
    var lv = makeLevel(level);
    this.level = level;
    this.N = lv.N;
    this.nodes = lv.nodes;
    this.light = { x: W / 2, y: H / 2, power: 1 };
    this.target = { x: W / 2, y: H / 2 };
    this.chain = [];
    this.nextExpected = 1;
    this.status = 'play';
    this.score = 0;
    this.time = 0;
    this.win = false;
    this.finalScore = 0;
    this.input = { tx: W / 2, ty: H / 2, tap: null };
    this.events = [];
    this._aiLast = -1;
    this._aiR = { t: 0 };
  };
  Game.prototype.setInput = function (i) {
    if (i.tx !== undefined) this.target.x = i.tx;
    if (i.ty !== undefined) this.target.y = i.ty;
    if (i.vx) this.target.x += i.vx;
    if (i.vy) this.target.y += i.vy;
    if (i.tap !== undefined) this.input.tap = i.tap;
  };
  Game.prototype.radius = function () { return R0 * (0.5 + 0.5 * this.light.power); };
  Game.prototype.step = function (dt, input) {
    if (input) this.setInput(input);
    if (this.input.tx !== undefined) this.target.x = this.input.tx;
    if (this.input.ty !== undefined) this.target.y = this.input.ty;
    if (!(dt >= 0)) dt = 0;            // NaN/负 拒绝
    dt = Math.min(dt, 0.05);           // 上限防穿透
    this.time += dt;
    var k = 1 - Math.exp(-LIGHT_RATE * dt);
    var ox = this.light.x, oy = this.light.y;
    this.light.x += (this.target.x - this.light.x) * k;
    this.light.y += (this.target.y - this.light.y) * k;
    var moved = Math.hypot(this.light.x - ox, this.light.y - oy);
    var speed = moved / Math.max(dt, 1e-4);
    this.light.power = clamp(this.light.power + REGEN * dt - SPEEDCOST * speed * dt, 0, 1);
    var r = this.radius();
    for (var i = 0; i < this.nodes.length; i++) {
      var n = this.nodes[i];
      if (n.connected) { n.lit = 1; continue; }
      var d = Math.hypot(this.light.x - n.x, this.light.y - n.y);
      if (d < r) n.lit = Math.min(1, n.lit + REVEAL * dt);
      else n.lit *= Math.exp(-DECAY * dt);
    }
    if (this.input.tap != null) {
      var id = this.input.tap; this.input.tap = null;
      var nd = this.nodes[id];
      if (nd && !nd.connected && nd.lit > TAP_LIT) {
        if (nd.order === this.nextExpected) {
          nd.connected = true; this.chain.push(id); this.nextExpected++;
          this.score += CONNECT_PT;
          this.events.push({ type: 'connect', id: id, order: nd.order, frag: nd.frag });
          if (this.nextExpected > this.N) {
            this.win = true; this.status = 'win';
            this.finalScore = this.score + WIN_BONUS + Math.round(this.light.power * ENERGY_BONUS);
            this.events.push({ type: 'win', score: this.finalScore });
          }
        } else {
          this.events.push({ type: 'wrong', id: id });
        }
      }
    }
  };
  Game.prototype.par = function () { return this.N * CONNECT_PT + WIN_BONUS + ENERGY_BONUS; };
  Game.prototype.stars = function () {
    if (!this.win) return 0;
    var base = this.N * CONNECT_PT + WIN_BONUS;   // 连完 + 通关
    var bonus = this.finalScore - base;          // = round(power*ENERGY_BONUS)，收尾光量越高越从容
    if (bonus >= 70) return 3;   // 很从容（慢下来，光几乎没暗）
    if (bonus >= 20) return 2;   // 较从容
    return 1;                    // 连完即过关
  };
  // 当前已连成的句子（按连线顺序）
  Game.prototype.letterSoFar = function () {
    var s = '';
    for (var i = 0; i < this.chain.length; i++) s += this.nodes[this.chain[i]].frag;
    return s;
  };

  // —— AI（供冒烟 + 浏览器自动托管）——
  function aiInput(g, strategy, rng) {
    rng = rng || Math.random;
    if (strategy === 'noop') return;
    if (strategy === 'random') {
      g._aiR.t -= 1;
      if (g._aiR.t <= 0) {
        g._aiR.t = 18 + Math.floor(rng() * 36);
        var litR = g.nodes.filter(function (n) { return !n.connected && n.lit > 0.3; });
        if (litR.length) { var nr = litR[Math.floor(rng() * litR.length)]; g.input.tx = nr.x; g.input.ty = nr.y; }
      }
      if (rng() < 0.06) {
        var litT = g.nodes.filter(function (n) { return !n.connected && n.lit > 0.3; });
        if (litT.length) { var nt = litT[Math.floor(rng() * litT.length)]; g.input.tap = nt.id; }
      }
      return;
    }
    // strong
    var n = null;
    for (var i = 0; i < g.nodes.length; i++) if (g.nodes[i].order === g.nextExpected && !g.nodes[i].connected) { n = g.nodes[i]; break; }
    if (!n) return;
    g.input.tx = n.x; g.input.ty = n.y;
    if (n.lit > 0.5 && g._aiLast !== n.id) { g.input.tap = n.id; g._aiLast = n.id; }
  }

  return {
    W: W, H: H, LEVELS: LEVELS, LEVELS_N: LEVELS_N, LEVELS_FRAGS: LEVELS_FRAGS,
    R0: R0, REVEAL: REVEAL, DECAY: DECAY, CONNECT_PT: CONNECT_PT, WIN_BONUS: WIN_BONUS, ENERGY_BONUS: ENERGY_BONUS, TAP_LIT: TAP_LIT,
    clamp: clamp, mulberry32: mulberry32, makeLevel: makeLevel, Game: Game, aiInput: aiInput
  };
});
