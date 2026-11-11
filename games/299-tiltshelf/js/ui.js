/* 299-tiltshelf《归架 · 轻重》 —— UI / 输入 / 主循环 */
(function (root) {
  'use strict';
  var G = root.SC299, R = root.SC299R, A = root.SC299A;
  var doc = document;

  var SEEDS = [4211, 5188, 6165, 7142, 8119, 9096, 10073, 11050];
  var STORE = 'sc299.v1';
  var CLEAR_WORDS = [
    '轻的靠外，重的靠里。第一格放对了，后面就都顺了。',
    '支点不在正中——记住，同一件东西放左边和放右边，压下去的力不一样。',
    '两层各算各的账。别只顾着一面板平。',
    '三种颜色，三段位置。色归色，平归平，两件事一起做。',
    '越长的板，力臂越值钱。差一格，就是天壤之别。',
    '三层叠起来，上面歪一点，下面就得补很多。',
    '支点偏到边上去了。远端的那一格，是全场最贵的位置。',
    '满架。能站住的，从来不是每样东西都在它该在的地方，而是它们彼此都让得住。'
  ];
  var KIND_CN = ['瓷', '木', '石'];

  var st = G.makeState();
  var save = { best: {}, unlocked: 0, muted: false };
  var curLv = 0;
  var running = false, lastT = 0, rafId = 0;
  var traySig = '';

  // ---------- 存档 ----------
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE) || '{}');
      if (s && typeof s === 'object') {
        save.best = s.best || {}; save.unlocked = s.unlocked || 0; save.muted = !!s.muted;
      }
    } catch (e) { /* 忽略 */ }
  }
  function persist() {
    try { localStorage.setItem(STORE, JSON.stringify(save)); } catch (e) { /* 忽略 */ }
  }

  // ---------- DOM ----------
  var $ = function (id) { return doc.getElementById(id); };
  var stage, cv, elTray, elInfo, elMute, elToast;

  function setScale() {
    var vw = root.innerWidth, vh = root.innerHeight;
    var sc = Math.min(vw / 900, vh / 660);
    sc = Math.max(0.24, Math.min(1.35, sc));
    var pad = G.clamp(150 / sc, 108, 258);
    stage.style.setProperty('--sc', sc);
    stage.style.setProperty('--inv', 1 / sc);
    stage.style.setProperty('--pad', pad.toFixed(2) + 'px');
    stage.classList.toggle('compact', sc < 0.8);
    // 竖屏提示
    var portrait = (vh > vw * 1.18);
    $('portrait').classList.toggle('show', portrait && !save.portraitHidden);
    // canvas 逻辑尺寸
    var h = Math.max(220, Math.round(660 - pad));
    R.setSize(900, h, Math.min(2, root.devicePixelRatio || 1));
  }

  // ---------- 关卡 ----------
  function startLevel(lv) {
    curLv = lv;
    G.start(st, lv, SEEDS[lv % SEEDS.length]);
    R.reset();
    var it = G.heldItem(st);
    R.setHold(it);
    R.setCursor(0, Math.floor(st.shelves[0].cols / 2));
    running = true;
    settleT = -1;
    traySig = '';
    renderTray(true);
    renderInfo();
    hideAll();
    A.ensure();
  }

  function hideAll() {
    ['start', 'levels', 'result'].forEach(function (k) { $(k).classList.remove('show'); });
  }

  // ---------- 面板 ----------
  function renderInfo() {
    if (!st.cfg) return;
    var left = st.maxMoves - st.moves;
    var sc = st.over ? st.finalScore : G.score(st);
    var zoned = G.zonedCount(st), total = st.items.length;
    var okAll = true;
    for (var s = 0; s < st.shelves.length; s++) if (Math.abs(st.shelves[s].theta) > st.shelves[s].tol) okAll = false;
    elInfo.innerHTML =
      '<span id="lvName">第 ' + (curLv + 1) + ' 关 · ' + st.cfg.name + '</span>' +
      '<span class="chip">归位 ' + zoned + '/' + total + '</span>' +
      '<span class="chip' + (okAll ? '' : ' warn') + '">' + (okAll ? '已水平' : '未水平') + '</span>' +
      '<span class="chip' + (left <= 2 ? ' warn' : '') + '">工时 ' + left + '</span>' +
      '<span class="chip">分 ' + sc + '</span>' +
      '<span id="goalTip">空格/点击 = 放下 · 再点 = 撤下 · Q/E 换货 · R 重来</span>';
  }

  function renderTray(force) {
    var sig = st.queue.join(',') + '|' + st.hold + '|' + (st.over ? 1 : 0);
    if (!force && sig === traySig) return;
    traySig = sig;
    if (!st.queue.length) {
      elTray.innerHTML = '<span class="trayEmpty">手上空了 —— 让每面板都水平下来就收工</span>';
      return;
    }
    var h = '';
    for (var i = 0; i < st.queue.length; i++) {
      var it = st.items[st.queue[i]];
      h += '<div class="card' + (i === st.hold ? ' sel' : '') + '" data-i="' + i + '" data-k="' + it.kind + '">' +
        '<span class="w">' + it.w + '</span>' +
        '<span class="k">' + KIND_CN[it.kind] + '</span></div>';
    }
    elTray.innerHTML = h;
  }

  var toastTimer = 0;
  function toast(msg) {
    elToast.textContent = msg;
    elToast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { elToast.classList.remove('show'); }, 1600);
  }

  // ---------- 输入 ----------
  function hitCell(lx, ly) {
    var L = R.layout(st);
    for (var s = 0; s < st.shelves.length; s++) {
      var sh = st.shelves[s], y = L.ys[s], px = L.x0 + sh.pivot * L.CW;
      var a = -sh.theta * Math.PI / 180;
      var dx = lx - px, dy = ly - y;
      var rx = dx * Math.cos(a) - dy * Math.sin(a);
      var ry = dx * Math.sin(a) + dy * Math.cos(a);
      if (ry > -L.itemH - 16 && ry < 12) {
        var c = Math.floor(rx / L.CW + sh.pivot);
        if (c >= 0 && c < sh.cols) return { s: s, c: c };
      }
    }
    return null;
  }

  function doCell(s, c) {
    if (st.over) return;
    R.setCursor(s, c);
    var had = !!st.shelves[s].cells[c];
    var ok = G.tapCell(st, s, c);
    if (!ok) { A.play('deny'); if (!had && st.moves >= st.maxMoves) toast('工时用完了，按 R 重来'); return; }
    R.setHold(G.heldItem(st));
    renderTray();
  }

  function bindInput() {
    cv.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      A.ensure();
      var r = cv.getBoundingClientRect();
      var lx = (e.clientX - r.left) / r.width * R.W;
      var ly = (e.clientY - r.top) / r.height * R.H;
      var h = hitCell(lx, ly);
      if (h) doCell(h.s, h.c);
    });

    elTray.addEventListener('click', function (e) {
      var card = e.target.closest ? e.target.closest('.card') : null;
      if (!card) return;
      A.ensure();
      G.setHold(st, parseInt(card.getAttribute('data-i'), 10));
      R.setHold(G.heldItem(st));
      traySig = ''; renderTray();
      A.play('hold');
    });

    doc.addEventListener('keydown', function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      var code = e.code || '', key = (e.key || '').toLowerCase();
      var k = code.replace('Key', '').toLowerCase();
      function isLeft() { return code === 'ArrowLeft' || k === 'a' || key === 'arrowleft' || key === 'a'; }
      function isRight() { return code === 'ArrowRight' || k === 'd' || key === 'arrowright' || key === 'd'; }
      function isUp() { return code === 'ArrowUp' || k === 'w' || key === 'arrowup' || key === 'w'; }
      function isDown() { return code === 'ArrowDown' || k === 's' || key === 'arrowdown' || key === 's'; }

      if (['start', 'levels', 'result'].some(function (id) { return $(id).classList.contains('show'); })) {
        if (code === 'Escape') showLevels();
        return;
      }
      A.ensure();
      if (isLeft()) { G.moveCursor(st, 0, -1); R.setCursor(st.cursor.s, st.cursor.c); e.preventDefault(); }
      else if (isRight()) { G.moveCursor(st, 0, 1); R.setCursor(st.cursor.s, st.cursor.c); e.preventDefault(); }
      else if (isUp()) { G.moveCursor(st, -1, 0); R.setCursor(st.cursor.s, st.cursor.c); e.preventDefault(); }
      else if (isDown()) { G.moveCursor(st, 1, 0); R.setCursor(st.cursor.s, st.cursor.c); e.preventDefault(); }
      else if (k === 'q') { G.cycleHold(st, -1); R.setHold(G.heldItem(st)); A.play('hold'); traySig = ''; renderTray(); e.preventDefault(); }
      else if (k === 'e') { G.cycleHold(st, 1); R.setHold(G.heldItem(st)); A.play('hold'); traySig = ''; renderTray(); e.preventDefault(); }
      else if (code === 'Tab') { G.cycleHold(st, e.shiftKey ? -1 : 1); R.setHold(G.heldItem(st)); A.play('hold'); traySig = ''; renderTray(); e.preventDefault(); }
      else if (code === 'Space' || code === 'Enter' || code === 'NumpadEnter') { doCell(st.cursor.s, st.cursor.c); e.preventDefault(); }
      else if (k === 'r') { startLevel(curLv); e.preventDefault(); }
      else if (code === 'Escape') { showLevels(); }
    });
  }

  // ---------- 结算 ----------
  function finish() {
    var sc = st.finalScore;
    var thr = G.STARS[curLv] || [1, 2, 3];
    var n = G.starsOf(sc, thr);
    var prev = save.best[curLv] || 0;
    if (sc > prev) save.best[curLv] = sc;
    if (st.win && curLv + 1 > save.unlocked) save.unlocked = Math.min(G.LEVELS.length - 1, curLv + 1);
    persist();
    A.play(st.win ? 'clear' : 'end');
    if (n > 0) setTimeout(function () { A.play('star', n); }, 420);

    $('resStar').textContent = '★★★'.slice(0, n) + '☆☆☆'.slice(0, 3 - n);
    $('resStat').innerHTML =
      '<div class="resItem"><div class="v">' + sc + '</div><div class="l">得分</div></div>' +
      '<div class="resItem"><div class="v">' + G.zonedCount(st) + '/' + st.items.length + '</div><div class="l">归位</div></div>' +
      '<div class="resItem"><div class="v">' + st.moves + '</div><div class="l">工时</div></div>' +
      '<div class="resItem"><div class="v">' + st.slides + '</div><div class="l">滑落</div></div>' +
      '<div class="resItem"><div class="v">' + Math.max(prev, sc) + '</div><div class="l">最佳</div></div>';
    $('resWord').innerHTML = st.win
      ? '<em>' + CLEAR_WORDS[curLv % CLEAR_WORDS.length] + '</em>'
      : '东西还没各归其位。记住：<em>离支点越远，压得越狠</em> —— 重物贴近支点，轻物甩到远端。';
    $('btnNext').style.display = (st.win && curLv < G.LEVELS.length - 1) ? '' : 'none';
    $('resTitle').textContent = st.win ? '收工' : '再来一次';
    $('result').classList.add('show');
  }

  // ---------- 蒙层 ----------
  function showLevels() {
    var h = '';
    for (var i = 0; i < G.LEVELS.length; i++) {
      var locked = i > save.unlocked;
      var b = save.best[i] || 0;
      var n = b > 0 ? G.starsOf(b, G.STARS[i]) : 0;
      h += '<button class="lvCard" data-i="' + i + '"' + (locked ? ' disabled' : '') + '>' +
        '<span class="n">' + (locked ? '·' : (i + 1)) + '</span>' +
        '<span class="t">' + G.LEVELS[i].name + '</span>' +
        '<span class="s">' + (n ? '★'.repeat(n) : (locked ? '未解锁' : '—')) + '</span></button>';
    }
    $('lvGrid').innerHTML = h;
    hideAll();
    $('levels').classList.add('show');
  }

  // ---------- 主循环 ----------
  var settleT = -1;   // <0 = 未进入收工演出
  function frame(ts) {
    rafId = requestAnimationFrame(frame);
    var dt = lastT ? (ts - lastT) / 1000 : 0.016;
    lastT = ts;
    if (!(dt > 0)) dt = 0.016;
    if (dt > 0.06) dt = 0.06;

    if (running) {
      G.update(st, dt);                 // ① 先 update（生成事件）
      for (var i = 0; i < st.events.length; i++) {
        var e = st.events[i];
        if (e.t === 'place') A.play('place', e.kind);
        else if (e.t === 'pick') A.play('pick');
        else if (e.t === 'slide') A.play('slide');
        else if (e.t === 'fall') A.play('fall');
        else if (e.t === 'clear') { settleT = 1.15; }   // 收工演出：先让世界演完再弹窗
        else if (e.t === 'end') { settleT = 0.75; }
      }
      if (st.over && settleT < 0) settleT = 0.75;
      R.consumeEvents(st);              // ② 渲染层消费事件
      R.setHold(st.over ? null : G.heldItem(st));
      R.setCursor(st.cursor.s, st.cursor.c);
      renderInfo();
      renderTray();
      if (settleT >= 0) {               // ③ 冻手 → 演出 → 弹窗
        settleT -= dt;
        if (settleT <= 0) { running = false; settleT = -1; finish(); }
      }
    }
    R.draw(st, dt);
  }

  // ---------- 启动 ----------
  function boot() {
    stage = $('stage'); cv = $('cv'); elTray = $('tray'); elInfo = $('info'); elMute = $('mute'); elToast = $('toast');
    load();
    R.init(cv);
    setScale();
    root.addEventListener('resize', setScale);
    root.addEventListener('orientationchange', function () { setTimeout(setScale, 120); });

    bindInput();

    $('btnStart').addEventListener('click', function () { A.ensure(); A.setMuted(save.muted); startLevel(Math.min(save.unlocked, G.LEVELS.length - 1)); });
    $('btnLevels').addEventListener('click', function () { A.ensure(); showLevels(); });
    $('lvGrid').addEventListener('click', function (e) {
      var c = e.target.closest ? e.target.closest('.lvCard') : null;
      if (!c || c.disabled) return;
      A.ensure(); startLevel(parseInt(c.getAttribute('data-i'), 10));
    });
    $('lvBack').addEventListener('click', function () { hideAll(); $('start').classList.add('show'); });
    $('btnRetry').addEventListener('click', function () { startLevel(curLv); });
    $('btnNext').addEventListener('click', function () { startLevel(Math.min(G.LEVELS.length - 1, curLv + 1)); });
    $('btnResLevels').addEventListener('click', function () { showLevels(); });
    $('btnPrev').addEventListener('click', function () { A.ensure(); G.cycleHold(st, -1); R.setHold(G.heldItem(st)); A.play('hold'); traySig = ''; renderTray(); });
    $('btnNextItem').addEventListener('click', function () { A.ensure(); G.cycleHold(st, 1); R.setHold(G.heldItem(st)); A.play('hold'); traySig = ''; renderTray(); });
    $('btnUndo').addEventListener('click', function () {
      if (st.over) return;
      var last = null;
      for (var s = 0; s < st.shelves.length; s++)
        for (var c = 0; c < st.shelves[s].cols; c++) if (st.shelves[s].cells[c]) last = { s: s, c: c };
      if (!last) { toast('板上还没有东西'); return; }
      G.pickup(st, last.s, last.c); R.setHold(G.heldItem(st)); traySig = ''; renderTray();
    });
    $('btnReset').addEventListener('click', function () { startLevel(curLv); });
    $('btnLevels2').addEventListener('click', function () { showLevels(); });

    elMute.addEventListener('click', function () {
      save.muted = !save.muted; persist();
      A.setMuted(save.muted);
      elMute.textContent = save.muted ? '🔇' : '🔊';
    });
    elMute.textContent = save.muted ? '🔇' : '🔊';

    $('portraitClose').addEventListener('click', function () {
      save.portraitHidden = true; persist();
      $('portrait').classList.remove('show');
    });

    $('start').classList.add('show');
    lastT = 0;
    rafId = requestAnimationFrame(frame);
  }

  // 供冒烟 / 探针使用
  root.SC299UI = {
    startLevel: startLevel, showLevels: showLevels, state: function () { return st; },
    save: function () { return save; }, boot: boot, setScale: setScale,
    hitCell: hitCell, doCell: doCell, SEEDS: SEEDS
  };

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
