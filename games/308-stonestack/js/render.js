/* 308-stonestack · 渲染层：Canvas2D 画世界，DOM/CSS 排 UI */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SSR308 = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var W = 900, H = 600, BED_Y = 452, CX = 372;
  // 与 game.js 同源的两个常量（_smoke308 有硬断言保证不漂移）
  var MO = 15;      // == G.MIN_OVERLAP
  var KF = 0.020;   // == G.K_FLOW

  var C = {
    paper: '#EFE7D6', paper2: '#E4DBC5',
    ink: '#3B4350', ink2: '#6B7280',
    hill: '#9AA6AE', hill2: '#B4BCC0',
    watTop: '#A9C8C4', watBot: '#4E7180',
    verm: '#C4553B', gold: '#D9A441',
    stone: ['#5A6875', '#47555F', '#6E7C86', '#3E4854'],
    stoneLit: ['#7C8A96', '#66737D', '#8E9BA4', '#5C6672']
  };

  var bg = null, bgKey = '';
  var fx = [];      // 落石/水花
  var ripples = []; // 水面涟漪

  function bakeBG(waterY) {
    var key = 'bg' + waterY;
    if (bg && bgKey === key) return bg;
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var g = c.getContext('2d');

    // 宣纸底 + 竖向渐层
    var lg = g.createLinearGradient(0, 0, 0, H);
    lg.addColorStop(0, '#F5EFE1'); lg.addColorStop(0.55, C.paper); lg.addColorStop(1, C.paper2);
    g.fillStyle = lg; g.fillRect(0, 0, W, H);

    // 远山（三重留白剪影）
    function ridge(base, amp, col, seed, alpha) {
      var r = 0, x;
      function rnd() { r = (r * 9301 + 49297) % 233280; return r / 233280; }
      r = seed;
      g.beginPath(); g.moveTo(-20, base + 60);
      var y = base;
      for (x = -20; x <= W + 20; x += 26) {
        y += (rnd() - 0.5) * amp * 2;
        y = Math.max(base - amp * 3, Math.min(base + amp * 1.2, y));
        g.lineTo(x, y);
      }
      g.lineTo(W + 20, base + 60); g.closePath();
      g.globalAlpha = alpha; g.fillStyle = col; g.fill(); g.globalAlpha = 1;
    }
    ridge(210, 16, C.hill2, 7717, 0.55);
    ridge(258, 20, C.hill, 3313, 0.45);
    ridge(310, 14, '#8B959D', 9109, 0.30);

    // 雾带
    var fg = g.createLinearGradient(0, 250, 0, 400);
    fg.addColorStop(0, 'rgba(245,241,230,0)'); fg.addColorStop(0.5, 'rgba(245,241,230,.72)');
    fg.addColorStop(1, 'rgba(245,241,230,0)');
    g.fillStyle = fg; g.fillRect(0, 250, W, 150);

    // 颗粒
    g.globalAlpha = 0.05;
    var rr = 20240917;
    for (var i = 0; i < 2600; i++) {
      rr = (rr * 1103515245 + 12345) % 2147483648;
      var px = (rr % W); rr = (rr * 1103515245 + 12345) % 2147483648;
      var py = (rr % H);
      g.fillStyle = (i & 1) ? '#3B4350' : '#FFFFFF';
      g.fillRect(px, py, 1, 1);
    }
    g.globalAlpha = 1;

    // 暗角
    var vg = g.createRadialGradient(W * 0.42, H * 0.5, H * 0.30, W * 0.42, H * 0.5, H * 0.92);
    vg.addColorStop(0, 'rgba(40,44,52,0)'); vg.addColorStop(1, 'rgba(40,44,52,.16)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);

    bg = c; bgKey = key;
    return bg;
  }

  // ── 水体 ─────────────────────────────────────────
  var wg = null, wgKey = '';
  function waterGrad(ctx, waterY) {
    var key = 'w' + waterY;
    if (wg && wgKey === key) return wg;
    var g = ctx.createLinearGradient(0, waterY, 0, H);
    g.addColorStop(0, 'rgba(169,200,196,.62)');
    g.addColorStop(0.35, 'rgba(110,158,166,.72)');
    g.addColorStop(1, 'rgba(62,96,112,.88)');
    wg = g; wgKey = key;
    return g;
  }

  function drawWater(ctx, st, t) {
    var wy = st.waterY;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, wy);
    for (var x = 0; x <= W; x += 8) {
      ctx.lineTo(x, wy + Math.sin(x * 0.021 + t * 1.35) * 2.6 + Math.sin(x * 0.0071 - t * 0.8) * 1.9);
    }
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
    ctx.fillStyle = waterGrad(ctx, Math.round(wy));
    ctx.fill();

    // 水面亮线
    ctx.beginPath();
    for (var x2 = 0; x2 <= W; x2 += 8) {
      var yy = wy + Math.sin(x2 * 0.021 + t * 1.35) * 2.6 + Math.sin(x2 * 0.0071 - t * 0.8) * 1.9;
      if (x2 === 0) ctx.moveTo(x2, yy); else ctx.lineTo(x2, yy);
    }
    ctx.strokeStyle = 'rgba(240,250,248,.62)'; ctx.lineWidth = 1.6; ctx.stroke();

    // 水下横向流纹
    ctx.strokeStyle = 'rgba(232,244,242,.13)'; ctx.lineWidth = 1.2;
    for (var k = 0; k < 7; k++) {
      var yy2 = wy + 16 + k * 20 + Math.sin(t * 0.7 + k) * 3;
      if (yy2 > H - 6) break;
      ctx.beginPath();
      var ph = (t * (26 + st.flow * 70) + k * 137) % (W + 220) - 110;
      for (var s = 0; s < 5; s++) {
        var sx = ph + s * 108 + Math.sin(t + k + s) * 8;
        if (sx < -90 || sx > W + 10) continue;
        ctx.moveTo(sx, yy2); ctx.lineTo(sx + 42 + k * 3, yy2);
      }
      ctx.stroke();
    }

    // 涟漪
    for (var i = ripples.length - 1; i >= 0; i--) {
      var r = ripples[i];
      r.life -= 0.026;
      if (r.life <= 0) { ripples.splice(i, 1); continue; }
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, r.r * (1.6 - r.life), r.r * (1.6 - r.life) * 0.30, 0, 0, 6.2832);
      ctx.strokeStyle = 'rgba(238,250,248,' + (r.life * 0.5).toFixed(3) + ')';
      ctx.lineWidth = 1.4; ctx.stroke();
      r.r += 0.9;
    }
    ctx.restore();
  }

  function drawBed(ctx, st) {
    // 溪床
    ctx.save();
    ctx.fillStyle = 'rgba(58,72,84,.55)';
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(0, 566);
    for (var x = 0; x <= W; x += 40) ctx.lineTo(x, 566 + Math.sin(x * 0.03) * 5 + Math.cos(x * 0.011) * 4);
    ctx.lineTo(W, H); ctx.closePath();
    ctx.fill();
    // 卵石
    for (var i = 0; i < 26; i++) {
      var px = ((i * 137) % W), py = 574 + ((i * 53) % 22);
      var pr = 3 + ((i * 29) % 5);
      ctx.beginPath(); ctx.ellipse(px, py, pr * 1.7, pr, 0, 0, 6.2832);
      ctx.fillStyle = 'rgba(96,112,122,.42)'; ctx.fill();
    }
    ctx.restore();

    // 基石
    var bw = st.bw, bx = CX, by = BED_Y;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(bx - bw / 2, by);
    ctx.lineTo(bx + bw / 2, by);
    ctx.lineTo(bx + bw / 2 - 10, by + 46);
    ctx.lineTo(bx + 4, by + 58);
    ctx.lineTo(bx - bw / 2 + 14, by + 44);
    ctx.closePath();
    var bgg = ctx.createLinearGradient(0, by, 0, by + 58);
    bgg.addColorStop(0, '#6B7883'); bgg.addColorStop(1, '#3C4854');
    ctx.fillStyle = bgg; ctx.fill();
    ctx.strokeStyle = 'rgba(30,36,42,.42)'; ctx.lineWidth = 1.4; ctx.stroke();
    // 顶面积水高光
    ctx.beginPath(); ctx.moveTo(bx - bw / 2 + 3, by + 1.5); ctx.lineTo(bx + bw / 2 - 3, by + 1.5);
    ctx.strokeStyle = 'rgba(226,240,240,.5)'; ctx.lineWidth = 2.4; ctx.stroke();
    ctx.restore();
  }

  // ── 石块 ─────────────────────────────────────────
  function stonePath(ctx, x, y, w, h, th, rough) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(th);
    var hw = w / 2, hgt = h;
    var a = (rough - 0.5) * 5, b = (rough * 7 % 1 - 0.5) * 5;
    ctx.beginPath();
    ctx.moveTo(-hw, 0);
    ctx.lineTo(-hw - 1.5, -hgt * 0.5);
    ctx.lineTo(-hw * 0.72 + a, -hgt - 1.5);
    ctx.lineTo(0, -hgt - 2.2 - b * 0.3);
    ctx.lineTo(hw * 0.74 - a, -hgt - 0.8);
    ctx.lineTo(hw + 1.5, -hgt * 0.55);
    ctx.lineTo(hw, 0);
    ctx.closePath();
    return ctx;
  }

  function paintStone(ctx, x, y, w, h, th, rough, tone, alpha, ghost) {
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    var g = stonePath(ctx, x, y, w, h, th, rough);
    var lg = g.createLinearGradient(0, -h, 0, 0);
    lg.addColorStop(0, C.stoneLit[tone % 4]);
    lg.addColorStop(1, C.stone[tone % 4]);
    g.fillStyle = lg;
    if (ghost) { g.setLineDash([5, 4]); g.strokeStyle = 'rgba(196,85,59,.85)'; g.lineWidth = 1.6; }
    else { g.strokeStyle = 'rgba(26,32,38,.55)'; g.lineWidth = 1.3; }
    g.fill();
    // 顶面受光
    g.save(); g.clip();
    g.beginPath(); g.moveTo(-w / 2, -h); g.lineTo(w / 2, -h); g.lineTo(w / 2, -h + 4.5); g.lineTo(-w / 2, -h + 4.5); g.closePath();
    g.fillStyle = 'rgba(238,246,246,.22)'; g.fill();
    g.beginPath(); g.moveTo(-w / 2, -2.5); g.lineTo(w / 2, -2.5); g.lineTo(w / 2, 0); g.lineTo(-w / 2, 0); g.closePath();
    g.fillStyle = 'rgba(18,24,30,.28)'; g.fill();
    g.restore();          // 配对上面那次 save/clip
    g.stroke();
    g.restore();          // 配对 stonePath 内部的 save（变换）
    ctx.restore();        // 配对本函数开头的 save（globalAlpha）
  }

  function drawTower(ctx, st) {
    var T = st.tower, i;
    for (i = 0; i < T.length; i++) {
      var t = T[i];
      paintStone(ctx, t.x, t.y, t.w, t.h, t.th, t.rough, t.tone, 1, false);
    }
    // 水下的部分压一层冷色（clip 在 stonePath 的 save 之外，restore 只撤销变换、保留裁剪）
    if (T.length) {
      ctx.save();
      ctx.beginPath(); ctx.rect(0, st.waterY, W, H - st.waterY); ctx.clip();
      ctx.globalAlpha = 0.32; ctx.fillStyle = '#2E5A6B';
      for (i = 0; i < T.length; i++) {
        var t2 = T[i];
        if (t2.cy < st.waterY - t2.h) continue;   // 完全在水面上
        stonePath(ctx, t2.x, t2.y, t2.w, t2.h, t2.th, t2.rough);
        ctx.fill();
        ctx.restore();                            // 配对 stonePath 内部的 save
      }
      ctx.restore();
    }
  }

  // ── 可读层：重心垂线 / 危险接触面 / 目标线 ──────────
  function drawGuides(ctx, st) {
    var T = st.tower, n = T.length;
    // 目标线
    ctx.save();
    ctx.setLineDash([9, 7]);
    ctx.strokeStyle = 'rgba(196,85,59,.72)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(30, st.goalY); ctx.lineTo(706, st.goalY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(196,85,59,.92)';
    ctx.font = '600 12px system-ui,sans-serif'; ctx.textAlign = 'right';
    ctx.fillText('目标 · 塔顶要高过这条线', 700, st.goalY - 8);
    ctx.textAlign = 'left';
    ctx.restore();

    if (!n) return;
    // 最弱接触面高亮
    var wk = st.weak;
    if (wk >= 0 && st.margins[wk] != null && st.margins[wk] < 22) {
      var t = T[wk];
      var prev = wk > 0 ? T[wk - 1] : null;
      var sL = prev ? Math.max(t.bL, prev.tL) : Math.max(t.bL, CX - st.bw / 2);
      var sR = prev ? Math.min(t.bR, prev.tR) : Math.min(t.bR, CX + st.bw / 2);
      var mg = st.margins[wk];
      var col = mg < 0 ? 'rgba(196,85,59,.95)' : (mg < 12 ? 'rgba(196,85,59,.65)' : 'rgba(217,164,65,.60)');
      ctx.save();
      ctx.strokeStyle = col; ctx.lineWidth = 3.2;
      ctx.beginPath(); ctx.moveTo(sL, t.y + 1); ctx.lineTo(sR, t.y + 1); ctx.stroke();
      ctx.restore();
    }
    // 整塔合成重心垂线
    var M = 0, sx = 0;
    for (var i = 0; i < n; i++) { M += T[i].m; sx += T[i].m * T[i].cx; }
    var gx = sx / M;
    // 水推等效偏移（与 game.js 同源）
    var F = 0, mf = 0, j;
    for (j = 0; j < n; j++) {
      var sub = Math.max(0, Math.min(1, (T[j].cy - st.waterY) / (T[j].h * 0.5) + 0.5));
      var f = KF * st.flow * T[j].w * (0.35 + 0.65 * sub);
      mf += f * (T[0].y - T[j].cy);
    }
    var ex = gx + mf / Math.max(M, 1e-6);
    var mgG = st.margin;
    var gcol = mgG < 0 ? '#C4553B' : (mgG < 12 ? '#C4553B' : (mgG < 24 ? '#D9A441' : '#5E8494'));
    ctx.save();
    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = gcol; ctx.globalAlpha = 0.85; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(ex, T[n - 1].ty - 26); ctx.lineTo(ex, BED_Y + 52); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(ex, T[n - 1].ty - 30, 4.2, 0, 6.2832);
    ctx.fillStyle = gcol; ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = gcol; ctx.font = '700 11px system-ui,sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('重心', ex, T[n - 1].ty - 40);
    ctx.restore();
  }

  // ── 落点幽灵 ─────────────────────────────────────
  function drawGhost(ctx, st, dropX) {
    var b = st.basket[st.sel];
    if (!b || st.over) return;
    var prev = st.tower.length ? st.tower[st.tower.length - 1] : null;
    var topY = prev ? prev.ty : BED_Y;
    var th = Math.max(-0.24, Math.min(0.24, (prev ? prev.th : 0) + b.s));
    var cos = Math.cos(th), sn = Math.sin(th);
    var hw = (b.w / 2) * cos;
    var bL = dropX - hw, bR = dropX + hw;
    var sL = prev ? prev.tL : CX - st.bw / 2, sR = prev ? prev.tR : CX + st.bw / 2;
    var oL = Math.max(bL, sL), oR = Math.min(bR, sR);
    var ok = (oR - oL) >= MO;

    // 支撑窗口
    ctx.save();
    ctx.fillStyle = ok ? 'rgba(217,164,65,.16)' : 'rgba(196,85,59,.16)';
    ctx.fillRect(oL, topY - 3, Math.max(0, oR - oL), 6);
    ctx.strokeStyle = ok ? 'rgba(217,164,65,.7)' : 'rgba(196,85,59,.8)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(oL, topY - 3); ctx.lineTo(oL, topY + 3);
    ctx.moveTo(oR, topY - 3); ctx.lineTo(oR, topY + 3); ctx.stroke();
    // 落点垂线
    ctx.setLineDash([3, 5]); ctx.strokeStyle = 'rgba(59,67,80,.34)';
    ctx.beginPath(); ctx.moveTo(dropX, topY - b.h - 34); ctx.lineTo(dropX, topY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    paintStone(ctx, dropX, topY, b.w, b.h, th, b.rough, b.tone, 0.58, !ok);
  }

  // ── 石篮（右侧竖排） ──────────────────────────────
  var BASKET_BOX = [];
  (function () {
    for (var i = 0; i < 3; i++) BASKET_BOX.push({ x: 736, y: 104 + i * 122, w: 148, h: 108 });
  })();

  function drawBasket(ctx, st) {
    ctx.save();
    ctx.font = '600 11px system-ui,sans-serif'; ctx.textAlign = 'left';
    for (var i = 0; i < 3; i++) {
      var b = BASKET_BOX[i], s = st.basket[i];
      var selp = (i === st.sel && s);
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(b.x, b.y, b.w, b.h, 9);
      else ctx.rect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = selp ? 'rgba(247,242,231,.92)' : 'rgba(247,242,231,.62)';
      ctx.fill();
      ctx.strokeStyle = selp ? 'rgba(196,85,59,.85)' : 'rgba(90,96,108,.24)';
      ctx.lineWidth = selp ? 2.2 : 1.1; ctx.stroke();
      if (!s) {
        ctx.fillStyle = 'rgba(107,114,128,.5)';
        ctx.textAlign = 'center';
        ctx.fillText('（空）', b.x + b.w / 2, b.y + b.h / 2 + 4);
        ctx.textAlign = 'left';
        continue;
      }
      var sc = Math.min((b.w - 30) / s.w, (b.h - 34) / s.h, 1.35);
      ctx.save();
      ctx.translate(b.x + b.w / 2, b.y + b.h - 20);
      ctx.scale(sc, sc);
      paintStone(ctx, 0, 0, s.w, s.h, s.s, s.rough, s.tone, 1, false);
      ctx.restore();
      ctx.fillStyle = selp ? '#C4553B' : '#6B7280';
      ctx.fillText((i + 1) + '　宽 ' + s.w + ' 厚 ' + s.h, b.x + 10, b.y + 17);
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = '#6B7280'; ctx.font = '600 12px system-ui,sans-serif';
    ctx.fillText('岸上的石头', 810, 92);
    ctx.restore();
  }

  // ── 特效 ─────────────────────────────────────────
  function pushFx(ev) {
    if (ev.t === 'collapse' || ev.t === 'slip') {
      var arr = ev.stones || [];
      for (var i = 0; i < arr.length; i++) {
        var s = arr[i];
        fx.push({
          x: s.x, y: s.y, w: s.w || 22, h: s.h || 18, th: s.th || 0, tone: s.tone || 0, rough: s.rough || 0.5,
          vx: 26 + Math.random() * 90, vy: -40 - Math.random() * 70, vr: (Math.random() - 0.3) * 3.4,
          life: 1
        });
      }
      ripples.push({ x: CX, y: ev.y || st_waterGuess, r: 8, life: 1 });
    } else if (ev.t === 'place') {
      ripples.push({ x: CX, y: ev.y, r: 5, life: 0.8 });
    }
  }
  var st_waterGuess = 430;

  function drawFx(ctx, st) {
    var i;
    for (i = fx.length - 1; i >= 0; i--) {
      var f = fx[i];
      f.vy += 620 * 0.016; f.x += f.vx * 0.016; f.y += f.vy * 0.016; f.th += f.vr * 0.016;
      f.life -= 0.017;
      if (f.life <= 0 || f.y > H + 40) { fx.splice(i, 1); continue; }
      paintStone(ctx, f.x, f.y, f.w, f.h, f.th, f.rough, f.tone, Math.max(0, f.life), false);
    }
  }

  // ── 主绘制 ───────────────────────────────────────
  function draw(ctx, st, ui) {
    st_waterGuess = st.waterY;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(bakeBG(Math.round(st.waterY)), 0, 0);

    drawBed(ctx, st);
    drawTower(ctx, st);
    drawWater(ctx, st, st.t);
    drawGuides(ctx, st);
    if (!st.over && st.basket[st.sel]) drawGhost(ctx, st, ui.dropX);
    drawFx(ctx, st);
    drawBasket(ctx, st);

    // 顶端留白题字
    ctx.save();
    ctx.globalAlpha = 0.5; ctx.fillStyle = '#3B4350';
    ctx.font = '600 13px system-ui,sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('叠石 · 一溪', 34, 40);
    ctx.restore();
  }

  return {
    W: W, H: H, BED_Y: BED_Y, CX: CX, C: C,
    BASKET_BOX: BASKET_BOX,
    MO: MO, KF: KF,
    draw: draw, pushFx: pushFx, clearFx: function () { fx.length = 0; ripples.length = 0; },
    reset: function () { bg = null; bgKey = ''; wg = null; wgKey = ''; fx.length = 0; ripples.length = 0; }
  };
});
