/* 290-viewfinder《取景 · 一镜》 — 渲染层（只读状态，不写状态；消费 events 出粒子/飘字后清空） */
(function (g) {
  'use strict';
  var VF = g.VF, W = VF.W, H = VF.H, HORIZON = VF.HORIZON;
  var R = { key: '' };

  function ensure(ctx, st) {
    var k = st.pal.base + '|' + ctx.canvas.width + 'x' + ctx.canvas.height;
    if (R.key === k) return R;
    var p = st.pal;
    var sky = ctx.createLinearGradient(0, 0, 0, HORIZON + 60);
    sky.addColorStop(0, p.skyTop); sky.addColorStop(0.55, p.skyMid); sky.addColorStop(1, p.skyBot);
    var gnd = ctx.createLinearGradient(0, HORIZON - 10, 0, H);
    gnd.addColorStop(0, p.ground); gnd.addColorStop(1, p.ground2);
    var halo = ctx.createRadialGradient(0, 0, 4, 0, 0, 46);
    halo.addColorStop(0, 'rgba(255,246,214,0.55)'); halo.addColorStop(1, 'rgba(255,246,214,0)');
    var glow = ctx.createRadialGradient(0, 0, 3, 0, 0, 34);
    glow.addColorStop(0, 'rgba(255,232,170,0.42)'); glow.addColorStop(1, 'rgba(255,232,170,0)');
    R.sky = sky; R.gnd = gnd; R.halo = halo; R.glow = glow; R.key = k;
    return R;
  }

  // ---------- 景物剪影 ----------
  function drawObj(ctx, st, o, p) {
    var K = o.K, x = p.x, y = p.y, pal = st.pal;
    var w = K.sw, h = K.sh;
    ctx.save();
    ctx.translate(x, y);
    switch (o.kind) {
      case 'cloud':
        ctx.fillStyle = pal.skyBot;
        ctx.beginPath();
        ctx.ellipse(-w * 0.22, 4, w * 0.30, h * 0.52, 0, 0, 6.2832);
        ctx.ellipse(w * 0.10, -6, w * 0.26, h * 0.62, 0, 0, 6.2832);
        ctx.ellipse(w * 0.30, 6, w * 0.24, h * 0.46, 0, 0, 6.2832);
        ctx.fill();
        break;
      case 'moon':
        ctx.save(); ctx.translate(0, 0); ctx.fillStyle = R.halo;
        ctx.beginPath(); ctx.arc(0, 0, 46, 0, 6.2832); ctx.fill(); ctx.restore();
        ctx.fillStyle = 'rgba(255,250,232,0.92)';
        ctx.beginPath(); ctx.arc(0, 0, w * 0.5, 0, 6.2832); ctx.fill();
        break;
      case 'lighthouse':
        ctx.fillStyle = pal.mid2;
        ctx.beginPath();
        ctx.moveTo(-w * 0.22, h * 0.5); ctx.lineTo(w * 0.22, h * 0.5);
        ctx.lineTo(w * 0.13, -h * 0.28); ctx.lineTo(-w * 0.13, -h * 0.28);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = pal.mid;
        ctx.fillRect(-w * 0.20, -h * 0.40, w * 0.40, h * 0.12);
        ctx.beginPath(); ctx.moveTo(-w * 0.17, -h * 0.40); ctx.lineTo(0, -h * 0.52); ctx.lineTo(w * 0.17, -h * 0.40);
        ctx.closePath(); ctx.fill();
        ctx.save(); ctx.translate(0, -h * 0.34); ctx.fillStyle = R.glow;
        ctx.beginPath(); ctx.arc(0, 0, 34, 0, 6.2832); ctx.fill(); ctx.restore();
        break;
      case 'kite':
        ctx.fillStyle = pal.near2;
        ctx.beginPath(); ctx.moveTo(0, -h * 0.5); ctx.lineTo(w * 0.5, 0); ctx.lineTo(0, h * 0.5); ctx.lineTo(-w * 0.5, 0);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = pal.near2; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, h * 0.5);
        for (var i = 1; i <= 3; i++) ctx.lineTo(Math.sin(i * 1.7) * 9, h * 0.5 + i * 14);
        ctx.stroke();
        break;
      case 'bird':
        ctx.strokeStyle = pal.near2; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-w * 0.5, 2); ctx.quadraticCurveTo(-w * 0.22, -h * 0.5, 0, 0);
        ctx.quadraticCurveTo(w * 0.22, -h * 0.5, w * 0.5, 2);
        ctx.stroke();
        break;
      case 'tree':
        ctx.fillStyle = pal.mid2;
        ctx.fillRect(-w * 0.05, -h * 0.1, w * 0.10, h * 0.6);
        ctx.beginPath();
        ctx.ellipse(0, -h * 0.22, w * 0.46, h * 0.34, 0, 0, 6.2832);
        ctx.ellipse(-w * 0.30, -h * 0.05, w * 0.26, h * 0.20, 0, 0, 6.2832);
        ctx.ellipse(w * 0.30, -h * 0.05, w * 0.26, h * 0.20, 0, 0, 6.2832);
        ctx.fill();
        break;
      case 'sign':
        ctx.fillStyle = pal.near2;
        ctx.fillRect(-w * 0.06, -h * 0.05, w * 0.12, h * 0.55);
        ctx.fillRect(-w * 0.5, -h * 0.5, w, h * 0.5);
        ctx.fillStyle = pal.skyBot;
        ctx.fillRect(-w * 0.38, -h * 0.38, w * 0.34, h * 0.07);
        ctx.fillRect(-w * 0.38, -h * 0.24, w * 0.22, h * 0.07);
        break;
      case 'cat':
        ctx.fillStyle = pal.near2;
        ctx.beginPath(); ctx.ellipse(-w * 0.05, h * 0.06, w * 0.34, h * 0.30, 0, 0, 6.2832); ctx.fill();
        ctx.beginPath(); ctx.ellipse(w * 0.28, -h * 0.12, w * 0.19, h * 0.21, 0, 0, 6.2832); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(w * 0.14, -h * 0.28); ctx.lineTo(w * 0.18, -h * 0.46); ctx.lineTo(w * 0.30, -h * 0.26);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(w * 0.36, -h * 0.28); ctx.lineTo(w * 0.44, -h * 0.44); ctx.lineTo(w * 0.46, -h * 0.22);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = pal.near2; ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-w * 0.36, h * 0.02);
        ctx.quadraticCurveTo(-w * 0.62, -h * 0.05, -w * 0.52, -h * 0.36); ctx.stroke();
        break;
      case 'flower':
        ctx.strokeStyle = pal.near2; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(0, h * 0.5); ctx.quadraticCurveTo(w * 0.1, h * 0.1, 0, -h * 0.10); ctx.stroke();
        ctx.fillStyle = pal.skyBot;
        for (var k = 0; k < 5; k++) {
          var a = k * 1.2566;
          ctx.beginPath();
          ctx.ellipse(Math.cos(a) * w * 0.22, -h * 0.22 + Math.sin(a) * h * 0.22, w * 0.16, h * 0.16, 0, 0, 6.2832);
          ctx.fill();
        }
        ctx.fillStyle = pal.near2;
        ctx.beginPath(); ctx.arc(0, -h * 0.22, w * 0.11, 0, 6.2832); ctx.fill();
        break;
      case 'lamp':
        ctx.fillStyle = pal.near2;
        ctx.fillRect(-w * 0.09, -h * 0.12, w * 0.18, h * 0.62);
        ctx.beginPath(); ctx.arc(0, -h * 0.30, w * 0.30, Math.PI, 0); ctx.fill();
        ctx.save(); ctx.translate(0, -h * 0.18); ctx.fillStyle = R.glow;
        ctx.beginPath(); ctx.arc(0, 0, 34, 0, 6.2832); ctx.fill(); ctx.restore();
        ctx.fillStyle = pal.skyBot;
        ctx.beginPath(); ctx.ellipse(0, -h * 0.22, w * 0.20, h * 0.07, 0, 0, 6.2832); ctx.fill();
        break;
      case 'bench':
        ctx.fillStyle = pal.near2;
        ctx.fillRect(-w * 0.5, -h * 0.05, w, h * 0.16);
        ctx.fillRect(-w * 0.5, -h * 0.45, w, h * 0.14);
        ctx.fillRect(-w * 0.42, h * 0.11, w * 0.07, h * 0.38);
        ctx.fillRect(w * 0.35, h * 0.11, w * 0.07, h * 0.38);
        break;
      case 'bike':
        ctx.strokeStyle = pal.near2; ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(-w * 0.30, h * 0.22, w * 0.19, 0, 6.2832); ctx.stroke();
        ctx.beginPath(); ctx.arc(w * 0.30, h * 0.22, w * 0.19, 0, 6.2832); ctx.stroke();
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(-w * 0.30, h * 0.22); ctx.lineTo(-w * 0.06, -h * 0.10); ctx.lineTo(w * 0.26, -h * 0.10);
        ctx.lineTo(w * 0.30, h * 0.22); ctx.moveTo(-w * 0.06, -h * 0.10); ctx.lineTo(w * 0.06, h * 0.22);
        ctx.lineTo(w * 0.30, h * 0.22); ctx.stroke();
        break;
      case 'peak':
        // 山尖：山脊已画，这里只加一道雪线高光
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        ctx.beginPath();
        ctx.moveTo(-w * 0.34, h * 0.30); ctx.lineTo(-w * 0.06, -h * 0.46);
        ctx.lineTo(w * 0.22, h * 0.16); ctx.lineTo(w * 0.02, h * 0.34);
        ctx.closePath(); ctx.fill();
        break;
    }
    ctx.restore();
  }

  function ridgePath(ctx, st) {
    var w = st.world, camX = st.camX, pts = w.ridge;
    ctx.beginPath();
    var started = false;
    for (var i = 0; i < pts.length; i++) {
      var sx = pts[i].x - camX * 0.10;
      if (sx < -60) { continue; }
      if (sx > W + 60) break;
      if (!started) { ctx.moveTo(sx, pts[i].y); started = true; }
      else ctx.lineTo(sx, pts[i].y);
    }
    if (!started) return false;
    return true;
  }

  function drawWorld(ctx, st) {
    var r = ensure(ctx, st), pal = st.pal, w = st.world, camX = st.camX;
    ctx.clearRect(0, 0, W, H);

    // 天空
    ctx.fillStyle = r.sky;
    ctx.fillRect(0, 0, W, HORIZON + 60);

    // 太阳 / 月盘（最远景，几乎不动）
    var sunX = W * 0.63 - camX * 0.02, sunY = 168;
    ctx.save(); ctx.translate(sunX, sunY); ctx.fillStyle = R.halo;
    ctx.beginPath(); ctx.arc(0, 0, 82, 0, 6.2832); ctx.fill();
    ctx.fillStyle = 'rgba(255,247,222,0.42)';
    ctx.beginPath(); ctx.arc(0, 0, 30, 0, 6.2832); ctx.fill();
    ctx.restore();

    // 天色随长镜头推进转暖
    var prog = Math.min(1, st.t / w.cfg.dur);
    ctx.fillStyle = 'rgba(255,206,140,' + (0.16 * prog).toFixed(3) + ')';
    ctx.fillRect(0, 0, W, HORIZON + 60);

    // 远山
    if (ridgePath(ctx, st)) {
      ctx.lineTo(W + 60, HORIZON + 30); ctx.lineTo(-60, HORIZON + 30); ctx.closePath();
      ctx.fillStyle = pal.far; ctx.fill();
    }

    // 中景楼群
    for (var i = 0; i < w.bs.length; i++) {
      var b = w.bs[i];
      var bx = b.x - camX * 0.34;
      if (bx > W + 20) continue;
      if (bx + b.w < -20) continue;
      var top = HORIZON - b.h;
      ctx.fillStyle = pal.mid;
      ctx.fillRect(bx, top, b.w, b.h);
      ctx.fillStyle = pal.mid2;
      ctx.fillRect(bx + b.w - Math.min(18, b.w * 0.3), top, Math.min(18, b.w * 0.3), b.h);
      // 窗
      ctx.fillStyle = 'rgba(255,236,190,0.30)';
      var cols = Math.max(1, Math.floor(b.w / 26)), rows = Math.max(1, Math.floor(b.h / 40));
      for (var cx = 0; cx < cols; cx++) {
        for (var cy = 0; cy < rows; cy++) {
          var hh = ((cx * 7 + cy * 13 + Math.floor(b.seed * 97)) % 10);
          if (hh > 5) continue;
          ctx.fillRect(bx + 8 + cx * 26, top + 14 + cy * 40, 9, 13);
        }
      }
    }

    // 地面
    ctx.fillStyle = r.gnd;
    ctx.fillRect(0, HORIZON, W, H - HORIZON);
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    ctx.fillRect(0, HORIZON - 2, W, 3);
    // 街面参照（跟着近景一起滚动，让长镜头的移动读得出来）
    ctx.fillStyle = 'rgba(255,255,255,0.055)';
    var dash0 = -((camX * 0.82) % 96);
    for (var dx = dash0; dx < W + 96; dx += 96) ctx.fillRect(dx, 706, 46, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.035)';
    var curb0 = -((camX * 0.82) % 60);
    for (var cx2 = curb0; cx2 < W + 60; cx2 += 60) ctx.fillRect(cx2, 626, 30, 3);

    // 景物（按景深从远到近）
    var ord = w.order;
    for (var j = 0; j < ord.length; j++) {
      var o = ord[j];
      if (o.used) continue;
      var p2 = VF.objPos(o, camX);
      if (p2.x < -200 || p2.x > W + 200) continue;
      drawObj(ctx, st, o, p2);
    }

    // 前景（压暗四角，营造景深）
    for (var f = 0; f < w.fores.length; f++) {
      var fo = w.fores[f];
      var fx = fo.x - camX * 1.35;
      if (fx > W + 40) continue;
      if (fx + fo.w < -40) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(fx + fo.w / 2, H - 20, fo.w * 0.7, fo.h * 0.62, 0, 0, 6.2832);
      ctx.fill();
    }
  }

  function drawFrame(ctx, st, flash) {
    var f = VF.frameOf(st), pal = st.pal;
    // 框外压暗（大画幅克制）
    ctx.fillStyle = 'rgba(12,10,8,0.46)';
    ctx.fillRect(0, 0, W, f.y);
    ctx.fillRect(0, f.y + f.h, W, H - f.y - f.h);
    ctx.fillRect(0, f.y, f.x, f.h);
    ctx.fillRect(f.x + f.w, f.y, W - f.x - f.w, f.h);

    // 三分线
    ctx.strokeStyle = 'rgba(255,255,255,0.13)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(f.x + f.w / 3, f.y); ctx.lineTo(f.x + f.w / 3, f.y + f.h);
    ctx.moveTo(f.x + f.w * 2 / 3, f.y); ctx.lineTo(f.x + f.w * 2 / 3, f.y + f.h);
    ctx.moveTo(f.x, f.y + f.h / 3); ctx.lineTo(f.x + f.w, f.y + f.h / 3);
    ctx.moveTo(f.x, f.y + f.h * 2 / 3); ctx.lineTo(f.x + f.w, f.y + f.h * 2 / 3);
    ctx.stroke();

    // 当前主体提示框
    if (st.live) {
      var o = st.live.o, K = o.K;
      var a = 0.20 + 0.55 * st.live.s;
      ctx.strokeStyle = 'rgba(255,236,190,' + a.toFixed(3) + ')';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(st.live.p.x - K.sw / 2, st.live.p.y - K.sh / 2, K.sw, K.sh);
      ctx.setLineDash([]);
    }

    // 画框
    var hot = st.live && st.live.s >= VF.S_GOOD;
    var perfect = st.live && st.live.s >= VF.S_PERFECT;
    ctx.strokeStyle = perfect ? 'rgba(255,241,205,0.98)' : (hot ? 'rgba(232,176,75,0.92)' : 'rgba(232,176,75,0.62)');
    ctx.lineWidth = perfect ? 2.6 : 1.8;
    ctx.strokeRect(f.x + 0.5, f.y + 0.5, f.w - 1, f.h - 1);
    // 角标
    var c = Math.min(26, f.w * 0.20);
    ctx.lineWidth = perfect ? 4 : 3;
    ctx.beginPath();
    ctx.moveTo(f.x, f.y + c); ctx.lineTo(f.x, f.y); ctx.lineTo(f.x + c, f.y);
    ctx.moveTo(f.x + f.w - c, f.y); ctx.lineTo(f.x + f.w, f.y); ctx.lineTo(f.x + f.w, f.y + c);
    ctx.moveTo(f.x + f.w, f.y + f.h - c); ctx.lineTo(f.x + f.w, f.y + f.h); ctx.lineTo(f.x + f.w - c, f.y + f.h);
    ctx.moveTo(f.x + c, f.y + f.h); ctx.lineTo(f.x, f.y + f.h); ctx.lineTo(f.x, f.y + f.h - c);
    ctx.stroke();
    if (flash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + (flash * 0.85).toFixed(3) + ')';
      ctx.fillRect(f.x, f.y, f.w, f.h);
    }
  }

  function drawIdle(ctx, st) { // 开始页背景（不推进状态也能出画）
    drawWorld(ctx, st);
  }

  g.VFR = { drawWorld: drawWorld, drawFrame: drawFrame, drawIdle: drawIdle, ensure: ensure, res: R };
})(typeof globalThis !== 'undefined' ? globalThis : this);
