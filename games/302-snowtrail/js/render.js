/* 302 雪径 · 开路 — Canvas 渲染层 */
(function (g) {
  'use strict';
  var G = null, cv = null, ctx = null;
  var W = 900, H = 600, COLS = 60, ROWS = 40, CELL = 15;
  var bg = null, lvlBg = null, tCv = null, tCtx = null, tImg = null;
  var flakes = [], puffs = [], sparks = [], t0 = 0, shake = 0;
  var rockShapes = [];
  var glowWarm = null, glowRed = null;   // 预烘焙光晕精灵（每帧 createRadialGradient 是主要开销）

  function rnd(a) { return G.mulberry32(a); }

  function mkCanvas(w, h) {
    var c = (typeof document !== 'undefined') ? document.createElement('canvas') : null;
    if (!c) return null;
    c.width = w; c.height = h; return c;
  }

  // ---------- 背景（一次烘焙） ----------
  function bakeBase() {
    bg = mkCanvas(W, H); if (!bg) return;
    var c = bg.getContext('2d');
    var gd = c.createLinearGradient(0, 0, W * 0.35, H);
    gd.addColorStop(0, '#F1F4F7');
    gd.addColorStop(0.45, '#E1E9F0');
    gd.addColorStop(1, '#C7D5E3');
    c.fillStyle = gd; c.fillRect(0, 0, W, H);

    // 极地蓝调：右侧一大片霜紫冷影
    var rg = c.createRadialGradient(W * 0.78, H * 0.18, 40, W * 0.78, H * 0.18, 620);
    rg.addColorStop(0, 'rgba(126,126,158,0.16)');
    rg.addColorStop(1, 'rgba(126,126,158,0)');
    c.fillStyle = rg; c.fillRect(0, 0, W, H);

    var r = rnd(90210);
    // 风纹（长而淡的雪脊）
    for (var i = 0; i < 90; i++) {
      var x = r() * W, y = r() * H, len = 40 + r() * 190, a = -0.22 + (r() - 0.5) * 0.3;
      c.save(); c.translate(x, y); c.rotate(a);
      c.strokeStyle = r() < 0.5 ? 'rgba(255,255,255,0.55)' : 'rgba(150,170,192,0.16)';
      c.lineWidth = 1 + r() * 3.6; c.lineCap = 'round';
      c.beginPath(); c.moveTo(-len / 2, 0); c.quadraticCurveTo(0, (r() - 0.5) * 12, len / 2, 0); c.stroke();
      c.restore();
    }
    // 颗粒
    c.globalAlpha = 0.05;
    for (var p = 0; p < 2600; p++) {
      c.fillStyle = r() < 0.5 ? '#ffffff' : '#5d6b80';
      c.fillRect(r() * W, r() * H, 1, 1);
    }
    c.globalAlpha = 1;
  }

  // 预烘焙一张径向光晕精灵（半径 R，颜色 col，中心强度 a0）
  function bakeGlow(R, col, a0) {
    var c2 = mkCanvas(R * 2, R * 2); if (!c2) return null;
    var g = c2.getContext('2d');
    var rg = g.createRadialGradient(R, R, 1, R, R, R);
    rg.addColorStop(0, 'rgba(' + col + ',' + a0 + ')');
    rg.addColorStop(1, 'rgba(' + col + ',0)');
    g.fillStyle = rg; g.fillRect(0, 0, R * 2, R * 2);
    return c2;
  }

  // ---------- 关卡层（每关烘焙：底图 + 冰面 + 岩石 合成成一张） ----------
  function bakeLevel(st) {
    lvlBg = mkCanvas(W, H); if (!lvlBg) return;
    var c = lvlBg.getContext('2d');
    var lv = st.lv;
    if (bg) c.drawImage(bg, 0, 0);   // 底图并入场景层：每帧只画 1 张全屏图而不是 2 张
    // 暗角直接烘进场景层（做成 CSS 叠加层的话，软件合成下每帧要多付一次全屏混合 ≈ -20fps）
    var vg = c.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
    vg.addColorStop(0, 'rgba(24,32,48,0)');
    vg.addColorStop(1, 'rgba(24,32,48,0.28)');
    c.fillStyle = vg; c.fillRect(0, 0, W, H);

    // 冰面
    for (var i = 0; i < lv.ice.length; i++) {
      var ice = lv.ice[i];
      var rg = c.createRadialGradient(ice.x - ice.r * 0.3, ice.y - ice.r * 0.35, ice.r * 0.1, ice.x, ice.y, ice.r);
      rg.addColorStop(0, 'rgba(214,236,244,0.94)');
      rg.addColorStop(0.7, 'rgba(178,208,226,0.80)');
      rg.addColorStop(1, 'rgba(160,192,214,0.10)');
      c.fillStyle = rg;
      c.beginPath(); c.ellipse(ice.x, ice.y, ice.r, ice.r * 0.86, 0, 0, 6.2832); c.fill();
      c.strokeStyle = 'rgba(70,104,134,0.30)'; c.lineWidth = 1.6;
      c.beginPath(); c.ellipse(ice.x, ice.y, ice.r, ice.r * 0.86, 0, 0, 6.2832); c.stroke();
      var r2 = rnd(1300 + i * 37);
      for (var k = 0; k < 5; k++) {
        var a = r2() * 6.283, l = ice.r * (0.25 + r2() * 0.5);
        c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(ice.x, ice.y);
        c.lineTo(ice.x + Math.cos(a) * l, ice.y + Math.sin(a) * l * 0.86); c.stroke();
      }
    }

    // 岩石
    rockShapes = [];
    for (var j = 0; j < lv.rocks.length; j++) {
      var rk = lv.rocks[j];
      var rr = rnd(5100 + j * 91);
      var pts = [], n = 8 + Math.floor(rr() * 3);
      for (var q = 0; q < n; q++) {
        var ang = q / n * 6.2832, rad = rk.r * (0.76 + rr() * 0.34);
        pts.push([Math.cos(ang) * rad, Math.sin(ang) * rad * 0.9]);
      }
      rockShapes.push(pts);
      // 影
      c.fillStyle = 'rgba(64,78,100,0.20)';
      c.beginPath(); c.ellipse(rk.x + 5, rk.y + 8, rk.r * 1.06, rk.r * 0.62, 0, 0, 6.2832); c.fill();
      // 体
      c.beginPath();
      c.moveTo(rk.x + pts[0][0], rk.y + pts[0][1]);
      for (var m = 1; m < pts.length; m++) c.lineTo(rk.x + pts[m][0], rk.y + pts[m][1]);
      c.closePath();
      var g2 = c.createLinearGradient(rk.x - rk.r, rk.y - rk.r, rk.x + rk.r, rk.y + rk.r);
      g2.addColorStop(0, '#4B5568'); g2.addColorStop(0.55, '#2F3743'); g2.addColorStop(1, '#1D222B');
      c.fillStyle = g2; c.fill();
      // 雪帽
      c.save(); c.clip();
      c.fillStyle = 'rgba(244,248,251,0.92)';
      c.beginPath(); c.ellipse(rk.x, rk.y - rk.r * 0.52, rk.r * 0.95, rk.r * 0.42, 0, 0, 6.2832); c.fill();
      c.restore();
    }
  }

  // ---------- 初始化 ----------
  function init(canvas, game) {
    G = game; cv = canvas; ctx = cv.getContext('2d');
    bakeBase();
    tCv = mkCanvas(COLS, ROWS); tCtx = tCv.getContext('2d');
    tImg = tCtx.createImageData(COLS, ROWS);
    glowWarm = bakeGlow(78, '224,176,75', 0.30);
    glowRed = bakeGlow(42, '196,85,59', 0.30);
    flakes = [];
    var r = rnd(777);
    for (var i = 0; i < 62; i++) flakes.push({ x: r() * W, y: r() * H, z: 0.35 + r() * 0.9, s: 0.8 + r() * 2.1, ph: r() * 6.28 });
  }

  function setLevel(st) { bakeLevel(st); puffs = []; sparks = []; }

  function resizeBacking(devScale) {
    var k = Math.min(Math.max(devScale || 1, 0.6), 2.6);
    var bw = Math.ceil(W * k), bh = Math.ceil(H * k);   // ceil：宁可多 1px 也不能 backing < CSS（会糊）
    if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
    return k;
  }

  // ---------- 粒子 ----------
  function puff(x, y, n, warm) {
    for (var i = 0; i < n; i++) {
      puffs.push({
        x: x + (Math.random() - 0.5) * 8, y: y + (Math.random() - 0.5) * 6,
        vx: (Math.random() - 0.5) * 46, vy: (Math.random() - 0.5) * 46 - 8,
        life: 0.42 + Math.random() * 0.4, t: 0, r: 1.6 + Math.random() * 3.1, warm: !!warm
      });
    }
    if (puffs.length > 260) puffs.splice(0, puffs.length - 260);
  }
  function spark(x, y, n, col) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 6.283, sp = 40 + Math.random() * 120;
      sparks.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, life: 0.5 + Math.random() * 0.5, t: 0, col: col || '#C4553B' });
    }
    if (sparks.length > 220) sparks.splice(0, sparks.length - 220);
  }

  // ---------- 单帧 ----------
  function frame(st, dt, opts) {
    if (!ctx) return;
    opts = opts || {};
    t0 += dt;
    var k = resizeBacking(opts.devScale || 1);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.imageSmoothingEnabled = true;

    if (lvlBg) ctx.drawImage(lvlBg, 0, 0, W, H);
    else if (bg) ctx.drawImage(bg, 0, 0, W, H);

    // ---- 雪径（低分辨率场柔和放大） ----
    if (tCv) {
      var d = tImg.data, tr = st.trail;
      for (var i = 0; i < tr.length; i++) {
        var v = tr[i];
        var o = i * 4;
        if (v <= 0.001) { d[o + 3] = 0; continue; }
        var fr = v > 2 ? 1 : v / 2;
        d[o] = 196 - 92 * fr;
        d[o + 1] = 214 - 84 * fr;
        d[o + 2] = 230 - 70 * fr;
        d[o + 3] = Math.min(255, 52 + 190 * fr);
      }
      tCtx.putImageData(tImg, 0, 0);
      ctx.drawImage(tCv, 0, 0, W, H);
    }

    // ---- 营地 ----
    drawHome(st);

    // ---- 旗 ----
    for (var f = 0; f < st.lv.flags.length; f++) drawFlag(st.lv.flags[f], st, f);

    // ---- 粒子 ----
    drawPuffs(dt);
    drawSparks(dt);

    // ---- 玩家 ----
    drawPlayer(st, dt);

    // ---- 飘雪 ----
    drawFlakes(dt, st);

    // ---- 风向条 ----
    ctx.globalAlpha = 0.11; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2;
    for (var w = 0; w < 6; w++) {
      var yy = ((t0 * (18 + w * 5) + w * 137) % (H + 200)) - 100;
      var xx = ((t0 * (52 + w * 9) + w * 260) % (W + 300)) - 150;
      ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx + 88, yy + 16); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // ---- 暗角交给 #vig（CSS 合成层），这里不再每帧建渐变 ----
  }

  function drawHome(st) {
    var hx = st.lv.home.x, hy = st.lv.home.y, R = G.K.HOME_R;
    // 可达环
    ctx.save();
    ctx.setLineDash([5, 7]);
    ctx.strokeStyle = st.bag > 0 ? 'rgba(196,85,59,0.55)' : 'rgba(120,140,164,0.35)';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(hx, hy, R, 0, 6.2832); ctx.stroke();
    ctx.restore();
    // 暖光（预烘焙精灵 + alpha 呼吸）
    if (glowWarm) {
      var pul = 0.62 + 0.12 * Math.sin(t0 * 1.7);
      ctx.globalAlpha = pul;
      ctx.drawImage(glowWarm, hx - 78, hy - 78, 156, 156);
      ctx.globalAlpha = 1;
    }
    // 帐篷
    ctx.fillStyle = 'rgba(50,60,78,0.22)';
    ctx.beginPath(); ctx.ellipse(hx + 3, hy + 13, 20, 7, 0, 0, 6.2832); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(hx - 19, hy + 12); ctx.lineTo(hx, hy - 17); ctx.lineTo(hx + 19, hy + 12); ctx.closePath();
    var tg = ctx.createLinearGradient(hx, hy - 17, hx, hy + 12);
    tg.addColorStop(0, '#3B4453'); tg.addColorStop(1, '#20262F');
    ctx.fillStyle = tg; ctx.fill();
    ctx.fillStyle = 'rgba(224,176,75,0.92)';
    ctx.beginPath(); ctx.moveTo(hx - 6, hy + 11); ctx.lineTo(hx, hy - 4); ctx.lineTo(hx + 6, hy + 11); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,232,178,' + (0.55 + 0.28 * Math.sin(t0 * 2.1)).toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(hx, hy + 2, 3.1, 0, 6.2832); ctx.fill();
  }

  function drawFlag(fl, st, idx) {
    var x = fl.x, y = fl.y;
    ctx.save();
    if (fl.got) {
      ctx.globalAlpha = 0.34;
      ctx.strokeStyle = '#6B7A8F'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y + 14); ctx.lineTo(x, y - 20); ctx.stroke();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#7E8FA3'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(x - 6, y - 13); ctx.lineTo(x - 1, y - 8); ctx.lineTo(x + 8, y - 20); ctx.stroke();
      ctx.restore(); return;
    }
    // 光晕（预烘焙精灵）
    if (glowRed) ctx.drawImage(glowRed, x - 42, y - 52, 84, 84);
    // 影
    ctx.fillStyle = 'rgba(50,60,78,0.20)';
    ctx.beginPath(); ctx.ellipse(x + 2, y + 13, 9, 3.4, 0, 0, 6.2832); ctx.fill();
    // 杆
    ctx.strokeStyle = '#2B323D'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y + 13); ctx.lineTo(x, y - 22); ctx.stroke();
    // 旗面（风里摆）
    var ph = fl.ph + t0 * 2.4;
    ctx.beginPath();
    ctx.moveTo(x + 1, y - 21);
    var w1 = Math.sin(ph) * 3.2;
    ctx.quadraticCurveTo(x + 12, y - 19 + w1, x + 23 + w1 * 0.5, y - 14 + Math.sin(ph + 1) * 3.6);
    ctx.lineTo(x + 1, y - 7); ctx.closePath();
    var fg = ctx.createLinearGradient(x, y - 21, x + 24, y - 7);
    fg.addColorStop(0, '#D9563C'); fg.addColorStop(1, '#A8402E');
    ctx.fillStyle = fg; ctx.fill();
    ctx.restore();
  }

  function drawPlayer(st, dt) {
    var x = st.x, y = st.y;
    var spd = Math.sqrt(st.vx * st.vx + st.vy * st.vy);
    var moving = spd > 12;
    var ang = Math.atan2(st.sdy, st.sdx);
    ctx.save();
    ctx.translate(x, y);
    // 影
    ctx.fillStyle = 'rgba(46,56,72,0.24)';
    ctx.beginPath(); ctx.ellipse(2, 9, 10, 4.2, 0, 0, 6.2832); ctx.fill();

    var bob = moving ? Math.sin(t0 * 13) * 1.5 : Math.sin(t0 * 1.9) * 0.6;
    var lean = st.sliding ? 0.30 : (moving ? 0.10 : 0);
    ctx.rotate(ang + Math.PI / 2);
    ctx.translate(0, bob);

    // 腿
    var lp = moving ? Math.sin(t0 * 13) * 3.6 : 0;
    ctx.strokeStyle = '#1B2029'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-3, 4); ctx.lineTo(-3 + lp, 10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(3, 4); ctx.lineTo(3 - lp, 10); ctx.stroke();

    // 身体（外套）
    ctx.rotate(-lean * 0.4);
    ctx.beginPath();
    ctx.moveTo(-6.6, -6); ctx.quadraticCurveTo(0, -9.2, 6.6, -6);
    ctx.lineTo(5.4, 5.6); ctx.quadraticCurveTo(0, 7.6, -5.4, 5.6); ctx.closePath();
    var bgr = ctx.createLinearGradient(-7, -8, 7, 7);
    bgr.addColorStop(0, '#39414F'); bgr.addColorStop(1, '#1E242E');
    ctx.fillStyle = bgr; ctx.fill();
    // 围巾（唯一暖点，飘在身后）
    ctx.strokeStyle = '#C4553B'; ctx.lineWidth = 3.1; ctx.lineCap = 'round';
    var sw = Math.sin(t0 * 6.2) * 2.6 + (moving ? 3.4 : 0);
    ctx.beginPath(); ctx.moveTo(-4.6, -4.4); ctx.quadraticCurveTo(-9 - sw * 0.5, -1 + sw, -11 - sw, 5 + sw * 0.7); ctx.stroke();
    ctx.fillStyle = '#C4553B';
    ctx.beginPath(); ctx.ellipse(0, -4.6, 6.2, 2.4, 0, 0, 6.2832); ctx.fill();
    // 头
    ctx.fillStyle = '#2B323D';
    ctx.beginPath(); ctx.arc(0, -9.6, 4.5, 0, 6.2832); ctx.fill();
    ctx.fillStyle = 'rgba(238,242,246,0.9)';
    ctx.beginPath(); ctx.arc(-1.4, -11.2, 1.5, 0, 6.2832); ctx.fill();
    ctx.restore();

    // 滑行速度线
    if (st.sliding) {
      ctx.save(); ctx.globalAlpha = 0.4; ctx.strokeStyle = '#8FA6BC'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
      for (var i = 1; i <= 3; i++) {
        var bx = x - st.sdx * (10 + i * 9), by = y - st.sdy * (10 + i * 9);
        ctx.beginPath(); ctx.moveTo(bx - st.sdy * 5, by + st.sdx * 5); ctx.lineTo(bx + st.sdy * 5, by - st.sdx * 5); ctx.stroke();
      }
      ctx.restore();
    }
    // 背包信件
    if (st.bag > 0) {
      for (var b = 0; b < st.bag; b++) {
        var ax = x - 8 - b * 5.2, ay = y - 12 + b * 1.2;
        ctx.save();
        ctx.fillStyle = '#E7D7B4'; ctx.strokeStyle = '#8A7A55'; ctx.lineWidth = 0.9;
        ctx.beginPath(); ctx.rect(ax - 3.4, ay - 2.4, 6.8, 4.8); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ax - 3.4, ay - 2.4); ctx.lineTo(ax, ay + 0.6); ctx.lineTo(ax + 3.4, ay - 2.4); ctx.stroke();
        ctx.restore();
      }
    }
  }

  function drawPuffs(dt) {
    for (var i = puffs.length - 1; i >= 0; i--) {
      var p = puffs[i]; p.t += dt;
      if (p.t >= p.life) { puffs.splice(i, 1); continue; }
      var a = 1 - p.t / p.life;
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 26 * dt; p.vx *= 0.96;
      ctx.fillStyle = p.warm ? 'rgba(224,176,75,' + (a * 0.8).toFixed(3) + ')' : 'rgba(255,255,255,' + (a * 0.72).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 + (1 - a) * 0.9), 0, 6.2832); ctx.fill();
    }
  }
  function drawSparks(dt) {
    for (var i = sparks.length - 1; i >= 0; i--) {
      var s = sparks[i]; s.t += dt;
      if (s.t >= s.life) { sparks.splice(i, 1); continue; }
      var a = 1 - s.t / s.life;
      s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 130 * dt;
      ctx.globalAlpha = a;
      ctx.fillStyle = s.col;
      ctx.beginPath(); ctx.arc(s.x, s.y, 2.2 * a + 0.6, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function drawFlakes(dt, st) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (var i = 0; i < flakes.length; i++) {
      var f = flakes[i];
      f.x += (26 + f.z * 34) * dt; f.y += (14 + f.z * 20) * dt + Math.sin(t0 * 1.6 + f.ph) * 6 * dt;
      if (f.x > W + 6) { f.x = -6; f.y = Math.random() * H; }
      if (f.y > H + 6) { f.y = -6; f.x = Math.random() * W; }
      ctx.globalAlpha = 0.30 + f.z * 0.42;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.s * f.z, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  var API = {
    init: init, setLevel: setLevel, frame: frame, puff: puff, spark: spark,
    get fx() { return { puffs: puffs, sparks: sparks }; }
  };
  g.SC302R = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
