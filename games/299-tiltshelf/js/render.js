/* 299-tiltshelf —— Canvas 世界渲染层 */
(function (root) {
  'use strict';
  var G = root.SC299;

  var KC = [
    { fill: '#CFE0E6', edge: '#7FA3AE', deep: '#A8C5CE' },  // 瓷 天青
    { fill: '#E4C88E', edge: '#A5803C', deep: '#B8944A' },  // 木 秋香
    { fill: '#A9A9B4', edge: '#6A6A78', deep: '#5A5A68' }   // 石 黛
  ];
  var PAPER = '#EFE7D8', WOOD = '#8A6B34', VERM = '#C4553B', MOSS = '#6E8B5B', INK = '#3A3630';

  var R = {
    cv: null, ctx: null, W: 900, H: 500, dpr: 1,
    bg: null, grain: null,
    vis: {},        // id -> {col:float, sq:number, lift:number}
    parts: [],      // 粒子
    falls: [],      // 掉落动画
    hold: null,     // 手持物品（画幽灵板）
    cursor: { s: 0, c: 0 },
    time: 0
  };

  function grainPat(g) {
    if (R.grain) return R.grain;
    var c = document.createElement('canvas'); c.width = c.height = 96;
    var x = c.getContext('2d');
    x.fillStyle = 'rgba(120,100,70,0.055)';
    for (var i = 0; i < 900; i++) {
      x.fillRect(Math.random() * 96, Math.random() * 96, 1.2, 1.2);
    }
    R.grain = g.createPattern(c, 'repeat');
    return R.grain;
  }

  function bakeBg() {
    var W = R.W, H = R.H;
    if (!R.bg) R.bg = document.createElement('canvas');
    R.bg.width = W; R.bg.height = H;
    var g = R.bg.getContext('2d');
    var grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#F4EEE0');
    grd.addColorStop(0.62, '#EDE3CE');
    grd.addColorStop(1, '#E4D9C0');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);

    // 印象派软斑：三团低饱和大光晕
    var blobs = [
      { x: 0.20 * W, y: 0.22 * H, r: 0.44 * W, c: '180,148,74', a: 0.13 },
      { x: 0.82 * W, y: 0.68 * H, r: 0.40 * W, c: '168,197,206', a: 0.11 },
      { x: 0.55 * W, y: 0.92 * H, r: 0.50 * W, c: '138,107,52', a: 0.09 }
    ];
    blobs.forEach(function (b) {
      var rg = g.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      rg.addColorStop(0, 'rgba(' + b.c + ',' + b.a + ')');
      rg.addColorStop(1, 'rgba(' + b.c + ',0)');
      g.fillStyle = rg; g.fillRect(0, 0, W, H);
    });

    // 墙面横向淡纹（留白感）
    g.strokeStyle = 'rgba(138,107,52,0.05)'; g.lineWidth = 1;
    for (var y = 30; y < H; y += 26) {
      g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); g.stroke();
    }
    // 颗粒
    g.fillStyle = grainPat(g); g.fillRect(0, 0, W, H);

    // 上下留白渐隐
    var vg = g.createLinearGradient(0, 0, 0, 0.10 * H);
    vg.addColorStop(0, 'rgba(244,238,224,0.85)'); vg.addColorStop(1, 'rgba(244,238,224,0)');
    g.fillStyle = vg; g.fillRect(0, 0, W, 0.10 * H);
  }

  function setSize(w, h, dpr) {
    R.W = Math.max(320, Math.round(w)); R.H = Math.max(240, Math.round(h));
    R.dpr = Math.min(2, dpr || 1);
    R.cv.width = Math.round(R.W * R.dpr);
    R.cv.height = Math.round(R.H * R.dpr);
    R.cv.style.width = R.W + 'px';
    R.cv.style.height = R.H + 'px';
    bakeBg();
  }

  function layout(st) {
    var n = st.shelves.length;
    var x0 = 74, x1 = 826;
    var CW = (x1 - x0) / (st.shelves[0] ? st.shelves[0].cols : 8);
    var topPad = 44, botPad = 78;
    var avail = Math.max(120, R.H - topPad - botPad);
    var gap = G.clamp(avail / n, 96, 205);
    var totalH = gap * n;
    var startY = topPad + Math.max(0, (avail - totalH) / 2);
    var ys = [];
    for (var i = 0; i < n; i++) ys.push(startY + gap * (i + 0.5));
    return { x0: x0, x1: x1, CW: CW, ys: ys, gap: gap, groundY: R.H - 40, itemH: Math.min(54, gap * 0.44) };
  }

  // ---------- 器物 ----------
  function drawVase(g, h, hw, k) {
    var C = KC[k];
    g.beginPath();
    g.moveTo(-hw * 0.34, -h * 0.60);
    g.lineTo(-hw * 0.30, -h * 0.80);
    g.lineTo(-hw * 0.50, -h * 0.88);
    g.lineTo(-hw * 0.50, -h);
    g.lineTo(hw * 0.50, -h);
    g.lineTo(hw * 0.50, -h * 0.88);
    g.lineTo(hw * 0.30, -h * 0.80);
    g.lineTo(hw * 0.34, -h * 0.60);
    g.bezierCurveTo(hw * 1.06, -h * 0.46, hw * 1.00, -h * 0.06, hw * 0.72, 0);
    g.lineTo(-hw * 0.72, 0);
    g.bezierCurveTo(-hw * 1.00, -h * 0.06, -hw * 1.06, -h * 0.46, -hw * 0.34, -h * 0.60);
    g.closePath();
    g.fillStyle = C.fill; g.fill();
    g.strokeStyle = C.edge; g.lineWidth = 1.6; g.stroke();
    // 高光
    g.beginPath();
    g.moveTo(-hw * 0.52, -h * 0.22);
    g.bezierCurveTo(-hw * 0.76, -h * 0.34, -hw * 0.78, -h * 0.56, -hw * 0.46, -h * 0.72);
    g.strokeStyle = 'rgba(255,255,255,0.62)'; g.lineWidth = Math.max(1.4, hw * 0.16); g.stroke();
  }
  function drawBowl(g, h, hw, k) {
    var C = KC[k];
    g.beginPath();
    g.moveTo(-hw, -h * 0.72);
    g.lineTo(hw, -h * 0.72);
    g.quadraticCurveTo(hw * 0.86, -h * 0.02, hw * 0.56, 0);
    g.lineTo(-hw * 0.56, 0);
    g.quadraticCurveTo(-hw * 0.86, -h * 0.02, -hw, -h * 0.72);
    g.closePath();
    g.fillStyle = C.fill; g.fill();
    g.strokeStyle = C.edge; g.lineWidth = 1.6; g.stroke();
    g.beginPath();
    g.ellipse(0, -h * 0.72, hw, h * 0.13, 0, 0, Math.PI * 2);
    g.fillStyle = C.deep; g.fill();
    g.strokeStyle = C.edge; g.lineWidth = 1.3; g.stroke();
    g.beginPath();
    g.moveTo(-hw * 0.62, -h * 0.30);
    g.quadraticCurveTo(-hw * 0.52, -h * 0.06, -hw * 0.40, -h * 0.005);
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = Math.max(1.4, hw * 0.16); g.stroke();
  }
  function drawSeal(g, h, hw, k) {
    var C = KC[k];
    var bw = hw * 0.92, bh = h * 0.74;
    g.beginPath();
    g.moveTo(-bw * 0.62, -bh * 0.20); g.lineTo(-bw * 0.62, -bh * 0.34);
    g.quadraticCurveTo(0, -bh * 0.56, bw * 0.62, -bh * 0.34); g.lineTo(bw * 0.62, -bh * 0.20);
    g.closePath(); g.fillStyle = C.deep; g.fill(); g.strokeStyle = C.edge; g.lineWidth = 1.3; g.stroke();
    var rw = bw, rh = bh * 0.80, y0 = 0;
    g.beginPath();
    g.moveTo(-rw * 0.78, y0); g.lineTo(-rw, y0 - rh * 0.72);
    g.lineTo(-rw, y0 - rh); g.lineTo(rw, y0 - rh); g.lineTo(rw, y0 - rh * 0.72); g.lineTo(rw * 0.78, y0);
    g.closePath();
    g.fillStyle = C.fill; g.fill(); g.strokeStyle = C.edge; g.lineWidth = 1.6; g.stroke();
    g.beginPath();
    g.moveTo(-rw * 0.66, y0 - rh * 0.10); g.lineTo(-rw * 0.92, y0 - rh * 0.86);
    g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = Math.max(1.2, rw * 0.13); g.stroke();
  }

  function drawItem(g, it, h, alpha) {
    var sc = 0.80 + it.w * 0.030;         // 越重越大（视觉双重编码）
    var hw = h * 0.30 * sc, hh = h * sc;
    g.save();
    g.globalAlpha = alpha == null ? 1 : alpha;
    if (it.kind === 0) drawVase(g, hh, hw, 0);
    else if (it.kind === 1) drawBowl(g, hh, hw, 1);
    else drawSeal(g, hh, hw, 2);
    // 重量数字
    g.fillStyle = INK;
    g.font = '700 ' + Math.round(hh * 0.34) + 'px "PingFang SC",system-ui,sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    var ty = it.kind === 2 ? -hh * 0.46 : -hh * 0.34;
    g.globalAlpha = (alpha == null ? 1 : alpha) * 0.86;
    g.fillText(String(it.w), 0, ty);
    g.restore();
  }

  // ---------- 板 ----------
  function boardPath(g, sh, L, y0, y1) {
    var a = -sh.pivot * L.CW - 9, b = (sh.cols - sh.pivot) * L.CW + 9;
    g.beginPath();
    var r = 3;
    g.moveTo(a + r, y0); g.lineTo(b - r, y0); g.quadraticCurveTo(b, y0, b, y0 + r);
    g.lineTo(b, y1 - r); g.quadraticCurveTo(b, y1, b - r, y1);
    g.lineTo(a + r, y1); g.quadraticCurveTo(a, y1, a, y1 - r);
    g.lineTo(a, y0 + r); g.quadraticCurveTo(a, y0, a + r, y0);
    g.closePath();
  }

  function drawShelf(g, st, si, L) {
    var sh = st.shelves[si];
    var y = L.ys[si];
    var px = L.x0 + sh.pivot * L.CW;
    var over = Math.abs(sh.theta) > sh.tol;
    var rad = sh.theta * Math.PI / 180;

    // 板下阴影
    g.save();
    g.globalAlpha = 0.13; g.fillStyle = '#6B5227';
    g.beginPath(); g.ellipse(px, y + 26, ((sh.cols * L.CW) / 2) * 0.92, 9, 0, 0, Math.PI * 2); g.fill();
    g.restore();

    // 幽灵预测针：手持物 + 光标在本层空格 → 预览放下后的角度（短虚线针 + 幽灵气泡）
    if (R.hold && R.cursor.s === si && !st.over) {
      var cc = R.cursor.c;
      if (cc >= 0 && cc < sh.cols && !sh.cells[cc]) {
        var M2 = sh.M + R.hold.w * ((cc + 0.5) - sh.pivot);
        var deg2 = G.clamp(M2 * G.KT, -G.MAXTILT, G.MAXTILT);
        var th2 = deg2 * Math.PI / 180;
        var over2 = Math.abs(deg2) > sh.tol;
        g.save();
        g.translate(px, y);
        g.rotate(th2);
        g.globalAlpha = 0.75;
        g.setLineDash([7, 6]);
        g.strokeStyle = over2 ? VERM : MOSS;
        g.lineWidth = 3;
        g.beginPath(); g.moveTo(0, -26); g.lineTo(96, -26); g.stroke();   // 与板平行的预测针
        g.setLineDash([]);
        g.beginPath(); g.arc(96, -26, 3.4, 0, Math.PI * 2);
        g.fillStyle = over2 ? VERM : MOSS; g.fill();
        g.restore();
        // 幽灵气泡（水平尺里的预测位置）
        drawBubble(g, px, y, deg2, sh.tol, 0.45);
      }
    }

    g.save();
    g.translate(px, y);
    g.rotate(rad);

    // 色区底色 + 分隔线（板上方）
    var top = -L.itemH - 10;
    for (var c = 0; c < sh.cols; c++) {
      var k = sh.zones[c];
      var x = (c - sh.pivot) * L.CW;
      g.fillStyle = KC[k].deep;
      g.globalAlpha = 0.135;
      g.fillRect(x, top, L.CW, L.itemH + 10);
      g.globalAlpha = 1;
      // 分隔线
      g.strokeStyle = 'rgba(138,107,52,0.20)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x + 0.5, top); g.lineTo(x + 0.5, 0); g.stroke();
    }
    g.strokeStyle = 'rgba(138,107,52,0.20)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo((sh.cols - sh.pivot) * L.CW - 0.5, top); g.lineTo((sh.cols - sh.pivot) * L.CW - 0.5, 0); g.stroke();

    // 板体
    boardPath(g, sh, L, -10, 4);
    var bg2 = g.createLinearGradient(0, -10, 0, 4);
    bg2.addColorStop(0, over ? '#C79A55' : '#B8944A');
    bg2.addColorStop(1, over ? '#A26A34' : '#8A6B34');
    g.fillStyle = bg2; g.fill();
    g.strokeStyle = 'rgba(70,52,24,0.55)'; g.lineWidth = 1.2; g.stroke();
    // 顶面高光
    g.beginPath();
    g.moveTo(-sh.pivot * L.CW - 8, -8.5); g.lineTo((sh.cols - sh.pivot) * L.CW + 8, -8.5);
    g.strokeStyle = 'rgba(255,246,222,0.5)'; g.lineWidth = 1.6; g.stroke();

    // 色带（板顶面）
    for (var c2 = 0; c2 < sh.cols; c2++) {
      var k2 = sh.zones[c2];
      g.fillStyle = KC[k2].deep;
      g.globalAlpha = 0.85;
      g.fillRect((c2 - sh.pivot) * L.CW + 1.5, -12.5, L.CW - 3, 3.6);
      g.globalAlpha = 1;
    }

    // 光标格
    if (R.cursor.s === si && !st.over) {
      var cx = (R.cursor.c - sh.pivot) * L.CW;
      g.save();
      g.setLineDash([5, 4]);
      g.strokeStyle = 'rgba(58,54,48,0.55)'; g.lineWidth = 1.6;
      g.strokeRect(cx + 2, top, L.CW - 4, L.itemH + 10);
      g.setLineDash([]);
      g.fillStyle = 'rgba(255,255,255,0.22)';
      g.fillRect(cx + 2, top, L.CW - 4, L.itemH + 10);
      g.restore();
    }

    // 货物
    for (var c3 = 0; c3 < sh.cols; c3++) {
      var it = sh.cells[c3];
      if (!it) continue;
      var v = R.vis[it.id] || (R.vis[it.id] = { col: c3, sq: 0, lift: 0 });
      var vx = (v.col - sh.pivot + 0.5) * L.CW;
      var sq = v.sq;                    // >0 压扁
      g.save();
      g.translate(vx, -2 - v.lift);
      g.scale(1 + sq * 0.26, 1 - sq * 0.30);
      drawItem(g, it, L.itemH, 1);
      g.restore();
    }
    g.restore();

    // 支点（不旋转）
    g.save();
    g.translate(px, y);
    g.beginPath();
    g.moveTo(0, 5); g.lineTo(-12, 31); g.lineTo(12, 31); g.closePath();
    g.fillStyle = VERM; g.fill();
    g.strokeStyle = 'rgba(120,40,26,0.7)'; g.lineWidth = 1.2; g.stroke();
    g.beginPath(); g.arc(0, 5, 3.6, 0, Math.PI * 2);
    g.fillStyle = '#F7F1E4'; g.fill();
    g.strokeStyle = VERM; g.lineWidth = 1.6; g.stroke();
    g.restore();

    // 水平尺
    drawRuler(g, px, y, sh.theta, sh.tol);
    drawBubble(g, px, y, sh.theta, sh.tol, 1);
  }

  function drawRuler(g, px, y, theta, tol) {
    var w = 124, h = 20, top = y + 38;
    var x = px - w / 2;
    g.save();
    g.beginPath();
    var r = h / 2;
    g.moveTo(x + r, top); g.lineTo(x + w - r, top); g.quadraticCurveTo(x + w, top, x + w, top + r);
    g.quadraticCurveTo(x + w, top + h, x + w - r, top + h); g.lineTo(x + r, top + h);
    g.quadraticCurveTo(x, top + h, x, top + r); g.quadraticCurveTo(x, top, x + r, top);
    g.closePath();
    g.fillStyle = 'rgba(58,54,48,0.09)'; g.fill();
    g.strokeStyle = 'rgba(138,107,52,0.42)'; g.lineWidth = 1.3; g.stroke();
    // 容差刻度
    var tx = (tol / G.MAXTILT) * (w / 2 - 12);
    g.strokeStyle = MOSS; g.lineWidth = 2;
    [px - tx, px + tx].forEach(function (mx) {
      g.beginPath(); g.moveTo(mx, top + 3); g.lineTo(mx, top + h - 3); g.stroke();
    });
    // 中心
    g.strokeStyle = 'rgba(58,54,48,0.4)'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(px, top + 5); g.lineTo(px, top + h - 5); g.stroke();
    g.restore();
  }
  function drawBubble(g, px, y, theta, tol, alpha) {
    var w = 124, top = y + 38, h = 20;
    var bx = px + G.clamp(theta / G.MAXTILT, -1, 1) * (w / 2 - 12);
    var ok = Math.abs(theta) <= tol;
    g.save();
    g.globalAlpha = alpha;
    g.beginPath(); g.arc(bx, top + h / 2, 7.2, 0, Math.PI * 2);
    g.fillStyle = ok ? MOSS : VERM; g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 1.2; g.stroke();
    g.beginPath(); g.arc(bx - 2.2, top + h / 2 - 2.2, 2.2, 0, Math.PI * 2);
    g.fillStyle = 'rgba(255,255,255,0.55)'; g.fill();
    g.restore();
  }

  // ---------- 粒子 ----------
  function spawnDust(x, y, n, color) {
    for (var i = 0; i < n; i++) {
      R.parts.push({
        x: x + (Math.random() - 0.5) * 22, y: y + (Math.random() - 0.3) * 6,
        vx: (Math.random() - 0.5) * 90, vy: -Math.random() * 70 - 12,
        r: 1.4 + Math.random() * 2.4, life: 0.5 + Math.random() * 0.4, t: 0,
        c: color || 'rgba(138,107,52,'
      });
    }
  }

  function stepParts(st, dt, L) {
    var i;
    for (i = R.parts.length - 1; i >= 0; i--) {
      var p = R.parts[i];
      p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 190 * dt; p.vx *= 0.96;
      if (p.t >= p.life) R.parts.splice(i, 1);
    }
    for (i = R.falls.length - 1; i >= 0; i--) {
      var f = R.falls[i];
      f.t += dt; f.vy += 900 * dt; f.y += f.vy * dt; f.rot += f.vr * dt;
      if (f.y > L.groundY - 4 && f.vy > 0) { f.vy *= -0.36; f.y = L.groundY - 4; f.vr *= 0.5; }
      if (f.t > 1.6) R.falls.splice(i, 1);
    }
    // 视觉插值
    for (var id in R.vis) {
      var v = R.vis[id];
      var it = st.items[id];
      if (!it) { delete R.vis[id]; continue; }
      if (it.shelf >= 0) v.col += (it.col - v.col) * Math.min(1, dt * 13);
      else v.col = it.col;
      v.sq *= Math.max(0, 1 - dt * 7.5);
      v.lift *= Math.max(0, 1 - dt * 9);
    }
  }

  function consumeEvents(st) {
    var L = layout(st);
    for (var i = 0; i < st.events.length; i++) {
      var e = st.events[i];
      if (e.t === 'place') {
        var v = R.vis[e.id] || (R.vis[e.id] = { col: e.c, sq: 0, lift: 0 });
        v.col = e.c; v.sq = 1; v.lift = 0;
        var px = L.x0 + (e.c + 0.5) * L.CW;
        spawnDust(px, L.ys[e.s] - 2, 9);
      } else if (e.t === 'slide') {
        // 视觉从 from 慢慢滑到 to
        var v2 = R.vis[e.id];
        if (v2) v2.col = e.from;
      } else if (e.t === 'fall') {
        var fx = L.x0 + (e.c + 0.5) * L.CW, fy = L.ys[e.s] - L.itemH * 0.5;
        R.falls.push({ x: fx, y: fy, vy: -40, rot: 0, vr: (Math.random() - 0.5) * 6, t: 0, kind: st.items[e.id].kind, w: st.items[e.id].w, h: L.itemH });
        spawnDust(fx, L.ys[e.s] - 2, 6);
      }
    }
  }

  // ---------- 主绘制 ----------
  function draw(st, dt) {
    var g = R.ctx;
    if (!g) return;
    stepParts(st, dt, layout(st));
    var L = layout(st);
    g.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
    g.clearRect(0, 0, R.W, R.H);
    if (R.bg) g.drawImage(R.bg, 0, 0, R.W, R.H);
    R.time += dt;

    // 地面
    g.save();
    var gg = g.createLinearGradient(0, L.groundY - 14, 0, R.H);
    gg.addColorStop(0, 'rgba(138,107,52,0.05)');
    gg.addColorStop(1, 'rgba(138,107,52,0.16)');
    g.fillStyle = gg; g.fillRect(0, L.groundY - 14, R.W, R.H - L.groundY + 14);
    g.strokeStyle = 'rgba(138,107,52,0.34)'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(30, L.groundY + 0.5); g.lineTo(R.W - 30, L.groundY + 0.5); g.stroke();
    g.restore();

    for (var s = 0; s < st.shelves.length; s++) drawShelf(g, st, s, L);

    // 掉落动画
    for (var i = 0; i < R.falls.length; i++) {
      var f = R.falls[i];
      g.save();
      g.translate(f.x, f.y); g.rotate(f.rot);
      g.globalAlpha = Math.max(0, 1 - f.t / 1.6);
      drawItem(g, { kind: f.kind, w: f.w }, f.h, Math.max(0, 1 - f.t / 1.6));
      g.restore();
    }
    // 粒子
    for (var j = 0; j < R.parts.length; j++) {
      var p = R.parts[j];
      g.globalAlpha = Math.max(0, 1 - p.t / p.life) * 0.55;
      g.fillStyle = p.c + '1)';
      g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;

    // 稳定进度环（收工倒计时）
    if (!st.over && st.stableT > 0) {
      var pr = G.clamp(st.stableT / G.STABLE_T, 0, 1);
      g.save();
      g.strokeStyle = MOSS; g.lineWidth = 4;
      g.beginPath(); g.arc(R.W / 2, 30, 13, -Math.PI / 2, -Math.PI / 2 + pr * Math.PI * 2); g.stroke();
      g.globalAlpha = 0.25; g.strokeStyle = MOSS;
      g.beginPath(); g.arc(R.W / 2, 30, 13, 0, Math.PI * 2); g.stroke();
      g.restore();
    }
  }

  function reset() {
    R.vis = {}; R.parts = []; R.falls = []; R.time = 0;
  }

  R.init = function (cv) { R.cv = cv; R.ctx = cv.getContext('2d'); };
  R.setSize = setSize; R.layout = layout; R.draw = draw; R.reset = reset;
  R.consumeEvents = consumeEvents;
  R.setHold = function (it) { R.hold = it; };
  R.setCursor = function (s, c) { R.cursor.s = s; R.cursor.c = c; };
  R.KC = KC;
  root.SC299R = R;
})(typeof window !== 'undefined' ? window : globalThis);
