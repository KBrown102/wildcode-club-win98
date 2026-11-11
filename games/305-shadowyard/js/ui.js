/* 305-shadowyard · ui.js —— DOM/CSS 层：HUD、输入、主循环、选关、结算 */
(function () {
  'use strict';
  var G = window.SC305, R = window.SC305R, A = window.SC305A;
  var cv, ctxWrap, st = null, level = 0, seedBase = 20260916;
  var sc = 1, inv = 1, dpr = 1;
  var keys = {}, last = 0, raf = 0;
  var drag = null, ghost = null, hoverPrev = -1;
  var LS = 'sc305.v1';
  var save = { best: {}, unlocked: 1, muted: false };
  var el = {};
  var settleOpen = false, menuOpen = true;

  function $(id) { return document.getElementById(id); }
  function load() {
    try { var s = JSON.parse(localStorage.getItem(LS) || 'null'); if (s && typeof s === 'object') save = Object.assign(save, s); } catch (e) { }
  }
  function store() { try { localStorage.setItem(LS, JSON.stringify(save)); } catch (e) { } }

  // ---------- 布局 ----------
  function fit() {
    var vw = window.innerWidth, vh = window.innerHeight;
    var BH = 64;
    sc = Math.min(vw / 900, (vh - BH) / 620);
    if (sc > 1.35) sc = 1.35;
    inv = 1 / sc;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    var w = $('wrap');
    w.style.setProperty('--sc', sc);
    w.style.setProperty('--inv', inv);
    document.documentElement.style.setProperty('--vh', vh + 'px');
    R.resize(sc, dpr);
    document.body.classList.toggle('compact', sc < 0.8);
  }

  // ---------- 关卡 ----------
  function newLevel(li, keepSeed) {
    level = li;
    if (!keepSeed) seedBase = 20260916;
    st = G.makeState(li, seedBase + li * 13);
    drag = null; ghost = null;
    syncHud();
    $('lvName').textContent = '其之' + '一二三四五六七八'[li] + ' · ' + G.LEVELS[li].name;
    $('lvSeed').textContent = '#' + (seedBase + li * 13);
  }

  // ---------- HUD ----------
  function syncHud() {
    var T = st.T, i;
    var rail = $('rail');
    if (rail.childElementCount !== T) {
      rail.innerHTML = '';
      for (i = 0; i < T; i++) {
        var d = document.createElement('button');
        d.className = 'tick'; d.type = 'button';
        d.innerHTML = '<b>' + G.momentName(i, T) + '</b>';
        (function (k) { d.addEventListener('click', function () { if (st.phase === 'layout') { st.pi = k; syncHud(); } }); })(i);
        rail.appendChild(d);
      }
    }
    for (i = 0; i < T; i++) {
      var t = rail.children[i];
      t.className = 'tick' + (st.phase === 'layout' ? (i === st.pi ? ' on' : '') : (i < st.ti ? ' past' : (i === st.ti ? ' on' : '')));
    }
    var nS = 0, nU = 0, tS = 0, tU = 0;
    for (i = 0; i < st.cells.length; i++) {
      var c = st.cells[i];
      if (c.type === 'shade') { tS++; if ((c.got & c.req) === c.req) nS++; }
      else { tU++; if (c.got === 0) nU++; }
    }
    $('cShade').textContent = nS + '/' + tS;
    $('cSun').textContent = nU + '/' + tU;
    $('cScore').textContent = st.over ? st.finalScore : G.score(st);
    $('btnGo').disabled = st.phase !== 'layout';
    $('btnGo').textContent = st.phase === 'over' ? '再看一天' : (st.phase === 'run' ? '日头走着…' : '开演');
    $('btnRot').disabled = !(st.sel >= 0 && st.objs[st.sel].placed);
    $('btnBack').disabled = !(st.sel >= 0 && st.objs[st.sel].placed);
    var best = save.best[level] || 0;
    $('cBest').textContent = best ? best : '—';
  }

  // ---------- 输入 ----------
  function canvasPos(e) {
    var r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * G.W, y: (e.clientY - r.top) / r.height * G.H };
  }
  function beginDrag(p) {
    if (st.phase !== 'layout') return;
    var h = G.hitTest(st, p.x, p.y);
    if (!h) { st.sel = -1; syncHud(); return; }
    var o = st.objs[h.id];
    st.sel = h.id;
    if (h.type === 'card') {
      drag = { id: o.id, from: 'tray', dx: 0, dy: 0, moved: false, sx: p.x, sy: p.y };
      ghost = { kind: o.kind, h: o.h, ang: o.ang, x: p.x, y: p.y, r: G.boundR(o), ok: false };
      A.pick();
    } else {
      drag = { id: o.id, from: 'yard', dx: p.x - o.x, dy: p.y - o.y, moved: false, sx: p.x, sy: p.y, ox: o.x, oy: o.y, oa: o.ang };
      ghost = { kind: o.kind, h: o.h, ang: o.ang, x: o.x, y: o.y, r: G.boundR(o), ok: true };
      o.placed = false;
      A.pick();
    }
    syncHud();
  }
  function moveDrag(p) {
    if (!drag) return;
    if (Math.abs(p.x - drag.sx) + Math.abs(p.y - drag.sy) > 6) drag.moved = true;
    // 不夹住院内：拖到筐上要能收起，落点是否合法交给 endDrag 判断
    var gx = p.x - drag.dx, gy = p.y - drag.dy;
    ghost.x = gx; ghost.y = gy;
    ghost.ok = G.canPlace(st, drag.id, gx, gy, ghost.ang);
  }
  function endDrag(p) {
    if (!drag) return;
    var o = st.objs[drag.id];
    if (!drag.moved && drag.from === 'tray') {
      // 点一下 = 直接安到院子中间的空处
      var put = null;
      for (var rad = 0; rad < 260 && !put; rad += 26) {
        for (var a = 0; a < 12 && !put; a++) {
          var x = G.YX0 + G.YW / 2 + Math.cos(a / 12 * 6.283) * rad;
          var y = G.YY0 + G.YH / 2 + Math.sin(a / 12 * 6.283) * rad;
          if (G.canPlace(st, drag.id, x, y, o.ang)) put = { x: x, y: y };
        }
      }
      if (put) { o.x = put.x; o.y = put.y; o.placed = true; A.place(); }
      else A.deny();
    } else if (G.inYard(ghost.x, ghost.y)) {
      if (ghost.ok) { o.x = ghost.x; o.y = ghost.y; o.ang = ghost.ang; o.placed = true; A.place(); }
      else { if (drag.from === 'yard') { o.x = drag.ox; o.y = drag.oy; o.ang = drag.oa; o.placed = true; } A.deny(); }
    } else {
      // 拖出院子 = 收回筐里
      if (drag.from === 'yard') { o.placed = false; o.x = 0; o.y = 0; A.pick(); }
      else A.deny();
    }
    drag = null; ghost = null;
    syncHud();
  }

  function onDown(e) {
    A.resume(); A.startPad();
    if (settleOpen || menuOpen) return;
    cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
    beginDrag(canvasPos(e));
    e.preventDefault();
  }
  function onMove(e) { if (drag) { moveDrag(canvasPos(e)); e.preventDefault(); } }
  function onUp(e) { if (drag) { endDrag(canvasPos(e)); e.preventDefault(); } }

  function keyDown(e) {
    var k = e.key ? e.key.toLowerCase() : '', code = e.code || '';
    var dir = null;
    if (k === 'a' || code === 'ArrowLeft' || code === 'KeyA') dir = [-1, 0];
    if (k === 'd' || code === 'ArrowRight' || code === 'KeyD') dir = [1, 0];
    if (k === 'w' || code === 'ArrowUp' || code === 'KeyW') dir = [0, -1];
    if (k === 's' || code === 'ArrowDown' || code === 'KeyS') dir = [0, 1];
    if (dir) { keys[dir[0] + ',' + dir[1]] = true; e.preventDefault(); return; }
    if (k === 'r') { doRotate(); e.preventDefault(); return; }
    if (k === 'x' || k === 'delete' || k === 'backspace') { doBack(); e.preventDefault(); return; }
    if (k === ' ' || code === 'Space') { doGo(); e.preventDefault(); return; }
    if (k === 'q') { if (st.phase === 'layout') { st.pi = (st.pi + st.T - 1) % st.T; syncHud(); } e.preventDefault(); return; }
    if (k === 'e') { if (st.phase === 'layout') { st.pi = (st.pi + 1) % st.T; syncHud(); } e.preventDefault(); return; }
    if (k === 'm') { toggleMute(); e.preventDefault(); return; }
  }
  function keyUp(e) {
    var k = e.key ? e.key.toLowerCase() : '', code = e.code || '';
    var dir = null;
    if (k === 'a' || code === 'ArrowLeft' || code === 'KeyA') dir = [-1, 0];
    if (k === 'd' || code === 'ArrowRight' || code === 'KeyD') dir = [1, 0];
    if (k === 'w' || code === 'ArrowUp' || code === 'KeyW') dir = [0, -1];
    if (k === 's' || code === 'ArrowDown' || code === 'KeyS') dir = [0, 1];
    if (dir) keys[dir[0] + ',' + dir[1]] = false;
  }

  function nudge(dt) {
    if (st.phase !== 'layout' || st.sel < 0) return;
    var o = st.objs[st.sel];
    if (!o.placed) return;
    var vx = 0, vy = 0;
    if (keys['-1,0']) vx -= 1; if (keys['1,0']) vx += 1;
    if (keys['0,-1']) vy -= 1; if (keys['0,1']) vy += 1;
    if (!vx && !vy) return;
    var sp = 190 * dt, nx = o.x + vx * sp, ny = o.y + vy * sp;
    if (G.canPlace(st, o.id, nx, o.y, o.ang)) o.x = nx;
    if (G.canPlace(st, o.id, o.x, ny, o.ang)) o.y = ny;
  }

  // ---------- 动作 ----------
  function doRotate() {
    if (st.phase !== 'layout' || st.sel < 0) return;
    var o = st.objs[st.sel];
    if (o.placed && G.rotate(st, st.sel, 1)) A.rot();
    syncHud();
  }
  function doBack() {
    if (st.phase !== 'layout' || st.sel < 0) return;
    if (G.unplace(st, st.sel)) A.pick();
    syncHud();
  }
  function doGo() {
    if (st.phase === 'over') { doAgain(); return; }
    if (st.phase !== 'layout') return;
    A.resume(); A.startPad();
    if (G.startRun(st)) { A.go(); syncHud(); }
  }
  function doAgain() {
    // 保留布局，重走这一天
    var snap = st.objs.map(function (o) { return { x: o.x, y: o.y, ang: o.ang, p: o.placed }; });
    G.reset(st);
    st.objs.forEach(function (o, i) { o.x = snap[i].x; o.y = snap[i].y; o.ang = snap[i].ang; o.placed = snap[i].p; });
    settleOpen = false; $('settle').classList.remove('show');
    syncHud();
  }
  function doClear() {
    st.objs.forEach(function (o) { o.placed = false; o.x = 0; o.y = 0; });
    st.sel = -1; syncHud();
  }
  function toggleMute() {
    save.muted = !save.muted; store();
    A.setMuted(save.muted);
    $('btnMute').textContent = save.muted ? '♪ 关' : '♪ 开';
    $('btnMute').classList.toggle('off', save.muted);
  }

  // ---------- 结算 ----------
  function openSettle() {
    settleOpen = true;
    var s = st;
    $('sStars').textContent = '★★★☆☆☆'.slice(3 - (s.stars || 0), 6 - (s.stars || 0));
    $('sScore').textContent = s.finalScore;
    var tS = 0, nS = 0, tU = 0, nU = 0;
    s.cells.forEach(function (c) {
      if (c.type === 'shade') { tS++; if ((c.got & c.req) === c.req) nS++; }
      else { tU++; if (c.got === 0) nU++; }
    });
    $('sLine1').textContent = '得荫 ' + nS + '/' + tS + '　晒场 ' + nU + '/' + tU;
    $('sLine2').textContent = '用件 ' + (s.objs.length - s.unused) + '/' + s.objs.length + '　余荫 ' + s.extra + ' 时辰';
    $('sWord').textContent = s.win
      ? (s.stars >= 3 ? '荫浓而不夺光，这一院子的分寸正好。' : '该荫的都荫着了，该晒的也一天没落下。')
      : '日头不等人。差的那几处，明天再来。';
    $('sNext').style.display = (s.win && level < 7) ? '' : 'none';
    if (s.win && (save.best[level] || 0) < s.finalScore) save.best[level] = s.finalScore;
    if (s.win && save.unlocked < level + 2) save.unlocked = Math.min(8, level + 2);
    store();
    $('settle').classList.add('show');
    syncHud();
  }

  // ---------- 选关 ----------
  function openMenu() {
    menuOpen = true;
    var g = $('grid'); g.innerHTML = '';
    for (var i = 0; i < 8; i++) {
      (function (li) {
        var b = document.createElement('button');
        b.className = 'lv' + (li >= save.unlocked ? ' lock' : '');
        var bs = save.best[li] || 0;
        b.innerHTML = '<b>其之' + '一二三四五六七八'[li] + '</b><span>' + G.LEVELS[li].name + '</span><i>' + (bs ? bs + ' 分' : (li >= save.unlocked ? '未开' : '未过')) + '</i>';
        b.addEventListener('click', function () {
          if (li >= save.unlocked) return;
          menuOpen = false; $('menu').classList.remove('show');
          newLevel(li); A.resume(); A.startPad();
        });
        g.appendChild(b);
      })(i);
    }
    $('menu').classList.add('show');
  }

  // ---------- 主循环 ----------
  function loop(ts) {
    raf = requestAnimationFrame(loop);
    var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0.016;
    last = ts;
    if (!st) return;
    nudge(dt);
    var before = st.events.length ? st.events.length : 0;
    var prevTi = st.ti;
    G.update(st, dt);
    // 事件
    for (var i = 0; i < st.events.length; i++) {
      var ev = st.events[i];
      if (ev.type === 'tick') {
        A.bell(ev.k);
        var anyBad = false, anyGood = false;
        for (var j = 0; j < st.cells.length; j++) {
          var c = st.cells[j];
          var cov = !!(c.got & (1 << ev.k));
          if (c.type === 'sun' && cov) { anyBad = true; R.burst(c.wx, c.wy, '#C4553B', 12, 60); }
          if (c.type === 'shade' && cov && (c.req & (1 << ev.k))) { anyGood = true; R.burst(c.wx, c.wy, '#6E8B5B', 14, 66); }
        }
        if (anyBad) A.bad(); else if (anyGood) A.good(ev.k);
      } else if (ev.type === 'over') {
        if (ev.win) A.winMelody(st.cells.filter(function (c) { return c.type === 'shade'; }).length);
        else A.lose();
        setTimeout(openSettle, 620);
      }
    }
    st.events.length = 0;
    if (st.ti !== prevTi) syncHud();

    // 布局阶段的实时覆盖预览
    var liveGot = null;
    if (st.phase === 'layout') {
      liveGot = {};
      var pk = st.pi;
      for (var m = 0; m < st.cells.length; m++) {
        var cc = st.cells[m];
        liveGot[cc.i] = G.coveredAt(st, st.moments[pk], cc.wx, cc.wy) ? (1 << pk) : 0;
      }
    }
    R.draw(st, {
      previewK: st.phase === 'layout' ? st.pi : Math.max(0, st.ti - 1),
      ghost: ghost,
      liveGot: liveGot,
      trayHint: st.phase === 'layout'
        ? (st.sel >= 0 ? '拖动可挪 · R 转向 · X 收起 · 点顶上的时辰可看那一刻的影' : '把物件拖进院子 · 拖回筐里就是收起')
        : (st.phase === 'run' ? '日头自己走着，看看影子扫过哪儿' : '这一天走完了')
    }, dt);
  }

  // ---------- 启动 ----------
  function boot() {
    cv = $('cv');
    R.init(cv, G);
    load();
    A.init(); A.setMuted(save.muted);
    $('btnMute').textContent = save.muted ? '♪ 关' : '♪ 开';
    $('btnMute').classList.toggle('off', save.muted);
    el.wrap = $('wrap');

    cv.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', function () { setTimeout(fit, 250); });

    $('btnGo').addEventListener('click', doGo);
    $('btnRot').addEventListener('click', doRotate);
    $('btnBack').addEventListener('click', doBack);
    $('btnClear').addEventListener('click', doClear);
    $('btnMenu').addEventListener('click', openMenu);
    $('btnMute').addEventListener('click', toggleMute);
    $('sAgain').addEventListener('click', function () { doAgain(); });
    $('sNext').addEventListener('click', function () {
      if (level < 7) { newLevel(level + 1); settleOpen = false; $('settle').classList.remove('show'); }
    });
    $('sMenu').addEventListener('click', function () { settleOpen = false; $('settle').classList.remove('show'); openMenu(); });
    $('mClose').addEventListener('click', function () { menuOpen = false; $('menu').classList.remove('show'); });

    fit();
    newLevel(0);
    openMenu();
    raf = requestAnimationFrame(loop);
    window.SC305UI = { dbg: function () { return { drag: !!drag, ghost: ghost ? { x: ghost.x, y: ghost.y, ok: ghost.ok, kind: ghost.kind } : null, sel: st ? st.sel : -1, phase: st ? st.phase : '', menu: menuOpen, settle: settleOpen }; },
      state: function () { return st; }, newLevel: newLevel, doGo: doGo, doAgain: doAgain, doClear: doClear, level: function () { return level; }, fit: fit, openMenu: openMenu, closeMenu: function () { menuOpen = false; $('menu').classList.remove('show'); }, save: save };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
