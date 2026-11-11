/* 301《合字 · 水诗》渲染层 */
(function () {
  'use strict';
  var G = window.WP301;
  var W = G.W, H = G.H, POOL = G.POOL, C = G.C;

  // 中国传统色 · 单色叙事（水=天水碧→群青，唯一暖点=茶红字块，高光=缃色金）
  var COL = {
    w0: '#B4D2C8', w1: '#7CA2B4', w2: '#3E5580', w3: '#1C2745',
    paper: '#F2EFE6', ink: '#232833',
    warm: '#A8503C', warmLo: '#8A3F2E',
    gold: '#E0B04B', goldLo: '#C08C2E',
    pad: '#5F7566', padLo: '#46594E',
    foam: 'rgba(240,248,245,', light: 'rgba(255,236,196,'
  };

  var cv, ctx, dpr = 1, backing = 1;
  var bg = null, blobs = [], padSprite = {}, glowS = null, wakeS = null;
  var parts = [];          // 粒子
  var ripples = [];        // 泳者尾迹
  var tGlobal = 0;

  function mk(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  function init(canvas) {
    cv = canvas; ctx = cv.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }

  // backing 分辨率 = W × min(dpr × 舞台缩放, 2.6)：只乘 dpr 会在 #stage 放大时糊
  function resize() {
    dpr = window.devicePixelRatio || 1;
    var stage = document.getElementById('stage');
    var sc = 1;
    if (stage && stage.style.transform) {
      var m = /scale\(([\d.]+)\)/.exec(stage.style.transform);
      if (m) sc = parseFloat(m[1]);
    }
    backing = Math.min(dpr * Math.max(sc, 1), 2.6);
    cv.width = Math.round(W * backing);
    cv.height = Math.round(H * backing);
    cv.style.width = W + 'px';
    cv.style.height = H + 'px';
    bakeBg();
  }

  function bakeBg() {
    bg = mk(W, H);
    var g = bg.getContext('2d');
    // 水体：天水碧 → 群青 竖渐变
    var lg = g.createLinearGradient(0, 0, 0, H);
    lg.addColorStop(0, COL.w0); lg.addColorStop(0.34, COL.w1);
    lg.addColorStop(0.72, COL.w2); lg.addColorStop(1, COL.w3);
    g.fillStyle = lg; g.fillRect(0, 0, W, H);

    // 窗光：左上斜射一片暖光（淡）
    var wg = g.createRadialGradient(W * 0.16, -H * 0.10, 10, W * 0.16, -H * 0.10, H * 1.05);
    wg.addColorStop(0, 'rgba(255,240,205,0.30)');
    wg.addColorStop(0.5, 'rgba(255,238,200,0.07)');
    wg.addColorStop(1, 'rgba(255,236,196,0)');
    g.fillStyle = wg; g.fillRect(0, 0, W, H);

    // 水面横纹（sin）
    g.globalAlpha = 0.085; g.strokeStyle = '#EAF6F2'; g.lineWidth = 1.5;
    for (var y = 0; y < H; y += 9) {
      g.beginPath();
      for (var x = 0; x <= W; x += 12) {
        var yy = y + Math.sin(x * 0.014 + y * 0.05) * 2.6 + Math.sin(x * 0.005 - y * 0.02) * 1.8;
        if (x === 0) g.moveTo(x, yy); else g.lineTo(x, yy);
      }
      g.stroke();
    }
    // 几道更亮的水面反光条（水是有光的）
    g.globalAlpha = 0.13; g.strokeStyle = '#FFFFFF'; g.lineWidth = 2.4;
    for (var y2 = 40; y2 < H; y2 += 118) {
      g.beginPath();
      for (var x2 = 0; x2 <= W; x2 += 14) {
        var yy2 = y2 + Math.sin(x2 * 0.008 + y2 * 0.03) * 5.5;
        if (x2 === 0) g.moveTo(x2, yy2); else g.lineTo(x2, yy2);
      }
      g.stroke();
    }
    g.globalAlpha = 1;

    // 留白：四角柔和压亮（宣纸感，克制）
    var vg = g.createRadialGradient(W / 2, H / 2, H * 0.34, W / 2, H / 2, H * 1.0);
    vg.addColorStop(0, 'rgba(255,255,255,0)');
    vg.addColorStop(1, 'rgba(228,236,236,0.17)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);

    // 颗粒（一次烘焙）
    g.globalAlpha = 0.045;
    for (var i = 0; i < 5200; i++) {
      var px = Math.random() * W, py = Math.random() * H;
      g.fillStyle = Math.random() < 0.5 ? '#FFFFFF' : '#0E1626';
      g.fillRect(px, py, 1.2, 1.2);
    }
    g.globalAlpha = 1;

    // 池沿：外侧石岸暗线 + 内侧一道贴壁水光
    g.strokeStyle = 'rgba(10,18,34,0.62)'; g.lineWidth = 3;
    g.strokeRect(POOL.x0 - 1.5, POOL.y0 - 1.5, POOL.x1 - POOL.x0 + 3, POOL.y1 - POOL.y0 + 3);
    g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 2;
    g.strokeRect(POOL.x0 + 3, POOL.y0 + 3, POOL.x1 - POOL.x0 - 6, POOL.y1 - POOL.y0 - 6);

    // 柔光斑 sprite（水面缓慢流动）
    blobs = [];
    for (var b = 0; b < 5; b++) {
      var R = 130 + Math.random() * 150;
      var s = mk(R * 2, R * 2), sg = s.getContext('2d');
      var rg = sg.createRadialGradient(R, R, 0, R, R, R);
      rg.addColorStop(0, 'rgba(255,255,255,0.16)');
      rg.addColorStop(0.55, 'rgba(255,250,235,0.06)');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      sg.fillStyle = rg; sg.fillRect(0, 0, R * 2, R * 2);
      blobs.push({
        s: s, R: R, x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - 0.5) * 7, vy: (Math.random() - 0.5) * 5, a: 0.5 + Math.random() * 0.5
      });
    }
    // 光晕 sprite（成字高光）
    glowS = mk(160, 160);
    var gg = glowS.getContext('2d');
    var gr = gg.createRadialGradient(80, 80, 0, 80, 80, 80);
    gr.addColorStop(0, 'rgba(255,214,130,0.55)');
    gr.addColorStop(0.4, 'rgba(240,190,110,0.20)');
    gr.addColorStop(1, 'rgba(240,190,110,0)');
    gg.fillStyle = gr; gg.fillRect(0, 0, 160, 160);
  }

  function padSp(r) {
    var k = Math.round(r);
    if (padSprite[k]) return padSprite[k];
    var s = mk(r * 2 + 8, r * 2 + 8), g = s.getContext('2d');
    var cx = r + 4, cy = r + 4;
    g.fillStyle = 'rgba(12,20,32,0.20)';
    g.beginPath(); g.ellipse(cx + 3, cy + 5, r, r * 0.96, 0, 0, 6.284); g.fill();
    var lg = g.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
    lg.addColorStop(0, '#7C9179'); lg.addColorStop(0.7, COL.pad); lg.addColorStop(1, COL.padLo);
    g.fillStyle = lg;
    g.beginPath(); g.arc(cx, cy, r, 0.42, 6.0); g.closePath(); g.fill();  // 缺口
    g.strokeStyle = 'rgba(240,248,242,0.22)'; g.lineWidth = 1.4; g.stroke();
    // 叶脉
    g.strokeStyle = 'rgba(20,34,28,0.20)'; g.lineWidth = 1;
    for (var i = 0; i < 7; i++) {
      var a = -0.3 + i * 0.62;
      g.beginPath(); g.moveTo(cx - r * 0.1, cy + r * 0.1);
      g.lineTo(cx + Math.cos(a) * r * 0.88, cy + Math.sin(a) * r * 0.88); g.stroke();
    }
    padSprite[k] = s;
    return s;
  }

  // ===== 事件驱动的表现 =====
  function onEvents(st) {
    for (var i = 0; i < st.events.length; i++) {
      var e = st.events[i];
      if (e.t === 'merge') {
        for (var k = 0; k < 16; k++) {
          var a = Math.random() * 6.284, sp = 40 + Math.random() * 130;
          parts.push({
            x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            life: 0.55 + Math.random() * 0.4, t: 0,
            r: 1.4 + Math.random() * 2.2, c: e.bonus ? 'rgba(200,214,232,' : 'rgba(255,214,130,'
          });
        }
        ripples.push({ x: e.x, y: e.y, r: 10, R: 74, t: 0, life: 0.8, w: 2.4, c: 'rgba(255,220,150,' });
      } else if (e.t === 'bump') {
        ripples.push({ x: e.x, y: e.y, r: 6, R: 38, t: 0, life: 0.42, w: 1.6, c: 'rgba(226,238,238,' });
      } else if (e.t === 'split') {
        ripples.push({ x: e.x, y: e.y, r: 8, R: 58, t: 0, life: 0.5, w: 2, c: 'rgba(210,226,232,' });
      } else if (e.t === 'win') {
        for (var w2 = 0; w2 < 3; w2++) {
          ripples.push({ x: W / 2, y: H / 2, r: 20 + w2 * 60, R: 460, t: -w2 * 0.16, life: 1.5, w: 2.4, c: 'rgba(255,226,168,' });
        }
      }
    }
  }

  function draw(st, dt) {
    tGlobal += dt;
    ctx.setTransform(backing, 0, 0, backing, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // 手持呼吸感：极缓慢的整体缩放+平移
    var br = Math.sin(tGlobal * 0.42) * 0.0032;
    var bx = Math.sin(tGlobal * 0.31) * 2.2, by = Math.cos(tGlobal * 0.27) * 1.8;
    ctx.translate(W / 2 + bx, H / 2 + by);
    ctx.scale(1 + br, 1 + br);
    ctx.translate(-W / 2, -H / 2);

    ctx.drawImage(bg, 0, 0);

    // 流动柔光斑
    for (var b = 0; b < blobs.length; b++) {
      var o = blobs[b];
      o.x += o.vx * dt; o.y += o.vy * dt;
      if (o.x < -o.R) o.x = W + o.R; if (o.x > W + o.R) o.x = -o.R;
      if (o.y < -o.R) o.y = H + o.R; if (o.y > H + o.R) o.y = -o.R;
      ctx.globalAlpha = o.a;
      ctx.drawImage(o.s, o.x - o.R, o.y - o.R);
    }
    ctx.globalAlpha = 1;

    // 荷叶
    for (var p = 0; p < st.pads.length; p++) {
      var pd = st.pads[p], sp = padSp(pd.r);
      ctx.drawImage(sp, pd.x - pd.r - 4, pd.y - pd.r - 4);
    }

    var sw = st.swim;
    var spd = Math.hypot(sw.vx, sw.vy);
    var ang = spd > 6 ? Math.atan2(sw.vy, sw.vx) : (st.lastAng || -Math.PI / 2);
    st.lastAng = ang;

    // ===== 尾流楔形：把「你会把字块往哪个方向推」直接画出来 =====
    if (spd > 12) {
      var L = C.PUSH_FRONT * 0.92, Bk = C.PUSH_BACK * 0.85, Wd = C.PUSH_W * 0.92;
      var ca = Math.cos(ang), sa = Math.sin(ang);
      function px(a, l) { return sw.x + ca * a - sa * l; }
      function py(a, l) { return sw.y + sa * a + ca * l; }
      var gr = ctx.createLinearGradient(sw.x - ca * Bk, sw.y - sa * Bk, sw.x + ca * L, sw.y + sa * L);
      var al = Math.min(0.42, 0.12 + spd / 760);
      gr.addColorStop(0, COL.foam + (al * 0.18) + ')');
      gr.addColorStop(0.45, COL.foam + al + ')');
      gr.addColorStop(1, COL.foam + '0)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.moveTo(px(-Bk, -Wd * 0.42), py(-Bk, -Wd * 0.42));
      ctx.lineTo(px(L * 0.55, -Wd), py(L * 0.55, -Wd));
      ctx.lineTo(px(L, 0), py(L, 0));
      ctx.lineTo(px(L * 0.55, Wd), py(L * 0.55, Wd));
      ctx.lineTo(px(-Bk, Wd * 0.42), py(-Bk, Wd * 0.42));
      ctx.closePath(); ctx.fill();
      // 两侧白浪线
      ctx.strokeStyle = COL.foam + Math.min(0.85, al * 1.9) + ')'; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(px(-Bk, -Wd * 0.42), py(-Bk, -Wd * 0.42));
      ctx.lineTo(px(L * 0.55, -Wd), py(L * 0.55, -Wd)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px(-Bk, Wd * 0.42), py(-Bk, Wd * 0.42));
      ctx.lineTo(px(L * 0.55, Wd), py(L * 0.55, Wd)); ctx.stroke();
      // 推力前沿弧：一眼看出「水会往这个方向把字块送出去」
      ctx.strokeStyle = COL.foam + Math.min(0.7, al * 1.5) + ')'; ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, L * 0.72, ang - 0.62, ang + 0.62);
      ctx.stroke();
    }

    // 尾迹涟漪
    if (spd > 40 && ripples.length < 90 && Math.random() < 0.5) {
      ripples.push({ x: sw.x - Math.cos(ang) * 22, y: sw.y - Math.sin(ang) * 22, r: 5, R: 30, t: 0, life: 0.7, w: 1.3, c: COL.foam });
    }

    // ===== 可配对提示（淡虚线，教会玩家「谁跟谁能合」） =====
    var al2 = st.parts;
    ctx.save();
    ctx.setLineDash([5, 7]); ctx.lineWidth = 1.4;
    for (var i = 0; i < al2.length; i++) {
      for (var j = i + 1; j < al2.length; j++) {
        if (!G.pairOf(al2[i].g, al2[j].g)) continue;
        var d = Math.hypot(al2[i].x - al2[j].x, al2[i].y - al2[j].y);
        if (d > 250) continue;
        var aa = (1 - d / 250) * 0.24;
        ctx.strokeStyle = 'rgba(168,80,60,' + aa.toFixed(3) + ')';
        ctx.beginPath(); ctx.moveTo(al2[i].x, al2[i].y); ctx.lineTo(al2[j].x, al2[j].y); ctx.stroke();
      }
    }
    ctx.restore();

    // ===== 字块 =====
    for (var k = 0; k < st.parts.length; k++) drawToken(st.parts[k], dt);
    for (var c2 = 0; c2 < st.chars.length; c2++) drawChar(st.chars[c2], st.t);

    // ===== 泳者（简笔色块） =====
    drawSwimmer(sw, ang, spd, st);

    // 涟漪
    for (var r = ripples.length - 1; r >= 0; r--) {
      var rp = ripples[r];
      rp.t += dt;
      if (rp.t < 0) continue;
      if (rp.t > rp.life) { ripples.splice(r, 1); continue; }
      var u = rp.t / rp.life;
      ctx.strokeStyle = rp.c + ((1 - u) * 0.55).toFixed(3) + ')';
      ctx.lineWidth = rp.w * (1 - u * 0.6);
      ctx.beginPath(); ctx.arc(rp.x, rp.y, rp.r + (rp.R - rp.r) * u, 0, 6.284); ctx.stroke();
    }

    // 粒子
    for (var q = parts.length - 1; q >= 0; q--) {
      var pt = parts[q];
      pt.t += dt;
      if (pt.t > pt.life) { parts.splice(q, 1); continue; }
      pt.x += pt.vx * dt; pt.y += pt.vy * dt;
      pt.vx *= 0.94; pt.vy *= 0.94;
      var u2 = 1 - pt.t / pt.life;
      ctx.fillStyle = pt.c + (u2 * 0.8).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r * u2 + 0.4, 0, 6.284); ctx.fill();
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function drawToken(o, dt) {
    var R = C.R_RAD;
    var bob = Math.sin(tGlobal * 1.6 + o.id * 1.7) * 1.6;
    var x = o.x, y = o.y + bob;
    // 影
    ctx.fillStyle = 'rgba(10,18,30,0.20)';
    ctx.beginPath(); ctx.ellipse(x + 2, y + 6, R * 0.94, R * 0.62, 0, 0, 6.284); ctx.fill();
    // 水圈
    ctx.strokeStyle = 'rgba(244,250,248,0.55)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, R + 3.5, 0, 6.284); ctx.stroke();
    // 盘面
    var lg = ctx.createRadialGradient(x - R * 0.3, y - R * 0.35, R * 0.15, x, y, R);
    lg.addColorStop(0, '#C2644A'); lg.addColorStop(0.72, COL.warm); lg.addColorStop(1, COL.warmLo);
    ctx.fillStyle = lg;
    ctx.beginPath(); ctx.arc(x, y, R, 0, 6.284); ctx.fill();
    ctx.strokeStyle = 'rgba(255,232,214,0.34)'; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.arc(x, y, R - 3, 0, 6.284); ctx.stroke();
    // 部件字
    ctx.fillStyle = COL.paper;
    ctx.font = '600 30px "Songti SC","SimSun","STSong",serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(o.g, x, y + 1);
  }

  function drawChar(ch, t) {
    var R = C.R_RAD + 5;
    var age = Math.min(1, (t - ch.born) * 2.6);
    var pop = 1 + (1 - age) * 0.55;
    var bob = Math.sin(tGlobal * 1.2 + ch.id * 2.1) * 1.2;
    var x = ch.x, y = ch.y + bob;
    // 金光晕
    ctx.globalAlpha = age * 0.9;
    ctx.drawImage(glowS, x - 80, y - 80, 160, 160);
    ctx.globalAlpha = 1;
    // 影
    ctx.fillStyle = 'rgba(10,18,30,0.22)';
    ctx.beginPath(); ctx.ellipse(x + 2, y + 7, R * 0.96, R * 0.6, 0, 0, 6.284); ctx.fill();
    // 盘面
    var lg = ctx.createRadialGradient(x - R * 0.3, y - R * 0.35, R * 0.12, x, y, R * pop);
    lg.addColorStop(0, '#F5D98A'); lg.addColorStop(0.7, COL.gold); lg.addColorStop(1, COL.goldLo);
    ctx.fillStyle = lg;
    ctx.beginPath(); ctx.arc(x, y, R * pop, 0, 6.284); ctx.fill();
    ctx.strokeStyle = 'rgba(255,246,220,0.6)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, R * pop - 3, 0, 6.284); ctx.stroke();
    // 合成字
    ctx.fillStyle = '#4A3418';
    ctx.font = '600 33px "Songti SC","SimSun","STSong",serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(ch.ch, x, y + 1);
    // 组成小字
    ctx.globalAlpha = 0.62 * age;
    ctx.fillStyle = '#6B4E1E';
    ctx.font = '500 11px "Songti SC","SimSun",serif';
    ctx.fillText(ch.a + '＋' + ch.b, x, y + R * pop + 11);
    ctx.globalAlpha = 1;
    if (ch.bonus) {
      ctx.fillStyle = 'rgba(120,90,30,0.75)';
      ctx.font = '500 10px system-ui,sans-serif';
      ctx.fillText('意外之字 · 可点开', x, y - R * pop - 9);
    }
  }

  function drawSwimmer(sw, ang, spd, st) {
    var R = C.SWIM_R * 1.72;   // 视觉比物理大一圈：看得见 + 判定宽容
    var x = sw.x, y = sw.y;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang);
    // 影
    ctx.fillStyle = 'rgba(8,14,26,0.26)';
    ctx.beginPath(); ctx.ellipse(2, 6, R * 1.15, R * 0.72, 0, 0, 6.284); ctx.fill();
    // 双臂（交替划水）—— 画在身前更外扩，才看得出是「人在游」
    var ph = Math.sin(sw.stroke * 2.1);
    ctx.lineCap = 'round'; ctx.lineWidth = 6.5;
    for (var s = -1; s <= 1; s += 2) {
      var a = s * (0.62 + ph * 0.5 * s);
      ctx.save(); ctx.rotate(a);
      ctx.strokeStyle = '#454C5C';
      ctx.beginPath(); ctx.moveTo(-R * 0.15, s * R * 0.5);
      ctx.quadraticCurveTo(R * 0.55, s * R * 1.25, R * 1.15, s * R * 0.85);
      ctx.stroke();
      ctx.fillStyle = '#6B7382';
      ctx.beginPath(); ctx.arc(R * 1.18, s * R * 0.86, 3.1, 0, 6.284); ctx.fill();
      ctx.restore();
    }
    // 身
    ctx.fillStyle = COL.ink;
    ctx.beginPath(); ctx.ellipse(0, 0, R * 1.05, R * 0.74, 0, 0, 6.284); ctx.fill();
    // 头
    ctx.fillStyle = '#3A3F4C';
    ctx.beginPath(); ctx.arc(R * 0.72, 0, R * 0.52, 0, 6.284); ctx.fill();
    // 泳帽高光
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath(); ctx.arc(R * 0.62, -R * 0.18, R * 0.2, 0, 6.284); ctx.fill();
    ctx.restore();
    // 换气气泡（真的停下来回气时才冒，别在游动时糊在脸上）
    if (spd < 18 && Math.random() < 0.035) {
      parts.push({
        x: x + (Math.random() - 0.5) * 12, y: y - 6,
        vx: (Math.random() - 0.5) * 5, vy: -9 - Math.random() * 8,
        life: 0.75, t: 0, r: 0.9 + Math.random() * 1.2, c: COL.foam
      });
    }
  }

  window.WP301R = { init: init, resize: resize, draw: draw, onEvents: onEvents };
})();
