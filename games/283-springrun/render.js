/* ============================================================
   283-springrun / render.js
   《引泉 · 石上苔》—— 只读状态、不改状态
   Canvas 2D 画世界（青石壁 / 水 / 苔 / 花 / 潭），UI 交给 DOM
   ============================================================ */
(function (g) {
  'use strict';

  var W = 480, H = 900;
  var COLS = 7, ROWS = 10, CELL = 54, BX = 51, BY = 160;
  var POOL_Y = 700, POOL_BOT = 818;
  var BEAM_Y = 116, BEAM_H = 32;

  var BIT = [1, 2, 4, 8];
  var DC = [0, 1, 0, -1], DR = [-1, 0, 1, 0];

  // ---------- 色（中国传统色 · 雨过天青）----------
  var C = {
    paper: '#F2EFE4', paper2: '#E7E2D2',
    stoneT: '#D6DBD8', stoneB: '#AEB9B8',
    stoneEdge: 'rgba(74,90,98,0.22)',
    groove: '#96A4A4', grooveD: '#7A8A8B',
    wet: 'rgba(122,155,155,0.16)',
    water: '#A8D8D0', waterL: '#E2F4EF', waterD: '#7FBDB4',
    mossA: '#7FA86B', mossB: '#94BC7C', mossC: '#6B9159',
    rock: '#6E7C82', rockL: '#8D9AA0', rockD: '#57646A',
    ink: '#4A5A62',
    bud: '#8FA97A',
    flower: '#E4909B', flowerL: '#F7CACD', flowerC: '#F2E3A8',
    pool: '#2E4057', poolL: '#45596F',
    glow: 'rgba(255,255,255,0.85)'
  };

  // ---------- 小工具 ----------
  function mkCanvas(w, h) {
    var c = (typeof document !== 'undefined') ? document.createElement('canvas')
      : { width: 0, height: 0, getContext: function () { return null; } };
    c.width = w; c.height = h; return c;
  }
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function hash(a) {
    a = (a ^ 61) ^ (a >>> 16); a = a + (a << 3); a = a ^ (a >>> 4);
    a = Math.imul(a, 0x27d4eb2d); a = a ^ (a >>> 15);
    return ((a >>> 0) / 4294967296);
  }

  // ---------- 精灵 ----------
  var S = null;
  function ensureSprites() {
    if (S) return S;

    // 纸纹噪点
    var nt = mkCanvas(96, 96), nx = nt.getContext('2d');
    if (nx) {
      for (var i = 0; i < 1400; i++) {
        var v = hash(i * 977 + 3);
        nx.fillStyle = 'rgba(74,90,98,' + (0.012 + v * 0.030).toFixed(3) + ')';
        nx.fillRect((hash(i * 31) * 96) | 0, (hash(i * 17 + 5) * 96) | 0, 1, 1);
      }
    }

    // 柔光
    function radial(size, stops) {
      var c = mkCanvas(size, size), x = c.getContext('2d');
      if (!x) return c;
      var gr = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      for (var i = 0; i < stops.length; i++) gr.addColorStop(stops[i][0], stops[i][1]);
      x.fillStyle = gr; x.fillRect(0, 0, size, size);
      return c;
    }

    // 每格苔藓斑点（确定性）
    var blobs = new Array(COLS * ROWS);
    for (var k = 0; k < COLS * ROWS; k++) {
      var arr = [];
      for (var b = 0; b < 7; b++) {
        var h1 = hash(k * 131 + b * 7 + 1), h2 = hash(k * 197 + b * 13 + 2), h3 = hash(k * 251 + b * 29 + 3);
        arr.push({
          dx: (h1 - 0.5) * CELL * 0.82,
          dy: (h2 - 0.5) * CELL * 0.82,
          r: 5.5 + h3 * 9,
          ci: b % 3
        });
      }
      blobs[k] = arr;
    }

    S = {
      noise: nt,
      soft: radial(128, [[0, 'rgba(255,255,255,0.85)'], [0.55, 'rgba(255,255,255,0.22)'], [1, 'rgba(255,255,255,0)']]),
      bloomGlow: radial(120, [[0, 'rgba(244,176,183,0.62)'], [0.4, 'rgba(228,144,155,0.22)'], [1, 'rgba(228,144,155,0)']]),
      mossGlow: radial(72, [[0, 'rgba(160,200,130,0.42)'], [1, 'rgba(160,200,130,0)']]),
      blobs: blobs
    };
    return S;
  }

  // ---------- 视图状态 ----------
  var V = null;
  function reset(st) {
    ensureSprites();
    V = {
      t: 0, parts: [], ripples: [], floats: [],
      nudges: [], flash: 0, lastBloom: -99, boardShake: 0
    };
    if (st) st.events.length = 0;
    return V;
  }

  // ---------- 粒子 ----------
  var MOSS_COLS = [C.mossA, C.mossB, C.mossC];
  function puff(x, y, n, col, spd, life, size) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, s = spd * (0.35 + Math.random() * 0.9);
      V.parts.push({
        x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - spd * 0.35,
        r: size * (0.6 + Math.random() * 0.8), a: 1, life: life * (0.7 + Math.random() * 0.6),
        max: life, col: col, g: 90
      });
    }
  }
  function ring(x, y, col, r0, r1, life) {
    V.parts.push({ ring: true, x: x, y: y, r: r0, r1: r1, a: 1, life: life, max: life, col: col });
  }
  function ripple(x, w) { V.ripples.push({ x: x, r: 2, a: 0.85, w: w || 1 }); }
  function float(x, y, txt, col, size) {
    V.floats.push({ x: x, y: y, txt: txt, col: col, size: size || 13, life: 1.05, max: 1.05 });
  }
  function nudge(c, r) { if (V) V.nudges.push({ c: c, r: r, t: 0.34 }); }

  // ---------- 事件消费 ----------
  function consume(st) {
    var evs = st.events;
    if (!evs.length) return;
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i];
      switch (e.type) {
        case 'moss': {
          var x = BX + e.a * CELL + CELL / 2, y = BY + e.b * CELL + CELL / 2;
          puff(x, y, 4, MOSS_COLS[(e.a + e.b) % 3], 26, 0.7, 2.6);
          break;
        }
        case 'bloom': {
          var bx = BX + e.a * CELL + CELL / 2, by = BY + e.b * CELL + CELL / 2;
          puff(bx, by, 14, C.flower, 92, 1.0, 3.1);
          puff(bx, by, 6, C.flowerL, 62, 0.9, 2.4);
          ring(bx, by, 'rgba(228,144,155,0.85)', 8, 46, 0.62);
          float(bx, by - 20, '+' + e.d, C.flower, 17);
          if (e.c >= 2) float(bx, by - 42, '连开 ×' + e.c, C.flowerC, 14);
          V.flash = Math.min(1, V.flash + 0.30);
          break;
        }
        case 'plink': ripple(e.a, 1); puff(e.a, e.b, 4, C.waterL, 48, 0.42, 2.0); break;
        case 'splash': puff(e.a, e.b, 5, C.waterD, 52, 0.45, 2.0); break;
        case 'soak': puff(e.a, e.b, 3, 'rgba(122,138,138,0.7)', 22, 0.6, 2.2); break;
        case 'sip': {
          var sx = BX + e.a * CELL + CELL / 2, sy = BY + e.b * CELL + CELL / 2 + 4;
          puff(sx, sy, 2, C.waterL, 30, 0.35, 1.7);
          break;
        }
        case 'turn': {
          var tx = BX + e.a * CELL + CELL / 2, ty = BY + e.b * CELL + CELL / 2;
          puff(tx, ty, 3, 'rgba(150,164,164,0.75)', 30, 0.4, 2.0);
          break;
        }
        case 'emit': puff(e.a, e.b, 1, C.water, 14, 0.3, 1.6); break;
      }
    }
    evs.length = 0;
  }

  // ---------- 背景 ----------
  function drawBG(ctx) {
    ctx.fillStyle = C.paper;
    ctx.fillRect(0, 0, W, H);
    // 顶部柔光
    ctx.globalAlpha = 0.55;
    ctx.drawImage(S.soft, 240 - 200, 40 - 160, 400, 400);
    ctx.globalAlpha = 1;
    // 纸纹
    var pat = ctx.createPattern(S.noise, 'repeat');
    if (pat) { ctx.fillStyle = pat; ctx.fillRect(0, 0, W, H); }
  }

  // ---------- 石梁 + 泉眼 ----------
  function drawBeam(ctx, st) {
    var x0 = BX - 20, w = COLS * CELL + 40;
    var gr = ctx.createLinearGradient(0, BEAM_Y, 0, BEAM_Y + BEAM_H);
    gr.addColorStop(0, C.stoneT); gr.addColorStop(1, '#9BA7A7');
    ctx.fillStyle = gr;
    rr(ctx, x0, BEAM_Y, w, BEAM_H, 9); ctx.fill();
    ctx.strokeStyle = C.stoneEdge; ctx.lineWidth = 1; ctx.stroke();
    // 底缘暗线
    ctx.fillStyle = 'rgba(74,90,98,0.16)';
    ctx.fillRect(x0 + 2, BEAM_Y + BEAM_H - 3, w - 4, 3);

    // 泉眼：石螭首
    var cx = BX + st.springCol * CELL + CELL / 2;
    ctx.beginPath();
    ctx.moveTo(cx - 15, BEAM_Y + BEAM_H - 2);
    ctx.lineTo(cx + 15, BEAM_Y + BEAM_H - 2);
    ctx.lineTo(cx + 9, BY - 1);
    ctx.lineTo(cx - 9, BY - 1);
    ctx.closePath();
    var gr2 = ctx.createLinearGradient(0, BEAM_Y + BEAM_H, 0, BY);
    gr2.addColorStop(0, C.rockL); gr2.addColorStop(1, C.rockD);
    ctx.fillStyle = gr2; ctx.fill();
    ctx.strokeStyle = 'rgba(74,90,98,0.32)'; ctx.lineWidth = 1; ctx.stroke();
    // 出水口
    ctx.fillStyle = '#3E4C52';
    ctx.beginPath(); ctx.ellipse(cx, BY - 2, 6.5, 3.2, 0, 0, Math.PI * 2); ctx.fill();

    // 蓄势的水珠（下一次出滴的预告）
    if (!st.over && st.emitted < st.supply) {
      var frac = Math.max(0, Math.min(1, st.emitT / 0.42));
      var br = 1.2 + frac * 3.6;
      ctx.fillStyle = C.water;
      ctx.beginPath(); ctx.arc(cx, BY - 2 + br * 0.4, br, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C.waterL;
      ctx.beginPath(); ctx.arc(cx - br * 0.3, BY - 3 + br * 0.2, br * 0.38, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ---------- 潭 ----------
  function drawPool(ctx) {
    var gr = ctx.createLinearGradient(0, POOL_Y, 0, POOL_BOT);
    gr.addColorStop(0, C.poolL); gr.addColorStop(1, C.pool);
    ctx.fillStyle = gr;
    ctx.fillRect(0, POOL_Y, W, POOL_BOT - POOL_Y);
    // 水面亮边
    ctx.fillStyle = 'rgba(168,216,208,0.55)';
    ctx.fillRect(0, POOL_Y, W, 2);
    ctx.fillStyle = 'rgba(168,216,208,0.16)';
    ctx.fillRect(0, POOL_Y + 2, W, 5);
    // 波光
    ctx.strokeStyle = 'rgba(200,232,226,0.16)';
    ctx.lineWidth = 1.4;
    for (var i = 0; i < 4; i++) {
      var y = POOL_Y + 16 + i * 22;
      ctx.beginPath();
      for (var x = 0; x <= W; x += 12) {
        var yy = y + Math.sin((x * 0.035) + V.t * (0.7 + i * 0.2) + i) * 1.8;
        if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    // 涟漪
    for (var k = V.ripples.length - 1; k >= 0; k--) {
      var rp = V.ripples[k];
      ctx.strokeStyle = 'rgba(214,240,235,' + (rp.a * 0.7).toFixed(3) + ')';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(rp.x, POOL_Y + 4, rp.r, rp.r * 0.30, 0, 0, Math.PI * 2);
      ctx.stroke();
      rp.r += 62 * 0.016 * rp.w; rp.a -= 1.7 * 0.016;
      if (rp.a <= 0) V.ripples.splice(k, 1);
    }
  }

  // ---------- 单格 ----------
  function drawCell(ctx, st, i, dt) {
    var c = i % COLS, r = (i / COLS) | 0;
    var cell = st.cells[i];
    var x = BX + c * CELL, y = BY + r * CELL;
    var cx = x + CELL / 2, cy = y + CELL / 2;

    // 被点不动时的轻微抖动
    var ox = 0, oy = 0;
    for (var n = 0; n < V.nudges.length; n++) {
      var nd = V.nudges[n];
      if (nd.c === c && nd.r === r) { ox = Math.sin(V.t * 70) * nd.t * 8; break; }
    }

    ctx.save();
    ctx.translate(ox, oy);

    // 石面
    rr(ctx, x + 2, y + 2, CELL - 4, CELL - 4, 8);
    ctx.fillStyle = cell.fixed ? '#BCC3BA' : '#C6CECC';
    ctx.fill();
    // 上亮下暗
    var gr = ctx.createLinearGradient(0, y + 2, 0, y + CELL - 2);
    gr.addColorStop(0, 'rgba(255,255,255,0.42)');
    gr.addColorStop(0.55, 'rgba(255,255,255,0)');
    gr.addColorStop(1, 'rgba(74,90,98,0.14)');
    ctx.fillStyle = gr; ctx.fill();

    ctx.save();
    rr(ctx, x + 2, y + 2, CELL - 4, CELL - 4, 8);
    ctx.clip();

    // 湿痕
    if (cell.wet) {
      ctx.fillStyle = C.wet;
      ctx.fillRect(x, y, CELL, CELL);
    }

    // 苔
    if (cell.moss > 0.02) {
      var bl = S.blobs[i];
      var grow = cell.moss;
      for (var b = 0; b < bl.length; b++) {
        var o = bl[b];
        ctx.globalAlpha = Math.min(1, grow * 1.25) * 0.92;
        ctx.fillStyle = MOSS_COLS[o.ci];
        ctx.beginPath();
        ctx.arc(cx + o.dx, cy + o.dy, o.r * (0.35 + grow * 0.65), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (cell.mossy) {
        ctx.globalAlpha = 0.30 + Math.sin(V.t * 1.2 + i) * 0.06;
        ctx.drawImage(S.mossGlow, cx - 36, cy - 36, 72, 72);
        ctx.globalAlpha = 1;
      }
    }

    if (cell.kind === 'rock') {
      drawRock(ctx, cx, cy, i);
    } else if (cell.kind === 'seed') {
      drawSeed(ctx, cell, cx, cy, i);
      drawGrooves(ctx, cell, cx, cy, 15, true);
    } else {
      var open = st.__open ? st.__open[i] : 0;
      drawGrooves(ctx, cell, cx, cy, open, false);
    }

    ctx.restore();

    // 描边
    rr(ctx, x + 2, y + 2, CELL - 4, CELL - 4, 8);
    ctx.strokeStyle = C.stoneEdge; ctx.lineWidth = 1; ctx.stroke();

    // 刚转过的暖边
    if (cell.lit > 0.01) {
      rr(ctx, x + 2.5, y + 2.5, CELL - 5, CELL - 5, 8);
      ctx.strokeStyle = 'rgba(228,144,155,' + (cell.lit * 0.75).toFixed(3) + ')';
      ctx.lineWidth = 2; ctx.stroke();
    }
    // 固定件标记（苔石）
    if (cell.fixed) {
      ctx.fillStyle = C.mossC;
      ctx.beginPath();
      ctx.moveTo(x + CELL - 6, y + 5);
      ctx.lineTo(x + CELL - 6, y + 13);
      ctx.lineTo(x + CELL - 13, y + 5);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  // 水渠刻槽
  function drawGrooves(ctx, cell, cx, cy, open, isSeed) {
    var half = CELL / 2;
    var gw = 15;
    ctx.lineCap = 'round';
    // 阴影层
    ctx.strokeStyle = 'rgba(74,90,98,0.20)';
    ctx.lineWidth = gw + 3;
    for (var s = 0; s < 4; s++) {
      if (!(open & BIT[s])) continue;
      ctx.beginPath();
      ctx.moveTo(cx, cy + 1.5);
      ctx.lineTo(cx + DC[s] * half, cy + DR[s] * half + 1.5);
      ctx.stroke();
    }
    // 槽体
    ctx.strokeStyle = C.groove;
    ctx.lineWidth = gw;
    for (var s2 = 0; s2 < 4; s2++) {
      if (!(open & BIT[s2])) continue;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + DC[s2] * half, cy + DR[s2] * half);
      ctx.stroke();
    }
    // 水
    if (cell.glow > 0.02) {
      var a = Math.min(1, cell.glow);
      ctx.globalAlpha = a * 0.92;
      ctx.strokeStyle = C.water;
      ctx.lineWidth = gw - 3;
      for (var s3 = 0; s3 < 4; s3++) {
        if (!(open & BIT[s3])) continue;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + DC[s3] * half, cy + DR[s3] * half);
        ctx.stroke();
      }
      ctx.globalAlpha = a * 0.75;
      ctx.strokeStyle = C.waterL;
      ctx.lineWidth = 3.2;
      for (var s4 = 0; s4 < 4; s4++) {
        if (!(open & BIT[s4])) continue;
        ctx.beginPath();
        ctx.moveTo(cx - DC[s4] * 3, cy - DR[s4] * 3);
        ctx.lineTo(cx + DC[s4] * (half - 2), cy + DR[s4] * (half - 2));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    // 中心枢纽
    ctx.fillStyle = cell.glow > 0.02 ? C.water : C.groove;
    ctx.beginPath(); ctx.arc(cx, cy, isSeed ? 0 : 4.2, 0, Math.PI * 2); ctx.fill();
  }

  function drawRock(ctx, cx, cy, i) {
    var pts = 7, rad = CELL * 0.40;
    ctx.beginPath();
    for (var k = 0; k <= pts; k++) {
      var a = (k / pts) * Math.PI * 2;
      var rr2 = rad * (0.82 + hash(i * 53 + k) * 0.30);
      var px = cx + Math.cos(a) * rr2, py = cy + Math.sin(a) * rr2;
      if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    var gr = ctx.createLinearGradient(cx - rad, cy - rad, cx + rad, cy + rad);
    gr.addColorStop(0, C.rockL); gr.addColorStop(1, C.rockD);
    ctx.fillStyle = gr; ctx.fill();
    ctx.strokeStyle = 'rgba(40,52,58,0.35)'; ctx.lineWidth = 1.2; ctx.stroke();
    // 高光与苔点
    ctx.fillStyle = 'rgba(255,255,255,0.20)';
    ctx.beginPath(); ctx.ellipse(cx - rad * 0.34, cy - rad * 0.38, rad * 0.28, rad * 0.18, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(127,168,107,0.55)';
    ctx.beginPath(); ctx.arc(cx + rad * 0.30, cy + rad * 0.34, rad * 0.20, 0, Math.PI * 2); ctx.fill();
  }

  function drawSeed(ctx, cell, cx, cy, i) {
    var R = 16;
    // 石碗
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = '#BCC6C5'; ctx.fill();
    ctx.strokeStyle = 'rgba(74,90,98,0.35)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, R - 4, 0, Math.PI * 2);
    ctx.fillStyle = '#9FABAB'; ctx.fill();

    if (cell.bloomed) {
      var bl = Math.min(1, cell.bloom);
      var sc = 0.5 + bl * 0.5;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.globalAlpha = 0.9;
      ctx.drawImage(S.bloomGlow, -46, -46, 92, 92);
      ctx.globalAlpha = 1;
      ctx.rotate(Math.sin(V.t * 0.7 + i) * 0.10 + (1 - bl) * 0.5);
      ctx.scale(sc, sc);
      // 花瓣
      for (var p = 0; p < 5; p++) {
        var a = (p / 5) * Math.PI * 2 - Math.PI / 2;
        ctx.save();
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(7, -7, 8, -15, 0, -17);
        ctx.bezierCurveTo(-8, -15, -7, -7, 0, 0);
        ctx.closePath();
        ctx.fillStyle = C.flower; ctx.fill();
        ctx.strokeStyle = 'rgba(180,90,102,0.45)'; ctx.lineWidth = 0.8; ctx.stroke();
        ctx.restore();
      }
      ctx.beginPath(); ctx.arc(0, 0, 4.4, 0, Math.PI * 2);
      ctx.fillStyle = C.flowerC; ctx.fill();
      ctx.restore();
      return;
    }

    // 蓄水
    var f = Math.min(1, cell.fill / 5);
    if (f > 0) {
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, R - 4.5, 0, Math.PI * 2); ctx.clip();
      var wy = cy + (R - 4.5) - f * (R - 4.5) * 2;
      ctx.fillStyle = 'rgba(168,216,208,0.85)';
      ctx.fillRect(cx - R, wy, R * 2, R * 2);
      ctx.strokeStyle = 'rgba(226,244,239,0.9)'; ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (var x2 = -R + 5; x2 <= R - 5; x2 += 5) {
        var yy = wy + Math.sin((x2 * 0.4) + V.t * 3 + i) * 1.2;
        if (x2 === -R + 5) ctx.moveTo(cx + x2, yy); else ctx.lineTo(cx + x2, yy);
      }
      ctx.stroke();
      ctx.restore();
    }
    // 花苞：随蓄水长大
    var gs = 0.55 + f * 0.55;
    ctx.save();
    ctx.translate(cx, cy - 1);
    ctx.scale(gs, gs);
    ctx.strokeStyle = C.bud; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 9); ctx.lineTo(0, 0); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-1.5, -9); ctx.quadraticCurveTo(-7, -3, 0, 0);
    ctx.quadraticCurveTo(7, -3, 1.5, -9); ctx.closePath();
    ctx.fillStyle = C.bud; ctx.fill();
    ctx.fillStyle = 'rgba(226,244,213,0.55)';
    ctx.beginPath(); ctx.arc(-1.8, -5.5, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // 进度点
    for (var d = 0; d < 5; d++) {
      ctx.beginPath();
      ctx.arc(cx - 8 + d * 4, cy + R + 4.5, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = d < cell.fill ? C.waterD : 'rgba(122,138,138,0.35)';
      ctx.fill();
    }
  }

  // ---------- 水滴 ----------
  function dropPos(d) {
    var cx = BX + d.c * CELL + CELL / 2;
    if (d.mode === 'fall') return { x: cx, y: d.y };
    var cy = BY + d.r * CELL + CELL / 2;
    if (d.exit < 0) return { x: cx, y: cy };
    var half = CELL / 2;
    var ex = cx + DC[d.side] * half, ey = cy + DR[d.side] * half;
    var xx = cx + DC[d.exit] * half, yy = cy + DR[d.exit] * half;
    var t = Math.min(1, Math.max(0, d.t));
    if (t < 0.5) {
      var u = t * 2;
      return { x: ex + (cx - ex) * u, y: ey + (cy - ey) * u };
    }
    var u2 = (t - 0.5) * 2;
    return { x: cx + (xx - cx) * u2, y: cy + (yy - cy) * u2 };
  }

  function drawDrop(ctx, d) {
    var p = dropPos(d);
    // 拖尾
    for (var k = 2; k >= 1; k--) {
      var q;
      if (d.mode === 'fall') q = { x: p.x, y: p.y - k * 7 };
      else {
        var tt = Math.max(0, d.t - k * 0.09);
        var sv = d.t; d.t = tt; q = dropPos(d); d.t = sv;
      }
      ctx.globalAlpha = 0.30 / k;
      ctx.fillStyle = C.water;
      ctx.beginPath(); ctx.arc(q.x, q.y, 4.4 - k * 0.9, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (d.mode === 'fall') {
      ctx.fillStyle = C.water;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 4.0, 6.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C.waterL;
      ctx.beginPath(); ctx.arc(p.x - 1.3, p.y - 1.8, 1.7, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = C.water;
      ctx.beginPath(); ctx.arc(p.x, p.y, 5.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C.waterL;
      ctx.beginPath(); ctx.arc(p.x - 1.5, p.y - 1.9, 2.0, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ---------- 粒子更新 ----------
  function stepParts(dt) {
    var i, p;
    for (i = V.parts.length - 1; i >= 0; i--) {
      p = V.parts[i];
      p.life -= dt;
      if (p.life <= 0) { V.parts.splice(i, 1); continue; }
      if (p.ring) { p.r += (p.r1 - p.r) * Math.min(1, dt * 6); p.a = p.life / p.max; continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt;
      p.vx *= (1 - dt * 1.6);
      p.a = Math.min(1, p.life / p.max * 1.6);
    }
    if (V.parts.length > 320) V.parts.splice(0, V.parts.length - 320);
    for (i = V.floats.length - 1; i >= 0; i--) {
      var f = V.floats[i];
      f.life -= dt; f.y -= dt * 26;
      if (f.life <= 0) V.floats.splice(i, 1);
    }
    for (i = V.nudges.length - 1; i >= 0; i--) {
      V.nudges[i].t -= dt;
      if (V.nudges[i].t <= 0) V.nudges.splice(i, 1);
    }
    if (V.flash > 0) V.flash = Math.max(0, V.flash - dt * 1.9);
  }

  function drawParts(ctx) {
    var i, p;
    for (i = 0; i < V.parts.length; i++) {
      p = V.parts[i];
      ctx.globalAlpha = p.a;
      if (p.ring) {
        ctx.strokeStyle = p.col; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.fillStyle = p.col;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    for (i = 0; i < V.floats.length; i++) {
      var f = V.floats[i];
      var k = f.life / f.max;
      ctx.globalAlpha = Math.min(1, k * 1.8);
      ctx.font = '700 ' + f.size + 'px "KaiTi","STKaiti","PingFang SC",serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(242,239,228,0.9)';
      ctx.strokeText(f.txt, f.x, f.y);
      ctx.fillStyle = f.col; ctx.fillText(f.txt, f.x, f.y);
      ctx.globalAlpha = 1;
    }
  }

  // ---------- 主绘制 ----------
  function draw(ctx, st, dt) {
    if (!V) reset(st);
    V.t += dt;
    ensureSprites();

    // 缓存开口掩码
    st.__open = st.__open || new Array(st.cells.length);
    var G = g.SpringGame;
    for (var i = 0; i < st.cells.length; i++) st.__open[i] = G.openings(st.cells[i]);

    consume(st);
    stepParts(dt);

    drawBG(ctx);
    drawBeam(ctx, st);
    drawPool(ctx);

    for (var k = 0; k < st.cells.length; k++) drawCell(ctx, st, k, dt);
    for (var d = 0; d < st.drops.length; d++) drawDrop(ctx, st.drops[d]);
    drawParts(ctx);

    if (V.flash > 0.01) {
      ctx.fillStyle = 'rgba(255,248,240,' + (V.flash * 0.34) + ')';
      ctx.fillRect(0, 0, W, H);
    }
  }

  g.SpringRender = {
    draw: draw, reset: reset, nudge: nudge,
    W: W, H: H
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
