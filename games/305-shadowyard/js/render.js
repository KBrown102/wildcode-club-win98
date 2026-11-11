/* 305-shadowyard · render.js —— 纯 Canvas 绘制层（世界 + 托盘），UI 交给 DOM/CSS */
(function () {
  'use strict';
  var G = null, cv = null, ctx = null, bg = null, layer = null, lctx = null;
  var DPR = 1, SC = 1, dirty = true;
  var pts = [];

  var C = {
    paper: '#EFE7D6', paper2: '#E6DCC7', wall: '#C6BBA4', wallIn: '#B4A88F',
    ink: '#3B4350', ink2: '#5A616E',
    shad: '#2C3A57',
    warm: '#C4553B', warmDim: 'rgba(196,85,59,0.30)',
    sun: '#D9A441', sunDim: 'rgba(217,164,65,0.34)',
    moss: '#6E8B5B', paperline: 'rgba(90,74,48,0.055)',
    tray: '#E3D8C2', trayLine: '#C6BBA4'
  };

  function rr(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function poly(c, p) {
    c.beginPath(); c.moveTo(p[0].x, p[0].y);
    for (var i = 1; i < p.length; i++) c.lineTo(p[i].x, p[i].y);
    c.closePath();
  }

  function init(canvas, g) {
    G = g; cv = canvas; ctx = cv.getContext('2d');
    bg = document.createElement('canvas'); bg.width = G.W; bg.height = G.H;
    layer = document.createElement('canvas'); layer.width = G.YW; layer.height = G.YH;
    lctx = layer.getContext('2d');
    bake();
  }

  function resize(sc, dpr) {
    SC = sc; DPR = dpr;
    var k = Math.min(dpr * sc, 2.6);
    var bw = Math.ceil(G.W * k), bh = Math.ceil(G.H * k);
    if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
    cv.style.width = G.W + 'px'; cv.style.height = G.H + 'px';
    bake();
  }

  // ---------- 背景一次烘焙 ----------
  function bake() {
    var c = bg.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, G.W, G.H);
    c.fillStyle = C.paper; c.fillRect(0, 0, G.W, G.H);

    // 院墙
    var X0 = G.YX0, Y0 = G.YY0, WW = G.YW, HH = G.YH, b = 13;
    c.fillStyle = C.wall;
    rr(c, X0 - b, Y0 - b, WW + b * 2, HH + b * 2, 8); c.fill();
    c.fillStyle = C.paper;
    c.fillRect(X0, Y0, WW, HH);
    // 地面极淡的斜纹
    c.save(); c.beginPath(); c.rect(X0, Y0, WW, HH); c.clip();
    c.strokeStyle = C.paperline; c.lineWidth = 1;
    var i;
    for (i = -HH; i < WW; i += 26) {
      c.beginPath(); c.moveTo(X0 + i, Y0); c.lineTo(X0 + i + HH, Y0 + HH); c.stroke();
    }
    // 砖缝
    c.strokeStyle = 'rgba(90,74,48,0.045)';
    for (i = 1; i < G.COLS; i++) { c.beginPath(); c.moveTo(X0 + i * G.CELL, Y0); c.lineTo(X0 + i * G.CELL, Y0 + HH); c.stroke(); }
    for (i = 1; i < G.ROWS; i++) { c.beginPath(); c.moveTo(X0, Y0 + i * G.CELL); c.lineTo(X0 + WW, Y0 + i * G.CELL); c.stroke(); }
    // 几块石板
    var rnd = G.mulberry32(20260916);
    c.fillStyle = 'rgba(150,138,112,0.075)';
    for (i = 0; i < 16; i++) {
      var sx = X0 + 30 + rnd() * (WW - 60), sy = Y0 + 30 + rnd() * (HH - 60);
      var sw = 40 + rnd() * 70, sh = 24 + rnd() * 34;
      rr(c, sx, sy, sw, sh, 5); c.fill();
    }
    c.restore();

    // 颗粒
    var r2 = G.mulberry32(7788);
    for (i = 0; i < 3400; i++) {
      var x = r2() * G.W, y = r2() * G.H;
      c.fillStyle = 'rgba(' + (r2() < 0.5 ? '90,74,48,' : '255,255,255,') + (0.016 + r2() * 0.03).toFixed(3) + ')';
      c.fillRect(x, y, 1, 1);
    }
    // 院墙内阴影
    c.strokeStyle = 'rgba(40,32,20,0.16)'; c.lineWidth = 3;
    c.strokeRect(X0 - 1.5, Y0 - 1.5, WW + 3, HH + 3);
    // 底部托盘底
    c.fillStyle = C.tray;
    rr(c, 20, G.TRAY_Y, G.W - 40, G.TRAY_H, 10); c.fill();
    c.strokeStyle = C.trayLine; c.lineWidth = 1.5;
    rr(c, 20, G.TRAY_Y, G.W - 40, G.TRAY_H, 10); c.stroke();
  }

  // ---------- 影子遮罩（避免叠加过黑） ----------
  // mode 'fill' = 实心（当下这一刻）；'line' = 只描边（全天影迹，画成一把扇子才看得懂）
  function shadowPass(st, list, alpha, mode) {
    var c = lctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, G.YW, G.YH);
    c.save();
    c.translate(-G.YX0, -G.YY0);
    c.fillStyle = C.shad;
    c.strokeStyle = C.shad;
    c.lineCap = 'round';
    c.lineWidth = 1.6;
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (s.t === 'cap') {
        if (mode === 'line') {
          c.globalAlpha = 1;
          c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(s.x + s.dx, s.y + s.dy);
          c.lineWidth = s.r * 2; c.stroke();
          c.lineWidth = 1.6;
        } else {
          c.lineWidth = s.r * 2;
          c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(s.x + s.dx, s.y + s.dy); c.stroke();
        }
      } else { poly(c, s.pts); if (mode === 'line') c.stroke(); else c.fill(); }
    }
    c.globalAlpha = 1;
    c.restore();
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(layer, G.YX0, G.YY0);
    ctx.restore();
  }

  // ---------- 物件 ----------
  function drawObj(c, o, x, y, ang, alpha, scale) {
    var k = G.KINDS[o.kind];
    var col = (o.kind === 0 || o.kind === 1) ? '#49523F' : (o.kind === 5 ? '#575D68' : C.ink);
    c.save(); c.globalAlpha = alpha; c.translate(x, y); c.scale(scale || 1, scale || 1); c.rotate(ang);
    c.fillStyle = col;
    if (k.shape === 'circle') {
      c.beginPath(); c.arc(0, 0, k.rx, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(255,248,232,0.20)';
      c.beginPath(); c.arc(-k.rx * 0.28, -k.rx * 0.3, k.rx * 0.52, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(255,248,232,0.28)'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(0, 0, k.rx - 3, 0, Math.PI * 2); c.stroke();
    } else {
      rr(c, -k.rx, -k.ry, k.rx * 2, k.ry * 2, 4); c.fill();
      c.fillStyle = 'rgba(255,248,232,0.16)';
      c.fillRect(-k.rx + 4, -k.ry + 4, k.rx * 2 - 8, (k.ry * 2 - 8) * 0.42);
      c.strokeStyle = 'rgba(255,248,232,0.26)'; c.lineWidth = 1.4;
      rr(c, -k.rx + 3, -k.ry + 3, k.rx * 2 - 6, k.ry * 2 - 6, 3); c.stroke();
    }
    c.restore();
    // 高度徽记
    c.save(); c.globalAlpha = alpha;
    var bx = x + (k.shape === 'circle' ? k.rx : k.rx) - 2, by = y - (k.shape === 'circle' ? k.rx : k.ry) - 2;
    c.fillStyle = 'rgba(51,58,70,0.90)';
    c.beginPath(); c.arc(bx, by, 11, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#F3EAD8'; c.font = '600 12px "Noto Serif SC",serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('' + Math.round(o.h / 10), bx, by);
    c.restore();
  }

  // ---------- 格子标记 ----------
  function drawMark(c, cell, st, previewK, view) {
    var x = cell.wx - G.CELL / 2 + 1.5, y = cell.wy - G.CELL / 2 + 1.5, s = G.CELL - 3;
    var isShade = cell.type === 'shade';
    var done = cell.done;
    var col = isShade ? (done ? C.moss : C.warm) : (done ? C.moss : C.sun);
    c.save();
    c.lineWidth = 2.4;
    if (isShade) { c.setLineDash([6, 4]); } else { c.setLineDash([]); }
    c.strokeStyle = col;
    rr(c, x, y, s, s, 4); c.stroke();
    c.setLineDash([]);
    c.fillStyle = isShade ? (done ? 'rgba(110,139,91,0.13)' : C.warmDim.replace('0.30', '0.10')) : 'rgba(217,164,65,0.12)';
    rr(c, x, y, s, s, 4); c.fill();
    // 字
    c.fillStyle = col; c.font = '600 14px "Noto Serif SC",serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(cell.icon, cell.wx, cell.wy - 3);
    // 时辰点
    var T = st.T, n = T, w = 4, gap = 1.5;
    var tw = n * w + (n - 1) * gap, sx = cell.wx - tw / 2 + w / 2, sy = cell.wy + 9.5;
    for (var k = 0; k < T; k++) {
      var need = isShade ? !!(cell.req & (1 << k)) : false;
      var got = !!(cell.got & (1 << k));
      if (view && view.liveGot && k === previewK) got = !!(view.liveGot[cell.i] & (1 << k));
      c.beginPath(); c.arc(sx + k * (w + gap), sy, w / 2, 0, Math.PI * 2);
      if (isShade) {
        if (got && need) c.fillStyle = C.moss;
        else if (got) c.fillStyle = 'rgba(110,139,91,0.55)';
        else if (need) c.fillStyle = 'rgba(196,85,59,0.85)';
        else c.fillStyle = 'rgba(120,104,80,0.22)';
      } else {
        c.fillStyle = got ? C.warm : 'rgba(120,104,80,0.22)';
      }
      c.fill();
      if (k === previewK) {
        c.strokeStyle = 'rgba(51,58,70,0.75)'; c.lineWidth = 1.2;
        c.beginPath(); c.arc(sx + k * (w + gap), sy, w / 2 + 2, 0, Math.PI * 2); c.stroke();
      }
    }
    c.restore();
  }

  // ---------- 粒子 ----------
  function burst(x, y, col, n, sp) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, v = (0.3 + Math.random()) * (sp || 46);
      pts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, col: col, r: 1.4 + Math.random() * 2.2 });
    }
    if (pts.length > 260) pts.splice(0, pts.length - 260);
  }
  function stepPts(dt) {
    for (var i = pts.length - 1; i >= 0; i--) {
      var p = pts[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.94; p.vy *= 0.94; p.life -= dt * 1.5;
      if (p.life <= 0) pts.splice(i, 1);
    }
  }

  // ---------- 主绘制 ----------
  function draw(st, view, dt) {
    var c = ctx;
    c.setTransform(cv.width / G.W, 0, 0, cv.height / G.H, 0, 0);
    c.clearRect(0, 0, G.W, G.H);
    c.drawImage(bg, 0, 0);

    var X0 = G.YX0, Y0 = G.YY0, WW = G.YW, HH = G.YH;
    var previewK = view.previewK || 0;

    // 阳光方向暖洗
    var sun = st.sun;
    var cx = X0 + WW / 2, cy = Y0 + HH / 2, R = Math.max(WW, HH) * 0.62;
    var sx = cx + Math.cos(sun.az) * R, sy = cy + Math.sin(sun.az) * R;
    var gx = c.createLinearGradient(cx - Math.cos(sun.az) * R, cy - Math.sin(sun.az) * R, sx, sy);
    gx.addColorStop(0, 'rgba(232,168,74,0.00)');
    gx.addColorStop(1, 'rgba(240,186,92,0.20)');
    c.save(); c.beginPath(); c.rect(X0, Y0, WW, HH); c.clip();
    c.fillStyle = gx; c.fillRect(X0, Y0, WW, HH);

    // 影迹（全天各时辰的淡影）
    var trails = [], cur = [], i, k, o;
    for (i = 0; i < st.objs.length; i++) {
      o = st.objs[i];
      if (!o.placed) continue;
      for (k = 0; k < st.T; k++) {
        var sk = G.sunAt(st.moments[k], st.cfg);
        trails.push(G.shadowShape(o, sk));
        if (k === previewK) cur.push(G.shadowShape(o, sk));
      }
    }
    if (view.ghost && view.ghost.ok !== false) {
      var go = view.ghost;
      for (k = 0; k < st.T; k++) {
        var sk2 = G.sunAt(st.moments[k], st.cfg);
        trails.push(G.shadowShape({ kind: go.kind, x: go.x, y: go.y, ang: go.ang, h: go.h, sc: 1 }, sk2));
      }
    }
    if (trails.length) shadowPass(st, trails, view.ghost ? 0.19 : 0.115, 'line');
    if (cur.length) shadowPass(st, cur, 0.46, 'fill');

    // 太阳贴着院墙走：把日的位置投影到院内边界上，一眼看清「现在日头在哪边」
    var half = { x: WW / 2, y: HH / 2 };
    var ts = Infinity;
    if (Math.abs(Math.cos(sun.az)) > 1e-6) ts = Math.min(ts, half.x / Math.abs(Math.cos(sun.az)));
    if (Math.abs(Math.sin(sun.az)) > 1e-6) ts = Math.min(ts, half.y / Math.abs(Math.sin(sun.az)));
    var sunx = cx + Math.cos(sun.az) * ts, suny = cy + Math.sin(sun.az) * ts;
    c.save();
    c.beginPath(); c.rect(X0, Y0, WW, HH); c.clip();
    var rg2 = c.createRadialGradient(sunx, suny, 1, sunx, suny, 40);
    rg2.addColorStop(0, 'rgba(255,240,200,0.95)');
    rg2.addColorStop(0.3, 'rgba(240,190,96,0.42)');
    rg2.addColorStop(1, 'rgba(240,190,96,0)');
    c.fillStyle = rg2; c.beginPath(); c.arc(sunx, suny, 40, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#FFF3D2'; c.beginPath(); c.arc(sunx, suny, 6.5, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(255,243,210,0.75)'; c.lineWidth = 1.4;
    c.beginPath(); c.arc(sunx, suny, 12, 0, Math.PI * 2); c.stroke();
    c.restore();
    c.restore(); // 解除阳光暖洗的 clip

    // 格子标记
    for (i = 0; i < st.cells.length; i++) drawMark(c, st.cells[i], st, previewK, view);

    // 物件
    for (i = 0; i < st.objs.length; i++) {
      o = st.objs[i];
      if (!o.placed) continue;
      drawObj(c, o, o.x, o.y, o.ang, 1, 1);
      if (st.sel === o.id) {
        c.save(); c.strokeStyle = 'rgba(196,85,59,0.95)'; c.lineWidth = 2.2;
        c.setLineDash([4, 3]);
        var br = G.boundR(o) + 7;
        c.beginPath(); c.arc(o.x, o.y, br, 0, Math.PI * 2); c.stroke();
        c.restore();
      }
    }
    // 拖拽幽灵
    if (view.ghost) {
      var gh = view.ghost;
      drawObj(c, { kind: gh.kind, h: gh.h, sc: 1 }, gh.x, gh.y, gh.ang, 0.72, 1);
      c.save();
      c.strokeStyle = gh.ok ? 'rgba(110,139,91,0.95)' : 'rgba(196,85,59,0.95)';
      c.lineWidth = 2; c.setLineDash([4, 3]);
      c.beginPath(); c.arc(gh.x, gh.y, gh.r + 7, 0, Math.PI * 2); c.stroke();
      c.restore();
    }

    // 粒子
    stepPts(dt);
    for (i = 0; i < pts.length; i++) {
      var p2 = pts[i];
      c.globalAlpha = Math.max(0, p2.life) * 0.85;
      c.fillStyle = p2.col;
      c.beginPath(); c.arc(p2.x, p2.y, p2.r, 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 1;

    // 托盘
    drawTray(c, st, view);
  }

  function drawTray(c, st, view) {
    var n = st.objs.length, i;
    c.save();
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = 'rgba(90,74,48,0.55)'; c.font = '12px "Noto Serif SC",serif';
    c.fillText(view.trayHint || '把物件拖进院子 · 拖回这里就是收起', G.W / 2, G.TRAY_Y + 10);
    for (i = 0; i < n; i++) {
      var o = st.objs[i], r = G.cardRect(i, n);
      if (o.placed) {
        c.save(); c.setLineDash([4, 4]); c.strokeStyle = 'rgba(120,104,80,0.30)'; c.lineWidth = 1.5;
        rr(c, r.x, r.y, r.w, r.h, 7); c.stroke(); c.restore();
        c.fillStyle = 'rgba(120,104,80,0.28)'; c.font = '12px "Noto Serif SC",serif';
        c.fillText('已安放', r.x + r.w / 2, r.y + r.h / 2);
        continue;
      }
      c.fillStyle = 'rgba(255,252,244,0.72)';
      rr(c, r.x, r.y, r.w, r.h, 7); c.fill();
      c.strokeStyle = 'rgba(120,104,80,0.38)'; c.lineWidth = 1.4;
      rr(c, r.x, r.y, r.w, r.h, 7); c.stroke();
      drawObj(c, o, r.x + r.w / 2, r.y + r.h / 2 - 8, 0, 1, 0.92);
      c.fillStyle = C.ink2; c.font = '12px "Noto Serif SC",serif';
      c.fillText(G.KINDS[o.kind].name + ' · ' + Math.round(o.h / 10) + '尺', r.x + r.w / 2, r.y + r.h - 16);
    }
    c.restore();
  }

  window.SC305R = { init: init, resize: resize, draw: draw, burst: burst, bake: bake, C: C };
})();
