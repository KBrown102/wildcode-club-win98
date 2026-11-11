/* ============================================================
   285-gatherlight / render.js
   《引灯 · 洄游夜》—— 渲染层：只读状态，不改状态
   莫奈夜池（深海版印象派）：光是主角、点彩、无硬边
   ============================================================ */
(function (g) {
  'use strict';

  var W = 480, H = 900;
  var SHOP_X = 240, SHOP_Y = 796;

  // 配色 —— 夜池版莫奈：深海墨蓝 + 冷光生物 + 店里唯一的暖源
  var C = {
    deep0: '#071522', deep1: '#0B1D2E', deep2: '#16385C',
    reef: '#08131F', reefLit: '#26414F', reefMemo: 'rgba(150,182,204,0.085)',
    warm: '#F2B880', warmHot: '#F5D08A', warmCore: '#FFE9BE',
    wood: '#4A3626', woodTop: '#8C6A4A', woodLit: '#B98A56',
    lamp: '#7FD8C8', dart: '#9B8CD8', crab: '#EAF0F2', fry: '#A8E6D0',
    text: '#EAF0F2'
  };

  var SC = 1;                 // 设备像素比 × 舞台缩放
  var cvBg = null, cvBgCtx = null;      // 背景 + 点彩（静态，一次烘焙）
  var cvPt = null, cvPtCtx = null;      // 点彩层（缓慢漂移）
  var cvL = null, cvLx = null;          // 光层（半分辨率）
  var cvM = null, cvMx = null;          // 记忆余温层（1/3 分辨率）
  var LW = 240, LH = 450, MW = 160, MH = 300;
  var sprConeW = null, sprConeF = null, sprGlow = {}, sprShopGlow = null;
  var REEF_SHAPES = [];

  function mk(w, h) {
    var c = (typeof document !== 'undefined') ? document.createElement('canvas') : null;
    if (!c) return null;
    c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
    return c;
  }
  function px(v) { return Math.max(1, Math.round(v * SC)); }

  // ---------- 确定性噪声（点彩用） ----------
  function rnd32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // ---------- 精灵：扇形光锥 ----------
  // 用多层同心扇形叠加出「横向也是软的」光雾，避免硬边（莫奈：边缘被光晕化）
  function buildCone(halfDeg, len, hot) {
    var half = halfDeg * Math.PI / 180;
    var w = Math.ceil(len * Math.sin(half) * 2) + 4;
    var h = Math.ceil(len) + 4;
    var c = mk(w * SC, h * SC); if (!c) return null;
    var x = c.getContext('2d');
    x.setTransform(SC, 0, 0, SC, 0, 0);
    var ox = w / 2, oy = h - 2;      // 光源在底部中央
    var layers = [[1.00, 0.10], [0.86, 0.13], [0.70, 0.16], [0.52, 0.20], [0.30, 0.26]];
    for (var i = 0; i < layers.length; i++) {
      var k = layers[i][0], a = layers[i][1];
      var hh = half * k;
      var g1 = x.createRadialGradient(ox, oy, 4, ox, oy, len);
      g1.addColorStop(0.00, 'rgba(255,238,205,' + (a * 1.35).toFixed(3) + ')');
      g1.addColorStop(0.10, 'rgba(' + (hot ? '245,208,138' : '242,184,128') + ',' + a.toFixed(3) + ')');
      g1.addColorStop(0.42, 'rgba(242,184,128,' + (a * 0.52).toFixed(3) + ')');
      g1.addColorStop(0.78, 'rgba(226,160,110,' + (a * 0.18).toFixed(3) + ')');
      g1.addColorStop(1.00, 'rgba(226,160,110,0)');
      x.fillStyle = g1;
      x.beginPath();
      x.moveTo(ox, oy);
      x.arc(ox, oy, len, -Math.PI / 2 - hh, -Math.PI / 2 + hh);
      x.closePath();
      x.fill();
    }
    return { cv: c, w: w, h: h, ox: ox, oy: oy };
  }

  // ---------- 精灵：径向光晕（假 bloom） ----------
  function buildGlow(r, rgb, a0) {
    var c = mk(r * 2 * SC, r * 2 * SC); if (!c) return null;
    var x = c.getContext('2d');
    x.setTransform(SC, 0, 0, SC, 0, 0);
    var g1 = x.createRadialGradient(r, r, 0, r, r, r);
    g1.addColorStop(0.00, 'rgba(' + rgb + ',' + a0 + ')');
    g1.addColorStop(0.22, 'rgba(' + rgb + ',' + (a0 * 0.42).toFixed(3) + ')');
    g1.addColorStop(0.55, 'rgba(' + rgb + ',' + (a0 * 0.12).toFixed(3) + ')');
    g1.addColorStop(1.00, 'rgba(' + rgb + ',0)');
    x.fillStyle = g1;
    x.beginPath(); x.arc(r, r, r, 0, 6.2832); x.fill();
    return { cv: c, r: r };
  }

  // ---------- 背景：渐变 + 点彩（一次烘焙） ----------
  function buildBg() {
    cvBg = mk(W * SC, H * SC); if (!cvBg) return;
    cvBgCtx = cvBg.getContext('2d');
    cvBgCtx.setTransform(SC, 0, 0, SC, 0, 0);
    var g1 = cvBgCtx.createLinearGradient(0, 0, 0, H);
    g1.addColorStop(0.00, C.deep0);
    g1.addColorStop(0.20, C.deep1);
    g1.addColorStop(0.72, '#123350');
    g1.addColorStop(1.00, C.deep2);
    cvBgCtx.fillStyle = g1;
    cvBgCtx.fillRect(0, 0, W, H);
    // 底部店里透上来的暖雾
    var g2 = cvBgCtx.createRadialGradient(SHOP_X, SHOP_Y, 10, SHOP_X, SHOP_Y, 360);
    g2.addColorStop(0, 'rgba(196,132,66,0.20)');
    g2.addColorStop(0.4, 'rgba(150,104,60,0.07)');
    g2.addColorStop(1, 'rgba(120,90,60,0)');
    cvBgCtx.fillStyle = g2;
    cvBgCtx.fillRect(0, 400, W, H - 400);
    // 点彩直接烘焙进背景 —— 每帧不再重画两张全屏（移动端掉帧的元凶）
    buildPointillism(cvBgCtx);
  }

  // 莫奈的点彩：颜色靠并置的纯色点块，不勾轮廓
  function buildPointillism(g) {
    var rnd = rnd32(20260905);
    var cols = ['127,216,200', '155,140,216', '234,240,242', '120,168,204'];
    var i, n = 300;
    for (i = 0; i < n; i++) {
      var x = rnd() * W, y = rnd() * H;
      var r = 1.1 + rnd() * 3.6;
      var c = cols[(rnd() * cols.length) | 0];
      var a = (0.032 + rnd() * 0.052) * (0.32 + 0.68 * (y / H));  // 越深越稀
      g.fillStyle = 'rgba(' + c + ',' + a.toFixed(3) + ')';
      g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
    }
  }

  // 海雪：少量、每帧漂移的浮游微粒（比整屏点彩便宜两个数量级）
  var MOTES = [];
  function buildMotes() {
    MOTES = [];
    var rnd = rnd32(777);
    for (var i = 0; i < 38; i++) {
      MOTES.push({
        x: rnd() * W, y: rnd() * H,
        r: 0.9 + rnd() * 2.1,
        vx: (rnd() - 0.5) * 5, vy: -3 - rnd() * 7,
        a: 0.10 + rnd() * 0.20, ph: rnd() * 6.28
      });
    }
  }

  // ---------- 礁石轮廓（一次生成，形状不规则但确定） ----------
  function buildReefs(st) {
    REEF_SHAPES = [];
    for (var i = 0; i < st.reefs.length; i++) {
      var r = st.reefs[i];
      var rnd = rnd32(((r.x * 7919 + r.y * 104729) | 0) || 7);
      var pts = [], n = 11, k;
      for (k = 0; k < n; k++) {
        var a = k / n * 6.2832;
        var rr = r.r * (0.82 + rnd() * 0.30);
        pts.push({ a: a, r: rr });
      }
      REEF_SHAPES.push(pts);
    }
  }

  function setDPR(eff) {
    var s = Math.min(Math.max(eff, 1), 2.4);
    if (Math.abs(s - SC) < 0.02 && cvBg) return;
    SC = s;
    cvBg = null; cvPt = null;
    cvL = mk(LW * SC, LH * SC); cvLx = cvL ? cvL.getContext('2d') : null;
    cvM = mk(MW, MH); cvMx = cvM ? cvM.getContext('2d') : null;
    sprConeW = buildCone(21, 470, false);
    sprConeF = buildCone(10.5, 600, true);
    sprGlow = {
      lamp: buildGlow(26, '127,216,200', 0.55),
      dart: buildGlow(24, '155,140,216', 0.55),
      crab: buildGlow(32, '234,240,242', 0.50),
      fry: buildGlow(18, '168,230,208', 0.55),
      warm: buildGlow(70, '245,200,122', 0.55)
    };
    sprShopGlow = buildGlow(210, '245,196,120', 0.42);
    buildBg();
    buildMotes();
  }

  function reset(st) {
    if (!cvBg) setDPR(1);
    buildReefs(st);
    if (cvMx) { cvMx.setTransform(1, 0, 0, 1, 0, 0); cvMx.clearRect(0, 0, MW, MH); }
    parts.length = 0; texts.length = 0; rings.length = 0;
    ptT = 0;
  }

  // ---------- 粒子 / 飘字 ----------
  var parts = [], texts = [], rings = [], ptT = 0;

  function burst(x, y, n, spd, rgb, life, size) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 6.2832, v = spd * (0.35 + Math.random() * 0.85);
      parts.push({
        x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: life * (0.6 + Math.random() * 0.6), t: 0, rgb: rgb,
        r: size * (0.5 + Math.random())
      });
    }
    if (parts.length > 260) parts.splice(0, parts.length - 260);
  }
  function ring(x, y, r0, r1, rgb, life) {
    rings.push({ x: x, y: y, r0: r0, r1: r1, rgb: rgb, life: life, t: 0 });
    if (rings.length > 18) rings.shift();
  }
  function fly(x, y, s, rgb, big) {
    texts.push({ x: x, y: y, s: s, rgb: rgb, life: big ? 1.5 : 1.1, t: 0, big: !!big });
    if (texts.length > 14) texts.shift();
  }

  // ---------- 事件 → 视觉 ----------
  function consume(st) {
    for (var i = 0; i < st.events.length; i++) {
      var e = st.events[i];
      if (e.type === 'deliver') {
        burst(e.x, e.y, 16, 132, '245,208,138', 0.85, 3.2);
        ring(e.x, e.y, 8, 58, '245,208,138', 0.7);
        fly(e.x, e.y - 20, '+' + e.gain, '245,208,138', false);
        if (e.combo >= 2) fly(e.x, e.y - 44, '×' + e.combo + ' 连', '245,208,138', true);
      } else if (e.type === 'bump') {
        if (e.cost > 0) {
          // 聚光收网撞礁 —— 这才扣你的光能，飘个红字让你知道付了多少
          burst(e.x, e.y, 9, 96, '246,150,120', 0.55, 2.1);
          fly(e.x, e.y - 16, '-' + e.cost, '246,150,120', false);
        } else {
          burst(e.x, e.y, 5, 74, '150,172,190', 0.42, 1.8);
        }
      } else if (e.type === 'leave') {
        burst(e.x, e.y, 6, 46, '110,140,164', 1.0, 2.2);
      } else if (e.type === 'perfect') {
        fly(SHOP_X, SHOP_Y - 150, '这一波 · 一个没落下 +' + e.bonus, '245,208,138', true);
        ring(SHOP_X, SHOP_Y, 40, 240, '245,208,138', 1.1);
      } else if (e.type === 'exhaust') {
        ring(SHOP_X, SHOP_Y, 30, 120, '120,150,180', 0.6);
      } else if (e.type === 'wave') {
        fly(SHOP_X, 300, '第 ' + e.wave + ' 波 · ' + e.total + ' 位', '234,240,242', true);
      }
    }
    st.events.length = 0;
  }

  // ---------- 绘制：光层（含礁石阴影 + 记忆余温） ----------
  function drawLight(st) {
    if (!cvLx) return;
    var x = cvLx;
    x.setTransform(SC, 0, 0, SC, 0, 0);
    x.clearRect(0, 0, LW, LH);

    var dim = st.restT > 0 ? 0.34 : Math.max(0.30, Math.min(1, st.energy / 100 * 0.55 + 0.45));

    // ① 先铺记忆余温（光扫过水面留下的暖痕）—— 这样全屏合成只剩一次
    if (cvM) {
      x.globalCompositeOperation = 'lighter';
      x.globalAlpha = 0.62;
      x.drawImage(cvM, 0, 0, LW, LH);
      x.globalAlpha = 1;
    }

    // ② 此刻的灯锥
    var spr = st.focus ? sprConeF : sprConeW;
    if (spr) {
      x.save();
      x.translate(SHOP_X * LW / W, SHOP_Y * LH / H);
      x.rotate(st.aim + Math.PI / 2);
      x.globalAlpha = dim * (st.focus ? 1.0 : 0.78);
      x.globalCompositeOperation = 'lighter';
      var dw = spr.w * (LW / W), dh = spr.h * (LH / H);
      x.drawImage(spr.cv, -spr.ox * (LW / W), -spr.oy * (LH / H), dw, dh);
      x.restore();
    }

    // ③ 店里那盏灯（暖光也走光层：半分辨率，比全屏画便宜 4 倍）
    var hr = G_homeR(st);
    var gx = SHOP_X * LW / W, gy = SHOP_Y * LH / H;
    x.globalCompositeOperation = 'lighter';
    if (sprShopGlow) {
      var gr = 210 * (LH / H);
      x.globalAlpha = 0.55 * dim;
      x.drawImage(sprShopGlow.cv, gx - gr, gy - gr, gr * 2, gr * 2);
    }
    var gg = x.createRadialGradient(gx, gy, 2, gx, gy, hr * 1.55 * (LH / H));
    gg.addColorStop(0, 'rgba(255,240,206,' + (0.52 * dim + 0.18).toFixed(3) + ')');
    gg.addColorStop(0.45, 'rgba(245,200,122,' + (0.20 * dim).toFixed(3) + ')');
    gg.addColorStop(1, 'rgba(245,200,122,0)');
    x.globalAlpha = 1;
    x.fillStyle = gg;
    x.beginPath(); x.arc(gx, gy, hr * 1.55 * (LH / H), 0, 6.2832); x.fill();

    // 客人的自发光（磷火）—— 用预渲染精灵，避免每帧新建渐变
    for (var i = 0; i < st.guests.length; i++) {
      var gs = st.guests[i];
      var sp = sprGlow[gs.kind];
      if (!sp) continue;
      var br = (gs.lit ? 0.62 : 0.20) * (0.78 + 0.22 * Math.sin(st.t * 2.4 + gs.ph));
      var rr = sp.r * (gs.r / 9) * 1.7 * (LH / H);
      var pxx = gs.x * LW / W, pyy = gs.y * LH / H;
      x.globalCompositeOperation = 'lighter';
      x.globalAlpha = br;
      x.drawImage(sp.cv, pxx - rr, pyy - rr, rr * 2, rr * 2);
    }
    x.globalAlpha = 1;

    // 礁石投影：从店看出去，被礁石挡住的那条楔子是真的没有光
    x.globalCompositeOperation = 'destination-out';
    for (var k = 0; k < st.reefs.length; k++) {
      var rf = st.reefs[k];
      var ang = Math.atan2(rf.y - SHOP_Y, rf.x - SHOP_X);
      var dd = Math.hypot(rf.x - SHOP_X, rf.y - SHOP_Y);
      if (dd > 700) continue;
      var da = ang - st.aim;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      var spread = Math.asin(Math.min(1, rf.r / dd)) + 0.06;
      var coneHalf = (st.focus ? 10.5 : 21) * Math.PI / 180 + 0.06;
      if (Math.abs(da) > spread + coneHalf) continue;      // 不在光锥里，不必算
      var near = (dd - rf.r) * (LH / H), far = 720 * (LH / H);
      for (var p = 0; p < 2; p++) {
        var sw = spread * (p === 0 ? 1.0 : 0.62);
        x.globalAlpha = p === 0 ? 0.55 : 0.42;
        x.beginPath();
        x.moveTo(gx + Math.cos(ang - sw) * near, gy + Math.sin(ang - sw) * near);
        x.lineTo(gx + Math.cos(ang - sw) * far, gy + Math.sin(ang - sw) * far);
        x.lineTo(gx + Math.cos(ang + sw) * far, gy + Math.sin(ang + sw) * far);
        x.lineTo(gx + Math.cos(ang + sw) * near, gy + Math.sin(ang + sw) * near);
        x.closePath();
        x.fill();
      }
    }
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'source-over';
  }

  function G_homeR(st) { return g.Gather ? g.Gather.homeR(st) : 62; }

  // ---------- 记忆余温层（自己画灯锥，不回读光层 → 不会自我增亮） ----------
  function drawMem(st, dt) {
    if (!cvMx) return;
    var m = cvMx;
    var k = MW / W;
    m.setTransform(1, 0, 0, 1, 0, 0);
    m.globalCompositeOperation = 'destination-out';
    m.fillStyle = 'rgba(0,0,0,0.055)';
    m.fillRect(0, 0, MW, MH);

    var dim = st.restT > 0 ? 0.34 : 1;
    var spr = st.focus ? sprConeF : sprConeW;
    m.globalCompositeOperation = 'lighter';
    if (spr) {
      m.save();
      m.globalAlpha = 0.30 * dim;
      m.translate(SHOP_X * k, SHOP_Y * k);
      m.rotate(st.aim + Math.PI / 2);
      m.drawImage(spr.cv, -spr.ox * k, -spr.oy * k, spr.w * k, spr.h * k);
      m.restore();
    }
    // 客人的磷火也在水面留痕
    for (var i = 0; i < st.guests.length; i++) {
      var gs = st.guests[i];
      var rgb = gs.kind === 'lamp' ? '127,216,200' : gs.kind === 'dart' ? '155,140,216'
        : gs.kind === 'crab' ? '234,240,242' : '168,230,208';
      m.globalAlpha = gs.lit ? 0.16 : 0.07;
      m.fillStyle = 'rgb(' + rgb + ')';
      m.beginPath();
      m.arc(gs.x * k, gs.y * k, Math.max(1.2, gs.r * k * 1.6), 0, 6.2832);
      m.fill();
    }
    m.globalAlpha = 1;
    m.globalCompositeOperation = 'source-over';
  }

  // ---------- 礁石 ----------
  function drawReefs(ctx, st) {
    for (var i = 0; i < st.reefs.length; i++) {
      var rf = st.reefs[i], pts = REEF_SHAPES[i];
      if (!pts) continue;
      var k;
      // 记忆海图：照过的礁石永远留一层极淡的刻痕
      if (rf.lit) {
        ctx.beginPath();
        for (k = 0; k < pts.length; k++) {
          var a = pts[k].a, r = pts[k].r + 1.6;
          var xx = rf.x + Math.cos(a) * r, yy = rf.y + Math.sin(a) * r;
          if (k === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
        }
        ctx.closePath();
        ctx.fillStyle = C.reefMemo;
        ctx.fill();
        ctx.strokeStyle = 'rgba(150,182,204,0.16)';
        ctx.lineWidth = 1.1;
        ctx.stroke();
      }
      // 本体：深海里的暗影
      ctx.beginPath();
      for (k = 0; k < pts.length; k++) {
        var a2 = pts[k].a, r2 = pts[k].r;
        var x2 = rf.x + Math.cos(a2) * r2, y2 = rf.y + Math.sin(a2) * r2;
        if (k === 0) ctx.moveTo(x2, y2); else ctx.lineTo(x2, y2);
      }
      ctx.closePath();
      ctx.fillStyle = rf.lit ? C.reefLit : C.reef;
      ctx.fill();
    }
  }

  // ---------- 客人 ----------
  function drawGuests(ctx, st) {
    for (var i = 0; i < st.guests.length; i++) {
      var gs = st.guests[i];
      var wob = Math.sin(st.t * 3.4 + gs.ph) * 0.30;
      var dir = Math.atan2(gs.vy, gs.vx);
      var vis = gs.lit ? 1 : 0.42;
      var leaving = gs.leaving;

      ctx.save();
      ctx.translate(gs.x, gs.y);
      ctx.rotate(dir + (leaving ? Math.PI : 0));
      ctx.globalAlpha = vis * (leaving ? 0.7 : 1);

      var body = gs.kind === 'lamp' ? 'rgba(127,216,200,'
        : gs.kind === 'dart' ? 'rgba(155,140,216,'
          : gs.kind === 'crab' ? 'rgba(234,240,242,' : 'rgba(168,230,208,';

      // 尾
      ctx.beginPath();
      ctx.moveTo(-gs.r * 0.9, 0);
      ctx.lineTo(-gs.r * 2.1, -gs.r * 0.75 + wob * gs.r);
      ctx.lineTo(-gs.r * 2.1, gs.r * 0.75 + wob * gs.r);
      ctx.closePath();
      ctx.fillStyle = body + (0.30 * vis).toFixed(3) + ')';
      ctx.fill();

      // 身（莫奈：不勾线，靠色块）
      ctx.beginPath();
      if (gs.kind === 'crab') {
        ctx.ellipse(0, 0, gs.r * 1.15, gs.r * 0.86, 0, 0, 6.2832);
      } else {
        ctx.ellipse(0, 0, gs.r * 1.45, gs.r * 0.78, 0, 0, 6.2832);
      }
      ctx.fillStyle = body + (0.80 * vis).toFixed(3) + ')';
      ctx.fill();

      // 背上的一小片亮鳞
      ctx.beginPath();
      ctx.ellipse(gs.r * 0.15, -gs.r * 0.22, gs.r * 0.62, gs.r * 0.30, 0, 0, 6.2832);
      ctx.fillStyle = 'rgba(255,255,255,' + (0.34 * vis).toFixed(3) + ')';
      ctx.fill();

      // 眼（那一点磷火）
      ctx.beginPath();
      ctx.arc(gs.r * 0.82, -gs.r * 0.12, Math.max(1.2, gs.r * 0.20), 0, 6.2832);
      ctx.fillStyle = 'rgba(255,246,214,' + (0.95 * vis).toFixed(3) + ')';
      ctx.fill();

      // 蟹钳
      if (gs.kind === 'crab') {
        ctx.beginPath();
        ctx.moveTo(gs.r * 0.9, -gs.r * 0.5);
        ctx.lineTo(gs.r * 1.7, -gs.r * 1.05);
        ctx.moveTo(gs.r * 0.9, gs.r * 0.5);
        ctx.lineTo(gs.r * 1.7, gs.r * 1.05);
        ctx.strokeStyle = body + (0.70 * vis).toFixed(3) + ')';
        ctx.lineWidth = 2.6; ctx.lineCap = 'round';
        ctx.stroke();
      }
      ctx.restore();

      // 自身的磷光
      var sp = sprGlow[gs.kind];
      if (sp) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = (gs.lit ? 0.62 : 0.20) * (0.8 + 0.2 * Math.sin(st.t * 2.4 + gs.ph));
        var rr = sp.r * (gs.r / 9) * 0.9;
        ctx.drawImage(sp.cv, gs.x - rr, gs.y - rr, rr * 2, rr * 2);
        ctx.restore();
      }

      // 被光卷住：脚下一圈暖色的"被牵引"提示
      if (gs.inBeam && !gs.leaving) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        var pr = gs.r + 9 + Math.sin(st.t * 7 + gs.ph) * 1.6;
        ctx.strokeStyle = 'rgba(245,208,138,0.42)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(gs.x, gs.y, pr, 0, 6.2832); ctx.stroke();
        ctx.restore();
      }
    }
  }

  // ---------- 店 ----------
  function drawShop(ctx, st) {
    var hr = G_homeR(st);

    // 店身：一间矮矮的、亮着灯的房子（暖光已经在光层里铺过了）
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(72, 900);
    ctx.lineTo(72, 836);
    ctx.quadraticCurveTo(240, 764, 408, 836);
    ctx.lineTo(408, 900);
    ctx.closePath();
    ctx.fillStyle = 'rgba(28,20,15,0.94)';
    ctx.fill();

    // 屋檐那道暖边
    ctx.beginPath();
    ctx.moveTo(72, 836);
    ctx.quadraticCurveTo(240, 764, 408, 836);
    ctx.strokeStyle = 'rgba(184,138,86,0.85)';
    ctx.lineWidth = 3.2;
    ctx.stroke();

    // 门洞（就是接人的那个暖光圈）
    ctx.beginPath();
    ctx.arc(SHOP_X, SHOP_Y + 6, hr * 0.52, 0, 6.2832);
    ctx.fillStyle = 'rgba(255,232,182,' + (0.30 + 0.05 * Math.sin(st.t * 2)).toFixed(3) + ')';
    ctx.fill();

    // 檐下挂着的那盏灯
    ctx.beginPath();
    ctx.moveTo(SHOP_X, 776); ctx.lineTo(SHOP_X, 792);
    ctx.strokeStyle = 'rgba(120,92,60,0.9)'; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(SHOP_X, 800, 11, 13, 0, 0, 6.2832);
    ctx.fillStyle = 'rgba(255,226,158,0.92)'; ctx.fill();
    ctx.restore();

    // 坐下的客人剪影：接回一位，店里就多一个
    for (var i = 0; i < st.seats.length; i++) {
      var s = st.seats[i];
      var ring = i < 12 ? 0 : 1, idx = i % 12;
      var rr = ring === 0 ? 92 : 128;
      var ang = ring === 0
        ? (-163 + idx * 13.4) * Math.PI / 180
        : (-166 + idx * 14.6) * Math.PI / 180;
      var sx = SHOP_X + Math.cos(ang) * rr;
      var sy = SHOP_Y + Math.sin(ang) * rr * 0.82;
      var bob = Math.sin(st.t * 1.6 + s.ph) * 1.4;
      var born = Math.min(1, (st.t - s.born) * 2.2);
      ctx.save();
      ctx.globalAlpha = 0.86 * born;
      ctx.translate(sx, sy + bob);
      var col = s.kind === 'lamp' ? '127,216,200' : s.kind === 'dart' ? '155,140,216'
        : s.kind === 'crab' ? '234,240,242' : '168,230,208';
      // 逆光：只有轮廓，暖光从背后透出来
      ctx.beginPath();
      ctx.ellipse(0, 0, 7.5, 5.4, 0, 0, 6.2832);
      ctx.fillStyle = 'rgba(38,26,18,0.92)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(' + col + ',0.55)';
      ctx.lineWidth = 1.3;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(2.6, -1.2, 1.3, 0, 6.2832);
      ctx.fillStyle = 'rgba(255,246,214,0.9)';
      ctx.fill();
      ctx.restore();
    }
  }

  // ---------- 主绘制 ----------
  function draw(ctx, st, dt) {
    if (!cvBg) setDPR(1);
    ptT += dt;

    drawMem(st, dt);
    drawLight(st);

    // 1. 背景（点彩已烘焙进去，1:1 blit）
    ctx.drawImage(cvBg, 0, 0, W, H);

    // 2. 海雪：少量浮游微粒，慢速上升
    ctx.save();
    for (var q = 0; q < MOTES.length; q++) {
      var mo = MOTES[q];
      mo.x += mo.vx * dt; mo.y += mo.vy * dt;
      if (mo.y < -6) { mo.y = H + 6; mo.x = Math.random() * W; }
      if (mo.x < -6) mo.x = W + 6; else if (mo.x > W + 6) mo.x = -6;
      ctx.globalAlpha = mo.a * (0.6 + 0.4 * Math.sin(st.t * 1.4 + mo.ph));
      ctx.fillStyle = '#DCE8EE';
      ctx.beginPath(); ctx.arc(mo.x, mo.y, mo.r, 0, 6.2832); ctx.fill();
    }
    ctx.restore();

    // 3. 光（含记忆余温）—— 整屏只合成这一次
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.92;
    ctx.drawImage(cvL, 0, 0, W, H);
    ctx.restore();

    // 4. 礁石 / 客人 / 店
    drawReefs(ctx, st);
    drawGuests(ctx, st);
    drawShop(ctx, st);

    // 6. 粒子
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.t += dt;
      if (p.t >= p.life) { parts.splice(i, 1); continue; }
      var k = p.t / p.life;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.955; p.vy *= 0.955;
      ctx.globalAlpha = (1 - k) * 0.85;
      ctx.fillStyle = 'rgb(' + p.rgb + ')';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 - k * 0.55), 0, 6.2832); ctx.fill();
    }
    // 扩散环
    for (var r = rings.length - 1; r >= 0; r--) {
      var rg = rings[r];
      rg.t += dt;
      if (rg.t >= rg.life) { rings.splice(r, 1); continue; }
      var k2 = rg.t / rg.life;
      var rad = rg.r0 + (rg.r1 - rg.r0) * (1 - Math.pow(1 - k2, 2));
      ctx.globalAlpha = (1 - k2) * 0.5;
      ctx.strokeStyle = 'rgb(' + rg.rgb + ')';
      ctx.lineWidth = 2.4 * (1 - k2) + 0.6;
      ctx.beginPath(); ctx.arc(rg.x, rg.y, rad, 0, 6.2832); ctx.stroke();
    }
    ctx.restore();

    // 7. 飘字
    ctx.save();
    ctx.textAlign = 'center';
    for (var t = texts.length - 1; t >= 0; t--) {
      var tx = texts[t];
      tx.t += dt;
      if (tx.t >= tx.life) { texts.splice(t, 1); continue; }
      var k3 = tx.t / tx.life;
      ctx.globalAlpha = Math.min(1, (1 - k3) * 2.2);
      ctx.fillStyle = 'rgb(' + tx.rgb + ')';
      ctx.font = (tx.big ? '700 21px ' : '700 17px ') + '"KaiTi","STKaiti","PingFang SC",serif';
      ctx.fillText(tx.s, tx.x, tx.y - k3 * 34);
    }
    ctx.restore();

    // 8. 光能耗尽：整屏轻轻暗一下，提醒你灯在喘气
    if (st.restT > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.30, st.restT * 0.5);
      ctx.fillStyle = '#04080F';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    consume(st);
  }

  g.GatherRender = {
    setDPR: setDPR, reset: reset, draw: draw,
    burst: burst, fly: fly,
    get parts() { return parts; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
