/* 294-wintercache · render.js — HIROSTOPTIME 单色叙事 × 中国传统色秋/冬双章 */
(function (root) {
  'use strict';
  var G = root.WinterCache;
  var COLS = G.COLS, ROWS = G.ROWS;
  var W = 480, H = 732;
  var CELL = 42, X0 = 9, Y0 = 108;

  /* 秋：芒果黄/琥珀主色；冬：霜紫 + 雪白，坚果与松鼠是唯一暖点 */
  var PA = {
    back: '#5E4A26', back2: '#3E3118',
    g1: '#AE8E48', g2: '#8C7038', sp1: '#CBA75C', sp2: '#84682F',
    line: 'rgba(64,45,18,0.16)',
    tree: '#5D7A4C', tree2: '#3F5636', trunk: '#4A3B32',
    rock: '#9A9384', rock2: '#6E6759', bush: '#7C9A6B',
    mound: '#E8C87E', mound2: '#A8842F',
    blob: 'rgba(255,231,176,0.16)', flake: '#D9A441'
  };
  var PW = {
    back: '#37324A', back2: '#221F31',
    g1: '#DCD8E2', g2: '#B9B4C6', sp1: '#F4F1EC', sp2: '#9E99AE',
    line: 'rgba(58,52,80,0.13)',
    tree: '#3F4A44', tree2: '#2C3530', trunk: '#332E3C',
    rock: '#6A6478', rock2: '#4A4557', bush: '#4E5442',
    mound: '#C9C4E0', mound2: '#6E6A86',
    blob: 'rgba(206,200,232,0.13)', flake: '#FFFFFF'
  };

  function rnd(a) { return G.mulberry32(a); }

  function Render(cv) {
    this.cv = cv; this.ctx = cv.getContext('2d');
    this.eff = 1; this.key = '';
    this.parts = []; this.texts = []; this.shake = 0; this.flash = 0;
    this.flakes = []; this.t = 0; this.hover = -1;
    this._grain = null; this._blob = null; this._bgA = null; this._bgW = null;
  }

  Render.prototype.resize = function (eff) {
    this.eff = eff;
    this.cv.width = Math.round(W * eff); this.cv.height = Math.round(H * eff);
    this.cv.style.width = W + 'px'; this.cv.style.height = H + 'px';
    this._grain = null; this._blob = null;
  };

  function off(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  Render.prototype._sprite = function () {
    if (this._grain && this._blob) return;
    var e = this.eff, i, x, y;
    /* 胶片颗粒 */
    var gn = off(96, 96), gc = gn.getContext('2d');
    var im = gc.createImageData(96, 96), d = im.data;
    for (i = 0; i < d.length; i += 4) {
      var v = 118 + ((Math.random() * 74) | 0);
      d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
    }
    gc.putImageData(im, 0, 0);
    this._grain = this.ctx.createPattern(gn, 'repeat');
    /* 柔光斑 */
    var bs = 420, b = off(bs, bs), bc = b.getContext('2d');
    var g = bc.createRadialGradient(bs / 2, bs / 2, 0, bs / 2, bs / 2, bs / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.42, 'rgba(255,255,255,0.36)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    bc.fillStyle = g; bc.fillRect(0, 0, bs, bs);
    this._blob = b;
  };

  /* ---------- 烘焙地面（秋 / 冬各一张） ---------- */
  function bakeGround(st, P, winter) {
    var e = this.eff;
    var c = off(Math.round(W * e), Math.round(H * e)), x = c.getContext('2d');
    x.setTransform(e, 0, 0, e, 0, 0);
    var r = rnd(st.seed + st.li * 977 + (winter ? 5 : 0));

    var bg = x.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, P.back); bg.addColorStop(1, P.back2);
    x.fillStyle = bg; x.fillRect(0, 0, W, H);

    /* 林间空地：外圈压暗（框景 + 前景遮挡感） */
    var vg = x.createRadialGradient(W / 2, Y0 + 189, 60, W / 2, Y0 + 189, 330);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.42)');
    x.fillStyle = vg; x.fillRect(0, 0, W, H);

    var bw = COLS * CELL, bh = ROWS * CELL;
    var gg = x.createLinearGradient(X0, Y0, X0, Y0 + bh);
    gg.addColorStop(0, P.g1); gg.addColorStop(1, P.g2);
    x.fillStyle = gg;
    x.fillRect(X0 - 6, Y0 - 6, bw + 12, bh + 12);

    /* 草地质感：软笔刷斑块 */
    var i;
    for (i = 0; i < 420; i++) {
      var px = X0 - 4 + r() * (bw + 8), py = Y0 - 4 + r() * (bh + 8);
      var rad = 6 + r() * 20;
      x.globalAlpha = 0.05 + r() * 0.09;
      x.fillStyle = r() < 0.5 ? P.sp1 : P.sp2;
      x.beginPath(); x.ellipse(px, py, rad, rad * (0.5 + r() * 0.4), r() * 3.14, 0, 6.2832); x.fill();
    }
    x.globalAlpha = 1;

    /* 网格 */
    x.strokeStyle = P.line; x.lineWidth = 1;
    for (i = 0; i <= COLS; i++) { x.beginPath(); x.moveTo(X0 + i * CELL, Y0); x.lineTo(X0 + i * CELL, Y0 + bh); x.stroke(); }
    for (i = 0; i <= ROWS; i++) { x.beginPath(); x.moveTo(X0, Y0 + i * CELL); x.lineTo(X0 + bw, Y0 + i * CELL); x.stroke(); }

    /* 地标：树 / 石 / 灌木（冬天戴雪帽，永不积雪 → 记忆锚点） */
    for (var cy = 0; cy < ROWS; cy++) for (var cx2 = 0; cx2 < COLS; cx2++) {
      var ci = cy * COLS + cx2, t = st.grid[ci];
      if (!t) continue;
      var mx = X0 + (cx2 + 0.5) * CELL, my = Y0 + (cy + 0.5) * CELL;
      x.save();
      x.fillStyle = 'rgba(0,0,0,0.20)';
      x.beginPath(); x.ellipse(mx, my + 9, 15, 5.5, 0, 0, 6.2832); x.fill();
      if (t === 1) {
        x.fillStyle = P.trunk; x.fillRect(mx - 2.4, my - 2, 4.8, 13);
        x.fillStyle = P.tree2;
        x.beginPath(); x.ellipse(mx, my - 9, 14, 12, 0, 0, 6.2832); x.fill();
        x.fillStyle = P.tree;
        x.beginPath(); x.ellipse(mx - 2, my - 11, 10.5, 9, 0, 0, 6.2832); x.fill();
        if (winter) { x.fillStyle = 'rgba(245,243,238,0.82)'; x.beginPath(); x.ellipse(mx - 1, my - 14, 9, 5, -0.2, 0, 6.2832); x.fill(); }
      } else if (t === 2) {
        x.fillStyle = P.rock2;
        x.beginPath(); x.moveTo(mx - 14, my + 8); x.lineTo(mx - 8, my - 8); x.lineTo(mx + 4, my - 12);
        x.lineTo(mx + 13, my - 1); x.lineTo(mx + 12, my + 8); x.closePath(); x.fill();
        x.fillStyle = P.rock;
        x.beginPath(); x.moveTo(mx - 9, my + 8); x.lineTo(mx - 5, my - 6); x.lineTo(mx + 4, my - 9);
        x.lineTo(mx + 9, my - 1); x.lineTo(mx + 8, my + 8); x.closePath(); x.fill();
        if (winter) { x.fillStyle = 'rgba(245,243,238,0.80)'; x.beginPath(); x.ellipse(mx + 1, my - 8, 7, 3.4, -0.18, 0, 6.2832); x.fill(); }
      } else {
        x.fillStyle = P.bush;
        x.beginPath(); x.ellipse(mx - 6, my + 1, 9, 7.5, 0, 0, 6.2832); x.fill();
        x.beginPath(); x.ellipse(mx + 5, my + 2, 8.5, 7, 0, 0, 6.2832); x.fill();
        x.beginPath(); x.ellipse(mx, my - 4, 9.5, 8, 0, 0, 6.2832); x.fill();
        if (winter) { x.fillStyle = 'rgba(245,243,238,0.72)'; x.beginPath(); x.ellipse(mx, my - 7, 7.5, 4, -0.15, 0, 6.2832); x.fill(); }
      }
      x.restore();
    }

    /* 边框（框景） */
    x.strokeStyle = winter ? 'rgba(30,27,44,0.55)' : 'rgba(48,34,14,0.5)';
    x.lineWidth = 3; x.strokeRect(X0 - 6.5, Y0 - 6.5, bw + 13, bh + 13);
    return c;
  }

  Render.prototype.bake = function (st, key) {
    if (this.key === key && this._bgA) return;
    this.key = key;
    this._sprite();
    this._bgA = bakeGround.call(this, st, PA, false);
    this._bgW = bakeGround.call(this, st, PW, true);
    this.flakes.length = 0;
    for (var i = 0; i < 80; i++) this.flakes.push(this._mkFlake(true));
  };

  Render.prototype._mkFlake = function (init) {
    return {
      x: Math.random() * W, y: init ? Math.random() * H : -12,
      vx: -14 + Math.random() * 28, vy: 26 + Math.random() * 46,
      r: 1.2 + Math.random() * 2.6, a: 0.3 + Math.random() * 0.5,
      rot: Math.random() * 6.28, vr: -1.6 + Math.random() * 3.2
    };
  };

  /* ---------- 事件 → 粒子 ---------- */
  Render.prototype.feed = function (st) {
    var evs = st.events, i, e2;
    for (i = 0; i < evs.length; i++) {
      e2 = evs[i];
      var c = e2.cell;
      var mx = c != null ? X0 + (G.cx(c) + 0.5) * CELL : W / 2;
      var my = c != null ? Y0 + (G.cy(c) + 0.5) * CELL : Y0 + 189;
      if (e2.t === 'pick') {
        this.burst(mx, my, 9, G.KINDS[e2.k].c1, 62, 0.5);
        this.text(mx, my - 12, G.KINDS[e2.k].name, G.KINDS[e2.k].c1, 0.8);
      } else if (e2.t === 'bury') {
        this.burst(mx, my + 3, 12, '#C9A468', 46, 0.5);
        this.shake = Math.max(this.shake, 1.6);
      } else if (e2.t === 'hit') {
        var kk = G.KINDS[e2.k];
        this.ring(mx, my, kk.c1);
        this.burst(mx, my, 16, '#FFE0A0', 86, 0.7);
        this.burst(mx, my, 8, kk.c1, 60, 0.6);
        this.text(mx, my - 16, '+' + kk.score, '#FFE9B8', 1.0);
        this.flash = Math.max(this.flash, 0.22);
      } else if (e2.t === 'miss') {
        this.burst(mx, my, 9, '#8E88A0', 38, 0.5);
      } else if (e2.t === 'recharge') {
        this.text(mx, my - 26, '配额 +1', '#8FE0B8', 1.1);
        this.burst(mx, my, 10, '#8FE0B8', 54, 0.7);
      } else if (e2.t === 'snow') {
        this.flash = Math.max(this.flash, 0.34);
      } else if (e2.t === 'end') {
        this.flash = Math.max(this.flash, 0.3);
      }
    }
    evs.length = 0;
  };

  Render.prototype.burst = function (x, y, n, col, sp, life) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 6.2832, s = sp * (0.35 + Math.random() * 0.8);
      this.parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 24,
        r: 1.1 + Math.random() * 2.2, t: life * (0.6 + Math.random() * 0.6), l: life, c: col, g: 130 });
    }
  };
  Render.prototype.ring = function (x, y, col) { this.parts.push({ ring: 1, x: x, y: y, r: 6, t: 0.55, l: 0.55, c: col }); };
  Render.prototype.text = function (x, y, s, c, sc) { this.texts.push({ x: x, y: y, s: s, c: c, t: 1.1, l: 1.1, sc: sc || 1 }); };

  Render.prototype.step = function (dt) {
    this.t += dt;
    var i, p;
    for (i = this.parts.length - 1; i >= 0; i--) {
      p = this.parts[i]; p.t -= dt;
      if (p.t <= 0) { this.parts.splice(i, 1); continue; }
      if (p.ring) { p.r += 78 * dt; }
      else { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g || 130) * dt; p.vx *= 0.985; }
    }
    for (i = this.texts.length - 1; i >= 0; i--) {
      p = this.texts[i]; p.t -= dt; p.y -= 26 * dt;
      if (p.t <= 0) this.texts.splice(i, 1);
    }
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 9);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 1.9);
  };

  /* ---------- 元素绘制 ---------- */
  function nut(x, cx2, cy2, k, s) {
    var K = G.KINDS[k];
    x.save(); x.translate(cx2, cy2); x.scale(s, s);
    x.fillStyle = 'rgba(0,0,0,0.22)';
    x.beginPath(); x.ellipse(0, 5, 8, 3, 0, 0, 6.2832); x.fill();
    if (k === 0) {           /* 松果：鳞片 */
      x.fillStyle = K.c2; x.beginPath(); x.ellipse(0, 0, 7, 9, 0, 0, 6.2832); x.fill();
      x.fillStyle = K.c1;
      for (var i = 0; i < 4; i++) { x.beginPath(); x.ellipse(0, -5 + i * 3.6, 6.4 - i * 0.5, 1.9, 0, 0, 6.2832); x.fill(); }
    } else if (k === 1) {    /* 橡子 */
      x.fillStyle = K.c1; x.beginPath(); x.ellipse(0, 1.6, 6.2, 6.8, 0, 0, 6.2832); x.fill();
      x.fillStyle = K.c2; x.fillRect(-6.4, -6.4, 12.8, 4.4);
      x.fillRect(-1, -9.6, 2, 3.6);
      x.fillStyle = 'rgba(255,255,255,0.20)'; x.beginPath(); x.ellipse(-2.2, 0.6, 2, 3, -0.4, 0, 6.2832); x.fill();
    } else if (k === 2) {    /* 榛子 */
      x.fillStyle = K.c1; x.beginPath(); x.ellipse(0, 0.6, 6.6, 6.2, 0, 0, 6.2832); x.fill();
      x.fillStyle = K.c2; x.beginPath(); x.ellipse(0, -3.4, 5.6, 3.4, 0, 3.14, 6.2832); x.fill();
      x.beginPath(); x.ellipse(3.4, -5, 3.2, 1.8, 0.5, 0, 6.2832); x.fill();
      x.fillStyle = 'rgba(255,255,255,0.18)'; x.beginPath(); x.ellipse(-2.4, -0.4, 2, 2.6, -0.4, 0, 6.2832); x.fill();
    } else if (k === 3) {    /* 胡桃 */
      x.fillStyle = K.c2; x.beginPath(); x.arc(0, 0, 7.2, 0, 6.2832); x.fill();
      x.fillStyle = K.c1; x.beginPath(); x.arc(-0.8, -0.8, 6.4, 0, 6.2832); x.fill();
      x.strokeStyle = K.c2; x.lineWidth = 1.1;
      x.beginPath(); x.moveTo(-5, -3); x.quadraticCurveTo(0, 0, 5, -3); x.stroke();
      x.beginPath(); x.moveTo(-5, 1.4); x.quadraticCurveTo(0, -2.4, 5, 1.4); x.stroke();
    } else {                 /* 栗子 */
      x.fillStyle = K.c1; x.beginPath(); x.moveTo(0, 8); x.quadraticCurveTo(-8, 2, -6.4, -4);
      x.quadraticCurveTo(0, -8.4, 6.4, -4); x.quadraticCurveTo(8, 2, 0, 8); x.fill();
      x.fillStyle = K.c2; x.beginPath(); x.ellipse(0, -6, 3.4, 2.2, 0, 0, 6.2832); x.fill();
      x.fillStyle = 'rgba(255,255,255,0.20)'; x.beginPath(); x.ellipse(-2.4, 0, 1.8, 3, -0.2, 0, 6.2832); x.fill();
    }
    x.restore();
  }

  function mound(x, cx2, cy2, k) {
    x.save(); x.translate(cx2, cy2);
    x.fillStyle = 'rgba(70,52,20,0.30)';
    x.beginPath(); x.ellipse(0, 3.4, 12, 5, 0, 0, 6.2832); x.fill();
    x.fillStyle = '#B08A3C';
    x.beginPath(); x.ellipse(0, 1.6, 11, 6.4, 0, 3.14, 6.2832); x.fill();
    x.fillStyle = '#E8C87E';
    x.beginPath(); x.ellipse(0, 0.6, 9.4, 5.2, 0, 3.14, 6.2832); x.fill();
    x.fillStyle = '#C06A3A';
    x.beginPath(); x.ellipse(0, -0.8, 3.4, 1.9, 0, 0, 6.2832); x.fill();
    x.restore();
  }

  function pit(x, cx2, cy2) {
    x.save(); x.translate(cx2, cy2);
    x.fillStyle = 'rgba(46,42,66,0.55)';
    x.beginPath(); x.ellipse(0, 1, 10, 6, 0, 0, 6.2832); x.fill();
    x.fillStyle = 'rgba(30,27,44,0.7)';
    x.beginPath(); x.ellipse(0, 0.4, 7.4, 4.2, 0, 0, 6.2832); x.fill();
    x.strokeStyle = 'rgba(250,248,244,0.55)'; x.lineWidth = 1.4;
    x.beginPath(); x.ellipse(0, 0.8, 10.6, 6.2, 0, 0, 6.2832); x.stroke();
    x.restore();
  }

  function sapling(x, cx2, cy2, s, grown) {
    x.save(); x.translate(cx2, cy2); x.scale(s, s);
    x.strokeStyle = '#6B4A2A'; x.lineWidth = 1.8; x.lineCap = 'round';
    x.beginPath(); x.moveTo(0, 9); x.quadraticCurveTo(-0.6, 2, 0, -3); x.stroke();
    x.fillStyle = grown ? '#7C9A6B' : '#8FB27C';
    x.beginPath(); x.ellipse(-4.4, -2.4, 4.4, 2.6, -0.6, 0, 6.2832); x.fill();
    x.beginPath(); x.ellipse(4.4, -3.4, 4.6, 2.8, 0.6, 0, 6.2832); x.fill();
    x.beginPath(); x.ellipse(0, -6.6, 3.4, 3, 0, 0, 6.2832); x.fill();
    x.restore();
  }

  function squirrel(x, cx2, cy2, face, walk, phase) {
    var bob = Math.sin(walk) * 1.8, tail = Math.sin(walk * 0.55) * 0.34;
    x.save(); x.translate(cx2, cy2 + bob); x.scale(face >= 0 ? 1 : -1, 1);
    x.fillStyle = 'rgba(0,0,0,0.26)';
    x.beginPath(); x.ellipse(0, 12, 11, 3.6, 0, 0, 6.2832); x.fill();
    /* 尾巴 */
    x.save(); x.translate(-9, 2); x.rotate(tail);
    x.fillStyle = '#A8452F';
    x.beginPath(); x.moveTo(0, 4);
    x.quadraticCurveTo(-13, 2, -11, -12); x.quadraticCurveTo(-3, -14, 0, -4);
    x.quadraticCurveTo(2, 3, 0, 4); x.fill();
    x.fillStyle = 'rgba(255,220,180,0.30)';
    x.beginPath(); x.ellipse(-7, -6, 3.4, 5.4, 0.4, 0, 6.2832); x.fill();
    x.restore();
    /* 身体 */
    x.fillStyle = '#C4553B';
    x.beginPath(); x.ellipse(0, 3, 8.4, 8.6, 0, 0, 6.2832); x.fill();
    x.fillStyle = '#E8C87E';
    x.beginPath(); x.ellipse(3, 5, 4.6, 6, 0.2, 0, 6.2832); x.fill();
    /* 头 */
    x.fillStyle = '#C4553B';
    x.beginPath(); x.ellipse(5, -5.6, 6, 5.6, 0, 0, 6.2832); x.fill();
    x.fillStyle = '#A8452F';
    x.beginPath(); x.moveTo(2.4, -9.6); x.lineTo(4.6, -14.6); x.lineTo(6.4, -9.4); x.fill();
    x.beginPath(); x.moveTo(8, -9.8); x.lineTo(10, -14.2); x.lineTo(11, -9.2); x.fill();
    x.fillStyle = '#E8C87E';
    x.beginPath(); x.ellipse(7.4, -4, 3, 2.6, 0.3, 0, 6.2832); x.fill();
    x.fillStyle = '#2A1A12';
    x.beginPath(); x.arc(8.2, -6.4, 1.35, 0, 6.2832); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.85)';
    x.beginPath(); x.arc(8.6, -6.9, 0.5, 0, 6.2832); x.fill();
    x.fillStyle = '#2A1A12';
    x.beginPath(); x.arc(11.4, -4.6, 0.9, 0, 6.2832); x.fill();
    x.restore();
  }

  /* ---------- 主绘制 ---------- */
  Render.prototype.draw = function (st, dt) {
    var x = this.ctx;
    this.step(dt);
    this._sprite();
    var winter = st.phase === 'winter' || st.phase === 'end';
    var k = st.phase === 'snow' ? Math.min(1, st.snowT / G.T_SNOW) : (winter ? 1 : 0);

    x.setTransform(this.eff, 0, 0, this.eff, 0, 0);
    x.clearRect(0, 0, W, H);
    x.save();
    if (this.shake > 0) x.translate((Math.random() - 0.5) * this.shake * 3, (Math.random() - 0.5) * this.shake * 3);

    /* 地面：秋 → 冬 交叉溶解 */
    x.drawImage(this._bgA, 0, 0, W, H);
    if (k > 0) { x.globalAlpha = k; x.drawImage(this._bgW, 0, 0, W, H); x.globalAlpha = 1; }

    /* 目标格指示 */
    var sq = st.sq;
    if (sq.path.length) {
      var tc = sq.path[sq.path.length - 1];
      var tx = X0 + (G.cx(tc) + 0.5) * CELL, ty = Y0 + (G.cy(tc) + 0.5) * CELL;
      x.save();
      x.strokeStyle = winter ? 'rgba(255,236,190,0.85)' : 'rgba(255,232,170,0.9)';
      x.lineWidth = 2; x.setLineDash([5, 4]);
      x.strokeRect(tx - CELL / 2 + 4, ty - CELL / 2 + 4, CELL - 8, CELL - 8);
      x.restore();
    }

    /* 秋：地面坚果 + 土包 */
    var i, c;
    if (st.phase === 'autumn') {
      for (i = 0; i < st.nuts.length; i++) {
        var n = st.nuts[i]; if (n.taken) continue;
        var nx = X0 + (G.cx(n.cell) + 0.5) * CELL, ny = Y0 + (G.cy(n.cell) + 0.5) * CELL;
        var pu = 1 + Math.sin(this.t * 2.6 + i) * 0.045;
        nut(x, nx, ny, n.k, pu);
      }
      for (i = 0; i < st.buried.length && k < 1; i++) {
        var b = st.buried[i];
        var bx = X0 + (G.cx(b.cell) + 0.5) * CELL, by = Y0 + (G.cy(b.cell) + 0.5) * CELL;
        x.globalAlpha = 1 - k; mound(x, bx, by, b.k); x.globalAlpha = 1;
      }
    }
    /* 冬：雪坑 / 春天发芽 */
    if (winter) {
      for (c = 0; c < G.NC; c++) if (st.dug[c]) pit(x, X0 + (G.cx(c) + 0.5) * CELL, Y0 + (G.cy(c) + 0.5) * CELL);
      var sp = st.result ? st.result.sproutCells : null;
      if (sp) for (i = 0; i < sp.length; i++) {
        sapling(x, X0 + (G.cx(sp[i]) + 0.5) * CELL, Y0 + (G.cy(sp[i]) + 0.5) * CELL, 1.05, true);
      }
    }

    /* 松鼠 */
    var sx = X0 + (sq.px + 0.5) * CELL, sy = Y0 + (sq.py + 0.5) * CELL;
    squirrel(x, sx, sy, sq.face, sq.walk, st.phase);
    /* 动作光环 */
    if (st.act) {
      x.save();
      x.strokeStyle = st.act.type === 'dig' ? 'rgba(255,236,190,0.9)' : 'rgba(255,226,160,0.9)';
      x.lineWidth = 2.4;
      var pr = 1 - st.act.t / (st.act.type === 'dig' ? 0.42 : st.act.type === 'bury' ? 0.34 : 0.16);
      x.beginPath(); x.arc(sx, sy, 15, -1.5708, -1.5708 + pr * 6.2832); x.stroke();
      x.restore();
    }

    /* 粒子 */
    var p;
    for (i = 0; i < this.parts.length; i++) {
      p = this.parts[i]; var al = Math.max(0, p.t / p.l);
      x.globalAlpha = al;
      if (p.ring) {
        x.strokeStyle = p.c; x.lineWidth = 2.4 * al + 0.6;
        x.beginPath(); x.arc(p.x, p.y, p.r, 0, 6.2832); x.stroke();
      } else {
        x.fillStyle = p.c;
        x.beginPath(); x.arc(p.x, p.y, p.r * (0.5 + al * 0.7), 0, 6.2832); x.fill();
      }
    }
    x.globalAlpha = 1;
    for (i = 0; i < this.texts.length; i++) {
      p = this.texts[i]; var a2 = Math.max(0, Math.min(1, p.t / p.l * 1.6));
      x.globalAlpha = a2; x.fillStyle = p.c;
      x.font = '600 ' + (13 * p.sc) + 'px "Songti SC","SimSun",serif';
      x.textAlign = 'center'; x.fillText(p.s, p.x, p.y);
    }
    x.globalAlpha = 1; x.textAlign = 'left';

    /* 飘落物 */
    var isW = winter || st.phase === 'snow';
    var fc = isW ? PW.flake : PA.flake;
    for (i = 0; i < this.flakes.length; i++) {
      var f = this.flakes[i];
      f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.vr * dt;
      if (f.y > H + 14 || f.x < -20 || f.x > W + 20) this.flakes[i] = this._mkFlake(false);
      x.globalAlpha = f.a * (isW ? 0.9 : 0.7);
      x.fillStyle = fc;
      if (isW) { x.beginPath(); x.arc(f.x, f.y, f.r, 0, 6.2832); x.fill(); }
      else {
        x.save(); x.translate(f.x, f.y); x.rotate(f.rot);
        x.beginPath(); x.ellipse(0, 0, f.r * 1.8, f.r * 0.85, 0, 0, 6.2832); x.fill();
        x.restore();
      }
    }
    x.globalAlpha = 1;

    /* 柔光斑 + bokeh（HIROSTOPTIME 闪耀） */
    x.globalCompositeOperation = 'lighter';
    var P = isW ? PW : PA;
    if (this._blob) {
      x.globalAlpha = 0.5;
      var bx1 = W * 0.24 + Math.sin(this.t * 0.19) * 26, by1 = Y0 + 60 + Math.cos(this.t * 0.15) * 20;
      x.drawImage(this._blob, bx1 - 210, by1 - 210, 420, 420);
      x.globalAlpha = 0.32;
      x.drawImage(this._blob, W * 0.78 - 170, Y0 + 300 - 170, 340, 340);
      x.globalAlpha = 1;
    }
    for (i = 0; i < 4; i++) {
      var tw = 0.32 + 0.3 * (0.5 + 0.5 * Math.sin(this.t * 1.1 + i * 2.2));
      var stx = [64, 402, 128, 344][i], sty = [Y0 + 26, Y0 + 96, Y0 + 330, Y0 + 250][i];
      var ss = [7, 5, 4.5, 6][i] * (0.7 + tw * 0.6);
      x.globalAlpha = tw * 0.5; x.fillStyle = isW ? '#E6E2F4' : '#FFEFC8';
      x.beginPath();
      x.moveTo(stx, sty - ss); x.quadraticCurveTo(stx + ss * 0.16, sty - ss * 0.16, stx + ss, sty);
      x.quadraticCurveTo(stx + ss * 0.16, sty + ss * 0.16, stx, sty + ss);
      x.quadraticCurveTo(stx - ss * 0.16, sty + ss * 0.16, stx - ss, sty);
      x.quadraticCurveTo(stx - ss * 0.16, sty - ss * 0.16, stx, sty - ss);
      x.fill();
    }
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';

    /* 颗粒 */
    if (this._grain) { x.globalAlpha = 0.055; x.fillStyle = this._grain; x.fillRect(0, 0, W, H); x.globalAlpha = 1; }

    /* 白闪 */
    if (this.flash > 0) {
      x.globalAlpha = this.flash * 0.5; x.fillStyle = isW ? '#EFECFA' : '#FFF3D6';
      x.fillRect(0, 0, W, H); x.globalAlpha = 1;
    }

    this._panel(x, st, isW);
    x.restore();
  };

  /* ---------- 底部信息板：颊囊 / 埋藏音序 / 林地 ---------- */
  Render.prototype._panel = function (x, st, isW) {
    var ink = isW ? '#EDEAF6' : '#FFF0D2', dim = isW ? '#9A93B4' : '#C6A76A';
    var panelY = Y0 + ROWS * CELL + 18;
    x.save();
    var gd = x.createLinearGradient(0, panelY - 6, 0, H);
    gd.addColorStop(0, 'rgba(0,0,0,0)'); gd.addColorStop(0.25, isW ? 'rgba(28,25,40,0.72)' : 'rgba(44,32,12,0.66)');
    gd.addColorStop(1, isW ? 'rgba(20,18,29,0.9)' : 'rgba(30,22,8,0.9)');
    x.fillStyle = gd; x.fillRect(0, panelY - 6, W, H - panelY + 6);

    /* 颊囊 */
    x.fillStyle = dim; x.font = '11px "Songti SC","SimSun",serif';
    x.fillText('颊囊', 16, panelY + 14);
    x.fillStyle = ink; x.font = '12px "Songti SC","SimSun",serif';
    x.fillText(st.pouch.length + ' / ' + st.L.cap, 46, panelY + 14);
    var i;
    for (i = 0; i < st.L.cap; i++) {
      var bx = 16 + i * 29, by = panelY + 22;
      x.strokeStyle = isW ? 'rgba(200,194,226,0.35)' : 'rgba(240,214,150,0.34)';
      x.lineWidth = 1; x.strokeRect(bx, by, 25, 25);
      if (i < st.pouch.length) nut(x, bx + 12.5, by + 13, st.pouch[i], 0.82);
    }
    /* 秋：提示 */
    if (st.phase === 'autumn') {
      x.fillStyle = dim; x.font = '11px "Songti SC","SimSun",serif'; x.textAlign = 'right';
      x.fillText('已埋 ' + st.buried.length, W - 16, panelY + 14); x.textAlign = 'left';
    } else {
      x.fillStyle = dim; x.font = '11px "Songti SC","SimSun",serif'; x.textAlign = 'right';
      x.fillText('配额 ' + st.digLeft + ' · 寻回 ' + st.found + ' / ' + st.buried.length, W - 16, panelY + 14);
      x.textAlign = 'left';
    }

    /* 埋藏音序（通感：埋的顺序 = 冬天听到的调子） */
    var y2 = panelY + 66;
    x.fillStyle = dim; x.font = '11px "Songti SC","SimSun",serif';
    x.fillText('埋藏 · 音序', 16, y2);
    var PENT = [0, 2, 4, 7, 9];
    for (i = 0; i < st.buried.length; i++) {
      var b = st.buried[i], bx2 = 92 + i * 24, byy = y2 - 4;
      var hgt = 3 + (PENT[b.order % 5] + 12 * Math.floor(b.order / 5)) * 0.85;
      x.strokeStyle = 'rgba(255,255,255,0.10)'; x.lineWidth = 1;
      x.beginPath(); x.moveTo(bx2, byy + 2); x.lineTo(bx2, byy + 2 - 16); x.stroke();
      if (b.found) { x.fillStyle = G.KINDS[b.k].c1; x.fillRect(bx2 - 1, byy + 2 - hgt, 2.4, hgt); }
      x.fillStyle = b.found ? G.KINDS[b.k].c1 : (isW ? 'rgba(230,226,244,0.45)' : G.KINDS[b.k].c2);
      x.beginPath(); x.arc(bx2, byy + 7, b.found ? 4 : 3, 0, 6.2832); x.fill();
    }
    if (!st.buried.length) {
      x.fillStyle = dim; x.font = '11px "Songti SC","SimSun",serif';
      x.fillText('— 还没有藏下任何东西 —', 92, y2);
    }

    /* 林地（跨局长线） */
    var y3 = panelY + 108;
    x.fillStyle = dim; x.font = '11px "Songti SC","SimSun",serif';
    var trees = (this.forest | 0) + (st.result ? st.result.sprouts : 0);
    x.fillText('林地 · 已长出 ' + trees + ' 株', 16, y3);
    var shown = Math.min(trees, 60);
    for (i = 0; i < shown; i++) {
      var col = i % 20, row = (i / 20) | 0;
      sapling(x, 24 + col * 22, y3 + 20 + row * 26, 0.62, true);
    }
    if (trees > 60) { x.fillStyle = dim; x.font = '10px "Songti SC","SimSun",serif'; x.fillText('…', W - 26, y3 + 20); }
    x.restore();
  };

  Render.prototype.cellAt = function (mx, my) {
    var gx = Math.floor((mx - X0) / CELL), gy = Math.floor((my - Y0) / CELL);
    if (gx < 0 || gy < 0 || gx >= COLS || gy >= ROWS) return -1;
    return gy * COLS + gx;
  };

  Render.W = W; Render.H = H; Render.CELL = CELL; Render.X0 = X0; Render.Y0 = Y0;
  root.WC = { Render: Render };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.WC;
})(typeof window !== 'undefined' ? window : globalThis);
