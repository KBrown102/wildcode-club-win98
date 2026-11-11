/**
 * render.js —— Canvas 2D 渲染（光束世界）。DOM 的 HUD/浮层由 ui.js 负责。
 * 视觉：HIROSTOPTIME 暗场留白 × 朱柿 #C4553B 唯一暖点（目标被点亮）；
 * 光束本身为冷调青白。平滑与脉冲用 codex/smoothing.js 的 SM。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Render = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SM = (typeof window !== 'undefined' && window.SM) ? window.SM
    : (typeof self !== 'undefined' && self.SM) ? self.SM
    : (typeof globalThis !== 'undefined' ? globalThis.SM : null);

  var WARM = '#C4553B';        // 朱柿 · 唯一暖点
  var BEAM_CORE = '#eaf6ff';
  var BEAM_GLOW = '#69c6ff';

  var R = {
    W: 0, H: 0, dpr: 1,
    layout: null,
    litGlow: 0,        // 目标点亮程度 0..1（平滑）
    beamPulse: 0,

    resize: function (canvas, level) {
      var dpr = Math.min(window.devicePixelRatio || 1, 2.6);
      var W = canvas.clientWidth || canvas.parentElement.clientWidth || 800;
      var H = canvas.clientHeight || canvas.parentElement.clientHeight || 600;
      this.dpr = dpr; this.W = W; this.H = H;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      var ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this._layout(level, W, H);
      return ctx;
    },
    _layout: function (level, W, H) {
      var pad = Math.max(18, Math.min(W, H) * 0.06);
      var topReserve = 8;
      var availW = W - pad * 2;
      var availH = H - pad * 2 - topReserve;
      var cell = Math.floor(Math.min(availW / level.cols, availH / level.rows));
      cell = Math.max(28, cell);
      var gw = cell * level.cols, gh = cell * level.rows;
      var ox = Math.round((W - gw) / 2);
      var oy = Math.round(topReserve + (H - topReserve - gh) / 2);
      this.layout = { cell: cell, ox: ox, oy: oy, gw: gw, gh: gh };
    },
    relayout: function (level) {
      if (this.layout) this._layout(level, this.W, this.H);
    },
    // 逻辑像素 → 格子
    cellAt: function (px, py) {
      var L = this.layout; if (!L) return null;
      var c = Math.floor((px - L.ox) / L.cell);
      var r = Math.floor((py - L.oy) / L.cell);
      return { c: c, r: r };
    },
    _cx: function (c) { return this.layout.ox + c * this.layout.cell + this.layout.cell / 2; },
    _cy: function (r) { return this.layout.oy + r * this.layout.cell + this.layout.cell / 2; },

    draw: function (ctx, game, time, dt) {
      var L = this.layout, lvl = game.level;
      ctx.clearRect(0, 0, this.W, this.H);
      this._bg(ctx);
      this._grid(ctx, lvl);
      this._walls(ctx, lvl);
      this._fixed(ctx, lvl);
      this._target(ctx, game, time, dt);
      this._beam(ctx, game, time);
      this._movable(ctx, game);
      this._source(ctx, lvl, time);
    },

    _bg: function (ctx) {
      var g = ctx.createRadialGradient(this.W / 2, this.H * 0.42, this.H * 0.05, this.W / 2, this.H * 0.5, Math.max(this.W, this.H) * 0.75);
      g.addColorStop(0, '#141d2b');
      g.addColorStop(0.55, '#0e1622');
      g.addColorStop(1, '#080d15');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.W, this.H);
    },
    _grid: function (ctx, lvl) {
      var L = this.layout, cell = L.cell;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.045)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var c = 0; c <= lvl.cols; c++) {
        var x = L.ox + c * cell + 0.5;
        ctx.moveTo(x, L.oy); ctx.lineTo(x, L.oy + lvl.rows * cell);
      }
      for (var r = 0; r <= lvl.rows; r++) {
        var y = L.oy + r * cell + 0.5;
        ctx.moveTo(L.ox, y); ctx.lineTo(L.ox + lvl.cols * cell, y);
      }
      ctx.stroke();
      ctx.restore();
    },
    _roundRect: function (ctx, x, y, w, h, rad) {
      ctx.beginPath();
      ctx.moveTo(x + rad, y);
      ctx.arcTo(x + w, y, x + w, y + h, rad);
      ctx.arcTo(x + w, y + h, x, y + h, rad);
      ctx.arcTo(x, y + h, x, y, rad);
      ctx.arcTo(x, y, x + w, y, rad);
      ctx.closePath();
    },
    _walls: function (ctx, lvl) {
      var L = this.layout, cell = L.cell;
      for (var i = 0; i < lvl.walls.length; i++) {
        var w = lvl.walls[i];
        var x = L.ox + w.c * cell, y = L.oy + w.r * cell;
        ctx.save();
        var g = ctx.createLinearGradient(x, y, x, y + cell);
        g.addColorStop(0, '#26303f'); g.addColorStop(1, '#171f2b');
        ctx.fillStyle = g;
        this._roundRect(ctx, x + 2, y + 2, cell - 4, cell - 4, cell * 0.12);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.restore();
      }
    },
    _mirrorGlyph: function (ctx, cx, cy, cell, o, fixed) {
      var half = cell * 0.32;
      ctx.save();
      ctx.translate(cx, cy);
      // 玻璃/石座
      var rad = cell * 0.16;
      if (fixed) {
        ctx.fillStyle = 'rgba(180,170,150,0.16)';
        ctx.strokeStyle = 'rgba(200,190,165,0.5)';
      } else {
        ctx.fillStyle = 'rgba(120,200,255,0.10)';
        ctx.strokeStyle = 'rgba(150,210,255,0.55)';
      }
      ctx.lineWidth = Math.max(1.5, cell * 0.035);
      this._roundRect(ctx, -rad, -rad, rad * 2, rad * 2, rad * 0.4);
      ctx.fill(); ctx.stroke();
      // 反射线
      ctx.strokeStyle = fixed ? 'rgba(220,210,185,0.9)' : 'rgba(190,235,255,0.95)';
      ctx.lineWidth = Math.max(2, cell * 0.06);
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (o === '/') { ctx.moveTo(-half, half); ctx.lineTo(half, -half); }
      else { ctx.moveTo(-half, -half); ctx.lineTo(half, half); }
      ctx.stroke();
      if (fixed) {
        // 锁定小点
        ctx.fillStyle = 'rgba(220,210,185,0.8)';
        ctx.beginPath(); ctx.arc(0, 0, Math.max(1.2, cell * 0.03), 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    },
    _fixed: function (ctx, lvl) {
      var L = this.layout;
      for (var i = 0; i < lvl.fixed.length; i++) {
        var f = lvl.fixed[i];
        this._mirrorGlyph(ctx, this._cx(f.c), this._cy(f.r), L.cell, f.o, true);
      }
    },
    _movable: function (ctx, game) {
      var L = this.layout;
      var keys = Object.keys(game.movable);
      for (var i = 0; i < keys.length; i++) {
        var p = keys[i].split(',');
        this._mirrorGlyph(ctx, this._cx(+p[0]), this._cy(+p[1]), L.cell, game.movable[keys[i]], false);
      }
    },
    _source: function (ctx, lvl, time) {
      var L = this.layout;
      var cx = this._cx(lvl.source.c), cy = this._cy(lvl.source.r);
      var dir = lvl.source.dir;
      var d = SM && SM.DIR ? SM.DIR : ({ U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] });
      var dv = (d[dir] || [1, 0]);
      var pulse = 0.5 + 0.5 * Math.sin(time * 2.2);
      ctx.save();
      // 光晕
      var rr = L.cell * (0.34 + 0.05 * pulse);
      var g = ctx.createRadialGradient(cx, cy, 1, cx, cy, rr * 2.4);
      g.addColorStop(0, 'rgba(190,235,255,0.9)');
      g.addColorStop(0.4, 'rgba(120,200,255,0.35)');
      g.addColorStop(1, 'rgba(120,200,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, rr * 2.4, 0, Math.PI * 2); ctx.fill();
      // 核心
      ctx.fillStyle = '#eaf6ff';
      ctx.beginPath(); ctx.arc(cx, cy, L.cell * 0.16, 0, Math.PI * 2); ctx.fill();
      // 指向
      ctx.strokeStyle = 'rgba(190,235,255,0.9)';
      ctx.lineWidth = Math.max(2, L.cell * 0.05); ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + dv[0] * L.cell * 0.42, cy + dv[1] * L.cell * 0.42);
      ctx.stroke();
      ctx.restore();
    },
    _target: function (ctx, game, time, dt) {
      var L = this.layout;
      var cx = this._cx(game.level.target.c), cy = this._cy(game.level.target.r);
      if (SM && SM.approach) this.litGlow = SM.approach(this.litGlow, game.beam.lit ? 1 : 0, 6, dt || 0.016);
      else this.litGlow = game.beam.lit ? 1 : 0;
      var glow = this.litGlow;
      var pulse = 0.5 + 0.5 * Math.sin(time * 1.8);
      ctx.save();
      // 休眠环
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = Math.max(1.5, L.cell * 0.04);
      ctx.beginPath(); ctx.arc(cx, cy, L.cell * 0.30, 0, Math.PI * 2); ctx.stroke();
      // 内芯：未亮偏冷，亮起转朱柿
      var coreR = L.cell * (0.12 + 0.06 * glow);
      if (glow > 0.01) {
        var g = ctx.createRadialGradient(cx, cy, 1, cx, cy, L.cell * (0.5 + 0.5 * glow));
        g.addColorStop(0, 'rgba(255,200,170,' + (0.95 * glow) + ')');
        g.addColorStop(0.35, 'rgba(196,85,59,' + (0.9 * glow) + ')');
        g.addColorStop(1, 'rgba(196,85,59,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(cx, cy, L.cell * (0.5 + 0.5 * glow) * (0.9 + 0.15 * pulse), 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = glow > 0.5 ? WARM : '#9fb4c9';
      ctx.beginPath(); ctx.arc(cx, cy, coreR, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    },
    _beam: function (ctx, game, time) {
      var path = game.beam.path;
      if (!path || path.length < 2) return;
      var L = this.layout;
      if (SM && SM.approach) this.beamPulse = SM.approach(this.beamPulse, game.beam.lit ? 1 : 0.35, 5, 0.016);
      else this.beamPulse = game.beam.lit ? 1 : 0.35;
      var pts = path.map(function (p) { return [L.ox + p.c * L.cell + L.cell / 2, L.oy + p.r * L.cell + L.cell / 2]; });
      var pulse = 0.6 + 0.4 * Math.sin(time * 3.0);
      ctx.save();
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      // 外发光
      ctx.strokeStyle = 'rgba(105,198,255,' + (0.18 * this.beamPulse) + ')';
      ctx.lineWidth = L.cell * 0.5;
      this._stroke(ctx, pts);
      // 中层
      ctx.strokeStyle = 'rgba(140,210,255,' + (0.5 * this.beamPulse) + ')';
      ctx.lineWidth = L.cell * 0.16;
      this._stroke(ctx, pts);
      // 内芯
      ctx.strokeStyle = BEAM_CORE;
      ctx.lineWidth = Math.max(1.5, L.cell * 0.06 * pulse);
      this._stroke(ctx, pts);
      ctx.restore();
    },
    _stroke: function (ctx, pts) {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
    }
  };

  return R;
});
