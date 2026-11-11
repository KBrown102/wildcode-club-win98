/* ============================================================
   284-echobell / render.js
   《回声 · 一室钟》—— 渲染层：只读状态，不改状态
   视觉核心：暗室 → 画满 → 铺黑 → 用光「擦」出黑暗 → 发光叠加
   性能纪律：岩壁/钟/柱全部预渲染离屏精灵，主循环只做 drawImage
   ============================================================ */
(function (g) {
  'use strict';

  var E = g.Echo;
  var W = E.W, H = E.H;
  var RX0 = E.RX0, RY0 = E.RY0, RX1 = E.RX1, RY1 = E.RY1;
  var RW = E.RW, RH = E.RH, LX = E.LX, LY = E.LY;

  // ---------- 色板：中国传统色 · 夜山含黛 ----------
  var C = {
    out: '#0A0B12',
    roomT: '#1A1B2E', roomB: '#0B0C16',
    wall: '#2E4057', wallDk: '#182238',
    rock: '#424C50', rockDk: '#252C2F', rockHi: '#5A666B',
    bronze: '#8C7B5A', bronzeHi: '#A89473', bronzeDk: '#5E5340',
    gold: '#F2C46B', goldHi: '#FFE6A8',
    amber: '#E8B44A', moon: '#EAE6D8',
    dark: 'rgba(7,8,15,0.935)',
    penta: ['#E8B44A', '#EAE6D8', '#7FA86B', '#C85A4A', '#4A6FA5']
  };

  // ---------- 离屏精灵 ----------
  var SC = 1;                 // 精灵/缓存的渲染倍率（跟随 devicePixelRatio×缩放）
  var SPR = null, BG = null;

  function mkCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }
  // 以「逻辑尺寸 lw×lh」建一张离屏画布，内部已按 SC 缩放
  function mkLogical(lw, lh) {
    var c = mkCanvas(lw * SC, lh * SC);
    var x = c.getContext('2d');
    x.setTransform(SC, 0, 0, SC, 0, 0);
    return { cv: c, x: x };
  }
  function radial(x, cx, cy, r0, R, stops) {
    var gr = x.createRadialGradient(cx, cy, r0, cx, cy, R);
    for (var i = 0; i < stops.length; i++) gr.addColorStop(stops[i][0], stops[i][1]);
    return gr;
  }

  function mkMask(R) {
    var s = mkLogical(R * 2, R * 2), x = s.x;
    x.fillStyle = radial(x, R, R, 0, R, [
      [0.00, 'rgba(255,255,255,1)'],
      [0.34, 'rgba(255,255,255,0.86)'],
      [0.62, 'rgba(255,255,255,0.40)'],
      [0.84, 'rgba(255,255,255,0.12)'],
      [1.00, 'rgba(255,255,255,0)']
    ]);
    x.fillRect(0, 0, R * 2, R * 2);
    return s.cv;
  }
  function mkGlow(R, r, gg, b) {
    var s = mkLogical(R * 2, R * 2), x = s.x;
    x.fillStyle = radial(x, R, R, 0, R, [
      [0.00, 'rgba(' + r + ',' + gg + ',' + b + ',0.95)'],
      [0.22, 'rgba(' + r + ',' + gg + ',' + b + ',0.52)'],
      [0.52, 'rgba(' + r + ',' + gg + ',' + b + ',0.18)'],
      [0.78, 'rgba(' + r + ',' + gg + ',' + b + ',0.05)'],
      [1.00, 'rgba(' + r + ',' + gg + ',' + b + ',0)']
    ]);
    x.fillRect(0, 0, R * 2, R * 2);
    return s.cv;
  }
  function mkRock(S) {
    var c = mkCanvas(S, S), x = c.getContext('2d'), i;
    for (i = 0; i < 2400; i++) {
      var a = Math.random() * 0.07;
      var l = Math.random() < 0.5 ? 255 : 0;
      x.fillStyle = 'rgba(' + l + ',' + l + ',' + l + ',' + a.toFixed(3) + ')';
      var s = 1 + Math.random() * 2.4;
      x.fillRect(Math.random() * S, Math.random() * S, s, s);
    }
    return c;
  }

  // ---------- 编钟精灵（青铜 / 显形 / 赤金）----------
  function bellPath(x, cx, cy, r) {
    x.beginPath();
    x.moveTo(cx - r * 0.40, cy - r * 0.82);
    x.quadraticCurveTo(cx - r * 1.00, cy - r * 0.22, cx - r * 0.96, cy + r * 0.60);
    x.quadraticCurveTo(cx - r * 0.40, cy + r * 1.02, cx, cy + r * 1.02);
    x.quadraticCurveTo(cx + r * 0.40, cy + r * 1.02, cx + r * 0.96, cy + r * 0.60);
    x.quadraticCurveTo(cx + r * 1.00, cy - r * 0.22, cx + r * 0.40, cy - r * 0.82);
    x.closePath();
  }
  // mode: 'base' 沉睡（暗）| 'hint' 已显形（青铜）| 'rung' 已鸣响（赤金）
  function mkBell(mode) {
    var R = 14, PAD = 6, SZ = (R + PAD) * 2;
    var s = mkLogical(SZ, SZ), x = s.x;
    var cx = SZ / 2, cy = SZ / 2;

    // 甬（悬钮）
    x.fillStyle = mode === 'rung' ? '#B99A57' : (mode === 'hint' ? '#7C6C4F' : '#4A422F');
    x.beginPath();
    x.ellipse(cx, cy - R * 0.92, R * 0.24, R * 0.20, 0, 0, Math.PI * 2);
    x.fill();

    bellPath(x, cx, cy, R);
    var gr = x.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
    if (mode === 'rung') {
      gr.addColorStop(0, '#FFE9B8'); gr.addColorStop(0.5, '#F2C46B'); gr.addColorStop(1, '#B98D36');
    } else if (mode === 'hint') {
      gr.addColorStop(0, '#A89473'); gr.addColorStop(0.5, '#8C7B5A'); gr.addColorStop(1, '#5E5340');
    } else {
      gr.addColorStop(0, '#6E6045'); gr.addColorStop(0.55, '#8C7B5A'); gr.addColorStop(1, '#5E5340');
    }
    x.fillStyle = gr; x.fill();

    // 篆间横带
    x.strokeStyle = mode === 'rung' ? 'rgba(120,84,20,0.45)' : 'rgba(30,26,18,0.5)';
    x.lineWidth = 1.1;
    for (var i = -1; i <= 1; i++) {
      x.beginPath();
      x.moveTo(cx - R * 0.88, cy + i * R * 0.36);
      x.lineTo(cx + R * 0.88, cy + i * R * 0.36);
      x.stroke();
    }
    // 左侧高光
    x.strokeStyle = mode === 'rung' ? 'rgba(255,250,230,0.55)'
      : (mode === 'hint' ? 'rgba(255,240,205,0.30)' : 'rgba(255,240,205,0.16)');
    x.lineWidth = 1.4;
    x.beginPath(); x.arc(cx, cy, R * 0.72, Math.PI * 1.05, Math.PI * 1.42); x.stroke();
    return { cv: s.cv, sz: SZ };
  }

  // ---------- 石柱精灵（素柱 / 鸣柱）----------
  function mkPillar(echo) {
    var R = 34, SZ = R * 2;
    var s = mkLogical(SZ, SZ), x = s.x, cx = R, cy = R;
    var gr = x.createRadialGradient(cx - R * 0.4, cy - R * 0.45, R * 0.1, cx, cy, R);
    gr.addColorStop(0, C.rockHi); gr.addColorStop(0.62, C.rock); gr.addColorStop(1, C.rockDk);
    x.fillStyle = gr;
    x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.fill();
    if (echo) {
      x.strokeStyle = 'rgba(232,180,74,0.78)'; x.lineWidth = 2;
      x.beginPath(); x.arc(cx, cy, R - 4.5, 0, Math.PI * 2); x.stroke();
      x.strokeStyle = 'rgba(232,180,74,0.34)'; x.lineWidth = 1;
      x.beginPath(); x.arc(cx, cy, R - 9, 0, Math.PI * 2); x.stroke();
    }
    return { cv: s.cv, sz: SZ };
  }

  // ---------- 石室背景缓存 ----------
  function mkBg() {
    var s = mkLogical(RW, RH), x = s.x, i;
    var gr = x.createLinearGradient(0, 0, 0, RH);
    gr.addColorStop(0, C.roomT); gr.addColorStop(0.55, '#12131F'); gr.addColorStop(1, C.roomB);
    x.fillStyle = gr; x.fillRect(0, 0, RW, RH);

    var tile = mkRock(180);
    var pt = x.createPattern(tile, 'repeat');
    if (pt) {
      // 让噪点粒度贴着设备像素，不随 dpr 变粗
      try { pt.setTransform(new DOMMatrix([1 / SC, 0, 0, 1 / SC, 0, 0])); } catch (e) { }
      x.globalAlpha = 0.5; x.fillStyle = pt; x.fillRect(0, 0, RW, RH); x.globalAlpha = 1;
    }

    // 壁面内缘
    x.lineWidth = 5; x.strokeStyle = C.wallDk;
    x.strokeRect(2.5, 2.5, RW - 5, RH - 5);
    x.lineWidth = 1.6; x.strokeStyle = 'rgba(62,86,120,0.55)';
    x.strokeRect(6.5, 6.5, RW - 13, RH - 13);

    // 顶部钟乳石剪影
    x.fillStyle = 'rgba(24,34,56,0.85)';
    for (i = 0; i < 13; i++) {
      var px = 12 + i * (RW - 24) / 12;
      var ph = 10 + ((i * 37) % 19);
      x.beginPath();
      x.moveTo(px - 9, 0); x.lineTo(px + 9, 0); x.lineTo(px, ph);
      x.closePath(); x.fill();
    }
    return s.cv;
  }

  function build() {
    SPR = {
      mask: mkMask(128),
      glowAmber: mkGlow(96, 232, 180, 74),
      glowGold: mkGlow(96, 242, 196, 107),
      glowWhite: mkGlow(64, 234, 230, 216),
      bellBase: mkBell('base'),
      bellHint: mkBell('hint'),
      bellRung: mkBell('rung'),
      pillar: mkPillar(false),
      pillarEcho: mkPillar(true)
    };
    BG = mkBg();
  }

  // 由 index.html 的 fit() 调用：dpr×缩放变化时重建缓存
  function setDPR(eff) {
    eff = Math.max(1, Math.min(eff, 2.4));
    if (SPR && Math.abs(eff - SC) < 0.02) return;
    SC = eff; SPR = null; BG = null;
  }
  function sprites() { if (!SPR) build(); return SPR; }

  // ---------- 运行时视觉状态 ----------
  var dust = [], parts = [], texts = [], ripples = [];
  var shake = 0, aiming = false, flash = 0, T = 0;

  function reset(st) {
    parts.length = 0; texts.length = 0; ripples.length = 0; dust.length = 0;
    for (var i = 0; i < 30; i++) {
      dust.push({
        x: RX0 + Math.random() * RW, y: RY0 + Math.random() * RH,
        vx: (Math.random() - 0.5) * 7, vy: -3 - Math.random() * 8,
        r: 0.6 + Math.random() * 1.5, p: Math.random() * Math.PI * 2
      });
    }
    shake = 0; flash = 0; T = 0;
  }
  function setAiming(v) { aiming = !!v; }

  // ---------- 事件消费 ----------
  function addPart(x, y, vx, vy, life, r, c) {
    if (parts.length > 300) parts.shift();
    parts.push({ x: x, y: y, vx: vx, vy: vy, life: life, max: life, r: r, c: c });
  }
  function consume(st) {
    for (var i = 0; i < st.events.length; i++) {
      var e = st.events[i];
      if (e.type === 'bounce') onBounce(e);
      else if (e.type === 'ring') onRing(e);
      else if (e.type === 'die') onDie(e);
      else if (e.type === 'fire') onFire(e);
    }
    st.events.length = 0;
  }
  function onFire(e) {
    for (var i = 0; i < 9; i++) {
      var a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, sp = 50 + Math.random() * 90;
      addPart(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, 0.42, 1.2 + Math.random() * 1.8, C.amber);
    }
    flash = Math.max(flash, 0.35);
  }
  function onBounce(e) {
    var n = e.echo ? 14 : 8, i, a, sp;
    for (i = 0; i < n; i++) {
      a = Math.random() * Math.PI * 2; sp = (e.echo ? 90 : 60) + Math.random() * 140;
      addPart(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, 0.5, 1 + Math.random() * 2,
        e.echo ? C.goldHi : C.amber);
    }
    ripples.push({ x: e.x, y: e.y, r: 3, max: e.echo ? 62 : 42, life: 0.5, t: 0.5, c: e.echo ? C.gold : C.amber, w: 2.4 });
    shake = Math.max(shake, e.echo ? 3.2 : 1.8);
    if (e.echo) flash = Math.max(flash, 0.22);
  }
  function onRing(e) {
    var col = C.penta[(e.combo - 1) % 5], big = Math.min(e.combo, 6), i, a, sp;
    for (i = 0; i < 18 + big * 4; i++) {
      a = Math.random() * Math.PI * 2; sp = 70 + Math.random() * (150 + big * 40);
      addPart(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, 0.75 + Math.random() * 0.45,
        1.2 + Math.random() * 2.4, col);
    }
    ripples.push({ x: e.x, y: e.y, r: 6, max: 96 + big * 16, life: 0.85, t: 0.85, c: col, w: 3.2 });
    ripples.push({ x: e.x, y: e.y, r: 6, max: 60 + big * 12, life: 0.55, t: 0.55, c: C.goldHi, w: 1.6 });
    texts.push({
      x: e.x, y: e.y - 26,
      txt: e.combo > 1 ? ('+' + e.gain + '　×' + e.combo) : ('+' + e.gain),
      life: 1.15, t: 1.15, c: col, size: e.combo > 1 ? 21 + Math.min(e.combo, 5) * 1.6 : 17
    });
    shake = Math.max(shake, 4 + big * 0.9);
    flash = Math.max(flash, 0.20 + big * 0.045);
  }
  function onDie(e) {
    for (var i = 0; i < 12; i++) {
      var a = Math.random() * Math.PI * 2, sp = 18 + Math.random() * 52;
      addPart(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp - 12, 0.85, 1 + Math.random() * 2, C.amber);
    }
    ripples.push({ x: e.x, y: e.y, r: 4, max: 52, life: 0.6, t: 0.6, c: C.amber, w: 1.6 });
  }

  function stepFx(dt) {
    var i, p;
    for (i = parts.length - 1; i >= 0; i--) {
      p = parts[i]; p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.94; p.vy = p.vy * 0.94 + 26 * dt;
    }
    for (i = ripples.length - 1; i >= 0; i--) {
      var r = ripples[i]; r.life -= dt;
      if (r.life <= 0) { ripples.splice(i, 1); continue; }
      r.r += (r.max - r.r) * Math.min(1, dt * 5.2);
    }
    for (i = texts.length - 1; i >= 0; i--) {
      var t = texts[i]; t.life -= dt;
      if (t.life <= 0) { texts.splice(i, 1); continue; }
      t.y -= 26 * dt;
    }
    for (i = 0; i < dust.length; i++) {
      var d = dust[i];
      d.x += d.vx * dt; d.y += d.vy * dt; d.p += dt * 0.7;
      if (d.y < RY0 - 6) { d.y = RY1 + 4; d.x = RX0 + Math.random() * RW; }
      if (d.x < RX0) d.x = RX1; else if (d.x > RX1) d.x = RX0;
    }
    if (shake > 0) shake = Math.max(0, shake - dt * 22);
    if (flash > 0) flash = Math.max(0, flash - dt * 1.9);
  }

  // ---------- 绘制小件 ----------
  function drawLamp(ctx) {
    ctx.fillStyle = '#33393D';
    ctx.beginPath(); ctx.ellipse(LX, LY + 34, 30, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2A3034'; ctx.fillRect(LX - 7, LY + 6, 14, 28);
    ctx.fillStyle = '#3C4348';
    ctx.beginPath(); ctx.ellipse(LX, LY + 5, 20, 7.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1E2326';
    ctx.beginPath(); ctx.ellipse(LX, LY + 3, 15, 5.4, 0, 0, Math.PI * 2); ctx.fill();
  }

  function pathTrail(ctx, t) {
    if (t.pts.length < 2) return false;
    ctx.beginPath();
    ctx.moveTo(t.pts[0].x, t.pts[0].y);
    for (var i = 1; i < t.pts.length; i++) ctx.lineTo(t.pts[i].x, t.pts[i].y);
    return true;
  }
  function trailAlpha(t) { return t.live ? 1 : Math.max(0, 1 - t.age / 7.5); }

  // ---------- 主绘制 ----------
  function draw(ctx, st, dt) {
    var S = sprites();
    T += dt;
    consume(st);
    stepFx(dt);

    var i, p, sx = 0, sy = 0;
    if (shake > 0.05) { sx = (Math.random() - 0.5) * shake; sy = (Math.random() - 0.5) * shake; }

    ctx.save();
    ctx.translate(sx, sy);

    // ① 室外极暗底
    ctx.fillStyle = C.out;
    ctx.fillRect(-10, -10, W + 20, H + 20);

    // ② 石室背景（预渲染缓存，一次 drawImage）
    ctx.drawImage(BG, RX0, RY0, RW, RH);

    // ③ 实体（随后会被黑暗盖住，只有被光照到才看得见）
    for (i = 0; i < st.pillars.length; i++) {
      p = st.pillars[i];
      var ps = p.echo ? S.pillarEcho : S.pillar;
      var k = p.r / 34 * ps.sz;
      ctx.drawImage(ps.cv, p.x - k / 2, p.y - k / 2, k, k);
      if (p.hit > 0) {
        ctx.globalAlpha = p.hit * 0.5;
        ctx.strokeStyle = C.rockHi; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r - 1.5, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    for (i = 0; i < st.bells.length; i++) {
      var b0 = st.bells[i];
      if (b0.rung) continue;
      var bs = b0.lit ? S.bellHint : S.bellBase;
      ctx.drawImage(bs.cv, b0.x - bs.sz / 2, b0.y - bs.sz / 2, bs.sz, bs.sz);
    }
    drawLamp(ctx);

    // ④ 铺黑 + ⑤ 用光「擦」出来
    ctx.save();
    ctx.beginPath(); ctx.rect(RX0, RY0, RW, RH); ctx.clip();
    ctx.fillStyle = C.dark;
    ctx.fillRect(RX0, RY0, RW, RH);

    ctx.globalCompositeOperation = 'destination-out';
    // 光痕（单次宽描边，最省）
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (i = 0; i < st.trails.length; i++) {
      var t = st.trails[i], a = trailAlpha(t);
      if (a <= 0.02) continue;
      ctx.strokeStyle = '#000';
      ctx.globalAlpha = a * 0.72; ctx.lineWidth = 36;
      if (pathTrail(ctx, t)) ctx.stroke();
    }
    // 灯台微光
    ctx.globalAlpha = 0.55;
    ctx.drawImage(S.mask, LX - 96, LY - 96, 192, 192);
    // 已鸣响的钟
    for (i = 0; i < st.bells.length; i++) {
      var b = st.bells[i];
      if (!b.rung) continue;
      var R = 66 + b.glow * 30;
      ctx.globalAlpha = 0.72 + b.glow * 0.28;
      ctx.drawImage(S.mask, b.x - R, b.y - R, R * 2, R * 2);
    }
    // 光弹（最亮）
    if (st.orb && st.orb.alive) {
      var OR = 128 + Math.sin(T * 15) * 8;
      ctx.globalAlpha = 1;
      ctx.drawImage(S.mask, st.orb.x - OR, st.orb.y - OR, OR * 2, OR * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    // ⑥ 已显形但还没响的目标：淡淡轮廓（照亮过了就记得住）
    for (i = 0; i < st.pillars.length; i++) {
      p = st.pillars[i];
      if (!p.lit) continue;
      ctx.strokeStyle = 'rgba(150,164,170,0.34)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r - 0.8, 0, Math.PI * 2); ctx.stroke();
      if (p.echo) {
        ctx.strokeStyle = 'rgba(232,180,74,0.42)'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r - 4.5, 0, Math.PI * 2); ctx.stroke();
      }
    }
    for (i = 0; i < st.bells.length; i++) {
      var bb = st.bells[i];
      if (bb.rung || !bb.lit) continue;
      var br = 0.10 + Math.sin(T * 1.5 + bb.idx) * 0.045;
      ctx.fillStyle = 'rgba(232,180,74,' + Math.max(0, br).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(bb.x, bb.y, bb.r * 1.5, 0, Math.PI * 2); ctx.fill();
    }
    // 沉睡的钟：几乎看不见的呼吸微光（提示「这里有东西」）
    for (i = 0; i < st.bells.length; i++) {
      var b3 = st.bells[i];
      if (b3.rung || b3.lit) continue;
      var a3 = 0.055 + Math.sin(T * 1.1 + b3.idx * 1.7) * 0.035;
      ctx.fillStyle = 'rgba(200,180,140,' + Math.max(0, a3).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(b3.x, b3.y, b3.r * 1.15, 0, Math.PI * 2); ctx.fill();
    }

    // ⑦ 发光叠加层（假 bloom）
    ctx.save();
    ctx.beginPath(); ctx.rect(RX0, RY0, RW, RH); ctx.clip();
    ctx.globalCompositeOperation = 'lighter';

    if (flash > 0.01) {
      ctx.globalAlpha = flash * 0.16; ctx.fillStyle = C.amber;
      ctx.fillRect(RX0, RY0, RW, RH);
      ctx.globalAlpha = 1;
    }
    // 光痕余晖（两道：宽软 + 细亮）
    for (i = 0; i < st.trails.length; i++) {
      var t2 = st.trails[i], a2 = trailAlpha(t2);
      if (a2 <= 0.02) continue;
      var al = t2.live ? 0.9 : a2 * 0.72;
      ctx.strokeStyle = 'rgba(232,180,74,1)';
      ctx.globalAlpha = al * 0.16; ctx.lineWidth = 11;
      if (pathTrail(ctx, t2)) ctx.stroke();
      ctx.strokeStyle = 'rgba(255,232,180,1)';
      ctx.globalAlpha = al * 0.62; ctx.lineWidth = 2;
      if (pathTrail(ctx, t2)) ctx.stroke();
    }
    // 灯台余烬
    ctx.globalAlpha = 0.42 + Math.sin(T * 2.2) * 0.06;
    ctx.drawImage(S.glowAmber, LX - 42, LY - 30, 84, 84);

    // 已鸣响的钟：金晕 + 亮钟
    for (i = 0; i < st.bells.length; i++) {
      var b4 = st.bells[i];
      if (!b4.rung) continue;
      var GR = 46 + b4.glow * 26;
      ctx.globalAlpha = 0.34 + b4.glow * 0.5;
      ctx.drawImage(S.glowGold, b4.x - GR, b4.y - GR, GR * 2, GR * 2);
      var bs2 = S.bellRung, sc = 1 + b4.tone * 0.16, sz2 = bs2.sz * sc;
      ctx.globalAlpha = 0.85;
      ctx.drawImage(bs2.cv, b4.x - sz2 / 2, b4.y - sz2 / 2, sz2, sz2);
    }
    // 尘埃（只在光附近显形）
    var ox = (st.orb && st.orb.alive) ? st.orb.x : LX;
    var oy = (st.orb && st.orb.alive) ? st.orb.y : LY;
    ctx.fillStyle = 'rgba(255,226,170,1)';
    for (i = 0; i < dust.length; i++) {
      var d = dust[i];
      var dd = Math.sqrt((d.x - ox) * (d.x - ox) + (d.y - oy) * (d.y - oy));
      var da = 1 - dd / 150;
      if (da < 0.03) continue;
      ctx.globalAlpha = da * 0.42 * (0.55 + Math.sin(d.p) * 0.45);
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill();
    }
    // 涟漪
    for (i = 0; i < ripples.length; i++) {
      var rp = ripples[i], rl = Math.max(0, rp.life / rp.t);
      ctx.globalAlpha = rl * 0.62;
      ctx.strokeStyle = rp.c; ctx.lineWidth = rp.w * Math.max(0.25, rl);
      ctx.beginPath(); ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2); ctx.stroke();
    }
    // 粒子
    for (i = 0; i < parts.length; i++) {
      p = parts[i]; var la = p.life / p.max;
      ctx.globalAlpha = la * 0.85; ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.4 + la * 0.6), 0, Math.PI * 2); ctx.fill();
    }
    // 光弹：三层假 bloom
    if (st.orb && st.orb.alive) {
      var pu = 1 + Math.sin(T * 18) * 0.07;
      ctx.globalAlpha = 0.42;
      ctx.drawImage(S.glowAmber, st.orb.x - 60 * pu, st.orb.y - 60 * pu, 120 * pu, 120 * pu);
      ctx.globalAlpha = 0.62;
      ctx.drawImage(S.glowAmber, st.orb.x - 28 * pu, st.orb.y - 28 * pu, 56 * pu, 56 * pu);
      ctx.globalAlpha = 0.9;
      ctx.drawImage(S.glowWhite, st.orb.x - 13, st.orb.y - 13, 26, 26);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#FFFDF4';
      ctx.beginPath(); ctx.arc(st.orb.x, st.orb.y, E.ORB_R * 0.72, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    // ⑧ 瞄准引导线
    if (st.phase === 'aim') {
      var gd = E.guide(st);
      ctx.save();
      ctx.beginPath(); ctx.rect(RX0, RY0, RW, RH); ctx.clip();
      ctx.lineCap = 'round';
      ctx.setLineDash([9, 9]);
      ctx.lineDashOffset = -(T * 34) % 18;
      ctx.strokeStyle = aiming ? 'rgba(255,222,150,0.85)' : 'rgba(232,180,74,0.42)';
      ctx.lineWidth = aiming ? 2.2 : 1.7;
      ctx.beginPath();
      ctx.moveTo(gd.pts[0].x, gd.pts[0].y);
      for (i = 1; i < gd.pts.length; i++) ctx.lineTo(gd.pts[i].x, gd.pts[i].y);
      ctx.stroke();
      ctx.setLineDash([]);
      var last = gd.pts[gd.pts.length - 1];
      ctx.globalAlpha = gd.stopped ? 0.5 : 0.85;
      ctx.fillStyle = gd.stopped ? 'rgba(150,164,170,0.9)' : C.amber;
      ctx.beginPath(); ctx.arc(last.x, last.y, gd.stopped ? 2.6 : 4, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // ⑨ 飘字
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (i = 0; i < texts.length; i++) {
      var tx = texts[i], la2 = tx.life / tx.t;
      ctx.globalAlpha = Math.min(1, la2 * 1.6);
      ctx.font = '700 ' + tx.size.toFixed(1) + 'px "KaiTi","STKaiti","PingFang SC","Microsoft YaHei",serif';
      ctx.lineWidth = 3.2; ctx.strokeStyle = 'rgba(8,9,16,0.72)';
      ctx.strokeText(tx.txt, tx.x, tx.y);
      ctx.fillStyle = tx.c; ctx.fillText(tx.txt, tx.x, tx.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // ⑩ 光能刻度（室底）
    if (st.phase === 'fly' && st.orb && st.orb.alive) {
      var em = st.energyMax, en = st.orb.energy;
      var bw = 15, gap = 5, tw = em * bw + (em - 1) * gap;
      var bx0 = LX - tw / 2, by = RY1 - 20, j;
      ctx.save();
      for (j = 0; j < em; j++) {
        var on = j < en;
        ctx.globalAlpha = on ? 0.95 : 0.2;
        ctx.fillStyle = on ? C.amber : '#5A6068';
        var x0 = bx0 + j * (bw + gap);
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x0, by, bw, 5, 2.5); else ctx.rect(x0, by, bw, 5);
        ctx.fill();
      }
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = C.amber;
      ctx.font = '600 11px "KaiTi","STKaiti","PingFang SC",serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText('光', bx0 - 18, by + 3);
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    ctx.restore();  // shake
  }

  g.EchoRender = { reset: reset, draw: draw, setAiming: setAiming, setDPR: setDPR, colors: C };

})(typeof globalThis !== 'undefined' ? globalThis : this);
