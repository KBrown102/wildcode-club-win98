/* 秤星 · 悬衡谷 — 渲染层（只读状态，消费 st.events 生成粒子/飘字后清空） */
(function (g) {
  'use strict';
  var G = g.ScaleBeam;
  var W = G.W, H = G.H, PX = G.PX, PY = G.PY, HL = G.HL;

  var C = {
    sky0: '#04080F', sky1: '#071320', sky2: '#0A1E2B',
    rock: '#0A141F', rockHi: '#16293A', rockLo: '#060C14',
    water: '#0A2430', waterHi: '#175C68',
    iron: '#2B3B49', ironHi: '#43606F', ironLo: '#141E27',
    brass: '#C89A4B', brassHi: '#F2D791', brassLo: '#6E4E1C',
    teal: '#7FE3D4', tealDim: '#3D8C86',
    warm: '#FFD98A', warmDim: '#8A6B3A',
    cryOff: '#22333F', cryEdge: '#2E4550'
  };

  function q(v, p) { p = p || 3; return Math.round(v / p) * p; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function mkCanvas(w, h) {
    var c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c;
  }
  function glowSprite(col, r) {
    var s = Math.ceil(r * 2), c = mkCanvas(s, s), x = c.getContext('2d'), gr;
    gr = x.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, col); gr.addColorStop(0.32, col);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gr; x.beginPath(); x.arc(r, r, r, 0, 6.2832); x.fill();
    return c;
  }

  function Render(cv) {
    this.cv = cv; this.ctx = cv.getContext('2d');
    this.eff = 1; this.parts = []; this.texts = []; this.shake = 0; this.flash = 0;
    this.t = 0; this.bg = null; this.bgKey = '';
    this.spStar = [null];
    for (var m = 1; m <= 5; m++) this.spStar[m] = glowSprite(G.STAR_COL[m - 1], 26);
    this.spBeam = glowSprite('rgba(127,227,212,0.95)', 40);
    this.spWarm = glowSprite('rgba(255,217,138,0.95)', 44);
    this.spTeal = glowSprite('rgba(127,227,212,0.85)', 34);
    this.past = null;
  }

  Render.prototype.resize = function (eff) {
    this.eff = eff;
    this.cv.width = Math.round(W * eff); this.cv.height = Math.round(H * eff);
    this.cv.style.width = W + 'px'; this.cv.style.height = H + 'px';
    this.bgKey = '';
    if (!this.past) this.past = mkCanvas(W, H);
  };

  /* 谷壁高度（与 game.js 的曲线常量严格一致） */
  function wallY(x) {
    var u = clamp((x - PX) / G.WALL_AX, -1, 1);
    return G.WALL_Y0 + G.WALL_YD * (1 - u * u);
  }

  /* ---------------- 背景烘焙 ---------------- */
  Render.prototype.bake = function (st, key) {
    var k = key + '@' + this.eff.toFixed(2);
    if (this.bgKey === k && this.bg) return;
    this.bgKey = k;
    var eff = this.eff, c = mkCanvas(W * eff, H * eff), x = c.getContext('2d');
    x.setTransform(eff, 0, 0, eff, 0, 0);
    var i, j;

    /* 天穹渐变 */
    var gr = x.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#04080F'); gr.addColorStop(0.34, '#071320');
    gr.addColorStop(0.62, '#0A1E2B'); gr.addColorStop(1, '#0C2630');
    x.fillStyle = gr; x.fillRect(0, 0, W, H);

    /* 上方冰层的冷雾 */
    var gr2 = x.createRadialGradient(PX, 90, 20, PX, 120, 300);
    gr2.addColorStop(0, 'rgba(30,72,86,0.30)'); gr2.addColorStop(1, 'rgba(30,72,86,0)');
    x.fillStyle = gr2; x.fillRect(0, 0, W, 420);

    /* 星尘（确定性） */
    var sd = 20260909;
    function rnd() { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; }
    x.fillStyle = 'rgba(180,220,225,0.5)';
    for (i = 0; i < 90; i++) {
      var sx = rnd() * W, sy = rnd() * 430, a = 0.10 + rnd() * 0.42;
      x.globalAlpha = a; x.fillRect(q(sx), q(sy), 2, 2);
    }
    x.globalAlpha = 1;

    /* 谷壁（像素阶梯） */
    x.beginPath();
    x.moveTo(0, H);
    x.lineTo(0, q(wallY(0)));
    for (var xx = 0; xx <= W; xx += 3) x.lineTo(xx, q(wallY(xx)));
    x.lineTo(W, H); x.closePath();
    var gr3 = x.createLinearGradient(0, 380, 0, H);
    gr3.addColorStop(0, '#0E1B27'); gr3.addColorStop(0.5, '#0A141F'); gr3.addColorStop(1, '#050A11');
    x.fillStyle = gr3; x.fill();

    /* 岩层纹理（横向色带） */
    x.save(); x.clip();
    for (j = 0; j < 26; j++) {
      var yy = 420 + j * 13;
      x.globalAlpha = 0.10 + (j % 3 === 0 ? 0.10 : 0);
      x.fillStyle = j % 2 ? '#16293A' : '#060C14';
      for (var xx2 = 0; xx2 <= W; xx2 += 3) {
        var wob = Math.sin(xx2 * 0.021 + j * 1.7) * 4 + Math.sin(xx2 * 0.007 + j) * 7;
        x.fillRect(xx2, q(yy + wob), 3, 5);
      }
    }
    x.globalAlpha = 1;
    /*  dithering 噪点 */
    for (i = 0; i < 1500; i++) {
      var nx = q(rnd() * W), ny = q(400 + rnd() * (H - 400));
      x.globalAlpha = 0.05 + rnd() * 0.07;
      x.fillStyle = rnd() > 0.45 ? '#1B3346' : '#03070C';
      x.fillRect(nx, ny, 3, 3);
    }
    x.globalAlpha = 1;
    x.restore();

    /* 壁沿高光 */
    x.beginPath();
    for (var xx3 = 0; xx3 <= W; xx3 += 3) { if (xx3 === 0) x.moveTo(0, q(wallY(0))); else x.lineTo(xx3, q(wallY(xx3))); }
    x.strokeStyle = 'rgba(90,150,165,0.34)'; x.lineWidth = 2; x.stroke();

    /* 卤水池 */
    var wy = G.BRINE_Y;
    x.fillStyle = '#0A2430'; x.fillRect(0, wy, W, H - wy);
    var gr4 = x.createLinearGradient(0, wy, 0, H);
    gr4.addColorStop(0, 'rgba(23,92,104,0.55)'); gr4.addColorStop(1, 'rgba(6,18,26,0.9)');
    x.fillStyle = gr4; x.fillRect(0, wy, W, H - wy);
    x.strokeStyle = 'rgba(120,200,205,0.30)'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(0, wy + 1); x.lineTo(W, wy + 1); x.stroke();

    /* 暗角 */
    var gr5 = x.createRadialGradient(PX, 340, 120, PX, 380, 520);
    gr5.addColorStop(0, 'rgba(0,0,0,0)'); gr5.addColorStop(1, 'rgba(0,0,0,0.55)');
    x.fillStyle = gr5; x.fillRect(0, 0, W, H);

    this.bg = c;
    this.past = mkCanvas(W, H);
    this.pastG = this.past.getContext('2d');
  };

  /* ---------------- 事件 → 粒子 ---------------- */
  Render.prototype.feed = function (st) {
    var evs = st.events, i, e;
    for (i = 0; i < evs.length; i++) {
      e = evs[i];
      if (e.t === 'land') {
        this.burst(e.x, e.y, 8, G.STAR_COL[e.m - 1], 62);
      } else if (e.t === 'miss') {
        this.burst(e.x, G.BRINE_Y, 10, '#4E9AA6', 44);
      } else if (e.t === 'lit') {
        this.burst(e.x, e.y, 22, '#FFD98A', 120);
        this.txt(e.x, e.y - 22, '亮', '#FFD98A', 17);
        this.flash = Math.max(this.flash, 0.42);
      } else if (e.t === 'unload') {
        this.burst(e.x, e.y, 10, '#8FA6B0', 70);
        this.txt(e.x, e.y - 14, '卸', '#9FB6BF', 13);
      } else if (e.t === 'drop') {
        this.burst(e.x, e.y, 5, G.STAR_COL[e.m - 1], 50);
      } else if (e.t === 'tip') {
        this.shake = 1; this.flash = Math.max(this.flash, 0.22);
        this.txt(PX, PY - 58, '倾覆', '#C4553B', 19);
      }
    }
    evs.length = 0;
  };

  Render.prototype.burst = function (x, y, n, col, sp) {
    if (this.parts.length > 260) return;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 6.2832, v = sp * (0.35 + Math.random() * 0.85);
      this.parts.push({
        x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 22,
        life: 0.55 + Math.random() * 0.6, max: 1.15, r: 1.6 + Math.random() * 2.4, col: col
      });
    }
  };
  Render.prototype.txt = function (x, y, s, col, size) {
    if (this.texts.length > 14) this.texts.shift();
    this.texts.push({ x: x, y: y, s: s, col: col, size: size || 14, life: 1.1 });
  };
  Render.prototype.step = function (dt) {
    var i, p;
    for (i = this.parts.length - 1; i >= 0; i--) {
      p = this.parts[i]; p.life -= dt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 168 * dt; p.vx *= 0.985;
    }
    for (i = this.texts.length - 1; i >= 0; i--) {
      this.texts[i].life -= dt; this.texts[i].y -= 26 * dt;
      if (this.texts[i].life <= 0) this.texts.splice(i, 1);
    }
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 2.6);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.2);
    this.t += dt;
  };

  /* ---------------- 主绘制 ---------------- */
  Render.prototype.draw = function (st, dt) {
    var ctx = this.ctx, eff = this.eff, i;
    this.step(dt || 0);
    ctx.setTransform(eff, 0, 0, eff, 0, 0);
    var sh = this.shake, ox = 0, oy = 0;
    if (sh > 0) { ox = (Math.random() * 2 - 1) * 7 * sh; oy = (Math.random() * 2 - 1) * 7 * sh; }
    ctx.translate(ox, oy);

    if (this.bg) ctx.drawImage(this.bg, 0, 0, W, H);
    else { ctx.fillStyle = '#04080F'; ctx.fillRect(0, 0, W, H); }

    /* 水面微光 */
    var wy = G.BRINE_Y;
    ctx.save();
    ctx.globalAlpha = 0.5;
    for (i = 0; i < 3; i++) {
      var yy = wy + 10 + i * 26, ph = this.t * (0.7 + i * 0.3) + i;
      ctx.strokeStyle = 'rgba(127,227,212,' + (0.09 - i * 0.02) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (var xx = 0; xx <= W; xx += 12) ctx.lineTo(xx, yy + Math.sin(xx * 0.03 + ph) * 2.2);
      ctx.stroke();
    }
    ctx.restore();

    /* 落口虚线 */
    ctx.save();
    ctx.setLineDash([3, 9]); ctx.strokeStyle = 'rgba(127,227,212,0.13)'; ctx.lineWidth = 1;
    for (i = 0; i < st.slots.length; i++) {
      ctx.beginPath(); ctx.moveTo(q(st.slots[i]) + 0.5, 6); ctx.lineTo(q(st.slots[i]) + 0.5, 250); ctx.stroke();
    }
    ctx.restore();

    /* 下一颗预览 */
    if (st.spawned < st.L.quota && st.phase === 'play') {
      var q0 = st.queue[st.spawned];
      if (q0) {
        var pu = 0.55 + 0.45 * Math.sin(this.t * 5);
        ctx.globalAlpha = 0.35 + 0.4 * pu;
        ctx.drawImage(this.spStar[q0.m], q0.x - 26, 4 - 26, 52, 52);
        ctx.globalAlpha = 1;
        ctx.fillStyle = G.STAR_COL[q0.m - 1];
        ctx.font = '11px ui-monospace,monospace'; ctx.textAlign = 'center';
        ctx.fillText(q0.m, q0.x, 40);
      }
    }

    this.drawBeam(st, ctx);
    this.drawCrystals(st, ctx);
    this.drawMeter(st, ctx);
    this.drawRig(st, ctx);
    this.drawStars(st, ctx);
    this.drawParts(ctx);

    if (this.flash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,217,138,' + (this.flash * 0.20) + ')';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.setTransform(eff, 0, 0, eff, 0, 0);
  };

  /* 光柱 + 壁面光斑 */
  Render.prototype.drawBeam = function (st, ctx) {
    var th = st.th;
    var dx = Math.sin(th), dy = Math.cos(th);
    /* 求与谷壁交点 */
    var t = 0, hx = PX, hy = PY, hit = false;
    for (t = 12; t < 760; t += 8) {
      var tx = PX + dx * t, ty = PY + dy * t;
      if (tx < 4 || tx > W - 4) { hx = tx; hy = ty; hit = true; break; }
      if (ty >= G.BRINE_Y) { hx = tx; hy = G.BRINE_Y - 2; hit = true; break; }
      if (ty >= wallY(tx)) { hx = tx; hy = ty; hit = true; break; }
      hx = tx; hy = ty;
    }
    var len = Math.sqrt((hx - PX) * (hx - PX) + (hy - PY) * (hy - PY));
    var mass = G.massOf(st.loads);
    var wide = 0.062 + Math.min(0.034, mass * 0.004);
    var inten = 0.34 + Math.min(0.30, mass * 0.035);
    if (st.recover > 0) inten *= 0.35;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(PX, PY); ctx.rotate(th);
    var gr = ctx.createLinearGradient(0, 0, 0, len);
    gr.addColorStop(0, 'rgba(150,240,228,' + (inten * 1.15) + ')');
    gr.addColorStop(0.45, 'rgba(90,200,196,' + (inten * 0.55) + ')');
    gr.addColorStop(1, 'rgba(40,120,140,0)');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-Math.tan(wide) * len * 1.0, len);
    ctx.quadraticCurveTo(0, len + 26, Math.tan(wide) * len * 1.0, len);
    ctx.closePath(); ctx.fill();
    /* 亮核 */
    ctx.strokeStyle = 'rgba(210,255,248,' + (0.30 + inten * 0.5) + ')';
    ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, len * 0.92); ctx.stroke();
    ctx.restore();

    /* 壁面光斑 */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var sr = 30 + Math.min(22, mass * 2.6);
    ctx.globalAlpha = 0.55 + 0.25 * Math.sin(this.t * 3);
    ctx.drawImage(this.spBeam, hx - sr, hy - sr, sr * 2, sr * 2);
    ctx.restore();
    ctx.globalAlpha = 1;
  };

  /* 晶簇 */
  Render.prototype.drawCrystals = function (st, ctx) {
    /* 找出最近未点亮的作为「目标」 */
    var tg = -1, bd = 1e9;
    for (var i = 0; i < st.cr.length; i++) {
      if (st.cr[i].lit) continue;
      var d = Math.abs(st.th - st.cr[i].phi);
      if (d < bd) { bd = d; tg = i; }
    }
    /* 先画底色光环（目标） */
    for (i = 0; i < st.cr.length; i++) {
      var c = st.cr[i];
      if (c.lit || i === tg) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        var rh = 24 + 3 * Math.sin(this.t * 2 + i);
        ctx.globalAlpha = c.lit ? 0.55 : 0.22;
        ctx.drawImage(this.spTeal, c.x - rh, c.y - rh, rh * 2, rh * 2);
        ctx.restore(); ctx.globalAlpha = 1;
      }
    }
    for (i = 0; i < st.cr.length; i++) {
      var c = st.cr[i], k;
      var base = c.lit ? 1 : c.ch;
      var isTg = (i === tg);
      ctx.save();
      ctx.translate(c.x, c.y);
      for (k = 0; k < c.cnt; k++) {
        var ang = -Math.PI / 2 + (k - (c.cnt - 1) / 2) * 0.42 + Math.sin(c.sp[k]) * 0.12;
        var h = c.sz * (0.62 + ((k * 7 + i * 3) % 5) * 0.12);
        var wdt = h * 0.30;
        ctx.beginPath();
        ctx.moveTo(-wdt, 2);
        ctx.lineTo(-wdt * 0.35, -h * 0.72);
        ctx.lineTo(0, -h);
        ctx.lineTo(wdt * 0.4, -h * 0.70);
        ctx.lineTo(wdt, 2);
        ctx.closePath();
        if (c.lit) {
          ctx.fillStyle = 'rgba(255,217,138,' + (0.62 + 0.30 * Math.sin(this.t * 3 + i)) + ')';
        } else if (base > 0.02) {
          ctx.fillStyle = 'rgba(127,227,212,' + (0.32 + 0.55 * base) + ')';
        } else if (isTg) {
          ctx.fillStyle = 'rgba(120,165,180,0.62)';
        } else {
          ctx.fillStyle = 'rgba(70,100,118,0.55)';
        }
        ctx.fill();
        ctx.strokeStyle = c.lit ? 'rgba(255,240,205,0.88)' : (isTg ? 'rgba(160,200,205,0.55)' : 'rgba(110,150,160,0.32)');
        ctx.lineWidth = isTg ? 1.4 : 1; ctx.stroke();
      }
      ctx.restore();

      if (c.ch > 0.02 && !c.lit) {
        /* 充能环 */
        ctx.beginPath();
        ctx.arc(c.x, c.y - 6, 16, -Math.PI / 2, -Math.PI / 2 + 6.2832 * c.ch);
        ctx.strokeStyle = 'rgba(127,227,212,0.92)'; ctx.lineWidth = 2.4; ctx.stroke();
      }
      if (c.lit) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        var r2 = 28 + 4 * Math.sin(this.t * 2 + i);
        ctx.globalAlpha = 0.6;
        ctx.drawImage(this.spWarm, c.x - r2, c.y - r2, r2 * 2, r2 * 2);
        ctx.restore(); ctx.globalAlpha = 1;
      } else if (isTg) {
        /* 目标脉冲环 */
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        var rt = 1 + 0.18 * Math.sin(this.t * 3.2);
        ctx.globalAlpha = 0.25 + 0.18 * (0.5 + 0.5 * Math.sin(this.t * 2.6));
        ctx.drawImage(this.spTeal, c.x - 30 * rt, c.y - 30 * rt, 60 * rt, 60 * rt);
        ctx.restore(); ctx.globalAlpha = 1;
      }
    }
  };

  /* 力矩尺（底部气泡水平仪） */
  Render.prototype.drawMeter = function (st, ctx) {
    var n = G.net(st), fr = clamp(n.S / (G.MW * G.HL), -1, 1);
    var x0 = 150, x1 = 330, y = 706, cx = (x0 + x1) / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(4,10,16,0.72)';
    ctx.fillRect(x0 - 8, y - 9, (x1 - x0) + 16, 18);
    ctx.strokeStyle = 'rgba(127,227,212,0.22)'; ctx.lineWidth = 1;
    ctx.strokeRect(x0 - 8, y - 9, (x1 - x0) + 16, 18);
    ctx.strokeStyle = 'rgba(127,227,212,0.30)';
    ctx.beginPath(); ctx.moveTo(cx, y - 5); ctx.lineTo(cx, y + 5); ctx.stroke();
    var bx = cx + fr * (x1 - x0) / 2;
    var hot = Math.abs(fr) > 0.82;
    ctx.fillStyle = hot ? '#C4553B' : (Math.abs(fr) < 0.09 ? '#7FE3D4' : '#C89A4B');
    ctx.beginPath(); ctx.arc(bx, y, 5.2, 0, 6.2832); ctx.fill();
    ctx.fillStyle = 'rgba(150,190,195,0.55)';
    ctx.font = '9px ui-monospace,monospace'; ctx.textAlign = 'right';
    ctx.fillText('力矩', x0 - 12, y + 3.5);
    ctx.restore();
  };

  /* 秤架：支点 / 秤杆 / 载荷 / 秤锤 */
  Render.prototype.drawRig = function (st, ctx) {
    var i, th = st.th, cs = Math.cos(th), sn = Math.sin(th);

    /* 悬索与支点 */
    ctx.save();
    ctx.strokeStyle = 'rgba(140,175,185,0.30)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(PX, 0); ctx.lineTo(PX, PY - 26); ctx.stroke();
    ctx.fillStyle = '#1B2A36';
    ctx.beginPath();
    ctx.moveTo(PX - 22, PY + 16); ctx.lineTo(PX + 22, PY + 16); ctx.lineTo(PX, PY - 12); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#2E4553';
    ctx.beginPath();
    ctx.moveTo(PX - 22, PY + 16); ctx.lineTo(PX, PY - 12); ctx.lineTo(PX, PY + 16); ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(PX, PY); ctx.rotate(th);

    /* 秤杆 */
    var hw = 7;
    ctx.fillStyle = '#141E27'; ctx.fillRect(-HL, -hw, HL * 2, hw * 2);
    ctx.fillStyle = '#2B3B49'; ctx.fillRect(-HL, -hw, HL * 2, hw * 0.9);
    ctx.fillStyle = '#43606F'; ctx.fillRect(-HL, -hw, HL * 2, 2);
    /* 刻度 + 铆钉 */
    ctx.fillStyle = 'rgba(127,227,212,0.42)';
    for (i = -HL + 14; i <= HL - 14; i += 21) ctx.fillRect(q(i), -hw, 2, hw * 2);
    /* 端帽 */
    ctx.fillStyle = '#43606F';
    ctx.fillRect(-HL - 4, -hw - 3, 6, (hw + 3) * 2);
    ctx.fillRect(HL - 2, -hw - 3, 6, (hw + 3) * 2);

    /* 载荷（星屑） */
    for (i = 0; i < st.loads.length; i++) {
      var l = st.loads[i];
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      var rr = l.r * 2.7;
      ctx.globalAlpha = 0.5;
      ctx.drawImage(this.spStar[l.m], l.s - rr, -l.r - rr + 3, rr * 2, rr * 2);
      ctx.restore();
      ctx.globalAlpha = 1;
      ctx.fillStyle = G.STAR_COL[l.m - 1];
      ctx.beginPath(); ctx.arc(l.s, -l.r - 3, l.r, 0, 6.2832); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.arc(l.s - l.r * 0.3, -l.r - 3 - l.r * 0.3, l.r * 0.32, 0, 6.2832); ctx.fill();
    }

    /* 秤锤 */
    var bx = st.wp, bw = 15, bh = 21;
    ctx.fillStyle = '#6E4E1C';
    ctx.fillRect(bx - bw / 2, -bh - 4, bw, bh);
    ctx.fillStyle = '#C89A4B';
    ctx.fillRect(bx - bw / 2 + 2, -bh - 2, bw - 4, bh - 5);
    ctx.fillStyle = '#F2D791';
    ctx.fillRect(bx - bw / 2 + 2, -bh - 2, bw - 4, 3);
    ctx.fillStyle = 'rgba(20,14,4,0.6)';
    ctx.fillRect(bx - bw / 2 + 3, -9, bw - 6, 3);
    ctx.restore();

    /* 秤锤指示（杆外轨道） */
    ctx.save();
    ctx.strokeStyle = 'rgba(200,154,75,0.30)'; ctx.lineWidth = 1;
    ctx.setLineDash([2, 5]);
    var ty = PY + 52;
    ctx.beginPath(); ctx.moveTo(PX - HL, ty); ctx.lineTo(PX + HL, ty); ctx.stroke();
    ctx.restore();
    ctx.save();
    var wx = PX + st.wp * cs, wy2 = PY + st.wp * sn;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.55;
    ctx.drawImage(this.spWarm, wx - 15, wy2 - 15, 30, 30);
    ctx.restore(); ctx.globalAlpha = 1;

    /* 棱镜（支点上的光源） */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var pr = 15 + Math.min(12, G.massOf(st.loads) * 1.4);
    ctx.globalAlpha = 0.85;
    ctx.drawImage(this.spBeam, PX - pr, PY - pr, pr * 2, pr * 2);
    ctx.restore(); ctx.globalAlpha = 1;
    ctx.fillStyle = '#EAF6F4';
    ctx.beginPath();
    ctx.moveTo(PX, PY - 7); ctx.lineTo(PX + 5, PY); ctx.lineTo(PX, PY + 7); ctx.lineTo(PX - 5, PY);
    ctx.closePath(); ctx.fill();
  };

  Render.prototype.drawStars = function (st, ctx) {
    for (var i = 0; i < st.stars.length; i++) {
      var s = st.stars[i];
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      var rr = s.r * 3.0;
      ctx.globalAlpha = 0.45;
      ctx.drawImage(this.spStar[s.m], s.x - rr, s.y - rr, rr * 2, rr * 2);
      ctx.restore(); ctx.globalAlpha = 1;
      ctx.fillStyle = G.STAR_COL[s.m - 1];
      ctx.beginPath(); ctx.arc(q(s.x), s.y, s.r, 0, 6.2832); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath(); ctx.arc(q(s.x) - s.r * 0.3, s.y - s.r * 0.3, s.r * 0.34, 0, 6.2832); ctx.fill();
      /* 尾迹 */
      ctx.strokeStyle = 'rgba(200,235,235,0.16)'; ctx.lineWidth = s.r * 0.9;
      ctx.beginPath(); ctx.moveTo(q(s.x), s.y - s.r); ctx.lineTo(q(s.x), s.y - s.r - 22); ctx.stroke();
    }
  };

  Render.prototype.drawParts = function (ctx) {
    var i, p;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < this.parts.length; i++) {
      p = this.parts[i];
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1) * 0.9;
      ctx.fillStyle = p.col;
      ctx.fillRect(q(p.x, 2), q(p.y, 2), p.r, p.r);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    for (i = 0; i < this.texts.length; i++) {
      var t = this.texts[i];
      ctx.globalAlpha = clamp(t.life / 1.1, 0, 1);
      ctx.fillStyle = t.col;
      ctx.font = '600 ' + t.size + 'px "Songti SC","SimSun",serif';
      ctx.fillText(t.s, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  };

  g.SB = { Render: Render, C: C };
})(typeof window !== 'undefined' ? window : this);
