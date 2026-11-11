/* 287-inkcliff《断崖 · 墨阶》· 渲染层
   只读状态不写状态（除消费 events 外），Canvas 2D 只负责「世界」：
   等高线墨阶地形 + 断崖光谱爆发 + 墨痕 + 谱眼 + 朱砂游丝。
   UI（题款 HUD / 势差标尺 / 遮罩）交给 DOM，不在这里排文字。 */
(function (g) {
  'use strict';

  var W = 480, H = 820;
  var BX = 20, BY = 112, CS = 44;          // 棋盘 440×440
  var N = 10, HMAX = 7, CLIFF = 3;

  // 墨分八阶：0 纸白 → 7 焦墨
  var INK = ['#F5F2EB', '#E6E1D5', '#D2CCBD', '#B8B1A0', '#98917F', '#736C5E', '#4C473D', '#26262A'];
  var INK_D = ['#E3DED2', '#D2CCBD', '#BDB6A6', '#A49C89', '#857D6C', '#5B544A', '#35312A', '#16161A'];
  var PAPER = '#F4F1EA';
  var CIN = '#C3423F';        // 朱砂
  var MOSS = '90,110,108';    // 墨痕（淡青灰）
  var SPEC = ['#4FA3A5', '#3B5B94', '#7A5A94', '#C3423F'];   // 光谱断崖：青→靛→紫→朱

  var cv = null, ctx = null, eff = 1;
  var tcv = null, tctx = null;             // 地形离屏缓存
  var disp = null, tgt = null, flash = null;
  var trail = [], parts = [], bursts = [], ripples = [];
  var anim = null, pending = null, dirtyT = 1;
  var cur = { x: 0, y: 0 };                // 玩家当前显示坐标（格坐标，浮点）
  var clock = 0;

  function cx(i) { return BX + ((i % N) + 0.5) * CS; }
  function cy(i) { return BY + (((i / N) | 0) + 0.5) * CS; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function ease(x) { return 1 - Math.pow(1 - clamp(x, 0, 1), 3); }

  function init(canvas, e) {
    cv = canvas; ctx = cv.getContext('2d'); eff = e;
    tcv = document.createElement('canvas');
    tcv.width = Math.round(CS * N * eff); tcv.height = Math.round(CS * N * eff);
    tctx = tcv.getContext('2d');
    disp = new Float64Array(N * N); tgt = new Float64Array(N * N); flash = new Float64Array(N * N);
    dirtyT = 1;
  }
  function setEff(e) {
    eff = e;
    tcv.width = Math.round(CS * N * eff); tcv.height = Math.round(CS * N * eff);
    tctx = tcv.getContext('2d');
    dirtyT = 1;
  }
  function setLevel(st) {
    for (var i = 0; i < N * N; i++) { tgt[i] = st.h[i]; disp[i] = st.h[i]; flash[i] = 0; }
    trail.length = 0; parts.length = 0; bursts.length = 0; ripples.length = 0;
    anim = null; pending = null; dirtyT = 1;
    cur.x = st.pos % N; cur.y = (st.pos / N) | 0;
  }

  /* ---------------- 事件消费 ---------------- */
  function onEv(st, ev) {
    var i;
    if (ev.t === 'slide') {
      anim = { path: ev.path, t: 0, per: 0.052, fall: ev.fall, lit: ev.lit || [] };
      anim.dur = Math.min(0.46, 0.052 * ev.path.length + 0.04);
      pending = ev.burst;
      for (i = 0; i < ev.lit.length; i++) ripples.push({ i: ev.lit[i], t: 0 });
      dirtyT = 1.2;
    } else if (ev.t === 'relief') {
      for (i = 0; i < N * N; i++) tgt[i] = st.h[i];
      flash[ev.i] = 1;
      bursts.push({ i: ev.i, t: -0.06, dur: 0.62, soft: true });
      dirtyT = 1.2;
    } else if (ev.t === 'undo' || ev.t === 'restart') {
      for (i = 0; i < N * N; i++) { tgt[i] = st.h[i]; if (ev.t === 'restart') disp[i] = st.h[i]; flash[i] = 0; }
      trail.length = 0; parts.length = 0; bursts.length = 0; ripples.length = 0;
      anim = null; pending = null; dirtyT = 1.2;
      cur.x = st.pos % N; cur.y = (st.pos / N) | 0;
    }
  }

  function applyPending() {
    if (!pending) return;
    var b = pending; pending = null;
    for (var k = 0; k < b.cells.length; k++) {
      tgt[b.cells[k].i] = b.cells[k].to;
      flash[b.cells[k].i] = 1;
    }
    bursts.push({ i: b.i, t: 0, dur: 0.56, soft: false, hLand: b.hLand });
    var x = cx(b.i), y = cy(b.i);
    for (var p = 0; p < 22; p++) {
      var a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 130;
      parts.push({
        x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30,
        life: 0.5 + Math.random() * 0.5, t: 0, r: 1 + Math.random() * 2.2,
        c: SPEC[(Math.random() * 4) | 0]
      });
    }
    dirtyT = 1.2;
  }

  /* ---------------- 地形（离屏缓存） ---------------- */
  function drawTerrain(st) {
    var s = eff, w = CS * N;
    tctx.setTransform(s, 0, 0, s, 0, 0);
    tctx.clearRect(0, 0, w, w);
    tctx.fillStyle = PAPER; tctx.fillRect(0, 0, w, w);

    var r, c, i, lv;
    // ① 阶面
    for (r = 0; r < N; r++) for (c = 0; c < N; c++) {
      i = r * N + c;
      lv = clamp(Math.round(disp[i]), 0, HMAX);
      tctx.fillStyle = INK[lv];
      tctx.fillRect(c * CS, r * CS, CS + 0.6, CS + 0.6);
    }
    // ② 墨痕（走过的格子）
    for (i = 0; i < N * N; i++) {
      if (!st.visited[i]) continue;
      tctx.fillStyle = 'rgba(' + MOSS + ',0.11)';
      tctx.fillRect((i % N) * CS + 2, ((i / N) | 0) * CS + 2, CS - 4, CS - 4);
    }
    // ③ 等高线：邻格更高的一侧描边（形成台地轮廓）
    tctx.lineCap = 'round';
    for (r = 0; r < N; r++) for (c = 0; c < N; c++) {
      i = r * N + c;
      var hi = disp[i], x = c * CS, y = r * CS;
      // 上
      if (r > 0) edge(tctx, i, i - N, hi, x, y, x + CS, y, r - 1, c);
      // 左
      if (c > 0) edge(tctx, i, i - 1, hi, x, y, x, y + CS, r, c - 1);
      // 下
      if (r < N - 1) edge(tctx, i, i + N, hi, x, y + CS, x + CS, y + CS, r + 1, c);
      // 右
      if (c < N - 1) edge(tctx, i, i + 1, hi, x + CS, y, x + CS, y + CS, r, c + 1);
    }
    // ④ 断崖高亮（落差 ≥ CLIFF）—— 玩家必须看得见哪里能摔
    tctx.lineCap = 'butt';
    for (r = 0; r < N; r++) for (c = 0; c < N; c++) {
      i = r * N + c;
      var x2 = c * CS, y2 = r * CS;
      if (r < N - 1 && disp[i] - disp[i + N] >= CLIFF) cliffMark(tctx, x2, y2 + CS, x2 + CS, y2 + CS);
      if (c < N - 1 && disp[i] - disp[i + 1] >= CLIFF) cliffMark(tctx, x2 + CS, y2, x2 + CS, y2 + CS);
      if (r > 0 && disp[i] - disp[i - N] >= CLIFF) cliffMark(tctx, x2, y2, x2 + CS, y2);
      if (c > 0 && disp[i] - disp[i - 1] >= CLIFF) cliffMark(tctx, x2, y2, x2, y2 + CS);
    }
    // ⑤ 断崖爆发的光谱余温
    for (i = 0; i < N * N; i++) {
      if (flash[i] <= 0.002) continue;
      var f = flash[i];
      var col = SPEC[Math.min(3, ((1 - f) * 4) | 0)];
      tctx.globalAlpha = f * 0.58;
      tctx.fillStyle = col;
      tctx.fillRect((i % N) * CS, ((i / N) | 0) * CS, CS, CS);
      tctx.globalAlpha = 1;
    }
    // ⑥ 棋盘外框（极细）
    tctx.strokeStyle = 'rgba(58,53,46,0.22)'; tctx.lineWidth = 1;
    tctx.strokeRect(0.5, 0.5, w - 1, w - 1);
    tctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  function edge(t, i, j, hi, x1, y1, x2, y2, rj, cj) {
    var dh = disp[j] - hi;
    if (dh <= 0.12) return;
    var lv = clamp(Math.round(disp[j]), 0, HMAX);
    t.strokeStyle = INK_D[lv];
    t.lineWidth = dh >= CLIFF ? 0 : (dh >= 2 ? 1.5 : 1.0);
    if (t.lineWidth <= 0) return;
    t.beginPath(); t.moveTo(x1, y1); t.lineTo(x2, y2); t.stroke();
  }
  function cliffMark(t, x1, y1, x2, y2) {
    // 断崖必须看得见 —— 朱砂双线 + 短横刻纹暗示「这里摔下去」
    t.strokeStyle = 'rgba(38,38,42,0.55)'; t.lineWidth = 2.4;
    t.beginPath(); t.moveTo(x1, y1); t.lineTo(x2, y2); t.stroke();
    t.strokeStyle = 'rgba(195,66,63,0.85)'; t.lineWidth = 1.6;
    t.beginPath(); t.moveTo(x1, y1); t.lineTo(x2, y2); t.stroke();
    if (Math.abs(y2 - y1) < 0.5) {
      var midX = (x1 + x2) / 2, midY = y1;
      t.strokeStyle = 'rgba(195,66,63,0.65)'; t.lineWidth = 1.2;
      t.beginPath(); t.moveTo(midX - 3, midY - 3); t.lineTo(midX + 3, midY + 3); t.stroke();
    } else {
      var midY2 = (y1 + y2) / 2, midX2 = x1;
      t.strokeStyle = 'rgba(195,66,63,0.65)'; t.lineWidth = 1.2;
      t.beginPath(); t.moveTo(midX2 - 3, midY2 - 3); t.lineTo(midX2 + 3, midY2 + 3); t.stroke();
    }
  }

  /* ---------------- 主绘制 ---------------- */
  function draw(st, dt) {
    if (!ctx) return;
    clock += dt;
    var i;

    for (i = 0; i < st.events.length; i++) onEv(st, st.events[i]);
    st.events.length = 0;

    // 高度缓动
    var moving = false;
    for (i = 0; i < N * N; i++) {
      var d = tgt[i] - disp[i];
      if (Math.abs(d) > 0.006) { disp[i] += d * Math.min(1, dt * 9); moving = true; }
      else disp[i] = tgt[i];
      if (flash[i] > 0) { flash[i] = Math.max(0, flash[i] - dt * 2.1); moving = true; }
    }

    // 滑行动画
    if (anim) {
      anim.t += dt;
      var p = clamp(anim.t / anim.dur, 0, 1), pe = ease(p);
      var seg = pe * anim.path.length;
      var idx = Math.min(anim.path.length - 1, Math.floor(seg));
      var frac = seg - idx;
      var from = idx === 0 ? null : anim.path[idx - 1];
      var to = anim.path[idx];
      var fx = from === null ? cur.x : (from % N), fy = from === null ? cur.y : ((from / N) | 0);
      cur.x = fx + ((to % N) - fx) * frac;
      cur.y = fy + ((((to / N) | 0)) - fy) * frac;
      if (p >= 1) {
        cur.x = to % N; cur.y = (to / N) | 0;
        trail.push({ x: cur.x, y: cur.y, t: 0 });
        if (trail.length > 26) trail.shift();
        applyPending();
        anim = null;
      } else {
        trail.push({ x: cur.x, y: cur.y, t: 0 });
        if (trail.length > 26) trail.shift();
      }
    }

    if (dirtyT > 0) dirtyT -= dt;
    if (dirtyT > 0 || moving) drawTerrain(st);

    ctx.setTransform(eff, 0, 0, eff, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(tcv, BX, BY, CS * N, CS * N);

    drawTrail();
    drawTargets(st);
    drawBursts(dt);
    drawPlayer(st);

    // 拖尾老化
    for (i = trail.length - 1; i >= 0; i--) { trail[i].t += dt; if (trail[i].t > 1.5) trail.splice(i, 1); }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function drawTrail() {
    if (trail.length < 2) return;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (var i = 1; i < trail.length; i++) {
      var a = trail[i - 1], b = trail[i];
      var f = clamp(1 - b.t / 1.5, 0, 1);
      if (f <= 0.02) continue;
      ctx.strokeStyle = 'rgba(195,66,63,' + (f * 0.32).toFixed(3) + ')';
      ctx.lineWidth = 2 + f * 3.2;
      ctx.beginPath();
      ctx.moveTo(BX + (a.x + 0.5) * CS, BY + (a.y + 0.5) * CS);
      ctx.lineTo(BX + (b.x + 0.5) * CS, BY + (b.y + 0.5) * CS);
      ctx.stroke();
    }
  }

  function drawTargets(st) {
    for (var k = 0; k < st.targets.length; k++) {
      var i = st.targets[k], x = cx(i), y = cy(i);
      var lit = !!st.lit[i];
      // 涟漪
      for (var q = ripples.length - 1; q >= 0; q--) {
        if (ripples[q].i !== i) continue;
        var rp = ripples[q]; rp.t += 0.016;
        var f = rp.t / 0.85;
        if (f >= 1) { ripples.splice(q, 1); continue; }
        ctx.strokeStyle = 'rgba(195,66,63,' + ((1 - f) * 0.75).toFixed(3) + ')';
        ctx.lineWidth = 2.4 * (1 - f) + 0.6;
        ctx.beginPath(); ctx.arc(x, y, 9 + ease(f) * 26, 0, 6.2832); ctx.stroke();
      }
      if (lit) {
        ctx.fillStyle = CIN;
        ctx.beginPath(); ctx.arc(x, y, 8.5, 0, 6.2832); ctx.fill();
        ctx.strokeStyle = 'rgba(247,244,237,0.85)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(x, y, 8.5, 0, 6.2832); ctx.stroke();
      } else {
        var pu = 1 + Math.sin(clock * 2.1 + k * 1.3) * 0.06;
        ctx.fillStyle = 'rgba(247,244,237,0.90)';
        ctx.beginPath(); ctx.arc(x, y, 10.5 * pu, 0, 6.2832); ctx.fill();
        ctx.strokeStyle = 'rgba(38,38,42,0.62)'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(x, y, 10.5 * pu, 0, 6.2832); ctx.stroke();
        ctx.fillStyle = 'rgba(38,38,42,0.30)';
        ctx.beginPath(); ctx.arc(x, y, 3.1, 0, 6.2832); ctx.fill();
      }
    }
  }

  function drawBursts(dt) {
    var k, i;
    for (i = bursts.length - 1; i >= 0; i--) {
      var b = bursts[i];
      b.t += dt;
      var f = b.t / b.dur;
      if (f >= 1) { bursts.splice(i, 1); continue; }
      if (b.t < 0) continue;
      var x = cx(b.i), y = cy(b.i);
      var base = b.soft ? 0.4 : 1;
      // 四道光谱环，依次绽开（巴耳末跳变：连续到断崖）
      for (k = 0; k < 4; k++) {
        var kf = (f - k * 0.09) / (1 - k * 0.09);
        if (kf <= 0 || kf >= 1) continue;
        var e = ease(kf);
        ctx.strokeStyle = SPEC[k];
        ctx.globalAlpha = (1 - kf) * 0.85 * base;
        ctx.lineWidth = (3.4 - k * 0.5) * (1 - kf * 0.6);
        ctx.beginPath(); ctx.arc(x, y, 10 + e * (52 + k * 13), 0, 6.2832); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (!b.soft) {
        ctx.fillStyle = 'rgba(247,244,237,' + ((1 - f) * 0.5).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(x, y, 13 * (1 - f) + 4, 0, 6.2832); ctx.fill();
      }
    }
    // 尘屑
    for (i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.t += dt;
      if (p.t >= p.life) { parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += 150 * dt; p.vx *= 0.96; p.vy *= 0.96;
      var a = 1 - p.t / p.life;
      ctx.globalAlpha = a * 0.8;
      ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * a + 0.4, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawPlayer(st) {
    var x = BX + (cur.x + 0.5) * CS, y = BY + (cur.y + 0.5) * CS;
    ctx.fillStyle = 'rgba(38,38,42,0.16)';
    ctx.beginPath(); ctx.ellipse(x, y + 3.5, 8, 4.2, 0, 0, 6.2832); ctx.fill();
    ctx.fillStyle = 'rgba(247,244,237,0.92)';
    ctx.beginPath(); ctx.arc(x, y, 10.2, 0, 6.2832); ctx.fill();
    ctx.fillStyle = CIN;
    ctx.beginPath(); ctx.arc(x, y, 7.4, 0, 6.2832); ctx.fill();
    ctx.fillStyle = 'rgba(247,244,237,0.55)';
    ctx.beginPath(); ctx.arc(x - 2.2, y - 2.4, 2.2, 0, 6.2832); ctx.fill();
  }

  /* ---------------- 查询 ---------------- */
  function busy() { return !!anim; }
  function hitCell(mx, my) {
    var c = Math.floor((mx - BX) / CS), r = Math.floor((my - BY) / CS);
    if (r < 0 || r >= N || c < 0 || c >= N) return -1;
    return r * N + c;
  }

  g.InkRender = {
    W: W, H: H, BX: BX, BY: BY, CS: CS, INK: INK, PAPER: PAPER,
    init: init, setEff: setEff, setLevel: setLevel, draw: draw,
    busy: busy, hitCell: hitCell
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
