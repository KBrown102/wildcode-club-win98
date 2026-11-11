/* 298-bubbledive《气泡 · 深潜》— Canvas 2D 渲染层
   风格：深海霜紫 × 新拟态黏土岩壁 × 玻璃拟态气泡 × 果冻弹性 × marine snow 颗粒
   性能纪律：背景（渐变+岩壁）一次烘焙进离屏；光晕用预渲染 sprite 缩放；dpr 上限 2.1 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BUBBLEDIVE_RENDER = factory();
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  var C = {
    sky: ['#9FB3CE', '#7E8CAE', '#5F6188', '#484A6C', '#383A56', '#2C2C46', '#221F38', '#181428'],
    wallB: '#221C33', wallEdge: '#6B5F92', wallLip: '#8A7CB4',
    bubIn: 'rgba(232,248,255,0.62)', bubMid: 'rgba(163,209,232,0.30)', bubOut: 'rgba(122,176,212,0.13)',
    rim: 'rgba(214,242,255,0.80)', hi: 'rgba(255,255,255,0.92)',
    cre: '#E8B04B', creGot: 'rgba(150,214,206,0.42)', creWarm: '#F5C96B',
    vent: '#6FD8D0', ventDim: 'rgba(90,140,150,0.35)',
    snow: 'rgba(226,238,250,0.5)'
  };

  /* ---------- 世界烘焙：竖向分层渐变 + 新拟态黏土岩壁 ---------- */
  function bakeWorld(B, L) {
    var cv = document.createElement('canvas');
    cv.width = B.VW; cv.height = L.WH;
    var g = cv.getContext('2d');

    var grad = g.createLinearGradient(0, 0, 0, L.WH);
    C.sky.forEach(function (c, i) { grad.addColorStop(i / (C.sky.length - 1), c); });
    g.fillStyle = grad; g.fillRect(0, 0, B.VW, L.WH);

    var sg = g.createLinearGradient(0, 0, 0, B.SURFACE_Y + 70);
    sg.addColorStop(0, 'rgba(206,226,246,0.55)');
    sg.addColorStop(1, 'rgba(206,226,246,0)');
    g.fillStyle = sg; g.fillRect(0, 0, B.VW, B.SURFACE_Y + 70);

    function wallPath(side) {
      var p = new Path2D(), n = L.wy.length, i;
      if (side < 0) {
        p.moveTo(0, 0);
        for (i = 0; i < n; i++) p.lineTo(L.wl[i], L.wy[i]);
        p.lineTo(0, L.WH);
      } else {
        p.moveTo(B.VW, 0);
        for (i = 0; i < n; i++) p.lineTo(L.wr[i], L.wy[i]);
        p.lineTo(B.VW, L.WH);
      }
      p.closePath();
      return p;
    }
    var pl = wallPath(-1), pr = wallPath(1);

    g.fillStyle = C.wallB; g.fill(pl); g.fill(pr);

    /* ★ 水光打在岩壁上：沿水边一圈亮带（clip 在岩壁内侧）—— 让「水」成为画面里发光的那一方 */
    function edgeLight(path) {
      g.save(); g.clip(path);
      g.strokeStyle = 'rgba(126,166,214,0.16)'; g.lineWidth = 46; g.stroke(path);
      g.strokeStyle = 'rgba(150,190,232,0.17)'; g.lineWidth = 22; g.stroke(path);
      g.strokeStyle = 'rgba(186,218,246,0.22)'; g.lineWidth = 9; g.stroke(path);
      g.restore();
    }
    g.lineJoin = 'round'; g.lineCap = 'round';
    edgeLight(pl); edgeLight(pr);

    /* 岩壁暗部（远离水面的一侧压深） */
    var wg = g.createLinearGradient(0, 0, B.VW, 0);
    wg.addColorStop(0, 'rgba(0,0,0,0.42)'); wg.addColorStop(0.28, 'rgba(0,0,0,0)');
    wg.addColorStop(0.72, 'rgba(0,0,0,0)'); wg.addColorStop(1, 'rgba(0,0,0,0.42)');
    g.save(); g.clip(pl); g.fillStyle = wg; g.fillRect(0, 0, B.VW, L.WH); g.restore();
    g.save(); g.clip(pr); g.fillStyle = wg; g.fillRect(0, 0, B.VW, L.WH); g.restore();

    /* 边缘定义线 */
    g.strokeStyle = C.wallEdge; g.lineWidth = 3.0;
    g.stroke(pl); g.stroke(pr);
    g.save(); g.clip(pl); g.strokeStyle = C.wallLip; g.lineWidth = 6; g.stroke(pl); g.restore();
    g.save(); g.clip(pr); g.strokeStyle = C.wallLip; g.lineWidth = 6; g.stroke(pr); g.restore();

    var rs = 20260911;
    function rnd() { rs = (rs * 1664525 + 1013904223) >>> 0; return rs / 4294967296; }
    g.save(); g.clip(pl);
    for (var k = 0; k < 900; k++) {
      g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.10)';
      g.fillRect(rnd() * B.VW * 0.55, rnd() * L.WH, 2 + rnd() * 3, 1.5 + rnd() * 2);
    }
    g.restore();
    g.save(); g.clip(pr);
    for (var k2 = 0; k2 < 900; k2++) {
      g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.10)';
      g.fillRect(B.VW * 0.45 + rnd() * B.VW * 0.55, rnd() * L.WH, 2 + rnd() * 3, 1.5 + rnd() * 2);
    }
    g.restore();

    /* 沉船基地（起点标记）：侧倾的船体剪影 + 断桅，压在起点下方的岩架上 */
    var ys = L.yStart, w0 = B.wallAt(L, ys), cx0 = (w0[0] + w0[1]) / 2;
    g.save();
    g.translate(cx0, ys + 34);
    g.rotate(-0.20);
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = 'rgba(158,184,214,0.36)'; g.lineWidth = 2.3;
    g.beginPath();
    g.moveTo(-56, -7); g.lineTo(52, -7);
    g.quadraticCurveTo(44, 20, -2, 23);
    g.quadraticCurveTo(-48, 20, -56, -7);
    g.closePath(); g.stroke();
    /* 断桅 + 横桁 */
    g.beginPath(); g.moveTo(-6, -7); g.lineTo(-15, -46); g.stroke();
    g.beginPath(); g.moveTo(-34, -30); g.lineTo(10, -35); g.stroke();
    /* 舱口 */
    g.strokeStyle = 'rgba(158,184,214,0.24)'; g.lineWidth = 1.5;
    for (var m = 0; m < 3; m++) {
      g.beginPath(); g.arc(14 + m * 13, 2, 3.4, 0, 6.283); g.stroke();
    }
    g.restore();

    return cv;
  }

  function makeGlow() {
    var R = 128, cv = document.createElement('canvas');
    cv.width = cv.height = R * 2;
    var g = cv.getContext('2d');
    var rg = g.createRadialGradient(R, R, 0, R, R, R);
    rg.addColorStop(0, 'rgba(206,236,250,0.85)');
    rg.addColorStop(0.22, 'rgba(178,216,240,0.42)');
    rg.addColorStop(0.55, 'rgba(140,186,222,0.16)');
    rg.addColorStop(1, 'rgba(120,170,210,0)');
    g.fillStyle = rg; g.fillRect(0, 0, R * 2, R * 2);
    return cv;
  }

  function create(B) {
    var api = { bg: null, glow: null, snow: [], parts: [], W: 0, H: 0, dpr: 1 };

    api.resize = function (canvas, cssW, cssH) {
      var dpr = Math.min(window.devicePixelRatio || 1, 2.1);
      api.dpr = dpr;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      canvas.style.width = cssW + 'px';
      canvas.style.height = cssH + 'px';
      api.W = cssW; api.H = cssH;
    };

    api.attach = function (L) {
      api.bg = bakeWorld(B, L);
      api.glow = api.glow || makeGlow();
      api.parts.length = 0;
      api.snow.length = 0;
      var rs = 77771;
      function rnd() { rs = (rs * 1664525 + 1013904223) >>> 0; return rs / 4294967296; }
      for (var i = 0; i < 150; i++) {
        api.snow.push({
          x: rnd() * B.VW, y: rnd() * L.WH,
          s: 0.8 + rnd() * 2.0, a: 0.18 + rnd() * 0.42, ph: rnd() * 6.28, sp: 3 + rnd() * 9
        });
      }
    };

    api.spawn = function (ev) {
      var i, a, v;
      if (ev.t === 'pick') {
        for (i = 0; i < 16; i++) {
          a = (i / 16) * 6.283; v = 40 + Math.random() * 90;
          api.parts.push({ x: ev.x, y: ev.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.9, max: 0.9, c: C.creWarm, r: 1.6 + Math.random() * 2.2 });
        }
      } else if (ev.t === 'deflate') {
        for (i = 0; i < 3; i++) {
          api.parts.push({
            x: ev.x + (Math.random() * 2 - 1) * 8, y: ev.y + 6,
            vx: (ev.dir || 0) * -30 + (Math.random() * 2 - 1) * 16, vy: 30 + Math.random() * 40,
            life: 1.1, max: 1.1, c: 'rgba(200,232,248,0.7)', r: 1.2 + Math.random() * 2.4
          });
        }
      } else if (ev.t === 'bump') {
        for (i = 0; i < 10; i++) {
          a = Math.random() * 6.283; v = 30 + Math.random() * 70;
          api.parts.push({ x: ev.x, y: ev.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.55, max: 0.55, c: 'rgba(255,190,150,0.7)', r: 1.3 + Math.random() * 1.6 });
        }
      } else if (ev.t === 'vent') {
        for (i = 0; i < 18; i++) {
          api.parts.push({
            x: ev.x + (Math.random() * 2 - 1) * 16, y: ev.y,
            vx: (Math.random() * 2 - 1) * 22, vy: -50 - Math.random() * 70,
            life: 1.2, max: 1.2, c: 'rgba(120,222,214,0.8)', r: 1.4 + Math.random() * 2.2
          });
        }
      } else if (ev.t === 'rescue' || ev.t === 'scare') {
        for (i = 0; i < 8; i++) {
          api.parts.push({
            x: ev.x, y: ev.y, vx: (Math.random() * 2 - 1) * 34, vy: (Math.random() * 2 - 1) * 34,
            life: 0.7, max: 0.7, c: ev.t === 'scare' ? 'rgba(232,176,75,0.6)' : 'rgba(150,200,220,0.6)', r: 1.2 + Math.random() * 1.6
          });
        }
      }
    };

    api.update = function (dt) {
      for (var i = api.parts.length - 1; i >= 0; i--) {
        var p = api.parts[i];
        p.life -= dt;
        if (p.life <= 0) { api.parts.splice(i, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= 0.94; p.vy = p.vy * 0.94 - 24 * dt;
      }
      if (api.parts.length > 420) api.parts.splice(0, api.parts.length - 420);
    };

    api.draw = function (ctx, st, tNow) {
      var W = api.W, H = api.H, i;
      var camY = Math.max(0, Math.min(st.WH - H, st.by - H * 0.45));
      ctx.clearRect(0, 0, W, H);
      if (api.bg) ctx.drawImage(api.bg, 0, -camY, B.VW, st.WH);

      /* marine snow（视差 0.78） */
      ctx.fillStyle = C.snow;
      for (i = 0; i < api.snow.length; i++) {
        var s = api.snow[i];
        var sy = ((s.y - camY * 0.78) % H + H) % H;
        s.y += s.sp * 0.016;
        if (s.y > st.WH) s.y -= st.WH;
        ctx.globalAlpha = s.a * (0.6 + 0.4 * Math.sin(tNow * 1.3 + s.ph));
        ctx.fillRect(s.x + Math.sin(tNow * 0.6 + s.ph) * 5, sy, s.s, s.s);
      }
      ctx.globalAlpha = 1;

      var L = st.L, GR = B.glowR(st), glowLit = [];

      /* 气穴 */
      for (i = 0; i < L.vents.length; i++) {
        var vt = L.vents[i], vy = vt.y - camY;
        if (vy < -60 || vy > H + 60) continue;
        var ready = vt.cd <= 0;
        var pr = 1 + 0.12 * Math.sin(tNow * 2.4 + i);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = ready ? 0.55 : 0.14;
        if (api.glow) ctx.drawImage(api.glow, vt.x - 46 * pr, vy - 46 * pr, 92 * pr, 92 * pr);
        ctx.restore();
        ctx.strokeStyle = ready ? C.vent : C.ventDim;
        ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.arc(vt.x, vy, B.VENT_R * 0.62 * pr, 0, 6.283); ctx.stroke();
        ctx.beginPath(); ctx.arc(vt.x, vy, B.VENT_R * 0.34, 0, 6.283); ctx.stroke();
        if (ready) {
          ctx.globalAlpha = 0.7; ctx.fillStyle = C.vent;
          ctx.beginPath(); ctx.arc(vt.x, vy, 4.5, 0, 6.283); ctx.fill();
          ctx.globalAlpha = 1;
        }
      }

      /* 生物（唯一暖点） */
      for (i = 0; i < L.cre.length; i++) {
        var cr = L.cre[i], cy = cr.y - camY;
        if (cy < -40 || cy > H + 40) continue;
        var lit = Math.hypot(cr.x - st.bx, cr.y - st.by) < GR;
        var alpha = cr.got ? 0.26 : (lit ? 1 : 0.20);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(cr.x, cy);
        if (cr.scared > 0) { ctx.scale(0.7, 0.7); ctx.globalAlpha = alpha * 0.45; }
        var pulse = 1.35 * (1 + 0.10 * Math.sin(tNow * 2.6 + i * 1.1));
        ctx.scale(pulse, pulse);
        ctx.fillStyle = cr.got ? C.creGot : C.cre;
        ctx.strokeStyle = cr.got ? C.creGot : C.creWarm;
        ctx.lineWidth = 1.5;
        drawCreature(ctx, cr.kind, cr.shy);
        ctx.restore();
        if (cr.shy && !cr.got) {
          ctx.save(); ctx.globalAlpha = 0.45; ctx.strokeStyle = C.creWarm;
          ctx.setLineDash([3, 4]); ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(cr.x, cy, B.RSHY + 2, 0, 6.283); ctx.stroke();
          ctx.restore();
        }
      }

      /* 粒子 */
      for (i = 0; i < api.parts.length; i++) {
        var pt = api.parts[i];
        ctx.globalAlpha = Math.max(0, pt.life / pt.max) * 0.9;
        ctx.fillStyle = pt.c;
        ctx.beginPath(); ctx.arc(pt.x, pt.y - camY, pt.r, 0, 6.283); ctx.fill();
      }
      ctx.globalAlpha = 1;

      /* 气泡光晕（视野 = 3.2r） */
      var by = st.by - camY, r = st.r;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.88;
      if (api.glow) ctx.drawImage(api.glow, st.bx - GR, by - GR, GR * 2, GR * 2);
      ctx.restore();

      /* 气泡本体：玻璃拟态 + 果冻挤压 */
      var sq = st.squeeze;
      ctx.save();
      ctx.translate(st.bx, by);
      ctx.scale(1 - sq * 0.52, 1 + sq * 0.34);
      var gg = ctx.createRadialGradient(-r * 0.30, -r * 0.34, r * 0.08, 0, 0, r);
      gg.addColorStop(0, C.bubIn); gg.addColorStop(0.52, C.bubMid); gg.addColorStop(1, C.bubOut);
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.fill();
      ctx.strokeStyle = C.rim; ctx.lineWidth = 1.7;
      ctx.beginPath(); ctx.arc(0, 0, r - 0.8, 0, 6.283); ctx.stroke();
      ctx.strokeStyle = C.hi; ctx.lineWidth = Math.max(1.4, r * 0.14); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, 0, r * 0.70, Math.PI * 1.06, Math.PI * 1.56); ctx.stroke();
      ctx.strokeStyle = 'rgba(120,170,205,0.35)'; ctx.lineWidth = Math.max(1, r * 0.10);
      ctx.beginPath(); ctx.arc(0, 0, r * 0.80, Math.PI * 0.22, Math.PI * 0.78); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath(); ctx.arc(-r * 0.34, -r * 0.40, Math.max(1.2, r * 0.09), 0, 6.283); ctx.fill();
      ctx.restore();

      /* 挤压提示 */
      if (sq > 0.02) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, 0.35 + sq);
        ctx.strokeStyle = sq >= 0.999 ? '#E8774B' : '#E8B04B';
        ctx.lineWidth = 2.4; ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.arc(st.bx, by, r + 7, 0, 6.283); ctx.stroke();
        ctx.restore();
      }

      /* 深度标尺 + 海面 */
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = 'rgba(220,235,250,0.35)'; ctx.lineWidth = 1;
      var rx = W - 16;
      ctx.beginPath(); ctx.moveTo(rx, 12); ctx.lineTo(rx, H - 12); ctx.stroke();
      for (var d = 0; d <= 5; d++) {
        var yy = 12 + (H - 24) * d / 5;
        ctx.beginPath(); ctx.moveTo(rx - 5, yy); ctx.lineTo(rx, yy); ctx.stroke();
      }
      var py = 12 + (H - 24) * Math.max(0, Math.min(1, st.by / st.WH));
      ctx.fillStyle = '#CFE8F2';
      ctx.beginPath(); ctx.arc(rx, py, 4, 0, 6.283); ctx.fill();
      var sySurf = B.SURFACE_Y - camY;
      if (sySurf > -20 && sySurf < H + 20) {
        ctx.strokeStyle = 'rgba(206,226,246,0.55)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, sySurf); ctx.lineTo(W - 26, sySurf); ctx.stroke();
      }
      ctx.restore();
    };

    function drawCreature(ctx, kind, shy) {
      ctx.beginPath();
      if (kind === 0) {
        ctx.arc(0, -3, 6.5, Math.PI, 0); ctx.lineTo(5.5, 1); ctx.lineTo(-5.5, 1); ctx.closePath(); ctx.fill();
        ctx.beginPath();
        for (var i = -2; i <= 2; i++) { ctx.moveTo(i * 2.6, 1); ctx.quadraticCurveTo(i * 2.6 + 2, 6, i * 2.6, 9); }
        ctx.stroke();
      } else if (kind === 1) {
        ctx.ellipse(0, 0, 8, 4.4, 0, 0, 6.283); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(-12, -4); ctx.lineTo(-12, 4); ctx.closePath(); ctx.fill();
      } else if (kind === 2) {
        for (var a = 0; a < 5; a++) {
          var an = -1.5708 + a * 1.2566;
          ctx.lineTo(Math.cos(an) * 8, Math.sin(an) * 8);
          var an2 = an + 0.6283;
          ctx.lineTo(Math.cos(an2) * 3.4, Math.sin(an2) * 3.4);
        }
        ctx.closePath(); ctx.fill();
      } else if (kind === 3) {
        ctx.rect(-4, -9, 8, 15); ctx.fill();
        ctx.beginPath(); ctx.arc(0, -10, 4.2, 0, 6.283); ctx.fill();
      } else if (kind === 4) {
        ctx.arc(0, 2, 5, Math.PI, 0); ctx.closePath(); ctx.fill();
        for (var b = -3; b <= 3; b++) { ctx.beginPath(); ctx.moveTo(b * 1.7, 2); ctx.quadraticCurveTo(b * 2.6, -5, b * 3.1, -8); ctx.stroke(); }
      } else {
        ctx.ellipse(0, 0, 4.2, 7.5, 0.3, 0, 6.283); ctx.fill();
        ctx.beginPath(); ctx.moveTo(2, 5); ctx.lineTo(7, 9); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-2, 5); ctx.lineTo(-7, 9); ctx.stroke();
      }
      if (shy) {
        ctx.save(); ctx.globalAlpha *= 0.45; ctx.strokeStyle = C.creWarm; ctx.lineWidth = 0.9;
        ctx.beginPath(); ctx.arc(0, 0, 12, 0, 6.283); ctx.stroke(); ctx.restore();
      }
    }

    return api;
  }

  return { create: create, C: C, bakeWorld: bakeWorld, makeGlow: makeGlow };
});
