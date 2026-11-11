/**
 * main.js —— 引导：装配 逻辑/渲染/音频/UI，处理指针输入与 RAF 主循环，
 * 并暴露 window.__LIGHTPATH 探针（供冒烟/截图脚本驱动）。
 */
(function () {
  'use strict';
  var GM = window.GameModule, Render = window.Render, AudioMod = window.AudioMod, UI = window.UI;
  var BEST_KEY = 'lightpath_best';

  var canvas = document.getElementById('game');
  var audio = new AudioMod();

  // 读历史最佳
  try { var b = JSON.parse(localStorage.getItem(BEST_KEY) || '{}'); } catch (e) { var b = {}; }
  var game = new GM.Game(GM.LEVELS);
  game.best = b || {};

  var winShown = false;

  function saveBest() { try { localStorage.setItem(BEST_KEY, JSON.stringify(game.best)); } catch (e) {} }

  function relayout() { Render.resize(canvas, game.level); Render.relayout(game.level); }

  var ui = new UI({
    game: game, audio: audio,
    actions: {
      onStart: function () { audio.resume(); ui.hideStart(); },
      onReset: function () { game.reset(); winShown = false; ui.hideWin(); ui.updateHUD(); },
      onRemoveToggle: function () { var on = game.toggleRemove(); ui.setRemoveActive(on); },
      onHint: function () {
        audio.resume();
        if (game.won) return;
        if (game.hintUsed >= 3) { ui.toast('提示已用完'); audio.deny(); return; }
        var p = game.hint();
        if (p) { audio.hint(); ui.toast('已为你转正一面'); }
        else { ui.toast('暂时没有可提示的步'); }
        ui.updateHUD();
      },
      onSelect: function () { ui.showSelect(); },
      onMute: function () { var m = audio.toggleMute(); ui.setMuteIcon(m); },
      onReplay: function () { game.reset(); winShown = false; ui.hideWin(); ui.updateHUD(); },
      onToSelect: function () { winShown = false; ui.hideWin(); ui.showSelect(); },
      onNext: function () {
        winShown = false; ui.hideWin();
        if (game.index < game.levels.length - 1) { game.load(game.index + 1); afterLoad(); }
        else { ui.toast('已是最后一关，去选关回味'); ui.showSelect(); }
      },
      onSelectLevel: function (i) {
        game.load(i); winShown = false; ui.hideWin(); ui.hideSelect(); afterLoad();
      }
    }
  });

  function afterLoad() {
    relayout();
    game.removeMode = false; ui.setRemoveActive(false);
    ui.updateHUD();
  }

  // —— 指针输入 ——
  function pointerCell(e) {
    var rect = canvas.getBoundingClientRect();
    var px = (e.clientX - rect.left), py = (e.clientY - rect.top);
    return Render.cellAt(px, py);
  }
  function inBounds(c, r) {
    var L = game.level;
    return c >= 0 && c < L.cols && r >= 0 && r < L.rows;
  }
  function handleTap(e) {
    audio.resume();
    var cell = pointerCell(e);
    if (!cell) return;
    var c = cell.c, r = cell.r;
    if (!inBounds(c, r)) return;
    var k = GM.key(c, r);
    if (game.removeMode) {
      if (game.movable[k]) { game.remove(c, r); audio.remove(); }
      else { audio.deny(); }
      ui.updateHUD(); return;
    }
    if (game.movable[k]) { game.rotate(c, r); audio.rotate(); }
    else if (game.isOccupied(c, r) || game.isFixed(c, r)) { audio.deny(); ui.toast('这里放不了镜面'); }
    else {
      var ok = game.place(c, r);
      if (ok) audio.place();
      else { audio.deny(); if (Object.keys(game.movable).length >= game.level.budget) ui.toast('镜面已用完'); }
    }
    ui.updateHUD();
  }
  canvas.addEventListener('pointerdown', function (e) { e.preventDefault(); handleTap(e); });
  canvas.addEventListener('contextmenu', function (e) {
    e.preventDefault();
    var cell = pointerCell(e);
    if (cell && game.movable[GM.key(cell.c, cell.r)]) { game.remove(cell.c, cell.r); audio.remove(); ui.updateHUD(); }
  });

  // —— 主循环 ——
  var last = performance.now();
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    var t = now / 1000;
    if (game.won && !winShown) {
      winShown = true;
      audio.win();
      saveBest();
      ui.updateHUD();
      var s = game.stars();
      var subs = ['光找到了路。', '干净利落的一束。', '多转了几次，但灯还是亮了。'];
      ui.showWin(s, subs[s - 1] || '');
    }
    Render.draw(canvas.getContext('2d'), game, t, dt);
    requestAnimationFrame(frame);
  }

  // —— 初始化 ——
  function init() {
    relayout();
    ui.updateHUD();
    ui.setMuteIcon(audio.isMuted());
    window.addEventListener('resize', function () { relayout(); });
    requestAnimationFrame(frame);
  }
  init();

  // —— 探针（供自动化冒烟/截图）——
  window.__LIGHTPATH = {
    game: game,
    state: function () {
      return {
        index: game.index, level: game.index + 1, lit: game.beam.lit, won: game.won,
        used: game.usedCount(), par: game.par, stars: game.won ? game.stars() : 0,
        mirrorsLeft: game.level.budget - game.usedCount(), removeMode: game.removeMode,
        cols: game.level.cols, rows: game.level.rows
      };
    },
    place: function (c, r) { return game.place(c, r); },
    rotate: function (c, r) { return game.rotate(c, r); },
    remove: function (c, r) { return game.remove(c, r); },
    toggleRemove: function () { return game.toggleRemove(); },
    reset: function () { game.reset(); winShown = false; ui.hideWin(); ui.updateHUD(); },
    loadLevel: function (i) { game.load(i); winShown = false; ui.hideWin(); ui.hideSelect(); afterLoad(); },
    hint: function () { return game.hint(); },
    autosolve: function () { var w = game.autosolve(); ui.updateHUD(); return w; },
    removeMode: function (on) { game.removeMode = on; ui.setRemoveActive(on); }
  };
})();
