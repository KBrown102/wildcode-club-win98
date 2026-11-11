/* 300-mirrorwalk《倒影 · 影随形》渲染层 —— 水墨留白 × 中国传统色 */
(function (root) {
  'use strict';
  var MW = root.MW;
  var CELL = MW.CELL, COLS = MW.COLS, ROWS = MW.ROWS, W = MW.W, H = MW.H;
  var SURF_ROW = MW.SURF_ROW, SURF_Y = MW.SURF_Y, BW = MW.BW, BH = MW.BH;
  var clamp = MW.clamp;

  var C = {
    paper: '#EFF0E9', paper2: '#D3DCD6',
    far: '#BAC4C0', near: '#8FA19E',
    stone: '#6E7476', stoneTop: '#9FA8A3', grass: '#6E8B5B',
    wood: '#7A5B3E', leaf: '#6E8B5B',
    water1: '#A8C5CE', water2: '#5E7C8C', water3: '#2A3A48', water4: '#12161C',
    rock: '#232B33', rockTop: '#46545F',
    body: '#A8503C', bodyDark: '#7E3B2C',
    refl: 'rgba(168,80,60,0.42)',
    lotus: '#E9A08A', gold: '#E0B04B',
    glow: 'rgba(255,214,160,1)',
    ink: '#2B3138'
  };

  function rnd(seed) { var x = Math.sin(seed * 12.9898) * 43758.5453; return x - Math.floor(x); }

  function create(canvas) {
    var ctx = canvas.getContext('2d');
    var SC = 1;
    var bg = document.createElement('canvas'), bgc = bg.getContext('2d');
    var tg = document.createElement('canvas'), tgc = tg.getContext('2d');
    var glowSprite = null, curLevelKey = '';
    var parts = [], ripples = [], floats = [];
    var wave = 0, shake = 0;

    function mkGlow() {
      var s = 256, c = document.createElement('canvas'); c.width = c.height = s;
      var g = c.getContext('2d');
      var rg = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      rg.addColorStop(0, 'rgba(255,222,176,0.60)');
      rg.addColorStop(0.35, 'rgba(255,206,150,0.26)');
      rg.addColorStop(0.7, 'rgba(255,196,140,0.08)');
      rg.addColorStop(1, 'rgba(255,190,130,0)');
      g.fillStyle = rg; g.fillRect(0, 0, s, s);
      return c;
    }

    function resize(dpr) {
      SC = Math.min(dpr || 1, 2.2);
      canvas.width = Math.round(W * SC); canvas.height = Math.round(H * SC);
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      bg.width = tg.width = canvas.width; bg.height = tg.height = canvas.height;
      glowSprite = mkGlow();
      bakeBg(); curLevelKey = '';
    }

    function bakeBg() {
      var g = bgc; g.setTransform(SC, 0, 0, SC, 0, 0);
      g.clearRect(0, 0, W, H);
      // 天（宣纸暖白 → 淡青灰）
      var sky = g.createLinearGradient(0, 0, 0, SURF_Y);
      sky.addColorStop(0, C.paper); sky.addColorStop(0.62, '#E4E8E1'); sky.addColorStop(1, C.paper2);
      g.fillStyle = sky; g.fillRect(0, 0, W, SURF_Y);
      // 远山（淡墨两层）
      g.fillStyle = C.far;
      g.beginPath(); g.moveTo(-10, SURF_Y - 96);
      for (var x = -10; x <= W + 10; x += 12) {
        var y = SURF_Y - 96 - 34 * Math.sin(x * 0.0062 + 1.1) - 18 * Math.sin(x * 0.0137 + 2.4);
        g.lineTo(x, y);
      }
      g.lineTo(W + 10, SURF_Y); g.lineTo(-10, SURF_Y); g.closePath(); g.fill();
      g.fillStyle = C.near;
      g.beginPath(); g.moveTo(-10, SURF_Y - 52);
      for (x = -10; x <= W + 10; x += 10) {
        var y2 = SURF_Y - 52 - 20 * Math.sin(x * 0.0091 + 3.3) - 9 * Math.sin(x * 0.021 + 0.6);
        g.lineTo(x, y2);
      }
      g.lineTo(W + 10, SURF_Y); g.lineTo(-10, SURF_Y); g.closePath(); g.fill();
      // 水
      var wa = g.createLinearGradient(0, SURF_Y, 0, H);
      wa.addColorStop(0, C.water1); wa.addColorStop(0.16, C.water2);
      wa.addColorStop(0.48, C.water3); wa.addColorStop(1, C.water4);
      g.fillStyle = wa; g.fillRect(0, SURF_Y, W, H - SURF_Y);
      // 天光在水面的一道亮带
      var lg = g.createLinearGradient(0, SURF_Y, 0, SURF_Y + 46);
      lg.addColorStop(0, 'rgba(255,255,255,0.34)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = lg; g.fillRect(0, SURF_Y, W, 46);
      // 颗粒
      g.globalAlpha = 0.05; g.fillStyle = '#000';
      for (var i = 0; i < 2600; i++) {
        var px = rnd(i + 1) * W, py = rnd(i * 3.7 + 11) * H;
        g.fillRect(px, py, 1.2, 1.2);
      }
      g.globalAlpha = 1;
    }

    // 地形一次烘焙（手绘抖线墨块）
    function bakeLevel(st) {
      var key = st.level + '|' + st.seed;
      if (key === curLevelKey) return;
      curLevelKey = key;
      var g = tgc; g.setTransform(SC, 0, 0, SC, 0, 0);
      g.clearRect(0, 0, W, H);
      var L = st.L, c, r;

      // 岸（石）
      for (c = 0; c < COLS; c++) {
        var gt = L.groundTop[c];
        var top = gt * CELL;
        g.fillStyle = C.stone;
        g.beginPath(); g.moveTo(c * CELL, top + 2);
        g.lineTo(c * CELL, SURF_Y + 4);
        g.lineTo((c + 1) * CELL, SURF_Y + 4);
        g.lineTo((c + 1) * CELL, top + 3 + (rnd(c * 2.3) - 0.5) * 3);
        g.closePath(); g.fill();
        // 顶沿亮边 + 草线
        g.strokeStyle = C.stoneTop; g.lineWidth = 3;
        g.beginPath(); g.moveTo(c * CELL - 1, top + 1.5); g.lineTo((c + 1) * CELL + 1, top + 1.5 + (rnd(c * 5.1) - 0.5) * 2.5); g.stroke();
        g.strokeStyle = C.grass; g.lineWidth = 1.6;
        g.beginPath();
        g.moveTo(c * CELL, top + 0.5);
        for (var k = 0; k <= 3; k++) {
          var xx = c * CELL + k * CELL / 3;
          g.lineTo(xx, top - 1.5 - Math.abs(Math.sin(c * 1.7 + k * 1.1)) * 4.5);
        }
        g.stroke();
      }
      // 岸的竖向纹理
      g.globalAlpha = 0.16; g.strokeStyle = '#000'; g.lineWidth = 1;
      for (c = 0; c < COLS; c++) {
        for (var v = 0; v < 3; v++) {
          var vx = c * CELL + 5 + rnd(c * 9 + v * 3) * 20;
          var vy0 = L.groundTop[c] * CELL + 6 + v * 8;
          g.beginPath(); g.moveTo(vx, vy0); g.lineTo(vx + (rnd(c + v) - 0.5) * 5, Math.min(SURF_Y, vy0 + 12)); g.stroke();
        }
      }
      g.globalAlpha = 1;

      // 横枝
      for (var b = 0; b < L.branches.length; b++) {
        var br = L.branches[b];
        var x0 = br.c0 * CELL, x1 = (br.c1 + 1) * CELL, y0 = br.row * CELL;
        g.fillStyle = C.wood;
        g.beginPath();
        g.moveTo(x0, y0 + 13);
        g.bezierCurveTo(x0 + 14, y0 + 3, x1 - 14, y0 + 5, x1, y0 + 12);
        g.lineTo(x1, y0 + 18);
        g.bezierCurveTo(x1 - 14, y0 + 12, x0 + 14, y0 + 11, x0, y0 + 19);
        g.closePath(); g.fill();
        g.fillStyle = C.leaf;
        for (var lf = 0; lf < 5; lf++) {
          var lx = x0 + (lf + 0.5) * (x1 - x0) / 5, ly = y0 + 20 + rnd(b * 7 + lf) * 8;
          g.beginPath(); g.ellipse(lx, ly, 6.5, 4.2, rnd(b + lf) * 2, 0, Math.PI * 2); g.fill();
        }
      }

      // 水下礁石
      for (var rc = 0; rc < L.rocks.length; rc++) {
        var rk = L.rocks[rc];
        var rx = rk.c * CELL, ry = rk.r * CELL;
        g.fillStyle = C.rock;
        g.beginPath();
        g.moveTo(rx + 2, ry + 4);
        g.lineTo(rx + CELL - 2, ry + 3);
        g.lineTo(rx + CELL + 1, ry + CELL - 2);
        g.lineTo(rx + 3, ry + CELL);
        g.closePath(); g.fill();
        g.strokeStyle = C.rockTop; g.lineWidth = 2.2;
        g.beginPath(); g.moveTo(rx + 2, ry + 4); g.lineTo(rx + CELL - 2, ry + 3); g.stroke();
      }
    }

    // ---- 粒子 / 演出 ----
    function onEvent(e) {
      if (e.t === 'lotus') {
        for (var i = 0; i < 16; i++) {
          var a = Math.PI * 2 * i / 16;
          parts.push({ x: e.x, y: e.y, vx: Math.cos(a) * (24 + Math.random() * 40), vy: Math.sin(a) * (24 + Math.random() * 40) - 16, life: 1, r: 2 + Math.random() * 2.4, c: e.kind ? C.gold : C.lotus, up: 1 });
        }
        ripples.push({ x: e.x, r: 6, life: 1 });
        floats.push({ x: e.x, y: e.y, life: 1, kind: e.kind });
      } else if (e.t === 'jump') {
        ripples.push({ x: e.x, r: 4, life: 1 });
      } else if (e.t === 'land') {
        ripples.push({ x: e.x, r: 5, life: 1 });
        for (var j = 0; j < 7; j++) parts.push({ x: e.x + (Math.random() - 0.5) * 14, y: SURF_Y, vx: (Math.random() - 0.5) * 50, vy: -Math.random() * 50 - 10, life: 0.7, r: 1.6, c: '#DCE7EA', up: 0 });
      } else if (e.t === 'bubble') {
        ripples.push({ x: e.x, r: 8, life: 1 });
        for (var k2 = 0; k2 < 10; k2++) parts.push({ x: e.x + (Math.random() - 0.5) * 12, y: e.y, vx: (Math.random() - 0.5) * 26, vy: -30 - Math.random() * 40, life: 0.9, r: 1.8, c: '#CFE3E6', up: 1 });
      } else if (e.t === 'block' || e.t === 'bonk') {
        shake = Math.min(1, shake + 0.35);
      }
    }

    function step(dt) {
      wave += dt * 1.6;
      shake = Math.max(0, shake - dt * 3.2);
      for (var i = parts.length - 1; i >= 0; i--) {
        var p = parts[i];
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.up) p.vy -= 42 * dt; else p.vy += 120 * dt;
        p.life -= dt * 1.15;
        if (p.life <= 0) parts.splice(i, 1);
      }
      for (i = ripples.length - 1; i >= 0; i--) {
        var rp = ripples[i]; rp.r += dt * 78; rp.life -= dt * 1.5;
        if (rp.life <= 0) ripples.splice(i, 1);
      }
      for (i = floats.length - 1; i >= 0; i--) {
        var f = floats[i]; f.y -= dt * 46; f.life -= dt * 0.72;
        if (f.life <= 0) floats.splice(i, 1);
      }
    }

    // ---- 小人 ----
    // flip=1 → 上下翻转（水面倒影）。翻转时 pivot 必须是矩形中心，
    // 沿用脚底 pivot 会把整只人翻到 [y+BH, y+2BH] 去（头朝下但整个人沉底）
    function figure(g, x, y, face, walk, sq, alpha, color, dark, flip) {
      var sx = 1 + sq * 0.34, sy = 1 - sq * 0.46;
      g.save();
      if (flip) {
        g.translate(x + BW / 2, y + BH / 2);
        g.scale(sx * face, -sy);
        g.translate(-BW / 2, -BH / 2);
      } else {
        g.translate(x + BW / 2, y + BH);
        g.scale(sx * face, sy);
        g.translate(-BW / 2, -BH);
      }
      g.globalAlpha = alpha;
      var sw = Math.sin(walk) * 5.2;
      // 腿
      g.strokeStyle = dark; g.lineWidth = 3.6; g.lineCap = 'round';
      g.beginPath(); g.moveTo(BW / 2 - 2, BH - 15); g.lineTo(BW / 2 - 2 + sw, BH - 1); g.stroke();
      g.beginPath(); g.moveTo(BW / 2 + 2, BH - 15); g.lineTo(BW / 2 + 2 - sw, BH - 1); g.stroke();
      // 身
      g.fillStyle = color;
      g.beginPath();
      if (g.roundRect) { g.roundRect(BW / 2 - 6.5, 12, 13, BH - 26, 4.5); }
      else { g.rect(BW / 2 - 6.5, 12, 13, BH - 26); }
      g.fill();
      // 臂
      g.strokeStyle = color; g.lineWidth = 3.2;
      g.beginPath(); g.moveTo(BW / 2, 17); g.lineTo(BW / 2 - sw * 0.8, 30); g.stroke();
      // 头
      g.beginPath(); g.arc(BW / 2, 7.5, 6.2, 0, Math.PI * 2); g.fill();
      g.fillStyle = dark;
      g.beginPath(); g.arc(BW / 2, 5.6, 6.2, Math.PI * 1.05, Math.PI * 1.95); g.fill();
      g.restore();
    }

    function drawLotus(g, lo, vis) {
      var x = lo.x, y = lo.y;
      var col = lo.kind ? C.gold : C.lotus;
      g.save();
      g.globalAlpha = vis;
      if (lo.taken) {
        var p = 1 - lo.pop;
        g.globalAlpha = vis * lo.pop;
        g.strokeStyle = col; g.lineWidth = 2;
        for (var i = 0; i < 6; i++) {
          var a = Math.PI * 2 * i / 6 + p * 0.6;
          g.beginPath(); g.ellipse(x + Math.cos(a) * 3, y + Math.sin(a) * 3, 8.5 + p * 3, 5 + p * 2, a, 0, Math.PI * 2); g.stroke();
        }
        g.fillStyle = col; g.beginPath(); g.arc(x, y, 3.6, 0, Math.PI * 2); g.fill();
      } else {
        // 花苞 + 绽放进度环
        g.strokeStyle = 'rgba(233,160,138,0.55)'; g.lineWidth = 2.4;
        g.beginPath(); g.moveTo(x, y + 12); g.lineTo(x, y + 2); g.stroke();
        g.fillStyle = col;
        g.beginPath(); g.ellipse(x, y - 3, 5.4, 9, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(0,0,0,0.22)';
        g.beginPath(); g.ellipse(x + 1.6, y - 3, 2.2, 7, 0, 0, Math.PI * 2); g.fill();
        if (lo.grow > 0.02) {
          g.strokeStyle = C.glow; g.lineWidth = 3;
          g.beginPath(); g.arc(x, y, 15, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * lo.grow); g.stroke();
        }
      }
      g.restore();
    }

    function draw(st, dt) {
      step(dt);
      bakeLevel(st);
      var g = ctx;
      g.setTransform(SC, 0, 0, SC, 0, 0);
      if (shake > 0) g.translate((Math.random() - 0.5) * shake * 3, (Math.random() - 0.5) * shake * 2);
      g.clearRect(-6, -6, W + 12, H + 12);
      g.drawImage(bg, 0, 0, W, H);

      var b = st.body, hp = MW.hpOf(st), ry = SURF_Y + hp;
      var refCx = b.x + BW / 2, refCy = ry + BH / 2;
      var GR = 118;

      // 水下光晕（揭示）
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.55 + 0.2 * Math.sin(wave * 1.7);
      g.drawImage(glowSprite, refCx - GR, refCy - GR, GR * 2, GR * 2);
      g.restore();

      // 地形
      g.drawImage(tg, 0, 0, W, H);

      // 水下剪影压暗（让光晕外的东西沉进暗里）
      g.save();
      g.globalCompositeOperation = 'multiply';
      var dg = g.createRadialGradient(refCx, refCy, GR * 0.2, refCx, refCy, GR * 1.9);
      dg.addColorStop(0, 'rgba(255,255,255,1)');
      dg.addColorStop(0.42, 'rgba(150,160,170,1)');
      dg.addColorStop(1, 'rgba(40,48,58,1)');
      g.fillStyle = dg;
      g.beginPath(); g.rect(0, SURF_Y, W, H - SURF_Y); g.fill();
      g.restore();

      // 莲（光晕内显形）
      for (var i = 0; i < st.L.lotus.length; i++) {
        var lo = st.L.lotus[i];
        var d = Math.hypot(lo.x - refCx, lo.y - refCy);
        var vis = clamp(1.05 - d / (GR * 1.05), 0.16, 1);
        drawLotus(g, lo, vis);
      }

      // 气穴
      for (i = 0; i < st.L.bubbles.length; i++) {
        var bu = st.L.bubbles[i];
        var bx = bu.c * CELL + CELL / 2, by = SURF_Y + 1.5 * CELL + Math.sin(wave * 2 + i) * 3;
        var bd = Math.hypot(bx - refCx, by - refCy);
        var bv = clamp(1.05 - bd / (GR * 1.05), 0.14, 1) * (bu.cool > 0 ? 0.35 : 1);
        g.save(); g.globalAlpha = bv;
        g.strokeStyle = '#CFE3E6'; g.lineWidth = 1.8;
        for (var q = 0; q < 3; q++) {
          g.beginPath(); g.arc(bx + (q - 1) * 7, by - q * 5, 4.4 - q * 0.7, 0, Math.PI * 2); g.stroke();
        }
        g.restore();
      }

      // 粒子（水下）
      for (i = 0; i < parts.length; i++) {
        var p = parts[i];
        g.globalAlpha = clamp(p.life, 0, 1) * 0.9;
        g.fillStyle = p.c;
        g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;

      // 上浮的暖光
      for (i = 0; i < floats.length; i++) {
        var f = floats[i];
        g.globalAlpha = clamp(f.life, 0, 1) * 0.85;
        g.fillStyle = f.kind ? C.gold : C.lotus;
        g.beginPath(); g.arc(f.x, f.y, 3.4, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;

      // 倒影：严格 = 本体关于水面的镜像 → 必须上下翻转（头朝下、脚贴水面）
      // face 不变：真实水面倒影只翻上下、不翻左右
      g.save();
      g.beginPath(); g.rect(0, SURF_Y, W, H - SURF_Y); g.clip();
      // 水波扭曲：三条水平切片轻微错位（flip 分支以矩形中心为 pivot，切片仍精确对齐 ry..ry+BH）
      for (var s = 0; s < 3; s++) {
        var y0 = ry + s * (BH / 3), y1 = ry + (s + 1) * (BH / 3);
        g.save();
        g.beginPath(); g.rect(0, y0, W, y1 - y0); g.clip();
        g.translate(Math.sin(wave * 2.2 + s * 1.3) * (1.6 + s * 0.9), 0);
        figure(g, b.x, ry, b.face, b.walk, b.sq, 0.58, C.body, C.bodyDark, 1);
        g.restore();
      }
      g.globalAlpha = 1;
      g.restore();

      // 水面
      g.save();
      g.strokeStyle = 'rgba(255,255,255,0.62)'; g.lineWidth = 2;
      g.beginPath();
      for (var wx = 0; wx <= W; wx += 6) {
        var wy = SURF_Y + Math.sin(wx * 0.045 + wave * 2.4) * 1.7 + Math.sin(wx * 0.017 - wave * 1.3) * 1.2;
        if (wx === 0) g.moveTo(wx, wy); else g.lineTo(wx, wy);
      }
      g.stroke();
      // 涟漪
      for (i = 0; i < ripples.length; i++) {
        var rp = ripples[i];
        g.globalAlpha = clamp(rp.life, 0, 1) * 0.5;
        g.strokeStyle = '#FFFFFF'; g.lineWidth = 1.6;
        g.beginPath(); g.ellipse(rp.x, SURF_Y, rp.r, rp.r * 0.26, 0, 0, Math.PI * 2); g.stroke();
      }
      g.globalAlpha = 1;
      g.restore();

      // 本体
      figure(g, b.x, b.y, b.face, b.walk, b.sq, 1, C.body, C.bodyDark);

      // 水深指示（影子本体之间的连线，一眼看懂耦合）
      g.save();
      g.setLineDash([3, 5]); g.strokeStyle = 'rgba(168,80,60,0.34)'; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(refCx, b.y + BH); g.lineTo(refCx, ry); g.stroke();
      g.setLineDash([]);
      g.fillStyle = C.body;
      g.beginPath(); g.arc(refCx, ry, 3, 0, Math.PI * 2); g.fill();
      g.restore();
    }

    return { resize: resize, draw: draw, onEvent: onEvent, bakeLevel: bakeLevel, colors: C };
  }

  MW.Render = { create: create };
})(typeof window !== 'undefined' ? window : this);
