/* =============================================================
 * 放鸢 · 渲染层（Canvas 2D · 莫奈印象派）
 * 只读取 state，不修改 state；消费 events 生成粒子/飘字
 * 纪律：canvas 的 CSS 尺寸固定为逻辑尺寸，缩放只交给外层 #stage 的 transform
 * ============================================================= */
(function (g) {
  "use strict";

  var W = 480, H = 800;
  var PX_PER_M = 1.15, ANCHOR_SX = 240, ANCHOR_SY = 670;

  /* ---------- 天色梯度（按世界高度取色，黄昏睡莲池上方） ---------- */
  var SKY = [
    [-500, 0x2E, 0x4A, 0x52],   // 水下
    [0, 0xF7, 0xD9, 0xA8],      // 水面：暖橘金
    [180, 0xF5, 0xC0, 0x8E],
    [400, 0xEE, 0x9F, 0x9E],    // 玫瑰粉
    [650, 0xC7, 0x9C, 0xB4],
    [900, 0x8E, 0x86, 0xB4],    // 蓝紫
    [1150, 0x5E, 0x6B, 0x9E],
    [1500, 0x43, 0x50, 0x7F],
    [2000, 0x38, 0x44, 0x6B]
  ];

  function skyColorAt(alt) {
    var i, a = SKY[0], b = SKY[SKY.length - 1];
    if (alt <= SKY[0][0]) { a = b = SKY[0]; }
    else if (alt >= SKY[SKY.length - 1][0]) { a = b = SKY[SKY.length - 1]; }
    else {
      for (i = 0; i < SKY.length - 1; i++) {
        if (alt >= SKY[i][0] && alt <= SKY[i + 1][0]) { a = SKY[i]; b = SKY[i + 1]; break; }
      }
    }
    var t = (b[0] === a[0]) ? 0 : (alt - a[0]) / (b[0] - a[0]);
    if (t < 0) t = 0; if (t > 1) t = 1;
    return [
      Math.round(a[1] + (b[1] - a[1]) * t),
      Math.round(a[2] + (b[2] - a[2]) * t),
      Math.round(a[3] + (b[3] - a[3]) * t)
    ];
  }

  function rgb(c, a) {
    return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + (a === undefined ? 1 : a) + ")";
  }

  /* ---------- 云模板（点彩短笔触，预渲染一次） ---------- */
  var CLOUD_TINTS = [
    [255, 247, 238], [246, 211, 214], [217, 198, 228], [247, 226, 184]
  ];

  function makeCloud(tint, seed) {
    var cw = 320, ch = 110;
    var cv = g.document.createElement("canvas");
    cv.width = cw; cv.height = ch;
    var x = cv.getContext("2d");
    var r = mulberry(seed);
    var base = CLOUD_TINTS[tint % CLOUD_TINTS.length];
    // 并排短笔触：印象派不画轮廓，靠纯色点块并置
    var i, n = 130;
    for (i = 0; i < n; i++) {
      var t = i / n;
      var px = 20 + (cw - 40) * t + (r() - 0.5) * 40;
      var belly = Math.sin(Math.PI * t);
      var py = ch * 0.62 - belly * ch * 0.42 + (r() - 0.5) * 22;
      var rw = 10 + r() * 26;
      var rh = 5 + r() * 9;
      var shade = 0.72 + r() * 0.28;
      var alpha = 0.30 + r() * 0.34;
      x.save();
      x.translate(px, py);
      x.rotate((r() - 0.5) * 0.5);
      x.fillStyle = "rgba(" + Math.round(base[0] * shade) + "," +
        Math.round(base[1] * shade) + "," + Math.round(base[2] * shade) + "," + alpha.toFixed(3) + ")";
      x.beginPath();
      x.ellipse(0, 0, rw, rh, 0, 0, 6.2832);
      x.fill();
      x.restore();
    }
    return cv;
  }

  function mulberry(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- 渲染器 ---------- */
  function create(canvas, C) {
    if (C) {
      W = C.W; H = C.H; PX_PER_M = C.PX_PER_M; ANCHOR_SX = C.ANCHOR_SX; ANCHOR_SY = C.ANCHOR_SY;
    }
    var ctx = canvas.getContext("2d");
    var dpr = 1;

    var cloudTex = [];
    for (var ci = 0; ci < 4; ci++) cloudTex.push(makeCloud(ci, 1337 + ci * 977));

    var parts = [];      // 粒子
    var floats = [];     // 飘字
    var rings = [];      // 音波环
    var tAnim = 0;

    /* 缩放：CSS 尺寸恒定 = 逻辑尺寸；backing store 才乘 dpr*scale 保清晰 */
    function resize(cssW, cssH, scale) {
      scale = scale || 1;
      dpr = Math.min((g.devicePixelRatio || 1) * scale, 3);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function screenY(alt, camY) { return ANCHOR_SY - (alt - camY) * PX_PER_M; }

    /* ---------- 粒子 ---------- */
    function puff(x, y, n, color, spread, life) {
      if (parts.length > 200) return;
      for (var i = 0; i < n; i++) {
        var a = Math.random() * 6.2832;
        var s = (0.3 + Math.random()) * spread;
        parts.push({
          x: x, y: y,
          vx: Math.cos(a) * s, vy: Math.sin(a) * s - 18,
          r: 1.4 + Math.random() * 2.6,
          life: 0, max: life || (0.7 + Math.random() * 0.7),
          c: color
        });
      }
    }
    function petal(x, y, color) {
      if (parts.length > 200) return;
      parts.push({
        x: x, y: y, vx: (Math.random() - 0.5) * 34, vy: -12 - Math.random() * 26,
        r: 2.2 + Math.random() * 2.4, life: 0, max: 1.5 + Math.random(), c: color, sway: Math.random() * 6.28
      });
    }
    function ring(x, y, color) { if (rings.length < 26) rings.push({ x: x, y: y, r: 6, life: 0, max: 0.62, c: color }); }
    function float(x, y, text, color) { if (floats.length < 14) floats.push({ x: x, y: y, t: text, life: 0, max: 1.05, c: color }); }

    /* ---------- 消费事件 ---------- */
    function pump(events, S) {
      for (var i = 0; i < events.length; i++) {
        var e = events[i];
        if (e.type === "note") {
          var col = C.NOTE_COLORS[e.note];
          ring(e.x, e.y, col);
          puff(e.x, e.y, 7, col, 62, 0.75);
          float(e.x, e.y - 12, C.NOTES[e.note] + (e.combo > 2 ? " " + e.combo : ""), col);
        } else if (e.type === "cloud") {
          puff(e.x, e.y, 6, "#FFF3E0", 40, 0.9);
        } else if (e.type === "snap") {
          puff(e.x, e.y, 34, "#D9603B", 150, 1.5);
          puff(e.x, e.y, 16, "#F7E3C0", 100, 1.2);
          ring(e.x, e.y, "#F2C078");
        } else if (e.type === "rekit") {
          float(ANCHOR_SX, ANCHOR_SY - 120, "换一只", "#FFE9C4");
        }
      }
    }

    function stepFx(dt) {
      var i, p;
      for (i = parts.length - 1; i >= 0; i--) {
        p = parts[i]; p.life += dt;
        if (p.life >= p.max) { parts.splice(i, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vy += 26 * dt;
        if (p.sway !== undefined) { p.sway += dt * 2.4; p.x += Math.sin(p.sway) * 22 * dt; }
        p.vx *= (1 - 0.9 * dt);
      }
      for (i = rings.length - 1; i >= 0; i--) {
        rings[i].life += dt;
        if (rings[i].life >= rings[i].max) { rings.splice(i, 1); continue; }
        rings[i].r += 62 * dt;
      }
      for (i = floats.length - 1; i >= 0; i--) {
        floats[i].life += dt; floats[i].y -= 26 * dt;
        if (floats[i].life >= floats[i].max) floats.splice(i, 1);
      }
    }

    /* ---------- 天空 ---------- */
    function drawSky(S) {
      var bands = 44, bh = Math.ceil(H / bands) + 1;
      var i;
      for (i = 0; i <= bands; i++) {
        var y = i * (H / bands);
        var alt = (ANCHOR_SY - y) / PX_PER_M + S.camY;
        ctx.fillStyle = rgb(skyColorAt(alt));
        ctx.fillRect(0, y - 1, W, bh);
      }
      // 低空暖光斑（莫奈的户外光）
      var sunY = screenY(90, S.camY);
      if (sunY > -260 && sunY < H + 260) {
        var gr = ctx.createRadialGradient(W * 0.72, sunY, 4, W * 0.72, sunY, 250);
        gr.addColorStop(0, "rgba(255,244,208,0.62)");
        gr.addColorStop(0.45, "rgba(255,226,168,0.22)");
        gr.addColorStop(1, "rgba(255,220,170,0)");
        ctx.fillStyle = gr;
        ctx.fillRect(0, sunY - 250, W, 500);
      }
    }

    /* ---------- 阵风笔触 ---------- */
    function drawGust(S) {
      var gu = S.gust;
      if (gu.st === "idle") return;
      var warn = gu.st === "warn";
      var a = warn ? (0.20 + 0.16 * Math.sin(tAnim * 11)) : 0.34;
      ctx.save();
      ctx.strokeStyle = "rgba(255,252,242," + a.toFixed(3) + ")";
      ctx.lineWidth = warn ? 1.6 : 2.6;
      ctx.lineCap = "round";
      var dir = gu.dir;
      for (var i = 0; i < 26; i++) {
        var yy = ((i * 137.5 + tAnim * (warn ? 90 : 420) * dir) % (H + 120)) - 60;
        var xx = (i * 71.3) % W;
        var len = warn ? 16 : 46 + (i % 5) * 12;
        ctx.beginPath();
        ctx.moveTo(xx - dir * len * 0.5, yy);
        ctx.lineTo(xx + dir * len * 0.5, yy + (i % 3 - 1) * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    /* ---------- 云 ---------- */
    function drawClouds(S) {
      var i, c, cy;
      for (i = 0; i < S.clouds.length; i++) {
        c = S.clouds[i];
        cy = screenY(c.alt, S.camY);
        if (cy < -140 || cy > H + 120) continue;
        var tex = cloudTex[c.tint % cloudTex.length];
        var hh = c.h * 1.5;
        var drift = Math.sin(tAnim * 0.25 + c.ph) * 8;
        ctx.save();
        ctx.globalAlpha = 0.88;
        ctx.drawImage(tex, c.x - c.w * 0.5 + drift, cy - hh * 0.5, c.w, hh);
        ctx.restore();
      }
    }

    /* ---------- 水面 / 睡莲池 ---------- */
    function drawWater(S) {
      var wy = screenY(0, S.camY);
      if (wy > H + 40) return;
      var top = Math.max(-20, wy);
      if (top >= H) return;

      // 水体
      var gr = ctx.createLinearGradient(0, wy, 0, H);
      gr.addColorStop(0, "#6E9C74");
      gr.addColorStop(0.22, "#4E7A5E");
      gr.addColorStop(1, "#2F5044");
      ctx.fillStyle = gr;
      ctx.fillRect(0, top, W, H - top);

      // 横向反光条（莫奈水面）
      var i;
      for (i = 0; i < 26; i++) {
        var yy = wy + 6 + i * 11;
        if (yy > H) break;
        if (yy < -10) continue;
        var ww = 40 + ((i * 53) % 190);
        var xx = ((i * 97) % (W + 120)) - 60 + Math.sin(tAnim * 0.7 + i) * 5;
        ctx.fillStyle = "rgba(247,227,192," + (0.05 + (i % 4) * 0.035).toFixed(3) + ")";
        ctx.fillRect(xx, yy, ww, 2.5);
      }

      // 睡莲（叶 + 花）
      for (i = 0; i < 16; i++) {
        var lx = ((i * 131 + 37) % (W + 90)) - 45;
        var ly = wy + 22 + ((i * 67) % 120);
        if (ly > H + 10 || ly < -10) continue;
        var rr = 12 + (i % 3) * 6;
        ctx.fillStyle = "rgba(62,110,80,0.86)";
        ctx.beginPath(); ctx.ellipse(lx, ly, rr, rr * 0.44, 0, 0, 6.2832); ctx.fill();
        if (i % 3 === 0) {
          ctx.fillStyle = "rgba(233,184,196,0.92)";
          ctx.beginPath(); ctx.ellipse(lx + rr * 0.35, ly - 2, 5.5, 3.4, 0, 0, 6.2832); ctx.fill();
        }
      }

      // 水面浮灯（断过的鸢留下的）
      var lan = S.save && S.save.lanterns ? Math.min(S.save.lanterns, 14) : 0;
      for (i = 0; i < lan; i++) {
        var fx = 34 + ((i * 79 + 20) % (W - 68));
        var fy = wy + 16 + ((i * 43) % 70);
        if (fy > H || fy < -10) continue;
        var fl = 0.55 + 0.3 * Math.sin(tAnim * 1.6 + i * 1.7);
        var fg = ctx.createRadialGradient(fx, fy, 1, fx, fy, 15);
        fg.addColorStop(0, "rgba(255,232,180," + fl.toFixed(3) + ")");
        fg.addColorStop(1, "rgba(255,210,140,0)");
        ctx.fillStyle = fg;
        ctx.beginPath(); ctx.arc(fx, fy, 15, 0, 6.2832); ctx.fill();
      }

      // 纸鸢倒影
      if (S.phase !== "over" && S.ky > 4) {
        var ry = wy + (S.ky * PX_PER_M) * 0.34;
        if (ry < H + 30) {
          ctx.save();
          ctx.globalAlpha = 0.20;
          ctx.translate(ANCHOR_SX + S.kx * 0.5, ry);
          ctx.scale(1, -0.5);
          drawKiteShape(S, 0.8);
          ctx.restore();
        }
      }
    }

    /* ---------- 风铃 ---------- */
    function drawBells(S) {
      var i, b;
      for (i = 0; i < S.bells.length; i++) {
        b = S.bells[i];
        var by = screenY(b.alt, S.camY) + Math.sin(b.ph * 1.7) * 3;
        if (by < -40 || by > H + 40) continue;
        var col = C.NOTE_COLORS[b.note];
        if (b.taken) {
          var k = b.pop / 0.55;
          if (k > 1) continue;
          ctx.save();
          ctx.globalAlpha = (1 - k) * 0.7;
          ctx.strokeStyle = col; ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.arc(b.x, by, 7 + k * 22, 0, 6.2832); ctx.stroke();
          ctx.restore();
          continue;
        }
        var pulse = 0.72 + 0.28 * Math.sin(b.ph * 2.6);
        var g1 = ctx.createRadialGradient(b.x, by, 1, b.x, by, 17);
        g1.addColorStop(0, hexA(col, 0.55 * pulse));
        g1.addColorStop(1, hexA(col, 0));
        ctx.fillStyle = g1;
        ctx.beginPath(); ctx.arc(b.x, by, 17, 0, 6.2832); ctx.fill();
        ctx.fillStyle = hexA(col, 0.92);
        ctx.beginPath(); ctx.arc(b.x, by, 4.2, 0, 6.2832); ctx.fill();
        // 小铃舌
        ctx.strokeStyle = hexA(col, 0.5); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(b.x, by + 4); ctx.lineTo(b.x, by + 9 + Math.sin(b.ph * 2.2) * 1.6); ctx.stroke();
      }
    }

    function hexA(hex, a) {
      var n = parseInt(hex.slice(1), 16);
      return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
    }

    /* ---------- 线 ---------- */
    function drawLine(S) {
      if (S.phase === "over") return;
      var x0 = ANCHOR_SX, y0 = ANCHOR_SY;
      var x1 = S.sx, y1 = S.sy;
      var tensionK = S.tension / C.TENSION_MAX;
      // 张力越大线越绷直；松的时候垂得厉害
      var sag = (1 - tensionK) * 0.30 + 0.04;
      var mx = (x0 + x1) * 0.5, my = (y0 + y1) * 0.5;
      var cx = mx + (x1 - x0) * 0.12, cy = my + (y0 - my) * sag;
      ctx.save();
      ctx.strokeStyle = "rgba(58,52,62," + (0.34 + tensionK * 0.34).toFixed(3) + ")";
      ctx.lineWidth = 0.9 + tensionK * 1.1;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(cx, cy, x1, y1);
      ctx.stroke();
      // 绷紧到危险时的一线暖光
      if (tensionK > 0.72) {
        ctx.strokeStyle = "rgba(255,150,90," + ((tensionK - 0.72) * 1.6).toFixed(3) + ")";
        ctx.lineWidth = 1.8;
        ctx.stroke();
      }
      ctx.restore();
    }

    /* ---------- 纸鸢 ---------- */
    function drawKiteShape(S, scale) {
      var k = null, i;
      for (i = 0; i < C.KITES.length; i++) if (C.KITES[i].id === S.kiteId) k = C.KITES[i];
      if (!k) k = C.KITES[0];
      var col = k.color;
      ctx.save();
      ctx.scale(scale || 1, scale || 1);
      ctx.rotate(S.thetaV * 0.55 + S.omega * 0.06);

      // 尾巴（先画，压在身体后面）
      var segs = 5, i2;
      ctx.strokeStyle = hexA(col, 0.62);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, 6);
      for (i2 = 1; i2 <= segs; i2++) {
        var ty = 6 + i2 * 8;
        var tx = Math.sin(tAnim * 5.2 - i2 * 0.9 + S.thetaV * 2) * (1.6 + i2 * 1.15);
        ctx.lineTo(tx, ty);
      }
      ctx.stroke();
      for (i2 = 1; i2 <= segs; i2 += 2) {
        var ty2 = 6 + i2 * 8;
        var tx2 = Math.sin(tAnim * 5.2 - i2 * 0.9 + S.thetaV * 2) * (1.6 + i2 * 1.15);
        ctx.fillStyle = hexA(col, 0.5);
        ctx.beginPath(); ctx.ellipse(tx2, ty2, 3.2, 1.9, 0, 0, 6.2832); ctx.fill();
      }

      var shape = k.shape;
      if (shape === "diamond") {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(0, -15); ctx.lineTo(11, 0); ctx.lineTo(0, 13); ctx.lineTo(-11, 0); ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(255,240,220,0.5)"; ctx.lineWidth = 0.9;
        ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(0, 13); ctx.moveTo(-11, 0); ctx.lineTo(11, 0); ctx.stroke();
      } else if (shape === "swallow") {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(0, -10); ctx.lineTo(15, -12); ctx.lineTo(6, 2); ctx.lineTo(0, 10);
        ctx.lineTo(-6, 2); ctx.lineTo(-15, -12); ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "rgba(255,245,230,0.72)";
        ctx.beginPath(); ctx.ellipse(0, -3, 3.4, 4.2, 0, 0, 6.2832); ctx.fill();
      } else if (shape === "wing") {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(0, -6); ctx.quadraticCurveTo(15, -17, 13, -1); ctx.quadraticCurveTo(8, 5, 0, 8);
        ctx.quadraticCurveTo(-8, 5, -13, -1); ctx.quadraticCurveTo(-15, -17, 0, -6); ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "rgba(255,246,232,0.6)";
        ctx.beginPath(); ctx.arc(-5, -5, 2.4, 0, 6.2832); ctx.arc(5, -5, 2.4, 0, 6.2832); ctx.fill();
      } else if (shape === "fish") {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(-14, 0); ctx.quadraticCurveTo(0, -12, 12, 0); ctx.quadraticCurveTo(0, 10, -14, 0); ctx.closePath();
        ctx.fill();
        ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(-20, -7); ctx.lineTo(-20, 7); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "rgba(255,250,240,0.85)";
        ctx.beginPath(); ctx.arc(7, -2, 1.7, 0, 6.2832); ctx.fill();
      } else if (shape === "crane") {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(0, -12); ctx.lineTo(16, -3); ctx.lineTo(2, 2); ctx.lineTo(-14, 6); ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = hexA(col, 0.9); ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(-6, -4); ctx.lineTo(-14, -12); ctx.stroke();
        ctx.fillStyle = "#B8443C";
        ctx.beginPath(); ctx.arc(-14, -13, 2.2, 0, 6.2832); ctx.fill();
      } else { /* dragon */
        for (i2 = 0; i2 < 4; i2++) {
          var dy = -12 + i2 * 8;
          var dx = Math.sin(tAnim * 3.4 - i2 * 0.8) * i2 * 1.5;
          ctx.fillStyle = hexA(col, 1 - i2 * 0.16);
          ctx.beginPath();
          ctx.ellipse(dx, dy, 8 - i2 * 1.2, 5 - i2 * 0.7, 0, 0, 6.2832);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    function drawKite(S) {
      if (S.phase === "over") return;
      ctx.save();
      ctx.translate(S.sx, S.sy);
      if (S.phase === "respawn") {
        // 断线后飘走：远去、淡出
        var k = S.respawnT / 2.6;
        ctx.globalAlpha = Math.max(0, 1 - k * 1.15);
        ctx.translate(k * 120, -k * 70);
        ctx.rotate(k * 1.9);
        ctx.scale(1 - k * 0.4, 1 - k * 0.4);
        drawKiteShape(S, 1);
        ctx.restore();
        return;
      }
      // 光晕
      var gk = ctx.createRadialGradient(0, 0, 2, 0, 0, 26);
      gk.addColorStop(0, "rgba(255,240,210,0.30)");
      gk.addColorStop(1, "rgba(255,240,210,0)");
      ctx.fillStyle = gk;
      ctx.beginPath(); ctx.arc(0, 0, 26, 0, 6.2832); ctx.fill();
      drawKiteShape(S, 1);
      ctx.restore();
    }

    /* ---------- 锚点（小舟） ---------- */
    function drawAnchor(S) {
      var wy = screenY(0, S.camY);
      if (wy > H + 60 || wy < -60) return;
      ctx.save();
      ctx.fillStyle = "rgba(52,44,50,0.82)";
      ctx.beginPath();
      ctx.moveTo(ANCHOR_SX - 26, wy);
      ctx.quadraticCurveTo(ANCHOR_SX, wy + 13, ANCHOR_SX + 26, wy);
      ctx.quadraticCurveTo(ANCHOR_SX, wy + 4, ANCHOR_SX - 26, wy);
      ctx.closePath(); ctx.fill();
      // 人（一个墨点）
      ctx.fillStyle = "rgba(40,34,42,0.9)";
      ctx.beginPath(); ctx.arc(ANCHOR_SX, wy - 8, 3.1, 0, 6.2832); ctx.fill();
      ctx.fillRect(ANCHOR_SX - 1.9, wy - 6, 3.8, 7);
      ctx.restore();
    }

    /* ---------- 前景特效 ---------- */
    function drawFx() {
      var i, p;
      for (i = 0; i < parts.length; i++) {
        p = parts[i];
        var a = 1 - p.life / p.max;
        ctx.fillStyle = hexA(p.c, a * 0.9);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.4 + a * 0.6), 0, 6.2832); ctx.fill();
      }
      for (i = 0; i < rings.length; i++) {
        var r = rings[i];
        var ra = 1 - r.life / r.max;
        ctx.strokeStyle = hexA(r.c, ra * 0.65);
        ctx.lineWidth = 1.6 * ra + 0.5;
        ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, 6.2832); ctx.stroke();
      }
      ctx.textAlign = "center";
      for (i = 0; i < floats.length; i++) {
        var f = floats[i];
        var fa = 1 - f.life / f.max;
        ctx.font = "600 15px 'PingFang SC','Microsoft YaHei',system-ui,sans-serif";
        ctx.fillStyle = hexA(f.c, fa * 0.95);
        ctx.fillText(f.t, f.x, f.y);
      }
      ctx.textAlign = "left";
    }

    /* ---------- 柔光 / 暗角 ---------- */
    function drawVignette(S) {
      var gr = ctx.createRadialGradient(W * 0.5, H * 0.44, H * 0.30, W * 0.5, H * 0.5, H * 0.78);
      gr.addColorStop(0, "rgba(0,0,0,0)");
      gr.addColorStop(1, "rgba(58,40,50,0.24)");
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, W, H);
    }

    /* ---------- 主绘制 ---------- */
    function draw(S, dt) {
      tAnim += dt;
      ctx.clearRect(0, 0, W, H);
      drawSky(S);
      drawGust(S);
      drawClouds(S);
      drawWater(S);
      drawBells(S);
      drawLine(S);
      drawAnchor(S);
      drawKite(S);
      stepFx(dt);
      drawFx();
      drawVignette(S);
    }

    return {
      resize: resize,
      draw: draw,
      pump: pump,
      screenY: screenY,
      fx: { parts: parts, rings: rings, floats: floats },
      clear: function () { parts.length = 0; rings.length = 0; floats.length = 0; }
    };
  }

  var API = { create: create, skyColorAt: skyColorAt };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  g.WindlineRender = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
