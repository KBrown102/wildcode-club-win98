/* 302 雪径 · 开路 — DOM UI / 输入 / 主循环 */
(function () {
  'use strict';
  var G = window.SC302, R = window.SC302R, A = window.SC302A;
  var cv = document.getElementById('cv'), stage = document.getElementById('stage'), wrap = document.getElementById('wrap');
  var $ = function (id) { return document.getElementById(id); };

  var NAMES = ['第一夜', '第二夜', '第三夜', '第四夜', '第五夜', '第六夜', '第七夜', '第八夜'];
  var SUBS = ['微风 · 雪未深', '起了白毛风', '雪脊初成', '冰面结得早', '风把路抹平', '长夜 · 远信', '深雪没膝', '封山前最后一趟'];
  var POEM = [
    '第一趟最难走。第二趟，就踩着自己的脚印回来了。',
    '路不是画出来的，是走出来的。',
    '你压实的那一段，风也拿它没办法。',
    '压下去的每一步都慢。可它留在那儿了。',
    '回来的路比去的路短——因为你修过。',
    '雪一直在填。你一直在走。',
    '背着信的人最沉，也最知道路的价值。',
    '天亮之前，这一片雪原上全是你踩过的路。'
  ];
  // 三星阈值（_stars302.cjs 实测标定：1★ 能过线，2★ naive→strong 的 45%，3★ 追平强档 AI）
  var STARS = [
    [620, 750, 800], [680, 820, 880], [740, 890, 950], [790, 950, 1010],
    [860, 1030, 1080], [920, 1090, 1150], [970, 1130, 1210], [1030, 1180, 1280]
  ];

  var SKEY = 'sc302.save.v1';
  var save = { best: [], unlocked: 1, muted: false };
  try { var raw = localStorage.getItem(SKEY); if (raw) save = Object.assign(save, JSON.parse(raw)); } catch (e) { }
  if (!save.best || save.best.length < 8) save.best = [0, 0, 0, 0, 0, 0, 0, 0];
  function persist() { try { localStorage.setItem(SKEY, JSON.stringify(save)); } catch (e) { } }

  // ---------- 状态 ----------
  var st = null, level = 0, seedSalt = 0, running = false, ended = false;
  var keys = {}, ptr = { on: false, ox: 0, oy: 0, dx: 0, dy: 0 }, btnPack = false, btnSlide = false;
  var lastTS = 0, devScale = 1;

  function starsOf(score, lv) {
    var t = STARS[lv] || [300, 500, 700];
    return score >= t[2] ? 3 : score >= t[1] ? 2 : score >= t[0] ? 1 : 0;
  }

  // ---------- 缩放 ----------
  function layout() {
    var vw = wrap.clientWidth, vh = wrap.clientHeight;
    var sc = Math.min(vw / 900, vh / 600);
    sc = Math.max(0.28, Math.min(sc, 1.6));
    document.documentElement.style.setProperty('--sc', sc);
    document.documentElement.style.setProperty('--inv', 1 / sc);
    devScale = Math.min((window.devicePixelRatio || 1) * sc, 2.3);
    document.body.classList.toggle('compact', sc < 0.8);
  }
  window.addEventListener('resize', layout);

  // ---------- 输入 ----------
  function keyOf(e) {
    var k = e.key || '';
    if (e.code === 'ArrowUp' || k === 'ArrowUp' || k === 'w' || k === 'W') return 'up';
    if (e.code === 'ArrowDown' || k === 'ArrowDown' || k === 's' || k === 'S') return 'down';
    if (e.code === 'ArrowLeft' || k === 'ArrowLeft' || k === 'a' || k === 'A') return 'left';
    if (e.code === 'ArrowRight' || k === 'ArrowRight' || k === 'd' || k === 'D') return 'right';
    if (k === 'Shift' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') return 'pack';
    if (k === ' ' || e.code === 'Space') return 'slide';
    if (k === 'r' || k === 'R') return 'retry';
    if (k === 'm' || k === 'M') return 'mute';
    if (k === 'Escape') return 'esc';
    return '';
  }
  window.addEventListener('keydown', function (e) {
    var k = keyOf(e);
    if (!k) return;
    if (k === 'up' || k === 'down' || k === 'left' || k === 'right' || k === 'pack' || k === 'slide') e.preventDefault();
    if (keys[k]) return;
    keys[k] = true;
    if (k === 'retry' && running) start(level);
    if (k === 'mute') toggleMute();
    if (k === 'esc') { if (!$('ovLevels').classList.contains('hide')) closeLevels(); }
    A.start();
  });
  window.addEventListener('keyup', function (e) { var k = keyOf(e); if (k) keys[k] = false; });
  window.addEventListener('blur', function () { keys = {}; ptr.on = false; });

  function canvasPt(e) {
    var r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * 900, y: (e.clientY - r.top) / r.height * 600 };
  }
  cv.addEventListener('pointerdown', function (e) {
    A.start();
    if (e.pointerType === 'touch' || navigator.maxTouchPoints > 0) document.body.classList.add('touch');
    var p = canvasPt(e);
    ptr.on = true; ptr.ox = p.x; ptr.oy = p.y; ptr.dx = 0; ptr.dy = 0;
    try { cv.setPointerCapture(e.pointerId); } catch (err) { }
    e.preventDefault();
  });
  cv.addEventListener('pointermove', function (e) {
    if (!ptr.on) return;
    var p = canvasPt(e);
    var dx = p.x - ptr.ox, dy = p.y - ptr.oy;
    var m = Math.hypot(dx, dy);
    if (m > 10) { ptr.dx = dx / m; ptr.dy = dy / m; ptr.ox = p.x - ptr.dx * 10; ptr.oy = p.y - ptr.dy * 10; }
    e.preventDefault();
  });
  function ptrEnd() { ptr.on = false; ptr.dx = 0; ptr.dy = 0; }
  cv.addEventListener('pointerup', ptrEnd);
  cv.addEventListener('pointercancel', ptrEnd);
  cv.addEventListener('pointerleave', ptrEnd);

  function holdBtn(el, set) {
    el.addEventListener('pointerdown', function (e) { e.preventDefault(); el.classList.add('act'); set(true); A.start(); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (t) {
      el.addEventListener(t, function () { el.classList.remove('act'); set(false); });
    });
  }

  function readInput() {
    var dx = 0, dy = 0;
    if (keys.left) dx -= 1; if (keys.right) dx += 1;
    if (keys.up) dy -= 1; if (keys.down) dy += 1;
    if (ptr.on && (ptr.dx || ptr.dy)) { dx += ptr.dx; dy += ptr.dy; }
    return { dx: dx, dy: dy, pack: !!keys.pack || btnPack, slide: !!keys.slide || btnSlide };
  }

  // ---------- HUD ----------
  function hud() {
    if (!st) return;
    $('hLvl').firstChild.nodeValue = NAMES[level].replace('第', '第 ').replace('夜', ' 夜');
    $('hLvlSub').textContent = SUBS[level];
    var sp = Math.max(0, st.stam / st.stamMax);
    $('bStam').firstChild.style.width = (sp * 100).toFixed(1) + '%';
    $('bStam').classList.toggle('low', sp < 0.25);
    $('vStam').textContent = Math.round(st.stam);
    var tl = Math.max(0, 1 - st.t / st.tmax);
    $('bTime').firstChild.style.width = (tl * 100).toFixed(1) + '%';
    $('vTime').textContent = Math.max(0, Math.ceil(st.tmax - st.t));
    $('vMail').textContent = st.delivered + '/' + st.total;
    var bag = $('bag');
    if (bag.childNodes.length !== st.lv.cap) {
      bag.innerHTML = '';
      for (var i = 0; i < st.lv.cap; i++) bag.appendChild(document.createElement('i'));
    }
    for (var j = 0; j < bag.childNodes.length; j++) bag.childNodes[j].className = j < st.bag ? '' : 'off';
  }

  // ---------- 事件 → 声音 / 粒子 ----------
  function drain() {
    if (!st) return;
    var ev = st.events;
    for (var i = 0; i < ev.length; i++) {
      var e = ev[i];
      switch (e.t) {
        case 'step':
          A.step(e.firm);
          if (Math.random() < (e.press ? 0.55 : 0.30)) R.puff(e.x, e.y + 6, e.press ? 2 : 1, false);
          break;
        case 'hiss':
          if (Math.random() < 0.4) A.hiss(e.v);
          if (Math.random() < 0.5) R.puff(e.x, e.y + 4, 1, false);
          break;
        case 'pick': A.pick(e.n); R.spark(e.x, e.y - 12, 12, '#C4553B'); R.puff(e.x, e.y, 8, false); break;
        case 'deliver': A.deliver(e.n); R.spark(st.lv.home.x, st.lv.home.y, 18, '#E0B04B'); break;
        case 'bump': A.bump(); break;
        case 'wear': A.wear(); break;
        case 'slideon': A.slideon(); break;
        case 'win': onEnd(true); break;
        case 'timeout': onEnd(false); break;
      }
    }
    ev.length = 0;
  }

  // ---------- 流程 ----------
  function start(lv, seed) {
    level = lv; seedSalt = (seed === undefined ? 0 : seed);
    st = G.create(level, seedSalt);
    G.update(st, 0, { dx: 0, dy: 0 });
    R.setLevel(st);
    ended = false; running = true;
    $('ovStart').classList.add('hide');
    $('ovEnd').classList.add('hide');
    $('ovLevels').classList.add('hide');
    hud();
  }
  function onEnd(win) {
    if (ended) return;
    ended = true; running = false;
    var sc = G.score(st);
    if (sc > (save.best[level] || 0)) save.best[level] = sc;
    if (win && level + 1 >= save.unlocked) save.unlocked = Math.min(8, level + 2);
    persist();
    var n = starsOf(sc, level);
    $('eStars').textContent = '★★★'.slice(0, n) + '☆☆☆'.slice(0, 3 - n);
    $('eTitle').textContent = win ? '夜　归' : '风　雪　大　了';
    $('eSub').textContent = win ? (NAMES[level] + ' · ' + SUBS[level]) : '信没能送完 —— 路还在，明天接着走';
    var rows = [
      ['送达', st.delivered + ' / ' + st.total + ' 封'],
      ['用时', st.t.toFixed(1) + ' s（限 ' + st.tmax + ' s）'],
      ['剩余体力', Math.round(st.stam) + ' / ' + st.stamMax],
      ['压实路面', Math.round(st.packed) + ' 段'],
      ['滑行', st.slides.toFixed(1) + ' s'],
      ['得分', '<b>' + sc + '</b>　最佳 ' + (save.best[level] || 0)]
    ];
    $('eStats').innerHTML = rows.map(function (r) {
      return '<div class="stat"><span>' + r[0] + '</span><span>' + r[1] + '</span></div>';
    }).join('');
    $('ePoem').textContent = win ? POEM[level] : '';
    $('bNext').style.display = (win && level < 7) ? '' : 'none';
    if (win) A.win(); else A.timeout();
    $('ovEnd').classList.remove('hide');
  }
  function openLevels() {
    var g = $('lvGrid'); g.innerHTML = '';
    for (var i = 0; i < 8; i++) {
      var d = document.createElement('div');
      d.className = 'lv' + (i >= save.unlocked ? ' lock' : '') + (i === level ? ' cur' : '');
      var b = save.best[i] || 0;
      d.innerHTML = NAMES[i] + '<u>' + G.LEVELS[i].flags + ' 封 · ' + G.LEVELS[i].rocks + ' 岩</u><s>' +
        (b > 0 ? '★'.repeat(Math.max(1, starsOf(b, i))) + ' ' + b : '—') + '</s>';
      if (i < save.unlocked) (function (ii) { d.addEventListener('click', function () { A.ui(); start(ii); }); })(i);
      g.appendChild(d);
    }
    $('ovLevels').classList.remove('hide');
  }
  function closeLevels() { $('ovLevels').classList.add('hide'); }
  function toggleMute() {
    save.muted = !save.muted; persist();
    A.setMuted(save.muted);
    $('bMute').textContent = save.muted ? '♪̶' : '♪';
    $('bMute').classList.toggle('on', !save.muted);
  }

  // ---------- 主循环 ----------
  function loop(ts) {
    var dt = lastTS ? (ts - lastTS) / 1000 : 0.0167;
    lastTS = ts;
    if (!(dt > 0)) dt = 0.0167;
    if (dt > 0.05) dt = 0.05;
    if (running && st) {
      G.update(st, dt, readInput());   // 先 update
      drain();                          // 再消费事件（顺序反了会丢音效）
    }
    if (st) {
      R.frame(st, running ? dt : 0.0001, { devScale: devScale });
      hud();
    }
    requestAnimationFrame(loop);
  }

  // ---------- 绑定 ----------
  $('bStart').addEventListener('click', function () { A.start(); A.ui(); start(level); });
  $('bStartLv').addEventListener('click', function () { A.start(); openLevels(); });
  $('bRetry').addEventListener('click', function () { A.ui(); start(level); });
  $('bLevels').addEventListener('click', function () { A.ui(); openLevels(); });
  $('bLvBack').addEventListener('click', closeLevels);
  $('bAgain').addEventListener('click', function () { A.ui(); start(level); });
  $('bEndLv').addEventListener('click', function () { A.ui(); openLevels(); });
  $('bNext').addEventListener('click', function () { A.ui(); start(Math.min(7, level + 1)); });
  $('bMute').addEventListener('click', toggleMute);
  holdBtn($('bPack'), function (v) { btnPack = v; });
  holdBtn($('bSlide'), function (v) { btnSlide = v; });
  if (navigator.maxTouchPoints > 0) document.body.classList.add('touch');

  // ---------- 启动 ----------
  layout();
  R.init(cv, G);
  A.setMuted(save.muted);
  $('bMute').textContent = save.muted ? '♪̶' : '♪';
  $('bMute').classList.toggle('on', !save.muted);
  st = G.create(0, 0); R.setLevel(st);   // 背景先跑起来（遮罩下也能看到雪）
  running = false;
  requestAnimationFrame(loop);

  window.SC302UI = { start: start, getState: function () { return st; }, save: save, STARS: STARS };
})();
