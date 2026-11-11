/* 288-tidecall《潮信 · 招潮》 — 渲染层（只读状态，消费 st.events 生成粒子/飘字，消费后清空）
 * 视觉：大地泥土色 + 那爱绿 + 云舞者软暖白 + 梵高蓝调的海 + 低空水雾（大脑降噪）
 */
(function (g) {
  'use strict';

  var W = 480, H = 800, CS = 16, COLS = 30, ROWS = 50;

  // 泥滩五阶：由湿到干
  var MUD = [
    [0.00, '#4A3B2E'], [0.20, '#6B5540'], [0.40, '#8C7256'],
    [0.60, '#A89070'], [0.80, '#C4B294'], [1.01, '#D8CBAA']
  ];
  function mudRGB(e) {
    for (var i = 1; i < MUD.length; i++) {
      if (e <= MUD[i][0]) {
        var a = MUD[i - 1], b = MUD[i];
        var t = (e - a[0]) / (b[0] - a[0]);
        var A = hex2rgb(a[1]), B = hex2rgb(b[1]);
        return [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t];
      }
    }
    return hex2rgb(MUD[MUD.length - 1][1]);
  }
  function mudColor(e) {
    var c = mudRGB(e);
    return 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')';
  }
  function hex2rgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  function h2(ix, iy, s) {
    var n = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(s, 982451653);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }
  function mix(a, b, t) {
    var A = hex2rgb(a), B = hex2rgb(b);
    return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * t) + ',' + Math.round(A[1] + (B[1] - A[1]) * t) + ',' + Math.round(A[2] + (B[2] - A[2]) * t) + ')';
  }

  function R() {
    this.parts = [];
    this.texts = [];
    this.foam = [];
    this.world = null;
    this.pristine = null;
    this.foodCv = null;
    this.foodCtx = null;
    this.foodImg = null;
    this.bakeTick = 0;
    this.contourA = null;
    this.contourB = null;
    this.contourE = -9;
    this.t = 0;
  }

  // ---------- 地形烘焙（一次）：逐像素双线性高程，告别 16px 色块台阶 ----------
  R.prototype.bakePristine = function (st) {
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var c = cv.getContext('2d');
    var F = st.field, img = c.createImageData(W, H), D = img.data;
    var p = 0;
    for (var y = 0; y < H; y++) {
      var gy = y / CS - 0.5;
      var iy = Math.floor(gy); if (iy < 0) iy = 0; if (iy > ROWS - 2) iy = ROWS - 2;
      var ty = gy - iy; if (ty < 0) ty = 0; if (ty > 1) ty = 1;
      for (var x = 0; x < W; x++) {
        var gx = x / CS - 0.5;
        var ix = Math.floor(gx); if (ix < 0) ix = 0; if (ix > COLS - 2) ix = COLS - 2;
        var tx = gx - ix; if (tx < 0) tx = 0; if (tx > 1) tx = 1;
        var a = F[iy * COLS + ix], b = F[iy * COLS + ix + 1],
          c2 = F[(iy + 1) * COLS + ix], d2 = F[(iy + 1) * COLS + ix + 1];
        var e = (a * (1 - tx) + b * tx) * (1 - ty) + (c2 * (1 - tx) + d2 * tx) * ty;
        var m = mudRGB(e);
        // 细颗粒（逐像素 hash，比随机撒点均匀）
        var n = h2(x, y, 7) - 0.5;
        var g = n * 16 + (h2(x >> 3, y >> 3, 13) - 0.5) * 6;
        D[p] = m[0] + g; D[p + 1] = m[1] + g; D[p + 2] = m[2] + g * 0.8;
        D[p + 3] = 255;
        p += 4;
      }
    }
    c.putImageData(img, 0, 0);
    var rnd = mul(97);

    // 潮痕：沿等高线的细弧线（有机反网格）
    c.lineWidth = 1;
    for (var lv = 0.10; lv < 0.98; lv += 0.085) {
      c.beginPath();
      var started = false;
      for (var x2 = 0; x2 <= W; x2 += 6) {
        var y2 = solveY(st, x2, lv);
        if (!started) { c.moveTo(x2, y2); started = true; } else c.lineTo(x2, y2);
      }
      c.strokeStyle = 'rgba(70,52,34,0.10)';
      c.stroke();
    }
    // 顶部岸草（那爱绿，压低饱和）
    for (var k = 0; k < 260; k++) {
      var gx2 = rnd() * W, gy2 = rnd() * 96;
      var ee = st.field[Math.min(ROWS - 1, Math.floor(gy2 / CS)) * COLS + Math.min(COLS - 1, Math.floor(gx2 / CS))];
      if (ee < 0.80) continue;
      var hh = 5 + rnd() * 13;
      c.strokeStyle = 'rgba(122,138,98,' + (0.20 + rnd() * 0.34) + ')';
      c.lineWidth = 0.9 + rnd() * 0.7;
      c.beginPath();
      c.moveTo(gx2, gy2);
      c.quadraticCurveTo(gx2 + (rnd() - 0.5) * 7, gy2 - hh * 0.6, gx2 + (rnd() - 0.5) * 12, gy2 - hh);
      c.stroke();
    }
    // 洞口
    for (var bI = 0; bI < st.burrows.length; bI++) {
      var br = st.burrows[bI];
      c.beginPath(); c.ellipse(br.x, br.y + 2, 9, 5.4, 0, 0, 6.2832);
      c.fillStyle = 'rgba(46,33,22,0.50)'; c.fill();
      c.beginPath(); c.ellipse(br.x, br.y, 8.4, 4.6, 0, 0, 6.2832);
      c.fillStyle = 'rgba(30,21,14,0.72)'; c.fill();
      c.beginPath(); c.ellipse(br.x + 9, br.y + 5, 7, 3.2, 0.3, 0, 6.2832);
      c.fillStyle = 'rgba(138,112,80,0.45)'; c.fill();
    }
    // 两团低空水雾烘焙进地形（静态，省下每帧的径向渐变）
    for (var f = 0; f < 2; f++) {
      var fx = 90 + f * 250, fy = 118 + f * 180, fr = 120 + f * 30;
      var rg = c.createRadialGradient(fx, fy, 0, fx, fy, fr);
      rg.addColorStop(0, 'rgba(250,248,242,0.075)');
      rg.addColorStop(1, 'rgba(250,248,242,0)');
      c.fillStyle = rg;
      c.fillRect(fx - fr, fy - fr, fr * 2, fr * 2);
    }
    // 整幅柔光（同样烘焙，避免每帧一次全屏 fillRect）
    c.fillStyle = 'rgba(255,250,240,0.055)';
    c.fillRect(0, 0, W, H);
    this.pristine = cv;
  };

  function mul(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  // 等高线：x 方向也要在相邻两列之间插值 —— 否则 contour 以 16px 为一段常数，
  // 画出来就是一格格的台阶（水线/湿泥带全在用这条函数）
  function solveY(st, x, e) {
    var gx = x / CS - 0.5;
    var q = Math.floor(gx); if (q < 0) q = 0; if (q > COLS - 2) q = COLS - 2;
    var tx = gx - q; if (tx < 0) tx = 0; if (tx > 1) tx = 1;
    var F = st.field, C = COLS;
    var eB = F[(ROWS - 1) * C + q] * (1 - tx) + F[(ROWS - 1) * C + q + 1] * tx;
    if (eB >= e) return (ROWS - 0.5) * CS;          // 整列都露出 → 水只剩底部一条
    for (var r = ROWS - 2; r >= 1; r--) {
      var e1 = F[r * C + q] * (1 - tx) + F[r * C + q + 1] * tx;
      if (e1 >= e) {
        var e0 = F[(r + 1) * C + q] * (1 - tx) + F[(r + 1) * C + q + 1] * tx;
        var t = (e1 - e) / Math.max(1e-5, e1 - e0);
        t = t < 0 ? 0 : (t > 1 ? 1 : t);
        return (r + 0.5 + t) * CS;
      }
    }
    return 0;                                        // 整列都被淹 → 水漫到顶
  }
  function clampC(x) { var q = Math.floor(x / CS); return q < 0 ? 0 : (q > COLS - 1 ? COLS - 1 : q); }

  // ---------- 肥力层：60×100 双线性采样（16px 格子直接放大会糊成一团雾） ----------
  var FW = 60, FH = 100;
  R.prototype.bakeFood = function (st) {
    if (!this.foodCv) {
      this.foodCv = document.createElement('canvas');
      this.foodCv.width = FW; this.foodCv.height = FH;
      this.foodCtx = this.foodCv.getContext('2d');
      this.foodImg = this.foodCtx.createImageData(FW, FH);
    }
    var d = this.foodImg.data, F = st.food;
    // 先做一遍 3×3 软化，把「肥/薄」的硬边界摊开（否则 8× 放大后仍是一格一格的台阶）
    if (!this._fb || this._fb.length !== F.length) this._fb = new Float32Array(F.length);
    var B = this._fb, C2 = COLS, R2 = ROWS;
    for (var yy = 0; yy < R2; yy++) {
      var y0 = yy > 0 ? yy - 1 : 0, y1 = yy < R2 - 1 ? yy + 1 : R2 - 1;
      for (var xx = 0; xx < C2; xx++) {
        var x0 = xx > 0 ? xx - 1 : 0, x1 = xx < C2 - 1 ? xx + 1 : C2 - 1;
        var s = (F[y0 * C2 + x0] + F[y0 * C2 + xx] + F[y0 * C2 + x1] +
          F[yy * C2 + x0] + F[yy * C2 + xx] * 2 + F[yy * C2 + x1] +
          F[y1 * C2 + x0] + F[y1 * C2 + xx] + F[y1 * C2 + x1]);
        B[yy * C2 + xx] = s / 10;
      }
    }
    for (var j = 0; j < FH; j++) {
      var gy = (j + 0.5) / FH * ROWS - 0.5;
      var iy = Math.floor(gy); if (iy < 0) iy = 0; if (iy > R2 - 2) iy = R2 - 2;
      var ty = gy - iy; if (ty < 0) ty = 0; if (ty > 1) ty = 1;
      for (var q = 0; q < FW; q++) {
        var gx = (q + 0.5) / FW * COLS - 0.5;
        var ix = Math.floor(gx); if (ix < 0) ix = 0; if (ix > C2 - 2) ix = C2 - 2;
        var tx = gx - ix; if (tx < 0) tx = 0; if (tx > 1) tx = 1;
        var a = B[iy * C2 + ix], b = B[iy * C2 + ix + 1],
          c2 = B[(iy + 1) * C2 + ix], d2 = B[(iy + 1) * C2 + ix + 1];
        var f = (a * (1 - tx) + b * tx) * (1 - ty) + (c2 * (1 - tx) + d2 * tx) * ty;
        // 肥 = 深赭（湿、有有机质）；薄 = 浅灰白（被啃干）
        var k = (j * FW + q) * 4;
        d[k] = 90 - 52 * f; d[k + 1] = 74 - 44 * f; d[k + 2] = 56 - 34 * f;
        d[k + 3] = 96 + 108 * f;
      }
    }
    this.foodCtx.putImageData(this.foodImg, 0, 0);
  };

  // 每 BAKE_N 帧把「原始地形 + 肥力 + 颗粒」合成一张世界图（避免每帧两次全屏 drawImage）
  R.prototype.bakeWorld = function (st) {
    if (!this.world) {
      this.world = document.createElement('canvas');
      this.world.width = W; this.world.height = H;
      this.wctx = this.world.getContext('2d');
      // 颗粒点位只生成一次
      var rnd = mul(311);
      this.grain = [];
      for (var i = 0; i < 1500; i++) {
        this.grain.push([rnd() * W, rnd() * H, 0.8 + rnd() * 2.2, rnd() < 0.5]);
      }
    }
    var c = this.wctx;
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.drawImage(this.pristine, 0, 0);
    this.bakeFood(st);
    c.imageSmoothingEnabled = true;
    c.globalAlpha = 0.72;
    c.drawImage(this.foodCv, 0, 0, FW, FH, 0, 0, W, H);
    // 泥的颗粒感要压在肥力层上，否则整幅像失焦
    c.globalAlpha = 1;
    for (var k = 0; k < this.grain.length; k++) {
      var g = this.grain[k];
      c.fillStyle = g[3] ? 'rgba(255,246,228,0.10)' : 'rgba(46,32,20,0.12)';
      c.fillRect(g[0], g[1], g[2], g[2]);
    }
    c.globalAlpha = 1;
  };

  // ---------- 水线等高线（水不是一条直线，是高程 = 水位 的那条等高线） ----------
  R.prototype.contour = function (st, e, step) {
    var pts = [];
    for (var x = 0; x <= W; x += step) pts.push(solveY(st, x, e));
    return pts;
  };

  // ---------- 事件 → 粒子 ----------
  R.prototype.consume = function (st) {
    var evs = st.events;
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i];
      switch (e.t) {
        case 'bite': this.puff(e.x, e.y, 3, '#C9B48C', e.rich); break;
        case 'molt':
          this.burst(e.x, e.y, 16, ['#C3423F', '#B5651D', '#E4C88A']);
          this.texts.push({ x: e.x, y: e.y - 18, s: '蜕壳', c: '#C3423F', life: 1.5, age: 0, big: 1 });
          break;
        case 'clam':
          this.burst(e.x, e.y, 9, ['#E8DCC8', '#C9B48C']);
          this.texts.push({ x: e.x, y: e.y - 14, s: '蚝 +1', c: '#5C7A86', life: 1.1, age: 0, big: 0 });
          break;
        case 'bubble': this.foam.push({ x: e.x, y: e.y, r: 1 + Math.random() * 1.6, life: 1.6, age: 0, vy: -14 - Math.random() * 10 }); break;
        case 'wash':
          this.burst(e.x, e.y, 14, ['#EAF2F5', '#8FB6CE', '#4E7E9E']);
          this.texts.push({ x: e.x, y: e.y - 16, s: '被冲走', c: '#3E6C8C', life: 1.6, age: 0, big: 0 });
          break;
        case 'eaten':
          this.burst(e.x, e.y, 12, ['#2B2B2E', '#5A5A5E', '#8A8378']);
          this.texts.push({ x: e.x, y: e.y - 16, s: '被叼走', c: '#2B2B2E', life: 1.6, age: 0, big: 0 });
          break;
        case 'scared':
          this.burst(e.x, e.y, 8, ['#EAF2F5', '#C4D6DE']);
          this.texts.push({ x: e.x, y: e.y - 14, s: '惊退', c: '#4E7E9E', life: 1.0, age: 0, big: 0 });
          break;
        case 'gong':
          for (var k = 0; k < 26; k++) this.burst(e.x + (Math.random() - 0.5) * 300, e.y + (Math.random() - 0.5) * 200, 3, ['#C9A227', '#E4C88A']);
          this.texts.push({ x: e.x, y: e.y, s: '鸣　锣', c: '#8A6A1E', life: 1.8, age: 0, big: 1 });
          break;
        case 'home': this.puff(e.x, e.y, 2, '#9AAA7E', 0.6); break;
        case 'startled': this.puff(e.x, e.y, 3, '#8FB6CE', 0.7); break;
        case 'arrive': this.puff(e.x, e.y, 5, '#B5651D', 0.8); break;
      }
    }
    evs.length = 0;
  };

  R.prototype.puff = function (x, y, n, col, sc) {
    sc = sc || 1;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 6.2832, v = (8 + Math.random() * 22) * (0.6 + sc * 0.5);
      this.parts.push({
        x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 8,
        r: 1 + Math.random() * 2.2, c: col, life: 0.5 + Math.random() * 0.5, age: 0
      });
    }
  };
  R.prototype.burst = function (x, y, n, cols) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 6.2832, v = 20 + Math.random() * 60;
      this.parts.push({
        x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 14,
        r: 1.2 + Math.random() * 2.6, c: cols[(Math.random() * cols.length) | 0],
        life: 0.5 + Math.random() * 0.7, age: 0
      });
    }
  };

  R.prototype.step = function (dt) {
    this.t += dt;
    var i;
    for (i = this.parts.length - 1; i >= 0; i--) {
      var p = this.parts[i];
      p.age += dt;
      if (p.age >= p.life) { this.parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += 42 * dt; p.vx *= 0.97; p.vy *= 0.97;
    }
    if (this.parts.length > 240) this.parts.splice(0, this.parts.length - 240);
    for (i = this.foam.length - 1; i >= 0; i--) {
      var f = this.foam[i];
      f.age += dt;
      if (f.age >= f.life) { this.foam.splice(i, 1); continue; }
      f.y += f.vy * dt; f.r += dt * 1.6;
    }
    if (this.foam.length > 90) this.foam.splice(0, this.foam.length - 90);
    for (i = this.texts.length - 1; i >= 0; i--) {
      var t = this.texts[i];
      t.age += dt; t.y -= 15 * dt;
      if (t.age >= t.life) this.texts.splice(i, 1);
    }
  };

  // ---------- 主绘制 ----------
  R.prototype.draw = function (ctx, st, dt) {
    var i;
    this.step(dt);

    // 世界（地形+肥力，每 BAKE_N 帧重烘焙）
    if (!this.pristine) this.bakePristine(st);
    if (this.bakeTick % 9 === 0) this.bakeWorld(st);
    this.bakeTick++;
    ctx.drawImage(this.world, 0, 0);

    var wE = st.waterE;

    // 「刚露出的湿泥带」= 蟹的饭桌，给一层薄光泽，让玩家的决策看得见
    var top = this.contour(st, wE, 4);
    var band = this.contour(st, wE + 0.22, 4);
    ctx.save();
    ctx.beginPath();
    pathPts(ctx, top, 4);
    for (var x = W; x >= 0; x -= 4) ctx.lineTo(x, band[Math.round(x / 4)]);
    ctx.closePath();
    ctx.fillStyle = 'rgba(122,150,138,0.13)';
    ctx.fill();
    ctx.restore();

    // 海：梵高蓝调（渐变跟着实际水面走，低潮时不再发灰）
    var wTop = H;
    for (i = 0; i < top.length; i++) if (top[i] < wTop) wTop = top[i];
    if (wTop > H - 6) wTop = H - 6;
    ctx.save();
    ctx.beginPath();
    pathPts(ctx, top, 4);
    ctx.lineTo(W, H); ctx.lineTo(0, H);
    ctx.closePath();
    var wg = ctx.createLinearGradient(0, wTop, 0, H);
    wg.addColorStop(0, 'rgba(56,108,158,0.82)');
    wg.addColorStop(0.35, 'rgba(42,84,128,0.90)');
    wg.addColorStop(1, 'rgba(27,58,92,0.96)');
    ctx.fillStyle = wg;
    ctx.fill();
    ctx.restore();

    // 旋涡状潮痕笔触（梵高）—— 每条相位/振幅不同，不排成等距
    ctx.save();
    ctx.strokeStyle = '#EAF2F5';
    ctx.lineCap = 'round';
    for (i = 0; i < 6; i++) {
      var seed = i * 37.7;
      var yy = 80 + i * 122 + Math.sin(this.t * 0.4 + seed) * 16;
      var mid = top[Math.min(top.length - 1, Math.round((W * 0.5) / 4))];
      if (yy < mid - 40) continue;
      ctx.globalAlpha = 0.07 + 0.06 * (0.5 + 0.5 * Math.sin(this.t * 0.7 + seed));
      ctx.lineWidth = 0.9 + (i % 3) * 0.5;
      ctx.beginPath();
      var amp = 7 + (i % 4) * 4, ph = seed + this.t * (0.7 + i * 0.13);
      for (var x3 = 0; x3 <= W; x3 += 11) {
        var sy = yy + Math.sin(x3 * 0.021 + ph) * amp + Math.sin(x3 * 0.052 - ph * 1.7) * amp * 0.4;
        if (x3 === 0) ctx.moveTo(x3, sy); else ctx.lineTo(x3, sy);
      }
      ctx.stroke();
    }
    ctx.restore();

    // 水线：银白呼吸亮边
    ctx.save();
    ctx.beginPath();
    pathPts(ctx, top, 8);
    ctx.strokeStyle = 'rgba(234,242,245,0.92)';
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(234,242,245,0.30)';
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.restore();

    // 泡沫
    ctx.save();
    for (i = 0; i < this.foam.length; i++) {
      var fo = this.foam[i];
      var a = 1 - fo.age / fo.life;
      ctx.beginPath();
      ctx.arc(fo.x, fo.y, fo.r, 0, 6.2832);
      ctx.strokeStyle = 'rgba(234,242,245,' + (a * 0.6) + ')';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();

    // 贝类
    for (i = 0; i < st.clams.length; i++) {
      var cl = st.clams[i];
      var rip = cl.ripe ? 1 : (cl.age / 1.2);
      var pulse = 0.6 + 0.4 * Math.sin(this.t * 5 + i);
      ctx.save();
      ctx.beginPath();
      ctx.arc(cl.x, cl.y - 3, 2.2, 0, 6.2832);
      ctx.fillStyle = 'rgba(234,242,245,' + (0.5 * pulse) + ')';
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cl.x, cl.y, 5.4, 4.0, 0.2, 0, 6.2832);
      ctx.fillStyle = 'rgba(232,220,200,' + (0.55 + 0.35 * rip) + ')';
      ctx.fill();
      ctx.strokeStyle = 'rgba(122,106,82,0.7)';
      ctx.lineWidth = 0.9;
      ctx.stroke();
      if (cl.ripe) {
        ctx.beginPath();
        ctx.arc(cl.x, cl.y, 8 + pulse * 2, 0, 6.2832);
        ctx.strokeStyle = 'rgba(92,122,134,' + (0.35 * pulse) + ')';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      ctx.restore();
    }

    // 蟹
    for (i = 0; i < st.crabs.length; i++) this.crab(ctx, st, st.crabs[i]);

    // 鸟 + 地面预警影
    for (i = 0; i < st.birds.length; i++) this.bird(ctx, st, st.birds[i]);

    // 粒子
    ctx.save();
    for (i = 0; i < this.parts.length; i++) {
      var p = this.parts[i];
      var pa = 1 - p.age / p.life;
      ctx.globalAlpha = pa * 0.9;
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (0.5 + pa * 0.7), 0, 6.2832);
      ctx.fill();
    }
    ctx.restore();

    // 飘字
    ctx.save();
    ctx.textAlign = 'center';
    for (i = 0; i < this.texts.length; i++) {
      var tx = this.texts[i];
      var ta = Math.min(1, (tx.life - tx.age) / tx.life * 2.2);
      ctx.globalAlpha = ta;
      ctx.font = (tx.big ? '600 17px ' : '600 12px ') + '"PingFang SC","Microsoft YaHei",sans-serif';
      ctx.fillStyle = 'rgba(255,252,245,0.85)';
      ctx.fillText(tx.s, tx.x + 1, tx.y + 1);
      ctx.fillStyle = tx.c;
      ctx.fillText(tx.s, tx.x, tx.y);
    }
    ctx.restore();

    // 海面上的两团飘雾（烘焙雾在陆地侧，这两团负责水面侧，逐帧只画 2 个渐变）
    // 注意 fillRect 必须盖满渐变半径，否则上下边会切出一条硬线
    ctx.save();
    for (i = 0; i < 2; i++) {
      var fx = ((this.t * (8 + i * 5) + i * 260) % (W + 280)) - 140;
      var fy = 430 + i * 150 + Math.sin(this.t * 0.32 + i * 1.9) * 20;
      var fr = 118 + i * 26;
      var rg = ctx.createRadialGradient(fx, fy, 0, fx, fy, fr);
      rg.addColorStop(0, 'rgba(250,248,242,0.10)');
      rg.addColorStop(1, 'rgba(250,248,242,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(fx - fr, fy - fr, fr * 2, fr * 2);
    }
    ctx.restore();
  };

  function pathPts(ctx, pts, step) {
    ctx.moveTo(0, pts[0]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(i * step, pts[i]);
  }

  // ---------- 蟹 ----------
  R.prototype.crab = function (ctx, st, cr) {
    if (!cr.alive) {
      // 空洞：等下一潮期的住客
      ctx.save();
      ctx.globalAlpha = 0.30;
      ctx.beginPath();
      ctx.ellipse(cr.hx, cr.hy, 8, 4.4, 0, 0, 6.2832);
      ctx.strokeStyle = 'rgba(60,44,30,0.9)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
      return;
    }
    var s = 4.2 + cr.size * 1.9;
    var wet = cr.wet;
    var sub = wet;
    ctx.save();
    ctx.translate(cr.x, cr.y);
    if (sub) ctx.globalAlpha = 0.72;

    // 腿
    ctx.strokeStyle = 'rgba(140,86,32,0.85)';
    ctx.lineWidth = 1.3;
    for (var k = -1; k <= 1; k += 2) {
      for (var j = 0; j < 3; j++) {
        var ang = 0.5 + j * 0.45;
        var lx = k * (s * 0.9 + j * 1.2), ly = s * 0.35 + j * 1.4;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(lx, ly + Math.sin(this.t * 8 + j + k) * 0.8);
        ctx.stroke();
      }
    }
    // 身（横向椭圆，招潮蟹背甲偏方）
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 1.15, s * 0.82, 0, 0, 6.2832);
    ctx.fillStyle = wet ? '#8A5A2A' : '#B5651D';
    ctx.fill();
    ctx.strokeStyle = 'rgba(74,44,18,0.55)';
    ctx.lineWidth = 0.9;
    ctx.stroke();
    // 背甲高光
    ctx.beginPath();
    ctx.ellipse(-s * 0.2, -s * 0.22, s * 0.55, s * 0.3, -0.3, 0, 6.2832);
    ctx.fillStyle = 'rgba(232,196,150,0.28)';
    ctx.fill();

    // 眼柄
    ctx.strokeStyle = '#B5651D';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-s * 0.32, -s * 0.6); ctx.lineTo(-s * 0.45, -s * 1.28); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s * 0.32, -s * 0.6); ctx.lineTo(s * 0.45, -s * 1.28); ctx.stroke();
    ctx.fillStyle = '#2B2118';
    ctx.beginPath(); ctx.arc(-s * 0.45, -s * 1.34, 1.25, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.arc(s * 0.45, -s * 1.34, 1.25, 0, 6.2832); ctx.fill();

    // 大螯（招潮：挥舞）
    var side = cr.size >= 2 ? 1 : 1;
    var wave = Math.sin(cr.waveT) * 0.45;
    ctx.save();
    ctx.translate(side * s * 1.05, -s * 0.25);
    ctx.rotate(wave - 0.25);
    ctx.beginPath();
    ctx.ellipse(s * 0.42, 0, s * 0.62, s * 0.42, 0, 0, 6.2832);
    ctx.fillStyle = '#C3423F';
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,32,30,0.7)';
    ctx.lineWidth = 0.9;
    ctx.stroke();
    // 螯开口
    ctx.beginPath();
    ctx.moveTo(s * 0.5, -s * 0.1); ctx.lineTo(s * 1.0, -s * 0.34);
    ctx.strokeStyle = 'rgba(120,32,30,0.85)';
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.restore();
    // 小螯
    ctx.beginPath();
    ctx.ellipse(-s * 1.05, -s * 0.1, s * 0.34, s * 0.26, 0, 0, 6.2832);
    ctx.fillStyle = '#A5571A';
    ctx.fill();

    ctx.restore();

    // 状态条
    ctx.save();
    var by = cr.y - s * 2.0;
    if (cr.air < st.__airMax(cr.size) - 0.02) {
      var frac = Math.max(0, cr.air / st.__airMax(cr.size));
      ctx.fillStyle = 'rgba(30,24,18,0.35)';
      ctx.fillRect(cr.x - 9, by, 18, 2.6);
      ctx.fillStyle = frac < 0.35 ? '#C3423F' : '#5C9BC0';
      ctx.fillRect(cr.x - 9, by, 18 * frac, 2.6);
      by -= 4;
    }
    if (cr.state === 'feed') {
      var fp = Math.min(1, cr.feedT / (st.__feedTime || 1.7));
      ctx.fillStyle = 'rgba(30,24,18,0.30)';
      ctx.fillRect(cr.x - 9, by, 18, 2.4);
      ctx.fillStyle = '#9AAA7E';
      ctx.fillRect(cr.x - 9, by, 18 * fp, 2.4);
    }
    ctx.restore();
  };

  // ---------- 鸟 ----------
  R.prototype.bird = function (ctx, st, b) {
    // 地面预警影：锁定的猎物位置，随俯冲收缩
    var prey = null;
    for (var i = 0; i < st.crabs.length; i++) if (st.crabs[i].id === b.tid && st.crabs[i].alive) prey = st.crabs[i];
    if (prey) {
      var u = Math.min(1, b.t / b.dur);
      var rr = 26 * (1 - u) + 7;
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(prey.x, prey.y + 3, rr, rr * 0.44, 0, 0, 6.2832);
      ctx.fillStyle = 'rgba(30,26,22,' + (0.14 + 0.20 * u) + ')';
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(prey.x, prey.y + 3, rr, rr * 0.44, 0, 0, 6.2832);
      ctx.strokeStyle = 'rgba(43,43,46,' + (0.30 + 0.45 * u) + ')';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();
    }
    // 鸟身剪影
    ctx.save();
    ctx.translate(b.x, b.y);
    var fl = Math.sin(b.flap);
    ctx.strokeStyle = '#2B2B2E';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-14, fl * 5);
    ctx.quadraticCurveTo(-5, -3 - fl * 3, 0, 0);
    ctx.quadraticCurveTo(5, -3 - fl * 3, 14, fl * 5);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 1, 3.4, 2.4, 0, 0, 6.2832);
    ctx.fillStyle = '#2B2B2E';
    ctx.fill();
    ctx.restore();
  };

  g.TideRender = { R: R, W: W, H: H };
  if (typeof module !== 'undefined' && module.exports) module.exports = g.TideRender;
})(typeof globalThis !== 'undefined' ? globalThis : this);
