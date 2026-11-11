/* 277-dewfall · 坠露 · 落进那片绿
 * render.js —— Canvas 2D 渲染层：只读状态、不改状态，消费 state.events 生成粒子/飘字
 * 视觉：FC 16-bit 限色板像素 × 那爱绿单色 grading × 液体玻璃真透镜（离屏采样 + 同心环放大）
 */
(function (g) {
  'use strict';

  var TAU = Math.PI * 2;

  // 那爱绿（集装箱绿）单色 grading · 16 色限色板
  var C = {
    skyTop: '#1B2A20',
    skyBot: '#0D1611',
    far1: '#1E2E22',
    far2: '#16241A',
    leafTop: '#8AB36A',   // 受光面
    leafMid: '#5C8A4E',   // 那爱绿主色
    leafLow: '#3A5F36',
    leafDark: '#2A4529',
    edge: '#16241A',      // FC 硬边描线
    vein: '#466E3E',
    branch: '#6B5544',
    branchDark: '#46372B',
    petalA: '#F2C9D4',
    petalB: '#F5E1A4',
    pool: '#9FD3C0',
    poolGlow: '#CFEFE2',
    glassRim: '#E8F5DC',
    soil: '#3B2E22',
    home: '#F0C98A'       // 家（根）的暖光
  };
  var PX = 4;            // FC 像素块尺寸（所有叶片量化到 4px 网格）

  function q(v) { return Math.round(v / PX) * PX; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  function create(game, canvas) {
    var S = game.state, CFG = game.CFG;
    var ctx = canvas.getContext('2d');
    var off = document.createElement('canvas');
    var octx = off.getContext('2d');

    var W = 0, H = 0, dpr = 1, scale = 1, viewH = 640;
    var parts = [], floats = [], ripples = [], trail = [], petals = [];
    var shake = 0, flash = 0, bloom = 0, soilY = CFG.HOME_DEPTH * CFG.PX_PER_M;
    var petalRain = 0, lastCam = 0;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);   // 限到 1.5：大屏离屏像素量减半，draw 稳定 <8ms；像素风 1.5 已足够清晰
      var rect = canvas.getBoundingClientRect();
      W = Math.max(240, Math.round(rect.width));
      H = Math.max(320, Math.round(rect.height));
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      scale = W / CFG.VW;
      viewH = H / scale;
      off.width = canvas.width; off.height = canvas.height;   // 离屏与主画布同尺寸，全屏世界一帧绘完（折射采样也用这张）
      game.setViewH(viewH);
      ctx.imageSmoothingEnabled = false;
      octx.imageSmoothingEnabled = false;
    }

    // —— 坐标：世界 → 设备像素 ——
    function sx(x) { return x * scale * dpr; }
    function sy(y) { return (y - S.camY) * scale * dpr; }

    // 世界变换：把世界坐标系对齐到画布（相机锁定 camY）
    function setWorld(c) {
      c.setTransform(scale * dpr, 0, 0, scale * dpr, 0, -S.camY * scale * dpr);
    }

    // —— 粒子 ——
    function spawnSplash(x, y, n, power, tint) {
      for (var i = 0; i < n && parts.length < 300; i++) {
        var a = rnd(-Math.PI, 0);
        parts.push({
          x: x, y: y,
          vx: Math.cos(a) * rnd(30, 130) * power,
          vy: Math.sin(a) * rnd(20, 110) * power - 40,
          life: 0, max: rnd(0.34, 0.78), g: 460,
          r: rnd(1.1, 2.9), c: tint || C.leafTop, kind: 'dot'
        });
      }
    }
    function spawnMist(x, y, n, c) {
      for (var i = 0; i < n && parts.length < 300; i++) {
        parts.push({
          x: x + rnd(-8, 8), y: y + rnd(-8, 8),
          vx: rnd(-30, 30), vy: rnd(-70, -18),
          life: 0, max: rnd(0.5, 1.1), g: -18,
          r: rnd(1.4, 3.4), c: c || C.poolGlow, kind: 'glow'
        });
      }
    }
    function float(x, y, text, c, size) {
      floats.push({ x: x, y: y, text: text, c: c || C.glassRim, size: size || 13, life: 0, max: 0.95 });
    }
    function ripple(x, y, r, c, w) {
      ripples.push({ x: x, y: y, r: 2, max: r, c: c || C.glassRim, life: 0, max: 0.55, w: w || 2 });
    }
    function petalBurst(x, y, n) {
      for (var i = 0; i < n; i++) {
        petals.push({
          x: x + rnd(-24, 24), y: y + rnd(-10, 10),
          vx: rnd(-46, 46), vy: rnd(-30, 42),
          rot: rnd(0, TAU), rotV: rnd(-3.2, 3.2),
          life: 0, max: rnd(1.5, 3.2), s: rnd(2.6, 5),
          c: Math.random() < 0.5 ? C.petalA : C.petalB
        });
      }
    }

    // —— 事件消费（只读 game 状态，不改状态）——
    // events 由调用方统一 drain 后传进来（音效与特效共用同一批，避免二次 drain 抢空）
    function consume(evs) {
      if (!evs) evs = game.drain();
      for (var i = 0; i < evs.length; i++) {
        var e = evs[i];
        switch (e.t) {
          case 'graze':
            spawnSplash(e.x, e.y, 7, 0.7, C.leafTop);
            shake = Math.max(shake, 2.2);
            break;
          case 'hit':
            spawnSplash(e.x, e.y, 16, 1.25, C.leafMid);
            shake = Math.max(shake, 5);
            break;
          case 'branch':
            spawnSplash(e.x, e.y, 22, 1.5, C.branch);
            shake = Math.max(shake, 9);
            float(e.x, e.y - 16, '枯枝', C.branch, 12);
            break;
          case 'perfect':
            spawnMist(e.x, e.y, 9, C.glassRim);
            ripple(e.x, e.y, 30, C.glassRim, 2);
            flash = Math.max(flash, 0.35);
            bloom = 1;
            if (e.combo >= 2) float(e.x, e.y - 14, '×' + e.combo, C.glassRim, 12 + Math.min(8, e.combo));
            break;
          case 'pass':
            ripple(e.x, e.y, 16, C.leafTop, 1.5);
            break;
          case 'absorb':
            spawnMist(e.x, e.y, 11, C.poolGlow);
            ripple(e.x, e.y, 26, C.poolGlow, 2);
            break;
          case 'flower':
            petalBurst(e.x, e.y, 9);
            if (S.combo >= 3) petalRain = Math.max(petalRain, 1.2);
            flash = Math.max(flash, 0.45);
            break;
          case 'slipoff':
            spawnSplash(e.x, e.y, 5, 0.5, C.pool);
            break;
          case 'soak':
            spawnMist(e.x, e.y, 18, C.glassRim);
            ripple(e.x, e.y, 52, C.glassRim, 3);
            break;
          case 'over':
            if (e.reason === 'home') { flash = Math.max(flash, 0.7); petalRain = 2.4; }
            break;
        }
      }
    }

    // —— 世界层（背景 / 远景 / 土）——
    function drawBackground(c) {
      setWorld(c);
      // 深度越深越暗（往下走，光越少）
      var dep = clamp(S.depth / CFG.HOME_DEPTH, 0, 1);
      var g1 = c.createLinearGradient(0, S.camY, 0, S.camY + viewH);
      g1.addColorStop(0, mix(C.skyTop, C.skyBot, dep * 0.55));
      g1.addColorStop(1, mix(C.skyBot, '#060B08', dep * 0.7));
      c.fillStyle = g1;
      c.fillRect(0, S.camY, CFG.VW, viewH);

      // 视差远景：两层模糊叶影（FC 大色块）
      drawFar(c, 0.34, C.far1, 3);
      drawFar(c, 0.58, C.far2, 5);

      // 接近家时，底部透出暖光
      var nh = S.nearHome;
      if (nh > 0.01) {
        var gg = c.createLinearGradient(0, soilY - 260, 0, soilY);
        gg.addColorStop(0, 'rgba(240,201,138,0)');
        gg.addColorStop(1, 'rgba(240,201,138,' + (0.20 * nh).toFixed(3) + ')');
        c.fillStyle = gg;
        c.fillRect(0, soilY - 260, CFG.VW, 260);
      }

      // 土（家）
      if (soilY - S.camY < viewH + 40) {
        c.fillStyle = C.soil;
        c.fillRect(0, soilY, CFG.VW, 400);
        // 根须剪影
        c.strokeStyle = 'rgba(240,201,138,' + (0.28 + 0.2 * nh).toFixed(3) + ')';
        c.lineWidth = 1.6;
        for (var i = 0; i < 14; i++) {
          var rx = (i + 0.5) * (CFG.VW / 14) + Math.sin(i * 2.3) * 6;
          c.beginPath();
          c.moveTo(rx, soilY);
          c.quadraticCurveTo(rx + Math.sin(i) * 10, soilY + 26, rx + Math.cos(i * 1.7) * 16, soilY + 52);
          c.stroke();
        }
      }
    }

    function drawFar(c, par, col, count) {
      c.fillStyle = col;
      var offY = S.camY * par;
      var span = viewH;
      for (var i = 0; i < count; i++) {
        var seed = Math.floor((offY + i * span / count) / 90);
        // 位运算取正模：负 seed 时 % 会得负数，椭圆半径为负会直接抛 IndexSizeError
        var m1 = ((seed * 1375) % 10000 + 10000) % 10000;
        var m2 = ((seed * 53) % 90 + 90) % 90;
        var m3 = ((seed * 89) % 480 + 480) % 480;
        var yy = S.camY + (m1 / 10000) * span;
        var w = 40 + m2;
        var x = (m3 / 480) * (CFG.VW + 120) - 60;
        c.beginPath();
        c.ellipse(x + w / 2, yy, w / 2, 13 + (m2 % 5) * 2, ((m2 % 7) - 3) * 0.05, 0, TAU);
        c.fill();
      }
    }

    // 一段叶片（FC 像素块 + 硬边 + 叶脉）
    function drawSeg(c, s0, s1, y, kind, bend, bloomAmt) {
      if (s1 - s0 < 1) return;
      var th = CFG.LAYER_TH;
      var yy = y + bend;
      var x0 = q(s0), x1 = q(s1);
      if (x1 <= x0) x1 = x0 + PX;

      if (kind === 'branch') {
        c.fillStyle = C.branchDark;
        c.fillRect(x0, yy + th - PX, x1 - x0, PX);
        c.fillStyle = C.branch;
        c.fillRect(x0, yy + 1, x1 - x0, th - PX - 1);
        // 枝节
        c.fillStyle = C.branchDark;
        for (var bx = x0 + PX * 2; bx < x1 - PX; bx += PX * 5) c.fillRect(bx, yy + 1, PX, PX);
        return;
      }

      // 下沿暗部
      c.fillStyle = C.leafDark;
      c.fillRect(x0, yy + th - PX, x1 - x0, PX);
      // 主体
      c.fillStyle = C.leafMid;
      c.fillRect(x0, yy + PX * 0.5, x1 - x0, th - PX * 1.5);
      // 上沿受光
      c.fillStyle = C.leafTop;
      c.fillRect(x0, yy, x1 - x0, PX * 0.5 + 1);
      // 叶脉（每 12px 一道，量化到像素网格）
      c.fillStyle = C.vein;
      for (var vx = x0 + PX * 3; vx < x1 - PX; vx += PX * 3) c.fillRect(vx, yy + th - PX * 2, PX, PX);
      // 两端硬边（FC 描线感）
      c.fillStyle = C.edge;
      c.fillRect(x0, yy, PX * 0.5, th);
      c.fillRect(x1 - PX * 0.5, yy, PX * 0.5, th);

      // 叶尖小花（花层）
      if (kind === 'flower' && bloomAmt > 0) {
        drawFlower(c, (x0 + x1) / 2, yy, bloomAmt);
      }
    }

    function drawFlower(c, x, y, amt) {
      var n = 5, rr = 3 + amt * 5.5;
      c.save();
      c.translate(x, y - 1);
      for (var i = 0; i < n; i++) {
        var a = (i / n) * TAU + 0.4;
        c.fillStyle = i % 2 ? C.petalB : C.petalA;
        c.beginPath();
        c.ellipse(Math.cos(a) * rr * 0.72, Math.sin(a) * rr * 0.72 - rr * 0.4,
          rr * 0.52, rr * 0.34, a, 0, TAU);
        c.fill();
      }
      c.fillStyle = C.petalB;
      c.beginPath(); c.arc(0, -rr * 0.4, rr * 0.3, 0, TAU); c.fill();
      c.restore();
    }

    function drawWorld(c) {
      setWorld(c);
      // 叶片层
      for (var i = 0; i < S.layers.length; i++) {
        var L = S.layers[i];
        var lyr = L.y;
        if (lyr < S.camY - 60 || lyr > S.camY + viewH + 60) continue;
        for (var j = 0; j < L.segs.length; j++) {
          drawSeg(c, L.segs[j].x0, L.segs[j].x1, lyr, L.kind, L.bend, L.bloom);
        }
      }
      // 水洼
      for (var p = 0; p < S.pools.length; p++) {
        var P = S.pools[p];
        if (P.taken) continue;
        if (P.y < S.camY - 40 || P.y > S.camY + viewH + 40) continue;
        var wob = 1 + Math.sin(S.t * 3 + P.wob) * 0.08;
        c.fillStyle = C.pool;
        c.beginPath();
        c.ellipse(P.x, P.y, 9 * wob, 4.6 / wob * 1.4, 0, 0, TAU);
        c.fill();
        c.fillStyle = C.poolGlow;
        c.beginPath();
        c.ellipse(P.x - 1.5, P.y - 1, 4.4 * wob, 1.9, 0, 0, TAU);
        c.fill();
      }
    }

    // —— 露珠：液体玻璃透镜 ——
    function drawDrop(c) {
      var D = S.drop;
      var r = D.r;
      var cx = sx(D.x), cy = sy(D.y);
      var rr = r * scale * dpr;
      if (rr < 1) return;

      // squash & stretch（表面张力）
      var sq = clamp(D.sq, -0.42, 0.42);
      var rx = rr * (1 + sq * 0.55);
      var ry = rr * (1 - sq * 0.55);

      var strength = 1 + clamp(D.vol, 0, 1) * 0.95;   // 体积越大，透镜越鼓
      var rainbow = S.rainbow || S.combo >= 8;

      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);   // 采样用设备像素坐标

      // 1) 折射：同心环从离屏采样放大（外→内，后画的内环覆盖前面中心）
      c.save();
      c.beginPath();
      c.ellipse(cx, cy, rx, ry, 0, 0, TAU);
      c.clip();
      var N = 9;
      for (var i = N - 1; i >= 0; i--) {
        var rt = rr * (i + 1) / N;
        var rs = rt / strength;
        c.drawImage(off,
          cx - rs, cy - rs, rs * 2, rs * 2,
          cx - rt, cy - rt, rt * 2, rt * 2);
      }
      // 2) 透镜底色（玻璃本身的那爱绿 + 一点冷调）
      var gg = c.createRadialGradient(cx - rx * 0.3, cy - ry * 0.35, rr * 0.1, cx, cy, rr);
      gg.addColorStop(0, 'rgba(214,238,208,0.30)');
      gg.addColorStop(0.55, 'rgba(120,180,150,0.16)');
      gg.addColorStop(1, 'rgba(40,80,60,0.34)');
      c.fillStyle = gg;
      c.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
      c.restore();

      // 3) 边缘色散（棱镜把白光散开）
      c.save();
      c.beginPath();
      c.ellipse(cx, cy, rx, ry, 0, 0, TAU);
      c.clip();
      var disp = c.createLinearGradient(cx - rx, cy - ry, cx + rx, cy + ry);
      if (rainbow) {
        disp.addColorStop(0.00, 'rgba(255,140,150,0.55)');
        disp.addColorStop(0.28, 'rgba(255,225,150,0.45)');
        disp.addColorStop(0.52, 'rgba(160,240,190,0.42)');
        disp.addColorStop(0.76, 'rgba(150,205,255,0.48)');
        disp.addColorStop(1.00, 'rgba(205,165,255,0.55)');
      } else {
        disp.addColorStop(0.00, 'rgba(200,255,225,0.30)');
        disp.addColorStop(0.45, 'rgba(150,210,180,0.10)');
        disp.addColorStop(1.00, 'rgba(180,225,255,0.26)');
      }
      c.globalCompositeOperation = 'screen';
      c.fillStyle = disp;
      c.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
      c.restore();

      // 4) 边缘高光（受光面亮边 + 背光面暗边，制造玻璃厚度）
      c.beginPath();
      c.ellipse(cx, cy, rx, ry, 0, 0, TAU);
      c.strokeStyle = 'rgba(232,245,220,' + (0.55 + 0.3 * clamp(D.vol, 0, 1)).toFixed(2) + ')';
      c.lineWidth = Math.max(1, 1.5 * dpr);
      c.stroke();
      c.beginPath();
      c.ellipse(cx, cy, rx, ry, 0, Math.PI * 0.15, Math.PI * 0.85);
      c.strokeStyle = 'rgba(16,34,24,0.42)';
      c.lineWidth = Math.max(1, 2 * dpr);
      c.stroke();

      // 5) 顶部反光带（天空光）+ 底部聚光点
      c.save();
      c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, TAU); c.clip();
      var hl = c.createRadialGradient(cx - rx * 0.34, cy - ry * 0.46, 0, cx - rx * 0.34, cy - ry * 0.46, rr * 0.95);
      hl.addColorStop(0, 'rgba(255,255,255,0.72)');
      hl.addColorStop(0.35, 'rgba(255,255,255,0.16)');
      hl.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = hl;
      c.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
      var fl = c.createRadialGradient(cx + rx * 0.3, cy + ry * 0.42, 0, cx + rx * 0.3, cy + ry * 0.42, rr * 0.5);
      fl.addColorStop(0, 'rgba(255,252,225,0.5)');
      fl.addColorStop(1, 'rgba(255,252,225,0)');
      c.fillStyle = fl;
      c.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
      c.restore();

      c.restore();
    }

    // —— 水痕轨迹 ——
    function pushTrail() {
      var D = S.drop;
      if (S.phase !== 'play') return;
      trail.push({ x: D.x, y: D.y, r: D.r * 0.72, life: 0, max: 1.1 });
      if (trail.length > 46) trail.shift();
    }

    function drawTrail(c) {
      setWorld(c);
      for (var i = 0; i < trail.length; i++) {
        var T = trail[i];
        var a = (1 - T.life / T.max) * 0.20;
        if (a <= 0) continue;
        c.fillStyle = 'rgba(180,225,205,' + a.toFixed(3) + ')';
        c.beginPath(); c.arc(T.x, T.y, T.r * (0.4 + 0.6 * (T.life / T.max)), 0, TAU); c.fill();
      }
    }

    // —— 粒子 / 飘字 / 涟漪 / 花瓣 ——
    function stepFx(dt) {
      var i;
      for (i = parts.length - 1; i >= 0; i--) {
        var p = parts[i];
        p.life += dt;
        if (p.life >= p.max) { parts.splice(i, 1); continue; }
        p.vy += p.g * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= Math.pow(0.35, dt);
      }
      for (i = floats.length - 1; i >= 0; i--) {
        var f = floats[i];
        f.life += dt; f.y -= 34 * dt;
        if (f.life >= f.max) floats.splice(i, 1);
      }
      for (i = ripples.length - 1; i >= 0; i--) {
        var rp = ripples[i];
        rp.life += dt;
        rp.r = rp.max * (1 - Math.pow(1 - rp.life / rp.max, 2.2));
        if (rp.life >= rp.max) ripples.splice(i, 1);
      }
      for (i = trail.length - 1; i >= 0; i--) {
        trail[i].life += dt;
        if (trail[i].life >= trail[i].max) trail.splice(i, 1);
      }
      for (i = petals.length - 1; i >= 0; i--) {
        var pt = petals[i];
        pt.life += dt;
        if (pt.life >= pt.max) { petals.splice(i, 1); continue; }
        pt.vy += 26 * dt;
        pt.vx += Math.sin(S.t * 2.2 + pt.rot) * 22 * dt;
        pt.x += pt.vx * dt; pt.y += pt.vy * dt;
        pt.rot += pt.rotV * dt;
      }
      if (petalRain > 0) {
        petalRain -= dt;
        if (Math.random() < 0.4) {
          petals.push({
            x: rnd(-10, CFG.VW + 10), y: S.camY - 20,
            vx: rnd(-14, 14), vy: rnd(30, 62),
            rot: rnd(0, TAU), rotV: rnd(-2.4, 2.4),
            life: 0, max: 6, s: rnd(2.4, 4.6),
            c: Math.random() < 0.5 ? C.petalA : C.petalB
          });
        }
      }
      if (shake > 0) shake = Math.max(0, shake - dt * 26);
      if (flash > 0) flash = Math.max(0, flash - dt * 2.6);
      if (bloom > 0) bloom = Math.max(0, bloom - dt * 2.2);
    }

    function drawFx(c) {
      setWorld(c);
      var i;
      for (i = 0; i < petals.length; i++) {
        var pt = petals[i];
        var a = 1 - Math.pow(pt.life / pt.max, 2.4);
        c.save();
        c.translate(pt.x, pt.y); c.rotate(pt.rot);
        c.globalAlpha = a;
        c.fillStyle = pt.c;
        c.beginPath(); c.ellipse(0, 0, pt.s, pt.s * 0.52, 0, 0, TAU); c.fill();
        c.restore();
      }
      c.globalAlpha = 1;
      for (i = 0; i < ripples.length; i++) {
        var rp = ripples[i];
        var ra = 1 - rp.life / rp.max;
        c.strokeStyle = rp.c;
        c.globalAlpha = ra * 0.55;
        c.lineWidth = rp.w;
        c.beginPath(); c.arc(rp.x, rp.y, rp.r, 0, TAU); c.stroke();
      }
      c.globalAlpha = 1;
      for (i = 0; i < parts.length; i++) {
        var p = parts[i];
        var pa = 1 - p.life / p.max;
        c.globalAlpha = pa;
        if (p.kind === 'glow') {
          c.fillStyle = p.c;
          c.beginPath(); c.arc(p.x, p.y, p.r * (0.4 + pa * 0.9), 0, TAU); c.fill();
        } else {
          c.fillStyle = p.c;
          c.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r);
        }
      }
      c.globalAlpha = 1;
      for (i = 0; i < floats.length; i++) {
        var f = floats[i];
        var fa = 1 - Math.pow(f.life / f.max, 2);
        c.globalAlpha = fa;
        c.fillStyle = f.c;
        c.font = '700 ' + f.size + 'px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
        c.textAlign = 'center';
        c.fillText(f.text, f.x, f.y);
      }
      c.globalAlpha = 1;
    }

    function mix(a, b, t) {
      var A = hex(a), B = hex(b);
      return 'rgb(' + Math.round(lerp(A[0], B[0], t)) + ',' +
        Math.round(lerp(A[1], B[1], t)) + ',' + Math.round(lerp(A[2], B[2], t)) + ')';
    }
    function hex(h) {
      return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)];
    }

    function draw(dt, events) {
      consume(events);
      stepFx(dt);
      if (S.phase === 'play') pushTrail();

      // 世界 → 离屏
      octx.setTransform(1, 0, 0, 1, 0, 0);
      octx.clearRect(0, 0, off.width, off.height);
      drawBackground(octx);
      drawWorld(octx);

      // 主画布
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      var sh = shake;
      if (sh > 0.05) ctx.translate(rnd(-sh, sh) * dpr, rnd(-sh, sh) * dpr);
      // 定格瞬间：画面极轻微推近，像时间被按下了一帧（HIROSTOPTIME）
      if (S.hitstop > 0) {
        var z = 1.014;
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.scale(z, z);
        ctx.translate(-canvas.width / 2, -canvas.height / 2);
      }
      ctx.drawImage(off, 0, 0);
      drawTrail(ctx);
      drawDrop(ctx);
      drawFx(ctx);
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      // 完美穿缝的白闪（HIROSTOPTIME 定格的余韵）
      if (flash > 0.01) {
        ctx.fillStyle = 'rgba(232,245,220,' + (flash * 0.22).toFixed(3) + ')';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      // 定格瞬间的边缘暗角微收（时间被按下的一瞬）
      if (S.hitstop > 0) {
        var vg = ctx.createRadialGradient(
          canvas.width / 2, canvas.height / 2, canvas.height * 0.28,
          canvas.width / 2, canvas.height / 2, canvas.height * 0.72);
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(1, 'rgba(6,14,10,0.5)');
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }

    return {
      resize: resize, draw: draw,
      palette: C,
      fx: { splash: spawnSplash, mist: spawnMist, float: float, ripple: ripple, petal: petalBurst },
      stats: function () { return { parts: parts.length, petals: petals.length, trail: trail.length }; },
      clear: function () { parts.length = 0; floats.length = 0; ripples.length = 0; trail.length = 0; petals.length = 0; }
    };
  }

  g.DewRender = { create: create, palette: C };
  if (typeof module !== 'undefined' && module.exports) module.exports = g.DewRender;
})(typeof globalThis !== 'undefined' ? globalThis : this);
