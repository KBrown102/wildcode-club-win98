/* 238 守塔 · 一路挡住 —— 渲染 / 输入 / 声音层 */
(function () {
  'use strict';

  var TD = (typeof window !== 'undefined' ? window.TD : null) || (typeof self !== 'undefined' ? self.TD : null);
  var COLS = TD.COLS, ROWS = TD.ROWS, TOWERS = TD.TOWERS;
  var CELL = 48, W = COLS * CELL, H = ROWS * CELL;

  var cv = document.getElementById('board');
  var ctx = cv.getContext('2d');
  var $ = function (id) { return document.getElementById(id); };
  var hWave = $('hWave'), hGold = $('hGold'), hLife = $('hLife'), hKill = $('hKill');
  var btnCall = $('btnCall'), btnSpeed = $('btnSpeed'), btnMute = $('btnMute');
  var panel = $('panel'), pInfo = $('pInfo'), btnUp = $('btnUp'), btnSell = $('btnSell');
  var startVeil = $('startVeil'), overVeil = $('overVeil'), btnStart = $('btnStart'), btnRetry = $('btnRetry');
  var oWave = $('oWave'), oSub = $('oSub'), tipEl = $('tip');
  var shopBtns = Array.prototype.slice.call(document.querySelectorAll('.tw'));

  var g = new TD.Game();
  var running = false, dtMul = 1, scale = 1, dpr = 1;
  var pending = null, sel = null, hover = null;
  var parts = [], rings = [], texts = [];
  var bestWave = 0;
  try { bestWave = parseInt(localStorage.getItem('td_best_wave') || '0', 10) || 0; } catch (e) { bestWave = 0; }

  // ── 声音（五声音阶，轻） ─────────────────────────────────────────
  var PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
  var actx = null, muted = false, lastShot = 0;
  function ac() {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; }
    }
    return actx;
  }
  function tone(semi, dur, wave, vol) {
    if (muted) return;
    var a = ac(); if (!a) return;
    try {
      var o = a.createOscillator(), gn = a.createGain();
      o.type = wave || 'sine';
      o.frequency.value = 220 * Math.pow(2, semi / 12);
      gn.gain.setValueAtTime(0, a.currentTime);
      gn.gain.linearRampToValueAtTime(vol == null ? 0.07 : vol, a.currentTime + 0.012);
      gn.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + (dur || 0.18));
      o.connect(gn); gn.connect(a.destination);
      o.start(); o.stop(a.currentTime + (dur || 0.18) + 0.02);
    } catch (e) { }
  }
  function sfx(kind, k) {
    if (muted) return;
    if (kind === 'shoot') {
      var now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      if (now - lastShot < 95) return;
      lastShot = now;
      tone(PENTA[(k || 0) % PENTA.length] + 24, 0.06, 'triangle', 0.024);
    } else if (kind === 'kill') {
      tone(PENTA[(k || 0) % PENTA.length] + 12, 0.16, 'sine', 0.055);
    } else if (kind === 'boom') {
      tone(PENTA[0] + 3, 0.22, 'sawtooth', 0.03);
    } else if (kind === 'place') {
      tone(PENTA[2] + 12, 0.14, 'sine', 0.07);
    } else if (kind === 'up') {
      tone(PENTA[3] + 12, 0.1, 'sine', 0.07);
      setTimeout(function () { tone(PENTA[5] + 12, 0.16, 'sine', 0.07); }, 70);
    } else if (kind === 'leak') {
      tone(PENTA[0] - 12, 0.34, 'sine', 0.09);
    } else if (kind === 'clear') {
      [0, 2, 4, 7].forEach(function (s, i) {
        setTimeout(function () { tone(PENTA[i] + 12, 0.24, 'sine', 0.06); }, i * 80);
      });
    } else if (kind === 'wave') {
      tone(PENTA[1], 0.24, 'triangle', 0.05);
    } else if (kind === 'over') {
      [9, 7, 4, 0].forEach(function (s, i) {
        setTimeout(function () { tone(s, 0.36, 'sine', 0.07); }, i * 130);
      });
    }
  }

  // ── 尺寸自适应 ─────────────────────────────────────────────────
  function fit() {
    var stage = $('stage');
    var sw = Math.max(120, stage.clientWidth - 12);
    var sh = Math.max(120, stage.clientHeight - 12);
    scale = Math.min(sw / W, sh / H);
    if (scale > 1.7) scale = 1.7;
    dpr = Math.min(2.5, (window.devicePixelRatio || 1));
    cv.style.width = Math.round(W * scale) + 'px';
    cv.style.height = Math.round(H * scale) + 'px';
    cv.width = Math.round(W * scale * dpr);
    cv.height = Math.round(H * scale * dpr);
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  }
  window.addEventListener('resize', fit);

  // ── 粒子 / 飘字 ────────────────────────────────────────────────
  function spark(x, y, color, n, spd) {
    n = n || 6;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, v = (spd || 90) * (0.4 + Math.random() * 0.8);
      parts.push({ x: x * CELL, y: y * CELL, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.36 + Math.random() * 0.3, t: 0, c: color });
    }
    if (parts.length > 420) parts.splice(0, parts.length - 420);
  }
  function ring(x, y, r, color) {
    rings.push({ x: x * CELL, y: y * CELL, r: 4, rm: r * CELL, life: 0.4, t: 0, c: color });
    if (rings.length > 60) rings.shift();
  }
  function float(x, y, s, color, size) {
    texts.push({ x: x * CELL, y: y * CELL, s: s, life: 0.75, t: 0, c: color, size: size || 12 });
    if (texts.length > 60) texts.splice(0, texts.length - 60);
  }

  function drain() {
    for (var i = 0; i < g.events.length; i++) {
      var e = g.events[i];
      if (e.t === 'shoot') {
        sfx('shoot', e.lvl);
        spark(e.x + Math.cos(e.aim) * 0.3, e.y + Math.sin(e.aim) * 0.3, TOWERS[e.type].color, 2, 50);
      } else if (e.t === 'hit') {
        spark(e.x, e.y, e.type === 'frost' ? '#bff0ff' : '#ffe6b0', 3, 70);
      } else if (e.t === 'dmg') {
        if (e.v >= 12) float(e.x, e.y, '-' + e.v, '#ffd9a0', 11);
      } else if (e.t === 'boom') {
        ring(e.x, e.y, e.r + 0.35, '#ffb26b'); spark(e.x, e.y, '#ffcf94', 10, 130); sfx('boom');
      } else if (e.t === 'kill') {
        spark(e.x, e.y, '#ffe08a', 10, 120); float(e.x, e.y - 0.3, '+' + e.gold, '#ffd479', 13);
        sfx('kill', g.kills);
      } else if (e.t === 'leak') {
        ring(e.x, e.y, 1.3, '#ff7d92'); float(e.x, e.y - 0.4, '-' + e.dmg + ' 生命', '#ff8b9a', 14); sfx('leak');
        shakeT = 0.35;
      } else if (e.t === 'place') {
        ring(e.x, e.y, 1.0, TOWERS[e.type].color); sfx('place');
      } else if (e.t === 'up') {
        ring(e.x, e.y, 1.2, '#ffe08a'); spark(e.x, e.y, '#ffe08a', 10, 100); sfx('up');
      } else if (e.t === 'sell') {
        float(e.x, e.y, '+' + e.gold, '#ffd479', 13);
      } else if (e.t === 'bonus') {
        float(g.path[g.path.length - 1].x + 0.5, g.path[g.path.length - 1].y - 0.2, '+' + e.gold + ' 提前奖励', '#ffd479', 13);
      } else if (e.t === 'clear') {
        sfx('clear');
        float(COLS / 2, ROWS / 2 - 0.6, '第 ' + e.wave + ' 波守住了  +' + e.gold, '#9ce8b0', 16);
      } else if (e.t === 'wave') {
        sfx('wave');
      } else if (e.t === 'over') {
        sfx('over'); onOver();
      }
    }
    g.events.length = 0;
  }

  // ── 绘制 ───────────────────────────────────────────────────────
  var shakeT = 0;

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawGround() {
    var gr = ctx.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#18202b');
    gr.addColorStop(1, '#121821');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    // 可建造空地的浅垫
    for (var y = 0; y < ROWS; y++) {
      for (var x = 0; x < COLS; x++) {
        if (g.blocked[y * COLS + x]) continue;
        ctx.fillStyle = ((x + y) % 2 === 0) ? 'rgba(255,255,255,0.030)' : 'rgba(255,255,255,0.016)';
        roundRect(x * CELL + 3, y * CELL + 3, CELL - 6, CELL - 6, 7); ctx.fill();
      }
    }
  }

  function pathStroke(width, color, dash, offset) {
    ctx.beginPath();
    for (var i = 0; i < g.path.length; i++) {
      var c = g.path[i], px = (c.x + 0.5) * CELL, py = (c.y + 0.5) * CELL;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.lineWidth = width; ctx.strokeStyle = color;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (dash) { ctx.setLineDash(dash); ctx.lineDashOffset = offset || 0; } else ctx.setLineDash([]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawPath(t) {
    pathStroke(CELL * 0.86, '#26303f', null, 0);
    pathStroke(CELL * 0.66, '#33404f', null, 0);
    pathStroke(3, 'rgba(190,210,235,0.20)', [10, 12], -t * 34);
    // 入口
    var a = g.path[0], ax = (a.x + 0.5) * CELL, ay = (a.y + 0.5) * CELL;
    ctx.save();
    ctx.globalAlpha = 0.55 + 0.35 * Math.sin(t * 3);
    ctx.fillStyle = '#7fb2ff';
    ctx.beginPath();
    ctx.moveTo(ax - 14, ay - 9); ctx.lineTo(ax - 2, ay); ctx.lineTo(ax - 14, ay + 9);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    // 终点：水晶
    var b = g.path[g.path.length - 1], bx = (b.x + 0.5) * CELL, by = (b.y + 0.5) * CELL;
    var pulse = 1 + 0.08 * Math.sin(t * 2.4);
    ctx.save();
    ctx.translate(bx, by); ctx.scale(pulse, pulse);
    var gg = ctx.createRadialGradient(0, 0, 2, 0, 0, 22);
    gg.addColorStop(0, 'rgba(140,230,255,0.55)');
    gg.addColorStop(1, 'rgba(140,230,255,0)');
    ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(0, 0, 22, 0, 7); ctx.fill();
    ctx.fillStyle = g.lives > 6 ? '#8ce6ff' : '#ff9aa8';
    ctx.beginPath();
    ctx.moveTo(0, -14); ctx.lineTo(10, 0); ctx.lineTo(0, 14); ctx.lineTo(-10, 0);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(4, -2); ctx.lineTo(0, 4); ctx.lineTo(-4, -2); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawTower(tw, t) {
    var x = (tw.cx + 0.5) * CELL, y = (tw.cy + 0.5) * CELL;
    var col = TOWERS[tw.type].color;
    ctx.save();
    ctx.translate(x, y);
    // 底座
    ctx.fillStyle = '#232e3d';
    roundRect(-CELL * 0.36, -CELL * 0.36, CELL * 0.72, CELL * 0.72, 9); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1; ctx.stroke();
    if (tw.flash > 0) {
      ctx.globalAlpha = tw.flash * 0.5;
      ctx.fillStyle = col;
      roundRect(-CELL * 0.36, -CELL * 0.36, CELL * 0.72, CELL * 0.72, 9); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.rotate(tw.aim);
    if (tw.type === 'arrow') {
      ctx.fillStyle = col;
      roundRect(-4, -4.5, 20, 9, 4); ctx.fill();
      ctx.beginPath(); ctx.moveTo(16, -7); ctx.lineTo(24, 0); ctx.lineTo(16, 7); ctx.closePath(); ctx.fill();
    } else if (tw.type === 'cannon') {
      ctx.fillStyle = col;
      roundRect(-6, -7, 24, 14, 5); ctx.fill();
      ctx.fillStyle = '#8a5a2e';
      ctx.beginPath(); ctx.arc(18, 0, 6, 0, 7); ctx.fill();
    } else {
      ctx.fillStyle = col;
      for (var i = 0; i < 3; i++) {
        ctx.save(); ctx.rotate((i - 1) * 0.5);
        ctx.beginPath(); ctx.moveTo(2, -3.5); ctx.lineTo(19, 0); ctx.lineTo(2, 3.5); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
    ctx.rotate(-tw.aim);
    ctx.fillStyle = '#171e28';
    ctx.beginPath(); ctx.arc(0, 0, 7.5, 0, 7); ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(0, 0, 4.2, 0, 7); ctx.fill();
    // 等级点
    for (var j = 0; j < tw.lvl; j++) {
      ctx.fillStyle = '#ffe08a';
      ctx.beginPath(); ctx.arc(-6 + j * 6, CELL * 0.29, 2.1, 0, 7); ctx.fill();
    }
    ctx.restore();
  }

  function drawRange(cx, cy, r, color) {
    ctx.save();
    ctx.beginPath(); ctx.arc((cx + 0.5) * CELL, (cy + 0.5) * CELL, r * CELL, 0, 7);
    ctx.fillStyle = color.replace(')', ',0.07)').replace('rgb', 'rgba');
    ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill();
    ctx.strokeStyle = color; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
  }

  function drawEnemy(e) {
    var x = e.x * CELL, y = e.y * CELL, r = e.def.r * CELL;
    ctx.save();
    ctx.translate(x, y);
    // 影子
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(0, r * 0.75, r * 0.9, r * 0.4, 0, 0, 7); ctx.fill();
    var col = e.def.color;
    if (e.hitT > 0) col = '#ffffff';
    else if (e.slowT > 0) col = '#a9d8ee';
    ctx.fillStyle = col;
    if (e.type === 'runner') {
      ctx.beginPath(); ctx.moveTo(r, 0); ctx.lineTo(-r * 0.8, -r * 0.8); ctx.lineTo(-r * 0.4, 0); ctx.lineTo(-r * 0.8, r * 0.8);
      ctx.closePath(); ctx.fill();
    } else if (e.type === 'tank') {
      ctx.beginPath();
      for (var i = 0; i < 6; i++) {
        var a = i / 6 * Math.PI * 2;
        if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 2; ctx.stroke();
    } else if (e.type === 'boss') {
      ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      for (var k = 0; k < 5; k++) {
        var aa = -Math.PI / 2 + (k - 2) * 0.42;
        ctx.beginPath();
        ctx.moveTo(Math.cos(aa) * r * 0.7, Math.sin(aa) * r * 0.7);
        ctx.lineTo(Math.cos(aa) * r * 1.35, Math.sin(aa) * r * 1.35);
        ctx.lineTo(Math.cos(aa + 0.16) * r * 0.7, Math.sin(aa + 0.16) * r * 0.7);
        ctx.closePath(); ctx.fill();
      }
    } else {
      roundRect(-r * 0.85, -r * 0.9, r * 1.7, r * 1.8, r * 0.55); ctx.fill();
    }
    // 眼睛
    ctx.fillStyle = 'rgba(20,26,34,0.85)';
    ctx.beginPath(); ctx.arc(r * 0.22, -r * 0.14, Math.max(1.4, r * 0.17), 0, 7); ctx.fill();
    ctx.restore();
    // 血条
    if (e.hp < e.maxHp) {
      var bw = Math.max(18, r * 2.1), bh = 3.4;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(x - bw / 2, y - r - 9, bw, bh);
      ctx.fillStyle = e.hp / e.maxHp > 0.45 ? '#8fe0a0' : '#ffb26b';
      ctx.fillRect(x - bw / 2, y - r - 9, bw * Math.max(0, e.hp / e.maxHp), bh);
    }
  }

  function drawShot(s) {
    var x = s.x * CELL, y = s.y * CELL;
    if (s.type === 'arrow') {
      var dx = s.tx - s.x, dy = s.ty - s.y, d = Math.hypot(dx, dy) || 1;
      ctx.strokeStyle = '#bfe0ff'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - dx / d * 11, y - dy / d * 11); ctx.stroke();
    } else if (s.type === 'cannon') {
      ctx.fillStyle = '#ffc98a';
      ctx.beginPath(); ctx.arc(x, y, 4.6, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,178,107,0.35)';
      ctx.beginPath(); ctx.arc(x, y, 8, 0, 7); ctx.fill();
    } else {
      ctx.fillStyle = '#d6f6ff';
      ctx.save(); ctx.translate(x, y); ctx.rotate(g.time * 8);
      ctx.beginPath(); ctx.moveTo(0, -4.5); ctx.lineTo(4, 0); ctx.lineTo(0, 4.5); ctx.lineTo(-4, 0); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  function drawFx(dt) {
    var i;
    for (i = parts.length - 1; i >= 0; i--) {
      var p = parts[i]; p.t += dt;
      if (p.t >= p.life) { parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 150 * dt;
      ctx.globalAlpha = 1 - p.t / p.life;
      ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.2 * (1 - p.t / p.life) + 0.6, 0, 7); ctx.fill();
    }
    for (i = rings.length - 1; i >= 0; i--) {
      var rg = rings[i]; rg.t += dt;
      if (rg.t >= rg.life) { rings.splice(i, 1); continue; }
      var k = rg.t / rg.life;
      ctx.globalAlpha = (1 - k) * 0.8;
      ctx.strokeStyle = rg.c; ctx.lineWidth = 2.5 * (1 - k) + 0.8;
      ctx.beginPath(); ctx.arc(rg.x, rg.y, rg.r + (rg.rm - rg.r) * k, 0, 7); ctx.stroke();
    }
    for (i = texts.length - 1; i >= 0; i--) {
      var tx = texts[i]; tx.t += dt;
      if (tx.t >= tx.life) { texts.splice(i, 1); continue; }
      var kk = tx.t / tx.life;
      ctx.globalAlpha = 1 - kk * kk;
      ctx.fillStyle = tx.c;
      ctx.font = '600 ' + tx.size + 'px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(tx.s, tx.x, tx.y - 24 * kk);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  function drawTopInfo() {
    var msg;
    if (g.state === 'rest') {
      msg = g.wave === 0
        ? '备战中 · ' + Math.ceil(g.restT) + ' 秒后第 1 波来袭'
        : '间歇 · ' + Math.ceil(g.restT) + ' 秒后第 ' + (g.wave + 1) + ' 波';
    } else if (g.state === 'wave') {
      msg = '第 ' + g.wave + ' 波 · 场上 ' + g.enemies.length + ' · 待出 ' + g.spawnQueue.length;
    } else {
      msg = '守不住了';
    }
    ctx.save();
    ctx.font = '600 13px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    var wpx = ctx.measureText(msg).width;
    ctx.fillStyle = 'rgba(12,16,22,0.62)';
    roundRect(W / 2 - wpx / 2 - 11, 7, wpx + 22, 25, 12); ctx.fill();
    ctx.fillStyle = '#cfdcec'; ctx.textAlign = 'center';
    ctx.fillText(msg, W / 2, 24);
    if (bestWave > 0) {
      ctx.fillStyle = 'rgba(180,198,220,0.6)'; ctx.font = '12px sans-serif';
      ctx.textAlign = 'right'; ctx.fillText('最佳 第 ' + bestWave + ' 波', W - 10, 24);
    }
    ctx.restore();
    ctx.textAlign = 'left';
  }

  function render(dt) {
    ctx.save();
    if (shakeT > 0) {
      shakeT -= dt;
      var m = shakeT * 12;
      ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
    }
    drawGround();
    drawPath(g.time);

    // 放置预览
    if (pending && hover && g.canPlace(hover.x, hover.y)) {
      var ok = g.gold >= TOWERS[pending].cost;
      drawRange(hover.x, hover.y, TOWERS[pending].lv[0].range, ok ? '#8fe0a0' : '#ff8b9a');
      ctx.globalAlpha = 0.5;
      drawTower({ type: pending, cx: hover.x, cy: hover.y, lvl: 1, aim: -Math.PI / 2, flash: 0 }, g.time);
      ctx.globalAlpha = 1;
    } else if (pending && hover && !g.canPlace(hover.x, hover.y)) {
      ctx.save();
      ctx.strokeStyle = '#ff8b9a'; ctx.lineWidth = 2;
      roundRect(hover.x * CELL + 4, hover.y * CELL + 4, CELL - 8, CELL - 8, 8); ctx.stroke();
      ctx.restore();
    }
    if (sel && g.towers.indexOf(sel) >= 0) {
      drawRange(sel.cx, sel.cy, TD.stat(sel.type, sel.lvl).range, TOWERS[sel.type].color);
      ctx.save();
      ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 2;
      roundRect(sel.cx * CELL + 3, sel.cy * CELL + 3, CELL - 6, CELL - 6, 8); ctx.stroke();
      ctx.restore();
    }

    for (var i = 0; i < g.towers.length; i++) drawTower(g.towers[i], g.time);
    for (i = 0; i < g.enemies.length; i++) drawEnemy(g.enemies[i]);
    for (i = 0; i < g.shots.length; i++) drawShot(g.shots[i]);
    drawFx(dt);
    drawTopInfo();
    ctx.restore();
  }

  // ── HUD ────────────────────────────────────────────────────────
  function syncHud() {
    hWave.textContent = g.wave;
    hGold.textContent = g.gold;
    hLife.textContent = g.lives;
    hKill.textContent = g.kills;
    btnCall.textContent = g.state === 'rest' ? '下一波' : '出怪中';
    btnCall.disabled = g.state !== 'rest';
    for (var i = 0; i < shopBtns.length; i++) {
      var b = shopBtns[i], ty = b.getAttribute('data-type');
      if (pending === ty) b.classList.add('on'); else b.classList.remove('on');
      if (g.gold < TOWERS[ty].cost) b.classList.add('poor'); else b.classList.remove('poor');
    }
    syncPanel();
  }

  function syncPanel() {
    if (!sel || g.towers.indexOf(sel) < 0) { panel.classList.add('hide'); sel = null; return; }
    panel.classList.remove('hide');
    var st = TD.stat(sel.type, sel.lvl);
    var line = TOWERS[sel.type].name + ' Lv.' + sel.lvl + ' · 伤害 ' + st.dmg + ' · 射程 ' + st.range.toFixed(1);
    pInfo.innerHTML = '<b>' + line + '</b>';
    if (sel.lvl >= 3) {
      btnUp.textContent = '已满级'; btnUp.disabled = true;
    } else {
      var c = TD.upCost(sel.type, sel.lvl);
      btnUp.textContent = '升级 ' + c + ' 金';
      btnUp.disabled = g.gold < c;
    }
    btnSell.textContent = '卖出 +' + Math.floor(sel.invested * 0.6);
  }

  // ── 输入 ───────────────────────────────────────────────────────
  function cellOf(ev) {
    var r = cv.getBoundingClientRect();
    var x = (ev.clientX - r.left) / r.width * W;
    var y = (ev.clientY - r.top) / r.height * H;
    return { x: Math.floor(x / CELL), y: Math.floor(y / CELL) };
  }

  cv.addEventListener('pointerdown', function (ev) {
    ev.preventDefault();
    ac();
    if (!running || g.state === 'over') return;
    var c = cellOf(ev);
    if (c.x < 0 || c.y < 0 || c.x >= COLS || c.y >= ROWS) return;
    var tw = g.towerAt(c.x, c.y);
    if (tw) { sel = tw; pending = null; syncHud(); return; }
    if (pending && g.canPlace(c.x, c.y)) {
      var made = g.place(pending, c.x, c.y);
      if (made) {
        sel = null;
        if (g.gold < TOWERS[pending].cost) pending = null;
      } else {
        float(c.x + 0.5, c.y + 0.5, '金币不够', '#ff8b9a', 13);
      }
      syncHud(); return;
    }
    sel = null; syncHud();
  });

  cv.addEventListener('pointermove', function (ev) {
    var c = cellOf(ev);
    hover = (c.x >= 0 && c.y >= 0 && c.x < COLS && c.y < ROWS) ? c : null;
  });
  cv.addEventListener('pointerleave', function () { hover = null; });

  shopBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      ac();
      var ty = b.getAttribute('data-type');
      pending = (pending === ty) ? null : ty;
      sel = null;
      if (pending) tipEl.textContent = '已选 ' + TOWERS[pending].name + '：点路两边的空地放下（再点一次按钮取消）。';
      else tipEl.textContent = '先选一种塔，再点空地放下；点自己的塔能升级。备战时点「下一波」可以提前召唤，多拿一笔金币。';
      syncHud();
    });
  });

  btnUp.addEventListener('click', function () { if (sel) { g.upgrade(sel); syncHud(); } });
  btnSell.addEventListener('click', function () { if (sel) { g.sell(sel); sel = null; syncHud(); } });
  btnCall.addEventListener('click', function () {
    ac();
    if (running && g.state === 'rest') { g.callEarly(); syncHud(); }
  });
  btnSpeed.addEventListener('click', function () {
    dtMul = dtMul === 1 ? 2 : 1;
    btnSpeed.textContent = dtMul + 'x';
  });
  btnMute.addEventListener('click', function () {
    muted = !muted;
    btnMute.textContent = muted ? '🔇' : '🔊';
  });
  window.addEventListener('keydown', function (ev) {
    var k = ev.key;
    if (k === '1') { pending = 'arrow'; sel = null; syncHud(); }
    else if (k === '2') { pending = 'cannon'; sel = null; syncHud(); }
    else if (k === '3') { pending = 'frost'; sel = null; syncHud(); }
    else if (k === ' ') { if (running && g.state === 'rest') { g.callEarly(); syncHud(); } ev.preventDefault(); }
    else if (k === 'm' || k === 'M') { btnMute.click(); }
    else if (k === 'Escape') { pending = null; sel = null; syncHud(); }
  });

  function onOver() {
    running = false;
    if (g.wave > bestWave) {
      bestWave = g.wave;
      try { localStorage.setItem('td_best_wave', String(bestWave)); } catch (e) { }
    }
    oWave.textContent = '守住了 ' + Math.max(0, g.wave - 1) + ' 波';
    oSub.textContent = '倒在第 ' + g.wave + ' 波 · 击杀 ' + g.kills + ' · 最佳 第 ' + bestWave + ' 波';
    overVeil.classList.remove('hide');
    panel.classList.add('hide');
  }

  btnStart.addEventListener('click', function () {
    ac(); startVeil.classList.add('hide'); running = true; syncHud();
  });
  btnRetry.addEventListener('click', function () {
    g.init((Math.random() * 1e6) | 0);
    parts.length = 0; rings.length = 0; texts.length = 0;
    pending = null; sel = null; shakeT = 0;
    overVeil.classList.add('hide'); running = true; syncHud();
  });

  // ── 主循环 ─────────────────────────────────────────────────────
  var last = 0;
  function frame(ts) {
    if (!last) last = ts;
    var dt = Math.min(0.05, (ts - last) / 1000); last = ts;
    if (running) {
      var steps = dtMul;
      for (var i = 0; i < steps; i++) g.update(dt);
      drain();
      syncHud();
    }
    render(dt);
    requestAnimationFrame(frame);
  }

  fit();
  syncHud();
  requestAnimationFrame(frame);

  // 测试钩子
  if (typeof window !== 'undefined') {
    window.__GAME = {
      get g() { return g; },
      start: function () { btnStart.click(); },
      pick: function (t) { pending = t; },
      tapCell: function (x, y) {
        cv.dispatchEvent ? null : null;
        var tw = g.towerAt(x, y);
        if (tw) { sel = tw; pending = null; syncHud(); return 'sel'; }
        if (pending && g.canPlace(x, y)) { var m = g.place(pending, x, y); syncHud(); return m ? 'placed' : 'poor'; }
        sel = null; syncHud(); return 'none';
      },
      state: function () { return { wave: g.wave, gold: g.gold, lives: g.lives, kills: g.kills, state: g.state, towers: g.towers.length }; }
    };
  }
})();
