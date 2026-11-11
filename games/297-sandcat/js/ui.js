/* 297-sandcat《落沙 · 引猫夜》交互层
 * 依赖：js/game.js(逻辑) · js/render.js(画布) · js/audio.js(音频)
 * 负责：画幅缩放 / 输入 / HUD / 弹窗 / 存档 / 主循环
 */
(function () {
  'use strict';

  var G = window.SANDCAT, R = window.SANDR, S = window.SANDA;
  var LW = 840, LH = 550;                       /* 逻辑画幅 */

  var cv = document.getElementById('cv');
  var stage = document.getElementById('stage');
  var stageWrap = document.getElementById('stageWrap');
  var mask = document.getElementById('mask');
  var card = document.getElementById('card');
  var bAct = document.getElementById('bAct');

  var HUD = {
    lv: document.getElementById('hLv'),
    cat: document.getElementById('hCat'),
    lamp: document.getElementById('hLamp'),
    sand: document.getElementById('hSand'),
    fill: document.getElementById('sandFill'),
    best: document.getElementById('hBest')
  };

  /* ---------- 运行时 ---------- */
  var st = null, level = 0, mode = 0;           /* mode 0=落沙 1=铲沙 */
  var dead = false, clearing = false;
  var clearT = 0, clearTotal = 0, cardShown = false;
  var lampAcc = 0, lampIdx = 0, pendingLamps = [];
  var lampTotal = 0, lastLand = 0;
  var SC = 1, PAD = 46, DPR = 1;
  var unlock = 1, best = {}, muted = false;
  var audioReady = false;
  var SEED0 = 20260911;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* ---------- 存档 ---------- */
  function ls(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }

  function loadStore() {
    unlock = clamp(parseInt(ls('sandcat.unlock.v1', '1'), 10) || 1, 1, G.LEVELS.length);
    try { best = JSON.parse(ls('sandcat.best.v1', '{}')) || {}; } catch (e) { best = {}; }
    muted = ls('sandcat.mute.v1', '0') === '1';
  }

  /* ---------- 画幅：等比缩放 + 恒定观感的 UI 尺寸 ---------- */
  function layout() {
    var vw = window.innerWidth || 1280, vh = window.innerHeight || 800;
    var sc = Math.min(vw / LW, vh / LH);
    if (!(sc > 0.05)) sc = 0.3;
    SC = sc;

    /* 底部操作带：屏幕上看上去永远是 ≈56px 高 */
    PAD = Math.round(clamp(56 / sc, 46, 120));
    var barH = PAD;
    var btnH = Math.round(clamp(42 / sc, 26, Math.max(28, barH - 8)));
    var hudH = Math.round(clamp(30 / sc, 22, 46));
    var hudTop = Math.round(clamp(10 / sc, 6, 18));

    stageWrap.style.width = (LW * sc) + 'px';
    stageWrap.style.height = (LH * sc) + 'px';

    var r = document.documentElement.style;
    r.setProperty('--sc', String(sc));
    r.setProperty('--inv', String(1 / sc));
    r.setProperty('--barH', barH + 'px');
    r.setProperty('--btnH', btnH + 'px');
    r.setProperty('--hudH', hudH + 'px');
    r.setProperty('--hudTop', hudTop + 'px');
    r.setProperty('--pad', PAD + 'px');
    document.body.classList.toggle('tiny', vw < 620);

    DPR = Math.min(window.devicePixelRatio || 1, 2);
    if (vw * vh > 2200000) DPR = Math.min(DPR, 1.5);
    cv.width = Math.round(LW * DPR);
    cv.height = Math.round(LH * DPR);

    var ctx = cv.getContext('2d');
    R.W = LW; R.H = LH; R.dpr = DPR;
    R.setPad(PAD);
    R.init(ctx, DPR);
    if (st) { R.reset(); R.bake(st); }
  }

  /* ---------- 关卡 ---------- */
  function build(lv) {
    var seed = SEED0 + lv * 7717;
    var geo = G.genLevel(lv, seed);
    var s = G.makeState(lv, geo, seed);
    s.CELL = G.CELL;
    s.sandMax = geo.quota; s.sandBase = geo.quota; s.sandLeft = geo.quota;
    s.winLit = new Array(geo.wins.length);
    for (var i = 0; i < s.winLit.length; i++) s.winLit[i] = 0;
    lampTotal = 0;
    for (var c = 0; c < G.COL; c++) if (s.lamps[c]) lampTotal++;
    return s;
  }

  function start(lv) {
    level = clamp(lv | 0, 0, G.LEVELS.length - 1);
    st = build(level);
    dead = false; clearing = false;
    clearT = 0; clearTotal = 0; cardShown = false;
    lampAcc = 0; lampIdx = 0; pendingLamps = [];
    st.clearK = 0;
    holding = false;
    R.reset(); R.bake(st);
    hideMask();
    syncHud();
    unlockAudio();
  }

  /* ---------- HUD ---------- */
  function syncHud() {
    if (!st) return;
    HUD.lv.textContent = String(level + 1);
    HUD.cat.textContent = G.homesCount(st) + '/' + st.cats.length;
    HUD.lamp.textContent = st.litCount + '/' + lampTotal;
    HUD.sand.textContent = String(st.sandLeft);
    var pct = st.sandMax > 0 ? clamp(st.sandLeft / st.sandMax, 0, 1) : 0;
    HUD.fill.style.width = (pct * 100).toFixed(1) + '%';
    var b = best[level] | 0;
    HUD.best.textContent = b > 0 ? String(b) : '—';
  }

  /* 窗：猫走到附近就亮（揭示感，不参与计分） */
  function lightWindows() {
    if (!st || !st.wins || !st.winLit) return;
    for (var i = 0; i < st.wins.length; i++) {
      if (st.winLit[i]) continue;
      var w = st.wins[i];
      if (w.r > 6) continue;
      for (var k = 0; k < st.cats.length; k++) {
        if (Math.abs(st.cats[k].c - w.c) <= 2) { st.winLit[i] = 1; break; }
      }
    }
  }

  /* ---------- 弹窗 ---------- */
  function showCard(html) {
    card.innerHTML = html;
    mask.classList.remove('hide');
    card.classList.remove('in');
    void card.offsetWidth;
    card.classList.add('in');
  }
  function hideMask() { mask.classList.add('hide'); }

  function showStart() {
    var b = best[level] | 0;
    showCard(
      '<div class="ttl">落沙 · 引猫夜</div>' +
      '<div class="sub">第 ' + (level + 1) + ' 夜 · ' + G.LEVELS[level].cats + ' 只要回家的猫</div>' +
      '<div class="end">你碰不到猫，只能往某一列倒沙。<br>' +
      '沙有休止角 —— 它永远只肯铺成缓坡，一格最多垫高一层。<br>' +
      '把路铺平，它们自己会走。</div>' +
      '<div class="row">' +
      '<button class="mb" id="bGo">开始今夜</button>' +
      '<button class="mb g" id="bLv2">选关</button>' +
      '</div>' +
      '<div class="tip">轻点 = 落一格 · 按住 = 连续落沙 · ↑/W 铲沙 · ←→ 移光标' + (b > 0 ? ' · 最佳 ' + b : '') + '</div>'
    );
    var go = document.getElementById('bGo'), lv2 = document.getElementById('bLv2');
    if (go) go.addEventListener('click', function () { S.sfx('ui'); start(level); });
    if (lv2) lv2.addEventListener('click', function () { S.sfx('ui'); showLevels(); });
  }

  function showLevels() {
    var h = '<div class="ttl">选关</div>' +
      '<div class="end">八夜，一夜比一夜冷。通过一夜，解锁下一夜。</div><div id="lvGrid">';
    for (var i = 0; i < G.LEVELS.length; i++) {
      var lock = (i + 1) > unlock;
      var bs = best[i] | 0, ns = bs > 0 ? G.starsOf(i, bs) : 0;
      var st3 = ns > 0 ? new Array(ns + 1).join('★') : '';
      h += '<div class="lvcell' + (lock ? ' lock' : '') + (i === level ? ' cur' : '') + '" data-i="' + i + '">' +
        '<div class="n">' + (i + 1) + '</div>' +
        '<div class="sn">' + G.LEVELS[i].cats + ' 猫</div>' +
        '<div class="st">' + (lock ? '未解锁' : st3) + '</div></div>';
    }
    h += '</div><div class="row"><button class="mb g" id="bClose">关闭</button></div>';
    showCard(h);
    var cells = card.querySelectorAll('.lvcell');
    for (var k = 0; k < cells.length; k++) {
      (function (el) {
        el.addEventListener('click', function () {
          var i = parseInt(el.getAttribute('data-i'), 10) || 0;
          if (i + 1 > unlock) { S.sfx('ui'); return; }
          S.sfx('ui'); start(i);
        });
      })(cells[k]);
    }
    var bc = document.getElementById('bClose');
    if (bc) bc.addEventListener('click', function () { S.sfx('ui'); showStart(); });
  }

  function showResult() {
    var sc = G.score(st);
    var ns = G.starsOf(level, sc);
    if (!(best[level] > 0) || sc > best[level]) {
      best[level] = sc; save('sandcat.best.v1', JSON.stringify(best));
    }
    unlock = Math.max(unlock, Math.min(G.LEVELS.length, level + 2));
    save('sandcat.unlock.v1', String(unlock));

    var ct = G.clearText(level);
    var stars = '';
    for (var i = 0; i < 3; i++) stars += '<b class="' + (i < ns ? '' : 'off') + '">' + (i < ns ? '★' : '☆') + '</b>';
    var last = level + 1 >= G.LEVELS.length;
    showCard(
      '<div class="scL">今夜得分</div>' +
      '<div class="sc">' + sc + '</div>' +
      '<div class="stars">' + stars + '</div>' +
      '<div class="sub">' + ct.t + '</div>' +
      '<div class="end">' + ct.d + '</div>' +
      '<div class="row">' +
      '<button class="mb" id="bNext">' + (last ? '回到第一夜' : '下一夜') + '</button>' +
      '<button class="mb g" id="bRetry">再来一次</button>' +
      '<button class="mb g" id="bBack">选关</button>' +
      '</div>'
    );
    var nx = document.getElementById('bNext');
    if (nx) nx.addEventListener('click', function () { S.sfx('ui'); start(last ? 0 : level + 1); });
    var rt = document.getElementById('bRetry');
    if (rt) rt.addEventListener('click', function () { S.sfx('ui'); start(level); });
    var bk = document.getElementById('bBack');
    if (bk) bk.addEventListener('click', function () { S.sfx('ui'); showLevels(); });
    syncHud();
  }

  /* ---------- 过关演出：先冻手 → 逐盏点灯 → 再弹窗 ---------- */
  function onClear() {
    if (clearing) return;
    dead = true; clearing = true;
    clearT = 0; cardShown = false; lampAcc = 0; lampIdx = 0;
    endHold();
    if (st) {
      st.pouring = false; st.shoveling = false;
      st.pourReq = 0; st.shovelReq = 0;
      st.pourHoldT = 0; st.shovelHoldT = 0;
      pendingLamps = [];
      for (var c = 0; c < G.COL; c++) if (st.lamps[c] && !st.lampsLit[c]) pendingLamps.push(c);
    }
    clearTotal = clamp(0.62 + pendingLamps.length * 0.055, 1.25, 2.45);
    S.sfx('win');
  }

  function tickClear(dt) {
    clearT += dt;
    if (st) st.clearK = Math.min(1, clearT / 0.85);
    lampAcc += dt;
    var iv = 0.052;
    while (pendingLamps.length && lampAcc >= iv) {
      lampAcc -= iv;
      var c = pendingLamps.shift();
      if (st && !st.lampsLit[c]) { st.lampsLit[c] = 1; st.litCount++; }
      S.sfx('lamp', lampIdx++);
    }
    if (!pendingLamps.length && clearT >= clearTotal && !cardShown) {
      cardShown = true; showResult();
    }
  }

  /* ---------- 事件 → 音效 ---------- */
  function drain() {
    var evs = st.events;
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i];
      if (e.t === 'land') {
        var now = (window.performance && performance.now) ? performance.now() : Date.now();
        if (now - lastLand > 55) { lastLand = now; S.sfx('land'); }
      } else if (e.t === 'lamp') S.sfx('lamp', st.litCount);
      else if (e.t === 'meow') S.sfx('meow');
      else if (e.t === 'home') S.sfx('home', G.homesCount(st));
      else if (e.t === 'clear') onClear();
    }
    evs.length = 0;
  }

  /* ---------- 输入 ---------- */
  var holding = false;
  function locked() { return !st || dead || clearing || st.over; }
  function unlockAudio() {
    if (audioReady) return;
    audioReady = true;
    try { S.unlock(); if (muted) S.setMuted(true); } catch (e) { }
  }

  function colAt(clientX) {
    var r = cv.getBoundingClientRect();
    if (!r.width) return 0;
    return clamp(Math.floor((clientX - r.left) / r.width * G.COL), 0, G.COL - 1);
  }
  function inBar(clientY) {
    var r = cv.getBoundingClientRect();
    if (!r.height) return false;
    return (clientY - r.top) / r.height > (1 - PAD / LH);
  }

  function tapAt(c) {
    if (locked()) return;
    st.cursor = c;
    if (mode === 0) { G.tapPour(st, c); S.sfx('tap'); }
    else { G.tapShovel(st, c); S.sfx('shovel'); }
  }

  function beginHold() {
    if (locked() || !st) return;
    holding = true;
    if (mode === 0) st.pouring = true; else st.shoveling = true;
  }
  function endHold() {
    holding = false;
    if (!st) return;
    st.pouring = false; st.shoveling = false;
    st.pourHoldT = 0; st.shovelHoldT = 0;
    st.pourAcc = 0; st.shovelAcc = 0;
  }

  cv.addEventListener('pointerdown', function (e) {
    unlockAudio();
    if (locked() || inBar(e.clientY)) return;
    try { cv.setPointerCapture(e.pointerId); } catch (err) { }
    tapAt(colAt(e.clientX));
    beginHold();
    e.preventDefault();
  });
  cv.addEventListener('pointermove', function (e) {
    if (!holding || locked()) return;
    if (inBar(e.clientY)) return;
    st.cursor = colAt(e.clientX);
  });
  window.addEventListener('pointerup', function () { if (holding) endHold(); });
  window.addEventListener('pointercancel', function () { if (holding) endHold(); });
  window.addEventListener('blur', function () { if (holding) endHold(); });
  cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  /* 键盘 */
  window.addEventListener('keydown', function (e) {
    unlockAudio();
    var k = e.code;
    if (k === 'ArrowLeft' || k === 'KeyA') {
      if (!locked()) { st.cursor = clamp(st.cursor - 1, 0, G.COL - 1); S.sfx('ui'); }
      e.preventDefault(); return;
    }
    if (k === 'ArrowRight' || k === 'KeyD') {
      if (!locked()) { st.cursor = clamp(st.cursor + 1, 0, G.COL - 1); S.sfx('ui'); }
      e.preventDefault(); return;
    }
    if (k === 'ArrowDown' || k === 'KeyS' || k === 'Space') {
      if (!locked()) {
        if (!e.repeat) { G.tapPour(st, st.cursor); S.sfx('tap'); }
        st.pouring = true; holding = true;
      }
      e.preventDefault(); return;
    }
    if (k === 'ArrowUp' || k === 'KeyW') {
      if (!locked()) {
        if (!e.repeat) { G.tapShovel(st, st.cursor); S.sfx('shovel'); }
        st.shoveling = true; holding = true;
      }
      e.preventDefault(); return;
    }
    if (k === 'KeyR') { if (st) start(level); e.preventDefault(); return; }
    if (k === 'KeyM') { toggleMute(); e.preventDefault(); return; }
    if (k === 'Escape') { if (st) showLevels(); e.preventDefault(); return; }
  });
  window.addEventListener('keyup', function (e) {
    var k = e.code;
    if (k === 'ArrowDown' || k === 'KeyS' || k === 'Space') { if (st) st.pouring = false; holding = false; }
    if (k === 'ArrowUp' || k === 'KeyW') { if (st) st.shoveling = false; holding = false; }
  });

  /* ---------- 按钮 ---------- */
  function bindHold(btn, fn) {
    if (!btn) return;
    btn.addEventListener('pointerdown', function (e) {
      unlockAudio(); fn(); e.preventDefault();
    });
    btn.addEventListener('pointerup', function (e) { e.preventDefault(); });
    btn.addEventListener('click', function (e) { e.preventDefault(); });
  }
  function setMode(m) {
    mode = m;
    var bp = document.getElementById('bPourM'), bs = document.getElementById('bShovM');
    if (bp) bp.classList.toggle('on', m === 0);
    if (bs) bs.classList.toggle('on', m === 1);
    bAct.textContent = m === 0 ? '按住落沙' : '按住铲沙';
  }
  function move(d) {
    unlockAudio();
    if (locked()) return;
    st.cursor = clamp(st.cursor + d, 0, G.COL - 1);
    S.sfx('ui');
  }
  function toggleMute() {
    muted = !muted;
    try { S.setMuted(muted); } catch (e) { }
    save('sandcat.mute.v1', muted ? '1' : '0');
    var bm = document.getElementById('bMute');
    if (bm) bm.classList.toggle('on', !muted);
    if (!muted) { unlockAudio(); S.sfx('ui'); }
  }

  function bindAll() {
    var bp = document.getElementById('bPourM'), bs = document.getElementById('bShovM');
    if (bp) bp.addEventListener('click', function () { unlockAudio(); setMode(0); S.sfx('ui'); });
    if (bs) bs.addEventListener('click', function () { unlockAudio(); setMode(1); S.sfx('ui'); });

    bindHold(bAct, function () {
      if (locked()) return;
      if (mode === 0) { G.tapPour(st, st.cursor); S.sfx('tap'); }
      else { G.tapShovel(st, st.cursor); S.sfx('shovel'); }
      beginHold();
    });
    window.addEventListener('pointerup', function () { if (holding) endHold(); });

    /* 左右：单击移一格，按住连续移 */
    [['bLeft', -1], ['bRight', 1]].forEach(function (p) {
      var b = document.getElementById(p[0]), d = p[1];
      if (!b) return;
      var t1 = 0, t2 = 0;
      b.addEventListener('pointerdown', function (e) {
        unlockAudio(); move(d); e.preventDefault();
        t1 = setTimeout(function () { t2 = setInterval(function () { move(d); }, 85); }, 300);
      });
      var stop = function () { clearTimeout(t1); clearInterval(t2); };
      b.addEventListener('pointerup', stop);
      b.addEventListener('pointerleave', stop);
      b.addEventListener('pointercancel', stop);
    });

    var br = document.getElementById('bReset');
    if (br) br.addEventListener('click', function () { unlockAudio(); if (st) start(level); });
    var bl = document.getElementById('bLv');
    if (bl) bl.addEventListener('click', function () { unlockAudio(); showLevels(); });
    var bm = document.getElementById('bMute');
    if (bm) {
      bm.addEventListener('click', function () { toggleMute(); });
      bm.classList.toggle('on', !muted);
    }

    var pt = document.getElementById('portrait');
    if (pt) pt.addEventListener('click', function () { pt.classList.add('gone'); });

    var rz = 0;
    window.addEventListener('resize', function () {
      clearTimeout(rz); rz = setTimeout(function () { layout(); }, 90);
    });
    window.addEventListener('orientationchange', function () {
      clearTimeout(rz); rz = setTimeout(function () { layout(); }, 220);
    });
  }

  /* ---------- 主循环 ---------- */
  var last = 0;
  function frame(ts) {
    var dt = last ? (ts - last) / 1000 : 0.016;
    last = ts;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.05) dt = 0.05;
    if (st) {
      if (clearing) tickClear(dt);
      G.step(st, dt);
      drain();
      syncHud();
      lightWindows();
      R.draw(st, st.time, {});
    }
    requestAnimationFrame(frame);
  }

  /* ---------- 启动 ---------- */
  loadStore();
  layout();
  st = build(level);            /* 开场背景：先摆好一座城 */
  R.reset(); R.bake(st);
  setMode(0);
  showStart();
  bindAll();
  if (muted) { try { S.setMuted(true); } catch (e) { } }
  try { S.load(); } catch (e) { }
  requestAnimationFrame(frame);

  /* 调试 / 探针接口 */
  window.SC297 = {
    G: G, R: R, S: S,
    get st() { return st; },
    get level() { return level; },
    get mode() { return mode; },
    get dead() { return dead; },
    get clearing() { return clearing; },
    get pad() { return PAD; },
    get sc() { return SC; },
    get unlock() { return unlock; },
    start: start,
    layout: layout,
    showLevels: showLevels,
    showStart: showStart
  };
})();
