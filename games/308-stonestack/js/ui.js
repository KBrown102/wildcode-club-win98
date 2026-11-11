/* 308-stonestack · 主控：输入 / HUD / 选关 / 结算 / 存档 */
(function () {
  'use strict';
  var G = window.SS308, R = window.SSR308, A = window.SSA308;
  var W = G.W, H = G.H;

  var cv = document.getElementById('cv');
  var ctx = cv.getContext('2d');
  var stage = document.getElementById('stage');
  var $ = function (id) { return document.getElementById(id); };

  var LS = 'ss308.v1';
  var save = { best: {}, unlocked: 1, muted: false };
  try {
    var raw = localStorage.getItem(LS);
    if (raw) { var o = JSON.parse(raw); if (o && typeof o === 'object') { save.best = o.best || {}; save.unlocked = o.unlocked || 1; save.muted = !!o.muted; } }
  } catch (e) { }
  function persist() { try { localStorage.setItem(LS, JSON.stringify(save)); } catch (e) { } }

  var st = null, li = 0, seed = 1, dropX = G.CX, running = false;
  var keys = {}, holdL = false, holdR = false, autoFn = null, lastT = 0;
  var toastMsg = '', toastT = 0;

  // ── 自适应缩放 ───────────────────────────────────
  function fit() {
    var vw = window.innerWidth, vh = window.innerHeight;
    var sc = Math.min(vw / W, vh / H);
    sc = Math.max(0.30, Math.min(sc, 1.6));
    stage.style.setProperty('--sc', sc);
    stage.style.setProperty('--inv', 1 / sc);
    stage.classList.toggle('compact', sc < 0.8);
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    var bw = Math.ceil(W * Math.min(dpr * sc, 2.6));
    if (cv.width !== bw) { cv.width = bw; cv.height = Math.ceil(H * (bw / W)); }
    ctx.setTransform(bw / W, 0, 0, bw / W, 0, 0);
  }
  window.addEventListener('resize', fit);

  // ── 开局 ─────────────────────────────────────────
  function start(level, sd) {
    li = level; seed = sd == null ? (1 + ((Math.random() * 6) | 0)) : sd;
    st = G.newState(li, seed);
    dropX = G.CX;
    R.clearFx();
    running = true; autoFn = null;
    $('menu').classList.remove('show');
    $('result').classList.remove('show');
    A.init(); A.setFlow(st.flow); A.setMuted(save.muted);
    syncMute(); syncHUD();
  }

  function syncHUD() {
    if (!st) return;
    $('lvName').textContent = (li + 1) + '· ' + st.L.name;
    $('layerTxt').textContent = st.tower.length + ' / ' + G.goalLayers(st.L);
    $('time').textContent = Math.max(0, st.time).toFixed(0) + 's';
    $('score').textContent = G.score(st);
    $('stoneTxt').textContent = (st.pool.length - st.pnext + st.basket.filter(Boolean).length) + ' 块';
    var mg = st.tower.length ? st.margin : 0;
    var pct = st.tower.length ? Math.max(0, Math.min(1, mg / G.STABLE_FULL)) : 0;
    $('stabFill').style.width = (pct * 100).toFixed(1) + '%';
    $('stabFill').style.background = pct < 0.3 ? 'linear-gradient(90deg,#D9705A,#C4553B)' : (pct < 0.62 ? 'linear-gradient(90deg,#E0B04B,#D9A441)' : 'linear-gradient(90deg,#7FA9A4,#5E8494)');
    $('stabTxt').textContent = st.tower.length ? (mg >= 0 ? '稳 ' + mg.toFixed(0) : '危 ' + mg.toFixed(0)) : '—';
    var tip = $('tip');
    if (st.over) tip.textContent = st.win ? '塔立住了。' : '溪水还在流，石头用完了。';
    else if (!st.tower.length) tip.textContent = '先把最宽的那块放下水，压住溪底';
    else if (mg < 10) tip.textContent = '水在往右推 —— 往上游（左）偏一点';
    else if (st.flow > 0.5 && st.tower.length >= 3) tip.textContent = '底下的石头最吃力，宽的要留在下面';
    else tip.textContent = '重心要落在下面的石头上，别贪高';
    tip.classList.toggle('hot', !st.over && st.tower.length > 0 && mg < 10);
  }

  // ── 输入 ─────────────────────────────────────────
  function keyOf(e) {
    var k = e.key || '';
    if (k === 'ArrowLeft' || k === 'a' || k === 'A' || e.code === 'ArrowLeft' || e.code === 'KeyA') return 'L';
    if (k === 'ArrowRight' || k === 'd' || k === 'D' || e.code === 'ArrowRight' || e.code === 'KeyD') return 'R';
    if (k === ' ' || k === 'Enter' || e.code === 'Space' || e.code === 'Enter') return 'P';
    if (k === 'z' || k === 'Z' || k === 'r' || k === 'R' || e.code === 'KeyZ' || e.code === 'KeyR') return 'U';
    if (k === '1') return 'S1'; if (k === '2') return 'S2'; if (k === '3') return 'S3';
    if (k === 'q' || k === 'Q' || k === 'e' || k === 'E') return 'N';
    return '';
  }
  window.addEventListener('keydown', function (e) {
    var k = keyOf(e); if (!k) return;
    e.preventDefault();
    if (k === 'L') holdL = true;
    else if (k === 'R') holdR = true;
    else if (k === 'P') doPlace();
    else if (k === 'U') doUndo();
    else if (k === 'S1') selSlot(0);
    else if (k === 'S2') selSlot(1);
    else if (k === 'S3') selSlot(2);
    else if (k === 'N') cycleSel();
  });
  window.addEventListener('keyup', function (e) {
    var k = keyOf(e);
    if (k === 'L') holdL = false;
    if (k === 'R') holdR = false;
  });

  function canvasPos(e) {
    var r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
  }
  var dragging = false;
  cv.addEventListener('pointerdown', function (e) {
    A.init();
    var p = canvasPos(e);
    // 点石篮 = 选石头
    for (var i = 0; i < R.BASKET_BOX.length; i++) {
      var b = R.BASKET_BOX[i];
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) { selSlot(i); return; }
    }
    if (st && st.over) return;
    dragging = true;
    try { cv.setPointerCapture(e.pointerId); } catch (er) { }
    dropX = G.clamp(p.x, G.XMIN, G.XMAX);
    if (e.pointerType === 'mouse') { } // 桌面：抬起时落石
  });
  cv.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    var p = canvasPos(e);
    if (p.x < 700) dropX = G.clamp(p.x, G.XMIN, G.XMAX);
  });
  cv.addEventListener('pointerup', function (e) {
    if (!dragging) return;
    dragging = false;
    if (e.pointerType === 'mouse') doPlace();
  });
  cv.addEventListener('pointercancel', function () { dragging = false; });

  function selSlot(i) {
    if (!st || !st.basket[i]) return;
    st.sel = i; A.select();
  }
  function cycleSel() {
    if (!st) return;
    for (var k = 1; k <= 3; k++) {
      var i = (st.sel + k) % 3;
      if (st.basket[i]) { st.sel = i; A.select(); return; }
    }
  }
  function doPlace() {
    if (!st || st.over || autoFn) return;
    var b = st.basket[st.sel];
    if (!b) { cycleSel(); b = st.basket[st.sel]; }
    if (!b) return;
    var res = G.place(st, st.sel, dropX);
    if (res.ok) { A.place(st.tower.length - 1); if (res.why === 'collapse') A.collapse(3); }
    else if (res.why === 'slip') A.slip();
    syncHUD();
  }
  function doUndo() {
    if (!st || st.over || autoFn) return;
    if (G.undo(st)) { A.undo(); dropX = st.tower.length ? st.tower[st.tower.length - 1].tx : G.CX; syncHUD(); }
  }

  function bindHold(id, on, off) {
    var el = $(id);
    el.addEventListener('pointerdown', function (e) { e.preventDefault(); A.init(); on(); });
    el.addEventListener('pointerup', function (e) { e.preventDefault(); if (off) off(); });
    el.addEventListener('pointerleave', function () { if (off) off(); });
    el.addEventListener('pointercancel', function () { if (off) off(); });
  }
  bindHold('bLeft', function () { holdL = true; }, function () { holdL = false; });
  bindHold('bRight', function () { holdR = true; }, function () { holdR = false; });
  $('bDrop').addEventListener('click', function (e) { e.preventDefault(); doPlace(); });
  $('bUndo').addEventListener('click', function (e) { e.preventDefault(); doUndo(); });
  $('bSwap').addEventListener('click', function (e) { e.preventDefault(); cycleSel(); });
  $('bRestart').addEventListener('click', function () { start(li, seed); });
  $('bMenu').addEventListener('click', function () { openMenu(); });
  $('bPlay').addEventListener('click', function () { start(li, seed); });
  $('bClose').addEventListener('click', function () { $('menu').classList.remove('show'); if (!st) start(0, 1); });
  $('bAgain').addEventListener('click', function () { start(li, seed); });
  $('bNext').addEventListener('click', function () { if (li + 1 < G.LEVELS.length) start(li + 1); else openMenu(); });
  $('bMute').addEventListener('click', function () { save.muted = !save.muted; persist(); A.setMuted(save.muted); syncMute(); });
  function syncMute() { $('bMute').textContent = save.muted ? '♪ 关' : '♪ 开'; $('bMute').classList.toggle('off', save.muted); }

  // ── 选关 ─────────────────────────────────────────
  function openMenu() {
    var wrap = $('levels'); wrap.innerHTML = '';
    for (var i = 0; i < G.LEVELS.length; i++) {
      (function (i) {
        var d = document.createElement('button');
        var locked = i + 1 > save.unlocked;
        d.className = 'lv' + (locked ? ' locked' : '') + (i === li ? ' cur' : '');
        var b = save.best[i] || 0;
        d.innerHTML = '<b>' + (i + 1) + '</b><span>' + G.LEVELS[i].name + '</span><i>' + (b ? b + '分' : (locked ? '锁' : '未叠')) + '</i>';
        d.addEventListener('click', function () { if (!locked) { start(i); } });
        wrap.appendChild(d);
      })(i);
    }
    $('menu').classList.add('show');
  }

  // ── 结算 ─────────────────────────────────────────
  function showResult() {
    var sc = st.finalScore;
    var n = G.rank(li, sc);
    var srow = G.stars(li);
    $('rTitle').textContent = st.win ? '塔立住了' : '溪水还在流';
    $('rSub').textContent = st.win
      ? G.POEMS[li]
      : (st.tower.length ? '叠到 ' + st.tower.length + ' 层，差一点点。石头可以再收回来重放。' : '一块也没落下去。先挑最宽的那块压住溪底。');
    var sEl = $('rStars');
    sEl.innerHTML = '';
    for (var i = 0; i < 3; i++) {
      var sp = document.createElement('span');
      sp.textContent = '★'; sp.className = i < n ? 'on' : '';
      sEl.appendChild(sp);
    }
    $('rGoal').textContent = srow.join(' / ');
    var rows = [
      ['层数', st.tower.length + ' / ' + G.goalLayers(st.L)],
      ['稳定余量', st.tower.length ? (st.margin >= 900 ? '—' : st.margin.toFixed(0)) : '0'],
      ['塌落', st.collapses + ' 次'],
      ['用石', st.used + ' 块 / 共 ' + st.pool.length],
      ['余时', Math.max(0, st.time).toFixed(0) + 's'],
      ['本关最佳', (save.best[li] || 0) + ' 分']
    ];
    var rw = $('rRows'); rw.innerHTML = '';
    rows.forEach(function (r) {
      var d = document.createElement('div'); d.className = 'rrow';
      d.innerHTML = '<label>' + r[0] + '</label><span>' + r[1] + '</span>';
      rw.appendChild(d);
    });
    if (sc > (save.best[li] || 0)) { save.best[li] = sc; }
    if (st.win && li + 1 >= save.unlocked && li + 1 < G.LEVELS.length) save.unlocked = li + 2;
    persist();
    $('result').classList.add('show');
    if (st.win) { A.win(); setTimeout(function () { A.playTower(st.tower.length); }, 780); } else A.over();
  }

  // ── 主循环 ───────────────────────────────────────
  function frame(ts) {
    var dt = lastT ? (ts - lastT) / 1000 : 0.016;
    lastT = ts;
    if (dt > 0.05) dt = 0.05; if (!(dt > 0)) dt = 0.016;
    if (st) {
      var wasOver = st.over;
      if (autoFn) autoFn(st, dt);
      if (!st.over) {
        var sp = 210;
        if (holdL) dropX -= sp * dt;
        if (holdR) dropX += sp * dt;
        dropX = G.clamp(dropX, G.XMIN, G.XMAX);
      }
      G.update(st, dt);
      // 事件 → 音效 + 特效
      for (var i = 0; i < st.ev.length; i++) {
        var ev = st.ev[i];
        R.pushFx(ev);
        if (ev.t === 'collapse') A.collapse((ev.stones || []).length);
        else if (ev.t === 'slip') A.slip();
        else if (ev.t === 'win') { }
      }
      st.ev.length = 0;
      if (st.over && !wasOver) { running = false; setTimeout(showResult, 420); }
      R.draw(ctx, st, { dropX: dropX });
      syncHUD();
    }
    requestAnimationFrame(frame);
  }

  // 探针钩子：让真实主循环带着 AI 输入跑
  window.__ss308 = {
    start: start,
    setAuto: function (fn) { autoFn = fn; },
    state: function () { return st; },
    dropX: function (v) { if (v != null) dropX = v; return dropX; },
    place: doPlace, undo: doUndo, sel: selSlot,
    save: save
  };

  fit();
  start(0, 1);
  openMenu();
  requestAnimationFrame(frame);
})();
