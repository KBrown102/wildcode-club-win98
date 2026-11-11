/* 289-aurorachorus 渲染层：只读状态，消费 state.events 生成粒子 / 飘字，消费后清空。 */
(function (g) {
  'use strict';

  var R = {};
  var GM = null;   // 由 index.html 注入 AuroraGame，渲染层不复制相位公式
  var W = 480, H = 800;
  var AUR_L = 30, AUR_R = 450;
  var HORIZON = 512;

  var sprite = null, bg = null, skyC = null, iceGrad = null, ripGrad = null;
  var parts = [], floats = [], rings = [];
  var shake = 0, flash = 0, flashCol = '127,240,216';
  var lastTideOn = false;

  function mkc(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  function rnd32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- 预渲染：极光光柱精灵 ----------
  function buildSprite() {
    var w = 40, h = 300, c = mkc(w, h), x = c.getContext('2d');
    var gr = x.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0.00, 'rgba(198,110,255,0)');
    gr.addColorStop(0.09, 'rgba(198,110,255,0.42)');
    gr.addColorStop(0.22, 'rgba(168,214,255,0.72)');
    gr.addColorStop(0.38, 'rgba(127,240,216,0.95)');
    gr.addColorStop(0.60, 'rgba(94,200,255,0.82)');
    gr.addColorStop(0.80, 'rgba(58,138,228,0.30)');
    gr.addColorStop(1.00, 'rgba(40,90,180,0)');
    x.fillStyle = gr; x.fillRect(0, 0, w, h);
    x.globalCompositeOperation = 'destination-in';
    var hg = x.createLinearGradient(0, 0, w, 0);
    hg.addColorStop(0, 'rgba(0,0,0,0)');
    hg.addColorStop(0.20, 'rgba(0,0,0,0.45)');
    hg.addColorStop(0.5, 'rgba(0,0,0,1)');
    hg.addColorStop(0.80, 'rgba(0,0,0,0.45)');
    hg.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = hg; x.fillRect(0, 0, w, h);
    return c;
  }

  // ---------- 预渲染：夜空 / 星 / 雪原 / 冰面 ----------
  function buildBG() {
    var c = mkc(W, H), x = c.getContext('2d');
    var gr = x.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0.00, '#04081A');
    gr.addColorStop(0.30, '#08122E');
    gr.addColorStop(0.56, '#0E2247');
    gr.addColorStop(0.63, '#183E68');
    gr.addColorStop(0.645, '#0B1C36');
    gr.addColorStop(1.00, '#040A16');
    x.fillStyle = gr; x.fillRect(0, 0, W, H);

    var rnd = rnd32(20260907);
    for (var i = 0; i < 150; i++) {
      var sx = rnd() * W, sy = rnd() * 500, r = rnd() * 1.05 + 0.2;
      var a = (0.16 + rnd() * 0.62) * (1 - sy / 640);
      x.globalAlpha = Math.max(0, a);
      x.fillStyle = rnd() > 0.86 ? '#BFE3FF' : '#FFFFFF';
      x.beginPath(); x.arc(sx, sy, r, 0, 6.2832); x.fill();
    }
    x.globalAlpha = 1;

    // 远山雪脊
    x.beginPath();
    x.moveTo(-10, HORIZON + 6);
    var yy = HORIZON;
    for (var px = -10; px <= W + 10; px += 8) {
      yy = HORIZON - 16 * Math.sin(px * 0.011) - 9 * Math.sin(px * 0.027 + 1.4) - 5 * Math.sin(px * 0.06 + 0.3);
      x.lineTo(px, yy);
    }
    x.lineTo(W + 10, H); x.lineTo(-10, H); x.closePath();
    var mg = x.createLinearGradient(0, HORIZON - 34, 0, H);
    mg.addColorStop(0, '#152E52');
    mg.addColorStop(0.35, '#0C1E3A');
    mg.addColorStop(1, '#050C18');
    x.fillStyle = mg; x.fill();

    // 冰面反光带
    var ig = x.createLinearGradient(0, HORIZON + 4, 0, HORIZON + 120);
    ig.addColorStop(0, 'rgba(120,190,235,0.16)');
    ig.addColorStop(1, 'rgba(120,190,235,0)');
    x.fillStyle = ig; x.fillRect(0, HORIZON + 4, W, 120);

    // 冰裂纹
    x.strokeStyle = 'rgba(140,200,240,0.05)';
    x.lineWidth = 1;
    for (i = 0; i < 14; i++) {
      var y0 = HORIZON + 24 + rnd() * 250;
      x.beginPath(); x.moveTo(rnd() * W, y0);
      x.lineTo(rnd() * W, y0 + (rnd() - 0.5) * 60); x.stroke();
    }
    return c;
  }

  R.bind = function (gameMod) { GM = gameMod; };

  R.init = function () {
    sprite = buildSprite();
    bg = buildBG();
    parts.length = 0; floats.length = 0; rings.length = 0;
    shake = 0; flash = 0; lastTideOn = false;
  };

  // ---------- 粒子 ----------
  function spark(x0, y0, n, col, spd, up) {
    if (parts.length > 260) return;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 6.2832;
      parts.push({
        x: x0 + (Math.random() - 0.5) * 10, y: y0 + (Math.random() - 0.5) * 14,
        vx: Math.cos(a) * spd * (0.4 + Math.random()),
        vy: (up ? -Math.abs(Math.sin(a)) : Math.sin(a)) * spd * (0.4 + Math.random()) - (up ? 30 : 0),
        life: 0.55 + Math.random() * 0.6, max: 1, col: col, r: 1 + Math.random() * 1.8
      });
    }
  }
  function ring(x0, y0, col, r0, r1, life) {
    rings.push({ x: x0, y: y0, r: r0, r1: r1, t: 0, life: life, col: col });
  }
  function float(x0, y0, txt, col, big) {
    floats.push({ x: x0, y: y0, txt: txt, col: col, t: 0, life: 1.25, big: !!big });
  }

  // ---------- 事件消费 ----------
  R.consume = function (st) {
    var ev = st.events;
    for (var i = 0; i < ev.length; i++) {
      var e = ev[i], c = st.cols[e.i];
      if (!c) continue;
      switch (e.t) {
        case 'lock':
          spark(c.x, c.yt + c.h * 0.4, 5, '127,240,216', 42, true);
          ring(c.x, c.yt + c.h * 0.4, '190,255,240', 4, 26, 0.42);
          break;
        case 'launch':
          ring(c.x, c.yb, '150,220,255', 6, 44, 0.5);
          break;
        case 'miss':
          spark(c.x, c.yt + c.h * 0.5, 6, '120,140,175', 26, false);
          shake = 3.5;
          float(c.x, c.yt + c.h * 0.3, '暗', '150,170,200', false);
          break;
        case 'absorb':
          spark(c.x, c.yt + c.h * 0.55, 3, '90,120,160', 18, false);
          break;
        case 'chime':
          ring(c.x, c.yt + c.h * 0.35, '190,255,240', 3, 20, 0.38);
          spark(c.x, c.yt + c.h * 0.35, 2, '150,240,220', 16, true);
          break;
        case 'res':
          spark(c.x, c.yt + c.h * 0.5, 2, '232,176,75', 22, true);
          break;
        case 'chainEnd':
          if (e.len >= 3) {
            var midx = (AUR_L + AUR_R) / 2;
            float(midx, 320, e.len + ' 连 · +' + e.gain, e.len >= 5 ? '232,176,75' : '180,240,225', e.len >= 5);
            if (e.len >= 5) {
              flash = 0.5; flashCol = '232,176,75';
              spark(midx, 330, 26, '232,176,75', 130, false);
              ring(midx, 330, '255,225,160', 10, 170, 0.7);
            }
          }
          break;
        case 'refund':
          float((AUR_L + AUR_R) / 2, 366, '+1 束', '232,176,75', false);
          break;
        case 'tide':
          if (e.on) { flash = 0.32; flashCol = '127,240,216'; }
          break;
      }
    }
    ev.length = 0;
  };

  // ---------- 主绘制 ----------
  R.draw = function (ctx, st, dt) {
    if (!(dt > 0)) dt = 0;
    if (dt > 0.05) dt = 0.05;
    if (!sprite) R.init();

    var n = st.n, colW = st.colW, i, c, k, a;
    ctx.save();                      // 保留 dpr 基准变换，只用 save/restore
    if (shake > 0) {
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      shake = Math.max(0, shake - dt * 26);
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(bg, 0, 0);

    // 冰面上的极光辉光（随整体亮度）
    var tot = 0;
    for (i = 0; i < n; i++) {
      k = st.locked[i] ? 1 : (Math.sin(GM.phase(st, i)) + 1) * 0.5;
      tot += Math.max(0, k);
    }
    tot /= n;
    if (tot > 0.01) {
      if (!iceGrad) {
        iceGrad = ctx.createLinearGradient(0, HORIZON + 2, 0, HORIZON + 96);
        iceGrad.addColorStop(0, 'rgba(120,230,215,1)');
        iceGrad.addColorStop(1, 'rgba(120,230,215,0)');
      }
      ctx.globalAlpha = 0.10 * tot;          // 用 globalAlpha 调强度，避免每帧建渐变
      ctx.fillStyle = iceGrad;
      ctx.fillRect(0, HORIZON + 2, W, 96);
      ctx.globalAlpha = 1;
    }

    ctx.globalCompositeOperation = 'lighter';

    // 光柱：外晕 + 内芯
    var gw = Math.max(20, colW * 2.0), cw = Math.max(5, colW * 0.62);
    for (i = 0; i < n; i++) {
      c = st.cols[i];
      if (st.locked[i]) a = 1;
      else {
        k = (Math.sin(GM.phase(st, i)) + 1) * 0.5;
        a = 0.05 + Math.pow(k, 3) * 0.92;
      }
      if (st.locked[i]) {
        ctx.globalAlpha = 0.30;
        ctx.drawImage(sprite, c.x - gw / 2, c.yt - 6, gw, c.h + 12);
      } else if (a > 0.13) {
        ctx.globalAlpha = a * 0.26;
        ctx.drawImage(sprite, c.x - gw / 2, c.yt - 4, gw, c.h + 8);
      }
      ctx.globalAlpha = Math.min(1, a);
      ctx.drawImage(sprite, c.x - cw / 2, c.yt, cw, c.h);
    }
    // 冰面倒影（把光柱翻到地平线以下，填满下方留白）
    ctx.save();
    ctx.translate(0, HORIZON * 1.62);
    ctx.scale(1, -0.62);
    for (i = 0; i < n; i++) {
      c = st.cols[i];
      if (st.locked[i]) a = 0.075;
      else {
        k = (Math.sin(GM.phase(st, i)) + 1) * 0.5;
        a = Math.pow(k, 3) * 0.92;
        if (a < 0.30) continue;          // 倒影只画较亮的柱子，省一半 drawImage
        a = a * 0.075;
      }
      ctx.globalAlpha = a;
      ctx.drawImage(sprite, c.x - cw / 2, c.yt, cw, c.h);
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    // 已锁定柱内的「光丝」
    ctx.lineWidth = 1;
    for (i = 0; i < n; i++) {
      if (!st.locked[i]) continue;
      c = st.cols[i];
      for (var s = -1; s <= 1; s++) {
        var lx = c.x + s * cw * 0.26;
        var lp = 0.5 + 0.5 * Math.sin(st.time * 2.1 + i * 0.7 + s);
        ctx.globalAlpha = 0.16 + 0.20 * lp;
        ctx.strokeStyle = 'rgba(235,255,250,1)';
        ctx.beginPath();
        ctx.moveTo(lx, c.yt + c.h * 0.06);
        ctx.lineTo(lx, c.yt + c.h * (0.55 + 0.2 * lp));
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // 共鸣窗描边
    ctx.lineWidth = 1.5;
    for (i = 0; i < n; i++) {
      if (st.locked[i] || !GM.inWin(st, i)) continue;
      c = st.cols[i];
      ctx.globalAlpha = 0.42 + 0.16 * Math.sin(st.time * 6 + i);
      ctx.strokeStyle = 'rgba(223,250,255,1)';
      ctx.strokeRect(c.x - cw / 2 - 1, c.yt + c.h * 0.10, cw + 2, c.h * 0.80);
    }
    ctx.globalAlpha = 1;

    // 共鸣标尺（地平线上方一条，让「亮带」一眼可读）
    var sy = HORIZON - 9;
    for (i = 0; i < n; i++) {
      c = st.cols[i];
      var on = st.locked[i] ? 1 : (GM.inWin(st, i) ? 0.9 : 0.08);
      var pulse = GM.inWin(st, i) ? (0.75 + 0.25 * Math.sin(st.time * 7 + i * 0.9)) : 1;
      ctx.globalAlpha = on * pulse;
      ctx.fillStyle = st.locked[i] ? 'rgba(127,240,216,1)'
        : (GM.inWin(st, i) ? 'rgba(200,250,240,1)' : 'rgba(120,160,200,1)');
      var bw = Math.max(3, colW * 0.66), bh = st.locked[i] ? 5 : 3;
      ctx.fillRect(c.x - bw / 2, sy - bh / 2, bw, bh);
    }
    ctx.globalAlpha = 1;

    // 涟漪
    for (i = 0; i < st.ripples.length; i++) {
      var rp = st.ripples[i];
      var rx = AUR_L + (rp.pos + 0.5) * colW;
      var ci = Math.max(0, Math.min(n - 1, Math.round(rp.pos)));
      c = st.cols[ci];
      ctx.globalAlpha = 0.9;
      if (!ripGrad) { ripGrad = ctx.createLinearGradient(0, 0, 0, 1); ripGrad.addColorStop(0, 'rgba(198,110,255,0)'); ripGrad.addColorStop(0.3, 'rgba(190,255,240,0.85)'); ripGrad.addColorStop(0.7, 'rgba(127,240,216,0.75)'); ripGrad.addColorStop(1, 'rgba(94,200,255,0)'); }
      ctx.save();
      ctx.translate(rx - 3.5, c.yt); ctx.scale(1, c.h);
      ctx.fillStyle = ripGrad; ctx.fillRect(0, 0, 7, 1);
      ctx.restore();
      ctx.globalAlpha = 0.34;
      ctx.fillStyle = 'rgba(190,255,245,1)';
      ctx.fillRect(rx - 9, c.yt + c.h * 0.25, 18, c.h * 0.5);
    }
    ctx.globalAlpha = 1;

    // 粒子
    ctx.globalCompositeOperation = 'lighter';
    for (i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += 42 * dt; p.vx *= 0.985;
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 0.9));
      ctx.fillStyle = 'rgba(' + p.col + ',1)';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 扩散环
    for (i = rings.length - 1; i >= 0; i--) {
      var rr = rings[i];
      rr.t += dt;
      if (rr.t >= rr.life) { rings.splice(i, 1); continue; }
      var q = rr.t / rr.life;
      ctx.globalAlpha = (1 - q) * 0.7;
      ctx.strokeStyle = 'rgba(' + rr.col + ',1)';
      ctx.lineWidth = 2.4 * (1 - q) + 0.6;
      ctx.beginPath();
      ctx.arc(rr.x, rr.y, rr.r + (rr.r1 - rr.r) * q, 0, 6.2832);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // 键盘准星
    if (st.__cursorVisible) {
      var cx = AUR_L + (st.cursor + 0.5) * colW;
      ctx.globalAlpha = 0.55 + 0.25 * Math.sin(st.time * 8);
      ctx.fillStyle = 'rgba(232,176,75,1)';
      ctx.beginPath();
      ctx.moveTo(cx, HORIZON - 26); ctx.lineTo(cx - 5, HORIZON - 34); ctx.lineTo(cx + 5, HORIZON - 34);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // 飘字
    ctx.globalCompositeOperation = 'source-over';
    for (i = floats.length - 1; i >= 0; i--) {
      var f = floats[i];
      f.t += dt;
      if (f.t >= f.life) { floats.splice(i, 1); continue; }
      var fq = f.t / f.life;
      ctx.globalAlpha = fq < 0.15 ? fq / 0.15 : (1 - (fq - 0.15) / 0.85);
      ctx.fillStyle = 'rgba(' + f.col + ',1)';
      ctx.textAlign = 'center';
      ctx.font = (f.big ? '700 30px ' : '700 20px ') +
        '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif';
      ctx.fillText(f.txt, f.x, f.y - fq * 34);
    }
    ctx.globalAlpha = 1;

    // 合声潮全屏柔光
    if (st.tideOn) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.05 + 0.035 * Math.sin(st.time * 5);
      ctx.fillStyle = 'rgba(90,220,200,1)';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    if (flash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = flash * 0.34;
      ctx.fillStyle = 'rgba(' + flashCol + ',1)';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
      flash = Math.max(0, flash - dt * 1.9);
      ctx.globalCompositeOperation = 'source-over';
    }

    ctx.restore();
  };

  R.reset = function () { parts.length = 0; floats.length = 0; rings.length = 0; shake = 0; flash = 0; };

  g.AuroraRender = R;
})(typeof globalThis !== 'undefined' ? globalThis : this);
