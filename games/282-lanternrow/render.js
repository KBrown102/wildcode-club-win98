/* ============================================================
   282-lanternrow / render.js
   《挑灯 · 一条街的光》—— 只读状态、不改状态
   Canvas 2D 画世界（夜市街景 / 灯笼 / 光 / 粒子），UI 交给 DOM
   ============================================================ */
(function (g) {
  'use strict';

  var W = 480, H = 900;
  var STREET_Y = 620;

  // ---------- 精灵 ----------
  var S = null;
  function mkCanvas(w, h) {
    var c = (typeof document !== 'undefined') ? document.createElement('canvas')
      : { width: 0, height: 0, getContext: function () { return null; } };
    c.width = w; c.height = h; return c;
  }
  function radial(size, stops) {
    var c = mkCanvas(size, size), x = c.getContext('2d');
    if (!x) return c;
    var gr = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (var i = 0; i < stops.length; i++) gr.addColorStop(stops[i][0], stops[i][1]);
    x.fillStyle = gr; x.fillRect(0, 0, size, size);
    return c;
  }
  function linearV(w, h, stops) {
    var c = mkCanvas(w, h), x = c.getContext('2d');
    if (!x) return c;
    var gr = x.createLinearGradient(0, 0, 0, h);
    for (var i = 0; i < stops.length; i++) gr.addColorStop(stops[i][0], stops[i][1]);
    x.fillStyle = gr; x.fillRect(0, 0, w, h);
    return c;
  }
  function ensureSprites() {
    if (S) return S;
    S = {
      glow: radial(160, [
        [0, 'rgba(255,214,150,0.95)'], [0.16, 'rgba(255,176,88,0.62)'],
        [0.42, 'rgba(255,132,52,0.24)'], [0.72, 'rgba(240,104,40,0.07)'],
        [1, 'rgba(220,90,30,0)']
      ]),
      core: radial(80, [
        [0, 'rgba(255,252,238,1)'], [0.35, 'rgba(255,224,150,0.78)'],
        [0.7, 'rgba(255,176,80,0.22)'], [1, 'rgba(255,150,60,0)']
      ]),
      beam: linearV(48, 256, [
        [0, 'rgba(255,176,90,0.34)'], [0.35, 'rgba(255,150,70,0.13)'],
        [1, 'rgba(255,130,60,0)']
      ]),
      pool: radial(128, [
        [0, 'rgba(255,186,104,0.42)'], [0.5, 'rgba(255,150,70,0.12)'], [1, 'rgba(255,130,60,0)']
      ]),
      soft: radial(64, [[0, 'rgba(255,246,220,0.9)'], [1, 'rgba(255,220,150,0)']]),
      moon: radial(200, [
        [0, 'rgba(220,232,255,0.5)'], [0.3, 'rgba(170,196,240,0.13)'], [1, 'rgba(150,180,230,0)']
      ])
    };
    return S;
  }

  // ---------- 静态背景（离屏缓存，2x） ----------
  var BG = null;
  function buildBG(rand) {
    var k = 2;
    var c = mkCanvas(W * k, H * k), x = c.getContext('2d');
    if (!x) return c;
    x.scale(k, k);

    // 夜空
    var sky = x.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#05070d');
    sky.addColorStop(0.16, '#0b1424');
    sky.addColorStop(0.42, '#132038');
    sky.addColorStop(0.62, '#0e1728');
    sky.addColorStop(0.69, '#0a0f1a');
    sky.addColorStop(1, '#060810');
    x.fillStyle = sky; x.fillRect(0, 0, W, H);

    // 月
    var mr = 20, mx = 414, my = 56;
    var mg = x.createRadialGradient(mx, my, 0, mx, my, mr);
    mg.addColorStop(0, 'rgba(226,236,255,0.46)');
    mg.addColorStop(0.55, 'rgba(198,214,246,0.17)');
    mg.addColorStop(1, 'rgba(180,200,240,0)');
    x.fillStyle = mg; x.beginPath(); x.arc(mx, my, mr * 1.8, 0, 6.2832); x.fill();
    x.fillStyle = 'rgba(236,242,255,0.50)';
    x.beginPath(); x.arc(mx, my, mr * 0.46, 0, 6.2832); x.fill();
    // 月晕里藏一点云
    x.fillStyle = 'rgba(10,16,28,0.55)';
    for (var ci = 0; ci < 3; ci++) {
      var cy = 52 + ci * 22, cw = 90 + ci * 40;
      x.beginPath();
      x.ellipse(mx - 30 + ci * 26, cy, cw * 0.5, 5 + ci, 0, 0, 6.2832);
      x.fill();
    }

    // 顶部屋檐（剪影）
    x.fillStyle = '#05070c';
    x.fillRect(0, 0, W, 46);
    x.fillStyle = '#080c14';
    for (var wx = -8; wx < W + 20; wx += 22) {
      x.beginPath();
      x.arc(wx, 44, 12, Math.PI, 0);
      x.fill();
    }
    x.fillStyle = 'rgba(70,84,112,0.30)';
    x.fillRect(0, 44, W, 2);

    // 远景山影
    x.fillStyle = 'rgba(14,22,38,0.75)';
    x.beginPath(); x.moveTo(0, 300);
    for (var mx2 = 0; mx2 <= W; mx2 += 40) {
      x.lineTo(mx2, 300 - 22 * Math.sin(mx2 * 0.013) - 14 * Math.sin(mx2 * 0.031 + 1.2));
    }
    x.lineTo(W, 360); x.lineTo(0, 360); x.closePath(); x.fill();

    // 两侧建筑立面（剪影）
    x.fillStyle = '#070a12';
    x.fillRect(0, 0, 26, STREET_Y + 10);
    x.fillRect(W - 26, 0, 26, STREET_Y + 10);

    // 街面（青石板）
    var st = x.createLinearGradient(0, STREET_Y, 0, H);
    st.addColorStop(0, '#0c111c');
    st.addColorStop(0.25, '#111826');
    st.addColorStop(1, '#070a11');
    x.fillStyle = st; x.fillRect(0, STREET_Y, W, H - STREET_Y);
    // 石板缝（近大远小）
    x.strokeStyle = 'rgba(120,140,175,0.055)';
    x.lineWidth = 1;
    for (var r = 0; r < 12; r++) {
      var yy = STREET_Y + 8 + Math.pow(r / 12, 1.7) * (H - STREET_Y - 10);
      x.beginPath(); x.moveTo(0, yy); x.lineTo(W, yy); x.stroke();
    }
    for (var cIdx = -6; cIdx < 14; cIdx++) {
      var xb = 240 + (cIdx - 4) * 34;
      x.beginPath();
      x.moveTo(240 + (cIdx - 4) * 10, STREET_Y + 4);
      x.lineTo(xb * 3.2 - 480, H);
      x.stroke();
    }
    // 街沿
    x.fillStyle = 'rgba(96,116,150,0.10)';
    x.fillRect(0, STREET_Y, W, 2);

    return c;
  }

  // ---------- 运行时视觉状态 ----------
  var V = null;
  function resetV(st) {
    var rand = st.rand;
    var peds = [];
    for (var i = 0; i < 9; i++) {
      peds.push({
        x: 30 + rand() * 420,
        t: 640 + rand() * 170,
        dir: rand() < 0.5 ? -1 : 1,
        sp: 16 + rand() * 22,
        kind: Math.floor(rand() * 4),
        ph: rand() * 6.28,
        look: 0
      });
    }
    V = {
      parts: [], lines: [], floats: [], skyLanterns: [],
      peds: peds,
      cat: { x: 44, target: 44, look: 0, sit: 0, dir: 1 },
      shake: 0, t: 0,
      flash: 0,
      bg: buildBG(rand),
      bankPulse: 0
    };
    return V;
  }

  function P(o) { V.parts.push(o); }
  function burst(x, y, n, opt) {
    opt = opt || {};
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 6.2832;
      var s = (opt.sp || 60) * (0.35 + Math.random() * 0.9);
      P({
        x: x, y: y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - (opt.up || 0),
        life: 0, max: (opt.life || 0.7) * (0.6 + Math.random() * 0.8),
        r: (opt.r || 2.4) * (0.5 + Math.random()),
        c: opt.c || '255,190,110',
        g: opt.g == null ? 30 : opt.g,
        kind: opt.kind || 'dot'
      });
    }
  }

  function floatText(x, y, txt, col, size) {
    V.floats.push({ x: x, y: y, txt: txt, col: col || '#ffd9a0', size: size || 20, life: 0, max: 1.5 });
  }

  // ---------- 事件消费 ----------
  function consume(st, audio) {
    var evs = st.events;
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i];
      if (e.type === 'launch') {
        burst(e.x, e.y, 8, { sp: 40, life: 0.4, r: 1.6, c: '255,220,150', g: 10 });
        if (audio) audio.launch();
      } else if (e.type === 'bounce') {
        burst(e.x, e.y, 3, { sp: 30, life: 0.28, r: 1.4, c: '255,200,120', g: 20 });
      } else if (e.type === 'hit') {
        V.shake = Math.min(9, 2.2 + e.n * 0.55);
        burst(e.x, e.y, 14 + e.n * 2, { sp: 90, life: 0.75, r: 2.6, c: '255,198,110', g: 40, up: 20 });
        // 沿绳跑火线
        for (var k = 0; k < e.chain.length; k++) {
          var it = e.chain[k];
          if (it.from >= 0) {
            var a = st.lanterns[it.from], b = st.lanterns[it.id];
            V.lines.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, t0: st.time + it.depth * 0.17, dur: 0.17 });
          }
        }
        floatText(e.x, e.y - 26, '+' + e.n, e.n >= 8 ? '#ffe6a8' : '#ffcf94', e.n >= 8 ? 26 : 20);
        if (Math.abs(e.x - V.cat.x) < 44) V.cat.look = 1.8;
        if (audio) audio.chain(e.n);
      } else if (e.type === 'miss') {
        burst(e.x, e.y - 6, 10, { sp: 40, life: 0.6, r: 2.2, c: '150,160,180', g: -10, up: 10 });
        floatText(e.x, e.y - 40, '空放', '#8fa0bd', 20);
        if (e.lost > 0) floatText(e.x, e.y - 66, '灯串灭了 ' + e.lost, '#c98b7a', 17);
        if (audio) audio.miss();
      } else if (e.type === 'burnout') {
        burst(e.x, e.y, 12, { sp: 34, life: 0.7, r: 2.4, c: '140,150,172', g: -14, up: 6 });
        floatText(e.x, e.y - 18, '烧到头了', '#8fa0bd', 18);
        if (e.lost > 0) floatText(e.x, e.y - 44, '灯串灭了 ' + e.lost, '#c98b7a', 17);
        if (audio) audio.miss();
      } else if (e.type === 'bank') {
        V.bankPulse = 1;
        floatText(240, 300, '+' + e.gained, '#ffe9b0', 34);
        burst(240, 320, 26, { sp: 120, life: 0.9, r: 2.6, c: '255,222,150', g: -30, up: 60 });
        if (audio) audio.bank();
      } else if (e.type === 'overflow') {
        floatText(240, 344, '挑不下，放下 ' + e.n + ' 盏', '#c3b596', 17);
        if (audio) audio.tap(0.5);
      } else if (e.type === 'clear') {
        V.flash = 1;
        for (var s2 = 0; s2 < 46; s2++) {
          V.skyLanterns.push({
            x: 30 + Math.random() * 420,
            y: STREET_Y + Math.random() * 120,
            vy: -(16 + Math.random() * 26),
            vx: (Math.random() - 0.5) * 12,
            r: 4 + Math.random() * 4,
            ph: Math.random() * 6.28
          });
        }
        if (audio) audio.clear();
      } else if (e.type === 'over') {
        if (audio) audio.over();
      }
    }
    evs.length = 0;
  }

  // ---------- 世界更新（纯视觉） ----------
  function stepVisuals(st, dt) {
    var i;
    V.t += dt;
    V.shake *= Math.pow(0.0016, dt);
    V.flash *= Math.pow(0.02, dt);
    V.bankPulse *= Math.pow(0.02, dt);

    for (i = V.parts.length - 1; i >= 0; i--) {
      var p = V.parts[i];
      p.life += dt;
      if (p.life >= p.max) { V.parts.splice(i, 1); continue; }
      p.vy += p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= Math.pow(0.45, dt);
    }
    for (i = V.lines.length - 1; i >= 0; i--) {
      if (st.time > V.lines[i].t0 + V.lines[i].dur + 0.1) V.lines.splice(i, 1);
    }
    for (i = V.floats.length - 1; i >= 0; i--) {
      var f = V.floats[i];
      f.life += dt; f.y -= 26 * dt;
      if (f.life >= f.max) V.floats.splice(i, 1);
    }
    for (i = V.skyLanterns.length - 1; i >= 0; i--) {
      var sl = V.skyLanterns[i];
      sl.y += sl.vy * dt; sl.x += (sl.vx + Math.sin(V.t * 0.8 + sl.ph) * 8) * dt;
      if (sl.y < -40) V.skyLanterns.splice(i, 1);
    }

    // 行人：只往有光的地方走
    for (i = 0; i < V.peds.length; i++) {
      var pd = V.peds[i];
      var lit = lightAt(st, pd.x);
      pd.x += pd.dir * pd.sp * (0.45 + lit * 0.75) * dt;
      if (pd.x < 22) { pd.x = 22; pd.dir = 1; }
      if (pd.x > W - 22) { pd.x = W - 22; pd.dir = -1; }
      if (pd.look > 0) pd.look -= dt;
      else if (lit > 0.55 && Math.random() < dt * 0.5) pd.look = 0.9;
    }

    // 猫：灯火越多，越敢往街心走
    var prog = st.litCount / st.total;
    var bestX = 40, bestL = -1;
    for (i = 0; i < st.lanterns.length; i++) {
      if (!st.lanterns[i].lit) continue;
      var lx = st.lanterns[i].x;
      var sc = 1 - Math.abs(lx - 240) / 300;
      if (sc > bestL) { bestL = sc; bestX = lx; }
    }
    V.cat.target = 44 + (bestX - 44) * (0.15 + prog * 0.8);
    if (Math.abs(V.cat.x - V.cat.target) > 2) {
      V.cat.dir = V.cat.target > V.cat.x ? 1 : -1;
      V.cat.x += (V.cat.target - V.cat.x) * Math.min(1, dt * 0.7);
      V.cat.sit = 0;
    } else {
      V.cat.sit = Math.min(1, V.cat.sit + dt * 0.6);
    }
    if (V.cat.look > 0) V.cat.look -= dt;
  }

  function lightAt(st, x) {
    var s = 0;
    for (var i = 0; i < st.lanterns.length; i++) {
      var L = st.lanterns[i];
      if (!L.lit) continue;
      var d = Math.abs(L.x - x);
      if (d < 96) s += (1 - d / 96) * 0.55;
    }
    return Math.min(1, s);
  }

  // ---------- 绘制 ----------
  function drawLantern(ctx, st, L, t) {
    var sx = Math.sin(t * 0.62 + L.sway) * 2.0;
    var x = L.x + sx;
    var y = L.y + Math.sin(t * 0.44 + L.sway * 1.7) * 1.1;
    var r = L.r;
    var age = st.time - L.litAt;
    var k = L.lit ? Math.min(1, Math.max(0, age / 0.32)) : 0;
    var ease = k * k * (3 - 2 * k);

    // 光晕
    if (ease > 0.01) {
      var gr = r * 6.2 * (0.72 + ease * 0.28);
      ctx.globalAlpha = 0.30 * ease * (0.92 + 0.08 * Math.sin(t * 3.1 + L.sway));
      ctx.drawImage(S.glow, x - gr, y - gr, gr * 2, gr * 2);
      ctx.globalAlpha = 1;
    }

    // 挂绳
    ctx.strokeStyle = 'rgba(88,74,58,0.55)';
    ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(x, y - r - 2); ctx.lineTo(x - sx * 0.4, y - r - 15); ctx.stroke();

    // 灯体上下的盖
    ctx.fillStyle = '#3a2118';
    ctx.fillRect(x - r * 0.42, y - r - 4.5, r * 0.84, 5);
    ctx.fillRect(x - r * 0.34, y + r - 0.5, r * 0.68, 4);

    // 纸身
    var bw = r * 0.94, bh = r * 1.02;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(sx * 0.012);
    if (L.lit) {
      var pg = ctx.createRadialGradient(0, -bh * 0.2, 1, 0, 0, bw * 1.25);
      pg.addColorStop(0, 'rgba(255,250,232,' + (0.35 + 0.65 * ease) + ')');
      pg.addColorStop(0.42, 'rgba(255,203,116,' + (0.3 + 0.7 * ease) + ')');
      pg.addColorStop(1, 'rgba(248,138,58,' + (0.28 + 0.72 * ease) + ')');
      ctx.fillStyle = pg;
    } else {
      ctx.fillStyle = '#2b3346';
    }
    ctx.beginPath(); ctx.ellipse(0, 0, bw, bh, 0, 0, 6.2832); ctx.fill();

    // 骨架（竖骨 + 上下箍）
    ctx.strokeStyle = L.lit ? 'rgba(122,52,32,0.62)' : 'rgba(112,58,46,0.5)';
    ctx.lineWidth = 1;
    for (var b = -1; b <= 1; b++) {
      var bx = b * bw * 0.52;
      var hgt = Math.sqrt(Math.max(0, 1 - (bx / bw) * (bx / bw))) * bh;
      ctx.beginPath(); ctx.moveTo(bx, -hgt); ctx.lineTo(bx, hgt); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(-bw * 0.96, -bh * 0.36); ctx.lineTo(bw * 0.96, -bh * 0.36); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-bw * 0.96, bh * 0.36); ctx.lineTo(bw * 0.96, bh * 0.36); ctx.stroke();

    // 词
    if (L.lit && ease > 0.35) {
      ctx.globalAlpha = Math.min(1, (ease - 0.35) / 0.5);
      ctx.fillStyle = 'rgba(96,44,20,0.92)';
      ctx.font = '600 12px "KaiTi","STKaiti","Songti SC",serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(L.word, 0, 0.5);
      ctx.globalAlpha = 1;
    }

    // 流苏
    ctx.strokeStyle = L.lit ? 'rgba(178,66,44,0.85)' : 'rgba(84,52,44,0.7)';
    ctx.lineWidth = 1.2;
    var fs = Math.sin(t * 1.6 + L.sway) * 1.6;
    ctx.beginPath();
    ctx.moveTo(0, bh - 0.5); ctx.lineTo(fs, bh + 8);
    ctx.stroke();
    ctx.restore();

    // 芯
    if (L.lit && ease > 0.05) {
      var cr = r * 1.5 * ease;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5 * ease;
      ctx.drawImage(S.core, x - cr, y - cr, cr * 2, cr * 2);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  function drawRope(ctx, st, rp, t) {
    var a = st.lanterns[rp.a], b = st.lanterns[rp.b];
    var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 + rp.sag;
    var both = a.lit && b.lit;
    ctx.strokeStyle = both ? 'rgba(150,96,52,0.5)' : 'rgba(72,62,50,0.42)';
    ctx.lineWidth = both ? 1.5 : 1.2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(mx, my, b.x, b.y);
    ctx.stroke();
  }

  function drawFireLines(ctx, st) {
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < V.lines.length; i++) {
      var L = V.lines[i];
      var k = (st.time - L.t0) / L.dur;
      if (k < 0 || k > 1) continue;
      var hx = L.x1 + (L.x2 - L.x1) * k;
      var hy = L.y1 + (L.y2 - L.y1) * k + Math.sin(k * Math.PI) * -3;
      var px = L.x1 + (L.x2 - L.x1) * Math.max(0, k - 0.28);
      var py = L.y1 + (L.y2 - L.y1) * Math.max(0, k - 0.28) + Math.sin(Math.max(0, k - 0.28) * Math.PI) * -3;
      var grd = ctx.createLinearGradient(px, py, hx, hy);
      grd.addColorStop(0, 'rgba(255,150,60,0)');
      grd.addColorStop(1, 'rgba(255,214,140,0.95)');
      ctx.strokeStyle = grd;
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(hx, hy); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawPed(ctx, p, t) {
    var x = p.x;
    var y = p.t;
    var sc = (y - 600) / 240;               // 近大远小
    var hgt = 34 + sc * 22;
    var walk = Math.sin(t * 5.2 + p.ph);
    var a = 0.30 + lightAt2 * 0.0;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(p.dir, 1);
    ctx.fillStyle = 'rgba(6,9,15,' + (0.55 + sc * 0.4) + ')';
    // 腿
    ctx.fillRect(-3.5, -hgt * 0.42, 3, hgt * 0.44 + walk * 1.4);
    ctx.fillRect(1.2, -hgt * 0.42, 3, hgt * 0.44 - walk * 1.4);
    // 身
    ctx.beginPath();
    ctx.moveTo(-5.5, -hgt * 0.42);
    ctx.lineTo(-4.2, -hgt * 0.92);
    ctx.lineTo(4.2, -hgt * 0.92);
    ctx.lineTo(5.5, -hgt * 0.42);
    ctx.closePath(); ctx.fill();
    // 头
    var hy = -hgt * 0.92 - 4.6 - (p.look > 0 ? 1.4 : 0);
    ctx.beginPath(); ctx.arc(0.6, hy, 4.2, 0, 6.2832); ctx.fill();
    // 道具
    if (p.kind === 1) { // 挑担
      ctx.strokeStyle = 'rgba(6,9,15,' + (0.55 + sc * 0.4) + ')';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-14, -hgt * 0.95); ctx.lineTo(14, -hgt * 1.02); ctx.stroke();
      ctx.fillRect(-16, -hgt * 0.95, 4, 5);
      ctx.fillRect(12, -hgt * 1.02, 4, 5);
    } else if (p.kind === 2) { // 撑伞
      ctx.strokeStyle = 'rgba(6,9,15,' + (0.55 + sc * 0.4) + ')';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(6, -hgt * 0.62); ctx.lineTo(6, -hgt * 1.35); ctx.stroke();
      ctx.fillStyle = 'rgba(6,9,15,' + (0.5 + sc * 0.4) + ')';
      ctx.beginPath(); ctx.ellipse(6, -hgt * 1.35, 11, 3.4, 0, 0, 6.2832); ctx.fill();
    } else if (p.kind === 3) { // 提灯
      ctx.fillStyle = 'rgba(255,190,110,0.75)';
      ctx.beginPath(); ctx.arc(8, -hgt * 0.5, 2.4, 0, 6.2832); ctx.fill();
    }
    ctx.restore();
  }

  var lightAt2 = 0;

  function drawCat(ctx, st, t) {
    var c = V.cat;
    var y = 700 + 92;
    var x = c.x;
    var lit = lightAt(st, x);
    var a = 0.30 + lit * 0.62;
    var sit = c.sit;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(c.dir, 1);
    ctx.fillStyle = 'rgba(6,9,15,' + a + ')';
    var bodyY = -6 - sit * 2.5;
    // 尾
    ctx.strokeStyle = 'rgba(6,9,15,' + a + ')';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-9, bodyY);
    ctx.quadraticCurveTo(-17, bodyY - 6 + Math.sin(t * 1.6) * 3, -13, bodyY - 13);
    ctx.stroke();
    // 身
    ctx.beginPath();
    ctx.ellipse(-3, bodyY - 1, 9.5, 5.6 - sit * 1.2, 0, 0, 6.2832);
    ctx.fill();
    // 头
    var hy = bodyY - 8 - sit * 1.5 - (c.look > 0 ? 2.2 : 0);
    ctx.beginPath(); ctx.arc(6.5, hy, 4.4, 0, 6.2832); ctx.fill();
    // 耳
    ctx.beginPath(); ctx.moveTo(3.6, hy - 3.2); ctx.lineTo(4.2, hy - 7.4); ctx.lineTo(7, hy - 4.4); ctx.fill();
    ctx.beginPath(); ctx.moveTo(7.6, hy - 4.2); ctx.lineTo(9.8, hy - 7.2); ctx.lineTo(10.4, hy - 3.4); ctx.fill();
    // 眼（有光时反光）
    if (lit > 0.3) {
      ctx.fillStyle = 'rgba(255,214,140,' + (0.35 + lit * 0.55) + ')';
      ctx.beginPath(); ctx.ellipse(5.4, hy - 0.6, 1.1, 0.85, 0, 0, 6.2832); ctx.fill();
      ctx.beginPath(); ctx.ellipse(9.0, hy - 0.6, 1.1, 0.85, 0, 0, 6.2832); ctx.fill();
    }
    ctx.restore();
  }

  function drawPlayer(ctx, st, t, aiming) {
    var x = 240, y = 838;
    var bob = Math.sin(t * 1.1) * 1.2;
    ctx.save();
    ctx.translate(x, y + bob);
    // 影子
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(0, 2, 18, 4.5, 0, 0, 6.2832); ctx.fill();
    // 腿
    ctx.fillStyle = '#05070c';
    ctx.fillRect(-7, -34, 5.5, 34);
    ctx.fillRect(2, -34, 5.5, 34);
    // 身
    ctx.beginPath();
    ctx.moveTo(-10, -33); ctx.lineTo(-7.5, -66);
    ctx.lineTo(7.5, -66); ctx.lineTo(10, -33);
    ctx.closePath(); ctx.fill();
    // 头
    ctx.beginPath(); ctx.arc(0, -73, 7.4, 0, 6.2832); ctx.fill();
    // 斗笠
    ctx.beginPath();
    ctx.moveTo(-15, -76); ctx.quadraticCurveTo(0, -88, 15, -76);
    ctx.quadraticCurveTo(0, -71, -15, -76);
    ctx.fill();
    // 挑杆
    var ang = st.aim.angle * Math.PI / 180;
    ctx.strokeStyle = '#0a0d14';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-4, -52);
    ctx.lineTo(-4 + Math.sin(ang) * 46, -52 - Math.cos(ang) * 46);
    ctx.stroke();
    // 杆头那盏灯（发射点）
    var hx = -4 + Math.sin(ang) * 50, hy = -52 - Math.cos(ang) * 50;
    var hr = 16;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.45;
    ctx.drawImage(S.glow, hx - hr, hy - hr, hr * 2, hr * 2);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#2a2118';
    ctx.beginPath(); ctx.ellipse(hx, hy, 6.4, 7, 0, 0, 6.2832); ctx.fill();
    var pg = ctx.createRadialGradient(hx, hy - 1, 0.5, hx, hy, 7.6);
    pg.addColorStop(0, 'rgba(255,252,236,1)');
    pg.addColorStop(0.5, 'rgba(255,206,120,0.95)');
    pg.addColorStop(1, 'rgba(250,148,58,0.95)');
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.ellipse(hx, hy, 5.6, 6.2, 0, 0, 6.2832); ctx.fill();
    ctx.restore();
    return { x: x + hx, y: y + bob + hy };
  }

  function drawAim(ctx, st, tip) {
    if (st.phase !== 'aim') return;
    var pts = st.__pts;
    if (!pts || pts.length < 4) return;
    var n = pts.length / 2;
    ctx.save();
    // 虚线
    for (var i = 0; i < n; i += 3) {
      var k = i / n;
      var px = pts[i * 2], py = pts[i * 2 + 1];
      var burnTint = pts.burn && k > 0.72;
      ctx.fillStyle = burnTint
        ? 'rgba(190,110,90,' + (0.5 * (1 - k * 0.5)) + ')'
        : 'rgba(255,214,150,' + (0.62 * (1 - k * 0.55)) + ')';
      ctx.beginPath();
      ctx.arc(px, py, 1.9 - k * 0.7, 0, 6.2832);
      ctx.fill();
    }
    // 落点
    if (pts.hit && pts.hitId != null) {
      var L = st.lanterns[pts.hitId];
      var cs = g.LanternGame.chainSize(st, pts.hitId);
      // 高亮这一挂
      ctx.strokeStyle = 'rgba(255,222,150,0.75)';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([4, 4]);
      for (var j = 0; j < cs.ids.length; j++) {
        var LL = st.lanterns[cs.ids[j]];
        ctx.beginPath();
        ctx.arc(LL.x, LL.y, LL.r + 5.5 + Math.sin(V.t * 4 + j) * 0.8, 0, 6.2832);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      // 数量牌
      var over = Math.max(0, st.pending + cs.n - g.LanternGame.CAP);
      ctx.fillStyle = 'rgba(10,14,22,0.82)';
      ctx.strokeStyle = over > 0 ? 'rgba(220,140,110,0.9)' : 'rgba(255,214,150,0.85)';
      ctx.lineWidth = 1.4;
      var bw = 62, bh = 24;
      var bx = Math.max(10, Math.min(W - bw - 10, L.x - bw / 2));
      var by = Math.max(56, L.y - 40);
      ctx.beginPath();
      var rr = 6;
      ctx.moveTo(bx + rr, by);
      ctx.arcTo(bx + bw, by, bx + bw, by + bh, rr);
      ctx.arcTo(bx + bw, by + bh, bx, by + bh, rr);
      ctx.arcTo(bx, by + bh, bx, by, rr);
      ctx.arcTo(bx, by, bx + bw, by, rr);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = over > 0 ? '#ffbfa0' : '#ffe0a8';
      ctx.font = '600 13px system-ui,"PingFang SC","Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('这一挂 ' + cs.n + ' 盏', bx + bw / 2, by + bh / 2);
      if (over > 0) {
        ctx.fillStyle = '#d79a86';
        ctx.font = '500 11px system-ui,"PingFang SC",sans-serif';
        ctx.fillText('挑子会溢出 ' + over, bx + bw / 2, by + bh + 9);
      }
    } else if (pts.burn) {
      var ex = pts[pts.length - 2], ey = pts[pts.length - 1];
      ctx.strokeStyle = 'rgba(200,120,100,0.7)';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(ex, ey, 7, 0, 6.2832); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ex - 4, ey - 4); ctx.lineTo(ex + 4, ey + 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ex + 4, ey - 4); ctx.lineTo(ex - 4, ey + 4); ctx.stroke();
    }
    ctx.restore();
  }

  function drawPowerRing(ctx, st, tip) {
    if (st.phase !== 'aim' || st.shotsUsed >= st.shots) return;
    var cx = 240, cy = 700, r0 = 30;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,214,150,0.16)';
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.arc(cx, cy, r0, Math.PI * 0.75, Math.PI * 2.25);
    ctx.stroke();
    var a0 = Math.PI * 0.75, a1 = a0 + (Math.PI * 1.5) * st.aim.power;
    ctx.strokeStyle = 'rgba(255,196,110,0.85)';
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.arc(cx, cy, r0, a0, a1);
    ctx.stroke();
    ctx.restore();
  }

  // ---------- 主绘制 ----------
  function draw(ctx, st, dt, audio) {
    ensureSprites();
    if (!V) resetV(st);
    consume(st, audio);
    stepVisuals(st, dt);
    var t = V.t;

    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (V.shake > 0.12) {
      ctx.translate((Math.random() - 0.5) * V.shake, (Math.random() - 0.5) * V.shake * 0.6);
    }

    // 背景
    ctx.drawImage(V.bg, 0, 0, W, H);

    // 建筑窗（随点亮进度渐次亮起）
    var prog = st.litCount / st.total;
    for (var i = 0; i < st.buildings.length; i++) {
      var b = st.buildings[i];
      ctx.fillStyle = '#080b13';
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = 'rgba(80,96,126,0.10)';
      ctx.fillRect(b.x, b.y, b.w, 3);
      for (var wI = 0; wI < b.windows.length; wI++) {
        var wd = b.windows[wI];
        if (prog < wd.thr * 0.92) continue;
        var fl = 0.7 + 0.3 * Math.sin(t * 1.7 + wd.x * 0.3 + wd.y * 0.11);
        ctx.fillStyle = 'rgba(255,190,110,' + (0.30 * fl) + ')';
        ctx.fillRect(wd.x, wd.y, wd.w, wd.h);
        ctx.fillStyle = 'rgba(255,214,150,' + (0.10 * fl) + ')';
        ctx.fillRect(wd.x - 2, wd.y - 2, wd.w + 4, wd.h + 4);
      }
    }

    // 幌子
    for (i = 0; i < st.banners.length; i++) {
      var bn = st.banners[i];
      var sw2 = Math.sin(t * 0.9 + bn.sway) * 3;
      ctx.save();
      ctx.translate(bn.x, bn.y);
      ctx.strokeStyle = 'rgba(70,60,48,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 6); ctx.stroke();
      ctx.rotate(sw2 * 0.012);
      ctx.fillStyle = 'rgba(24,20,30,0.94)';
      ctx.fillRect(-bn.w / 2, 6, bn.w, bn.h);
      ctx.strokeStyle = 'rgba(150,60,44,0.42)';
      ctx.lineWidth = 1;
      ctx.strokeRect(-bn.w / 2 + 0.5, 6.5, bn.w - 1, bn.h - 1);
      ctx.fillStyle = 'rgba(226,196,150,' + (0.16 + prog * 0.5) + ')';
      ctx.font = '600 13px "KaiTi","STKaiti",serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(bn.word, 0, 6 + bn.h * 0.42);
      ctx.restore();
    }

    // 绳
    for (i = 0; i < st.ropes.length; i++) drawRope(ctx, st, st.ropes[i], t);
    drawFireLines(ctx, st);

    // 街面光柱 + 光池
    ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < st.lanterns.length; i++) {
      var L = st.lanterns[i];
      if (!L.lit) continue;
      var age = st.time - L.litAt;
      var k = Math.min(1, Math.max(0, age / 0.32));
      var ease = k * k * (3 - 2 * k);
      if (ease < 0.02) continue;
      var flick = 0.9 + 0.1 * Math.sin(t * 3.4 + L.sway * 2);
      ctx.globalAlpha = 0.30 * ease * flick;
      var bh2 = 700 - L.y;
      ctx.drawImage(S.beam, L.x - 15, L.y, 30, bh2);
      // 湿石板上的光斑
      var pr = 54 + (700 - L.y) * 0.12;
      ctx.globalAlpha = 0.16 * ease * flick;
      ctx.drawImage(S.pool, L.x - pr, 726 - pr * 0.36, pr * 2, pr * 0.72);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // 灯笼
    for (i = 0; i < st.lanterns.length; i++) drawLantern(ctx, st, st.lanterns[i], t);

    // 行人 / 猫
    for (i = 0; i < V.peds.length; i++) drawPed(ctx, V.peds[i], t);
    drawCat(ctx, st, t);

    // 孔明灯（满街彩蛋）
    if (V.skyLanterns.length) {
      ctx.globalCompositeOperation = 'lighter';
      for (i = 0; i < V.skyLanterns.length; i++) {
        var sl = V.skyLanterns[i];
        ctx.globalAlpha = 0.7;
        ctx.drawImage(S.soft, sl.x - sl.r * 2.6, sl.y - sl.r * 2.6, sl.r * 5.2, sl.r * 5.2);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    // 玩家 + 瞄准
    var tip = drawPlayer(ctx, st, t, st.phase === 'aim');
    drawPowerRing(ctx, st, tip);
    drawAim(ctx, st, tip);

    // 火种
    if (st.seedObj) {
      var s = st.seedObj;
      ctx.globalCompositeOperation = 'lighter';
      // 拖尾
      for (i = 0; i < s.trail.length; i += 4) {
        var kk = i / Math.max(2, s.trail.length);
        ctx.globalAlpha = 0.30 * kk * Math.max(0.2, s.fuel);
        var tr = 3 + kk * 5;
        ctx.drawImage(S.soft, s.trail[i] - tr, s.trail[i + 1] - tr, tr * 2, tr * 2);
      }
      var fr = 9 * Math.max(0.35, s.fuel);
      ctx.globalAlpha = Math.max(0.25, s.fuel);
      ctx.drawImage(S.core, s.x - fr, s.y - fr, fr * 2, fr * 2);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    // 粒子
    ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < V.parts.length; i++) {
      var p = V.parts[i];
      var lk = 1 - p.life / p.max;
      ctx.globalAlpha = Math.max(0, lk) * 0.9;
      var pr2 = p.r * (0.4 + lk * 0.8);
      ctx.fillStyle = 'rgba(' + p.c + ',' + (0.55 + lk * 0.45) + ')';
      ctx.beginPath(); ctx.arc(p.x, p.y, pr2, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // 飘字
    for (i = 0; i < V.floats.length; i++) {
      var f = V.floats[i];
      var fk = 1 - f.life / f.max;
      ctx.globalAlpha = Math.min(1, fk * 1.8);
      ctx.fillStyle = f.col;
      ctx.font = '700 ' + f.size + 'px "KaiTi","STKaiti","PingFang SC",sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(6,9,15,0.6)';
      ctx.lineWidth = 3;
      ctx.strokeText(f.txt, f.x, f.y);
      ctx.fillText(f.txt, f.x, f.y);
      ctx.globalAlpha = 1;
    }

    if (V.flash > 0.01) {
      ctx.fillStyle = 'rgba(255,226,170,' + (V.flash * 0.4) + ')';
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  g.LanternRender = {
    draw: draw,
    reset: function (st) { return resetV(st); },
    W: W, H: H,
    lookUpCat: function () { if (V) V.cat.look = 1.6; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
