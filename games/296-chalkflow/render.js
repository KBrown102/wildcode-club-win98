/* 296-chalkflow《粉线 · 引珠坡》— 渲染层（Canvas2D + 稚拙涂鸦 / 手绘插画风） */
(function (root) {
  'use strict';
  var C = root.CHALK || (typeof require === 'function' ? require('./game.js') : null);

  var PAPER = '#F3ECDD', GRID = '#DFD6C0', GRID2 = '#E7DFCB', INK = '#2B2A28';
  var CHALK_COL = ['#FBF7EC', '#C4553B', '#3E6B8F', '#E0A93B', '#6E8B5B'];
  var DESK = '#DCD2B9';

  var R = {
    cv: null, ctx: null, bake: null, dpr: 1, W: 560, H: 760,
    parts: [], pops: [], shards: [], rings: [],
    muted: false, actx: null, t: 0
  };

  /* ---------- 工具 ---------- */
  function jitterPath(pts) {
    var jp = [], n = pts.length;
    for (var i = 0; i < n; i++) {
      var p = pts[i];
      var a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      var dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
      var nx = -dy / L, ny = dx / L;
      var k = Math.sin(i * 1.734) * 1.25 + Math.sin(i * 0.51 + 1.3) * 0.75;
      jp.push({ x: p.x + nx * k, y: p.y + ny * k });
    }
    return jp;
  }
  function ensureJP(s) {
    if (!s.jp) { s.jp = jitterPath(s.pts); s.spk = []; var seed = s.id * 131 + 7; for (var i = 0; i < s.pts.length; i += 2) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; var r = (seed / 0x7fffffff) - 0.5; s.spk.push({ x: s.pts[i].x + r * 7, y: s.pts[i].y + (0.5 - r) * 7, a: 0.18 + Math.abs(r) * 0.22 }); } }
    return s.jp;
  }
  function roughPoly(ctx, cx, cy, r, pts, wob) {
    ctx.beginPath();
    var n = pts.length;
    for (var i = 0; i <= n; i++) {
      var p = pts[i % n];
      var rr = r * p.m * (1 + Math.sin(i * 2.1 + wob) * 0.03);
      var x = cx + Math.cos(p.a) * rr, y = cy + Math.sin(p.a) * rr;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  /* ---------- 静态层烘焙 ---------- */
  function bake(st) {
    var W = st.W, H = st.H;
    if (!R.bake) R.bake = document.createElement('canvas');
    var k = R.dpr;
    R.bake.width = Math.round(W * k); R.bake.height = Math.round(H * k);
    var c = R.bake.getContext('2d');
    c.setTransform(k, 0, 0, k, 0, 0);
    c.clearRect(0, 0, W, H);

    // 纸底
    c.fillStyle = PAPER; c.fillRect(0, 0, W, H);
    // 纸纤维
    var sd = 12345;
    function rnd() { sd = (sd * 1103515245 + 12345) & 0x7fffffff; return sd / 0x7fffffff; }
    c.fillStyle = 'rgba(120,105,80,0.045)';
    for (var i = 0; i < 900; i++) c.fillRect(rnd() * W, rnd() * H, 1.4, 1.4);
    // 横格线
    c.lineWidth = 1;
    for (var y = 34; y < H - 20; y += 26) {
      c.strokeStyle = GRID2; c.beginPath(); c.moveTo(10, y + 0.5); c.lineTo(W - 10, y + 0.5); c.stroke();
    }
    for (var x = 26; x < W; x += 26) {
      c.strokeStyle = 'rgba(190,178,150,0.20)'; c.beginPath(); c.moveTo(x + 0.5, 16); c.lineTo(x + 0.5, H - 22); c.stroke();
    }
    // 页面边框（手绘双线）
    c.strokeStyle = GRID; c.lineWidth = 2;
    c.beginPath(); c.moveTo(6, 6); c.lineTo(W - 6, 7.5); c.lineTo(W - 7, H - 6); c.lineTo(5, H - 5); c.closePath(); c.stroke();

    // 桌沿（球掉下去的那条线）
    var dy = H - 14;
    c.fillStyle = DESK; c.fillRect(0, dy, W, 14);
    c.strokeStyle = 'rgba(43,42,40,0.30)'; c.lineWidth = 2;
    c.beginPath();
    for (var xx = 0; xx <= W; xx += 12) c.lineTo(xx, dy + Math.sin(xx * 0.07) * 1.1);
    c.stroke();

    // 墨石
    for (var r0 = 0; r0 < st.rocks.length; r0++) {
      var rk = st.rocks[r0];
      c.save();
      roughPoly(c, rk.x, rk.y, rk.r, rk.pts, rk.seedk * 6);
      var g = c.createRadialGradient(rk.x - rk.r * 0.35, rk.y - rk.r * 0.4, rk.r * 0.15, rk.x, rk.y, rk.r * 1.15);
      g.addColorStop(0, '#4A4741'); g.addColorStop(0.6, '#332F2A'); g.addColorStop(1, '#241F1B');
      c.fillStyle = g; c.fill();
      c.strokeStyle = INK; c.lineWidth = 2.4; c.stroke();
      // 飞白
      c.globalAlpha = 0.5; c.strokeStyle = '#6E675C'; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(rk.x - rk.r * 0.45, rk.y - rk.r * 0.15);
      c.quadraticCurveTo(rk.x - rk.r * 0.05, rk.y - rk.r * 0.5, rk.x + rk.r * 0.4, rk.y - rk.r * 0.3);
      c.stroke(); c.globalAlpha = 1;
      c.restore();
    }

    // 桶
    for (var b0 = 0; b0 < st.bins.length; b0++) {
      var bn = st.bins[b0];
      var bx = bn.x, by = bn.y, bw = bn.w, bh = bn.h;
      c.save();
      // 桶身
      c.beginPath();
      c.moveTo(bx + 3, by); c.lineTo(bx + bw - 3, by);
      c.lineTo(bx + bw - 9, by + bh); c.lineTo(bx + 9, by + bh); c.closePath();
      var bg = c.createLinearGradient(bx, by, bx, by + bh);
      bg.addColorStop(0, bn.tint); bg.addColorStop(1, 'rgba(43,42,40,0.55)');
      c.fillStyle = bg; c.fill();
      c.strokeStyle = INK; c.lineWidth = 2.6; c.stroke();
      // 桶口
      c.beginPath(); c.ellipse(bx + bw / 2, by, bw / 2 - 1, 6.5, 0, 0, Math.PI * 2);
      c.fillStyle = 'rgba(30,28,25,0.55)'; c.fill();
      c.strokeStyle = INK; c.lineWidth = 2.6; c.stroke();
      // 分值
      c.fillStyle = '#FBF3E0';
      c.font = '700 22px "STKaiti","KaiTi","Kaiti SC","楷体",Georgia,serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(String(bn.val), bx + bw / 2, by + bh * 0.58 + 1);
      c.restore();
    }

    // 漏斗
    var fx = st.funnel.x, fy = st.funnel.y;
    c.save();
    c.beginPath();
    c.moveTo(fx - 36, fy - 62); c.lineTo(fx + 36, fy - 62);
    c.lineTo(fx + 9, fy - 10); c.lineTo(fx + 9, fy + 2);
    c.lineTo(fx - 9, fy + 2); c.lineTo(fx - 9, fy - 10); c.closePath();
    c.fillStyle = '#4E4A42'; c.fill();
    c.strokeStyle = INK; c.lineWidth = 2.6; c.stroke();
    c.beginPath(); c.ellipse(fx, fy - 62, 36, 7, 0, 0, Math.PI * 2);
    c.fillStyle = '#332F2A'; c.fill(); c.strokeStyle = INK; c.lineWidth = 2.4; c.stroke();
    c.restore();
    return R.bake;
  }

  /* ---------- 粒子 ---------- */
  function dust(x, y, col, n, sp) {
    for (var i = 0; i < n; i++) {
      if (R.parts.length > 260) break;
      var a = Math.random() * Math.PI * 2, v = (sp || 40) * (0.3 + Math.random());
      R.parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 12, life: 0.5 + Math.random() * 0.5, t: 0, r: 1 + Math.random() * 2, c: col });
    }
  }
  function pop(x, y, txt, col) { R.pops.push({ x: x, y: y, t: 0, txt: txt, c: col }); if (R.pops.length > 24) R.pops.shift(); }
  function ring(x, y, col) { R.rings.push({ x: x, y: y, t: 0, c: col }); if (R.rings.length > 14) R.rings.shift(); }

  /* ---------- 音效（五声音阶） ---------- */
  var SCALE = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25];
  function actx() {
    if (R.actx) return R.actx;
    try { R.actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { R.actx = null; }
    return R.actx;
  }
  function tone(freq, dur, type, vol, when) {
    if (R.muted) return;
    var a = actx(); if (!a) return;
    if (a.state === 'suspended') a.resume();
    var t0 = a.currentTime + (when || 0);
    var o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.16, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(dur, vol, f) {
    if (R.muted) return;
    var a = actx(); if (!a) return;
    if (a.state === 'suspended') a.resume();
    var n = Math.floor(a.sampleRate * dur);
    var buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.2);
    var src = a.createBufferSource(); src.buffer = buf;
    var bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f || 2400; bp.Q.value = 1.1;
    var g = a.createGain(); g.gain.value = vol || 0.13;
    src.connect(bp); bp.connect(g); g.connect(a.destination); src.start();
  }
  var SFX = {
    spawn: function () { tone(523.25, 0.10, 'triangle', 0.07); },
    score: function (v) { var i = v >= 8 ? 7 : (v >= 5 ? 5 : (v >= 3 ? 3 : 1)); tone(SCALE[i], 0.34, 'sine', 0.19); tone(SCALE[i] * 2, 0.18, 'sine', 0.06, 0.02); },
    lost: function () { tone(150, 0.16, 'sine', 0.06); },
    brk: function () { noise(0.13, 0.10, 3000); },
    draw: function () { noise(0.07, 0.035, 1800); },
    erase: function () { noise(0.16, 0.07, 900); },
    deny: function () { tone(120, 0.10, 'square', 0.05); },
    end: function (star) { var s = star || 0; [0, 2, 4, 7].forEach(function (k, i) { tone(SCALE[Math.min(7, k + (s > 0 ? 2 : 0))] * (s >= 2 ? 2 : 1), 0.5, 'sine', 0.15, i * 0.13); }); }
  };

  /* ---------- 事件消费 ---------- */
  function consume(st) {
    var ev = st.events;
    for (var i = 0; i < ev.length; i++) {
      var e = ev[i];
      if (e.t === 'score') { SFX.score(e.val); dust(e.x, e.y - 6, '#E8D9AE', 12, 70); ring(e.x, e.y, '#F0E2BC'); pop(e.x, e.y - 18, '+' + e.val, '#B0763A'); }
      else if (e.t === 'lost') { SFX.lost(); dust(e.x, e.y, '#9A9078', 5, 30); }
      else if (e.t === 'break') { SFX.brk(); dust(e.x, e.y, '#EFE6CE', 7, 46); }
      else if (e.t === 'spawn') { SFX.spawn(); }
      else if (e.t === 'draw') { SFX.draw(); }
      else if (e.t === 'erase') { SFX.erase(); }
      else if (e.t === 'deny') { SFX.deny(); dust(e.x, e.y, '#C4553B', 5, 34); }
      else if (e.t === 'end') { SFX.end(e.star); }
    }
    ev.length = 0;
  }

  /* ---------- 画笔画 ---------- */
  function drawStrokes(c, st) {
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (var i = 0; i < st.strokes.length; i++) {
      var s = st.strokes[i], col = CHALK_COL[s.color] || CHALK_COL[0];
      var jp = ensureJP(s);
      var mx = 0;
      for (var q = 0; q < s.segs.length; q++) mx = Math.max(mx, 1 - s.segs[q].hp);
      if (mx < 0.02) {
        // 全新：整笔一次画完（尘晕 + 主线 + 颗粒）
        c.globalAlpha = 0.16; c.strokeStyle = col; c.lineWidth = 8.5;
        c.beginPath(); c.moveTo(jp[0].x, jp[0].y); for (var k = 1; k < jp.length; k++) c.lineTo(jp[k].x, jp[k].y); c.stroke();
        c.globalAlpha = 1; c.lineWidth = 3.6;
        c.beginPath(); c.moveTo(jp[0].x, jp[0].y); for (var k2 = 1; k2 < jp.length; k2++) c.lineTo(jp[k2].x, jp[k2].y); c.stroke();
        c.globalAlpha = 0.30; c.fillStyle = col;
        for (var z = 0; z < s.spk.length; z++) c.fillRect(s.spk[z].x, s.spk[z].y, 1.7, 1.7);
        c.globalAlpha = 1;
      } else {
        // 有磨损：逐段按 hp 画（宽度 + 透明度随磨损衰减）
        for (var g = 0; g < s.segs.length; g++) {
          var sg = s.segs[g], hp = sg.hp;
          var i0 = g, i1 = g + 1;
          if (i1 >= jp.length) break;
          if (hp <= 0) continue;
          c.globalAlpha = 0.30 + 0.70 * hp;
          c.lineWidth = 1.6 + 2.0 * hp;
          c.strokeStyle = col;
          c.beginPath(); c.moveTo(jp[i0].x, jp[i0].y); c.lineTo(jp[i1].x, jp[i1].y); c.stroke();
        }
        c.globalAlpha = 1;
      }
    }
    c.globalAlpha = 1;
  }

  function drawBalls(c, st) {
    var pal = ['#6E8B5B', '#C4553B', '#3E6B8F', '#B8944A', '#8A6A8E'];
    for (var i = 0; i < st.balls.length; i++) {
      var b = st.balls[i];
      c.beginPath(); c.arc(b.x, b.y + 2, b.r * 0.95, 0, Math.PI * 2);
      c.fillStyle = 'rgba(43,42,40,0.16)'; c.fill();
      c.beginPath(); c.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      var g = c.createRadialGradient(b.x - b.r * 0.35, b.y - b.r * 0.4, 1, b.x, b.y, b.r);
      g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.35, pal[b.hue % 5]); g.addColorStop(1, 'rgba(43,42,40,0.85)');
      c.fillStyle = g; c.fill();
      c.lineWidth = 1.6; c.strokeStyle = 'rgba(43,42,40,0.75)'; c.stroke();
      c.save(); c.translate(b.x, b.y); c.rotate(b.spin);
      c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(-b.r * 0.5, 0); c.lineTo(b.r * 0.5, 0); c.stroke(); c.restore();
    }
  }

  function drawFx(c, dt) {
    var i;
    for (i = R.parts.length - 1; i >= 0; i--) {
      var p = R.parts[i]; p.t += dt;
      if (p.t >= p.life) { R.parts.splice(i, 1); continue; }
      p.vy += 240 * dt; p.vx *= 0.97; p.x += p.vx * dt; p.y += p.vy * dt;
      c.globalAlpha = (1 - p.t / p.life) * 0.8;
      c.fillStyle = p.c; c.fillRect(p.x, p.y, p.r, p.r);
    }
    c.globalAlpha = 1;
    for (i = R.rings.length - 1; i >= 0; i--) {
      var g2 = R.rings[i]; g2.t += dt;
      if (g2.t >= 0.5) { R.rings.splice(i, 1); continue; }
      c.globalAlpha = (1 - g2.t / 0.5) * 0.7;
      c.strokeStyle = g2.c; c.lineWidth = 3;
      c.beginPath(); c.arc(g2.x, g2.y, 10 + g2.t * 60, 0, Math.PI * 2); c.stroke();
    }
    c.globalAlpha = 1;
    for (i = R.pops.length - 1; i >= 0; i--) {
      var q = R.pops[i]; q.t += dt;
      if (q.t >= 0.9) { R.pops.splice(i, 1); continue; }
      c.globalAlpha = 1 - q.t / 0.9;
      c.fillStyle = q.c;
      c.font = '700 20px "STKaiti","KaiTi","Kaiti SC","楷体",Georgia,serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(q.txt, q.x, q.y - q.t * 34);
    }
    c.globalAlpha = 1;
  }

  function drawBinFlash(c, st) {
    for (var i = 0; i < st.bins.length; i++) {
      var bn = st.bins[i];
      if (bn.flash <= 0) continue;
      c.globalAlpha = bn.flash * 0.5;
      c.fillStyle = '#F6E7BE';
      c.fillRect(bn.x - 3, bn.y - 4, bn.w + 6, bn.h + 6);
      c.globalAlpha = 1;
    }
  }

  /* ---------- 主绘制 ---------- */
  function frame(st, dt) {
    var c = R.ctx;
    c.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
    c.clearRect(0, 0, R.W, R.H);
    if (R.bake) c.drawImage(R.bake, 0, 0, R.W, R.H);
    drawBinFlash(c, st);
    drawStrokes(c, st);
    drawBalls(c, st);
    drawFx(c, dt);
    // 正在画的预览笔
    if (R.live && R.live.length > 1) {
      c.globalAlpha = 0.55; c.strokeStyle = CHALK_COL[R.liveColor || 0]; c.lineWidth = 3.4; c.lineCap = 'round';
      c.beginPath(); c.moveTo(R.live[0].x, R.live[0].y);
      for (var i = 1; i < R.live.length; i++) c.lineTo(R.live[i].x, R.live[i].y);
      c.stroke(); c.globalAlpha = 1;
    }
  }

  function reset() { R.parts.length = 0; R.pops.length = 0; R.rings.length = 0; }

  root.CHALK_R = {
    R: R, bake: bake, frame: frame, consume: consume, reset: reset,
    dust: dust, pop: pop, ring: ring, SFX: SFX, SCALE: SCALE,
    setMute: function (m) { R.muted = !!m; },
    resume: function () { var a = actx(); if (a && a.state === 'suspended') a.resume(); }
  };
})(typeof self !== 'undefined' ? self : this);
