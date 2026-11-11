/* 297-sandcat《落沙 · 引猫夜》渲染层（Canvas 2D 画世界，UI 交给 DOM）
 * 依赖：js/game.js（只读 state），被 js/ui.js 驱动
 */
(function (root) {
  'use strict';
  var R = { ctx: null, cv: null, dpr: 1, W: 840, H: 550, pad: 46 };

  var C = {
    sky0: '#0E1219', sky1: '#1B2231', sky2: '#2A3444',
    far: '#1B2431', far2: '#232D3D',
    bld: '#2C3444', bldTop: '#404C61', bldEdge: '#222938',
    winOff: '#1A212C', winOn: '#E9B45A',
    sand: '#D8C296', sandTop: '#F7EFD9', sandMid: '#E4D3A9', sandDeep: '#AE9469', sandEdge: 'rgba(88,70,44,.34)',
    street: '#2A3342', streetTop: '#4A5872', streetBody: '#333D4E',
    cat: '#D9713C', cat2: '#B4542A', catDark: '#3A2418',
    lampOn: '#FFCE7A', lampOff: '#3D4759',
    home: '#C98A4B', homeGlow: 'rgba(240,166,75,',
    cur: 'rgba(255,214,140,'
  };

  var bg = null, bgc = null, fog = null, glow = null, sandPat = null, star = null;
  var W = 840, H = 504, CELL = 28, PAD = 46, FULLH = 550;

  function mk(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
    return c;
  }
  function rnd(a) { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; }

  /* ---------- 沙粒纹理 ---------- */
  function bakeSand() {
    var s = 18, c = mk(s, s), x = c.getContext('2d');
    x.clearRect(0, 0, s, s);
    var a = 12345;
    for (var i = 0; i < 26; i++) {
      a = (a * 1103515245 + 12345) & 0x7fffffff;
      var px = (a / 0x7fffffff) * s;
      a = (a * 1103515245 + 12345) & 0x7fffffff;
      var py = (a / 0x7fffffff) * s;
      a = (a * 1103515245 + 12345) & 0x7fffffff;
      var v = a / 0x7fffffff;
      x.fillStyle = v > 0.5 ? 'rgba(255,246,222,.30)' : 'rgba(112,92,60,.22)';
      var r = 0.7 + v * 1.1;
      x.fillRect(px, py, r, r);
    }
    sandPat = R.ctx.createPattern(c, 'repeat');
  }

  /* ---------- 光斑 ---------- */
  function bakeGlow() {
    var s = 64, c = mk(s, s), x = c.getContext('2d');
    var g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,206,122,.85)');
    g.addColorStop(0.35, 'rgba(255,186,96,.34)');
    g.addColorStop(1, 'rgba(255,170,80,0)');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
    glow = c;
  }
  function bakeStar() {
    var s = 10, c = mk(s, s), x = c.getContext('2d');
    var g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(226,236,255,.95)');
    g.addColorStop(1, 'rgba(190,210,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
    star = c;
  }
  /* 一团无接缝的柔光雾（不再平铺 → 不会出现方块接缝） */
  function bakeFog() {
    var s = 200, c = mk(s, s), x = c.getContext('2d');
    var g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(166,188,220,.20)');
    g.addColorStop(0.45, 'rgba(152,176,212,.085)');
    g.addColorStop(1, 'rgba(148,172,208,0)');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
    fog = c;
  }

  /* ---------- 背景（每关烘一次） ---------- */
  function bake(st) {
    PAD = R.pad;
    W = R.W; FULLH = R.H; H = FULLH - PAD; CELL = st.CELL || 28;
    /* 缓存 sprite 无条件重建（重开一局时 reset 会清空，绝不能假设非空） */
    if (!star) bakeStar();
    if (!glow) bakeGlow();
    if (!fog) bakeFog();
    if (!sandPat) bakeSand();
    bg = mk(W, FULLH); bgc = bg.getContext('2d');
    var x = bgc;
    x.clearRect(0, 0, W, FULLH);

    var g = x.createLinearGradient(0, 0, 0, FULLH);
    g.addColorStop(0, C.sky0); g.addColorStop(0.52, C.sky1); g.addColorStop(1, C.sky2);
    x.fillStyle = g; x.fillRect(0, 0, W, FULLH);

    var seedv = (st.seed || 1) * 7919 + 13;

    /* 星 */
    var a = seedv;
    for (var i = 0; i < 46; i++) {
      a = (a * 1103515245 + 12345) & 0x7fffffff;
      var px = (a / 0x7fffffff) * W;
      a = (a * 1103515245 + 12345) & 0x7fffffff;
      var py = (a / 0x7fffffff) * H * 0.42;
      a = (a * 1103515245 + 12345) & 0x7fffffff;
      var sc = 0.35 + (a / 0x7fffffff) * 0.75;
      x.globalAlpha = 0.35 + (a / 0x7fffffff) * 0.5;
      x.drawImage(star, px - 5 * sc, py - 5 * sc, 10 * sc, 10 * sc);
    }
    x.globalAlpha = 1;

    /* 月 */
    var mx = W * 0.815, my = H * 0.135, mr = 21;
    var mg = x.createRadialGradient(mx, my, 0, mx, my, mr * 3.4);
    mg.addColorStop(0, 'rgba(226,232,246,.30)');
    mg.addColorStop(1, 'rgba(226,232,246,0)');
    x.fillStyle = mg; x.beginPath(); x.arc(mx, my, mr * 3.4, 0, 6.2832); x.fill();
    x.fillStyle = '#E6E9F2'; x.beginPath(); x.arc(mx, my, mr, 0, 6.2832); x.fill();
    x.fillStyle = 'rgba(190,198,216,.55)';
    x.beginPath(); x.arc(mx - 6, my - 5, 3.4, 0, 6.2832); x.fill();
    x.beginPath(); x.arc(mx + 7, my + 4, 4.6, 0, 6.2832); x.fill();
    x.beginPath(); x.arc(mx + 1, my + 11, 2.6, 0, 6.2832); x.fill();

    /* 远景楼群（两层视差感的剪影） */
    var a2 = seedv + 991;
    for (var layer = 0; layer < 2; layer++) {
      var baseY = H - (layer === 0 ? 3.4 : 2.2) * CELL;
      var alpha = layer === 0 ? 0.55 : 0.78;
      x.globalAlpha = alpha;
      x.fillStyle = layer === 0 ? C.far : C.far2;
      var cx = -10;
      while (cx < W + 10) {
        a2 = (a2 * 1103515245 + 12345) & 0x7fffffff;
        var bw = 26 + (a2 / 0x7fffffff) * 62;
        a2 = (a2 * 1103515245 + 12345) & 0x7fffffff;
        var bh = (layer === 0 ? 46 : 30) + (a2 / 0x7fffffff) * (layer === 0 ? 96 : 62);
        x.fillRect(cx, baseY - bh, bw, bh + 8);
        x.fillStyle = 'rgba(233,180,90,.13)';
        for (var wy = baseY - bh + 8; wy < baseY - 8; wy += 11) {
          for (var wx = cx + 6; wx < cx + bw - 6; wx += 10) {
            a2 = (a2 * 1103515245 + 12345) & 0x7fffffff;
            if ((a2 / 0x7fffffff) < 0.34) x.fillRect(wx, wy, 3.4, 4.6);
          }
        }
        x.fillStyle = layer === 0 ? C.far : C.far2;
        cx += bw + 6 + (a2 / 0x7fffffff) * 14;
      }
      x.globalAlpha = 1;
    }

    /* 主体地形剪影 */
    var COL = st.base.length;
    for (var c = 0; c < COL; c++) {
      var h = st.base[c];
      var bx = c * CELL, by = H - h * CELL;
      var isStreet = h <= st.STREET;
      x.fillStyle = isStreet ? C.streetBody : C.bld;
      x.fillRect(bx, by, CELL + 0.6, h * CELL + 2);
      /* 人行道：亮顶面 + 路缘线，一眼区分「地面」与「楼」 */
      x.fillStyle = isStreet ? C.streetTop : C.bldTop;
      x.fillRect(bx, by, CELL + 0.6, isStreet ? 2.4 : 3);
      x.fillStyle = C.bldEdge;
      x.fillRect(bx + CELL - 1, by, 1.2, h * CELL + 2);
      if (isStreet) {
        x.fillStyle = 'rgba(150,172,206,.16)';
        x.fillRect(bx, by + 5, CELL + 0.6, 1);
      }
    }

    /* 街边小物（微极繁） */
    for (var p = 0; p < st.props.length; p++) drawProp(x, st.props[p], st);

    /* 底部人行道带（控制条压在这里，不挡世界） */
    var pg = x.createLinearGradient(0, H, 0, FULLH);
    pg.addColorStop(0, '#202834'); pg.addColorStop(1, '#161C26');
    x.fillStyle = pg; x.fillRect(0, H, W, PAD);
    x.fillStyle = 'rgba(120,140,170,.13)'; x.fillRect(0, H, W, 1.6);
    var a3 = (st.seed || 1) * 31 + 7;
    for (var bx2 = 0; bx2 < W; bx2 += 46) {
      a3 = (a3 * 1103515245 + 12345) & 0x7fffffff;
      x.fillStyle = 'rgba(150,170,200,.055)';
      x.fillRect(bx2 + (a3 / 0x7fffffff) * 12, H + 6, 30, 2);
    }
  }

  function drawProp(x, pr, st) {
    var CELLl = st.CELL || 28;
    var px = pr.c * CELLl + CELLl * 0.5;
    var py = H - pr.r * CELLl;
    x.save();
    x.translate(px, py);
    switch (pr.t) {
      case 0: /* 消防栓 */
        x.fillStyle = '#8E3B30'; x.fillRect(-4, -11, 8, 11);
        x.fillStyle = '#A8483A'; x.fillRect(-4, -11, 8, 3);
        x.fillStyle = '#6E2C24'; x.fillRect(-6, -8, 2, 3); x.fillRect(4, -8, 2, 3);
        break;
      case 1: /* 长椅 */
        x.fillStyle = '#3D4759'; x.fillRect(-11, -5, 22, 3); x.fillRect(-11, -11, 22, 2.6);
        x.fillStyle = '#2B3444'; x.fillRect(-9, -5, 2.4, 5); x.fillRect(6.6, -5, 2.4, 5);
        break;
      case 2: /* 路牌 */
        x.fillStyle = '#3D4759'; x.fillRect(-1.3, -24, 2.6, 24);
        x.fillStyle = '#4E6478'; x.fillRect(-7, -30, 14, 8);
        break;
      case 3: /* 垃圾桶 */
        x.fillStyle = '#37414F'; x.fillRect(-5, -12, 10, 12);
        x.fillStyle = '#48566A'; x.fillRect(-6, -14, 12, 2.6);
        break;
      case 4: /* 野草 */
        x.strokeStyle = '#4A6B4E'; x.lineWidth = 1.4; x.lineCap = 'round';
        for (var g = -2; g <= 2; g++) {
          x.beginPath(); x.moveTo(g * 2.4, 0);
          x.quadraticCurveTo(g * 3.4, -5, g * 4.6 + 1, -9 - (g % 2) * 2);
          x.stroke();
        }
        break;
      case 5: /* 自行车 */
        x.strokeStyle = '#4B5769'; x.lineWidth = 1.5;
        x.beginPath(); x.arc(-5, -4, 4, 0, 6.2832); x.stroke();
        x.beginPath(); x.arc(5, -4, 4, 0, 6.2832); x.stroke();
        x.beginPath(); x.moveTo(-5, -4); x.lineTo(1, -10); x.lineTo(6, -9); x.stroke();
        break;
      case 6: /* 空调外机 / 水箱 */
        x.fillStyle = '#39424F'; x.fillRect(-9, -11, 18, 11);
        x.fillStyle = '#2C3440'; x.fillRect(-9, -11, 18, 2.4);
        x.strokeStyle = '#4C596B'; x.lineWidth = 1;
        x.beginPath(); x.arc(0, -5.5, 3.6, 0, 6.2832); x.stroke();
        break;
    }
    x.restore();
  }

  /* ---------- 猫 ---------- */
  function drawCat(x, cat, t, st, focus) {
    var CELLl = st.CELL || 28;
    var cx = (cat.c + 0.5) * CELLl;
    var cy = H - cat.r * CELLl - 1.5;
    var wob = Math.sin(t * 2.2 + cat.c) * 0.7;
    var step = (cat.state === 'walk') ? Math.sin(t * 16) * 0.9 : 0;
    var breathe = cat.home ? 1 + Math.sin(t * 2.4) * 0.035 : 1;

    x.save();
    x.fillStyle = 'rgba(10,12,18,.34)';
    x.beginPath(); x.ellipse(cx, cy + 1, 10.4, 2.8, 0, 0, 6.2832); x.fill();

    if (cat.home) {
      x.globalAlpha = 0.5 + Math.sin(t * 2.4) * 0.12;
      x.drawImage(glow, cx - 22, cy - 30, 44, 44);
      x.globalAlpha = 1;
      x.fillStyle = C.cat;
      x.beginPath(); x.ellipse(cx, cy - 5 * breathe, 10, 6.4 * breathe, 0, 0, 6.2832); x.fill();
      x.fillStyle = C.cat2;
      x.beginPath(); x.arc(cx + 6 * cat.face, cy - 8.5, 5, 0, 6.2832); x.fill();
      x.strokeStyle = C.catDark; x.lineWidth = 1.1; x.lineCap = 'round';
      x.beginPath(); x.moveTo(cx + 4 * cat.face, cy - 9.5); x.lineTo(cx + 6 * cat.face, cy - 9.5);
      x.moveTo(cx + 7.6 * cat.face, cy - 9.5); x.lineTo(cx + 9.4 * cat.face, cy - 9.5); x.stroke();
      x.restore();
      return;
    }

    var f = cat.face;
    var wag = cat.state === 'wait' ? Math.sin(t * 9) * 0.85 : Math.sin(t * 4) * 0.30;
    x.strokeStyle = C.cat2; x.lineWidth = 2.6; x.lineCap = 'round';
    x.beginPath();
    x.moveTo(cx - 8 * f, cy - 6);
    x.quadraticCurveTo(cx - 15 * f, cy - 9 + wag * 5, cx - 16 * f, cy - 16 + wag * 8);
    x.stroke();

    x.fillStyle = C.cat;
    x.strokeStyle = 'rgba(58,36,24,.55)'; x.lineWidth = 1.1;
    x.beginPath();
    x.ellipse(cx, cy - 7.4 + wob * 0.3 + step * 0.3, 11.4, 6.7, 0, 0, 6.2832);
    x.fill(); x.stroke();
    x.strokeStyle = C.cat2; x.lineWidth = 2;
    x.beginPath();
    x.moveTo(cx - 5, cy - 3); x.lineTo(cx - 5 + step, cy);
    x.moveTo(cx + 5, cy - 3); x.lineTo(cx + 5 - step, cy);
    x.stroke();
    var hx = cx + 9.2 * f, hy = cy - 13.2 + wob * 0.4;
    x.fillStyle = C.cat;
    x.beginPath(); x.arc(hx, hy, 6.1, 0, 6.2832); x.fill(); x.stroke();
    x.fillStyle = C.cat2;
    x.beginPath();
    x.moveTo(hx - 4.4, hy - 3.6); x.lineTo(hx - 2.6, hy - 8.4); x.lineTo(hx - 0.4, hy - 4.2); x.closePath(); x.fill();
    x.beginPath();
    x.moveTo(hx + 1.4, hy - 4.4); x.lineTo(hx + 3.4, hy - 8.6); x.lineTo(hx + 5.2, hy - 3.2); x.closePath(); x.fill();
    x.fillStyle = C.catDark;
    if (cat.state === 'wait') {
      x.fillRect(hx - 0.6 + 1.6 * f, hy - 1.6, 2.2, 2.2);
    } else {
      x.beginPath(); x.arc(hx - 1.8 + 1.2 * f, hy - 0.8, 1.25, 0, 6.2832); x.fill();
      x.beginPath(); x.arc(hx + 2.4 + 1.2 * f, hy - 0.8, 1.25, 0, 6.2832); x.fill();
    }
    x.fillStyle = '#F0A98F';
    x.beginPath(); x.arc(hx + 2.6 * f, hy + 1.6, 1.05, 0, 6.2832); x.fill();

    if (cat.state === 'wait') {
      var ph = (t * 1.7) % 1;
      x.globalAlpha = 0.85 * (1 - ph * 0.6);
      x.fillStyle = '#DCE4F0';
      x.beginPath(); x.arc(hx + 9 * f, hy - 12 - ph * 5, 5.4 - ph * 1.6, 0, 6.2832); x.fill();
      x.fillStyle = '#495A70';
      x.font = 'bold 8px system-ui,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('喵', hx + 9 * f, hy - 11.5 - ph * 5);
      x.globalAlpha = 1;
    }
    if (focus) {
      x.globalAlpha = 0.30 + Math.sin(t * 4) * 0.14;
      x.strokeStyle = '#FFCE7A'; x.lineWidth = 1.6;
      x.beginPath(); x.ellipse(cx, cy - 7, 16, 13, 0, 0, 6.2832); x.stroke();
      x.globalAlpha = 1;
    }
    x.restore();
  }

  /* ---------- 主绘制 ---------- */
  function draw(st, t, ui) {
    var x = R.ctx, COL = st.base.length;
    if (!x) return;
    PAD = R.pad;
    W = R.W; FULLH = R.H; H = FULLH - PAD;
    var CELLl = st.CELL || 28;
    x.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
    x.clearRect(0, 0, W, FULLH);
    if (bg) x.drawImage(bg, 0, 0, W, FULLH);

    /* 雾气（7 团各走各的软光斑，缓慢横移，无接缝） */
    if (fog) {
      var FN = 7, span = W + 520;
      for (var fl = 0; fl < FN; fl++) {
        var sp = 5 + (fl % 4) * 3.2;
        var bx0 = ((fl * 173 + t * sp) % span) - 260;
        var by0 = H - (3.0 + (fl % 3) * 1.9) * CELLl - 34 + Math.sin(t * 0.33 + fl * 1.7) * 7;
        var bw0 = 230 + (fl % 4) * 76;
        x.globalAlpha = 0.55 + (fl % 3) * 0.13;
        x.drawImage(fog, bx0 - bw0 / 2, by0 - 70, bw0, 150);
      }
      x.globalAlpha = 1;
    }

    /* 窗（猫经过点亮 —— 揭示） */
    var wins = st.wins || [];
    for (var wi = 0; wi < wins.length; wi++) {
      var w = wins[wi];
      var wx = w.c * CELLl + CELLl * 0.5 - 4;
      var wy = H - (w.r + 1) * CELLl + CELLl * 0.5 - 5.5;
      if (st.winLit && st.winLit[wi]) {
        x.fillStyle = C.winOn;
        x.fillRect(wx, wy, 8, 10);
        x.globalAlpha = 0.55;
        x.drawImage(glow, wx - 12, wy - 12, 32, 32);
        x.globalAlpha = 1;
      } else {
        x.fillStyle = C.winOff;
        x.fillRect(wx, wy, 8, 10);
      }
    }

    /* 沙 */
    for (var c = 0; c < COL; c++) {
      var sd = st.sand[c];
      if (sd <= 0) continue;
      var tp = st.base[c] + sd;
      var yTop = H - tp * CELLl;
      var yBot = H - st.base[c] * CELLl;
      if (yBot <= yTop) continue;
      var cw = CELLl + 0.6;
      x.fillStyle = C.sand;
      x.fillRect(c * CELLl, yTop, cw, yBot - yTop);
      var st0 = Math.ceil((yTop + 6) / 8) * 8;
      x.fillStyle = 'rgba(120,98,64,.09)';
      for (var ly2 = st0; ly2 < yBot - 3; ly2 += 8) x.fillRect(c * CELLl, ly2, cw, 1);
      if (sandPat) {
        x.save();
        x.beginPath(); x.rect(c * CELLl, yTop, cw, yBot - yTop); x.clip();
        x.fillStyle = sandPat;
        x.fillRect(c * CELLl, yTop, cw, yBot - yTop);
        x.restore();
      }
      x.fillStyle = C.sandTop;
      x.fillRect(c * CELLl, yTop, cw, 3.4);
      x.fillStyle = C.sandMid;
      x.fillRect(c * CELLl, yTop + 3.4, cw, Math.min(6, Math.max(0, yBot - yTop - 3.4)));
      x.fillStyle = C.sandDeep;
      x.fillRect(c * CELLl, yBot - 3, cw, 3);
      x.fillStyle = C.sandEdge;
      x.fillRect(c * CELLl + CELLl - 1, yTop, 1.2, yBot - yTop);
    }

    /* 地灯（猫走过点亮 = 进度；过关演出逐盏亮起） */
    for (var lc = 0; lc < COL; lc++) {
      if (!st.lamps[lc]) continue;
      var ly = H - (st.base[lc] + st.sand[lc]) * CELLl;
      var lx = lc * CELLl + CELLl * 0.5;
      if (st.lampsLit[lc]) {
        x.globalAlpha = 0.9;
        x.drawImage(glow, lx - 17, ly - 26, 34, 34);
        x.globalAlpha = 1;
        x.fillStyle = C.lampOn;
        x.beginPath(); x.ellipse(lx, ly - 2.5, 5.2, 3.2, 0, 0, 6.2832); x.fill();
        x.fillStyle = '#FFF0D2';
        x.beginPath(); x.ellipse(lx, ly - 3.4, 3.1, 1.8, 0, 0, 6.2832); x.fill();
      } else {
        x.fillStyle = C.lampOff;
        x.beginPath(); x.ellipse(lx, ly - 2, 4.2, 2.2, 0, 0, 6.2832); x.fill();
      }
    }

    /* 家（猫窝） */
    for (var hi = 0; hi < st.homes.length; hi++) {
      var hm = st.homes[hi];
      var hcx = (hm.c + 0.5) * CELLl;
      var hcy = H - hm.y * CELLl;
      var pulse = 0.5 + Math.sin(t * 2.1 + hi) * 0.22;
      x.globalAlpha = 0.34 + pulse * 0.20;
      x.drawImage(glow, hcx - CELLl * 0.70, hcy - 108, CELLl * 1.40, 112);
      x.globalAlpha = 1;
      x.globalAlpha = 0.66 * pulse + 0.30;
      x.drawImage(glow, hcx - 34, hcy - 46, 68, 68);
      x.globalAlpha = 1;
      x.fillStyle = '#B8753A';
      x.beginPath();
      x.moveTo(hcx - 11, hcy - 1); x.lineTo(hcx - 8.6, hcy - 11);
      x.lineTo(hcx + 8.6, hcy - 11); x.lineTo(hcx + 11, hcy - 1);
      x.closePath(); x.fill();
      x.fillStyle = '#8E5A2C';
      x.fillRect(hcx - 11, hcy - 2.6, 22, 2.6);
      x.strokeStyle = 'rgba(255,226,170,.55)'; x.lineWidth = 0.9;
      for (var bi2 = -8; bi2 <= 8; bi2 += 4) {
        x.beginPath(); x.moveTo(hcx + bi2, hcy - 11); x.lineTo(hcx + bi2 * 1.18, hcy - 1); x.stroke();
      }
      x.fillStyle = 'rgba(255,206,122,.95)';
      x.beginPath(); x.ellipse(hcx, hcy - 11, 8.4, 2.8, 0, 0, 6.2832); x.fill();
    }

    /* 落点指示（当前列） */
    var cur = st.cursor;
    if (cur >= 0 && cur < COL) {
      var tp2 = st.base[cur] + st.sand[cur];
      var ySurf = H - tp2 * CELLl, cx2 = (cur + 0.5) * CELLl;
      x.fillStyle = C.cur + (st.shoveling ? '0.030)' : '0.045)');
      x.fillRect(cur * CELLl, 94, CELLl, Math.max(0, ySurf - 94));
      x.save();
      x.setLineDash([3, 8]); x.lineDashOffset = -t * 22;
      x.strokeStyle = 'rgba(255,222,160,.42)'; x.lineWidth = 1.3;
      x.beginPath(); x.moveTo(cx2, 90); x.lineTo(cx2, ySurf - 4); x.stroke();
      x.restore();
      x.strokeStyle = 'rgba(255,228,176,.82)'; x.lineWidth = 1.6;
      x.beginPath(); x.ellipse(cx2, ySurf - 1.6, CELLl * 0.40, 3.4, 0, 0, 6.2832); x.stroke();
      /* 漏斗 */
      var fx = (cur + 0.5) * CELLl, fy = 78;
      x.fillStyle = '#8E9AAE';
      x.beginPath();
      x.moveTo(fx - 10, fy - 8); x.lineTo(fx + 10, fy - 8);
      x.lineTo(fx + 3, fy + 6); x.lineTo(fx - 3, fy + 6); x.closePath(); x.fill();
      x.fillStyle = C.sandTop;
      x.fillRect(fx - 9, fy - 9.5, 18, 2.6);
      if (st.pouring || st.pourReq > 0) {
        x.fillStyle = 'rgba(240,230,204,.75)';
        for (var q = 0; q < 4; q++) {
          var qy = fy + 8 + ((t * 260 + q * 34) % 60);
          x.fillRect(fx - 1.2, qy, 2.4, 5);
        }
      }
    }

    /* 下落沙粒 */
    for (var gi = 0; gi < st.grains.length; gi++) {
      var gr = st.grains[gi];
      x.fillStyle = C.sandTop;
      x.fillRect(gr.x - 2, gr.y - 3.4, 4, 5);
      x.fillStyle = 'rgba(255,255,255,.35)';
      x.fillRect(gr.x - 2, gr.y - 3.4, 4, 1.4);
    }

    /* 尘 */
    for (var pi = 0; pi < st.parts.length; pi++) {
      var pa = st.parts[pi];
      x.globalAlpha = Math.max(0, pa.life / pa.max) * 0.7;
      x.fillStyle = '#E4D6B4';
      x.beginPath(); x.arc(pa.x, pa.y, pa.r, 0, 6.2832); x.fill();
    }
    x.globalAlpha = 1;

    /* 猫 */
    var focusCat = -1;
    for (var k = 0; k < st.cats.length; k++) if (!st.cats[k].home && st.cats[k].state === 'wait') { focusCat = k; break; }
    for (var ci = 0; ci < st.cats.length; ci++) drawCat(x, st.cats[ci], t, st, ci === focusCat);

    /* 过关演出：整城回暖（st.clearK 0→1） */
    if (st.clearK > 0) {
      x.globalCompositeOperation = 'lighter';
      x.fillStyle = 'rgba(58,40,20,' + (0.20 * st.clearK).toFixed(3) + ')';
      x.fillRect(0, 0, W, FULLH);
      x.globalCompositeOperation = 'source-over';
    }

    /* 暗角 */
    var vg = x.createRadialGradient(W / 2, H / 2, FULLH * 0.34, W / 2, H / 2, FULLH * 0.92);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(4,6,12,.50)');
    x.fillStyle = vg; x.fillRect(0, 0, W, FULLH);
  }

  R.bake = bake;
  R.draw = draw;
  R.init = function (ctx, dpr) { R.ctx = ctx; R.dpr = dpr; };
  R.setPad = function (p) { R.pad = p; };
  R.reset = function () { bg = null; sandPat = null; glow = null; fog = null; star = null; };
  root.SANDR = R;
})(typeof self !== 'undefined' ? self : globalThis);
