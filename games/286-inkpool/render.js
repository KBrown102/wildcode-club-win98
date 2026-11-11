/* 286-inkpool《匀墨 · 五色池》· 渲染层
   只读状态、不写状态；消费 st.events 生成粒子与飘字，消费后清空 */
(function (g) {
  'use strict';

  var W = 480, H = 820, TABLE_Y = 640;
  var PAPER = '#F3EDE0';
  var INK = ['#B9B2A6', '#8C857A', '#5E584F', '#36322C', '#17150F'];
  var INK_HI = ['#D2CBC0', '#ADA598', '#83796C', '#554E44', '#302C24'];
  var INK_RGB = ['185,178,166', '140,133,122', '94,88,79', '54,50,44', '23,21,15'];
  var CINN = '#C3423F';
  var CINN_RGB = '195,66,63';
  var GNAME = ['清', '淡', '重', '浓', '焦'];
  var CN = ['', '一', '二', '三', '四', '五', '六', '七'];
  var SPR = 3;

  var cv = null, ctx = null, eff = 2, bg = null;
  var pots = [], sprites = [], anim = [], stampA = [];
  var parts = [], streams = [];
  var tAll = 0;

  function mulberry32(a) {
    a = a >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rr(x, px, py, w, h, r) {
    x.beginPath();
    x.moveTo(px + r, py);
    x.lineTo(px + w - r, py); x.quadraticCurveTo(px + w, py, px + w, py + r);
    x.lineTo(px + w, py + h - r); x.quadraticCurveTo(px + w, py + h, px + w - r, py + h);
    x.lineTo(px + r, py + h); x.quadraticCurveTo(px, py + h, px, py + h - r);
    x.lineTo(px, py + r); x.quadraticCurveTo(px, py, px + r, py);
    x.closePath();
  }

  /* ---------------- 墨格精灵（每阶一笔触肌理，色盲友好的二次辨识） ---------------- */
  function unitSprite(iw, uh, k) {
    var c = document.createElement('canvas');
    c.width = Math.max(2, Math.ceil(iw * SPR));
    c.height = Math.max(2, Math.ceil(uh * SPR));
    var x = c.getContext('2d');
    x.scale(SPR, SPR);
    x.fillStyle = INK[k]; x.fillRect(0, 0, iw, uh);
    var gr = x.createLinearGradient(0, 0, 0, uh);
    gr.addColorStop(0, 'rgba(255,252,245,0.14)');
    gr.addColorStop(0.38, 'rgba(255,252,245,0)');
    gr.addColorStop(1, 'rgba(0,0,0,0.17)');
    x.fillStyle = gr; x.fillRect(0, 0, iw, uh);
    var i, a, b;
    x.lineWidth = 1;
    if (k === 0) {                       // 清：稀疏宣纸点
      x.fillStyle = 'rgba(255,253,247,0.36)';
      for (i = 0; i < 18; i++) { a = (i * 97) % (iw - 3) + 1.5; b = (i * 53) % (uh - 3) + 1.5; x.beginPath(); x.arc(a, b, 1.05, 0, 6.284); x.fill(); }
    } else if (k === 1) {                // 淡：斜纹
      x.strokeStyle = 'rgba(255,253,247,0.21)';
      for (i = -uh; i < iw; i += 7) { x.beginPath(); x.moveTo(i, uh); x.lineTo(i + uh, 0); x.stroke(); }
    } else if (k === 2) {                // 重：网格
      x.strokeStyle = 'rgba(255,253,247,0.18)';
      for (i = 4; i < iw; i += 8) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, uh); x.stroke(); }
      for (i = 4; i < uh; i += 8) { x.beginPath(); x.moveTo(0, i); x.lineTo(iw, i); x.stroke(); }
    } else if (k === 3) {                // 浓：密横纹
      x.strokeStyle = 'rgba(255,253,247,0.14)';
      for (i = 3; i < uh; i += 4) { x.beginPath(); x.moveTo(0.5, i + 0.5); x.lineTo(iw - 0.5, i + 0.5); x.stroke(); }
    } else {                             // 焦：实心 + 飞白
      x.fillStyle = 'rgba(255,253,247,0.11)';
      for (i = 0; i < 8; i++) x.fillRect((i * 31) % Math.max(1, iw - 4), (i * 17) % Math.max(1, uh - 2), 3, 1);
    }
    return c;
  }

  /* ---------------- 宣纸底（一次性烘焙） ---------------- */
  function buildBG() {
    bg = document.createElement('canvas');
    bg.width = Math.max(2, Math.ceil(W * eff));
    bg.height = Math.max(2, Math.ceil(H * eff));
    var x = bg.getContext('2d');
    x.setTransform(eff, 0, 0, eff, 0, 0);
    x.fillStyle = PAPER; x.fillRect(0, 0, W, H);
    var rnd = mulberry32(20260906), i;
    for (i = 0; i < 2800; i++) {
      x.fillStyle = 'rgba(122,110,94,' + (0.018 + rnd() * 0.044).toFixed(3) + ')';
      x.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 1.3, 1 + rnd() * 1.3);
    }
    x.lineWidth = 1;
    for (i = 0; i < 190; i++) {
      var px = rnd() * W, py = rnd() * H, ang = rnd() * 3.1416, len = 5 + rnd() * 14;
      x.strokeStyle = 'rgba(122,110,94,' + (0.018 + rnd() * 0.026).toFixed(3) + ')';
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(ang) * len, py + Math.sin(ang) * len); x.stroke();
    }
    var strokes = [[86, 356, 158, 30, -0.10], [374, 566, 132, 22, 0.14], [246, 116, 176, 24, -0.04], [118, 606, 96, 15, 0.05]];
    for (i = 0; i < strokes.length; i++) {
      var s = strokes[i];
      x.save(); x.translate(s[0], s[1]); x.rotate(s[4]); x.scale(1, s[3] / s[2]);
      var gr = x.createRadialGradient(0, 0, 2, 0, 0, s[2]);
      gr.addColorStop(0, 'rgba(60,55,48,0.058)');
      gr.addColorStop(0.6, 'rgba(60,55,48,0.026)');
      gr.addColorStop(1, 'rgba(60,55,48,0)');
      x.fillStyle = gr;
      x.beginPath(); x.arc(0, 0, s[2], 0, 6.284); x.fill();
      x.restore();
    }
    var tg = x.createLinearGradient(0, TABLE_Y, 0, TABLE_Y + 17);
    tg.addColorStop(0, 'rgba(58,53,46,0.20)');
    tg.addColorStop(1, 'rgba(58,53,46,0)');
    x.fillStyle = tg; x.fillRect(0, TABLE_Y, W, 17);
    x.lineWidth = 1.8;
    for (i = 0; i < W; i += 3) {
      var al = 0.32 * (0.30 + 0.70 * Math.abs(Math.sin(i * 0.11) * Math.sin(i * 0.037 + 1.2)));
      x.strokeStyle = 'rgba(58,53,46,' + al.toFixed(3) + ')';
      x.beginPath(); x.moveTo(i, TABLE_Y + 0.2); x.lineTo(Math.min(W, i + 3.6), TABLE_Y + 0.2); x.stroke();
    }
    x.font = '13px "KaiTi","STKaiti",serif';
    x.fillStyle = 'rgba(58,53,46,0.32)';
    x.textAlign = 'center'; x.textBaseline = 'top';
    var sig = '五色池';
    for (i = 0; i < sig.length; i++) x.fillText(sig[i], 440, 662 + i * 17);
    x.save();
    x.translate(440, 726);
    x.fillStyle = 'rgba(195,66,63,0.60)';
    rr(x, -8, -8, 16, 16, 2.5); x.fill();
    x.fillStyle = 'rgba(243,237,224,0.94)';
    x.font = '11px "KaiTi","STKaiti",serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('匀', 0, 0.5);
    x.restore();
  }

  /* ---------------- 布局 ---------------- */
  function layout(st) {
    var np = st.np, margin = 24, gap = 12;
    var w = Math.min(64, (W - margin * 2 - gap * (np - 1)) / np);
    var uh = st.cap === 3 ? 46 : st.cap === 4 ? 42 : 38;
    var padB = 9, rim = 12;
    var potH = st.cap * uh + padB + rim;
    var top = TABLE_Y - potH;
    var total = np * w + gap * (np - 1);
    var x0 = (W - total) / 2;
    pots = [];
    for (var i = 0; i < np; i++) {
      var x = x0 + i * (w + gap);
      pots.push({
        i: i, x: x, w: w, cx: x + w / 2, top: top, bot: TABLE_Y,
        uh: uh, rim: rim,
        ix: x + 5.5, iw: w - 11, iTop: top + rim, iBot: TABLE_Y - padB
      });
    }
    sprites = [];
    for (var k = 0; k < 5; k++) sprites.push(unitSprite(w - 11, uh, k));
  }

  function potOuter(x, p) {
    var hw = p.w / 2, t = p.top, b = p.bot, d = b - t;
    x.beginPath();
    x.moveTo(p.cx - hw, t);
    x.bezierCurveTo(p.cx - hw - 1.5, t + d * 0.45, p.cx - hw + 2, b - 16, p.cx - hw + 3, b - 4);
    x.quadraticCurveTo(p.cx - hw + 3.5, b, p.cx, b);
    x.quadraticCurveTo(p.cx + hw - 3.5, b, p.cx + hw - 3, b - 4);
    x.bezierCurveTo(p.cx + hw - 2, b - 16, p.cx + hw + 1.5, t + d * 0.45, p.cx + hw, t);
    x.closePath();
  }
  function potInner(x, p) {
    var hw = p.w / 2 - 5.5, t = p.iTop, b = p.iBot, d = b - t;
    x.beginPath();
    x.moveTo(p.cx - hw, t);
    x.bezierCurveTo(p.cx - hw - 1, t + d * 0.45, p.cx - hw + 2.5, b - 14, p.cx - hw + 3.5, b - 3);
    x.quadraticCurveTo(p.cx - hw + 4, b, p.cx, b);
    x.quadraticCurveTo(p.cx + hw - 4, b, p.cx + hw - 3.5, b - 3);
    x.bezierCurveTo(p.cx + hw - 2.5, b - 14, p.cx + hw + 1, t + d * 0.45, p.cx + hw, t);
    x.closePath();
  }

  function surfY(st, i) {
    var p = pots[i];
    return p.iBot - st.pools[i].length * p.uh;
  }

  /* ---------------- 事件消费 ---------------- */
  function toast(s, x, y, size, col, life) {
    parts.push({ t: 'text', s: s, x: x, y: y, life: life, max: life, size: size || 16, col: col || 'rgba(58,53,46,0.62)' });
  }
  function consume(st) {
    var ev = st.events, i;
    for (i = 0; i < ev.length; i++) {
      var e = ev[i];
      if (e.t === 'pour') {
        var P = pots[e.src], Q = pots[e.dst];
        var y0 = surfY(st, e.src) + 6, y1 = surfY(st, e.dst) - 3;
        for (var q = 0; q < e.amount; q++) {
          streams.push({ t: -q * 0.055, dur: 0.30, brush: false, x0: P.cx, y0: y0, x1: Q.cx, y1: y1, grade: e.grade, dst: e.dst });
        }
        anim[e.src].dip += 3.2;
        parts.push({ t: 'ripple', x: P.cx, y: y0, r: 4, R: 22, life: 0.45, max: 0.45, rgb: INK_RGB[e.grade] });
        if (!e.calm) {
          for (var d = 0; d < 3; d++) {
            parts.push({
              t: 'drop', x: P.cx + (Math.random() * 2 - 1) * 9, y: y0 - 3,
              vx: (Math.random() * 2 - 1) * 78, vy: -46 - Math.random() * 54,
              r: 1.5 + Math.random() * 1.5, life: 0.5, max: 0.5, c: e.grade
            });
          }
          toast(e.of - e.amount > 0 ? '留 ' + CN[Math.min(7, e.of - e.amount)] : '晃', P.cx, P.top - 26, 12, 'rgba(58,53,46,0.5)', 0.6);
        }
      } else if (e.t === 'liftMove') {
        var P2 = pots[e.src], Q2 = pots[e.dst];
        streams.push({
          t: 0, dur: 0.34, brush: true,
          x0: P2.cx, y0: surfY(st, e.src) - 6, x1: Q2.cx, y1: surfY(st, e.dst) - 6,
          grade: e.grade, dst: e.dst
        });
        toast('提笔', (P2.cx + Q2.cx) / 2, Math.min(P2.top, Q2.top) - 34, 16, 'rgba(195,66,63,0.85)', 0.9);
      } else if (e.t === 'deny') {
        if (pots[e.p]) {
          anim[e.p].shake = 5;
          var why = e.why === 'grade' ? '墨不同' : e.why === 'full' ? '满了' : e.why === 'noLift' ? '无笔可提' : '空盂';
          toast(why, pots[e.p].cx, pots[e.p].top - 28, 13, 'rgba(58,53,46,0.58)', 0.7);
        }
      } else if (e.t === 'unify') {
        anim[e.p].glow = 1;
        if (stampA[e.grade]) stampA[e.grade].pop = 1;
        toast(GNAME[e.grade], pots[e.p].cx, pots[e.p].top - 32, 20, 'rgba(195,66,63,0.88)', 1.0);
      } else if (e.t === 'relief') {
        toast('墨滞 · 润一笔', 240, 596, 17, 'rgba(195,66,63,0.78)', 1.6);
      } else if (e.t === 'clear') {
        for (var w2 = 0; w2 < 5; w2++) {
          parts.push({ t: 'ripple', x: 240, y: TABLE_Y - 100, r: 12, R: 180 + w2 * 70, life: 1.1 + w2 * 0.18, max: 1.1 + w2 * 0.18, rgb: CINN_RGB });
        }
      }
    }
    ev.length = 0;
  }

  /* ---------------- 各层绘制 ---------------- */
  function drawBreath(x, st) {
    var cx = 240, cy = 178, b = st.breath;
    var cal = g.InkPool.calmness(b);
    var calm = cal > 0.5;
    var r = 27 - Math.cos(b * 6.2832) * 7;
    x.save();
    x.strokeStyle = 'rgba(58,53,46,0.15)'; x.lineWidth = 1;
    x.beginPath(); x.arc(cx, cy, 40, 0, 6.284); x.stroke();
    x.strokeStyle = 'rgba(' + CINN_RGB + ',' + (0.15 + cal * 0.30).toFixed(3) + ')';
    x.lineWidth = 3.4; x.lineCap = 'round';
    x.beginPath(); x.arc(cx, cy, 40, -1.5708 + g.InkPool.CALM_A * 6.2832, -1.5708 + g.InkPool.CALM_C * 6.2832); x.stroke();
    var ang = -1.5708 + b * 6.2832;
    x.beginPath(); x.arc(cx + Math.cos(ang) * 40, cy + Math.sin(ang) * 40, calm ? 4.2 : 3.1, 0, 6.284);
    x.fillStyle = calm ? CINN : 'rgba(58,53,46,0.52)'; x.fill();
    x.strokeStyle = calm ? 'rgba(' + CINN_RGB + ',' + (0.26 + cal * 0.44).toFixed(3) + ')'
      : 'rgba(58,53,46,' + (0.15 + (1 - cal) * 0.17).toFixed(3) + ')';
    x.lineWidth = 1.6;
    x.beginPath(); x.arc(cx, cy, r, 0, 6.284); x.stroke();
    x.font = (calm ? '23px' : '20px') + ' "KaiTi","STKaiti",serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = calm ? 'rgba(' + CINN_RGB + ',' + (0.42 + cal * 0.46).toFixed(3) + ')' : 'rgba(58,53,46,0.32)';
    x.fillText(calm ? '静' : '晃', cx, cy + 1);
    x.restore();
  }

  function drawStamps(x, st, dt) {
    var ng = st.ng, gap = 54, y = 268;
    var x0 = 240 - (ng - 1) * gap / 2;
    var done = [];
    for (var k = 0; k < ng; k++) done[k] = false;
    for (var i = 0; i < st.np; i++) {
      if (st.stamps[i] && st.pools[i].length) done[st.pools[i][0]] = true;
    }
    for (k = 0; k < ng; k++) {
      var s = stampA[k];
      s.v += ((done[k] ? 1 : 0) - s.v) * Math.min(1, dt * 11);
      if (s.v < 0.004) s.v = done[k] ? s.v : 0;
      s.pop *= Math.pow(0.02, dt);
      var sx = x0 + k * gap;
      x.save();
      x.translate(sx, y);
      x.strokeStyle = 'rgba(58,53,46,0.13)'; x.lineWidth = 1;
      x.setLineDash([2.5, 3.5]);
      rr(x, -15, -15, 30, 30, 3); x.stroke();
      x.setLineDash([]);
      x.restore();
      if (s.v > 0.01) {
        x.save();
        x.translate(sx, y);
        x.rotate((k % 2 ? 1 : -1) * 0.05);
        var sc = 0.70 + 0.30 * s.v + s.pop * 0.22;
        x.scale(sc, sc);
        x.globalAlpha = Math.min(1, s.v * 1.25);
        x.strokeStyle = 'rgba(' + CINN_RGB + ',0.85)'; x.lineWidth = 1.8;
        rr(x, -14, -14, 28, 28, 3); x.stroke();
        x.fillStyle = 'rgba(' + CINN_RGB + ',0.88)';
        x.font = '17px "KaiTi","STKaiti",serif';
        x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText(GNAME[k], 0, 1);
        x.restore();
      }
    }
  }

  function drawPot(x, st, i, b) {
    var p = pots[i], a = anim[i];
    var col = st.pools[i];
    var cal = g.InkPool.calmness(b);
    var done = g.InkPool.isDone(st, i);
    var liftY = (st.sel === i) ? -9 : 0;
    var sx = a.shake > 0.05 ? Math.sin(tAll * 46) * a.shake : 0;

    x.save();
    x.translate(sx, liftY);

    x.fillStyle = 'rgba(58,53,46,0.13)';
    x.beginPath(); x.ellipse(p.cx, p.bot + 6, p.w * 0.52, 5.5, 0, 0, 6.284); x.fill();

    x.save(); potOuter(x, p); x.fillStyle = 'rgba(246,240,229,0.55)'; x.fill(); x.restore();

    x.save();
    potInner(x, p); x.clip();
    x.fillStyle = 'rgba(250,246,237,0.94)';
    x.fillRect(p.x, p.iTop - 6, p.w, p.iBot - p.iTop + 12);

    var surf = done ? 0 : -Math.cos(b * 6.2832) * 3.4 + a.dip;
    if (col.length >= st.cap && surf < 0) surf = 0;
    for (var k = 0; k < col.length; k++) {
      var y2 = p.iBot - k * p.uh;
      var y1 = y2 - p.uh;
      if (k === col.length - 1) y1 += surf;
      x.drawImage(sprites[col[k]], p.ix - 2, y1 - 0.8, p.iw + 4, (y2 - y1) + 1.6);
      if (k > 0 && col[k] !== col[k - 1]) {
        x.strokeStyle = 'rgba(24,20,14,0.30)'; x.lineWidth = 1;
        x.beginPath(); x.moveTo(p.ix - 2, y2 + 0.5); x.lineTo(p.ix + p.iw + 2, y2 + 0.5); x.stroke();
      }
    }
    if (col.length) {
      var ty = p.iBot - (col.length - 1) * p.uh - p.uh + surf;
      var amp = done ? 0.35 : (1 - cal) * 2.6 + 0.45;
      var px;
      x.beginPath();
      x.moveTo(p.ix - 2, ty);
      for (px = p.ix - 2; px <= p.ix + p.iw + 2; px += 4) x.lineTo(px, ty + Math.sin(px * 0.28 + tAll * 2.6 + i * 1.7) * amp);
      x.lineTo(p.ix + p.iw + 2, ty + 8); x.lineTo(p.ix - 2, ty + 8); x.closePath();
      x.fillStyle = INK_HI[col[col.length - 1]]; x.fill();
      x.beginPath();
      x.moveTo(p.ix - 2, ty);
      for (px = p.ix - 2; px <= p.ix + p.iw + 2; px += 4) x.lineTo(px, ty + Math.sin(px * 0.28 + tAll * 2.6 + i * 1.7) * amp);
      x.strokeStyle = 'rgba(255,253,246,' + (done ? 0.44 : (0.20 + cal * 0.26).toFixed(3)) + ')';
      x.lineWidth = 1.2; x.stroke();
    }
    x.restore();

    x.save();
    potOuter(x, p);
    x.strokeStyle = st.sel === i ? CINN : 'rgba(58,53,46,0.62)';
    x.lineWidth = st.sel === i ? 2.1 : 1.5;
    x.stroke();
    x.restore();

    x.save();
    x.beginPath(); x.ellipse(p.cx, p.top, p.w / 2, 5.2, 0, 0, 6.284);
    x.fillStyle = 'rgba(247,242,232,0.96)'; x.fill();
    x.strokeStyle = st.sel === i ? CINN : 'rgba(58,53,46,0.66)';
    x.lineWidth = st.sel === i ? 2.1 : 1.4; x.stroke();
    x.restore();

    if (a.glow > 0.01) {
      x.save();
      x.strokeStyle = 'rgba(' + CINN_RGB + ',' + (a.glow * 0.5).toFixed(3) + ')';
      x.lineWidth = 2 + a.glow * 3;
      potOuter(x, p); x.stroke();
      x.restore();
    }
    if (done) {
      x.save();
      x.strokeStyle = 'rgba(' + CINN_RGB + ',0.20)'; x.lineWidth = 1;
      x.beginPath(); x.ellipse(p.cx, p.top, p.w / 2 - 3, 3.4, 0, 0, 6.284); x.stroke();
      x.restore();
    }
    if (st.cur === i && st.sel !== i) {
      x.save();
      x.strokeStyle = 'rgba(58,53,46,0.32)'; x.lineWidth = 1.4;
      x.setLineDash([3, 4]);
      x.beginPath(); x.ellipse(p.cx, p.bot + 14, p.w * 0.40, 3.6, 0, 0, 6.284); x.stroke();
      x.restore();
    }
    x.restore();
  }

  function drawSelHint(x, st) {
    if (st.sel < 0) return;
    var p = pots[st.sel];
    var n = g.InkPool.topRun(st.pools[st.sel]);
    var calm = g.InkPool.isCalm(st);
    var txt = calm ? '整注 ' + CN[Math.min(7, n)] : '半注 ' + CN[Math.min(7, Math.max(1, Math.ceil(n / 2)))];
    x.save();
    x.font = '12.5px "KaiTi","STKaiti",serif';
    x.textAlign = 'center'; x.textBaseline = 'bottom';
    x.fillStyle = calm ? CINN : 'rgba(58,53,46,0.6)';
    x.fillText(txt, p.cx, p.top - 13);
    x.restore();
  }

  function drawStreams(x, dt) {
    for (var i = streams.length - 1; i >= 0; i--) {
      var s = streams[i];
      s.t += dt;
      if (s.t < 0) continue;
      var u = s.t / s.dur; if (u > 1) u = 1;
      var e = u * u * (3 - 2 * u);
      var px = s.x0 + (s.x1 - s.x0) * e;
      var py = s.y0 + (s.y1 - s.y0) * e;
      if (s.brush) {
        x.save();
        x.strokeStyle = 'rgba(' + CINN_RGB + ',' + (0.45 * (1 - u * 0.5)).toFixed(3) + ')';
        x.lineWidth = 4.2 * (1 - u * 0.55) + 0.6; x.lineCap = 'round';
        x.beginPath();
        x.moveTo(s.x0, s.y0);
        x.quadraticCurveTo((s.x0 + s.x1) / 2, Math.min(s.y0, s.y1) - 52, px, py - Math.sin(e * 3.1416) * 46);
        x.stroke();
        x.fillStyle = INK[s.grade];
        x.beginPath(); x.arc(px, py - Math.sin(e * 3.1416) * 46, 5, 0, 6.284); x.fill();
        x.restore();
      } else {
        py -= Math.sin(e * 3.1416) * 34;
        x.save();
        x.fillStyle = INK[s.grade];
        x.beginPath(); x.ellipse(px, py, 5.0, 6.4 - Math.cos(e * 3.1416) * 1.3, 0, 0, 6.284); x.fill();
        x.restore();
      }
      if (u >= 1) {
        parts.push({ t: 'ripple', x: s.x1, y: s.y1, r: 3, R: 20, life: 0.42, max: 0.42, rgb: INK_RGB[s.grade] });
        if (anim[s.dst]) anim[s.dst].dip += 5.5;
        streams.splice(i, 1);
      }
    }
  }

  function drawParts(x, dt) {
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      var u = 1 - p.life / p.max;
      x.save();
      if (p.t === 'ripple') {
        x.strokeStyle = 'rgba(' + p.rgb + ',' + ((1 - u) * 0.5).toFixed(3) + ')';
        x.lineWidth = 1.6 * (1 - u) + 0.4;
        var rr2 = p.r + (p.R - p.r) * u;
        x.beginPath(); x.ellipse(p.x, p.y, rr2, rr2 * 0.36, 0, 0, 6.284); x.stroke();
      } else if (p.t === 'drop') {
        p.vy += 430 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        x.globalAlpha = Math.min(1, p.life / p.max * 1.7);
        x.fillStyle = INK[p.c];
        x.beginPath(); x.arc(p.x, p.y, p.r, 0, 6.284); x.fill();
      } else {
        x.globalAlpha = Math.min(1, p.life / p.max * 1.6);
        x.font = (p.size || 16) + 'px "KaiTi","STKaiti",serif';
        x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillStyle = p.col;
        x.fillText(p.s, p.x, p.y - u * 26);
      }
      x.restore();
    }
  }

  /* ---------------- API ---------------- */
  function init(canvas, effv) {
    cv = canvas; ctx = cv.getContext('2d');
    eff = effv || Math.min(3, (window.devicePixelRatio || 1));
    buildBG();
    return ctx;
  }
  function setEff(effv) {
    if (Math.abs(effv - eff) < 0.01) return;
    eff = effv; buildBG();
  }
  function setLevel(st) {
    layout(st);
    anim = [];
    for (var i = 0; i < st.np; i++) anim.push({ dip: 0, dipV: 0, shake: 0, glow: 0 });
    stampA = [];
    for (var k = 0; k < st.ng; k++) stampA.push({ v: 0, pop: 0 });
    parts.length = 0; streams.length = 0;
  }
  function draw(st, dt) {
    if (!ctx) return;
    if (dt > 0.05) dt = 0.05;
    if (dt < 0.0005) dt = 0.0005;
    tAll += dt;
    if (!pots.length || pots.length !== st.np) setLevel(st);
    if (anim.length !== st.np) setLevel(st);
    consume(st);

    var i, a;
    for (i = 0; i < anim.length; i++) {
      a = anim[i];
      a.dipV += (-240 * a.dip - 19 * a.dipV) * dt;
      a.dip += a.dipV * dt;
      if (a.dip > 14) { a.dip = 14; a.dipV = 0; }
      if (a.dip < -14) { a.dip = -14; a.dipV = 0; }
      a.shake *= Math.pow(0.0015, dt);
      a.glow *= Math.pow(0.22, dt);
    }

    ctx.setTransform(eff, 0, 0, eff, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(bg, 0, 0, W, H);
    drawBreath(ctx, st);
    drawStamps(ctx, st, dt);
    for (i = 0; i < st.np; i++) drawPot(ctx, st, i, st.breath);
    drawStreams(ctx, dt);
    drawParts(ctx, dt);
    drawSelHint(ctx, st);
  }
  function hitTest(st, mx, my) {
    for (var i = 0; i < pots.length; i++) {
      var p = pots[i];
      var pad = 10;
      if (mx >= p.x - pad && mx <= p.x + p.w + pad && my >= p.top - 22 && my <= p.bot + 18) return i;
    }
    return -1;
  }

  g.InkRender = {
    W: W, H: H, TABLE_Y: TABLE_Y,
    init: init, setEff: setEff, setLevel: setLevel,
    draw: draw, hitTest: hitTest,
    pots: function () { return pots; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
