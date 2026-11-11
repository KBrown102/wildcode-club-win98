/**
 * ui.js —— DOM 层：HUD、操作条、开始/通关/选关浮层、轻提示。
 * 不含游戏逻辑，只负责呈现与把按钮事件转交 main.js 注入的回调。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.UI = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function stars(n) {
    n = Math.max(0, Math.min(3, n | 0));
    return '★★★'.slice(0, n) + '☆☆☆'.slice(0, 3 - n);
  }

  function UI(opts) {
    this.game = opts.game;
    this.audio = opts.audio;
    this.acts = opts.actions || {};
    this.el = {
      lvNum: $('lvNum'), mirrorLeft: $('mirrorLeft'), bestStars: $('bestStars'),
      btnReset: $('btnReset'), btnRemove: $('btnRemove'), btnHint: $('btnHint'),
      btnSelect: $('btnSelect'), btnMute: $('btnMute'),
      toast: $('toast'),
      startOverlay: $('startOverlay'), btnStart: $('btnStart'),
      winOverlay: $('winOverlay'), winStars: $('winStars'), winSub: $('winSub'),
      btnReplay: $('btnReplay'), btnToSelect: $('btnToSelect'), btnNext: $('btnNext'),
      selectOverlay: $('selectOverlay'), selGrid: $('selGrid'), btnSelClose: $('btnSelClose')
    };
    this._bind();
  }

  UI.prototype._bind = function () {
    var self = this, a = this.acts;
    this.el.btnStart.onclick = function () { if (a.onStart) a.onStart(); };
    this.el.btnReset.onclick = function () { if (a.onReset) a.onReset(); };
    this.el.btnRemove.onclick = function () { if (a.onRemoveToggle) a.onRemoveToggle(); };
    this.el.btnHint.onclick = function () { if (a.onHint) a.onHint(); };
    this.el.btnSelect.onclick = function () { if (a.onSelect) a.onSelect(); };
    this.el.btnMute.onclick = function () { if (a.onMute) a.onMute(); };
    this.el.btnReplay.onclick = function () { if (a.onReplay) a.onReplay(); };
    this.el.btnToSelect.onclick = function () { if (a.onToSelect) a.onToSelect(); };
    this.el.btnNext.onclick = function () { if (a.onNext) a.onNext(); };
    this.el.btnSelClose.onclick = function () { self.hideSelect(); };
  };

  UI.prototype.updateHUD = function () {
    var g = this.game;
    this.el.lvNum.textContent = '第 ' + (g.index + 1) + ' 关';
    this.el.mirrorLeft.textContent = (g.level.budget - g.usedCount());
    var best = g.best[g.index] || 0;
    this.el.bestStars.textContent = stars(best);
  };

  UI.prototype.setRemoveActive = function (on) {
    this.el.btnRemove.classList.toggle('active', !!on);
  };
  UI.prototype.setMuteIcon = function (muted) {
    this.el.btnMute.textContent = muted ? '🔇' : '♪';
  };

  var toastTimer = null;
  UI.prototype.toast = function (msg) {
    var t = this.el.toast;
    t.textContent = msg; t.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 1400);
  };

  UI.prototype.hideStart = function () { this.el.startOverlay.classList.add('hidden'); };
  UI.prototype.hideWin = function () { this.el.winOverlay.classList.add('hidden'); };

  UI.prototype.showWin = function (starN, sub) {
    this.el.winStars.textContent = stars(starN);
    this.el.winSub.textContent = sub || '';
    this.el.winOverlay.classList.remove('hidden');
  };

  UI.prototype.buildSelect = function () {
    var self = this, g = this.game;
    this.el.selGrid.innerHTML = '';
    for (var i = 0; i < g.levels.length; i++) {
      (function (idx) {
        var cell = document.createElement('button');
        cell.className = 'sel-cell';
        var best = g.best[idx] || 0;
        cell.innerHTML = '<span class="n">' + (idx + 1) + '</span><span class="s">' + (best ? stars(best) : '') + '</span>';
        cell.onclick = function () { if (self.acts.onSelectLevel) self.acts.onSelectLevel(idx); };
        self.el.selGrid.appendChild(cell);
      })(i);
    }
  };
  UI.prototype.showSelect = function () { this.buildSelect(); this.el.selectOverlay.classList.remove('hidden'); };
  UI.prototype.hideSelect = function () { this.el.selectOverlay.classList.add('hidden'); };

  return UI;
});
