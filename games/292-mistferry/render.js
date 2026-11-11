/* 292-mistferry · 渲染层：只读状态、不写状态；消费 st.events 生成粒子/飘字 */
(function (g) {
  'use strict';
  var G = g.MistFerry;
  var W = G.W, H = G.H, P = G.P;

  var COL = {
    paper: '#F2EDE3',
    paper2: '#E9E3D6',
    water: '#DBE2E3',
    waterDeep: '#CBD5D7',
    cove: '#E4EAE8',
    bank: '#B7C0C1',
    ink: '#2B2B2B',
    ink2: '#4A4E52',
    mtFar: '#C9CDC7',
    mtNear: '#B0B6B0',
    land: '#E4DED1',
    vermilion: '#C1473A',
    jade: '#6FA287',
    stone: '#55595E',
    slate: '#7A8085',
    mist: '242,237,227'
  };

  function shade(hex, k) {
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
    if (k >= 0) { r += (255 - r) * k; gg += (255 - gg) * k; b += (255 - b) * k; }
    else { r *= (1 + k); gg *= (1 + k); b *= (1 + k); }
    return 'rgb(' + (r | 0) + ',' + (gg | 0) + ',' + (b | 0) + ')';
  }

  function mkCanvas(w, h) {
    var c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  }

  // 软笔刷（供雾层擦除用）：一次性烘焙，运行时只 drawImage
  function brush(kind) {
    var s = 64, c = mkCanvas(s, s), x = c.getContext('2d');
    var gr = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    if (kind === 'ring') {
      gr.addColorStop(0.00, 'rgba(0,0,0,0)');
      gr.addColorStop(0.55, 'rgba(0,0,0,0.06)');
      gr.addColorStop(0.80, 'rgba(0,0,0,0.55)');
      gr.addColorStop(0.94, 'rgba(0,0,0,0.95)');
      gr.addColorStop(1.00, 'rgba(0,0,0,0)');
    } else {
      gr.addColorStop(0.00, 'rgba(0,0,0,1)');
      gr.addColorStop(0.62, 'rgba(0,0,0,0.92)');
      gr.addColorStop(0.86, 'rgba(0,0,0,0.34)');
      gr.addColorStop(1.00, 'rgba(0,0,0,0)');
    }
    x.fillStyle = gr; x.fillRect(0, 0, s, s);
    return c;
  }

  function Render(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.eff = 1;
    this.bg = null; this.bgKey = '';
    this.fog = null; this.fctx = null;
    this.FS = 3;                       // 雾层降采样倍率
    this.brushDisc = brush('disc');
    this.brushRing = brush('ring');
    this.parts = [];
    this.texts = [];
    this.flash = 0;
    this.shake = 0;
    this.t = 0;
  }

  Render.prototype.resize = function (eff) {
    this.eff = eff;
    this.cv.width = Math.round(W * eff);
    this.cv.height = Math.round(H * eff);
    this.cv.style.width = W + 'px';
    this.cv.style.height = H + 'px';
    this.bgKey = '';                    // 强制重烘焙
    var fw = Math.round(W / this.FS), fh = Math.round(H / this.FS);
    if (!this.fog) { this.fog = mkCanvas(fw, fh); this.fctx = this.fog.getContext('2d'); }
    this.fw = fw; this.fh = fh;
    this.resetFog();
  };

  Render.prototype.resetFog = function () {
    var f = this.fctx;
    f.setTransform(1, 0, 0, 1, 0, 0);
    f.globalCompositeOperation = 'source-over';
    f.globalAlpha = 1;
    f.fillStyle = 'rgb(' + COL.mist + ')';
    f.fillRect(0, 0, this.fw, this.fh);
  };

  // ---------- 背景烘焙（每关一次） ----------
  Render.prototype.bake = function (L, key) {
    if (this.bgKey === key && this.bg) return;
    this.bgKey = key;
    var eff = this.eff;
    var c = mkCanvas(Math.round(W * eff), Math.round(H * eff));
    var x = c.getContext('2d');
    x.setTransform(eff, 0, 0, eff, 0, 0);
    var i, y;

    x.fillStyle = COL.paper; x.fillRect(0, 0, W, H);

    // 河道采样
    var N = 96, pts = [];
    for (i = 0; i <= N; i++) { y = H * i / N; pts.push(G.limitsAt(L, y)); }

    // 江水（先铺满再盖陆地）
    x.fillStyle = COL.water;
    x.fillRect(0, 0, W, H);

    // 洄湾（静水口袋，颜色更淡，一眼看出「可以停」）
    for (i = 0; i < L.coves.length; i++) {
      var cv = L.coves[i];
      x.beginPath();
      var y0 = Math.max(0, cv.y - cv.hh * 1.25), y1 = Math.min(H, cv.y + cv.hh * 1.25);
      for (var s = 0; s <= 24; s++) {
        var yy = y0 + (y1 - y0) * s / 24;
        var sp = G.limitsAt(L, yy);
        var base = cv.side < 0 ? sp.cx - sp.hw : sp.cx + sp.hw;
        var outer = cv.side < 0 ? sp.lx : sp.rx;
        if (s === 0) x.moveTo(base, yy); else x.lineTo(base, yy);
      }
      for (var s2 = 24; s2 >= 0; s2--) {
        var yy2 = y0 + (y1 - y0) * s2 / 24;
        var sp2 = G.limitsAt(L, yy2);
        var outer2 = cv.side < 0 ? sp2.lx : sp2.rx;
        x.lineTo(outer2, yy2);
      }
      x.closePath();
      x.fillStyle = COL.cove; x.fill();
    }

    // 陆地
    var landL = new Path2D(), landR = new Path2D();
    landL.moveTo(0, 0);
    for (i = 0; i <= N; i++) landL.lineTo(pts[i].lx, H * i / N);
    landL.lineTo(0, H); landL.closePath();
    landR.moveTo(W, 0);
    for (i = 0; i <= N; i++) landR.lineTo(pts[i].rx, H * i / N);
    landR.lineTo(W, H); landR.closePath();

    x.fillStyle = COL.land; x.fill(landL); x.fill(landR);

    // 远山（剪裁在陆地内，淡墨两层）
    x.save();
    var clip = new Path2D(); clip.addPath(landL); clip.addPath(landR);
    x.clip(clip);
    drawRidge(x, H * 0.16, 46, COL.mtFar, 3.1, 1.7);
    drawRidge(x, H * 0.30, 62, COL.mtNear, 2.2, 2.9);
    drawRidge(x, H * 0.52, 40, COL.mtFar, 4.3, 1.1);
    drawRidge(x, H * 0.74, 54, COL.mtNear, 2.7, 2.2);
    // 陆地皴点
    var rr = G.mulberry32(9137);
    x.globalAlpha = 0.5;
    for (i = 0; i < 420; i++) {
      var px = rr() * W, py = rr() * H;
      var sp3 = G.limitsAt(L, py);
      var out = px < sp3.lx - 4 || px > sp3.rx + 4;
      if (!out) continue;
      x.fillStyle = rr() < 0.5 ? 'rgba(120,124,116,0.16)' : 'rgba(90,94,88,0.11)';
      var sz = 1 + rr() * 2.2;
      x.fillRect(px, py, sz, sz * (0.4 + rr()));
    }
    x.globalAlpha = 1;
    x.restore();

    // 岸线（淡墨）
    x.strokeStyle = COL.bank; x.lineWidth = 2.2; x.lineJoin = 'round';
    x.beginPath();
    for (i = 0; i <= N; i++) { y = H * i / N; if (i === 0) x.moveTo(pts[i].lx, y); else x.lineTo(pts[i].lx, y); }
    x.stroke();
    x.beginPath();
    for (i = 0; i <= N; i++) { y = H * i / N; if (i === 0) x.moveTo(pts[i].rx, y); else x.lineTo(pts[i].rx, y); }
    x.stroke();

    // 水痕（极淡横线，只在江心）
    x.strokeStyle = 'rgba(255,255,255,0.42)'; x.lineWidth = 1.4;
    for (i = 0; i < 66; i++) {
      var wy = (i / 66) * H + 6;
      var sp4 = G.limitsAt(L, wy);
      var w0 = sp4.cx - sp4.hw * 0.72 + ((i * 37) % 40);
      var len = sp4.hw * (0.5 + ((i * 53) % 50) / 100);
      x.beginPath(); x.moveTo(w0, wy); x.lineTo(w0 + len, wy); x.stroke();
    }

    this.bg = c;
  };

  function drawRidge(x, baseY, amp, col, freq, phase) {
    x.beginPath();
    x.moveTo(-10, baseY + amp);
    for (var i = -10; i <= W + 10; i += 8) {
      var yy = baseY - amp * (0.5 + 0.5 * Math.sin(i / W * 6.283 * freq + phase)) * (0.6 + 0.4 * Math.sin(i * 0.031 + phase * 2));
      x.lineTo(i, yy);
    }
    x.lineTo(W + 10, baseY + amp + 200);
    x.lineTo(-10, baseY + amp + 200);
    x.closePath();
    x.fillStyle = col; x.globalAlpha = 0.75; x.fill(); x.globalAlpha = 1;
  }

  // ---------- 事件 → 粒子 ----------
  Render.prototype.feed = function (st) {
    var es = st.events;
    for (var i = 0; i < es.length; i++) {
      var e = es[i];
      if (e.t === 'land') {
        for (var k = 0; k < 16; k++) {
          var a = (k / 16) * 6.283, sp = 40 + Math.random() * 90;
          this.parts.push({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.75, max: 0.75, r: 2.2, c: COL.vermilion });
        }
        this.texts.push({ x: e.x, y: e.y - 26, txt: '+' + e.gain, life: 1.15, max: 1.15, c: COL.vermilion });
        this.flash = 0.28;
      } else if (e.t === 'fast') {
        this.texts.push({ x: e.x, y: e.y - 24, txt: '太快了', life: 1.0, max: 1.0, c: COL.slate });
        this.shake = 0.12;
      } else if (e.t === 'bump') {
        for (var k2 = 0; k2 < 7; k2++) {
          var a2 = Math.random() * 6.283, s2 = 30 + Math.random() * 60;
          this.parts.push({ x: e.x, y: e.y, vx: Math.cos(a2) * s2, vy: Math.sin(a2) * s2, life: 0.45, max: 0.45, r: 1.8, c: COL.ink2 });
        }
        this.shake = 0.14;
      } else if (e.t === 'vortex') {
        for (var k3 = 0; k3 < 12; k3++) {
          var a3 = (k3 / 12) * 6.283, s3 = 50 + Math.random() * 50;
          this.parts.push({ x: e.x, y: e.y, vx: Math.cos(a3) * s3, vy: Math.sin(a3) * s3, life: 0.6, max: 0.6, r: 2, c: COL.slate });
        }
        this.texts.push({ x: e.x, y: e.y - 20, txt: '卷入漩涡 −1', life: 0.9, max: 0.9, c: COL.slate });
      }
    }
    es.length = 0;
  };

  Render.prototype.step = function (dt) {
    var i, p;
    for (i = this.parts.length - 1; i >= 0; i--) {
      p = this.parts[i]; p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.94; p.vy *= 0.94;
      if (p.life <= 0) this.parts.splice(i, 1);
    }
    for (i = this.texts.length - 1; i >= 0; i--) {
      p = this.texts[i]; p.life -= dt; p.y -= 26 * dt;
      if (p.life <= 0) this.texts.splice(i, 1);
    }
    if (this.flash > 0) this.flash -= dt * 3.2;
    if (this.shake > 0) this.shake -= dt * 3.4;
    this.t += dt;
  };

  // ---------- 主绘制 ----------
  Render.prototype.draw = function (st, dt) {
    var ctx = this.ctx, eff = this.eff, L = st.L, i;
    this.step(dt);

    ctx.setTransform(eff, 0, 0, eff, 0, 0);
    if (this.shake > 0) {
      var s = this.shake * 9;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }

    if (!this.bg) this.bake(L, 'x');
    ctx.drawImage(this.bg, 0, 0, W, H);

    // --- 障碍（已探明的才画；未探明的留给雾遮住） ---
    for (i = 0; i < L.rocks.length; i++) {
      if (!st.seen['r' + i]) continue;
      var rk = L.rocks[i];
      ctx.fillStyle = COL.stone;
      ctx.beginPath();
      for (var a = 0; a < 8; a++) {
        var ang = a / 8 * 6.283;
        var rr2 = rk.r * (0.78 + 0.22 * Math.sin(a * 2.3 + rk.id));
        var px = rk.x + Math.cos(ang) * rr2, py = rk.y + Math.sin(ang) * rr2 * 0.8;
        if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.30)';
      ctx.beginPath(); ctx.ellipse(rk.x - rk.r * 0.26, rk.y - rk.r * 0.34, rk.r * 0.34, rk.r * 0.2, -0.5, 0, 6.283); ctx.fill();
    }
    for (i = 0; i < L.vort.length; i++) {
      if (!st.seen['v' + i]) continue;
      var vt = L.vort[i];
      ctx.save();
      ctx.translate(vt.x, vt.y);
      ctx.rotate(this.t * 0.9 + i);
      ctx.strokeStyle = 'rgba(122,128,133,0.55)'; ctx.lineWidth = 2;
      for (var b = 0; b < 3; b++) {
        ctx.beginPath();
        for (var q = 0; q <= 40; q++) {
          var th = b * 2.094 + q / 40 * 3.4;
          var rad = vt.r * (0.16 + 0.84 * (q / 40));
          var px2 = Math.cos(th) * rad, py2 = Math.sin(th) * rad;
          if (q === 0) ctx.moveTo(px2, py2); else ctx.lineTo(px2, py2);
        }
        ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = 'rgba(122,128,133,0.22)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(vt.x, vt.y, vt.r, 0, 6.283); ctx.stroke();
    }
    for (i = 0; i < L.spring.length; i++) {
      if (!st.seen['s' + i]) continue;
      var sp5 = L.spring[i];
      for (var c2 = 0; c2 < 3; c2++) {
        var ph = (this.t * 0.6 + c2 / 3) % 1;
        ctx.strokeStyle = 'rgba(111,162,135,' + (0.42 * (1 - ph)).toFixed(3) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(sp5.x, sp5.y, sp5.r * (0.16 + 0.84 * ph), 0, 6.283); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(111,162,135,0.20)';
      ctx.beginPath(); ctx.arc(sp5.x, sp5.y, sp5.r * 0.18, 0, 6.283); ctx.fill();
    }

    // 尾迹
    for (i = 0; i < st.wake.length; i++) {
      var wk = st.wake[i];
      if (wk.a <= 0) continue;
      ctx.fillStyle = 'rgba(120,132,136,' + (wk.a * 0.22).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(wk.x, wk.y, 1.9, 0, 6.283); ctx.fill();
    }

    // --- 雾层 ---
    this.updateFog(st, dt);
    ctx.setTransform(eff, 0, 0, eff, 0, 0);
    ctx.drawImage(this.fog, 0, 0, W, H);

    // 桨声涟漪（画在雾之上，看得见才叫「回音」）
    for (i = 0; i < st.ripples.length; i++) {
      var rp = st.ripples[i];
      var al = 0.42 * (1 - rp.r / rp.max);
      ctx.strokeStyle = 'rgba(122,140,144,' + Math.max(0, al).toFixed(3) + ')';
      ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(rp.x, rp.y, rp.r, 0, 6.283); ctx.stroke();
    }

    // --- 渡口（始终可见：这是目标） ---
    for (i = 0; i < L.docks.length; i++) {
      var dk = L.docks[i];
      var pulse = 0.5 + 0.5 * Math.sin(this.t * 2.1 + i * 1.3);
      if (dk.done) {
        ctx.fillStyle = 'rgba(193,71,58,0.88)';
        ctx.fillRect(dk.x - 9, dk.y - 9, 18, 18);
        ctx.fillStyle = COL.paper;
        ctx.beginPath(); ctx.arc(dk.x, dk.y, 3.4, 0, 6.283); ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(193,71,58,' + (0.55 + 0.3 * pulse).toFixed(3) + ')';
        ctx.lineWidth = 2.4;
        ctx.strokeRect(dk.x - 10, dk.y - 10, 20, 20);
        ctx.fillStyle = 'rgba(193,71,58,' + (0.16 + 0.14 * pulse).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(dk.x, dk.y, P.DOCK_R * 0.9, 0, 6.283); ctx.fill();
        ctx.strokeStyle = 'rgba(193,71,58,0.30)';
        ctx.lineWidth = 1; ctx.setLineDash([4, 5]);
        ctx.beginPath(); ctx.arc(dk.x, dk.y, P.DOCK_R, 0, 6.283); ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // --- 舟 ---
    var bx = st.x, by = st.y;
    var speed = Math.hypot(st.vx, st.vy);
    var ok = speed < P.V_LAND;
    // 可停靠指示环：慢够了转石绿 —— 一眼教会「何时不划」
    ctx.strokeStyle = ok ? 'rgba(111,162,135,0.62)' : 'rgba(122,128,133,0.26)';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(bx, by, P.BOAT_R + 8 + (ok ? 2 + 1.6 * Math.sin(this.t * 3) : 0), 0, 6.283); ctx.stroke();

    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(st.h);
    ctx.fillStyle = COL.ink;
    ctx.beginPath();
    ctx.moveTo(15, 0);
    ctx.quadraticCurveTo(2, 7.2, -13, 4.2);
    ctx.quadraticCurveTo(-16, 0, -13, -4.2);
    ctx.quadraticCurveTo(2, -7.2, 15, 0);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(242,237,227,0.9)';
    ctx.beginPath(); ctx.arc(-1.5, 0, 2.6, 0, 6.283); ctx.fill();   // 蓑笠人影
    ctx.strokeStyle = 'rgba(242,237,227,0.55)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(2, 0); ctx.stroke();
    ctx.restore();

    // 速度矢量提示（越划越长的水花线）
    if (speed > 12) {
      var ux = st.vx / speed, uy = st.vy / speed;
      ctx.strokeStyle = 'rgba(122,140,144,0.30)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(bx + ux * 14, by + uy * 14);
      ctx.lineTo(bx + ux * (14 + Math.min(30, speed * 0.22)), by + uy * (14 + Math.min(30, speed * 0.22)));
      ctx.stroke();
    }

    // 粒子 / 飘字
    for (i = 0; i < this.parts.length; i++) {
      var pt = this.parts[i];
      ctx.fillStyle = pt.c; ctx.globalAlpha = Math.max(0, pt.life / pt.max);
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.font = '600 17px "Songti SC","SimSun",serif';
    ctx.textAlign = 'center';
    for (i = 0; i < this.texts.length; i++) {
      var tx = this.texts[i];
      ctx.fillStyle = tx.c; ctx.globalAlpha = Math.max(0, Math.min(1, tx.life / tx.max * 1.6));
      ctx.fillText(tx.txt, tx.x, tx.y);
    }
    ctx.globalAlpha = 1;

    if (this.flash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + (this.flash * 0.34).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };

  Render.prototype.updateFog = function (st, dt) {
    var f = this.fctx, S = this.FS, i;
    f.setTransform(1, 0, 0, 1, 0, 0);
    // 雾回涌（约 7 秒重新朦胧）
    f.globalCompositeOperation = 'source-over';
    f.globalAlpha = 1;
    f.fillStyle = 'rgba(' + COL.mist + ',' + (Math.min(1, P.REFOG * dt * 60)).toFixed(4) + ')';
    f.fillRect(0, 0, this.fw, this.fh);

    f.globalCompositeOperation = 'destination-out';
    // 舟周围常显
    var br = P.REVEAL_R / S;
    f.globalAlpha = 0.42;
    f.drawImage(this.brushDisc, st.x / S - br, st.y / S - br, br * 2, br * 2);
    // 桨声涟漪扫过
    for (i = 0; i < st.ripples.length; i++) {
      var rp = st.ripples[i];
      var r2 = rp.r / S;
      f.globalAlpha = 0.30;
      f.drawImage(this.brushRing, rp.x / S - r2, rp.y / S - r2, r2 * 2, r2 * 2);
    }
    f.globalAlpha = 1;
    f.globalCompositeOperation = 'source-over';
  };

  g.MF = g.MF || {};
  g.MF.Render = Render;
  g.MF.COL = COL;
  g.MF.shade = shade;
})(typeof globalThis !== 'undefined' ? globalThis : this);
